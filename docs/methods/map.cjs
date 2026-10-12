// The owner's 194 method cards (docs/methods/methods.json) against the owner's Full Agent Capability List
// (docs/capability-list/full-agent-capability-list-2026-10-11.md, items 1..149 in document order), the capability registry
// (packages/capabilities/registry.json) and what Upmore has TODAY on this branch. Read by scripts/build-methods.cjs, which
// validates every entry against the repo and renders it into docs/methods/README.md; --check fails on any problem.
//
// One entry per card id: { items, caps, today, coverage, note, answer?, module?, evidence? }
//   items     capability-list items the card's steps would call on. Item 1 (linked accounts and their transactions) is
//             assumed by nearly every card and is not listed; item 2 (reading email) and 3 (reading a photo, PDF or mail
//             scan) are listed wherever a step reads them, because that is usually the missing prerequisite. [] when the
//             list has no such item (bank bonuses, side gigs, renting things out, prediction markets, sportsbooks).
//   caps      registry capability ids the card would use (their registry status is not today's status: see `today`).
//   today     what a person has on this branch today, for THIS card's job (the weakest true claim wins):
//               IN_CHAT      a person can ask in chat and a direct answer or flow does this card's job (at least in part).
//                            Needs `answer` (file(s) under supabase/functions/ that exist) and `evidence`: tests whose name
//                            appears verbatim in the file; at least one of them imports each answer file and sends this
//                            card's kind of ask through it.
//               MODULE_ONLY  a tested domain module does it, but nothing reachable calls it for this card. Needs `module`
//                            (packages/domain/NN-*.js) and `evidence`, at least one importing the module.
//               GATED        the card's own hard gate in methods.json blocks it (flag, decision_2, gambling, decision_3,
//                            identity_digits, phone_calls, lending, securities_advice). A hard-gated card is GATED whatever
//                            is built; the note may say what exists nearby, never that the card is reachable.
//               NOT_BUILT    nothing does this card's job. A reachable prerequisite (linked accounts, a spending answer)
//                            is not the feature, and a module over placeholder data (example banks, "Portal A") is not
//                            counted.
//   coverage  "full" or "part" for IN_CHAT and MODULE_ONLY ("part": the note names the missing half); "none" otherwise.
//   note      plain words: what works, what is missing, and any soft gate (one_approval, per_run_yes) that still applies.
//
// Branch work not merged into this branch is not today's state. Nothing here is proven live: the chat answers are tested
// offline with MOCK rows; none has a provider-confirmed result.
const E = (file, test) => ({ file, test });
const CHAT = (items, caps, coverage, note, answer, evidence, module) =>
  Object.assign({ items, caps, today: "IN_CHAT", coverage, note, answer, evidence }, module ? { module } : {});
const MOD = (items, caps, coverage, note, module, evidence) => ({ items, caps, today: "MODULE_ONLY", coverage, note, module, evidence });
const GATED = (items, caps, note) => ({ items, caps, today: "GATED", coverage: "none", note });
const NB = (items, caps, note) => ({ items, caps, today: "NOT_BUILT", coverage: "none", note });

