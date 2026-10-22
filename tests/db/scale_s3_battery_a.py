#!/usr/bin/env python3
"""SCALE-S3 battery A driver: claim-path volume and contention, disposable
harness only. Each worker drains the card-bound queue through the REAL RPCs
(career_apply_cloud_claim -> career_apply_cloud_finish -> the exercise's
employer-confirmation stand-in s3.confirm). The board boundary is stubbed at
exactly the exercise's seam: the claimed row's payload_hash must equal the
hash bound at approval time, and no board is ever contacted.

Usage:
  scale_s3_battery_a.py --sock DIR --port N --psql PATH --mode drain|contention \
      --users U --jobs K --workers W --tag TEXT --prefix UUIDPREFIX --out DIR

Seeding is done by scale_s3_seed.sql functions (s3.seed_user / s3.seed_job).
The driver prints one JSON summary line at the end; per-worker claimed row ids
land in <out>/worker-<i>.ids for the reconciliation.
"""
import argparse, json, os, subprocess, sys, time
from multiprocessing import Process

CLAIM_FINISH = """
set role service_role;
with claimed as (select * from public.career_apply_cloud_claim(6)),
fin as (select (public.career_apply_cloud_finish(c.id, c.lease_token,
  'submitted_unconfirmed',
  jsonb_build_object('confirmation_id', 'S3-STUB-' || c.id::text),
  'submitted')).id as id from claimed c),
conf as (select count(*) as confirmed_count
         from (select s3.confirm(f.id) as v from fin f) z)
select f.id from fin f join conf on true;
"""

CLAIM_ONLY = """
set role service_role;
select id from public.career_apply_cloud_claim(6);
"""


def psql(args, sql):
    cmd = [args.psql, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
           "-h", args.sock, "-p", str(args.port), "-U", "postgres",
           "-d", "postgres", "-c", sql]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        raise RuntimeError("psql failed: " + r.stderr.strip()[:2000])
    return [ln.strip() for ln in r.stdout.splitlines() if ln.strip()]


def worker(idx, args, sql):
    out_path = os.path.join(args.out, f"worker-{idx}.ids")
    empty_streak = 0
    try:
        with open(out_path, "w") as fh:
            while empty_streak < 2:
                ids = psql(args, sql)
                if not ids:
                    empty_streak += 1
                    continue
                empty_streak = 0
                for i in ids:
                    fh.write(i + "\n")
                fh.flush()
    except Exception as e:
        with open(os.path.join(args.out, f"worker-{idx}.err"), "w") as fh:
            fh.write(str(e))
        raise


def seed(args):
    n = args.users
    do = f"""
    select s3.arm_cloud('51000000-0000-4000-8000-000000000051');
    do $seed$
    declare u uuid; k int;
    begin
      for n in 1..{n} loop
        u := ('{args.prefix}' || lpad(n::text, 12, '0'))::uuid;
        perform s3.seed_user(u);
        for k in 1..{args.jobs} loop
          perform s3.seed_job(u, '{args.tag}-' || n || '-' || k,
                              'Scale Co ' || n || '-' || k);
        end loop;
      end loop;
    end $seed$;
    """
    psql(args, do)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sock", required=True)
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--psql", required=True)
    ap.add_argument("--mode", choices=["drain", "contention"], default="drain")
    ap.add_argument("--users", type=int, required=True)
    ap.add_argument("--jobs", type=int, required=True)
    ap.add_argument("--workers", type=int, default=1)
    ap.add_argument("--tag", required=True)
    ap.add_argument("--prefix", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--skip-seed", action="store_true")
    args = ap.parse_args()

    os.makedirs(args.out, exist_ok=True)
    t0 = time.time()
    if not args.skip_seed:
        seed(args)
    t_seed = time.time()

    sql = CLAIM_FINISH if args.mode == "drain" else CLAIM_ONLY
    procs = [Process(target=worker, args=(i, args, sql)) for i in range(args.workers)]
    for p in procs:
        p.start()
    for p in procs:
        p.join()
    t_done = time.time()

    errs = [f for f in os.listdir(args.out) if f.endswith(".err")]
    if errs:
        detail = open(os.path.join(args.out, errs[0])).read()
        raise RuntimeError(f"worker failed ({errs[0]}): {detail}")
    seen = {}
    dups = 0
    total = 0
    for i in range(args.workers):
        with open(os.path.join(args.out, f"worker-{i}.ids")) as fh:
            for ln in fh:
                i_ = ln.strip()
                if not i_:
                    continue
                total += 1
                if i_ in seen:
                    dups += 1
                seen[i_] = seen.get(i_, 0) + 1
    seeded = args.users * args.jobs
    recon = psql(args, f"""
      select jsonb_build_object(
        'states', (select jsonb_object_agg(state, c) from
          (select state, count(*) c from public.career_apply_jobs
           where job_id like '{args.tag}-%' group by state) s),
        'bound', (select count(*) from career_message_approval_private.cloud_bound_jobs b
          join public.career_apply_jobs j on j.id = b.job_row_id
          where j.job_id like '{args.tag}-%'),
        'submitted_events', (select count(*) from public.career_apply_cloud_events e
          where e.outcome = 'submitted' and e.user_id in
           (select user_id from public.career_apply_jobs where job_id like '{args.tag}-%')),
        'mail_confirmations', (select count(*) from public.career_mail_events m
          join public.career_apply_jobs j on m.application_ref = 'job:' || j.id
          where j.job_id like '{args.tag}-%')
      )::text;
    """)
    summary = {
        "mode": args.mode, "tag": args.tag, "seeded": seeded,
        "workers": args.workers, "claimed_rows": total,
        "claimed_unique": len(seen), "duplicate_claims": dups,
        "seed_seconds": round(t_seed - t0, 2),
        "drain_seconds": round(t_done - t_seed, 2),
        "rows_per_second": round(len(seen) / max(t_done - t_seed, 0.001), 2),
        "db_reconciliation": json.loads(recon[0]) if recon else None,
    }
    print(json.dumps(summary, indent=1))
    return 0


if __name__ == "__main__":
    sys.exit(main())
