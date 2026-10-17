"""Evaluator-only, fail-closed admission. No provider or credential imports.

One allocation, one ledger, no refund/reset/top-up interface. Every admitted
whole-invocation bound remains consumed even after a cheaper verified receipt.
An uncertain invocation blocks the allocation globally. Filesystem administrators
are outside this gate's trust boundary; it is not a provider account spending cap.
"""
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time

ALLOCATION = "upmore-seven-total-evaluation-20261017"
CAP = 1_000_000
OPERATIONAL_ROOT = Path("/workspace/shared/upmore-live-evaluation-20261017")
LEGS = ("generation", "checker", "other")


class Denied(Exception):
    pass


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(",", ":"),
                                     ensure_ascii=False).encode()).hexdigest()


def money(value):
    if type(value) is not int or not 0 <= value <= CAP:
        raise Denied("invalid_microUSD_bound")
    return value


def fsync_directory(path):
    fd = os.open(path, os.O_RDONLY | os.O_DIRECTORY)
    try:
        os.fsync(fd)
    finally:
        os.close(fd)


def validate_binding(binding):
    """A supplied attestation is evidence, never inferred from credential presence.

    Parent/original executor must verify these facts before supplying this record.
    This validator checks the contract shape, not the truth of an attestation.
    """
    try:
        if binding["allocation"] != ALLOCATION or binding["cap_micros"] != CAP:
            raise Denied("wrong_allocation_or_cap")
        workers = binding["old_workers"]
        if len(workers) < 1 or len({x["thread_id"] for x in workers}) != len(workers):
            raise Denied("missing_unique_original_worker_threads")
        if any(not x["thread_id"] or x["state"] not in ("terminal", "fenced_within_old_5")
               or not x["evidence_ref"] for x in workers):
            raise Denied("original_workers_unfenced")
        if binding["all_old_workers_accounted"] is not True:
            raise Denied("incomplete_original_worker_inventory")
        for key in ("invocation_id", "host_id", "source_sha", "readiness_evidence_ref",
                    "native_text_evidence_ref", "full_bound_evidence_ref", "adapter_sha256"):
            if not isinstance(binding[key], str) or not binding[key].strip():
                raise Denied("missing_binding_evidence:" + key)
        if binding["existing_secure_invocation_verified"] is not True:
            raise Denied("secure_invocation_unverified")
        if binding["native_text_route_verified"] is not True:
            raise Denied("native_text_route_unverified")
        if binding["all_paying_paths_bounded"] is not True or binding["automatic_retries"] != 0:
            raise Denied("unbounded_transport_or_retry")
        bounds = binding["bounds_micros"]
        if set(bounds) != set(LEGS) or not 0 < sum(money(bounds[k]) for k in LEGS) <= CAP:
            raise Denied("missing_full_invocation_bound")
        if not bounds["generation"]:
            raise Denied("missing_generation_bound")
    except (KeyError, TypeError, ValueError):
        raise Denied("incomplete_operational_attestation") from None


