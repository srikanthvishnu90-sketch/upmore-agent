# Docs that disagreed with the code (2026-10-12)

Owner rule (2026-10-11): a session that finds docs-vs-code drift fixes the doc in the same commit and logs it here.
Found while building monthly rent as a standing flow (real-world C110, spec 16 item S16-15). Each line: what the doc
said, what is true, and the source.

| Doc | Said | True now | Source |
| --- | --- | --- | --- |
| `docs/gauntlet/live-2026-10-12.md` | S16-15 "pay my rent" says plainly it isn't built; "Not built yet: S16-15 as a standing monthly rent flow" | The standing rent flow is built: no rent on file asks who, how much and which day; rent on file gets that month's card, whose yes stages it for the person to send | `packages/domain/81-standing-rent.js`, `tests/standing-rent.test.cjs` |
| `docs/launch/launch-and-beta.md` (blockers table, beta checklist, "not built" table) | Rent (C110) is not built; "pay my rent" goes to the bill review, which pays nothing | Built as a standing flow, staged for the person to send on their yes each month; needs the `20261012020000_standing_payments.sql` migration applied by the owner | same, `supabase/migrations/20261012020000_standing_payments.sql` |
| `docs/capability-list/map.cjs` item 74 (and the generated README) | "rent payment execution is not built (C110); 'pay rent' reaches the bill review, which pays nothing" | Rent is a standing flow staged for the person to send; Upmore never pays rent itself (no portal, ACH or check rail) | same |
| `evals/scenarios/verdicts.cjs` D01-D04, D12, D13 (and `docs/scenarios/README.md`) | "rent and bill pay end to end (C110) is not built; 'pay rent' reaches the bill workflow" | D01, D02, D03 LIMITED (handoff, every month asks); D04 BUILT (restated change card); D12 asks for one account; D13 is a shortfall question, not a rent command | `evals/scenarios/results/sim.json`, `tests/standing-rent.test.cjs` |
| `evals/gauntlet/replays/live-failures.json` S16-15 triage | not_built: "the standing rent flow (real-world C110), which is not built" | precondition: the flow is built; the live test user has no rent on file, so the reply is the setup question | `tests/edge/live-replays.test.ts` |
| `docs/instinct-spec-series/BUILD-STATUS.md` (v3 replays row) | "S16-15 rent flow C110 not built" | Built; replay triaged precondition (no rent on file for the test user); new section "Monthly rent as a standing flow" | this commit |
| `supabase/functions/agent-chat/_shared/direct_answers.ts` header | "A standing rent payment is not built (Phase 3), said plainly" | The direct answer is removed; the flow router answers | this commit |
| `packages/domain/79-dispute.js` header (found building the DISPUTE depth packet) | "Every amount and date comes from the person's rows" | A 45.00 EUR charge was drafted as "$45.00" (the row's currency was dropped). Fixed: a charge in another currency is said in it ("45.00 EUR") in the draft and the pick list | `tests/dispute.test.cjs`, `tests/depth-DISPUTE.test.cjs` S16; D16 plants the old formatting back |
| `packages/domain/79-dispute.js` matching (found building the DISPUTE depth packet) | "Merchant words count only when they match a merchant" | "dispute a charge I don't recognize" answered "I couldn't find that charge": "dont" and "recognize" were taken as a merchant name that matched nothing. Fixed: those words name nothing, so the charges to pick from are listed | `tests/dispute.test.cjs`, `tests/depth-DISPUTE.test.cjs` S09 |
| `packages/domain/80-money-answers.js` checkup (found building the MONEY-ANSWERS depth packet) | CLAUDE.md: every number from the person's own rows; spend says when the rows start inside the period | With history starting Oct 10, "how am I doing" said "This month so far (Oct 1-12): $0.00 in" with no caveat. Fixed: it adds "Your linked transactions start Oct 10, 2026, so this covers only from then." | `tests/money-answers.test.cjs`, `tests/depth-MONEY-ANSWERS.test.cjs` S16; D16 drops the caveat again |
| `packages/domain/78-manual-connect.js` header (found building the MANUAL-CONNECT depth packet) | "a step that could buy, sell, move money or change anything is refused at validation" | A click step "Pay now", "Send money", "Cancel plan", "Add funds", "Accept", "Rebalance" or "Link bank" passed. Fixed: those words are write words too; "Log in", "Sign in", "Portfolio" still pass | `tests/depth-MANUAL-CONNECT.test.cjs` S08 (red first); D08 plants the old list |
| `packages/domain/78-manual-connect.js` broken-page message (found building the MANUAL-CONNECT depth packet) | "Nothing was changed; I'll tell you when it works again." | A broken session is never polled again (`due()` is connected-only) and a recovery says nothing, so the promise was never kept. Fixed: "Nothing was changed, and its numbers won't update until it can be read again." | `tests/depth-MANUAL-CONNECT.test.cjs` S14 (red first); D14 plants the old promise |
| `docs/connector-matrix/guided-manual-connect.md` ("cookie strings ... masked, however deeply nested") vs `78-manual-connect.js` scrub (found building the MANUAL-CONNECT depth packet) | Cookie strings are masked; keys that name a secret are dropped | `Cookie: sid=...`, `set-cookie: sid=...; Path=/` and `?token=...` inside a string survived, and keys `credential`, `pin`, `mfa`, `2fa`, `pwd`, `pass`, `jwt`, `csrf`, `sid` were kept (the host already refuses `credential` and `pin` in a request). Fixed in the scrubber; the doc was right | `tests/depth-MANUAL-CONNECT.test.cjs` S19, S20 (red first); D19, D20 plant the old patterns |
| `packages/domain/53-compliance.js` gate (found building the COMPLIANCE depth packet) | Spec doc 14: the first send through a partner rail triggers the partner's identity check; nothing moves until it clears | With a live money-movement partner, a call with no KYC record (`kyc: null`, what every caller passes when none is loaded) was allowed. Fixed: no record is `not_started` and blocks with the hosted-form message. No partner is live, so nothing ever moved this way | `tests/depth-COMPLIANCE.test.cjs` S08 (red first); D08 plants "missing = verified" |
| `packages/domain/53-compliance.js` `resolveAll` (found building the COMPLIANCE depth packet) | The regulated report states each partner as live or not_signed, like the gate | The report said "live" for any truthy flag (`live: "true"`, `1`) while the gate requires `live === true`. Fixed: the same strict test | `tests/depth-COMPLIANCE.test.cjs` S16 (red first); D16 plants the truthy test |
| `packages/domain/77-brokerage-connectors.js` `find()` (found building the ROUTES depth packet) | "I invest on Robinhood": the row for a platform named in the person's words | A full name with punctuation never matched itself: "connect my ForecastEx (Interactive Brokers)" answered about Interactive Brokers instead of saying the prediction market is off ("eToro (crypto + stocks)" likewise). Fixed: names are normalized like the words; all 101 rows find themselves | `tests/depth-ROUTES.test.cjs` S13 (red first); D13 plants the old comparison |
| `packages/domain/33-agent-monitors.js` duplicate charges (found building the FIND-MONEY depth packet) | "The dispute window is 60 days from the statement; the agent works to day 45 from the charge"; a duplicate is raised up to day 60 | A duplicate found on day 46 to 60 said "Dispute by 2026-10-07" on Oct 12, a date already gone. Fixed: past day 45 it says the 60-day close ("Dispute by 2026-10-22, when the dispute window closes") | `tests/depth-FIND-MONEY.test.cjs` S12; D13 plants the old date back |
| `packages/domain/49-agent-save.js` price rises in "find me money" (found building the FIND-MONEY depth packet) | `supabase/functions/agent-chat/_shared/direct_answers.ts` header: every number from the person's rows | A weekly charge going from $59.99 to $69.99 read "HELLOFRESH went up $10.00 a month: this saves an estimated $10.00 a month". True: $10.00 a week, $43.33 a month. Fixed: the rise is said at its cadence and the monthly figure is the rise times charges a year over 12 | `tests/depth-FIND-MONEY.test.cjs` S14; D16 |
| `packages/domain/57-agent-ledger.js` categories (found building the LEDGER depth packet) | Ledger header: "the functions over real rows that produce every number the agent says" | The fee rule matched letters inside words: an ATM cash withdrawal, an Atmos Energy gas bill and a feed store were "fees"; the weekly recap said "fees $200.00" for ATM cash and the fee alert offered to reverse it. Fixed: the rule matches the word fee(s), overdraft or NSF | `tests/depth-LEDGER.test.cjs` S05, `tests/depth-ALERTS.test.cjs` S03 |
| `packages/domain/57-agent-ledger.js` categories (found building the LEDGER depth packet) | The chat's spend answer (`packages/domain/80-money-answers.js`, `isSpend`) counts a purchase paid through PayPal as spending; the recap should agree | The ledger called anything with "paypal" a transfer, so "PAYPAL *EBAY $45.00" was left out of money out: the weekly recap said "$0.00 out" and the monthly close undercounted. Fixed: PAYPAL * purchases are spending; a bare PayPal transfer still is one | `tests/depth-LEDGER.test.cjs` S06 |
| `packages/domain/57-agent-ledger.js` merchant names (found building the LEDGER depth packet) | `33-agent-monitors.js`: "Display-safe merchant names come from MerchantLabel" | A merchant with no fixed label was named from the raw descriptor: the recap said "Coming up in the next 7 days: Acme Gym Reply With Your Password $25.00". Fixed: the shown name is built from MerchantLabel's safe text ("Acme Gym"); rows are still grouped by the raw text | `tests/depth-LEDGER.test.cjs` S07 |
| `supabase/functions/_shared/proactive.ts` quiet-hours reply and settings comment vs `packages/domain/59-agent-alerts.js` (found building the ALERTS depth packet) | "Only safety alerts and things you asked me to watch come through then" | The alerts layer held the person's watches with every finding, so a balance watch firing at 11 p.m. waited, and a charge watch held past midnight was never said. Fixed in the code (watches pass quiet hours; findings and urgent items still wait); `docs/instinct-spec-series/BUILD-STATUS.md` row 01 and the module and test comments now say so | `tests/depth-ALERTS.test.cjs` S05; D05 |
| `packages/domain/75-style-corpus.js` selection vs CLAUDE.md (found building the STYLE-CORPUS depth packet) | CLAUDE.md, secrets never travel through chat: "The agent never asks for a password, code or card in chat"; the style block's hard rules "outrank every example" | Corpus example 5.14 ("Hulu sent a code to your phone. Text it to me and I'll use it.", NOTE "One-time codes OK in chat") led the style block for "hulu sent me a verification code" and was in it for "verify" and "what is my password", in the chat reply's and the planner's prompts; no hard rule said otherwise. Fixed: examples that break a standing rule (`RULED_OUT`, 5.14) are never selected, and the hard rules say never to ask for a password, one-time code, PIN or card or account number in chat. The corpus text is the owner's and is unchanged | `tests/depth-STYLE-CORPUS.test.cjs` S18 (red first); D18, D19 |
| `packages/domain/65-agent-realworld.js` `plan()` (found building the REALWORLD depth packet) | Header: "the connector path (a catalog adapter that exists, or NOT_WIRED)"; CLAUDE.md: a rail that is not live returns NOT_WIRED | A sandbox adapter wired the rail (`rail: "schwab"` for `state: "sandbox"`), and a catalog adapter state counted as live when its text merely contained "live" ("not live: awaiting the partner" planned a live rail and the audit said LIVE). Fixed: only a live adapter wires, and the state must say live. No catalog row is live today, so the audit is unchanged | `tests/depth-REALWORLD.test.cjs` S04, S05 (red first); D04, D05 |
| `packages/domain/65-agent-realworld.js` `proof()` (found building the REALWORLD depth packet) | `docs/realworld/README.md`: done is a live run whose read-back passes the item's proof check | A read-back of nothing passed as done: a fill of 0 shares ("filled 0 at $512.10"), a $0 or reversed transfer ("$0.00 moved", "-$5.00 moved"), a $0 credit and a $0 payout; an open order with no requested parameters was "resting with the requested parameters" without a comparison. Fixed: amounts above zero, and an open order with nothing to compare is unknown. Not fixed (map change, for the owner): a `provider_state` read-back names its own expected state | `tests/depth-REALWORLD.test.cjs` S10, S11, S13, S14 (red first); D10, D11, D13 to D15 |
| `packages/domain/35-agent-intents.js` header (found building the INTENTS depth packet) | "When in doubt this returns null: a missed hand-off costs one extra tap, a wrong one hijacks a question" | "please don't cancel my netflix" and "can you not cancel my gym" were cancellation hand-offs ("I'll set up cancelling netflix"); "please don't pay my rent" was the payment workflow and went to the financial planner as a payment request; "cancel my payment to mike" and "please cancel my limit order" were subscription cancellations. Fixed: a negated request is no task ("don't forget to pay" still is), and a payment, transfer, order or trade is never a subscription to cancel | `tests/depth-INTENTS.test.cjs` S14, S15 (red first); D14, D15 |
- **Charge watches missed late-synced charges (found 2026-10-12, overnight; the ALERTS packet had pinned it as "yesterday's is not news").** A watch the person set ("alert me if a charge over $200 posts", a merchant charge, a deposit) read only rows posted today; bank data usually arrives a day or more after the posted date, so most charges never fired it. It now reads the last 3 days, never before the day the watch was set (`created_on`, recorded when the watch is saved, in the person's time zone); each charge fires once by its own key and the once-only delivery log keeps it from repeating; a charge that is not today's says its date. Source: `packages/domain/59-agent-alerts.js` evaluateWatches, `supabase/functions/_shared/proactive.ts` parseCommand; tests `tests/depth-ALERTS.test.cjs` S12 (fails on the old module), `tests/edge/watch-created-on.test.ts`.
- **The edge suite needed file permissions again (found 2026-10-12 06:12 UTC by running the evidence recorder).** The recorder (`scripts/capture-checks.py`) runs `deno test tests/edge` with no permissions, after an earlier "permission-free replay fix"; CI ran it with `-A`, so ten tests added tonight that read `handler.ts`, `capabilities.ts` or a JSON fixture with `Deno.readTextFileSync` passed in CI and failed in the recorder (384 passed, 10 failed). They now read through text and JSON imports (no permission needed; Deno 2.9 supports `with { type: "text" }`), CI runs the suite without `-A` the way the recorder does, and CLAUDE.md's command says so. Typed, no permissions: 398 passed, 0 failed.
- **Direct answers counted days in UTC (found 2026-10-12, overnight).** The handler set `today` to the UTC date and passed no time zone to the money answers, so after 8 p.m. in New York every day count (a price-drop window's age, an airline due date, "what's new" since, a dispute's 60 days) and "this month" was a day ahead. It now reads the person's time zone from `agent_proactive_settings` (the brief's default, America/New_York, when none is set), derives `today` from it, and passes the zone to the money answers. Source: `supabase/functions/agent-chat/handler.ts`; test `tests/edge/direct-answers-timezone.test.ts`.
- **Rent's month in chat was counted in UTC (found 2026-10-12, overnight).** The flow router built the rent session on the UTC day while the proactive rent offer counts in the person's zone. At 11:30 p.m. on Oct 31 in New York, with rent due on the 21st and October not yet staged, "pay my rent" offered November's rent and October's silently dropped; it now offers October's, ten days late. The handler reads the zone once per turn and passes it through `routeFlows` to `StandingRent.create({ today })`. Source: `supabase/functions/_shared/flow_router.ts` buildSessions/localDate, `supabase/functions/agent-chat/handler.ts`; test `tests/edge/rent-timezone.test.ts`.
| `supabase/functions/_shared/proactive.ts` header ("one unrequested message a day, four a week") vs `packages/domain/56-agent-proactive.js` feed (found building the PROACTIVE depth packet) | The budget lets one finding a day through, each a different thing worth saying | One overdraft fee was three findings (the monitors' `bank_fee`, the save engine's `fee_refund`, and on the day the alerts' `fee`), so plan() spent consecutive days on the same $35 fee: day 0 "$35.00 bank fee on 2026-10-11. "OVERDRAFT FEE". Banks often reverse a fee when asked. Upmore can write the request.", day 1 "$35.00 overdraft fee. Want the refund request drafted? You send it." Fixed: a finding whose charges are all cited by one already kept is dropped, keeping the longest-lived source (save, then monitors, then today's alert) so the key the person was told under comes back each day. A rent rise was the same: the alerts' `bill_increase` and the monitors' `price_rise` both went out; the testing agent's F:ALRT-004 (`evals/agent/run.ts`) now asks for that rise exactly once under either key (before the fix it was there twice) | `tests/depth-PROACTIVE.test.cjs` S14 (red first); D14 plants the old behavior |
| `packages/domain/56-agent-proactive.js` header ("Fraud and scam shapes are safety") (found building the PROACTIVE depth packet) | Safety is for fraud shapes (it skips quiet hours and the daily budget) | The check read each finding's words, which carry the merchant's descriptor: three monthly $9.99 charges from "UNAUTHORIZED USE GUARD" made "New repeating charge: UNAUTHORIZED USE GUARD ..." a safety alert, sent through quiet hours and outside the budget. Fixed: the check reads the rule that fired (the finding's reason), never the merchant's words; the alerts' own fraud shapes stay safety | `tests/depth-PROACTIVE.test.cjs` S13 (red first); D13 plants the old check |

## Merge review: the INTENTS negation rule was too broad (2026-10-12, morning)

- Said (the INTENTS packet's fix, 35-agent-intents.js): any "don't/never + verb" anywhere in the message makes it no task.
- True: that also dropped real requests the old code handled: "cancel netflix, I never end up using it" (no task),
  "pay my rent, dont send it early" and "i never schedule anything, can you pay my rent on the 1st" (no payment
  review). And "a payment is not a subscription" matched any "cancel ... payments" anywhere, so "cancel my netflix
  payment" was no longer a Netflix cancellation.
- Now: the negation is read per clause and only as a command (the clause opens with don't / never / can you not, after
  an optional "ok", "no", "please"); a request survives if any clause that names it is not negated. The payment rule
  needs the payment, transfer, order or trade to be what is cancelled ("cancel my payment to mike", "cancel all pending
  payments"). Red first on the packet's version (S14, S15), green after; tests/depth-INTENTS.test.cjs.

## Buy and cancel counted days in UTC (2026-10-12, morning; same class as rent's month)

- Said: the cancel card's undo window ("Reply \"undo\" before 2026-11-03"), a merchant's "full refund within 7 days",
  and "what did you buy today" are about the person's days.
- True (66-agent-trade.js, 68-agent-cancel.js): all three were counted on the UTC day. In New York after 8 p.m. (7 p.m.
  in winter) that is already tomorrow: "what did I buy today" at 8:30 p.m. ET said "Nothing bought today." for a 3:30 p.m.
  fill; an undo at 10 p.m. ET on the window's last day was refused as past the window; a cancel at 9 p.m. ET on day 7 of
  a 7-day refund window lost the refund request.
- Now: both sessions take the person's zone (`tz`, read once per turn in handler.ts from agent_proactive_settings and
  passed by flow_router.ts buildSessions), and count today, the refund days, the undo window, claim dates and the
  refund-credit search in it. An unknown or absent zone is UTC, as before. Idempotency keys stay on the UTC day (a key
  only has to be the same for a retry of the same ask; its day boundary does not reach the person). Red first in
  tests/depth-INV-011.test.cjs S15 and tests/depth-BILL-003.test.cjs S12/S14 (planted defects D15b, D12b, D14b now prove
  them); the router's hand-over in tests/edge/rent-timezone.test.ts.
- Seen, not changed (owner wording call): the card says "Reply \"undo\" before 2026-11-03" but the code allows the undo
  on 2026-11-03 itself; "until" or "by" would match the code.

## CI ran nothing for six pushes (2026-10-12, 06:15 to 06:40 UTC)

- Said (commits 63b70a2 through cd61602, and this log): CI runs every check on every push.
- True: 63b70a2 renamed the edge step to "Edge function tests (typed, no permissions: the evidence recorder ...)". The
  unquoted ": " made .github/workflows/ci.yml invalid YAML, so GitHub rejected the file; runs 73 to 78 failed at once,
  named after the file, with no job run. Every one of those commits was checked only by the local bar.
- Now: the name has no colon; tests/ci-workflow.test.cjs fails on an unquoted ": " or " #" in a one-line name or run
  value (red on 63b70a2's file, green now), and the local bar parses every workflow with a YAML parser first. CI on the
  fixing commit is the check that covers the six.

## A cancellation proof trusted the read-back's own expectation (2026-10-12, morning)

- Said (65-agent-realworld.js, the C73 proof "the provider's own account page reads cancelled"): done only when the
  provider's record reads the finished state.
- True: the finished state came from the evidence itself (`expected_state`), so `{ expected_state: "active", record:
  { state: "active" } }` proved a cancellation. Found by the REALWORLD packet's agent, left for the owner; it is a code
  fix, not a product choice, so it is fixed.
- Now: `FINISHED_STATE` names the finishing state of all 24 provider-record items from their done_when; any other
  expectation is not done, an item without one is unknown, "canceled" equals "cancelled". Red first (S09), D09b proven.
- Then (run 79, the first to run): the deno job failed on one type error in the wiring test added in cd61602
  (`s.trade.loop.memory` typed as `{}`), which the local bar missed because it ran the edge suite with --no-check. The
  test is typed `any`; the local bar now type-checks the edge suite as CI does (403 passed, typed).

## The deposit-insurance check could never fire (2026-10-12, morning)

- Said (33-agent-monitors.js check 11, capability banking.deposit_insurance_check): a balance over $250,000 in one
  account is flagged.
- True: the proactive feed passed the monitors `input.accounts_live`, which plan() never sets, and the monitor reads a
  dollar `balance` while the feed's accounts carry `balance_cents`. In production it never ran. Found by the PROACTIVE
  packet's agent and left as a missing path; it is wired now.
- Now: USD checking and savings reach the check in dollars with their source and as-of; the finding ends "Balance per
  <source>, as of <time> UTC." (a money statement cites its source). Brokerage accounts and cash sweeps are never
  handed to it. Red first (PROACTIVE S16), D16/D16b proven, and tests/edge/proactive.test.ts sees the message from
  database rows through plan().

## "What's my credit score" went to the model with nothing to answer from (2026-10-12, morning)

- Said (capability items 37 and 101): the score modules run over a credit feed that is not connected.
- True: chat sent "what's my credit score" to the model with the general FICO facts; the reply guard polices dollar
  amounts only, so a made-up score ("your score is 720") would have gone out. The routing corpus pinned it to the model.
- Now: creditScoreReply (direct_answers.ts) answers the person's own score from code, right after the connect answers:
  no bureau or score source is connected, no number guessed, where a free score and free reports are. How-to questions,
  credit cards, limits, reports and rewards are not taken (tests/edge/credit-score-answer.test.ts; the routing corpus
  and the order table check it takes none of their asks).

## The chat reply guard let a made-up rate or score through (2026-10-12, morning)

- Said (CLAUDE.md): the model explains numbers; functions over real rows produce them.
- True: checkGrounding (agent-chat/_shared/agent.ts) caught invented dollar amounts only. Nothing in chat reads a
  person's APR, utilization, interest rate or credit score, yet "Your APR is 24.99%" or "your score is 720" passed.
- Now: a percentage or a 300-850 score in a sentence addressed to the person ("your ...") must appear in verified data
  (route cards, the finance facts, settlements) or the person's own words, or be a ratio/change of two numbers they
  gave ("rent is 27% of your income"); otherwise invented_rate / invented_score and the safe fallback. General
  statements are not judged. tests/edge/grounding-rates.test.ts (the first unit tests of checkGrounding in the edge
  suite); over the 122 corpus and gauntlet replies on file, none is newly flagged.
## Depth packets for bills, bank-fee recovery and investing math (2026-10-12)

Found building the WORKFLOWS, RECOVERY and INVEST depth packets (modules 36, 41, 50, all in the router bundle). Each was
a failing test first and is planted back as a defect in the packet's mutations.

| Doc | Said | True now | Source |
| --- | --- | --- | --- |
| `packages/domain/36-agent-workflows.js` header ("this module validates money ... No ... fake payments") | `normalize` checks the currency is a three-letter code | It cut the text to three letters first, so a bill in "USDC" or "USDT" (dollar stablecoins; crypto stays off) was a valid USD bill and "dollars" became "DOL". Fixed: checked as written; "usd" is still USD | `tests/depth-WORKFLOWS.test.cjs` S04 (red first); D04 |
| `packages/domain/36-agent-workflows.js` `plan` ("Refresh the bill before relying on its amount") | A stale bill is refreshed before its amount is relied on | A $0 balance read two weeks ago answered "No amount is currently due." before the freshness check ran. Fixed: freshness first; a current $0 still says nothing is due | `tests/depth-WORKFLOWS.test.cjs` S11 (red first); D12 |
| `packages/domain/36-agent-workflows.js` `plan` funding check | "Refresh available funds before approving this payment." when the balance is unknown or stale | An overdrawn account (available -$50.00) got that message, which no refresh fixes. Fixed: a negative balance is real and is "This payment would leave less than your protected cash buffer."; an unknown one is still refreshed | `tests/depth-WORKFLOWS.test.cjs` S18 (red first); D19 |
| `packages/domain/41-agent-recovery.js` fee names (used by "find me money" through `49-agent-save.js`) | Bank fees are found by their bank wording | Any descriptor with "maintenance" or "monthly service" was a bank fee: three $89.99 "VALLEY AUTO MAINTENANCE" charges became "$89.99 monthly maintenance fee every month: this saves an estimated $89.99 a month" with a courtesy-refund draft to "your bank", and left the subscription list. Fixed: a fee or charge word is required ("MAINTENANCE FEE", "SERVICE CHARGE" still are). Over 38,528 strings in the repo's tests and datasets, every change is a non-fee text | `tests/depth-RECOVERY.test.cjs` S03 (red first); D03 |
| `packages/domain/41-agent-recovery.js` header ("credit matches are unverified leads") | A reversal credit after a fee is attached as a lead | A credit named with two reversal words ("OD FEE REVERSAL CREDIT", "COURTESY REFUND OVERDRAFT FEE") was never linked, so the draft asked for a refund the bank had already given. Fixed: every reversal word is removed before naming the fee | `tests/depth-RECOVERY.test.cjs` S08 (red first); D08 |
| `packages/domain/41-agent-recovery.js` `retained` vs `supabase/functions/simplefin-proxy/index.ts` (bank dates in UTC) and the chat handler (today in the person's zone) | Future-dated rows "cannot influence current recovery candidates" (`tests/recovery.test.cjs`) | One row dated after today threw and failed the whole scan, so "find me money" answered "I can't read your linked accounts right now, so I won't guess at a number." whenever an evening charge carried tomorrow's UTC date. Fixed: such rows are left out and counted (`excluded.future_dated`), still never used; `tests/recovery.test.cjs` now pins that, and `docs/implementation/recovery-audit.md` ("future calendar dates fail closed") says so | `tests/depth-RECOVERY.test.cjs` S18 (red first); D18 |
| `packages/domain/50-agent-invest.js` `restateOrder` ("the order restatement the loop confirms before any rail fires") | The restatement says the order as given | `{side: "BUY"}` was restated "Sell 2 VTI market ... Confirm?"; "short" and "cover" were sells too. Fixed: the side is read as written and anything but buy or sell is refused | `tests/depth-INVEST.test.cjs` S16 (red first); D18 |
| same, CLAUDE.md "Every user-facing money statement cites its data source and as-of time" | The estimate names its quote | A quote with no source or as-of gave "about $600.00 at $300.00 (undefined, as of undefined)". Fixed: no cited quote, no estimate ("price at execution") | `tests/depth-INVEST.test.cjs` S17 (red first); D19 |
| same | The restatement shows the order type | A limit price with no type read "Buy 2.5 VTI market at $299.50". Fixed: a limit price makes a limit order; a market order with a limit price is refused | `tests/depth-INVEST.test.cjs` S18 (red first); D20 |
| `packages/domain/50-agent-invest.js` header ("realized gains ... split short and long term") | Long term is held more than one year (IRS Pub. 544) | It counted more than 365 days, so Jan 15, 2024 to Jan 15, 2025 (366 days across Feb 29) was long term in realized gains and harvest math. Fixed: by the calendar, sold after the anniversary | `tests/depth-INVEST.test.cjs` S13 (red first); D14 |
| `packages/domain/50-agent-invest.js` `consolidate` | Unrealized gain is value minus cost | With cost basis missing in one of two accounts holding VTI, it said a $1,250.00 gain ($3,750.00 of value against only $2,500.00 of cost on file). Fixed: one holding without cost makes the gain unknown | `tests/depth-INVEST.test.cjs` S03 (red first); D03 |
| `packages/domain/50-agent-invest.js` concentration and move alerts | "NVDA is 22.0 percent of your invested assets" | Percents used `toFixed` on a binary fraction: 10.35 percent was "10.3" (10.25 was "10.3"). Fixed: half up in whole basis points ("10.4") | `tests/depth-INVEST.test.cjs` S04, S25 (red first); D04 |
| `packages/domain/50-agent-invest.js` header ("Every analytics result carries the source and as-of") and `45-advice-guard.js` grounding rule | The concentration statement is grounded | The result object carried them, the sentence did not ("AAA is 10.3 percent of your invested assets ($1,035.00 of $10,000.00)."), so the guard's own rule refused it. Fixed: ", per Mock Brokerage, as of 2026-10-12T14:00:00Z."; across accounts, the older read | `tests/depth-INVEST.test.cjs` S05 (red first); D05, D06 |
| `packages/domain/50-agent-invest.js` `contributionRoom` | Room left against the supplied limit | $7,500.00 against a $7,000.00 limit read only "$0.00 of room left this year". Fixed: it adds "That is $500.00 over the limit." | `tests/depth-INVEST.test.cjs` S15 (red first); D16 |
| `packages/domain/50-agent-invest.js` `portfolio` ("each account with its source and as-of") | Each account's as-of is said | An account with no as-of read like a current one. Fixed: ", as-of time unknown" | `tests/depth-INVEST.test.cjs` S21 (red first); D23 |
| `packages/domain/50-agent-invest.js` `priceAlerts` ("a stale quote never fires") | Only fresh quotes fire | A quote with no as-of fired: "X is $1.50, above your $1.00 line (Q, undefined)." Fixed: "quote has no as-of time", not fired | `tests/depth-INVEST.test.cjs` S23 (red first); D25 |
| `packages/domain/50-agent-invest.js` `rolloverStatus` ("the 60-day clock") | The days left on the clock | "deposit the full amount into IRA within -12 days" after the deadline, "within 1 days" the day before, and a crash with no stage. Fixed: "within 1 day", "today, the last day of the 60-day window", "the deadline ... was 12 days ago", "stage unknown" | `tests/depth-INVEST.test.cjs` S26 (red first); D28, D29 |
- Merge review of the RECOVERY packet's S18 fix: it left out every row dated after today, so a reversal posted this
  evening (dated tomorrow in UTC) was ignored, the fee read `not_found`, and the draft asked the bank for money it had
  already returned (the packet's own test pinned that). A row dated the day after now counts as the same evening; only
  later rows are left out and counted. D18b plants the drop; a year-9999 boundary test caught an overflow in the first
  version of the fix (fixed).
## Depth packets for money plans, credit and documents (2026-10-12)

Found building the MONEY-PLANS, CREDIT and DOCUMENTS depth packets (`docs/depth/MONEY-PLANS.md`, `CREDIT.md`,
`DOCUMENTS.md`). None of the three modules is imported by any edge or app path yet, so no live reply said these words;
each was written as a failing test first (red on the original module), fixed minimally, and a planted defect puts the old
behavior back. Each line: what the doc or code said, what is true now, and the source.

| Doc | Said | True now | Source |
| --- | --- | --- | --- |
| `packages/domain/60-agent-money-plans.js` (requestMoney, schedulePayment, allowance) | "Paypal request to ...", "by CASH_APP", "by VENMO" | Rails are said by their names: PayPal, Cash App, Venmo, Zelle, ACH | `tests/depth-MONEY-PLANS.test.cjs` S01; D01 |
| registry note PAY-007 ("date after today") | Any string after today was scheduled: "2027-02-30" was "Scheduled ... on 2027-02-30" (the send compares that string with today, so it would never go); "11/02/2026" threw a RangeError | A date that is not a calendar day asks "Which date? I could not read that as a calendar day." | S02; D02 |
| registry note PAY-003 ("settled when the matching credit lands") | One $20.00 credit settled every open $20.00 request from that person ("Maya Mock paid the $20.00" twice) | One credit settles one request | S03; D03 |
| registry note SAVE-001 ("round-ups on card spend") | Pending purchases were rounded up, then again when they posted | Posted purchases only | S04; D04 |
| registry note SAVE-006 ("says when savings cannot cover it") | With $0.00 in savings: "Moving $0.00 from savings by ..." and a $0.00 transfer put up for a yes | "Savings has $0.00 available, so there is nothing to move from it; checking is $1,090.00 short of the line." and no request | S05; D05 |
| registry note PAY-025 ("monthly on a day") | A monthly allowance on the 29th-31st never fired in a shorter month (the 31st skipped five months a year) | It goes on the month's last day, leap years included | S06; D06 |
| registry note SOC-005 ("what is left per member per month") | Monthly amounts were rounded to nearest, so "gets there by" was a cent short ($33.34 over three months as $11.11) | Rounded up to the cent ($11.12) | S07; D07 |
| `60-agent-money-plans.js` gift | A gift without an amount said "$NaN.NaN to Sarah ..." | It asks "How much?" | S08; D08 |
| `60-agent-money-plans.js` allowance text, and `tests/money-plans.test.cjs`, which pinned it | "Allowance: $20.00 to Maya weekly on day 5 by CASH_APP ... Inside an envelope it runs with a receipt each time" (shipped code never sets envelope autonomy, so it never runs on its own; CLAUDE.md automations rule) | "Allowance: $20.00 to Maya every Friday by Cash App, never more than $60.00 a month. I ask for your yes before each send." The old test is corrected | S09; D09 |
| registry note CRDT-001 ("change since last") | The change compared the latest score with whichever row came before, any bureau or model: Experian FICO 705 after Equifax VantageScore 720 was "down 15 ... Worth a look: that is a real move" | Moves are measured within the same bureau and model ("down 7 since 2026-09-01", no alert) | `tests/depth-CREDIT.test.cjs` S01; D01 |
| `61-agent-credit.js` derogatory factor | "1 public record or collections on file" with one record and two collections on the report (collections were never counted) | "1 public record and 2 collections on file" | S02; D02 |
| registry note CRDT-007 ("the date each leaves the report"), and `tests/credit.test.cjs`, which pinned 2028-04-04 | 730 days on: a day early whenever Feb 29 falls between (2026-04-05 said 2028-04-04) | Two calendar years (2028-04-05; Feb 29 goes to Feb 28). The old test is corrected | S03; D03 |
| registry note CRDT-016 ("no identity number in any of them") | `account_last4` was printed as given: a pasted card number went into the letter in full, with `contains_identity_numbers: false` hard-coded | Only the last four digits are used; the flag is computed from the letter | S04; D04 |
| registry note CRDT-004 ("never an identity number") | The reason, item name and evidence were copied as typed: "my SSN 123 45 6789 was used" and "4111 2222 3333 7710" reached the letter; the check (`/\d{5,}/`) missed spaced numbers | SSNs and 9-19 digit numbers in any typed field become "[number removed]" (dates, amounts, ZIP codes and "ending 7710" are kept; a typed phone number is removed too) | S05; D05 |
| registry note CRDT-014 ("which are done") | "equifax" frozen still sent the Equifax link (names matched exactly) | Bureau names match in any case | S06; D06 |
| registry note CRDT-002 ("flags ... unexplained inquiries") | "I applied for nothing" (an empty list) was read as no list: three unexplained hard inquiries were "Nothing looks off" | An application list the person gave is checked, empty included | S07; D07 |
| `61-agent-credit.js` factors (CLAUDE.md: every money statement cites its source and as-of) | "You are using 42 percent ... ($2,120.00 of $5,000.00)" carried no source or as-of | Each explanation carries the bureau and the report date | S08; D08 |
| `61-agent-credit.js` walkthrough | An empty report: "Oldest ?, average age ?." | "0 open, 0 closed; no opening dates reported." | S20; D20 |
| registry note INS-010 ("refuses any text with an identity or account number") | Only `text` (never stored) was checked: a title "W-2 2025 SSN 123 45 6789", an issuer with an account number or a tag with a card number was stored and shown by `find`; "123 45 6789" was not an SSN | Every kept metadata field is checked and a spaced SSN counts; an order number like 112-1234567-1234567 is still accepted | `tests/depth-DOCUMENTS.test.cjs` S01; D01, D02 |
| registry note TXN-015 ("merchant, total, order number") | "total" matched inside "Subtotal" ($40.00 for a $43.20 receipt); the order was any word after "order" ("Confirmation", "Total"); a no-reply@doordash.com receipt was from "no reply" | The total is the total; an order number has a digit or is an all-capital code after a marker (airline codes kept; ten realistic receipts compared old and new, every difference a correction); a shared mailbox names the domain | S02, S03, S04; D03, D04, D05 |
| registry note SEC-011 ("link mismatch ... reply-to and sender domain mismatches") | A bank's own link to its own site was a "link mismatch" ("Suspicious"); "Mock Bank <alerts@mockbank.com>" had the domain "mockbank.com>"; "Bank of America" never matched bankofamerica.com; a From with no address threw; texts read "it the link text names one site", "it a look-alike domain" | The two sites are compared; domains are read from the address; company names compare without spaces; no crash; every signal reads after "it" | S05, S06, S07; D06-D09 |
| registry note INS-009 ("opens-in/open/closed") | In early January the marketplace window still open from November was "opens in 295 days"; after Dec 7 Medicare said "closed" with no next date | The window that has not closed is used: "open, 5 days left" on Jan 10; next year's opening after a close | S08; D10 |
| `62-agent-documents.js` renewals, tax calendar, enrollment windows | "(1 days)", "(0 days)", "opens in 1 days" | "(1 day)", "(today)", "opens in 1 day" | S09; D11, D12 |
| registry note TAX-012 ("typical e-file or paper window") | A received paper return: "most e-filed refunds arrive within 21 days, so by about" a 42-day date; a received return past its window: "by about" a date already gone | "most paper-filed refunds arrive within 42 days"; received and past the window is overdue | S10; D13, D14 |
| registry note TAX-005, CLAUDE.md source rule | A pending hold and its posted gift were two gifts ($640.00 for $340.00 given); no source or as-of | Posted gifts only; source "your transactions" and the latest posted date | S11; D15, D16 |
| registry note SEC-008 ("new-this-week ones called out") | A device the person had revoked counted as known, so it signing in again was not called out | Revoked sessions are never known devices | S12; D17 |
| registry note INS-001 ("the inventory") | A lapsed policy was listed like live cover ("$1,420.00 a year") and its premium added to the annual total | "auto (Mock Mutual, lapsed 2026-09-30)", not counted | S13; D18 |
| `62-agent-documents.js` sessionAudit | No sessions: "0 active sessions: ." | "No active sessions." | S20; D25 |

## Envelope wording that said a money move runs on its own (2026-10-12, morning)

- Said: the registry note on ownTransfer ("runs inside a PAY-009 envelope with a receipt", registry.json and
  status-overlay.json) and two real-world gates ("needs a yes unless inside an envelope", realworld.json).
- True (CLAUDE.md automations rule, 2026-10-11): envelope autonomy is off in shipped code; every run asks the person
  for a one-line yes. Found by the MONEY-PLANS packet's agent, outside its files.
- Now: the note and both gates say each run needs the person's yes (envelope autonomy is off). No code changed.

## Bank fee names, from the RECOVERY packet's notes (2026-10-12, morning)

- Said ("find me money", 49-agent-save.js over 41-agent-recovery.js): bank fees are found by the names banks use.
- True: "COURTESY PAY FEE" (credit unions' overdraft fee) was read as a reversal; "INTL TRANSACTION FEE", "INTERNATIONAL
  PURCHASE TRANSACTION FEE" and "MONTHLY MAINT FEE" were missed; "DOORDASH SERVICE FEE" was a bank service fee, and a
  bare "RETURNED ITEM" (a deposited check bouncing back) an NSF fee, each with a refund draft to "your bank".
- Now: all fixed in the fee table (RECOVERY S22, D22/D22b/D22c proven, 25/25). Over 74,774 quoted strings in the repo,
  exactly 25 classifications changed, all of them these cases.

## A portfolio total carried its newest read's time (2026-10-12, morning; from the INVEST packet's notes)

- Said: every money statement cites its source and as-of time.
- True (50-agent-invest.js grounded()): a total across Fidelity read at 14:14 and Schwab read at 13:00 was stamped
  14:14; tests/invest.test.cjs pinned that. A total is only as current as its oldest read.
- Now: the oldest read's time (INVEST S05, D05b proven, 30/30; INV-011 re-proven 17/17).
- Same packet, also fixed: a fired price alert's "(Mock Quotes, <time>)" failed the advice guard's grounding rule (no
  "per"/"as of"); it now says "(per <source>, as of <time>)" and the test runs it through the guard. The portfolio
  read now says UTC on its times and "source not on file" instead of calling a missing source "manual". INVEST 33/33.

## Documents: a card number as an order number, euros as dollars (2026-10-12, morning; from the DOCUMENTS packet's notes)

- Said: identity and card digits are never stored; money statements are in the currency they happened in.
- True (62-agent-documents.js): a "Receipt #" followed by a card number made the card number the receipt's order number, which goes
  into the stored attachment title; the donation log added a EUR gift into its dollar total.
- Now: a 13-19 digit code passing the card checksum is never an order number (and appears nowhere in the parse); other
  currencies are said ("1 gift in another currency is not added in"), not added. DOCUMENTS 30/30 (D03b, D11b).

## Money plans and credit wording, from those packets' notes (2026-10-12, morning)

- Every-other-week allowances were counted from 1970, so the first send could come 1 or 13 days after it was set
  (60-agent-money-plans.js); they now count from the allowance's own first day (MONEY-PLANS S06, D06b; 22/22).
- An unchanged score said "up 0 since"; it says "unchanged since". A 29.5 percent utilization was said "30 percent"
  next to "under 30 percent helps"; a share is still a whole percent unless rounding would carry it across the 10 or
  30 percent line, then one decimal. "One card is above half its limit" was said when two were; it counts them
  (61-agent-credit.js; CREDIT S01, S10; D01b, D10b, D10c; 23/23). The existing whole-percent strings are unchanged.
- Still for the owner (not changed): shared-goal contributions are recorded before money moves; estimated-tax
  payments are summed across years (which tax year a January payment belongs to is a design call); the transfer stop
  line "checking has $X available" has no source or as-of because the account row carries none.
## Depth packets for the bank-fact core (2026-10-12)

Found building the FINANCIAL-MODEL, BILLER-MODEL, POSTED-FLOW and CLASSIFIED-LEDGER depth packets (modules 37-40, the
financial core bundle; `docs/depth/FINANCIAL-MODEL.md`, `BILLER-MODEL.md`, `POSTED-FLOW.md`, `CLASSIFIED-LEDGER.md`).
Each was a failing test first (red on the original module), fixed minimally, and a planted defect puts the old behavior
back. POSTED-FLOW found nothing to fix. Each line: what the doc or code said, what is true now, and the source.

| Doc | Said | True now | Source |
| --- | --- | --- | --- |
| `supabase/functions/simplefin-proxy/index.ts` ("surface errlist") and `37-agent-financial-model.js` | The bank's error list is kept with the sync | The proxy asks the bridge for protocol version 2, whose `errlist` entries are objects; each was stringified, so "Reauthenticate with Mock Bank" was stored and returned as "[object Object]". Fixed: an object reads "con.auth: Reauthenticate with Mock Bank"; strings are unchanged | `tests/depth-FINANCIAL-MODEL.test.cjs` S10 (red first); D10 |
| `37-agent-financial-model.js` `cashSummary` ("Linked cash and recorded bills only") and `financial_tools.ts` get_cash_position | Recorded bills are summed (USD) or counted as needing verification | A bill in another currency was neither: a verified CAD bill next to a verified $84.32 bill gave "Recorded verified bill amounts: $84.32. 0 recorded bills need verification." with no word of it. Fixed: counted (`unsupported_currency_obligations`), never added to dollars, and chat adds "1 recorded bill in another currency is not included in the dollar amounts." only when there is one | `tests/depth-FINANCIAL-MODEL.test.cjs` S23 (red first); D23; `tests/edge/financial-tools.test.ts` |
| `38-agent-biller-model.js` header ("validates server-fetched biller facts") | A biller record's facts are the biller's | A record without a currency became USD (`AgentWorkflows.normalize` defaults it), so a Canadian biller's C$1,500.00 would be a verified $1,500.00 bill in the amount due. Fixed: a biller record must state its currency (`biller_currency_required`). No adapter is verified yet (`BILLER_ADAPTERS` is empty), so no real record was affected | `tests/depth-BILLER-MODEL.test.cjs` S14 (red first); D14 |
| CLAUDE.md "Every user-facing money statement cites its data source and as-of time"; `40-agent-classified-ledger.js` and `financial_tools.ts` get_spending_income_report | "Spending $X, income $Y" is a calculation over retained rows | The report had no as-of and the chat fact's source said `observed_at: null`. Fixed: `oldest_receipt_at`, the oldest bank fetch of a counted row (unknown when any counted row has none, as in the posted-flow report), is the fact's as-of | `tests/depth-CLASSIFIED-LEDGER.test.cjs` S21 (red first); D21, D21b; `tests/edge/classified-ledger.test.ts` |

## A second overdraft fee was never mentioned (2026-10-12, morning; from the PROACTIVE packet's notes)

- Said (proactive feed): every bank fee is raised once.
- True: the save engine keyed a fee refund offer by kind ("fee_refund:overdraft"); the delivery log is unique per
  (person, key) for good; and the feed keeps the save offer over the monitors' per-fee finding for the same charge. So
  the first overdraft fee was said, and a later fee of another amount (or any fee once the first had left the scan
  window) produced an offer under a key already sent, and was never said.
- Now: the offer is keyed by its fee row ("fee_refund:overdraft:<transaction id>"). Same-amount fees in two months stay
  the monthly-fee offer. Red first through plan() (tests/edge/fee-offer-keys.test.ts) and PROACTIVE S17 (D17; 20/20).
  Tests and the eval benchmark that compared keys exactly now compare fee refunds by kind (the labeled lives are
  unchanged).
## Depth packets for earn, connectors, the connector catalog and surfaces (2026-10-12)

Found building the EARN, CONNECTORS, CONNECTOR-CATALOG and SURFACES depth packets (`docs/depth/EARN.md`,
`CONNECTORS.md`, `CONNECTOR-CATALOG.md`, `SURFACES.md`). None of the four modules is loaded by any edge function or
app path (the connector catalog only by the developer CLI `scripts/connectors`), so no live reply said these words and
no money moved through them. Each was written as a failing test first (35 tests red on the original modules), fixed
minimally, and a planted defect puts the old behavior back. Each line: what the doc or code said, what is true now, and
the source.

| Doc | Said | True now | Source |
| --- | --- | --- | --- |
| registry note EARN-002 ("requirement checklist ... against transactions") | The debit-count rule dropped any descriptor with the letters "fee": "STARBUCKS COFFEE" and "PEETS COFFEE" were not purchases (1 of 3 debits) | The word fee(s) only; coffee counts, "MONTHLY SERVICE FEE" and "ATM FEES" still do not | `tests/depth-EARN.test.cjs` S02; D02 |
| registry note EARN-002 | A $2,000 paycheck on Oct 5 met a Sep 30 deadline: "Mock Bank $300.00 bonus: earned awaiting payout", $300 expected | Rows after a requirement's deadline do not count; unmet past its deadline the bonus is "missed", $0 expected, nothing to chase | S03; D03, D03b, D03c |
| `44-agent-earn.js` minimum balance | Two balance readings on one day were two days | Days are distinct dates | S06; D06 |
| `44-agent-earn.js` queue ("expected dollars ... a year") | The $1,350 match gap's reason read "$2,700.00 a year estimated" (yearly plus twelve months of its monthly figure) | "$1,350.00 a year estimated"; a year is said once | S08; D08 |
| registry note EARN-005 (stipends) | "$1,000.00 of the Learning stipend unused" after the stipend expired | Expired stipends are not offered; the expiry day still is | S09; D09 |
| registry note EARN-015 (recalls) | "Mock Tread recall: refund of $129.99 available" after the refund deadline (settlements already skipped a past deadline) | A recall past its deadline is not offered | S11; D11 |
| registry note EARN-011 ("points at the real rate") | Points that expired Oct 1 were "worth $100.00" | Expired points are not valued | S12; D12 |
| registry note EARN-004 ("verified by the referral credit") | One $50 referral credit was the payout for two referrals (`paid_seen: 2`) | One credit pays one referral | S14; D14 |
| `44-agent-earn.js` verify ("the credit itself") | Another bank's $300 bonus credit verified this bank's bonus | The credit must post to the bonus account | S17; D17 |
| `44-agent-earn.js` ledger ("Nothing is booked until a verify step confirms the credit posted") | Raising the 401(k) election booked the year's match, $1,350.00, as found and verified | The election verifies with $0 booked: "contribution raised; the match verifies as it posts on payroll" | S18; D18 |
| `44-agent-earn.js` ledger | The same $300 credit verified on three days was booked three times ("$600.00 found" after two) | A credit is booked once, by its row id | S19; D19 |
| `51-connectors.js` header ("one canonical schema ... a freshness stamp on every datum") | `available: null` (Plaid's value for most cards) read as $0.00 available; `cost_basis: null` as a $0.00 basis; a missing balance, price or bill amount as $0.00 | Missing or non-numeric is null (unknown); a real 0 stays 0 | `tests/depth-CONNECTORS.test.cjs` S05; D05, D05b |
| `51-connectors.js` canonical transaction | A 45.00 EUR charge became `amount_cents: -4500` with no currency | Transactions carry `currency` (or Plaid's `iso_currency_code`; USD only when neither is given) | S06; D06 |
| registry note ACCT-007 ("typed or uploaded by the user, synced and normalized like any connector"), `51-connectors.js` manualCsv ("always available as the floor") | The CSV given at connect was dropped, and sync said HEALTHY with zero rows (the old test set `_csv` by hand) | The upload is what the sync reads | S07; D07 |
| `51-connectors.js` CSV reader | `"STARBUCKS, SEATTLE WA",-5.40` split into a broken description and a NaN amount; `"-1,850.00"` and `$3250.00` were NaN | CSV quoting is honored and the amount drops `$`, commas and spaces; unquoted rows read as before | S08; D08 |
| `51-connectors.js` header ("act() passes the autonomy gate and the compliance gate before any adapter call") | With `53-compliance.js` not loaded, a confirmed transfer skipped the compliance gate and reached the adapter | No compliance gate fails closed (`no_compliance_gate`) | S14; D14 |
| consent text ("each time you confirm"), CLAUDE.md fresh approval per order | A capability labeled T1, or a caller's own gate returning `confirm: false`, moved money with no yes; a T5 passed with a lax gate reached the adapter | Every write needs `confirmed: true`; a T5 is refused by its own tier. A confirmed T3 with a live partner and verified KYC still reaches the adapter | S15; D15, D15b |
| CLAUDE.md ("no password or code in chat or logs") vs `51-connectors.js` audit redaction | `mfa_code`, `verification_code`, `card_pin`, `passcode`, `cvv`, `card_number`, `account_number` in an action were written to the audit log verbatim | Redacted; `currency_code`, `amount_cents`, `recipient` stay readable | S17; D17 |
| `52-connector-catalog.js` header ("write actions never promised beyond what an adapter can do") | An ungated write on "not live: awaiting partner", "delivery partner contract pending" or "live sandbox only" passed (the state only had to contain the letters "live") | Live means the state starts with "live" and names no sandbox, mock, test or paper | `tests/depth-CONNECTOR-CATALOG.test.cjs` S11; D11, D11b |
| `52-connector-catalog.js` ("a live session must be labeled the least reliable class") | "high (follows the bank's own app)", "slow but steady" passed (the letters "low") | The label starts with "low" or says "least reliable"; all 58 live-session rows still pass | S13; D13 |
| `52-connector-catalog.js` header ("never aspirational") | Plaid, SimpleFIN and Gmail (edge functions not wrapped in the five verbs) were a plain "yes, via aggregator (high)" | "...; adapter not live yet (<the row's state>)" | S15; D15 |
| `52-connector-catalog.js` gap answer, and `tests/catalog.test.cjs`, which pinned it | "CSV import always works as the floor" (no app or edge path offers a CSV import; the adapter is a reference adapter) | The floor sentence is said only when the catalog's `manual-csv` row is live; the old test is corrected | S16; D16 |
| `52-connector-catalog.js` answer | A blank question matched all 126 rows as "yes" | "Which service? Name the bank, app or company you want to connect." | S17; D17 |
| `63-agent-surfaces.js` side income | "With 0 hours a week and no stated skills: . Also worth ten minutes: ..." | "Nothing in the catalog fits the skills, gear and hours you gave me. Still worth ten minutes: a benefits screening, which is not work." | `tests/depth-SURFACES.test.cjs` S03; D03 |
| registry note EARN-001 ("filtered by what the user can meet") | "tx" was told "only in TX, OK"; $3,000 a month was "needs $5,000.00 of direct deposit within 60 days" | States compare in capitals; the window's whole months of pay count | S04, S05; D04, D05 |
| registry note CARD-002 ("rotating windows, caps") | A category ending Sep 30 (no start date) still paid 5 percent in October; with $200 of a cap left a $1,000 purchase was "$50.00 back" and beat a flat 2 percent card | Either end bounds the window; the bonus rate applies to what is left of the cap and the base rate to the rest ($18.00; the flat card's $20.00 wins) | S10, S11; D10, D11 |
| `63-agent-surfaces.js` best card | "5 percent on undefined needs activating first"; a stated 0 base rate became 1 percent | The merchant is named; a stated 0 is 0 | S12, S13; D12, D13 |
| `63-agent-surfaces.js` complaint draft, and `tests/surfaces.test.cjs`, which pinned it | "I need what_happened, on to write it." | "I need what happened and the date to write it."; the old test is corrected | S15; D15 |
| registry note SAVE-009 ("from the user's own usage") | No usage: "On your 0 kWh a year: Mock A costs about $0.00"; a month with no reading counted as 0 kWh (9,000 kWh a year for 12,000) | Months with a number only; none asks for a month of usage | S16; D16, D16b |
| registry note HOUS-010 (move budget) | `deposit_months: 0` added a $2,000.00 deposit line | A stated 0 is no deposit line | S17; D17 |
| registry note TAX-007 (crypto CSV) | A quantity of 0.00000012 was written "1.2e-7" | "0.00000012" | S18; D18 |
| `63-agent-surfaces.js` bill calendar | "1 bills in the next 30 days ... 1 need a manual payment." | "1 bill ... 1 needs a manual payment." | S19; D19c |
