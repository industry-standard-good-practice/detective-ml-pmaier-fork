"""Stats routes — /api/stats/*"""
from __future__ import annotations
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
from firebase_admin import db as rtdb

router = APIRouter(prefix="/api/stats")

EMPTY_STATS = {
    "plays": 0, "successes": 0, "failures": 0,
    "upvotes": 0, "downvotes": 0,
    "totalEvidenceFound": 0, "totalSuspectsSpoken": 0, "totalTimelineFound": 0,
}

def _get_db(): return rtdb.reference()


@router.get("")
async def get_all_stats():
    try:
        snapshot = _get_db().child("caseStats").get()
        return snapshot or {}
    except Exception as e:
        print(f"[Stats] fetchAllCaseStats error: {e}")
        return JSONResponse({"error": "Failed to fetch stats."}, status_code=500)


@router.get("/{case_id}")
async def get_case_stats(case_id: str):
    try:
        snapshot = _get_db().child(f"caseStats/{case_id}").get()
        return snapshot if snapshot else {**EMPTY_STATS}
    except Exception as e:
        print(f"[Stats] fetchCaseStats error for {case_id}: {e}")
        return JSONResponse({"error": "Failed to fetch case stats."}, status_code=500)


@router.post("/{case_id}/results")
async def record_game_result(case_id: str, request: Request):
    body = await request.json()
    result = body.get("result")
    detail = body.get("detail")
    if not result or not detail:
        return JSONResponse({"error": "Missing required fields: result, detail"}, status_code=400)
    if result not in ("SUCCESS", "PARTIAL", "FAILURE"):
        return JSONResponse({"error": "result must be SUCCESS, PARTIAL, or FAILURE"}, status_code=400)
    try:
        ref = _get_db().child(f"caseStats/{case_id}")
        stats = ref.get() or {**EMPTY_STATS}
        stats["plays"] = (stats.get("plays") or 0) + 1
        if result == "SUCCESS":
            stats["successes"] = (stats.get("successes") or 0) + 1
        else:
            stats["failures"] = (stats.get("failures") or 0) + 1
        stats["totalEvidenceFound"] = (stats.get("totalEvidenceFound") or 0) + (detail.get("evidenceFound") or 0)
        stats["totalSuspectsSpoken"] = (stats.get("totalSuspectsSpoken") or 0) + (detail.get("suspectsSpoken") or 0)
        stats["totalTimelineFound"] = (stats.get("totalTimelineFound") or 0) + (detail.get("timelineFound") or 0)
        ref.set(stats)
        return {"success": True}
    except Exception as e:
        print(f"[Stats] recordGameResult error for {case_id}: {e}")
        return JSONResponse({"error": "Failed to record game result."}, status_code=500)


@router.get("/{case_id}/vote")
async def get_user_vote(case_id: str, request: Request):
    uid = request.state.user["uid"]
    try:
        snapshot = _get_db().child(f"caseVotes/{case_id}/{uid}").get()
        return {"vote": snapshot if snapshot else None}
    except Exception as e:
        print(f"[Stats] fetchUserVote error: {e}")
        return JSONResponse({"error": "Failed to fetch user vote."}, status_code=500)


@router.post("/{case_id}/vote")
async def submit_vote(case_id: str, request: Request):
    uid = request.state.user["uid"]
    body = await request.json()
    vote = body.get("vote")
    if vote not in ("up", "down"):
        return JSONResponse({"error": 'vote must be "up" or "down"'}, status_code=400)
    try:
        vote_ref = _get_db().child(f"caseVotes/{case_id}/{uid}")
        existing_vote = vote_ref.get()
        vote_ref.set(vote)
        stats_ref = _get_db().child(f"caseStats/{case_id}")
        stats = stats_ref.get() or {**EMPTY_STATS}
        if existing_vote == "up": stats["upvotes"] = max(0, (stats.get("upvotes") or 0) - 1)
        if existing_vote == "down": stats["downvotes"] = max(0, (stats.get("downvotes") or 0) - 1)
        if vote == "up": stats["upvotes"] = (stats.get("upvotes") or 0) + 1
        if vote == "down": stats["downvotes"] = (stats.get("downvotes") or 0) + 1
        stats_ref.set(stats)
        return {"success": True, "previousVote": existing_vote}
    except Exception as e:
        print(f"[Stats] submitVote error: {e}")
        return JSONResponse({"error": "Failed to submit vote."}, status_code=500)
