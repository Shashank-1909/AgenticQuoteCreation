import difflib

with open('rca-agentic-frontend/src/components/AgentforceView.jsx', 'r', encoding='utf-8') as f1:
    lines1 = f1.readlines()[1288:]
with open('temp_winloss_utf8.jsx', 'r', encoding='utf-8') as f2:
    lines2 = f2.readlines()[1288:]

# only print lines with <div or </div
def filter_divs(lines):
    return [l for l in lines if '<div' in l or '</div' in l or '<section' in l or '</section' in l]

divs1 = filter_divs(lines1)
divs2 = filter_divs(lines2)

diff = difflib.unified_diff(divs2, divs1, fromfile='winloss', tofile='current')
for line in diff:
    print(line.strip())
