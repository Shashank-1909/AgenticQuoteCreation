import os
import json

filepath = r'C:\Users\KalyanChakravarthi\.gemini\antigravity\brain\b857bc66-4bc1-469c-bbbe-8cc325bc2279\.system_generated\logs\overview.txt'
out_path = r'C:\Users\KalyanChakravarthi\.gemini\antigravity\brain\b857bc66-4bc1-469c-bbbe-8cc325bc2279\scratch\replacement_code_1187.txt'

with open(filepath, 'r', encoding='utf-8', errors='ignore') as infile:
    for idx, line in enumerate(infile):
        if 'step_index":1187' in line or 'step_index": 1187' in line:
            try:
                data = json.loads(line)
                tc = data["tool_calls"][0]
                rc = tc["args"]["ReplacementContent"]
                with open(out_path, 'w', encoding='utf-8') as outfile:
                    outfile.write(rc)
                print("Successfully extracted ReplacementContent!")
            except Exception as e:
                print("Error extracting:", e)
            break
