"""
FastAPI application entry point.
Port of src/index.ts — initializes Firebase, CORS, auth middleware, and mounts all routes.
"""
from __future__ import annotations

# Load env vars first
import app.env  # noqa: F401

import os
import json
from contextlib import asynccontextmanager

import firebase_admin
from firebase_admin import credentials
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from app.middleware.auth import auth_middleware
from app.routes.cases import router as cases_router
from app.routes.gemini import router as gemini_router
from app.routes.stats import router as stats_router
from app.routes.images import router as images_router
from app.routes.eventarc import router as eventarc_router


def _init_firebase() -> None:
    """Initialize Firebase Admin SDK — mirrors initFirebase() from index.ts."""
    if firebase_admin._apps:
        return  # Already initialized

    db_url = os.environ.get("FIREBASE_DATABASE_URL", "")
    storage_bucket = os.environ.get("FIREBASE_STORAGE_BUCKET", "")
    sa_key_path = os.environ.get("FIREBASE_SA_KEY_PATH", "")
    sa_key_json = os.environ.get("FIREBASE_SA_KEY_JSON", "")

    cred = None
    if sa_key_json:
        try:
            sa = json.loads(sa_key_json)
            cred = credentials.Certificate(sa)
            print("[Firebase] Using SA key from FIREBASE_SA_KEY_JSON env var")
        except Exception as e:
            print(f"[Firebase] Failed to parse FIREBASE_SA_KEY_JSON: {e}")
    elif sa_key_path and os.path.exists(sa_key_path):
        cred = credentials.Certificate(sa_key_path)
        print(f"[Firebase] Using SA key from file: {sa_key_path}")
    else:
        # Clear GOOGLE_APPLICATION_CREDENTIALS if it points to a non-existent file
        # (e.g. .env sets it to a local dev path that doesn't exist on Cloud Run)
        gac = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
        if gac and not os.path.exists(gac):
            print(f"[Firebase] Clearing stale GOOGLE_APPLICATION_CREDENTIALS={gac} (file not found)")
            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
        # Will use Application Default Credentials (e.g. metadata server on GCP)
        cred = credentials.ApplicationDefault()
        print("[Firebase] Using Application Default Credentials")

    options: dict = {}
    if db_url:
        options["databaseURL"] = db_url
    if storage_bucket:
        options["storageBucket"] = storage_bucket

    # Firebase Auth (verify_id_token) requires an explicit project ID.
    # On Cloud Run, GOOGLE_CLOUD_PROJECT is set automatically.
    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", os.environ.get("GCLOUD_PROJECT", ""))
    if project_id:
        options["projectId"] = project_id

    firebase_admin.initialize_app(cred, options)
    print(f"[Firebase] Initialized (Project: {project_id or 'auto'}, DB: {db_url or 'default'}, Bucket: {storage_bucket or 'default'})")


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Startup / shutdown lifecycle."""
    _init_firebase()
    print("[Server] Firebase initialized, ready to serve.")
    yield
    print("[Server] Shutting down.")


# --- Build the app ---
fastapi_app = FastAPI(
    title="DetectiveML API",
    version="2.0.0",
    lifespan=lifespan,
)

# CORS — mirror the Express cors() defaults (allow all origins)
fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# Auth middleware — runs before every request
@fastapi_app.middleware("http")
async def firebase_auth(request: Request, call_next):
    """Intercept all requests to verify Firebase auth, except health check and Eventarc webhooks."""
    if request.url.path == "/api/health" or request.method == "OPTIONS" or request.url.path.startswith("/api/eventarc/"):
        return await call_next(request)
    try:
        await auth_middleware(request)
    except Exception as e:
        status = getattr(e, "status_code", 401)
        detail = getattr(e, "detail", str(e))
        return JSONResponse({"error": detail}, status_code=status)
    return await call_next(request)


# Mount routers
fastapi_app.include_router(cases_router)
fastapi_app.include_router(gemini_router)
fastapi_app.include_router(stats_router)
fastapi_app.include_router(images_router)
fastapi_app.include_router(eventarc_router)


@fastapi_app.get("/api/health")
async def health():
    return {"status": "ok", "runtime": "python-fastapi"}
