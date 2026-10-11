#!/usr/bin/env python3
"""Deterministic generator for evals/data/labeled/savings-lives.json (doc 07 eval, doc 12 dataset 4).

40 synthetic financial lives (archetype = income band x family shape x city tier) with PLANTED savings
plays of known value (P1 subscriptions, P2 negotiation, P3 fees, P4 rate, P7 debt, P8 structural) and
control rows that look like plays but are not. Every opportunity carries evidence (transaction ids,
bill name or account id) so a checker can verify the play is really present in that life's data.
10 of the 40 lives are "hard": noisy descriptors, pending duplicates, refunds.

Rerun: python3 evals/data/generators/savings_lives.py  (same seed -> byte-identical output).
Identifiers are deliberately fake-looking (no 8+ digit runs) so the privacy lint in validate.cjs passes.
"""
import datetime as dt
import json
import random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "labeled" / "savings-lives.json"
SEED = 20261010
N_LIVES = 40
HARD_IDX = set(range(3, 40, 4))  # 10 hard lives: LIFE-004, 008, ... 040
WINDOW_DAYS = 122  # ~4 months of history

INCOMES = [("$38k", 38000), ("$46k", 46000), ("$58k", 58000), ("$72k", 72000), ("$89k", 89000),
           ("$104k", 104000), ("$135k", 135000), ("$180k", 180000)]
SHAPES = ["single renter", "couple no kids, renting", "family of four, homeowner", "single parent, renting",
          "retiree couple, homeowner", "grad student with roommates", "dual-income no kids, homeowner",
          "young family, renting"]
TIERS = ["tier-1 city", "tier-2 city", "tier-3 city", "suburb"]

# Subscription catalog: key -> (clean descriptor, price_cents, noisy variants)
SUBS = {
    "netflix": ("NETFLIX.COM", 1549, ["CHECKCARD {mmdd} NETFLIX.COM LOS GATOS CA", "NETFLIX.COM 866-579-7172 CA"]),
    "spotify": ("SPOTIFY USA", 1199, ["POS DEBIT SPOTIFY USA NEW YORK NY {mmdd}", "Spotify USA  {ref}"]),
    "apple_music": ("APPLE.COM/BILL APPLE MUSIC", 1099, ["APPLE.COM/BILL 866-712-7753 CA", "APPLE.COM/BILL {ref} CA"]),
    "hulu": ("HULU 877-824-4858 CA", 1799, ["HULU*HULU 877-824-4858", "HLU*HULU {ref} CA"]),
    "disney_plus": ("DISNEY PLUS", 1399, ["DISNEYPLUS 888-905-7888 CA", "DISNEY PLUS  BURBANK CA {mmdd}"]),
    "youtube_premium": ("GOOGLE *YouTube Premium", 1399, ["GOOGLE *YOUTUBEPREMIUM g.co/helppay#", "GOOGLE*YouTube  {ref}"]),
    "icloud": ("APPLE.COM/BILL ICLOUD", 299, ["APPLE.COM/BILL CUPERTINO CA {mmdd}", "APPLE.COM/BILL {ref}"]),
    "audible": ("AUDIBLE*", 1495, ["AMZN DIGITAL*AUDIBLE {ref}", "Audible Inc  {ref}"]),
    "peloton_app": ("PELOTON* APP MEMBERSHIP", 1299, ["PELOTON INTERACTIVE NEW YORK NY", "PELOTON*  {ref}"]),
    "duolingo": ("DUOLINGO", 1299, ["GOOGLE *Duolingo g.co/helppay#", "DUOLINGO {ref} PITTSBURGH PA"]),
    "headspace": ("HEADSPACE INC", 1299, ["HEADSPACE* SANTA MONICA CA", "HEADSPACE {ref}"]),
    "nyt": ("NYTIMES DIGITAL", 1700, ["NYTIMES*NYTIMES NEW YORK NY {mmdd}", "THE NEW YORK TIMES {ref}"]),
    "adobe_cc": ("ADOBE *CREATIVE CLOUD", 5999, ["ADOBE INC SAN JOSE CA {mmdd}", "ADOBE *{ref} 408-536-6000"]),
    "dropbox": ("DROPBOX*", 1199, ["DROPBOX SAN FRANCISCO CA {mmdd}", "DBX*DROPBOX {ref}"]),
    "gym": ("PLANET FITNESS", 2499, ["PF*PLANET FITNESS {ref}", "PLANET FIT CLUB FEES {mmdd}"]),
    "amazon_prime": ("AMAZON PRIME*", 1499, ["AMZN PRIME MEMBERSHIP {ref}", "Amazon Prime*{ref} Amzn.com/bill WA"]),
    "chatgpt": ("OPENAI *CHATGPT SUBSCR", 2000, ["OPENAI CHATGPT SUBSCR {ref}", "OPENAI *{ref} SAN FRANCISCO"]),
    "hbo_max": ("HBO MAX", 1699, ["WARNERMEDIA*HBOMAX {ref}", "MAX*HBO 855-442-6629"]),
    "paramount": ("PARAMOUNT+", 1199, ["CBS PARAMOUNT+ {ref}", "PARAMOUNTPLUS {mmdd}"]),
    "calm": ("CALM.COM", 1499, ["CALM.COM SAN FRANCISCO CA", "CALM* {ref}"]),
}
ANNUAL_PLANS = {"adobe_cc": 59988, "dropbox": 11988, "nyt": 15000, "chatgpt": 20000, "headspace": 6999, "calm": 6999}
UNUSED_CANDIDATES = ["peloton_app", "duolingo", "headspace", "gym", "calm", "nyt"]
RISE_CANDIDATES = {"netflix": 1799, "hulu": 1899, "hbo_max": 1899, "disney_plus": 1599}
FAMILY_PLAN = {"youtube_premium": 2299}  # two individual plans -> one family plan price

