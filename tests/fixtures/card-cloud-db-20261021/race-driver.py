#!/usr/bin/env python3
"""QA ONLY / WRITTEN, NOT_RUN. Seed actual cloud cards without invented IDs.

Already-reviewed migrations must be installed separately in a fresh local cc_qa_*
database. This program never applies migrations, discovers DBs, or invokes an engine.
Explicit --host --port --dbname --username --case --disposable-db-marker
CARD_CLOUD_RACE_DISPOSABLE_V1 --authorize-disposable-db-tests
--authorize-fixture-setup are mandatory. Default: seed and export JSON, switches OFF.
--run-race additionally executes the existing concurrency harness. For claim and
maintenance it needs --authorize-flag-race, enables both switches only around that
test, then resets OFF in finally. flag-write also needs flag authorization. Rollback
cases require explicit --rollback-sql and --authorize-migration-lifecycle, even for
seed-only output. Flags attest to separately granted authorization; this file grants
none. Each case uses a DIFFERENT disposable database; destroy it afterward.
--run-existing-seed --run-race uses the committed QA manifest in that explicit DB;
no caller-generated owner/card/job/hash values or custom seed SQL are needed.
--self-test runs only pure/mock checks; --help and imports never connect to a DB.
"""

import argparse
import json
import os
from pathlib import Path
import re
import shlex
import signal
import subprocess
import sys
import uuid


MARKER = "CARD_CLOUD_RACE_DISPOSABLE_V1"
HERE = Path(__file__).resolve().parent
HARNESS = HERE.parents[1] / "db/pending/career_apply_card_cloud_concurrency.py"
OFF_REFUSAL = "rollback requires both switches OFF"


def literal(value):
    return "'" + str(value).replace("'", "''") + "'"


def execute(argv, *, sql=None, timeout=90):
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    env.update(PGAPPNAME="card_cloud_qa_race_driver", PGCONNECT_TIMEOUT="3")
    proc = subprocess.Popen(argv, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE, text=True, env=env, start_new_session=True)
    try:
        stdout, stderr = proc.communicate(sql, timeout=timeout)
    except subprocess.TimeoutExpired:
        os.killpg(proc.pid, signal.SIGTERM)
        try:
            proc.communicate(timeout=3)
        except subprocess.TimeoutExpired:
            os.killpg(proc.pid, signal.SIGKILL)
            proc.communicate()
        raise RuntimeError("fixture subprocess timed out; its process group was terminated")
    if proc.returncode:
        raise RuntimeError("fixture subprocess refused/failed:\n" + stderr + stdout)
    return stdout


def connection_args(args):
    return ["--host", args.host, "--port", str(args.port), "--dbname", args.dbname,
            "--username", args.username]


def psql_args(args):
    return [args.psql, "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1",
            "-h", args.host, "-p", str(args.port), "-d", args.dbname, "-U", args.username]


def validate(args):
    if not args.authorize_disposable_db_tests or not args.authorize_fixture_setup:
        raise ValueError("both --authorize-disposable-db-tests and --authorize-fixture-setup required")
    if args.disposable_db_marker != MARKER:
        raise ValueError("explicit --disposable-db-marker " + MARKER + " required")
    if not args.host or (args.host not in ("localhost", "127.0.0.1", "::1") and not args.host.startswith("/")):
        raise ValueError("one explicit local socket directory or loopback host is required")
    if any(c in args.host for c in ",\n\r\t "):
        raise ValueError("host lists and control characters are forbidden")
    if not args.dbname or not re.fullmatch(r"cc_qa_[a-z0-9_]+", args.dbname):
        raise ValueError("a fresh explicit cc_qa_* disposable database name is required")
    if not args.username or not args.port or not 0 < args.port < 65536 or not args.case:
        raise ValueError("explicit username, port and case are required")
    if args.run_existing_seed and not args.run_race:
        raise ValueError("--run-existing-seed requires --run-race")
    if args.case in ("maintenance", "flag-write"):
        if not args.rollback_sql or not args.authorize_migration_lifecycle:
            raise ValueError("rollback cases require explicit --rollback-sql and --authorize-migration-lifecycle")
    if args.rollback_sql:
        if not args.authorize_migration_lifecycle:
            raise ValueError("any rollback path requires --authorize-migration-lifecycle")
        path = Path(args.rollback_sql).resolve(strict=True)
        if not path.is_file() or any(c in str(path) for c in "'\n\r\\"):
            raise ValueError("rollback must name one explicit regular SQL file")
        args.rollback_sql = str(path)
    if args.run_race and args.case != "tap" and not args.authorize_flag_race:
        raise ValueError("claim/maintenance/flag-write execution requires --authorize-flag-race")


