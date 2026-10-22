#!/usr/bin/env python3
"""WRITTEN / NOT_RUN. Pending acceptance tests; never discovered by run.sh.

Run only after design/code approval AND separately authorized isolated DB execution.
Stdlib + psql; no connection discovery, providers, migrations, or import-time work.
Every invocation requires --authorize-disposable-db-tests and explicit local
--host --port --dbname --username --case --owner --fixture-marker-table --fixture-tag
--maintenance-lock-key. The marker table must have a fixture_tag text column.
Fixtures must be invented, committed, exclusively owned by this run. Supply existing
card/account/job rows; optional --setup-sql is caller-owned SQL, separately authorized.
tap also needs --card --card-hash --expected-items; other cases need --job, except
flag-write. claim/maintenance require the named job to be the ONLY queued job and
no active cloud drive anywhere in this disposable DB. Missing fixtures are setup
errors, never evidence of a product regression.
maintenance/flag-write require an explicit --rollback-sql file AND
--authorize-migration-lifecycle --authorize-flag-race. No rollback path is guessed.
flag-write also requires --rollback-refusal-pattern matching the reviewed OFF refusal.
maintenance starts with both switches ON; flag-write starts with both OFF. These
cases change disposable settings and maintenance executes the supplied rollback.
The bigint lock key MUST be supplied from the reviewed bridge implementation.
Tap/claim/flag-write use two real clients; maintenance needs a third rollback client
while the controller holds the account lock. pg_locks/pg_stat_activity establish
ordering; elapsed time and sleeps are never race evidence. No engine is invoked.
Rollback runs in its own psql -X -v ON_ERROR_STOP=1 -f FILE process; its PID is
resolved by unique application_name through the observer, never by injected SQL.
Cleanup: destroy the disposable database after EACH case. Successful tap/claim
commits immutable fixtures; no attempted job is deleted or reset by this harness.
"""

import argparse
import json
import os
from pathlib import Path
import queue
import re
import subprocess
import threading
import time
import uuid

from card_cloud_file_client import DedicatedRollbackProcess


class SetupError(RuntimeError):
    pass


def lit(value):
    return "'" + str(value).replace("'", "''") + "'"


def require(value, message):
    if not value:
        raise AssertionError(message)


class Client:
    def __init__(self, args, label):
        self.timeout = args.timeout
        self.lines = queue.Queue()
        self.pending = None
        env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        env["PGAPPNAME"] = "cc_pending_" + label + "_" + uuid.uuid4().hex[:8]
        self.proc = subprocess.Popen(
            [args.psql, "-X", "-qAt", "-w", "-v", "ON_ERROR_STOP=1",
             "-h", args.host, "-p", str(args.port), "-d", args.dbname,
             "-U", args.username], env=env, stdin=subprocess.PIPE,
            stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True, bufsize=1)
        threading.Thread(target=self._read, daemon=True).start()
        self.pid = int(self.run("select pg_backend_pid();")[0])
        self.run("set statement_timeout=" + lit(str(int(args.timeout * 1000))) + ";")

    def _read(self):
        for line in self.proc.stdout:
            self.lines.put(line.rstrip("\n"))
        self.lines.put(None)

    def start(self, sql):
        require(self.pending is None, "client already has an in-flight query")
        self.pending = "__cc_done_" + uuid.uuid4().hex
        self.proc.stdin.write(sql + "\n\\echo " + self.pending + "\n")
        self.proc.stdin.flush()

    def finish(self, expect_error=False):
        output = []
        deadline = time.monotonic() + self.timeout + 2
        while True:
            line = self.lines.get(timeout=max(0.01, deadline - time.monotonic()))
            if line is None:
                self.pending = None
                self.proc.wait(timeout=2)
                if expect_error and self.proc.returncode != 0:
                    return output
                raise AssertionError("psql exited: " + "\n".join(output))
            if line == self.pending:
                self.pending = None
                require(not expect_error, "rollback unexpectedly succeeded")
                return [x for x in output if x]
            output.append(line)

    def run(self, sql):
        self.start(sql)
        return self.finish()

    def value(self, sql):
        rows = self.run(sql)
        require(len(rows) == 1, "expected one JSON row: " + repr(rows))
        return json.loads(rows[0])

    def close(self):
        if self.proc.poll() is None:
            self.proc.terminate()  # disconnect rolls back outstanding fixture transactions
        self.proc.wait(timeout=3)


