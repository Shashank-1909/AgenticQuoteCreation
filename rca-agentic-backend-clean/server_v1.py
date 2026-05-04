import os
import json
import requests
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv

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

def get_salesforce_auth():
    """Helper function to load auth state written by auth.py"""
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
    return headers, auth_data['instance_url']

@mcp.tool()
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
        response = requests.post(endpoint, headers=headers, json=payload)
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

@mcp.tool()
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
        response = requests.get(endpoint, headers=headers)
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

@mcp.tool()
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
        response = requests.get(endpoint, headers=headers)
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

@mcp.tool()
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
            cfg_resp = requests.get(cfg_endpoint, headers=headers)
            valid_fields = set()
            if cfg_resp.status_code == 200:
                for config in cfg_resp.json().get("indexConfigurations", []):
                    name = config.get("name")
                    if name:
                        valid_fields.add(name)
            
            # Step 2: Query the UI API strictly for all Picklist values on Product2
            ui_endpoint = f"{instance_url}/services/data/v65.0/ui-api/object-info/Product2/picklist-values/012000000000000AAA"
            ui_resp = requests.get(ui_endpoint, headers=headers)
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


@mcp.tool()
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

    After calling: Use the returned PricebookEntryId and UnitPrice values to construct
                   the line items for the quote graph submission tool.
    """
    headers, instance_url = get_salesforce_auth()
    
    if not product_ids:
        import json
        return json.dumps({"status": "error", "message": "product_ids list cannot be empty."})
        
    formatted_ids = ",".join([f"'{pid}'" for pid in product_ids])
    query = f"SELECT Id, Pricebook2Id, Product2Id, UnitPrice FROM PricebookEntry WHERE Product2Id IN ({formatted_ids}) AND IsActive = true"
    
    from urllib.parse import quote
    endpoint = f"{instance_url}/services/data/v65.0/query/?q={quote(query)}"
    
    try:
        response = requests.get(endpoint, headers=headers)
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
            "UnitPrice": r.get("UnitPrice")
        })
        
    import json
    return json.dumps({
        "status": "success",
        "resolved_entries": results
    }, indent=2)

@mcp.tool()
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


@mcp.tool()
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


@mcp.tool()
def evaluate_quote_graph(line_items: list[dict], opportunity_id: str = "", pricebook_id: str = "01sNS00000DiMi5YAF") -> str:
    """
    Submits a Salesforce CPQ Quote Graph to create a draft quote with line items.

    When to call: Only after resolving pricebook entries for all products you want to quote
    AND only after the user has confirmed an Opportunity via the opportunity picklist.
    Never call this tool if any line item is missing its PricebookEntryId — the API will
    reject the request. If you get a validation error, read it carefully and fix the payload.

    Args:
        opportunity_id: The 18-character Salesforce Opportunity ID (starts with '006').
                        Extract this from the user's opportunity selection: '[Opp Name] (ID: 006xxx)'.
                        If not provided, the quote will be created without an Opportunity link.
        pricebook_id: The Salesforce Pricebook2 ID to associate with the quote.
                      Defaults to the standard pricebook if not specified.
        line_items: One dict per product, each containing:
                    - Product2Id (from search results)
                    - PricebookEntryId (from pricebook resolution tool)
                    - Quantity (default 1)
                    - UnitPrice (from pricebook resolution tool)
                    - StartDate / EndDate (optional, defaults applied automatically)

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

        record_item = {
            "attributes": {
                "type": "QuoteLineItem",
                "method": "POST"
            },
            "QuoteId": "@{refQuote.id}",
            "Product2Id": item["Product2Id"],
            "PricebookEntryId": item["PricebookEntryId"],
            "PeriodBoundary": "Anniversary",
            "BillingFrequency": "Annual",
            "Quantity": item.get("Quantity", 1),
            "UnitPrice": item.get("UnitPrice", 100),
            "StartDate": item.get("StartDate", "2025-01-01"),
            "EndDate": item.get("EndDate", "2026-01-01")
        }

        for k, v in item.items():
            if k not in ["Product2Id", "PricebookEntryId", "Quantity", "UnitPrice", "StartDate", "EndDate"]:
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
        response = requests.post(endpoint, headers=headers, json=payload)
    except Exception as e:
        return f"Request Error: {str(e)}"

    if response.status_code not in [200, 201]:
        return f"SALESFORCE VALIDATION ERROR - Analyze this payload rejection and retry:\nStatus Code: {response.status_code}\nResponse: {response.text}"

    return json.dumps({
        "status": "success",
        "message": "Salesforce successfully validated the Quote Graph!",
        "opportunity_id": clean_opp_id or "not linked",
        "salesforce_response": response.json()
    }, indent=2)

