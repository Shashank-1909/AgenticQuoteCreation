import json
import sys
import os

# Set up path to allow importing from the parent app
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

# Mock _search_product_direct to return standard mock database items
def mock_search_product_direct(prod_name: str, page_size: int = 5) -> list:
    db = [
        {"name": "Standard User", "id": "01t1", "code": "SU", "category": "General"},
        {"name": "Standard Laptop", "id": "01t2", "code": "SL", "category": "General"},
        {"name": "Standard Support", "id": "01t3", "code": "SS", "category": "General"},
        {"name": "Advanced User", "id": "01t4", "code": "AU", "category": "General"},
        {"name": "Observability", "id": "01t5", "code": "OBS", "category": "Software"},
        {"name": "Core Router", "id": "01t6", "code": "CR", "category": "Hardware"}
    ]
    
    # Simple search mimicking the SQL behaviour
    terms = [t.lower() for t in prod_name.split() if len(t) > 2]
    if not terms:
        terms = [prod_name.lower()]
    
    # STRICT match (AND)
    matches = []
    for item in db:
        if all(t in item["name"].lower() for t in terms):
            matches.append(item)
            
    # LOOSE match (OR) fallback
    if not matches and len(terms) > 1:
        for item in db:
            if any(t in item["name"].lower() for t in terms):
                matches.append(item)
                
    # Final Fallback (TYPO RESOLUTION): Return full catalog
    if not matches:
        matches = db.copy()
                
    return matches[:max(page_size, len(db))]

# Monkeypatch the direct search in server.py
import server
server._search_product_direct = mock_search_product_direct

def run_test():
    print("=== Testing Product Matching Refinement ===")
    
    # Test Case 1: Accurate Exact Match
    print("\n--- Test Case 1: Exact Match for 'Standard User' ---")
    reqs_1 = [{"product_name": "Standard User", "quantity": 10, "discount": 15}]
    res_1 = json.loads(server._map_requirements_to_catalog(reqs_1))
    
    print(f"Status: {res_1['status']}")
    print(f"Count of products returned: {res_1['count']}")
    
    req_item = res_1["requirements"][0]
    print(f"Extracted need: {req_item['extracted_need']}")
    print(f"Confidence score: {req_item['confidence']}")
    print("Mapped products:")
    for p in req_item["mapped_catalog_products"]:
        print(f"  - {p['name']} (ID: {p['id']})")
        
    assert req_item["confidence"] == "High", "Confidence should be High for exact match"
    assert len(req_item["mapped_catalog_products"]) == 1, "Should filter out unrelated matches when exact match exists"
    assert req_item["mapped_catalog_products"][0]["name"] == "Standard User", "Should match Standard User"

    # Test Case 2: Unstructured/Loose Match
    print("\n--- Test Case 2: Loose Match for 'US West Standard' ---")
    reqs_2 = [{"product_name": "US West Standard", "quantity": 1, "discount": 0}]
    res_2 = json.loads(server._map_requirements_to_catalog(reqs_2))
    
    print(f"Status: {res_2['status']}")
    print(f"Count of products returned: {res_2['count']}")
    
    req_item_2 = res_2["requirements"][0]
    print(f"Confidence score: {req_item_2['confidence']}")
    print("Mapped products:")
    for p in req_item_2["mapped_catalog_products"]:
        print(f"  - {p['name']} (ID: {p['id']})")
        
    assert req_item_2["confidence"] in ["Medium", "Low"], "Confidence should be Medium/Low for loose description match"
    assert len(req_item_2["mapped_catalog_products"]) > 1, "Should preserve all options when no clear accurate match is found"
    # Ensure they are sorted by similarity score (Standard Laptop/Support/User contain 'Standard' and have higher overlap than 'Advanced User' which doesn't contain 'Standard')
    first_p = req_item_2["mapped_catalog_products"][0]["name"]
    print(f"Highest ranking match: {first_p}")
    assert "Standard" in first_p, "The best matches should contain the word 'Standard'"

    # Test Case 3: Table Header Filtering
    print("\n--- Test Case 3: Table Header Filtering ---")
    reqs_3 = [
        {"product_name": "Product Name", "quantity": 1, "discount": 0},
        {"product_name": "Quantity", "quantity": 1, "discount": 0},
        {"product_name": "Standard User", "quantity": 3, "discount": 10}
    ]
    res_3 = json.loads(server._map_requirements_to_catalog(reqs_3))
    
    print(f"Status: {res_3['status']}")
    print(f"Count of products returned: {res_3['count']}")
    print("Mapped requirements:")
    for req in res_3["requirements"]:
        print(f"  - Name: {req['extracted_need']['product_name']}, Confidence: {req['confidence']}")
        
    assert res_3["count"] == 1, "Should filter out the two header rows and only map 'Standard User'"
    assert res_3["requirements"][0]["extracted_need"]["product_name"] == "Standard User", "Standard User should be the only mapped requirement"

    # Test Case 4: Typo / Fuzzy Matching
    print("\n--- Test Case 4: Typo / Fuzzy Matching ('Stndard Usr') ---")
    reqs_4 = [{"product_name": "Stndard Usr", "quantity": 1, "discount": 0}]
    res_4 = json.loads(server._map_requirements_to_catalog(reqs_4))
    
    print(f"Status: {res_4['status']}")
    print(f"Count of products returned: {res_4['count']}")
    
    req_item_4 = res_4["requirements"][0]
    print(f"Confidence score: {req_item_4['confidence']}")
    print("Mapped products:")
    for p in req_item_4["mapped_catalog_products"]:
        print(f"  - {p['name']} (ID: {p['id']})")
        
    assert req_item_4["confidence"] in ["High", "Medium"], "Confidence should be High or Medium for a typo"
    assert req_item_4["mapped_catalog_products"][0]["name"] == "Standard User", "Should match Standard User despite typo"

    # Test Case 5: Token-Level Mismatch Typo ('Qest 3' -> 'Meta Quest 3')
    print("\n--- Test Case 5: Token-Level Typo ('Qest 3') ---")
    # We must add Meta Quest 3 to the mock db first!
    server._search_product_direct.__defaults__ = (5,) # ignore
    
    # Just mock it by calling directly with a mock db that has 'Meta Quest 3'
    reqs_5 = [{"product_name": "Qest 3", "quantity": 1, "discount": 0}]
    
    # Override the mock temporarily
    original_mock = server._search_product_direct
    def mock_meta_search(*args, **kwargs):
        return [{"name": "Meta Quest 3", "id": "mq3", "code": "MQ3", "category": "Hardware"}, {"name": "Headset", "id": "h1", "code": "H1", "category": "Hardware"}]
    server._search_product_direct = mock_meta_search
    
    res_5 = json.loads(server._map_requirements_to_catalog(reqs_5))
    server._search_product_direct = original_mock
    
    req_item_5 = res_5["requirements"][0]
    print(f"Confidence score: {req_item_5['confidence']}")
    for p in req_item_5["mapped_catalog_products"]:
        print(f"  - {p['name']}")
    
    assert req_item_5["confidence"] in ["High", "Medium"], "Token-level typo should score highly!"
    assert req_item_5["mapped_catalog_products"][0]["name"] == "Meta Quest 3"

    print("\n[SUCCESS] ALL TESTS PASSED SUCCESSFULLY!")

if __name__ == "__main__":
    run_test()
