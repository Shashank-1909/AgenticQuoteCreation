"""
app/tools/mcp_factory.py
========================
Factory for creating isolated MCP subprocess toolsets.

Each agent gets its own subprocess so they never share state.
The factory is a separate module so agent files stay clean and
the MCP configuration (timeout, script path) lives in one place.
"""

import sys

from google.adk.tools.mcp_tool.mcp_toolset import McpToolset
from google.adk.tools.mcp_tool.mcp_session_manager import StdioConnectionParams
from mcp import StdioServerParameters

from app.core.config import MCP_TIMEOUT, MCP_SERVER_SCRIPT


def build_mcp_toolset(env: dict = None) -> McpToolset:
    """Creates a new isolated MCP subprocess toolset for one agent."""
    import os
    # Ensure the subprocess has access to current env vars + our custom role
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    return McpToolset(
        connection_params=StdioConnectionParams(
            server_params=StdioServerParameters(
                command=sys.executable,
                args=["-u", MCP_SERVER_SCRIPT],
                env=merged_env,
            ),
            timeout=MCP_TIMEOUT,
        )
    )

