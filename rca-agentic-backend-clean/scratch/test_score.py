import re
import difflib

def _get_similarity_score(str1: str, str2: str) -> float:
    # Character bigrams
    def get_bigrams(s):
        s = re.sub(r'[^a-z0-9]', '', s.lower())
        return set(s[i:i+2] for i in range(len(s)-1))
        
    s1_bi = get_bigrams(str1)
    s2_bi = get_bigrams(str2)
    
    if not s1_bi or not s2_bi:
        return 0.0
        
    intersection = len(s1_bi.intersection(s2_bi))
    union = len(s1_bi.union(s2_bi))
    bigram_score = intersection / union if union > 0 else 0.0
    
    # Token overlap
    def get_tokens(s):
        return set(w for w in re.split(r'[^a-zA-Z0-9]', s.lower()) if len(w) > 1)
        
    s1_tok = get_tokens(str1)
    s2_tok = get_tokens(str2)
    
    stopwords = {
        "the", "and", "for", "with", "this", "that", "you", "your", "from", 
        "includes", "quotation", "presented", "based", "client", "laboratory", 
        "requirements", "discussion", "representative", "sales", "meeting", "minutes"
    }
    s1_tok_clean = s1_tok - stopwords
    s2_tok_clean = s2_tok - stopwords
    
    if not s1_tok_clean:
        s1_tok_clean = s1_tok
    if not s2_tok_clean:
        s2_tok_clean = s2_tok
        
    if not s1_tok_clean or not s2_tok_clean:
        token_score = 0.0
    else:
        # We also check if any token in s1 is a substring of a token in s2 or vice versa
        matched_tokens = 0
        for t1 in s1_tok_clean:
            matched = False
            for t2 in s2_tok_clean:
                if t1 == t2 or (len(t1) > 3 and t1 in t2) or (len(t2) > 3 and t2 in t1):
                    matched = True
                    break
            if matched:
                matched_tokens += 1
        token_score = matched_tokens / len(s1_tok_clean)
        
    # Standard SequenceMatcher ratio
    seq_score = difflib.SequenceMatcher(None, str1.lower(), str2.lower()).ratio()
    
    # Combine scores
    return 0.5 * token_score + 0.3 * bigram_score + 0.2 * seq_score

# Let's test
queries = [
    "Plasmid DNA Purification Kits",
    "Endotoxin-Free Plasmid Kits",
    "DNA Extraction Kit – Blood units",
    "Flow Cytometer",
    "Cell Sorting Flow Cytometer",
    "qPCR Probe Master Mix",
    "Sales Representative presented a quotation based on the client's laboratory requirements."
]

candidates = [
    "Plasmid DNA Purification Kit",
    "Endotoxin-Free Plasmid Kit",
    "Maxi Plasmid Purification Kit",
    "DNA Extraction Kit - Blood",
    "DNA Extraction Kit - Tissue",
    "Flow Cytometer",
    "Benchtop Flow Cytometer",
    "Cell Sorting Flow Cytometer",
    "qPCR Probe Master Mix",
    "qPCR SYBR Green Master Mix",
    "Burlington Textiles Weaving Plant Generator",
    "ELISA Microplate Reader",
    "Display Insurance",
    "Core Platform"
]

for q in queries:
    print(f"Query: {q}")
    matches = []
    for c in candidates:
        score = _get_similarity_score(q, c)
        matches.append((c, score))
    # Sort matches
    matches.sort(key=lambda x: x[1], reverse=True)
    for c, score in matches[:5]:
        print(f"  -> {c}: {score:.3f}")
    print("-" * 50)
