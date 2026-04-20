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
_root_runner: Optional[Runner] = None
_mcp_scout: Optional[McpToolset] = None
_mcp_architect: Optional[McpToolset] = None


# ---------------------------------------------------------------------------
# Lifespan — agent initialization and teardown
# ---------------------------------------------------------------------------
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _root_runner, _mcp_scout, _mcp_architect

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

Your responsibility is to find products that match what the user is looking for and return complete, 
structured information about each result.

How to approach a search:
- Extract the meaningful intent from the user's current message (ignore filler words)
- Use your available tools to validate the search tokens and determine the best search strategy
- The tools will dynamically guide you on whether to use attribute-based or name-based search — follow their guidance
- Execute the search against the live Salesforce catalog

How to present results:
- Present each product clearly with its name, product code, category, and full 18-character Product2 ID
- The Product2 ID is critical for downstream operations — it must always be included in your response
- If no products are found, say so clearly and suggest how the user might refine their query
- Never fabricate products, IDs, or pricing data

You are a read-only discovery agent. You do not create quotes, modify records, or perform any write operations.
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

How to create a quote:
- Identify the product the user wants to quote by reading the current message and conversation history
- Locate the exact 18-character Product2 ID for that product from prior search results in this session
  (Product2 IDs always start with '01t', e.g. '01tNS00000XsT5FYAV')
- Use your tools to resolve the active pricebook pricing for that Product2 ID
- If no active pricing is returned, inform the user clearly and do not proceed
- Submit the quote to Salesforce using the resolved pricing data and report the Quote ID back to the user

Critical principles:
- Never use a product name, keyword, or description as a product identifier — only exact 18-character IDs
- Submit one product per quote submission — do not batch multiple products in a single call
- If Salesforce returns a validation error, read it carefully and explain it in plain language to the user
- If the Product2 ID is not available in the conversation history, ask the user to search for the product first
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

You are a coordinator only. You do not call tools, search for products, or create quotes directly.
        """,
        sub_agents=[catalog_scout, quote_architect],
        before_model_callback=sequence_repair_hook,
    )

    # -----------------------------------------------------------------------
    # Runner — wires the coordinator to the session service
    # -----------------------------------------------------------------------
    _root_runner = Runner(
        app_name="deal_manager_v2",
        agent=deal_manager,
        session_service=session_service,
    )

    print("[Init] ✅ Deal_Manager coordinator initialized")
    print("[Init] ✅ Catalog_Scout ready (MCP subprocess #1)")
    print("[Init] ✅ Quote_Architect ready (MCP subprocess #2)")
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

            print(f"\n[WS] Message: {user_input}")
            await websocket.send_json({"type": "STATE", "state": "orchestrating"})

            message = types.Content(role="user", parts=[types.Part(text=user_input)])
            current_agent = None

            async for event in _root_runner.run_async(
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
    except Exception as e:
        print(f"[WebSocket] Error: {e}")
        try:
            await websocket.send_json({"type": "ERROR", "data": str(e)})
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Entry Point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8001)
