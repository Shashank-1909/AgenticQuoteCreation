"""
app/core/config.py
==================
Central configuration — single source of truth for all constants.
If any name changes, update it here only. Nothing else needs to change.
"""

import json
import logging
import os

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Paths — resolved relative to this file so they work from any working directory
# ---------------------------------------------------------------------------
_BACKEND_ROOT: str = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
_AUTH_PATH:    str = os.path.join(_BACKEND_ROOT, "auth.json")

# ---------------------------------------------------------------------------
# Application identity
# ---------------------------------------------------------------------------
APP_NAME:          str   = "deal_manager_v2"
USER_ID:           str   = "dev"
MODEL_NAME:        str   = "gemini-2.5-pro"
SERVER_PORT:       int   = 8001
MCP_TIMEOUT:       float = 60.0
MCP_SERVER_SCRIPT: str   = os.path.join(_BACKEND_ROOT, "server.py")

# ---------------------------------------------------------------------------
# Tool names — referenced in event-routing logic.
# These match the function names in server.py exactly.
# ---------------------------------------------------------------------------
TOOL_ACCOUNTS:      str = "get_my_accounts"
TOOL_OPPORTUNITIES: str = "get_opportunities_for_account"
TOOL_QUOTE:         str = "evaluate_quote_graph"

# ---------------------------------------------------------------------------
# Salesforce instance URL — loaded from auth.json at import time.
# Falls back to the public login URL if auth.json is absent.
# ---------------------------------------------------------------------------
SF_INSTANCE_URL: str = "https://login.salesforce.com"
try:
    with open(_AUTH_PATH) as _f:
        _auth_data = json.load(_f)
        SF_INSTANCE_URL = _auth_data.get("instance_url", SF_INSTANCE_URL)
except FileNotFoundError:
    logger.warning("auth.json not found — using default Salesforce login URL.")
except json.JSONDecodeError as exc:
    logger.warning("auth.json is malformed and could not be parsed: %s", exc)
