"""Pure dispatch/source-guard proof. Reads pinned git blobs; NEVER runs PostgreSQL or SQL."""
import importlib.util
import io
import json
from pathlib import Path
import re
import subprocess
import sys
import tarfile
import tempfile
from types import SimpleNamespace
import unittest
from unittest import mock

sys.dont_write_bytecode = True
ROOT = Path(__file__).resolve().parents[3]
SPEC = importlib.util.spec_from_file_location("pinned_cloud_setup", Path(__file__).with_name("career_apply_card_cloud_setup.py"))
M = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(M)


class SetupProof(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        # Local read-only git command only; all initdb/pg_ctl/psql dispatch below is mocked.
        archive = subprocess.check_output(["git", "-C", str(ROOT), "archive", M.PIN, "supabase/migrations",
            "tests/db/stubs.sql", "tests/db/run.sh", "scripts/launch/apply-rails-and-seed.sh",
            "tests/db/agent_foundation.test.sql"])
        with tarfile.open(fileobj=io.BytesIO(archive)) as tar:
            cls.blobs = {f.name: tar.extractfile(f).read() for f in tar if f.isfile()}

    def test_fixed_plan_matches_exact_pinned_runner_and_launcher_order(self):
        run = self.blobs["tests/db/run.sh"].decode()
        early = run.split('for t in "$HERE"/*.test.sql;', 1)[0]
        first = re.findall(r'\b\d[^\s\\]*\.sql', re.search(r'for m in (.*?)\s*; do', early, re.S).group(1))
        direct = re.findall(r'"\$ROOT/supabase/migrations/([^"$]+\.sql)"', early)
        pending = sorted(Path(n).name for n in self.blobs if n.startswith("supabase/migrations/") and Path(n).name > M.BASELINE)
        late = re.findall(r'"\$ROOT/supabase/migrations/([^"$]+\.sql)"',
            run.split('echo "  ok   ledger backfilled, only new files applied, a re-run applies nothing"', 1)[1])
        self.assertEqual(M.EARLY, first+direct)
        self.assertEqual(M.PENDING, pending)
        self.assertEqual(M.LATE, late)
        self.assertNotIn("20261024130000_career_apply_card_cloud_bridge.sql", M.EARLY+M.PENDING+M.LATE)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="cloud-setup-MOCK-ONLY-")
        self.addCleanup(self.temp.cleanup)
        self.work = Path(self.temp.name)
        baseline, bridge, acceptance = [self.work/n for n in ("baseline", "bridge", "acceptance")]
        self.maps = {baseline: dict(self.blobs), bridge: {"up.sql": b"begin;\nselect 1;\ncommit;\n",
            "down.sql": b"begin;\nselect 2;\ncommit;\n"}, acceptance: {}}
        for name in ("career_apply_card_cloud_rollback_driver.py", "career_apply_card_cloud_rollback.test.sql",
            "career_apply_card_cloud.test.sql", "career_apply_card_cloud_lifecycle.test.sql", "career_apply_card_cloud_daily_cap.test.sql"):
            self.maps[acceptance]["tests/db/pending/"+name] = b"# mock artifact, never executed\n"
        for name in ("live014-source.sql", "rollback-seed.sql", "fixture.sql"):
            self.maps[acceptance]["tests/fixtures/card-cloud-db-20261021/"+name] = b"-- mock input, never executed\n"
        for root, files in self.maps.items():
            for relative, data in files.items():
                p = root/relative;p.parent.mkdir(parents=True, exist_ok=True);p.write_bytes(data)
        tools = {}
        for name in ("git", "initdb", "pg_ctl", "psql"):
            tools[name] = self.work/("MUST_NOT_EXECUTE_"+name)
            tools[name].write_text("nonexecutable mock-only sentinel")
        self.args = SimpleNamespace(**tools, baseline_root=baseline, up_source_root=bridge,
            up_source_pin="a"*40, up_sql=bridge/"up.sql", up_sha256=M.digest(self.maps[bridge]["up.sql"]),
            down_sql=bridge/"down.sql", down_sha256=M.digest(self.maps[bridge]["down.sql"]),
            acceptance_root=acceptance, acceptance_pin="b"*40, cluster_dir=self.work/"cluster",
            socket_dir=self.work/"socket", dbname="qa_card_cloud_mock", username="qa_owner", marker="card-cloud-tests",
            port=1, encoding="UTF8", timeout=1, mode="bridge")
        self.setup = M.Setup(self.args)
        self.dirty = False
        def git(root, *args):
            pins = {baseline: M.PIN, bridge: "a"*40, acceptance: "b"*40}
            if args == ("rev-parse", "HEAD"): return (pins[root]+"\n").encode()
            if args == ("rev-parse", "--show-toplevel"): return (str(root)+"\n").encode()
            if args[0] == "status": return b"?? unreviewed-new-migration.sql\n" if self.dirty else b""
            if args[0] == "ls-tree":
                return ("\n".join(sorted(Path(n).name for n in self.blobs if n.startswith("supabase/migrations/")))+"\n").encode()
            if args[0] == "show":
                pin, relative = args[1].split(":", 1)
                self.assertEqual(pin, pins[root]);return self.maps[root][relative]
            raise AssertionError(args)
        self.setup.git = git
        self.commands = []

    def capture(self, command, **kwargs):
        self.commands.append(command)
        return subprocess.CompletedProcess(command, 0)

    def test_fixed_pin_only_plan_retained_cluster_and_standalone_up(self):
        with mock.patch.object(M.subprocess, "run", side_effect=self.capture): self.setup.run()
        applied = [Path(r["command"][-1]).name for r in self.setup.records
            if r["label"].startswith(("early-", "pending-", "late-"))]
        self.assertEqual(applied, M.EARLY+M.PENDING+M.LATE)
        self.assertEqual(len(applied), 207)
        for command in self.commands:
            self.assertNotIn("--single-transaction", command);self.assertNotIn("-1", command)
            self.assertFalse(any("run.sh" in x or "apply-rails-and-seed.sh" in x or "*.sql" in x for x in command))
        up = next(r for r in self.setup.records if r["label"] == "reviewed-up")
        self.assertEqual(up["command"], self.setup.psql(self.setup.up))
        self.assertEqual(up["command"].count("-f"), 1)
        self.assertTrue(all("stop" not in c for c in self.commands))
        manifest = json.loads((self.args.cluster_dir/"setup-manifest.json").read_text())
        self.assertEqual(manifest["baseline_pin"], M.PIN)
        self.assertEqual(len(manifest["next_commands"]), 2)

    def test_unreviewed_checkout_aborts_before_initialization(self):
        self.dirty = True
        with mock.patch.object(M.subprocess, "run", side_effect=self.capture):
            with self.assertRaisesRegex(ValueError, "not clean"): self.setup.run()
        self.assertEqual(self.commands, []);self.assertFalse(self.args.cluster_dir.exists())

    def test_changed_verified_input_aborts_before_any_postgres_command(self):
        self.setup.prepare();self.setup.files["tests/db/stubs.sql"].write_text("changed")
        with mock.patch.object(M.subprocess, "run", side_effect=self.capture):
            with self.assertRaisesRegex(ValueError, "snapshot changed"): self.setup.call("should-not-run", ["NO"])
        self.assertEqual(self.commands, [])

    def test_failed_schema_stage_never_reaches_bridge_or_auto_cleanup(self):
        def fail(command, **kwargs):
            self.commands.append(command)
            return subprocess.CompletedProcess(command, 1 if command[-1].endswith("stubs.sql") else 0)
        with mock.patch.object(M.subprocess, "run", side_effect=fail):
            with self.assertRaisesRegex(RuntimeError, "stubs failed"): self.setup.run()
        self.assertFalse(any(r["label"] == "reviewed-up" for r in self.setup.records))
        self.assertTrue(all("stop" not in c for c in self.commands))


if __name__ == "__main__": unittest.main(verbosity=2)
