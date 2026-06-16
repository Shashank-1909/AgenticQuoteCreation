import os
import sys
import json
from pydantic import BaseModel, Field
from typing import List, Optional
from google import genai
from google.genai import types

class RequirementItem(BaseModel):
    product_name: str = Field(description="The exact name of the product or service needed.")
    quantity: int = Field(default=1, description="The quantity requested. Default to 1 if not specified.")
    discount: float = Field(default=0.0, description="The discount percentage requested, e.g. 10.0 for 10%. Default to 0.0.")

class RequirementsPayload(BaseModel):
    requirements: List[RequirementItem]


def _get_genai_client():
    raw_val = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "false")
    use_vertex = raw_val.replace('"', '').replace("'", "").strip().lower() == "true"
    if use_vertex:
        project_id = (os.getenv("GOOGLE_CLOUD_PROJECT") or "").replace('"', '').replace("'", "").strip()
        location_id = (os.getenv("GOOGLE_CLOUD_LOCATION") or "us-central1").replace('"', '').replace("'", "").strip()
        return genai.Client(
            vertexai=True,
            project=project_id,
            location=location_id
        )
    return genai.Client()


def _call_gemini_direct(
    prompt: str,
    mime_type: str = "application/json",
    temperature: float = 0.0,
    response_schema: any = None
) -> str:
    """
    Helper to make a Gemini API call using the official, pre-configured GenAI Client.
    Bypasses raw REST requests and manual credential refreshes to avoid Windows grandchild pipe deadlocks.
    """
    sys.stderr.write("[DEBUG] _call_gemini_direct: Calling Gemini via official Client...\n")
    try:
        client = _get_genai_client()
        
        response = client.models.generate_content(
            model='gemini-2.5-flash',
            contents=prompt,
            config=types.GenerateContentConfig(
                response_mime_type=mime_type,
                temperature=temperature,
                response_schema=response_schema,
            )
        )
        if response and response.text:
            sys.stderr.write("[DEBUG] _call_gemini_direct: Call succeeded.\n")
            return response.text.strip()
        else:
            raise ValueError("Empty response received from Gemini.")
    except Exception as e:
        sys.stderr.write(f"[DEBUG] _call_gemini_direct Error: {str(e)}\n")
        raise e


def parse_transcript_to_requirements(transcript_text: str) -> str:
    """
    Extracts product requirements and customer intent from a call transcript or meeting notes.
    """
    sys.stderr.write(f"\n[DEBUG] Parsing transcript ({len(transcript_text)} chars)...\n")
    
    prompt = (
        "Extract all product/service requirements from the following call transcript. "
        "For each item, identify its name, quantity, and discount.\n"
        "If the transcript mentions a general discount rule (for example, '12% discount on all consumables', "
        "'10% institutional discount has been applied to consumables', or similar), you MUST apply that discount percentage "
        "to all matching products in the list.\n"
        f"\n\nTranscript:\n{transcript_text}"
    )

    try:
        sys.stderr.write("[DEBUG] Calling Gemini directly for transcript parsing via Pydantic schema...\n")
        raw_text = _call_gemini_direct(prompt, response_schema=RequirementsPayload)
        data = json.loads(raw_text)
        requirements = data.get("requirements", [])
        sys.stderr.write(f"[DEBUG] LLM extraction complete: {len(requirements)} items.\n")
    except Exception as e:
        sys.stderr.write(f"[DEBUG] LLM extraction error: {str(e)}\n")
        requirements = []
        
    return json.dumps(requirements, indent=2)


def parse_requirements_doc(document_content: str) -> str:
    """
    Extracts requirements from RFP/SOW documents and maps them to the catalog.
    """
    sys.stderr.write(f"\n[DEBUG] parse_requirements_doc: Processing {len(document_content)} characters...\n")

    prompt = (
        "Extract all product/service requirements from the following document. "
        "For each item, identify its exact product name, quantity, and discount.\n"
        "If the document mentions a general discount rule (for example, 'A 12% institutional discount has been applied to consumables', "
        "'10% discount on all consumables', or similar), you MUST apply that discount percentage to all matching products in the list.\n"
        "IMPORTANT: Do NOT extract table headers, index columns, serial numbers, or row numbers (such as 'S.No', '1', '2', etc.) as product names. "
        "The product name must be the actual name of the product or service being requested."
        f"\n\nDocument:\n{document_content}"
    )

    try:
        sys.stderr.write("[DEBUG] Calling Gemini directly for document parsing via Pydantic schema...\n")
        raw = _call_gemini_direct(prompt, response_schema=RequirementsPayload)
        data = json.loads(raw)
        all_requirements = data.get("requirements", [])
        sys.stderr.write(f"[DEBUG] Gemini extracted {len(all_requirements)} items.\n")
    except Exception as e:
        sys.stderr.write(f"[DEBUG] Gemini extraction error: {str(e)}\n")
        return json.dumps({"status": "error", "message": f"Error analyzing document: {str(e)}"})

    # Deduplicate
    unique_reqs = {}
    for r in all_requirements:
        name = r.get("product_name", "").strip()
        if name and name.lower() not in unique_reqs:
            unique_reqs[name.lower()] = {
                "product_name": name,
                "quantity": r.get("quantity", 1),
                "discount": r.get("discount", 0.0)
            }

    transformed = list(unique_reqs.values())
    sys.stderr.write(f"[DEBUG] Extraction complete. Total unique requirements: {len(transformed)}\n")

    return json.dumps(transformed, indent=2)
