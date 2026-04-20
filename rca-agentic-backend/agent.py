import os
import sys
import asyncio
import json
from dotenv import load_dotenv
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from google.genai import types
from fastapi.middleware.cors import CORSMiddleware
import uvicorn

# Load API credentials securely 
load_dotenv()

# Load Salesforce auth for instance URL (used in frontend deep links)
_AUTH_PATH = os.path.join(os.path.dirname(__file__), 'auth.json')
_SF_INSTANCE_URL = 'https://login.salesforce.com'
try:
    with open(_AUTH_PATH) as _f:
        _auth = json.load(_f)
        _SF_INSTANCE_URL = _auth.get('instance_url', _SF_INSTANCE_URL)
except Exception:
    pass

# PATCH MCP TIMEOUT FOR LONG SALESFORCE CPQ REQUESTS
import mcp.shared.session
from datetime import timedelta

_original_send_request = mcp.shared.session.BaseSession.send_request

async def _patched_send_request(self, request, result_type, request_read_timeout_seconds=None, metadata=None, progress_callback=None):
    return await _original_send_request(
        self, 
        request, 
        result_type, 
        request_read_timeout_seconds=timedelta(seconds=60.0), 
        metadata=metadata, 
        progress_callback=progress_callback
    )

mcp.shared.session.BaseSession.send_request = _patched_send_request

try:
    from google.genai import types
    from google.adk.agents import Agent
    from google.adk.runners import Runner
    from google.adk.sessions import InMemorySessionService
    from google.adk.workflow import Workflow
    
    from mcp import StdioServerParameters
    from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
    from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams

    async def sequence_repair_hook(callback_context=None, llm_request=None, **kwargs):
        request = llm_request
        if not request or not request.contents: return None
        repaired = []
        for c in request.contents:
            c_role = getattr(c, "role", None) or "unknown"
            if repaired:
                last_role = getattr(repaired[-1], "role", None) or "unknown"
                if last_role == "model" and c_role == "model":
                    repaired.append(types.Content(role="user", parts=[types.Part(text="SYSTEM_SEQUENCE_SYNC")]))
            repaired.append(c)
            
        last_role = getattr(repaired[-1], "role", None) or "unknown"
        if last_role == "model":
            repaired.append(types.Content(role="user", parts=[types.Part(text="SYSTEM_SEQUENCE_SYNC")]))
            
        # Ensure sequence starts with User per strict GenAI requirements
        if repaired and getattr(repaired[0], "role", "") == "model":
            repaired.insert(0, types.Content(role="user", parts=[types.Part(text="SYSTEM_SEQUENCE_SYNC")]))
            
        request.contents = repaired
        return None
    
except ImportError as e:
    print(f"ADK v2.0 or MCP modules missing: {e}")
    sys.exit(1)