def parse_manifest(output, args):
    found = []
    for line in output.splitlines():
        try:
            value = json.loads(line)
        except json.JSONDecodeError:
            continue
        if isinstance(value, dict) and value.get("kind") == "card-cloud-race-seed-v1":
            found.append(value)
    if len(found) != 1:
        raise RuntimeError("fixture setup did not export exactly one machine JSON manifest")
    value = found[0]
    if (value["database"] != args.dbname or value["marker"] != MARKER or
            value["selected_case"] != args.case or value["fixture_marker_table"] != "card_cloud_qa.fixture_marker" or
            not re.fullmatch(r"card-cloud-race-[0-9a-f]{32}", value["fixture_tag"])):
        raise RuntimeError("committed fixture manifest does not match explicit target/case/marker")
    uuid.UUID(value["sources"]["owner"])
    if type(value["maintenance_lock_key"]) is not int or not -(1 << 63) <= value["maintenance_lock_key"] < 1 << 63:
        raise RuntimeError("fixture maintenance key is not an exact bigint")
    return value


def seed(args, invoke=execute):
    if args.run_existing_seed:
        sql = ("select manifest from card_cloud_qa.fixture_marker where database_name=current_database() "
               "and database_oid=(select oid from pg_database where datname=current_database()) "
               "and marker=" + literal(MARKER) + ";")
        return parse_manifest(invoke(psql_args(args), sql=sql), args)
    if "cc_seed_sources" not in (HERE / "fixture.sql").read_text():
        raise RuntimeError("source fixture prerequisite missing: regenerate fixture.sql using updated generate.ts")
    tag = "card-cloud-race-" + uuid.uuid4().hex
    argv = psql_args(args) + ["-v", "race_fixture_seed_authorized=true", "-v", "race_case=" + args.case,
        "-v", "race_dbname=" + args.dbname, "-v", "race_fixture_tag=" + tag,
        "-v", "race_disposable_marker=" + MARKER, "-f", str(HERE / "race-seed.sql")]
    return parse_manifest(invoke(argv), args)


def concurrency_argv(args, manifest):
    scenario = manifest["scenarios"][args.case]
    argv = [sys.executable, str(HARNESS), "--authorize-disposable-db-tests"] + connection_args(args)
    argv += ["--case", args.case, "--owner", manifest["sources"]["owner"],
             "--fixture-marker-table", manifest["fixture_marker_table"], "--fixture-tag", manifest["fixture_tag"],
             "--maintenance-lock-key", str(manifest["maintenance_lock_key"]), "--psql", args.psql]
    if args.case == "tap":
        uuid.UUID(scenario["card_id"])
        if not re.fullmatch(r"[0-9a-f]{64}", scenario["card_hash"]):
            raise RuntimeError("fixture card hash is not SHA-256")
        argv += ["--card", scenario["card_id"], "--card-hash", scenario["card_hash"],
                 "--expected-items", str(scenario["expected_items"])]
    if args.case in ("claim", "maintenance"):
        uuid.UUID(scenario["job_id"])
        argv += ["--job", scenario["job_id"]]
    if args.case in ("maintenance", "flag-write"):
        argv += ["--rollback-sql", args.rollback_sql, "--authorize-migration-lifecycle", "--authorize-flag-race"]
    if args.case == "flag-write":
        argv += ["--rollback-refusal-pattern", re.escape(OFF_REFUSAL)]
    return argv


def set_switches(args, manifest, value, invoke=execute):
    # Only this exact committed disposable fixture can authorize these global test rows.
    guard = ("begin; do $$ begin if current_database()<>" + literal(args.dbname) +
        " or not exists(select 1 from card_cloud_qa.fixture_marker where fixture_tag=" +
        literal(manifest["fixture_tag"]) + " and marker=" + literal(MARKER) +
        " and database_oid=(select oid from pg_database where datname=current_database())) then "
        "raise exception 'disposable fixture marker mismatch'; end if; "
        "if (select count(*) from public.career_cloud_settings where key in "
        "('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT'))<>2 then raise exception 'switch fixture missing'; end if;")
    if value == "on":
        guard += ("if exists(select 1 from public.career_cloud_settings where key in "
                  "('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT') and value<>'off') then "
                  "raise exception 'expected both switches OFF before authorized race'; end if;")
    sql = guard + "end $$; update public.career_cloud_settings set value=" + literal(value) + \
          " where key in ('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT'); commit;"
    invoke(psql_args(args), sql=sql)


def run_race(args, manifest, invoke=execute):
    argv = concurrency_argv(args, manifest)
    cleanup_required = args.case != "tap"
    try:
        if args.case in ("claim", "maintenance"):
            set_switches(args, manifest, "on", invoke)
        return invoke(argv, timeout=240)
    finally:
        if cleanup_required:
            set_switches(args, manifest, "off", invoke)


