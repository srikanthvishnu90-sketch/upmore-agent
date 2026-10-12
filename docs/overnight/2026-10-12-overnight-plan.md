# Overnight run, 2026-10-12: the duty list

Owner's ask: a large set of duties, run for 10+ hours without prompting, built bullishly and tested to perfection.
Window: 04:00 to 16:00 UTC. An hourly check-in (a Routine firing into this session) and every finished background build
wake the session; each wake picks the next open duty below. Progress is appended to `claude-progress.txt` and ticked
here. The morning report is the last section.

## The bar every duty clears ("perfect" means all of these, not most)

1. **Red first.** Every behavior gets a test that fails before the code and passes after. Every new module gets at
   least one planted defect (the depth or mutation runner) that its tests must catch; a test that cannot go red is not
   a test.
2. **The whole suite, every commit.** Before any push: `node --test tests/*.cjs`, `deno test -A --no-check tests/edge/`,
   Agent100 103/103, the testing agent `--check` (GREEN, 0 critical), its 12 mutations, the eval harness (RELEASE OK) and
   its 11 mutations, every generator `--check`, corpus and megadoc reports current. Anything touching
   `supabase/migrations` or `tests/db` also runs `bash tests/db/run.sh` locally as postgres (the red run 31 rule).
3. **One commit per push, CI green before the next.** Every commit gets its own CI run (node-ci evidence). A red run is
   fixed before anything else moves.
4. **Adversarial re-read.** Before each push: re-read the diff as a reviewer hunting for the wrong number, the missing
   source line, the silent failure, the path that moves money without a yes.
5. **Numbers from rows, never the model.** Every money statement names its source and as-of time. A missing or stale
   input says so; it never guesses.
6. **Docs follow the code.** A doc the code contradicts is fixed in the same commit and logged in the drift file.
7. **Real terms or none.** An offer, fee, rate or rule shown to a person carries its source URL and the date it was
   checked; a term older than its freshness window is shown as "may have changed: check before acting", never as current.

## Hard stops (reported, never crossed)

- Deploys, migrations on the live project, production credentials, the owner's sign-ins, the $5 order: owner only.
- Anything that moves money, places a trade or touches a live account: not tonight.
- Decision 2 (prediction markets) and decision 3 (crypto) stay OFF. Methods 1's whole **Prediction markets** section
  (14 cards) and **Sportsbook and casino promos** section (15 cards), and the USDC rewards card, are parsed, labeled and
  gated; nothing past the guards is built. The gambling and crypto guards are not touched.
- Standing rules unchanged: one yes per order and per cancellation, the $5 cap, no phone calls, no identity digits, no
  password storage. A method card that needs one of these ("a calling helper", an SSN, a card application) is gated.
- No new paid service or infrastructure.

## Block A: intake (first)

- [x] **A1. Methods 1-3 as spec items.** `docs/methods/` verbatim (done at 04:00), plus `scripts/build-methods.cjs`:
  every `###` card (194: 88 + 74 + 32) becomes an item with a stable id (`M1-BANK-01`), section, what it is, the real
  example, payout, effort, odds, frequency, the three "How Upmore runs it" steps, needs, tags and source URL; every
  field present or the build fails. Gates from the standing rules (as the teardowns): `[Flag]`, decision 2 (the
  prediction-markets section, any Kalshi or Polymarket card), the gambling guard (the sportsbook and casino section),
  decision 3 (crypto), identity digits, phone calls, lending, securities advice (copying funds or Congress, options).
  README per section and per gate, `--check` in CI, tests that pin the counts and the gates.
- [~] **A2.** (teardowns mapped; method cards next) Map methods and teardowns to the owner's capability list.** The teardown map (running) plus the same for the
  194 cards: each card to the capability-list items and registry capabilities it would use, and what Upmore has today.
