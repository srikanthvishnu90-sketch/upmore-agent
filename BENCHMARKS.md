# Upmore — Difficult Benchmarks

Set 2026-09-24 after the honest-product audit. Each benchmark is binary:
pass or fail, with the exact verification command. No partial credit.

## B1 — Zero false monitoring claims
No shipped copy may claim the app watches, monitors, checks, or tracks
anything on the user's behalf on a schedule, unless a real scheduled
producer exists in the repo.
Verify: `grep -ciE "watches this daily|last checked|agent is watching|monitors? (this|your) (daily|account)|we watch|checking daily" index.html` → `0`

## B2 — Exactly 3 tabs, docs match code
Nav contains only home, guide, profile (rendered from the single TABS array —
no static tab markup exists to drift). README's tab list matches the code.
Verify: `grep -o '{ id: "[a-z]*", label' index.html | sort -u` → exactly
home, guide, profile. And: README's stated tab count == 3.

## B3 — Catalog honesty reconciled
No route carries status "verified". Counts agree everywhere (JSON, UI, README):
1990 total · 1667 active in app · 1402 researched · 265 unverified · 323 retired.
UI badge reads "Researched", never "✓ Verified".
Verify: `python3 -c` counts on src/data/upmore-data.json; `grep -c '"verified"'` on
the inlined payload → 0; README numbers match.

## B4 — The ranking function is real and visible
Home's queue is ordered by exactly one function:
`score = dollars_at_stake × confidence × urgency(days_to_deadline) ÷ effort_minutes`.
Every card carries data-dollar, data-conf, data-urg, data-eff, data-score
attributes; the top card's "why" line states the math in plain words.
Verify: node unit test extracts the pure scorer from the built HTML and
checks: (a) higher dollars outranks lower, all else equal; (b) nearer
deadline outranks farther; (c) lower effort outranks higher, all else equal; (d) attributes
present on every rendered card in a headless render.

## B5 — One real detector, on user-entered data only
With no bank connection, the app detects from manually entered subscriptions:
(a) a duplicate merchant added twice → "possible duplicate" card;
(b) an amount raised on an existing sub → "bill spike" card with the old/new
amounts and annualized impact; (c) a user-set renewal date within 14 days →
"renews in N days" card. No fake bank data anywhere in the chain.
Verify: scripted signed-in browser scenarios (beta agents 21–25), each
asserting the exact card appears with the exact numbers entered.

## B6 — Ledger: nothing counts on intent
You tab ledger: totals = Σ(entries) − Σ(reversals), computed live, never
stored as a static number. New users start at $0. Every entry has type
(Received / Avoided / Reduced / Cash flow / Found), amount, note, date. Reversal creates
an offsetting entry — entries are never edited or deleted.
Verify: beta agents add + reverse entries and assert totals; node test on the
totals reducer.

## B7 — No bank-data fabrication path
Shipped app never queries finance_accounts / finance_alerts /
finance_snapshots / finance_goals, and shows no demo balances anywhere.
Verify: `grep -c "finance_accounts\|finance_alerts\|finance_snapshots\|finance_goals" index.html` → `0`.

## B8 — Weight honesty
index.html does not regress past 6.7MB, and qa/ (62MB of research JSON) is
excluded from the Vercel deployment.
Verify: `du -h index.html`; `.vercelignore` contains `qa/`.

## B9 — 25/25 beta agents pass on production
25 independent browser agents, each with its own input/output directory under
qa/beta/agent-NN/, run their scenario against production until every
assertion passes. A failing agent re-runs after the fix; the benchmark is
25/25 green on the same deployed build.

## B10 — Fits a phone, tappable, no dead ends
On a 390px viewport: no horizontal overflow on any tab; every button in the
queue does something (no dead taps); every sheet closes.
Verify: beta agents 1–10 assert viewport overflow == 0 and exercise every
control on their path.

## B11 — Guide $1000 flow behaves as specified
The reserved $1000 money-plan logic was implemented on 2026-09-25 per the
specified behavior: exact first line "Straight answer on $1000: no single
verified route gets you there fast.", Userfeel R3445 recommendation with
$3–$30/test and ~1 week to PayPal, honest math (~100 tests = weeks, not fast),
extractable-cash-only counting, walkthrough offer that resolves to R3445,
and pending-offer clearing on unrelated messages.
Verify: beta agent-13 rerun 2b on production (walkthrough reached STEP 2 OF 4);
`git log --oneline --grep="1000"` shows the implementation commits.

## B12 — Home is one queue
Home shows a single ranked queue — no competing hero + "more moves" +
subscription dock + promo dock sprawl. Search sits at the top of the same
screen (Explore absorbed).
Verify: beta agents count queue sections on Home == 1; search input present.