def barrier(observer, sql, description, timeout):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        observer.run("select pg_stat_clear_snapshot();")
        if observer.value("select to_jsonb((" + sql + ")); "):
            return
    raise AssertionError("lock/activity barrier not reached: " + description)


def waiting(pid, blocker):
    return (f"exists(select 1 from pg_stat_activity where pid={pid} "
            f"and wait_event_type='Lock' and {blocker}=any(pg_blocking_pids(pid)))")


def maintenance_lock(args, pid, mode, granted=True):
    key = args.maintenance_lock_key & ((1 << 64) - 1)
    return (f"exists(select 1 from pg_locks where pid={pid} and locktype='advisory' "
            f"and classid={key >> 32}::oid and objid={key & 0xffffffff}::oid "
            f"and objsubid=1 and mode={lit(mode)} and granted={'true' if granted else 'false'})")


def account_lock(args):
    return "select pg_advisory_xact_lock(hashtextextended(" + lit(args.owner) + "::text,0));"


def claim_sql():
    return ("set local role service_role; select coalesce(jsonb_agg(to_jsonb(j)), '[]'::jsonb) "
            "from public.career_apply_cloud_claim(1) j; reset role;")


def flags(client):
    return client.value("select coalesce(jsonb_object_agg(key,value),'{}') from "
                        "public.career_cloud_settings where key in "
                        "('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT');")


def flag_update(value, key=None):
    keys = lit(key) if key else "'CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT'"
    return "update public.career_cloud_settings set value=" + lit(value) + " where key in (" + keys + ");"


def binding_snapshot(client, card):
    return client.value("select jsonb_build_object('card',to_jsonb(c),'jobs',"
        "coalesce((select jsonb_agg(to_jsonb(j) order by j.id) from public.career_apply_jobs j "
        "join career_message_approval_private.cloud_bound_jobs b on b.job_row_id=j.id "
        "where b.card_id=c.id),'[]'),'bindings',coalesce((select jsonb_agg(to_jsonb(b) "
        "order by b.approval_id) from career_message_approval_private.cloud_bound_jobs b "
        "where b.card_id=c.id),'[]'),'approvals',coalesce((select jsonb_agg(to_jsonb(a) "
        "order by a.id) from public.career_apply_batch_approvals a join "
        "career_message_approval_private.cloud_bound_jobs b on b.approval_id=a.id "
        "where b.card_id=c.id),'[]'),'origins',coalesce((select jsonb_agg(to_jsonb(a) "
        "order by a.approval_id) from career_message_approval_private.cloud_bound_approvals a "
        "where a.card_id=c.id),'[]')) from public.career_apply_message_cards c where c.id=" + lit(card) + "::uuid;")


def owner_snapshot(client, owner):
    return client.value("select jsonb_build_object('jobs',coalesce((select jsonb_agg(to_jsonb(j) "
        "order by id) from public.career_apply_jobs j where user_id=" + lit(owner) +
        "::uuid),'[]'),'approvals',coalesce((select jsonb_agg(to_jsonb(a) order by id) from "
        "public.career_apply_batch_approvals a where user_id=" + lit(owner) + "::uuid),'[]'));")


