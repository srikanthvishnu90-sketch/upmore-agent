#!/usr/bin/env python3
"""Generate the capability registry from Instinct spec doc 02 plus an honest status overlay.

Source of IDs: docs/instinct-spec-series/02.md (the checklist). Source of status:
packages/capabilities/status-overlay.json, which may only raise an entry above
CLAIMED when it names a test the entry passes. Everything else stays CLAIMED, so
the agent says "not yet" instead of overclaiming (doc 02, doc 14).

Corrections applied to the spec text, recorded in the output:
- doc 02 says "Total: 316 capabilities"; its own per-domain counts sum to 296.
- doc 02 lists "TXN-002-export CSV export", reusing TXN-002; it becomes TXN-012.
"""
from pathlib import Path
import argparse
import json
import re

root = Path(__file__).resolve().parents[1]
spec = root / "docs/instinct-spec-series/02.md"
overlay_path = root / "packages/capabilities/status-overlay.json"
target = root / "packages/capabilities/registry.json"
DOMAIN_NAMES = {"ACCT": "accounts", "TXN": "transactions", "ANL": "budgets and analytics", "PAY": "payments and transfers",
                "BILL": "bills and subscriptions", "CARD": "cards", "SAVE": "savings", "EARN": "earnings", "INV": "investing",
                "CRDT": "credit and debt", "TAX": "taxes", "INS": "insurance", "HOUS": "housing", "NEWS": "news and intelligence",
                "ALRT": "alerts", "SOC": "social money", "SEC": "security and identity", "CORE": "agent core"}
OWNER_DOC = {"ACCT": "05", "TXN": "04", "ANL": "07", "PAY": "06", "BILL": "07", "CARD": "07", "SAVE": "07", "EARN": "08",
             "INV": "09", "CRDT": "07", "TAX": "15", "INS": "07", "HOUS": "06", "NEWS": "10", "ALRT": "01", "SOC": "06",
             "SEC": "14", "CORE": "01"}
ENTRY = re.compile(r"\b([A-Z]{3,4})-(\d{3})(-[a-z]+)?\s+(.+?)\s+\((T[0-5])(?:,\s*(GATED))?\)\.")


def parse():
    text = spec.read_text()
    rows, corrections, seen = [], [], set()
    for m in ENTRY.finditer(text):
        domain, number, suffix, name, tier, gated = m.groups()
        cid = f"{domain}-{number}"
        if suffix:  # "TXN-002-export": the spec reused an ID; take the next free number in the domain.
            used = {r["id"] for r in rows if r["domain_code"] == domain}
            n = int(number)
            while f"{domain}-{n:03d}" in used or f"{domain}-{n:03d}" == cid:
                n += 1
            corrections.append(f"{cid}{suffix} ({name}) renumbered to {domain}-{n:03d}")
            cid = f"{domain}-{n:03d}"
        if cid in seen:
            raise SystemExit(f"duplicate id in spec after correction: {cid}")
        seen.add(cid)
        rows.append({"id": cid, "name": name, "domain_code": domain, "domain": DOMAIN_NAMES[domain], "tier": tier,
                     "owner_doc": OWNER_DOC[domain], "spec_gated": bool(gated)})
    declared = {k: int(v) for k, v in re.findall(r"\(([A-Z]{3,4})\) (\d+)", text)}
    for code, count in declared.items():
        actual = sum(r["domain_code"] == code for r in rows)
        if actual != count:
            raise SystemExit(f"{code}: spec declares {count} entries, parsed {actual}")
    total = re.search(r"Total: (\d+) capabilities", text)
    if total and int(total.group(1)) != len(rows):
        corrections.append(f"spec states 'Total: {total.group(1)}'; per-domain counts sum to {len(rows)}")
    return rows, corrections


def build():
    rows, corrections = parse()
    overlay = json.loads(overlay_path.read_text()) if overlay_path.exists() else {}
    unknown = set(overlay) - {r["id"] for r in rows}
    if unknown:
        raise SystemExit(f"overlay names unknown ids: {sorted(unknown)}")
    for r in rows:
        o = overlay.get(r["id"], {})
        # Spec-marked GATED entries default to GATED with the spec's reason; everything else starts CLAIMED.
        r["status"] = o.get("status", "GATED" if r["spec_gated"] else "CLAIMED")
        r["test_ref"] = o.get("test_ref")
        r["gate_reason"] = o.get("gate_reason", "Spec doc 02 marks this capability as needing a partner or license." if r["spec_gated"] else None)
        r["connectors"] = o.get("connectors", [])
        r["implementation"] = o.get("implementation", [])
        r["note"] = o.get("note")
        r["description"] = o.get("description", r["name"])
        del r["spec_gated"]
    # Doc 15 backlog: CLAIMED items with owner docs, attached to the capability they deepen where the doc cites one. Never counted as capabilities.
    backlog_path = root / "packages/capabilities/backlog.json"
    backlog = json.loads(backlog_path.read_text())["items"] if backlog_path.exists() else []
    known = {r["id"] for r in rows}
    bad = [b["id"] for b in backlog if (b.get("attached_to") and b["attached_to"] not in known) or any(x not in known for x in b.get("related", []))]
    if bad:
        raise SystemExit(f"backlog items cite unknown registry ids: {bad}")
    if any(b.get("status") != "CLAIMED" for b in backlog):
        raise SystemExit("backlog items are CLAIMED until built; raise status in doc 02's overlay on the attached capability instead")
    return {"schema_version": 1, "source": str(spec.relative_to(root)), "corrections": corrections,
            "backlog": {"source": "docs/instinct-spec-series/15.md", "count": len(backlog), "items": backlog},
            "statuses": ["CLAIMED", "BUILT", "TESTED", "VERIFIED", "GATED", "NOT_WIRED"],
            "tiers": {"T0": "inform", "T1": "watch", "T2": "draft", "T3": "act with confirmation",
                      "T4": "act within standing limits", "T5": "never autonomous"},
            "capabilities": rows}


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if registry.json is stale")
    args = ap.parse_args()
    content = json.dumps(build(), indent=1) + "\n"
    if args.check:
        if not target.exists() or target.read_text() != content:
            raise SystemExit("Capability registry is stale: run scripts/build-capability-registry.py")
        print("Capability registry verified")
    else:
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(content)
        print(f"Capability registry built: {len(json.loads(content)['capabilities'])} capabilities")
