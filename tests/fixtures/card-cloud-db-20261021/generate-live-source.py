"""Offline pinned-source extraction ONLY; never imports PostgreSQL or executes SQL.

The pending rollback harness snapshots pg_get_functiondef MD5/ACL at future runtime.
This fixture separately checks that its baseline prosrc came from actual live014 files.
"""
from pathlib import Path
import hashlib
import json
import re
import subprocess

ROOT = Path(__file__).resolve().parents[3]
PIN = "01401cb456bc2982d67316165e183bbd275581c9"
HERE = Path(__file__).resolve().parent


def normalized_types(args):
    result = []
    for arg in args.split(","):
        if arg.strip():
            value = re.sub(r"\s+default\b.*$", "", arg.strip(), flags=re.I)
            result.append(value.split(None, 1)[1].replace("timestamptz", "timestamp with time zone"))
    return ",".join(result)


def main():
    test = (ROOT / "tests/db/pending/career_apply_card_cloud_rollback.test.sql").read_text()
    section = test.split("insert into rb_required values", 1)[1].split(";", 1)[0]
    required = re.findall(r"\('([^']+)','([^']+)'\)", section)
    if len(required) != 15:
        raise ValueError("rollback signature list changed; review source extractor")
    rows, evidence = [], []
    for signature, source_path in required:
        source = subprocess.check_output(["git", "show", f"{PIN}:{source_path}"], cwd=ROOT).decode()
        name, types = signature.split("(", 1)
        types = types[:-1]
        pattern = r"^create or replace function\s+" + re.escape(name) + r"\s*\((.*?)\).*?\bas\s+\$\$(.*?)\$\$"
        matches = [(args, body) for args, body in re.findall(pattern, source, flags=re.S | re.M | re.I)
                   if normalized_types(args) == types]
        if len(matches) != 1:
            raise ValueError(f"expected one exact pinned overload: {signature}, got {len(matches)}")
        body = matches[0][1]
        if "$live014_body$" in body:
            raise ValueError("source delimiter collision")
        rows.append("('" + signature + "',$live014_body$" + body + "$live014_body$,'" + source_path + "','" + PIN + "')")
        evidence.append({"signature": signature, "source_path": source_path,
                         "source_body_sha256": hashlib.sha256(body.encode()).hexdigest()})
    sql = "-- Generated OFFLINE from pinned git objects; no SQL has been executed.\n"
    sql += "create temp table bridge_live_source(signature text primary key,source_body text,source_path text,source_commit text);\n"
    sql += "insert into bridge_live_source values\n" + ",\n".join(rows) + ";\n"
    (HERE / "live014-source.sql").write_text(sql)
    (HERE / "live014-source-evidence.json").write_text(json.dumps({"source_pin": PIN, "functions": evidence,
        "sql_runtime": "NOT_RUN", "pg_get_functiondef_md5": "NOT_RUN; pending harness snapshots actual DB later",
        "new_cost_usd": 0}, indent=2) + "\n")
    print(json.dumps({"exact_pinned_function_bodies": len(rows), "sql_runtime": "NOT_RUN", "new_cost_usd": 0}))


if __name__ == "__main__":
    main()
