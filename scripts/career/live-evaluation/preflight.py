"""Read-only operational preflight. Never reads credential files or environment."""
import datetime
import hashlib
import json
from pathlib import Path
import subprocess

from admission import Gate, Denied, OPERATIONAL_ROOT

REPO = Path(__file__).resolve().parents[3]
REVIEWED_SOURCE = "346a48ce43be554bf79d04e765c9a5974439523c"
OBSERVED_A = "0907f0337c35016fbee912956d15155cc0b658b4"
OLD_AUDIT = "357f9fba11e2b428925fa7a224b1ebc7d01e85c9"


def git_bytes(ref, path):
    return subprocess.check_output(["git", "show", ref + ":" + path], cwd=REPO)


def inspect():
    paths = [Path("/workspace/.upmore-tools/audit-budget/budget.json"),
             Path("/workspace/upmore-audit/paid-full-3500/launch.json"),
             Path("/workspace/.upmore-tools/env.sh"),
             OPERATIONAL_ROOT / "invocation-attestation.json"]
    try:
        status = Gate().status()
    except Denied as e:
        status = {"admission_open": False, "reason": str(e), "admittable_now_micros": 0}
    sources = {}
    for ref in (REVIEWED_SOURCE, OBSERVED_A):
        for path in ("supabase/functions/agent-chat/handler-career.ts",
                     "supabase/functions/_shared/career_model_grounded.ts",
                     "supabase/functions/_shared/career_interview_entry.ts"):
            raw = git_bytes(ref, path)
            sources[ref + ":" + path] = hashlib.sha256(raw).hexdigest()
    # Process names only. No argv, environment, logs or credentials are read.
    processes = []
    for p in Path("/proc").iterdir():
        if p.name.isdigit():
            try:
                name = (p / "comm").read_text().strip()
                if name in ("deno", "python", "python3", "node"):
                    processes.append({"pid": int(p.name), "executable_name": name})
            except OSError:
                pass
    return {
        "observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "evaluation_branch": subprocess.check_output(["git", "branch", "--show-current"], cwd=REPO, text=True).strip(),
        "source_hashes": sources,
        "historical_audit_source": OLD_AUDIT,
        "historical_worker_slots": ["worker-1", "worker-2", "worker-3", "worker-4"],
        "original_worker_thread_ids": None,
        "original_worker_state": "UNVERIFIED: worker slots are processes, not ChatGPT thread IDs; do not substitute them",
        "thread_id_lookup": "Historical published audit docs/supervisor contain no campaign chat thread IDs; Personal Context unavailable; parent clarification pending",
        "parent_request_thread_id": "01a1365c-87f9-7510-8c18-e9c2b8a520cd",
        "known_path_presence_only": {str(p): p.exists() for p in paths},
        "local_process_names_only": processes,
        "process_scope": "Local executor only; names cannot establish campaign identity, terminal state or remote fence",
        "operational_gate": status,
        "gate_proof_scope": "Controlled zero-cost durable store/API; not installed on an existing provider transport",
        "allocation_micros": {"owner_total": 7_000_000, "old_spent_or_unresolved_hold": 5_000_000,
                              "this_task_max": 1_000_000, "leave_unused": 1_000_000},
        "new_live_provider_requests": 0,
        "new_verified_spend_micros": 0,
        "new_outstanding_provider_liabilities_micros": 0,
        "old_actual_spend_and_liabilities": "UNKNOWN; entire $5 conservatively unavailable",
        "credentials_read_or_printed": False,
        "credential_or_ongoing_access_configuration": False,
        "controlled": "See controlled evidence; no conversation capability score",
        "live_model": "NOT_RUN",
        "production": "NOT_RUN",
        "blockers": [
            "Exact original paid-campaign worker thread IDs plus original-executor terminal/fenced-within-old-$5 attestation are missing",
            "Existing secure configured Upmore invocation/read-only readiness/identity proof is missing; no credentials requested",
            "Reviewed source requires local_no_external_calls semanticVerifier on raw text; paired interview calls require career_journey typed commands. A's native text bridge remains pending at observed 0907f033",
            "Pinned transport maximum input/output/checker/other cost evidence and durable $1 ledger binding remain missing; evaluator gate alone does not establish server enforcement"
        ],
        "approval_status": "No denial; missing operational evidence. No paying action attempted",
    }


if __name__ == "__main__":
    print(json.dumps(inspect(), indent=2))