def tap(args, a, b):
    if not a.value("select to_jsonb(exists(select 1 from public.career_apply_message_cards where id=" +
                   lit(args.card) + "::uuid));"):
        raise SetupError("explicit committed fixture card is missing")
    before = binding_snapshot(a, args.card)
    account_before = owner_snapshot(a, args.owner)
    if before["card"]["user_id"] != args.owner or before["card"]["payload_hash"] != args.card_hash:
        raise SetupError("card owner/hash differs from explicit fixture contract")
    if before["bindings"] or before["card"]["approved_at"] is not None:
        raise SetupError("tap needs a fresh unapproved fixture card")
    sql = ("set local request.jwt.claim.sub=" + lit(args.owner) + "; "
           "set local request.jwt.claims=" + lit(json.dumps({"sub": args.owner, "role": "authenticated"})) + "; "
           "set local role authenticated; select public.career_apply_message_card_approve_own(" +
           lit(args.card) + "::uuid," + lit(args.card_hash) + "); reset role;")
    a.run("begin;" + account_lock(args))
    b.start("begin;" + sql)
    barrier(a, waiting(b.pid, a.pid), "second actual tap waits at account lock", args.timeout)
    first = a.value(sql)
    a.run("commit;")
    second = json.loads(b.finish()[0])
    b.run("commit;")
    require(first == second, "competing taps returned different receipts")
    snap = binding_snapshot(a, args.card)
    for key in ("jobs", "bindings", "approvals", "origins"):
        require(len(snap[key]) == args.expected_items, "not exactly one batch: " + key)
    require(len(first.get("jobs", [])) == args.expected_items, "receipt misses immutable item jobs")
    receipt_ids = {j["id"] for j in first["jobs"]}
    require(receipt_ids == {j["id"] for j in snap["jobs"]}, "receipt job IDs differ from queue")
    for j in snap["jobs"]:
        require(j["state"] == "queued" and j["attempts"] == 0 and j["source"] is None,
                "tap executed a job")
        require(j["payload_hash"] == j["approval_hash"], "queue hashes differ")
        require(any(it["payload"] == j["payload"] and it["hash"] == j["payload_hash"]
                    for it in snap["card"]["payload"]["items"]), "queue payload differs from shown P")
    require(all(x["used_at"] is not None for x in snap["approvals"]), "approval not consumed")
    account_after = owner_snapshot(a, args.owner)
    for key in ("jobs", "approvals"):
        old = {row["id"]: row for row in account_before[key]}
        new = {row["id"]: row for row in account_after[key]}
        require(all(new.get(k) == v for k, v in old.items()), "tap altered earlier fixture " + key)
        require(len(new.keys() - old.keys()) == args.expected_items, "tap minted extra " + key)
    require({j["id"] for j in account_after["jobs"]} - {j["id"] for j in account_before["jobs"]}
            == receipt_ids, "tap created unbound queue rows")
    a.run("begin;")
    require(a.value(sql) == first, "receipt replay changed")
    a.run("commit;")
    require(binding_snapshot(a, args.card) == snap, "replay reminted or extended immutable receipt")
    require(owner_snapshot(a, args.owner) == account_after, "replay minted unbound jobs or approvals")


def job_fixture(args, a):
    inventory = a.value("select jsonb_build_object('queued',coalesce(jsonb_agg(id order by id) "
        "filter(where state='queued'),'[]'),'active',count(*) filter(where state='driving' and source='cloud')) "
        "from public.career_apply_jobs;")
    if inventory != {"queued": [args.job], "active": 0}:
        raise SetupError("claim fixture must be the only queued job; no active cloud drives")
    valid = a.value("select to_jsonb(exists(select 1 from public.career_apply_jobs j join "
        "career_message_approval_private.cloud_bound_jobs b on b.job_row_id=j.id "
        "where j.id=" + lit(args.job) + "::uuid and j.user_id=" + lit(args.owner) +
        "::uuid and b.user_id=j.user_id and j.attempts=0 and j.source is null));")
    if not valid:
        raise SetupError("named queued job lacks explicit fixture owner/cloud binding")


def competing_claims(args, a, b):
    job_fixture(args, a)
    a.run("begin;" + account_lock(args))
    b.start("begin;" + claim_sql())
    barrier(a, waiting(b.pid, a.pid), "second actual claim waits at account lock", args.timeout)
    winner = a.value(claim_sql())
    require(len(winner) == 1 and winner[0]["id"] == args.job, "first claimant did not get fixture")
    a.run("commit;")
    loser = json.loads(b.finish()[0])
    b.run("commit;")
    require(loser == [], "two competing claimers obtained a job")
    row = a.value("select to_jsonb(j) from public.career_apply_jobs j where id=" + lit(args.job) + "::uuid;")
    require(row["attempts"] == 1 and row["state"] == "driving" and row["source"] == "cloud"
            and row["lease_token"] == winner[0]["lease_token"] and row["lease_token"] is not None,
            "claim changed attempt count or reminted lease")


