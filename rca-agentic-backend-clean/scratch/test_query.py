import os
import json
import requests

def get_salesforce_auth():
    token_file = "auth.json"
    with open(token_file, "r") as f:
        auth_data = json.load(f)
    headers = {
        "Authorization": f"Bearer {auth_data['access_token']}",
        "Content-Type": "application/json"
    }
    return headers, auth_data['instance_url']

def test_query():
    headers, instance_url = get_salesforce_auth()
    # Query for the specific product "API Access Premium" or just any product's SellingModelType
    query = "SELECT Id, Name, SellingModelType FROM Product2 LIMIT 5"
    from urllib.parse import quote
    endpoint = f"{instance_url}/services/data/v65.0/query/?q={quote(query)}"
    
    resp = requests.get(endpoint, headers=headers)
    print(f"Status: {resp.status_code}")
    print(f"Response: {resp.text}")

if __name__ == "__main__":
    test_query()
