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

def describe_qli():
    headers, instance_url = get_salesforce_auth()
    endpoint = f"{instance_url}/services/data/v65.0/sobjects/QuoteLineItem/describe"
    resp = requests.get(endpoint, headers=headers)
    if resp.status_code == 200:
        fields = [f['name'] for f in resp.json().get('fields', [])]
        print(f"Fields: {', '.join(fields)}")
    else:
        print(f"Error: {resp.text}")

if __name__ == "__main__":
    describe_qli()