def include(path):
    return "\\i '" + str(path) + "'\n"


def maintenance(args, a, b, c):
    job_fixture(args, a)
    if set(flags(a).values()) != {"on"} or len(flags(a)) != 2:
        raise SetupError("maintenance fixture must start with both switches ON")
    a.run("begin;" + account_lock(args))
    b.start("begin;" + claim_sql())
    barrier(a, waiting(b.pid, a.pid) + " and " + maintenance_lock(args, b.pid, "ShareLock"),
            "actual claim has shared maintenance lock before blocked account lock", args.timeout)
    c.start(a)
    barrier(a, waiting(c.pid, b.pid) + " and " + maintenance_lock(args, c.pid, "ExclusiveLock", False),
            "actual rollback waits exclusively behind claim", args.timeout)
    a.run(flag_update("off") + "commit;")
    require(json.loads(b.finish()[0]) == [], "claim crossed OFF check after account-lock wait")
    barrier(a, waiting(c.pid, b.pid), "rollback still waits for actual claim transaction", args.timeout)
    b.run("commit;")
    c.finish()
    require(set(flags(a).values()) == {"off"}, "rollback changed switches")
    require(a.value("select to_jsonb(state='not_submitted' and attempts=0 and "
        "reason='card_cloud_bridge_rolled_back') from public.career_apply_jobs where id=" +
        lit(args.job) + "::uuid;"), "rollback did not terminalize queued fixture without attempt")


def flag_race(args, a, b):
    if flags(a) != {"CAREER_CLOUD_APPLY": "off", "CAREER_AGENT_SUBMIT": "off"}:
        raise SetupError("flag-write fixture needs both explicit switch rows OFF")
    before = a.value("select to_jsonb(pg_get_functiondef('public.career_apply_cloud_claim_at(integer,timestamptz)'::regprocedure));")
    a.run("begin;" + flag_update("on", args.flag_key))
    b.start(a)
    table_wait = (f"exists(select 1 from pg_locks where pid={b.pid} and locktype='relation' "
                  "and relation='public.career_cloud_settings'::regclass and not granted)")
    barrier(a, waiting(b.pid, a.pid) + " and " + table_wait + " and " +
            maintenance_lock(args, b.pid, "ExclusiveLock"), "rollback settings lock behind flag writer", args.timeout)
    a.run("commit;")
    errors = b.finish(expect_error=True)
    require(any("ERROR:" in line for line in errors), "rollback refused without PostgreSQL error evidence")
    require(re.search(args.rollback_refusal_pattern, "\n".join(errors)),
            "rollback failed for a reason other than the reviewed OFF refusal")
    require(flags(a)[args.flag_key] == "on", "operator's winning ON write was lost")
    require(a.value("select to_jsonb(pg_get_functiondef('public.career_apply_cloud_claim_at(integer,timestamptz)'::regprocedure));")
            == before, "rollback crossed winning ON write and changed claim definition")
    a.run("begin;" + flag_update("off", args.flag_key) + "commit;")


