import os
import sys
import json
import re
import requests
# Redirect sys.stderr to a file to prevent subprocess standard error pipe deadlocks on Windows
class FileLogger:
    def __init__(self, filepath="server.log"):
        self.filepath = filepath
    def write(self, message):
        try:
            with open(self.filepath, "a", encoding="utf-8") as f:
                f.write(message)
        except Exception:
            pass
    def flush(self):
        pass

sys.stderr = FileLogger()
import uuid
from urllib.parse import urlparse
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv
from google import genai
from google.genai import types
from concurrent.futures import ThreadPoolExecutor
from app.services.win_rate_calculator import WinRateCalculator

load_dotenv()

# Initialize the MCP Server using FastMCP
mcp = FastMCP("Salesforce RCA Deal Management MCP Server")

# ---------------------------------------------------------------------------
# FIELD VALUE INDEX — built lazily on first check_field_values call
# Key: lowercase token (e.g. "west", "256gb")
# Value: {"field": "Region__c", "value": "West"}
# ---------------------------------------------------------------------------
FIELD_VALUE_INDEX: dict = {}
_INDEX_BUILT = False
SF_FIELD_CACHE: dict = {}
TWIN_HUNTER_CACHE: dict = {}
THERMOFISHER_CATEGORY = "ThermoFisher"




# Global GenAI Client Initialization
def _get_genai_client():
    raw_val = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "false")
    use_vertex = raw_val.replace('"', '').replace("'", "").strip().lower() == "true"
    if use_vertex:
        project_id = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").replace('"', '').replace("'", "").strip()
        location_id = (os.getenv("GOOGLE_CLOUD_LOCATION") or "us-central1").replace('"', '').replace("'", "").strip()
        return genai.Client(
            vertexai=True,
            project=project_id,
            location=location_id
        )
    return genai.Client()

_genai_client = _get_genai_client()

_AUTH_CACHE = None
def get_salesforce_auth():
    """Helper function to load auth state written by auth.py with simple caching."""
    global _AUTH_CACHE
    if _AUTH_CACHE:
        return _AUTH_CACHE

    import json
    token_file = "auth.json"
    if not os.path.exists(token_file):
        raise RuntimeError("Auth state not found. Please run auth.py first to authenticate.")
    
    with open(token_file, "r") as f:
        auth_data = json.load(f)
        
    headers = {
        "Authorization": f"Bearer {auth_data['access_token']}",
        "Content-Type": "application/json"
    }
    _AUTH_CACHE = (headers, auth_data['instance_url'])
    return _AUTH_CACHE


def _json_dumps(payload: dict) -> str:
    return json.dumps(payload, indent=2, default=str)


def _twin_log(stage: str, message: str, payload: dict | None = None) -> None:
    """Concise Twin Hunter diagnostics. stderr keeps MCP stdout parseable."""
    line = f"[Twin Hunter] {stage}: {message}"
    if payload:
        line = f"{line} {json.dumps(payload, default=str, ensure_ascii=True)}"
    print(line, file=sys.stderr, flush=True)


