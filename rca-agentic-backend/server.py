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
def search_rca_products(search_term: str, page_size: int = 15) -> str:
    """
    Searches the Salesforce Revenue Cloud product catalog by product name or keyword.

    When to call: Only after the token classification tool confirms the search strategy
    is 'name_search' or when the name_search_terms field is non-empty.
    Do NOT call this directly without first classifying the search tokens.

    Args:
        search_term: The product name or keyword returned by the classification tool's
                     'name_search_terms' field. Never invent this value yourself.
        page_size: Maximum results to return. Default is 15.

    After calling: Present the returned product names and codes to the user.
                   If the user wants a quote, proceed to resolve their pricebook entries.
    """
    headers, instance_url = get_salesforce_auth()
    
    # Using the exact endpoint referenced in the Angular application
    endpoint = f"{instance_url}/services/data/v65.0/connect/pcm/products?include=/products"
    
    # Building the payload matching rca-api.service.ts expectations
    payload = {
        "searchTerm": search_term,
        "pageSize": page_size,
        "offset": 0,
        "filter": {
            "criteria": [
                {"property": "isActive", "operator": "eq", "value": True}
            ]
        }
    }
    
    try:
        response = requests.post(endpoint, headers=headers, json=payload)
    except Exception as e:
        return f"Request Error: {str(e)}"
    
    if response.status_code not in [200, 201]:
        return f"Error: Salesforce API returned status code {response.status_code}\n{response.text}"
        
    data = response.json()
    
    # We parse the complex JSON response into a simple readable string for the LLM
    results = []
    
    # The RCA PCM endpoint usually returns products directly in a list or within a 'products' wrapper
    products = data.get("products", [])
    if not products and isinstance(data, list):
        products = data
    if not products and "result" in data:
        products = data.get("result", [])
    if not products and "items" in data:
        products = data.get("items", [])
    
    if not products:
        return f"No products found for search term: '{search_term}'\nRaw response snippet: {str(data)[:200]}"
    
    for item in products:
        # Handle properties depending on the exact PCM format
        name = item.get("name") or item.get("Name") or item.get("fields", {}).get("Name", "Unknown Name")
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
        "searchTerm": search_term,
        "count": len(results),
        "results": results
    }, indent=2)

@mcp.tool()
def search_products_by_filter(
        classification_id: str = "11BNS00000w2WSI2A2",
        filters: dict = None,
        page_size: int = 100
) -> str:
    """
    Searches the Salesforce product catalog using strict custom field attribute filters.

    When to call: Only after the token classification tool confirms the search strategy
    is 'attribute_search' and provides 'matched_filters' like {"Region__c": "West"}.
    Do NOT guess filter field names or values — use only what the classification tool returned.
    The classification_id is pre-configured. Do NOT ask the user for it.

    Args:
        classification_id: Salesforce ProductClassification ID. Pre-configured, do not change.
        filters: Dict of field-to-value mappings from the classification tool result,
                 e.g. {"Region__c": "North", "Storage__c": "128GB"}.
        page_size: Maximum results. Default 100.

    After calling: Present matched products to the user.
                   If the user wants a quote, proceed to resolve their pricebook entries.
    """
    headers, instance_url = get_salesforce_auth()
    
    endpoint = f"{instance_url}/services/data/v65.0/connect/pcm/products?productClassificationId={classification_id}&include=/products"
    
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
        return json.dumps({"status": "empty", "message": "No products matched your filters."})
    
    for item in products:
        name = item.get("name") or item.get("Name") or item.get("fields", {}).get("Name", "Unknown")
        prod_id = item.get("id") or item.get("Id") or item.get("productId", "Unknown ID")
        code = item.get("productCode") or item.get("ProductCode") or "No Code"
        
        results.append({
            "name": name,
            "id": prod_id,
            "code": code
        })
        
    import json
    return json.dumps({
        "status": "success",
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
    Classifies search tokens against live Salesforce custom field picklist values.
    This is the FIRST tool to call for any product search request, without exception.

    How to use:
      Take the user's raw query. Remove common stopwords (e.g. search, for, the, a,
      products, in, with, and, or, related, to, find, show, me, get, all, of, at, by,
      that, have, having, using). Pass everything that remains as the candidates list.

    The tool will:
      - Match each token against all known Salesforce field picklist values
      - Return matched tokens as ready-to-use attribute filters
      - Return unmatched tokens as the product name/keyword search term
      - Return an explicit 'instruction' field telling you exactly what to do next

    Always follow the instruction field in the response. Do not deviate.

    Args:
        candidates: List of meaningful tokens extracted from the user query.
                    Example: query="Manager Rule products in West" → ["Manager","Rule","West"]
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
    
    strategy = "attribute_search" if matched_filters else "name_search"
    
    return json.dumps({
        "matched_filters": matched_filters,
        "name_search_terms": name_terms,
        "search_strategy": strategy,
        "classification_id": "11BNS00000w2WSI2A2",
        "instruction": (
            "Call search_products_by_filter with the matched_filters above and the provided classification_id."
            if strategy == "attribute_search" else
            "Call search_rca_products with name_search_terms as the search_term."
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
def evaluate_quote_graph(line_items: list[dict], pricebook_id: str = "01sNS00000DiMi5YAF") -> str:
    """
    Submits a Salesforce CPQ Quote Graph to create a draft quote with line items.

    When to call: Only after resolving pricebook entries for all products you want to quote.
    Never call this tool if any line item is missing its PricebookEntryId — the API will
    reject the request. If you get a validation error, read it carefully and fix the payload.

    Args:
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
    headers, instance_url = get_salesforce_auth()
    
    records = [
        {
            "referenceId": "refQuote",
            "record": {
                "attributes": {
                    "method": "POST",
                    "type": "Quote"
                },
                "Name": "Agentic_Deal_Management_Quote",
                "Pricebook2Id": pricebook_id
            }
        }
    ]
    
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
        
        # Merge extra optional CPQ fields the AI might have brilliantly added (like PeriodBoundary)
        for k, v in item.items():
            if k not in ["Product2Id", "PricebookEntryId", "Quantity", "UnitPrice", "StartDate", "EndDate"]:
                record_item[k] = v
                
        records.append({
            "referenceId": f"refQuoteLine{i}",
            "record": record_item
        })

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
        
    # The magical Reflection Loop Bridge! Pass raw CPQ errors as clean text back to the LLM.
    if response.status_code not in [200, 201]:
        return f"SALESFORCE VALIDATION ERROR - Analyze this payload rejection and retry:\nStatus Code: {response.status_code}\nResponse: {response.text}"
        
    return json.dumps({
        "status": "success",
        "message": "Salesforce successfully validated the Quote Graph!",
        "salesforce_response": response.json()
    }, indent=2)

if __name__ == "__main__":
    # Start the standard MCP stdio server
    mcp.run()
