import os
import requests
from dotenv import load_dotenv
 
# Load credentials from .env — NEVER hardcode credentials in source code.
# Copy .env.example to .env and fill in your values before running.
load_dotenv()
 
USERNAME        = os.getenv("SF_USERNAME")
PASSWORD        = os.getenv("SF_PASSWORD")
SECURITY_TOKEN  = os.getenv("SF_SECURITY_TOKEN")
CONSUMER_KEY    = os.getenv("SF_CONSUMER_KEY")
CONSUMER_SECRET = os.getenv("SF_CONSUMER_SECRET")
AUTH_URL        = "https://login.salesforce.com/services/oauth2/token"
 
# Validate that required credentials are present
_missing = [k for k, v in {
    "SF_USERNAME": USERNAME, "SF_PASSWORD": PASSWORD,
    "SF_SECURITY_TOKEN": SECURITY_TOKEN,
    "SF_CONSUMER_KEY": CONSUMER_KEY, "SF_CONSUMER_SECRET": CONSUMER_SECRET,
}.items() if not v]
if _missing:
    raise EnvironmentError(f"Missing required environment variables: {', '.join(_missing)}")
 
def get_salesforce_token():
    """Generates the salesforce access token and writes it to token.txt"""
    print("Requesting new Salesforce Access Token...")
    payload = {
        "grant_type": "password",
        "client_id": CONSUMER_KEY,
        "client_secret": CONSUMER_SECRET,
        "username": USERNAME,
        "password": PASSWORD + SECURITY_TOKEN
    }
 
    response = requests.post(AUTH_URL, data=payload)
 
    if response.status_code != 200:
        raise Exception(f"Auth failed: {response.text}")
 
    auth_data = response.json()
    access_token = auth_data["access_token"]
    instance_url = auth_data["instance_url"]
 
    import json
    with open("auth.json", "w") as f:
        json.dump({"access_token": access_token, "instance_url": instance_url}, f)
       
    with open("token.txt", "w") as f:
        f.write(access_token)
       
    print("✅ Auth data written to auth.json")
    print("✅ Access Token written to token.txt")
    print("✅ Instance URL:", instance_url)
   
    return access_token, instance_url
 
if __name__ == "__main__":
    get_salesforce_token()