def _normalise_name(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", str(value or "").lower()).strip()


def _sf_escape(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace("'", "\\'")


def _hostname(url: str) -> str:
    try:
        parsed = urlparse(url if str(url).startswith(("http://", "https://")) else f"https://{url}")
        return parsed.netloc.lower().replace("www.", "")
    except Exception:
        return ""


def _same_registered_domain(left: str, right: str) -> bool:
    left_host = _hostname(left)
    right_host = _hostname(right)
    if not left_host or not right_host:
        return False
    if left_host == right_host:
        return True
    return left_host.endswith(f".{right_host}") or right_host.endswith(f".{left_host}")


def _salesforce_query(query: str, api_version: str = "v66.0", max_records: int = 2000) -> list[dict]:
    headers, instance_url = get_salesforce_auth()
    endpoint = f"{instance_url}/services/data/{api_version}/query"
    records = []
    first_page = True

    while endpoint and len(records) < max_records:
        if first_page:
            resp = requests.get(endpoint, headers=headers, params={"q": query}, timeout=45)
            first_page = False
        else:
            resp = requests.get(endpoint, headers=headers, timeout=45)
        if resp.status_code != 200:
            raise RuntimeError(resp.text)
        body = resp.json()
        records.extend(body.get("records", []))
        if body.get("done", True):
            break
        next_url = body.get("nextRecordsUrl")
        endpoint = f"{instance_url}{next_url}" if next_url else ""
    return records[:max_records]


def _describe_fields(object_api_name: str) -> dict:
    if object_api_name in SF_FIELD_CACHE:
        return SF_FIELD_CACHE[object_api_name]
    try:
        headers, instance_url = get_salesforce_auth()
        resp = requests.get(
            f"{instance_url}/services/data/v66.0/sobjects/{object_api_name}/describe",
            headers=headers,
            timeout=30,
        )
        if resp.status_code != 200:
            SF_FIELD_CACHE[object_api_name] = {}
            return {}
        fields = {
            field.get("name"): field
            for field in resp.json().get("fields", [])
            if field.get("name")
        }
        SF_FIELD_CACHE[object_api_name] = fields
        return fields
    except Exception:
        SF_FIELD_CACHE[object_api_name] = {}
        return {}


def _available_fields(object_api_name: str, candidates: list[str]) -> list[str]:
    fields = _describe_fields(object_api_name)
    if not fields:
        return candidates
    return [field for field in candidates if field in fields]


def _find_category_field(object_api_name: str) -> tuple[str, dict]:
    fields = _describe_fields(object_api_name)
    preferred = [
        "Category__c",
        "Company_Category__c",
        "Customer_Category__c",
        "Client_Category__c",
        "Business_Category__c",
        "Org_Category__c",
    ]
    for name in preferred:
        if name in fields:
            return name, fields[name]
    for name, meta in fields.items():
        if "category" in name.lower():
            return name, meta
    return "", {}


def _category_filter(field_name: str, field_meta: dict, category_value: str = THERMOFISHER_CATEGORY) -> str:
    if not field_name:
        return ""
    escaped = _sf_escape(category_value)
    if field_meta.get("type") == "multipicklist":
        return f"{field_name} INCLUDES ('{escaped}')"
    return f"{field_name} = '{escaped}'"


def _amount(value) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _money(value) -> str:
    amount = _amount(value)
    if amount <= 0:
        return "-"
    return f"${amount:,.0f}"


def _revenue_band(value) -> str:
    amount = _amount(value)
    if amount >= 100_000_000_000:
        return "enterprise revenue"
    if amount >= 10_000_000_000:
        return "large market revenue"
    if amount >= 1_000_000_000:
        return "mid market revenue"
    return ""


def _employee_band(value) -> str:
    try:
        employees = int(value or 0)
    except (TypeError, ValueError):
        employees = 0
    if employees >= 10000:
        return "enterprise workforce"
    if employees >= 1000:
        return "large workforce"
    if employees >= 250:
        return "mid sized workforce"
    return ""


def _business_terms(text: str) -> set[str]:
    stopwords = {
        "about", "above", "across", "advanced", "after", "against", "also",
        "and", "are", "based", "been", "being", "best", "between", "both",
        "business", "can", "company", "companies", "customer", "customers",
        "delivering", "for", "from", "global", "has", "have", "into", "its",
        "leading", "limited", "multiple", "new", "not", "offering", "offers",
        "one", "our", "private", "provides", "providing", "public", "research",
        "services", "solutions", "that", "the", "their", "this", "through",
        "with", "world", "worldwide",
    }
    terms = set()
    for token in re.findall(r"[a-zA-Z][a-zA-Z0-9&-]{2,}", str(text or "").lower()):
        cleaned = token.strip("-&")
        if len(cleaned) >= 3 and cleaned not in stopwords:
            terms.add(cleaned)
    return terms


def _top_keywords(records: list[dict], fields: list[str], limit: int = 12) -> list[str]:
    counts: dict[str, int] = {}
    for record in records:
        text = " ".join(str(record.get(field) or "") for field in fields)
        for term in _business_terms(text):
            counts[term] = counts.get(term, 0) + 1
    return [
        term for term, _count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
    ]


def _ranked_values(records: list[dict], field: str, limit: int = 6) -> list[dict]:
    counts: dict[str, int] = {}
    for record in records:
        value = str(record.get(field) or "").strip()
        if value:
            counts[value] = counts.get(value, 0) + 1
    return [
        {"value": value, "count": count}
        for value, count in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
    ]


def _compact_terms(values: list[str], limit: int = 12) -> list[str]:
    seen = set()
    terms = []
    for value in values:
        cleaned = re.sub(r"\s+", " ", str(value or "")).strip(" ,.-")
        key = _normalise_name(cleaned)
        if cleaned and key and key not in seen:
            seen.add(key)
            terms.append(cleaned)
        if len(terms) >= limit:
            break
    return terms


def _build_account_terms(account: dict) -> list[str]:
    description_keywords = _top_keywords(
        [{"Description": account.get("description", ""), "Industry": account.get("industry", "")}],
        ["Description", "Industry"],
        limit=10,
    )
    return _compact_terms([
        account.get("industry"),
        account.get("type"),
        account.get("billing_city"),
        _revenue_band(account.get("annual_revenue")),
        _employee_band(account.get("employees")),
        *description_keywords,
    ], limit=12)


def _best_account_match(accounts: list[dict], target_account_name: str) -> dict | None:
    if not target_account_name:
        return None
    needle = _normalise_name(target_account_name)
    if not needle:
        return None
    exact = [acct for acct in accounts if _normalise_name(acct.get("name")) == needle]
    if exact:
        return exact[0]
    contains = [
        acct for acct in accounts
        if needle in _normalise_name(acct.get("name")) or _normalise_name(acct.get("name")) in needle
    ]
    if contains:
        return contains[0]
    try:
        from difflib import SequenceMatcher
        scored = [
            (SequenceMatcher(None, needle, _normalise_name(acct.get("name"))).ratio(), acct)
            for acct in accounts
        ]
        scored.sort(key=lambda item: item[0], reverse=True)
        if scored and scored[0][0] >= 0.62:
            return scored[0][1]
    except Exception:
        pass
    return None




def _load_thermofisher_accounts() -> tuple[list[dict], list[str], str]:
    fields = _available_fields(
        "Account",
        ["Id", "Name", "Website", "Industry", "Description", "Type", "AnnualRevenue", "NumberOfEmployees", "BillingCity"],
    )
    if "Id" not in fields:
        fields.insert(0, "Id")
    if "Name" not in fields:
        fields.insert(1, "Name")

    category_field, category_meta = _find_category_field("Account")
    where_clause = _category_filter(category_field, category_meta)
    query = f"SELECT {', '.join(fields)} FROM Account"
    limitations = []
    if where_clause:
        query += f" WHERE {where_clause}"
    else:
        pass
    query += " ORDER BY LastModifiedDate DESC LIMIT 250"

    records = _salesforce_query(query)
    accounts = []
    valid_keywords = ["health", "research", "biotech", "life science", "diagnostic", "pharma", "lab", "medicine", "medical"]
    
    for rec in records:
        industry = (rec.get("Industry") or "").lower()
        # If an industry is provided, strictly ensure it matches the ThermoFisher domain
        if industry and not any(kw in industry for kw in valid_keywords):
            continue
            
        accounts.append({
            "id": rec.get("Id"),
            "name": rec.get("Name") or "",
            "website": rec.get("Website") or "",
            "industry": rec.get("Industry") or "",
            "description": rec.get("Description") or "",
            "type": rec.get("Type") or "",
            "annual_revenue": rec.get("AnnualRevenue"),
            "employees": rec.get("NumberOfEmployees"),
            "billing_city": rec.get("BillingCity") or "",
            "category": THERMOFISHER_CATEGORY if where_clause else "",
        })
    return accounts, limitations, category_field


def _load_opportunities(account_ids: list[str]) -> list[dict]:
    if not account_ids:
        return []
    fields = _available_fields("Opportunity", ["Id", "Name", "StageName", "Amount", "CloseDate", "AccountId"])
    for required in ["Id", "Name", "AccountId"]:
        if required not in fields:
            fields.append(required)
    all_opps = []
    for idx in range(0, len(account_ids), 80):
        chunk = account_ids[idx:idx + 80]
        ids = ", ".join(f"'{_sf_escape(account_id)}'" for account_id in chunk if account_id)
        if not ids:
            continue
        query = (
            f"SELECT {', '.join(fields)} FROM Opportunity "
            f"WHERE AccountId IN ({ids}) "
            "ORDER BY LastModifiedDate DESC LIMIT 500"
        )
        all_opps.extend(_salesforce_query(query, max_records=500))
    return [
        {
            "id": rec.get("Id"),
            "name": rec.get("Name") or "",
            "stage": rec.get("StageName") or "",
            "amount": rec.get("Amount"),
            "amount_display": _money(rec.get("Amount")),
            "close_date": rec.get("CloseDate") or "",
            "account_id": rec.get("AccountId") or "",
        }
        for rec in all_opps
    ]


def _attach_account_opportunities(accounts: list[dict], opportunities: list[dict]) -> list[dict]:
    by_account: dict[str, list[dict]] = {}
    for opp in opportunities:
        by_account.setdefault(opp.get("account_id"), []).append(opp)
    enriched = []
    for account in accounts:
        account_opps = by_account.get(account.get("id"), [])
        won = [opp for opp in account_opps if "closed won" in (opp.get("stage") or "").lower()]
        open_opps = [opp for opp in account_opps if "closed" not in (opp.get("stage") or "").lower()]
        total_amount = sum(_amount(opp.get("amount")) for opp in account_opps)
        enriched.append({
            **account,
            "opportunity_count": len(account_opps),
            "won_opportunity_count": len(won),
            "open_opportunity_count": len(open_opps),
            "opportunity_amount_total": total_amount,
            "opportunity_amount_display": _money(total_amount),
            "sample_opportunities": account_opps[:4],
            "terms": _build_account_terms(account),
        })
    return enriched


def _account_rank_score(account: dict) -> float:
    return (
        _amount(account.get("opportunity_amount_total")) / 1_000_000
        + int(account.get("opportunity_count") or 0) * 12
        + int(account.get("won_opportunity_count") or 0) * 18
        + (8 if account.get("industry") else 0)
        + (6 if account.get("description") else 0)
    )


def _build_icp_profile(accounts: list[dict], opportunities: list[dict]) -> dict:
    ranked_accounts = sorted(accounts, key=_account_rank_score, reverse=True)
    opportunity_keywords = _top_keywords(
        [{"Name": opp.get("name", ""), "StageName": opp.get("stage", "")} for opp in opportunities],
        ["Name", "StageName"],
        limit=10,
    )
    return {
        "method": "Top ThermoFisher accounts ranked by populated Account fields and Opportunity activity.",
        "top_accounts": ranked_accounts[:5],
        "top_industries": _ranked_values(accounts, "industry"),
        "top_account_types": _ranked_values(accounts, "type"),
        "top_cities": _ranked_values(accounts, "billing_city"),
        "description_keywords": _top_keywords(
            [{"Description": acct.get("description", ""), "Industry": acct.get("industry", "")} for acct in accounts],
            ["Description", "Industry"],
            limit=12,
        ),
        "opportunity_keywords": opportunity_keywords,
        "revenue_bands": _ranked_values(
            [{"band": _revenue_band(acct.get("annual_revenue"))} for acct in accounts],
            "band",
        ),
        "employee_bands": _ranked_values(
            [{"band": _employee_band(acct.get("employees"))} for acct in accounts],
            "band",
        ),
        "confidence_basis": [
            f"{len(accounts)} ThermoFisher Account record(s) were available.",
            f"{len(opportunities)} Opportunity record(s) were compared.",
            "Recommendations use only populated Salesforce fields plus company-specific Tavily evidence.",
        ],
    }


def get_thermofisher_account_context(target_account_name: str = "") -> str:
    """
    Fetches ThermoFisher-scoped Salesforce Account and Opportunity context for Twin Hunter.

    Call this first for any lookalike, customer twin, ICP, ideal customer profile,
    or best-fit account request. Pass target_account_name only when the user names
    one Salesforce account to compare against.
    """
    analysis_id = f"twin_{uuid.uuid4().hex[:10]}"


    try:
        accounts, limitations, category_field = _load_thermofisher_accounts()
        opportunities = _load_opportunities([acct.get("id") for acct in accounts if acct.get("id")])
        accounts = _attach_account_opportunities(accounts, opportunities)
        target = _best_account_match(accounts, target_account_name)
        if target_account_name and not target:
            result = {
                "status": "not_found",
                "analysis_id": analysis_id,
                "requested_category": THERMOFISHER_CATEGORY,
                "message": f"Could not find '{target_account_name}' in the ThermoFisher account set.",
                "account_count": len(accounts),
                "opportunity_count": len(opportunities),
                "accounts": accounts[:30],
                "limitations": limitations,
            }
            TWIN_HUNTER_CACHE[analysis_id] = {"context": result}
            return _json_dumps(result)

        icp_profile = _build_icp_profile(accounts, opportunities)
        anchor_accounts = [target] if target else icp_profile.get("top_accounts", [])[:5]
        result = {
            "status": "success",
            "analysis_id": analysis_id,
            "requested_category": THERMOFISHER_CATEGORY,
            "mode": "single_account" if target else "icp_profile",
            "category_field": category_field,
            "target_account": target,
            "anchor_accounts": anchor_accounts,
            "accounts": accounts,
            "account_count": len(accounts),
            "opportunities": opportunities[:80],
            "opportunity_count": len(opportunities),
            "icp_profile": icp_profile,
            "signals_available": [
                "Account.Name",
                "Account.Website",
                "Account.Industry",
                "Account.Description",
                "Account.Type",
                "Account.AnnualRevenue",
                "Account.NumberOfEmployees",
                "Account.BillingCity",
                "Opportunity.Name",
                "Opportunity.StageName",
                "Opportunity.Amount",
            ],
            "limitations": limitations,
        }
        TWIN_HUNTER_CACHE[analysis_id] = {"context": result}
        _twin_log("Salesforce Context", "retrieved ThermoFisher context", {
            "analysis_id": analysis_id,
            "mode": result["mode"],
            "accounts": len(accounts),
            "opportunities": len(opportunities),
            "target": (target or {}).get("name"),
            "anchors": [acct.get("name") for acct in anchor_accounts],
        })
        return _json_dumps(result)
    except Exception as exc:
        result = {
            "status": "error",
            "analysis_id": analysis_id,
            "message": f"Could not load ThermoFisher Salesforce context: {exc}",
            "requested_category": THERMOFISHER_CATEGORY,
            "cards": [],
        }
        TWIN_HUNTER_CACHE[analysis_id] = {"context": result}
        _twin_log("Salesforce Context", "failed", {"analysis_id": analysis_id, "error": str(exc)[:240]})
        return _json_dumps(result)

def research_twin_candidates(analysis_id: str, max_results: int = 12) -> str:
    """
    Uses Tavily to find company-specific public evidence for Twin Hunter candidates.
    """
    analysis_id_str = str(analysis_id or "").strip()
    cache_entry = TWIN_HUNTER_CACHE.get(analysis_id_str)
    if not cache_entry or "context" not in cache_entry:
        if TWIN_HUNTER_CACHE:
            latest_id = list(TWIN_HUNTER_CACHE.keys())[-1]
            cache_entry = TWIN_HUNTER_CACHE[latest_id]
            _twin_log("research_twin_candidates", f"analysis_id '{analysis_id_str}' not found. Falling back to latest entry: '{latest_id}'")
        else:
            return _json_dumps({"status": "error", "analysis_id": analysis_id, "message": "Unknown analysis_id. Call get_thermofisher_account_context first.", "results": []})

    context = cache_entry["context"]


    tavily_key = os.getenv("TAVILY_API_KEY", "").strip()
    
    if not tavily_key:
        research = {
            "status": "needs_api_key",
            "analysis_id": analysis_id,
            "message": "TAVILY_API_KEY is empty. Add it to .env to enable external lookalike research.",
            "results": [],
        }
        cache_entry["research"] = research
        return _json_dumps(research)

    target = context.get("target_account") or {}
    icp = context.get("icp_profile") or {}
    
    if target:
        terms = [target.get("industry"), target.get("type")]
    else:
        terms = [item.get("value") for item in icp.get("top_industries", [])[:2]]
        
    terms = [t for t in terms if t]

    # Calculate target revenue to inject tier keywords into search query
    target_revenue = 0.0
    if target:
        try:
            target_revenue = float(target.get("annual_revenue") or 0.0)
        except (ValueError, TypeError):
            pass
    elif icp.get("top_accounts"):
        try:
            revenues = [float(acc.get("annual_revenue") or 0.0) for acc in icp.get("top_accounts")]
            if revenues:
                target_revenue = max(revenues)
        except (ValueError, TypeError):
            pass

    rev_keyword = "global B2B"
    if target_revenue >= 1_000_000_000:
        rev_keyword = "billion dollar global B2B enterprise"
    elif target_revenue >= 100_000_000:
        rev_keyword = "large-scale global B2B"
    elif target_revenue >= 10_000_000:
        rev_keyword = "mid-market global B2B"

    query = f"{' '.join(terms)} {rev_keyword} companies website" if terms else f"{rev_keyword} companies website"

    headers = {"Authorization": f"Bearer {tavily_key}", "Content-Type": "application/json"}
    payload = {
        "query": query,
        "search_depth": "advanced",
        "max_results": max(8, min(int(max_results or 12), 20)),
        "include_answer": True,
        "include_raw_content": True
    }
    
    try:
        import requests
        resp = requests.post("https://api.tavily.com/search", headers=headers, json=payload, timeout=45)
        if resp.status_code != 200:
            research = {
                "status": "error",
                "analysis_id": analysis_id,
                "message": f"Tavily API error ({resp.status_code}): {resp.text}",
                "results": []
            }
            cache_entry["research"] = research
            return _json_dumps(research)
            
        body = resp.json()
        results = []
        for item in body.get("results", []):
            results.append({
                "title": item.get("title") or "",
                "url": item.get("url") or "",
                "content": item.get("content") or "",
                "raw_content": (item.get("raw_content") or "")[:5000],
                "score": item.get("score")
            })
            
        research = {
            "status": "success",
            "analysis_id": analysis_id,
            "query": query,
            "answer": str(body.get("answer") or "")[:800],
            "results": results,
            "message": f"Retrieved {len(results)} raw results from Tavily.",
        }
        cache_entry["research"] = research
        return _json_dumps(research)
        
    except Exception as exc:
        research = {
            "status": "error",
            "analysis_id": analysis_id,
            "message": f"Tavily search failed: {exc}",
            "results": []
        }
        cache_entry["research"] = research
        return _json_dumps(research)


def _generate_natural_upsell(product_name: str, anchor_name: str, idx: int) -> str:
    """Generates an easy-to-understand upsell suggestion for sales reps using peer client matching."""
    templates = [
        f"Suggest {product_name} as it is commonly added by peer accounts like {anchor_name} to complement their primary setup.",
        f"Pitch {product_name} – this represents a high-potential cross-sell opportunity, matching the configuration of {anchor_name}.",
        f"Introduce {product_name} to optimize their performance, matching the upgrade path of peer profile {anchor_name}.",
        f"Recommend {product_name} to align their configuration with the industry-standard setup deployed at {anchor_name}."
    ]
    return templates[idx % len(templates)]


def _fetch_account_deal_info(account_id: str) -> tuple[dict, list[str]]:
    """Queries Salesforce for quotes and line items associated with a given Account ID to build history summary."""
    query = (
        f"SELECT Id, Name, Status, GrandTotal, Discount, QuoteNumber, CreatedDate, Opportunity.Name, "
        f"(SELECT Id, Product2.Name, Quantity, UnitPrice, TotalPrice, Discount FROM QuoteLineItems) "
        f"FROM Quote WHERE AccountId = '{account_id}' ORDER BY CreatedDate DESC LIMIT 100"
    )
    try:
        quotes = _salesforce_query(query)
    except Exception as e:
        print(f"[DEBUG] Error querying quotes for lookup: {e}")
        return {"total_quotes": 0, "status_counts": {}, "avg_discount": "0%", "raw_deals": []}, []
    
    deal_history = []
    product_counts = {}
    status_counts = {}
    total_discount = 0.0
    discount_count = 0

    for q in quotes:
        q_num = q.get("QuoteNumber") or q.get("Name") or "Quote"
        opp_name = "Direct Opportunity"
        if q.get("Opportunity") and q.get("Opportunity", {}).get("Name"):
            opp_name = q.get("Opportunity", {}).get("Name")
        status = q.get("Status") or "Draft"
        status_counts[status] = status_counts.get(status, 0) + 1

        total = q.get("GrandTotal") or 0
        total_str = f"${total:,.0f}" if total else "—"
        deal_history.append(f"{q_num} ({opp_name}) — {status} [{total_str}]")
        
        disc = q.get("Discount")
        if disc is not None:
            total_discount += float(disc)
            discount_count += 1

        q_lis = q.get("QuoteLineItems", {}).get("records", []) if q.get("QuoteLineItems") else []
        for li in q_lis:
            if li.get("Product2") and li.get("Product2", {}).get("Name"):
                p_name = li.get("Product2", {}).get("Name")
                product_counts[p_name] = product_counts.get(p_name, 0) + 1
                
    mostly_purchased = [p for p, c in sorted(product_counts.items(), key=lambda x: x[1], reverse=True)]
    
    avg_disc = (total_discount / discount_count) if discount_count > 0 else 0.0
    if 0.0 < avg_disc < 1.0:
        avg_disc *= 100
    avg_discount_str = f"{avg_disc:.1f}%" if avg_disc > 0 else "0%"

    deal_summary = {
        "total_quotes": len(quotes),
        "status_counts": status_counts,
        "avg_discount": avg_discount_str,
        "raw_deals": deal_history[:5]
    }
    return deal_summary, mostly_purchased[:3]


def build_twin_hunter_cards(analysis_id: str, max_cards: int = 6) -> str:
    """
    Builds Twin Hunter preview cards using LLM.
    Categorizes lookalikes into "existing" matching accounts and "net_new" prospects.
    """
    analysis_id_str = str(analysis_id or "").strip()
    cache_entry = TWIN_HUNTER_CACHE.get(analysis_id_str)
    if not cache_entry or "context" not in cache_entry:
        if TWIN_HUNTER_CACHE:
            latest_id = list(TWIN_HUNTER_CACHE.keys())[-1]
            cache_entry = TWIN_HUNTER_CACHE[latest_id]
            _twin_log("build_twin_hunter_cards", f"analysis_id '{analysis_id_str}' not found. Falling back to latest entry: '{latest_id}'")
        else:
            return _json_dumps({"status": "error", "analysis_id": analysis_id, "message": "Unknown analysis_id.", "cards": []})

    context = cache_entry.get("context", {})
    research = cache_entry.get("research", {})
    research_results = research.get("results") or []
    
    if not research_results:
        result = {
            "status": "empty",
            "analysis_id": analysis_id,
            "summary": "No research results available to build cards.",
            "cards": []
        }
        return _json_dumps(result)
        
    # Query Salesforce for AccountIds that have quotes to ensure they have deal history
    acct_ids_with_quotes = set()
    try:
        quote_records = _salesforce_query("SELECT AccountId FROM Quote WHERE AccountId != null LIMIT 500")
        for qr in quote_records:
            aid = qr.get("AccountId")
            if aid:
                acct_ids_with_quotes.add(aid)
    except Exception as e:
        print(f"[DEBUG] Error pre-fetching quote account IDs: {e}")

    existing_candidates = [
        acc for acc in context.get("accounts", [])
        if acc.get("name") and (not acct_ids_with_quotes or acc.get("id") in acct_ids_with_quotes)
    ]
    if not existing_candidates:
        existing_candidates = [acc for acc in context.get("accounts", []) if acc.get("name")]

    context_for_ai = {
        "target_account": context.get("target_account"),
        "anchor_accounts": context.get("anchor_accounts", [])[:5],
        "existing_salesforce_accounts": [
            {
                "name": acc.get("name"),
                "industry": acc.get("industry") or "Unknown",
                "description": acc.get("description") or "",
                "billing_city": acc.get("billing_city") or "",
                "annual_revenue": f"${acc.get('annual_revenue'):,.0f}" if acc.get('annual_revenue') else "Unknown",
                "employees": acc.get('employees') or "Unknown"
            }
            for acc in existing_candidates
        ][:50]  # Limit to 50 active accounts to optimize token usage
    }
    
    prompt = f"""
You are Twin Hunter. Your task is to analyze lookalike customers and return them in structured cards.
You must find and return two types of lookalikes:
1. "existing": At least 1 or 2 matching companies selected from the "existing_salesforce_accounts" list that closely resemble the target account or anchor accounts.
2. "net_new": 3 to 4 net-new prospect companies extracted from the public Tavily search results.

Strict Rules:
- NO ANCHOR / SYSTEM COMPANY IN RESULTS: Never include "ThermoFisher", "Thermo Fisher Scientific", or any variation of the system owner/service provider company name in the lookalike candidates. Lookalikes are external prospects/accounts only.
- TYPE CATEGORIZATION: You MUST categorize every card as either "existing" or "net_new" in the "type" field.
- EXACTLY 5 OR 6 CARDS: Return exactly {min(int(max_cards or 6), 6)} cards (1-2 of type "existing", and the rest of type "net_new").
- STRICT INDUSTRY FILTER: You must discard any candidate that operates in unrelated consumer sectors (e.g., wellness, fitness, retail, consumer health). Only accept verified B2B companies that match the anchor's industry.
- STRICT 90-100% MATCH SCORE: Every prospect you select MUST have a high match score between 90 and 100. Discard candidates that do not meet key alignment factors (such as product footprint compatibility and industry synergy). Every match score in the cards MUST be 90 or higher.
- STRICT REVENUE TIER MATCHING (CRITICAL):
  - You MUST select lookalike candidates whose annual revenue is extremely close to the matched anchor account's revenue scale.
  - If the target/anchor is in the billions (e.g., $1B+ or $2B+), lookalikes MUST also be in the billions. A million-dollar company is NOT a valid lookalike for a billion-dollar account.
  - If the anchors are mid-market ($50M-$200M), lookalikes must match that range. Revenue matching is your primary and most critical filtering criterion, followed by industry and product alignment.
- STRICT ANCHOR REVENUE SCALE SYNERGY (CRITICAL):
  - If a lookalike resembles a specific anchor account (`matched_against.account_name`), their annual revenues must be extremely close (e.g., within the same tier or bracket, not off by orders of magnitude). Do not match a candidate to an anchor if their annual revenues differ significantly.
- DISCLOSED REVENUE PREFERENCE (CRITICAL):
  - Avoid selecting lookalike candidates whose annual revenue is undisclosed, hidden, or unknown. If a company's revenue is not disclosed, try to find alternative candidates (either from the existing Salesforce list or via Tavily research) that have publicly disclosed or estimable revenues so that scale compatibility can be verified.
- GLOBAL SEARCH RANGE:
  - You must evaluate and suggest lookalike candidates globally. Do not restrict candidates to the anchor's billing city or country unless explicitly requested. Find the best matches worldwide.
- STRICT ZERO REPETITION RULE (CRITICAL):
  - You MUST ensure there is absolutely NO semantic overlap, shared facts, or similar phrasing between the `key_highlights` array (objective company facts) and the `reasons` array (fit reasons).
  - Highlights must strictly list objective, public-record events (e.g. facility openings, funding rounds, distribution contracts).
  - Fit reasons must strictly detail technical workflow alignment and commercial comparisons to the anchor's model (e.g., shared bioreactor tiers, sterile hoods usage).
  - If a fact, event, or attribute is mentioned in Highlights, it is STRICTLY FORBIDDEN to mention it or refer to it in Reasons, and vice versa. Keep them 100% separate and distinct.
- CRISP CRM COMPARISONS IN fit REASONS (CRITICAL):
  - In `reasons` (why it fits), write short, crisp, high-impact bullet points explaining exactly *why* and *where* they matched (e.g. sharing identical research goals, specific biological product workflows, process automation requirements, or equipment footprints).
  - Do NOT repeat the company's base location, annual revenue, or general company descriptions in these reasons, as those values are already displayed in the location, revenue, and summary fields.
  - Every reason MUST highlight a direct business parallel or workflow synergy compared directly against the matched anchor account.
- `company_name`: The exact name of the lookalike company.
- `summary`: A concise sentence explaining what this company does.
- `location`: The headquarters city/state or country (e.g. "Cambridge, MA" or "Germany"), if found. Otherwise, leave empty.
- `revenue`: Estimated annual revenue or range (e.g. "$120M est." or "$2B+"), if found. Otherwise, leave empty.
- `match_score`: An integer from 1 to 100 calculated using Industry Match (50 pts max) and Products/Services Match (50 pts max).
- `score_breakdown`: An array of EXACTLY 2 objects detailing the points awarded for each of the 2 rubric metrics. Each object MUST contain: `metric` (either "Industry Match" or "Products & Services"), `score` (e.g. 45), `max` (e.g. 50), and `reason` (1 sentence explaining why this specific score was given).
- `reasons`: Array of 2-3 short sentences explaining exact commercial synergies or structural alignment compared against the anchor profile.
- `key_highlights`: Array of 2-3 short, objective facts about the company from public records. DO NOT mention the anchor account here.
- `matched_against`: Array with 1 object detailing the closest Salesforce anchor account it resembles.
  - `account_name`: The name of the closest SALESFORCE ANCHOR ACCOUNT.
  - `match_reason`: Why it resembles this anchor.
  - `shared_terms`: Array of shared business attributes/keywords.
- `source_urls`: Array of their OFFICIAL company website URLs.
- `contact_email`: The company's official contact email, if explicitly found. Otherwise, leave empty.
- `upsell_opportunities`: ONLY for type: "existing" cards. An array of 1-2 product categories or suggestions we can upsell to this existing customer based on its similarity to other top accounts (e.g., what products they should buy next). Leave empty or omit for type: "net_new".

Return strict JSON only:
{{
  "summary": "one concise sentence summarizing the findings, e.g., 'Found lookalikes for our top accounts containing both existing matching customers and net-new prospects.'",
  "cards": [
    {{
      "company_name": "Company Name",
      "type": "existing",
      "summary": "...",
      "location": "Cambridge, MA",
      "revenue": "$120M est.",
      "match_score": 85,
      "score_breakdown": [
        {{"metric": "Industry Match", "score": 45, "max": 50, "reason": "..."}},
        {{"metric": "Products & Services", "score": 40, "max": 50, "reason": "..."}}
      ],
      "reasons": ["..."],
      "key_highlights": ["..."],
      "matched_against": [
        {{
          "account_name": "Anchor Account Name",
          "match_reason": "...",
          "shared_terms": ["..."]
        }}
      ],
      "source_urls": ["..."],
      "contact_email": "...",
      "upsell_opportunities": ["..."]
    }}
  ]
}}

Salesforce Context:
{json.dumps(context_for_ai, default=str)}

Tavily Results:
{json.dumps(research_results[:8], default=str)}
"""


    try:
        import subprocess
        worker_path = os.path.join(os.path.dirname(__file__), "app", "tools", "twin_ai_cards_worker.py")
        model_name = os.getenv("TWIN_HUNTER_MODEL", "gemini-2.5-flash")
        timeout_seconds = 45
        
        completed = subprocess.run(
            [sys.executable, worker_path],
            input=json.dumps({"prompt": prompt, "model_name": model_name, "http_timeout": timeout_seconds}),
            capture_output=True,
            text=True,
            timeout=timeout_seconds + 10,
            cwd=os.path.dirname(__file__),
        )
        worker_output = json.loads(completed.stdout or "{}")
        if worker_output.get("ok"):
            text = worker_output.get("text") or ""
            try:
                parsed = json.loads(text)
            except json.JSONDecodeError:
                import re
                match = re.search(r"\{.*\}", text, re.S)
                parsed = json.loads(match.group(0)) if match else {}
                
            # Post-process cards: Query Salesforce for existing accounts to get real deal history & products
            final_cards = []
            for c in parsed.get("cards", []):
                c_name = c.get("company_name", "")
                c_type = c.get("type", "net_new")
                if "thermofisher" in c_name.lower() or "thermo fisher" in c_name.lower():
                    continue
                
                # Check for overlap with Salesforce accounts
                existing_accts = context.get("accounts", [])
                matched_acct = None
                normalized_c_name = _normalise_name(c_name)
                for acc in existing_accts:
                    if _normalise_name(acc.get("name")) == normalized_c_name:
                        matched_acct = acc
                        break
                
                if c_type == "existing":
                    deal_summary, mostly_bought = {}, []
                    if matched_acct:
                        # Fetch real deal history summary and products from Salesforce
                        deal_summary, mostly_bought = _fetch_account_deal_info(matched_acct.get("id"))
                        c["company_name"] = matched_acct.get("name") # Use exact Salesforce name
                    else:
                        # Fallback if AI outputted a name not exact or not found in our context accounts
                        for acc in existing_accts:
                            acc_norm = _normalise_name(acc.get("name"))
                            if normalized_c_name in acc_norm or acc_norm in normalized_c_name:
                                matched_acct = acc
                                deal_summary, mostly_bought = _fetch_account_deal_info(acc.get("id"))
                                c["company_name"] = acc.get("name")
                                break
                    
                    # Convert to net_new if no deal history is found to prevent blank layouts
                    if not deal_summary or deal_summary.get("total_quotes", 0) == 0:
                        c["type"] = "net_new"
                        c_type = "net_new"
                    else:
                        c["deal_history"] = deal_summary.get("raw_deals", [])
                        c["deal_summary"] = deal_summary
                        c["mostly_purchased_products"] = mostly_bought
                        
                        # Generate intelligent upsell recommendations comparing this account to its peer anchor
                        anchor_name = ""
                        if c.get("matched_against") and len(c["matched_against"]) > 0:
                            anchor_name = c["matched_against"][0].get("account_name", "")
                        
                        anchor_products = []
                        if anchor_name:
                            normalized_anchor_name = _normalise_name(anchor_name)
                            for acc in existing_accts:
                                if _normalise_name(acc.get("name")) == normalized_anchor_name:
                                    _, anchor_products = _fetch_account_deal_info(acc.get("id"))
                                    break
                        
                        # Calculate recommendations (products anchor bought but this client did not)
                        my_prods_set = {p.lower() for p in mostly_bought}
                        recommendations = [p for p in anchor_products if p.lower() not in my_prods_set]
                        
                        if recommendations:
                            c["upsell_opportunities"] = [
                                _generate_natural_upsell(prod, anchor_name, idx)
                                for idx, prod in enumerate(recommendations[:2])
                            ]
                        else:
                            c["upsell_opportunities"] = [
                                f"Upsell advanced solutions: Drive structural alignment with successful configurations deployed at peer account {anchor_name or 'top anchors'}."
                            ]
                
                # Check c_type again (it might have been downgraded to net_new)
                if c_type != "existing":
                    # Filter out net_new matches that overlap with existing accounts
                    if matched_acct:
                        continue
                
                final_cards.append(c)

            result = {
                "status": "success",
                "analysis_id": analysis_id,
                "summary": parsed.get("summary") or "Lookalike matches processed successfully.",
                "source_account": context.get("target_account"),
                "anchor_accounts": context.get("anchor_accounts", []),
                "cards": final_cards,
                "limitations": context.get("limitations", [])
            }
            cache_entry["cards"] = result
            return _json_dumps(result)
        else:
            return _json_dumps({"status": "error", "message": f"Worker failed: {worker_output.get('error')}"})
    except Exception as exc:
        return _json_dumps({"status": "error", "message": f"Card building failed: {str(exc)}"})


def search_catalog(
        search_term: str = None,
        filters: dict = None,
        page_size: int = 100
) -> str:
    """
    Unified product catalog search for Salesforce Revenue Cloud (PCM).
    Accepts both keyword searches and attribute filters, and can combine them.

    WHEN TO CALL: Call this tool to perform ANY product search. If you are refining
    a previous search, you MUST pass both the new criteria AND the previous criteria
    (search_term or filters) so that the search combines them.

    Args:
        search_term: The keyword or product name string (if any).
        filters: The 'matched_filters' dict from the field classification tool (if any).
        page_size: Maximum results. Default 100.

    RETURNS (JSON):
        status:   "success" or "empty"
        count:    number of products found
        results:  list of product objects
    """
    headers, instance_url = get_salesforce_auth()
    
    endpoint = f"{instance_url}/services/data/v65.0/connect/pcm/products?include=/products"
    
    criteria = []
    if filters:
        for key, value in filters.items():
            criteria.append({
                "property": key,
                "operator": "eq",
                "value": value
            })
            
    payload = {
        "language": "en_US",
        "filter": {
            "criteria": criteria
        },
        "offset": 0,
        "pageSize": page_size
    }
    
    if search_term:
        payload["searchTerm"] = search_term
        
    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=30)
    except Exception as e:
        return f"Request Error: {str(e)}"
        
    if response.status_code not in [200, 201]:
        return f"Error: Salesforce API returned status code {response.status_code}\n{response.text}"
        
    data = response.json()
    
    results = []
    products = data.get("products", [])
    if not products and isinstance(data, list):
        products = data
    if not products and "result" in data:
        products = data.get("result", [])
    if not products and "items" in data:
        products = data.get("items", [])
    
    if not products:
        import json
        return json.dumps({"status": "empty", "message": "No products matched your search."})
    
    for item in products:
        name = item.get("name") or item.get("Name") or item.get("fields", {}).get("Name", "Unknown")
        prod_id = item.get("id") or item.get("Id") or item.get("productId", "Unknown ID")
        code = item.get("productCode") or item.get("ProductCode") or "No Code"
        
        # safely get category name
        categories = item.get("categories", [])
        category_name = categories[0].get("name") if categories else (item.get("Family") or "General")
        
        results.append({
            "name": name,
            "id": prod_id,
            "code": code,
            "category": category_name
        })
        
    import json
    return json.dumps({
        "status": "success",
        "searchTerm": search_term or "filtered",
        "count": len(results),
        "results": results
    }, indent=2)


def get_searchable_custom_fields() -> str:
    """
    Discovers the API names of all custom fields available for product attribute filtering.

    When to call: Only if you need to verify what custom filter fields exist,
    or to enumerate them before calling the picklist values tool.

    After calling: Use the returned field API names to understand what attributes
                   are available for filtering.
    """
    headers, instance_url = get_salesforce_auth()
    
    endpoint = f"{instance_url}/services/data/v66.0/connect/pcm/index/configurations?includeMetadata=false&fieldTypes=Custom"
    
    try:
        response = requests.get(endpoint, headers=headers, timeout=30)
    except Exception as e:
        return f"Request Error: {str(e)}"
        
    if response.status_code not in [200, 201]:
        return f"Error: Salesforce API returned status code {response.status_code}\n{response.text}"
        
    data = response.json()
    configurations = data.get("indexConfigurations", [])
    
    if not configurations:
        import json
        return json.dumps({"status": "empty", "message": "No searchable custom fields found."})
        
    results = []
    for config in configurations:
        results.append({
            "label": config.get("label"),
            "api_name": config.get("name"),
            "type": config.get("type", "Custom")
        })
        
    import json
    return json.dumps({
        "status": "success",
        "custom_fields": results
    }, indent=2)


def get_picklist_values(field_api_name: str) -> str:
    """
    Retrieves all valid picklist options for a specific Salesforce custom field.

    When to call: Only if you already have the field API name from the searchable fields
    discovery tool and need to validate or enumerate its accepted values.
    Do NOT call this as part of the normal product search flow — the token classification
    tool handles field value validation automatically.

    Args:
        field_api_name: The Salesforce API name of the field, e.g. 'Region__c'.
                        Always use the exact API name from the discovery tool response.
    """
    headers, instance_url = get_salesforce_auth()
    
    # Use Master record type '012000000000000AAA'
    endpoint = f"{instance_url}/services/data/v65.0/ui-api/object-info/Product2/picklist-values/012000000000000AAA/{field_api_name}"
    
    try:
        response = requests.get(endpoint, headers=headers, timeout=30)
    except Exception as e:
        return f"Request Error: {str(e)}"
        
    if response.status_code not in [200, 201]:
        return f"Error: Salesforce API returned status code {response.status_code}\n{response.text}"
        
    data = response.json()
    values_data = data.get("values", [])
    
    if not values_data:
        import json
        return json.dumps({"status": "empty", "message": f"No picklist values found for field {field_api_name}."})
        
    valid_options = []
    for v in values_data:
        valid_options.append({
            "label": v.get("label"),
            "value": v.get("value")
        })
        
    import json
    return json.dumps({
        "status": "success",
        "field": field_api_name,
        "valid_options": valid_options
    }, indent=2)


def check_field_values(candidates: list[str]) -> str:
    """
    FIELD CLASSIFICATION TOOL — must be the FIRST tool called for any product search,
    without exception. Classifies search tokens against live Salesforce product field
    picklist values to determine the correct search parameters.

    HOW TO USE:
      Extract meaningful words from the user's query. Remove stopwords (e.g. search,
      for, the, a, products, in, with, and, or, related, to, find, show, me, get,
      all, of, at, by, that, have, having, using). Pass remaining words as candidates.

    WHAT IT DOES:
      - Matches each token against all known Salesforce field picklist values
      - Matched tokens become attribute filters
      - Unmatched tokens become the keyword search term
      - Returns an 'instruction' field that tells you how to call the search tool.

    Always follow the 'instruction' field in the response exactly. Do not deviate.

    Args:
        candidates: List of meaningful tokens from the user query.
                    Example: query="Manager Rule products in West" → ["Manager","Rule","West"]

    RETURNS (JSON):
        matched_filters:   dict  — field-to-value map for attribute-based search
                                   e.g. {"Region__c": "West"}
                                   Empty dict {} if no picklist values matched.
        name_search_terms: str   — remaining tokens for keyword-based search
                                   e.g. "Manager Rule"
                                   Empty string if all tokens matched picklist values.
        search_strategy:   str   — "attribute_search" | "name_search"
                                   Tells you which search tool type to use.
        classification_id: str   — pre-configured ID, pass through as-is to the
                                   attribute-based search tool.
        instruction:       str   — explicit guidance on which search CAPABILITY
                                   to invoke next and with which values.
                                   Follow this exactly.
    """
    global FIELD_VALUE_INDEX, _INDEX_BUILT
    
    # Build the index lazily using SOQL on actual Product2 field values
    if not _INDEX_BUILT:
        try:
            headers, instance_url = get_salesforce_auth()
            
            # Step 1: Get custom field API names from the index configuration
            cfg_endpoint = f"{instance_url}/services/data/v66.0/connect/pcm/index/configurations?includeMetadata=false&fieldTypes=Custom"
            cfg_resp = requests.get(cfg_endpoint, headers=headers, timeout=30)
            valid_fields = set()
            if cfg_resp.status_code == 200:
                for config in cfg_resp.json().get("indexConfigurations", []):
                    name = config.get("name")
                    if name:
                        valid_fields.add(name)
            
            # Step 2: Query the UI API strictly for all Picklist values on Product2
            ui_endpoint = f"{instance_url}/services/data/v65.0/ui-api/object-info/Product2/picklist-values/012000000000000AAA"
            ui_resp = requests.get(ui_endpoint, headers=headers, timeout=30)
            if ui_resp.status_code == 200:
                picklist_field_values = ui_resp.json().get("picklistFieldValues", {})
                for field_api_name, field_data in picklist_field_values.items():
                    if field_api_name in valid_fields:
                        for val_obj in field_data.get("values", []):
                            value = str(val_obj.get("value")).strip()
                            if value:
                                FIELD_VALUE_INDEX[value.lower()] = {"field": field_api_name, "value": value}
            
            _INDEX_BUILT = True
        except Exception as e:
            return json.dumps({"status": "error", "message": f"Could not build field index: {e}"})
    
    matched_filters = {}
    
    # Process multi-word phrases by sorting picklist string lengths descending
    query_string = " ".join(candidates).strip().lower()
    
    # We want to find the longest matching picklist phrase values first
    sorted_keys = sorted(FIELD_VALUE_INDEX.keys(), key=len, reverse=True)
    
    for key in sorted_keys:
        # Check whole word bounds to avoid partial substring matches
        import re
        pattern = r'\b' + re.escape(key) + r'\b'
        if re.search(pattern, query_string):
            entry = FIELD_VALUE_INDEX[key]
            matched_filters[entry["field"]] = entry["value"]
            # Remove the exact phrase from the query string so it doesn't leak into name_search_terms
            query_string = re.sub(pattern, ' ', query_string)
    
    # Clean up remaining spaces for the leftover terms
    import re
    name_terms = re.sub(r'\s+', ' ', query_string).strip()
    
    return json.dumps({
        "matched_filters": matched_filters,
        "name_search_terms": name_terms,
        "instruction": (
            "Call the unified search_catalog tool. "
            "Pass matched_filters as the 'filters' parameter (if not empty), "
            "and pass name_search_terms as the 'search_term' parameter (if not empty)."
        )
    }, indent=2)



def resolve_pricebook_entries(product_ids: list[str]) -> str:
    """
    Resolves Salesforce Product2 IDs to their active PricebookEntry IDs and unit prices.

    When to call: Immediately before creating a quote. This is a mandatory prerequisite
    — quote line items require PricebookEntryIds, not Product2Ids directly.
    Always call this before the quote graph submission tool, even if you think you
    already have pricing data.

    Args:
        product_ids: List of Product2 IDs obtained from product search results.
                     Do not fabricate IDs — use only what the search tools returned.

    After calling: 
        1. Extract the top-level 'pricebook_id' and pass it to evaluate_quote_graph.
        2. Use the returned PricebookEntryId and UnitPrice values to construct
           the line items for the quote graph submission tool.
    """
    headers, instance_url = get_salesforce_auth()
    
    if not product_ids:
        import json
        return json.dumps({"status": "error", "message": "product_ids list cannot be empty."})
        
    formatted_ids = ",".join([f"'{pid}'" for pid in product_ids])
    query = f"SELECT Id, Pricebook2Id, Product2Id, UnitPrice, Product2.Type, ProductSellingModel.SellingModelType FROM PricebookEntry WHERE Product2Id IN ({formatted_ids}) AND Pricebook2.IsStandard = true AND IsActive = true"
    
    from urllib.parse import quote
    endpoint = f"{instance_url}/services/data/v65.0/query/?q={quote(query)}"
    
    try:
        response = requests.get(endpoint, headers=headers, timeout=30)
    except Exception as e:
        return f"Request Error: {str(e)}"
        
    if response.status_code not in [200, 201]:
        return f"Error: Salesforce API returned status code {response.status_code}\n{response.text}"
        
    data = response.json()
    records = data.get("records", [])
    
    results = []
    for r in records:
        results.append({
            "PricebookEntryId": r.get("Id"),
            "Product2Id": r.get("Product2Id"),
            "Pricebook2Id": r.get("Pricebook2Id"),
            "UnitPrice": r.get("UnitPrice"),
            "Type": r.get("Product2", {}).get("Type"),
            "SellingModelType": (r.get("ProductSellingModel") or {}).get("SellingModelType")
        })
        
    standard_pricebook_id = results[0]["Pricebook2Id"] if results else ""

    import json
    return json.dumps({
        "status": "success",
        "pricebook_id": standard_pricebook_id,
        "resolved_entries": results
    }, indent=2)


def get_my_accounts() -> str:
    """
    Fetches the Salesforce accounts owned by the currently authenticated user.

    MANDATORY FIRST STEP when the user wants to create a quote.
    Call this before anything else in the quote creation flow.

    Returns a JSON list of accounts with their IDs, names, and details.
    After calling, the UI will display these as selectable cards.
    Tell the user: 'Please select an account from the panel on the left.'
    Do NOT proceed further until the user has selected an account.
    """
    headers, instance_url = get_salesforce_auth()

    # Get current user's Salesforce ID via /userinfo
    userinfo_resp = requests.get(
        f"{instance_url}/services/oauth2/userinfo",
        headers={"Authorization": headers["Authorization"]}
    )
    if userinfo_resp.status_code != 200:
        return json.dumps({"error": "Could not determine current user identity.", "accounts": []})

    user_id = userinfo_resp.json().get("user_id", "")
    if not user_id:
        return json.dumps({"error": "User identity unavailable.", "accounts": []})

    query = (
        f"SELECT Id, Name, Type, Industry FROM Account "
        f"WHERE OwnerId = '{user_id}' "
        f"ORDER BY LastModifiedDate DESC LIMIT 20"
    )
    resp = requests.get(
        f"{instance_url}/services/data/v59.0/query",
        headers=headers,
        params={"q": query}
    )
    if resp.status_code != 200:
        return json.dumps({"error": resp.text, "accounts": []})

    accounts = []
    for rec in resp.json().get("records", []):
        type_val     = rec.get("Type", "") or ""
        industry_val = rec.get("Industry", "") or ""
        detail_parts = [p for p in [type_val, industry_val] if p]
        accounts.append({
            "id":     rec["Id"],
            "name":   rec["Name"],
            "type":   type_val,
            "industry": industry_val,
            "detail": " | ".join(detail_parts) if detail_parts else "—",
        })

    return json.dumps({
        "action":   "ACCOUNT_SELECTION",
        "accounts": accounts,
        "count":    len(accounts),
        "message":  f"Found {len(accounts)} accounts. Waiting for user selection.",
    })



def get_opportunities_for_account(account_id: str) -> str:
    """
    Fetches open Opportunities linked to a specific Salesforce Account.

    Call this AFTER the user has selected an account from the account picklist.
    The account_id must be the 18-character Salesforce Account ID (starts with '001')
    extracted from the user's selection in format '[Account Name] (ID: 001xxxxxx)'.

    Returns only open opportunities (excludes Closed Won / Closed Lost).
    After calling, tell the user: 'Please select an opportunity from the panel on the left.'
    Do NOT call evaluate_quote_graph until the user confirms an opportunity.

    Args:
        account_id: 18-character Salesforce Account ID (e.g. '001NS00000ABC...')
    """
    import re
    # Sanitize — extract 18-char ID if the full string was passed
    match = re.search(r'(001[A-Za-z0-9]{15})', account_id)
    clean_id = match.group(1) if match else account_id.strip()

    headers, instance_url = get_salesforce_auth()

    query = (
        f"SELECT Id, Name, StageName, Amount FROM Opportunity "
        f"WHERE AccountId = '{clean_id}' "
        f"AND StageName NOT IN ('Closed Won', 'Closed Lost') "
        f"ORDER BY LastModifiedDate DESC LIMIT 20"
    )
    resp = requests.get(
        f"{instance_url}/services/data/v59.0/query",
        headers=headers,
        params={"q": query}
    )
    if resp.status_code != 200:
        return json.dumps({"error": resp.text, "opportunities": []})

    opps = []
    for rec in resp.json().get("records", []):
        amount     = rec.get("Amount")
        amount_str = f"${amount:,.0f}" if amount else "—"
        stage      = rec.get("StageName", "") or ""
        opps.append({
            "id":     rec["Id"],
            "name":   rec["Name"],
            "stage":  stage,
            "amount": amount_str,
            "detail": f"{stage} | {amount_str}",
        })

    return json.dumps({
        "action":        "OPPORTUNITY_SELECTION",
        "opportunities": opps,
        "count":         len(opps),
        "message":       f"Found {len(opps)} open opportunities. Waiting for user selection.",
    })

def evaluate_quote_graph(line_items: list[dict], pricebook_id: str, opportunity_id: str) -> str:
    """
    Submits a Salesforce CPQ Quote Graph to create a draft quote with line items.

    When to call: Only after resolving pricebook entries for all products you want to quote
    AND only after the user has confirmed an Opportunity via the opportunity picklist.
    Never call this tool if any line item is missing its PricebookEntryId — the API will
    reject the request. If you get a validation error, read it carefully and fix the payload.

    Args:
      pricebook_id: The Salesforce Pricebook2 ID to associate with the quote.
                    MUST be provided. You receive this from resolve_pricebook_entries.
      opportunity_id: The 18-character Salesforce Opportunity ID (starts with '006').
                      Extract this from the user's opportunity selection: '[Opp Name] (ID: 006xxx)'.
                      This parameter is REQUIRED.
      line_items: One dict per product, each containing:
                  - Product2Id (from search results)
                  - PricebookEntryId (from pricebook resolution tool)
                  - Quantity (default 1)
                  - UnitPrice (from pricebook resolution tool)
                  - Discount (numeric percentage, e.g., 10 for 10%)
                  - StartDate / EndDate (optional, defaults applied automatically)
                  - BillingFrequency (REQUIRED if SellingModelType from pricebook resolution is 'Evergreen' or 'Term-Defined'. Set to 'Monthly')

    After calling: Return the Quote ID from the response to the user. If the response
                   includes a record ID, the quote was successfully created in Salesforce.
    """
    import re
    if not opportunity_id or not opportunity_id.strip():
        raise ValueError("opportunity_id is required to create a CPQ quote.")

    headers, instance_url = get_salesforce_auth()

    # Sanitize opportunity_id — extract 18-char ID if full string passed
    clean_opp_id = ""
    if opportunity_id:
        match = re.search(r'(006[A-Za-z0-9]{15})', opportunity_id)
        clean_opp_id = match.group(1) if match else opportunity_id.strip()

    # Fallback for pricebook_id if not provided
    if not pricebook_id:
        sys.stderr.write("[DEBUG] No pricebook_id provided, querying for Standard Pricebook...\n")
        query = "SELECT Id FROM Pricebook2 WHERE IsStandard = true AND IsActive = true LIMIT 1"
        pb_resp = requests.get(f"{instance_url}/services/data/v59.0/query", headers=headers, params={"q": query})
        if pb_resp.status_code == 200:
            records = pb_resp.json().get("records", [])
            if records:
                pricebook_id = records[0]["Id"]
                sys.stderr.write(f"[DEBUG] Found Standard Pricebook: {pricebook_id}\n")
    
    quote_record = {
        "attributes": {
            "method": "POST",
            "type": "Quote"
        },
        "Name": "Agentic_Deal_Management_Quote",
        "Pricebook2Id": pricebook_id
    }
    if clean_opp_id:
        quote_record["OpportunityId"] = clean_opp_id

    records = [{"referenceId": "refQuote", "record": quote_record}]

    for i, item in enumerate(line_items):
        if "Product2Id" not in item or "PricebookEntryId" not in item:
            import json
            return json.dumps({"status": "error", "message": "CRITICAL: Every line item MUST include Product2Id and PricebookEntryId."})

        # Sanitize Quantity and Discount (handle strings like "10%" or "5 units")
        def sanitize_numeric(val, default=0):
            if val is None: return default
            if isinstance(val, (int, float)): return val
            try:
                # Remove non-numeric chars except decimal point
                clean_val = re.sub(r'[^-0-9.]', '', str(val))
                return float(clean_val) if clean_val else default
            except:
                return default

        qty = sanitize_numeric(item.get("Quantity"), 1)
        discount = sanitize_numeric(item.get("Discount"), 0)

        record_item = {
            "attributes": {
                "type": "QuoteLineItem",
                "method": "POST"
            },
            "QuoteId": "@{refQuote.id}",
            "Product2Id": item["Product2Id"],
            "PricebookEntryId": item["PricebookEntryId"],
            "Quantity": qty,
            "UnitPrice": item.get("UnitPrice", 100),
            "Discount": discount,
            "StartDate": item.get("StartDate", "2025-01-01"),
            "EndDate": item.get("EndDate", "2026-01-01")
        }

        # Only add subscription-specific fields if they are provided
        for field in ["BillingFrequency", "PeriodBoundary"]:
            if field in item:
                record_item[field] = item[field]

        for k, v in item.items():
            if k not in ["Product2Id", "PricebookEntryId", "Quantity", "UnitPrice", "Discount", "StartDate", "EndDate"]:
                record_item[k] = v

        records.append({"referenceId": f"refQuoteLine{i}", "record": record_item})

    payload = {
        "pricingPref": "Force",
        "catalogRatesPref": "Skip",
        "configurationPref": {
            "configurationMethod": "Skip",
            "configurationOptions": {
                "validateProductCatalog": True,
                "validateAmendRenewCancel": True,
                "executeConfigurationRules": True,
                "addDefaultConfiguration": True
            }
        },
        "taxPref": "Skip",
        "graph": {
            "graphId": "createQuote",
            "records": records
        }
    }

    endpoint = f"{instance_url}/services/data/v65.0/connect/rev/sales-transaction/actions/place"

    import json
    try:
        response = requests.post(endpoint, headers=headers, json=payload, timeout=30)
    except Exception as e:
        return f"Request Error: {str(e)}"

    if response.status_code not in [200, 201]:
        return f"SALESFORCE VALIDATION ERROR - Analyze this payload rejection and retry:\nStatus Code: {response.status_code}\nResponse: {response.text}"

    salesforce_resp = response.json()
    quote_id = ""
    quote_number = "Unknown"
    
    try:
        quote_id = salesforce_resp.get("salesTransactionId") or ""
        if not quote_id:
            for rec in salesforce_resp.get("records", []):
                if rec.get("referenceId") == "refQuote":
                    quote_id = rec.get("record", {}).get("Id") or rec.get("record", {}).get("id") or ""
                    break
                
        if quote_id:
            import time
            from urllib.parse import quote
            query = f"SELECT QuoteNumber FROM Quote WHERE Id = '{quote_id}'"
            q_url = f"{instance_url}/services/data/v60.0/query/?q={quote(query)}"
            for attempt in range(25):
                try:
                    q_res = requests.get(q_url, headers=headers, timeout=10)
                    if q_res.status_code == 200:
                        q_data = q_res.json()
                        if q_data.get("records"):
                            num = q_data["records"][0].get("QuoteNumber")
                            if num and num != "Unknown" and num != "None" and num != "":
                                quote_number = num
                                sys.stderr.write(f"[DEBUG] Successfully retrieved QuoteNumber: {quote_number} on attempt {attempt + 1}\n")
                                break
                except Exception as e:
                    sys.stderr.write(f"[DEBUG] Attempt {attempt + 1} error fetching QuoteNumber: {str(e)}\n")
                time.sleep(1.0)
    except Exception as e:
        sys.stderr.write(f"[DEBUG] Error fetching QuoteNumber: {str(e)}\n")

    return json.dumps({
        "status": "success",
        "message": "Salesforce successfully validated the Quote Graph!",
        "opportunity_id": clean_opp_id or "not linked",
        "quote_id": quote_id,
        "quote_number": quote_number,
        "salesforce_response": salesforce_resp
    }, indent=2)
def resolve_quote_id(quote_ref: str) -> str:
    """
    Resolves a quote reference (which could be an 18-character Quote ID starting with '0Q0'
    or a Quote Number like '00000479') into the clean 18-character Salesforce Quote ID.
    """
    if not quote_ref:
        return ""
    
    quote_ref = str(quote_ref).strip()
    
    # 1. Check if it's already a valid 15 or 18 character Quote ID starting with '0Q0'
    import re
    match = re.search(r'(0Q0[A-Za-z0-9]{12,15})', quote_ref)
    if match:
        return match.group(1)
        
    # 2. Otherwise, treat it as a Quote Number and query Salesforce to find its ID
    quote_num_match = re.search(r'(\d+)', quote_ref)
    if quote_num_match:
        digits = quote_num_match.group(1)
        padded_num = digits.zfill(8)
        
        try:
            headers, instance_url = get_salesforce_auth()
            query = f"SELECT Id FROM Quote WHERE QuoteNumber = '{padded_num}' OR QuoteNumber = '{digits}' LIMIT 1"
            from urllib.parse import quote
            endpoint = f"{instance_url}/services/data/v65.0/query/?q={quote(query)}"
            resp = requests.get(endpoint, headers=headers, timeout=15)
            if resp.status_code == 200:
                records = resp.json().get("records", [])
                if records:
                    resolved_id = records[0]["Id"]
                    sys.stderr.write(f"[DEBUG] Resolved Quote Number '{quote_ref}' to ID '{resolved_id}'\n")
                    return resolved_id
        except Exception as e:
            sys.stderr.write(f"[DEBUG] Error resolving Quote Number '{quote_ref}': {str(e)}\n")
            
    return quote_ref


def get_quote_preview(quote_id: str) -> str:
    """
    Fetches detailed preview data for a specific Salesforce Quote, 
    including its Account, Opportunity, and Quote Line Items.

    Args:
        quote_id: The 18-character Salesforce Quote ID (starts with '0Q0') or Quote Number.
    """
    print(f"[DEBUG] get_quote_preview called for {quote_id}")
    quote_id = resolve_quote_id(quote_id)
    print(f"[DEBUG] Resolved quote reference to ID: {quote_id}")
    if not quote_id:
        return json.dumps({"status": "error", "message": "Could not resolve quote reference to a valid Quote ID."})
    try:
        headers, instance_url = get_salesforce_auth()
        print(f"[DEBUG] Auth success. Instance: {instance_url}")
    except Exception as e:
        print(f"[DEBUG] Auth failed: {str(e)}")
        return json.dumps({"status": "error", "message": f"Auth error: {str(e)}"})
    
    # 1. Quote Details Query
    quote_query = f"""
    SELECT Id, Name, QuoteNumber, Status, GrandTotal, StartDate, ExpirationDate, 
           Pricebook2Id, Opportunity.Name, Account.Name, Account.Website 
    FROM Quote 
    WHERE Id='{quote_id}'
    """
    
    # 2. Quote Line Items Query
    lines_query = f"""
    SELECT Id, QuoteId, Product2Id, PricebookEntryId, Product2.Name, 
           Product2.ProductCode, Product2.Family, Product2.Type, 
           Product2.Description, Quantity, UnitPrice, TotalPrice, 
           ListPrice, StartDate, EndDate, Discount, 
           NetUnitPrice, SortOrder 
    FROM QuoteLineItem 
    WHERE QuoteId = '{quote_id}' 
    ORDER BY SortOrder ASC, CreatedDate ASC 
    LIMIT 2000
    """
    
    from urllib.parse import quote
    quote_endpoint = f"{instance_url}/services/data/v66.0/query/?q={quote(quote_query)}"
    lines_endpoint = f"{instance_url}/services/data/v66.0/query/?q={quote(lines_query)}"
    
    try:
        print(f"[DEBUG] Fetching quote details...")
        quote_resp = requests.get(quote_endpoint, headers=headers)
        print(f"[DEBUG] Fetching line items...")
        lines_resp = requests.get(lines_endpoint, headers=headers)
        
        if quote_resp.status_code != 200 or lines_resp.status_code != 200:
            err_msg = quote_resp.text if quote_resp.status_code != 200 else lines_resp.text
            print(f"[DEBUG] Query failed: {err_msg}")
            return json.dumps({
                "status": "error", 
                "message": f"Error fetching quote data: {err_msg}"
            })
            
        quote_data = quote_resp.json().get("records", [])
        if not quote_data:
            print(f"[DEBUG] Quote {quote_id} not found.")
            return json.dumps({"status": "error", "message": "Quote not found."})
            
        quote_obj = quote_data[0]
        
        # Poll if QuoteNumber is missing or Unknown
        q_num = quote_obj.get("QuoteNumber")
        if not q_num or q_num == "Unknown" or q_num == "None":
            import time
            print(f"[DEBUG] QuoteNumber in preview is '{q_num}'. Polling Salesforce to wait for it...")
            for attempt in range(25):
                time.sleep(1.0)
                try:
                    p_resp = requests.get(quote_endpoint, headers=headers, timeout=10)
                    if p_resp.status_code == 200:
                        p_records = p_resp.json().get("records", [])
                        if p_records:
                            new_num = p_records[0].get("QuoteNumber")
                            if new_num and new_num != "Unknown" and new_num != "None" and new_num != "":
                                quote_obj.update(p_records[0])
                                print(f"[DEBUG] Polled and successfully got QuoteNumber: {new_num} on attempt {attempt + 1}")
                                break
                except Exception as e:
                    print(f"[DEBUG] Preview poll attempt {attempt + 1} error: {e}")

        quote_obj["QuoteLineItems"] = lines_resp.json().get("records", [])
        print(f"[DEBUG] Successfully merged {len(quote_obj['QuoteLineItems'])} lines.")
        
        return json.dumps({
            "status": "success",
            "instance_url": instance_url,
            "records": [quote_obj]
        }, indent=2)
        
    except Exception as e:
        print(f"[DEBUG] Unexpected error: {str(e)}")
        return json.dumps({"status": "error", "message": str(e)})


def get_deal_history(account_name: str = "Edge Communications") -> str:
    """
    Fetches all quotes across all opportunities for a given account name.

    WHEN TO CALL: Call this tool when you need to fetch the deal history (past quotes, stage, products, etc.) for a specific account name.

    Args:
        account_name: The name of the account to fetch deal history for.
    """
    try:
        headers, instance_url = get_salesforce_auth()

        # Sanitize single quotes to prevent SOQL injection
        sanitized_account_name = account_name.replace("'", "\\'")

        # 1. Find account by name
        q_acc = f"SELECT Id, Name FROM Account WHERE Name LIKE '%{sanitized_account_name}%' LIMIT 5"
        acc_resp = requests.get(f"{instance_url}/services/data/v65.0/query", headers=headers, params={"q": q_acc}, timeout=15.0)
        accounts = acc_resp.json().get("records", [])
        if not accounts:
            return json.dumps({"status": "empty", "message": f"No account found matching '{account_name}'", "quotes": []}, indent=2)

        # Ambiguity check: If multiple accounts match, return status ambiguous
        if len(accounts) > 1:
            matching_names = [acc["Name"] for acc in accounts]
            sys.stderr.write(f"[DEBUG] Ambiguous account name search: '{account_name}' matches {matching_names}\n")
            return json.dumps({
                "status": "ambiguous",
                "message": f"Multiple accounts found matching '{account_name}'. Please choose one.",
                "options": matching_names,
                "quotes": []
            }, indent=2)

        account = accounts[0]
        account_id = account["Id"]
        display_name = account["Name"]

        # 2. Get all quotes across all opportunities for this account in a single query
        q_quotes = (
            f"SELECT Id, Name, Status, GrandTotal, Discount, QuoteNumber, CreatedDate, Opportunity.Name, "
            f"(SELECT Id, Product2.Name, Quantity, UnitPrice, TotalPrice, Discount FROM QuoteLineItems) "
            f"FROM Quote WHERE AccountId = '{account_id}' ORDER BY CreatedDate DESC LIMIT 100"
        )
        qt_resp = requests.get(f"{instance_url}/services/data/v65.0/query", headers=headers, params={"q": q_quotes}, timeout=15.0)
        quotes = qt_resp.json().get("records", [])

        all_quotes = []

        for quote in quotes:
            quote_id = quote["Id"]
            opp_name = quote.get("Opportunity", {}).get("Name", "Direct Quote") if quote.get("Opportunity") else "Direct Quote"

            line_items = []
            q_li_list = quote.get("QuoteLineItems", {}).get("records", []) if quote.get("QuoteLineItems") else []
            for li in q_li_list:
                prod_name = li.get("Product2", {}).get("Name", "Unknown Product") if li.get("Product2") else "Unknown Product"
                line_items.append({
                    "name": prod_name,
                    "quantity": li.get("Quantity", 1),
                    "unitPrice": li.get("UnitPrice", 0),
                    "totalPrice": li.get("TotalPrice", 0),
                    "discount": li.get("Discount", 0),
                })

            total = quote.get("GrandTotal") or 0
            discount_val = quote.get("Discount") or 0

            # Build tags from quote status and discount
            tags = []
            if discount_val and discount_val > 0:
                tags.append(f"{discount_val}% discount applied")
            if quote.get("Status") in ("Closed Won",):
                tags.append("Won deal")
            elif quote.get("Status") in ("Closed Lost",):
                tags.append("Lost  competitor")

            all_quotes.append({
                "id": quote_id,
                "name": quote.get("Name", "Unnamed Quote"),
                "quoteNumber": quote.get("QuoteNumber", ""),
                "status": quote.get("Status", "Draft"),
                "grandTotal": total,
                "discount": discount_val,
                "createdDate": quote.get("CreatedDate", ""),
                "opportunityName": opp_name,
                "lineItems": line_items,
                "analysis": None,
                "tags": tags,
            })

        return json.dumps({
            "status": "success",
            "accountName": display_name,
            "accountId": account_id,
            "quoteCount": len(all_quotes),
            "quotes": all_quotes,
        }, indent=2)

    except Exception as e:
        sys.stderr.write(f"[ERROR] get_deal_history failed: {str(e)}\n")
        return json.dumps({
            "status": "error", 
            "message": "An error occurred while fetching deal history. Please check the logs.", 
            "quotes": []
        }, indent=2)


def calculate_win_rate_analysis(
    account_name: str = "Edge Communications",
    current_quote_discount: float | None = None,
    current_quote_total: float | None = None,
    current_quote_products: list[str] | None = None
) -> str:
    """
    Computes account-level historical win metrics and/or quote-specific win probability.

    WHEN TO CALL: Call this tool when you need to calculate the win rate of an account
    or the win probability of a specific active quote based on historical deal outcomes.

    Args:
        account_name: The name of the account to analyze.
        current_quote_discount: The discount percentage of the active quote (e.g. 10.0 for 10%).
        current_quote_total: The grand total value of the active quote.
        current_quote_products: The list of product names in the active quote.
    """
    try:
        headers, instance_url = get_salesforce_auth()

        # Sanitize single quotes to prevent SOQL injection
        sanitized_account_name = account_name.replace("'", "\\'")

        # 1. Find account by name
        q_acc = f"SELECT Id, Name FROM Account WHERE Name LIKE '%{sanitized_account_name}%' LIMIT 5"
        acc_resp = requests.get(f"{instance_url}/services/data/v65.0/query", headers=headers, params={"q": q_acc}, timeout=15.0)
        accounts = acc_resp.json().get("records", [])
        if not accounts:
            return json.dumps({
                "status": "empty",
                "message": f"No account found matching '{account_name}'",
                "quotes": []
            }, indent=2)

        # Ambiguity check
        if len(accounts) > 1:
            matching_names = [acc["Name"] for acc in accounts]
            return json.dumps({
                "status": "ambiguous",
                "message": f"Multiple accounts found matching '{account_name}'. Please choose one.",
                "options": matching_names,
                "quotes": []
            }, indent=2)

        account = accounts[0]
        account_id = account["Id"]
        display_name = account["Name"]

        # 2. Get all quotes across all opportunities for this account
        q_quotes = (
            f"SELECT Id, Name, Status, GrandTotal, Discount, "
            f"(SELECT Id, Product2.Name, Quantity, UnitPrice, TotalPrice, Discount FROM QuoteLineItems) "
            f"FROM Quote WHERE AccountId = '{account_id}' ORDER BY CreatedDate DESC LIMIT 100"
        )
        qt_resp = requests.get(f"{instance_url}/services/data/v65.0/query", headers=headers, params={"q": q_quotes}, timeout=15.0)
        quotes = qt_resp.json().get("records", [])

        # 3. Delegate business rules & math to the WinRateCalculator Service
        result = WinRateCalculator.compute(
            quotes=quotes,
            display_name=display_name,
            account_id=account_id,
            current_quote_products=current_quote_products,
            current_quote_total=current_quote_total,
            current_quote_discount=current_quote_discount
        )

        return json.dumps(result, indent=2)

    except Exception as e:
        sys.stderr.write(f"[ERROR] calculate_win_rate_analysis failed: {str(e)}\n")
        return json.dumps({"status": "error", "message": str(e)}, indent=2)


def get_quote_line_items(quote_id: str) -> str:
    """
    Fetches all line items for a specific Salesforce Quote, including each
    line item's exact 18-character QuoteLineItem ID required for updates.

    WHEN TO CALL: This is the MANDATORY first step before any quote modification.
    Always call this before manage_quote_line_items — you cannot update or delete
    a line item without its exact QuoteLineItem ID (starts with '0Z4').

    Args:
        quote_id: The 18-character Salesforce Quote ID (starts with '0Q0') or Quote Number.
                  Extract this from the conversation history — do NOT ask the
                  user to provide it if a quote was already created this session.

    RETURNS (JSON):
        status:     "success" or "error"
        quote_id:   the sanitised Quote ID used in the query
        line_items: list of objects, each containing —
                      Id          (18-char QuoteLineItem ID, starts with '0Z4')
                      ProductName (human-readable product name for matching)
                      Product2Id  (Product2 ID, starts with '01t')
                      Quantity    (current quantity)
                      UnitPrice   (unit price)
                      Discount    (discount percentage, 0–100)
                      TotalPrice  (computed total)
        count:      number of line items found
    """
    quote_id = resolve_quote_id(quote_id)
    if not quote_id:
        return json.dumps({"status": "error", "message": "Could not resolve quote reference to a valid Quote ID.", "line_items": []})
    import re
    match = re.search(r'(0Q0[A-Za-z0-9]{15})', quote_id)
    clean_id = match.group(1) if match else quote_id.strip()

    headers, instance_url = get_salesforce_auth()

    query = (
        f"SELECT Id, Product2.Name, Product2Id, Quantity, UnitPrice, Discount, TotalPrice "
        f"FROM QuoteLineItem WHERE QuoteId = '{clean_id}'"
    )
    resp = requests.get(
        f"{instance_url}/services/data/v59.0/query",
        headers=headers,
        params={"q": query}
    )
    if resp.status_code != 200:
        return json.dumps({"status": "error", "message": resp.text, "line_items": []})

    items = []
    for rec in resp.json().get("records", []):
        items.append({
            "Id":          rec["Id"],
            "ProductName": (rec.get("Product2") or {}).get("Name", "Unknown"),
            "Product2Id":  rec.get("Product2Id"),
            "Quantity":    rec.get("Quantity"),
            "UnitPrice":   rec.get("UnitPrice"),
            "Discount":    rec.get("Discount"),
            "TotalPrice":  rec.get("TotalPrice"),
        })

    return json.dumps({
        "status":     "success",
        "quote_id":   clean_id,
        "line_items": items,
        "count":      len(items),
    }, indent=2)



def manage_quote_line_items(quote_id: str, operations: list[dict]) -> str:
    """
    Applies targeted add / update / delete operations to quote line items
    via the Salesforce Revenue Cloud Graph API.

    WHEN TO CALL: Only AFTER calling get_quote_line_items to obtain the exact
    18-character QuoteLineItem IDs (starts with '0Z4'). Never fabricate IDs.

    Args:
        quote_id:   18-character Salesforce Quote ID (starts with '0Q0') or Quote Number.
        operations: List of operation dicts. Each dict must contain 'method'
                    (PATCH, DELETE, or POST) plus the fields described below.

        PATCH  — update fields on an existing line item:
                 { "method": "PATCH", "id": "0Z4...", "Quantity": 3, "Discount": 10 }
                 'id' is REQUIRED. Include only the fields you want to change.

        DELETE — remove a line item from the quote:
                 { "method": "DELETE", "id": "0Z4..." }
                 'id' is REQUIRED.

        POST   — add a new line item (requires pre-resolved pricing):
                 { "method": "POST", "Product2Id": "01t...", "PricebookEntryId": "01u...",
                   "Quantity": 1, "UnitPrice": 100 }

        Multiple operations can be passed in a single call.

    RETURNS (JSON):
        status:              "success" or "error"
        message:             human-readable outcome
        salesforce_response: raw Graph API response body
    """
    quote_id = resolve_quote_id(quote_id)
    if not quote_id:
        return json.dumps({"status": "error", "message": "Could not resolve quote reference to a valid Quote ID."})
    import re
    match = re.search(r'(0Q0[A-Za-z0-9]{15})', quote_id)
    clean_id = match.group(1) if match else quote_id.strip()

    headers, instance_url = get_salesforce_auth()

    # Anchor record — the quote itself (PATCH with no field changes = a no-op touch
    # that is required by the Graph API to establish the transaction context)
    graph_records = [
        {
            "referenceId": "refQuote",
            "record": {
                "attributes": {
                    "method": "PATCH",
                    "type":   "Quote",
                    "id":     clean_id,
                }
            }
        }
    ]

    for idx, op in enumerate(operations):
        method = op.get("method", "PATCH").upper()
        record_attrs = {"method": method, "type": "QuoteLineItem"}

        if method in ("PATCH", "DELETE"):
            line_id = op.get("id") or op.get("Id")
            if not line_id:
                return json.dumps({
                    "status":  "error",
                    "message": f"Operation #{idx + 1}: 'id' (QuoteLineItem ID) is required for {method}.",
                })
            record_attrs["id"] = line_id

        record_body = {"attributes": record_attrs}

        if method == "POST":
            record_body["QuoteId"] = clean_id

        # Copy all other fields (Quantity, Discount, Product2Id, etc.)
        for k, v in op.items():
            if k.lower() not in ("method", "id", "type"):
                record_body[k] = v

        graph_records.append({"referenceId": f"opLine{idx}", "record": record_body})

    payload = {
        "pricingPref":      "System",
        "catalogRatesPref": "Skip",
        "configurationPref": {"configurationMethod": "Skip"},
        "taxPref":          "Skip",
        "graph": {
            "graphId": "manageLineItems",
            "records": graph_records,
        }
    }

    endpoint = f"{instance_url}/services/data/v65.0/connect/rev/sales-transaction/actions/place"
    try:
        resp = requests.post(endpoint, headers=headers, json=payload, timeout=60)
    except Exception as exc:
        return json.dumps({"status": "error", "message": f"Request failed: {exc}"})

    if resp.status_code not in (200, 201):
        return json.dumps({
            "status":  "error",
            "message": f"Salesforce Graph API error ({resp.status_code}).",
            "details": resp.text,
        })

    return json.dumps({
        "status":              "success",
        "quote_id":            clean_id,
        "message":             f"{len(operations)} operation(s) applied to quote {clean_id}.",
        "salesforce_response": resp.json(),
    }, indent=2)




def search_products(search_term: str, region: str = None, page_size: int = 15) -> str:
    """
    Searches Salesforce products by name or keyword using direct SOQL on the Product2 object.
    Used internally by the parser tools (parse_transcript_to_requirements, parse_requirements_doc)
    and as a reliable fallback when search_catalog returns empty results.

    When to call: Use this whenever you need a simple keyword product lookup, or when
    called internally from parser tools. If multiple products are returned, present them
    to the user and ask which one to proceed with BEFORE creating a quote.

    Args:
        search_term: Product name or keyword to search for.
        region: Optional region/entity name to filter by Family, ProductCode, or Name.
        page_size: Maximum results to return. Default is 15.
    """
    headers, instance_url = get_salesforce_auth()

    terms = search_term.replace('"', '').replace("'", '').split()
    if not terms:
        terms = [search_term]

    conditions = [" AND ".join([f"Name LIKE '%{t}%'" for t in terms])]

    if region:
        conditions.append(
            f"(Family = '{region}' OR ProductCode LIKE '%{region}%' OR Name LIKE '%{region}%')"
        )

    final_conditions = " AND ".join(f"({c})" for c in conditions)

    query = f"""
    SELECT Id, Name, ProductCode, Family, IsActive
    FROM Product2
    WHERE {final_conditions}
    AND IsActive = true
    LIMIT {page_size}
    """

    from urllib.parse import quote as url_quote
    endpoint = f"{instance_url}/services/data/v65.0/query/?q={url_quote(query)}"

    try:
        response = requests.get(endpoint, headers=headers, timeout=30)
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Request Error: {str(e)}"})

    if response.status_code not in [200, 201]:
        return json.dumps({"status": "error", "message": f"Salesforce Error {response.status_code}: {response.text}"})

    data = response.json()
    results = []
    for item in data.get("records", []):
        results.append({
            "name": item.get("Name", "Unknown Name"),
            "id": item.get("Id", "Unknown ID"),
            "code": item.get("ProductCode", "No Code"),
            "category": item.get("Family", "General")
        })

    return json.dumps({
        "status": "success",
        "searchTerm": search_term,
        "count": len(results),
        "results": results,
        "instruction": (
            "If multiple products were found, present them to the user and ask which one "
            "they want to select. If only one was found, ask for confirmation before "
            "proceeding to pricing."
        )
    }, indent=2)


from pydantic import BaseModel, Field
from typing import List, Optional

class RequirementItem(BaseModel):
    product_name: str = Field(description="The exact name of the product or service needed.")
    quantity: int = Field(default=1, description="The quantity requested. Default to 1 if not specified.")
    discount: float = Field(default=0.0, description="The discount percentage requested, e.g. 10.0 for 10%. Default to 0.0.")

class RequirementsPayload(BaseModel):
    requirements: List[RequirementItem]


def _call_gemini_direct(
    prompt: str,
    mime_type: str = "application/json",
    temperature: float = 0.0,
    response_schema: any = None
) -> str:
    """
    Helper to make a Gemini API call using the official, pre-configured GenAI Client.
    Bypasses raw REST requests and manual credential refreshes to avoid Windows grandchild pipe deadlocks.
    """
    sys.stderr.write("[DEBUG] _call_gemini_direct: Calling Gemini via official Client...\n")
    try:
        client = _get_genai_client()
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type=mime_type,
                temperature=temperature,
                response_schema=response_schema,
            )
        )
        if response and response.text:
            sys.stderr.write("[DEBUG] _call_gemini_direct: Call succeeded.\n")
            return response.text.strip()
        else:
            raise ValueError("Empty response received from Gemini.")
    except Exception as e:
        sys.stderr.write(f"[DEBUG] _call_gemini_direct Error: {str(e)}\n")
        raise e


