"""Persist zero-cost subprocess-binding wire proof; no real invocation configured."""
import hashlib
import json
from pathlib import Path

from test_opaque_invocation import OpaqueInvocationTests
from test_admission import Gate
from harness import run_turn

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "docs/career/live-evaluation/evidence/opaque-wire-control"


def capture():
    OUT.mkdir(parents=True, exist_ok=False)
    fixture = OpaqueInvocationTests()
    fixture.setUp()
    try:
        invocation = fixture.prepare()
        readiness = invocation.read_only_readiness()
        gate = Gate(fixture.root / "controlled-ledger")
        gate.install_once(invocation.binding)
        text = "  Please Reopen: my corrected note!\nKeep THIS wording.  "
        run_turn(gate, invocation, "controlled-opaque-one", text, "CONTROLLED-THREAD", OUT / "transcript.jsonl")
        for name, value in (("readiness.json", readiness), ("binding.json", invocation.binding),
                            ("request.json", json.loads((fixture.root / "observed-request.json").read_text()))):
            (OUT / name).write_text(json.dumps(value, indent=2) + "\n")
        (OUT / "controlled-invocation-source.txt").write_bytes(fixture.command.read_bytes())
        summary = {"mode": "controlled_zero_cost", "provider_requests": 0, "real_spend_micros": 0,
                   "actual_upmore_handler_executed": False, "existing_real_invocation_configured": False,
                   "gate_status_synthetic_only": gate.status(),
                   "raw_message_unchanged": json.loads((OUT / "request.json").read_text())["body"]["message"] == text,
                   "command_sha256": hashlib.sha256(fixture.command.read_bytes()).hexdigest(),
                   "scope": "Filesystem-only synthetic child process validates source pin, read-only readiness, exact native request and full-bound-before-child ordering; no live model, credentials or Upmore handler"}
        (OUT / "summary.json").write_text(json.dumps(summary, indent=2) + "\n")
    finally:
        fixture.doCleanups()


if __name__ == "__main__":
    capture()
