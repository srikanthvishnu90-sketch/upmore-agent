#!/usr/bin/env python3
"""Generate the doc 03 parity matrix from the registry, the competitor catalog and the seed map.

Inputs (never hand-edited together):
- packages/capabilities/registry.json         capability ids + honest status (doc 02)
- docs/competition/features.json              Codex's catalog: 241 seeds + discoveries + atoms, per-app presence
- evals/parity/registry-map.json              seed/discovery id -> registry_id, or non_parity + reason

Output: evals/parity/matrix.json and a coverage table. Exit 1 if any seed or discovery
lacks both a registry id and a non-parity reason, or names a registry id that does not
exist. Coverage per app = mapped rows whose registry status is TESTED/VERIFIED (delivered)
over all parity rows; non-parity rows are excluded from the denominator but listed.
"""
from pathlib import Path
import argparse
import json
import sys

root = Path(__file__).resolve().parents[1]
registry = json.loads((root / "packages/capabilities/registry.json").read_text())
catalog = json.loads((root / "docs/competition/features.json").read_text())
mapping = json.loads((root / "evals/parity/registry-map.json").read_text())["rows"]
caps = {c["id"]: c for c in registry["capabilities"]}
apps = {c["id"]: c["app"] for c in catalog["cohort"]}
DELIVERED = {"TESTED", "VERIFIED"}


def build():
    errors, rows = [], []
    for f in catalog["features"]:
        if f["record_type"] not in ("seed", "discovery"):
            continue
        m = mapping.get(f["id"])
        if not m:
            errors.append(f"{f['id']}: no mapping"); continue
        row = {"catalog_id": f["id"], "record_type": f["record_type"], "outcome": f.get("outcome"),
               "apps": {a: f.get("competitor_presence", {}).get(a, "UNVERIFIED") for a in f.get("app_ids", [])},
               "catalog_status": f.get("status")}
        if m.get("non_parity"):
            if not m.get("reason"):
                errors.append(f"{f['id']}: non_parity without a reason")
            row.update(upmore=None, non_parity=m["non_parity"], reason=m.get("reason"))
        else:
            rid = m.get("registry_id")
            if rid not in caps:
                errors.append(f"{f['id']}: unknown registry id {rid}"); continue
            c = caps[rid]
            row.update(upmore={"registry_id": rid, "name": c["name"], "status": c["status"], "tier": c["tier"],
                               "delivered": c["status"] in DELIVERED, "gate_reason": c.get("gate_reason")},
                       confidence=m.get("confidence"), note=m.get("note"))
        rows.append(row)
    coverage = {}
    for a, name in apps.items():
        mine = [r for r in rows if a in r["apps"]]
        parity = [r for r in mine if r["upmore"]]
        delivered = [r for r in parity if r["upmore"]["delivered"]]
        gated = [r for r in parity if r["upmore"]["status"] == "GATED"]
        coverage[a] = {"app": name, "rows": len(mine), "parity_rows": len(parity), "non_parity": len(mine) - len(parity),
                       "delivered": len(delivered), "gated": len(gated), "claimed": len(parity) - len(delivered) - len(gated),
                       "delivered_pct": round(100 * len(delivered) / len(parity), 1) if parity else 0.0}
    return {"schema_version": 1, "generated_from": {"registry": registry["source"], "catalog_rows": len(catalog["features"]),
            "mapped_rows": len(rows)}, "coverage": coverage, "rows": rows}, errors


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if evals/parity/matrix.json is stale")
    ap.add_argument("--min-delivered-pct", type=float, default=None, help="CI floor: coverage may never decrease")
    args = ap.parse_args()
    matrix, errors = build()
    if errors:
        print("\n".join(errors)); sys.exit(1)
    target = root / "evals/parity/matrix.json"
    content = json.dumps(matrix, indent=1) + "\n"
    if args.check:
        if not target.exists() or target.read_text() != content:
            sys.exit("Parity matrix is stale: run scripts/build-parity-matrix.py")
    else:
        target.write_text(content)
    print(f"{'app':<4}{'name':<32}{'rows':>5}{'parity':>7}{'deliv':>6}{'gated':>6}{'claim':>6}{'non-p':>6}{'deliv%':>8}")
    for a, c in matrix["coverage"].items():
        print(f"{a:<4}{c['app'][:31]:<32}{c['rows']:>5}{c['parity_rows']:>7}{c['delivered']:>6}{c['gated']:>6}{c['claimed']:>6}{c['non_parity']:>6}{c['delivered_pct']:>8}")
    total = sum(c["delivered"] for c in matrix["coverage"].values()), sum(c["parity_rows"] for c in matrix["coverage"].values())
    pct = round(100 * total[0] / total[1], 1) if total[1] else 0.0
    print(f"all delivered: {total[0]}/{total[1]} parity rows ({pct}%). Delivered = registry TESTED/VERIFIED; nothing here is a live claim.")
    if args.min_delivered_pct is not None and pct < args.min_delivered_pct:
        sys.exit(f"coverage {pct}% is below the floor {args.min_delivered_pct}%")
