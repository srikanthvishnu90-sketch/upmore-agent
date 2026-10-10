#!/usr/bin/env python3
"""Synthetic financial lives with planted savings plays (Instinct spec docs 07, 12, 13).

Forty lives generated from archetypes (income band x family shape x city tier),
never from a real user. Each life plants savings opportunities of known value
(doc 07 plays P1-P8) and control rows that look like a play but are not, so a
detector's precision is measured as well as its recall. Fee plants use the
descriptor forms packages/domain/41-agent-recovery.js recognises, and the
dataset test proves the plants are detectable. Amounts are dollars with two
decimals in transactions (the schema the app's monitors read) and integer
cents everywhere else.
Run: python3 evals/data/generators/savings-lives.py -> evals/data/labeled/savings-lives.json
"""
import json, random
from pathlib import Path

OUT = Path(__file__).resolve().parents[1] / "labeled" / "savings-lives.json"
TODAY = "2026-10-10"
INCOME = [("low", 3200), ("mid", 6500), ("high", 14000)]
FAMILY = ["single", "couple", "family"]
CITY = ["tier1", "tier2", "tier3"]
MONTHS = ["2026-07", "2026-08", "2026-09"]  # three closed months before today
SUBS = [("NETFLIX.COM", 1549), ("SPOTIFY USA", 1199), ("APPLE.COM/BILL", 299), ("HULU", 1799), ("AMAZON PRIME", 1499), ("DISNEY PLUS", 1399),
        ("GOOGLE *ONE", 299), ("PLANET FIT", 2499), ("NYTIMES", 1700), ("ADOBE *CREATIVE", 5999), ("MICROSOFT*365", 999), ("PELOTON", 4400)]
COFFEE = [475, 525, 610, 450, 580]
GROCERY = ["TRADER JOE S", "KROGER", "COSTCO WHSE", "WHOLEFDS"]
def d(m, day): return f"{m}-{day:02d}"

