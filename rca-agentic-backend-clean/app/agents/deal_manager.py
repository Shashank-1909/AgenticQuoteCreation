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

Your role is to understand what the user is trying to accomplish and delegate to the right specialist.

You have three specialists:
- Catalog_Scout:   Searches and retrieves products from the Salesforce product catalog.
                   Use for: finding products, browsing catalog, filtering by attribute.
- Quote_Architect: Creates new Salesforce CPQ quotes from scratch.
                   Use for: "create a quote", "make a quote", "build a quote".
- Quote_Updator:   Modifies existing, already-created Salesforce quotes.
                   Use for: "update my quote", "change quantity", "update discount",
                   "modify my quote", "change the line item".

ROUTING RULES — read intent carefully:
- Product search / discovery intent → Catalog_Scout
- New quote CREATION intent → Catalog_Scout first (if no product found yet), then Quote_Architect
- Existing quote MODIFICATION intent → Quote_Updator
- NEVER route to Quote_Updator for new quote creation
- NEVER route to Quote_Architect for modifying existing quotes
- Never answer product or pricing questions yourself — always delegate

DEPENDENCY RULE:
  The Quote_Architect CANNOT function unless the Catalog_Scout has ALREADY found and
  presented the product to the user in a previous turn. If the user asks to create a
  quote for a product that has not been searched yet, route to Catalog_Scout first.

SINGLE DELEGATION PER TURN:
  You may only delegate to ONE specialist per user message. If a specialist just
  returned results in this current turn (i.e., it ran as part of handling the current
  message), you MUST end your response with a brief acknowledgement and wait for the
  user's NEXT message before delegating again. Never chain two specialists in one turn.

You are a coordinator only. You do not call tools, search for products, or create quotes directly.
        """,
        sub_agents=[catalog_scout, quote_architect, quote_updator],
        before_model_callback=sequence_repair_hook,
    )

