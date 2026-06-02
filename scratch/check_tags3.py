import re

def analyze_jsx(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    content = re.sub(r'\{/\*.*?\*/\}', '', content, flags=re.DOTALL)
    
    tags = []
    pattern = re.compile(r'<(/?)(div|section|form)\b[^>]*?(/?)\s*>', re.IGNORECASE)
    
    in_section = False
    
    for m in pattern.finditer(content):
        is_closing = m.group(1) == '/'
        tag_name = m.group(2).lower()
        is_self_closing = m.group(3) == '/'
        
        if is_self_closing: continue
            
        line_num = content[:m.start()].count('\n') + 1
        
        if tag_name == 'section' and not is_closing and line_num >= 1280:
            in_section = True
            print(f"Line {line_num}: Opened <{tag_name}>")
            
        if is_closing:
            if not tags: break
            popped = tags.pop()
            if in_section:
                indent = "  " * len(tags)
                print(f"Line {line_num}: {indent}Closed </{tag_name}>")
            if popped[1] != tag_name:
                print(f"ERROR: Expected </{popped[1]}>")
                break
        else:
            if in_section:
                indent = "  " * len(tags)
                print(f"Line {line_num}: {indent}Opened <{tag_name}>")
            tags.append((line_num, tag_name))
            
analyze_jsx('rca-agentic-frontend/src/components/AgentforceView.jsx')
