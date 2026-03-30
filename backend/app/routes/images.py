"""Images routes — /api/images/*"""
from __future__ import annotations
import base64
import time
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from firebase_admin import storage as fb_storage

router = APIRouter(prefix="/api/images")


@router.post("/upload")
async def upload_image(request: Request):
    """POST /api/images/upload — Uploads a base64-encoded image to Firebase Storage."""
    body = await request.json()
    b64 = body.get("base64")
    path = body.get("path")

    if not b64 or not path:
        return JSONResponse({"error": "Missing required fields: base64, path"}, status_code=400)

    if b64.startswith("http"):
        return {"url": b64}

    try:
        data = b64.split(",")[1] if "," in b64 else b64
        buffer = base64.b64decode(data)
        size_kb = len(buffer) / 1024
        print(f"[Images] Uploading to {path} ({size_kb:.2f} KB)")

        bucket = fb_storage.bucket()
        blob = bucket.blob(path)
        blob.upload_from_string(buffer, content_type="image/png")
        blob.cache_control = "public, max-age=3600"
        blob.patch()
        blob.make_public()
        url = f"https://storage.googleapis.com/{bucket.name}/{path}?v={int(time.time() * 1000)}"

        print(f"[Images] Uploaded to {path} -> {url}")
        return {"url": url}
    except Exception as e:
        print(f"[Images] Upload failed for {path}: {e}")
        if len(b64) > 500000:
            print(f"[Images] Large payload ({len(b64) / 1024:.2f} KB) may have caused issues.")
        return JSONResponse({"error": "Failed to upload image."}, status_code=500)