def parse_transcript_to_requirements(transcript_text: str) -> str:
    """
    Extracts product requirements and customer intent from a call transcript or meeting notes.
    """
    sys.stderr.write(f"\n[DEBUG] Parsing transcript ({len(transcript_text)} chars)...\n")
    
    # No slice limit; Gemini's 1-million token context window processes the entire text natively.

    prompt = (
        "Extract all product/service requirements from the following call transcript. "
        "For each item, identify its name, quantity, and discount.\n"
        "If the transcript mentions a general discount rule (for example, '12% discount on all consumables', "
        "'10% institutional discount has been applied to consumables', or similar), you MUST apply that discount percentage "
        "to all matching products in the list.\n"
        f"\n\nTranscript:\n{transcript_text}"
    )

    try:
        sys.stderr.write("[DEBUG] Calling Gemini directly for transcript parsing via Pydantic schema...\n")
        raw_text = _call_gemini_direct(prompt, response_schema=RequirementsPayload)
        data = json.loads(raw_text)
        requirements = data.get("requirements", [])
        sys.stderr.write(f"[DEBUG] LLM extraction complete: {len(requirements)} items.\n")
    except Exception as e:
        sys.stderr.write(f"[DEBUG] LLM extraction error: {str(e)}\n")
        requirements = []
        
    return json.dumps(requirements, indent=2)


