# End-to-end plan for the switch to Muse (2026-10-12)

The owner's goal for the next phase: every capability and feature built end to end. This file says exactly what that
takes, item by item, against the owner's 149-item capability list (`docs/capability-list/README.md`, regenerated
`node scripts/capability-list.cjs`). Status on branch `claude/upmore-16-spec-instinct-0qyuqj` at the commit that adds this
file:

| | Items |
| --- | --- |
| PROVEN (live, with a provider record) | 0 |
| IN_PRODUCT (reachable in chat or the hourly run, offline-tested, not proven live) | 55 |
| MODULE_ONLY (a tested module nothing in the product calls) | 47 |
| NOT_BUILT | 41 |
| GATED (a standing owner rule or a missing rail) | 6 |

**The principle (owner, 2026-10-12): everything stays on.** No capability is switched off or hidden.
- Every capability is available to every person, and acts only when that person sets the situation up in their own
  words. Examples: "pay maya 40 when my paycheck lands", "set a late fee alert", "compare my portfolio to the S&P".
- Upmore never decides on its own. Each money action still gets its card and the person's yes, and orders stay under the
  $5 cap until the owner raises it in writing.
- "Gated" below never means "turned off". It means not built yet because a rail or an owner decision is missing. Once
  built, it is on and person-initiated like everything else.

"End to end" here means four steps, in order. **Built**: the logic exists. **Wired**: a person reaches it from a chat
message or the hourly run. **Tested**: there is a depth packet with planted defects, and the edge test passes. **Proven**:
it ran live against the real provider, with a record. Nothing is proven yet, because proof needs the owner's deploy.

## 0. What only the owner can do, and what it unblocks

These are not build work. No agent, Muse included, can do them under the standing rules (`CLAUDE.md`, Rules).

1. **Go-live** (`bash scripts/launch/owner-go-live.sh`, with `OPENAI_API_KEY`). It deploys the functions and applies the
   migrations, then runs the security checks and the live gauntlet. This is the only route from IN_PRODUCT to PROVEN, for
   all 55 items.
2. **The one $5 live order** (L-01), with an explicit yes on the exact order and amount.
3. **Decisions written down** (each unblocks the items listed):
   - raise the $5 cap: 45, 46, 49, 56 (and any order over $5);
   - automations with a yes per run: 47, 53, 54, 55, 57, 59;
   - securities advice: 50;
   - prediction markets and crypto (decisions 2 and 3): 62.
4. **Provider and partner contracts** (a rail per item; none exists, and none may be faked):
   - bill pay or ACH: 74, 75, 76, 78, 84, 86, 88, 89, 90, 92;
   - account opening (IRA): 70;
   - ACATS: 61;
   - rent reporting: 82;
   - international transfer: 140;
   - a credit bureau feed: 37, 101, 102, 104;
   - a settlements source: 41, 142-145;
   - a rates source: 40, 100.

## 1. Wire what already exists (MODULE_ONLY, no gate): Muse can do these now

Each item has a module that already passes offline tests. Each needs the same steps:
- a chat path (a money answer, a direct answer, a settings command or a flow) or an hourly `plan()` step;
- a depth packet (15 sub-capabilities, planted defects that bite) and an edge test;
- a megadoc verdict where a scenario matches;
- a `status-overlay.json` entry with its `test_ref`, plus a REACHABLE line in `docs/capability-list/map.cjs`.

Order is by value to a person and how complete the module is.

