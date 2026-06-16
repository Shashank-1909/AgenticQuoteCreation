"""
app/services/twin_hunter_service.py
=====================================
Twin Hunter business logic — the I/O layer.

Responsibilities:
  - Salesforce account/opportunity loading (generic, no ThermoFisher filter)
  - Tavily web research
  - Python-owned scoring, matching, classification, card construction
    (delegated to twin_matching.py)
  - Deal history enrichment (batched SOQL)
  - Upsell logic
  - Optional Gemini narrative enhancement (summary, reasons, key_highlights)
  - Minimal in-process analysis state per-request

Imports ONLY from:
  - stdlib
  - third-party packages (requests, google-auth, dotenv)
  - app.services.twin_matching (pure Python sibling)

Does NOT import from server.py — no circular dependency.
get_salesforce_auth logic is replicated locally (~12 lines, reads auth.json).
This is intentional: _salesforce_query and _describe_fields were exclusively
used by Twin Hunter functions; they move here with their local auth reader.
"""

from __future__ import annotations

import json
import logging
import os
import subprocess
import sys
import uuid
from difflib import SequenceMatcher

import requests

from app.services.twin_matching import (
    _normalise_name,
    _match_tavily_to_accounts,
    _classify_candidate,
    _score_candidate,
    _build_card,
    _extract_terms,
)

from app.core.config import (
    TWIN_ACCOUNT_LIMIT,
    TWIN_OPP_CHUNK_SIZE,
    TWIN_OPP_MAX_RECORDS,
    TWIN_QUOTE_MAX_RECORDS,
    TWIN_CONTEXT_OPP_LIMIT,
    TWIN_CONTEXT_NOT_FOUND_LIMIT,
    TWIN_ICP_TOP_ACCOUNTS,
    TWIN_ANCHOR_ACCOUNTS,
    TWIN_MAX_CARDS_DEFAULT,
    TWIN_MAX_EXISTING_CARDS,
    TWIN_MAX_UPSELL_RECS,
    TWIN_MAX_DEAL_HISTORY,
    TWIN_MAX_TOP_PRODUCTS,
    TWIN_TAVILY_MIN_RESULTS,
    TWIN_TAVILY_MAX_RESULTS,

    TWIN_SF_TIMEOUT,
    TWIN_SF_DESCRIBE_TIMEOUT,
    TWIN_TAVILY_TIMEOUT,
    TWIN_GEMINI_TIMEOUT,
    TWIN_GEMINI_HTTP_TIMEOUT,
    TWIN_MATCH_FUZZY_ACCT,
    TWIN_CLOSED_WON_STAGES,
    TWIN_CLOSED_LOST_STAGES,
    TWIN_SF_API_VERSION,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Operational constants
# ---------------------------------------------------------------------------

# (Limits and stages moved to app.core.config)

# ---------------------------------------------------------------------------
# In-process analysis state (ephemeral, not a cache)
# Keys:   analysis_id (str)
# Values: {"context": ..., "research": ...}
# Lifecycle: written by get_twin_account_context; read by
#            research_twin_candidates and build_twin_cards;
#            evicted by build_twin_cards after the result is built.
# ---------------------------------------------------------------------------
_TWIN_ANALYSIS_STATE: dict[str, dict] = {}

# ---------------------------------------------------------------------------
# Salesforce auth — local reader (reads same auth.json as server.py)
# Twin Hunter-only auth cache; independent from server.py's _AUTH_CACHE.
# ---------------------------------------------------------------------------
_TH_AUTH_CACHE: tuple | None = None


def _get_sf_auth() -> tuple[dict, str]:
    """
    Reads auth.json and returns (headers, instance_url).
    Caches the result in _TH_AUTH_CACHE for the subprocess lifetime.
    Mirrors get_salesforce_auth() in server.py without importing it.
    """
    global _TH_AUTH_CACHE
    if _TH_AUTH_CACHE:
        return _TH_AUTH_CACHE

    token_file = "auth.json"
    if not os.path.exists(token_file):
        raise RuntimeError(
            "auth.json not found. Run auth.py first to authenticate with Salesforce."
        )
    with open(token_file, "r") as fh:
        auth_data = json.load(fh)

    headers = {
        "Authorization": f"Bearer {auth_data['access_token']}",
        "Content-Type": "application/json",
    }
    _TH_AUTH_CACHE = (headers, auth_data["instance_url"])
    return _TH_AUTH_CACHE


# ---------------------------------------------------------------------------
# Shared Salesforce helpers (exclusively Twin Hunter — no other callers)
# ---------------------------------------------------------------------------

_SF_FIELD_CACHE: dict[str, dict] = {}


def _salesforce_query(
    query: str,
    api_version: str = TWIN_SF_API_VERSION,
    max_records: int = 2000,
) -> list[dict]:
    """Executes a paginated SOQL query and returns up to max_records records."""
    headers, instance_url = _get_sf_auth()
    endpoint = f"{instance_url}/services/data/{api_version}/query"
    records: list[dict] = []
    first_page = True

    while endpoint and len(records) < max_records:
        if first_page:
            resp = requests.get(endpoint, headers=headers, params={"q": query}, timeout=TWIN_SF_TIMEOUT)
            first_page = False
        else:
            resp = requests.get(endpoint, headers=headers, timeout=TWIN_SF_TIMEOUT)
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
    """Calls Salesforce describe endpoint and caches field metadata."""
    if object_api_name in _SF_FIELD_CACHE:
        return _SF_FIELD_CACHE[object_api_name]
    try:
        headers, instance_url = _get_sf_auth()
        resp = requests.get(
            f"{instance_url}/services/data/{TWIN_SF_API_VERSION}/sobjects/{object_api_name}/describe",
            headers=headers,
            timeout=TWIN_SF_DESCRIBE_TIMEOUT,
        )
        if resp.status_code != 200:
            _SF_FIELD_CACHE[object_api_name] = {}
            return {}
        fields = {
            field.get("name"): field
            for field in resp.json().get("fields", [])
            if field.get("name")
        }
        _SF_FIELD_CACHE[object_api_name] = fields
        return fields
    except Exception:
        _SF_FIELD_CACHE[object_api_name] = {}
        return {}


def _available_fields(object_api_name: str, candidates: list[str]) -> list[str]:
    """Filters candidate field names against the described fields of an object."""
    fields = _describe_fields(object_api_name)
    if not fields:
        return candidates
    return [field for field in candidates if field in fields]


# ---------------------------------------------------------------------------
# Formatting helpers
# ---------------------------------------------------------------------------

def _json_dumps(payload: dict) -> str:
    return json.dumps(payload, indent=2, default=str)


def _sf_escape(value: str) -> str:
    return str(value or "").replace("\\", "\\\\").replace("'", "\\'")


from typing import Any

def _amount(value: Any) -> float:
    try:
        return float(value or 0)
    except (TypeError, ValueError):
        return 0.0


def _money(value: Any) -> str:
    amount = _amount(value)
    if amount <= 0:
        return "-"
    return f"${amount:,.0f}"


# Sizing and market bands functions removed to keep database and metrics clean


# ---------------------------------------------------------------------------
# Text / term helpers
# ---------------------------------------------------------------------------



def _top_keywords(records: list[dict], fields: list[str], limit: int = 12) -> list[str]:
    counts: dict[str, int] = {}
    for record in records:
        text = " ".join(str(record.get(field) or "") for field in fields)
        for term in _extract_terms(text):
            counts[term] = counts.get(term, 0) + 1
    return [
        term
        for term, _cnt in sorted(counts.items(), key=lambda item: (-item[1], item[0]))[:limit]
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
    seen: set[str] = set()
    terms: list[str] = []
    for value in values:
        cleaned = " ".join(str(value or "").split()).strip(" ,.-")
        key = _normalise_name(cleaned)
        if cleaned and key and key not in seen:
            seen.add(key)
            terms.append(cleaned)
        if len(terms) >= limit:
            break
    return terms


# ---------------------------------------------------------------------------
# Account term building
# ---------------------------------------------------------------------------

def _build_account_terms(account: dict) -> list[str]:
    description_keywords = _top_keywords(
        [{"Description": account.get("description", ""), "Industry": account.get("industry", "")}],
        ["Description", "Industry"],
        limit=10,
    )
    return _compact_terms(
        [
            account.get("industry"),
            account.get("type"),
            account.get("billing_city"),
            *description_keywords,
        ],
        limit=12,
    )


# ---------------------------------------------------------------------------
# Salesforce account/opportunity loading
# ---------------------------------------------------------------------------

def _load_accounts() -> tuple[list[dict], list[str]]:
    """
    Loads Salesforce accounts up to TWIN_ACCOUNT_LIMIT, ordered by LastModifiedDate DESC.

    No ThermoFisher category filter — generic loader.
    Returns (accounts, limitations) where limitations is a list of warning strings.
    """
    fields = _available_fields(
        "Account",
        ["Id", "Name", "Website", "Industry", "Description",
         "Type", "AnnualRevenue", "NumberOfEmployees", "BillingCity"],
    )
    for required in ("Id", "Name"):
        if required not in fields:
            fields.insert(0, required)

    query = (
        f"SELECT {', '.join(fields)} FROM Account "
        f"ORDER BY LastModifiedDate DESC "
        f"LIMIT {TWIN_ACCOUNT_LIMIT}"
    )
    records = _salesforce_query(query)

    accounts = []
    for rec in records:
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
        })

    limitations: list[str] = []
    if len(records) >= TWIN_ACCOUNT_LIMIT:
        limitations.append(
            f"Account context is limited to the {TWIN_ACCOUNT_LIMIT} most recently "
            f"modified Salesforce accounts. Adjust TWIN_ACCOUNT_LIMIT if more coverage is needed."
        )

    return accounts, limitations


