#!/usr/bin/env python3
"""WRITTEN / NOT_RUN: explicit disposable bridge migration lifecycle driver.

Every up/down is its own psql -X -v ON_ERROR_STOP=1 -f FILE subprocess/session.
Never uses -1, a transaction wrapper, an include, connection discovery or a live default.
Checkpoints persist only in the explicit private qa_card_cloud_rollback_* schema.
Source and seed fixtures create their documented pg_temp input tables; each shares a
fixture-only session with the SQL checkpoint which copies those inputs to QA state.
The independently configured DB setting upmore.test.disposable=card-cloud-rollback
must exist BEFORE this driver starts. The driver never installs that marker.
All paths and local socket connection fields are required. Missing artifacts are
BLOCKED setup evidence, not product failures. Destroy the DB after success/failure.
No SQL, DB, provider or network work happens on import or --help.
"""

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import tempfile
import uuid


GUARD = r"""\set ON_ERROR_STOP on
select coalesce(current_database()=:'bridge_disposable_database' and inet_server_addr() is null
 and current_setting('upmore.test.disposable',true)='card-cloud-rollback'
 and :'bridge_rollback_authorized'='true' and :'bridge_lifecycle_commits_authorized'='true',false) as allowed \gset
\if :allowed
\else
 \echo 'BLOCKED: exact local disposable database/independent marker/authorization mismatch'
 \quit 3
\endif
select not exists(select from public.career_cloud_settings
 where key in('CAREER_CLOUD_APPLY','CAREER_AGENT_SUBMIT') and value='on')
 and not exists(select from public.career_apply_jobs where state='driving') as off_idle \gset
\if :off_idle
\else
 \echo 'BLOCKED: both switches must be OFF and no active/uncertain drive may exist'
 \quit 3
\endif
\if :bridge_scratch_ready
select :"bridge_scratch_schema".rb_ok((select nonce=:'bridge_run_nonce'
 and dbname=current_database() and username=session_user from :"bridge_scratch_schema".rb_context),
 'preflight: exact persistent run context');
\else
select to_regnamespace(:'bridge_scratch_schema') is null as fresh \gset
\if :fresh
\else
 \echo 'BLOCKED: scratch schema already exists'
 \quit 3
\endif
\endif
"""


def fingerprint(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def parser():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    for flag in ("disposable-db-tests", "migration-lifecycle", "synthetic-fixture"):
        p.add_argument("--authorize-" + flag, action="store_true", required=True)
    for name in ("host", "dbname", "username", "scratch-schema", "psql", "up-sql", "down-sql",
                 "live-source-sql", "seed-sql", "checkpoints-sql", "log-dir"):
        p.add_argument("--" + name, required=True)
    p.add_argument("--port", type=int, required=True)
    p.add_argument("--timeout", type=int, default=60)
    return p


def validated(p, args):
    if not args.host.startswith("/") or any(c in args.host for c in ",\n\r\t "):
        p.error("--host must be one explicit absolute local socket directory")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_-]*", args.dbname):
        p.error("--dbname must be an exact plain name, never a DSN/service")
    if not re.fullmatch(r"[a-z_][a-z0-9_]*", args.username):
        p.error("--username must be an explicit plain role name")
    if not re.fullmatch(r"qa_card_cloud_rollback_[a-z0-9_]{1,40}", args.scratch_schema):
        p.error("--scratch-schema must be a new dedicated qa_card_cloud_rollback_* schema")
    if not 0 < args.port < 65536 or not 0 < args.timeout <= 60:
        p.error("invalid local port/timeout (maximum60 seconds per subprocess)")
    paths = {}
    for name in ("psql", "up_sql", "down_sql", "live_source_sql", "seed_sql", "checkpoints_sql"):
        path = Path(getattr(args, name))
        if not path.is_absolute():
            p.error("--" + name.replace("_", "-") + " must be an explicit absolute file path")
        try:
            path = path.resolve(strict=True)
        except OSError as e:
            p.error("BLOCKED artifact unavailable: " + str(e))
        if not path.is_file():
            p.error("BLOCKED artifact is not a regular file: " + str(path))
        paths[name] = path
    if not os.access(paths["psql"], os.X_OK):
        p.error("explicit psql path is not executable")
    if len(set(paths.values())) != len(paths):
        p.error("up/down/fixture/checkpoint/executable paths must be distinct")
    for name in ("up_sql", "down_sql"):
        if re.search(r"^\s*\\", paths[name].read_text(), re.M):
            p.error("reviewed standalone migration files must contain SQL, not psql meta-commands")
    args.log_dir = Path(args.log_dir).resolve()
    if args.log_dir.exists():
        p.error("--log-dir must be new; refuse to overwrite earlier evidence")
    return paths