def parse_requirements_doc(document_content: str) -> str:
    """
    Extracts requirements from RFP/SOW documents and maps them to the catalog.
    """
    sys.stderr.write(f"\n[DEBUG] parse_requirements_doc: Processing {len(document_content)} characters...\n")

    prompt = (
        "Extract all product/service requirements from the following document. "
        "For each item, identify its exact product name, quantity, and discount.\n"
        "If the document mentions a general discount rule (for example, 'A 12% institutional discount has been applied to consumables', "
        "'10% discount on all consumables', or similar), you MUST apply that discount percentage to all matching products in the list.\n"
        "IMPORTANT: Do NOT extract table headers, index columns, serial numbers, or row numbers (such as 'S.No', '1', '2', etc.) as product names. "
        "The product name must be the actual name of the product or service being requested."
        f"\n\nDocument:\n{document_content}"
    )

    try:
        sys.stderr.write("[DEBUG] Calling Gemini directly for document parsing via Pydantic schema...\n")
        raw = _call_gemini_direct(prompt, response_schema=RequirementsPayload)
        data = json.loads(raw)
        all_requirements = data.get("requirements", [])
        sys.stderr.write(f"[DEBUG] Gemini extracted {len(all_requirements)} items.\n")
    except Exception as e:
        sys.stderr.write(f"[DEBUG] Gemini extraction error: {str(e)}\n")
        return json.dumps({"status": "error", "message": f"Error analyzing document: {str(e)}"})

    # Deduplicate
    unique_reqs = {}
    for r in all_requirements:
        name = r.get("product_name", "").strip()
        if name and name.lower() not in unique_reqs:
            unique_reqs[name.lower()] = {
                "product_name": name,
                "quantity": r.get("quantity", 1),
                "discount": r.get("discount", 0.0)
            }

    transformed = list(unique_reqs.values())
    sys.stderr.write(f"[DEBUG] Extraction complete. Total unique requirements: {len(transformed)}\n")

    return json.dumps(transformed, indent=2)
   

