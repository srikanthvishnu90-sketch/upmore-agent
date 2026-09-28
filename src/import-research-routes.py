#!/usr/bin/env python3
"""Convert 2026-09-25 research reports into upmore-data.json routes.
Sources: research/form-fill-signup-bonuses-2026.md,
         research/small-deposit-bonuses-2026.md,
         research/instant-pay-surveys-2026.md,
         plus hardcoded testing-platform facts from verified research.
"""
import json, re, pathlib

RESEARCH = pathlib.Path("/home/hatch/workspace/upmore/research")
DATA = pathlib.Path("/home/hatch/workspace/upmore/src/data/upmore-data.json")

def parse_amount(s):
    """Extract (min, max) dollars from strings like '$5–$10', 'Up to $200', '$25'."""
    s = (s or "").replace(",", "")
    nums = [float(x) for x in re.findall(r"\$(\d+(?:\.\d+)?)", s)]
    if not nums:
        return None, None
    if re.search(r"up to", s, re.I):
        return nums[0], nums[0]
    if len(nums) >= 2:
        return min(nums), max(nums)
    return nums[0], nums[0]

def parse_table(md, header_re):
    """Parse markdown tables under a section matching header_re. Returns list of dicts."""
    rows = []
    lines = md.split("\n")
    in_section, in_table = False, False
    cols = []
    for ln in lines:
        if re.match(header_re, ln):
            in_section = True
            continue
        if in_section and ln.startswith("## "):
            in_section = False
            in_table = False
            continue
        if not in_section:
            continue
        if ln.strip().startswith("|") and "---" not in ln:
            cells = [c.strip() for c in ln.strip().strip("|").split("|")]
            if not in_table:
                cols = cells
                in_table = True
                continue
            rows.append(dict(zip(cols, cells)))
    return rows

def make_route(rid, category, provider, method, reward, payout_min, payout_max,
               payout_timing, requirements, catches, url="", time_min=5, time_max=30,
               who_qualifies="US adults 18+", cash=True, selection=False):
    return {
        "id": rid,
        "category": category,
        "provider": provider,
        "method": method,
        "what": f"{provider}: {method}. {reward}",
        "reward": reward,
        "requirements": requirements,
        "payout_timing": payout_timing,
        "catches": catches if isinstance(catches, list) else [catches],
        "url": url,
        "affiliate": False,
        "affiliate_note": "",
        "ios_url": "",
        "android_url": "",
        "cash_or_credit": "Cash or usable value" if cash else "Restricted credit",
        "costs_and_unpaid_time": "",
        "demand_side": "",
        "difficulty": "Easy",
        "earn_ratio": "",
        "earnings_class": "Speculative — $0 until withdrawn" if (not cash or selection) else "Count only actual received cash",
        "ease": "Easy",
        "lane": "earn",
        "maximize": "",
        "numeric_basis": "",
        "payout_max": payout_max,
        "payout_min": payout_min,
        "payout_value_note": "",
        "rank": None,
        "repeatable": False,
        "speed": "Fast" if payout_timing and ("instant" in payout_timing.lower() or "minute" in payout_timing.lower() or "24" in payout_timing) else "Standard",
        "status": "researched",
        "steps": "",
        "tier": "verified-2026-09-25",
        "time_max_minutes": time_max,
        "time_min_minutes": time_min,
        "time_to_first": payout_timing,
        "who_pays": provider,
        "who_qualifies": who_qualifies,
        "work_available": "",
        "when_cash_arrives": payout_timing,
        "anyone_can_do": True,
    }

routes = []
seen_providers = set()
rid = 9229

def add(**kw):
    global rid
    key = (kw["provider"].lower(), kw["method"].lower())
    if key in seen_providers:
        return
    seen_providers.add(key)
    routes.append(make_route(f"R{rid}", **kw))
    rid += 1

# ---- 1. Form-fill / signup bonuses ----
ff = (RESEARCH / "form-fill-signup-bonuses-2026.md").read_text()
CATMAP = {
    "A. FINTECH ONBOARDING": "Signup Bonus",
    "B. CRYPTO LEARN-AND-EARN": "Crypto Learn",
    "C. BANK BONUSES": "Bank Bonus",
    "D. CASHBACK APP SIGNUP BONUSES": "Cashback",
    "E. SURVEY PANEL BONUSES": "Survey Bonus",
    "F. REFERRAL PROGRAMS": "Referral",
    "G. PHONE CARRIER SWITCHING": "Carrier Switch",
    "H. INSURANCE QUOTES": "Quote Bonus",
    "I. \"DEPOSIT $X, GET $Y\"": "Deposit Bonus",
}
for sec, cat in CATMAP.items():
    for row in parse_table(ff, r"^## " + re.escape(sec)):
        plat = row.get("Platform", "")
        action = row.get("Action", "")
        cash = row.get("Cash", "")
        paid = row.get("Paid", "")
        catch = row.get("Catch", "")
        pmin, pmax = parse_amount(cash)
        if pmin is None:
            continue
        is_cash = "gift card" not in cash.lower() and "credit" not in cash.lower()
        add(category=cat, provider=plat, method=action[:80],
            reward=f"{cash} for: {action}",
            payout_min=pmin, payout_max=pmax,
            payout_timing=paid, requirements=action,
            catches=[c for c in [catch, "Researched 2026-09-25; confirm current terms in-app before acting."] if c and c != "—"],
            cash=is_cash, time_min=5, time_max=30)

