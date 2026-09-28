# Upmore "Manage Your Finances" — Full Agentic Process Design

Date: 2026-09-24
Status: Design only — not built. Awaiting Vishnu's decisions on open questions at the bottom.

## 1. What this is

Upmore already helps people **make** money (routes) and **stop losing** money (subscriptions, promos).
"Manage your finances" closes the loop: the user lets Upmore **see** their money (read-only bank
connection), and an agent **watches it continuously and prepares money moves** — the user approves
each action before anything happens.

The immense value: most people never look at their accounts. An agent that watches daily and says
"your electric bill doubled, here's the number to call" or "payday landed, move $200 to savings?"
is worth more than any single promo.

## 2. The full process, end to end

### Phase A — Connect (one-time, ~2 minutes)
1. User taps "Manage your finances" → explainer screen in plain language:
   - "We can see: balances, transactions, recurring bills, what's owed."
   - "We will never: move money, log in as you, or share your data."
2. Plaid Link flow — user connects checking/savings/credit cards. Read-only by construction.
3. Manual fallback: user can add a cash/manual balance for accounts they won't connect.
4. Manage screen: connected accounts listed, reconnect when a token expires, disconnect anytime.

Technical: Plaid products needed — Transactions (sync), Accounts/Balances, Recurring
(inflow/outflow streams), Liabilities (credit/loans). Our Plaid integration is **read-only**:
it cannot move money, pay bills, or change anything at the bank. This is a hard constraint
that shapes the whole design (see §5).

### Phase B — The snapshot (first value, under 60 seconds)
Immediately after connecting, the agent builds the first screen from real data:
- **Cash right now:** total across checking + savings.
- **This month:** money in vs. money out vs. left.
- **Bills due soon:** next 14 days, from recurring outflow detection.
- **Flags:** anything unusual already visible (bill spike, new recurring charge, low balance).

No setup, no budgeting homework. Value on first load.

### Phase C — Ongoing agentic loops (the "whole process")

The agent runs on a schedule (daily) plus event triggers. Four loops:

**Loop 1 — Watch (daily, read-only, no approval needed)**
- New recurring charges → feeds the existing subscription detector (Save tab).
- Bill spikes: "Electric bill is 2.1x last month."
- Predicted low balance / overdraft risk from inflow/outflow patterns.
- Paycheck arrival → triggers Loop 2.

**Loop 2 — Move (on trigger, approval-gated)**
- Payday detected → propose a sweep: "Move $200 to savings?" The agent prepares the
  transfer details; the user executes the final tap in their own bank app (we cannot move
  money — Plaid is read-only, and we never hold credentials).
- Goal funding: same mechanism toward a savings goal.

**Loop 3 — Optimize (weekly)**
- Match the user's real cash against the promo catalog: "You have $1,400 sitting in
  checking at 0% — here's a $300 bank bonus you qualify for." (Ties directly into
  existing promo routes.)
- Subscription re-check with real usage data: "Hulu charged again; no usage signal in
  60 days." → deep-link to the existing cancel flow in Save.
- Bill negotiation: agent drafts the call script or chat message for the ISP/electric
  company. The user sends it. We never impersonate the user to a third party.

**Loop 4 — Goals**
- User sets a goal ("$1,000 emergency fund"). Agent tracks progress from real balances,
  nudges on payday, proposes sweep amounts. Progress bars on the page.

### Phase D — The page itself (kept very simple, per product rule)

Top to bottom:
1. **Right now** — cash total, in/out this month, bills due next 14 days.
2. **Needs your eye** — alert list (spike, new recurring, low balance). Each taps through
   to detail + the suggested action.
3. **Your agent is watching** — what's monitored, last-checked time. (Builds trust;
   makes the invisible work visible.)
4. **Goals** — progress bars, set/adjust.
5. **Accounts** — connected list, add/remove.

Every alert and proposal shows its evidence ("based on 3 months of Chase checking").
No black-box claims.

## 3. Approval model (non-negotiable)

| Tier | What | Approval |
|------|------|----------|
| 0 — Observe | Read data, show insights and alerts | None |
| 1 — Prepare | Draft actions: transfer details, cancel steps, negotiation script, promo checklist | None to prepare |
| 2 — Act | Anything that moves money, cancels a service, or contacts a third party as the user | **Explicit per-action approval** with exact details shown first |

The agent never auto-executes Tier 2. This mirrors the risk-tiered model from the Ring
project and the standing rule: nothing goes out under the user's name without their
exact approval.

## 4. Data & infrastructure

- **Plaid:** accounts/balances, transactions sync, recurring streams, liabilities.
- **Supabase (new tables):** `finance_accounts`, `finance_snapshots`, `finance_alerts`,
  `finance_goals`, `finance_actions` (approval audit log — every proposal, approval,
  and outcome recorded).
- **Scheduler:** daily edge-function run for the Watch loop; alerts surface in-app
  (push later).
- **Audit trail:** what the agent saw → what it proposed → what the user approved.
  Inspectable on the page.

## 5. Hard boundaries (what we will NOT do)

- No autonomous money movement — not now, not ever without explicit per-action approval.
  Plaid is read-only; we never store bank passwords or screen-scrape logins.
- No impersonating the user to third parties (no "we'll call your ISP for you").
  We draft; the user sends.
- No pushing credit cards, loans, or debt products.
- No selling or sharing transaction data. Ever.
- No financial-advice claims ("you should invest in X"). We report what the data shows
  and what actions are available.

## 6. Phased build plan

- **v0:** this design doc (done).
- **v1:** Plaid connect (sandbox first) + snapshot page + Watch loop with in-app alerts.
  No actions yet — pure read-only value.
- **v2:** approval-gated actions — sweep prep, cancel assist, promo matching against
  real balances.
- **v3:** goals engine, payday automation proposals.

## 7. Open questions for Vishnu

1. **Plaid production:** do we pursue production Plaid access (requires their approval
   + your credentials)? Sandbox is fine for v1 testing.
2. **Money movement:** should transfers stay "we prepare, you tap in your bank app"
   forever, or do we eventually want execution-with-approval (much bigger compliance
   surface)?
3. **Tab name:** "Manage" vs "Money" — and does this become the 6th tab or live inside
   an existing one?
4. **Scope check:** is the Watch loop's daily cadence right, or do you want real-time
   alerts for things like overdraft risk?