def _load_opportunities(account_ids: list[str]) -> list[dict]:
    """Queries Opportunities for the given account IDs in chunks of 80."""
    if not account_ids:
        return []
    fields = _available_fields(
        "Opportunity",
        ["Id", "Name", "StageName", "Amount", "CloseDate", "AccountId"],
    )
    for required in ("Id", "Name", "AccountId"):
        if required not in fields:
            fields.append(required)

    all_opps: list[dict] = []
    for idx in range(0, len(account_ids), TWIN_OPP_CHUNK_SIZE):
        chunk = account_ids[idx: idx + TWIN_OPP_CHUNK_SIZE]
        ids = ", ".join(f"'{_sf_escape(aid)}'" for aid in chunk if aid)
        if not ids:
            continue
        query = (
            f"SELECT {', '.join(fields)} FROM Opportunity "
            f"WHERE AccountId IN ({ids}) "
            f"ORDER BY LastModifiedDate DESC LIMIT {TWIN_OPP_MAX_RECORDS}"
        )
        all_opps.extend(_salesforce_query(query, max_records=TWIN_OPP_MAX_RECORDS))

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


def _attach_account_opportunities(
    accounts: list[dict], opportunities: list[dict]
) -> list[dict]:
    """Enriches account dicts with won/open/total opportunity stats."""
    by_account: dict[str, list[dict]] = {}
    for opp in opportunities:
        by_account.setdefault(opp.get("account_id"), []).append(opp)

    enriched = []
    for account in accounts:
        account_opps = by_account.get(account.get("id"), [])
        won = [
            opp for opp in account_opps
            if (opp.get("stage") or "").lower() in TWIN_CLOSED_WON_STAGES
        ]
        open_opps = [
            opp for opp in account_opps
            if "closed" not in (opp.get("stage") or "").lower()
        ]
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
    """Builds an ICP profile dict from top ranked accounts and opportunities."""
    ranked_accounts = sorted(accounts, key=_account_rank_score, reverse=True)
    opportunity_keywords = _top_keywords(
        [{"Name": opp.get("name", ""), "StageName": opp.get("stage", "")} for opp in opportunities],
        ["Name", "StageName"],
        limit=10,
    )
    
    # Calculate average size metrics from top accounts
    top_accts = ranked_accounts[:5]
    valid_revenues = [float(a.get("annual_revenue") or 0) for a in top_accts if a.get("annual_revenue")]
    valid_employees = [int(a.get("employees") or 0) for a in top_accts if a.get("employees")]
    
    avg_revenue = sum(valid_revenues) / len(valid_revenues) if valid_revenues else 0.0
    avg_employees = sum(valid_employees) / len(valid_employees) if valid_employees else 0

    # Extract Product Keywords from QuoteLineItems for top accounts
    top_acct_ids = [a.get("id") for a in top_accts if a.get("id")]
    deal_info = _fetch_accounts_deal_info_batch(top_acct_ids)
    product_keywords = set()
    for _, top_products in deal_info.values():
        for p in top_products:
            product_keywords.add(p)

    return {
        "method": "Top accounts ranked by Salesforce Account fields and Opportunity activity.",
        "top_accounts": top_accts,
        "top_industries": _ranked_values(accounts, "industry"),
        "top_account_types": _ranked_values(accounts, "type"),
        "top_cities": _ranked_values(accounts, "billing_city"),
        "description_keywords": _top_keywords(
            [{"Description": acct.get("description", ""), "Industry": acct.get("industry", "")}
             for acct in accounts],
            ["Description", "Industry"],
            limit=12,
        ),
        "opportunity_keywords": opportunity_keywords,
        "product_keywords": list(product_keywords),
        "target_revenue_float": avg_revenue,
        "average_revenue": _money(avg_revenue),
        "average_workforce": f"{avg_employees:,} employees" if avg_employees else "Unknown",
        "confidence_basis": [
            f"{len(accounts)} Salesforce Account record(s) were available.",
            f"{len(opportunities)} Opportunity record(s) were compared.",
            "Recommendations use only populated Salesforce fields plus Tavily web evidence.",
        ],
    }


