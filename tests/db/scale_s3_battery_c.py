#!/usr/bin/env python3
"""SCALE-S3 battery C driver: begin-door load. Concurrent begins against BOTH
agent doors (career_apply_extension_begin_agent_own and
career_apply_cloud_begin_agent_own) over approvals minted by
scale_s3_battery_c_seed.sql. Every call is a real authenticated session; all
callers in a case are released on one barrier so the approval-row lock, not
startup order, decides the race. Refusals must stay exact and zero false
admits are allowed: each case reconciles admits (job rows actually created)
against successes reported.

Cases: ext-race (12x same approval, extension door), cloud-race (12x, cloud
door), mixed-race (6+6 on one approval), foreign (8x as a user with no
approval), revoked (approval revoked first, 8x), agent-off (switch off, 8x).
Plus the cloud-race winner's row shape and its C9 claim refusal, checked
after the races.

Usage: scale_s3_battery_c.py --sock DIR --port N --psql PATH --out DIR
"""
import argparse, json, os, subprocess, sys, threading
from concurrent.futures import ThreadPoolExecutor

U = "c0000000-0000-4000-8000-0000000000%02d"
Q = "c1000000-0000-4000-8000-0000000000%02d"


def psql(args, sql, role=None):
    cmd = [args.psql, "-X", "-q", "-t", "-A", "-v", "ON_ERROR_STOP=1",
           "-h", args.sock, "-p", str(args.port), "-U", "postgres",
           "-d", "postgres", "-c", (f"set role {role}; " if role else "") + sql]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=300)
    return r


def must(args, sql, role=None):
    r = psql(args, sql, role)
    if r.returncode != 0:
        raise RuntimeError(r.stderr.strip()[:1500])
    return r.stdout.strip()


