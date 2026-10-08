#!/usr/bin/env python3
"""Upmore iMessage outbox sender (TEST ONLY).

Drains public.imessage_outbox: rows enqueued by the imessage-inbound edge
function are sent through LoopMessage using USE-ONLY vault credentials
(surrogate-swapped at egress). This worker NEVER sees raw API keys: the
surrogate is applied to the urllib request by dynamic_credentials and is
never printed, logged, or persisted.

Credential names: custom.loopmessage-ruwe, custom.loopmessage-upmore.
Only valid for host a.loopmessage.com.

Run: cron every minute (see cron job upmore-imessage-sender).
Also runnable by hand: python3 workers/imessage_sender.py
"""
import json
import subprocess
import sys
import time
import urllib.request

sys.path.insert(0, "/opt/hatch/skills/skill-creator/bin")
from dynamic_credentials import (  # noqa: E402
    DynamicCredentialError,
    add_surrogate_to_request,
)

SB = ["python3", "/home/hatch/workspace/skills/supabase/bin/sb.py", "query"]
SEND_URL = "https://a.loopmessage.com/api/v1/message/send/"
ALLOWED_HOSTS = ["a.loopmessage.com"]
MAX_ATTEMPTS = 5
BATCH_LIMIT = 20
STALE_MINUTES = 5


def q(sql):
    """Run one SQL statement via sb.py; return the result rows (or None)."""
    r = subprocess.run(SB + [sql], capture_output=True, text=True, timeout=120)
    try:
        return json.loads(r.stdout)["result"]
    except Exception:
        print("SB QUERY FAILED:", r.stdout[:200], r.stderr[:200])
        return None


def esc(s):
    return (s or "").replace("'", "''")


def claim_rows():
    # 1. Stale 'sending' rows (worker died mid-run) go back to pending.
    q(
        "update public.imessage_outbox set status='pending' "
        f"where status='sending' and created_at < now() - interval '{STALE_MINUTES} minutes'"
    )
    # 2. Atomically claim the oldest pending rows.
    rows = q(
        "update public.imessage_outbox set status='sending' where id in ("
        "select id from public.imessage_outbox "
        f"where status='pending' order by created_at asc limit {BATCH_LIMIT}"
        ") returning id, agent, contact, text, seq, attempts, created_at"
    )
    if not rows:
        return []
    rows.sort(key=lambda r: (r["created_at"], r["seq"]))
    return rows


def mark_sent(row_id):
    q(
        "update public.imessage_outbox "
        f"set status='sent', sent_at=now() where id='{row_id}'"
    )


def mark_failed(row_id, err):
    q(
        "update public.imessage_outbox set attempts=attempts+1, "
        f"last_error='{esc(err[:300])}', "
        f"status=case when attempts+1>={MAX_ATTEMPTS} then 'failed' else 'pending' end "
        f"where id='{row_id}'"
    )


def send_one(row):
    """Send one outbox row. Returns (ok, error_message). Never logs secrets."""
    agent = row["agent"]
    req = urllib.request.Request(
        SEND_URL,
        data=json.dumps(
            {"contact": row["contact"], "text": row["text"]}
        ).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        add_surrogate_to_request(
            req,
            f"custom.loopmessage-{agent}",
            allowed_hosts=ALLOWED_HOSTS,
        )
    except DynamicCredentialError as e:
        return False, f"credential not connected ({type(e).__name__})"
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            body = resp.read(4096).decode("utf-8", errors="replace")
            if 200 <= resp.status < 300:
                return True, ""
            return False, f"HTTP {resp.status}: {body[:200]}"
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e)[:200]}"


def main():
    t0 = time.time()
    try:
        rows = claim_rows()
    except Exception as e:
        print(f"imessage_sender: claim failed: {type(e).__name__}")
        return
    if rows is None:
        print("imessage_sender: claim query errored")
        return
    sent = failed = skipped_cred = 0
    for i, row in enumerate(rows):
        if i > 0:
            time.sleep(0.6)  # human pacing between bubbles
        if not (row.get("text") or "").strip():
            mark_failed(row["id"], "empty text")
            failed += 1
            continue
        ok, err = send_one(row)
        if ok:
            mark_sent(row["id"])
            sent += 1
        else:
            mark_failed(row["id"], err)
            failed += 1
            if err.startswith("credential not connected"):
                skipped_cred += 1
    dt = time.time() - t0
    print(
        f"imessage_sender: claimed={len(rows)} sent={sent} failed={failed} "
        f"cred_missing={skipped_cred} elapsed={dt:.1f}s"
    )


if __name__ == "__main__":
    main()
