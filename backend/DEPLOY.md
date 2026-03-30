# Deploying the Backend to Google Cloud

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- A GCP project with Cloud Functions and Cloud Build APIs enabled
- Firebase Realtime Database and Cloud Storage already configured
- Python 3.10+ (local dev) or Docker

## Environment Variables

Set these when deploying (via `--set-env-vars` or Secret Manager):

| Variable | Required | Description |
|----------|:--------:|-------------|
| `FIREBASE_DATABASE_URL` | ✅ | Firebase Realtime Database URL |
| `FIREBASE_STORAGE_BUCKET` | ✅ | Firebase Cloud Storage bucket name |
| `GEMINI_API_KEY` | ✅ | Google AI Studio API key for Gemini |
| `CORS_ORIGIN` | ⬜ | Production frontend URL (CORS is open by default) |

> **Note:** On GCP, Firebase Admin SDK uses [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials) automatically — no service account key file is needed. Just ensure the Cloud Function's service account has the necessary Firebase permissions.

## Local Development

```bash
# Create virtual environment and install dependencies
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

# Or use the npm script
npm run setup

# Start the development server (auto-reloads on file change)
npm run dev
# → Server starts at http://localhost:4000
```

## Deploy with `gcloud` (Cloud Run — recommended)

From the `backend/` directory:

```bash
# Build & push
docker build -t gcr.io/YOUR_PROJECT/detectiveml-backend .
docker push gcr.io/YOUR_PROJECT/detectiveml-backend

# Deploy to Cloud Run
gcloud run deploy detectiveml-api \
  --image=gcr.io/YOUR_PROJECT/detectiveml-backend \
  --region=us-central1 \
  --allow-unauthenticated \
  --memory=1Gi \
  --timeout=300 \
  --set-env-vars="FIREBASE_DATABASE_URL=https://your-project-rtdb.firebaseio.com,FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app,GEMINI_API_KEY=your-api-key"
```

> `--allow-unauthenticated` is correct here because the app handles its own auth via Firebase ID tokens.

## Deploy with `gcloud` (Cloud Functions 2nd gen)

```bash
gcloud functions deploy detectiveml-api \
  --gen2 \
  --runtime=python312 \
  --region=us-central1 \
  --source=. \
  --entry-point=api \
  --trigger-http \
  --allow-unauthenticated \
  --memory=1Gi \
  --timeout=300s \
  --set-env-vars="FIREBASE_DATABASE_URL=https://your-project-rtdb.firebaseio.com,FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app,GEMINI_API_KEY=your-api-key"
```

## Build & Run Locally with Docker

```bash
# Build the image
docker build -t detectiveml-backend .

# Run it (pass env vars for Firebase)
docker run -p 8080:8080 \
  -e FIREBASE_DATABASE_URL=https://your-project-rtdb.firebaseio.com \
  -e FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app \
  -e GEMINI_API_KEY=your-api-key \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/serviceAccountKey.json \
  -v $(pwd)/.auth/serviceAccountKey.json:/app/serviceAccountKey.json:ro \
  detectiveml-backend
```

Then test: `curl http://localhost:8080/api/health`
