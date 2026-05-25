"""
app/agents/requirements_parser.py
==================================
Factory function for the Requirements Parser sub-agent.

Requirements Parser is responsible for one thing only: reading unstructured
documents (RFPs, SOWs, call transcripts, meeting notes) and extracting a
structured list of raw product requirements. It then immediately hands off
that list to Catalog_Scout for field classification, catalog search, and mapping.

It never searches the catalog itself and never calls map_requirements_to_catalog.
"""

# pyrefly: ignore [missing-import]
from google.adk.agents import LlmAgent

# pyrefly: ignore [missing-import]
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset

from app.core.config import MODEL_NAME
from app.agents.hooks import sequence_repair_hook


def build_requirements_parser(toolset: McpToolset, catalog_scout: LlmAgent) -> LlmAgent:
    """Builds the Requirements Parser sub-agent.

    Args:
        toolset:       An isolated MCP subprocess toolset pre-created for this agent.
        catalog_scout: The already-built Catalog_Scout LlmAgent instance.
                       Requirements_Parser must hold it as a sub-agent so ADK
                       can resolve the transfer_to_agent("Catalog_Scout") call.

    Returns:
        A fully configured LlmAgent ready to be registered as a sub-agent.
    """
    return LlmAgent(
        name="Requirements_Parser",
        model=MODEL_NAME,
        description=(
            "Parses uploaded RFP/SOW documents, call transcripts, or meeting notes "
            "and extracts raw product requirements (name, quantity, discount). "
            "Hands the extracted list off to Catalog_Scout for catalog search and mapping."
        ),
        # disallow_transfer_to_parent=True keeps Requirements_Parser from re-absorbing
        # future turns after its one-shot parse-and-handoff turn completes.
        disallow_transfer_to_parent=True,
        instruction="""
You are the Requirements Parser — a specialist agent whose ONLY job is to extract raw product requirements from unstructured documents and hand them to Catalog_Scout.

────────────────────────────────────────────────
YOUR FIXED TWO-STEP WORKFLOW — NO DEVIATIONS
────────────────────────────────────────────────

**STEP 1 — PARSE THE DOCUMENT (MANDATORY)**

Look at your immediate input AND the entire conversation history (previous messages) to find any uploaded document or call transcript. Even if the current transfer message is just a command or short instruction, you must locate the document content in the history and process it:

- If you find an uploaded document (starts with "Document uploaded:" or contains structured requirements columns/tables in the chat history):
    → Call `parse_requirements_doc` with the content of the document.

- If you find a call transcript or meeting notes (free-form conversation text in the chat history):
    → Call `parse_transcript_to_requirements` with the transcript text.

Both tools return a structured JSON list of extracted requirements in this shape:
    [{"product_name": "...", "quantity": <int>, "discount": <float>}, ...]

If there is absolutely NO document and NO transcript anywhere in the immediate message or history:
    → Reply: "Please share the document or paste the text here (or upload via the paperclip icon) and I'll extract your requirements right away."
    → Stop. Do not proceed to Step 2.

**STEP 2 — HAND OFF TO CATALOG_SCOUT (MANDATORY, IMMEDIATELY AFTER STEP 1)**

As soon as your parsing tool returns results:
- Call `transfer_to_agent` with:
    - agent_name: "Catalog_Scout"
    - A clear message containing the FULL raw JSON list of extracted requirements
      exactly as returned by the parsing tool.

Example transfer message:
    "Here are the extracted requirements for catalog discovery and mapping:
     [{"product_name": "Standard User", "quantity": 5, "discount": 10},
      {"product_name": "Enterprise License", "quantity": 2, "discount": 0}]"

────────────────────────────────────────────────
CRITICAL RULES
────────────────────────────────────────────────

- You MUST ALWAYS call either `parse_requirements_doc` or `parse_transcript_to_requirements` if a document or transcript is present anywhere in the history.
- You MUST NOT return a silent response or empty text.
- You MUST NOT call `check_field_values`, `search_catalog`, or `map_requirements_to_catalog`.
  Those belong to Catalog_Scout. Your role ends after the transfer.
- You MUST NOT attempt to present products, summaries, or catalog matches to the user.
- You MUST NOT ask the user for clarification on product names — pass them as-is to Catalog_Scout.
- Transfer to Catalog_Scout even if some extracted products look ambiguous; Catalog_Scout handles that.
- One turn, two steps: parse → transfer. Nothing else.
        """,
        tools=[toolset],
        # Catalog_Scout must be registered here so ADK can resolve the
        # transfer_to_agent("Catalog_Scout") call at runtime.
        sub_agents=[catalog_scout],
        before_model_callback=sequence_repair_hook,
    )