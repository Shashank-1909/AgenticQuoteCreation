import json
import requests

def get_salesforce_auth():
    with open('auth.json', 'r') as f:
        auth_data = json.load(f)
    headers = {
        'Authorization': f"Bearer {auth_data['access_token']}",
        'Content-Type': 'application/json'
    }
    return headers, auth_data['instance_url']

headers, instance_url = get_salesforce_auth()

payload = {
    'pricingPref': 'Force',
    'catalogRatesPref': 'Skip',
    'configurationPref': {
        'configurationMethod': 'Skip',
        'configurationOptions': {
            'validateProductCatalog': True,
            'validateAmendRenewCancel': True,
            'executeConfigurationRules': True,
            'addDefaultConfiguration': True
        }
    },
    'taxPref': 'Skip',
    'graph': {
        'graphId': 'createQuote',
        'records': [
            {
                'referenceId': 'refQuote',
                'record': {
                    'attributes': {
                        'method': 'POST',
                        'type': 'Quote'
                    },
                    'Name': 'Agentic_Deal_Management_Quote',
                    'Pricebook2Id': '01sNS00000DiMi5YAF'
                }
            }
        ]
    }
}
res = requests.post(f'{instance_url}/services/data/v65.0/connect/rev/sales-transaction/actions/place', headers=headers, json=payload)
print("ZERO LINE ITEMS (Length 1):", res.status_code, res.text)