# Bills: name -> (descriptor, amount_cents, market_cents, negotiable)
BILLS = {
    "Internet (Xfinity)": ("COMCAST CABLE COMM", 8999, 5500, True),
    "Mobile (Verizon, 2 lines)": ("VZWRLSS*MY VZ VB P", 14000, 9000, True),
    "Mobile (AT&T)": ("ATT* BILL PAYMENT", 9500, 6500, True),
    "Car insurance (Geico)": ("GEICO *AUTO", 16800, 13900, True),
    "Home insurance": ("STATE FARM INSURANCE", 14500, 12500, True),
    "Renters insurance": ("LEMONADE INSURANCE", 2200, 1500, True),
    "Home security monitoring": ("ADT SECURITY SERVICES", 4999, 2999, True),
    "Electric": ("CITY POWER & LIGHT", 11000, 11000, False),
    "Water & sewer": ("MUNICIPAL WATER UTILITY", 4500, 4500, False),
    "Natural gas": ("REGIONAL GAS CO", 6200, 6200, False),
    "Trash pickup": ("WASTE MGMT WM", 2800, 2800, False),
}

COFFEE = [("SQ *BLUE BOTTLE COFFEE", 575, 925), ("STARBUCKS STORE", 445, 1195), ("TST* THE LOCAL ROASTER", 395, 850),
          ("DUNKIN", 310, 790)]
GROCERY = ["TRADER JOE S", "WHOLEFDS", "KROGER", "H-E-B", "SAFEWAY", "COSTCO WHSE"]
GAS = ["SHELL OIL", "CHEVRON", "EXXONMOBIL", "WAWA"]
DINING = ["CHIPOTLE", "DOORDASH*", "UBER EATS", "TST* TACO SPOT", "SWEETGREEN", "PANERA BREAD"]
MISC = ["AMZN Mktp US*", "TARGET", "CVS/PHARMACY", "HOME DEPOT", "UBER *TRIP", "LYFT *RIDE"]


def cents_to_amount(c):
    return round(c / 100, 2)


def ref(rng):
    """Short alphanumeric reference that always contains letters (never an 8+ digit run)."""
    letters = "ABCDEFGHJKLMNPQRSTUVWXYZ"
    return rng.choice(letters) + str(rng.randint(10, 99)) + rng.choice(letters) + rng.choice(letters) + str(rng.randint(1, 9))


def noisy(rng, key, date):
    clean, _, variants = SUBS[key]
    t = rng.choice(variants)
    return t.format(mmdd=date.strftime("%m%d"), ref=ref(rng))


