#!/usr/bin/env python3
"""SCALE-S3 battery B driver: the F-034 cap race at volume, against the CURRENT
production store discipline (career_batch_ledger_v1 read +
career_batch_save_ledger_v1 whole-array replace, no version token).

Each "drain" faithfully replicates the batch executor's store sequence
(workers/career-browser/batch-executor.cjs buildDeps): ledgerFor(userId) ->
the drain executes its submission against that snapshot (the board leg is
stubbed: the submission is counted as executed and appended to the drain's
in-memory copy, exactly where 155 appends it) -> saveLedger(userId, records)
with the whole mutated array. One per-day slot is left open (14 of cap 15
seeded as submitted), so a correct store admits exactly ONE of the two racing
drains; the other must be refused or deferred.

Race pairs are forced to overlap the way the parallel-drives guard forced it:
both drains take their snapshot BEFORE either saves (threading.Barrier).
Controls run the same two drains sequentially.

Usage: scale_s3_battery_b.py --sock DIR --port N --psql PATH
         --pairs P --controls C --prefix UUIDPREFIX --out DIR
Prints one JSON summary; per-user detail lands in <out>/battery-b-detail.json.
"""
import argparse, json, os, subprocess, sys, threading, time
from concurrent.futures import ThreadPoolExecutor

VENDORS = ["greenhouse", "lever", "ashby", "workday", "greenhouse", "lever",
           "smartrecruiters", "greenhouse", "lever", "ashby", "greenhouse",
           "lever", "workday", "ashby"]


def psql(args, sql, role=True):
    cmd = [args.psql, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
           "-h", args.sock, "-p", str(args.port), "-U", "postgres",
           "-d", "postgres", "-c", ("set role service_role; " if role else "") + sql]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:1500])
    return r.stdout.strip()


def seed_records(user):
    return [{"userId": user, "status": "submitted",
             "timestamp": "2026-10-22T10:00:00.000Z", "vendor": VENDORS[i],
             "company": f"Seed Co {i}",
             "canonicalKey": f"{VENDORS[i]}:seed{i}:role"} for i in range(14)]


REFUSALS = []


def drain(args, user, company, barrier, errors):
    """One executor drain, the executor + 149/155 seam end to end: snapshot
    (ledgerFor) -> the cap is counted from THAT snapshot (155 counts caps from
    deps.log, the snapshot it was handed) -> on a free slot the submission
    executes (board leg stubbed) and is appended to the in-memory copy ->
    whole-array save (saveLedger)."""
    try:
        snap = json.loads(psql(args, f"select public.career_batch_ledger_v1('{user}')::text"))
        records = snap["records"]
        if barrier is not None:
            barrier.wait(timeout=120)
        submitted = [r for r in records if r.get("status") == "submitted"]
        if len(submitted) >= 15:
            REFUSALS.append({"user": user, "company": company,
                             "refusal": "CAP_REACHED counted from the drain's snapshot"})
            return False
        records = records + [{"userId": user, "status": "submitted",
                              "timestamp": "2026-10-22T15:00:00.000Z",
                              "vendor": "greenhouse", "company": company,
                              "canonicalKey": f"greenhouse:{company.lower()}:role"}]
        psql(args, "select public.career_batch_save_ledger_v1('%s', '%s'::jsonb)"
             % (user, json.dumps(records).replace("'", "''")))
        return True
    except Exception as e:  # a refused save is a RESULT, not a driver failure
        errors.append({"user": user, "company": company, "error": str(e)[:300]})
        return False


def final_ledger(args, user):
    snap = json.loads(psql(args, f"select public.career_batch_ledger_v1('{user}')::text"))
    recs = [r for r in snap["records"] if r.get("status") == "submitted"]
    return {"submitted": len(recs),
            "race_records": sorted(r["company"] for r in recs
                                   if r["company"].startswith("Race"))}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sock", required=True)
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--psql", required=True)
    ap.add_argument("--pairs", type=int, default=40)
    ap.add_argument("--controls", type=int, default=10)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--out", required=True)
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)

    users = [f"{args.prefix}{i:012d}" for i in range(1, args.pairs + args.controls + 1)]
    for u in users:
        psql(args, f"insert into auth.users(id,email) values ('{u}','s3b-{u}@example.test') "
                   "on conflict (id) do nothing", role=False)
        psql(args, "select public.career_batch_save_ledger_v1('%s', '%s'::jsonb)"
             % (u, json.dumps(seed_records(u)).replace("'", "''")))

    race_users, control_users = users[:args.pairs], users[args.pairs:]
    errors = []
    t0 = time.time()

    def race_pair(u):
        b = threading.Barrier(2)
        with ThreadPoolExecutor(max_workers=2) as ex:
            list(ex.map(lambda c: drain(args, u, c, b, errors), ["RaceA", "RaceB"]))

    with ThreadPoolExecutor(max_workers=8) as ex:
        list(ex.map(race_pair, race_users))
    for u in control_users:
        drain(args, u, "RaceA", None, errors)
        drain(args, u, "RaceB", None, errors)
    elapsed = time.time() - t0

    detail = {"race": {}, "control": {}}
    lost = over = clean = 0
    for u in race_users:
        d = final_ledger(args, u)
        detail["race"][u] = d
        if d["submitted"] == 15 and len(d["race_records"]) == 1:
            lost += 1  # 16 executed, 15 recorded: one record silently erased
        elif d["submitted"] == 15 and len(d["race_records"]) == 2:
            clean += 1  # cannot happen under whole-replace; would mean a fix
        else:
            over += 1
    ctrl_ok = 0
    for u in control_users:
        d = final_ledger(args, u)
        detail["control"][u] = d
        # Sequential drains are CORRECT when the second drain counts the cap
        # from a fresh snapshot (15) and is refused: ledger stays 15 with only
        # the first drain's record added.
        if d["submitted"] == 15 and d["race_records"] == ["RaceA"]:
            ctrl_ok += 1
    with open(os.path.join(args.out, "battery-b-detail.json"), "w") as fh:
        json.dump(detail, fh, indent=1)
    summary = {
        "discipline": "current: career_batch_save_ledger_v1 whole-array replace, no version token",
        "race_pairs": args.pairs, "controls": args.controls,
        "executed_submissions_per_pair": 2,
        "pairs_ledger_15_but_one_record_lost": lost,
        "pairs_both_records_kept": clean,
        "pairs_other_outcome": over,
        "control_pairs_correct_cap_held": ctrl_ok,
        "cap_refusals_from_fresh_snapshot": REFUSALS,
        "save_errors": errors,
        "elapsed_seconds": round(elapsed, 2),
    }
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
