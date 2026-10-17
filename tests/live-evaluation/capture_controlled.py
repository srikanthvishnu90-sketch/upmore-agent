"""Export strictly labelled zero-network harness evidence. No private prompts."""
import hashlib
import json
from pathlib import Path
import tempfile

from test_admission import Gate, binding, receipt
from harness import adapter_digest, artifact_proof, run_turn
from admission import Denied

REPO = Path(__file__).resolve().parents[2]
OUT = REPO / "docs/career/live-evaluation/evidence/final-control"


def capture():
    OUT.mkdir(parents=True, exist_ok=True)
    out = OUT / "controlled-transcript.jsonl"
    if out.exists():
        raise RuntimeError("Do not overwrite existing evidence")
    with tempfile.TemporaryDirectory() as root:
        gate = Gate(root)
        b = binding()

        class ControlledUpmoreSeam:
            mode = "controlled_zero_cost"
            binding = b

            def invoke_upmore(self, body, ticket):
                if ticket["id"] == "controlled-unknown":
                    raise TimeoutError("CONTROLLED; no provider request")
                return {"selected_route": "native_text",
                        "response": {"reply": "CONTROLLED ADAPTER: synthetic response, no model invoked."},
                        "usage_receipt": receipt(b, ticket, actual=0)}

        invocation = ControlledUpmoreSeam()
        b["adapter_sha256"] = adapter_digest(invocation)
        gate.install_once(b)
        run_turn(gate, invocation, "controlled-one", "Please continue my saved preparation.", "CONTROLLED-THREAD", out)
        try:
            run_turn(gate, invocation, "controlled-unknown", "Please reopen the note.", "CONTROLLED-THREAD", out)
        except TimeoutError:
            pass
        try:
            run_turn(gate, invocation, "controlled-after-unknown", "Continue.", "CONTROLLED-THREAD", out)
        except Denied as e:
            stop = str(e)
        artifact = OUT / "controlled-artifact.txt"
        artifact.write_text("CONTROLLED LOCAL ARTIFACT\nCreated by the evaluator test, not Upmore or a model.\n", encoding="utf-8")
        proof = artifact_proof(artifact, hashlib.sha256(artifact.read_bytes()).hexdigest())
        proof["path"] = str(artifact.relative_to(REPO))
        summary = {"mode": "controlled_zero_cost", "network_requests": 0, "real_spend_micros": 0,
                   "gate_status_synthetic_only": gate.status(), "post_unknown_stop": stop,
                   "artifact_proof": proof, "actual_upmore_handler_executed": False,
                   "live_model": "NOT_RUN", "production": "NOT_RUN",
                   "limitations": "Injected seam verifies harness accounting/order; no model, handler quality, server deployment, owner persistence or production capability verified"}
        (OUT / "controlled-summary.json").write_text(json.dumps(summary, indent=2) + "\n")


if __name__ == "__main__":
    capture()
