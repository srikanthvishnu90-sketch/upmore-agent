# Upmore: 15 money-keeping features (Rocket Money-adjacent + grand shopping agent)

**Status:** spec, 2026-09-23. Defines what gets built after the beta.
**Standing rule (already in the app):** Upmore never cancels, files, or moves money for you — you always sign and click. Every feature below is a playbook + draft + reminder, never an action taken on your behalf.

## What's already built (Save tab, live)

- Manual subscription tracking with cancel marking (`save_subscriptions`)
- Renewal tracking (`save_renewals`), claims (`save_claims`), receipts (`save_receipts`), ledger (`save_ledger`)
- Gmail + Plaid connection rows in honest "not live yet" states (need API keys)
- Guide can already talk through cancelling/renegotiating via chat

The 15 below build on that foundation. Nothing here duplicates it.

---

## A. Subscription control

### 1. Subscription Radar
**What:** Every recurring charge you pay, in one list, found automatically.
**How:** Plaid (when live) scans transactions for recurring patterns; Gmail receipts backfill the rest; manual entries merge in, deduped. Each row shows amount, cadence, next charge date, and total yearly cost.
**Needs:** Plaid API keys (user action), Gmail OAuth (user action).
**Honesty:** Only charges actually seen in data are listed — never guessed. "We found 11" means 11 with evidence.
**Build:** medium (Plaid integration + dedupe logic).

### 2. One-Tap Cancel Playbooks
**What:** For each subscription, the verified fastest way to cancel it: deep link to the exact cancellation page, step-by-step taps, and a copy-paste message if you have to talk to support.
**How:** Curated cancel-path database per merchant (like the route catalog: verified, re-checked). Guide answers "cancel my X" with the playbook.
**Needs:** nothing external — content work.
**Honesty:** If a merchant makes you call, we say so and give you the number + script. We never claim one-tap when it's a phone call.
**Build:** content-heavy, app-light. Start with the 50 most-subscribed services.

### 3. Free-Trial Guard
**What:** You tell it (or Gmail finds) a trial; it warns you 3 days and 1 day before the first charge, with the cancel link attached.
**How:** `save_renewals` already stores the date; add alert scheduling + push the cancel playbook into the reminder.
**Needs:** Gmail live for auto-find; manual entry works today.
**Honesty:** Reminders are best-effort — the merchant's billing date is theirs, we show the source date.
**Build:** small (extends existing reminders).

### 4. Renewal Calendar
**What:** Every renewal and annual plan on one timeline with "cancel-before" dates. *(Partially built — `save_renewals` + Guide prep prompts exist.)*
**How:** Finish it: yearly view, cancel-before computed as renewal minus merchant's notice period, one-tap "prep me" that loads the cancel/renegotiate playbook.
**Needs:** nothing external.
**Build:** small.

## B. Pay-less engine

### 5. Cheaper Alternative Finder
**What:** For anything you're paying for, legit cheaper options with real current prices — not sponsored placements.
**How:** Curated alternatives database per category (streaming, phone, insurance, internet, cloud storage…), each with verified price + what's different. "You pay $X for Y. Z does the same for $W — here's the tradeoff."
**Needs:** nothing external — content + price re-verification cadence.
**Honesty:** Prices re-checked, dated, and sourced. Sponsored results are banned from this surface entirely. Tradeoffs stated (fewer screens, ads, etc.).
**Build:** content-heavy; price freshness is the ongoing cost.

### 6. Bill Negotiation Scripts
**What:** Word-for-word scripts + the right number to call to lower internet, phone, and cable bills — the retention-desk playbook.
**How:** Guide flow: "lower my Xfinity bill" → script tailored to your bill + provider, with the retention number and what to say if they say no. Success/failure logged to improve scripts.
**Needs:** nothing external.
**Honesty:** We say what it is: a script that works sometimes, with honest success rates from user reports — never "guaranteed $40 off."
**Build:** small (Guide content + logging).

### 7. Duplicate Detector
**What:** Flags when you're paying twice for the same thing — two music services, cloud storage + phone backup overlap, etc.
**How:** Category tagging on subscriptions; overlap rules (curated pairs + same-category detection). "Spotify + Apple Music = pick one, save $132/yr."
**Needs:** subscription list (manual today, Radar later).
**Honesty:** Only flags true functional overlap, with the differences named so the call is yours.
**Build:** small.