def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("--authorize-disposable-db-tests", action="store_true", required=True)
    for name in ("host", "dbname", "username", "owner", "fixture-marker-table", "fixture-tag"):
        p.add_argument("--" + name, required=True)
    p.add_argument("--port", type=int, required=True)
    p.add_argument("--maintenance-lock-key", type=int, required=True)
    p.add_argument("--case", choices=("tap", "claim", "maintenance", "flag-write"), required=True)
    for name in ("card", "card-hash", "job", "setup-sql", "rollback-sql"):
        p.add_argument("--" + name)
    p.add_argument("--expected-items", type=int)
    p.add_argument("--rollback-refusal-pattern")
    for name in ("fixture-setup", "migration-lifecycle", "flag-race"):
        p.add_argument("--authorize-" + name, action="store_true")
    p.add_argument("--flag-key", choices=("CAREER_CLOUD_APPLY", "CAREER_AGENT_SUBMIT"), default="CAREER_CLOUD_APPLY")
    p.add_argument("--psql", default="psql")
    p.add_argument("--timeout", type=float, default=15)
    args = p.parse_args()
    if args.host not in ("localhost", "127.0.0.1", "::1") and not args.host.startswith("/"):
        p.error("host must be an explicit local socket directory or loopback address")
    if any(c in args.host for c in ",\n\r\t "):
        p.error("host must identify one local endpoint, never a host list")
    if not re.fullmatch(r"[A-Za-z0-9_][A-Za-z0-9_-]*", args.dbname):
        p.error("dbname must be a plain database name, never a DSN or service")
    if not re.fullmatch(r"[a-z_][a-z0-9_]*\.[a-z_][a-z0-9_]*", args.fixture_marker_table):
        p.error("fixture marker must be an explicit schema.table identifier")
    args.owner = str(uuid.UUID(args.owner))
    for name in ("card", "job"):
        if getattr(args, name):
            setattr(args, name, str(uuid.UUID(getattr(args, name))))
    if not 0 < args.port < 65536 or not 0 < args.timeout <= 60 or not -(1 << 63) <= args.maintenance_lock_key < 1 << 63:
        p.error("invalid port, timeout (max 60 seconds), or bigint lock key")
    if args.case == "tap" and (not args.card or not re.fullmatch(r"[0-9a-f]{64}", args.card_hash or "") or not args.expected_items or args.expected_items < 1):
        p.error("tap requires card, exact SHA-256 card hash and positive expected-items")
    if args.case in ("claim", "maintenance") and not args.job:
        p.error("claim/maintenance require an explicit committed fixture job UUID")
    if args.rollback_sql and not args.authorize_migration_lifecycle:
        p.error("rollback SQL requires --authorize-migration-lifecycle")
    if args.case in ("maintenance", "flag-write") and (not args.rollback_sql or not args.authorize_flag_race):
        p.error("rollback races require --rollback-sql and --authorize-flag-race")
    if args.case == "flag-write" and not args.rollback_refusal_pattern:
        p.error("flag-write requires the reviewed --rollback-refusal-pattern")
    if args.setup_sql and not args.authorize_fixture_setup:
        p.error("setup SQL requires --authorize-fixture-setup")
    for name in ("setup_sql", "rollback_sql"):
        if getattr(args, name):
            path = Path(getattr(args, name)).resolve(strict=True)
            if not path.is_file() or any(c in str(path) for c in "'\n\r\\"):
                p.error("SQL path must be an explicit regular file without quote/control characters")
            setattr(args, name, path)
    clients = []
    try:
        a = Client(args, "controller"); clients.append(a)
        if args.setup_sql:
            a.run(include(args.setup_sql))
        if not a.value("select to_jsonb(to_regclass(" + lit(args.fixture_marker_table) + ") is not null);"):
            raise SetupError("explicit committed fixture marker table is missing")
        marker = a.value("select to_jsonb(count(*)=1) from " + args.fixture_marker_table +
                         " where fixture_tag=" + lit(args.fixture_tag) + ";")
        if not marker:
            raise SetupError("committed unique fixture marker missing")
        b = DedicatedRollbackProcess(args) if args.case == "flag-write" else Client(args, "competitor")
        clients.append(b)
        if args.case == "maintenance":
            c = DedicatedRollbackProcess(args); clients.append(c)
            maintenance(args, a, b, c)
        else:
            {"tap": tap, "claim": competing_claims, "flag-write": flag_race}[args.case](args, a, b)
        print(json.dumps({"case": args.case, "status": "PASS", "cleanup": "destroy disposable DB; fixtures committed"}))
    finally:
        for client in reversed(clients):
            client.close()


if __name__ == "__main__":
    main()
