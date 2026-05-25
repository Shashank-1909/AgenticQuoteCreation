import re

def analyze_jsx(filename):
    with open(filename, 'r', encoding='utf-8') as f:
        content = f.read()

    # We will just use a simple stack-based parser to find where the mismatch happens
    # Find all JSX tags: <tag, </tag>, or />
    # We will ignore tags inside comments { /* ... */ } or strings, but a simple regex might be enough if code is clean.
    
    # Strip comments first to avoid false positives
    content = re.sub(r'\{/\*.*?\*/\}', '', content, flags=re.DOTALL)
    
    tags = []
    # Match <tag ... >, </tag>, <tag ... />
    # We only care about div, section, form, button, nav, header, main, footer
    pattern = re.compile(r'<(/?)(div|section|form|button|nav|header|main|footer)\b[^>]*?(/?)\s*>', re.IGNORECASE)
    
    for m in pattern.finditer(content):
        is_closing = m.group(1) == '/'
        tag_name = m.group(2).lower()
        is_self_closing = m.group(3) == '/'
        
        if is_self_closing:
            continue
            
        line_num = content[:m.start()].count('\n') + 1
        
        if is_closing:
            if not tags:
                print(f"Error at line {line_num}: </{tag_name}> found but stack is empty")
                return
            if tags[-1][1] != tag_name:
                print(f"Error at line {line_num}: </{tag_name}> found but expected </{tags[-1][1]}> (opened at {tags[-1][0]})")
                return
            tags.pop()
        else:
            tags.append((line_num, tag_name))
            
    if tags:
        print("Unclosed tags:")
        for t in tags:
            print(f"  Line {t[0]}: <{t[1]}>")
    else:
        print("All tags matched perfectly!")

analyze_jsx('rca-agentic-frontend/src/components/AgentforceView.jsx')
