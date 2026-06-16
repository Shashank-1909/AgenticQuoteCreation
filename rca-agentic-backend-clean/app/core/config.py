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
MCP_TIMEOUT:       float = 300.0
MCP_SERVER_SCRIPT: str   = os.path.join(_BACKEND_ROOT, "server.py")
# MCP_SERVER_SCRIPT: str   = os.path.join(_BACKEND_ROOT, "server_v1.py")
# ---------------------------------------------------------------------------
# Tool names — referenced in event-routing logic.
# These match the function names in server.py exactly.
# ---------------------------------------------------------------------------
TOOL_ACCOUNTS:      str = "get_my_accounts"
TOOL_OPPORTUNITIES: str = "get_opportunities_for_account"
TOOL_QUOTE:         str = "evaluate_quote_graph"

# Quote Updator tools
TOOL_LINE_ITEMS:    str = "get_quote_line_items"
TOOL_MANAGE_LINES:  str = "manage_quote_line_items"

# Twin Hunter tools
TOOL_TWIN_CONTEXT:  str = "get_twin_account_context"
TOOL_TWIN_RESEARCH: str = "research_twin_candidates"
TOOL_TWIN_CARDS:    str = "build_twin_cards"

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

# ---------------------------------------------------------------------------
# Twin Hunter Configuration
# ---------------------------------------------------------------------------

# Operational Limits
TWIN_ACCOUNT_LIMIT: int = 250
TWIN_OPP_CHUNK_SIZE: int = 80
TWIN_OPP_MAX_RECORDS: int = 500
TWIN_QUOTE_MAX_RECORDS: int = 500
TWIN_CONTEXT_OPP_LIMIT: int = 80
TWIN_CONTEXT_NOT_FOUND_LIMIT: int = 30
TWIN_ICP_TOP_ACCOUNTS: int = 5
TWIN_ANCHOR_ACCOUNTS: int = 3

# Card & Display Limits
TWIN_MAX_CARDS_DEFAULT: int = 6
TWIN_MAX_EXISTING_CARDS: int = 4
TWIN_MAX_NET_NEW_CARDS: int = 2
TWIN_MAX_UPSELL_RECS: int = 2
TWIN_MAX_DEAL_HISTORY: int = 5
TWIN_MAX_TOP_PRODUCTS: int = 3

# Tavily Limits
TWIN_TAVILY_MIN_RESULTS: int = 8
TWIN_TAVILY_MAX_RESULTS: int = 20


# Timeouts (Seconds)
TWIN_SF_TIMEOUT: int = 45
TWIN_SF_DESCRIBE_TIMEOUT: int = 30
TWIN_TAVILY_TIMEOUT: int = 45
TWIN_GEMINI_TIMEOUT: int = 55
TWIN_GEMINI_HTTP_TIMEOUT: int = 40

# Matching Thresholds & Weights
TWIN_MATCH_FUZZY_ACCT: float = 0.62
TWIN_MATCH_FUZZY_URL: float = 0.72
TWIN_SCORE_MULTIPLIER: int = 200
TWIN_SCORE_MAX_INDUSTRY: int = 35
TWIN_SCORE_MAX_PRODUCT: int = 45
TWIN_SCORE_MAX_REVENUE: int = 10
TWIN_SCORE_MAX_TAVILY: int = 10
TWIN_SCORE_PENALTY_MAX: int = -25
TWIN_SCORE_NEUTRAL_INDUSTRY: int = 15
TWIN_SCORE_NEUTRAL_PRODUCT: int = 20
TWIN_SCORE_NEUTRAL_REVENUE: int = 5


# Term Extraction
TWIN_TERM_MIN_LEN: int = 3
TWIN_SHARED_TERMS_LIMIT: int = 5

TWIN_STOPWORDS: frozenset[str] = frozenset({
    "about", "above", "across", "advanced", "after", "against", "also",
    "and", "are", "based", "been", "being", "best", "between", "both",
    "business", "can", "company", "companies", "customer", "customers",
    "delivering", "for", "from", "global", "has", "have", "into", "its",
    "leading", "limited", "multiple", "new", "not", "offering", "offers",
    "one", "our", "private", "provides", "providing", "public", "research",
    "services", "solutions", "that", "the", "their", "this", "through",
    "with", "world", "worldwide",
})
TWIN_PENALTY_WORDS: frozenset[str] = frozenset({
    "consulting", "recruiting", "staffing", "agency", "news", 
    "media", "conference", "events", "publisher", "training"
})

# Salesforce Policy
TWIN_SF_API_VERSION: str = "v66.0"
TWIN_CLOSED_WON_STAGES: frozenset[str] = frozenset({"closed won", "accepted", "approved"})
TWIN_CLOSED_LOST_STAGES: frozenset[str] = frozenset({"rejected", "denied", "closed lost"})
