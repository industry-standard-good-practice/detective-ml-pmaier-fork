# Deploying the Lease Watchdog Cron Job

The lease watchdog runs as a **Cloud Run Job** scheduled by **Cloud Scheduler**.
It detects stalled / failed case generation and resets eligible cases for retry.

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install) installed and authenticated
- A GCP project (`detectiveml`) with the following APIs enabled:
  - Cloud Run
  - Cloud Scheduler
  - Artifact Registry (or Container Registry)
- Firebase Realtime Database already configured
- The Cloud Run Job's service account needs Firebase RTDB read/write permissions

## Environment Variables

| Variable | Required | Description |
|----------|:--------:|-------------|
| `FIREBASE_DATABASE_URL` | ✅ | Firebase Realtime Database URL |
| `FIREBASE_STORAGE_BUCKET` | ⬜ | Firebase Cloud Storage bucket (not used by watchdog, but harmless) |

> **Note:** On GCP, Firebase Admin SDK uses Application Default Credentials automatically.
> The Cloud Run Job's default service account must have `roles/firebase.admin` or
> equivalent RTDB permissions.

## Step 1: Create Artifact Registry Repository (one-time)

```bash
gcloud artifacts repositories create detectiveml-docker \
  --repository-format=docker \
  --location=us-central1 \
  --project=detectiveml \
  --description="DetectiveML Docker images"
```

## Step 2: Build & Push the Docker Image

From the `infra/lease-watchdog/` directory:

```bash
# Configure Docker for Artifact Registry
gcloud auth configure-docker us-central1-docker.pkg.dev

# Build and push
docker build -t us-central1-docker.pkg.dev/detectiveml/detectiveml-docker/lease-watchdog:latest .
docker push us-central1-docker.pkg.dev/detectiveml/detectiveml-docker/lease-watchdog:latest
```

Or use Cloud Build (no local Docker needed):

```bash
gcloud builds submit \
  --tag us-central1-docker.pkg.dev/detectiveml/detectiveml-docker/lease-watchdog:latest \
  --project=detectiveml
```

## Step 3: Create the Cloud Run Job

```bash
gcloud run jobs create lease-watchdog \
  --image=us-central1-docker.pkg.dev/detectiveml/detectiveml-docker/lease-watchdog:latest \
  --region=us-central1 \
  --project=detectiveml \
  --memory=512Mi \
  --max-retries=0 \
  --task-timeout=60s \
  --set-env-vars="FIREBASE_DATABASE_URL=https://detectiveml-default-rtdb.firebaseio.com"
```

## Step 4: Schedule with Cloud Scheduler

```bash
gcloud scheduler jobs create http lease-watchdog-schedule \
  --location=us-central1 \
  --project=detectiveml \
  --schedule="*/30 * * * *" \
  --time-zone="UTC" \
  --uri="https://us-central1-run.googleapis.com/apis/run.googleapis.com/v1/namespaces/detectiveml/jobs/lease-watchdog:run" \
  --http-method=POST \
  --oauth-service-account-email="$(gcloud iam service-accounts list --project=detectiveml --filter='displayName:Default compute' --format='value(email)')" \
  --description="Runs the lease watchdog every 15 minutes to recover stalled cases"
```

## Step 5: Verify

### Run manually

```bash
gcloud run jobs execute lease-watchdog \
  --region=us-central1 \
  --project=detectiveml \
  --wait
```

### Check logs

```bash
gcloud logging read "resource.type=cloud_run_job AND resource.labels.job_name=lease-watchdog" \
  --project=detectiveml \
  --limit=20 \
  --format="table(timestamp, textPayload)"
```

## Updating the Job

After code changes, rebuild the image and update the job:

```bash
# Rebuild & push
docker build -t us-central1-docker.pkg.dev/detectiveml/detectiveml-docker/lease-watchdog:latest .
docker push us-central1-docker.pkg.dev/detectiveml/detectiveml-docker/lease-watchdog:latest

# Update the job to use the new image
gcloud run jobs update lease-watchdog \
  --image=us-central1-docker.pkg.dev/detectiveml/detectiveml-docker/lease-watchdog:latest \
  --region=us-central1 \
  --project=detectiveml
```

## Local Testing

```bash
cd infra/lease-watchdog

# Create a .env file
cat > .env << 'EOF'
FIREBASE_DATABASE_URL=https://detectiveml-default-rtdb.firebaseio.com
GOOGLE_APPLICATION_CREDENTIALS=../../backend/.auth/serviceAccountKey.json
EOF

# Create venv and run
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python main.py
```