def _search_product_direct(prod_name: str, page_size: int = 5) -> list:
    """
    Internal helper — searches Salesforce Product2 via SOQL directly (no MCP overhead).
    Returns a list of product dicts (name, id, code, category).
    Must NOT be decorated with @mcp.tool().
    """
    try:
        headers, instance_url = get_salesforce_auth()
        terms = [t for t in prod_name.replace('"', '').replace("'", "").split() if len(t) > 2]
        if not terms:
            terms = [prod_name]
        # Escape single quotes for SOQL safety
        safe_terms = [t.replace("'", "\\'") for t in terms[:3]]
        
        from urllib.parse import quote as url_quote
        
        # Try STRICT search first (AND)
        where_clause = " AND ".join([f"Name LIKE '%{t}%'" for t in safe_terms])
        query = (
            f"SELECT Id, Name, ProductCode, Family FROM Product2 "
            f"WHERE ({where_clause}) AND IsActive = true LIMIT {page_size}"
        )
        sys.stderr.write(f"[DEBUG] _search_product_direct: Querying '{prod_name}' (STRICT) -> {query}\n")
        
        resp = requests.get(
            f"{instance_url}/services/data/v65.0/query/?q={url_quote(query)}",
            headers=headers,
            timeout=20,
        )
        
        recs = []
        if resp.status_code == 200:
            recs = resp.json().get("records", [])
            
        # Fallback to LOOSE search (OR) if strict yields no results and we have multiple terms
        if not recs and len(safe_terms) > 1:
            where_clause_loose = " OR ".join([f"Name LIKE '%{t}%'" for t in safe_terms])
            query_loose = (
                f"SELECT Id, Name, ProductCode, Family FROM Product2 "
                f"WHERE ({where_clause_loose}) AND IsActive = true LIMIT 500"
            )
            sys.stderr.write(f"[DEBUG] _search_product_direct: Fallback Querying '{prod_name}' (LOOSE) -> {query_loose}\n")
            resp_loose = requests.get(
                f"{instance_url}/services/data/v65.0/query/?q={url_quote(query_loose)}",
                headers=headers,
                timeout=20,
            )
            if resp_loose.status_code == 200:
                recs = resp_loose.json().get("records", [])

        # Final Fallback: if even loose search failed (total typo like 'Stndard Usr'), fetch active catalog to fuzzy match locally
        if not recs:
            query_all = "SELECT Id, Name, ProductCode, Family FROM Product2 WHERE IsActive = true LIMIT 150"
            sys.stderr.write(f"[DEBUG] _search_product_direct: Complete Fallback (TYPO RESOLUTION) -> {query_all}\n")
            resp_all = requests.get(
                f"{instance_url}/services/data/v65.0/query/?q={url_quote(query_all)}",
                headers=headers,
                timeout=20,
            )
            if resp_all.status_code == 200:
                recs = resp_all.json().get("records", [])

        sys.stderr.write(f"[DEBUG] _search_product_direct: Found {len(recs)} matches for '{prod_name}'\n")
        return [
            {"name": r.get("Name", ""), "id": r.get("Id", ""), "code": r.get("ProductCode", ""), "category": r.get("Family", "General")}
            for r in recs
        ]
    except Exception as e:
        sys.stderr.write(f"[DEBUG] _search_product_direct exception for '{prod_name}': {str(e)}\n")
        return []


