#!/usr/bin/env python3
"""MI-034 egress-2 merge: fold verified-live egress-2 probe results into
packages/career-data/board-directory.json (live-beats-non-live, the v2
merge rule). Existing entries keep their original last_verified; new
entries are stamped with the probe date. Company labels: the probe's
board_name, else the company hint — EXCEPT token-label overrides, where
a postings spot-check DISPROVED the hint (entry stays labeled by its
token, the directory's precedent; run 8's six overrides are preserved
for any re-add and egress-2's own are added from its spot-check pass —
see TOKEN_LABEL below, filled after spot-checks, before this merge runs).
Probe JSONL stays the per-board fetch record of record.
Usage: merge-board-egress2.py <probe.jsonl>
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
# Egress-2 spot-check overrides (2026-10-17): all seven are 0-posting
# boards — real boards (the provider returned the board's postings JSON,
# an empty list), but with zero postings there is nothing to attribute
# them to the slug-guessed employer with (the run-8 "apollo" precedent).
TOKEN_LABEL |= {
    ("ashby", "ondeck"), ("ashby", "project44"), ("greenhouse", "coursehero"),
    ("greenhouse", "greenpeace"), ("greenhouse", "mit"), ("lever", "blueorigin"),
    ("lever", "mit"),
}

def main():
    d = json.load(open(DIR_PATH))
    boards = {(b["provider"], str(b["board_token"]).lower()): b for b in d["boards"]}
    before = Counter(b["provider"] for b in boards.values() if b["status"] == "live")
    before_live = sum(1 for b in boards.values() if b["status"] == "live")
    before_postings = d["meta"].get("total_postings_seen")
    stats, added = Counter(), []
    for path in sys.argv[1:]:
        for line in open(path):
            r = json.loads(line)
            if "provider" not in r: continue
            stats[(r["provider"], r["verdict"])] += 1
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
    meta["generated_at"] = "2026-10-17T08:00:00.000Z"
    meta["egress2_mi034"] = {
        "date": TODAY, "branch": "work/mi034-egress-2", "base": "work/mi034-board-tranche2 @ 9b2832d",
        "probe_stats": {f"{p}:{v}": n for (p, v), n in sorted(stats.items())},
        "live_before": before_live, "live_after": after_live,
        "by_provider_before": dict(before), "by_provider_after": dict(after),
        "token_label_overrides": "FILLED_AT_MERGE_TIME",
        "note": "FILLED_AT_MERGE_TIME",
    }
    meta["live_supported"] = after_live
    meta["live_unsupported"] = sum(1 for b in out_boards if b["status"] == "discovered_unsupported")
    meta["total_postings_seen"] = sum(b["postings_seen"] or 0 for b in out_boards)
    json.dump({"meta": meta, "boards": out_boards}, open(DIR_PATH, "w"), indent=1)
    print(f"live {before_live} -> {after_live} (+{len(added)})  by provider {dict(before)} -> {dict(after)}")
    print(f"total_postings_seen {before_postings} -> {meta['total_postings_seen']}")
    print("added:", ", ".join(f"{b['provider']}:{b['board_token']}={b['postings_seen']}" for b in sorted(added, key=lambda x: -(x['postings_seen'] or 0))))

if __name__ == "__main__":
    main()