def _best_account_match(accounts: list[dict], target_account_name: str) -> dict | None:
    """Fuzzy-matches a target name against a list of account dicts."""
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
        if needle in _normalise_name(acct.get("name"))
        or _normalise_name(acct.get("name")) in needle
    ]
    if contains:
        return contains[0]
    try:
        scored = [
            (SequenceMatcher(None, needle, _normalise_name(acct.get("name"))).ratio(), acct)
            for acct in accounts
        ]
        scored.sort(key=lambda item: item[0], reverse=True)
        if scored and scored[0][0] >= TWIN_MATCH_FUZZY_ACCT:
            return scored[0][1]
    except Exception:
        pass
    return None


# ---------------------------------------------------------------------------
# Deal history enrichment — batched SOQL (fixes DEF-002)
# ---------------------------------------------------------------------------

def _fetch_accounts_deal_info_batch(
    account_ids: list[str],
) -> dict[str, tuple[dict, list[str]]]:
    """
    Fetches Quote + QuoteLineItem data for all given account IDs in a single SOQL.
    Returns dict[account_id -> (deal_summary, top_products)].

    Replaces the N+1 pattern of the original _fetch_account_deal_info.
    """
    if not account_ids:
        return {}

    ids_literal = ", ".join(f"'{_sf_escape(aid)}'" for aid in account_ids if aid)
    if not ids_literal:
        return {}

    query = (
        f"SELECT Id, Name, Status, GrandTotal, Discount, QuoteNumber, "
        f"CreatedDate, AccountId, Opportunity.Name, "
        f"(SELECT Id, Product2.Name, Quantity, UnitPrice, TotalPrice, Discount "
        f"FROM QuoteLineItems) "
        f"FROM Quote WHERE AccountId IN ({ids_literal}) "
        f"ORDER BY CreatedDate DESC LIMIT {TWIN_QUOTE_MAX_RECORDS}"
    )

    try:
        quotes = _salesforce_query(query)
    except Exception as exc:
        logger.warning("batch deal info query failed: %s", exc)
        return {}

    # Group by AccountId
    by_account: dict[str, list[dict]] = {}
    for q in quotes:
        aid = q.get("AccountId", "")
        by_account.setdefault(aid, []).append(q)

    result: dict[str, tuple[dict, list[str]]] = {}
    for account_id in account_ids:
        account_quotes = by_account.get(account_id, [])
        deal_history: list[str] = []
        product_counts: dict[str, int] = {}
        status_counts: dict[str, int] = {}
        total_discount = 0.0
        discount_count = 0

        for q in account_quotes:
            q_num = q.get("QuoteNumber") or q.get("Name") or "Quote"
            opp_name = "Direct Opportunity"
            if q.get("Opportunity") and q.get("Opportunity", {}).get("Name"):
                opp_name = q["Opportunity"]["Name"]

            status = q.get("Status") or "Draft"
            status_counts[status] = status_counts.get(status, 0) + 1

            total = q.get("GrandTotal") or 0
            total_str = f"${total:,.0f}" if total else "—"
            deal_history.append(f"{q_num} ({opp_name}) — {status} [{total_str}]")

            disc = q.get("Discount")
            if disc is not None:
                total_discount += float(disc)
                discount_count += 1

            q_lis = (
                q.get("QuoteLineItems", {}).get("records", [])
                if q.get("QuoteLineItems") else []
            )
            for li in q_lis:
                if li.get("Product2") and li.get("Product2", {}).get("Name"):
                    p_name = li["Product2"]["Name"]
                    product_counts[p_name] = product_counts.get(p_name, 0) + 1

        top_products = [
            p for p, _ in sorted(product_counts.items(), key=lambda x: x[1], reverse=True)
        ][:TWIN_MAX_TOP_PRODUCTS]

        avg_disc = (total_discount / discount_count) if discount_count > 0 else 0.0
        if 0.0 < avg_disc < 1.0:
            avg_disc *= 100
        avg_discount_str = f"{avg_disc:.1f}%" if avg_disc > 0 else "0%"

        # Count won/lost using TWIN_CLOSED_WON_STAGES
        won_count = sum(
            count for status, count in status_counts.items()
            if status.lower() in TWIN_CLOSED_WON_STAGES
        )
        lost_count = sum(
            count for status, count in status_counts.items()
            if status.lower() in TWIN_CLOSED_LOST_STAGES
        )

        deal_summary = {
            "total_quotes": len(account_quotes),
            "status_counts": status_counts,
            "won_count": won_count,
            "lost_count": lost_count,
            "avg_discount": avg_discount_str,
            "raw_deals": deal_history[:TWIN_MAX_DEAL_HISTORY],
        }
        result[account_id] = (deal_summary, top_products)

    return result