class _GateStore:
    """Internal store; alternate paths are used only by zero-cost tests."""
    def __init__(self, root):
        self.root = Path(root)
        self.db = self.root / "admission.sqlite3"
        self.seal = self.root / "allocation.seal.json"

    def install_once(self, binding):
        validate_binding(binding)
        self.root.mkdir(mode=0o700, parents=True, exist_ok=True)
        # An exclusive tombstone precedes database creation. A partial install or
        # deleted database cannot turn subsequent installation into a fresh $1.
        try:
            fd = os.open(self.seal, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        except FileExistsError:
            raise Denied("allocation_already_installed_or_partial") from None
        with os.fdopen(fd, "w") as f:
            json.dump({"allocation": ALLOCATION, "cap_micros": CAP,
                       "binding_sha256": digest(binding)}, f, sort_keys=True)
            f.flush()
            os.fsync(f.fileno())
        fsync_directory(self.root)
        fd = os.open(self.db, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
        os.close(fd)
        with sqlite3.connect(self.db) as c:
            c.executescript("""
                PRAGMA journal_mode=DELETE;
                PRAGMA synchronous=FULL;
                CREATE TABLE policy (id INTEGER PRIMARY KEY CHECK(id=1), data TEXT NOT NULL);
                CREATE TABLE admissions (id TEXT PRIMARY KEY, request_hash TEXT NOT NULL,
                  bound INTEGER NOT NULL CHECK(bound>0 AND bound<=1000000), created REAL NOT NULL);
                CREATE TABLE completions (id TEXT PRIMARY KEY REFERENCES admissions(id),
                  receipt TEXT NOT NULL, actual INTEGER NOT NULL CHECK(actual>=0));
                CREATE TABLE provider_requests (id TEXT PRIMARY KEY, admission TEXT NOT NULL);
                CREATE TRIGGER no_policy_update BEFORE UPDATE ON policy BEGIN SELECT RAISE(ABORT,'immutable'); END;
                CREATE TRIGGER no_policy_delete BEFORE DELETE ON policy BEGIN SELECT RAISE(ABORT,'immutable'); END;
                CREATE TRIGGER no_admission_update BEFORE UPDATE ON admissions BEGIN SELECT RAISE(ABORT,'immutable'); END;
                CREATE TRIGGER no_admission_delete BEFORE DELETE ON admissions BEGIN SELECT RAISE(ABORT,'immutable'); END;
                CREATE TRIGGER no_completion_update BEFORE UPDATE ON completions BEGIN SELECT RAISE(ABORT,'immutable'); END;
                CREATE TRIGGER no_completion_delete BEFORE DELETE ON completions BEGIN SELECT RAISE(ABORT,'immutable'); END;
                CREATE TRIGGER no_request_delete BEFORE DELETE ON provider_requests BEGIN SELECT RAISE(ABORT,'immutable'); END;
                CREATE TRIGGER no_request_update BEFORE UPDATE ON provider_requests BEGIN SELECT RAISE(ABORT,'immutable'); END;
                CREATE TRIGGER total_cap BEFORE INSERT ON admissions
                WHEN NEW.bound + (SELECT COALESCE(SUM(bound),0) FROM admissions)>1000000
                BEGIN SELECT RAISE(ABORT,'cap_exhausted'); END;
            """)
            c.execute("INSERT INTO policy VALUES(1,?)", (json.dumps(binding, sort_keys=True),))
        fsync_directory(self.root)
        fsync_directory(self.root.parent)

    def _connect(self):
        # mode=rw never creates a missing ledger. Missing/corrupt seal also denies.
        c = None
        try:
            seal = json.loads(self.seal.read_text())
            c = sqlite3.connect(self.db.resolve().as_uri() + "?mode=rw", uri=True, timeout=10)
            c.execute("PRAGMA synchronous=FULL")
            binding = json.loads(c.execute("SELECT data FROM policy WHERE id=1").fetchone()[0])
            validate_binding(binding)
            if seal != {"allocation": ALLOCATION, "cap_micros": CAP,
                        "binding_sha256": digest(binding)}:
                raise Denied("allocation_seal_mismatch")
            return c, binding
        except Denied:
            if c is not None:
                c.close()
            raise
        except (OSError, sqlite3.Error, ValueError, TypeError):
            if c is not None:
                c.close()
            raise Denied("durable_allocation_missing_or_corrupt") from None

    def status(self):
        c, binding = self._connect()
        try:
            # One snapshot for cost and uncertainty, including concurrent callers.
            c.execute("BEGIN")
            charged = c.execute("SELECT COALESCE(SUM(bound),0) FROM admissions").fetchone()[0]
            actual = c.execute("SELECT COALESCE(SUM(actual),0) FROM completions").fetchone()[0]
            pending = c.execute("SELECT id,bound FROM admissions WHERE id NOT IN (SELECT id FROM completions)").fetchall()
            return {"allocation": ALLOCATION, "cap_micros": CAP,
                    "admitted_full_bounds_micros": charged, "receipt_verified_micros": actual,
                    "unresolved_full_bound_micros": sum(b for _, b in pending),
                    "pending_ids": [i for i, _ in pending], "unallocated_micros": CAP - charged,
                    "admittable_now_micros": 0 if pending else CAP - charged,
                    "binding_sha256": digest(binding)}
        finally:
            c.close()

    def reserve(self, admission_id, body, binding_sha256):
        if not isinstance(admission_id, str) or not admission_id or len(admission_id) > 160:
            raise Denied("invalid_admission_id")
        c, binding = self._connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            if digest(binding) != binding_sha256:
                raise Denied("invocation_binding_changed")
            if c.execute("SELECT 1 FROM admissions WHERE id=?", (admission_id,)).fetchone():
                raise Denied("already_admitted_never_redispatch")
            if c.execute("SELECT 1 FROM admissions WHERE id NOT IN (SELECT id FROM completions)").fetchone():
                raise Denied("global_unknown_or_inflight_stop")
            bound = sum(binding["bounds_micros"].values())
            c.execute("INSERT INTO admissions VALUES(?,?,?,?)",
                      (admission_id, digest(body), bound, time.time()))
            c.commit()  # fsync before any caller can invoke the transport
            return {"id": admission_id, "bound_micros": bound, "binding_sha256": binding_sha256,
                    "request_sha256": digest(body)}
        except sqlite3.IntegrityError:
            raise Denied("cap_exhausted_or_duplicate") from None
        finally:
            c.close()

    def record_verified_receipt(self, admission_id, receipt):
        """Only the pinned trusted invocation adapter may supply usage receipts.

        No refund; no not_sent/timeout release. A missing, duplicated, mismatched
        or excessive receipt leaves the entire original bound unresolved.
        """
        c, binding = self._connect()
        try:
            c.execute("BEGIN IMMEDIATE")
            row = c.execute("SELECT request_hash,bound FROM admissions WHERE id=?", (admission_id,)).fetchone()
            if not row or receipt.get("request_sha256") != row[0] or receipt.get("admission_id") != admission_id:
                raise Denied("receipt_request_mismatch")
            if receipt.get("binding_sha256") != digest(binding) or set(receipt.get("legs", {})) != set(LEGS):
                raise Denied("incomplete_or_foreign_receipt")
            total = 0
            for name in LEGS:
                leg = receipt["legs"][name]
                cost = money(leg.get("cost_micros"))
                ids = leg.get("provider_request_ids")
                if cost > binding["bounds_micros"][name] or leg.get("final") is not True:
                    raise Denied("unknown_or_excessive_usage")
                if not isinstance(ids, list) or (cost and not ids):
                    raise Denied("missing_provider_request_identity")
                for request_id in ids:
                    if not isinstance(request_id, str) or not request_id:
                        raise Denied("invalid_provider_request_identity")
                    c.execute("INSERT INTO provider_requests VALUES(?,?)", (request_id, admission_id))
                total += cost
            c.execute("INSERT INTO completions VALUES(?,?,?)", (admission_id, json.dumps(receipt, sort_keys=True), total))
            c.commit()
        except sqlite3.IntegrityError:
            raise Denied("duplicate_receipt_or_provider_request") from None
        finally:
            c.close()


class Gate(_GateStore):
    """Operational API has no campaign, root, ceiling, reset or top-up argument."""
    def __init__(self):
        super().__init__(OPERATIONAL_ROOT)