app = FastAPI(title="Agentic Deal Management API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

session_service = InMemorySessionService()

# Global runner instantiation
root_runner = None

@app.on_event("startup")
async def startup_event():
    global root_runner
    print("--- Initializing Live Dynamic ADK v2.0 Graph Topology via FastAPI...")
    
    try:
        await session_service.create_session(
            app_name="dm_terminal",
            user_id="dev",
            session_id="mem1"
        )
    except Exception as e:
        pass

    raw_server_params = StdioServerParameters(command=sys.executable, args=["-u", "server.py"])
    mcp_server_params = StdioConnectionParams(server_params=raw_server_params)
    deal_manager_toolset = McpToolset(connection_params=mcp_server_params)

    catalog_scout = Agent(
        name="Catalog_Scout",
        model="gemini-2.5-pro",
        mode="single_turn",
        instruction="""
        You are the Catalog Scout. Your ONLY responsibility is to execute product searches in Salesforce.
        1. Read the previous state. If the Strategy assigned is "QUOTE", "STRATEGY: QUOTE", or ANY quote task, you MUST bypass your turn by simply responding with exactly one word: "BYPASS". Do not output anything else.
        2. If the Strategy IS strictly search, validate the parameter terms using your own dataset and rules.
        3. Only after validation, execute `search_products_by_filter` or `search_rca_products`.
        4. NEVER create quotes.
        5. Return the exact search results back to the Coordinator.
        """,
        tools=[deal_manager_toolset],
        before_model_callback=[sequence_repair_hook]
    )

    quote_architect = Agent(
        name="Quote_Architect",
        model="gemini-2.5-pro",
        mode="single_turn",
        instruction="""
        You are the Quote Architect. Your ONLY responsibility is to create Salesforce CPQ quotes.
        1. Read the exact Strategy output by the Query Analyst. 
        2. If the Strategy does NOT explicitly contain the word "QUOTE", you MUST bypass your turn. Do exactly nothing except output the word "BYPASS".
        3. If the Strategy contains QUOTE, carefully identify the 18-character Product2 ID (e.g., '01t...') from the conversation history corresponding to the product the user wants to quote.
        4. CRITICAL: NEVER pass a product name (like "v21") into `resolve_pricebook_entries`. You MUST parse and pass the 18-character Product2 ID precisely.
        5. ALWAYS call `resolve_pricebook_entries` first using the IDs.
        6. Then ALWAYS call `evaluate_quote_graph` to validate and draft the quote. ONLY SEND ONE LINE ITEM/PRODUCT at a time.
        7. Return the finalized Quote ID and details synthesized in natural language.
        """,
        tools=[deal_manager_toolset],
        before_model_callback=[sequence_repair_hook]
    )

    query_analyst = Agent(
        name="Query_Analyst",
        model="gemini-2.5-pro",
        instruction="""
        You are the Query Analyst, the system's Orchestrator and Global Intent Classifier.
        Your responsibility is to parse incoming queries and formulate a strict strategy for downstream execution.
        
        1. Evaluate the user intent. Determine if the objective is a SEARCH, a QUOTE, or BOTH.
        2. CRITICAL: If the user asks to CREATE A QUOTE (even if they use the word "search", like "out of these search products create a quote"), the strategy is strictly QUOTE. Do NOT output BOTH.
        3. Output clearly exactly what the Strategy is (e.g., "STRATEGY: SEARCH" or "STRATEGY: QUOTE").
        4. Provide the clean parameters for the downstream agents.
        5. Do NOT call search or quote tools yourself. You must assign the Strategy and end your turn.
        """,
        before_model_callback=[sequence_repair_hook]
    )

    main_workflow = Workflow(name="deal_manager_workflow", edges=[
        ("START", query_analyst),
        (query_analyst, catalog_scout),
        (catalog_scout, quote_architect)
    ])
    
    root_runner = Runner(
        app_name="dm_terminal", 
        session_service=session_service, 
        agent=main_workflow
    )

@app.websocket("/ws/orchestrate")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    print("\n[WebSocket] Client Connected explicitly to ADK Orchestrator.")
    
    import uuid
    connection_session_id = f"mem_{uuid.uuid4().hex[:8]}"
    try:
        await session_service.create_session(app_name="dm_terminal", user_id="dev", session_id=connection_session_id)
    except Exception:
        pass
    
    try:
        while True:
            # 1. Wait for front-end command
            user_input = await websocket.receive_text()
            if not user_input.strip(): continue
            print(f"\n[WebSocket] Processing payload: {user_input}")
            
            message = types.Content(role="user", parts=[types.Part(text=user_input)])
            current_invocation_id = None
            current_active_agent = None
            
            # Broadcast state
            await websocket.send_json({"type": "STATE", "state": "orchestrating"})
            await asyncio.sleep(0.5) # small delay for UI effect
                
            kwargs = {"user_id": "dev", "session_id": connection_session_id, "new_message": message}
            await websocket.send_json({"type": "STATE", "state": "executing"})
            
            # --- Connection Init ---
            try:
                session = await session_service.get_session(app_name="dm_terminal", user_id="dev", session_id=connection_session_id)
            except Exception as patch_err:
                pass
            # ---------------------------------------------------
            
            async for event in root_runner.run_async(**kwargs):
                
                # 1. Detect Agent/Node transition in the workflow
                node_name = getattr(event, "agent_name", getattr(event, "node", None))
                if node_name and node_name not in ["deal_manager_workflow", current_active_agent]:
                    current_active_agent = node_name
                    print(f"\n   [AGENT SHIFT] Control passed to: {node_name}")
                    await websocket.send_json({"type": "AGENT_START", "agent": node_name})
                
                if hasattr(event, "invocation_id") and event.invocation_id:
                    current_invocation_id = event.invocation_id
                    
                # Detect tool call requests (LLM -> Tool)
                if hasattr(event, "get_function_calls"):
                    for f_call in event.get_function_calls():
                        if f_call:
                            tool_name = getattr(f_call, 'name', 'unknown')
                            print(f"   [MCP Trigger] Agent requested: '{tool_name}'")
                            await websocket.send_json({"type": "TOOL_TRIGGER", "tool": tool_name})
                            
                # Detect tool responses (Tool -> LLM) and send CLEAN structured events
                if hasattr(event, "get_function_responses"):
                    for f_resp in event.get_function_responses():
                        if f_resp:
                            tool_name = getattr(f_resp, 'name', '')
                            response_data = getattr(f_resp, 'response', {})
                            # MCP responses wrap output in a content array
                            text_content = ""
                            if isinstance(response_data, dict):
                                content_list = response_data.get('content', [])
                                if content_list and isinstance(content_list, list):
                                    text_content = content_list[0].get('text', '') if content_list else ''
                                elif 'output' in response_data:
                                    text_content = str(response_data.get('output', ''))
                            print(f"   [TOOL_RESULT] '{tool_name}' responded with {len(text_content)} chars")
                            payload = {"type": "TOOL_RESULT", "tool": tool_name, "data": text_content}
                            # Attach instance_url so frontend can build deep links
                            if tool_name == 'evaluate_quote_graph':
                                try:
                                    parsed_result = json.loads(text_content)
                                    parsed_result['instance_url'] = _SF_INSTANCE_URL
                                    payload['data'] = json.dumps(parsed_result)
                                except Exception:
                                    pass
                            await websocket.send_json(payload)
                            
                # Detect final LLM text reply
                if hasattr(event, "content") and event.content:
                    try:
                        parts = event.content.parts if hasattr(event.content, 'parts') else []
                        for part in (parts or []):
                            # Only send pure text parts (not function calls/responses)
                            if hasattr(part, 'text') and part.text and not hasattr(part, 'function_call') and not hasattr(part, 'function_response'):
                                print(f"   [FINAL_REPLY] Sending text to UI: {part.text[:80]}...")
                                await websocket.send_json({"type": "FINAL_REPLY", "data": part.text})
                    except Exception as parse_err:
                        print(f"   [WARN] Content parse error: {parse_err}")

            # Terminate this explicit task
            await websocket.send_json({"type": "STATE", "state": "completed"})

    except WebSocketDisconnect:
        print("\n[WebSocket] Client disconnected")
    except Exception as e:
        print(f"WebSocket Runtime Error: {e}")
        try:
            await websocket.send_json({"type": "ERROR", "data": str(e)})
        except: pass

if __name__ == "__main__":
    print("\n" + "="*50)
    print("DEAL MANAGEMENT API (PURE ADK v2.0 FAST_API EDITION)")
    print("="*50)
    uvicorn.run(app, host="0.0.0.0", port=8000)