def map_requirements_to_catalog(requirements: list) -> str:
    """
    Maps a list of extracted product requirements to actual Salesforce catalog products.
    Each requirement must have a 'product_name' key and optionally a 'quantity' key.

    When to call: After manually extracting requirements when you already have a list
    of product names to search for. For automatic document/transcript analysis,
    use parse_requirements_doc or parse_transcript_to_requirements instead.

    Args:
        requirements: List of dicts with 'product_name' and optional 'quantity'.
                      Example: [{"product_name": "Laptop", "quantity": 2}]
    """
    if not isinstance(requirements, list):
        return json.dumps({"status": "error", "message": "requirements must be a list."})
    return _map_requirements_to_catalog(requirements)


def _is_valid_product_name(name: str) -> bool:
    name_clean = name.strip()
    if not name_clean:
        return False
    
    # Check if name is purely numeric or only symbols/digits/dashes/periods
    if re.match(r"^[\d\s\-\.\*•#]+$", name_clean):
        return False
        
    name_lower = name_clean.lower()
    
    # Common table index/header columns
    ignored_patterns = {
        "s.no", "sno", "s no", "serial no", "serial number", 
        "sr.no", "sr no", "index", "no.", "s. no.", "s.no."
    }
    if name_lower in ignored_patterns:
        return False
        
    # If the name is extremely short (e.g. less than 2 characters) and is not a letter/digit combination
    if len(name_clean) < 2:
        return False
        
    return True


