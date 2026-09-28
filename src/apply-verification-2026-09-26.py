#!/usr/bin/env python3
"""Apply 2026-09-26 verification sweep dispositions to the catalog."""
import json, pathlib

DATA = pathlib.Path("/home/hatch/workspace/upmore/src/data/upmore-data.json")
d = json.loads(DATA.read_text())
by_id = {r["id"]: r for r in d["routes"]}
VDATE = "2026-09-26"

def note(r, msg):
    tag = f"[verification {VDATE}]"
    r["notes"] = ((r.get("notes") or "") + f" {tag} {msg}").strip()

def unverify(rid, msg):
    r = by_id[rid]
    r["status"] = "unverified"
    note(r, msg)

# 1. RETIRE: Binance.US Learn & Earn — page 404 from two independent fetchers;
#    global program excludes US users.
r = by_id["R0347"]
r["status"] = "retired"
note(r, "Retired: binance.us/en/learn-and-earn returns 404 (confirmed via two independent fetches); "
        "Binance's global Learn & Earn excludes US users.")

# 2. FIX URL: OneForma — provider site thriving; old PDF asset 410'd.
r = by_id["R0215"]
r["url"] = "https://www.oneforma.com"
note(r, "URL updated: old PDF asset returned 410; repointed to live oneforma.com (site verified active).")

# 3. WARN: Scribie — page live but hiring temporarily paused (migration to Scribie.ai).
r = by_id["R0393"]
note(r, "Scribie page is live but announces a TEMPORARY PAUSE on hiring freelance transcribers "
        "during migration to Scribie.ai — do not expect immediate acceptance.")
r["what"] = "PAUSED HIRING (as of 2026-09-26): " + (r.get("what") or "")

# 4. UNVERIFY: Turo — subdomain 404 from two fetchers, method/provider mismatch.
unverify("R0814", "explore.turo.com returns 404 (two independent fetches); route data mismatched — needs re-verification.")

# 5. UNVERIFY: bank/CU promo landing pages returning 404 — campaign likely ended.
bank_404 = {
    "R0079": "M&T cash-bonus page 404 — campaign likely ended.",
    "R4196": "Alliant promo subdomain page 404 — campaign likely ended.",
    "R0956": "Bank of America promotions page 404 — campaign likely ended.",
    "R3782": "Bank of America promotions page 404 — campaign likely ended.",
    "R0630": "PSECU go.psecu.com page 404 — campaign likely ended.",
    "R2413": "PSECU go.psecu.com page 404 — campaign likely ended.",
    "R0562": "Byline Bank welcome page 404 — campaign likely ended.",
    "R1002": "Cyprus CU info page 404 — campaign likely ended.",
    "R2765": "On Tap CU info page 404 — campaign likely ended.",
    "R2294": "joinmycu.com form 404 — campaign likely ended.",
    "R4279": "Liberty Savings Bank value page 404 — campaign likely ended.",
    "R3908": "NGFCU page 404 — campaign likely ended.",
    "R4161": "First U.S. Community CU page 404 — campaign likely ended.",
    "R3370": "Fort Financial page 404 — campaign likely ended.",
}
for rid, msg in bank_404.items():
    unverify(rid, msg)

# 6. UNVERIFY: CDN/asset/landing-page URLs 404 + repair provider names from route text.
asset_404 = {
    "R0568": ("Addition Financial", "$400 new-member bonus landing page 404 — campaign likely ended."),
    "R2251": ("Addition Financial", "$100 referral landing page 404 — campaign likely ended."),
    "R1038": (None, "Disclosure PDF on cdn.mantl.com 404 — offer unconfirmable."),
    "R4800": (None, "Referral disclosure on cdn.mantl.com 404 — offer unconfirmable."),
    "R4820": (None, "Refer-a-friend terms on cdn.mantl.com 404 — offer unconfirmable."),
    "R3568": ("Bank of North Dakota (College SAVE)", "unite529.com asset 404 — BND College SAVE bonus unconfirmable."),
    "R5835": ("Scalable Capital", "ctfassets.net asset 404 — referral reward unconfirmable."),
    "R1141": ("California Teachers Association", "try.calcas.com 404 — $25 gift card auto-quote offer unconfirmable."),
}
for rid, (prov, msg) in asset_404.items():
    if prov:
        by_id[rid]["provider"] = prov
    unverify(rid, msg)

# 7. Repair remaining derivable provider names (routes staying earnable).
by_id["R2294"]["provider"] = "Media City Credit Union"

DATA.write_text(json.dumps(d, indent=1))

# recount
earn = [r for r in d["routes"] if r["status"] not in ("retired", "unverified")]
print("total:", len(d["routes"]), "| earnable:", len(earn))
from collections import Counter
print(dict(Counter(r["status"] for r in d["routes"])))
