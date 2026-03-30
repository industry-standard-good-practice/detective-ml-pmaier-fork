"""Firebase auth middleware for FastAPI."""
from __future__ import annotations
from fastapi import Request, HTTPException
from fastapi.responses import JSONResponse
import firebase_admin
from firebase_admin import auth


async def auth_middleware(request: Request):
    """Verify Firebase ID token from Authorization header and attach user to request state."""
    # Skip auth for health check
    if request.url.path == "/api/health":
        return

    auth_header = request.headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")

    token = auth_header[7:]  # Strip "Bearer "
    try:
        decoded = auth.verify_id_token(token)
        request.state.user = decoded
    except firebase_admin.exceptions.FirebaseError as e:
        print(f"[Auth] Firebase token verification failed: {e}")
        raise HTTPException(status_code=401, detail="Invalid or expired token")
    except Exception as e:
        print(f"[Auth] Token verification error: {e}")
        raise HTTPException(status_code=401, detail="Authentication failed")