@mcp.tool()
def update_quote_discount(quote_id: str, discount: float) -> str:
    import requests as _requests
    import json as _json
    import time as _time
    from urllib.parse import quote as _url_quote

    headers, instance_url = get_salesforce_auth()

    if not quote_id or not quote_id.strip():
        return _json.dumps({"status": "error", "message": "quote_id is required."}, indent=2)

    if discount is None:
        return _json.dumps({"status": "error", "message": "discount is required."}, indent=2)

    try:
        discount_value = float(discount)
    except (TypeError, ValueError):
        return _json.dumps({"status": "error", "message": "discount must be a number."}, indent=2)

    if discount_value < 0 or discount_value > 100:
        return _json.dumps({"status": "error", "message": "discount must be between 0 and 100."}, indent=2)

    query = f"SELECT Id FROM QuoteLineItem WHERE QuoteId = '{quote_id}'"
    query_endpoint = f"{instance_url}/services/data/v65.0/query/?q={_url_quote(query)}"

    line_item_ids = []
    last_query_error = None
    for _ in range(4):
        try:
            query_res = _requests.get(query_endpoint, headers=headers, timeout=30)
        except Exception as exc:
            last_query_error = str(exc)
            _time.sleep(2)
            continue

        if query_res.status_code != 200:
            last_query_error = f"Salesforce query failed ({query_res.status_code}): {query_res.text}"
            _time.sleep(2)
            continue

        query_data = query_res.json()
        line_item_ids = [row.get("Id") for row in query_data.get("records", []) if row.get("Id")]
        if line_item_ids:
            break
        _time.sleep(2)

    if not line_item_ids:
        if last_query_error:
            return _json.dumps({"status": "error", "message": last_query_error}, indent=2)
        return _json.dumps({
            "status": "error",
            "message": f"No QuoteLineItem records found for quote_id '{quote_id}'."
        }, indent=2)

    graph_records = [
        {
            "referenceId": "refQuote",
            "record": {
                "attributes": {
                    "method": "PATCH",
                    "type": "Quote",
                    "id": quote_id
                }
            }
        }
    ]

    for idx, line_item_id in enumerate(line_item_ids, start=1):
        graph_records.append({
            "referenceId": f"updateLine{idx}",
            "record": {
                "attributes": {
                    "method": "PATCH",
                    "type": "QuoteLineItem",
                    "id": line_item_id
                },
                "Discount": discount_value
            }
        })

    payload = {
        "pricingPref": "System",
        "catalogRatesPref": "Skip",
        "configurationPref": {
            "configurationMethod": "Skip"
        },
        "taxPref": "Skip",
        "graph": {
            "graphId": "updateDiscountOnly",
            "records": graph_records
        }
    }

    endpoint = f"{instance_url}/services/data/v65.0/connect/rev/sales-transaction/actions/place"
    try:
        update_res = _requests.post(endpoint, headers=headers, json=payload, timeout=60)
    except Exception as exc:
        return _json.dumps({
            "status": "error",
            "message": "Failed to call Salesforce Graph API.",
            "details": str(exc)
        }, indent=2)

    if update_res.status_code not in [200, 201]:
        return _json.dumps({
            "status": "error",
            "message": f"Salesforce Graph API error ({update_res.status_code}).",
            "details": update_res.text
        }, indent=2)

    try:
        response_body = update_res.json()
    except Exception:
        response_body = {"raw_response": update_res.text}

    return _json.dumps({
        "status": "success",
        "quote_id": quote_id,
        "discount_applied": discount_value,
        "line_items_updated": len(line_item_ids),
        "salesforce_response": response_body
    }, indent=2)

@mcp.tool()
def get_quotes_for_opportunity(opportunity_id: str) -> str:
    """
    Fetches Salesforce quotes associated with a specific Opportunity ID.
    Call this tool after an opportunity has been selected to show available quotes.
    """
    import re
    match = re.search(r'(006[A-Za-z0-9]{15})', opportunity_id)
    clean_id = match.group(1) if match else opportunity_id.strip()

    headers, instance_url = get_salesforce_auth()
    import requests, json

    query = (
        f"SELECT Id, Name, Status, GrandTotal FROM Quote "
        f"WHERE OpportunityId = '{clean_id}' "
        f"ORDER BY LastModifiedDate DESC LIMIT 20"
    )
    resp = requests.get(
        f"{instance_url}/services/data/v59.0/query",
        headers=headers,
        params={"q": query}
    )
    if resp.status_code != 200:
        return json.dumps({"error": resp.text, "quotes": []})

    quotes = []
    for rec in resp.json().get("records", []):
        total = rec.get("GrandTotal")
        total_str = f"${total:,.2f}" if total is not None else "—"
        quotes.append({
            "id": rec["Id"],
            "name": rec["Name"],
            "status": rec.get("Status", ""),
            "total": total_str,
            "detail": f"{rec.get('Status', '')} | {total_str}"
        })

    return json.dumps({
        "action": "QUOTE_SELECTION",
        "quotes": quotes,
        "count": len(quotes),
        "message": f"Found {len(quotes)} quotes. Waiting for user selection."
    })