- [x] **A3. Offer book with freshness.** `packages/domain/8x-offer-book.js` + `packages/offers/*.json`: every term a
  method relies on (prices, windows, caps, rates, rule numbers) as data with `source`, `checked_on` and a freshness
  window by kind (promo 7 days, price 30, federal rule 365). `OfferBook.term(id, today)` returns the value with "checked
  <date>" or a stale flag; nothing reads a raw number from a doc. Tests: stale terms never presented as current; every
  term has a source.

## Block B: merge the four running builds (as each lands)

- [x] B1 balance-aware sends (cb8df6f) (corpus 1.05), B2 saved nicknames + migration (1.06), B3 sell by company name (3.05),
  B4 teardown-to-capability map. For each: read the diff critically (money paths, guards, RLS), rebuild generated files,
  the full bar above, DB suite locally for B2, push alone, wait for green. Triage file entries removed only when the
  corpus example passes offline.

## Block C: money owed and refunds (ungated cards; detectors over the person's own rows, drafts the person sends)

Each is a pure module with its rule table in the offer book, node tests with mock rows, a planted defect, chat wiring
(direct answer or proactive finding), an edge test, and a corpus example. The agent drafts; the person sends; nothing
is filed, sent or paid by Upmore.

- [x] **C1. Airline refunds (DOT).** From flight emails or card rows: cancelled or changed more than 3 hours domestic / 6
  international and declined -> full fare owed; bag over 12 hours domestic (15-30 international) late with a report ->
  bag fee owed; paid extras not delivered (Wi-Fi, seat) -> fee owed. Warns before a voucher is accepted. Tracks the card
  credit 7 business days; drafts the DOT complaint text if late. Involuntary bump compensation table (200% / 400%, caps).
- [x] **C2. Closed-card credit balance (12 CFR 1026.11).** A negative statement balance over $1 -> the written request
  text and the 7-business-day watch.
- [x] **C3. Escrow surplus (12 CFR 1024.17).** From the escrow analysis: surplus of $50 or more owed within 30 days; a
  cushion above one sixth of yearly bills flagged. Request text and the deposit watch.
- [x] **C4. FTC and reissued refunds.** Match charges (e.g. Prime fees) to the FTC refund list kept as dated data; spot
  PayPal, Venmo or Zelle refund notices, check the sender against the official administrator before calling it real,
  and say the expiry date.
- [x] **C5. Price-drop claims.** Target 14 days, Best Buy return window, Costco 30 days: receipts in, current price in
  (fixtures), claim text out with the order number; credit watched on the card. Policy table with exclusions (open box,
  ended sales, Thanksgiving week).
- [ ] **C6. State auto-return and failed-bank deposits.** Official-sender check for state treasurer letters; FDIC
  failed-bank list matched to old bank names (dated data).

## Block D: subscriptions and spending (Methods 3, ungated)

- [x] **D1. Cheaper tier and annual switch.** From the charge amount and a dated price table: ad tier (Netflix $19.99
  -> $8.99), annual plan when billed 10+ months in a row (Peacock, Prime). Yearly saving, the trade-off said plainly.
- [x] **D2. Perk overlap.** Paying for something a plan already includes: carrier plans (T-Mobile Experience Beyond ->
  Netflix with ads, Hulu promo with its end date), Walmart+ (Peacock or Paramount+), card credits (Amex Blue Cash
  Preferred streaming credit). A perks table with sources; "activate the perk, then cancel the paid one" as one card
  per cancellation (one yes each).
- [x] **D3. Rotation rule.** Three or more streaming services at once -> a rotation plan as a per-person toggle; every
  cancel or restart still asks its own yes.
- [ ] **D4. Win-back watch.** After a cancel, offer emails from that service (fixtures) shown with the price and the
  promo end date.
- [x] **D5. Warehouse club math.** 12 months of club spend vs tier fees (Costco $65 / $130, 2% to $1,250): upgrade,
  downgrade or cancel, the break-even shown.
- [x] **D6. Subscribe and Save stack.** Repeat Amazon staples -> five on one date for 15%, the extra saving shown.
- [ ] **D7. Free substitutes.** Library streaming (Kanopy) and store-brand swaps from itemized receipts, as [Read]
  suggestions with the dollar gap.

