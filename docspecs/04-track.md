# Doc 4: Track — stored from Vishnu's paste, 2026-09-24 22:05 CDT. Full text below.

Upmore — Track: Feature Spec
Sep 24, 2026
Track is the feature with the least standalone value and the most structural importance. As a product it is a solved, commoditised, unwinnable category — Mint had tens of millions of users, shut down in January 2024, and nobody absorbed them. As infrastructure, it is what every other feature reads from.
So the guiding decision: Track is not a destination. It is the pipeline, plus three views, plus a set of monitors that push into the queue. There is no Track tab, and building one would be the first step toward the six-tab product this architecture exists to prevent.
This document assumes the shared architecture in Upmore — Feature Specs.

## The pipeline

### The provider abstraction
One interface, written on day one, before any provider code exists:
interface TransactionSource { connect(user) -> Connection; listAccounts(connection) -> Account[]; listTransactions(connection, since) -> Transaction[]; getBalance(accountId) -> Balance; disconnect(connection) -> void }
Plaid sits behind it first. Teller, SimpleFIN or MX can be swapped in without a single feature touching provider code. Teller is reverse-engineered and breaks when a bank changes behaviour — a fallback is not optional.

### Access path
Build: Plaid Sandbox — free, unlimited — fake data; learn Link, build the whole pipeline.
First users: Plaid Trial / Launch — free, up to 100 live items — covers the entire first cohort.
Fallback: SimpleFIN Bridge — ~$15/year — read-only, daily refresh, fits a PFM tool exactly.
Scale: Plaid Production — sales-led — 4-12 weeks: security review, contract, bank certification.
Apply for Launch now. The review is the long pole, not the code.

### The transactions table
Columns: id uuid; user_id uuid (RLS owner-only); account_id uuid (FK to accounts); posted_at date (the date that counts); authorized_at date (nullable; pending vs posted); amount numeric (negative outflow, positive inflow, one sign convention everywhere); merchant_raw text (exactly as the bank sent it); merchant_id text (canonical, from the normaliser); category text (provider-supplied, then overridden); category_source enum (provider, rule, user); is_pending bool (pending transactions change; never count them); is_transfer bool (excluded from all spending maths); recurrence_id uuid (set by the detector, links to a subscription); provider_id text (for dedupe across refreshes).

Two rules preventing the most common bugs: pending transactions never enter a total (amount and merchant both change on settlement); transfers are not spending (counting a checking-to-savings move as an expense makes every figure wrong).

### Categorisation — don't build this
Plaid, MX and Finicity all return enriched categories. Building a categoriser from scratch is rebuilding something the pipe gives you free, and doing it worse. The work is in the three places the provider gets it wrong.

The three-layer override — resolution runs in order, later layer always wins:
Layer 1: provider category — default for everything.
Layer 2: Upmore rules — where the provider is systematically wrong.
Layer 3: user correction — always wins, permanently, for that merchant.
category_source records which layer decided, so a user can see why something was filed where it was — and so you can measure how often layer 1 is wrong per provider.

Where providers are systematically wrong (the rules worth writing, roughly all of them):
- Everything-stores: a supermarket selling groceries, medicine and a phone charger — do not split; file as the dominant category and say the figure is approximate.
- Payment processors (SQ *, PAYPAL *, TST*): strip prefix, then categorise the underlying merchant.
- Transfers misfiled as spending (card payments, Venmo to yourself, savings moves): flag is_transfer, exclude from every spending total.
- Refunds: positive amount at a spending merchant — net against the original, never count as income.
- ATM withdrawals: cash — its own category, explicitly uncategorisable — never guess.
- Peer-to-peer apps (Venmo, Cash App, Zelle): genuinely ambiguous; ask once per counterparty, then remember.
- Subscriptions: any transaction with a recurrence_id — overrides the provider category entirely.

The refund rule catches a bug in nearly every budgeting app: a $60 return shows as $60 of income, the month looks better than it was, and the user stops believing the numbers.

### The correction loop
A user correction does four things:
1. Recategorises that transaction.
2. Recategorises every past transaction from the same merchant_id.
3. Creates a permanent rule for future transactions from that merchant.
4. Increments a global counter for that provider-category-to-user-category pair.
Step 4 builds a correction table across all users. When 200 people move the same merchant from one category to another, that becomes a layer-2 rule for everyone. The categoriser improves with use — the only kind of improvement worth engineering for. A genuine, if small, compounding asset — and unlike the cancel-path library, it costs the user nothing to contribute to.

### What categories to use
Few, and fixed. Ten to twelve, not forty. Housing, Transport, Groceries, Dining, Subscriptions, Utilities, Health, Shopping, Entertainment, Debt, Transfers, Other. Subscriptions is deliberately top-level because it is the one the rest of the product acts on.

## The three views
Track needs exactly three surfaces. None of them is a tab.

View 1: the strip on Home — three numbers, one line, at the top of the queue:
- Free cash: balance minus recurring charges due before next payday, minus buffer.
- Days to payday: from the recurrence detector run over inflows.
- Left to spend: free cash divided by days to payday, as a daily figure.
This strip answers the only tracking question people actually ask: can I spend money right now. Free cash is the same calculation Earn uses to gate routes, computed once and read everywhere.

View 2: the transaction list — reached by tapping the strip. A plain list: date, merchant, amount, category, with search and filter. Tapping a transaction lets the user recategorise, mark it as a transfer, or flag it as wrong. Deliberately boring. Subscription transactions show their recurrence badge, so tapping through leads to the cancel card.