@mcp.tool()
def get_quote_details(quote_id: str) -> str:
    """
    Fetches the quote line items for a specific quote.
    Call this after a user has selected a quote to modify.
    """
    import re
    match = re.search(r'(0Q0[A-Za-z0-9]{15})', quote_id)
    clean_id = match.group(1) if match else quote_id.strip()

    headers, instance_url = get_salesforce_auth()
    import requests, json

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
        return json.dumps({"error": resp.text, "line_items": []})

    items = []
    for rec in resp.json().get("records", []):
        items.append({
            "Id": rec["Id"],
            "Product2Id": rec.get("Product2Id"),
            "ProductName": rec.get("Product2") and rec["Product2"].get("Name"),
            "Quantity": rec.get("Quantity"),
            "UnitPrice": rec.get("UnitPrice"),
            "Discount": rec.get("Discount"),
            "TotalPrice": rec.get("TotalPrice")
        })

    return json.dumps({
        "status": "success",
        "quote_id": clean_id,
        "line_items": items,
        "count": len(items)
    }, indent=2)

@mcp.tool()
def rename_quote(quote_id: str, new_name: str) -> str:
    """
    Renames a quote using REST PATCH.
    """
    import re
    match = re.search(r'(0Q0[A-Za-z0-9]{15})', quote_id)
    clean_id = match.group(1) if match else quote_id.strip()

    headers, instance_url = get_salesforce_auth()
    import requests, json
    endpoint = f"{instance_url}/services/data/v59.0/sobjects/Quote/{clean_id}"
    payload = {"Name": new_name}
    
    resp = requests.patch(endpoint, headers=headers, json=payload)
    if resp.status_code in [200, 204]:
        return json.dumps({"status": "success", "message": f"Quote renamed to '{new_name}'"})
    else:
        return json.dumps({"status": "error", "error": resp.text})

@mcp.tool()
def manage_quote_line_items(quote_id: str, operations: list[dict]) -> str:
    """
    Use Graph API for: add / update / delete line items.
    operations should be a list of dicts.
    Each dict must have 'method' (POST, PATCH, DELETE).
    If PATCH or DELETE, must have 'id' (QuoteLineItem Id).
    If POST, must have 'Product2Id', 'PricebookEntryId', 'Quantity', 'UnitPrice'.
    Optional properties like 'Discount' can be added for POST/PATCH.
    """
    import re
    match = re.search(r'(0Q0[A-Za-z0-9]{15})', quote_id)
    clean_id = match.group(1) if match else quote_id.strip()

    headers, instance_url = get_salesforce_auth()
    import requests, json

    graph_records = [
        {
            "referenceId": "refQuote",
            "record": {
                "attributes": {
                    "method": "PATCH",
                    "type": "Quote",
                    "id": clean_id
                }
            }
        }
    ]

    for idx, op in enumerate(operations):
        method = op.get("method", "PATCH").upper()
        record_attrs = {"method": method, "type": "QuoteLineItem"}
        
        if method in ["PATCH", "DELETE"]:
            line_id = op.get("id") or op.get("Id")
            if not line_id:
                return json.dumps({"status": "error", "message": f"Missing 'id' for {method} operation."})
            record_attrs["id"] = line_id
            
        record_item = {"attributes": record_attrs}
        
        if method == "POST":
            record_item["QuoteId"] = clean_id
            
        for k, v in op.items():
            if k.lower() not in ["method", "id", "type"]:
                record_item[k] = v
                
        graph_records.append({
            "referenceId": f"opLine{idx}",
            "record": record_item
        })

    payload = {
        "pricingPref": "System",
        "catalogRatesPref": "Skip",
        "configurationPref": {"configurationMethod": "Skip"},
        "taxPref": "Skip",
        "graph": {
            "graphId": "manageLineItems",
            "records": graph_records
        }
    }

    endpoint = f"{instance_url}/services/data/v65.0/connect/rev/sales-transaction/actions/place"
    resp = requests.post(endpoint, headers=headers, json=payload)
    
    if resp.status_code not in [200, 201]:
        return json.dumps({"status": "error", "error": resp.text})
        
    return json.dumps({
        "status": "success",
        "message": "Operations executed successfully",
        "salesforce_response": resp.json()
    }, indent=2)


if __name__ == "__main__":
    # Start the standard MCP stdio server
    mcp.run()
