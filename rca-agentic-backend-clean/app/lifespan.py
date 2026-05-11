"""
app/lifespan.py
===============
FastAPI lifespan context manager — wires all components together.

This is the composition root of the application. On startup it:
  1. Creates two isolated MCP subprocess toolsets (one per agent)
  2. Builds all three agents
  3. Creates two runners (root and quote)
  4. Wraps them in AppState and injects it into the WebSocket module

On shutdown it cleanly closes both MCP subprocesses.

Nothing else in the codebase knows how the pieces fit together — only this module.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI
from google.adk.runners import Runner

from app.core.config import APP_NAME, SERVER_PORT
from app.core.state import AppState
from app.tools.mcp_factory import build_mcp_toolset
from app.agents.catalog_scout import build_catalog_scout
from app.agents.quote_architect import build_quote_architect
from app.agents.deal_manager import build_deal_manager
from app.services.session import session_service
from app.api import websocket as ws_module

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """FastAPI lifespan: startup → yield → shutdown."""

    logger.info("=" * 58)
    logger.info("  DEAL MANAGEMENT API  |  ADK 1.28.0 Stable  |  Port %d", SERVER_PORT)
    logger.info("=" * 58)
    logger.info("Starting MCP server connections...")

    # Each sub-agent gets its own isolated MCP subprocess to avoid shared state.
    mcp_scout     = build_mcp_toolset()
    mcp_architect = build_mcp_toolset()

    catalog_scout   = build_catalog_scout(mcp_scout)
    quote_architect = build_quote_architect(mcp_architect)
    deal_manager    = build_deal_manager(catalog_scout, quote_architect)

    # _root_runner  — Deal_Manager as root (initial routing, product search)
    # _quote_runner — Quote_Architect as root (direct, skips Deal_Manager)
    # Both share the same session_service so conversation history is preserved
    # when the active runner switches mid-conversation.
    root_runner = Runner(
        app_name=APP_NAME,
        agent=deal_manager,
        session_service=session_service,
    )
    quote_runner = Runner(
        app_name=APP_NAME,      # SAME app_name = shared session history!
        agent=quote_architect,
        session_service=session_service,
    )

    state = AppState(root_runner=root_runner, quote_runner=quote_runner)
    ws_module.set_app_state(state)

    logger.info("✅ Deal_Manager coordinator initialized")
    logger.info("✅ Catalog_Scout ready (MCP subprocess #1)")
    logger.info("✅ Quote_Architect ready (MCP subprocess #2)")
    logger.info("✅ Quote_Architect direct runner ready (bypasses Deal_Manager)")
    logger.info("✅ Runner configured — stable ADK 1.28.0")

    yield  # Application runs here

    # ── Shutdown: release MCP subprocess connections ──────────────────────
    logger.info("Closing MCP connections...")
    for toolset in [mcp_scout, mcp_architect]:
        try:
            result = toolset.close()
            if hasattr(result, "__await__"):
                await result
        except Exception as exc:
            logger.warning("MCP toolset close warning: %s", exc)
    logger.info("Shutdown complete.")
