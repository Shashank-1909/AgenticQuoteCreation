"""
Deal Management API — Stable ADK 1.28.0
========================================
Multi-agent Salesforce CPQ orchestration using the Coordinator/sub_agents pattern.
Uses global Python interpreter (stable google-adk 1.28.0), NOT the venv.

Run with: python agent_v2.py
Serves on: http://0.0.0.0:8001
"""

import json
import logging
import os
import sys
import uuid
from contextlib import asynccontextmanager
from dataclasses import dataclass, field
from typing import Optional

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

from google.genai import types
from google.adk.agents import LlmAgent
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.agents.context import Context
from google.adk.models.llm_request import LlmRequest
from google.adk.models.llm_response import LlmResponse
from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

load_dotenv()

# ---------------------------------------------------------------------------
# Logging — replaces all raw print() calls.
# Using the standard library `logging` module gives us:
#   - Log levels (INFO, WARNING, ERROR) for filtering
#   - Timestamps and caller info for free
#   - Redirectable output (file, stream, external service) without code changes
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Constants — single source of truth for every magic string.
# If any name changes, update it here only.
# ---------------------------------------------------------------------------
APP_NAME:            str = "deal_manager_v2"
USER_ID:             str = "dev"
MODEL_NAME:          str = "gemini-2.5-pro"
SERVER_PORT:         int = 8001
MCP_TIMEOUT:       float = 60.0
MCP_SERVER_SCRIPT:   str = "server.py"

# Tool names referenced in the event-routing logic
TOOL_ACCOUNTS:      str = "get_my_accounts"
TOOL_OPPORTUNITIES: str = "get_opportunities_for_account"
TOOL_QUOTE:         str = "evaluate_quote_graph"

# Salesforce fallback instance URL (overridden by auth.json if present)
_SF_INSTANCE_URL: str = "https://login.salesforce.com"
_AUTH_PATH: str = os.path.join(os.path.dirname(__file__), "auth.json")
try:
    with open(_AUTH_PATH) as _f:
        _auth_data = json.load(_f)
        _SF_INSTANCE_URL = _auth_data.get("instance_url", _SF_INSTANCE_URL)
except FileNotFoundError:
    logger.warning("auth.json not found — using default Salesforce login URL.")
except json.JSONDecodeError as exc:
    logger.warning("auth.json is malformed and could not be parsed: %s", exc)


# ---------------------------------------------------------------------------
# AppState — replaces module-level mutable globals.
# All mutable runtime state lives in one explicit, inspectable object.
# This makes dependencies visible and the code far easier to test.
# ---------------------------------------------------------------------------
@dataclass
class AppState:
    """Holds all runtime state for the lifetime of the FastAPI application."""
    root_runner:  Runner
    quote_runner: Runner
    # Tracks which sessions are mid-quote-creation.
    # True  → use quote_runner (Quote_Architect directly, Deal_Manager bypassed)
    # False → use root_runner  (Deal_Manager coordinator)
    quote_flow: dict[str, bool] = field(default_factory=dict)


# Module-level reference to AppState, set during lifespan startup.
_app_state: Optional[AppState] = None

# Shared session service — single instance for all runners so conversation
# history is preserved even when switching between root_runner and quote_runner.
session_service = InMemorySessionService()


# ---------------------------------------------------------------------------
# Sequence Repair Hook
# Enforces strict User→Model alternation required by the Gemini API.
# Injects synthetic sync turns wherever the sequence would violate this rule.
# Correct signature for stable ADK 1.28.0: (Context, LlmRequest) — typed, no kwargs.
# ---------------------------------------------------------------------------
async def sequence_repair_hook(
    callback_context: Context,
    llm_request: LlmRequest,
) -> Optional[LlmResponse]:
    """Repairs model→model or leading model sequences before each LLM call."""
    if not llm_request or not llm_request.contents:
        return None

    sync_turn = types.Content(role="user", parts=[types.Part(text="[SYSTEM: sequence sync]")])
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


# ---------------------------------------------------------------------------
# MCP Toolset Factory
# Extracted so each call is self-contained and testable independently.
# ---------------------------------------------------------------------------
def _build_mcp_toolset() -> McpToolset:
    """Creates a new isolated MCP subprocess toolset for one agent."""
    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command=sys.executable,
                args=["-u", MCP_SERVER_SCRIPT],
            ),
            timeout=MCP_TIMEOUT,
        )
    )


