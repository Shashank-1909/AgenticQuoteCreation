"""
app/api/websocket.py
=====================
WebSocket endpoint — session lifecycle and message routing only.

This module is deliberately thin. Its only responsibilities are:
  - Accept the WebSocket connection
  - Create and clean up the ADK session
  - Choose the correct runner (root vs. quote) for each turn
  - Call process_events() and relay STATE events

All event processing and business logic lives in app.services.event_handler.
"""

import logging
import uuid
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from google.genai import types

from app.core.config import APP_NAME, USER_ID
from app.core.state import AppState
from app.services.session import session_service
from app.services.event_handler import process_events

logger = logging.getLogger(__name__)

# Module-level AppState reference — injected by lifespan at startup via set_app_state().
# Using a setter function (rather than a global reassigned directly) makes the
# dependency explicit and easy to mock in tests.
_app_state: Optional[AppState] = None


def set_app_state(state: AppState) -> None:
    """Called by lifespan to inject the AppState after all agents are initialized."""
    global _app_state
    _app_state = state


async def websocket_endpoint(websocket: WebSocket) -> None:
    """Handles one WebSocket connection (one user conversation session)."""
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
        # Session may already exist from a reconnect — non-fatal.
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
            await process_events(active_runner, message, session_id, websocket, _app_state)
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
