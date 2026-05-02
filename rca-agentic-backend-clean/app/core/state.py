"""
app/core/state.py
=================
AppState dataclass — single container for all mutable runtime state.

Replacing module-level mutable globals with an explicit dataclass makes
dependencies visible, prevents hidden coupling, and makes testing easy.
"""

from dataclasses import dataclass, field

from google.adk.runners import Runner


@dataclass
class AppState:
    """Holds all runtime state for the lifetime of the FastAPI application."""

    root_runner:  Runner  # Deal_Manager as root (initial routing, product search)
    quote_runner: Runner  # Quote_Architect as root (direct access, skips Deal_Manager)

    # Tracks which sessions are mid-quote-creation.
    # True  → use quote_runner (Quote_Architect directly, Deal_Manager bypassed)
    # False → use root_runner  (Deal_Manager coordinator)
    quote_flow: dict[str, bool] = field(default_factory=dict)
