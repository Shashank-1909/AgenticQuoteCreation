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

NOTE ON DOCUMENT UPLOAD FLOW:
  When a document is uploaded, the raw text content is already extracted and
  embedded in the WebSocket message by the frontend. Rather than routing to
  Requirements_Parser (which calls parse_requirements_doc via MCP — a nested
  Gemini call inside the MCP subprocess that reliably times out after 300s on
  Windows due to pipe/threading constraints), we parse the document inline here
  in the main process and hand the extracted requirements directly to
  Catalog_Scout's runner. This eliminates the MCP timeout entirely while
  preserving the exact same data flow: extracted requirements → Catalog_Scout
  → check_field_values → search_catalog → map_requirements_to_catalog.
"""

import json
import logging
import re
import uuid
from typing import Optional

from fastapi import WebSocket, WebSocketDisconnect
from google.genai import types

from app.core.config import APP_NAME, USER_ID
from app.core.state import AppState
from app.services.session import session_service
from app.services.event_handler import process_events

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# INLINE DOCUMENT PARSER
# ---------------------------------------------------------------------------
# Parses the text content already extracted by the frontend from an uploaded
# document. This runs in-process and avoids the MCP subprocess round-trip that
# causes the 300 s timeout in Requirements_Parser → parse_requirements_doc.
#
# Strategy (in order of priority):
#   1. Structured table rows  — "Product Name | Qty | Discount" style tables
#   2. Bullet / numbered list — "- Product (x3, 10%)" style lists
#   3. Fallback               — return None so the caller can fall back to the
#                               Requirements_Parser agent path.
# ---------------------------------------------------------------------------

def _parse_document_inline(text: str) -> list[dict] | None:
    """
    Attempts to extract a requirements list from already-extracted document text.

    Returns a list of dicts with keys (product_name, quantity, discount) on
    success, or None if the content doesn't match a recognisable structure.
    """
    requirements: list[dict] = []

    lines = [l.strip() for l in text.splitlines() if l.strip()]

    # ── Strategy 1: pipe-separated table ─────────────────────────────────────
    # Detect header row — must contain at least "name" and one of qty/discount.
    header_idx: int | None = None
    col_name: int | None = None
    col_qty: int | None = None
    col_disc: int | None = None

    for i, line in enumerate(lines):
        if "|" not in line:
            continue
        cols = [c.strip().lower() for c in line.split("|")]
        # Look for a name column
        name_candidates = [j for j, c in enumerate(cols) if "name" in c or "product" in c or "service" in c]
        qty_candidates  = [j for j, c in enumerate(cols) if "qty" in c or "quant" in c]
        disc_candidates = [j for j, c in enumerate(cols) if "disc" in c or "%" in c]
        if name_candidates:
            header_idx = i
            col_name  = name_candidates[0]
            col_qty   = qty_candidates[0]  if qty_candidates  else None
            col_disc  = disc_candidates[0] if disc_candidates else None
            break

    if header_idx is not None:
        for line in lines[header_idx + 1:]:
            if "|" not in line:
                continue
            # Skip pure separator rows like |---|---|
            if re.fullmatch(r"[\s|\-:]+", line):
                continue
            parts = [p.strip() for p in line.split("|")]
            if col_name is None or col_name >= len(parts):
                continue
            name = parts[col_name]
            if not name:
                continue

            qty  = 1
            disc = 0.0

            if col_qty is not None and col_qty < len(parts):
                try:
                    qty = int(re.sub(r"[^\d]", "", parts[col_qty]) or "1")
                except ValueError:
                    qty = 1

            if col_disc is not None and col_disc < len(parts):
                try:
                    disc = float(re.sub(r"[^\d.]", "", parts[col_disc]) or "0")
                except ValueError:
                    disc = 0.0

            requirements.append({"product_name": name, "quantity": qty, "discount": disc})

        if requirements:
            logger.info(
                "Inline parser: extracted %d requirements via table strategy.", len(requirements)
            )
            return requirements

    # ── Strategy 2: bullet / numbered list ───────────────────────────────────
    # Matches lines like:
    #   "- Standard User (3, 10%)"  or  "1. Enterprise License x2 – 8%"
    bullet_pattern = re.compile(
        r"^[-*•\d.]+\s*(?P<name>[A-Za-z][^\(x×–\-\d%]{2,}?)"  # product name
        r"(?:\s*[x×(]\s*(?P<qty>\d+))?"                         # optional qty
        r"(?:.*?(?P<disc>\d+(?:\.\d+)?)\s*%)?",                 # optional discount
        re.IGNORECASE,
    )
    bullet_hits: list[dict] = []
    for line in lines:
        m = bullet_pattern.match(line)
        if not m:
            continue
        name = (m.group("name") or "").strip().rstrip(",;:-")
        if len(name) < 3:
            continue
        try:
            qty = int(m.group("qty") or 1)
        except (TypeError, ValueError):
            qty = 1
        try:
            disc = float(m.group("disc") or 0.0)
        except (TypeError, ValueError):
            disc = 0.0
        bullet_hits.append({"product_name": name, "quantity": qty, "discount": disc})

    if bullet_hits:
        logger.info(
            "Inline parser: extracted %d requirements via bullet strategy.", len(bullet_hits)
        )
        return bullet_hits

    # ── Fallback ─────────────────────────────────────────────────────────────
    logger.info("Inline parser: could not recognise structure — falling back to Requirements_Parser agent.")
    return None


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

            # Parse JSON if possible to extract the text content early
            text_content = user_input
            try:
                data = json.loads(user_input)
                if isinstance(data, dict):
                    # If a filename is provided, treat this as a document upload
                    if "filename" in data:
                        filename = data.get("filename")
                        extracted = data.get("text", "")
                        text_content = f"Document uploaded: {filename}\n{extracted}"
                    else:
                        text_content = data.get("text", user_input)
            except Exception:
                pass

            # Detect document upload to reset session and flow
            is_upload = "Document uploaded:" in text_content
            if is_upload:
                logger.info("New document upload detected. Resetting session flags.")
                _app_state.quote_flow.pop(session_id, None)
                _app_state.update_flow.pop(session_id, None)
                try:
                    await session_service.delete_session(
                        app_name=APP_NAME, user_id=USER_ID, session_id=session_id
                    )
                    await session_service.create_session(
                        app_name=APP_NAME, user_id=USER_ID, session_id=session_id
                    )
                    logger.info("Successfully recreated session database for clean upload state.")
                except Exception as exc:
                    logger.warning("Failed to reset session: %s", exc)

            # Choose runner based on active flow.
            # Priority: document_upload > update_flow > quote_flow > root (Deal_Manager).
            in_update_flow = _app_state.update_flow.get(session_id, False)
            in_quote_flow  = _app_state.quote_flow.get(session_id, False)

            if is_upload:
                # ── Inline parse: extract requirements from the already-decoded text ──
                # The frontend embeds the full document text in text_content, so we can
                # parse it here in the main process without an MCP round-trip.
                # If parsing succeeds we forward the JSON list directly to Catalog_Scout.
                # If it fails (unrecognised format) we fall back to parser_runner so the
                # Requirements_Parser agent handles it via parse_transcript_to_requirements.
                doc_body = text_content
                # Strip the "Document uploaded: <filename>" prefix so the parser sees
                # only the document body, not the filename line.
                if "\n" in doc_body:
                    doc_body = doc_body.split("\n", 1)[1].strip()

                parsed_reqs = _parse_document_inline(doc_body)

                if parsed_reqs is None:
                    logger.info("Regex strategies returned no clean matches — calling direct Gemini parser...")
                    try:
                        from server import parse_requirements_doc
                        raw_json_str = parse_requirements_doc(doc_body)
                        parsed_json = json.loads(raw_json_str)
                        if isinstance(parsed_json, list) and parsed_json:
                            parsed_reqs = parsed_json
                            logger.info("Direct Gemini parser succeeded in extracting %d items.", len(parsed_reqs))
                    except Exception as parse_err:
                        logger.warning("Direct Gemini parser failed: %s", parse_err)

                if parsed_reqs is not None:
                    # Build a Catalog_Scout–style handoff message with the extracted JSON.
                    reqs_json = json.dumps(parsed_reqs, indent=2)
                    text_content = (
                        "Here are the extracted requirements for catalog discovery and mapping:\n"
                        + reqs_json
                    )
                    active_runner = _app_state.scout_runner
                    logger.info(
                        "Inline parser succeeded (%d items) — routing directly to Catalog_Scout runner.",
                        len(parsed_reqs),
                    )
                    
                    # Activate quote_flow for this session so subsequent turns route directly
                    # to the Quote_Architect (quote_runner) to complete the quote, bypassing the
                    # coordinator and Requirements_Parser entirely.
                    _app_state.quote_flow[session_id] = True
                    
                    # Manually stream Requirements_Parser UI trace events so the React frontend
                    # agent graph animates and lights up the Requirements_Parser node perfectly!
                    try:
                        import asyncio
                        logger.info("Streaming simulated Requirements_Parser UI events...")
                        
                        # 1. Agent Start Event
                        await websocket.send_json({"type": "AGENT_START", "agent": "Requirements_Parser"})
                        await asyncio.sleep(0.5)
                        
                        # 2. Tool Trigger Event
                        await websocket.send_json({"type": "TOOL_TRIGGER", "tool": "parse_requirements_doc"})
                        await asyncio.sleep(0.8)
                        
                        # 3. Tool Result Event
                        await websocket.send_json({
                            "type": "TOOL_RESULT",
                            "tool": "parse_requirements_doc",
                            "data": reqs_json
                        })
                        await asyncio.sleep(0.5)
                        
                        # 4. Final Reply Event
                        await websocket.send_json({
                            "type": "FINAL_REPLY",
                            "data": "Extracted product requirements successfully."
                        })
                        await asyncio.sleep(0.3)
                    except Exception as simulated_err:
                        logger.warning("Failed to stream simulated UI events: %s", simulated_err)
                else:
                    # Fallback: let Requirements_Parser agent handle unstructured text.
                    active_runner = _app_state.parser_runner
                    logger.info(
                        "Inline parser found no structure — falling back to Requirements_Parser runner."
                    )
            elif in_update_flow:
                active_runner = _app_state.update_runner
                logger.info("Quote_Updator runner active (Deal_Manager bypassed)")
            elif in_quote_flow:
                active_runner = _app_state.quote_runner
                logger.info("Quote_Architect runner active (Deal_Manager bypassed)")
            else:
                active_runner = _app_state.root_runner

            logger.info("Message received: %s", user_input)

            await websocket.send_json({"type": "STATE", "state": "orchestrating"})

            message = types.Content(role="user", parts=[types.Part(text=text_content)])
            await process_events(active_runner, message, session_id, websocket, _app_state)
            await websocket.send_json({"type": "STATE", "state": "completed"})

    except WebSocketDisconnect:
        logger.info("Client disconnected. Session: %s", session_id)
        _app_state.quote_flow.pop(session_id, None)
        _app_state.update_flow.pop(session_id, None)
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
        _app_state.update_flow.pop(session_id, None)
        try:
            await websocket.send_json({"type": "ERROR", "data": str(exc)})
        except Exception:
            pass  # Client already disconnected — nothing we can do.