| Order | Item | What to wire | Module | Notes |
| --- | --- | --- | --- | --- |
| 1 | 109 | Duplicate subscriptions ("two music services") in "what subscriptions do I have" | the subscription list (100) and savings (85) | Read only; a cancel goes to the cancel flow, one yes each. |
| 2 | 105 | Which card to use for a purchase, from the cards the person holds | rewards math (87) and the offer book | No applications; dated terms only. |
| 3 | 91, 92 (math only) | A debt payoff plan, avalanche or snowball, from the person's card and loan rows | debt modules (`docs/depth/MONEY-PLANS.md`) | Sending extra money stays gated (bucket 3). |
| 4 | 89, 90 (read only) | Card due dates and utilization before the statement closes, said by the hourly run | credit and card modules (`docs/depth/CREDIT.md`) | Paying stays gated. |
| 5 | 77 (read only) | "Does my balance cover the bills due before payday?", from `TheNumbers.projection` | 86-the-numbers.js | Moving money stays gated. |
| 6 | 20 | What-if: cancel this, a raise, a move | ANL-019 projection | Label it an illustration, with its assumptions. |
| 7 | 132 | A trip or event tab settled in the fewest payments | settle-up in 54-agent-money.js, over the IOU log (105) | Requests are staged handoffs. |
| 8 | 130 | A nudge to someone who owes, in the person's tone | tone drafts | A draft the person sends; Upmore messages no one else. |
| 9 | 81, 95, 112, 148 | Drafts the person sends: a late-fee waiver (after the late-fee alert catches one), debt validation to a collector, a refund for an unwanted renewal, a refund for a late or damaged order | dispute and complaint drafts | Nothing sent by Upmore. |
| 10 | 60, 69 | Tax-loss candidates with wash-sale checks; the tax hit on the sell card before the yes | invest modules (`docs/depth/INVEST.md`) | Numbers only, never "you should sell"; cost basis from the broker. |
| 11 | 65 | Concentration in one stock, from positions | 50-agent-invest.js | Sector weights need a sector source (not on file). |
| 12 | 68, 35 | A watchlist and price-move alerts, in the hourly run | price alert modules | Needs the broker read in `agent-proactive`. Earnings dates need a source. |
| 13 | 56 | Rebalance: the drift and one card per order | INV-014 | Each order is its own yes under the $5 cap; most rebalances exceed the cap until the owner raises it. |
| 14 | 97 | Student loan programs this person fits, from what they tell Upmore | program eligibility module | No forms, no identity digits. |
| 15 | 141 | An allowance: a recurring send that asks each time | recurring family send | A yes per send; dependent accounts stay gated. |
| 16 | 137 | Couple mode: shared bills visible, personal spending private | household view module | Needs a second person's consent and the RLS design; a migration (owner pushes it). |
| 17 | 2, 3, 4 | Read receipts, bills and renewal notices from the connected Gmail; a structured reader for a photo of a bill or pay stub | TXN-015, TXN-016 | Gmail OAuth exists. Extraction must give exact numbers with their source; a model read is said as a read, never as a bank fact. |
| 18 | 42, 43, 44 | A receipt and undo for each action; failures said plainly; money counted only once confirmed | in every flow | Already true offline. They become PROVEN only with live runs (section 0). |

External data is missing for these MODULE_ONLY items, so they stay as modules until a source is added:
- 37, 101, 102, 103: credit bureau;
- 40, 100: rates;
- 41, 142, 144, 145: settlements;
- 66, 67: news and fund holdings;
- 71, 72, 73: payroll and retirement plan data.

## 2. Build new (NOT_BUILT, no gate): Muse can do these now

| Item | What to build | Notes |
| --- | --- | --- |
| 11 | Split one purchase into categories from a pasted or emailed itemized receipt | Category rules (95) for the parts; never guessed from a bank row alone. |
| 80 | A draft asking a biller to move the due date | The person sends it. |
| 94 | A written hardship or lower-rate request to a lender | Drafts only; no phone calls (owner rule). |
| 104 | A credit limit increase request draft | The person sends it; no application by Upmore. |
| 108 | "Subscriptions I haven't used": the person's list, asked about, never guessed | No usage data exists; ask which ones. |
| 123 | Ask for a retention discount before cancelling | A written draft or the merchant's own retention offer; no calls. |
| 98, 99 | Track progress toward loan forgiveness from what the person tells Upmore (payments counted, dates) | Forms with identity digits stay the person's. |
| 146, 147 | Breach settlements and FTC or state refund programs, as dated official data | Like `packages/offers/refund-programs.json`, each row sourced and re-checked; matched to what the person tells Upmore. |
| 36 (the alert half) | A message when a dividend or savings interest is paid | The hourly run, from rows (interest) and the broker (dividends). |

## 3. Gated by a standing rule or a missing rail: not built past the gate

Copy trading (45, 46, 47, 48, 49, 50) and recurring, percent or round-up investing (53, 54, 55, 57, 59). Brokerage moves
(61), IRA opening (70) and crypto (62). Paying bills and debts (74, 75, 76, 78, 82, 83, 84, 86, 88, 93). Subscription
sign-ups, switches, rotations, pauses, downgrades and re-subscribing at the merchant (110, 111, 115, 116, 117, 118, 119, 120, 121;
no merchant rail is live, and a payment card goes only through the vault). Negotiating by phone (122). Moving a card or updating it
everywhere (125, 126). Agent-to-agent settling (139). International transfers (140). Group pools (138). Claim filing
(143). Returns (149).

