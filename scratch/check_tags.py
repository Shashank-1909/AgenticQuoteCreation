import re

def check_file(filename):
    print(f"\nChecking {filename}")
    with open(filename, 'r', encoding='utf-8') as f:
        lines = f.readlines()

    tags = []
    for i in range(1288, len(lines)):
        line = lines[i]
        for m in re.finditer(r'<(/?)(div|section|form)\b[^>]*>', line):
            is_closing = m.group(1) == '/'
            tag_name = m.group(2)
            
            # skip self-closing tags
            if not is_closing and line[m.end()-2:m.end()] == '/>':
                continue
                
            if is_closing:
                if tags and tags[-1][1] == tag_name:
                    tags.pop()
                else:
                    print(f"Line {i+1}: Found closing </{tag_name}> but expected </{tags[-1][1] if tags else 'NONE'}>")
                    if tags: tags.pop() # try to recover
            else:
                tags.append((i+1, tag_name))
                
    print("Remaining unclosed tags:")
    for t in tags:
        print(f"Line {t[0]}: <{t[1]}>")

check_file('rca-agentic-frontend/src/components/AgentforceView.jsx')
check_file('temp_winloss_utf8.jsx')