# ---------------------------------------------------------------------------
# Agent Builders
# Each builder is a focused function with one job.
# ---------------------------------------------------------------------------
def _build_catalog_scout(toolset: McpToolset) -> LlmAgent:
    """Builds the Catalog Scout sub-agent (product discovery specialist)."""
    return LlmAgent(
        name="Catalog_Scout",
        model=MODEL_NAME,
        description=(
            "Searches and retrieves products from the Salesforce product catalog. "
            "Handles name-based searches, attribute-based filtering, and product discovery."
        ),
        # disallow_transfer_to_parent=True: After Catalog_Scout responds to a turn,
        # ADK automatically returns control to Deal_Manager for the NEXT user message.
        # Without this, ADK's _get_subagent_to_resume finds the old transfer_to_agent
        # event and sends ALL future turns directly to Catalog_Scout, bypassing the
        # coordinator entirely (one-way transfer bug documented in ADK llm_agent.py L299).
        disallow_transfer_to_parent=True,
        instruction="""
You are the Catalog Scout — a precise product discovery specialist for Salesforce Revenue Cloud.

Your responsibility is to find products that match what the user is looking for.

How to identify your tools:
- The FIELD CLASSIFICATION tool identifies itself in its description as the tool that
  "must be the FIRST tool called for any product search, without exception."
  Always call this tool first — it will tell you how to structure the search payload.
- The SEARCH CATALOG tool identifies itself as "Unified product catalog search".
  Use this single tool to perform ALL searches. It accepts both 'search_term' and 'filters'.
- After classification, always follow the 'instruction' field in its response exactly.

How to handle Search Context (CRITICAL):
- NEW SEARCH: If the user introduces a completely new product name or explicitly asks for a new search (e.g., "now find me desktops"), discard all previous search terms and filters. Start fresh.
- REFINEMENT: If the user uses referential language (e.g., "only those in the West", "filter them by V21"), they are refining the previous search. You MUST STILL call the FIELD CLASSIFICATION tool on the NEW words first! Then, take the new criteria it outputs, COMBINE them with your PREVIOUS `search_term` and `filters`, and pass the fully combined payload to the `search_catalog` tool.

How to approach a search:
- Extract meaningful tokens from the user's message (remove stopwords)
- Call the field classification tool first with those tokens
- Follow the instruction in the classification result to call the correct search tool
- Execute the search against the live product catalog

How to present results:
- Product details are automatically displayed in the results panel on the right side
  of the UI — you do NOT need to list them in your reply.
- Your text response must be a SINGLE concise sentence only.
  Examples:
    "Found all the products matching 'XYZ' — see the results panel."
    "No products found for 'XYZ' — try a broader search term."
    "Found 3 products for 'V21' — results are in the panel on the right."
- Never repeat product names, codes, categories, or IDs in your reply text.
- If no products are found, say so clearly and suggest how the user might refine their query.
- Never fabricate products, IDs, or pricing data.

You are a read-only discovery agent. You do not create quotes, modify records, or perform any write operations.
- **CRITICAL TRANSFER RULE**: You must NEVER use the `transfer_to_agent` tool yourself. Once you have found the products, you must ALWAYS provide your concise text reply directly to the user so the UI can render the products.
        """,
        tools=[toolset],
        before_model_callback=sequence_repair_hook,
    )


def _build_quote_architect(toolset: McpToolset) -> LlmAgent:
    """Builds the Quote Architect sub-agent (CPQ quote creation specialist)."""
    return LlmAgent(
        name="Quote_Architect",
        model=MODEL_NAME,
        description=(
            "Creates Salesforce CPQ quotes for products. Resolves active pricing from the pricebook "
            "and submits structured quote graphs to the Salesforce Revenue Cloud API."
        ),
        # Same fix as Catalog_Scout — each sub-agent is single-turn from the
        # coordinator's perspective. Deal_Manager re-routes every new message.
        disallow_transfer_to_parent=True,
        instruction="""
You are the Quote Architect — a Salesforce CPQ specialist responsible for creating validated, submitted quotes.

Your job is to translate the user's quoting intent into a real Salesforce CPQ quote.

How to identify your tools:
- Read each tool's description carefully. Each tool describes its purpose and when to call it.
- The ACCOUNT TOOL is described as: fetches the current authenticated user's Salesforce accounts.
- The OPPORTUNITY TOOL is described as: fetches open opportunities for a given account ID.
- The PRICING TOOL is described as: resolves Product2 IDs to active PricebookEntry IDs and unit prices.
  Its description will say it is a mandatory prerequisite before quote creation.
- The QUOTE TOOL is described as: creates and submits a Quote Graph to Salesforce CPQ.
  Its description will say it accepts line items with PricebookEntryIds.
- Never call a tool by guessing its name — identify it by its stated purpose in its description.

== MANDATORY QUOTE CREATION FLOW — follow this EXACTLY, in order ==

STEP 1 — ACCOUNT SELECTION (always first):
  Use the account retrieval tool (described as fetching the authenticated user's accounts).
  Tell the user: "I've loaded your accounts — please select one from the panel on the left."
  Wait for the user to reply with their selection.
  The user's selection will arrive as: "[Account Name] (ID: 001xxxxxxxxxxxxxxx)"
  Extract the 18-character Account ID (starts with '001') from that message.

STEP 2 — OPPORTUNITY SELECTION (always second):
  Use the opportunity retrieval tool (described as fetching open opportunities for an account),
  passing the Account ID extracted in Step 1.
  Tell the user: "I've loaded the open opportunities — please select one from the panel on the left."
  Wait for the user to reply with their selection.
  The user's selection will arrive as: "[Opportunity Name] (ID: 006xxxxxxxxxxxxxxx)"
  Extract the 18-character Opportunity ID (starts with '006') from that message.

STEP 3 — RESOLVE PRICING:
  Identify ALL the 18-character Product2 IDs the user wants quoted.
  Product2 IDs always start with '01t'. Find them from the conversation history
  (search results, user-selected products, or the current user message).
  Use the pricing resolution tool (described as resolving Product2 IDs to active
  PricebookEntry IDs and unit prices), passing ALL Product2 IDs as a list in one call.
  If no active pricing is returned for any product, inform the user and do not proceed.

STEP 4 — CREATE QUOTE:
  Use the quote creation tool (described as submitting a Quote Graph to Salesforce CPQ),
  passing ALL resolved line items (one per product) AND the confirmed Opportunity ID from Step 2.
  A single quote can contain multiple line items — include all of them in one call.
  Report the Quote ID back to the user with a clear success message.

- NEVER skip or reorder steps — always Account → Opportunity → Pricing → Quote
- NEVER use the quote creation tool without a confirmed Opportunity ID from Step 2
- NEVER use a product name as a product identifier — only exact 18-character Product2 IDs
- A quote can include multiple products — resolve pricing for all of them in one call and
  submit all line items together in a single quote creation call
- If a Salesforce error occurs, explain it clearly and do not retry automatically
- You do not search for products — that is exclusively the Catalog Scout's responsibility
        """,
        tools=[toolset],
        before_model_callback=sequence_repair_hook,
    )