def life(i, r):
    band, income = INCOME[i % 3]; fam = FAMILY[(i // 3) % 3]; city = CITY[(i // 9) % 3]
    lid = f"LIFE-{i+1:03d}"
    rent = {"tier1": 2400, "tier2": 1650, "tier3": 1100}[city] * {"single": 1, "couple": 1.2, "family": 1.5}[fam]
    rent_cents = int(round(rent * 100))
    plays = set()
    # Which plays this life carries; every life has at least one, and some carry only controls plus one play.
    menu = ["P1", "P2", "P3", "P4", "P7", "P8"]
    k = 1 + (i % 4)
    plays = set(r.sample(menu, k))
    accounts, tx, bills, debts, opps = [], [], [], [], []
    n = [0]
    def add(acct, date, amount_cents, merchant, pending=False, transfer=False):
        n[0] += 1
        tx.append({"id": f"t-{n[0]:03d}", "account_id": acct, "posted_at": date, "amount": round(amount_cents / 100, 2), "merchant_raw": merchant, "is_pending": pending, "is_transfer": transfer})
    # Accounts
    idle = "P4" in plays
    chk_balance = (int(income * 100 * 3.2) if idle else int(income * 100 * 0.9))
    accounts.append({"id": "chk", "kind": "checking", "balance_cents": chk_balance, "apy_bps": 1})
    has_hysa = r.random() < 0.5
    accounts.append({"id": "sav", "kind": "hysa" if has_hysa else "savings", "balance_cents": int(income * 100 * (1.5 if band != "low" else 0.4)), "apy_bps": 425 if has_hysa else 15})
    accounts.append({"id": "cc1", "kind": "credit_card", "balance_cents": 0, "apy_bps": 0, "apr_bps": 2499})
    # Income and rent
    for m in MONTHS:
        add("chk", d(m, 1), int(income * 100 / 2), "PAYROLL DIRECT DEP")
        add("chk", d(m, 15), int(income * 100 / 2), "PAYROLL DIRECT DEP")
        add("chk", d(m, 2), -rent_cents, "RENT PAYMENT PROPERTY MGMT")
        for g in range(4): add("cc1", d(m, 3 + g * 7), -r.choice([6240, 11875, 8930, 14310, 5215]), r.choice(GROCERY))
        for c in range(6): add("cc1", d(m, 2 + c * 4), -COFFEE[(c + m.count("8")) % len(COFFEE)], "STARBUCKS")  # control: repeats but not a subscription
        add("chk", d(m, 5), -int(income * 100 * 0.02), "ONLINE TRANSFER TO SAV", transfer=True)  # control: own transfer
    opps.append({"play": "control", "key": "control:starbucks_not_subscription", "expected_monthly_cents": 0, "confidence": "high", "note": "Daily coffee repeats but is not a subscription; a detector that flags it is wrong."})
    opps.append({"play": "control", "key": "control:own_transfer_not_spend", "expected_monthly_cents": 0, "confidence": "high", "note": "Transfers between the user's own accounts are not savings opportunities."})
    # Subscriptions
    subs = r.sample(SUBS, 3 + (i % 3))
    for name, amt in subs:
        for m in MONTHS: add("cc1", d(m, 9), -amt, name)
    if "P1" in plays:
        # duplicate music services: Spotify plus Apple Music on the same card
        if not any(s[0] == "SPOTIFY USA" for s in subs):
            for m in MONTHS: add("cc1", d(m, 9), -1199, "SPOTIFY USA")
        for m in MONTHS: add("cc1", d(m, 12), -1099, "APPLE.COM/BILL APPLE MUSIC")
        opps.append({"play": "P1_subscription", "key": "duplicate_service:music", "expected_monthly_cents": 1099, "confidence": "high", "note": "Two music services; the cheaper one is the expected monthly saving if one goes."})
        # price increase on Netflix: 15.49 -> 17.99 in the last month
        if any(s[0] == "NETFLIX.COM" for s in subs):
            tx[:] = [t for t in tx if not (t["merchant_raw"] == "NETFLIX.COM" and t["posted_at"].startswith("2026-09"))]
            add("cc1", d("2026-09", 9), -1799, "NETFLIX.COM")
            opps.append({"play": "P1_subscription", "key": "price_increase:NETFLIX.COM", "expected_monthly_cents": 250, "confidence": "high", "note": "Monthly charge rose from $15.49 to $17.99; the delta is the surfaced number, the saving depends on the user's choice."})
    # Bills (P2 when above market)
    internet = 8999 if "P2" in plays else 5999
    bills.append({"name": "Xfinity internet", "amount_cents": internet, "market_cents": 5999})
    for m in MONTHS: add("chk", d(m, 18), -internet, "COMCAST XFINITY")
    bills.append({"name": "Mobile", "amount_cents": 7000 if fam == "single" else 12000, "market_cents": 7000 if fam == "single" else 12000})
    if "P2" in plays:
        opps.append({"play": "P2_negotiation", "key": "bill_above_market:Xfinity internet", "expected_monthly_cents": 3000, "confidence": "medium", "note": "Current public plan at $59.99 for the same speed; negotiation outcomes vary, so medium confidence."})
    # Fees (P3), in the descriptor forms the recovery detector recognises
    if "P3" in plays:
        for m in MONTHS: add("chk", d(m, 28), -1200, "MONTHLY MAINTENANCE FEE")
        add("chk", d("2026-09", 21), -3500, "OVERDRAFT ITEM FEE")
        add("chk", d("2026-08", 11), -350, "NON-NETWORK ATM FEE")
        opps.append({"play": "P3_fee", "key": "fee_recurring:monthly_maintenance", "expected_monthly_cents": 1200, "confidence": "high", "note": "Recurring maintenance fee; waived by a balance or direct-deposit setting or a refund request."})
        opps.append({"play": "P3_fee", "key": "fee_refund:overdraft", "expected_monthly_cents": 0, "one_time_cents": 3500, "confidence": "medium", "note": "One-time refund request; banks often reverse a first overdraft fee when asked."})
        opps.append({"play": "P3_fee", "key": "fee_refund:atm", "expected_monthly_cents": 0, "one_time_cents": 350, "confidence": "low"})
    else:
        add("chk", d("2026-08", 20), 3500, "OVERDRAFT FEE REFUND")  # control: a reversal credit, not a fee
        opps.append({"play": "control", "key": "control:fee_refund_is_credit", "expected_monthly_cents": 0, "confidence": "high", "note": "A fee reversal credit is not a fee; flagging it is a false positive."})
    # Idle cash (P4): excess checking above a two-month buffer, moved to a 4.25 percent HYSA
    if "P4" in plays:
        buffer_cents = int(income * 100 * 2)
        excess = chk_balance - buffer_cents
        monthly = round(excess * (425 - 1) / 10000 / 12)
        opps.append({"play": "P4_rate", "key": "idle_cash:chk_to_hysa", "expected_monthly_cents": int(monthly), "confidence": "high", "note": f"Excess {excess} cents above a two-month buffer at 0.01 percent vs 4.25 percent; arithmetic, not a guess."})
    # Debts (P7)
    if "P7" in plays or band != "high":
        debts.append({"id": "cc1", "balance_cents": 520000, "apr_bps": 2499, "min_payment_cents": 15000})
        debts.append({"id": "cc2", "balance_cents": 310000, "apr_bps": 1899, "min_payment_cents": 9000})
        accounts.append({"id": "cc2", "kind": "credit_card", "balance_cents": 0, "apy_bps": 0, "apr_bps": 1899})
        if "P7" in plays:
            extra = 20000
            opps.append({"play": "P7_debt", "key": "avalanche_vs_snowball:extra_200", "expected_monthly_cents": round(extra * (2499 - 1899) / 10000 / 12), "confidence": "medium", "note": "Directing a $200 extra payment at the 24.99 percent card instead of the 18.99 percent card; first-month interest delta, grows as balances diverge."})
    # Structural (P8): autopay discount on a student loan
    if "P8" in plays:
        debts.append({"id": "loan1", "balance_cents": 2400000, "apr_bps": 650, "min_payment_cents": 27000})
        for m in MONTHS: add("chk", d(m, 20), -27000, "NELNET STUDENT LOAN")
        opps.append({"play": "P8_structural", "key": "autopay_discount:loan1", "expected_monthly_cents": round(2400000 * 25 / 10000 / 12), "confidence": "high", "note": "0.25 percent APR autopay discount on the loan balance."})
    tx.sort(key=lambda t: (t["posted_at"], t["id"]))
    return {"id": lid, "archetype": f"{band}-income {fam} {city}", "today": TODAY, "monthly_income_cents": income * 100, "accounts": accounts, "transactions": tx, "bills": bills, "debts": debts, "opportunities": opps}

def build():
    r = random.Random(7)
    lives = [life(i, r) for i in range(40)]
    return {"schema_version": 1, "generated_by": "evals/data/generators/savings-lives.py", "today": TODAY,
            "source": "synthetic lives from archetypes (income band x family shape x city tier); planted plays with known value plus control rows; no real user data",
            "plays": {"P1_subscription": "doc 07 P1", "P2_negotiation": "doc 07 P2", "P3_fee": "doc 07 P3", "P4_rate": "doc 07 P4", "P7_debt": "doc 07 P7", "P8_structural": "doc 07 P8", "control": "looks like a play, is not"},
            "lives": lives}
if __name__ == "__main__":
    out = build(); OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(out, indent=1) + "\n")
    plays = {}
    for l in out["lives"]:
        for o in l["opportunities"]: plays[o["play"]] = plays.get(o["play"], 0) + 1
    print(f"savings lives: {len(out['lives'])} lives, {sum(len(l['transactions']) for l in out['lives'])} transactions, plays {plays} -> {OUT.relative_to(OUT.parents[3])}")
