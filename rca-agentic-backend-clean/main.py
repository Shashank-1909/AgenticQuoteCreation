"""
main.py
=======
Entry point for the Deal Management API.

This file does exactly one thing: configure and start the server.
All application logic lives in the app/ package.

Run with:
    python main.py
    OR
    uvicorn main:app --host 0.0.0.0 --port 8001
"""

import logging

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

# Load environment variables FIRST — before any Google SDK modules are imported,
# so that GOOGLE_GENAI_USE_VERTEXAI and GOOGLE_CLOUD_PROJECT are available.
load_dotenv()

from app.core.config import SERVER_PORT
from app.lifespan import lifespan
from app.api.websocket import websocket_endpoint

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)

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

app.add_api_websocket_route("/ws/orchestrate", websocket_endpoint)

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)