def simulate(debts, extra, order):
    """Monthly simulation: pay minimums on all, extra on the first debt in `order`. Returns (total_interest, months)."""
    bal = {d["id"]: d["balance_cents"] for d in debts}
    apr = {d["id"]: d["apr_bps"] for d in debts}
    mins = {d["id"]: d["min_payment_cents"] for d in debts}
    interest = 0
    months = 0
    while any(b > 0 for b in bal.values()) and months < 600:
        months += 1
        for i in order:
            if bal[i] <= 0:
                continue
            charge = bal[i] * apr[i] // 120000
            interest += charge
            bal[i] += charge
        budget = extra
        for i in order:
            if bal[i] <= 0:
                continue
            pay = min(bal[i], mins[i])
            bal[i] -= pay
        for i in order:
            if bal[i] <= 0:
                continue
            pay = min(bal[i], budget)
            bal[i] -= pay
            budget -= pay
            if budget <= 0:
                break
    return interest, months


def build_life(n, rng):
    life_id = f"LIFE-{n + 1:03d}"
    hard = n in HARD_IDX
    inc_label, income = INCOMES[n % len(INCOMES)]
    shape = SHAPES[(n * 3 + n // 8) % len(SHAPES)]
    tier = TIERS[(n // 2 + n % 3) % len(TIERS)]
    archetype = f"{shape}, {inc_label}, {tier}" + (" (hard)" if hard else "")
    today = dt.date(2026, 9, 12) + dt.timedelta(days=rng.randint(0, 28))
    start = today - dt.timedelta(days=WINDOW_DAYS)
    tier_mult = {"tier-1 city": 1.45, "tier-2 city": 1.1, "tier-3 city": 0.85, "suburb": 0.95}[tier]
    homeowner = "homeowner" in shape
    housing = int(min(income * 0.33 / 12, 3800) * tier_mult * 100)
    net_biweekly = int(income * 0.72 / 26 * 100)

    txns = []
    counter = [0]

    def add(account, date, amount_cents, merchant, pending=False, transfer=False):
        if date > today or date < start:
            return None
        counter[0] += 1
        tid = f"{life_id}-T{counter[0]:04d}"
        row = {"id": tid, "account_id": account, "posted_at": date.isoformat(), "amount": cents_to_amount(amount_cents),
               "merchant_raw": merchant, "is_pending": pending, "is_transfer": transfer}
        txns.append(row)
        return tid

    # ---- accounts ----
    sav_balance = rng.choice([450000, 800000, 1200000, 1850000, 2400000, 3200000]) if income >= 58000 else rng.choice([120000, 260000, 410000])
    chk_balance = rng.randint(90000, 600000)
    has_hysa = rng.random() < 0.35
    accounts = [
        {"id": "chk-main", "kind": "checking", "balance_cents": chk_balance, "apy_bps": 1},
        {"id": "sav-main", "kind": "savings", "balance_cents": sav_balance, "apy_bps": 1},
    ]
    market_hysa_bps = rng.choice([400, 410, 425, 450])
    if has_hysa:
        accounts.append({"id": "hysa-online", "kind": "hysa", "balance_cents": rng.randint(50000, 400000), "apy_bps": market_hysa_bps})
    cc_apr = rng.choice([2299, 2499, 2699, 2899])
    cc_balance = rng.choice([0, 0, 180000, 320000, 540000, 760000])
    accounts.append({"id": "cc-visa", "kind": "credit_card", "balance_cents": cc_balance, "apy_bps": 0, "apr_bps": cc_apr})
    debts = []
    if cc_balance > 0:
        debts.append({"id": "cc-visa", "balance_cents": cc_balance, "apr_bps": cc_apr, "min_payment_cents": max(2500, cc_balance * 2 // 100)})
    n_more_debts = rng.choice([0, 1, 1, 2]) if income >= 46000 else rng.choice([0, 1])
    pool = [("cc-amex", "credit_card", rng.choice([150000, 260000, 410000]), rng.choice([2199, 2399, 2599])),
            ("loan-auto", "loan", rng.choice([1200000, 1650000, 2100000]), rng.choice([649, 749, 899])),
            ("loan-student", "loan", rng.choice([1800000, 2600000, 3900000]), rng.choice([450, 550, 650]))]
    rng.shuffle(pool)
    pool = pool[:n_more_debts]
    if (cc_balance > 0 or n_more_debts) and rng.random() < 0.7:
        # small low-APR promo card: lowest balance but not highest APR, so avalanche and snowball orderings differ
        pool.append(("cc-store", "credit_card", rng.choice([60000, 90000, 140000]), rng.choice([0, 599, 999])))
    for aid, kind, bal, apr in pool:
        accounts.append({"id": aid, "kind": kind, "balance_cents": bal, "apy_bps": 0, "apr_bps": apr})
        minp = max(2500, bal * 2 // 100) if kind == "credit_card" else bal * 23 // 1000
        debts.append({"id": aid, "balance_cents": bal, "apr_bps": apr, "min_payment_cents": minp})

    opps = []
    months = []
    m = dt.date(start.year, start.month, 1)
    while m <= today:
        months.append(m)
        m = dt.date(m.year + (m.month // 12), m.month % 12 + 1, 1)

    def monthly_dates(day):
        out = []
        for mm in months:
            d = dt.date(mm.year, mm.month, min(day, 28))
            if start <= d <= today:
                out.append(d)
        return out

    # ---- payroll (control) ----
    pay_ids = []
    d = start + dt.timedelta(days=rng.randint(0, 13))
    employer = rng.choice(["ACME CORP PAYROLL", "DIRECT DEP PAYROLL NORTHWIND", "GUSTO PAY", "ADP PAYROLL DEPOSIT"])
    while d <= today:
        pay_ids.append(add("chk-main", d, net_biweekly, employer))
        d += dt.timedelta(days=14)
    opps.append({"play": "control", "key": "merchant:payroll", "expected_monthly_cents": 0, "confidence": "high",
                 "subtype": "recurring_income", "evidence_txn_ids": pay_ids, "note": "Recurring credit is income, not a subscription."})

    # ---- housing ----
    for d in monthly_dates(1):
        add("chk-main", d, -housing, "MORTGAGE PMT WELLS FARGO HOME" if homeowner else "ZELLE TO LANDLORD RENT")

    # ---- transfers (control) ----
    tr_ids = [add("chk-main", d, -rng.choice([20000, 30000, 50000]), "ONLINE TRANSFER TO SAV-MAIN", transfer=True) for d in monthly_dates(3)]
    opps.append({"play": "control", "key": "merchant:transfer_to_savings", "expected_monthly_cents": 0, "confidence": "high",
                 "subtype": "internal_transfer", "evidence_txn_ids": [t for t in tr_ids if t], "note": "Internal transfer, not spend."})
    pm_ids = [add("chk-main", d, -rng.choice([15000, 25000, 40000, 60000]), "PAYMENT TO CC-VISA AUTOPAY", transfer=True) for d in monthly_dates(20)]
    opps.append({"play": "control", "key": "merchant:cc_payment", "expected_monthly_cents": 0, "confidence": "high",
                 "subtype": "card_payment_transfer", "evidence_txn_ids": [t for t in pm_ids if t], "note": "Card payment is a transfer, not a bill to negotiate."})

    # ---- bills: 3 negotiable above market + 1-2 at-market controls ----
    neg_names = rng.sample([k for k, v in BILLS.items() if v[3] and (homeowner or k != "Home insurance") and (not homeowner or k != "Renters insurance")], 3)
    ctl_names = rng.sample([k for k, v in BILLS.items() if not v[3]], rng.choice([1, 2]))
    bills = []
    for name in neg_names + ctl_names:
        desc, amt, mkt, neg = BILLS[name]
        amt_j = amt + (rng.randint(-300, 300) if not neg else 0)
        mkt_j = amt_j if not neg else mkt
        bills.append({"name": name, "amount_cents": amt_j, "market_cents": mkt_j})
        day = rng.randint(5, 26)
        ids = [add("chk-main", d, -amt_j, desc if not hard else f"{desc} {ref(rng)}") for d in monthly_dates(day)]
        if neg:
            opps.append({"play": "P2_negotiation", "key": f"bill:{name}", "expected_monthly_cents": amt_j - mkt_j, "confidence": "medium",
                         "subtype": "above_market", "evidence_txn_ids": [t for t in ids if t], "note": f"Bill {amt_j} vs market {mkt_j}."})
        else:
            opps.append({"play": "control", "key": f"bill:{name}", "expected_monthly_cents": 0, "confidence": "high",
                         "subtype": "bill_at_market", "evidence_txn_ids": [t for t in ids if t], "note": "At market rate; nothing to negotiate."})

    # ---- subscriptions ----
    usage = {}
    plan = {"dup_music": rng.random() < 0.75, "rise": rng.random() < 0.7, "trial": rng.random() < 0.65,
            "unused": rng.random() < 0.8, "annual": rng.random() < 0.7, "family": rng.random() < 0.55}
    if n % 5 == 0:  # guarantee coverage on a stride of lives
        plan = {k: True for k in plan}
    chosen = {}
    if plan["dup_music"]:
        chosen["spotify"] = "cc-visa"
        chosen["apple_music"] = rng.choice(["cc-visa", "chk-main"])
    else:
        chosen[rng.choice(["spotify", "apple_music"])] = "cc-visa"
    rise_key = rng.choice(list(RISE_CANDIDATES)) if plan["rise"] else None
    if rise_key:
        chosen[rise_key] = "cc-visa"
    trial_key = "audible" if plan["trial"] else None
    if trial_key:
        chosen[trial_key] = "cc-visa"
    unused_key = rng.choice(UNUSED_CANDIDATES) if plan["unused"] else None
    if unused_key:
        chosen[unused_key] = rng.choice(["cc-visa", "chk-main"])
    annual_key = rng.choice([k for k in ANNUAL_PLANS if k != unused_key]) if plan["annual"] else None
    if annual_key:
        chosen[annual_key] = "cc-visa"
    family_key = "youtube_premium" if plan["family"] else None
    if family_key:
        chosen[family_key] = "cc-visa"
    extras = [k for k in ["icloud", "amazon_prime", "paramount", "disney_plus", "netflix", "hbo_max", "dropbox", "chatgpt"]
              if k not in chosen and k != rise_key and (k not in RISE_CANDIDATES or rng.random() < 0.5)]
    for k in rng.sample(extras, min(len(extras), rng.randint(2, 4))):
        chosen[k] = rng.choice(["cc-visa", "chk-main"])

    sub_day = {k: rng.randint(2, 27) for k in chosen}
    sub_ids = {k: [] for k in chosen}
    for k, acct in chosen.items():
        clean, price, _ = SUBS[k]
        dates = monthly_dates(sub_day[k])
        for i, d in enumerate(dates):
            p = price
            if k == rise_key and i >= len(dates) - 2:
                p = RISE_CANDIDATES[k]
            if k == trial_key and i == 0:
                p = 0
                desc = "AUDIBLE*FREE TRIAL" if not hard else f"AMZN DIGITAL*AUDIBLE TRIAL {ref(rng)}"
            else:
                desc = noisy(rng, k, d) if hard else clean
            pend = (today - d).days <= 2 and rng.random() < 0.6
            sub_ids[k].append(add(acct, d, -p, desc, pending=pend))
            if k == family_key:
                # second household member pays an individual plan on the other account
                other = "chk-main" if acct == "cc-visa" else "cc-visa"
                sub_ids[k].append(add(other, d + dt.timedelta(days=rng.randint(0, 4)), -price,
                                      (noisy(rng, k, d) if hard else clean + " (2)") ))
        sub_ids[k] = [t for t in sub_ids[k] if t]
        usage[f"merchant:{k}"] = None if k == unused_key else (today - dt.timedelta(days=rng.randint(0, 25))).isoformat()
    if plan["dup_music"]:
        opps.append({"play": "P1_subscription", "key": "merchant:apple_music", "expected_monthly_cents": SUBS["apple_music"][1], "confidence": "high",
                     "subtype": "duplicate_service", "pair": ["merchant:spotify", "merchant:apple_music"],
                     "evidence_txn_ids": sub_ids["spotify"] + sub_ids["apple_music"], "note": "Two music streaming services; cancelling either saves its price."})
    if rise_key:
        opps.append({"play": "P1_subscription", "key": f"merchant:{rise_key}", "expected_monthly_cents": RISE_CANDIDATES[rise_key] - SUBS[rise_key][1],
                     "confidence": "high", "subtype": "price_rise", "evidence_txn_ids": sub_ids[rise_key],
                     "note": f"Price rose {SUBS[rise_key][1]} -> {RISE_CANDIDATES[rise_key]} in the last two cycles; value = the increase (downgrade tier)."})
    if trial_key:
        opps.append({"play": "P1_subscription", "key": "merchant:audible", "expected_monthly_cents": SUBS["audible"][1], "confidence": "high",
                     "subtype": "trial_converted", "evidence_txn_ids": sub_ids["audible"], "note": "$0 trial charge followed by full-price charges."})
    if unused_key:
        opps.append({"play": "P1_subscription", "key": f"merchant:{unused_key}", "expected_monthly_cents": SUBS[unused_key][1], "confidence": "medium",
                     "subtype": "unused", "evidence_txn_ids": sub_ids[unused_key], "note": "No usage signal (usage_signals last_used is null)."})
    if annual_key:
        monthly, annual = SUBS[annual_key][1], ANNUAL_PLANS[annual_key]
        opps.append({"play": "P8_structural", "key": f"merchant:{annual_key}", "expected_monthly_cents": monthly - annual // 12, "confidence": "high",
                     "subtype": "annual_pay_discount", "evidence_txn_ids": sub_ids[annual_key],
                     "note": f"Paid {monthly}/mo; annual plan {annual} (see market.annual_plans)."})
    if family_key:
        opps.append({"play": "P8_structural", "key": "merchant:youtube_premium", "expected_monthly_cents": 2 * SUBS["youtube_premium"][1] - FAMILY_PLAN["youtube_premium"],
                     "confidence": "high", "subtype": "family_plan", "evidence_txn_ids": sub_ids["youtube_premium"],
                     "note": "Two individual plans in the household each month; family plan price in market.family_plans."})

    # ---- fees (P3) ----
    fee_events = []
    n_fees = rng.choice([0, 1, 2, 3, 4]) if n % 4 else rng.choice([2, 3, 4])
    fee_kinds = ["overdraft", "atm", "maintenance", "foreign", "late"]
    rng.shuffle(fee_kinds)
    for kind in fee_kinds[:n_fees]:
        if kind == "maintenance":
            ids = [add("chk-main", d, -1200, "MONTHLY SERVICE FEE" if not hard else "MONTHLY MAINTENANCE FEE  CHK") for d in monthly_dates(28)]
            ids = [t for t in ids if t]
            opps.append({"play": "P3_fee", "key": "merchant:monthly_service_fee", "expected_monthly_cents": 1200, "confidence": "high",
                         "subtype": "maintenance_fee", "evidence_txn_ids": ids, "note": "Recurring account fee; waivable or avoidable by switching."})
            continue
        d = start + dt.timedelta(days=rng.randint(5, WINDOW_DAYS - 5))
        if kind == "overdraft":
            add("chk-main", d, -rng.choice([8900, 12450, 21000]), rng.choice(DINING))
            tid = add("chk-main", d, -3500, "OVERDRAFT FEE" if not hard else "OD FEE - INSUFFICIENT FUNDS")
            opps.append({"play": "P3_fee", "key": f"txn:{tid}", "expected_monthly_cents": 3500, "confidence": "high", "subtype": "overdraft_fee",
                         "one_time_cents": 3500, "evidence_txn_ids": [tid], "note": "One-time fee; refund request books once."})
        elif kind == "atm":
            add("chk-main", d, -6000, "ATM WITHDRAWAL 7-ELEVEN")
            tid = add("chk-main", d, -300, "NON-BANK ATM FEE" if not hard else "ATM SURCHARGE  OTHER BANK")
            opps.append({"play": "P3_fee", "key": f"txn:{tid}", "expected_monthly_cents": 300, "confidence": "high", "subtype": "atm_fee",
                         "one_time_cents": 300, "evidence_txn_ids": [tid], "note": "Out-of-network ATM fee."})
        elif kind == "foreign":
            add("cc-visa", d, -14560, "RYANAIR DUBLIN IE")
            tid = add("cc-visa", d, -437, "FOREIGN TRANSACTION FEE" if not hard else "INTL TRANS FEE 3%")
            opps.append({"play": "P3_fee", "key": f"txn:{tid}", "expected_monthly_cents": 437, "confidence": "high", "subtype": "foreign_transaction_fee",
                         "one_time_cents": 437, "evidence_txn_ids": [tid], "note": "Foreign transaction fee on card."})
        elif kind == "late":
            tid = add("cc-visa", d, -2900, "LATE PAYMENT FEE" if not hard else "LATE FEE ASSESSED")
            opps.append({"play": "P3_fee", "key": f"txn:{tid}", "expected_monthly_cents": 2900, "confidence": "high", "subtype": "late_fee",
                         "one_time_cents": 2900, "evidence_txn_ids": [tid], "note": "Late fee; first-time refund usually granted."})
        fee_events.append(kind)

    # ---- P4 rate ----
    if sav_balance >= 400000:
        delta_bps = market_hysa_bps - 1
        opps.append({"play": "P4_rate", "key": "account:sav-main", "expected_monthly_cents": sav_balance * delta_bps // 10000 // 12, "confidence": "high",
                     "subtype": "idle_cash", "evidence_account_id": "sav-main",
                     "note": f"{sav_balance} at 1 bps vs {market_hysa_bps} bps HYSA ({'own hysa-online' if has_hysa else 'market.hysa_apy_bps'})."})
    if cc_balance > 0 and sav_balance >= cc_balance:
        opps.append({"play": "P4_rate", "key": "account:cc-visa", "expected_monthly_cents": cc_balance * cc_apr // 10000 // 12, "confidence": "high",
                     "subtype": "card_accruing_while_cash_idle", "evidence_account_id": "cc-visa",
                     "note": f"Card balance {cc_balance} accruing at {cc_apr} bps while sav-main holds {sav_balance}."})

    # ---- P7 debt avalanche ----
    extra = rng.choice([20000, 30000, 40000])
    if len(debts) >= 2:
        aval = sorted(debts, key=lambda d: -d["apr_bps"])
        snow = sorted(debts, key=lambda d: d["balance_cents"])
        ia, ma = simulate(debts, extra, [d["id"] for d in aval])
        isn, _ = simulate(debts, extra, [d["id"] for d in snow])
        saved = max(0, isn - ia)
        if saved > 0:
            opps.append({"play": "P7_debt", "key": f"debt:{aval[0]['id']}", "expected_monthly_cents": max(1, saved // max(1, ma)), "confidence": "medium",
                         "subtype": "avalanche_ordering", "evidence_debt_ids": [d["id"] for d in aval],
                         "note": f"Avalanche vs lowest-balance-first with {extra}/mo extra: {saved} total interest over {ma} months."})
        else:
            opps.append({"play": "control", "key": f"debt:{aval[0]['id']}", "expected_monthly_cents": 0, "confidence": "high",
                         "subtype": "debt_order_already_optimal", "evidence_debt_ids": [d["id"] for d in aval],
                         "note": "Highest-APR debt is also the smallest balance: reordering saves nothing."})

    # ---- everyday spend + controls ----
    coffee_name, lo, hi = rng.choice(COFFEE)
    coffee_ids = []
    d = start
    while d <= today:
        if rng.random() < 0.45:
            coffee_ids.append(add(rng.choice(["cc-visa", "chk-main"]), d, -rng.randint(lo, hi), coffee_name if not hard else f"{coffee_name} {ref(rng)}",
                                  pending=(today - d).days <= 1))
        d += dt.timedelta(days=rng.randint(1, 4))
    opps.append({"play": "control", "key": "merchant:" + coffee_name.split("*")[-1].strip().lower().replace(" ", "_"), "expected_monthly_cents": 0,
                 "confidence": "high", "subtype": "frequent_variable_spend", "evidence_txn_ids": [t for t in coffee_ids if t],
                 "note": "Frequent but variable-amount coffee purchases are not a subscription."})
    d = start + dt.timedelta(days=rng.randint(10, 60))
    a = add("cc-visa", d, -rng.randint(3000, 9000), "TARGET T-" + str(rng.randint(100, 999)))
    b = add("cc-visa", d, -rng.randint(10000, 18000), "TARGET T-" + str(rng.randint(100, 999)))
    opps.append({"play": "control", "key": "merchant:target", "expected_monthly_cents": 0, "confidence": "high", "subtype": "two_legit_same_day_purchases",
                 "evidence_txn_ids": [a, b], "note": "Two different amounts same day at one merchant: separate purchases, not a duplicate charge."})
    for d in [start + dt.timedelta(days=i) for i in range(0, WINDOW_DAYS, 7)]:
        add(rng.choice(["cc-visa", "chk-main"]), d + dt.timedelta(days=rng.randint(0, 2)), -rng.randint(4500, 21000), rng.choice(GROCERY))
    for d in [start + dt.timedelta(days=i) for i in range(3, WINDOW_DAYS, 13)]:
        add("cc-visa", d, -rng.randint(3200, 7800), rng.choice(GAS))
    for d in [start + dt.timedelta(days=i) for i in range(5, WINDOW_DAYS, 15)]:
        add("cc-visa", d, -rng.randint(1400, 6200), rng.choice(DINING))
    for d in [start + dt.timedelta(days=i) for i in range(9, WINDOW_DAYS, 19)]:
        add("cc-visa", d, -rng.randint(1200, 9900), rng.choice(MISC) + (ref(rng) if "*" in MISC[0] and rng.random() < 0.5 else ""))

    # ---- hard-only noise: pending duplicate, refunds, cancelled-then-refunded subscription ----
    if hard:
        d = today - dt.timedelta(days=rng.randint(0, 2))
        amt = -rng.randint(2800, 7400)
        p1 = add("cc-visa", d, amt, "TST* HARBOR GRILL", pending=True)
        p2 = add("cc-visa", d, amt, "HARBOR GRILL  " + ref(rng), pending=False)
        opps.append({"play": "control", "key": f"txn:{p1}", "expected_monthly_cents": 0, "confidence": "high", "subtype": "pending_duplicate_of_posted",
                     "evidence_txn_ids": [p1, p2], "note": "Pending authorization mirrors the posted charge; not a double charge."})
        d = start + dt.timedelta(days=rng.randint(20, 80))
        ramt = rng.randint(3900, 12900)
        c = add("cc-visa", d, -ramt, "AMZN Mktp US*" + ref(rng))
        r = add("cc-visa", d + dt.timedelta(days=6), ramt, "AMZN Mktp US*" + ref(rng) + " REFUND")
        opps.append({"play": "control", "key": f"txn:{r}", "expected_monthly_cents": 0, "confidence": "high", "subtype": "refund",
                     "evidence_txn_ids": [c, r], "note": "Refund of an earlier purchase; a credit, not income or a fee reversal."})
        d = start + dt.timedelta(days=rng.randint(15, 50))
        k = rng.choice([x for x in ["hulu", "paramount", "calm", "hbo_max", "disney_plus", "dropbox", "duolingo"] if x not in chosen])
        c = add("cc-visa", d, -SUBS[k][1], noisy(rng, k, d))
        r = add("cc-visa", d + dt.timedelta(days=4), SUBS[k][1], noisy(rng, k, d) + " CREDIT")
        opps.append({"play": "control", "key": f"merchant:{k}", "expected_monthly_cents": 0, "confidence": "medium", "subtype": "charged_then_refunded_not_recurring",
                     "evidence_txn_ids": [c, r], "note": "Single charge reversed within days and never recurring; not an active subscription."})

    txns.sort(key=lambda t: (t["posted_at"], t["id"]))
    market = {"hysa_apy_bps": market_hysa_bps, "annual_plans": {f"merchant:{k}": {"monthly_cents": SUBS[k][1], "annual_cents": v} for k, v in ANNUAL_PLANS.items()},
              "family_plans": {f"merchant:{k}": {"individual_cents": SUBS[k][1], "family_cents": v} for k, v in FAMILY_PLAN.items()},
              "debt_extra_payment_cents": extra}
    return {"id": life_id, "archetype": archetype, "hard": hard, "today": today.isoformat(), "accounts": accounts, "transactions": txns,
            "bills": bills, "debts": debts, "usage_signals": usage, "market": market, "opportunities": opps}


def self_check(lives):
    """Every opportunity's evidence must resolve inside its own life; every life has >=60 transactions."""
    for life in lives:
        tids = {t["id"] for t in life["transactions"]}
        aids = {a["id"] for a in life["accounts"]}
        dids = {d["id"] for d in life["debts"]}
        bnames = {b["name"] for b in life["bills"]}
        assert len(life["transactions"]) >= 60, (life["id"], len(life["transactions"]))
        for o in life["opportunities"]:
            kind, _, target = o["key"].partition(":")
            if kind == "txn":
                assert target in tids, (life["id"], o["key"])
            elif kind == "bill":
                assert target in bnames, (life["id"], o["key"])
            elif kind == "account":
                assert target in aids, (life["id"], o["key"])
            elif kind == "debt":
                assert target in dids, (life["id"], o["key"])
            for t in o.get("evidence_txn_ids", []):
                assert t in tids, (life["id"], o["key"], t)
            if o["play"] != "control":
                assert o["expected_monthly_cents"] > 0, (life["id"], o["key"])
            if o["play"] == "P2_negotiation":
                b = next(b for b in life["bills"] if b["name"] == target)
                assert b["amount_cents"] - b["market_cents"] == o["expected_monthly_cents"]


def main():
    rng = random.Random(SEED)
    lives = [build_life(i, rng) for i in range(N_LIVES)]
    self_check(lives)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps({"schema_version": 1, "lives": lives}, indent=1) + "\n")
    from collections import Counter
    plays = Counter(o["play"] for l in lives for o in l["opportunities"])
    print(f"wrote {OUT} lives={len(lives)} hard={sum(l['hard'] for l in lives)} txns={sum(len(l['transactions']) for l in lives)}")
    print(dict(sorted(plays.items())))


if __name__ == "__main__":
    main()