# ---------------------------------------------------------------------------
# Upsell generation
# ---------------------------------------------------------------------------

def _generate_natural_upsell(product_name: str, anchor_name: str, idx: int) -> str:
    templates = [
        f"Suggest {product_name} as it is commonly added by peer accounts like {anchor_name} to complement their primary setup.",
        f"Pitch {product_name} – this represents a high-potential cross-sell opportunity, matching the configuration of {anchor_name}.",
        f"Introduce {product_name} to optimize their performance, matching the upgrade path of peer profile {anchor_name}.",
        f"Recommend {product_name} to align their configuration with the setup deployed at {anchor_name}.",
    ]
    return templates[idx % len(templates)]


# ---------------------------------------------------------------------------
# Gemini narrative enhancement (optional)
# ---------------------------------------------------------------------------

def _gemini_available() -> bool:
    """Returns True only if Vertex AI environment is configured."""
    return bool(
        os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
        and os.getenv("GOOGLE_CLOUD_LOCATION", "").strip()
    )


def _call_gemini_narrative(cards: list[dict], anchor_accounts: list[dict]) -> tuple[list[dict], str]:
    """
    Calls the Gemini subprocess worker (twin_ai_cards_worker.py) with a minimal
    narrative-only prompt. On success, merges Gemini's summary/reasons/key_highlights
    into the Python-constructed cards. Python-owned fields are never overwritten.

    On any failure (subprocess error, timeout, parse error): returns cards unchanged.
    """
    if not cards:
        return cards, ""

    worker_path = os.path.join(
        os.path.dirname(__file__), "..", "..", "app", "tools", "twin_ai_cards_worker.py"
    )
    worker_path = os.path.normpath(worker_path)

    anchor_desc = ", ".join(
        f"{acct.get('name', '')} ({acct.get('industry', 'unknown industry')})"
        for acct in anchor_accounts[:TWIN_ANCHOR_ACCOUNTS]
    )

    # Minimal prompt: only ask for narrative fields, not card selection or scoring
    card_summaries = [
        {
            "company_name": c.get("company_name"),
            "type": c.get("type"),
            "snippet": c.get("_tavily_snippet") or "",
            "url": c.get("source_urls", [""])[0] if c.get("source_urls") else "",
        }
        for c in cards
    ]

    prompt = f"""You are enhancing pre-selected lookalike cards for a sales team.
The following {len(cards)} cards have already been selected and scored by Python.
Your job is to extract metadata and write narrative text for each card based strictly on the provided company name and snippet.

Anchor accounts (Salesforce): {anchor_desc}

Cards to enhance:
{json.dumps(card_summaries, indent=2)}

For each card, extract and write:
- clean_company_name: The official, short brand name of this company, stripped of any taglines, generic industry words, or SEO text (e.g. "AstraZeneca" instead of "AstraZeneca plc - Pharma News").
- location: The headquarters city and state/country of this company (e.g. "Boston, MA" or "Berlin, Germany"). Extract strictly from the snippet or name. If not mentioned or unclear, return "Unknown". Do NOT hallucinate.
- revenue: The estimated annual revenue of this company (e.g. "$50M est." or "$1.2B est."). Extract strictly from the snippet. If not mentioned or unclear, return "Unknown". Do NOT hallucinate.
- summary: 1 concise sentence describing what this company does and why it is a lookalike
- reasons: array of exactly 2 short sentences explaining commercial synergy with the anchor profile
- key_highlights: array of exactly 2 short objective public facts about this company

Return strict JSON only:
{{
  "overall_summary": "one sentence summarizing the full set of findings",
  "cards": [
    {{
      "company_name": "...",
      "clean_company_name": "...",
      "location": "...",
      "revenue": "...",
      "summary": "...",
      "reasons": ["...", "..."],
      "key_highlights": ["...", "..."]
    }}
  ]
}}"""

    model_name = os.getenv("TWIN_HUNTER_MODEL", os.getenv("TWIN_HUNTER_MODEL", "gemini-2.5-flash"))
    try:
        completed = subprocess.run(
            [sys.executable, worker_path],
            input=json.dumps({"prompt": prompt, "model_name": model_name, "http_timeout": TWIN_GEMINI_HTTP_TIMEOUT}),
            capture_output=True,
            text=True,
            timeout=TWIN_GEMINI_TIMEOUT,
            cwd=os.path.dirname(os.path.dirname(os.path.dirname(worker_path))),
        )
        worker_output = json.loads(completed.stdout or "{}")
        if not worker_output.get("ok"):
            logger.warning("Gemini worker returned error: %s", worker_output.get("error"))
            return cards, ""

        raw = worker_output.get("text", "")
        try:
            parsed = json.loads(raw)
        except json.JSONDecodeError:
            start = raw.find("{")
            end = raw.rfind("}")
            if start != -1 and end != -1 and end > start:
                try:
                    parsed = json.loads(raw[start:end+1])
                except Exception:
                    parsed = {}
            else:
                parsed = {}

        # Build a lookup by company_name
        narrative_by_name: dict[str, dict] = {}
        for nc in parsed.get("cards", []):
            name = _normalise_name(nc.get("company_name", ""))
            if name:
                narrative_by_name[name] = nc

        overall_summary = parsed.get("overall_summary", "")

        enhanced = []
        for card in cards:
            norm = _normalise_name(card.get("company_name", ""))
            nc = narrative_by_name.get(norm)
            if nc:
                card = dict(card)  # shallow copy — don't mutate the original
                if nc.get("summary"):
                    card["summary"] = nc["summary"]
                if nc.get("reasons") and isinstance(nc["reasons"], list):
                    card["reasons"] = nc["reasons"]
                if nc.get("key_highlights") and isinstance(nc["key_highlights"], list):
                    card["key_highlights"] = nc["key_highlights"]
                # Merge the extracted location and revenue if they are valid
                if nc.get("location") and nc["location"] != "Unknown":
                    card["location"] = nc["location"]
                if nc.get("revenue") and nc["revenue"] != "Unknown":
                    card["revenue"] = nc["revenue"]
                # Use Gemini's cleaned company name for Net New cards
                if nc.get("clean_company_name") and card.get("type") == "net_new":
                    card["company_name"] = nc["clean_company_name"]
            enhanced.append(card)

        return enhanced, overall_summary

    except Exception as exc:
        logger.warning("Gemini narrative enhancement failed (cards unchanged): %s", exc)
        return cards, ""


