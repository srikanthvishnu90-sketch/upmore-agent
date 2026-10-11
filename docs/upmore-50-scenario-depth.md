# Upmore: depth contracts for the 50 scenarios

User-supplied scope, October 8, 2026. This decomposes all 50 scenarios into **300 independently identifiable capability contracts**, six per scenario. The IDs are requirements IDs, not implementation claims. The machine-readable [scenario registry](upmore-50-scenarios.json) marks every item unassessed/not run until evidence is attached. This extends the existing 256-item catalog; it does not claim a one-to-one mapping or silently mark the additional scope implemented.

## How we reach the depth

For each atomic capability, engineering must complete a depth dossier with twelve fields:

1. **Intent and boundary:** exact job, supported users/accounts/providers/jurisdictions, and forbidden interpretations.
2. **Inputs and coverage:** schema, account/ownership identity, currency/units, required history and missing-source behavior.
3. **Evidence and freshness:** authoritative source, observation/effective timestamps, confidence and correction provenance.
4. **Decision rules:** exact arithmetic, thresholds, calendars, classifications, assumptions and versioned domain rules.
5. **State machine:** pending, proposed, authorized, submitted, partial, unknown, completed, failed, returned and revoked as applicable.
6. **Permissions:** what can be read, drafted, sent, changed or paid; immutable proposal, scope and expiry.
7. **Execution contract:** supported adapter capabilities, validated preflight, request identity, idempotency and cancel semantics.
8. **Verification:** external receipt, reconciliation and precise evidence sufficient to claim the user outcome.
9. **Failures and recovery:** retries, timeouts, partial success, stale inputs, outages, duplicates and irreversible actions.
10. **Messaging:** exact trigger, wording, uncertainty, quiet hours, approval binding and delivery dedupe.
11. **Acceptance tests:** numerical golden fixtures, missing/conflicting input cases, event replay/concurrency and provider contracts.
12. **Operations and accountability:** task/event IDs, redacted traces, support path, complete export and audited outcome metrics.

The tables below provide each atom's distinct behavior and adversarial test. They are the starting acceptance contract. The twelve-field dossier is complete only when exact schemas/rules/state transitions and verification artifacts exist. A large document or passing keyword test is not that evidence.

### Depth is cross-dimensional

Order type × account eligibility × security precision × trading session × current order state × authorization × broker capabilities defines different valid and invalid paths. Bill type × source authority × unpaid amount × existing autopay × funding × rail cutoff × allocation does the same. Generate constrained test combinations from these dimensions; do not write hundreds of copied merchant-specific flows.

Test at least ordinary success, incomplete/stale inputs, unauthorized/tampered action, duplicate/replayed event, concurrent action/stop, partial/uncertain provider result and final reconciliation. Every action also needs the appropriate real provider verification within explicitly declared coverage. Any theoretical test count is an estimate until fixtures exist and run.

### Shared engine map

| Shared system | Reused across scenarios | Deep contract |
|---|---|---|
| Connection/evidence graph | All 50 | User/connection/account/source identity, ownership, freshness, consent and coverage |
| Financial ledger/model | 2–4, 11–29, 34–42, 47, 49–50 | Exact units, pending/posted lineage, corporate actions, assets/liabilities, money-flow reconciliation |
| Domain calculators/rules | Investing, cash, debt, tax, insurance, rewards | Versioned reproducible calculations with official sources and assumptions |
| Workflow planner | Tasks and multi-step requests | Typed goals, prerequisites, dependencies, constraints and supported adapter selection |
| Authorization/attempt engine | Every money movement or consequential account change | Specific approval, immutable snapshot, expiry, atomic reservation and stop behavior |
| Trigger/queue/outbox | Monitoring, automation, briefings, follow-ups | Scheduling/timezone, leases, retries, logical-event dedupe and delivery evidence |
| Provider capability registry | Banking, brokerage, payments, merchants, documents | Read/act/verify support by account/security/session/action; no fabricated compatibility |
| Reconciliation/outcome ledger | Actions, recovery and progress | Submitted versus completed versus verified; allocation, partial results and returns |
| Memory/personalization | All 50 | User facts/preferences separated from inference, inspect/correct/forget, household permissions |
| Research/news provenance | 5, 7–10, 15, 23, 25–26, 30–31, 43, 45 | Dated source and claim linkage, inference labels and source revision handling |
| Simulation/scenario engine | 3, 17–18, 25, 27, 29, 34–36, 46 | Isolated hypotheses, declared execution model and no accidental live action |

### Explicit product constraints from this list