def _build_deal_manager(
    catalog_scout: LlmAgent,
    quote_architect: LlmAgent,
) -> LlmAgent:
    """Builds the Deal Manager coordinator agent."""
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


# ---------------------------------------------------------------------------
# Lifespan — application startup and shutdown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initializes all agents and MCP connections on startup, tears them down on shutdown."""
    global _app_state

    logger.info("=" * 58)
    logger.info("  DEAL MANAGEMENT API  |  ADK 1.28.0 Stable  |  Port %d", SERVER_PORT)
    logger.info("=" * 58)
    logger.info("Starting MCP server connections...")

    # Each sub-agent gets its own isolated MCP subprocess to avoid shared state.
    mcp_scout = _build_mcp_toolset()
    mcp_architect = _build_mcp_toolset()

    catalog_scout   = _build_catalog_scout(mcp_scout)
    quote_architect = _build_quote_architect(mcp_architect)
    deal_manager    = _build_deal_manager(catalog_scout, quote_architect)

    # _root_runner  — Deal_Manager as root (initial routing, product search)
    # _quote_runner — Quote_Architect as root (direct access, skips Deal_Manager)
    # Both share the same session_service so conversation history is preserved
    # when the active runner switches mid-conversation.
    root_runner = Runner(
        app_name=APP_NAME,
        agent=deal_manager,
        session_service=session_service,
    )
    quote_runner = Runner(
        app_name=APP_NAME,    # SAME app_name = shared session history!
        agent=quote_architect,
        session_service=session_service,
    )

    _app_state = AppState(root_runner=root_runner, quote_runner=quote_runner)

    logger.info("✅ Deal_Manager coordinator initialized")
    logger.info("✅ Catalog_Scout ready (MCP subprocess #1)")
    logger.info("✅ Quote_Architect ready (MCP subprocess #2)")
    logger.info("✅ Quote_Architect direct runner ready (bypasses Deal_Manager)")
    logger.info("✅ Runner configured — stable ADK 1.28.0")

    yield  # Application runs here

    logger.info("Closing MCP connections...")
    for toolset in [mcp_scout, mcp_architect]:
        try:
            result = toolset.close()
            if hasattr(result, "__await__"):
                await result
        except Exception as exc:
            logger.warning("MCP toolset close warning: %s", exc)
    logger.info("Shutdown complete.")


