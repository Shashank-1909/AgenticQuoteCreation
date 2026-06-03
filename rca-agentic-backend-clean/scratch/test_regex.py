import re

test_lines = [
    "o 10 Plasmid DNA Purification Kits",
    "o 5 Endotoxin-Free Plasmid Kits",
    "o 4 Maxi Plasmid Purification Kits",
    "o 1 UV-Vis Spectrophotometer",
    "o 1 Orbitrap Mass Spectrometer",
    "o 1 Flow Cytometer",
    "o 1 Cell Sorting Flow Cytometer",
    "o 20 boxes of qPCR Probe Master Mix",
    "o 15 DNA Extraction Kit – Blood units",
    "- Standard User (3, 10%)",
    "1. Enterprise License x2 – 8%",
    "• 10 Plasmid DNA Purification Kits 12%",
    "15 DNA Extraction Kit - Blood",
    "Flow Cytometer 2 Units 15%",
    "1 Standard User",
    "2. 10 Enterprise User",
]

def parse_line(line):
    line = line.strip()
    if not line:
        return None

    # Step 1: Strip leading bullets or numbered index
    bullet_match = re.match(r"^(?:[-*•o\t]\s*|\d+[\.\)\:]\s*)+", line, flags=re.IGNORECASE)
    if bullet_match:
        line = line[bullet_match.end():].strip()

    # Step 2: Strip trailing punctuation/separators
    line = line.rstrip(",;:-–—")

    # Step 3: Extract discount (look for X%)
    disc = 0.0
    disc_match = re.search(r"(\d+(?:\.\d+)?)\s*%", line)
    if disc_match:
        try:
            disc = float(disc_match.group(1))
        except:
            pass
        # Remove discount from line
        line = re.sub(r"(\d+(?:\.\d+)?)\s*%", "", line).strip()

    # Clean up again after removing discount
    line = line.rstrip(",;:-–—").strip()

    # Step 4: Extract quantity (qty)
    qty = 1

    # Check for parentheses containing a number: e.g., (3) or (3, ) or (, 3)
    # This matches (3) or (3, ...) or (..., 3)
    paren_match = re.search(r"\(\s*([^)]+)\s*\)", line)
    if paren_match:
        inner = paren_match.group(1)
        # Search for a standalone number in the parentheses
        num_matches = re.findall(r"\b\d+\b", inner)
        if num_matches:
            qty = int(num_matches[0])
        # Remove the parentheses entirely from the line
        line = line.replace(paren_match.group(0), "").strip()

    # Clean up again
    line = line.rstrip(",;:-–—").strip()

    # Try pattern A: Quantity at the start
    start_qty_match = re.match(
        r"^(?P<qty>\d+)\s*(?:x|units?\s+of|boxes?\s+of|bottles?\s+of|sets?\s+of|pcs?\s+of|pieces?\s+of)?\s+(?P<rest>.+)$",
        line,
        re.IGNORECASE
    )
    
    # Try pattern B: Quantity at the end
    end_qty_match = re.search(
        r"\s+(?:x|qty|quantity|units?|bottles?|sets?|boxes?)?\s*(?P<qty>\d+)\s*(?:units?|bottles?|sets?|boxes?|pcs?|pieces?)?$",
        line,
        re.IGNORECASE
    )

    if start_qty_match:
        if qty == 1:
            qty = int(start_qty_match.group("qty"))
            line = start_qty_match.group("rest").strip()
        else:
            line = start_qty_match.group("rest").strip()
    elif end_qty_match:
        if qty == 1:
            qty = int(end_qty_match.group("qty"))
            line = line[:end_qty_match.start()].strip()
        else:
            line = line[:end_qty_match.start()].strip()

    # Clean up name: strip trailing units, boxes, etc. if they leaked
    name = re.sub(r"\s+(?:units?|bottles?|sets?|boxes?|pcs?|pieces?)$", "", line, flags=re.IGNORECASE)
    name = name.strip().rstrip(",;:-–—")
    
    return {"product_name": name, "quantity": qty, "discount": disc}

for line in test_lines:
    print(f"Original: {line}")
    print(f"Parsed:   {parse_line(line)}")
    print("-" * 50)
