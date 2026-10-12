// The owner's "Full Agent Capability List" (2026-10-11), bullet by bullet, against the code. Read by
// scripts/capability-list.cjs, which derives each bullet's status from the registry (packages/capabilities/registry.json)
// and the REACHABLE list below, writes docs/capability-list/README.md, and fails (--check) on drift.
//
// Per bullet: [n, registry ids, coverage, note, conflict]
//   n         the bullet's position in the doc (1..149, in order; the parser checks the text prefix too)
//   ids       registry capabilities that implement it ("" when nothing does)
//   coverage  how much of the bullet those capabilities cover once built: "full", "part" (the note says which piece),
//             "none" when no capability is registered for it
//   conflict  a standing owner rule the bullet runs into as written (CLAUDE.md), or null
//
// REACHABLE: capabilities a person can reach in the product on this branch today, through the chat's flow router
// (send, split, trade, cancel), the financial planner's read tools (financial_tools.ts) or a deployed function. Kept
// conservative: a module that only passes offline tests is not here. Nothing on this list is proven live yet.
const REACHABLE = {
  "PAY-001": "chat: send flow (staged handoff in the person's app)",
  "PAY-002": "chat: send flow, new recipient read-back",
  "PAY-004": "chat: split flow (requests staged in the person's app)",
  "PAY-020": "chat: daily and weekly send limits",
  "PAY-021": "chat: first send to a new handle confirmed in full",
  "INV-001": "chat: trade flow reads the live portfolio",
  "INV-011": "chat: trade flow, live, $5 cap",
  "INV-012": "chat: trade flow, live, $5 cap",
  "INV-024": "chat: advice guard on every trade message",
  "BILL-003": "chat: cancel flow (stops honestly where the merchant's terms can't be read)",
  "ACCT-006": "app: SimpleFIN and Plaid linking functions",
  "ACCT-018": "chat: planner tool get_cash_position; runway in days, \"how long will my money last\" (TheNumbers, 86-the-numbers.js)",
  "TXN-001": "chat: planner tool search_transactions",
  "TXN-002": "chat: planner tool search_transactions",
  "TXN-011": "chat: planner tool get_pending_transactions",
  "ANL-002": "chat: planner tool get_spending_income_report",
  "ANL-013": "chat: planner tool get_posted_flow_report (top merchants)",
  "TXN-009": "chat: planner tool get_recovery_report (duplicate charges)",
  "SAVE-004": "chat: planner tool get_recovery_report (fees)",
  "CORE-002": "chat: honest capability answers",
  "CORE-009": "chat: confirmation cards",
  "CORE-014": "app: delete-account function",
  // Section 2 wiring (2026-10-11): the hourly agent-proactive run (pg_cron, scheduled by go-live) delivers into the
  // person's "Updates from Upmore" chat thread; settings are said in chat (supabase/functions/_shared/proactive.ts).
  // Evidence: tests/edge/proactive.test.ts, tests/proactive-wiring.test.cjs, tests/db/proactive.test.sql.
  "ALRT-001": "scheduler: low balance ahead, from the 30-day forecast, any hour (urgent)",
  "ALRT-002": "scheduler: a charge far above the usual, within the daily budget",
  "ALRT-003": "scheduler: unusual spending or a new merchant at a large amount, within the daily budget",
  "ALRT-004": "scheduler: a recurring bill posted higher, within the daily budget",
  "ALRT-007": "scheduler: a paycheck-sized deposit landed",
  "ALRT-008": "scheduler: a fee charged today",
  "ALRT-010": "chat: \"tell me when checking drops below $500\" saves a watch; the scheduler fires it, budget-exempt",
  "ALRT-011": "chat: \"quiet hours 10pm to 7am\"; the scheduler holds all but safety and watches",
  "ALRT-012": "scheduler: one unrequested note a day, four a week (AgentLoop budget)",
  "ANL-005": "chat: \"how much can i spend\" until the payday read from deposits (TheNumbers, 86-the-numbers.js); scheduler: the morning brief, after \"turn on the morning brief\" (8 a.m. local)",
  // Section 1 "The numbers" (overnight E1-E7, 2026-10-12): direct chat answers from the person's own rows through
  // agent-chat/_shared/money_answers.ts. Evidence: tests/the-numbers.test.cjs, tests/edge/the-numbers.test.ts,
  // tests/depth-NUMBERS.test.cjs (docs/depth/NUMBERS.md).
  "ACCT-004": "chat: \"what's my net worth\" today, untyped and foreign accounts listed apart (TheNumbers)",
  "ANL-006": "chat: \"forecast\", 90 days on repeating bills and paychecks with the assumptions listed (TheNumbers)",
  "ANL-007": "chat: \"what bills are coming up\", bills, paydays and renewals for 30 days (TheNumbers)",
  "TXN-005": "chat: \"what bills are coming up\" lists the repeating charges detected from the person's own rows, monthly and yearly (TheNumbers upcoming over AgentLedger.recurring)",
  "ANL-020": "scheduler: the weekly recap, Sundays by default; \"send me a weekly recap on Fridays\" moves it",
  "BILL-002": "scheduler: the save engine's price-rise finding",
  "BILL-010": "scheduler: a trial the person tracks in the app warns within 7 days of the first charge",
  "CORE-004": "chat: \"every Friday tell me my food spend\" saves a standing report; the scheduler sends it",
  // Section 1 "Spending" items 12 and 13 (2026-10-12): direct chat answers through agent-chat/_shared/money_answers.ts
  // (SpendingViews, 94-spending-views.js). Evidence: tests/edge/spending-views.test.ts (through moneyReply),
  // tests/spending-views.test.cjs, tests/depth-SPEND-VIEWS.test.cjs (docs/depth/SPEND-VIEWS.md).
  "TXN-021": "chat: \"how does this month compare to last month\", this month so far against the same days of last month (SpendingViews)",
  "ANL-009": "chat: \"am I spending more than usual\" against the average of the last 3 full months, by category with \"on food\" (SpendingViews)",
  "CARD-001": "chat: \"spending by card\", each linked card and account with its spending, share and top places (SpendingViews)",
  // Item 8 (2026-10-12): the person's category rules (95-category-rules.js), a settings command in _shared/proactive.ts
  // read back by money_answers.ts and budget_answer.ts. Evidence: tests/edge/category-rules.test.ts,
  // tests/depth-CATEGORY-RULES.test.cjs (docs/depth/CATEGORY-RULES.md), tests/db/category_rules.test.sql.
  "TXN-003": "chat: \"recategorize Target as groceries\" saves the person's rule; spending answers and budgets count by it (CategoryRules)",
  // Item 5 (2026-10-12): AgentProactive.connections through plan(). Evidence: tests/edge/connection-notes.test.ts,
  // tests/depth-PROACTIVE.test.cjs S18-S22.
  "ACCT-005": "scheduler: a bank SimpleFIN stopped updating, or rows nobody refreshed, said once with where to fix it",
  // Item 26 (2026-10-12): the year in money, a direct chat answer through agent-chat/_shared/money_answers.ts
  // (YearInMoney, 96-year-in-money.js). Evidence: tests/edge/year-in-money.test.ts (through moneyReply),
  // tests/year-in-money.test.cjs, tests/depth-YEAR.test.cjs (docs/depth/YEAR.md).
  "ANL-012": "chat: \"my year in money\", \"how did 2026 go\": this year so far or a named year from the person's own rows; dollars Upmore saved only from a confirmed record, and none is on record yet (YearInMoney)",
  // Items 85 and 87 (2026-10-12): buy now, pay later read from the person's own rows (97-bnpl.js, dated provider terms in
  // packages/offers/bnpl-providers.json) through agent-chat/_shared/money_answers.ts. CRDT-008 is reachable for pay-later
  // plans only; cards and loans are not in this answer. Evidence: tests/edge/bnpl-answer.test.ts (through moneyReply),
  // tests/bnpl.test.cjs, tests/depth-BNPL.test.cjs (docs/depth/BNPL.md).
  "CRDT-008": "chat: \"show my buy now pay later plans\", every Klarna, Affirm, Afterpay, Zip and PayPal Pay in 4 plan in the person's rows, what is left where the plan's shape makes it certain (Bnpl); cards and loans are not in it",
  // Item 39 (2026-10-12): dated deadlines (99-deadlines.js over packages/offers/deadlines.json, each date with its official
  // source and checked date) said by the hourly run's plan() 14 and 2 days before, and in chat through
  // agent-chat/_shared/deadlines_answer.ts. Evidence: tests/edge/deadlines.test.ts, tests/depth-DEADLINES.test.cjs
  // (docs/depth/DEADLINES.md).
  "TAX-010": "scheduler + chat: the federal Form 1040 date for everyone with alerts on, the extended date for people who said they filed an extension, rolled past weekends and legal holidays; \"when are taxes due\" (Deadlines)",
  "TAX-003": "scheduler + chat: federal estimated-tax dates, said on their own only to people who said \"I pay estimated taxes\"; \"when are quarterly taxes due\" (Deadlines)",
  "INS-009": "scheduler + chat: Medicare Open Enrollment and HealthCare.gov's January 1 coverage date for people who said they use them, and the work open-enrollment dates the person gave; \"when is open enrollment\" (Deadlines)",
};
const NO_PHONE = "No phone calls (owner rule)";
// Owner, 2026-10-11 night: automations are per-person toggles the person turns on in exact terms; until the owner says
// otherwise in writing, each run still asks for a one-line yes, and every order stays under the $5 cap.
const FRESH = "Allowed as a per-person toggle (owner, 2026-10-11); each run still asks that person for a yes and each order stays under the $5 cap, so it is not automatic yet. Not built";
const ONE_CANCEL = "One explicit approval per cancellation (owner rule): the agent asks first (\"should I cancel this for you?\") and cancels only on a yes, never on its own";
const NO_ADVICE = "No securities advice (owner rule): choosing positions for the person is advice unless it copies a named public source exactly";
const CAP_COPY = "The $5 per-order live cap (owner rule) makes a whole-portfolio copy impossible until the owner raises it in writing; every order also needs approval (one card can list them all)";
const NO_DIGITS = "Never store identity digits (owner rule): bureau freezes need SSN and identity answers, so the person does that step themselves";
const MAP = [
  // 1. See everything: accounts
  [1, "ACCT-006 ACCT-003", "part", "bank and card linking through SimpleFIN/Plaid; retirement, loans, BNPL, payroll and crypto aggregation not built", null],
  [2, "TXN-015", "part", "receipt attachment from email is a tested module; Gmail OAuth function exists, no reading pipeline in the chat", null],
  [3, "TXN-016 PAY-006", "part", "photos reach the chat model (spec 16, S16-11/12); no structured bill/statement/lease/pay-stub reader", null],
  [4, "ACCT-003 ACCT-016", "part", "list across linked institutions; finding forgotten accounts in email is not built", null],
  [5, "ACCT-005", "part", "the hourly run says a bank SimpleFIN stopped updating (named, since when, fix it on SimpleFIN Bridge) and rows nobody refreshed (tap \"Refresh connected bank\"), one note and one escalation each; the chat says when it can't read accounts; reconnecting is the person's on SimpleFIN Bridge (brokerage reconnect is in the app); nothing refreshes bank rows on a schedule yet (owner decision)", null],
  // spending
  [6, "ANL-013 ANL-001 TXN-022", "part", "by merchant reachable (planner); by person/place not built", null],
  [7, "ANL-002 ANL-001", "full", "planner spending report over a date range", null],
  [8, "TXN-003 CORE-006", "part", "chat: \"recategorize Target as groceries\" (and \"count Costco as shopping\", \"stop counting Target as groceries\", \"show my category rules\") saves the person's rule by merchant; every spending answer, the month comparison, spending by card, category budgets and their alerts count by it and say when a rule moved money; one charge on its own (\"that $40 Target run was groceries\") is not fixable yet, and the ledger's alert categories don't read the rules", null],
  [9, "ALRT-003 TXN-010", "part", "chat: \"anything unusual?\" lists, from the person's own rows over the last 30 days (7 for \"this week\"), charges over twice their usual, new merchants, same-day duplicates and fees (WhatsNew.unusual, tests/depth-WHATS-NEW S16-S18); the scheduler sends unusual and large charges (ALRT-003); triage of one unrecognized charge is the dispute answer", null],
  [10, "TXN-005 BILL-001 BILL-011 BILL-010", "part", "chat: \"what bills are coming up\" lists the repeating charges from the person's rows for the next 30 days, yearly renewals included; trials the person tracks warn through the scheduler; a trial nobody tracked is not found", null],
  [11, "TXN-006", "full", "", null],
  [12, "TXN-021 ANL-009", "full", "chat: \"am I spending more than usual\", \"this month vs last month\": this month so far against the same days of last month (day 12 vs day 12, said) and the average of the last 3 full months on file (how many said; none invented), the 3 categories that moved most; \"on food\" narrows it to that category and its average", null],
  [13, "CARD-001 ANL-001", "full", "chat: \"spending by card\", \"how much did I put on my amex\": each linked card and account for the period asked, its total, share and top 3 places, names as stored; the last 4 only where a row carries a mask, and the live account table has none yet", null],
  // the numbers
  [14, "ANL-005", "full", "chat: \"how much can I spend\" answers cash minus bills due by the payday read from deposits, total and per day (none found: 30 days, said); the opt-in morning brief gives the same number from the same function (tests/edge/proactive.test.ts)", null],
  [15, "ACCT-004 ANL-017", "part", "today's net worth in chat (untyped and foreign accounts listed apart); over time (ANL-017) is not reachable: no balance history is read", null],
  [16, "ANL-006", "full", "chat: \"forecast\": 90 days on repeating bills and paychecks, every assumption listed, everyday spending named as not included", null],
  [17, "ACCT-018 ANL-006", "full", "chat: \"how long will my money last\": days of cash at the average daily outflow of the last 90 days", null],
  [18, "ANL-007 BILL-007 HOUS-001", "part", "chat: \"what bills are coming up\": bills, paydays and renewals detected from the person's rows, 30 days; bills tracked by hand (BILL-007) and the rent rule (HOUS-001) are not on it", null],
  [19, "ANL-005 ANL-006 ANL-019", "full", "chat: \"can I afford $X (by when)\": yes within safe to spend, or the earliest day it fits on bills, paychecks and everyday spending; needs a dollar amount", null],
  [20, "ANL-019", "part", "cut/save what-ifs only; moves and job changes not modelled", null],
  [21, "CORE-010 ANL-005", "part", "chat: \"show me the math\" expands the section-1 numbers line by line (safe to spend, upcoming, runway, afford, net worth, forecast); balance, spending and the flows don't expand yet", null],
  // 2. reports
  [22, "NEWS-005 INV-001", "part", "not wired: the scheduler has no portfolio quotes or news feed yet; no daily close", null],
  [23, "NEWS-004 ANL-005", "part", "morning brief wired (opt-in by chat, 8 a.m. local): cash, safe to spend, bills due today; news and overnight actions not in it", null],
  [24, "ANL-020", "full", "weekly recap wired: money in, money out, top categories, the next 7 days; Sundays by default, day set by chat", null],
  [25, "ANL-002 ANL-012", "part", "monthly close wired on the 1st: in, out, kept, the biggest category change; not \"90 seconds\" of detail", null],
  [26, "ANL-012 SAVE-007 EARN-004", "part", "chat: \"my year in money\", \"year in review\", \"how did 2026 go\", \"annual review\": this calendar year so far in the person's zone, or a named past year read from its Jan 1: in, out and the net, categories by their own rules, the top 5 places, the biggest and the quietest full month, what repeating bills charged, refunds, pending and other currencies said; where the rows start or end is said, never a $0.00 year. Confirmed dollars Upmore saved or recovered: no record the chat can read confirms one (recovery cases carry no recovered amount; action_ledger rows are client-writable), so the review says none is on record and estimates nothing; SAVE-007 negotiated-bill savings and EARN-004 referral payouts are not in it; no yearly message is sent on its own", null],
  [27, "CORE-004 ALRT-010", "part", "standing reports wired for spending by category (\"every Friday tell me my food spend\"); other report kinds not yet", null],
  // alerts
  [28, "BILL-007 ALRT-001", "part", "the low-balance warning covers \"balance won't cover what's due\"; the brief and recap list bills due; no per-bill due alert", null],
  [29, "ALRT-001 SAVE-006", "full", "wired: low balance ahead (buffer by default $100 or the person's); a person's own floor by chat watch", null],
  [30, "ALRT-007 ANL-010", "part", "deposit landed is wired; a late or different-amount paycheck is not", null],
  [31, "ALRT-004 BILL-002", "full", "wired (alerts and the save engine)", null],
  [32, "BILL-010", "part", "wired for trials the person tracks in the app; a trial nobody tracked is not detectable from bank rows", null],
  [33, "TXN-009 ALRT-003", "part", "new merchant at a large amount wired; duplicate charges reach the chat (planner) and the save engine's fee scan, not a standalone alert", null],
  [34, "ALRT-002", "full", "wired", null],
  [35, "INV-009 INV-010", "part", "price alerts are a module; earnings-date alerts not built", null],
  [36, "INV-006 EARN-018", "full", "", null],
  [37, "CRDT-001 CRDT-006 CRDT-007", "part", "modules over a credit feed that is not connected", null],
  [38, "TXN-013 EARN-015 ALRT-010", "part", "chat: \"tell me if my $45.99 Amazon refund doesn't arrive by Oct 20\" (or \"within 7 business days\", \"by Friday\") is the person's own watch: the refund posting is said once to the cent, another credit from that merchant is said with the watch kept, and the day after the deadline with no matching credit it says so once with what was checked; the promised window is what the person says (a pasted merchant email is not read for it yet), and settlement payouts (EARN-015) are not watched this way; \"did my refund arrive?\" / \"did amazon refund me\" is answered from the person's rows (98-refund-check.js), none found offering the watch", null],
  [39, "TAX-010 TAX-003 INS-009 EARN-008 SAVE-020", "part", "federal tax dates (estimated tax only for people who said they pay it), Medicare and HealthCare.gov enrollment, and the FSA and work open-enrollment dates the person gives are said 14 and 2 days before and on ask, from dated official sources with their checked date (99-deadlines.js); class-action claim dates are not built (no verified settlement list on file); FSA and HSA contribution maximums (SAVE-020's max reminder) not built", null],
  [40, "SAVE-002 SAVE-008 CRDT-011", "part", "HYSA comparison and refinance watch are modules; insurance rebid not built", null],
  [41, "EARN-008 EARN-015", "part", "settlement and recall matching are modules", null],
  [42, "CORE-010 CORE-011 PAY-022", "full", "receipts and undo contracts in the flows; no action has a live receipt yet", null],
  [43, "CORE-010", "full", "every flow states failures plainly (tested); live failures replay as tests", null],
  [44, "CORE-010 SAVE-007", "full", "counted only on the provider's record (rule, tested)", null],
  // 3. investing: copy
  [45, "", "none", "copy trading is not built; the chat says so with the disclosure lag", CAP_COPY],
  [46, "", "none", "not built", CAP_COPY],
  [47, "", "none", "not built", FRESH],
  [48, "", "none", "not built (the stale-data warning exists in the refusal text)", null],
  [49, "", "none", "not built", CAP_COPY],
  [50, "", "none", "not built; theme baskets choose positions for the person", NO_ADVICE],
  [51, "INV-005", "part", "benchmark comparison not built", null],
  // buy, sell, manage
  [52, "INV-011 INV-012", "full", "live in the person's own Alpaca account, fresh approval, $5 cap; 0 live orders so far", null],
  [53, "INV-013", "full", "not built; the chat says so", FRESH],
  [54, "SAVE-001", "part", "round-up rules are a module for savings, not investing", FRESH],
  [55, "SAVE-022 INV-013", "part", "not built", FRESH],
  [56, "INV-014", "full", "module only (rebalance on approval); not wired to chat", null],
  [57, "INV-006", "part", "dividend tracking is claimed, not built; reinvesting is not built", FRESH],
  [58, "INV-011 INV-012", "full", "limit, stop and trailing orders in the trade flow (Rail 2); '10%' stops need a holding", null],
  [59, "EARN-018", "part", "idle-cash audit claimed, not built; sweeping is not built", null],
  [60, "INV-015 INV-016", "part", "candidates and wash-sale checks are modules; selling is the normal trade flow", null],
  [61, "", "none", "ACATS transfers not built", null],
  [62, "", "none", "crypto refused plainly today; no licensed crypto partner", null],
  // understand
  [63, "NEWS-005 INV-001", "part", "holdings read reachable; a one-paragraph 'why it moved' is not built", null],
  [64, "INV-005 INV-017", "part", "cost basis report is a module; benchmark and fees not built", null],
  [65, "INV-003", "full", "module only", null],
  [66, "NEWS-002 NEWS-003 NEWS-007", "part", "holding-linked news ranking is a module (news-feed function); earnings previews not built", null],
  [67, "INV-004", "part", "index overlap module; fund-vs-fund fees not built", null],
  [68, "INV-008 INV-009", "part", "price alerts module; watchlists not built", null],
  [69, "INV-017", "part", "gains report module; pre-trade tax preview not in the trade card", null],
  // retirement
  [70, "", "none", "IRA opening and funding not built", null],
  [71, "SAVE-019 EARN-005", "full", "module only", null],
  [72, "INV-019", "part", "rollover status module; finding old plans and executing a rollover not built", null],
  [73, "INV-018 TAX-009", "part", "contribution tracking module", null],
  // 4. bills and rent
  [74, "PAY-005 HOUS-002", "full", "rent is a standing flow (C110, 81-standing-rent.js): each month's card, on the person's yes, is staged for them to send in Zelle, Venmo, Cash App or PayPal; Upmore never pays rent itself (no portal, ACH or check rail)", null],
  [75, "PAY-006 BILL-008", "full", "bill pay is gated: the planner can preview a payment for a recorded bill, nothing is sent", null],
  [76, "PAY-006", "part", "not built", null],
  [77, "SAVE-006 PAY-009", "part", "overdraft-prevention move is a module; moving money is not built", null],
  [78, "PAY-006", "part", "not built (photos are read, no payment)", null],
  [79, "PAY-007", "part", "scheduled payments are a module; the chat says scheduling is not built", null],
  [80, "", "none", "not built", null],
  [81, "SAVE-005", "part", "fee refund request drafts are a module; late-fee waiver asks are not sent", null],
  [82, "HOUS-003", "full", "gated on a reporting partner", null],
  [83, "BILL-009", "part", "autopay audit claimed, not built", null],
  // BNPL
  [84, "", "none", "BNPL payments not built", null],
  [85, "CRDT-008", "part", "chat: \"show my buy now pay later plans\", \"what do I owe klarna\": every Klarna, Affirm, Afterpay, Zip and PayPal Pay in 4 plan read from the person's bank and card rows (provider from the descriptor, the store only when it names one), payments seen, the next date, and what is left only where the plan's shape makes it certain (a Pay in 4 whose first payment is in the rows); a monthly plan's total, a plan paid from an unlinked account and a provider's own balance are not in the rows, said as unknown; no provider connector", null],
  [86, "", "none", "not built", null],
  [87, "CRDT-008 ANL-006", "part", "chat, when asked (\"would a $400 afterpay plan push me negative\", \"will my bnpl payments push me negative\") and as a heads-up line on the plan list: the next 30 days from cash, the forecast's repeating bills and paychecks and the pay-later payments, lowest point and date, a new plan laid out on the provider's Pay in 4 terms; nothing warns on its own when a new plan starts (the scheduler does not run it)", null],
  [88, "", "none", "not built", null],
  // credit cards and debt
  [89, "CARD-006 CARD-007", "part", "due dates and guidance are modules; paying cards is not built", null],
  [90, "CARD-005 CRDT-005", "part", "utilization alert and plan are modules; paying early is not built", null],
  [91, "CRDT-009 SAVE-015 ANL-018", "full", "module only", null],
  [92, "CRDT-010", "part", "impact calculator module; sending extra money is not built", null],
  [93, "SAVE-016", "part", "not built", null],
  [94, "CARD-015", "part", "APR reduction draft claimed; not built", NO_PHONE + " (a written message is allowed)"],
  [95, "CRDT-016", "part", "debt-collector response drafts are a module; nothing is sent", null],
  [96, "PAY-001 PAY-002", "full", "staged in Venmo/Zelle/Cash App for the person to send; proof is the bank debit", null],
  // student loans
  [97, "CRDT-012", "part", "program eligibility check module; paying loans not built", null],
  [98, "", "none", "forms not built", null],
  [99, "", "none", "not built", null],
  [100, "CRDT-011", "part", "refinance rate watch module; no offers fetched", null],
  // credit health
  [101, "CRDT-001 CRDT-003", "part", "modules; no credit bureau connector", null],
  [102, "CRDT-004", "part", "dispute module drafts; nothing filed", null],
  [103, "CRDT-014 SEC-006", "part", "guidance, links and freeze-status tracking; Upmore does not freeze for the person", NO_DIGITS],
  [104, "CARD-016", "part", "drafts claimed, not built", null],
  [105, "CARD-002", "full", "module only", null],
  // 5. subscriptions
  [106, "BILL-003 BILL-017", "part", "cancel flow reachable; proof requires the merchant's record; most merchants stop at a guided handoff (1 verified playbook)", null],
  [107, "BILL-010 BILL-003", "part", "wired as an ask: before a tracked trial bills, the proactive message asks \"should I cancel it for you?\"; YES starts the cancel flow (its card is the approval) or gives the steps when the trial never charged; never automatic", ONE_CANCEL],
  [108, "BILL-013", "full", "no usage data; the chat asks which ones", null],
  [109, "BILL-012", "full", "module only", null],
  [110, "BILL-004", "full", "not built; the chat says so", null],
  [111, "BILL-006", "full", "not built", null],
  [112, "BILL-015 SAVE-005", "part", "refund request drafts for fees; renewal refunds not built", null],
  [113, "BILL-003", "part", "cancel flow; gym letters not built", null],
  [114, "BILL-003", "part", "web and chat paths only", NO_PHONE],
  [115, "", "none", "sign-ups not built", null],
  [116, "", "none", "not built", null],
  [117, "", "none", "not built", null],
  [118, "BILL-006", "part", "not built", null],
  [119, "", "none", "not built", ONE_CANCEL],
  [120, "", "none", "not built", null],
  [121, "BILL-018", "part", "reactivation watch only", null],
  [122, "BILL-005 BILL-014", "full", "negotiation claimed, not built", NO_PHONE],
  [123, "", "none", "not built (retention offers are noted, not requested)", null],
  [124, "BILL-016 PAY-004", "part", "one-off split requests reachable; monthly collection not built", null],
  [125, "", "none", "not built", null],
  [126, "", "none", "not built", null],
  // 6. splitting
  [127, "TXN-016 PAY-004", "part", "even splits reachable; itemized from a photo not built (the chat says so)", null],
  [128, "PAY-004", "part", "even, and a fixed share of your own; percent, income and by-item not built (the chat says so)", null],
  [129, "PAY-004 SOC-002", "part", "requests staged and marked paid when the credit lands; group tracking is a module", null],
  [130, "SOC-009 PAY-018", "part", "tone-controlled reminder drafts are a module; nothing is sent to other people", null],
  [131, "PAY-004", "part", "monthly roommate splits not built", null],
  [132, "PAY-019 SOC-002", "part", "settle-up suggestion module", null],
  [133, "PAY-004", "part", "split by amount reachable; picking 'last night's dinner' from the feed is not", null],
  [134, "PAY-017 SOC-003", "part", "IOU and running-balance modules; the chat says the IOU log is not built", null],
  [135, "PAY-001", "part", "a send to the requester is reachable; reading incoming requests is not", null],
  [136, "SOC-005 ANL-016", "part", "modules", null],
  [137, "SOC-006 ACCT-014", "part", "household view module", null],
  [138, "SOC-008", "part", "gifting module; pools not built", null],
  [139, "", "none", "not built", null],
  [140, "PAY-016", "full", "gated; the chat refuses other currencies", null],
  [141, "PAY-025 SOC-007", "part", "recurring family send module; dependent accounts gated", null],
  // 7. claims
  [142, "EARN-008", "full", "module only (matching); no live settlements source", null],
  [143, "", "none", "filing not built", null],
  [144, "EARN-004", "part", "payout tracking module", null],
  [145, "EARN-008", "part", "module only", null],
  [146, "SEC-003", "full", "breach monitoring claimed, not built", null],
  [147, "", "none", "not built", null],
  [148, "EARN-017", "part", "complaint credit drafts module; order refunds not requested", null],
  [149, "", "none", "returns not built", null],
];
// Alinea parity (owner's v4 roadmap, 2026-10-11): the ten features of the investing app the owner named, tracked as
// not started / built / wired, plus whether each one executes trades behind a per-order yes ("approval-gated"). Status is
// derived in scripts/capability-list.cjs from the registry and REACHABLE, like every item above. A feature that executes
// trades also needs the person's own brokerage connected (BROKER-CONNECT: built, not deployed, 0 live connections).
const PARITY = [
  ["Questionnaire / investor profile", [], false, "the app's onboarding asks about time and situation for earning plans, not an investing profile; a risk profile must stay descriptive (no securities advice)"],
  ["Playlists (curated lists of stocks)", [], false, "nothing built; a curated buy list reads as a recommendation, so it waits on the owner's call on securities advice"],
  ["Themed investing / Discover", ["NEWS-011"], false, "theme tracking per holding is only claimed in the registry; themed baskets clash with no securities advice as written"],
  ["Automated recurring investing", ["INV-013"], true, "recurring-buy engine only claimed; the loop already asks for a fresh yes on every run inside an envelope (owner rule), $5 cap; $50 of the live budget is set aside for it"],
  ["Fractional shares", ["INV-011"], true, "a dollar amount buys a fraction in the chat trade flow (notional market order), live in the person's own Alpaca account, a yes per order, $5 cap; 0 live orders so far"],
  ["AI copilot (chat about your money and holdings)", ["CORE-009", "INV-001"], false, "chat answers from the person's own rows and live portfolio, every money action through a card and a yes; explains, never advises"],
  ["Daily briefs and recaps", ["ANL-005", "ANL-020", "NEWS-004"], false, "money briefs are wired (morning brief opt-in, weekly recap, monthly close); a market brief on the person's holdings is a tested module (NEWS-004) the scheduler does not call yet"],
  ["Lessons and quizzes", [], false, "nothing built"],
  ["Growth projection", ["ANL-019"], false, "what-if math is a tested module (ANL-019) not reachable in chat; an investment projection must be labeled an illustration with its assumed return"],
  ["Copy investing (mirror a portfolio)", [], true, "nothing built; would copy only into the person's own account, each order a yes under the $5 cap; $50 of the live budget is set aside for it"],
];

module.exports = { REACHABLE, MAP, PARITY };
