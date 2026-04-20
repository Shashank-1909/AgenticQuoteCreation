import logging
logging.getLogger("google.adk").setLevel(logging.DEBUG)
logging.basicConfig(level=logging.DEBUG)

import agent
import uvicorn

if __name__ == "__main__":
    uvicorn.run(agent.app, host="0.0.0.0", port=8001)