def resume_argv(args):
    argv = [sys.executable, str(HERE / "race-driver.py")] + connection_args(args)
    argv += ["--case", args.case, "--disposable-db-marker", MARKER,
             "--authorize-disposable-db-tests", "--authorize-fixture-setup", "--run-existing-seed", "--run-race"]
    if args.case != "tap":
        argv += ["--authorize-flag-race"]
    if args.case in ("maintenance", "flag-write"):
        argv += ["--rollback-sql", args.rollback_sql, "--authorize-migration-lifecycle"]
    if args.psql != "psql":
        argv += ["--psql", args.psql]
    return argv


def parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for name in ("host", "dbname", "username", "disposable-db-marker", "rollback-sql"):
        p.add_argument("--" + name)
    p.add_argument("--port", type=int)
    p.add_argument("--case", choices=("tap", "claim", "maintenance", "flag-write"))
    p.add_argument("--psql", default="psql")
    for name in ("authorize-disposable-db-tests", "authorize-fixture-setup", "authorize-migration-lifecycle",
                 "authorize-flag-race", "run-race", "run-existing-seed", "self-test"):
        p.add_argument("--" + name, action="store_true")
    return p


def self_test():
    assert HARNESS.is_file(), "bundled concurrency harness path is wrong"
    p = parser()
    args = p.parse_args(["--host", "/tmp/cc_fixture_socket", "--port", "55432", "--dbname", "cc_qa_mock",
        "--username", "qa", "--case", "claim", "--disposable-db-marker", MARKER,
        "--authorize-disposable-db-tests", "--authorize-fixture-setup", "--authorize-flag-race", "--run-race"])
    validate(args)
    manifest = {"kind": "card-cloud-race-seed-v1", "database": args.dbname, "marker": MARKER,
        "selected_case": "claim", "fixture_tag": "card-cloud-race-" + "a" * 32,
        "fixture_marker_table": "card_cloud_qa.fixture_marker", "maintenance_lock_key": -123,
        "sources": {"owner": "00000000-0000-4000-8000-00000000cb01"},
        "scenarios": {"claim": {"job_id": "00000000-0000-4000-8000-00000000cb99"}}}
    assert parse_manifest(json.dumps(manifest), args) == manifest
    assert "--job" in concurrency_argv(args, manifest)
    for case in ("tap", "maintenance", "flag-write"):
        args.case = case
        args.rollback_sql = "/tmp/explicit-reviewed-rollback.sql"
        manifest["scenarios"][case] = {"job_id": "00000000-0000-4000-8000-00000000cb99",
            "card_id": "00000000-0000-4000-8000-00000000cb98", "card_hash": "b" * 64, "expected_items": 2}
        argv = concurrency_argv(args, manifest)
        assert argv[argv.index("--case") + 1] == case
        if case == "tap":
            assert argv[argv.index("--expected-items") + 1] == "2"
        else:
            assert "--authorize-migration-lifecycle" in argv
        if case == "flag-write":
            assert "--rollback-refusal-pattern" in argv
    args.case, args.rollback_sql = "claim", None
    calls = []
    def mock(argv, *, sql=None, timeout=90):
        calls.append((argv, sql))
        if sql is None:
            raise RuntimeError("synthetic harness refusal")
        return ""
    try:
        run_race(args, manifest, mock)
    except RuntimeError as error:
        assert str(error) == "synthetic harness refusal"
    else:
        raise AssertionError("mock failure did not propagate")
    assert len(calls) == 3 and "value='on'" in calls[0][1] and "value='off'" in calls[2][1]
    for host in ("remote.example", "/tmp/local,remote", "127.0.0.1,remote"):
        args.host = host
        try:
            validate(args)
        except ValueError:
            pass
        else:
            raise AssertionError("nonlocal/multiple endpoint accepted")
    print(json.dumps({"status": "PASS", "scope": "pure validation/manifest/argv + mocked OFF cleanup",
                      "database": "NOT_RUN", "new_cost_usd": 0}))


def main():
    p = parser()
    args = p.parse_args()
    if args.self_test:
        self_test()
        return
    try:
        validate(args)
    except (ValueError, OSError) as error:
        p.error(str(error))
    manifest = seed(args)
    result = {"fixture": manifest, "concurrency_argv": concurrency_argv(args, manifest),
              "run_existing_command": shlex.join(resume_argv(args)),
              "authorization_note": "generated command requires separate owner authorization before execution",
              "status": "SEEDED_SWITCHES_OFF", "cleanup": "destroy disposable database after this case"}
    if args.run_race:
        result["race_output"] = run_race(args, manifest)
        result["status"] = "RACE_COMPLETED_SWITCHES_OFF"
    print(json.dumps(result, sort_keys=True))


if __name__ == "__main__":
    main()
