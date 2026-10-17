#!/usr/bin/env python3
"""MI-034 tranche-2 merge: fold verified-live probe results into
packages/career-data/board-directory.json (live-beats-non-live, the v2
merge rule). Existing entries keep their original last_verified; new
entries are stamped with the probe date. Company labels: the probe's
board_name, else the company hint — EXCEPT the token-label overrides
below, where a postings spot-check DISPROVED the hint (the board is real
and watchable; the guessed employer is not who posts there), so the
entry stays labeled by its token, the directory's existing precedent.
Probe JSONL files stay the per-board fetch records of record.
Usage: merge-board-tranche2.py <probe.jsonl> [<probe.jsonl> ...]
"""
import json, os, sys
from collections import Counter

HERE = os.path.dirname(os.path.abspath(__file__))
DIR_PATH = os.path.join(HERE, "..", "..", "packages", "career-data", "board-directory.json")
TODAY = "2026-10-17"
TOKEN_LABEL = {
    ("greenhouse", "current"), ("greenhouse", "galaxy"), ("greenhouse", "wise"),
    ("greenhouse", "apollo"), ("ashby", "circle"), ("ashby", "unit"),
}

def main():
    d = json.load(open(DIR_PATH))
    boards = {(b["provider"], str(b["board_token"]).lower()): b for b in d["boards"]}
    before = Counter(b["provider"] for b in boards.values() if b["status"] == "live")
    before_live = sum(1 for b in boards.values() if b["status"] == "live")
    stats, added = Counter(), []
    for path in sys.argv[1:]:
        for line in open(path):
            r = json.loads(line)
            if "provider" not in r: continue
            stats[(os.path.basename(path), r["provider"], r["verdict"])] += 1
            if r["verdict"] != "live": continue
            key = (r["provider"], str(r["token"]).lower())
            if key in boards: continue
            company = r["token"] if key in TOKEN_LABEL else (r.get("board_name") or r.get("company_hint") or r["token"])
            boards[key] = {
                "company": company, "provider": r["provider"], "board_token": r["token"],
                "status": "live", "postings_seen": r["postings"],
                "last_verified": TODAY, "source": r["source"],
            }
            added.append(boards[key])
    out_boards = sorted(boards.values(), key=lambda b: -(b["postings_seen"] or 0))
    after = Counter(b["provider"] for b in out_boards if b["status"] == "live")
    after_live = sum(1 for b in out_boards if b["status"] == "live")
    meta = dict(d["meta"])
    meta["generated_at"] = "2026-10-17T07:30:00.000Z"
    meta["tranche2_mi034"] = {
        "date": TODAY, "branch": "work/mi034-board-tranche2",
        "banks_probe_stats": {f"{p}:{v}": n for (f, p, v), n in sorted(stats.items()) if f == "banks.jsonl"},
        "general_probe_stats": {f"{p}:{v}": n for (f, p, v), n in sorted(stats.items()) if f == "general.jsonl"},
        "live_before": before_live, "live_after": after_live,
        "by_provider_before": dict(before), "by_provider_after": dict(after),
        "token_label_overrides": sorted(f"{p}:{t}" for p, t in TOKEN_LABEL),
        "note": "Banks-first tranche (1,566 probes: live 69 / dead 1,101 / unverifiable 396 / transport-error 0) plus a general tranche-2 sweep (2,473 probes: live 86 / dead 1,946 / unverifiable 441 / transport-error 0; 16 candidates skipped as already live); combined +155 live boards, 107 -> 262. A board is live only on a real postings-JSON fetch this run; 429 never occurred, no provider hard-stopped. Per-board fetch records: docs/career/board-tranche2-probes/{banks,general}.jsonl (every probed candidate named with its verdict). Token-label overrides: postings spot-checks disproved the slug-guess hint (greenhouse current = a digital agency, galaxy = security services, wise = US field-sales org, apollo 0 postings unattributable, ashby circle = community-platform company, unit unattributable) — entries stay token-labeled per directory precedent. Egress items (Tyson remainder, Workday 422 tenants, Corpus 3A untested candidates) NOT attempted this run — named as remaining.",
    }
    meta["live_supported"] = after_live
    meta["live_unsupported"] = sum(1 for b in out_boards if b["status"] == "discovered_unsupported")
    meta["total_postings_seen"] = sum(b["postings_seen"] or 0 for b in out_boards)
    json.dump({"meta": meta, "boards": out_boards}, open(DIR_PATH, "w"), indent=1)
    print(f"live {before_live} -> {after_live} (+{len(added)})  by provider {dict(before)} -> {dict(after)}")
    print(f"total_postings_seen {meta['total_postings_seen']}")

if __name__ == "__main__":
    main()
