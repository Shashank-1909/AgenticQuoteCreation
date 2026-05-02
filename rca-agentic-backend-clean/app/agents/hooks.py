"""
app/agents/hooks.py
===================
Sequence repair hook — enforces strict User→Model turn alternation
required by the Gemini API.

Shared by all three agents (Catalog_Scout, Quote_Architect, Deal_Manager).
Injects synthetic sync turns wherever the sequence would otherwise violate
the strict alternation rule.

Correct signature for stable ADK 1.28.0: (Context, LlmRequest) — typed, no kwargs.
"""

from typing import Optional

from google.genai import types
from google.adk.agents.context import Context
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse


async def sequence_repair_hook(
    callback_context: Context,
    llm_request: LlmRequest,
) -> Optional[LlmResponse]:
    """Repairs model→model or leading-model sequences before each LLM call."""
    if not llm_request or not llm_request.contents:
        return None

    sync_turn = types.Content(
        role="user",
        parts=[types.Part(text="[SYSTEM: sequence sync]")],
    )
    repaired: list[types.Content] = []

    for content in llm_request.contents:
        role = getattr(content, "role", None) or "unknown"
        if repaired:
            last_role = getattr(repaired[-1], "role", None) or "unknown"
            if last_role == "model" and role == "model":
                repaired.append(sync_turn)
        repaired.append(content)

    # Fix trailing model turn
    if repaired and getattr(repaired[-1], "role", "") == "model":
        repaired.append(sync_turn)

    # Fix leading model turn
    if repaired and getattr(repaired[0], "role", "") == "model":
        repaired.insert(0, sync_turn)

    llm_request.contents = repaired
    return None
