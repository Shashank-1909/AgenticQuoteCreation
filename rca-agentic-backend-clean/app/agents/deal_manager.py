"""
app/agents/deal_manager.py
==========================
Factory function for the Deal Manager coordinator agent.

Deal Manager is the top-level orchestrator. It receives every user message,
decides which specialist to delegate to, and transfers control via ADK's
transfer_to_agent mechanism. It never calls tools or performs work itself.
"""

# pyrefly: ignore [missing-import]
from google.adk.agents import LlmAgent

from app.core.config import MODEL_NAME
from app.agents.hooks import sequence_repair_hook


def build_deal_manager(
    requirements_parser: LlmAgent,
    catalog_scout: LlmAgent,
    quote_architect: LlmAgent,
    quote_updator: LlmAgent,
) -> LlmAgent:
    """Builds the Deal Manager coordinator agent.

    Args:
        requirements_parser: The pre-built Requirements Parser sub-agent.
        catalog_scout:       The pre-built Catalog Scout sub-agent.
        quote_architect:     The pre-built Quote Architect sub-agent.
        quote_updator:       The pre-built Quote Updator sub-agent.

    Returns:
        A fully configured LlmAgent with all specialists registered as sub-agents.
    """
    return LlmAgent(
        name="Deal_Manager",
        model=MODEL_NAME,
        description=(
            "Routes any Salesforce deal management request to the appropriate specialist agent. "
            "Use this coordinator for all product catalog, quoting, and quote update operations."
        ),
        instruction="""
You are the Deal Manager — an intelligent orchestrator for Salesforce Revenue Cloud operations.

Your role is to understand what the user is trying to accomplish and delegate to the right specialist. You are a coordinator ONLY. You have NO tools of your own except `transfer_to_agent`. You must NEVER attempt to call catalog search or document parsing tools yourself.

SPECIALISTS (STRICT SEPARATION OF CONCERNS):
- Requirements_Parser: Specialized ONLY in reading and parsing uploaded documents (RFPs, SOWs, PDFs, spreadsheets, Excel sheets) or transcripts, and extracting a raw, unstructured list of product names, quantities, and discounts. It does NOT search or map to the Salesforce catalog itself.
- Catalog_Scout: Specialized in taking a raw, extracted list of requirements (or direct keyword/filter inputs), performing field value validation, searching the Salesforce catalog, and mapping them to actual Salesforce products.
- Quote_Architect: Use for creating NEW quotes once products are identified.
- Quote_Updator: Use for modifying EXISTING quotes.

DELEGATION RULES (STRICT):
1. **DOCUMENT UPLOAD & REQUIREMENTS**: If the user message starts with "Document uploaded:", OR if they mention ANY document (RFP, SOW, PDF, requirements document, text file, spreadsheet, Excel sheet, .xlsx, .docx, .txt), transcript, call notes, or ask to extract/analyze requirements from a file, you MUST transfer to `Requirements_Parser` immediately. Never route a document upload directly to Catalog_Scout.
2. **PRODUCT SEARCH**: If the user asks to search the catalog, look up product codes, check attributes directly, or maps raw product keys *without* an unstructured document context, transfer to `Catalog_Scout`.
3. **QUOTE CREATION**: Once products are found or mapped, transfer to `Quote_Architect`.
4. **NO TOOL CALLS**: You do not have access to any search or parsing tools yourself. You MUST use `transfer_to_agent` to route these requests.

ACKNOWLEDGEMENT: When a specialist returns, provide a ONE-SENTENCE acknowledgement and tell the user the specific next step.
        """,
        sub_agents=[requirements_parser, catalog_scout, quote_architect, quote_updator],
        before_model_callback=sequence_repair_hook,
    )

