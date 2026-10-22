#!/usr/bin/env python3
"""Offline source audit; never connects to Postgres or executes SQL.

Requires the pinned parser pglast==7.21, installed outside the repository.
Run: python3 tests/fixtures/card-cloud-db/static_audit.py --output <artifact.json>
The migration and rollback own BEGIN/COMMIT. Future authorized execution must use
standalone psql sessions, never --single-transaction or an enclosing fixture TX.
"""
from __future__ import annotations

import argparse
import difflib
import hashlib
import json
from pathlib import Path
import re

from pglast import parse_plpgsql, parse_sql


FILENAME = "20261024130000_career_apply_card_cloud_bridge.sql"
BASELINES = [
    ("public.career_apply_cloud_optin_as", "20261021080000_career_apply_cloud.sql", ""),
    ("public.career_apply_cloud_optin_get", "20261021080000_career_apply_cloud.sql", ""),
    ("public.career_apply_batch_revoke_own", "20261024090000_career_apply_agent_submit.sql", ""),
    ("career_message_approval_private.guard_queue", "20261021220430_career_apply_message_cards.sql", ""),
    ("public.career_apply_message_card_approve_own", "20261021220430_career_apply_message_cards.sql", ""),
    ("public.career_apply_message_card_read_own", "20261021220430_career_apply_message_cards.sql", ""),
    ("public.career_apply_claim_own", "20261021080000_career_apply_cloud.sql", "p_source text"),
    ("public.career_apply_extension_begin_own", "20261021120000_career_apply_form_answers.sql", ""),
    ("public.career_apply_cloud_refusal", "20261024120000_career_apply_cloud_gate_waiver.sql", ""),
    ("public.career_apply_cloud_claim_at", "20261024120000_career_apply_cloud_gate_waiver.sql", ""),
]


def sha(text: str) -> str:
    return hashlib.sha256(text.encode("utf-8")).hexdigest()


def extract(path: Path, name: str, signature: str) -> str:
    pattern = r"create or replace function " + re.escape(name) + r"\([^$]*?\$\$.*?\$\$;"
    matches = re.findall(pattern, path.read_text(), re.S | re.I)
    matches = [item for item in matches if signature in item.split("$$")[0]]
    if len(matches) != 1:
        raise AssertionError((str(path), name, len(matches)))
    return matches[0]


def parse_file(path: Path, repo: Path) -> dict:
    text = path.read_text()
    statements = parse_sql(text)
    plpgsql = []
    sql = []
    for function in re.findall(r"create or replace function .*?\$\$.*?\$\$;", text, re.S | re.I):
        name = function.split("(")[0].split()[-1]
        if re.search(r"language plpgsql", function, re.I):
            parse_plpgsql(function)
            plpgsql.append(name)
        else:
            parse_sql(function.split("$$")[1])
            sql.append(name)
    if not re.search(r"^begin;", text, re.M) or not text.rstrip().endswith("commit;"):
        raise AssertionError("standalone transaction wrapper missing")
    return {
        "file": str(path.relative_to(repo)), "sha256": sha(text),
        "lines": len(text.splitlines()), "bytes": len(text.encode("utf-8")),
        "outer_statements_parsed": len(statements),
        "plpgsql_functions_parsed": plpgsql, "sql_functions_parsed": sql,
        "execution_convention": "standalone psql -X -v ON_ERROR_STOP=1 -f FILE; no -1 or enclosing transaction",
        "runtime_status": "NOT_RUN",
    }


def audit(repo: Path) -> dict:
    migrations = repo / "supabase/migrations"
    up = migrations / FILENAME
    down = repo / "supabase/rollbacks" / FILENAME
    result = {
        "verification": "OFFLINE_SOURCE_AND_SYNTAX_ONLY", "parser": "pglast==7.21",
        "sql_executed": False, "database_connections": 0, "new_spend_usd": 0,
        "up": parse_file(up, repo), "down": parse_file(down, repo), "touched_functions": [],
        "owner_exceptions": [
            "Readable self-contained migration and rollback exceed the 250-line design limit.",
            "Later owner ruling caps cloud-only opt-in/queue/claim/authorization at fifteen daily; extension/global caps stay unchanged.",
            "Existing Stop applying also revokes consumed cloud permissions; other used legacy approvals stay unchanged.",
        ],
    }
    for name, filename, signature in BASELINES:
        original = extract(migrations / filename, name, signature)
        changed = extract(up, name, signature)
        restored = extract(down, name, signature)
        if restored != original:
            raise AssertionError(("rollback source differs", name))
        suffix = None
        if name == "career_message_approval_private.guard_queue":
            suffix = changed.endswith(original.split("\nbegin\n", 1)[1])
            if not suffix:
                raise AssertionError("original extension guard body changed")
        result["touched_functions"].append({
            "name": name, "signature": original.split("$$")[0].strip(), "original_file": filename,
            "before_sha256": sha(original), "after_sha256": sha(changed), "rollback_exact_source": True,
            "old_guard_suffix_byte_preserved": suffix,
            "diff": "".join(difflib.unified_diff(original.splitlines(True), changed.splitlines(True),
                                                  fromfile=filename, tofile=FILENAME)),
        })
    source = up.read_text()
    if re.search(r"\b(update|insert\s+into)\s+(public\.)?career_cloud_settings\b", source, re.I):
        raise AssertionError("settings DML must not be present")
    if re.search(r"\binsert\s+into\s+career_message_approval_private\.cloud_card_enrollments\b", source, re.I):
        raise AssertionError("enrollment seed must not be present")
    return result


if __name__ == "__main__":
    cli = argparse.ArgumentParser(description=__doc__)
    cli.add_argument("--repo", type=Path, default=Path(__file__).resolve().parents[3])
    cli.add_argument("--output", type=Path)
    args = cli.parse_args()
    rendered = json.dumps(audit(args.repo.resolve()), indent=2) + "\n"
    if args.output:
        args.output.write_text(rendered)
    else:
        print(rendered, end="")