Each one already says plainly that it isn't built and what the person can do instead, and nothing moves. When the owner
lifts a gate (section 0), the item moves to bucket 1 or 2.

## 4. The 55 IN_PRODUCT items: what end to end still needs

- **Proof:** the live gauntlet and provider records after go-live. Any FAIL is recorded by
  `evals/gauntlet/record-replays.cjs` and stays red until fixed or triaged in writing.
- **Partial coverage:** 40 of the 55 are "part". The note on each item in `docs/capability-list/README.md` names the
  missing piece. The common ones:
  - retirement, loans, BNPL and payroll accounts not aggregated (1);
  - spending by person or place (6);
  - forecasts beyond 90 days.

## How to check progress

- `node scripts/capability-list.cjs` prints the counts; `--check` fails on drift.
- Every status rise needs a `status-overlay.json` entry whose `test_ref` exists and passes.
- `node scripts/build-mutation-report.cjs --check` keeps every module's planted defects biting.
- The megadoc report (`node evals/scenarios/report.cjs`) and the testing agent (`deno run -A evals/agent/run.ts --check`)
  must stay green.
- The full local bar is every CI step, plus a type-check of the six deployed functions. Their esm.sh imports are mapped to
  the same packages on npm, because the sandbox proxy blocks esm.sh.

## When testing can begin

- **Offline, now.** Every check below passes on this branch. Every capability that is reachable can be tried against
  mocks: the megadoc simulation (`deno run -A evals/scenarios/sim.ts`) and the testing agent
  (`deno run -A evals/agent/run.ts`).
- **Live, as soon as the owner runs go-live.** Run `bash scripts/launch/owner-go-live.sh` with `OPENAI_API_KEY`. It
  deploys, runs the security checks, then the live gauntlet. A person can then use the app and chat with real linked
  accounts. Live trades stay at $5 a yes until the owner raises the cap.
- **What testing means:** a person describes a real situation, the agent answers or puts up a card, the person says yes
  or no, and the result is checked against the provider's own record. Every live failure becomes a replay test.

## Brief for Muse (paste this)

> You are continuing Upmore on branch `claude/upmore-16-spec-instinct-0qyuqj` (repo
> srikanthvishnu90-sketch/upmore-agent).
>
> Read first:
> - `CLAUDE.md`: commands and standing rules. The rules are binding.
> - `docs/instinct-spec-series/BUILD-STATUS.md`
> - this file, `docs/end-to-end-plan-2026-10-12.md`
>
> Goal: every capability on the owner's 149-item list built end to end. That means wired into chat or the hourly run,
> tested with a depth packet whose planted defects bite, and proven live after the owner deploys.
>
> Everything stays on: nothing acts until the person sets the situation up in their own words. Every money action gets
> its card and the person's yes. Orders stay under the $5 cap. No paper trading. No phone calls. No stored passwords,
> codes or identity digits. One yes per cancellation. No securities advice. Prediction markets and crypto stay off until
> the owner decides in writing.
>
> Work order:
> 1. Section 1 of the plan, top to bottom: wire the tested modules.
> 2. Then section 2: build what's missing within the rules.
> 3. Leave section 3 until the owner lifts a gate in writing.
>
> Per item:
> - the chat path or `plan()` step;
> - a depth packet (15 sub-capabilities, `node evals/depth/run.cjs <ID>` all biting) and an edge test;
> - a megadoc verdict;
> - a `status-overlay.json` entry with a passing `test_ref`, plus a REACHABLE line and an exercise in
>   `evals/agent/run.ts`.
>
> Before every push:
> - the full CI bar locally (`.github/workflows`);
> - `deno run -A evals/corpus/run.ts` shows FAIL 0;
> - `node scripts/capability-list.cjs --check` passes.
>
> Push small commits to the branch. Never merge to main or deploy: that is the owner's step.
> Docs follow the code: fix drift in the same commit and log it in `docs/playbook-drift-<date>.md`.
> The app uses OpenAI only: never spend Anthropic API credits.

