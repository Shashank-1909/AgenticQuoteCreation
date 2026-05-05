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
You are the Quote Architect — a CPQ expert responsible for both creating and updating quotes.

------------------------------------------------------------
CORE MODES
------------------------------------------------------------
You operate in TWO modes:

1. CREATE MODE → Create new quote
2. UPDATE MODE → Modify existing quote

Decide the mode based on user intent.

------------------------------------------------------------
TOOL USAGE
------------------------------------------------------------
- Identify tools by purpose, not name
- Call tools only when required

------------------------------------------------------------
UI RULE (STRICT)
------------------------------------------------------------
- Always send a message BEFORE calling any tool
- Selection lists (accounts, opportunities, quotes) must appear only in UI panel, not chat

------------------------------------------------------------
CONTEXT MANAGEMENT
------------------------------------------------------------
Reuse session context:

- AccountId
- OpportunityId
- QuoteId

If user says:
- "same quote"
- "this quote"
- "existing quote"

→ Continue without asking again

Only ask again if:
- context is missing
- or user explicitly changes it

------------------------------------------------------------
MODE DECISION
------------------------------------------------------------

If user intent is:
- "create quote", "generate quote" → CREATE MODE
- "update", "add", "remove", "discount", "rename" → UPDATE MODE

------------------------------------------------------------
CREATE MODE FLOW
------------------------------------------------------------

Step 1 — Account Selection (WAIT)
Step 2 — Opportunity Selection (WAIT)
Step 3 — Resolve Pricing (AUTO)
Step 4 — Create Quote (AUTO)

Rules:
- Never auto-select account/opportunity
- Wait for user selection
- Once selected → complete remaining steps automatically
- Do not wait after "Create Quote" action

------------------------------------------------------------
UPDATE MODE FLOW
------------------------------------------------------------

CASE 1 — Same Session (Quote exists):
→ Directly perform update

CASE 2 — No Quote Context:
Step 1 — Account Selection (WAIT)
Step 2 — Opportunity Selection (WAIT)
Step 3 — Fetch Quotes (WAIT)
Step 4 — User selects Quote
Step 5 — Perform update (AUTO)

------------------------------------------------------------
PRICING RULE
------------------------------------------------------------
- Always resolve pricing before adding products
- If pricing exists → proceed
- If pricing missing:
  → Stop
  → Inform: "No active pricebook entry for this product"

------------------------------------------------------------
OPERATIONS
------------------------------------------------------------
- Add product → insert line item
- Update quantity → modify line item
- Apply discount → update pricing field
- Remove product → delete line item
- Rename quote → update quote

Handle multiple operations in one flow.

------------------------------------------------------------
EXECUTION RULES
------------------------------------------------------------
- WAIT only for user selections
- AUTO execute when data is available
- Never assume selections
- Never pause unnecessarily

------------------------------------------------------------
PRODUCT HANDLING
------------------------------------------------------------
- Use only Product IDs
- If user gives product names → delegate to Catalog_Scout
- Resume flow after IDs are available

------------------------------------------------------------
ERROR HANDLING
------------------------------------------------------------
- Do not proceed with missing data
- Clearly explain issues
- Do not retry automatically

------------------------------------------------------------
RESPONSE
------------------------------------------------------------
- Confirm action clearly
- Keep response short
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
- Quote_Architect: handles anything related to creating or modifying CPQ quotes for specific products

How to delegate:
- Analyze the intent of the current user message in the context of the full conversation history
- Delegate to the specialist whose role best matches what the user needs right now
- The specialists share the same conversation history — you do not need to summarize or relay prior context
- Never answer product or pricing questions yourself — always delegate to the right specialist

You are a coordinator only. You do not call tools, search for products, or create quotes directly.
If the user's intent is ambiguous, you are ALLOWED to ask the user a clarifying question directly before delegating.
        """,
        sub_agents=[catalog_scout, quote_architect],
        before_model_callback=sequence_repair_hook,
    )

    # -----------------------------------------------------------------------
    # Runners
    # _root_runner  — Deal_Manager as root (initial routing, product search)
    # _quote_runner — Quote_Manager as root (direct access, skips Deal_Manager)
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

            # --- Detect refinement query ---
            def is_refinement_query(text: str) -> bool:
                keywords = ["from above", "from previous", "in those", "that list", "among them"]
                return any(k in text.lower() for k in keywords)

            session_data = session_service.sessions.get(session_id)

            if session_data:
                last_results = session_data.state.get("last_product_results")

                if is_refinement_query(user_input) and last_results:
                    try:
                        keyword = user_input.lower()

                        filtered = [
                            p for p in last_results.get("products", [])
                            if keyword in json.dumps(p).lower()
                        ]

                        print(f"   [REFINE] Filtered {len(filtered)} products from memory")

                        await websocket.send_json({
                            "type": "TOOL_RESULT",
                            "tool": "refined_search",
                            "data": json.dumps({"products": filtered})
                        })

                        await websocket.send_json({
                            "type": "FINAL_REPLY",
                            "data": "Searched for required filters."
                        })

                        await websocket.send_json({"type": "STATE", "state": "completed"})
                        continue

                    except Exception as e:
                        print(f"   [REFINE ERROR] {e}")
                        
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

                    # --- Store last product search results for refinement ---
                    if tool_name in ("keyword_search", "filter_search"):
                        try:
                            parsed = json.loads(text_content)
                            session_service.sessions[session_id].state["last_product_results"] = parsed
                            print(f"   [MEMORY] Stored last product results")
                        except Exception as e:
                            print(f"   [MEMORY] Store failed: {e}")

                    # ── Emit structured picklist events and manage quote flow state ──
                    if tool_name in ("get_my_accounts", "get_opportunities_for_account", "get_quotes_for_opportunity"):
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
                            elif tool_name == "get_quotes_for_opportunity" and parsed.get("quotes") is not None:
                                await websocket.send_json({
                                    "type":          "USER_SELECTION_NEEDED",
                                    "selection_for": "quote",
                                    "options":       parsed["quotes"],
                                })
                                print(f"   [PICKLIST] Quote selection sent → {len(parsed['quotes'])} options")
                                session_quote_active[session_id] = True
                        except Exception as e:
                            print(f"   [PICKLIST] Parse error: {e}")

                    # When the quote is fully created, exit quote flow mode
                    if tool_name == "evaluate_quote_graph" and "status\":\"success" in text_content:
                        session_quote_active[session_id] = False
                        print(f"   [FLOW] Session {session_id} → quote flow COMPLETE (back to coordinator)")

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
