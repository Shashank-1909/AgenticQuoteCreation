import os
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv()

project = os.getenv("GOOGLE_CLOUD_PROJECT")
location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")

client = genai.Client(
    vertexai=True,
    project=project,
    location=location
)

model_id = "gemini-2.0-flash-001"
print(f"Testing model: {model_id}...")

try:
    response = client.models.generate_content(
        model=model_id,
        contents="Hello, say 'Test successful'."
    )
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Error: {e}")
