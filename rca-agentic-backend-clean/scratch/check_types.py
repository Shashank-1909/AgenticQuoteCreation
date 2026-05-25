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

def check_product_types():
    headers, instance_url = get_salesforce_auth()
    query = "SELECT Id, Name, Type FROM Product2 WHERE IsActive = true"
    from urllib.parse import quote
    endpoint = f"{instance_url}/services/data/v65.0/query/?q={quote(query)}"
    
    resp = requests.get(endpoint, headers=headers)
    if resp.status_code == 200:
        records = resp.json().get('records', [])
        for r in records:
            print(f"Name: {r['Name']}, Type: {r['Type']}")
    else:
        print(f"Error: {resp.text}")

if __name__ == "__main__":
    check_product_types()