def _get_similarity_score(str1: str, str2: str) -> float:
    # Character bigrams
    def get_bigrams(s):
        s = re.sub(r'[^a-z0-9]', '', s.lower())
        return set(s[i:i+2] for i in range(len(s)-1))
        
    s1_bi = get_bigrams(str1)
    s2_bi = get_bigrams(str2)
    
    if not s1_bi or not s2_bi:
        return 0.0
        
    intersection = len(s1_bi.intersection(s2_bi))
    union = len(s1_bi.union(s2_bi))
    bigram_score = intersection / union if union > 0 else 0.0
    
    # Token overlap
    def get_tokens(s):
        return set(w for w in re.split(r'[^a-zA-Z0-9]', s.lower()) if len(w) > 1)
        
    s1_tok = get_tokens(str1)
    s2_tok = get_tokens(str2)
    
    stopwords = {
        "the", "and", "for", "with", "this", "that", "you", "your", "from", 
        "includes", "quotation", "presented", "based", "client", "laboratory", 
        "requirements", "discussion", "representative", "sales", "meeting", "minutes"
    }
    s1_tok_clean = s1_tok - stopwords
    s2_tok_clean = s2_tok - stopwords
    
    if not s1_tok_clean:
        s1_tok_clean = s1_tok
    if not s2_tok_clean:
        s2_tok_clean = s2_tok
        
    if not s1_tok_clean or not s2_tok_clean:
        token_score = 0.0
    else:
        # Overlap score: size of intersection of tokens divided by size of str1 tokens
        matched_tokens = 0
        for t1 in s1_tok_clean:
            matched = False
            for t2 in s2_tok_clean:
                if t1 == t2 or (len(t1) > 3 and t1 in t2) or (len(t2) > 3 and t2 in t1):
                    matched = True
                    break
            if matched:
                matched_tokens += 1
        token_score = matched_tokens / len(s1_tok_clean)
        
    # Standard SequenceMatcher ratio
    import difflib
    seq_score = difflib.SequenceMatcher(None, str1.lower(), str2.lower()).ratio()
    
    # Combined score weights
    return 0.5 * token_score + 0.3 * bigram_score + 0.2 * seq_score


