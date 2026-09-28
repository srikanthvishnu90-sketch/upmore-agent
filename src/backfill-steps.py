#!/usr/bin/env python3
"""Backfill missing steps for the 94 step-less routes (R9229-R9322).
Steps are derived ONLY from each route's own fields (provider/method/what/
requirements/payout_timing/url) + generic per-category scaffolding.
No invented specifics.
"""
import json, pathlib

DATA = pathlib.Path("/home/hatch/workspace/upmore/src/data/upmore-data.json")
d = json.loads(DATA.read_text())

def S(n, text):
    return {"n": n, "text": text, "who": "Upmore", "done_when": "", "warns": ""}

def uniq(*parts):
    out = []
    for p in parts:
        p = (p or "").strip().rstrip(".")
        if p and p not in out:
            out.append(p)
    return out

def build(r):
    cat, prov = r["category"], r["provider"]
    method, req, pay = r.get("method") or "", r.get("requirements") or "", r.get("payout_timing") or ""
    url = r.get("url") or ""
    where = f" at {url}" if url else ""
    acts = uniq(method, req)
    action = acts[0] if acts else "the qualifying activity"
    steps, n = [], 1

    def add(t):
        nonlocal n
        steps.append(S(n, t)); n += 1

    if cat in ("Signup Bonus", "Bank Bonus", "Deposit Bonus"):
        add(f"Open the {prov} offer page{where} and start your application.")
        add(f"Complete the qualifying action: {action}.")
        if len(acts) > 1:
            add(f"Also satisfy: {acts[1]}.")
        add(f"Keep the account in good standing until payout ({pay or 'per offer terms'}).")
        add(f"Receive your bonus ({pay or 'per offer terms'}).")
    elif cat == "Crypto Learn":
        add(f"Create/verify your {prov} account{where} (KYC where required).")
        add(f"Complete the learning module or quiz: {action}.")
        add(f"Crypto credits to your {prov} account ({pay or 'per program terms'}).")
        add("Withdraw or convert to your own wallet/bank where supported.")
    elif cat == "Cashback":
        add(f"Join the {prov} program{where}.")
        add(f"Activate and complete: {action}.")
        add(f"Cashback tracks and pays out ({pay or 'per program terms'}).")
    elif cat in ("Referral", "App Referral"):
        add(f"Get your referral link in the {prov} app{where}.")
        add(f"Share it; your friend must complete: {action}.")
        add(f"You both get paid ({pay or 'per program terms'}). No self-referrals.")
    elif cat == "Carrier Switch":
        add(f"Check your line is eligible to switch to {prov}{where}.")
        add(f"Start the switch and port your number: {action}.")
        add(f"Rebate/payout arrives ({pay or 'per carrier terms'}).")
    elif cat == "Survey":
        add(f"Sign up for {prov}{where} and complete your profile.")
        add(f"Take surveys as offered: {action}.")
        add(f"Cash out at the minimum threshold ({pay or 'per program terms'}).")
    elif cat == "User Testing":
        add(f"Sign up as a tester on {prov}{where}; complete any screener.")
        add(f"Complete the test session: {action}.")
        add(f"Get paid ({pay or 'per program terms'}).")
    else:
        add(f"Start at {prov}{where}.")
        add(f"Do the qualifying activity: {action}.")
        add(f"Get paid ({pay or 'per terms'}).")
    return steps

fixed = 0
for r in d["routes"]:
    if not r.get("steps"):
        r["steps"] = build(r)
        fixed += 1

DATA.write_text(json.dumps(d, indent=1))
print(f"backfilled steps for {fixed} routes")