# ---------------------------------------------------------------------------
# FastAPI Application
# ---------------------------------------------------------------------------
app = FastAPI(
    title="Deal Management API v2",
    description="Multi-agent Salesforce CPQ system — ADK 1.28.0 Stable",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Helper: Extract text from a tool function response object
# Extracted from the WebSocket handler to keep it focused on orchestration.
# ---------------------------------------------------------------------------
def _extract_tool_text(fn_resp: object) -> str:
    """Pulls the plain-text payload out of an ADK function response object."""
    response_data = getattr(fn_resp, "response", {})
    if not isinstance(response_data, dict):
        return ""
    content_list = response_data.get("content", [])
    if content_list and isinstance(content_list, list):
        return content_list[0].get("text", "")
    if "output" in response_data:
        return str(response_data.get("output", ""))
    return ""


# ---------------------------------------------------------------------------
# Helper: Handle tool result side effects
# Responsible for picklist emission and quote flow state transitions.
# Isolated here so the main event loop stays readable.
# ---------------------------------------------------------------------------
async def _handle_tool_result(
    tool_name: str,
    text_content: str,
    session_id: str,
    websocket: WebSocket,
    state: AppState,
) -> None:
    """Processes side effects triggered by specific tool results."""

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

    # ── Build and send the TOOL_RESULT payload ────────────────────────────
    payload: dict = {"type": "TOOL_RESULT", "tool": tool_name, "data": text_content}
    if tool_name == TOOL_QUOTE:
        try:
            parsed = json.loads(text_content)
            parsed["instance_url"] = _SF_INSTANCE_URL
            payload["data"] = json.dumps(parsed)
        except json.JSONDecodeError as exc:
            logger.warning("Could not inject instance_url into quote response: %s", exc)

    await websocket.send_json(payload)


# ---------------------------------------------------------------------------
# Helper: Process ADK event stream for one user turn
# Contains the entire event loop logic, separated from session setup/teardown.
# ---------------------------------------------------------------------------
async def _process_events(
    runner: Runner,
    message: types.Content,
    session_id: str,
    websocket: WebSocket,
    state: AppState,
) -> None:
    """Streams ADK events for a single user turn and emits WebSocket messages."""
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
            text_content = _extract_tool_text(fn_resp)
            logger.info("[TOOL RESULT] %s → %d chars", tool_name, len(text_content))
            await _handle_tool_result(tool_name, text_content, session_id, websocket, state)

        # ── Final text reply ──────────────────────────────────────────────
        if event.is_final_response() and event.content:
            for part in event.content.parts or []:
                if hasattr(part, "text") and part.text:
                    logger.info("[REPLY] %s...", part.text[:120])
                    await websocket.send_json({"type": "FINAL_REPLY", "data": part.text})


# ---------------------------------------------------------------------------
# WebSocket Endpoint — lean orchestrator
# Responsibilities: session lifecycle, runner selection, and error handling.
# All event processing is delegated to _process_events().
# ---------------------------------------------------------------------------
@app.websocket("/ws/orchestrate")
async def websocket_endpoint(websocket: WebSocket) -> None:
    await websocket.accept()
    logger.info("Client connected.")

    if _app_state is None:
        await websocket.send_json({"type": "ERROR", "data": "Server not initialized yet."})
        await websocket.close()
        return

    session_id = f"session_{uuid.uuid4().hex[:10]}"
    try:
        await session_service.create_session(
            app_name=APP_NAME,
            user_id=USER_ID,
            session_id=session_id,
        )
    except Exception as exc:
        # Session may already exist from a reconnect — this is non-fatal.
        logger.debug("Session creation note for %s: %s", session_id, exc)

    logger.info("Session started: %s", session_id)

    try:
        while True:
            user_input: str = await websocket.receive_text()
            if not user_input.strip():
                continue

            # Choose runner based on active quote flow.
            # If mid-quote-creation, use quote_runner which routes directly to
            # Quote_Architect, skipping Deal_Manager entirely. Both runners
            # share InMemorySessionService so conversation history is preserved.
            in_quote_flow = _app_state.quote_flow.get(session_id, False)
            active_runner = _app_state.quote_runner if in_quote_flow else _app_state.root_runner
            if in_quote_flow:
                logger.info("Quote_Architect runner active (Deal_Manager bypassed)")

            logger.info("Message received: %s", user_input)
            await websocket.send_json({"type": "STATE", "state": "orchestrating"})

            message = types.Content(role="user", parts=[types.Part(text=user_input)])
            await _process_events(active_runner, message, session_id, websocket, _app_state)
            await websocket.send_json({"type": "STATE", "state": "completed"})

    except WebSocketDisconnect:
        logger.info("Client disconnected. Session: %s", session_id)
        _app_state.quote_flow.pop(session_id, None)
        try:
            await session_service.delete_session(
                app_name=APP_NAME, user_id=USER_ID, session_id=session_id,
            )
            logger.info("Conversation history cleared for session %s", session_id)
        except Exception as exc:
            logger.warning("Failed to clear session %s: %s", session_id, exc)

    except Exception as exc:
        logger.error("WebSocket error for session %s: %s", session_id, exc, exc_info=True)
        _app_state.quote_flow.pop(session_id, None)
        try:
            await websocket.send_json({"type": "ERROR", "data": str(exc)})
        except Exception:
            pass  # Client already disconnected — nothing we can do.


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)
