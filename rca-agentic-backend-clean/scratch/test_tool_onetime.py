import os
import sys
import json
import requests

# Add current directory to path
sys.path.append(os.getcwd())

from server_v1 import resolve_pricebook_entries

def test_resolve_pricing():
    # ID for Apigee Edge Enterprise (OneTime)
    product_ids = ["01thg0000005puzAAA"]
    result = resolve_pricebook_entries(product_ids)
    print(result)

if __name__ == "__main__":
    test_resolve_pricing()
