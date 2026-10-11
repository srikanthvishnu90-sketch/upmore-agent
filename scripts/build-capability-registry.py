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


BACKLOG = root / "docs/instinct-spec-series/15.md"
BACKLOG_ITEM = re.compile(r'(?<![\d.])(\d{1,3}(?:\+\d{1,3})?)\.?\s?([A-Z"][^()]*?)\s*\(([^)]*)\)')
# A section heading sits between an item's closing reference and the next item number; it may carry an aside of its
# own ("Life events (playbooks the agent runs)") but never a reference-shaped parenthesis.
BACKLOG_HEAD = re.compile(r'\)(?:\d{1,3})?([A-Z][a-z][^()\d]*?(?:\((?!docs?\s|[A-Z]{3,4}-\d{3}|[A-Z]{3,4} family)[^()]*\))?[^()\d]*?)(?=\d{1,3}[A-Z"])')


def provisional_tier(title):
    # Doc 15 gives no tiers; derive a conservative one from the verb and record that it is provisional.
    t = title.lower()
    if re.search(r"\b(execution|pay|payment|claims?|rebook|enrollment|sub-accounts?|kill switch|purge|deletion)\b", t): return "T3"
    if re.search(r"\b(draft|letter|script|checklist|playbook|packet)\b", t): return "T2"
    if re.search(r"\b(alert|countdown|reminder|watch|tracking|monitoring|detection|matching|notice)\b", t): return "T1"
    return "T0"


def parse_backlog(known_ids):
    """Doc 15: 112 missing capabilities, each with an owner doc or a related registry id."""
    text = BACKLOG.read_text()
    body = text.split("Everyday money operations", 1)[1].split("How this list lives")[0]
    heads = [(0, "Everyday money operations")] + [(m.start(), m.group(1)) for m in BACKLOG_HEAD.finditer(body)]
    rows, corrections, n = [], [], 0
    # Items are numbered within sections and the numbers restart at 1, so walk them in order: the next item is
    # the nearest "<prev+1>Title (ref)" or "1Title (ref)". A title may hold one parenthesised aside of its own, and
    # may start with a digit ("529 plan"), which is why a global regex misread "10529 plan" as item 105.
    pos, prev = 0, 0
    while True:
        best = None
        # A reference is a doc number or a registry id, so a title's own aside like "(FIFO vs specific ID)" is not mistaken for it.
        REF = r'\(((?:docs?\s*\d|[A-Z]{3,4}-\d{3}|[A-Z]{3,4}(?= family\)|\)))[^()]*)\)'
        for cand, number in ([(prev + 1, str(prev + 1)), (1, "1"), (prev + 1, r"\d{1,3}\+\d{1,3}")] if prev else [(1, "1")]):
            pat = re.compile(r'(?<![\d.])' + number + r'\.?\s?((?:[A-Z"\d])[^()]*?(?:\([^()]*\)[^()]*?)?)\s*' + REF)
            mm = pat.search(body, pos)
            if mm and (best is None or mm.start() < best[0].start()):
                best = (mm, cand)
        if not best:
            break
        m, num = best
        title, ref = m.group(1), m.group(2)
        if "+" in m.group(0).split(title)[0]:
            corrections.append(f"doc 15 item '{m.group(0)[:6].strip()}' ({title.strip()[:40]}) has a malformed number; kept as one item")
        section = [h for s, h in heads if s <= m.start()][-1]
        pos, prev = m.end(), num
        n += 1
        related = [r for r in re.findall(r"[A-Z]{3,4}-\d{3}", ref) if r in known_ids]
        doc = re.search(r"docs? (\d{2})", ref)
        owner = doc.group(1) if doc else (OWNER_DOC[related[0].split("-")[0]] if related else "15")
        rows.append({"id": f"MISS-{n:03d}", "name": title.strip().rstrip(":"), "domain_code": "MISS", "domain": f"backlog: {section.strip().lower()}",
                     "tier": provisional_tier(title), "owner_doc": owner, "spec_gated": False, "related_ids": related,
                     "backlog_ref": ref.strip(), "tier_provisional": True})
    expected = re.search(r"(\d+) capabilities and design surfaces", text)
    if expected and int(expected.group(1)) != n:
        corrections.append(f"doc 15 states {expected.group(1)} items; parsed {n}")
    return rows, corrections


def build():
    rows, corrections = parse()
    backlog, more = parse_backlog({r["id"] for r in rows})
    rows += backlog
    corrections += more
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
    DOMAIN_NAMES["MISS"] = "backlog (doc 15)"
    return {"schema_version": 1, "source": str(spec.relative_to(root)), "backlog_source": str(BACKLOG.relative_to(root)), "corrections": corrections,
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
