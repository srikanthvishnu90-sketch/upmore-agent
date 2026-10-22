#!/usr/bin/env python3
"""Pending QA helper: one standalone rollback file per dedicated psql process.

No database discovery or import-time execution. The concurrency caller must first
validate the explicit local disposable connection, file and lifecycle authorization.
Run --self-test for pure/mock dispatch checks: it launches no process and runs no SQL.
"""

import ast
import os
from pathlib import Path
import subprocess
import time
from types import SimpleNamespace
import uuid


def rollback_argv(args):
    """Preserve the owner's standalone file ABI; never inject a SQL preamble."""
    return [args.psql, "-X", "-v", "ON_ERROR_STOP=1", "-w",
            "-h", args.host, "-p", str(args.port), "-d", args.dbname,
            "-U", args.username, "-f", str(args.rollback_sql)]


class DedicatedRollbackProcess:
    def __init__(self, args, launcher=None):
        self.args = args
        self.launcher = launcher
        self.application_name = "cc_file_rollback_" + uuid.uuid4().hex
        self.proc = None
        self.pid = None

    def start(self, observer):
        if self.proc is not None:
            raise AssertionError("rollback file process already started")
        env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        env.update(PGAPPNAME=self.application_name, PGCONNECT_TIMEOUT="3")
        launch = self.launcher if self.launcher is not None else subprocess.Popen
        self.proc = launch(rollback_argv(self.args), env=env, stdin=subprocess.DEVNULL,
                           stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
        # The rollback itself contains all SQL. Its blocked real backend is resolved
        # through an existing observer, preserving independent pg_locks evidence.
        deadline = time.monotonic() + self.args.timeout
        while time.monotonic() < deadline:
            observer.run("select pg_stat_clear_snapshot();")
            pids = observer.value("select coalesce(jsonb_agg(pid),'[]'::jsonb) from pg_stat_activity "
                "where datname=current_database() and backend_type='client backend' "
                "and application_name='" + self.application_name + "';")
            if len(pids) == 1:
                self.pid = int(pids[0])
                return
            if pids:
                raise AssertionError("rollback application_name resolved multiple real backends")
            if self.proc.poll() is not None:
                output = self.finish()
                raise AssertionError("rollback exited before its lock barrier: " + "\n".join(output))
        raise AssertionError("rollback real backend not observed in pg_stat_activity")

    def finish(self, expect_error=False):
        if self.proc is None:
            raise AssertionError("rollback file process was not started")
        try:
            output, _ = self.proc.communicate(timeout=self.args.timeout + 2)
        except subprocess.TimeoutExpired:
            self.close()
            raise AssertionError("standalone rollback file process timed out")
        lines = output.splitlines()
        has_error = any("ERROR:" in line for line in lines)
        if expect_error:
            if self.proc.returncode == 0 or not has_error:
                raise AssertionError("rollback must exit nonzero with PostgreSQL ERROR evidence: " + output)
        elif self.proc.returncode != 0 or has_error:
            raise AssertionError("standalone rollback file failed: " + output)
        return lines

    def close(self):
        if self.proc is not None and self.proc.poll() is None:
            self.proc.terminate()
            try:
                self.proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self.proc.kill()
                self.proc.wait(timeout=3)


def self_test():
    """Mock dispatch/exit/PID proof; subprocess.Popen is never called."""
    args = SimpleNamespace(psql="psql", host="/tmp/qa_socket", port=55432,
        dbname="cc_qa_mock", username="qa", rollback_sql=Path("/tmp/reviewed-rollback.sql"), timeout=1)
    calls = []

    class FakeProcess:
        returncode = None
        output = "COMMIT\n"

        def poll(self):
            return self.returncode

        def communicate(self, timeout):
            assert timeout == 3
            if self.returncode is None:
                self.returncode = 0
            return self.output, None

        def terminate(self):
            self.returncode = -15

        def wait(self, timeout):
            return self.returncode

    def fake_launch(argv, **kwargs):
        calls.append((argv, kwargs))
        assert argv.count("-f") == 1 and argv[-2:] == ["-f", str(args.rollback_sql)]
        assert "-X" in argv and argv[argv.index("-v") + 1] == "ON_ERROR_STOP=1"
        assert not set(argv) & {"-c", "--command", "-1", "--single-transaction", "--file"}
        assert kwargs["stdin"] == subprocess.DEVNULL and kwargs["stderr"] == subprocess.STDOUT
        return FakeProcess()

    class Observer:
        def __init__(self):
            self.queries = []
            self.lookups = 0

        def run(self, sql):
            self.queries.append(sql)

        def value(self, sql):
            self.queries.append(sql)
            assert "pg_stat_activity" in sql and "application_name=" in sql
            self.lookups += 1
            return [] if self.lookups == 1 else [7319]

    observer = Observer()
    one = DedicatedRollbackProcess(args, fake_launch)
    two = DedicatedRollbackProcess(args, fake_launch)
    assert one.application_name != two.application_name
    one.start(observer)
    assert one.pid == 7319 and observer.queries[0] == "select pg_stat_clear_snapshot();"
    assert observer.queries.count("select pg_stat_clear_snapshot();") == 2
    assert calls[0][1]["env"]["PGAPPNAME"] == one.application_name
    assert one.finish() == ["COMMIT"]
    for code, output, expect_error, must_fail in (
        (3, "psql:/tmp/rollback.sql:8: ERROR: rollback requires both switches OFF\n", True, False),
        (0, "", True, True),
        (3, "connection closed\n", True, True),
        (3, "ERROR: unexpected migration failure\n", False, True),
        (0, "ERROR: ignored SQL failure\n", False, True),
    ):
        one.proc.returncode, one.proc.output = code, output
        try:
            one.finish(expect_error=expect_error)
        except AssertionError:
            assert must_fail
        else:
            assert not must_fail

    # Preserve the dispatch contract in the real harness without importing/executing it.
    harness = Path(__file__).with_name("career_apply_card_cloud_concurrency.py")
    tree = ast.parse(harness.read_text())
    functions = {node.name: node for node in tree.body if isinstance(node, ast.FunctionDef)}
    for name, receiver in (("maintenance", "c"), ("flag_race", "b")):
        starts = [node for node in ast.walk(functions[name]) if isinstance(node, ast.Call)
                  and isinstance(node.func, ast.Attribute) and node.func.attr == "start"
                  and isinstance(node.func.value, ast.Name) and node.func.value.id == receiver]
        assert len(starts) == 1 and len(starts[0].args) == 1
        assert isinstance(starts[0].args[0], ast.Name) and starts[0].args[0].id == "a"
        assert not any(isinstance(node, ast.Call) and isinstance(node.func, ast.Name)
                       and node.func.id == "include" for node in ast.walk(functions[name]))
    assert "DedicatedRollbackProcess(args)" in ast.get_source_segment(harness.read_text(), functions["main"])
    print('Mock standalone rollback dispatch/PID/exit evidence PASS; SQL/Popen NOT_RUN')


if __name__ == "__main__":
    import argparse
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--self-test", action="store_true", required=True)
    parser.parse_args()
    self_test()
