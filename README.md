# RCA Agentic Pipeline — Multi-Agent Salesforce CPQ Orchestration

A production-ready, multi-agent AI pipeline that automates **Salesforce CPQ** workflows using **Google ADK 1.28.0** and a real-time visualization UI.

---

## What It Does

This system replaces manual Salesforce CPQ navigation with a coordinated team of AI agents that:

- **Search** the product catalog using natural language
- **Resolve** active pricebook entries for selected products
- **Create & submit** Revenue Cloud quotes via the Salesforce GraphQL API

All in a single conversation turn, with every step visualized in a live orchestration graph.

---

## Architecture

```
User ──► Deal Manager (Coordinator)
              │
        ┌─────┴──────┐
        ▼             ▼
  Catalog Scout   Quote Architect
        │               │
  ┌─────┴──┐      ┌─────┴──────┐
  │  SOQL  │      │ Pricebook  │
  │ Search │      │  Resolver  │
  └────────┘      │ CPQ Quote  │
                  └────────────┘
```

### Stack

| Layer | Technology |
|---|---|
| **Orchestration** | Google ADK 1.28.0 (`LlmAgent` + `Runner`) |
| **LLM** | Gemini 2.5 Pro (via AI Studio API) |
| **MCP Tools** | Custom Python MCP server (`server.py`) |
| **API** | FastAPI + WebSockets |
| **Frontend** | React + Vite + SVG knowledge graph |
| **Salesforce** | Revenue Cloud GraphQL, SOQL, CPQ APIs |

---

## Project Structure

```
RCA_MCP_Agentic/
├── rca-agentic-backend/
│   ├── agent_v2.py        # Main orchestrator (Deal Manager + sub-agents)
│   ├── server.py          # MCP tool server (Salesforce CPQ tools)
│   ├── auth.py            # Salesforce OAuth2 token refresh
│   ├── requirements.txt
│   └── .env.example       # ← Copy to .env and fill in secrets
│
└── rca-agentic-frontend/
    ├── src/
    │   ├── App.jsx         # Knowledge graph UI + WebSocket client
    │   └── index.css
    └── package.json
```

---

## Setup

### Prerequisites

- Python 3.11+
- Node.js 18+
- A Salesforce org with Revenue Cloud / CPQ enabled
- A Google AI Studio API key (Gemini)

### Backend

```bash
cd rca-agentic-backend

# Create virtual environment
python -m venv venv
venv\Scripts\activate          # Windows
# source venv/bin/activate     # macOS/Linux

# Install dependencies
pip install -r requirements.txt

# Configure environment
cp .env.example .env
# Edit .env with your Salesforce instance URL and Gemini API key

# Authenticate with Salesforce (generates auth.json + token.txt)
python auth.py

# Start the backend (port 8001)
python agent_v2.py
```

### Frontend

```bash
cd rca-agentic-frontend

npm install
npm run dev
# Opens at http://localhost:5173
```

---

## Agents & Tools

### Deal Manager (Coordinator)
Routes every user message to the correct specialist. Never executes tools directly.

### Catalog Scout
| Tool | Description |
|---|---|
| `check_field_values` | Validates available product fields/picklists |
| `search_rca_products` | SOQL-powered product catalog search |

### Quote Architect
| Tool | Description |
|---|---|
| `resolve_pricebook_entries` | Finds active pricebook entries for a product |
| `evaluate_quote_graph` | Submits a Revenue Cloud CPQ quote via GraphQL |

---

## Key Design Decisions

- **`disallow_transfer_to_parent=True`** on sub-agents prevents ADK's one-way transfer bug (sub-agents resuming across turns instead of returning to the coordinator)
- **WebSocket event streaming** emits `AGENT_START`, `TOOL_TRIGGER`, `TOOL_RESULT`, and `FINAL_REPLY` events for real-time UI updates
- **Circuit-trace SVG animations** use `stroke-dasharray` + CSS keyframes with per-agent gradient coloring (coordinator indigo → agent color)

---

## Environment Variables

See `rca-agentic-backend/.env.example` for all required variables.

**Never commit `.env`, `auth.json`, `token.txt`, or service account `.json` files.**

---

## License

MIT
