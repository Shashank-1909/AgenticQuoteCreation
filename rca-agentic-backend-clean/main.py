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
from fastapi import FastAPI, UploadFile, File
from fastapi.middleware.cors import CORSMiddleware
import io
import PyPDF2
import docx

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

@app.get("/api/quote-preview/{quote_id}")
async def quote_preview(quote_id: str):
    print(f"[DEBUG] Fetching preview for Quote ID: {quote_id}")
    from server import get_quote_preview
    import json
    result_str = get_quote_preview(quote_id)
    print(f"[DEBUG] Result status: {json.loads(result_str).get('status')}")
    return json.loads(result_str)

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    """Extracts text from uploaded PDF or Docx files."""
    filename = file.filename
    content_type = file.content_type
    
    print(f"[DEBUG] Received file: {filename}, Type: {content_type}")
    
    content = await file.read()
    text = ""
    
    try:
        if filename.endswith(".pdf"):
            reader = PyPDF2.PdfReader(io.BytesIO(content))
            for page in reader.pages:
                text += page.extract_text() + "\n"
        elif filename.endswith(".docx"):
            doc = docx.Document(io.BytesIO(content))
            for para in doc.paragraphs:
                text += para.text + "\n"
        elif filename.endswith(".txt"):
            text = content.decode("utf-8")
        else:
            return {"status": "error", "message": "Unsupported file format. Please upload PDF, Docx, or Txt."}
        
        return {"status": "success", "text": text.strip(), "filename": filename}
    except Exception as e:
        print(f"[DEBUG] Error parsing file: {str(e)}")
        return {"status": "error", "message": f"Error parsing file: {str(e)}"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)