# ---------------------------------------------------------------------------
# MCP Tool 1: get_twin_account_context
# ---------------------------------------------------------------------------

def get_twin_account_context(target_account_name: str = "") -> str:
    """
    Fetches Salesforce Account and Opportunity context for Twin Hunter.

    Call this first for any lookalike, customer twin, ICP, or best-fit account request.
    Pass target_account_name only when the user names one Salesforce account to compare against.
    """
    analysis_id = f"twin_{uuid.uuid4().hex[:10]}"

    try:
        accounts, limitations = _load_accounts()
        opportunities = _load_opportunities(
            [acct.get("id") for acct in accounts if acct.get("id")]
        )
        accounts = _attach_account_opportunities(accounts, opportunities)
        target = _best_account_match(accounts, target_account_name)

        if target_account_name and not target:
            result = {
                "status": "not_found",
                "analysis_id": analysis_id,
                "message": f"Could not find '{target_account_name}' in the Salesforce account set.",
                "account_count": len(accounts),
                "opportunity_count": len(opportunities),
                "accounts": accounts[:TWIN_CONTEXT_NOT_FOUND_LIMIT],
                "limitations": limitations,
            }
            _TWIN_ANALYSIS_STATE[analysis_id] = {"context": result}
            return _json_dumps(result)

        icp_profile = _build_icp_profile(accounts, opportunities)
        anchor_accounts = [target] if target else icp_profile.get("top_accounts", [])[:TWIN_ICP_TOP_ACCOUNTS]

        result = {
            "status": "success",
            "analysis_id": analysis_id,
            "mode": "single_account" if target else "icp_profile",
            "target_account": target,
            "anchor_accounts": anchor_accounts,
            "accounts": accounts,
            "account_count": len(accounts),
            "opportunities": opportunities[:TWIN_CONTEXT_OPP_LIMIT],
            "opportunity_count": len(opportunities),
            "icp_profile": icp_profile,
            "signals_available": [
                "Account.Name", "Account.Website", "Account.Industry",
                "Account.Description", "Account.Type", "Account.AnnualRevenue",
                "Account.NumberOfEmployees", "Account.BillingCity",
                "Opportunity.Name", "Opportunity.StageName", "Opportunity.Amount",
            ],
            "limitations": limitations,
        }
        _TWIN_ANALYSIS_STATE[analysis_id] = {"context": result}
        logger.info(
            "[Twin Hunter] context loaded: analysis_id=%s mode=%s accounts=%d opps=%d",
            analysis_id, result["mode"], len(accounts), len(opportunities),
        )
        # Create a lightweight copy for the LLM agent, removing raw database dumps
        agent_result = dict(result)
        agent_result.pop("accounts", None)
        agent_result.pop("opportunities", None)
        return _json_dumps(agent_result)

    except Exception as exc:
        result = {
            "status": "error",
            "analysis_id": analysis_id,
            "message": f"Could not load Salesforce context: {exc}",
            "cards": [],
        }
        _TWIN_ANALYSIS_STATE[analysis_id] = {"context": result}
        logger.error("[Twin Hunter] context load failed: %s", exc)
        return _json_dumps(result)


# ---------------------------------------------------------------------------
# MCP Tool 2: research_twin_candidates
# ---------------------------------------------------------------------------

