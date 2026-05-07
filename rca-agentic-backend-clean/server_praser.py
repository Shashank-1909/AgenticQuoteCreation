import os
import json
from mcp.server.fastmcp import FastMCP
from dotenv import load_dotenv
from server import search_products
from google import genai
from google.genai import types

load_dotenv()

mcp = FastMCP("Salesforce_Parser")


@mcp.tool()
def parse_transcript_to_requirements(transcript_text: str) -> str:
    """
    Extracts product requirements and customer intent from a call transcript or meeting notes.
    Maps explicit product mentions to catalog SKUs automatically, then presents them for
    user selection before proceeding to account → opportunity → quote creation.

    When to call: When the user provides a raw call transcript or meeting notes and wants
    to extract requirements and create a quote. After calling this tool, follow the
    next_steps instructions exactly — do NOT skip product selection or account selection.
    """
    client = genai.Client()

    prompt = f"""
    Analyze the following call transcript and extract the customer's requirements.
    Return a JSON array of objects, where each object has:
    - "product_name": The core product or category mentioned (keep it concise, e.g. "Tablet" or "Laptop")
    - "quantity": The quantity requested (integer, use 1 if unspecified)
    - "context": Brief pain points or reasons

    Transcript:
    {transcript_text}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        requirements = json.loads(response.text)
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Error analyzing transcript with LLM: {str(e)}"})

    # Map each extracted requirement to catalog products via SOQL search.
    # Use page_size=5 so the user gets a real list to choose from (same as a normal search).
    all_catalog_products = []
    mapped_requirements = []

    for req in requirements:
        prod_name = req.get("product_name", "")
        search_result_json = search_products(search_term=prod_name, page_size=5)
        try:
            search_data = json.loads(search_result_json)
            products_found = search_data.get("results", [])
        except Exception:
            products_found = []

        mapped_requirements.append({
            "extracted_need": req,
            "mapped_catalog_products": products_found,
            "confidence": "High" if len(products_found) == 1 else "Medium" if len(products_found) > 1 else "Low"
        })

        # Collect all matched products into one flat list for the selection panel,
        # deduplicating by product id so the same SKU doesn't appear twice.
        seen_ids = {p["id"] for p in all_catalog_products}
        for p in products_found:
            if p["id"] not in seen_ids:
                all_catalog_products.append(p)
                seen_ids.add(p["id"])

    return json.dumps({
        "status": "success",
        "message": "Extracted requirements and mapped to CPQ catalog.",
        "requirements": mapped_requirements,
        # Flat product list mirrors what search_catalog returns so the agent can
        # present it to the user for selection via the right-pane product cards.
        "results": all_catalog_products,
        "count": len(all_catalog_products),
        # CRITICAL: instruct the agent to follow the EXACT same flow as a normal
        # typed query. The agent MUST NOT skip any step or call evaluate_quote_graph
        # before the user has selected products, an account, and an opportunity.
        "next_steps": (
            "IMPORTANT — follow these steps in order, do not skip any:\n"
            "1. Present the mapped catalog products to the user as a selectable list "
            "(same as you would for a normal product search). Ask them to confirm which "
            "products they want to include in the quote.\n"
            "2. Once the user confirms the products, call get_my_accounts to fetch their "
            "Salesforce accounts and display the account selection panel.\n"
            "3. After the user selects an account, call get_opportunities_for_account "
            "with the chosen account ID and display the opportunity selection panel.\n"
            "4. Only after the user has confirmed an opportunity, call "
            "resolve_pricebook_entries then evaluate_quote_graph to create the quote.\n"
            "Do NOT proceed to the next step until the user has confirmed the current one."
        )
    }, indent=2)


@mcp.tool()
def parse_requirements_doc(document_content: str) -> str:
    """
    Accepts raw text from a requirements document (RFP, SOW, etc.) and extracts individual
    requirements. Maps each requirement to the best-fit catalog product, then presents them
    for user selection before proceeding to account → opportunity → quote creation.

    When to call: When the user uploads or pastes an RFP, SOW, or requirements document.
    After calling this tool, follow the next_steps instructions exactly — do NOT skip
    product selection or account/opportunity selection.
    """
    client = genai.Client()

    prompt = f"""
    Analyze the following requirements document text.
    Return a JSON array of objects, where each object has:
    - "requirement": The specific functional or technical requirement
    - "type": functional, technical, commercial, or SLA
    - "suggested_product": A brief keyword of what product or category would solve this (e.g. "Tablet")
    - "quantity": The requested quantity as an integer. Use 1 if not specified.

    Document Text:
    {document_content}
    """

    try:
        response = client.models.generate_content(
            model='gemini-2.5-pro',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type="application/json",
            ),
        )
        requirements = json.loads(response.text)
    except Exception as e:
        return json.dumps({"status": "error", "message": f"Error analyzing document with LLM: {str(e)}"})

    # Map each requirement to catalog products.
    # Use page_size=5 so the user has real options to choose from.
    all_catalog_products = []
    mapped_requirements = []

    for req in requirements:
        suggested = req.get("suggested_product", "")
        search_result_json = search_products(search_term=suggested, page_size=5)
        try:
            search_data = json.loads(search_result_json)
            products_found = search_data.get("results", [])
        except Exception:
            products_found = []

        req["mapped_products"] = products_found
        req["confidence"] = "High" if len(products_found) == 1 else "Medium" if len(products_found) > 1 else "Low"
        mapped_requirements.append(req)

        # Deduplicated flat list for the selection panel
        seen_ids = {p["id"] for p in all_catalog_products}
        for p in products_found:
            if p["id"] not in seen_ids:
                all_catalog_products.append(p)
                seen_ids.add(p["id"])

    return json.dumps({
        "status": "success",
        "message": "Requirements extracted and mapped to catalog products.",
        "requirements": mapped_requirements,
        # Flat product list mirrors search_catalog output for right-pane display
        "results": all_catalog_products,
        "count": len(all_catalog_products),
        # Same ordered flow as a normal quote creation query.
        "next_steps": (
            "IMPORTANT — follow these steps in order, do not skip any:\n"
            "1. Summarize the requirements concisely, then present the mapped catalog "
            "products to the user as a selectable list. Ask them to confirm which products "
            "they want to include in the quote.\n"
            "2. Once the user confirms the products, call get_my_accounts to fetch their "
            "Salesforce accounts and display the account selection panel.\n"
            "3. After the user selects an account, call get_opportunities_for_account "
            "with the chosen account ID and display the opportunity selection panel.\n"
            "4. Only after the user has confirmed an opportunity, call "
            "resolve_pricebook_entries then evaluate_quote_graph to create the quote.\n"
            "Do NOT proceed to the next step until the user has confirmed the current one."
        )
    }, indent=2)


if __name__ == "__main__":
    mcp.run()