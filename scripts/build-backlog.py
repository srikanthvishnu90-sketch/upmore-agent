#!/usr/bin/env python3
"""Generate the capability backlog from Instinct spec doc 15 (the missing 100+).

One-way: hand edits go in docs/instinct-spec-series/15.md, then rerun. Each item
becomes a CLAIMED backlog row with its group, owner doc and, where the doc cites
one, the registry capability it deepens. Items that cite only a doc get no
registry id yet; they are new capability surface for that doc's owner to
register in doc 02 when built. Output: packages/capabilities/backlog.json,
merged into registry.json by scripts/build-capability-registry.py.
"""
import json
import re
from pathlib import Path

root = Path(__file__).resolve().parents[1]
spec = root / "docs/instinct-spec-series/15.md"
target = root / "packages/capabilities/backlog.json"
OWNER_DOC = {"ACCT": "05", "TXN": "04", "ANL": "07", "PAY": "06", "BILL": "07", "CARD": "07", "SAVE": "07", "EARN": "08",
             "INV": "09", "CRDT": "07", "TAX": "15", "INS": "07", "HOUS": "06", "NEWS": "10", "ALRT": "01", "SOC": "06",
             "SEC": "14", "CORE": "01"}
ID = re.compile(r"\b([A-Z]{3,4})-(\d{3})\b")
DOC = re.compile(r"\bdocs? (\d{2})(?:,\s*(\d{2}))*")
# Items start with a number after the previous item's ")"; group headings follow a ")" with no number and run up to their first "1" item.
SPLIT = re.compile(r"(?<=\))\s*(?=\d{1,3}(?:\+\d+\.)?\s*[A-Z\"5]|[A-Z][^0-9]{2,60}1[A-Z\"5])")
PAREN = re.compile(r"\(([^()]*)\)")


def parse():
    text = spec.read_text()
    body = text[text.index("Everyday money operations"):text.index("How this list lives")]
    rows, group, expected = [], None, 1
    for chunk in SPLIT.split(body):
        chunk = chunk.strip()
        if not chunk:
            continue
        # A chunk with no digits at all is a bare heading (its first item split off because the heading ends in a parenthesis).
        if not re.search(r"\d", chunk):
            group, expected = chunk, 1
            continue
        # A chunk that does not start with a digit opens a new group: heading text runs up to the first item number.
        m = re.match(r"^([A-Za-z][^\d]*?)(\d.*)$", chunk, re.S)
        if m:
            group, chunk, expected = m.group(1).strip(), m.group(2), 1
        # The item number: prefer the expected one (so "10529 plan" reads as item 10, "529 plan"); tolerate the doc's "66+76." glitch.
        g = re.match(r"^(\d+)\+\d+\.\s*(.*)$", chunk, re.S)
        if g:
            rest = g.group(2)
        elif chunk.startswith(str(expected)):
            rest = chunk[len(str(expected)):]
        else:
            n = re.match(r"^(\d{1,2})", chunk)
            rest = chunk[len(n.group(1)):]
        expected += 1
        parens = list(PAREN.finditer(rest))
        if not parens:
            raise SystemExit(f"item without references: {rest[:60]}")
        last = parens[-1]
        name, refs = rest[:last.start()].strip(), last.group(1).strip()
        ids = [f"{d}-{n}" for d, n in ID.findall(refs)]
        docs = re.findall(r"\b(\d{2})\b", ID.sub("", refs))
        # Owner: an explicit doc other than 02 wins; otherwise the cited capability's domain owner; "doc 02 CRDT" means the CRDT domain.
        domain_word = re.search(r"\b(ACCT|TXN|ANL|PAY|BILL|CARD|SAVE|EARN|INV|CRDT|TAX|INS|HOUS|NEWS|ALRT|SOC|SEC|CORE)\b", ID.sub("", refs))
        explicit = [d for d in docs if d != "02"]
        owner = explicit[0] if explicit else (OWNER_DOC[ids[0].split("-")[0]] if ids else (OWNER_DOC[domain_word.group(1)] if domain_word else (docs[0] if docs else None)))
        rows.append({"id": f"B15-{len(rows) + 1:03d}", "name": name, "group": group, "owner_doc": owner, "status": "CLAIMED",
                     "attached_to": ids[0] if ids else None, "related": ids[1:], "refs": refs})
    return rows


def main():
    import argparse
    ap = argparse.ArgumentParser()
    ap.add_argument("--check", action="store_true", help="fail if backlog.json is stale")
    args = ap.parse_args()
    rows = parse()
    missing = [r["id"] for r in rows if not r["owner_doc"]]
    if missing:
        raise SystemExit(f"backlog rows without an owner doc: {missing}")
    out = {"schema_version": 1, "source": "docs/instinct-spec-series/15.md", "generated_by": "scripts/build-backlog.py",
           "rule": "every item enters as CLAIMED with its owner doc; attached_to names the registry capability it deepens when the doc cites one; the list is done being a list when every item is VERIFIED or GATED with a reason, which is never",
           "items": rows}
    content = json.dumps(out, indent=1) + "\n"
    if args.check:
        if not target.exists() or target.read_text() != content:
            raise SystemExit("Backlog is stale: run scripts/build-backlog.py")
        print(f"Backlog verified: {len(rows)} items")
        return
    target.write_text(content)
    groups = {}
    for r in rows:
        groups[r["group"]] = groups.get(r["group"], 0) + 1
    print(f"backlog built: {len(rows)} items, {sum(1 for r in rows if r['attached_to'])} attached to registry ids, {len(groups)} groups")
    for g, n in groups.items():
        print(f"  {n:3d}  {g}")


if __name__ == "__main__":
    main()
