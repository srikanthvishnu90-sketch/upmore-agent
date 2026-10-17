import concurrent.futures
import copy
import hashlib
import json
from pathlib import Path
import sqlite3
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "scripts/career/live-evaluation"))
from admission import ALLOCATION, CAP, Denied, Gate as OperationalGate, _GateStore as Gate, digest
from harness import adapter_digest, artifact_proof, run_turn


def binding():
    return {"allocation": ALLOCATION, "cap_micros": CAP,
            "old_workers": [{"thread_id": "CONTROLLED-WORKER", "state": "terminal", "evidence_ref": "controlled"}],
            "all_old_workers_accounted": True, "invocation_id": "controlled-upmore",
            "host_id": "controlled-host", "source_sha": "controlled-source",
            "readiness_evidence_ref": "controlled", "native_text_evidence_ref": "controlled",
            "full_bound_evidence_ref": "controlled", "adapter_sha256": "controlled",
            "existing_secure_invocation_verified": True, "native_text_route_verified": True,
            "all_paying_paths_bounded": True, "automatic_retries": 0,
            "bounds_micros": {"generation": 60_000, "checker": 30_000, "other": 10_000}}


def receipt(b, ticket, actual=1):
    return {"admission_id": ticket["id"], "request_sha256": ticket["request_sha256"],
            "binding_sha256": digest(b),
            "legs": {name: {"cost_micros": actual, "final": True,
                             "provider_request_ids": [ticket["id"] + ":" + name]}
                     for name in ("generation", "checker", "other")}}


def race(root, name, b):
    # Each contender opens its own durable SQLite connection.
    try:
        Gate(root).reserve(name, {"message": name}, digest(b))
        return "admitted"
    except Denied:
        return "denied"


class AdmissionTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name)
        self.b = binding()
        self.gate = Gate(self.root)
        self.gate.install_once(self.b)

    def reserve(self, key="one"):
        return self.gate.reserve(key, {"message": "ordinary natural text"}, digest(self.b))

    def test_repeated_install_never_resets_spend(self):
        self.reserve()
        for _ in range(4):
            with self.assertRaises(Denied):
                self.gate.install_once(self.b)
        self.assertEqual(self.gate.status()["admitted_full_bounds_micros"], 100_000)

    def test_operational_api_has_no_alternate_ledger_or_cap(self):
        for kwargs in ({"root": self.root}, {"cap": 7_000_000}, {"allocation": "another"}):
            with self.assertRaises(TypeError): OperationalGate(**kwargs)
        self.assertFalse(hasattr(OperationalGate(), "reset"))
        self.assertFalse(hasattr(OperationalGate(), "refund"))

    def test_changed_cap_or_campaign_refused(self):
        for key, value in (("cap_micros", 7_000_000), ("allocation", "new-run")):
            b = copy.deepcopy(self.b); b[key] = value
            with tempfile.TemporaryDirectory() as root, self.assertRaises(Denied):
                Gate(root).install_once(b)

    def test_invalid_or_unpriced_full_bound_refused(self):
        for value in (None, True, -1, 1.5, CAP + 1):
            b = copy.deepcopy(self.b); b["bounds_micros"]["checker"] = value
            with tempfile.TemporaryDirectory() as root, self.assertRaises(Denied):
                Gate(root).install_once(b)

    def test_partial_install_tombstone_never_recreates_allocation(self):
        with tempfile.TemporaryDirectory() as root:
            gate = Gate(root)
            gate.seal.write_text('{"allocation":"partial"}')
            with self.assertRaises(Denied): gate.install_once(self.b)
            with self.assertRaises(Denied): gate.status()
            self.assertFalse(gate.db.exists())

    def test_missing_ledger_status_does_not_create_one(self):
        with tempfile.TemporaryDirectory() as root:
            g = Gate(root)
            with self.assertRaises(Denied):
                g.status()
            self.assertFalse(g.db.exists())

    def test_deleted_ledger_cannot_reinitialize(self):
        self.reserve(); self.gate.db.unlink()
        with self.assertRaises(Denied):
            self.gate.status()
        with self.assertRaises(Denied):
            self.gate.install_once(self.b)
        self.assertFalse(self.gate.db.exists())

    def test_missing_seal_denies_existing_ledger(self):
        self.gate.seal.unlink()
        with self.assertRaises(Denied):
            self.reserve()

    def test_unknown_blocks_new_id_and_survives_reopen(self):
        self.reserve()
        self.gate = Gate(self.root)
        with self.assertRaisesRegex(Denied, "global_unknown"):
            self.reserve("new-id")
        self.assertEqual(self.gate.status()["unresolved_full_bound_micros"], 100_000)
        self.assertEqual(self.gate.status()["admittable_now_micros"], 0)

    def test_duplicate_call_cannot_redispatch(self):
        t = self.reserve()
        self.gate.record_verified_receipt(t["id"], receipt(self.b, t))
        with self.assertRaisesRegex(Denied, "never_redispatch"):
            self.reserve()

    def test_all_three_liabilities_reserved_before_dispatch(self):
        t = self.reserve()
        self.assertEqual(t["bound_micros"], sum(self.b["bounds_micros"].values()))
        self.assertEqual(self.gate.status()["unresolved_full_bound_micros"], 100_000)

    def test_final_receipt_does_not_refill_allocation(self):
        for i in range(10):
            t = self.reserve(str(i))
            self.gate.record_verified_receipt(t["id"], receipt(self.b, t))
        status = self.gate.status()
        self.assertEqual(status["receipt_verified_micros"], 30)
        self.assertEqual(status["admitted_full_bounds_micros"], CAP)
        with self.assertRaises(Denied):
            self.reserve("eleven")

    def test_concurrent_processes_share_one_unknown_stop(self):
        with concurrent.futures.ProcessPoolExecutor(max_workers=6) as pool:
            results = list(pool.map(race, [self.root] * 12, map(str, range(12)), [self.b] * 12))
        self.assertEqual(results.count("admitted"), 1)
        self.assertEqual(self.gate.status()["admitted_full_bounds_micros"], 100_000)

    def test_sql_updates_deletes_and_over_cap_insert_refused(self):
        self.reserve()
        for sql in ("DELETE FROM admissions", "UPDATE admissions SET bound=1",
                    "DELETE FROM policy", "UPDATE policy SET data='{}'",
                    "INSERT INTO admissions VALUES('b','x',1000000,0)"):
            with sqlite3.connect(self.gate.db) as c, self.assertRaises(sqlite3.IntegrityError):
                c.execute(sql)

    def test_malformed_partial_or_excessive_receipt_retains_hold(self):
        t = self.reserve()
        for mutation in ("missing_checker", "too_expensive", "not_final", "wrong_request", "foreign_binding"):
            r = receipt(self.b, t)
            if mutation == "missing_checker": del r["legs"]["checker"]
            if mutation == "too_expensive": r["legs"]["checker"]["cost_micros"] = 30_001
            if mutation == "not_final": r["legs"]["generation"]["final"] = False
            if mutation == "wrong_request": r["request_sha256"] = "other"
            if mutation == "foreign_binding": r["binding_sha256"] = "other"
            with self.assertRaises(Denied):
                self.gate.record_verified_receipt(t["id"], r)
            self.assertEqual(self.gate.status()["unresolved_full_bound_micros"], 100_000)
            self.assertEqual(self.gate.status()["receipt_verified_micros"], 0)

    def test_same_provider_charge_cannot_be_counted_twice(self):
        t = self.reserve(); r = receipt(self.b, t)
        self.gate.record_verified_receipt(t["id"], r)
        t2 = self.reserve("two"); r2 = receipt(self.b, t2)
        r2["legs"]["generation"]["provider_request_ids"] = r["legs"]["generation"]["provider_request_ids"]
        with self.assertRaises(Denied): self.gate.record_verified_receipt(t2["id"], r2)
        self.assertEqual(self.gate.status()["unresolved_full_bound_micros"], 100_000)

    def test_missing_worker_or_native_readiness_prevents_install(self):
        for field in ("all_old_workers_accounted", "existing_secure_invocation_verified",
                      "native_text_route_verified", "all_paying_paths_bounded"):
            b = copy.deepcopy(self.b); b[field] = False
            with tempfile.TemporaryDirectory() as root, self.assertRaises(Denied):
                Gate(root).install_once(b)

    def test_binding_change_blocks_before_admission(self):
        with self.assertRaisesRegex(Denied, "binding_changed"):
            self.gate.reserve("a", {}, "new-host-or-model")
        self.assertEqual(self.gate.status()["admitted_full_bounds_micros"], 0)

    def adapter(self, fail=False, route="native_text"):
        gate = self.gate
        class ControlledAdapter:
            binding = self.b
            mode = "controlled_zero_cost"
            calls = 0
            def invoke_upmore(adapter, body, ticket):
                adapter.calls += 1
                self.assertEqual(set(body), {"message", "thread_id"})
                self.assertEqual(gate.status()["unresolved_full_bound_micros"], 100_000)
                if fail: raise TimeoutError("controlled timeout; zero network")
                return {"selected_route": route, "response": {"reply": "CONTROLLED RESPONSE"},
                        "usage_receipt": receipt(adapter.binding, ticket)}
        adapter = ControlledAdapter()
        # Install-specific adapter pin is established before any dispatch. This
        # fixture starts with a new empty store, never replacing a spent ledger.
        adapter.binding = copy.deepcopy(self.b)
        adapter.binding["adapter_sha256"] = adapter_digest(adapter)
        adapter_root = self.root / "controlled-adapter-allocation"
        self.gate = Gate(adapter_root)
        self.b = adapter.binding
        self.gate.install_once(self.b)
        gate = self.gate
        return adapter

    def test_natural_message_reaches_adapter_unchanged(self):
        adapter = self.adapter(); out = self.root / "transcript.jsonl"
        message = "Use my corrected experience and finish the briefing I requested."
        run_turn(self.gate, adapter, "one", message, "thread-a", out)
        events = [json.loads(line) for line in out.read_text().splitlines()]
        self.assertEqual(events[0]["request"]["message"], message)
        self.assertEqual(events[1]["result"]["response"]["reply"], "CONTROLLED RESPONSE")
        self.assertEqual(adapter.calls, 1)

    def test_timeout_never_retries_and_retains_full_pair(self):
        adapter = self.adapter(fail=True); out = self.root / "transcript.jsonl"
        with self.assertRaises(TimeoutError): run_turn(self.gate, adapter, "one", "Help me finish", "a", out)
        with self.assertRaises(Denied): run_turn(self.gate, adapter, "two", "Continue", "a", out)
        self.assertEqual(adapter.calls, 1)
        self.assertEqual(self.gate.status()["unresolved_full_bound_micros"], 100_000)

    def test_changed_adapter_source_denies_before_dispatch(self):
        adapter = self.adapter(); adapter.binding["adapter_sha256"] = "changed"
        with self.assertRaisesRegex(Denied, "adapter_source_binding_changed"):
            run_turn(self.gate, adapter, "one", "Continue", "a", self.root / "t.jsonl")
        self.assertEqual(adapter.calls, 0)
        self.assertEqual(self.gate.status()["admitted_full_bounds_micros"], 0)

    def test_typed_route_rejected_without_claiming_conversation(self):
        adapter = self.adapter(route="career_journey"); out = self.root / "transcript.jsonl"
        with self.assertRaisesRegex(Denied, "unexpected_route"):
            run_turn(self.gate, adapter, "one", "Make a prep sheet", "a", out)
        self.assertEqual(self.gate.status()["unresolved_full_bound_micros"], 100_000)

    def test_artifact_requires_actual_matching_utf8_bytes(self):
        p = self.root / "brief.txt"; p.write_text("CONTROLLED ARTIFACT", encoding="utf-8")
        h = hashlib.sha256(p.read_bytes()).hexdigest()
        self.assertEqual(artifact_proof(p, h)["bytes"], 19)
        p.write_text("changed")
        with self.assertRaises(Denied): artifact_proof(p, h)
        with self.assertRaises(FileNotFoundError): artifact_proof(self.root / "promise.txt", h)


if __name__ == "__main__":
    unittest.main(verbosity=2)
