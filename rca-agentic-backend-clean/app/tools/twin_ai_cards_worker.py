"""Small isolated Vertex AI worker for Twin Hunter card shaping."""

import json
import os
import sys

import requests
from dotenv import load_dotenv
import google.auth
from google.auth.transport.requests import Request


def main() -> None:
    load_dotenv()
    try:
        payload = json.load(sys.stdin)
        prompt = payload["prompt"]
        model_name = payload.get("model_name") or "gemini-2.5-flash"
        http_timeout = int(payload.get("http_timeout") or 25)

        credentials, _project = google.auth.default(
            scopes=["https://www.googleapis.com/auth/cloud-platform"]
        )
        credentials.refresh(Request())

        project = os.getenv("GOOGLE_CLOUD_PROJECT", "").strip()
        location = os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1").strip() or "us-central1"
        if not project:
            raise RuntimeError("GOOGLE_CLOUD_PROJECT is not configured for Vertex AI.")

        endpoint = (
            f"https://{location}-aiplatform.googleapis.com/v1beta1/projects/{project}"
            f"/locations/{location}/publishers/google/models/{model_name}:generateContent"
        )
        ai_payload = {
            "contents": [
                {
                    "role": "user",
                    "parts": [{"text": prompt}],
                }
            ],
            "generationConfig": {
                "responseMimeType": "application/json",
                "temperature": 0.0,
                "maxOutputTokens": 8192,
                "thinkingConfig": {"thinkingBudget": 0},
            },
        }
        ai_resp = requests.post(
            endpoint,
            headers={
                "Authorization": f"Bearer {credentials.token}",
                "Content-Type": "application/json",
            },
            json=ai_payload,
            timeout=http_timeout,
        )
        if ai_resp.status_code != 200:
            raise RuntimeError(f"Vertex AI failed ({ai_resp.status_code}): {ai_resp.text[:500]}")

        body = ai_resp.json()
        parts = (
            body.get("candidates", [{}])[0]
            .get("content", {})
            .get("parts", [])
        )
        text = "\n".join(part.get("text", "") for part in parts if part.get("text"))
        print(json.dumps({"ok": True, "text": text}))
    except Exception as exc:
        print(json.dumps({"ok": False, "error": str(exc)}))


if __name__ == "__main__":
    main()
