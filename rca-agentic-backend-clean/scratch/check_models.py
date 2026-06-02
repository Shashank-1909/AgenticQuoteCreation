import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

project = os.getenv("GOOGLE_CLOUD_PROJECT")
location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

print(f"Project: {project}")
print(f"Location: {location}")

client = genai.Client(
    vertexai=True,
    project=project,
    location=location
)

try:
    print("Attempting to list models...")
    for model in client.models.list():
        print(f" - {model.name}")
except Exception as e:
    print(f"Error listing models: {e}")
