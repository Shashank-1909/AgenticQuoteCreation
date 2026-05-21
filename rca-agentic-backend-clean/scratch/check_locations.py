import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

project = os.getenv("GOOGLE_CLOUD_PROJECT")

locations = ["us-central1", "us-east4", "europe-west1", "asia-northeast1"]

for loc in locations:
    print(f"--- Checking {loc} ---")
    client = genai.Client(
        vertexai=True,
        project=project,
        location=loc
    )
    try:
        models = [m.name for m in client.models.list()]
        gemini_models = [m for m in models if "gemini" in m]
        if gemini_models:
            print(f"Found {len(gemini_models)} Gemini models.")
            # Print first 3
            for m in gemini_models[:3]:
                print(f" - {m}")
        else:
            print("No Gemini models found.")
    except Exception as e:
        print(f"Error in {loc}: {e}")
