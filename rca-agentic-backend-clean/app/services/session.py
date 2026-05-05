"""
app/services/session.py
=======================
Shared InMemorySessionService singleton.

Both root_runner and quote_runner reference this same instance so that
conversation history is preserved when the active runner switches
mid-conversation (e.g. after account selection in quote flow).
"""

from google.adk.sessions import InMemorySessionService

session_service = InMemorySessionService()