def seed_cases(args):
    cases = [("ext-race", 1, "s3c-ext-race"), ("cloud-race", 2, "s3c-cloud-race"),
             ("mixed", 3, "s3c-mixed"), ("off", 4, "s3c-off"),
             ("revoked", 5, "s3c-revoked"), ("foreign", 6, "s3c-foreign")]
    seed_file = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                             "scale_s3_battery_c_seed.sql")
    r = subprocess.run([args.psql, "-X", "-q", "-v", "ON_ERROR_STOP=1",
                        "-h", args.sock, "-p", str(args.port), "-U", "postgres",
                        "-d", "postgres", "-f", seed_file],
                       capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError("seed file failed: " + r.stderr.strip()[:1500])
    body = "\n".join(
        f"select s3c.make_case('{n}', '{U % i}', '{j}', '{Q % i}');" for n, i, j in cases)
    body += f"\nselect s3c.make_user('{U % 7}', '{Q % 7}');"
    r = subprocess.run([args.psql, "-X", "-q", "-v", "ON_ERROR_STOP=1",
                        "-h", args.sock, "-p", str(args.port), "-U", "postgres",
                        "-d", "postgres", "-c", body],
                       capture_output=True, text=True, timeout=300)
    if r.returncode != 0:
        raise RuntimeError("case seed failed: " + r.stderr.strip()[:1500])


def get_case(args, name):
    out = must(args, "select jsonb_build_object('user_id', user_id, 'job_id', job_id,"
                     " 'batch_hash', batch_hash, 'pay_ext', pay_ext, 'hash_ext', hash_ext,"
                     " 'pay_cloud', pay_cloud, 'hash_cloud', hash_cloud)::text"
                     f" from s3c.cases where name = '{name}'")
    return json.loads(out)


def begin(args, user, door, payload, h, bh, barrier):
    fn = ("career_apply_extension_begin_agent_own" if door == "ext"
          else "career_apply_cloud_begin_agent_own")
    pay = json.dumps(payload)
    assert "'" not in pay
    sql = (f"select set_config('request.jwt.claim.sub', '{user}', false); "
           f"select public.{fn}('{pay}'::jsonb, '{h}', '{bh}');")
    barrier.wait(timeout=120)
    r = psql(args, sql, role="authenticated")
    if r.returncode == 0:
        return ("admitted", r.stdout.strip()[:200])
    err = r.stderr.strip()
    msg = err.split("ERROR:", 1)[1].strip().splitlines()[0] if "ERROR:" in err else err[:200]
    return ("refused", msg)


def race(args, calls):
    barrier = threading.Barrier(len(calls))
    with ThreadPoolExecutor(max_workers=len(calls)) as ex:
        results = list(ex.map(lambda c: begin(args, *c, barrier), calls))
    admits = [r for r in results if r[0] == "admitted"]
    refusals = {}
    for kind, msg in results:
        if kind == "refused":
            refusals[msg] = refusals.get(msg, 0) + 1
    return {"calls": len(calls), "admitted": len(admits), "refusals": refusals,
            "admit_detail": [a[1] for a in admits]}


def job_rows(args, user, job):
    out = must(args, "select jsonb_build_object('rows', count(*), 'states',"
                     " coalesce(jsonb_agg(jsonb_build_object('state', state, 'source', source,"
                     " 'attempts', attempts)), '[]'))::text from public.career_apply_jobs"
                     f" where user_id = '{user}' and job_id = '{job}'")
    return json.loads(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--sock", required=True)
    ap.add_argument("--port", type=int, required=True)
    ap.add_argument("--psql", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--skip-seed", action="store_true")
    args = ap.parse_args()
    os.makedirs(args.out, exist_ok=True)
    if not args.skip_seed:
        seed_cases(args)

    # The disposable agent switch on for the race cases.
    must(args, "insert into public.career_cloud_settings(key, value)"
               " values ('CAREER_AGENT_SUBMIT', 'on')"
               " on conflict (key) do update set value = 'on'")
    report = {}

    c = get_case(args, "ext-race")
    report["ext-race"] = race(args, [(c["user_id"], "ext", c["pay_ext"], c["hash_ext"],
                                      c["batch_hash"])] * 12)
    report["ext-race"]["db"] = job_rows(args, c["user_id"], c["job_id"])

    c = get_case(args, "cloud-race")
    report["cloud-race"] = race(args, [(c["user_id"], "cloud", c["pay_cloud"], c["hash_cloud"],
                                        c["batch_hash"])] * 12)
    report["cloud-race"]["db"] = job_rows(args, c["user_id"], c["job_id"])
    # The winner's row must be claim-shaped, and the claim's own refusal must
    # still refuse it not_card_approved: a chat begin is not a card tap (the
    # bridge's C9). The refusal is probed directly (as the harness owner)
    # rather than by firing a live claim, so the check cannot steal rows
    # from battery A's queue in the shared harness database.
    rowid = must(args, "select id from public.career_apply_jobs"
                       f" where user_id = '{c['user_id']}' and job_id = '{c['job_id']}'")
    refusal = must(args, "select coalesce(public.career_apply_cloud_refusal(j, now()), 'NULL')"
                         " from public.career_apply_jobs j"
                         f" where id = '{rowid}'")
    report["cloud-race"]["c9_claim_check"] = {
        "winner_row_id": rowid,
        "claim_refusal_for_winner": refusal,
        "winner_state": must(
            args, f"select state from public.career_apply_jobs where id = '{rowid}'")}

    c = get_case(args, "mixed")
    calls = ([(c["user_id"], "ext", c["pay_ext"], c["hash_ext"], c["batch_hash"])] * 6
             + [(c["user_id"], "cloud", c["pay_cloud"], c["hash_cloud"], c["batch_hash"])] * 6)
    report["mixed"] = race(args, calls)
    report["mixed"]["db"] = job_rows(args, c["user_id"], c["job_id"])

    c = get_case(args, "foreign")
    report["foreign"] = race(args, [(U % 7, "ext", c["pay_ext"], c["hash_ext"],
                                     c["batch_hash"])] * 4
                             + [(U % 7, "cloud", c["pay_cloud"], c["hash_cloud"],
                                 c["batch_hash"])] * 4)
    report["foreign"]["db"] = job_rows(args, U % 7, c["job_id"])

    c = get_case(args, "revoked")
    must(args, "update public.career_apply_batch_approvals set revoked_at = now()"
               f" where user_id = '{c['user_id']}' and job_id = '{c['job_id']}'")
    report["revoked"] = race(args, [(c["user_id"], "ext", c["pay_ext"], c["hash_ext"],
                                     c["batch_hash"])] * 4
                             + [(c["user_id"], "cloud", c["pay_cloud"], c["hash_cloud"],
                                 c["batch_hash"])] * 4)
    report["revoked"]["db"] = job_rows(args, c["user_id"], c["job_id"])

    c = get_case(args, "off")
    must(args, "update public.career_cloud_settings set value = 'off'"
               " where key = 'CAREER_AGENT_SUBMIT'")
    report["agent-off"] = race(args, [(c["user_id"], "ext", c["pay_ext"], c["hash_ext"],
                                       c["batch_hash"])] * 4
                               + [(c["user_id"], "cloud", c["pay_cloud"], c["hash_cloud"],
                                   c["batch_hash"])] * 4)
    report["agent-off"]["db"] = job_rows(args, c["user_id"], c["job_id"])
    must(args, "update public.career_cloud_settings set value = 'on'"
               " where key = 'CAREER_AGENT_SUBMIT'")

    print(json.dumps(report, indent=1))
    with open(os.path.join(args.out, "battery-c-report.json"), "w") as fh:
        json.dump(report, fh, indent=1)
    return 0


if __name__ == "__main__":
    sys.exit(main())