// Answer files and the tests that drive them.
const A = {
  airline: "supabase/functions/agent-chat/_shared/airline_answer.ts",
  owed: "supabase/functions/agent-chat/_shared/money_owed_answer.ts",
  price: "supabase/functions/agent-chat/_shared/price_drop_answer.ts",
  rewards: "supabase/functions/agent-chat/_shared/rewards_answer.ts",
  subs: "supabase/functions/agent-chat/_shared/subscription_answer.ts",
  direct: "supabase/functions/agent-chat/_shared/direct_answers.ts",
  flows: "supabase/functions/_shared/flow_router.ts",
  unclaimed: "supabase/functions/agent-chat/_shared/unclaimed_answer.ts",
  offers: "supabase/functions/agent-chat/_shared/card_offers_answer.ts",
  winback: "supabase/functions/agent-chat/_shared/win_back_answer.ts",
  substitutes: "supabase/functions/agent-chat/_shared/substitutes_answer.ts",
};
const M = {
  airline: "packages/domain/83-airline-refunds.js",
  owed: "packages/domain/84-money-owed.js",
  subs: "packages/domain/85-subscription-savings.js",
  rewards: "packages/domain/87-rewards-math.js",
  price: "packages/domain/88-price-drop.js",
  unclaimed: "packages/domain/91-unclaimed.js",
  offers: "packages/domain/90-card-offers.js",
  winback: "packages/domain/89-win-back.js",
  substitutes: "packages/domain/89-free-substitutes.js",
};
const T = {
  unclaimedLetter: E("tests/edge/unclaimed-answer.test.ts", "a named bank and a pasted letter read nothing"),
  unclaimedRows: E("tests/edge/unclaimed-answer.test.ts", "'do I have money at a failed bank' reads the person's accounts (closed ones included) and history"),
  offersEdge: E("tests/edge/card-offers-answer.test.ts", "a pasted offer list is matched against the person's own rows, terms per the paste, nothing activated"),
  winbackEdge: E("tests/edge/win-back-answer.test.ts", "a pasted offer reads the rows and the cancellation records once each and answers from them"),
  substitutesLibrary: E("tests/edge/substitutes-answer.test.ts", "a library-streaming ask reads the rows once and cites the offer book"),
  substitutesReceipt: E("tests/edge/substitutes-answer.test.ts", "a pasted receipt reads nothing and puts no price on the store brand"),
  airFired: E("tests/edge/airline-answer.test.ts", "a fired message answers from the offer book and the person's own row, and sends nothing"),
  airBagEdge: E("tests/edge/airline-answer.test.ts", "nothing linked: the rule is still read, no amount is made up"),
  order: E("tests/edge/direct-order.test.ts", "every ask reaches the answer that owns it, in the handler's order"),
  airBag: E("tests/airline-refunds.test.cjs", "bag: 12 hours domestic exactly is within, 12h01m with a report is owed from the row near the flight"),
  airBump: E("tests/airline-refunds.test.cjs", "bump: the bands and the caps from the book, the fare only from a one-way row"),
  airVoucher: E("tests/airline-refunds.test.cjs", "voucher: warned before accepting; accepted voucher waives; the person's own words decide, not the email's offer"),
  airCredit: E("tests/airline-refunds.test.cjs", "the card credit: a credit row after the request is done; an older credit is not this refund; complaint only after the due date"),
  airExtras: E("tests/depth-AIR-REFUND.test.cjs", "[S09] a paid extra not delivered: Wi-Fi or a seat refunded from its own row; a slow connection is asked about, not claimed"),
  owedCard: E("tests/edge/money-owed-answer.test.ts", "a card's credit balance: reads accounts and transactions, drafts the request, never sends it"),
  owedEscrow: E("tests/edge/money-owed-answer.test.ts", "a pasted escrow analysis: reads transactions only for the deposit watch, and a failed read never blocks it"),
  owedNotice: E("tests/edge/money-owed-answer.test.ts", "a refund notice is checked without reading anything; a lookalike, a fee or a password is never real"),
  owedAny: E("tests/edge/money-owed-answer.test.ts", "'am i owed anything': card balances, and no program match without a window checked on the program's page"),
  owedCardWatch: E("tests/money-owed.test.cjs", "credit balance: the request text and the 7-business-day watch, weekends skipped, with source and as-of"),
  owedSurplus: E("tests/money-owed.test.cjs", "escrow: a surplus at the offer book's $50 is owed within 30 days of the analysis; a cent under is not"),
  owedReal: E("tests/money-owed.test.cjs", "a real notice: the sender and every link on a program's official domain, with the expiry"),
  owedFake: E("tests/money-owed.test.cjs", "a fake notice is never called real: lookalike domains, punycode, a fee, a password, an off-list link or address"),
  priceEdge: E("tests/edge/price-drop-answer.test.ts", "a store price drop is answered from the person's card rows with the cited window"),
  priceTarget: E("tests/price-drop.test.cjs", "Target inside 14 days: the charge from their card, the difference, the draft they send, the cited window"),
  priceBestBuy: E("tests/price-drop.test.cjs", "Best Buy's window is its return period: never turned into a number"),
  priceCostco: E("tests/price-drop.test.cjs", "the purchase day, when said, picks the row; several same-day matches ask"),
  rewardsEdge: E("tests/edge/rewards-answer.test.ts", "rewards questions are answered from the person's own card rows, with the dated term cited"),
  rewardsF1: E("tests/rewards-math.test.cjs", "F1: this quarter's categories, the activation date and the cap come from the dated offer book, with the source"),
  subsStreaming: E("tests/edge/subscription-answer.test.ts", "streaming: the cheaper tier, the perk overlap and the rotation, every number dated or cited, nothing turned on"),
  subsAnnual: E("tests/edge/subscription-answer.test.ts", "annual: 10 months in a row qualifies, 9 does not, and the nothing-found answer says what was checked"),
  subsCostco: E("tests/edge/subscription-answer.test.ts", "costco: the break-even and the verdict from 12 months of the person's own Costco charges"),
  subsTopics: E("tests/edge/subscription-answer.test.ts", "the asks it answers, and the ones it leaves alone (a cancel is the cancel flow's)"),
  subsAsked: E("tests/edge/subscription-answer.test.ts", "T-Mobile and Amex are asked, never guessed; merchant text that carries instructions is never repeated"),
  subsWalmart: E("tests/subscription-savings.test.cjs", "D2 Walmart+ overlap needs both charges, and the cancel goes to the cancel flow with its own yes"),
  subsTmobile: E("tests/subscription-savings.test.cjs", "D2 T-Mobile: the plan is asked, never guessed from the amount; only Experience Beyond counts"),
  subsAmex: E("tests/subscription-savings.test.cjs", "D2 Amex Blue Cash Preferred: asks which card when unknown; counts only bills on another card; the credit is capped"),
  subsRotation: E("tests/subscription-savings.test.cjs", "D3 rotation: three or more streaming services gets a plan as a toggle that is off; nothing is turned on"),
  subsSns: E("tests/subscription-savings.test.cjs", "D6 Subscribe and Save: five staples on one date, the extra rate only, flagged reported"),
  cancelFlow: E("tests/edge/flow-router.test.ts", "ordinary chat falls through without a model call; a flow message is routed and its state saved before the reply"),
  findList: E("tests/edge/direct-answers.test.ts", "find me money with only ordinary subscriptions lists them with their monthly total, never a made-up saving"),
};

