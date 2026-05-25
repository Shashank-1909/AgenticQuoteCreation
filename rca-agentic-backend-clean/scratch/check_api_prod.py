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

def check_api_product():
    headers, instance_url = get_salesforce_auth()
    query = "SELECT Id, Name FROM Product2 WHERE Name LIKE '%API Access Premium%'"
    from urllib.parse import quote
    endpoint = f"{instance_url}/services/data/v65.0/query/?q={quote(query)}"
    
    resp = requests.get(endpoint, headers=headers)
    if resp.status_code == 200:
        records = resp.json().get('records', [])
        for r in records:
            print(f"ID: {r['Id']}, Name: {r['Name']}")
            # Now query ProductSellingModel for this product
            psm_query = f"SELECT Product2Id, ProductSellingModel.Name, ProductSellingModel.SellingModelType FROM ProductSellingModelOption WHERE Product2Id = '{r['Id']}'"
            psm_endpoint = f"{instance_url}/services/data/v65.0/query/?q={quote(psm_query)}"
            psm_resp = requests.get(psm_endpoint, headers=headers)
            if psm_resp.status_code == 200:
                psm_records = psm_resp.json().get('records', [])
                for pr in psm_records:
                    model = pr.get('ProductSellingModel', {})
                    print(f"  Model: {model.get('Name')}, Type: {model.get('SellingModelType')}")
            else:
                print(f"  Error querying PSM: {psm_resp.text}")
    else:
        print(f"Error: {resp.text}")

if __name__ == "__main__":
    check_api_product()