def research_twin_candidates(analysis_id: str, max_results: int = 12) -> str:
    """
    Uses Tavily to find company-specific public evidence for Twin Hunter candidates.
    Call this after get_twin_account_context, passing the returned analysis_id.
    """
    analysis_id_str = str(analysis_id or "").strip()
    cache_entry = _TWIN_ANALYSIS_STATE.get(analysis_id_str)

    # No fallback-to-latest — unknown analysis_id is a hard error
    if not cache_entry or "context" not in cache_entry:
        return _json_dumps({
            "status": "error",
            "analysis_id": analysis_id,
            "message": (
                "Unknown analysis_id. Call get_twin_account_context first "
                "and pass the returned analysis_id."
            ),
            "results": [],
        })

    context = cache_entry["context"]
    tavily_key = os.getenv("TAVILY_API_KEY", "").strip()

    if not tavily_key:
        research = {
            "status": "needs_api_key",
            "analysis_id": analysis_id,
            "message": "TAVILY_API_KEY is not set. Add it to .env to enable web research.",
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
    
    product_kws = icp.get("product_keywords", [])
    prod_str = " ".join(product_kws[:3]) if product_kws else ""

    # Revenue tier keyword for query focus
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



    sf_accounts = context.get("accounts", [])
    
    # Extract domains and names from known Salesforce accounts to exclude them from web search
    exclude_domains = set()
    exclude_names = []
    for acct in sf_accounts:
        name = acct.get("name")
        website = acct.get("website")
        if website:
            try:
                from urllib.parse import urlparse
                parsed = urlparse(website if website.startswith("http") else f"https://{website}")
                domain = parsed.netloc.lower().replace("www.", "")
                if domain:
                    exclude_domains.add(domain)
            except Exception:
                pass
        if name:
            core = name.split("|")[0].split("-")[0].split(",")[0].strip()
            if " " not in core and len(core) >= 4:
                exclude_names.append(core)
                
    # Deduplicate and take top 10 to keep query clean
    exclude_names = list(dict.fromkeys(exclude_names))[:10]
    exclude_str = " ".join(f"-{name}" for name in exclude_names)

    # Highly targeted query: avoids words like 'competitor', 'alternatives' that pull listicles
    query = f"{' '.join(terms)} company official company website {prod_str} {exclude_str}".strip()

    headers = {
        "Authorization": f"Bearer {tavily_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "query": query.strip(),
        "search_depth": "advanced",
        "max_results": max(TWIN_TAVILY_MIN_RESULTS, min(int(max_results or 12), TWIN_TAVILY_MAX_RESULTS)),
        "include_answer": True,
        "include_raw_content": True,
        "exclude_domains": list(exclude_domains)[:50]
    }

    try:
        resp = requests.post(
            "https://api.tavily.com/search", headers=headers, json=payload, timeout=TWIN_TAVILY_TIMEOUT
        )
        if resp.status_code != 200:
            research = {
                "status": "error",
                "analysis_id": analysis_id,
                "message": f"Tavily API error ({resp.status_code}): {resp.text[:300]}",
                "results": [],
            }
            cache_entry["research"] = research
            return _json_dumps(research)

        body = resp.json()
        results = [
            {
                "title": item.get("title") or "",
                "url": item.get("url") or "",
                "content": item.get("content") or "",
                "raw_content": (item.get("raw_content") or "")[:5000],
                "score": item.get("score"),
            }
            for item in body.get("results", [])
        ]

        research = {
            "status": "success",
            "analysis_id": analysis_id,
            "query": query,
            "answer": str(body.get("answer") or "")[:800],
            "results": results,
            "message": f"Retrieved {len(results)} results from Tavily.",
        }
        cache_entry["research"] = research
        logger.info("[Twin Hunter] Tavily research complete: %d results", len(results))
        # Create a lightweight copy for the LLM agent, removing raw HTML content
        agent_research = dict(research)
        agent_research["results"] = [
            {k: v for k, v in res.items() if k != "raw_content"}
            for res in results
        ]
        return _json_dumps(agent_research)

    except Exception as exc:
        research = {
            "status": "error",
            "analysis_id": analysis_id,
            "message": f"Tavily search failed: {exc}",
            "results": [],
        }
        cache_entry["research"] = research
        return _json_dumps(research)


# ---------------------------------------------------------------------------
# MCP Tool 3: build_twin_cards
# ---------------------------------------------------------------------------

def build_twin_cards(analysis_id: str, max_cards: int = TWIN_MAX_CARDS_DEFAULT) -> str:
    """
    Builds Twin Hunter preview cards. Python owns all intelligence:
      matching, scoring, classification, card construction, deal enrichment, upsell.
    Gemini is called optionally for narrative enhancement only.

    Returns the full card payload compatible with LookalikeCards.jsx.
    """
    analysis_id_str = str(analysis_id or "").strip()
    cache_entry = _TWIN_ANALYSIS_STATE.get(analysis_id_str)

    if not cache_entry or "context" not in cache_entry:
        return _json_dumps({
            "status": "error",
            "analysis_id": analysis_id,
            "message": (
                "Unknown analysis_id. Call get_twin_account_context first "
                "and pass the returned analysis_id."
            ),
            "cards": [],
        })

    context = cache_entry.get("context", {})
    research = cache_entry.get("research", {})
    research_results = research.get("results") or []

    sf_accounts: list[dict] = context.get("accounts", [])
    anchor_accounts: list[dict] = context.get("anchor_accounts", [])
    icp_profile: dict = context.get("icp_profile", {})
    max_cards_int = min(int(max_cards or TWIN_MAX_CARDS_DEFAULT), TWIN_MAX_CARDS_DEFAULT)

    # ── Phase A: Handle no research results ──────────────────────────────
    # When Tavily has no results (no API key, or network failure), we can still
    # produce existing-account cards from Salesforce data alone.
    if not research_results:
        # Synthesise synthetic Tavily-like entries from top anchor accounts
        # so the Python pipeline still runs and produces existing cards.
        synthetic = [
            {
                "title": acct.get("name", ""),
                "url": acct.get("website", ""),
                "content": f"{acct.get('industry', '')} {acct.get('description', '')}",
                "raw_content": "",
                "score": None,
                "_synthetic": True,
            }
            for acct in anchor_accounts
            if acct.get("name")
        ]
        if not synthetic:
            return _json_dumps({
                "status": "empty",
                "analysis_id": analysis_id,
                "summary": "No research results available and no anchor accounts found.",
                "cards": [],
            })
        research_results = synthetic
    # ── Phase B: Internal Sourcing (Salesforce first) ────────────────────
    existing_built: list[dict] = []
    seen_names: set[str] = set()
    mode = context.get("mode", "single_account")
    anchor_ids = {a.get("id") for a in anchor_accounts if a.get("id")}

    scored_sf: list[tuple[int, list[dict], dict]] = []
    for sf_acct in sf_accounts:
        # Only skip the target account if we are searching for a specific company's lookalike.
        # If we are doing a global ICP search, do NOT skip, as the top accounts ARE the best existing matches.
        if mode == "single_account" and sf_acct.get("id") in anchor_ids:
            continue
            
        # Convert SF account into a candidate shape for scoring, passing revenue explicitly
        pseudo_result = {
            "title": sf_acct.get("name", ""),
            "url": sf_acct.get("website", ""),
            "content": f"{sf_acct.get('industry', '')} {sf_acct.get('type', '')} {sf_acct.get('description', '')}",
            "raw_content": "",
            "annual_revenue": sf_acct.get("annual_revenue") or 0.0,
        }
        # The new Overlap Coefficient math intrinsically handles sparse text fairly
        score, breakdown = _score_candidate(pseudo_result, anchor_accounts, icp_profile)
        
        # Removed pipeline multiplier: The UI fit score must exactly equal the sum of the rubrics
        scored_sf.append((score, breakdown, sf_acct))

    # Sort SF accounts by score
    scored_sf.sort(key=lambda x: x[0], reverse=True)

    for score, breakdown, sf_acct in scored_sf:
        # Over-fetch top 15 candidates so Phase F can sort by deal history then trim to limit
        if len(existing_built) >= 15:
            break

        company_name_norm = _normalise_name(sf_acct.get("name", ""))
        if not company_name_norm or company_name_norm in seen_names:
            continue
        seen_names.add(company_name_norm)

        pseudo_result = {
            "title": sf_acct.get("name", ""),
            "url": sf_acct.get("website", ""),
            "content": f"{sf_acct.get('industry', '')} {sf_acct.get('description', '')}",
        }
        card = _build_card(pseudo_result, "existing", score, breakdown, sf_acct, anchor_accounts)
        
        # Explicitly map Salesforce revenue to the card so it displays in the UI
        annual_rev = sf_acct.get("annual_revenue")
        if annual_rev:
            card["revenue"] = _money(annual_rev)
            
        existing_built.append(card)

    # ── Phase C: External Padding (Tavily net_new) ───────────────────────
    net_new_built: list[dict] = []
    
    # We still run match map to avoid creating net_new cards for SF accounts we just processed
    match_map = _match_tavily_to_accounts(research_results, sf_accounts)
    
    scored_tavily: list[tuple[int, list[dict], dict]] = []

    for idx, result in enumerate(research_results):
        matched_account = match_map.get(idx)
        card_type = _classify_candidate(matched_account)
        if card_type == "existing":
            continue # We already mined SF accounts internally
        title_str = str(result.get("title", ""))
        url_str = str(result.get("url", ""))

        # 1. Clean the company name first: strip SEO taglines
        clean_name = title_str.split("|")[0].split(" - ")[0].strip()
        result["title"] = clean_name

        # 2. Hard block obvious listicles (check against clean_name to avoid blocking genuine sites with SEO taglines)
        clean_lower = clean_name.lower()
        is_listicle = any(w in clean_lower for w in {"top", "list", "best", "fastest", "startups", "overview", "guide"})
        if is_listicle:
            continue

        # 3. Organic Domain-Match Heuristic — filters out 3rd-party articles
        from urllib.parse import urlparse
        try:
            parsed = urlparse(url_str if url_str.startswith("http") else f"https://{url_str}")
            parts = parsed.netloc.lower().replace("www.", "").split(".")
            if len(parts) > 2 and parts[-2] in ["co", "com", "org", "net", "edu", "gov", "ac", "go"]:
                domain = parts[-3]
            else:
                domain = parts[-2] if len(parts) >= 2 else parts[0]
        except Exception:
            domain = ""

        if not domain or len(domain) < 3:
            continue

        # Two-way check: Fuzzy Domain Validation or Domain in Title
        title_no_space = clean_lower.replace(" ", "").replace("-", "")
        # Fuzzy matcher on domain vs core title
        from difflib import SequenceMatcher
        fuzzy_ratio = SequenceMatcher(None, domain, title_no_space).ratio()
        
        domain_in_title = domain in title_no_space
        title_root_in_domain = any(len(w) >= 4 and w in domain for w in clean_lower.split())

        if not (fuzzy_ratio >= 0.65 or domain_in_title or title_root_in_domain):
            continue  # It's a 3rd-party article, not a company page

        # Extra guard: reject known news/media/aggregator domain patterns
        # A genuine company domain is a specific proper noun, not a generic compound word
        generic_domain_fragments = {
            "pharma", "biotech", "health", "med", "life", "science", "news",
            "media", "blog", "forum", "hub", "market", "report", "info", "wire",
            "review", "magazine", "insights", "marketwatch"
        }
        if domain in generic_domain_fragments or any(bad in domain for bad in {"news", "media", "blog", "forum", "review", "magazine", "report", "insights", "marketwatch"}):
            continue

        score, breakdown = _score_candidate(result, anchor_accounts, icp_profile)
        scored_tavily.append((score, breakdown, result))

    scored_tavily.sort(key=lambda item: item[0], reverse=True)
    
    # Phase 9: Domain Diversity Control
    # Keep only the highest scoring candidate per root domain
    from urllib.parse import urlparse
    seen_domains = set()
    diverse_tavily = []
    for t_score, t_breakdown, t_res in scored_tavily:
        try:
            t_url = t_res.get("url", "")
            parsed = urlparse(t_url if t_url.startswith("http") else f"https://{t_url}")
            parts = parsed.netloc.lower().replace("www.", "").split(".")
            if len(parts) > 2 and parts[-2] in ["co", "com", "org", "net", "edu", "gov", "ac", "go"]:
                root_domain = ".".join(parts[-3:])
            else:
                root_domain = ".".join(parts[-2:])
            if root_domain in seen_domains:
                continue
            seen_domains.add(root_domain)
        except Exception:
            pass
        diverse_tavily.append((t_score, t_breakdown, t_res))

    net_new_built: list[dict] = []
    from app.core.config import TWIN_MAX_NET_NEW_CARDS
    for t_score, t_breakdown, t_res in diverse_tavily[:TWIN_MAX_NET_NEW_CARDS]:
        card = _build_card(t_res, "net_new", t_score, t_breakdown, None, anchor_accounts)
        net_new_built.append(card)

    all_cards = existing_built + net_new_built

    # ── Phase E: Batched deal enrichment (existing cards only) ───────────
    # Only iterate existing_built — net_new cards never need Salesforce deal data
    existing_account_ids: list[str] = []
    anchor_account_ids: list[str] = []

    for card in existing_built:
        matched_sf = next(
            (acct for acct in sf_accounts
             if _normalise_name(acct.get("name", "")) == _normalise_name(card["company_name"])),
            None,
        )
        if matched_sf and matched_sf.get("id"):
            existing_account_ids.append(matched_sf["id"])
            card["_sf_account_id"] = matched_sf["id"]

    for acct in anchor_accounts:
        if acct.get("id") and acct["id"] not in existing_account_ids:
            anchor_account_ids.append(acct["id"])

    all_ids_to_fetch = list(dict.fromkeys(existing_account_ids + anchor_account_ids))
    deal_info_map = _fetch_accounts_deal_info_batch(all_ids_to_fetch)

    # ── Phase F: Enrich existing cards + upsell logic ────────────────────
    enriched_existing: list[dict] = []
    enriched_net_new: list[dict] = net_new_built  # already capped at 2

    for card in existing_built:
        card.pop("_sf_account_id", None)  # clean temp field
        sf_account_id = next(
            (sf["id"] for sf in sf_accounts
             if _normalise_name(sf.get("name", "")) == _normalise_name(card["company_name"])
             and sf.get("id")),
            None,
        )
        if sf_account_id and sf_account_id in deal_info_map:
            deal_summary, mostly_bought = deal_info_map[sf_account_id]

            card["deal_history"] = deal_summary.get("raw_deals", [])
            card["deal_summary"] = deal_summary
            card["mostly_purchased_products"] = mostly_bought
            card["_has_deals"] = deal_summary.get("total_quotes", 0) > 0

            # Upsell: products anchor bought that this account didn't
            anchor_products: list[str] = []
            if anchor_accounts:
                anchor_id = anchor_accounts[0].get("id")
                if anchor_id and anchor_id in deal_info_map:
                    _, anchor_products = deal_info_map[anchor_id]

            my_prods_set = {p.lower() for p in mostly_bought}
            recommendations = [p for p in anchor_products if p.lower() not in my_prods_set]

            if recommendations:
                anchor_name = anchor_accounts[0].get("name", "top anchor") if anchor_accounts else "top anchor"
                card["upsell_opportunities"] = [
                    _generate_natural_upsell(prod, anchor_name, i)
                    for i, prod in enumerate(recommendations[:TWIN_MAX_UPSELL_RECS])
                ]
            else:
                anchor_name = anchor_accounts[0].get("name", "top accounts") if anchor_accounts else "top accounts"
                card["upsell_opportunities"] = [
                    f"Upsell advanced solutions to align with the configuration "
                    f"of peer account {anchor_name}."
                ]
        else:
            # No deal data found — keep as existing (DO NOT downgrade to net_new)
            card["_has_deals"] = False

        enriched_existing.append(card)

    # Sort existing cards: accounts WITH deal history first, then by match score
    enriched_existing.sort(
        key=lambda c: (c.get("_has_deals", False), c.get("match_score", 0)),
        reverse=True,
    )
    for card in enriched_existing:
        card.pop("_has_deals", None)

    # Hard trim to exactly TWIN_MAX_EXISTING_CARDS — this is the final card count gate
    enriched_existing = enriched_existing[:TWIN_MAX_EXISTING_CARDS]

    # Final assembly: existing first, net new second — strictly separated, never mixed
    final_cards: list[dict] = enriched_existing + enriched_net_new

    # ── Phase G: Optional Gemini narrative enhancement ────────────────────
    overall_summary = f"Found {len(final_cards)} lookalike matches for your account profile."
    if _gemini_available():
        try:
            enhanced_result = _call_gemini_narrative(final_cards, anchor_accounts)
            final_cards, gemini_summary = enhanced_result
            if gemini_summary:
                overall_summary = gemini_summary
        except Exception as exc:
            logger.warning("[Twin Hunter] Gemini narrative step skipped: %s", exc)
    else:
        logger.info("[Twin Hunter] Gemini not configured; using Python fallback narrative.")

    # Clean up temporary fields before returning
    for card in final_cards:
        card.pop("_tavily_snippet", None)

    result = {
        "status": "success",
        "analysis_id": analysis_id,
        "summary": overall_summary,
        "source_account": context.get("target_account"),
        "anchor_accounts": anchor_accounts,
        "cards": final_cards,
        "limitations": context.get("limitations", []),
    }

    # Evict state after cards are built (ephemeral, not a cache)
    _TWIN_ANALYSIS_STATE.pop(analysis_id_str, None)
    logger.info(
        "[Twin Hunter] build_twin_cards complete: %d cards (analysis_id=%s evicted)",
        len(final_cards), analysis_id_str,
    )

    return _json_dumps(result)
