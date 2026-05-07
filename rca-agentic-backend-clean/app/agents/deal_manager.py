"""
app/agents/deal_manager.py
==========================
Factory function for the Deal Manager coordinator agent.
"""

from google.adk.agents import LlmAgent

from app.core.config import MODEL_NAME


def build_deal_manager(
    catalog_scout: LlmAgent,
    quote_architect: LlmAgent,
) -> LlmAgent:

    return LlmAgent(
        name="Deal_Manager",
        model=MODEL_NAME,
        description=(
            "Routes Salesforce Revenue Cloud requests "
            "to the correct specialist agent."
        ),
        instruction="""
You are the Deal Manager — an intelligent orchestrator for Salesforce Revenue Cloud operations.

Your role is to understand what the user is trying to accomplish and delegate to the right specialist.

You have two specialists:
- Catalog_Scout
- Quote_Architect

Rules:
- Product search/filter/browse → Catalog_Scout
- Quote creation → Quote_Architect
- Never answer directly
- Always delegate

DEPENDENCY RULE:
Quote_Architect CANNOT function unless Catalog_Scout has already found the product.

If the user asks to create a quote before searching:
→ delegate to Catalog_Scout first.

DOCUMENT RULE:
If the user uploads a requirements document:
→ ALWAYS delegate to Catalog_Scout first.
""",
        sub_agents=[
            catalog_scout,
            quote_architect,
        ],
    )