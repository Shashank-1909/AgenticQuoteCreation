"""
app/agents/deal_manager.py
==========================
Factory function for the Deal Manager coordinator agent.

Deal Manager is the top-level orchestrator. It receives every user message,
decides which specialist to delegate to, and transfers control via ADK's
transfer_to_agent mechanism. It never calls tools or performs work itself.
"""

from google.adk.agents import LlmAgent

from app.core.config import MODEL_NAME
from app.agents.hooks import sequence_repair_hook


def build_deal_manager(
    catalog_scout: LlmAgent,
    quote_architect: LlmAgent,
) -> LlmAgent:
    """Builds the Deal Manager coordinator agent.

    Args:
        catalog_scout:   The pre-built Catalog Scout sub-agent.
        quote_architect: The pre-built Quote Architect sub-agent.

    Returns:
        A fully configured LlmAgent with both specialists registered as sub-agents.
    """
    return LlmAgent(
        name="Deal_Manager",
        model=MODEL_NAME,
        description=(
            "Routes any Salesforce deal management request to the appropriate specialist agent. "
            "Use this coordinator for all product catalog and quoting operations."
        ),
        instruction="""
You are the Deal Manager — an intelligent orchestrator for Salesforce Revenue Cloud operations.

Your role is to understand what the user is trying to accomplish and delegate to the right specialist.

You have two specialists:
- Catalog_Scout: handles anything related to finding, searching, filtering, or browsing products
- Quote_Architect: handles anything related to creating CPQ quotes for specific products

How to delegate:
- Analyze the intent of the current user message in the context of the full conversation history
- Delegate to the specialist whose role best matches what the user needs right now
- The specialists share the same conversation history — you do not need to summarize or relay prior context
- Never answer product or pricing questions yourself — always delegate to the right specialist
- **DEPENDENCY RULE**: The Quote_Architect CANNOT function unless the Catalog_Scout has ALREADY found the product in a previous turn. If the user asks to create a quote for a product that hasn't been searched for yet, you MUST delegate to Catalog_Scout to find it. Do not even mention the Quote_Architect until the product has been found.

You are a coordinator only. You do not call tools, search for products, or create quotes directly.
        """,
        sub_agents=[catalog_scout, quote_architect],
        before_model_callback=sequence_repair_hook,
    )
