import asyncio
import sys
import websockets
import json

async def main():
    uri = "ws://localhost:8000/ws/orchestrate"
    async with websockets.connect(uri) as websocket:
        print("[Client] Connected to Orchestrator")
        
        # Turn 1: Search
        print("[Client] Sending Turn 1: search for a product related to Manager Rule")
        await websocket.send("search for a product related to Manager Rule")
        
        while True:
            response = await websocket.recv()
            data = json.loads(response)
            if data.get("type") == "FINAL_REPLY":
                print(f"[Client] FINAL_REPLY: {data.get('data')[:60]}...")
            elif data.get("type") == "STATE" and data.get("state") == "completed":
                print("[Client] Turn 1 Completed.")
                break
                
        # Turn 2: Quote
        print("[Client] Sending Turn 2: create a quote")
        await websocket.send("create a quote")
        
        while True:
            response = await websocket.recv()
            data = json.loads(response)
            if data.get("type") == "ERROR":
                print(f"[Client] ERROR: {data.get('data')}")
                break
            elif data.get("type") == "FINAL_REPLY":
                print(f"[Client] FINAL_REPLY: {data.get('data')[:60]}...")
            elif data.get("type") == "STATE" and data.get("state") == "completed":
                print("[Client] Turn 2 Completed.")
                break
            elif data.get("type") == "TOOL_TRIGGER":
                print(f"[Client] TOOL_TRIGGER: {data.get('tool')}")

if __name__ == "__main__":
    asyncio.run(main())
