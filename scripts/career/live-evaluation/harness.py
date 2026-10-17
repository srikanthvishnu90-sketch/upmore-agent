"""Natural text evaluator seam, never a typed-command converter.

No credential/configuration discovery or provider transport is installed here.
The invocation must be supplied by the evaluator after the operational evidence
is verified. Controlled tests inject a zero-cost adapter, explicitly labelled.
"""
import json
import os
import hashlib
import inspect
from pathlib import Path
from admission import Denied, digest


def adapter_digest(invocation):
    """Pin trusted adapter implementation bytes, without opening credentials."""
    return hashlib.sha256(Path(inspect.getfile(type(invocation))).read_bytes()).hexdigest()


def append_event(path, event):
    with Path(path).open("a", encoding="utf-8") as f:
        f.write(json.dumps(event, ensure_ascii=False, sort_keys=True) + "\n")
        f.flush()
        os.fsync(f.fileno())


def run_turn(gate, invocation, admission_id, message, thread_id, transcript):
    if not isinstance(message, str) or not message.strip():
        raise Denied("natural_text_required")
    if invocation.mode not in ("controlled_zero_cost", "live_model"):
        raise Denied("unclassified_invocation")
    if adapter_digest(invocation) != invocation.binding.get("adapter_sha256"):
        raise Denied("adapter_source_binding_changed")
    # The adapter must verify its own pinned source/endpoint/identity before this
    # point. It may not re-route user text via career_journey or direct prompts.
    body = {"message": message, "thread_id": thread_id}
    ticket = gate.reserve(admission_id, body, digest(invocation.binding))
    append_event(transcript, {"event": "admitted", "mode": invocation.mode,
                              "request": body, "ticket": ticket})
    try:
        result = invocation.invoke_upmore(body, ticket)
        append_event(transcript, {"event": "actual_response", "mode": invocation.mode,
                                  "admission_id": admission_id, "result": result})
        if result.get("selected_route") != "native_text":
            raise Denied("unexpected_route_receipt_full_bound_retained")
        gate.record_verified_receipt(admission_id, result["usage_receipt"])
        return result
    except Exception as e:
        # No retry, synthetic response, elapsed-time release or forced settlement.
        append_event(transcript, {"event": "stopped", "mode": invocation.mode,
                                  "admission_id": admission_id,
                                  "reason_type": type(e).__name__, "full_bound_retained": True})
        raise


def artifact_proof(path, expected_sha256):
    """Read actual local artifact bytes; never infer completion from model prose."""
    raw = Path(path).read_bytes()
    raw.decode("utf-8")
    actual = hashlib.sha256(raw).hexdigest()
    if actual != expected_sha256:
        raise Denied("artifact_readback_hash_mismatch")
    return {"path": str(path), "bytes": len(raw), "sha256": actual,
            "verification_level": "local_bytes_only_owner_provenance_still_required"}
