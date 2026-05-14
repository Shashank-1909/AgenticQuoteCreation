import os
from dotenv import load_dotenv
from google import genai

load_dotenv()

client = genai.Client(
    vertexai=True,
    project=os.getenv("GOOGLE_CLOUD_PROJECT"),
    location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
)

# Test with FULL resource name
model_id = "publishers/google/models/gemini-2.0-flash-001"
print(f"Testing full path: {model_id}...")

try:
    response = client.models.generate_content(
        model=model_id,
        contents="Hello"
    )
    print(f"Success! Response: {response.text}")
except Exception as e:
    print(f"Full path failed: {e}")

# Test with just the name
model_id_short = "gemini-2.0-flash-001"
print(f"Testing short name: {model_id_short}...")
try:
    response = client.models.generate_content(
        model=model_id_short,
        contents="Hello"
    )
    print(f"Success! Response: {response.text}")
except Exception as e:
    print(f"Short name failed: {e}")
