#!/usr/bin/env python3
"""Require changed test files to fail on the merge base and pass on the head.

The candidate test tree (including helpers) runs unchanged in both disposable
worktrees. Product files always come from the corresponding Git commit.
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import signal
import subprocess
import sys
import tempfile

CODE_SUFFIXES = {".js", ".cjs", ".mjs", ".ts", ".tsx", ".jsx", ".py", ".html", ".css", ".sql", ".sh", ".json", ".yaml", ".yml"}
NON_PRODUCT = ("tests/", "docs/", "evals/", ".github/")
INFRA_FILES = {"scripts/gate.sh", "scripts/check-fail-first.py", ".coderabbit.yaml"}


def git(root, *args):
    return subprocess.check_output(["git", "-C", str(root), *args], stderr=subprocess.PIPE).decode().strip()


def product(path):
    return not path.startswith(NON_PRODUCT) and path not in INFRA_FILES and Path(path).suffix in CODE_SUFFIXES


def test_file(path):
    return path.startswith("tests/") and bool(re.search(r"(?:\.test\.|\.spec\.|_test\.|/test_)", path))


def runner(path):
    suffix = Path(path).suffix
    if suffix in {".js", ".mjs", ".cjs"}:
        return ["node", "--test", "--test-reporter=tap", path]
    if suffix in {".ts", ".tsx"}:
        return [os.environ.get("DENO_BIN", "deno"), "test", "--no-prompt", "--no-check", "-A", path]
    if suffix == ".py":
        return [sys.executable, path]
    if suffix == ".sh":
        return ["bash", path]
    return None


def run_test(root, command, seconds):
    # CI passes no provider, production or GitHub credentials to test commands.
    names = {"PATH", "HOME", "TMPDIR", "TEMP", "TMP", "LANG", "LC_ALL", "DENO_DIR", "UPMORE_PLAYWRIGHT_PATH", "UPMORE_CHROMIUM_PATH", "PLAYWRIGHT_BROWSERS_PATH", "ESBUILD_BIN", "DENO_BIN"}
    env = {k: v for k, v in os.environ.items() if k in names}
    env.update({"CI": "true", "GIT_TERMINAL_PROMPT": "0"})
    with tempfile.TemporaryFile() as log:
        proc = subprocess.Popen(command, cwd=root, env=env, stdin=subprocess.DEVNULL, stdout=log, stderr=subprocess.STDOUT, start_new_session=True)
        timed_out = False
        try:
            proc.wait(timeout=seconds)
        except subprocess.TimeoutExpired:
            timed_out = True
            os.killpg(proc.pid, signal.SIGKILL)
            proc.wait()
        log.seek(0, os.SEEK_END)
        log.seek(max(0, log.tell() - 4000))
        tail = log.read().decode(errors="replace")
    return {"exit_code": proc.returncode, "timed_out": timed_out, "tail": tail}


def check(args):
    root = Path(git(Path.cwd(), "rev-parse", "--show-toplevel"))
    head = git(root, "rev-parse", "--verify", "--end-of-options", args.head + "^{commit}")
    base_ref = git(root, "rev-parse", "--verify", "--end-of-options", args.base + "^{commit}")
    base = git(root, "merge-base", base_ref, head)
    changed = subprocess.check_output(["git", "-C", str(root), "diff", "--no-renames", "--name-only", "-z", base, head]).decode().split("\0")
    products = [p for p in changed if p and product(p)]
    report = {"head": head, "merge_base": base, "product_files": products, "tests": []}
    if not products:
        return {**report, "verdict": "NOT_REQUIRED", "reason": "no_product_changes"}, 0
    added_modified = subprocess.check_output(["git", "-C", str(root), "diff", "--no-renames", "--diff-filter=AM", "--name-only", "-z", base, head]).decode().split("\0")
    files = [p for p in added_modified if p and test_file(p)]
    if not files:
        return {**report, "verdict": "FAIL", "reason": "no_changed_tests"}, 1
    unsupported = [p for p in files if runner(p) is None]
    if unsupported:
        return {**report, "verdict": "FAIL", "reason": "unsupported_test_runner", "unsupported": unsupported}, 1
    with tempfile.TemporaryDirectory(prefix="fail-first-worktrees-") as scratch:
        trees = []
        try:
            for label, sha in [("head", head), ("base", base)]:
                target = Path(scratch) / label
                git(root, "worktree", "add", "--detach", str(target), sha)
                trees.append(target)
            head_tree, base_tree = trees
            baseline_tests = base_tree / "tests"
            if baseline_tests.is_symlink():
                baseline_tests.unlink()
            elif baseline_tests.exists():
                shutil.rmtree(baseline_tests)
            shutil.copytree(head_tree / "tests", baseline_tests, symlinks=True)
            for path in files:
                current = run_test(head_tree, runner(path), args.timeout)
                previous = run_test(base_tree, runner(path), args.timeout)
                report["tests"].append({"path": path, "sha256": hashlib.sha256((head_tree / path).read_bytes()).hexdigest(), "head": current, "base": previous})
        finally:
            for tree in reversed(trees):
                git(root, "worktree", "remove", "--force", str(tree))
    passed = all(t["head"]["exit_code"] == 0 and not t["head"]["timed_out"] and t["base"]["exit_code"] != 0 and not t["base"]["timed_out"] for t in report["tests"])
    return {**report, "verdict": "PASS" if passed else "FAIL"}, 0 if passed else 1


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--base", required=True, help="PR target or integration branch; compared via git merge-base")
    parser.add_argument("--head", default="HEAD")
    parser.add_argument("--timeout", type=float, default=180)
    parser.add_argument("--report", help="Optional JSON artifact path")
    args = parser.parse_args()
    try:
        if args.timeout <= 0:
            raise ValueError("timeout must be positive")
        report, code = check(args)
    except Exception as error:
        report, code = {"verdict": "ERROR", "error": str(error)}, 2
    encoded = json.dumps(report, indent=2) + "\n"
    if args.report:
        Path(args.report).write_text(encoded)
    sys.stdout.write(encoded)
    return code


if __name__ == "__main__":
    sys.exit(main())
