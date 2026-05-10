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

def test_subquery():
    headers, instance_url = get_salesforce_auth()
    # Query for products and their selling models
    query = """
    SELECT Id, Name, 
      (SELECT ProductSellingModel.SellingModelType 
       FROM ProductSellingModelOptions) 
    FROM Product2 
    WHERE IsActive = true 
    LIMIT 10
    """
    from urllib.parse import quote
    endpoint = f"{instance_url}/services/data/v65.0/query/?q={quote(query)}"
    
    resp = requests.get(endpoint, headers=headers)
    print(f"Status: {resp.status_code}")
    if resp.status_code == 200:
        data = resp.json()
        for r in data.get('records', []):
            models = r.get('ProductSellingModelOptions', {}).get('records', [])
            types = [m.get('ProductSellingModel', {}).get('SellingModelType') for m in models]
            print(f"Name: {r['Name']}, Types: {types}")
    else:
        print(f"Response: {resp.text}")

if __name__ == "__main__":
    test_subquery()
