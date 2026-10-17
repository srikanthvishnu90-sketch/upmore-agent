#!/usr/bin/env python3
"""MI-034 egress-2 RESUME (tier 2). The first egress-2 probe process was
killed mid-run (egress transport collapsed: the final 34 records are all
http=0 errors across all four providers at once; no 429 ever occurred,
so no provider is hard-stopped). Errors are NOT verdicts: this resume
re-probes every candidate that has no conclusive verdict in
egress2.jsonl (the 34 errored + the never-probed), with calibration
re-run first and recorded in this file's header. Same doctrine, same
classify(), same candidate builder — imported from board-egress2-probe.py.
Usage: board-egress2-resume.py <part1.jsonl> <out.jsonl>
"""
import concurrent.futures, importlib.util, json, os, sys
HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("egress2probe", os.path.join(HERE, "board-egress2-probe.py"))
PART1, OUT = sys.argv[1], sys.argv[2]
P = importlib.util.module_from_spec(spec)
sys.argv = ["board-egress2-probe.py", "unused"]
spec.loader.exec_module(P)
done_keys = set()
for line in open(PART1):
    r = json.loads(line)
    if "provider" in r and r["verdict"] in ("live", "dead", "unverifiable"):
        done_keys.add((r["provider"], r["token"].lower()))
cands, skipped = P.build_candidates()
todo = [c for c in cands if (c["provider"], c["token"].lower()) not in done_keys]
print(f"resume: {len(todo)} to probe ({len(done_keys)} conclusive in part 1)", flush=True)
calib = {}
for p in P.ENDPOINTS:
    rec = P.probe({"provider": p, "token": "zz-nonexistent-board-918273", "source": "calibration", "company_hint": None})
    calib[p] = {"http": rec["http"], "verdict": rec["verdict"]}
    P.STOPPED.clear()
print("calibration:", json.dumps(calib), flush=True)
done = 0
with open(OUT, "w") as fh:
    fh.write(json.dumps({"calibration": calib, "mode": "egress2-corpus3a-resume", "part1_conclusive": len(done_keys)}) + "\n"); fh.flush()
    with concurrent.futures.ThreadPoolExecutor(max_workers=int(os.environ.get("PROBE_WORKERS", "8"))) as ex:
        futs = {ex.submit(P.probe, c): c for c in todo}
        for fut in concurrent.futures.as_completed(futs):
            rec = fut.result()
            fh.write(json.dumps(rec) + "\n"); fh.flush()
            done += 1
            if done % 200 == 0: print(f"{done}/{len(todo)} stopped={sorted(P.STOPPED)}", flush=True)
print("done", done, "stopped_providers", sorted(P.STOPPED), flush=True)