View 3: the month view — reached by tapping a month label. Spending by category, this month against a three-month average, as a simple list sorted by size. No pie chart. Each row: category, this month, average, delta with direction. A category more than 40% above average becomes a spike card in the queue.

Why there is no Track tab: tracking is a solved and commoditised category. Mint died and left no vacuum. What tracking is good for is producing the facts every other feature acts on. Build it as infrastructure, expose it as three views, and spend the saved engineering on claim and the deadline engine.

## The monitors
This is the section that separates Upmore from a dashboard. A dashboard waits to be opened. A monitor finds something and pushes it into the queue.

It is also the section the current build claims and does not have. The Money tab says "Your AI money agent watches this daily" and "Last checked today", while the only thing writing finance_alerts is a hardcoded INSERT in the migration seeding three rows for one demo user. There is no job. Until these monitors exist, that copy has to come out.

What runs, nightly — each monitor is deterministic, cheap, emits at most one card. All seven together are a few hundred lines:
- New recurring charge: detector emits a recurrence_id not seen before -> cancel card. Confidence: from the detector.
- Price increase: recurring charge exceeds its cluster amount by more than 5% -> cancel card with the delta named. High.
- Trial converting: $0 charge from a new merchant, plus known trial length -> deadline card. Medium.
- Category spike: category more than 40% above its 3-month average, minimum $50 absolute -> spike card. Medium.
- Low balance ahead: projected balance before next payday falls below buffer -> budget_alert card. High.
- Duplicate charge: same merchant, same amount, within 3 days -> claim card. High.
- Payday landed: inflow matching the detected pay pattern -> budget_alert card. High.

Rules every monitor obeys:
- Evidence is mandatory. Every card states what it was computed from: "ComEd charged $184.20, up from $89.10 last month. Based on 3 months of Chase checking …4471." A flag without its evidence is an assertion.
- One card per finding, ever. A monitor that re-fires on the same finding trains the user to dismiss everything. Dismissal is permanent for that finding.
- Silence is a valid output. Most nights, most users get nothing. An app that manufactures a daily insight is optimising for engagement.
- No monitor fires on pending transactions.
- Never state a behavioural conclusion. "You're spending too much on dining" is a judgement. "Dining is $180 above your 3-month average" is a fact. Only the second is permitted; the model may explain but may not editorialise.

Where the model comes in — the monitors find; the model does three things on top:
1. Explains the finding in plain words, using the numbers code computed.
2. Reasons across findings — noticing the overdraft two days before payday, every time, which no single monitor can see.
3. Writes the plan — which cards to act on, in what order, and what the sequence produces.
Point 2 is the genuinely valuable one. It still computes nothing. Every figure in a plan comes from a function call.

## Data quality
Every bug below produces a wrong number on screen, and a wrong number in a product whose entire positioning is honesty is a breach.
- Duplicate transactions: same item returned across refreshes — dedupe on provider_id, not amount and date.
- Pending then posted: both appear briefly — never count pending; reconcile on settle.
- Amount changes on settle: tips, holds, currency — recompute anything derived from that transaction.
- Backdated transactions: bank posts late — re-run monitors for the affected window, don't just append.
- Connection expires: re-auth needed — show it plainly, stop showing stale figures as current.
- Account closed: user closed it — keep history, stop projecting from it.
- Gaps in history: new connection, limited lookback — state the coverage window on every aggregate.
- Sign convention drift: providers differ — normalise at ingest, once, and never again downstream.
The coverage-window rule: every aggregate states the period it covers. "$412 on groceries, from Sept 2 onward" is honest and costs one clause.

## Hard nevers
1. Never count a pending transaction in any total.
2. Never count a transfer as spending or a refund as income.
3. Never show an aggregate without its coverage window.
4. Never state a behavioural conclusion — state the number and let the user conclude.
5. Never claim a monitor ran if no job exists (see the current Money tab).
6. Never manufacture a daily insight to fill the screen.
7. Never write to the user's accounts — read-only, permanently, at the provider level.
8. Never retain transaction data after a user disconnects.
9. Never sell, share or train on transaction data.
10. Never re-fire a dismissed finding.

## Build order
Days 1-3: TransactionSource interface and the transactions schema — everything reads from this.
Days 4-7: Plaid Sandbox ingestion, dedupe, pending handling — correctness before live data.
Days 8-10: merchant normaliser and alias table — shared with Cancel.
Days 11-13: transfer and refund detection — without this every number is wrong.
Days 14-16: free-cash calculation — feeds the Home strip, Earn's gate, and the low-balance monitor.
Days 17-19: the Home strip, three numbers — first user-visible output.
Days 20-23: transaction list and correction loop — enables layer 3 and the global correction table.
Days 24-28: month view and the category comparison — feeds the spike monitor.
Days 29-35: the seven monitors, nightly job — Track becomes an agent rather than a dashboard.
Days 36-40: Plaid Trial and the first live connections — after the pipeline is proven on sandbox data.
Sandbox first, deliberately. Every data-quality bug above is cheaper to find on fake data than on a real user's real money.

## Honest limits
Track cannot be won as a category. The leader died and left no vacuum. Anything built here should be justified by what it enables elsewhere, never by its own merit.
Coverage is partial at the start. Say so rather than showing thin data confidently.
Categorisation is never right. The correction loop makes it better over time; it never makes it correct, and the app should not pretend otherwise.
Read-only forever. Upmore never gains write access to an account — a permanent product constraint and a deliberate one: write access would trigger money-transmission questions that would end the company.
The monitors are the whole value. Without them, this is a worse Mint. With them, it is the only part of the product that reaches out to the user rather than waiting.