# ---- 2. Deposit bonuses (dedupe against form-fill) ----
db = (RESEARCH / "small-deposit-bonuses-2026.md").read_text()
for row in parse_table(db, r"^## Ranked master list"):
    plat = row.get("Platform", "").split("(")[0].strip()
    action = row.get("Deposit/action", "")
    bonus = row.get("Bonus (withdrawable)", "")
    speed = row.get("Speed", "")
    reqs = row.get("Requirements", "")
    caveat = row.get("Caveat", "")
    pmin, pmax = parse_amount(bonus)
    if pmin is None:
        continue
    is_cash = not any(w in bonus.lower() for w in ["stock", "btc", "crypto", "credit"])
    add(category="Deposit Bonus", provider=plat,
        method=f"Deposit promo: {action[:70]}",
        reward=f"{bonus} for: {action}",
        payout_min=pmin, payout_max=pmax,
        payout_timing=speed, requirements=f"{action}. {reqs}".strip(),
        catches=[c for c in [caveat, "Researched 2026-09-25; confirm current terms in-app."] if c],
        cash=is_cash, time_min=10, time_max=30)

# ---- 3. Instant-pay surveys (strict list) ----
sv = (RESEARCH / "instant-pay-surveys-2026.md").read_text()
survey_rows = [
    ("Surveytime", "$1 flat per completed survey", 1, 1, "Instant — minutes to hours after each survey; no minimum; PayPal", "Complete surveys; phone verification", ["Survey availability is the bottleneck — beer money."]),
    ("Forthright", "$1–$2+ per survey, exact value in invite", 1, 2, "Instant for validated members; PayPal", "Complete surveys; low volume", ["Low survey volume (a few per month).", "Rewards <$10 carry $0.25 fee."]),
    ("1Q", "Up to $0.25 per question", 0.05, 0.25, "Instant PayPal per response", "Answer questions in app", ["Sporadic question availability."]),
    ("Five Surveys", "$5 per 5 completed surveys ($1 effective)", 5, 5, "PayPal within ~30 min of reaching $5", "Complete 5 surveys; 18+", ["High screen-out rate."]),
    ("AttaPoll", "Cents to a few dollars per survey", 0.1, 3, "PayPal within minutes; ~$3 minimum", "Complete surveys", ["Official per-survey range needs confirmation."]),
    ("Qmee", "Cash per survey (range varies)", 0.1, 2, "No-minimum PayPal, reported ~15 min", "Complete surveys", ["Exact timing needs official confirmation."]),
    ("ZoomRx", "$1–$3 per minute (healthcare professionals)", 5, 30, "Immediate via PayPal/Zelle/ACH", "Physician/resident/pharmacist/dentist/PA/NP/nurse", ["Healthcare professionals only.", "Official corroboration needed."]),
    ("InCrowd", "~£6–£10 per 5-min survey (healthcare professionals)", 6, 10, "PayPal within 24 hours", "Doctor/nurse/PA/psychologist/pharmacist/dentist/vet", ["Healthcare professionals only.", "Official corroboration needed."]),
    ("Mindswarms", "$10–$50 per approved video study", 10, 50, "PayPal within 24h of approval", "18+, qualify for study, camera/quiet space", ["Paid only if selected and approved.", "Approval timing needs verification."], True),
]
for s in survey_rows:
    plat, rew, pmin, pmax, timing, reqs, catches = s[0], s[1], s[2], s[3], s[4], s[5], s[6]
    sel = len(s) > 7 and s[7]
    add(category="Survey", provider=plat, method="Paid survey" + (" (video study)" if "Mindswarms" in plat else ""),
        reward=rew, payout_min=pmin, payout_max=pmax, payout_timing=timing,
        requirements=reqs, catches=catches + ["Researched 2026-09-25."],
        cash=True, selection=sel, time_min=5, time_max=45,
        who_qualifies="Varies; see requirements")

# ---- 4. Testing platforms (verified research facts) ----
testing = [
    ("Trymata", "$10 per test", 10, 10, "PayPal, typically weekdays after grading", "Complete usability tests; pass screener", ["Paid only if selected for tests.", "Grading delay."], True),
    ("PlaytestCloud", "$5–$9 per ~15-min test", 5, 9, "Within 3 days", "Playtest mobile games; pass qualification", ["Paid only if selected.", "Game testing only."], True),
    ("BetaTesting.com", "$10–$30 per test", 10, 30, "Within 7 days after test ends", "Complete beta tests; device requirements vary", ["Paid only if selected."], True),
    ("Outlier", "$15–$60/hour AI training", 15, 60, "Weekly", "Pass qualification; AI data work", ["Must pass assessment.", "Work availability varies."], True),
    ("Remotasks", "~$3–$30/hour task-dependent", 3, 30, "Weekly", "Complete data tasks; training required", ["Low beginner rates.", "Task availability varies."], True),
    ("Data Annotation", "$20–$40+/hour", 20, 40, "Weekly", "Pass assessment; AI training work", ["Must pass assessment; selective."], True),
    ("Testlio", "$12–$35/hour", 12, 35, "Weekly", "QA testing; apply and qualify", ["Application required."], True),
    ("GameTester.gg", "~$6–$10/hour", 6, 10, "2–3 working days (medium confidence)", "Game testing", ["Payout timing medium confidence."], True),
]
for t in testing:
    plat, rew, pmin, pmax, timing, reqs, catches, sel = t
    add(category="User Testing", provider=plat, method="Paid testing/task work",
        reward=rew, payout_min=pmin, payout_max=pmax, payout_timing=timing,
        requirements=reqs, catches=catches + ["Researched 2026-09-25."],
        cash=True, selection=sel, time_min=15, time_max=120)

print(f"New routes: {len(routes)} (R9229–R{rid-1})")

d = json.loads(DATA.read_text())
d["routes"].extend(routes)
d["version"] = d.get("version", "") + "+2026-09-25-research"
DATA.write_text(json.dumps(d, ensure_ascii=False))
print(f"Total routes now: {len(d['routes'])}")