- Every trade and money movement is approval-gated under scenarios 1, 7, 32 and 41. Scheduled/automatic rules create proposals and monitoring; unattended execution would need a separately agreed product policy. Existing broader T3 catalog permissions are not assumed to override this requirement.
- Scenario 48 is **user-sent drafts only**. Generic communication tools must not silently send/file disputes on the user's behalf.
- Credit-card rewards are now requested in scenario 37. The old build script's credit-card exclusion is a scope conflict to resolve during catalog/data migration; the new requirement takes precedence over that old comment. Do not revive stale affiliate offers without verification.
- Copy trading must preserve disclosure semantics. 13F reports describe covered quarter-end holdings and are generally filed within 45 days after quarter-end; they do not provide a real-time execution feed. House transaction disclosure timelines also introduce delay. [SEC/Investor.gov 13F](https://www.investor.gov/introduction-investing/investing-basics/glossary/form-13f-reports-filed-institutional-investment), [House disclosure](https://ethics.house.gov/financial-disclosure/).
- Order types vary by broker. A stop trigger is not a guaranteed execution price, and a stop-limit can remain unfilled. Never-sell-at-loss constraints and protective-stop goals can conflict; show the conflict. [Investor.gov order types](https://www.investor.gov/introduction-investing/investing-basics/how-stock-markets-work/types-orders).
- Named IPO/private-company examples are desired targets, not verified live offerings/access. Check issuer and participating-broker evidence for the actual offering before promising a window or allocation.
- “Exactly one alert” means one logical trigger recorded and deduped internally. End-to-end delivery guarantees depend on transport idempotency/receipts and require separate verification.
- “Any”/“all” must disclose connected-source, provider, jurisdiction and historical coverage. The agent can investigate missing coverage and ask for access/evidence; it cannot infer inaccessible records or invent execution methods.

## Worked depth examples

### Trade execution

The input is a specific brokerage account/security/side/size plus supported order type, prices, session and duration. The server resolves broker capabilities, positions/buying power, quote age, price precision, corporate actions, trading halt/calendar and user restrictions. It generates an immutable expiring order preview, then rechecks material facts at submit.

Lifecycle: draft → reviewed → approved → reserved → submitted → accepted/rejected → partial/filled/cancel-pending/canceled/expired. A lost response remains unknown until queried by request/order identity. A cancel request never means canceled until acknowledged. Each fill changes positions/cash and remaining order size. Receipt history preserves execution price, fees and source IDs. Tests need gap-through-stop, partial-fill/cancel race, fractional rejection, extended-session restriction, duplicate submit, stale approval, broker rejection and webhook replay. Successful HTTP status is insufficient.

### Portfolio performance

The model needs opening/closing valuations, dated external cash flows, holdings, dividends, fees, FX and corporate actions. Specify valuation calendar and whether output is time-weighted or money-weighted. Benchmark must use aligned dates/currency and matching dividend treatment. Inputs missing from unconnected accounts create disclosed partial coverage.

Golden fixture: opening value $10,000, external deposit $5,000 and closing value $15,000 with no investment movement must not report a 50% investment return. A split changes shares/price, not economic value. Tests also need withdrawal timing, reinvested dividend, fee, missing price, transferred security with unknown basis and corrected historical value. Report exact contribution reconciliation and formula version.

### Cash survival and bill payment

The input is account-specific fresh available cash, posted/pending flows, unpaid obligations, expected payroll and essential variable costs. The model must separate minimum payment, installment, total debt and payoff amount; account for external autopay; include today's unpaid bill; and preserve disputed/unknown states.

Plans compare consequences and user constraints when funds cannot cover everything. Payment is approval-bound to verified creditor/account/reference, amount/currency/fees and funding. Tests include two checking accounts, Zelle rent, annual bill, missed paycheck, provider autopay, timeout after submit, wrong-loan allocation and returned payment. Bank debit alone cannot establish bill resolution. The [obligation engine](upmore-obligation-engine.md) supplies the common lifecycle.

## Build and verification order

1. Correct ownership, durable financial identity, data freshness and arithmetic before any expanded financial execution.
2. Implement shared obligation, task, authorization, event and outcome infrastructure. Initial code in this checkout is foundation-only and not a verified live payment service.
3. Complete one read→plan→approve→execute→verify slice for bills, one for brokerage orders, and one for recovery drafts/outcome tracking. These establish three distinct execution semantics.
4. Add triggers, message delivery and personalization on those verified slices; then extend provider coverage and remaining domain rules.
5. Evaluate all 300 atom IDs individually. Keep unassessed, contract-tested, sandbox-tested, supervised-live-tested and shipped states separate. Publish remaining limitations and failures.

The next implementation unit is a depth dossier and tested vertical slice, not another broad feature checkbox. The product reaches depth when numerical facts are correct, plans are constrained, actions are authorized/recoverable, and outcomes are verifiable across the relevant situations.


## S01: Trade stocks and ETFs for me

**Required systems/data:** Broker capabilities; security master; live quotes; buying power; authorization; order ledger; reconciliation.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S01.01 | Market and limit orders | Validate security, side, size, price constraints and time-in-force against broker support; return provider order ID and actual fills. | Quote expires or limit order remains unfilled. |
| S01.02 | Stop and trailing orders | Model trigger basis, trail amount/percentage and order after trigger; show broker support and gaps between trigger and execution. | Price gaps through stop; unsupported trailing order. |
| S01.03 | Fractional shares | Check security/account eligibility, precision and dollar-versus-share sizing; round only within explicit user limits. | Fractional quantity is rejected or residual cash remains. |
| S01.04 | Trading sessions | Use exchange calendar, timezone, eligible session and order restrictions; distinguish regular, premarket and after-hours liquidity. | Holiday, halt, session ends during submission. |
| S01.05 | Modify or cancel | Read current order/fills and use broker replacement/cancel semantics; report pending cancellation until acknowledged. | Order fills while cancellation is in flight. |
| S01.06 | Approval and receipt | Bind approval to account/order/fees and expiry; prevent replay and store receipt, fills and outstanding quantity. | Timeout after submit, partial fill, late approval. |

## S02: Tell me how my portfolio is doing

**Required systems/data:** Holdings and transaction history; corporate actions; market prices; total-return benchmark; performance engine.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S02.01 | Daily and monthly returns | Calculate portfolio performance from dated valuations and external cash flows; show incomplete price or history coverage. | Deposit makes balance rise without investment profit. |
| S02.02 | Since-inception performance | Persist opening values and history; distinguish time-weighted performance from money-weighted investor experience. | Missing opening value or ambiguous cash-flow dates. |
| S02.03 | Benchmark comparison | Align dates, currency and dividend treatment with a sourced S&P 500 total-return series; label missing periods. | Compare dividend-inclusive portfolio to a price-only index. |
| S02.04 | Sector breakdown | Map securities and fund look-through coverage; expose unclassified holdings rather than assigning invented sectors. | Fund holdings stale or private asset has no sector. |
| S02.05 | Allocation breakdown | Aggregate asset classes and account ownership shares at a coherent valuation time without duplicate positions. | Same brokerage connected through two aggregators. |
| S02.06 | Performance explanation | Reconcile contributions, withdrawals, income, fees and price changes to the balance change with source-linked evidence. | Corporate action causes misleading apparent price drop. |

## S03: Keep my portfolio balanced

**Required systems/data:** Position model; user targets; lot data; drift rules; broker; approval; constraints.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S03.01 | Target allocation | Validate asset identities, target sum and user ownership constraints; version every target change. | Targets sum to 110 percent or an asset is unsupported. |
| S03.02 | Drift monitoring | Compute actual-versus-target exposure on coherent fresh valuations, including outstanding orders. | Stale price makes apparent drift exceed threshold. |
| S03.03 | Trigger scheduling | Evaluate scheduled and threshold triggers with dedupe and cooldown; produce one actionable proposal. | Market oscillates repeatedly around the threshold. |
| S03.04 | Trade construction | Generate feasible buys/sells with fees, lot precision, cash and outstanding orders accounted for. | Partial fill changes remaining rebalance needs. |
| S03.05 | Never-sell-at-loss constraints | Use selected lots, basis, fees and enforceable order bounds; surface infeasible constraints instead of ignoring them. | Required reduction conflicts with loss restriction. |
| S03.06 | Approval and verification | Preview turnover/tax implications and gate each order; reconcile final allocation and remaining drift. | User changes targets between approval and execution. |

## S04: Handle the tax side of my investing

**Required systems/data:** Broker lots; transactions; corporate actions; household activity coverage; versioned tax rules.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S04.01 | Cost-basis ledger | Track lot acquisition, adjustments, reinvestment and transfers; retain unknown basis as unknown. | Transferred holding arrives without lot records. |
| S04.02 | Realized gains | Match actual sales and lot elections to proceeds, fees and adjusted basis; reconcile broker statements. | Broker applies a different lot selection. |
| S04.03 | Holding-period split | Classify short/long-term using applicable rules and actual dates; source special-case treatment. | Sale near anniversary or inherited shares. |
| S04.04 | Wash-sale flags | Evaluate relevant repurchases with explicit account/household coverage and uncertainty. | Unconnected spouse account buys replacement shares. |
| S04.05 | Harvest opportunities | Surface loss lots, potential benefit assumptions and replacement restrictions as facts for review. | Tax rate unknown or gains insufficient for assumed benefit. |
| S04.06 | Corporate actions | Adjust quantity and basis through splits, mergers and spin-offs using sourced events. | Reverse split produces cash-in-lieu or missing basis allocation. |

## S05: Research any stock or the market for me

**Required systems/data:** Official filings; licensed price/news data; analyst source rights; research provenance.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S05.01 | Company fundamentals | Resolve issuer/security and retrieve dated filings, revenue, margins, debt and ratios with reproducible arithmetic. | Ticker collision or fiscal years differ. |
| S05.02 | Bull and bear cases | Separate sourced facts, management claims, forecasts and inference; include material counterarguments. | Missing data is filled with plausible invented numbers. |
| S05.03 | Analyst ratings | Show source, date, rating scale, distribution and limitations under available data rights. | Old target is represented as a live consensus. |
| S05.04 | Earnings calendar | Track announced versus estimated dates and timezone; update reminders when issuer dates change. | Earnings rescheduled after alert creation. |
| S05.05 | Market explanation | Tie observed price moves to contemporaneous sourced events while labeling uncertain causation. | Several simultaneous events; no established causal evidence. |
| S05.06 | Citations and refresh | Attach supporting document/time to material claims and correct amended data. | Source unavailable, paywalled or contradicts another source. |

## S06: Alert me on prices I care about

**Required systems/data:** Security master; licensed quotes; market sessions; event rules; messaging outbox.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S06.01 | Threshold creation | Store exact security, comparison, price/currency and session scope with a rule version. | User says above 100 but currency or security ambiguous. |
| S06.02 | Watchlists | Persist additions/removals and issuer identity across ticker changes. | Delisted symbol is reused by another company. |
| S06.03 | After-hours coverage | Label session, quote timestamp and available coverage instead of showing old regular-session data as live. | Provider lacks premarket feed. |
| S06.04 | Trigger semantics | Define crossing versus continuously-above behavior and rearm rules; evaluate from ordered observations. | Out-of-order quotes or threshold never crossed from below. |
| S06.05 | Exactly-one logical alert | Uniquely reserve each rule/version/crossing event and dedupe delivery retries. | Two workers receive the same quote event. |
| S06.06 | Controls and evidence | Support pause, expiry, snooze and reset; show triggering quote and delivery status. | Threshold edited while a notification is queued. |

## S07: Copy top investors' trades

**Required systems/data:** Official disclosure feeds; filer identity; security mapping; inferred changes; broker approvals.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S07.01 | Leader identity | Resolve each named person/manager to the actual filer and covered account/entity. | Public personality confused with a similarly named fund. |
| S07.02 | Disclosure ingestion | Preserve original filing, report period, transaction/publication dates and amendments. | Amended filing reverses a previously extracted position. |
| S07.03 | Honest interpretation | Distinguish disclosed transactions, quarter-end holdings and inferred changes; retain size ranges and missing positions. | A holdings disappearance is misrepresented as a known sale today. |
| S07.04 | Copy sizing | Construct user-chosen exposure from supported security and caps, using current prices. | Option disclosure cannot map to a supported equity trade. |
| S07.05 | Trade proposal | Show filing age, changed price, inference and risks; require approval for each trade. | User expects the leader's historic execution price. |
| S07.06 | Outcome tracking | Record source-to-proposal-to-fill lineage and copied strategy performance separately. | Duplicate filings trigger duplicate copied orders. |

## S08: Manage my copy-trading risk

**Required systems/data:** Copy strategy attribution; portfolio exposures; risk policies; orders; disclosure freshness.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S08.01 | Per-leader caps | Aggregate actual and reserved exposure assigned to each leader; enforce cap before new orders. | Concurrent proposals each fit individually but exceed combined cap. |
| S08.02 | Per-position caps | Aggregate shared holdings across leaders and user trades without hiding overlap. | Two leaders both buy the same issuer. |
| S08.03 | Stop-loss rules | Specify supported order type, trigger and limitations; approval scope includes protective orders. | Gap, trading halt or unsupported stop for fractional shares. |
| S08.04 | Pause and resume | Pause new proposals/orders according to scope and preserve reconciliation of submitted orders. | Fill arrives after pause and must still be accounted for. |
| S08.05 | Leader conflicts | Show opposing disclosed/inferred signals with their dates; apply a user-defined conflict policy. | Signals relate to different report periods. |
| S08.06 | Staleness and attribution | Use transaction/report/publication dates and provenance; never call old disclosures real-time trading. | Missing sale date or confidential holdings omitted. |

## S09: Get me into IPOs at the offer price

**Required systems/data:** Official issuer filings; participating broker offering feed; eligibility; allocation workflow.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S09.01 | IPO calendar | Track sourced issuer, offering status, estimated range and tentative dates; preserve revisions. | Rumor or withdrawn IPO appears as confirmed. |
| S09.02 | Access eligibility | Verify participating broker, user account eligibility and offering-specific restrictions. | Connected brokerage does not participate in the offering. |
| S09.03 | Window alerts | Detect actual indication-of-interest/allocation windows and closing timezone. | Offering opens briefly or timeline changes. |
| S09.04 | Allocation request | Distinguish indication, confirmed request, allocation and purchase; honor required review steps. | Oversubscribed offering allocates zero shares. |
| S09.05 | Offer-price execution | Reconcile actual allotted shares, final offering price and account funding. | User mistakes a first-day market order for IPO allocation. |
| S09.06 | Restrictions and expectations | Display actual flipping/holding restrictions and uncertain allocation; verify named example availability. | Assumed offering or broker access cannot be substantiated. |

## S10: Track pre-IPO companies for me

**Required systems/data:** Official issuer/SEC filings; entity resolution; fund disclosures; market/NAV data; scam evidence.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S10.01 | Company identity watches | Track exact legal entities and official announcements for named private companies. | Same-name token claims to represent company ownership. |
| S10.02 | Filing alerts | Detect public S-1/other relevant filings and amendments with accession IDs and dates. | Confidential filing cannot be observed publicly. |
| S10.03 | IPO readiness facts | Separate filed, effective, priced and trading states from speculation. | News prediction is presented as an announced listing. |
| S10.04 | Proxy exposure | Read a fund's actual portfolio, valuation dates, dilution and concentration. | Fund has only small or indirect exposure to target company. |
| S10.05 | NAV-premium math | Compare sourced NAV per share and same-currency market price, showing premium and valuation lag. | Stale private marks produce misleading precision. |
| S10.06 | Scam-token triage | Verify issuer relationship and rights against authoritative disclosures; block unverified destinations from execution. | Token uses branding but conveys no shares or redemption rights. |

## S11: Invest my money automatically

**Required systems/data:** Trigger engine; available cash; broker capability; task approvals; mandates/stop controls.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S11.01 | Recurring buys | Create schedule, security/account, sizing and funding rule; issue approval-gated orders at each occurrence. | Holiday or unsupported fractional sizing. |
| S11.02 | Round-up investing | Use settled eligible purchases, reversals and batch limits; allocate once then create an investment proposal. | Pending charge disappears or purchase is refunded. |
| S11.03 | Paycheck allocation | Recognize payroll, split deposits and corrections; reserve eligible user-selected amount without doubling triggers. | Salary arrives in two accounts. |
| S11.04 | Cash sweep proposals | Compute surplus after obligations, protected buffer and pending orders, with complete disclosed coverage. | Apparent surplus is a provisional credit. |
| S11.05 | Drift-triggered buys | Use user targets, buy-only feasibility and combined exposure caps; avoid duplicate outstanding orders. | Insufficient cash makes target unreachable. |
| S11.06 | Kill switch | Pause triggers and pending authorizations atomically; retain reconciliation and explain already-submitted orders. | Order fills as stop is requested. |

## S12: Manage my subscriptions

**Required systems/data:** Bank history; email/contracts; merchant identity; verified workflows; outcome monitoring.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S12.01 | Recurring discovery | Link account-specific repeated charges and contract notices over stated history coverage. | Annual plan cannot be inferred from 90 days alone. |
| S12.02 | Cancellation workflow | Resolve exact plan and effective terms, obtain approval and use verified provider route. | Wrong household account or MFA challenge. |
| S12.03 | Trial conversion guard | Use actual conversion deadline and cutoff with timezone; monitor chosen keep/cancel decision. | Provider changes deadline or cancellation fails. |
| S12.04 | Price-hike detection | Compare comparable bill/plan periods and notices, separating usage, tax and one-time fees. | Usage increases but base rate stays constant. |
| S12.05 | Cancellation proof | Capture merchant receipt/effective date and subsequent authoritative charge coverage. | Stale feed incorrectly implies no future charge. |
| S12.06 | Exceptions and refunds | Track legitimate final invoice, renewed charge and refund request independently. | Canceled annual plan is nonrefundable. |

## S13: Handle my bills

**Required systems/data:** Obligations; authoritative billers; cash forecasts; payment capabilities; authorization/reconciliation.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S13.01 | Due reminders and pay offers | Discover current unpaid invoice/loan and offer supported payment with amount, fees, arrival and buffer. | Historical debit mistaken for current bill. |
| S13.02 | Pay-first ordering | Rank by consequences, due date, essential services and user priorities; show infeasible cash constraints. | Disputed demand would otherwise outrank essential rent. |
| S13.03 | Overdraft protection | Forecast designated funding account using fresh available funds and pending obligations; propose permitted top-up. | Transfer arrives after bill cutoff. |
| S13.04 | Autopay management | Read arrangement and pending charge, set up through supported route and verify activation. | New agent payment duplicates provider autopay. |
| S13.05 | Utility spike diagnosis | Use statement usage/tariff/period/taxes to explain supported cause. | No usage data exists to substantiate diagnosis. |
| S13.06 | Payment application | Submit once and reconcile settlement, correct creditor allocation and returns. | Bank debited but payment allocated to wrong loan. |

## S14: Negotiate my recurring costs down

**Required systems/data:** Contracts/bills; current comparable offers; user negotiation limits; reviewed drafts.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S14.01 | Internet script | Use actual plan, usage, contract and local competitor availability; draft truthful retention request. | Competitor price excludes required fees. |
| S14.02 | Insurance script | Compare equivalent limits/deductibles and licensed quotes; preserve coverage requirements. | Cheaper quote reduces essential protection. |
| S14.03 | Subscription script | Use current plan, usage and dated eligible offers; identify commitments and lost features. | Retention offer extends contract or adds an annual prepayment. |
| S14.04 | Competitor evidence | Store source/date/geography and total cost for every cited alternative. | Expired offer or user ineligible for advertised rate. |
| S14.05 | Rent-on-card math | Compute processing fee, actual earned rewards, interest risk and net cost with user's terms. | Carry balance wipes out rewards. |
| S14.06 | Savings verification | Track accepted terms and actual later bills; distinguish offered discount from realized savings. | Promo savings expire sooner than projected. |

## S15: Find class-action money I qualify for

**Required systems/data:** Official settlement sources; purchase/residence history; eligibility evidence; deadlines.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S15.01 | Settlement discovery | Ingest authentic administrator/court notices and current claim windows. | Paid lead site masquerades as official administrator. |
| S15.02 | Life matching | Match confirmed product/service/date/location evidence; label probable rather than certain eligibility. | Same merchant but excluded product or purchase period. |
| S15.03 | Eligibility assessment | Evaluate class definition, exclusions, prior claims and required attestations. | User already claimed elsewhere. |
| S15.04 | Deadline tracking | Store submission/objection deadlines distinctly with jurisdiction/timezone. | Extension changes previously scheduled reminder. |
| S15.05 | Proof guidance | List exact required records and accepted alternatives; draft only truthful responses. | User lacks receipt and cannot attest a fabricated purchase. |
| S15.06 | Payout estimates | Show formula, uncertainty, caps and potential pro-rata dilution; count actual received money separately. | Advertised maximum confused with expected payment. |

## S16: Tell me what I'm spending money on

**Required systems/data:** Canonical transactions; merchant identity; categorization; corrections; accounting history.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S16.01 | Auto-categorization | Classify with confidence and user overrides; preserve account/currency and original evidence. | Mixed-use merchant or unfamiliar business. |
| S16.02 | Transfer exclusion | Pair owned-account transfers and card payments to avoid double counting. | AUTOPAY utility or Zelle rent misclassified as a transfer. |
| S16.03 | Monthly reporting | Reconcile posted expenses, refunds and period coverage to account history. | Refund arrives in a later month. |
| S16.04 | Merchant breakdown | Group normalized merchant identity while retaining distinguishable plans/accounts. | Two unrelated merchants have similar names. |
| S16.05 | Year-over-year comparisons | Align periods, history coverage, currency and category definitions. | New account creates artificial spending growth. |
| S16.06 | Search and drill-down | Return exact contributing transactions and correction history for each total. | Category edit fails to update derived report. |

## S17: Build and enforce my budget

**Required systems/data:** Real cash/income/obligations; category rules; forecast; alerts; consented controls.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S17.01 | Budget construction | Use observed net income, necessary costs, goals and history coverage; expose assumptions. | Irregular income makes average misleading. |
| S17.02 | Category limits | Define periods, rollover, ownership and inclusion rules in a versioned budget. | Joint expense counted at full amount for both people. |
| S17.03 | Pre-limit warnings | Forecast committed and expected spend before threshold, with explainable uncertainty. | Pending charge later disappears. |
| S17.04 | Subscription accounting | Include subscription charge once in correct category and period. | Subscription appears both as fixed bill and separate expense. |
| S17.05 | Enforcement meaning | Implement alerts and supported user-authorized controls; disclose inability to block unsupported external purchases. | User assumes budget can decline any bank-card transaction. |
| S17.06 | Adjustments and outcomes | Apply user changes and refunds consistently; reconcile actual versus planned. | Month-end edit rewrites historical targets without versioning. |

## S18: Make sure I survive to payday

**Required systems/data:** Account-specific forecast; essential spend; obligations; verified payroll; prioritization.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S18.01 | Payday identification | Identify each reliable income stream and next expected pay date with confidence. | Bonus or transfer mistaken for regular salary. |
| S18.02 | Burn-rate model | Separate essential/variable costs and seasonality from transfers; disclose missing cash spending. | One unusual month distorts daily burn. |
| S18.03 | Bill-versus-paycheck timeline | Model unpaid/pending obligations and payroll timing by account. | Bill due today incorrectly advanced to next cycle. |
| S18.04 | Shortfall detection | Find projected minimum balance and date under stated scenarios. | Delayed paycheck or annual bill not in recent history. |
| S18.05 | Payment order | Explain essential/deadline/consequence priorities and user constraints without blindly paying disputed debts. | Available cash cannot cover all minimums. |
| S18.06 | Recovery plan | Offer realistic changes, supported transfers or assistance with effects and approval needs. | Unapproved credit or earnings presented as guaranteed rescue. |

## S19: Connect all my money accounts in one place

**Required systems/data:** Connection registry; normalized accounts; incremental sync; identity; history/retention.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S19.01 | Multiple banks | Maintain separate connection/item secrets and account identities per institution. | Linking second bank overwrites first token. |
| S19.02 | Brokerage aggregation | Import holdings, cash, transactions and valuation dates with explicit coverage. | Broker supports read access but not trading. |
| S19.03 | Balance normalization | Separate available/current cash, liabilities, credit limits and ownership/currency. | String balance concatenates or credit limit counted as wealth. |
| S19.04 | Transaction search | Index stable transactions across sources with account-aware pending/posted lineage. | Relink changes provider transaction IDs. |
| S19.05 | Connection repair | Handle revoked consent, MFA, partial outage and unsupported products without substituting data. | Missing token silently falls back to another user's secret. |
| S19.06 | Clean disconnect | Revoke provider access and stop new sync/actions; retain explicitly permitted history and distinguish account deletion. | Disconnect one institution removes unrelated history. |

## S20: Watch my cash flow daily

**Required systems/data:** Bank sync; pending/posted matching; income detection; monitor queue; notifications.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S20.01 | Low-balance alerts | Use designated available balance and source age; evaluate protected buffer and near-term obligations. | First returned account is a brokerage or credit account. |
| S20.02 | Paycheck landing | Match posted payroll against expected stream, amount and split deposits. | Replayed sync sends repeated celebrations. |
| S20.03 | Duplicate charges | Identify same-account probable duplicates with explanatory evidence and confidence. | Pending authorization and posted charge treated as two charges. |
| S20.04 | Pending reconciliation | Update pending-to-posted identity and amount without duplicate expenses. | Restaurant tip changes final amount. |
| S20.05 | Balance reconciliation | Explain holds, transfer timing and covered-through data rather than fabricate a missing transaction. | Provider balance newer than its transaction coverage. |
| S20.06 | Daily reliability | Run per-user timezone with paging, retries and dedupe; surface stale data clearly. | Worker outage causes missed or repeated alerts. |

## S21: Brief me on my money every morning

**Required systems/data:** Financial model; due events; notification preferences; outbox; summary provenance.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S21.01 | Morning schedule | Persist user timezone, delivery time and quiet-hour preference; one brief per local day. | DST transition or travel changes device timezone. |
| S21.02 | Balance summary | Show supported fresh cash/debt/investment balances with timestamps and coverage. | One bank feed fails while others succeed. |
| S21.03 | Overnight activity | Summarize relevant posted changes since prior successful brief. | Delayed transactions arrive with earlier transaction dates. |
| S21.04 | Due and attention queue | Include unpaid bills, expiring approvals, failed actions and missing evidence, urgency ranked. | Autopay-covered bill incorrectly prompts another payment. |
| S21.05 | Weekly deeper review | Reconcile weekly change, goals, opportunities and outstanding tasks using a stable period. | Week crosses month/year boundary. |
| S21.06 | Delivery and relevance | Track delivery, avoid sensitive household disclosures and support snooze/frequency changes. | Transport retries the same outbound message. |

## S22: Alert me to anything unusual

**Required systems/data:** Account-aware anomaly/fee detection; prioritization; event registry; messaging preferences.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S22.01 | Spending anomalies | Compare relevant personal baseline with explainable amount/frequency/merchant signals. | Travel or known large purchase produces excessive alarms. |
| S22.02 | Fees and spikes | Recognize posted fees and comparable recurring-price changes with evidence. | Refunded fee still counted as a new loss. |
| S22.03 | Urgency ranking | Combine deadline, potential loss, confidence and user context with explicit escalation rules. | Low-confidence signal crowds out imminent payment failure. |
| S22.04 | Quiet hours | Use user's stored timezone and chosen urgent exceptions. | UTC scheduling sends nonurgent alert at 3 AM. |
| S22.05 | Snooze lifecycle | Store event/rule scope and expiration; resurface only if still relevant or materially changed. | Snoozed price alert reappears on every sync. |
| S22.06 | Dedupe and correction | Uniquely identify findings and update/retract changed evidence; delivery retries preserve one logical alert. | Two workers detect same fee or later reversal. |

## S23: Find me ways to make extra money

**Required systems/data:** Verified offer catalog; eligibility; evidence; dependency planner; payout tracking.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S23.01 | Catalog trust | Require source, last verification, geography, payout mode and expiry; remove unsupported promises. | Stale route remains labeled verified. |
| S23.02 | Fastest-$100 planning | Filter by eligibility, payout timing, costs, capacity and cash requirements; distinguish expected from guaranteed earnings. | Task pays in points or has a long cash-out delay. |
| S23.03 | Exact steps | Render current provider workflow, prerequisites and truthful evidence requirements. | Instructions require a missing device or employment status. |
| S23.04 | Route stacking | Model dependencies, overlapping time/funds and eligibility conflicts into one feasible plan. | Two bank bonuses require same limited direct deposit. |
| S23.05 | Offer legitimacy | Validate user-supplied offer against official identity/terms before recommending signup. | Upfront fee or impersonated payment destination. |
| S23.06 | Outcome evaluation | Track application, completion, pending payout and actual receipts separately. | Advertised maximum recorded as earned immediately. |

## S24: Track my money-making progress

**Required systems/data:** Offer terms; requirements ledger; event matching; bank/reward payouts; goals.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S24.01 | Requirement checklists | Version bonus terms and track qualifying deposits, balances, actions and deadlines. | Generic transfer does not qualify as direct deposit. |
| S24.02 | Progress evidence | Link each completed requirement to confirmed source events. | User checkbox claims requirement provider has not accepted. |
| S24.03 | Payout schedule | Track promised payment date and legitimate delays with next follow-up. | Bonus pending beyond stated window. |
| S24.04 | Payout reconciliation | Allocate actual credit to one offer, including partial/withheld/reversed amounts. | One bank credit falsely completes two offers. |
| S24.05 | $1,000 goal | Sum confirmed net earnings separately from pending/potential earnings and costs. | Referral credit confused with withdrawable cash. |
| S24.06 | Exception handling | Explain missing requirement and prepare an evidence-based support request. | Account closure forfeits earned-but-unpaid bonus. |

## S25: Plan my taxes

**Required systems/data:** Year-specific rules; payroll/gig income; withholding; documents; household facts.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S25.01 | Bracket positioning | Compute taxable income and marginal/effective effects from complete disclosed inputs. | Higher bracket incorrectly applied to all income. |
| S25.02 | Quarterly estimates | Model net self-employment income, withholding, prior payments and applicable safe-harbor rules. | Uneven earnings or multiple jobs/spouse income. |
| S25.03 | Deduction tracking | Link supported deductible categories to receipts, purpose and reimbursement status. | Personal expense categorized as business without evidence. |
| S25.04 | Donation tracking | Store eligible recipient, date, amount and required documentation; retain uncertain valuations. | Refunded donation or unsupported noncash value. |
| S25.05 | Roth/traditional education | Explain user-specific current tax effects and uncertain future assumptions without asserting individualized certainty. | Income/plan restrictions limit deductibility or eligibility. |
| S25.06 | Deadline/version management | Distinguish federal/state/year/form deadlines and extensions; update sourced rules centrally. | Chat and UI use different tax-year brackets. |

## S26: Manage my insurance

**Required systems/data:** Policies/endorsements; household assets/risks; licensed quotes; claim records.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S26.01 | Exposure inventory | Use actual insured assets, dependents, use and policies; identify unknown inputs. | Assume user owns a car or has dependents without confirmation. |
| S26.02 | Adequacy and limits | Compare coverage to explicit user circumstances and assumptions, with exclusions visible. | Marketing summary hides policy exclusion. |
| S26.03 | Gap/rider analysis | Name specific missing or uncertain riders and explain applicable scenario using policy references. | Duplicate benefits incorrectly called a coverage gap. |
| S26.04 | Renewal shopping | Track actual renewal/notice dates and comparable partner quotes. | Cheaper quote changes deductible or leaves a coverage gap. |
| S26.05 | Claims walkthrough | Provide policy-specific evidence/deadline steps and track case status without unauthorized filing. | Claim request sent but no insurer receipt. |
| S26.06 | Deductible math | Calculate user exposure under deductible, limits, coinsurance and event assumptions. | Health plan coinsurance mistaken for property deductible. |

## S27: Get me out of debt

**Required systems/data:** Liability balances/terms; cash budget; payoff simulation; current eligible refinance offers.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S27.01 | Debt inventory | Collect balances, APR schedules, minimums and due dates by creditor/loan. | Missing minimum or deferred-interest terms. |
| S27.02 | Avalanche versus snowball | Simulate identical payment budgets, rate changes and rollover payments for both strategies. | Minimums exceed affordable payment pool. |
| S27.03 | Payoff dates | Return feasible payoff ranges and remaining balances; identify negative amortization explicitly. | 600-month simulation truncation falsely labeled debt-free. |
| S27.04 | Balance-transfer math | Include fees, promo duration, eligible limit and post-promo balance. | Lower APR still costs more because payoff misses promo end. |
| S27.05 | Consolidation analysis | Compare total cost/term/fees and lost protections using sourced eligible terms. | Lower monthly payment disguises longer and costlier debt. |
| S27.06 | Plan monitoring | Track real principal progress and changing terms; update plan after payments or income changes. | Payment applies to fees rather than expected principal. |

## S28: Build and protect my credit

**Required systems/data:** Consented credit report/score partner; issuer statements; payment history; official guidance.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S28.01 | Utilization tracking | Read reported/current balances, statement dates and credit limits by account. | Paydown after closing date does not affect current report. |
| S28.02 | Score monitoring | Display bureau/model/date and real supported coverage. | Bank transaction data presented as a credit score. |
| S28.03 | Movement explanations | Associate report-factor changes with qualified explanations rather than exact invented causal points. | Several factors change at once. |
| S28.04 | Late-payment recovery | Draft truthful provider requests and dispute paths based on actual status/evidence. | Accurate late mark promised removal automatically. |
| S28.05 | Protection checks | Flag unknown accounts/errors and provide official freeze/dispute workflows. | Authorized new account incorrectly reported as identity theft. |
| S28.06 | Action consequences | Explain inquiry, timing and affordability effects before any supported credit action. | Limit request entails an undisclosed hard inquiry. |

## S29: Build my emergency fund

**Required systems/data:** Essential-cost model; liquid balances; goals; contribution planner; transfers/approvals.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S29.01 | Expense-sized target | Use essential recurring costs, income stability, dependents and explicit chosen months. | One-time expense inflates essential monthly baseline. |
| S29.02 | Accessible reserves | Count eligible liquid owned funds, excluding credit limits and locked/committed assets. | CD or tax reserve treated as immediate emergency cash. |
| S29.03 | Dollar gap | Compute target less exclusively allocated reserves with coverage shown. | Same cash allocated simultaneously to multiple goals. |
| S29.04 | Months of readiness | Divide usable reserve by essential burn under stated assumptions. | Zero or uncertain burn produces misleading infinity. |
| S29.05 | Contribution workflow | Propose feasible contributions after protected bills/buffer and verify transfers. | Savings rule overdrafts checking before rent. |
| S29.06 | Protection and recovery | Track withdrawals, changing costs and pause controls; adjust contributions responsibly. | Emergency withdrawal leaves displayed progress unchanged. |

## S30: Teach me how money works

**Required systems/data:** Verified educational sources; user context; explanation quality; boundaries.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S30.01 | Term explanations | Define concepts in plain language with a concrete example and correct units. | APR confused with APY or nominal with real returns. |
| S30.02 | Strategy explanation | Show mechanics, assumptions, costs and tradeoffs before applying a strategy. | Leverage benefits explained without downside mechanics. |
| S30.03 | Headline translation | Explain event, source/date and relevance without inventing causation. | Old headline treated as current market news. |
| S30.04 | Myth checks | Identify the claim and give sourced factual correction with uncertainty where needed. | Unsupported absolute claim replaces the original myth. |
| S30.05 | Personalized examples | Use confirmed user numbers or clearly labeled hypothetical amounts. | Invented income or holdings appear as user facts. |
| S30.06 | Understanding and next step | Offer a relevant follow-up/action boundary, with correction when sources change. | Educational answer becomes an unauthorized financial action. |

## S31: Protect me from scams

**Required systems/data:** Trusted identity graph; URL/domain analysis; offer/disclosure evidence; payment preflight.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S31.01 | Phishing triage | Analyze sender, domain, requested action and official contact verification without executing embedded instructions. | Email prompts agent to reveal tokens or ignore policy. |
| S31.02 | Fake investments | Check issuer identity, security rights and authoritative offering evidence. | Copied branding used by unregistered impersonator. |
| S31.03 | Pre-IPO tokens | Distinguish documented economic/legal rights from a name-associated token. | Token claim implies direct private-company shares without evidence. |
| S31.04 | Payee verification | Validate payment destination and changes through trusted independent channels. | Invoice bank details changed in a compromised email. |
| S31.05 | Payment intervention | Hold suspicious/unknown destinations before submission and explain evidence; require appropriate resolution. | Low-confidence detector silently approves a risky recipient. |
| S31.06 | Incident response | Track already-submitted exposure, contact steps and user-authorized recovery actions. | Agent implies it can reverse an irreversible transfer. |

## S32: Ask my permission before moving money

**Required systems/data:** Immutable proposals; policy; consent; expiry; atomic attempts; kill switch; receipts.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S32.01 | Specific approval | Display action, destination, account, amount/currency, fees and relevant terms; bind one explicit approval to that snapshot. | Ambiguous yes with multiple proposals active. |
| S32.02 | Approval expiry | Expire proposals on time or material fact changes; request fresh review. | Price/amount changes after approval. |
| S32.03 | Replay protection | Reserve one attempt per authorization/obligation and preserve idempotency across retries. | Client retries after a processor timeout. |
| S32.04 | Preflight validation | Recheck identity, unpaid state, funds, scope and source freshness immediately before submission. | Approval valid but funds depleted by another action. |
| S32.05 | Kill switch | Cancel pending permissions and reserved work; disclose already-submitted actions accurately. | Worker and stop request race. |
| S32.06 | Receipts and reconciliation | Store external IDs and immutable evidence; distinguish submission, settlement and verified application. | HTTP success represented as final financial success. |

## S33: Show me everything you've done

**Required systems/data:** Append-only audit events; task lineage; receipts; timezone/search; complete paging.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S33.01 | Day/month history | Query complete event history in user timezone with pagination. | More than 1,000 records silently omitted. |
| S33.02 | Natural-language queries | Resolve last Tuesday and action filters to actual dated ledger records. | Locale/timezone changes relative-date interpretation. |
| S33.03 | Action lineage | Link detection, proposal, approval, attempt, external events and final outcome. | Failed action disappears from history. |
| S33.04 | Receipt retrieval | Provide scoped authenticated access to evidence with redaction and provenance. | Receipt URL exposes another user's account. |
| S33.05 | Honest summaries | Answer what occurred and remains pending with ledger citations; never infer success from an approval. | Submitted order has no fill yet. |
| S33.06 | Audit integrity | Prevent client tampering and preserve append-only chronology, including corrections/returns. | User or service code attempts to rewrite an old outcome. |

## S34: Help me hit my savings goals

**Required systems/data:** Goal ledger; exclusive balance allocations; forecast; event messaging; transfer proposals.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S34.01 | Goal definition | Capture amount, date, currency, priority and ownership with confirmed intent. | Vague save more request becomes invented target. |
| S34.02 | Weekly plans | Calculate feasible contributions alongside bills, buffer and competing goals. | Weekly plan requires more than expected net income. |
| S34.03 | Actual progress | Track exclusive allocated balances/contributions and withdrawals. | One account dollar counted toward three goals. |
| S34.04 | Pace adjustment | Update finish date and required contribution after changes with transparent assumptions. | Missed contribution leaves unrealistic target date unchanged. |
| S34.05 | Contribution actions | Propose supported transfers within authorization and reconcile arrival. | Source debited but destination not credited. |
| S34.06 | Wins and nudges | Celebrate meaningful verified milestones with user frequency/quiet rules. | Same milestone repeatedly announced after sync retries. |

## S35: Give me my full financial picture

**Required systems/data:** Unified assets/liabilities; snapshots; coverage; explainable assessment models.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S35.01 | Net-worth calculation | Combine dated owned asset values and liabilities with correct signs/currency and duplicate suppression. | Debt tool key mismatch omits recorded debt. |
| S35.02 | Net-worth trend | Persist historical snapshots and corrections server-side; distinguish market moves from added coverage. | Newly linked mortgage appears as sudden financial loss. |
| S35.03 | Financial-health grade | Publish an explainable versioned heuristic and factors; distinguish it from bureau/lender judgments. | Incomplete coverage produces authoritative-looking grade. |
| S35.04 | Emergency readiness | Use accessible reserves and essential burn with uncertainty and ownership. | Locked retirement assets counted as emergency cash. |
| S35.05 | Biggest leak | Rank substantiated recurring costs/fees/interest and achievable net improvements. | Potential speculative earnings outrank actual expense leak. |
| S35.06 | Full-picture explanation | Show source dates, missing institutions and assumptions behind conclusions. | Disconnected account disappears without coverage warning. |

## S36: Plan big purchases and retirement

**Required systems/data:** Cash/debt/income model; current product costs; retirement assumptions; goal priorities.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S36.01 | House affordability | Model deposit, closing costs, mortgage, taxes, insurance, maintenance and cash buffer. | Monthly principal/interest alone presented as total ownership cost. |
| S36.02 | Car affordability | Include down payment, loan terms, insurance, running costs and depreciation assumptions. | Low installment hides large balloon payment. |
| S36.03 | Retirement pace | Project contributions, inflation, fees, return scenarios and drawdown with stated limitations. | Simple accumulation simulation mislabeled guaranteed retirement probability. |
| S36.04 | Scenario comparison | Compare user-selected timelines and costs on an isolated model. | Hypothetical buy/sell creates a real task. |
| S36.05 | Windfall allocation | Consider obligations, tax reserve, emergency fund, debt and goals with user priorities. | Provisional refund automatically invested. |
| S36.06 | Plan follow-through | Create dated milestones and approval-gated actions; update after actual progress. | Income or price change makes plan infeasible. |

## S37: Maximize my credit card rewards

**Required systems/data:** User card terms; merchant/category eligibility; rewards balances; annual fees.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S37.01 | Card inventory | Read confirmed owned cards, benefit version, reward rules and costs. | Suggest card the user does not own as if available. |
| S37.02 | Purchase selection | Compare eligible category/merchant reward rates, caps and payment fees. | Bonus category cap already exhausted. |
| S37.03 | Cashback tracking | Separate pending, posted, redeemable and redeemed rewards with reversals. | Returned purchase reward remains counted. |
| S37.04 | Annual-fee value | Calculate realistic net value from actual eligible spending and used benefits. | Full advertised benefit counted despite unused credit. |
| S37.05 | Redemption comparison | Use actual permitted redemption rates, fees and restrictions. | Points redemption valued at unsupported cash conversion. |
| S37.06 | Conflicts and honesty | Show cheapest/net-best option with sourced terms and disclosed incentives. | Affiliate compensation changes ranking. |

## S38: Split costs with other people

**Required systems/data:** Household consent; allocation ledger; participant identity; requests; payment matching.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S38.01 | Participant permissions | Identify people and explicit sharing/sending permissions. | Shared household exposes private account transactions. |
| S38.02 | Per-person math | Allocate fixed/percentage/usage shares, rounding and tax/fees with total conservation. | Three-way split loses or creates cents. |
| S38.03 | Family-plan comparison | Compare terms, eligibility, access changes and existing commitments. | Family merge violates household restrictions. |
| S38.04 | Roommate obligations | Track payer, due date, credits and each participant's share. | One participant pays landlord directly. |
| S38.05 | Collection reminders | Send authorized deduped requests/reminders with quiet hours and dispute handling. | Reminder repeats after partial payment. |
| S38.06 | Settlement ledger | Allocate received money to the right share and track outstanding/disputed balance. | One transfer incorrectly settles multiple IOUs. |

## S39: Close out my month

**Required systems/data:** Reconciled accounting ledger; period snapshots; categorization; obligations.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S39.01 | Income reconciliation | Match net earned income, gross/fee distinctions and transfers to real balances. | Loan proceeds counted as earnings. |
| S39.02 | Spending reconciliation | Handle pending items, refunds, reversals and card-payment duplication. | Posted correction changes previously reported total. |
| S39.03 | Variance analysis | Compare consistent covered periods/categories and explain contributing transactions. | New connection creates false month-over-month spike. |
| S39.04 | Subscription totals | Include each subscription once with actual period charges and annual allocation policy. | Annual prepayment counted as a monthly debit every month. |
| S39.05 | Bill and debt totals | Separate cash payments, interest, principal and remaining liabilities. | Debt payment counted as both expense and balance reduction twice. |
| S39.06 | Close/correction lifecycle | Save report coverage and version; label provisional close and amend with evidence. | Late-arriving statement silently rewrites the final report. |

## S40: Manage my freelance money

**Required systems/data:** Gig/payroll/invoice records; bank ledger; business allocations; tax estimates.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S40.01 | 1099 income | Reconcile gross earnings, platform fees, refunds and payouts with form-year provenance. | Net deposit compared directly to gross 1099. |
| S40.02 | Business separation | Use account/purpose/receipt evidence and editable mixed-use allocations. | Merchant name alone declares an expense deductible. |
| S40.03 | Quarterly set-asides | Calculate reserve assumptions from net profit, other income and withholding. | Flat reserve percentage misrepresented as exact liability. |
| S40.04 | Invoice receivables | Track issued invoices, partial payments, disputes and follow-ups. | Invoice sent treated as earned cash available now. |
| S40.05 | Expense evidence | Organize receipts, mileage and reimbursed costs with duplicate suppression. | Same receipt submitted for expense and reimbursement twice. |
| S40.06 | Cash planning | Forecast irregular collections and taxes with scenarios and protected funds. | Overdue client payment treated as certain payday. |

## S41: Move money between my accounts smartly

**Required systems/data:** Verified owned accounts; approved transfer rail; cash coverage; consent; reconciliation.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S41.01 | Account ownership | Verify source/destination, currency and transfer eligibility. | Same bank brand masks a third-party destination. |
| S41.02 | Sweep calculation | Use fresh available cash less obligations, reserves and pending transfers. | Held deposit treated as transferable funds. |
| S41.03 | Buffer protection | Reserve per-account user buffer and competing scheduled debits atomically. | Concurrent sweep and bill each consume same funds. |
| S41.04 | Transfer preview | Show amount, fees, cutoff, arrival and permitted source/destination. | Instant method incurs undisclosed fee. |
| S41.05 | Approval and submission | Require specific unexpired approval and stable provider idempotency key. | Timeout causes a second transfer. |
| S41.06 | Two-sided reconciliation | Track source debit, destination credit, settlement and returns in one transfer ledger. | Only one side posts; net worth is temporarily double counted. |

## S42: Automate my savings

**Required systems/data:** Typed triggers; dedupe; goals; protected cash; approvals; schedule/stop engine.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S42.01 | Rule creation | Convert user intent to explicit trigger, account, amount/share, caps and exclusions; surface ambiguity. | Save whenever I have extra lacks a defined reserve rule. |
| S42.02 | Round-ups | Compute settled eligible transaction deltas and reverse canceled purchases before proposing a batch. | Pending authorization and posted debit trigger twice. |
| S42.03 | Surplus sweeps | Use complete disclosed cash commitments and protected balances. | Tax reserve or rent money incorrectly counted as surplus. |
| S42.04 | Trigger evaluation | Persist event/rule-version IDs, cooldown and ordered processing. | Two workers or corrected events duplicate savings. |
| S42.05 | Authorization and execution | Separate scheduled proposals from permitted money movement; maintain explicit action approval under current product requirement. | Automatic rule interpreted as blanket permission. |
| S42.06 | Pause and outcomes | Pause all relevant rules in one control and reconcile already-submitted transfers. | Pause silently deletes history or promises to reverse submitted funds. |

## S43: Compare financial products for me

**Required systems/data:** Dated official product terms; eligibility; user usage; comparison engine; disclosure.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S43.01 | Fund comparison | Compare expense ratios, holdings, tracking, liquidity and tax features on equivalent scope. | Fund share classes or return periods differ. |
| S43.02 | Card comparison | Use eligible reward rates/caps, actual spending, fees and credit implications. | Advertised sign-up value ignores ineligible user. |
| S43.03 | Insurance comparison | Hold coverage/limits/deductibles constant and include exclusions and partner quote status. | Cheapest premium omits needed coverage. |
| S43.04 | Broker comparison | Show supported securities/order types, fees, custody and account requirements with sources. | Commission-free label hides material other costs. |
| S43.05 | Net-cost ranking | Compute net total under stated user assumptions; show sensitivity and unsupported inputs. | Temporary promo dominates long-term cost comparison. |
| S43.06 | Sources and no steering | Cite dated official terms, show honest cheapest suitable option and disclose compensation. | Partner payout overrides displayed ranking. |

## S44: Keep my financial documents organized

**Required systems/data:** Scoped encrypted files; OCR/extraction; indexing; provenance; retention/export.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S44.01 | Document intake | Ingest authorized uploads/mail attachments with size/type checks and scanning. | Malicious or unrelated sensitive attachment. |
| S44.02 | Classification | Extract document type, institution, account/year and confidence with user correction. | W-2 versus corrected W-2 misclassified. |
| S44.03 | Statements and policies | Link documents to account/policy and effective periods while retaining original. | Superseded endorsement treated as current policy. |
| S44.04 | Tax forms and receipts | Track expected missing forms, corrected versions and duplicate receipt copies. | Forwarded receipt creates duplicate deductible expense. |
| S44.05 | Search and retrieval | Return scoped full-text/metadata results and authenticated links with page references. | Cross-user search result or expired signed URL. |
| S44.06 | Tax-time package | Assemble reviewed year-specific manifest and exports with deletion/retention controls. | Incomplete document set presented as filing-ready. |

## S45: Track news that affects my money

**Required systems/data:** Sourced news/events; holdings/obligations/goals; relevance and uncertainty; alerts.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S45.01 | News sourcing | Preserve publisher, event/publication dates, corrections and source rights. | Old story recirculated as breaking news. |
| S45.02 | Holdings relevance | Map issuer/security exposures including disclosed fund coverage. | Ticker word collision generates irrelevant alert. |
| S45.03 | Bills relevance | Identify applicable tariff, provider, location and effective date. | National policy change does not apply to user's utility. |
| S45.04 | Goal relevance | Explain plausible effects on timelines/rates with explicit assumptions. | Speculation presented as a certain personal cost change. |
| S45.05 | Noise filtering | Prioritize user-material events, source quality and novelty with dedupe. | Multiple syndicated copies send repeated alerts. |
| S45.06 | Impact explanation | Distinguish measured change, forecast and inference, citing material claims. | Market drop attributed to one headline without evidence. |

## S46: Let me test ideas with paper trading

**Required systems/data:** Separate simulated accounts; licensed history/quotes; exchange calendar; fill model; strategy ledger.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S46.01 | Isolated fake money | Use separate account namespace and visible simulated balances/orders with no live tokens. | Paper order routed into live brokerage accidentally. |
| S46.02 | Order-type simulation | Model supported market, limit, stop/trailing and fractional semantics explicitly. | Bar data cannot establish intrabar event order. |
| S46.03 | Realistic fills | Specify bid/ask, slippage, liquidity, fees, session and fill assumptions; avoid using future prices. | Order placed after candle still fills at earlier low. |
| S46.04 | Strategy accounting | Track cash, holdings, realized/unrealized returns, costs and corporate actions. | Split creates fictitious gain or negative position. |
| S46.05 | Practice review | Compare benchmark/risk under the declared model; show simulation limitations. | Optimistic fake fills represented as expected real performance. |
| S46.06 | Graduation to live | Require new account linkage, permissions and fresh trade approvals; never replay historical paper orders. | One click unintentionally submits all simulated positions. |

## S47: Run my yearly financial review

**Required systems/data:** Covered-year accounting; investments; rules/documents; policies; goals; outcomes.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S47.01 | Spending review | Reconcile covered-year income/spending/fees with major changes and missing history. | Only 90 days available but report called full year. |
| S47.02 | Investing review | Use deposit-adjusted returns, allocation, fees and tax lots with coverage. | New brokerage balance mistaken for investment gain. |
| S47.03 | Tax review | Summarize source-backed paid/withheld/estimated amounts, documents and outstanding deadlines. | Prior-year facts silently used for new-year plan. |
| S47.04 | Insurance review | Check confirmed policies, exposures, renewal and comparable options. | Unknown coverage declared absent. |
| S47.05 | Goals and outcomes | Compare original/versioned goals to actual contributions and verified saved/recovered money. | Potential savings counted as achieved. |
| S47.06 | Next-year plan | Create prioritized achievable milestones and reviewed workflow proposals. | Annual review enables autonomous actions without consent. |

## S48: Fight unfair charges for me

**Required systems/data:** Bank/merchant evidence; dispute deadlines; draft templates; user-sent boundary.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S48.01 | Charge identification | Identify exact account, posted charge and alleged issue with user confirmation. | Legitimate repeated purchase or pending hold misidentified. |
| S48.02 | Evidence assembly | Collect receipts, cancellation/delivery records, communications and dates without fabrication. | Missing proof substituted by invented narrative. |
| S48.03 | Dispute drafts | Prepare factual issuer/merchant-specific request with source references and placeholders. | Wrong account or deadline appears in letter. |
| S48.04 | Fee-waiver requests | Reference actual fee and truthful circumstances, with no guaranteed success. | Draft claims bank promised reversal without evidence. |
| S48.05 | User-send boundary | Provide reviewed drafts and official routes; do not send/file in user's name under this scenario. | Generic communications tool sends automatically. |
| S48.06 | Outcome tracking | Track user-reported submission separately from official decision and allocated credit. | Provisional credit treated as final money recovered. |

## S49: Manage my dividend income

**Required systems/data:** Corporate announcements; holdings/lots; broker payments/DRIP; tax/currency data.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S49.01 | Dividend payouts | Reconcile actual gross/net dividends, withholding and account/source IDs. | Reinvested dividend counted as both cash and shares twice. |
| S49.02 | Upcoming dates | Track declared ex-date, record/pay dates and eligibility with source/time. | Estimated dividend presented as declared. |
| S49.03 | Entitlement calculation | Use eligible quantity and corporate action/settlement rules with confidence. | Holding acquired too late for dividend entitlement. |
| S49.04 | Yield on cost | Compute under explicit lot/adjusted-basis convention and distinguish from current yield. | Transferred holding has unknown cost basis. |
| S49.05 | DRIP controls | Read broker/account/security support and preview elected setting; require authorization for changes. | Broker does not allow per-security DRIP toggle. |
| S49.06 | Payment exceptions | Handle late/canceled/changed payouts, foreign currency and corrections. | Expected payment misses date but agent declares received. |

## S50: Find money owed to me

**Required systems/data:** Official property searches; residence/name history; referral/rewards ledgers; credit allocation.

| Atom | Capability | Required behavior and proof | Adversarial acceptance case |
|---|---|---|---|
| S50.01 | State-property discovery | Search relevant official sources using user-approved identity/residence history. | Same-name property belongs to another person. |
| S50.02 | Eligibility and proof | Prepare source-specific claim evidence and identify required user attestations. | Ownership inferred from name alone. |
| S50.03 | Referral tracking | Use unique qualifying paid-user events and actual reward terms. | Duplicate Stripe event creates repeated credit. |
| S50.04 | Unredeemed cashback | Read reward availability/expiry and supported redemption methods. | Pending rewards treated as withdrawable cash. |
| S50.05 | Recovery follow-through | Track submitted/pending/approved/paid states and source-linked receipts. | Sent application counted as recovered money. |
| S50.06 | Exclusive outcome accounting | Allocate each credit once and distinguish cash, account credit and noncash value. | One refund completes two recovery requests. |

