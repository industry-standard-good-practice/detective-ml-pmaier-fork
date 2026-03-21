# Deploying the Backend to Google Cloud Functions

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- A GCP project with Cloud Functions and Cloud Build APIs enabled
- Firebase Realtime Database and Cloud Storage already configured

## Environment Variables

Set these when deploying (via `--set-env-vars` or Secret Manager):

| Variable | Required | Description |
|----------|:--------:|-------------|
| `FIREBASE_DATABASE_URL` | ✅ | Firebase Realtime Database URL |
| `FIREBASE_STORAGE_BUCKET` | ✅ | Firebase Cloud Storage bucket name |
| `CORS_ORIGIN` | ✅ | Your production frontend URL (e.g. `https://detectiveml.com`) |

> **Note:** On GCP, Firebase Admin SDK uses [Application Default Credentials](https://cloud.google.com/docs/authentication/application-default-credentials) automatically — no service account key file is needed. Just ensure the Cloud Function's service account has the necessary Firebase permissions.

## Deploy with `gcloud`

From the `backend/` directory:

```bash
gcloud functions deploy detectiveml-api \
  --gen2 \
  --runtime=nodejs20 \
  --region=us-central1 \
  --source=. \
  --entry-point=api \
  --trigger-http \
  --allow-unauthenticated \
  --memory=512Mi \
  --set-env-vars="FIREBASE_DATABASE_URL=https://your-project-rtdb.firebaseio.com,FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app,CORS_ORIGIN=https://your-frontend-domain.com"
```

> `--allow-unauthenticated` is correct here because the app handles its own auth via Firebase ID tokens. GCP IAM auth is not needed.

## Build & Run Locally with Docker

```bash
# Build the image
docker build -t detectiveml-backend .

# Run it (pass env vars for Firebase)
docker run -p 8080:8080 \
  -e FIREBASE_DATABASE_URL=https://your-project-rtdb.firebaseio.com \
  -e FIREBASE_STORAGE_BUCKET=your-project.firebasestorage.app \
  -e CORS_ORIGIN=http://localhost:3000 \
  -e GOOGLE_APPLICATION_CREDENTIALS=/app/serviceAccountKey.json \
  -v $(pwd)/.auth/serviceAccountKey.json:/app/serviceAccountKey.json:ro \
  detectiveml-backend
```

Then test: `curl http://localhost:8080/api/health`

## Deploy with Docker (Cloud Run)

If you prefer deploying a container image directly:

```bash
# Build & push
docker build -t gcr.io/YOUR_PROJECT/detectiveml-backend .
docker push gcr.io/YOUR_PROJECT/detectiveml-backend

# Deploy to Cloud Run
gcloud run deploy detectiveml-api \
  --image=gcr.io/YOUR_PROJECT/detectiveml-backend \
  --region=us-central1 \
  --allow-unauthenticated \
  --set-env-vars="FIREBASE_DATABASE_URL=...,FIREBASE_STORAGE_BUCKET=...,CORS_ORIGIN=..."
```
