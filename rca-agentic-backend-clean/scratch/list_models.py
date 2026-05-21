import os
from google import genai
from dotenv import load_dotenv

load_dotenv()

def list_models():
    use_vertex = os.getenv("GOOGLE_GENAI_USE_VERTEXAI", "false").lower() == "true"
    if use_vertex:
        client = genai.Client(
            vertexai=True,
            project=os.getenv("GOOGLE_CLOUD_PROJECT"),
            location=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1")
        )
    else:
        client = genai.Client()
    
    print(f"Using Vertex AI: {use_vertex}")
    try:
        for model in client.models.list():
            print(f"Model ID: {model.name}")
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    list_models()
