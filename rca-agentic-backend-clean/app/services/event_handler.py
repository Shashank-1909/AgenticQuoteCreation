"""
app/services/event_handler.py
==============================
ADK event stream processing — the core business logic layer.

Responsibilities:
  - extract_tool_text:  pulls plain text out of an ADK function response object
  - handle_tool_result: manages picklist emission and quote flow state transitions
  - process_events:     streams ADK events for one user turn, emitting WebSocket messages

These functions are deliberately isolated from FastAPI so they can be
unit-tested without starting a server.
"""

import json
import logging
from typing import Optional

from fastapi import WebSocket
from google.genai import types
from google.adk.runners import Runner

from app.core.config import (
    TOOL_ACCOUNTS,
    TOOL_OPPORTUNITIES,
    TOOL_QUOTE,
    USER_ID,
    SF_INSTANCE_URL,
)
from app.core.state import AppState

logger = logging.getLogger(__name__)


def extract_tool_text(fn_resp: object) -> str:
    """Pulls the plain-text payload out of an ADK function response object.

    ADK wraps MCP responses in either a 'content' array or an 'output' key.
    This function normalises both shapes into a plain string.
    """
    response_data = getattr(fn_resp, "response", {})
    if not isinstance(response_data, dict):
        return ""
    content_list = response_data.get("content", [])
    if content_list and isinstance(content_list, list):
        return content_list[0].get("text", "")
    if "output" in response_data:
        return str(response_data.get("output", ""))
    return ""


async def handle_tool_result(
    tool_name: str,
    text_content: str,
    session_id: str,
    websocket: WebSocket,
    state: AppState,
) -> None:
    """Processes side effects triggered by specific tool results.

    Handles:
      - Emitting USER_SELECTION_NEEDED for account and opportunity picklists
      - Updating quote_flow state when picklists are shown or quote completes
      - Injecting instance_url into the quote tool response for frontend deep links
      - Sending the TOOL_RESULT WebSocket event in all cases
    """
    # ── Account and opportunity picklists ────────────────────────────────
    if tool_name in (TOOL_ACCOUNTS, TOOL_OPPORTUNITIES):
        try:
            parsed = json.loads(text_content)
            if tool_name == TOOL_ACCOUNTS and parsed.get("accounts"):
                await websocket.send_json({
                    "type":          "USER_SELECTION_NEEDED",
                    "selection_for": "account",
                    "options":       parsed["accounts"],
                })
                logger.info("Account picklist sent → %d options", len(parsed["accounts"]))
                state.quote_flow[session_id] = True
                logger.info("Session %s → quote flow ACTIVE (direct runner)", session_id)

            elif tool_name == TOOL_OPPORTUNITIES and parsed.get("opportunities") is not None:
                await websocket.send_json({
                    "type":          "USER_SELECTION_NEEDED",
                    "selection_for": "opportunity",
                    "options":       parsed["opportunities"],
                })
                logger.info(
                    "Opportunity picklist sent → %d options",
                    len(parsed["opportunities"]),
                )
                state.quote_flow[session_id] = True

        except json.JSONDecodeError as exc:
            logger.warning("Could not parse picklist tool response: %s", exc)

    # ── Quote completion — exit quote flow mode ───────────────────────────
    if tool_name == TOOL_QUOTE:
        try:
            parsed = json.loads(text_content)
            if parsed.get("status") == "success":
                state.quote_flow[session_id] = False
                logger.info("Session %s → quote flow COMPLETE (back to coordinator)", session_id)
        except json.JSONDecodeError as exc:
            logger.warning("Could not parse quote tool response: %s", exc)

    # ── Build and send TOOL_RESULT payload ────────────────────────────────
    payload: dict = {"type": "TOOL_RESULT", "tool": tool_name, "data": text_content}
    if tool_name == TOOL_QUOTE:
        try:
            parsed = json.loads(text_content)
            parsed["instance_url"] = SF_INSTANCE_URL
            payload["data"] = json.dumps(parsed)
        except json.JSONDecodeError as exc:
            logger.warning("Could not inject instance_url into quote response: %s", exc)

    await websocket.send_json(payload)


async def process_events(
    runner: Runner,
    message: types.Content,
    session_id: str,
    websocket: WebSocket,
    state: AppState,
) -> None:
    """Streams ADK events for a single user turn and emits WebSocket messages.

    Handles agent transitions, tool calls, tool responses, and final replies.
    Delegates all tool-result side effects to handle_tool_result.
    """
    current_agent: Optional[str] = None

    async for event in runner.run_async(
        user_id=USER_ID,
        session_id=session_id,
        new_message=message,
    ):
        # ── Agent transition ──────────────────────────────────────────────
        agent_name = getattr(event, "author", None)
        if agent_name and agent_name != current_agent:
            current_agent = agent_name
            logger.info("[AGENT] %s", agent_name)
            await websocket.send_json({"type": "AGENT_START", "agent": agent_name})

        # ── Tool call (LLM → Tool) ────────────────────────────────────────
        for fn_call in (event.get_function_calls() or []):
            tool_name: str = getattr(fn_call, "name", "unknown")
            logger.info("[TOOL CALL] → %s", tool_name)
            await websocket.send_json({"type": "TOOL_TRIGGER", "tool": tool_name})

        # ── Tool response (Tool → LLM) ────────────────────────────────────
        for fn_resp in (event.get_function_responses() or []):
            tool_name = getattr(fn_resp, "name", "")
            text_content = extract_tool_text(fn_resp)
            logger.info("[TOOL RESULT] %s → %d chars", tool_name, len(text_content))
            await handle_tool_result(tool_name, text_content, session_id, websocket, state)

        # ── Final text reply ──────────────────────────────────────────────
        if event.is_final_response() and event.content:
            for part in event.content.parts or []:
                if hasattr(part, "text") and part.text:
                    logger.info("[REPLY] %s...", part.text[:120])
                    await websocket.send_json({"type": "FINAL_REPLY", "data": part.text})
