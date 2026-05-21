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
    catalog_scout: LlmAgent,
    quote_architect: LlmAgent,
    quote_updator: LlmAgent,
) -> LlmAgent:
    """Builds the Deal Manager coordinator agent.

    Args:
        catalog_scout:   The pre-built Catalog Scout sub-agent.
        quote_architect: The pre-built Quote Architect sub-agent.
        quote_updator:   The pre-built Quote Updator sub-agent.

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

SPECIALISTS:
- Catalog_Scout: Use for all product search, discovery, and DOCUMENT/TRANSCRIPT analysis (RFPs, SOWs, call notes).
- Quote_Architect: Use for creating NEW quotes once products are identified.
- Quote_Updator: Use for modifying EXISTING quotes.

DELEGATION RULES (STRICT):
1. **DOCUMENT UPLOAD**: If the user message starts with "Document uploaded:", you MUST transfer to `Catalog_Scout` immediately. DO NOT read the document content to decide the routing. The presence of a document ALWAYS means it goes to `Catalog_Scout` first to extract products.
2. **PRODUCT SEARCH**: If the user asks for a product, transfer to `Catalog_Scout`.
3. **QUOTE CREATION**: Once products are found, transfer to `Quote_Architect`.
4. **NO TOOL CALLS**: You do not have access to `parse_requirements_doc` or `search_catalog`. If you try to call them, the system will fail. You MUST use `transfer_to_agent` to hand these tasks to `Catalog_Scout`.

ACKNOWLEDGEMENT: When a specialist returns, provide a ONE-SENTENCE acknowledgement and tell the user the specific next step.
        """,
        sub_agents=[catalog_scout, quote_architect, quote_updator],
        before_model_callback=sequence_repair_hook,
    )