def _map_requirements_to_catalog(requirements: list) -> str:
    """
    Internal implementation — shared by parse_requirements_doc, parse_transcript_to_requirements,
    and the public map_requirements_to_catalog tool.
    Uses _search_product_direct (plain function, no MCP) to avoid deadlocks.
    """
    ignored_names = {"product name", "product_name", "quantity", "discount", "price"}
    valid_reqs = []
    for r in requirements:
        if isinstance(r, dict) and r.get("product_name", "").strip():
            name = r.get("product_name", "").strip()
            if name.lower() not in ignored_names and _is_valid_product_name(name):
                valid_reqs.append(r)
        elif isinstance(r, str) and r.strip():
            name = r.strip()
            if name.lower() not in ignored_names and _is_valid_product_name(name):
                valid_reqs.append({"product_name": name})
    
    requirements = valid_reqs[:12]

    if not requirements:
        return json.dumps({"status": "empty", "message": "No valid product names to search."})

    sys.stderr.write(f"[DEBUG] _map_requirements_to_catalog: mapping {len(requirements)} items\n")

    all_catalog_products = []
    mapped_requirements = []
    seen_ids = set()

    def _search_one(req):
        name = req.get("product_name", "").strip()
        return req, _search_product_direct(name, page_size=5)

    # FIX: Run sequentially to prevent deadlocks in MCP execution
    results = [_search_one(req) for req in requirements]

    for req, products_found in results:
        req_name = req.get("product_name", "").strip()
        
        scored_products = []
        for p in products_found:
            p_name = p.get("name", "").strip()
            score = _get_similarity_score(req_name, p_name)
            scored_products.append((p, score))
            
        # Sort products by score descending
        scored_products.sort(key=lambda x: x[1], reverse=True)
        
        # Determine confidence and filter
        filtered_products = []
        confidence = "Low"
        
        # Filter scored products to only keep matches >= 0.45
        valid_scored = [item for item in scored_products if item[1] >= 0.45]
        
        if valid_scored:
            best_score = valid_scored[0][1]
            # Keep matches that are close to the best score
            filtered_products = [item[0] for item in valid_scored if item[1] >= best_score - 0.12]
            if best_score >= 0.75:
                confidence = "High" if len(filtered_products) == 1 else "Medium"
            else:
                confidence = "Medium" if best_score >= 0.6 else "Low"

        mapped_requirements.append({
            "extracted_need": req,
            "mapped_catalog_products": filtered_products,
            "confidence": confidence,
        })
        for p in filtered_products:
            if p["id"] not in seen_ids:
                all_catalog_products.append(p)
                seen_ids.add(p["id"])

    sys.stderr.write(f"[DEBUG] Mapping complete — {len(all_catalog_products)} unique products found\n")

    status = "success" if all_catalog_products else "empty"
    return json.dumps({
        "status": status,
        "message": f"Mapped {len(requirements)} requirements to {len(all_catalog_products)} catalog products.",
        "requirements": mapped_requirements,
        "results": all_catalog_products,
        "count": len(all_catalog_products),
        "next_steps": (
            "Present the mapped products to the user and ask them to confirm which ones to quote."
            if all_catalog_products else
            "No catalog matches found. Ask the user to describe the products differently or search manually."
        ),
    }, indent=2)

agent_type = os.environ.get("MCP_AGENT_TYPE", "all")

if agent_type in ["scout", "all"]:
    mcp.add_tool(search_catalog)
    mcp.add_tool(get_searchable_custom_fields)
    mcp.add_tool(get_picklist_values)
    mcp.add_tool(check_field_values)
    mcp.add_tool(map_requirements_to_catalog)

if agent_type in ["architect", "all"]:
    mcp.add_tool(resolve_pricebook_entries)
    mcp.add_tool(get_my_accounts)
    mcp.add_tool(get_opportunities_for_account)
    mcp.add_tool(evaluate_quote_graph)

if agent_type in ["updator", "all"]:
    mcp.add_tool(get_quote_preview)
    mcp.add_tool(get_quote_line_items)
    mcp.add_tool(manage_quote_line_items)
    mcp.add_tool(get_my_accounts)
    mcp.add_tool(get_opportunities_for_account)
    mcp.add_tool(resolve_pricebook_entries)

if agent_type in ["parser", "all"]:
    mcp.add_tool(parse_requirements_doc)
    mcp.add_tool(parse_transcript_to_requirements)

if agent_type in ["analyst", "all"]:
    mcp.add_tool(get_deal_history)
    mcp.add_tool(calculate_win_rate_analysis)
    mcp.add_tool(get_my_accounts)

if agent_type in ["twin", "all"]:
    mcp.add_tool(get_thermofisher_account_context)
    mcp.add_tool(research_twin_candidates)
    mcp.add_tool(build_twin_hunter_cards)
    mcp.add_tool(get_my_accounts)

if __name__ == "__main__":
    # Start the standard MCP stdio server
    mcp.run()