### 8. Usage Audit
**What:** "You're paying for a tier you don't use." Cloud storage at 12% full, premium plan with features never touched.
**How:** For connected or self-reported usage vs. plan limits; downgrade path with the exact clicks.
**Needs:** manual input today; richer with Gmail/Plaid later.
**Honesty:** Based on your actual usage numbers, shown next to the claim.
**Build:** small-medium.

### 9. Annual-vs-Monthly Optimizer
**What:** Shows what you'd save switching each subscription to annual billing — only where the annual plan is real and cheaper.
**How:** Price table per merchant (monthly × 12 vs annual); one list sorted by dollars saved; switch instructions per merchant.
**Needs:** nothing external — price content.
**Honesty:** Only counts if you've kept the sub 12 months straight; says so when you haven't.
**Build:** small.

### 10. Price-Drop Watch
**What:** Paste a product link; we watch it and ping you when the price actually drops — and check whether it's cheaper elsewhere right now.
**How:** Price history per product URL; alert thresholds you set; "buy now elsewhere" check at alert time.
**Needs:** price-checking infra (scheduled checks).
**Honesty:** Alerts on real drops vs. the price *you* saw, not vs. inflated list prices. No fake "was $999" anchoring.
**Build:** medium (scheduler + price fetching).

## C. Grand shopping agent

### 11. Cheapest-Legit Finder
**What:** "Find me the cheapest real X." Compares verified retailers with shipping + tax factored, warns off scam sellers and fake storefronts.
**How:** Guide flow with a retailer allowlist per category; total-landed-cost comparison; scam signals checked (domain age patterns, no-contact sellers, too-good prices).
**Needs:** retailer/scam-signal curation.
**Honesty:** "Cheapest" means cheapest from sellers we'd trust with our own money. If the cheapest is sketchy, we say so and show the cheapest safe one.
**Build:** medium.

### 12. Coupon & Cashback Check
**What:** Before you buy, working coupon codes + cashback options — tested, not a list of dead codes.
**How:** Code database with last-verified dates; dead codes pruned. Cashback rates from real programs, with payout minimums stated.
**Needs:** code verification cadence.
**Honesty:** Shows last-verified date per code. "3 codes, 1 worked last week" beats "50 codes!!"
**Build:** medium (verification is the ongoing cost).

### 13. Refund & Fee Finder
**What:** Scans for bank fees, duplicate charges, and things you can claim back — then drafts the waiver/dispute request for you to send. *(Claims tracking partially built — `save_claims`.)*
**How:** Transaction pattern rules (fees, duplicates) + claim playbooks per bank/merchant with draft messages. You send; we track the outcome.
**Needs:** Plaid live for auto-scan; manual entry works today.
**Honesty:** Drafts, not filings. Success rates reported honestly from user outcomes.
**Build:** medium.

### 14. Spending Leak Alerts
**What:** A new recurring charge appears → you know within a day, with "keep or kill" one tap away (kill = cancel playbook).
**How:** Plaid transaction watch; new-recurring-pattern detection; alert wired to feature #2.
**Needs:** Plaid live. This is the highest-value Plaid unlock.
**Honesty:** Alerts only on high-confidence recurring patterns; "possible" vs "confirmed" labeled.
**Build:** medium (needs Plaid + pattern logic).

### 15. Family-Plan Splitter
**What:** Finds group/family plans for services you pay solo for, does the per-person math, and gives you the invite script.
**How:** Plan-comparison content per service (Spotify Duo/Family, YouTube Premium family, iCloud+, etc.); "you + 2 friends = $X each, save $Y/yr"; invite message drafts.
**Needs:** nothing external — content.
**Honesty:** Only where the plan's own terms allow household/sharing as defined — no ToS-skirting "share with strangers" schemes.
**Build:** small.

---

## Build order (recommended)

1. **Now, no dependencies:** #2 cancel playbooks (top-50), #4 renewal calendar finish, #5 cheaper alternatives (first 5 categories), #6 negotiation scripts, #9 annual optimizer, #15 family-plan splitter — all content, all shippable without new integrations.
2. **After Gmail live:** #3 trial guard auto-find, #10 price-drop watch.
3. **After Plaid live:** #1 radar, #14 leak alerts, #13 fee finder auto-scan, #7/#8 with real data.

## What this deliberately excludes

- Cancelling or negotiating **for** you (consent line: you always click).
- "Savings" from discounts, points, or credits counted as income — same extractable-cash rule as the beta.
- Sponsored "cheaper options." If a placement pays us, it doesn't rank.
- Sharing logins or household-fraud to split plans.