const NO_INBOX = "spotting it in email is not built (item 2 is a module only; nothing reads the inbox), so it starts when the person asks or pastes";
const PERSON_SENDS = "Upmore drafts, the person sends; the card-credit check runs when the person asks again, not as a standing watch";
const FLAG = "[Flag]: regulated, a licensed partner or a lawyer first, and the owner decides";

const MAP = {
  // ---------------------------------------------------------------- Methods 1: Bank and brokerage bonuses (all [Flag])
  "M1-BANK-01": GATED([2, 72], ["INV-019", "EARN-001"], `${FLAG}; opening and funding accounts at another broker is not built`),
  "M1-BANK-02": GATED([2, 61], ["EARN-001"], `${FLAG}; brokerage transfers (item 61) are not built`),
  "M1-BANK-03": GATED([2, 72], ["INV-019", "EARN-001"], `${FLAG}; the rollover status module (INV-019) is not reachable`),
  "M1-BANK-04": GATED([], ["EARN-001", "EARN-002"], `${FLAG}; the bonus finder in 63-agent-surfaces.js holds example banks only`),
  "M1-BANK-05": GATED([29], ["EARN-001", "EARN-002", "ALRT-010"], `${FLAG}; a balance-floor watch is in chat (item 29), the bonus itself is not built`),
  "M1-BANK-06": GATED([2], ["EARN-001", "EARN-002"], FLAG),
  "M1-BANK-07": GATED([2], ["EARN-001", "EARN-002"], FLAG),
  "M1-BANK-08": GATED([30], ["EARN-001", "EARN-002", "ANL-010"], `${FLAG}; the paycheck-landed alert is wired (item 30), the bonus is not built`),
  "M1-BANK-09": GATED([2], ["EARN-001", "EARN-002"], FLAG),
  "M1-BANK-10": GATED([70, 73], ["EARN-001", "INV-018"], `${FLAG}; IRA opening and funding are not built`),
  "M1-BANK-11": GATED([], ["EARN-001", "EARN-002"], FLAG),
  "M1-BANK-12": NB([6, 13], ["EARN-002", "ANL-001", "CARD-001"], "nothing finds or tracks a monthly debit-spend bonus; 44-agent-earn.js tracks direct-deposit and debit-count requirements of a bonus the person names over one window (EARN-002), not a monthly spend bonus, and the bonus catalog in 63-agent-surfaces.js is example banks; spending by category in chat is a prerequisite, not this card"),
  "M1-BANK-13": GATED([2, 30], ["EARN-001", "EARN-002"], FLAG),

  // ---------------------------------------------------------------- Credit card bonuses and rewards plays
  "M1-CARD-01": GATED([13], ["CARD-009", "EARN-002"], `${FLAG} (applying for a card); the spend-target math for a card the person already opened is in chat (rewards_answer.ts, 87-rewards-math.js F2), which does not lift the gate on this card`),
  "M1-CARD-02": GATED([2], ["CARD-009"], FLAG),
  "M1-CARD-03": GATED([2], ["CARD-009"], FLAG),
  "M1-CARD-04": GATED([94, 123], ["CARD-008", "BILL-005"], `${FLAG}, and no phone calls; the annual fee against the credits used is in chat (87-rewards-math.js F3) and the retention ask is left to the person`),
  "M1-CARD-05": GATED([6], ["CARD-009"], FLAG),
  "M1-CARD-06": GATED([2], ["CARD-009"], FLAG),
  "M1-CARD-07": GATED([13], ["CARD-009", "CARD-008"], `${FLAG}; one_approval also applies to the cancel review`),
  "M1-CARD-08": CHAT([105], ["EARN-010", "SAVE-013"], "part",
    "a pasted or forwarded offer list (Amex Offers, Chase Offers, BankAmeriDeals) matched against the person's usual merchants from their own card rows: likely to use anyway, out of the way, expiring soonest, terms per the paste; adding offers is the person's own tap (the card's one-time approval to add them is not built, and 63-agent-surfaces.js activateOffer is not reachable), and checking the credit posted is a later ask",
    [A.offers], [T.offersEdge, T.order], M.offers),
  "M1-CARD-09": GATED([2, 89], ["CARD-009"], FLAG),
  "M1-CARD-10": CHAT([2, 105], ["CARD-003", "CARD-002"], "part",
    "on ask (\"how am i doing on my freedom flex 5%\"), this quarter's categories, the activate-by date and spend toward the $1,500 cap from the person's own rows, terms from the dated offer book (Chase Freedom Flex Q4 2026 only); reading the issuer's email, activating (a tap the person makes) and switching the default card at the cap are not built",
    [A.rewards], [T.rewardsEdge, T.rewardsF1], M.rewards),
  "M1-CARD-11": GATED([], ["CARD-009", "HOUS-001"], FLAG),
  "M1-CARD-12": GATED([], ["EARN-011"], FLAG),
  "M1-CARD-13": GATED([2], ["CARD-001", "CARD-009"], FLAG),

  // ---------------------------------------------------------------- Referral and sign-up money
  "M1-REFER-01": NB([2], ["EARN-003", "EARN-004"], "nothing reads the cards held or the referral caps, or shows the link; 44-agent-earn.js can match a referral credit row to referrals the person lists, but nothing collects that list and that bookkeeping is not this card's job"),
  "M1-REFER-02": GATED([], ["EARN-003", "EARN-004", "CARD-009"], FLAG),
  "M1-REFER-03": NB([2], ["EARN-003", "EARN-004"], "no per-card referral count or cap tracking; reading Amex approval emails is not built"),
  "M1-REFER-04": GATED([], ["EARN-001", "EARN-009", "SAVE-012"], FLAG),
  "M1-REFER-05": NB([2], ["EARN-003", "EARN-004"], "no referral link, amount or yearly-cap tracking for the person's bank; the generic referral bookkeeping in 44-agent-earn.js is not reachable and is not this card"),
  "M1-REFER-06": NB([2], ["EARN-003", "EARN-004"], "no promo-week watch; reading email is not built"),
  "M1-REFER-07": GATED([30], ["EARN-001", "EARN-002"], FLAG),
  "M1-REFER-08": NB([2], ["EARN-009", "SAVE-012"], "no portal partner; the portal routing in 63-agent-surfaces.js runs on placeholder portals (\"Portal A\", \"Portal B\") and is not counted"),
  "M1-REFER-09": NB([2], ["EARN-003", "EARN-009"], "nothing checks for a Rakuten account or tracks referral credits"),
  "M1-REFER-10": GATED([], ["EARN-001"], FLAG),
  "M1-REFER-11": GATED([2], ["EARN-004", "TAX-002"], FLAG),

  // ---------------------------------------------------------------- Creative plays most people miss
  "M1-CREATIVE-01": GATED([2], ["HOUS-006"], FLAG),
  "M1-CREATIVE-02": NB([2], [], "nothing spots a hospital bill or checks a hospital's assistance policy; the same play is gated as M3-HEALTH-01"),
  "M1-CREATIVE-03": GATED([], ["EARN-005"], FLAG),
  "M1-CREATIVE-04": CHAT([2, 38], ["EARN-016", "TXN-013"], "part",
    `on the person's own words, an involuntary bump is answered with the DOT bands, multiples and caps from the dated offer book and a claim they send; a fact it lacks (voluntary or not, domestic or international, how late) is asked for by name, and the fare comes only from a one-way card row; ${NO_INBOX}; ${PERSON_SENDS}`,
    [A.airline], [T.order, T.airBump], M.airline),
  "M1-CREATIVE-05": NB([2, 3, 120], [], "nothing reads a carrier bill's device-payment line or a switching offer"),
  "M1-CREATIVE-06": GATED([6], ["EARN-005"], FLAG),
  "M1-CREATIVE-07": GATED([2], ["HOUS-006"], FLAG),
  "M1-CREATIVE-08": GATED([39], ["SAVE-020"], `${FLAG}; per_run_yes would also apply`),
  "M1-CREATIVE-09": NB([2, 3, 120], [], "nothing finds an internet contract or a buyout offer"),
  "M1-CREATIVE-10": CHAT([2, 38], ["EARN-016", "TXN-013"], "part",
    `on ask, a cancelled or badly changed flight, a late bag or an undelivered extra is answered with the DOT rule from the dated offer book, a warning before a voucher is accepted, and the request the person sends; ${NO_INBOX}; ${PERSON_SENDS}; one_approval comes from the word "cancellation" in the steps: no cancellation is made here`,
    [A.airline], [T.airFired, T.airVoucher], M.airline),
  "M1-CREATIVE-11": NB([], ["EARN-016"], "the airline answer says a volunteered bump is negotiable, but nothing spots a flexible flight on a calendar, flags the person at the gate or logs voucher terms and expiry"),
  "M1-CREATIVE-12": NB([2], ["SAVE-011"], "no fare watch and no rebooking (SAVE-011 is only claimed)"),
  "M1-CREATIVE-13": NB([2], ["SAVE-011"], "no rental-car tracker partner; one_approval would apply to cancelling the old booking"),
  "M1-CREATIVE-14": CHAT([2, 38], ["TXN-013"], "part",
    "on the person's own words (store, old and new price), the purchase is found in their card rows and the claim draft cites the store's window from the dated offer book (Target, Costco, Best Buy only); reading order receipts and checking the store's price daily are not built, and the credit watch is asked for, not automatic",
    [A.price], [T.priceEdge, T.priceTarget], M.price),
  "M1-CREATIVE-15": NB([2, 3], ["EARN-014"], "nothing reads Menards receipts or files the rebate"),
  "M1-CREATIVE-16": NB([2], [], "no gift-card resale partner"),
  "M1-CREATIVE-17": NB([2], [], "no trade-in price feed"),
  "M1-CREATIVE-18": NB([], ["SAVE-009"], "no utility recycling-program lookup; the energy plan comparison module (SAVE-009) is a different job"),
  "M1-CREATIVE-19": NB([], ["SAVE-009"], "no peak-time rebate enrollment or event alerts"),
  "M1-CREATIVE-20": NB([2], ["SAVE-012", "EARN-009"], "no portal partner: the routing in 63-agent-surfaces.js runs on placeholder portals (\"Portal A\", \"Portal B\") and is not counted"),
  "M1-CREATIVE-21": NB([], ["SAVE-013"], "no grocery loyalty link or fuel-point tracking"),
  "M1-CREATIVE-22": NB([], [], "no bottle-bill state lookup or deposit reminders"),

  // ---------------------------------------------------------------- Methods 2: Money owed to you
  "M2-OWED-01": GATED([2, 41, 142, 143, 144, 145], ["EARN-008", "EARN-004"], FLAG),
  "M2-OWED-02": CHAT([2, 41, 44, 147], ["EARN-008", "SEC-011"], "part",
    "a pasted PayPal, Venmo, Zelle, check or email notice is checked against the official sender and links on file (refund-programs.json) and its expiry said; a lookalike, a fee or a password ask is never called real. Missing: watching email for notices, the past-charge match (no program in the shipped file has an enrollment window checked on its page yet, so \"am i owed anything\" names none), and accepting or depositing, which is the person's",
    [A.owed], [T.owedNotice, T.owedAny, T.owedReal], M.owed),
  "M2-OWED-03": CHAT([2, 38], ["EARN-016", "TXN-013"], "part",
    `on ask, a cancelled or badly changed flight the person declined is owed the full fare from their own card row, cited from the dated DOT terms, with a voucher warning and the request they send; the DOT complaint text comes only after the 7-business-day date passes with no credit row, and only when asked; ${NO_INBOX}; ${PERSON_SENDS}; one_approval comes from the word "cancellation": nothing is cancelled here`,
    [A.airline], [T.airFired, T.airCredit], M.airline),
  "M2-OWED-04": CHAT([2, 3, 38], [], "part",
    "a pasted escrow analysis gives the surplus owed (the $50 rule and 30 days from the dated offer book), flags a cushion above 1/6 of yearly bills, and drafts the request the person sends; reading the analysis from email or a PDF is not built, and the deposit check runs on the rows only when the person asks",
    [A.owed], [T.owedEscrow, T.owedSurplus], M.owed),
  "M2-OWED-05": GATED([2, 143, 144, 146], ["SEC-003", "EARN-008"], FLAG),
  "M2-OWED-06": GATED([3, 142, 143, 144], ["EARN-008"], FLAG),
  "M2-OWED-07": GATED([2, 142, 143, 144], ["EARN-008"], FLAG),
  "M2-OWED-08": GATED([2, 142, 143, 144], ["EARN-008"], FLAG),
  "M2-OWED-09": CHAT([2, 38], ["EARN-016", "TXN-013"], "part",
    `on ask, a bag later than the DOT limit with a report filed is owed the bag fee from the person's own card row, cited from the dated offer book, with the request they send; ${NO_INBOX}; ${PERSON_SENDS}`,
    [A.airline], [T.airBagEdge, T.airBag], M.airline),
  "M2-OWED-10": GATED([142, 143, 144], ["EARN-008", "TXN-018"], FLAG),
  "M2-OWED-11": CHAT([2, 38], ["EARN-016", "TXN-013"], "part",
    `on ask, Wi-Fi or a paid seat not delivered is refunded from its own card row with the DOT rule cited (a slow connection is asked about, not claimed); ${NO_INBOX}; ${PERSON_SENDS}`,
    [A.airline], [T.order, T.airExtras], M.airline),

  // ---------------------------------------------------------------- Unclaimed and forgotten money
  "M2-UNCLAIMED-01": CHAT([2, 3], ["EARN-007", "SEC-011"], "part",
    "a pasted state treasurer email is called matching only from the official domain on file (Illinois Money Match only); a mailed letter is never called real and is looked up on the site the person types in; reading email or scanned mail, other states, and watching for the check are not built",
    [A.unclaimed], [T.unclaimedLetter, T.order], M.unclaimed),
  "M2-UNCLAIMED-02": GATED([2], ["EARN-007"], FLAG),
  "M2-UNCLAIMED-03": CHAT([38], ["CARD-004", "TXN-013"], "part",
    `on ask ("does my closed card have a credit balance?"), every linked card, closed ones included, is read and a balance over $1 in the person's favor gets the 12 CFR 1026.11 request they send and its 7-business-day date; it resolves only on a deposit of exactly that amount; reading statements by email is not built; ${PERSON_SENDS}`,
    [A.owed], [T.owedCard, T.owedCardWatch], M.owed),
  "M2-UNCLAIMED-04": CHAT([2, 41, 144], ["SEC-011", "EARN-008"], "part",
    "a pasted Zelle, PayPal or check notice naming a settlement is checked against the official sender on file and never called real without it; watching deposits and old uncashed checks, and marking the claim closed, are not built",
    [A.owed], [T.owedNotice, T.owedFake], M.owed),
  "M2-UNCLAIMED-05": GATED([72], ["INV-019"], FLAG),
  "M2-UNCLAIMED-06": NB([], ["EARN-007"], "no MissingMoney or state search; the chat's general answer on unclaimed property (finance_facts.ts) only names the official site"),
  "M2-UNCLAIMED-07": GATED([2, 3], [], FLAG),
  "M2-UNCLAIMED-08": GATED([], ["TAX-012", "TAX-001"], FLAG),
  "M2-UNCLAIMED-09": GATED([], ["TAX-004", "TAX-012"], FLAG),
  "M2-UNCLAIMED-10": CHAT([2], ["EARN-007"], "part",
    "a bank the person names, or one in their linked accounts and history, checked against the FDIC failed bank list kept as dated data (15 failures since March 2023), with the acquirer, where the deposits went only as the sources say, and the 18-month and 10-year rules cited; searching FDIC and state records and filing the claim are not built",
    [A.unclaimed], [T.unclaimedRows, T.order], M.unclaimed),
  "M2-UNCLAIMED-11": GATED([2, 39], ["SAVE-020"], FLAG),

  // ---------------------------------------------------------------- Making idle cash earn more
  "M2-CASH-01": GATED([40, 59], ["EARN-018", "SAVE-002"], FLAG),
  "M2-CASH-02": GATED([40], ["SAVE-001", "SAVE-002", "PAY-009"], `${FLAG}; per_run_yes would also apply to every sweep`),
  "M2-CASH-03": NB([], [], "no Treasury rate calendar or I bond guide"),
  "M2-CASH-04": GATED([36, 40], ["SAVE-002", "EARN-018"], FLAG),
  "M2-CASH-05": GATED([59], ["EARN-018"], FLAG),
  "M2-CASH-06": GATED([], ["SAVE-022"], `${FLAG}; no securities advice`),
  "M2-CASH-07": GATED([18, 59], ["EARN-018", "ANL-007"], FLAG),
  "M2-CASH-08": GATED([40], ["SAVE-002"], `${FLAG}; no securities advice`),
  "M2-CASH-09": GATED([40, 59], ["EARN-018", "SAVE-002"], FLAG),
  "M2-CASH-10": GATED([], [], `${FLAG}; per_run_yes would also apply`),
  "M2-CASH-11": GATED([93], ["SAVE-016"], `${FLAG}; balance transfers are not in Upmore's plan`),
  "M2-CASH-12": GATED([62], [], `${FLAG}; crypto stays off (decision 3)`),

  // ---------------------------------------------------------------- Investing plays (all [Flag])
  "M2-INVEST-01": GATED([71], ["SAVE-019", "EARN-005"], FLAG),
  "M2-INVEST-02": GATED([72], ["INV-019"], FLAG),
  "M2-INVEST-03": GATED([73], ["INV-018"], FLAG),
  "M2-INVEST-04": GATED([60, 69], ["INV-017"], FLAG),
  "M2-INVEST-05": GATED([60], ["INV-015", "INV-016"], FLAG),
  "M2-INVEST-06": GATED([70], ["INV-018"], FLAG),
  "M2-INVEST-07": GATED([], ["TAX-009"], FLAG),
  "M2-INVEST-08": GATED([70, 73], ["INV-018", "TAX-009"], `${FLAG}; no securities advice; per_run_yes would also apply`),
  "M2-INVEST-09": GATED([60], ["INV-016"], `${FLAG}; per_run_yes would also apply`),
  "M2-INVEST-10": GATED([], [], `${FLAG}; options are not offered (no securities advice)`),
  "M2-INVEST-11": GATED([], [], `${FLAG}; options are not offered (no securities advice)`),
  "M2-INVEST-12": GATED([45, 46, 48], [], `${FLAG}; copying funds is not offered (no securities advice)`),
  "M2-INVEST-13": GATED([46, 48], [], `${FLAG}; copying Congress is not offered (no securities advice)`),

  // ---------------------------------------------------------------- Side income and selling
  "M2-SIDE-01": GATED([2], ["EARN-013"], FLAG),
  "M2-SIDE-02": GATED([2], ["EARN-013"], FLAG),
  "M2-SIDE-03": GATED([2], ["EARN-013"], FLAG),
  "M2-SIDE-04": NB([2, 3], ["EARN-013"], "no ISBN reading from receipts or buyback quotes; the side-income catalog in 63-agent-surfaces.js rates gig types by hourly pay and is not this card"),
  "M2-SIDE-05": GATED([], ["EARN-013"], FLAG),
  "M2-SIDE-06": GATED([], ["EARN-013"], FLAG),
  "M2-SIDE-07": GATED([], ["EARN-013"], FLAG),
  "M2-SIDE-08": GATED([3], ["EARN-013"], FLAG),
  "M2-SIDE-09": GATED([], ["EARN-013"], FLAG),
  "M2-SIDE-10": NB([2], ["EARN-013"], "no resale listing drafts or old-order reading"),
  "M2-SIDE-11": NB([], ["EARN-013"], "no mystery-shop matching to errands"),
  "M2-SIDE-12": GATED([], ["EARN-013"], FLAG),
  "M2-SIDE-13": GATED([], ["EARN-013"], FLAG),
  "M2-SIDE-14": NB([2], ["EARN-013"], "no invite-email flagging"),
  "M2-SIDE-15": NB([], ["SAVE-013", "EARN-013"], "no grocery cash-back offer matching"),
  "M2-SIDE-16": NB([2], ["EARN-013"], "no e-receipt forwarding or points tracking"),

  // ---------------------------------------------------------------- Renting out what you already own (all [Flag])
  "M2-RENT-01": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-02": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-03": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-04": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-05": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-06": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-07": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-08": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-09": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-10": GATED([], ["EARN-013"], FLAG),
  "M2-RENT-11": GATED([], ["EARN-013"], FLAG),

  // ---------------------------------------------------------------- Methods 3: Subscriptions
  "M3-SUBS-01": CHAT([10, 106, 108], ["BILL-001", "BILL-003", "BILL-013", "BILL-017"], "part",
    "\"find me money\" lists the person's repeating charges with their monthly total when nothing ranks above them, and \"cancel X\" starts the cancel flow, whose card is the one approval (one_approval: one card and one yes per cancellation); the last-used signal (item 108, BILL-013 only claimed) is not built, the list is monthly totals rather than yearly cost per service, and a confirmed cancellation needs the merchant's record (most merchants stop at a guided handoff)",
    [A.flows, A.direct], [T.cancelFlow, T.findList]),
  "M3-SUBS-02": MOD([2, 109, 116], ["BILL-012", "SAVE-017", "BILL-003"], "part",
    "the module finds a separate Netflix or Hulu charge the T-Mobile Experience Beyond plan already includes, but only when told the plan; in chat the answer asks \"Which T-Mobile plan are you on?\" and nothing reads the reply back (the handler passes no plan), so the overlap is never found in chat. Reading the carrier bill, guiding activation and the promo-end reminder are not built; one_approval: each paid cancel goes to the cancel flow with its own yes",
    M.subs, [T.subsTmobile, T.subsAsked]),
  "M3-SUBS-03": MOD([116, 125], ["SAVE-017", "CARD-002"], "part",
    "the module counts Disney+, Hulu or ESPN bills on another card against the Amex Blue Cash Preferred credit (capped), but only when told which cards the person holds; in chat the answer asks \"Which credit cards do you hold?\" and nothing reads the reply back. Moving the bill and checking each statement for the credit are not built",
    M.subs, [T.subsAmex, T.subsAsked]),
  "M3-SUBS-04": CHAT([106, 109, 116], ["BILL-012", "SAVE-017", "BILL-003"], "part",
    "\"am i overpaying for streaming\" or \"am i paying twice\" finds Walmart+ and a separate Peacock or Paramount+ charge from the person's rows and says to activate the perk, then cancel the paid one; guiding the link in the Walmart app and confirming the charge stops are not built; one_approval: the cancel is the cancel flow's own card and yes",
    [A.subs], [T.subsStreaming, T.subsWalmart], M.subs),
  "M3-SUBS-05": CHAT([111, 116], ["BILL-006", "SAVE-017"], "part",
    "the charge is matched to the exact plan price and the ad tier's yearly saving and trade-off are said, prices from the dated offer book (Netflix only); guiding the plan change and confirming the lower charge on the next bill are not built (item 111, downgrading, stays NOT_BUILT)",
    [A.subs], [T.subsStreaming], M.subs),
  "M3-SUBS-06": NB([116], ["BILL-006"], "no student-status signal or student price table"),
  "M3-SUBS-07": NB([116], ["BILL-006"], "no benefit-deposit detection or low-income price table"),
  "M3-SUBS-08": CHAT([106, 119], ["BILL-003", "SAVE-017"], "part",
    "three or more streaming services at once get a rotation plan with the yearly saving, offered as a toggle that is off; nothing can turn it on yet (no setting stores it), and renewal-date reminders and scheduled cancels or restarts are not built; one_approval: every cancel or restart still asks its own yes",
    [A.subs], [T.subsStreaming, T.subsRotation], M.subs),
  "M3-SUBS-09": CHAT([2, 121], ["BILL-018"], "part",
    "a pasted win-back email: the sender checked against the service's domain on file, the offer quoted from the email, the regular price from the person's last charge before Upmore's cancellation record, and the saving only for a trusted, comparable offer; watching the inbox is not built (the person pastes it); one_approval would apply to a restart, which is the person's own",
    [A.winback], [T.winbackEdge, T.order], M.winback),
  "M3-SUBS-10": CHAT([116, 118], ["BILL-006", "BILL-011"], "part",
    "10 or more months in a row at the monthly price gets the yearly plan's upfront cost and saving from the dated offer book (Peacock Premium and Amazon Prime only); guiding the switch and checking the monthly charges stop are not built (item 118, switching, stays NOT_BUILT)",
    [A.subs], [T.subsAnnual], M.subs),
  "M3-SUBS-11": CHAT([], [], "part",
    "Kanopy named beside each paid streaming charge from the person's rows, its $0 from the dated offer book (library card needed); finding the person's own library is not built and Hoopla is not on file; one_approval would apply to cancelling the paid service",
    [A.substitutes], [T.substitutesLibrary, T.order], M.substitutes),

  // ---------------------------------------------------------------- Shopping and groceries
  "M3-SHOP-01": CHAT([2, 38], ["TXN-013"], "part",
    "\"target dropped the price of my X from $A to $B\": the purchase from the person's card rows, the 14-day window from the dated offer book, and the claim draft they send in Target's chat; reading receipts and checking Target.com daily are not built, and the credit watch is asked for, not automatic",
    [A.price], [T.priceEdge, T.priceTarget], M.price),
  "M3-SHOP-02": CHAT([2, 38], ["TXN-013"], "part",
    "the same price-drop answer for Best Buy: the window is Best Buy's return period, never turned into a number, with the exclusions from the dated offer book and the draft the person sends; the chat test drives a Target ask and the Best Buy rule is tested on the module function the chat calls; tracking each item's price and confirming the refund on the statement are not built",
    [A.price], [T.priceEdge, T.priceBestBuy], M.price),
  "M3-SHOP-03": CHAT([2, 38], ["TXN-013"], "part",
    "the same price-drop answer for Costco's 30-day window (reported, the warehouse decides) and the draft for the online form or the counter; the chat test drives a Target ask and the Costco path is tested on the module function the chat calls; reading Costco receipts and comparing sale prices are not built, and the refund watch is asked for, not automatic",
    [A.price], [T.priceEdge, T.priceCostco], M.price),
  "M3-SHOP-04": NB([2], ["SAVE-013"], "no grocery loyalty account link or coupon clipping"),
  "M3-SHOP-05": GATED([], ["SAVE-013"], FLAG),
  "M3-SHOP-06": CHAT([2, 3], ["SAVE-014"], "part",
    "a pasted itemized receipt: national-brand lines named with the store's own version to look for and the receipt price; no store-brand price is on file, so the shelf tag decides; reading receipts from email or photos is not built",
    [A.substitutes], [T.substitutesReceipt], M.substitutes),
  "M3-SHOP-07": CHAT([6, 106], ["ANL-013", "BILL-003", "BILL-011"], "part",
    "\"is costco executive worth it\": 12 months of the person's own Costco charges against the tier fees and the 2% reward cap from the dated offer book, the break-even and the verdict; making the change and checking the next renewal charge are not built; one_approval: a cancel goes to the cancel flow with its own yes",
    [A.subs], [T.subsCostco], M.subs),
  "M3-SHOP-08": NB([], [], "no Too Good To Go link"),
  "M3-SHOP-09": CHAT([2], ["SAVE-013"], "part",
    "\"should I stack subscribe and save\" is routed to the subscription answer (tested), which proposes five or more repeating Amazon staples on one date with only the extra rate counted (tested on the module); no committed test drives this exact reply end to end. It reads card rows, not Amazon order emails, so a charge holding several items is said to be checked by the person; watching delivery prices for spikes is not built",
    [A.subs], [T.subsTopics, T.subsSns], M.subs),
  "M3-SHOP-10": NB([2], [], "no Amazon price-history source"),
  "M3-SHOP-11": NB([], ["SAVE-012", "EARN-009"], "no portal partner: the routing in 63-agent-surfaces.js runs on placeholder portals and is not counted"),

  // ---------------------------------------------------------------- Health costs (all [Flag])
  "M3-HEALTH-01": GATED([2], [], FLAG),
  "M3-HEALTH-02": GATED([2, 3], [], FLAG),
  "M3-HEALTH-03": GATED([2], [], FLAG),
  "M3-HEALTH-04": GATED([2], [], FLAG),
  "M3-HEALTH-05": GATED([], [], FLAG),
  "M3-HEALTH-06": GATED([], ["TAX-009"], FLAG),
  "M3-HEALTH-07": GATED([2, 39], ["SAVE-020"], FLAG),
  "M3-HEALTH-08": GATED([], [], FLAG),
  "M3-HEALTH-09": GATED([2], [], FLAG),
  "M3-HEALTH-10": GATED([], [], FLAG),
};

// Prediction markets (decision 2) and sportsbook and casino promos (the gambling guard): nothing is built past the gate,
// and the owner's list has no item for either.
for (let i = 1; i <= 14; i++) {
  MAP[`M1-PRED-${String(i).padStart(2, "0")}`] = GATED([], [], i === 2
    ? `${FLAG}; prediction markets stay off (decision 2) and identity digits are never stored`
    : `${FLAG}; prediction markets stay off (decision 2)`);
}
for (let i = 1; i <= 15; i++) MAP[`M1-BET-${String(i).padStart(2, "0")}`] = GATED([], [], `${FLAG}; sportsbooks and casinos stay off (the gambling guard stands)`);

module.exports = { MAP };