class Lifecycle:
    def __init__(self, args, paths, guard):
        self.args, self.paths, self.guard = args, paths, guard
        self.nonce = uuid.uuid4().hex
        self.ready = False
        self.hashes = {name: fingerprint(path) for name, path in paths.items()}
        self.records = []
        self.env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        self.env["PGAPPNAME"] = "card_cloud_rollback_qa_" + self.nonce[:12]

    def common(self):
        a = self.args
        return [str(self.paths["psql"]), "-X", "-w", "-v", "ON_ERROR_STOP=1",
                "-h", a.host, "-p", str(a.port), "-d", a.dbname, "-U", a.username]

    def variables(self, stage):
        values = {"bridge_disposable_database": self.args.dbname,
                  "bridge_scratch_schema": self.args.scratch_schema, "bridge_run_nonce": self.nonce,
                  "bridge_rollback_authorized": "true", "bridge_lifecycle_commits_authorized": "true",
                  "bridge_scratch_ready": "true" if self.ready else "false", "bridge_stage": stage}
        return [item for key, value in values.items() for item in ("-v", key + "=" + value)]

    def save_manifest(self):
        data = {"scope": "authorized disposable lifecycle; destroy DB after run", "nonce": self.nonce,
                "database": self.args.dbname, "socket": self.args.host, "port": self.args.port,
                "scratch_schema": self.args.scratch_schema,
                "files": {k: {"path": str(v), "sha256": self.hashes[k]} for k, v in self.paths.items()},
                "processes": self.records}
        (self.args.log_dir / "manifest.json").write_text(json.dumps(data, indent=2) + "\n")

    def invoke(self, label, files, stage="preflight", production=False):
        for name, path in self.paths.items():
            if fingerprint(path) != self.hashes[name]:
                raise RuntimeError("BLOCKED: reviewed input changed during lifecycle: " + name)
        # Production invocation is EXACTLY one standalone -f file; no checkpoint/guard is appended.
        if production and (len(files) != 1 or files[0] not in (self.paths["up_sql"], self.paths["down_sql"])):
            raise RuntimeError("invalid standalone migration invocation")
        command = self.common() + ([] if production else self.variables(stage))
        for file in files:
            command += ["-f", str(file)]
        log = self.args.log_dir / (f"{len(self.records):02d}-" + label + ".log")
        record = {"label": label, "standalone_migration": production, "files": [str(f) for f in files],
                  "command": command, "log": str(log), "status": "started"}
        self.records.append(record)
        self.save_manifest()
        try:
            with log.open("w") as out:
                result = subprocess.run(command, env=self.env, stdin=subprocess.DEVNULL,
                                        stdout=out, stderr=subprocess.STDOUT, timeout=self.args.timeout)
            record.update(status="completed", exit_code=result.returncode)
            if result.returncode:
                raise RuntimeError("lifecycle command refused/failed: " + label + "; see " + str(log))
        except subprocess.TimeoutExpired:
            record["status"] = "timed_out"
            raise RuntimeError("lifecycle timeout; outcome requires inspection: " + label)
        finally:
            self.save_manifest()

    def preflight(self, label):
        self.invoke("guard-" + label, [self.guard])

    def checkpoint(self, stage, fixture=None):
        self.preflight(stage)
        # Guard and optional fixture/checkpoint share only this fixture session, never a migration session.
        files = [self.guard] + ([self.paths[fixture]] if fixture else []) + [self.paths["checkpoints_sql"]]
        self.invoke("checkpoint-" + stage, files, stage=stage)
        self.ready = True

    def migration(self, label, name):
        self.preflight(label)
        self.invoke(label, [self.paths[name]], production=True)

    def run(self):
        self.checkpoint("baseline", "live_source_sql")
        self.migration("up-one", "up_sql")
        self.checkpoint("up1")
        self.migration("up-two", "up_sql")
        self.checkpoint("up2")
        self.checkpoint("seed", "seed_sql")
        self.migration("down-one", "down_sql")
        self.checkpoint("down1")
        self.migration("down-two", "down_sql")
        self.checkpoint("down2")
        self.migration("up-three", "up_sql")
        self.checkpoint("reup")


def main():
    p = parser()
    args = p.parse_args()
    paths = validated(p, args)
    args.log_dir.mkdir(mode=0o700, parents=True)
    try:
        with tempfile.TemporaryDirectory(prefix="card-cloud-rollback-driver-") as temp:
            guard = Path(temp) / "read-only-preflight.sql"
            guard.write_text(GUARD)
            Lifecycle(args, paths, guard).run()
    except (OSError, RuntimeError) as e:
        p.exit(1, str(e) + "\nDestroy the disposable database after inspecting retained evidence.\n")
    print("Lifecycle/checkpoint processes completed. Destroy the disposable database before reuse.")


if __name__ == "__main__":
    main()
