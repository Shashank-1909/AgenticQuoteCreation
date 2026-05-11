# Vertex AI Local Environment Setup Guide

This guide explains how to configure your local development environment to authenticate with Google Cloud Vertex AI using **Application Default Credentials (ADC)** instead of a hardcoded API key.

By using ADC, you securely authenticate your local code against our company's GCP project (`gcp-quote-management-solution`) without ever needing to expose API keys in the codebase.

---

## Prerequisites

You must have the Google Cloud CLI (`gcloud`) installed on your machine.
- **Windows Install**: [Download the Google Cloud SDK Installer](https://dl.google.com/dl/cloudsdk/channels/rapid/GoogleCloudSDKInstaller.exe)
- **Mac/Linux Install**: Follow the instructions [here](https://cloud.google.com/sdk/docs/install)

To verify installation, open your terminal and run:
```bash
gcloud --version
```
*(Note for Windows users: You can safely ignore any warnings about "Python was not found" from the Microsoft Store as long as the version number prints out below it.)*

---

## Step 1: Update your `.env` File

We no longer use `GEMINI_API_KEY`. Instead, you must instruct the Google GenAI SDK to use Vertex AI and point it to our company project.

1. Open the `.env` file in the `rca-agentic-backend` folder.
2. Comment out or delete `GEMINI_API_KEY`.
3. Add the following Vertex AI configuration:

```env
# --- VERTEX AI (APPLICATION DEFAULT CREDENTIALS) ---
GOOGLE_GENAI_USE_VERTEXAI="true"
GOOGLE_CLOUD_PROJECT="gcp-quote-management-solution"
GOOGLE_CLOUD_LOCATION="us-central1"
```

---

## Step 2: Authenticate your CLI (gcloud)

First, we need to log your `gcloud` tool into your company Google account.

1. Run the following command in your terminal:
   ```bash
   gcloud auth login
   ```
2. A browser window will open. Log in using your **company email address** (`@agivant.com`) and click **Allow**.
3. Now, tell your CLI to default to the correct project:
   ```bash
   gcloud config set project gcp-quote-management-solution
   ```

---

## Step 3: Generate Application Default Credentials (ADC)

Now that your CLI is authenticated, we need to generate the invisible credential file that your Python code will actually use.

1. Run the following command:
   ```bash
   gcloud auth application-default login
   ```
2. A browser will open again. Select your **company email address** and click **Allow**.
   > **Troubleshooting Browser Issues**: If Edge opens and auto-logs you into a personal account, simply close Edge. Look at your terminal; it will have printed a massive URL starting with `https://accounts.google.com/o/oauth2/auth?...`. Copy that entire URL, paste it into Chrome (where you are logged in with your company account), and authenticate there.
3. Your terminal should print: `Credentials saved to file: ...`

---

## Step 4: Set the Quota Project

To ensure that API requests use our company project for billing and quotas (and not a random personal project attached to your email), run this final command:

```bash
gcloud auth application-default set-quota-project gcp-quote-management-solution
```

You should see a success message stating: `Quota project "gcp-quote-management-solution" was added to ADC...`

---

## 🎉 You're Done!

You can now start the backend server normally:
```bash
python agent_v2.py
```
The ADK and GenAI libraries will automatically detect your `GOOGLE_GENAI_USE_VERTEXAI="true"` setting, locate your invisible ADC file, and route all LLM requests securely to our enterprise Vertex AI project!
