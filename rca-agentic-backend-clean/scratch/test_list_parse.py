import sys
import os

sys.path.append(r"c:\Users\RayagiriVidhathri\AgenticQuoteCreation\rca-agentic-backend-clean")
from app.api.websocket import _parse_document_inline

text = """Minutes of Meeting (MOM)
Date: [06-03-2026]
Attendees: Dr. Sharma (Client), Sales Representative
Discussion
•	Sales Representative presented a quotation based on the client's laboratory requirements.
•	The quotation includes:
o	10 Plasmid DNA Purification Kits
o	5 Endotoxin-Free Plasmid Kits
o	4 Maxi Plasmid Purification Kits
o	1 UV-Vis Spectrophotometer
o	1 Orbitrap Mass Spectrometer
o	1 Flow Cytometer
o	1 Cell Sorting Flow Cytometer
o	20 boxes of qPCR Probe Master Mix
o	15 DNA Extraction Kit – Blood units
•	Client confirmed the product list and requested details on pricing and discounts."""

res = _parse_document_inline(text)
import json
print(json.dumps(res, indent=2))
