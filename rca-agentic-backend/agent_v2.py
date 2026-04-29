"""
Deal Management API — Stable ADK 1.28.0
========================================
Multi-agent Salesforce CPQ orchestration using the Coordinator/sub_agents pattern.
Uses global Python interpreter (stable google-adk 1.28.0), NOT the venv.

Run with: python agent_v2.py
Serves on: http://0.0.0.0:8001
"""

import os
import sys
import json
import uuid
from typing import Optional
from contextlib import asynccontextmanager

from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

load_dotenv()

# ---------------------------------------------------------------------------
# Salesforce instance URL — loaded from auth.json for frontend deep links
# ---------------------------------------------------------------------------
_AUTH_PATH = os.path.join(os.path.dirname(__file__), "auth.json")
_SF_INSTANCE_URL = "https://login.salesforce.com"
try:
    with open(_AUTH_PATH) as _f:
        _auth = json.load(_f)
        _SF_INSTANCE_URL = _auth.get("instance_url", _SF_INSTANCE_URL)
except Exception:
    pass

# ---------------------------------------------------------------------------
# ADK Stable 1.28.0 imports
# ---------------------------------------------------------------------------
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
    if not llm_request or not llm_request.contents:
        return None

    repaired = []
    for content in llm_request.contents:
        role = getattr(content, "role", None) or "unknown"
        if repaired:
            last_role = getattr(repaired[-1], "role", None) or "unknown"
            if last_role == "model" and role == "model":
                repaired.append(types.Content(
                    role="user",
                    parts=[types.Part(text="[SYSTEM: sequence sync]")]
                ))
        repaired.append(content)

    # Trailing model turn
    if repaired and getattr(repaired[-1], "role", "") == "model":
        repaired.append(types.Content(
            role="user",
            parts=[types.Part(text="[SYSTEM: sequence sync]")]
        ))

    # Leading model turn
    if repaired and getattr(repaired[0], "role", "") == "model":
        repaired.insert(0, types.Content(
            role="user",
            parts=[types.Part(text="[SYSTEM: sequence sync]")]
        ))

    llm_request.contents = repaired
    return None


# ---------------------------------------------------------------------------
# Shared session service
# ---------------------------------------------------------------------------
session_service = InMemorySessionService()

# Module-level references populated in lifespan
_root_runner:  Optional[Runner] = None   # Coordinator runner (Deal_Manager as root)
_quote_runner: Optional[Runner] = None   # Direct runner (Quote_Architect as root)
_mcp_scout:    Optional[McpToolset] = None
_mcp_architect: Optional[McpToolset] = None

# ---------------------------------------------------------------------------
# Session Quote Flow Tracker
# When a session enters the quote creation flow (get_my_accounts is called),
# we switch to _quote_runner which routes directly to Quote_Architect WITHOUT
# going through Deal_Manager. Both runners share the same InMemorySessionService
# so conversation history is preserved across the switch.
# Key:   session_id (str)
# Value: True  = use _quote_runner (Quote_Architect directly)
#        False = use _root_runner  (Deal_Manager coordinator)
# ---------------------------------------------------------------------------
session_quote_active: dict[str, bool] = {}


