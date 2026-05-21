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
# FIX: Replaced PyPDF2 with pdfplumber — PyPDF2 silently returns empty strings
# for many real-world PDFs (encoded fonts, compressed streams, etc.)
# Install: pip install pdfplumber
import pdfplumber
import docx
import openpyxl
import xlrd

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
    """Extracts text from uploaded PDF, Docx, Excel, or Txt files."""
    filename = file.filename
    content_type = file.content_type
    
    print(f"[DEBUG] Received file: {filename}, Type: {content_type}")
    
    content = await file.read()
    text = ""
    
    # FIX: Max characters to send to the agent over WebSocket.
    # Large documents crash the WebSocket silently — truncate before sending.
    MAX_CHARS = 15000

    try:
        if filename.endswith(".pdf"):
            # FIX: pdfplumber correctly extracts text from encoded/compressed PDFs
            # where PyPDF2 would silently return empty strings.
            with pdfplumber.open(io.BytesIO(content)) as pdf:
                for page in pdf.pages:
                    extracted = page.extract_text()
                    if extracted:
                        text += extracted + "\n"
            print(f"[DEBUG] PDF extracted {len(text)} characters across {len(pdf.pages)} pages")
        elif filename.endswith(".docx"):
            doc = docx.Document(io.BytesIO(content))
            from docx.oxml.ns import qn

            # Walk the document in order (paragraphs AND tables)
            for block in doc.element.body:
                tag = block.tag.split('}')[-1]
                if tag == 'p':
                    para_text = ''.join(node.text or '' for node in block.iter(qn('w:t')))
                    if para_text.strip(): text += para_text + "\n"
                elif tag == 'tbl':
                    for row in block.iter(qn('w:tr')):
                        row_cells = []
                        for cell in row.iter(qn('w:tc')):
                            cell_text = ''.join(node.text or '' for node in cell.iter(qn('w:t')))
                            if cell_text.strip(): row_cells.append(cell_text.strip())
                        if row_cells: text += ' | '.join(row_cells) + "\n"

            print(f"[DEBUG] DOCX extracted {len(text)} characters")
        elif filename.endswith(".txt"):
            try:
                text = content.decode("utf-8")
            except UnicodeDecodeError:
                text = content.decode("latin-1")
        elif filename.endswith(".xlsx"):
            wb = openpyxl.load_workbook(io.BytesIO(content), data_only=True)
            for sheet_name in wb.sheetnames:
                ws = wb[sheet_name]
                text += f"[Sheet: {sheet_name}]\n"
                for row in ws.iter_rows(values_only=True):
                    row_cells = [str(cell) if cell is not None else "" for cell in row]
                    # Skip completely empty rows
                    if any(c.strip() for c in row_cells):
                        text += " | ".join(row_cells) + "\n"
                text += "\n"
            print(f"[DEBUG] XLSX extracted {len(text)} characters from {len(wb.sheetnames)} sheet(s)")
        elif filename.endswith(".xls"):
            wb = xlrd.open_workbook(file_contents=content)
            for sheet_name in wb.sheet_names():
                ws = wb.sheet_by_name(sheet_name)
                text += f"[Sheet: {sheet_name}]\n"
                for row_idx in range(ws.nrows):
                    row_cells = [str(ws.cell_value(row_idx, col_idx)) for col_idx in range(ws.ncols)]
                    if any(c.strip() for c in row_cells):
                        text += " | ".join(row_cells) + "\n"
                text += "\n"
            print(f"[DEBUG] XLS extracted {len(text)} characters from {wb.nsheets} sheet(s)")
        else:
            return {"status": "error", "message": "Unsupported file format. Please upload PDF, DOCX, TXT, XLSX, or XLS."}
        
        if not text.strip():
            print(f"[DEBUG] WARNING: Extracted text is empty for {filename}")
            return {"status": "error", "message": "Could not extract any text from the document. It may be a scanned image or password-protected."}

        # FIX: Truncate before sending to agent to avoid WebSocket / LLM context overflows
        full_text = text.strip()
        truncated_text = full_text[:MAX_CHARS]
        was_truncated = len(full_text) > MAX_CHARS

        user_message = f"Document uploaded: {filename}\n\nContent:\n{truncated_text}"
        if was_truncated:
            user_message += f"\n\n[Note: Document truncated to {MAX_CHARS} characters for processing. Full document has {len(full_text)} characters.]"

        print(f"[DEBUG] Sending {len(truncated_text)} chars to agent (truncated: {was_truncated})")

        return {
            "status": "success", 
            "text": full_text,       # full text available in response if needed
            "filename": filename,
            "user_message": user_message   # truncated version goes to agent
        }
    except Exception as e:
        print(f"[DEBUG] Error parsing file: {str(e)}")
        return {"status": "error", "message": f"Error parsing file: {str(e)}"}

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=SERVER_PORT)