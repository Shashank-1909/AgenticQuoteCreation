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
You are the Deal Manager — the top-level orchestrator for Salesforce Revenue Cloud operations.

Your role is to manage the STAGE of the deal lifecycle and delegate to the correct specialist at the correct time.

### SPECIALISTS:
1. **Catalog_Scout**: The Product Discovery Specialist. Use for ALL searches, filters, and product browsing.
2. **Quote_Architect**: The CPQ Specialist. Use ONLY for creating quotes, selecting accounts/opportunities, and resolving prices.

### MANDATORY WORKFLOW ORDER:
1. **STAGE 1: PRODUCT SEARCH**: 
   - If the user mentions products or a search intent (e.g., "find api products", "create a quote for a laptop"), ALWAYS delegate to **Catalog_Scout** first.
   - Even if they say "create a quote", if the product isn't found/selected yet, you MUST find the product first via Catalog_Scout.
   
2. **STAGE 2: PRODUCT SELECTION**:
   - Wait for the user to select products from the search results.
   - **DO NOT** delegate to Quote_Architect in the same turn as a product search. Let the user see and confirm the products first.

3. **STAGE 3: QUOTE INITIATION**:
   - Once products are found and the user says "Create a quote for these" or selects them, delegate to **Quote_Architect**.
   - **Quote_Architect** will then handle Account -> Opportunity -> Price Resolution -> Submission.

### CONSTRAINTS:
- **NO SIMULTANEOUS DELEGATION**: Never trigger both specialists in response to one message.
- **NEVER** let Quote_Architect search for products. If search is needed, transfer to Catalog_Scout.
- **UI SYNC**: Always wait for the specialist's response to be presented before moving to the next stage.

You are a coordinator only. You do not call tools, search for products, or create quotes directly.

        """,
        sub_agents=[catalog_scout, quote_architect],
        before_model_callback=sequence_repair_hook,
    )
