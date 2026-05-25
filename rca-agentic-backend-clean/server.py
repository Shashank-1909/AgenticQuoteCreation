import os
import sys
import json
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
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv
from google import genai
from google.genai import types
from concurrent.futures import ThreadPoolExecutor

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

def evaluate_quote_graph(line_items: list[dict], pricebook_id: str, opportunity_id: str = "") -> str:
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
                        If not provided, the quote will be created without an Opportunity link.
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
        for rec in salesforce_resp.get("records", []):
            if rec.get("referenceId") == "refQuote":
                quote_id = rec.get("record", {}).get("id", "")
                break
                
        if quote_id:
            from urllib.parse import quote
            query = f"SELECT QuoteNumber FROM Quote WHERE Id = '{quote_id}'"
            q_url = f"{instance_url}/services/data/v66.0/query/?q={quote(query)}"
            q_res = requests.get(q_url, headers=headers)
            if q_res.status_code == 200:
                q_data = q_res.json()
                if q_data.get("records"):
                    quote_number = q_data["records"][0].get("QuoteNumber", "Unknown")
    except Exception as e:
        print(f"[DEBUG] Error fetching QuoteNumber: {str(e)}")

    return json.dumps({
        "status": "success",
        "message": "Salesforce successfully validated the Quote Graph!",
        "opportunity_id": clean_opp_id or "not linked",
        "quote_id": quote_id,
        "quote_number": quote_number,
        "salesforce_response": salesforce_resp
    }, indent=2)
def get_quote_preview(quote_id: str) -> str:
    """
    Fetches detailed preview data for a specific Salesforce Quote, 
    including its Account, Opportunity, and Quote Line Items.

    Args:
        quote_id: The 18-character Salesforce Quote ID (starts with '0Q0').
    """
    print(f"[DEBUG] get_quote_preview called for {quote_id}")
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


def get_quote_line_items(quote_id: str) -> str:
    """
    Fetches all line items for a specific Salesforce Quote, including each
    line item's exact 18-character QuoteLineItem ID required for updates.

    WHEN TO CALL: This is the MANDATORY first step before any quote modification.
    Always call this before manage_quote_line_items — you cannot update or delete
    a line item without its exact QuoteLineItem ID (starts with '0Z4').

    Args:
        quote_id: The 18-character Salesforce Quote ID (starts with '0Q0').
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
        quote_id:   18-character Salesforce Quote ID (starts with '0Q0').
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
    
    # Slice if too long to prevent LLM hang
    if len(transcript_text) > 15000:
        transcript_text = transcript_text[:15000] + "... [truncated]"

    prompt = (
        "Extract all product/service requirements from the following call transcript. "
        "For each item, identify its name, quantity, and discount (if mentioned)."
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
        "For each item, identify its exact product name, quantity, and discount (if specified)."
        f"\n\nDocument:\n{document_content[:20000]}"
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
            if name.lower() not in ignored_names:
                valid_reqs.append(r)
        elif isinstance(r, str) and r.strip():
            name = r.strip()
            if name.lower() not in ignored_names:
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
            
            # Exact lowercase match
            if p_name.lower() == req_name.lower():
                score = 1.0
            else:
                import difflib
                req_words = req_name.lower().split()
                p_words = p_name.lower().split()
                
                # Token-level fuzzy match (resolves length-mismatched typos like 'Qest 3' vs 'Meta Quest 3')
                word_scores = []
                for rw in req_words:
                    best_word_score = 0
                    for pw in p_words:
                        if rw in pw or pw in rw:
                            best_word_score = max(best_word_score, min(len(rw), len(pw)) / max(len(rw), len(pw)))
                        else:
                            best_word_score = max(best_word_score, difflib.SequenceMatcher(None, rw, pw).ratio())
                    word_scores.append(best_word_score)
                
                token_score = sum(word_scores) / len(req_words) if req_words else 0
                fuzzy_score = difflib.SequenceMatcher(None, req_name.lower(), p_name.lower()).ratio()
                
                # Take the highest of the full string match vs the token average
                score = max(token_score, fuzzy_score)
                
            scored_products.append((p, score))
            
        # Sort products by score descending
        scored_products.sort(key=lambda x: x[1], reverse=True)
        
        # Determine confidence and filter
        if scored_products:
            best_score = scored_products[0][1]
            if best_score >= 0.75:
                # Accurate match (including typos): filter out unrelated and HIGHLIGHT ONLY THAT
                filtered_products = [item[0] for item in scored_products if item[1] >= best_score - 0.1]
                confidence = "High" if len(filtered_products) == 1 else "Medium"
            else:
                # No accurate match: give keyword matches in the list, but DO NOT highlight (Low confidence)
                filtered_products = [item[0] for item in scored_products if item[1] > 0]
                confidence = "Low"
        else:
            filtered_products = []
            confidence = "Low"

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
    mcp.add_tool(get_quote_preview)

if agent_type in ["updator", "all"]:
    mcp.add_tool(get_quote_preview)
    mcp.add_tool(get_quote_line_items)
    mcp.add_tool(manage_quote_line_items)
    mcp.add_tool(get_my_accounts)
    mcp.add_tool(get_opportunities_for_account)

if agent_type in ["parser", "all"]:
    mcp.add_tool(parse_requirements_doc)
    mcp.add_tool(parse_transcript_to_requirements)

if __name__ == "__main__":
    # Start the standard MCP stdio server
    mcp.run()