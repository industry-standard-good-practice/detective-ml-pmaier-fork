"""Cases CRUD routes — /api/cases/*
Faithful port of src/routes/cases.ts.
Cases are stored flat at 'cases/{caseId}' in Firebase RTDB.
"""
from __future__ import annotations
import time
from typing import Optional
from fastapi import APIRouter, Request, Query
from fastapi.responses import JSONResponse
from firebase_admin import db as rtdb

router = APIRouter(prefix="/api/cases")

PLACEHOLDER_NAMES = ["unknown author", "anonymous", ""]


def _strip_undefined(obj):
    """Recursively strip None values (RTDB rejects undefined)."""
    if obj is None:
        return None
    if isinstance(obj, list):
        return [_strip_undefined(v) for v in obj]
    if isinstance(obj, dict):
        return {k: _strip_undefined(v) for k, v in obj.items() if v is not None}
    return obj


def _get_db():
    return rtdb.reference()


@router.get("")
async def get_cases(request: Request, authorId: Optional[str] = Query(default=None)):
    """
    GET /api/cases
    Returns published community cases OR user-specific cases.
    Query params:
      ?authorId=<uid>  → returns ALL cases for that user (published + unpublished)
      (no params)      → returns only published cases with valid authors
    """
    try:
        snapshot = _get_db().child("cases").get()
        if not snapshot:
            return []

        all_cases = list(snapshot.values()) if isinstance(snapshot, dict) else []

        if authorId:
            user_cases = [c for c in all_cases if isinstance(c, dict) and c.get("authorId") == authorId]
            return user_cases
        else:
            published = [
                c for c in all_cases
                if isinstance(c, dict)
                and c.get("isUploaded") is True
                and c.get("authorId")
                and c.get("authorDisplayName")
                and (c.get("authorDisplayName", "").strip().lower() not in PLACEHOLDER_NAMES)
            ]
            return published
    except Exception as e:
        print(f"[Cases] GET /api/cases error: {e}")
        return JSONResponse({"error": "Failed to fetch cases."}, status_code=500)


@router.put("/{case_id}")
async def update_case(case_id: str, request: Request):
    """
    PUT /api/cases/:id
    Creates or updates a case.
    Preserves author identity from existing data, protects publish state.
    """
    updates = await request.json()

    if not updates.get("authorId"):
        return JSONResponse({"error": "authorId is required in the request body."}, status_code=400)

    try:
        case_ref = _get_db().child(f"cases/{case_id}")
        current_data = case_ref.get()

        # Strip isUploaded from incoming data — only publishCase controls publish state
        safe_updates = {k: v for k, v in updates.items() if k != "isUploaded"}
        final_updates = {**safe_updates}

        is_major_update = any(updates.get(k) for k in ("suspects", "title", "description", "initialEvidence"))

        if current_data and isinstance(current_data, dict):
            # Preserve original author identity from database
            if current_data.get("authorId"):
                final_updates["authorId"] = current_data["authorId"]
            if current_data.get("authorDisplayName"):
                final_updates["authorDisplayName"] = current_data["authorDisplayName"]

            # Preserve existing publish state
            final_updates["isUploaded"] = current_data.get("isUploaded", False)

            # Guard: if published without valid authorDisplayName, force unpublish
            if final_updates.get("isUploaded") is True and not final_updates.get("authorDisplayName"):
                final_updates["isUploaded"] = False

            # Increment version on major updates
            if is_major_update:
                final_updates["version"] = (current_data.get("version") or 1) + 1

            final_updates["updatedAt"] = int(time.time() * 1000)
            case_ref.update(_strip_undefined(final_updates))
        else:
            # New case — never published
            final_updates.setdefault("version", final_updates.get("version") or 1)
            final_updates.setdefault("createdAt", final_updates.get("createdAt") or int(time.time() * 1000))
            final_updates["isUploaded"] = False
            final_updates["updatedAt"] = int(time.time() * 1000)

            if not final_updates.get("authorDisplayName"):
                return JSONResponse({"error": "authorDisplayName is required for new cases."}, status_code=400)

            case_ref.set(_strip_undefined(final_updates))

        return {"success": True}
    except Exception as e:
        print(f"[Cases] PUT /api/cases/{case_id} error: {e}")
        return JSONResponse({"error": "Failed to update case."}, status_code=500)


@router.delete("/{case_id}")
async def delete_case(case_id: str, request: Request):
    """DELETE /api/cases/:id — Removes a case from the database."""
    try:
        _get_db().child(f"cases/{case_id}").delete()
        return {"success": True}
    except Exception as e:
        print(f"[Cases] DELETE /api/cases/{case_id} error: {e}")
        return JSONResponse({"error": "Failed to delete case."}, status_code=500)


@router.post("/{case_id}/publish")
async def publish_case(case_id: str, request: Request):
    """
    POST /api/cases/:id/publish
    Publishes a case (sets isUploaded: true) with author validation.
    Body: full CaseData object.
    """
    case_data = await request.json()

    final_author_id = case_data.get("authorId")
    if not final_author_id:
        return JSONResponse({"error": "Cannot publish: no authorId provided."}, status_code=400)

    final_display_name = case_data.get("authorDisplayName")
    if not final_display_name or final_display_name.strip().lower() in PLACEHOLDER_NAMES:
        return JSONResponse({"error": "Cannot publish: valid authorDisplayName is required."}, status_code=400)

    try:
        case_ref = _get_db().child(f"cases/{case_id}")
        data_to_publish = {
            **case_data,
            "isUploaded": True,
            "version": case_data.get("version") or 1,
            "authorId": final_author_id,
            "authorDisplayName": final_display_name,
            "createdAt": case_data.get("createdAt") or int(time.time() * 1000),
            "updatedAt": int(time.time() * 1000),
        }
        case_ref.set(_strip_undefined(data_to_publish))
        return {"success": True}
    except Exception as e:
        print(f"[Cases] POST /api/cases/{case_id}/publish error: {e}")
        return JSONResponse({"error": "Failed to publish case."}, status_code=500)
