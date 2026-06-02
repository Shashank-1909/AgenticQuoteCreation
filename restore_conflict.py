import subprocess
import os

def get_blob(stage):
    result = subprocess.run(['git', 'show', f':{stage}:rca-agentic-frontend/src/components/AgentforceView.jsx'], capture_output=True)
    return result.stdout

with open('base.jsx', 'wb') as f:
    f.write(get_blob(1))
with open('ours.jsx', 'wb') as f:
    f.write(get_blob(2))
with open('theirs.jsx', 'wb') as f:
    f.write(get_blob(3))

with open('rca-agentic-frontend/src/components/AgentforceView.jsx', 'wb') as out_f:
    subprocess.run(['git', 'merge-file', '-p', '-L', 'HEAD', '-L', 'base', '-L', 'winloss_clean', 'ours.jsx', 'base.jsx', 'theirs.jsx'], stdout=out_f)
