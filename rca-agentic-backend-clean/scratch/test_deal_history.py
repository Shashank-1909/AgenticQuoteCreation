import sys
import os
sys.path.insert(0, os.path.abspath(os.path.join(os.path.dirname(__file__), '..')))

from server import get_deal_history

print("Calling get_deal_history...")
res = get_deal_history("Edge Communications")
print("Response length:", len(res))
print("Response preview:")
print(res[:1000])