## Block E: the numbers (owner's capability list section 1, from the person's own rows)

Check each against the capability list first; build only what is not IN_PRODUCT. Each answers in chat with source
and as-of, and shows the math on request.

- [ ] **E1. Safe to spend** until payday, total and per day (bills due before payday subtracted).
- [ ] **E2. Upcoming calendar**: every bill, payday and renewal in the next 30 days.
- [ ] **E3. Runway**: days of cash at the current burn.
- [ ] **E4. Affordability**: "can I afford $X" and, if not, when.
- [ ] **E5. Net worth** over time from account balances (assets minus debts, cards as owed).
- [ ] **E6. 90-day cash flow forecast** with its assumptions listed.
- [ ] **E7. Show the math** for any of the above on request.

## Block F: bonuses and rewards math (Methods 1, the parts that are only math over the person's rows)

Applying, opening accounts and moving money are [Flag] and gated. What can be built is the honest math and tracking.

- [x] **F1. Rotating 5% activation.** A dated quarterly-category table (Chase Freedom Flex Q4: grocery, dining; activate
  by Dec 14; $1,500 cap): remind to activate, track spend toward the cap from card rows.
- [x] **F2. Spend-target tracker** for a card the person already opened: target, deadline, spend so far from rows,
  days left. Read-only.
- [x] **F3. Annual-fee review** (the retention-offer card without the call): fee posted vs benefits actually used from
  rows; the keep / ask / cancel math. Calling stays off; the person asks.
- [ ] **F4. Card-linked offer matcher**: usual merchants vs offers the person pastes or forwards (fixtures).

## Block G: test hardening (runs between builds)

- [x] **G1. Every CLAUDE.md command, verbatim.** (04:30: 30 commands ok; one fix, depth results byte-stable) Run each command line in CLAUDE.md on a clean worktree; any that fails or
  drifted is fixed or the doc corrected, logged in the drift file.
- [x] **G2. Property tests for money math.** (spend; rewards in its depth packet) Cents rounding, period boundaries (month ends, leap day, DST in the person's
  time zone), currency never mixed, for money answers, rent and every Block C-F module.
- [x] **G3. Injection sweep.** (found: merchant text echoed in Upmore's voice; fixed at the source) Merchant names, email bodies and receipts carrying instructions run through each new
  detector; nothing they say becomes an action (data guard, adversarial set extended).
- [ ] **G4. Mutation coverage report.** Each new module listed with its planted defects and the test that catches each.
- [x] **G5. Go-live readiness.** (the pending ledger globs every migration; go-live deploys manual-connect) `go-live.sh` and the pending-migration ledger include every new migration and function
  (manual_connections, standing_payments, nicknames, manual-connect); the go-live test pins them. The owner's one
  command still does everything.
- [ ] **G6. Visual.** Any app change re-runs `node evals/agent/visual.cjs`; baselines change only with a stated reason.

## Block H: teardown features with no gate (after A2 names them)

- [ ] **H0.** Row-level placement for the 887 teardown rows in sections covered only in part (counted PART, not borrowed
  status): give each its own items or "none", so the per-app table reads what each row really is.

- [ ] **H1.** The ungated teardown sections that map to no capability-list item, built in the order the teardowns'
  build-order sections give, one per wake when Blocks C to F are done.

## Check-in protocol (each wake)

1. Bearings: `git log --oneline -5`, CI on the last pushed commit, finished background builds, this file.
2. Red CI or a failed merge first. Then the next open duty in order (A, B as builds land, C, D, E, F; G between).
3. At most four background builds at once; each gets the bar above in its prompt and is merged only after review.
4. Append to `claude-progress.txt` what changed, with commit hashes and test counts.

## Morning report (written at the end of the window)

Benchmarks (which hold, which are owner-gated), every commit pushed with its CI run, test counts start vs end, duties
done / open / blocked with the reason, everything gated and why, and the owner's short list (what needs his hands).
