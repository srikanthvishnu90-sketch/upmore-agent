import copy
import hashlib
import json
from pathlib import Path
import sys
import tempfile
import unittest

from test_admission import binding, Gate
from harness import adapter_digest, run_turn
from admission import Denied
from opaque_invocation import ExistingUpmoreInvocation


class OpaqueInvocationTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.command = self.root / "existing-controlled-invocation"
        self.b = binding()

    def prepare(self, *, ready=True, wrong_host=False):
        identity = {k: self.b[k] for k in ("invocation_id", "host_id", "source_sha", "bounds_micros")}
        if wrong_host: identity["host_id"] = "other-controlled-host"
        response = {**identity, "operation": "read_only_readiness", "provider_calls": 0,
                    "native_text_implemented": ready, "native_pair_contract": "native_pair_v1"}
        # Controlled command has no network or credential APIs. It records the
        # exact stdin body, then echoes labelled synthetic response/usage.
        self.command.write_text("#!" + sys.executable + "\n" +
            "import json,pathlib,sys\n" +
            "request=json.load(sys.stdin)\n" +
            "if request['operation']=='read_only_readiness':\n" +
            " print(" + repr(json.dumps(response)) + ")\n" +
            "else:\n" +
            " pathlib.Path(" + repr(str(self.root / "observed-request.json")) + ").write_text(json.dumps(request))\n" +
            " t=request['admission']\n" +
            " r={'admission_id':t['id'],'request_sha256':t['request_sha256'],'binding_sha256':t['binding_sha256'],'legs':{k:{'cost_micros':0,'final':True,'provider_request_ids':[]}for k in ['generation','checker','other']}}\n" +
            " print(json.dumps({'selected_route':'native_text','response':{'reply':'CONTROLLED ONLY'},'usage_receipt':r}))\n")
        self.command.chmod(0o700)
        self.b["opaque_command_sha256"] = hashlib.sha256(self.command.read_bytes()).hexdigest()
        self.b["adapter_sha256"] = hashlib.sha256(Path(sys.modules[ExistingUpmoreInvocation.__module__].__file__).read_bytes()).hexdigest()
        return ExistingUpmoreInvocation(self.b, self.command, mode="controlled_zero_cost")

    def test_constructing_adapter_does_not_execute_or_configure_invocation(self):
        invocation = self.prepare()
        self.assertIsNone(invocation.readiness)
        self.assertFalse((self.root / "observed-request.json").exists())

    def test_source_only_native_contract_cannot_claim_readiness(self):
        invocation = self.prepare(ready=False)
        with self.assertRaisesRegex(Denied, "native_text_not_implemented"):
            invocation.read_only_readiness()
        self.assertIsNone(invocation.readiness)

    def test_missing_readiness_stops_before_reservation(self):
        invocation = self.prepare()
        gate = Gate(self.root / "controlled-ledger"); gate.install_once(invocation.binding)
        with self.assertRaisesRegex(Denied, "read_only_readiness_missing"):
            run_turn(gate, invocation, "one", "Continue", "a", self.root / "t.jsonl")
        self.assertEqual(gate.status()["admitted_full_bounds_micros"], 0)

    def test_configured_host_mismatch_refused(self):
        invocation = self.prepare(wrong_host=True)
        with self.assertRaisesRegex(Denied, "identity_or_full_bound_mismatch"):
            invocation.read_only_readiness()

    def test_native_wire_is_unchanged_and_bound_before_one_subprocess(self):
        invocation = self.prepare(); invocation.read_only_readiness()
        gate = Gate(self.root / "controlled-ledger"); gate.install_once(invocation.binding)
        text = "  Please Reopen: my corrected note!\nKeep THIS wording.  "
        run_turn(gate, invocation, "one", text, "controlled-thread", self.root / "transcript.jsonl")
        observed = json.loads((self.root / "observed-request.json").read_text())
        self.assertEqual(observed["operation"], "invoke_actual_upmore")
        self.assertEqual(set(observed["body"]), {"message", "thread_id", "turn_key"})
        self.assertEqual(observed["body"]["message"], text)
        self.assertEqual(gate.status()["admitted_full_bounds_micros"], 100_000)
        self.assertEqual(gate.status()["receipt_verified_micros"], 0)

    def test_changed_existing_command_blocks_before_new_reservation(self):
        invocation = self.prepare(); invocation.read_only_readiness()
        gate = Gate(self.root / "controlled-ledger"); gate.install_once(invocation.binding)
        self.command.write_text(self.command.read_text() + "# changed\n")
        with self.assertRaisesRegex(Denied, "invocation_bytes_changed"):
            run_turn(gate, invocation, "one", "Continue", "a", self.root / "t.jsonl")
        self.assertEqual(gate.status()["admitted_full_bounds_micros"], 0)

    def test_live_contract_rejects_synthetic_receipt_wrapper_without_actual_native_response(self):
        # Controlled child only: exercising live-contract validation is not a
        # live invocation or a model result, and nothing leaves this temp root.
        invocation = self.prepare(); invocation.read_only_readiness()
        invocation.mode = "live_model"
        gate = Gate(self.root / "controlled-ledger"); gate.install_once(invocation.binding)
        with self.assertRaisesRegex(Denied, "actual_native_response_identity_missing"):
            run_turn(gate, invocation, "one", "Continue", "a", self.root / "t.jsonl")
        self.assertEqual(gate.status()["unresolved_full_bound_micros"], 100_000)


if __name__ == "__main__":
    unittest.main(verbosity=2)
