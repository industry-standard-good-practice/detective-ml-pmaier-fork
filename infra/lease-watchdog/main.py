"""
Lease Watchdog — Cloud Run Job

Runs periodically via Cloud Scheduler to recover stalled / failed cases.
Detects two categories:
  1. Lease-expired:  status == "in-progress" AND leaseUntil < now
  2. Explicitly failed: status == "failed"

Cases with retryCount < 3 are reset to "pending" for the Eventarc handler to
pick up again.  Cases at retryCount >= 3 are marked permanently failed.

Only this cron job increments retryCount.

Backwards compatibility: cases missing `leaseUntil` or `retryCount` fields
are skipped entirely — they predate the lease-based generation flow.
"""
from __future__ import annotations

import os
import sys
import json
import time

import firebase_admin
from firebase_admin import credentials, db as rtdb

MAX_RETRIES = 3


# ---------------------------------------------------------------------------
# Firebase init — mirrors backend/app/main.py
# ---------------------------------------------------------------------------

def _init_firebase() -> None:
    if firebase_admin._apps:
        return

    db_url = os.environ.get("FIREBASE_DATABASE_URL", "")
    storage_bucket = os.environ.get("FIREBASE_STORAGE_BUCKET", "")
    sa_key_path = os.environ.get("FIREBASE_SA_KEY_PATH", "")
    sa_key_json = os.environ.get("FIREBASE_SA_KEY_JSON", "")

    cred = None
    if sa_key_json:
        try:
            sa = json.loads(sa_key_json)
            cred = credentials.Certificate(sa)
            print("[Watchdog] Using SA key from FIREBASE_SA_KEY_JSON env var")
        except Exception as e:
            print(f"[Watchdog] Failed to parse FIREBASE_SA_KEY_JSON: {e}")
            sys.exit(1)
    elif sa_key_path and os.path.exists(sa_key_path):
        cred = credentials.Certificate(sa_key_path)
        print(f"[Watchdog] Using SA key from file: {sa_key_path}")
    else:
        gac = os.environ.get("GOOGLE_APPLICATION_CREDENTIALS", "")
        if gac and not os.path.exists(gac):
            del os.environ["GOOGLE_APPLICATION_CREDENTIALS"]
        cred = credentials.ApplicationDefault()
        print("[Watchdog] Using Application Default Credentials")

    options: dict = {}
    if db_url:
        options["databaseURL"] = db_url
    if storage_bucket:
        options["storageBucket"] = storage_bucket

    project_id = os.environ.get("GOOGLE_CLOUD_PROJECT", os.environ.get("GCLOUD_PROJECT", ""))
    if project_id:
        options["projectId"] = project_id

    firebase_admin.initialize_app(cred, options)
    print(f"[Watchdog] Firebase initialized (DB: {db_url or 'default'})")


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _now_ms() -> int:
    return int(time.time() * 1000)


def _is_lease_expired(case: dict, now: int) -> bool:
    """True if the case is in-progress with an expired lease."""
    if case.get("status") != "in-progress":
        return False
    lease_until = case.get("leaseUntil")
    if lease_until is None:
        return False  # backwards compat — skip cases without leaseUntil
    return lease_until < now


def _is_failed(case: dict) -> bool:
    """True if the case has status == 'failed'."""
    return case.get("status") == "failed"


def _has_required_fields(case: dict) -> bool:
    """Backwards compat check: case must have the new lease/retry fields.
    Cases created before this feature won't have `leaseUntil` or `retryCount`
    defined in their schema, so we skip them entirely.
    We check that the case was created with the new stub format by looking
    for the `retryCount` key being present (set to 0 at creation)."""
    return "retryCount" in case


# ---------------------------------------------------------------------------
# Main watchdog logic
# ---------------------------------------------------------------------------

def run_watchdog() -> None:
    _init_firebase()
    now = _now_ms()

    print(f"[Watchdog] Starting sweep at {now}")

    cases_ref = rtdb.reference("cases")
    snapshot = cases_ref.get()

    if not snapshot or not isinstance(snapshot, dict):
        print("[Watchdog] No cases found — nothing to do.")
        return

    reset_count = 0
    permanent_fail_count = 0
    skipped_legacy = 0
    skipped_ok = 0

    for case_id, case_data in snapshot.items():
        if not isinstance(case_data, dict):
            continue

        # Backwards compat: skip cases without new fields
        if not _has_required_fields(case_data):
            status = case_data.get("status", "???")
            if status in ("in-progress", "failed"):
                skipped_legacy += 1
            continue

        eligible = _is_lease_expired(case_data, now) or _is_failed(case_data)
        if not eligible:
            skipped_ok += 1
            continue

        retry_count = case_data.get("retryCount", 0)
        category = "lease-expired" if case_data.get("status") == "in-progress" else "failed"

        case_ref = cases_ref.child(case_id)

        if retry_count >= MAX_RETRIES:
            # Permanently failed — ensure status is "failed"
            if case_data.get("status") != "failed":
                case_ref.update({
                    "status": "failed",
                    "generationError": f"Exceeded maximum retry attempts ({MAX_RETRIES})",
                    "updatedAt": now,
                })
            permanent_fail_count += 1
            print(f"[Watchdog] ❌ {case_id}: permanently failed (retryCount={retry_count}, category={category})")
            continue

        # Reset to pending for retry
        new_retry_count = retry_count + 1
        case_ref.update({
            "status": "pending",
            "retryCount": new_retry_count,
            "leaseUntil": None,
            "generationStep": None,
            "generationPhase": None,
            "generationError": None,
            "updatedAt": now,
        })
        reset_count += 1
        print(
            f"[Watchdog] 🔄 {case_id}: reset to pending "
            f"(category={category}, retry {new_retry_count}/{MAX_RETRIES})"
        )

    print(
        f"[Watchdog] Sweep complete: "
        f"{reset_count} reset to pending, "
        f"{permanent_fail_count} permanently failed, "
        f"{skipped_legacy} skipped (legacy), "
        f"{skipped_ok} skipped (ok)"
    )


if __name__ == "__main__":
    # Support .env files for local development
    try:
        from dotenv import load_dotenv
        load_dotenv()
    except ImportError:
        pass

    run_watchdog()
