#!/usr/bin/env python3
"""Launcher dispatch tests only: psql is a recording executable, never a database client."""
import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
BRIDGE = "20261024130000_career_apply_card_cloud_bridge.sql"
BEFORE = "20261024120000_career_apply_cloud_gate_waiver.sql"
AFTER = "20261024140000_synthetic_after_bridge.sql"
FAKE_PSQL = r'''#!/usr/bin/env python3
import json,os,sys
args=sys.argv[1:]
with open(os.environ['MOCK_PSQL_LOG'],'a') as out:
    out.write(json.dumps(args)+'\n')
files=[args[i+1] for i,v in enumerate(args[:-1]) if v=='-f']
if os.environ.get('MOCK_FAIL_FILE') and any(f.endswith(os.environ['MOCK_FAIL_FILE']) for f in files):
    sys.exit(31)
queries=[args[i+1] for i,v in enumerate(args[:-1]) if v in ('-c','-tAc')]
if os.environ.get('MOCK_FAIL_LEDGER') and not files and any(
    'insert into public.upmore_migration_ledger' in q and os.environ['MOCK_FAIL_LEDGER'] in q for q in queries):
    sys.exit(32)
if any('select count(*) from public.upmore_migration_ledger' in q for q in queries):
    print('1')
elif any('select filename from public.upmore_migration_ledger' in q for q in queries):
    print(os.environ.get('MOCK_ALREADY_APPLIED',''))
'''


class MigrationLauncherDispatch(unittest.TestCase):
    def invoke(self, mode="--pending", bridge=True, fail_file=None, fail_ledger=None):
        with tempfile.TemporaryDirectory(prefix="card-cloud-launcher-mock-") as folder:
            root = Path(folder)
            (root / "scripts/launch").mkdir(parents=True)
            (root / "supabase/migrations").mkdir(parents=True)
            (root / "fakebin").mkdir()
            source = Path(os.environ.get("CARD_CLOUD_LAUNCHER_SOURCE",
                                         ROOT / "scripts/launch/apply-rails-and-seed.sh"))
            target = root / "scripts/launch" / source.name
            target.write_bytes(source.read_bytes())
            for name in ([BEFORE, BRIDGE, AFTER] if bridge else [BEFORE, AFTER]):
                (root / "supabase/migrations" / name).write_text("-- synthetic dispatch fixture only\n")
            for name in ("seed-gauntlet-test-user.sql", "verify-rails-live.sql"):
                (root / "scripts/launch" / name).write_text("-- synthetic dispatch fixture only\n")
            fake = root / "fakebin/psql"
            fake.write_text(FAKE_PSQL)
            fake.chmod(0o700)
            log = root / "calls.jsonl"
            env = dict(os.environ, PATH=str(fake.parent) + os.pathsep + os.environ["PATH"],
                       SUPABASE_DB_URL="postgresql://synthetic-only.invalid/not-a-real-db",
                       MOCK_PSQL_LOG=str(log), MOCK_ALREADY_APPLIED="")
            for name in ("MOCK_FAIL_FILE", "MOCK_FAIL_LEDGER"):
                env.pop(name, None)
            if fail_file:
                env["MOCK_FAIL_FILE"] = fail_file
            if fail_ledger:
                env["MOCK_FAIL_LEDGER"] = fail_ledger
            result = subprocess.run(["bash", str(target), mode], env=env, text=True,
                                    stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=10)
            calls = [json.loads(line) for line in log.read_text().splitlines()]
            return result, calls

    @staticmethod
    def migration_calls(calls):
        return [args for args in calls if any("supabase/migrations/" in value for value in args)]

    @staticmethod
    def files(args):
        return [Path(args[i+1]).name for i, value in enumerate(args[:-1]) if value == "-f"]

    def test_pending_bridge_uses_one_standalone_file_with_ledger_after_success(self):
        result, calls = self.invoke()
        self.assertEqual(result.returncode, 0, result.stderr)
        runs = self.migration_calls(calls)
        bridge = [args for args in runs if BRIDGE in self.files(args)]
        self.assertEqual(len(bridge), 1)
        self.assertEqual(self.files(bridge[0]), [BRIDGE])
        self.assertNotIn("--single-transaction", bridge[0])
        self.assertNotIn("-1", bridge[0])
        self.assertNotIn("-c", bridge[0])
        self.assertEqual([self.files(args) for args in runs if self.files(args)], [[BEFORE], [BRIDGE], [AFTER]])
        ledger = [i for i, args in enumerate(calls) if not self.files(args) and any(
            "insert into public.upmore_migration_ledger" in value and BRIDGE in value for value in args)]
        self.assertEqual(len(ledger), 1)
        self.assertGreater(ledger[0], calls.index(bridge[0]))

    def test_all_bridge_keeps_legacy_groups_transactional_and_seeds_last(self):
        result, calls = self.invoke("--all")
        self.assertEqual(result.returncode, 0, result.stderr)
        runs = self.migration_calls(calls)
        self.assertEqual([self.files(args) for args in runs], [[BEFORE], [BRIDGE], [AFTER]])
        self.assertIn("--single-transaction", runs[0])
        self.assertNotIn("--single-transaction", runs[1])
        self.assertNotIn("-c", runs[1])
        self.assertIn("--single-transaction", runs[2])
        seed = next(i for i, args in enumerate(calls) if "seed-gauntlet-test-user.sql" in self.files(args))
        self.assertGreater(seed, calls.index(runs[2]))

    def test_no_bridge_preserves_existing_single_transaction_ledger_batch(self):
        result, calls = self.invoke(bridge=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        runs = [args for args in self.migration_calls(calls) if self.files(args)]
        self.assertEqual(len(runs), 1)
        self.assertEqual(self.files(runs[0]), [BEFORE, AFTER])
        self.assertIn("--single-transaction", runs[0])
        self.assertEqual(runs[0].count("-c"), 2)

    def test_all_without_bridge_preserves_existing_single_transaction_and_seed_order(self):
        result, calls = self.invoke("--all", bridge=False)
        self.assertEqual(result.returncode, 0, result.stderr)
        runs = [args for args in self.migration_calls(calls) if self.files(args)]
        self.assertEqual(len(runs), 1)
        self.assertEqual(self.files(runs[0]), [BEFORE, AFTER])
        self.assertIn("--single-transaction", runs[0])
        self.assertNotIn("-c", runs[0])
        seed = next(i for i, args in enumerate(calls) if "seed-gauntlet-test-user.sql" in self.files(args))
        self.assertGreater(seed, calls.index(runs[0]))

    def test_bridge_failure_stops_before_ledger_and_later_files(self):
        result, calls = self.invoke(fail_file=BRIDGE)
        self.assertEqual(result.returncode, 31)
        self.assertFalse(any(AFTER in self.files(args) for args in calls))
        self.assertFalse(any(not self.files(args) and any("insert into public.upmore_migration_ledger" in value
            and BRIDGE in value for value in args) for args in calls))

    def test_postcommit_ledger_failure_stops_without_retrying_bridge_or_seeding(self):
        result, calls = self.invoke(fail_ledger=BRIDGE)
        self.assertEqual(result.returncode, 32)
        self.assertEqual(sum(BRIDGE in self.files(args) for args in calls), 1)
        self.assertFalse(any(AFTER in self.files(args) for args in calls))
        self.assertFalse(any("seed-gauntlet-test-user.sql" in self.files(args) for args in calls))


if __name__ == "__main__":
    unittest.main()
