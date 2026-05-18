"""
main.py
=======
Entry point for the Deal Management API.

This file does exactly one thing: configure and start the server.
All application logic lives in the app/ package.

Run with:
    python main.py
    OR
    uvicorn main:app --host 0.0.0.0 --port 8001
"""

import logging

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables FIRST — before any Google SDK modules are imported,
# so that GOOGLE_GENAI_USE_VERTEXAI and GOOGLE_CLOUD_PROJECT are available.
load_dotenv()

from app.core.config import SERVER_PORT
from app.lifespan import lifespan
from app.api.websocket import websocket_endpoint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

app = FastAPI(
    title="Deal Management API v2",
    description="Multi-agent Salesforce CPQ system — ADK 1.28.0 Stable",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.add_api_websocket_route("/ws/orchestrate", websocket_endpoint)

@app.get("/api/quote-preview/{quote_id}")
async def quote_preview(quote_id: str):
    print(f"[DEBUG] Fetching preview for Quote ID: {quote_id}")
    from server import get_quote_preview
    import json
    result_str = get_quote_preview(quote_id)
    print(f"[DEBUG] Result status: {json.loads(result_str).get('status')}")
    return json.loads(result_str)

@app.get("/api/deal-history")
async def deal_history(account_name: str = "Edge Communications"):
    """Fetches all quotes across all opportunities for a given account name."""
    import json, requests as _req
    from server import get_salesforce_auth

    try:
        headers, instance_url = get_salesforce_auth()

        # 1. Find account by name
        q_acc = f"SELECT Id, Name FROM Account WHERE Name LIKE '%{account_name}%' LIMIT 5"
        acc_resp = _req.get(f"{instance_url}/services/data/v59.0/query", headers=headers, params={"q": q_acc})
        accounts = acc_resp.json().get("records", [])
        if not accounts:
            return {"status": "empty", "message": f"No account found matching '{account_name}'", "quotes": []}

        account = accounts[0]
        account_id = account["Id"]
        display_name = account["Name"]

        # 2. Get all quotes across all opportunities for this account in a single query (fully optimized!)
        q_quotes = (
            f"SELECT Id, Name, Status, GrandTotal, Discount, QuoteNumber, CreatedDate, Opportunity.Name, "
            f"(SELECT Id, Product2.Name, Quantity, UnitPrice, TotalPrice, Discount FROM QuoteLineItems) "
            f"FROM Quote WHERE AccountId = '{account_id}' ORDER BY CreatedDate DESC LIMIT 100"
        )
        qt_resp = _req.get(f"{instance_url}/services/data/v59.0/query", headers=headers, params={"q": q_quotes})
        quotes = qt_resp.json().get("records", [])

        all_quotes = []

        for quote in quotes:
            quote_id = quote["Id"]
            opp_name = quote.get("Opportunity", {}).get("Name", "Direct Quote") if quote.get("Opportunity") else "Direct Quote"

            line_items = []
            q_li_list = quote.get("QuoteLineItems", {}).get("records", []) if quote.get("QuoteLineItems") else []
            for li in q_li_list:
                prod_name = li.get("Product2", {}).get("Name", "Unknown Product") if li.get("Product2") else "Unknown Product"
                line_items.append({
                    "name": prod_name,
                    "quantity": li.get("Quantity", 1),
                    "unitPrice": li.get("UnitPrice", 0),
                    "totalPrice": li.get("TotalPrice", 0),
                    "discount": li.get("Discount", 0),
                })

            total = quote.get("GrandTotal") or 0
            discount_val = quote.get("Discount") or 0

            # Build tags from quote status and discount
            tags = []
            if discount_val and discount_val > 0:
                tags.append(f"{discount_val}% discount applied")
            if quote.get("Status") in ("Closed Won",):
                tags.append("Won deal")
            elif quote.get("Status") in ("Closed Lost",):
                tags.append("Lost  competitor")

            all_quotes.append({
                "id": quote_id,
                "name": quote.get("Name", "Unnamed Quote"),
                "quoteNumber": quote.get("QuoteNumber", ""),
                "status": quote.get("Status", "Draft"),
                "grandTotal": total,
                "discount": discount_val,
                "createdDate": quote.get("CreatedDate", ""),
                "opportunityName": opp_name,
                "lineItems": line_items,
                "analysis": None,  # AI-generated analysis populated by agent on summarize
                "tags": tags,
            })

        return {
            "status": "success",
            "accountName": display_name,
            "accountId": account_id,
            "quoteCount": len(all_quotes),
            "quotes": all_quotes,
        }

    except Exception as e:
        return {"status": "error", "message": str(e), "quotes": []}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)
