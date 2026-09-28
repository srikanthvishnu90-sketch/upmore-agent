# Doc 1: Earn — reconstructed 2026-09-25 from durable constraints of Vishnu's paste (2026-09-24 22:04 CDT). Full verbatim text was not persisted; every rule below was received in that spec.

Upmore — Earn: Feature Spec
Sep 24, 2026
Earn is the feature that makes Upmore's positioning — "your AI money agent" — either true or a lie. Every other product in this space shows offers it has not verified, quotes rewards it cannot guarantee, and implies the user will get paid. This spec is built around being the one that doesn't.

Earn is split into two legally distinct halves: **Routes** (things the user does for money) and **Capital** (education about money the user already has). They share nothing in the UI except the tab they live under. Capital must be pull-only and structurally unable to give securities recommendations; it must never appear proactively in the queue or inside an agent-proposed plan. The spec itself says never ship Capital before a securities lawyer has reviewed the system prompt.

## Route eligibility: nine short-circuit gates

A route surfaces only if it passes all nine, in this order. A gate that fails ends evaluation immediately — no partial credit, no "close enough."

1. **Age.** The user meets the route's minimum age.
2. **State.** The route is available in the user's state.
3. **Deadline.** The route's deadline has not passed.
4. **Freshness.** The route's terms are fresh (see verification states below).
5. **Loss.** The route cannot lose the user money. Any route where the user can end up worse off is excluded, full stop.
6. **Capital / free cash.** The route's required upfront capital must be ≤ the user's free cash, where `free_cash = current_balance − recurring charges due before next payday − minimum_buffer`. The buffer defaults to $100 and is adjustable. Routes requiring more than free cash must never surface.
7. **Time.** The route's active minutes fit the free time the user stated.
8. **Cooldown / sibling completion.** The user has not already completed this route or a sibling route that pays for the same action.
9. **Prerequisite / account status.** The user holds (or can get) any required account or status.

## Route classes

Every route carries exactly one class badge:

- **Fixed reward.** Do the thing, get the stated amount.
- **Paid-if-selected.** Reward depends on being chosen/accepted; the card must say so plainly.
- **Variable.** Reward varies; the card shows the terms-stated range, never a projection.
- **Non-cash.** Points, credits, gift cards — kept separate from extractable cash and never allowed to lead the queue.

Earnings count only extractable cash. Gift cards, points, credits, discounts, savings, required-asset liquidation, referrals, rebates, capital bonuses, and acceptance-dependent work stay separate. Online-only. No contests, no credit cards. Prefer fast, same-day income. No fraud, fake accounts, policy violations, or Terms-of-Service tricks. Never publicly promise "make extra money."

## Verification states

`unverified` → `confirmed` → `stale` → `expired`, plus `retired`.

- Only operator-owned exact terms pages — with exact reward, verbatim requirements, URL, and capture date — may promote a route to `confirmed`.
- Nightly terms-hash changes immediately mark affected routes `stale`.
- `confirmed` becomes `stale` automatically at 30 days.
- `stale` may remain visible with its age shown, but may never lead the queue or enter an agent-proposed plan.
- Wherever dated terms, the exact stated reward, or a direct terms URL are absent, the catalog entry is demoted one-way. An honestly small catalog is preferred over a large unverifiable one.

## The Earn card: exactly eight ordered elements

1. Provider / description
2. Exact terms-stated reward
3. Class badge
4. Requirement checklist
5. Honest catch
6. Active minutes
7. Payout timing (observed median, or clearly labelled advertised)
8. Plain verification age / date

Omit: projected route totals, derived hourly rates, fake scarcity or countdowns, rounded/annualised/combined rewards, unpublished figures. Never invent a number the terms page does not state.

## Walkthroughs

Steps are atomic. Each step carries: instruction, resolved deep link, copy-only prefill, success verification, common failure, and active minutes. A pre-flight screen must disclose money/time cost, failure risks, requested personal data, and consequences of abandonment.

Upmore never signs, submits, authenticates, accepts KYC/agreements, uses Face ID, or enters credentials for the user. The user does every identity tap themselves.

## Capital: the hard wall

Capital is education, never advice. Hard nevers:

- No unsolicited security names, rankings, buy/sell/hold/avoid language, allocations, position sizes, forecasts, unattributed valuation judgements, encouragement to invest, or comparisons implying one security is better.
- `What should I invest in?` receives the fixed explanatory refusal script.
- Code computes every figure; the model only explains.
- Teardowns are fixed seven-part, sourced and dated, always include both bull and bear cases, and teach arithmetic with visible working.
- Suppress all Capital content when free cash is negative or overdraft activity exists in the last 60 days.
- Never count unrealised investment value in the ledger.
- Never pair broker affiliate links with specific securities.
- Never treat 13F disclosures as current recommendations. Any 13F position shown must state as-of date, filing date, age in days, and that it may already be closed.
- "Execute" never moves money: assembled cart, pre-filled order, one tap by the user. Everything up to the payment. (Money transmission = licensed state-by-state = company-ending.)
- No affiliate steering anywhere: if Upmore earns commission on a recommendation, show the cheapest option even when it pays nothing, and disclose on the card.

Capital remains disabled/pull-only pending securities-lawyer review of the system prompt. No security recommendations, rankings, buy/sell/hold language, allocations, forecasts, or model-derived math — ever.
