"""
cleanup_salesforce.py
=====================
Proactive cleanup script to resolve STORAGE_LIMIT_EXCEEDED errors in Salesforce Developer Orgs.
Queries and deletes old Quote and QuoteLineItem records to free up storage space.
"""

import sys
import os
import requests
import json

# Ensure we can import from server
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))
from server import get_salesforce_auth

def cleanup():
    print("Connecting to Salesforce...")
    try:
        headers, instance_url = get_salesforce_auth()
    except Exception as e:
        print(f"Failed to get Salesforce auth: {e}")
        return

    print(f"Connected to instance: {instance_url}")
    
    # 1. Query existing quotes
    query_url = f"{instance_url}/services/data/v60.0/query/?q=SELECT+Id,+Name+FROM+Quote+LIMIT+100"
    resp = requests.get(query_url, headers=headers)
    if resp.status_code != 200:
        print(f"Failed to query quotes: {resp.text}")
        return

    quotes = resp.json().get("records", [])
    print(f"Found {len(quotes)} quote records.")
    
    if not quotes:
        print("No quotes found to clean up.")
        return

    # Delete quotes (deleting parent Quote automatically cascade-deletes children QuoteLineItems!)
    success_count = 0
    for quote in quotes:
        quote_id = quote["Id"]
        quote_name = quote["Name"]
        print(f"Deleting Quote: {quote_name} ({quote_id})...")
        
        del_url = f"{instance_url}/services/data/v60.0/sobjects/Quote/{quote_id}"
        del_resp = requests.delete(del_url, headers=headers)
        if del_resp.status_code in (204, 200):
            success_count += 1
        else:
            print(f"  Failed to delete quote {quote_id}: {del_resp.text}")

    print(f"\nSuccessfully cleaned up {success_count} Quote records, freeing up storage space!")

if __name__ == "__main__":
    cleanup()