# ---------------------------------------------------------------------------
# Lifespan — agent initialization and teardown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _root_runner, _quote_runner, _mcp_scout, _mcp_architect

    print("\n" + "=" * 58)
    print("  DEAL MANAGEMENT API  |  ADK 1.28.0 Stable  |  Port 8001")
    print("=" * 58)
    print("[Init] Starting MCP server connections...")

    # Each sub-agent gets its own isolated MCP subprocess to avoid state sharing.
    # Native `timeout=60.0` in stable ADK — no monkey-patching required.
    _mcp_scout = McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command=sys.executable,
                args=["-u", "server.py"],
            ),
            timeout=60.0,
        )
    )

    _mcp_architect = McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command=sys.executable,
                args=["-u", "server.py"],
            ),
            timeout=60.0,
        )
    )

    # -----------------------------------------------------------------------
    # Catalog Scout
    # Responsible for all product discovery operations.
    # -----------------------------------------------------------------------
    catalog_scout = LlmAgent(
        name="Catalog_Scout",
        model="gemini-2.5-pro",
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
        tools=[_mcp_scout],
        before_model_callback=sequence_repair_hook,
    )

    # -----------------------------------------------------------------------
    # Quote Architect
    # Responsible for all CPQ quote creation operations.
    # -----------------------------------------------------------------------
    quote_architect = LlmAgent(
        name="Quote_Architect",
        model="gemini-2.5-pro",
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
        tools=[_mcp_architect],
        before_model_callback=sequence_repair_hook,
    )

    # -----------------------------------------------------------------------
    # Deal Manager — Coordinator
    # Routes every user turn to the correct specialist via LLM-driven delegation.
    # -----------------------------------------------------------------------
    deal_manager = LlmAgent(
        name="Deal_Manager",
        model="gemini-2.5-pro",
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

    # -----------------------------------------------------------------------
    # Runners
    # _root_runner  — Deal_Manager as root (initial routing, product search)
    # _quote_runner — Quote_Architect as root (direct access, skips Deal_Manager)
    # Both share the same session_service so conversation history is preserved.
    # -----------------------------------------------------------------------
    _root_runner = Runner(
        app_name="deal_manager_v2",
        agent=deal_manager,
        session_service=session_service,
    )
    _quote_runner = Runner(
        app_name="deal_manager_v2",    # SAME app_name = shared session history!
        agent=quote_architect,
        session_service=session_service,
    )

    print("[Init] ✅ Deal_Manager coordinator initialized")
    print("[Init] ✅ Catalog_Scout ready (MCP subprocess #1)")
    print("[Init] ✅ Quote_Architect ready (MCP subprocess #2)")
    print("[Init] ✅ Quote_Architect direct runner ready (bypasses Deal_Manager)")
    print("[Init] ✅ Runner configured — stable ADK 1.28.0\n")

    yield  # Application runs here

    # -----------------------------------------------------------------------
    # Shutdown: release MCP subprocess connections
    # -----------------------------------------------------------------------
    print("\n[Shutdown] Closing MCP connections...")
    for toolset in [_mcp_scout, _mcp_architect]:
        try:
            result = toolset.close()
            if hasattr(result, "__await__"):
                await result
        except Exception as e:
            print(f"[Shutdown] Warning: {e}")
    print("[Shutdown] Done.")


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
# WebSocket Endpoint
# ---------------------------------------------------------------------------
@app.websocket("/ws/orchestrate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("\n[WebSocket] Client connected.")

    if _root_runner is None:
        await websocket.send_json({"type": "ERROR", "data": "Server not initialized yet."})
        await websocket.close()
        return

    # Each WebSocket connection = one persistent conversation session
    session_id = f"session_{uuid.uuid4().hex[:10]}"
    try:
        await session_service.create_session(
            app_name="deal_manager_v2",
            user_id="dev",
            session_id=session_id,
        )
    except Exception:
        pass

    print(f"[WebSocket] Session: {session_id}")

    try:
        while True:
            user_input = await websocket.receive_text()
            if not user_input.strip():
                continue

            # ── Choose runner based on active quote flow ───────────────────────
            # If this session is mid-quote-creation (account/opportunity was shown),
            # use _quote_runner which has Quote_Architect as root — Deal_Manager is
            # completely skipped. Both runners share InMemorySessionService so the
            # full conversation history (product names, IDs, etc.) is available.
            in_quote_flow = session_quote_active.get(session_id, False)
            active_runner = _quote_runner if in_quote_flow else _root_runner
            if in_quote_flow:
                print(f"   [DIRECT] Quote_Architect runner (Deal_Manager bypassed)")

            print(f"\n[WS] Message: {user_input}")
            await websocket.send_json({"type": "STATE", "state": "orchestrating"})

            message = types.Content(role="user", parts=[types.Part(text=user_input)])
            current_agent = None

            async for event in active_runner.run_async(
                user_id="dev",
                session_id=session_id,
                new_message=message,
            ):
                # --- Agent transition ---
                agent_name = getattr(event, "author", None)
                if agent_name and agent_name != current_agent:
                    current_agent = agent_name
                    print(f"   [AGENT] {agent_name}")
                    await websocket.send_json({"type": "AGENT_START", "agent": agent_name})

                # --- Tool call (LLM → Tool) ---
                for fn_call in (event.get_function_calls() or []):
                    tool_name = getattr(fn_call, "name", "unknown")
                    print(f"   [TOOL CALL] → {tool_name}")
                    await websocket.send_json({"type": "TOOL_TRIGGER", "tool": tool_name})

                # --- Tool response (Tool → LLM) ---
                for fn_resp in (event.get_function_responses() or []):
                    tool_name = getattr(fn_resp, "name", "")
                    response_data = getattr(fn_resp, "response", {})
                    text_content = ""
                    if isinstance(response_data, dict):
                        content_list = response_data.get("content", [])
                        if content_list and isinstance(content_list, list):
                            text_content = content_list[0].get("text", "")
                        elif "output" in response_data:
                            text_content = str(response_data.get("output", ""))
                    print(f"   [TOOL RESULT] {tool_name} → {len(text_content)} chars")

                    # ── Emit structured picklist events and manage quote flow state ──
                    if tool_name in ("get_my_accounts", "get_opportunities_for_account"):
                        try:
                            parsed = json.loads(text_content)
                            if tool_name == "get_my_accounts" and parsed.get("accounts"):
                                await websocket.send_json({
                                    "type":          "USER_SELECTION_NEEDED",
                                    "selection_for": "account",
                                    "options":       parsed["accounts"],
                                })
                                print(f"   [PICKLIST] Account selection sent → {len(parsed['accounts'])} options")
                                # Switch to direct QA runner for next turn (skip Deal_Manager)
                                session_quote_active[session_id] = True
                                print(f"   [FLOW] Session {session_id} → quote flow ACTIVE (direct runner)")
                            elif tool_name == "get_opportunities_for_account" and parsed.get("opportunities") is not None:
                                await websocket.send_json({
                                    "type":          "USER_SELECTION_NEEDED",
                                    "selection_for": "opportunity",
                                    "options":       parsed["opportunities"],
                                })
                                print(f"   [PICKLIST] Opportunity selection sent → {len(parsed['opportunities'])} options")
                                # Keep quote flow active for opportunity -> quote step
                                session_quote_active[session_id] = True
                        except Exception as e:
                            print(f"   [PICKLIST] Parse error: {e}")

                    # When the quote is fully created, exit quote flow mode
                    if tool_name == "evaluate_quote_graph":
                        try:
                            parsed = json.loads(text_content)
                            if parsed.get("status") == "success":
                                session_quote_active[session_id] = False
                                print(f"   [FLOW] Session {session_id} → quote flow COMPLETE (back to coordinator)")
                        except Exception:
                            pass

                    payload = {"type": "TOOL_RESULT", "tool": tool_name, "data": text_content}
                    if tool_name == "evaluate_quote_graph":
                        try:
                            parsed = json.loads(text_content)
                            parsed["instance_url"] = _SF_INSTANCE_URL
                            payload["data"] = json.dumps(parsed)
                        except Exception:
                            pass
                    await websocket.send_json(payload)

                # --- Final text reply ---
                if event.is_final_response() and event.content:
                    for part in event.content.parts or []:
                        if hasattr(part, "text") and part.text:
                            print(f"   [REPLY] {part.text[:120]}...")
                            await websocket.send_json({"type": "FINAL_REPLY", "data": part.text})

            await websocket.send_json({"type": "STATE", "state": "completed"})

    except WebSocketDisconnect:
        print(f"\n[WebSocket] Client disconnected. Session: {session_id}")
        session_quote_active.pop(session_id, None)  # clean up any dangling flow state
        try:
            await session_service.delete_session(app_name="deal_manager_v2", user_id="dev", session_id=session_id)
            print(f"   [MEMORY] Cleared conversation history for {session_id}")
        except Exception as e:
            print(f"   [MEMORY] Failed to clear session: {e}")
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        session_quote_active.pop(session_id, None)
        try:
            await websocket.send_json({"type": "ERROR", "data": str(e)})
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
