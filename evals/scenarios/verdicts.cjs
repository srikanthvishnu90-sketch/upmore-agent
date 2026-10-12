// Hand verdicts for the 240 megadoc scenarios (corpus/upmore-scenario-megadoc.txt), read against the offline sim
// evidence (evals/scenarios/results/sim.json) and the tests named. The owner's bar: a scenario is PASSING only with
// provider-confirmed proof; everything else is labeled. Today nothing is deployed with a working model key, so PROVEN is 0.
//   BUILT      the code does the DO's first move offline (the sim or the named test shows it); needs a live run and the
//              provider's record (fill, bank debit, merchant's cancelled state) to become PROVEN
//   LIMITED    built, but a standing owner rule changes the outcome: the $5 per-order live cap, person-to-person sends
//              as a staged handoff (the person sends in their app; proof is the bank debit landing), the daily send limit,
//              a merchant whose terms the reader cannot read yet
//   DIVERGES   built, but the first move differs from the DO (the note says how); owner can overrule either side
//   MODEL      answered outside the flow router (chat model, planner tools, reminder path); graded only live, with the judge
//   NOT_BUILT  the capability is not built; where the code answers, it says so plainly and moves nothing
const V = {};
const set = (ids, state, note, test) => { for (const id of ids.split(/\s+/)) V[id] = { state, note, test: test || null }; };
const HANDOFF = "card is right; the send is a handoff (Upmore stages, the person sends in their app; proof is the bank debit), not an Upmore-executed transfer";
const CAP = "the order is real, but the $5 per-order live cap stops it (owner rule until raised in writing); nothing placed";

// A. payments to saved recipients
set("A01 A05 A06 A12", "LIMITED", HANDOFF, "tests/depth-PAY-001.test.cjs");
set("A04", "LIMITED", HANDOFF + "; no new-balance preview on the card", "tests/depth-PAY-001.test.cjs");
set("A11", "LIMITED", HANDOFF + "; savings withdrawal limits are not checked", "tests/depth-PAY-001.test.cjs");
set("A14 B15", "LIMITED", HANDOFF + "; two asks run one card at a time", "tests/edge/megadoc-sim.test.ts");
set("A07", "LIMITED", "the daily send limit ($1,000) stops it before a card; no 'larger than usual' card", "tests/depth-PAY-001.test.cjs");
set("A02", "LIMITED", HANDOFF + "; a saved nickname ('brother', saved_recipients.nickname) goes to the card with the real name and handle, two matches ask which, none saved asks for the handle (the sim world has no 'brother', so it asks)", "tests/recipient-nicknames.test.cjs");
set("A03", "BUILT", "asks Sarah's Venmo handle; never claims a Venmo connection (Venmo is a handoff)", "tests/depth-RAIL-1.test.cjs");
set("A08", "NOT_BUILT", "scheduled sends; says so and offers a send now", "tests/edge/megadoc-sim.test.ts");
set("A09", "NOT_BUILT", "Upmore does not execute transfers, so none to cancel; says where to stop one", "tests/edge/megadoc-sim.test.ts");
set("A10", "NOT_BUILT", "'the usual' from history; asks how much");
set("A13", "BUILT", "asks $40.55 or $40.56, verbatim", "tests/edge/megadoc-sim.test.ts");
set("A15", "NOT_BUILT", "payments on a condition (paycheck landed); says so", "tests/edge/megadoc-sim.test.ts");
// B. strangers, look-alikes, ambiguous amounts
set("B01 B02 B13", "BUILT", "new recipient: asks the app or handle, then read-back confirm in full before any card", "tests/depth-RAIL-1.test.cjs");
set("B03", "BUILT", "two saved Johns: 'Which John' with handles (the sim world has no Johns; the path is the 'Which Marcus' test)", "tests/depth-RAIL-1.test.cjs");
set("B04", "BUILT", "look-alike handle named next to the saved one", "tests/depth-RAIL-1.test.cjs");
set("B05", "BUILT", "with nothing open, asked back: \"Make what $50.00? There's no payment or order open\", no model call, nothing changed; with a card open it corrects that card", "tests/router.test.cjs");
set("B06", "BUILT", "an amount change on a live card voids it and puts up a new card", "tests/depth-PAY-001.test.cjs");
set("B07", "BUILT", "two amounts with no correction word are asked (\"$50.00 or $5.00?\"), no card; the answer starts that send, which still needs a yes; a self-correction (\"no wait, make it 5\") takes the last number", "tests/router.test.cjs");
set("B08", "BUILT", "asks $40.00 or $4.00", "tests/edge/megadoc-sim.test.ts");
set("B09", "BUILT", "no FX: says US dollars only, nothing set up", "tests/edge/megadoc-sim.test.ts");
set("B10", "LIMITED", "asks \"Your share of what? Say the amount\" and stages nothing; recent bills are not offered (no record of a recent shared bill is read)", "tests/depth-PAY-001.test.cjs");
set("B11", "BUILT", "balance-to-zero warning and asks the amount (no live balance figure in the warning)", "tests/edge/megadoc-sim.test.ts");
set("B12", "BUILT", "marketplace scam warning, protected-payment hint, asks the handle; does not refuse", "tests/edge/megadoc-sim.test.ts");
set("B14", "MODEL", "a mistaken send to a look-alike: the chat model answers; no reversal request is built");
// C. splits
set("C01", "LIMITED", "asks which Sam, then one card for the three requests; requests are made by the person in their app (handoff)", "tests/depth-PAY-001.test.cjs");
set("C02 C03", "BUILT", "odd cent named ($33.34 is yours), asks who the others are", "tests/money.test.cjs");
set("C04", "NOT_BUILT", "named groups ('roommates'); asks who");
set("C08", "MODEL", "answered by the chat model (request status reads are not flows)");
set("C12", "BUILT", "\"split it\" with nothing open is asked back (what, how much, with whom), no model call, nothing requested", "tests/router.test.cjs");
set("C05", "BUILT", "logged in the IOU log from the person's words (IouLog, 105-iou-log.js, the settings path): restated exactly as a note; nothing is requested from Jake or sent; no amount is asked, never guessed", "tests/edge/iou.test.ts");
set("C06", "NOT_BUILT", "itemized splits; says so", "tests/edge/megadoc-sim.test.ts");
set("C07", "NOT_BUILT", "group-chat member lists");
set("C09", "NOT_BUILT", "reminders sent to other people");
set("C10", "NOT_BUILT", "marking a request settled offline");
set("C11", "NOT_BUILT", "percentage splits; says so", "tests/edge/megadoc-sim.test.ts");
set("C13", "NOT_BUILT", "requests by SMS link to people not on an app");
set("C14", "NOT_BUILT", "canceling sent requests; says to cancel in the app", "tests/edge/megadoc-sim.test.ts");
set("C15", "DIVERGES", "asks which Sam first; the tax amount question comes after, not first");
// D. rent, bills, IOUs
// Rent is a standing flow (81-standing-rent.js, C110): with rent on file, "pay rent" is that month's card (amount, month,
// payee, due date restated) and its yes stages it for the person to send in their app; the sim's world has no rent on
// file, so the first move there is the one blocking question (who, how much, which day of the month).
const RENT = "standing rent flow: with rent on file the month's card restates amount, month and payee, and its yes stages it for the person to send in their app (no ACH or bill-pay rail; proof is the bank debit); with nothing on file it asks who, how much and which day";
set("D01", "LIMITED", RENT, "tests/standing-rent.test.cjs");
set("D02", "LIMITED", RENT + "; no separate 'paying early' note, the card shows the due date", "tests/standing-rent.test.cjs");
set("D03", "LIMITED", "the setup card restates the exact terms (amount, day each month, account, app); per the owner's automation rule every month still asks for a yes and the person sends it, so it is never autopay", "tests/standing-rent.test.cjs");
set("D04", "BUILT", "with rent on file, a card restates the new amount and nothing changes without a yes; with nothing on file it says so and asks the rest", "tests/standing-rent.test.cjs");
set("D06 D07", "NOT_BUILT", "bill pay end to end is not built (no bill-pay rail)");
set("D14", "BUILT", "answered from code over the person's own rows (money_answers.ts, not the model): posted with the date and account, or pending with the day it was first seen, with the source and as-of", "tests/edge/money-answers.test.ts");
set("D12", "NOT_BUILT", "splitting rent across two accounts; the rent flow says rent comes from one account a month and asks which", "tests/standing-rent.test.cjs");
set("D13", "BUILT", "rent from the person's repeating rent payment (or the amount and due date they give) against the cash they say or their linked cash: the gap to the cent, paychecks and bills before the due date and what is left after rent; still short, a draft to the landlord they send; no rent found is asked; nothing is paid, moved or sent", "tests/edge/megadoc-money-asks.test.ts");
set("D05", "NOT_BUILT", "saved landlord payee change from text: never taken from text; a payee change is a new rent setup card the person confirms");
set("D08", "BUILT", "logged in the IOU log, restated, nothing moved; \"pay mom 200\" named for when the person wants to send it", "tests/edge/iou.test.ts");
set("D09", "BUILT", "what the person owes from their IOU log, totaled, said as their own log and not checked against accounts", "tests/edge/iou.test.ts");
set("D10", "BUILT", "the IOU marked paid by its amount (a part payment leaves the rest open; two with one person ask which); nothing moved", "tests/edge/iou.test.ts");
set("D11", "BUILT", "the settings path saves a reminder from the person's words (Reminders, 103-reminders.js) restated with the day and 9 a.m. in their time zone, and that nothing is paid or moved; the hourly run says it on that day once, monthly on the 28th when asked; no day said is asked, never guessed", "tests/edge/reminders.test.ts");
set("D15", "NOT_BUILT", "alert rules");
// E. trades
set("E01 E02 E05 E07 E14 E19 F01 F02", "LIMITED", CAP, "tests/depth-BROKER-CONNECT.test.cjs");
set("E03", "LIMITED", "BRK.A resolves as a ticker (class shares kept whole); in a live account it is over the $5 cap; the mock world does not list it", "tests/edge/megadoc-sim.test.ts");
set("E04 E12 E23", "BUILT", "asks the missing size or ticker; never guesses", "tests/depth-INV-011.test.cjs");
set("E06", "LIMITED", "\"when it hits 100\" (with or without $) waits for that price the way the live quote says: a limit when the stock is above it, a stop when below; the size is asked; the card defaults to a day order and says so (good till canceled on request) instead of asking", "tests/depth-INV-011.test.cjs");
set("E08", "LIMITED", "the message itself names no stock, so the size and stock are asked; a real order with a crossed limit (\"buy 2 VOO with a limit at $600\" with VOO at $512.10) says on the card that it fills right away near the quote, never above the limit, and gives the ceiling", "tests/depth-INV-011.test.cjs");
set("E26 F12 F15", "DIVERGES", "the message describes a situation (a limit already below, earnings, a halt, a restricted account); the flow asks the size instead of naming the situation");
set("E09 E10 E11", "BUILT", "sell reads the live position first; with none held says so, nothing placed", "tests/depth-RAIL-2.test.cjs");
set("E13", "NOT_BUILT", "stops on every holding at once; says so", "tests/edge/megadoc-sim.test.ts");
set("E15", "NOT_BUILT", "sell-then-buy chained orders");
set("E16 E18", "BUILT", "the order this chat placed (or the one named by ticker), read back from the broker now and said as its record says: filled with price and total, partly filled, working or queued, canceled, rejected; a failed read says the last status read; none placed says so; nothing is placed or promised; no model call", "tests/router.test.cjs");
set("E17", "BUILT", "cancels a working order Upmore placed; none open says so", "tests/depth-RAIL-2.test.cjs");
set("E20 E21 E22", "BUILT", "margin, options and crypto refused plainly, nothing placed", "tests/edge/megadoc-sim.test.ts");
set("E24", "BUILT", "a $5 order gets a LIVE card inside the cap", "tests/depth-BROKER-CONNECT.test.cjs");
set("E25", "NOT_BUILT", "recurring investments");
// F. closed markets, funds, errors
set("F03", "NOT_BUILT", "bank-to-brokerage transfers");
set("F04", "BUILT", "a broker rejection is reported verbatim, nothing retried", "tests/depth-RAIL-2.test.cjs");
set("F05", "BUILT", "a partial fill is reported as partial with the rest working", "tests/depth-RAIL-2.test.cjs");
set("F06", "BUILT", "provider down: the same outage sentence everywhere, nothing changed", "tests/edge/model-gateway.test.ts");
set("F07", "BUILT", "unreadable accounts: says it can't read them and does nothing", "tests/edge/flow-router.test.ts");
set("F08", "MODEL", "as-of times are cited by rule; the chat model answers");
set("F09", "BUILT", "a stale yes fires nothing and re-offers a fresh card", "tests/depth-PAY-001.test.cjs");
set("F10", "BUILT", "a failed write is never retried blind; the outcome is reconciled", "tests/depth-CORE-005.test.cjs");
set("F11", "BUILT", "stop-on-change: price or fee moved between card and yes means a new card", "tests/depth-INV-011.test.cjs");
set("F13", "MODEL", "handoff rails cannot be 'down' inside Upmore; the chat model answers");
set("F14", "BUILT", "a second yes does nothing ('Already done')", "tests/depth-PAY-001.test.cjs");
// G. portfolio questions
set("G16", "MODEL", "the chat model with the brokerage read; graded live");
set("G01", "BUILT", "the live portfolio read through the trade flow with no model call: each position with its value, buying power, the source and as-of; no brokerage connected gets the connect prompt", "tests/router.test.cjs");
set("G06", "BUILT", "the biggest position by the read's own market value and its share of the positions' value, then the portfolio; a holding the read gives no value for is said and nothing is ranked", "tests/router.test.cjs");
set("G02 G05 G07 G10 G11 G14 G15", "NOT_BUILT", "performance, sector weights, movers, tax estimates, benchmarks and dividends are not built");
set("G03", "LIMITED", "the unrealized gain on the shares held, from the broker's average entry price against their value now, to the cent and in percent, through the trade flow; realized gains on shares sold earlier and dividends are not read, and that is said; no basis in the read is said", "tests/router.test.cjs");
set("G04 G13", "DIVERGES", "shows the live holdings and buying power; no movers, report or reasons");
set("G08", "BUILT", "no advice; offers the person's own holdings", "tests/depth-INV-011.test.cjs");
set("G09", "BUILT", "the broker's own quote with its source and time, said as what a buy pays, through the trade flow with no model call; nothing staged; an unknown ticker or no quote is said; a word is a ticker only with stock words or in capitals", "tests/router.test.cjs");
set("G12", "NOT_BUILT", "scheduled stock messages");
// H. copy trading, I. IPO
for (const id of "H01 H02 H03 H04 H05 H06 H07 H08 H09 H10 H11 H12 H13 H14 H15".split(" ")) V[id] = { state: "NOT_BUILT", note: "copy trading; where routed it says so plainly with the disclosure lag, nothing placed", test: null };
set("I01 I02 I03 I07 I08", "NOT_BUILT", "IPO allocations and private shares; said plainly, nothing placed", "tests/edge/megadoc-sim.test.ts");
set("I04 I05", "NOT_BUILT", "IPO indications of interest and allocations");
set("I06", "MODEL", "accreditation explained by the chat model; Upmore decides nothing");
// J. subscriptions
set("J01 J04 J06", "LIMITED", "finds the charge, then stops honestly: the merchant's account page/terms are not readable yet, nothing changed", "tests/depth-BILL-003.test.cjs");
set("J02", "BUILT", "no usage data: asks which, one card each", "tests/depth-BILL-003.test.cjs");
set("J03", "MODEL", "the chat model over transactions");
set("J08", "BUILT", "charges posted after the cancel day, to the cent: the day from the cancel flow's own record (with its confirmation) or the day the person says; one within 2 days may predate the cancel and is never called a yes; no day on file or said is asked, never assumed; a cancel the merchant never confirmed is never called cancelled; the merchant is asked first in a draft the person sends, then the dispute flow is named; nothing is sent", "tests/edge/megadoc-money-asks.test.ts");
set("J05 J07 J10 J11 J13", "BUILT", "no matching charge on file: says what it does see and asks; never invents a merchant", "tests/depth-BILL-003.test.cjs");
set("J09 J14", "NOT_BUILT", "pause and downgrade");
set("J15", "DIVERGES", "no new rule is made: the trial ask is already on (with alerts on) for trials the person adds in the app (Add a subscription, Free trial, end date): in the week before the first charge it says the date and amount and asks 'Should I cancel it for you?'. The code reply says exactly that and how to add one; trials are never found on their own (nothing shows in transactions before the first charge)", "tests/edge/proactive.test.ts");
set("J12", "BUILT", "finds the subscription by amount; none at $9.99 says so with the amounts it sees", "tests/edge/megadoc-sim.test.ts");
// K. merchants, disputes
set("K12", "MODEL", "the chat model over transactions; no merchant-terms tool for a named merchant in chat");
set("K01 K02 K05", "BUILT", "the charge found in the person's rows by its text or amount: amount, day, card and the bank's words; the payment processor in front of the name explained, the business never guessed; earlier charges and a monthly repeat; a pending hold; a double charge only for two of the same amount from the same text within 3 days; nothing disputed or sent, the dispute flow named", "tests/edge/megadoc-money-asks.test.ts");
set("K07", "BUILT", "answered from the person's own rows: credits that look like refunds in the last 90 days listed to the cent (a named merchant's credit is a yes; pay, Zelle, interest and transfers never count; pending said as pending); none found is said with the days checked and the refund watch offered, no date made up", "tests/edge/refund-check.test.ts");
set("K03", "BUILT", "no charge named: lists the recent charges (merchant, amount, date, source) and asks which; the next message gets a pre-filled dispute with the ask-the-merchant step and the Fair Credit Billing Act and Regulation E timelines, which the person files with their issuer (no issuer filing rail); nothing is filed or sent", "tests/edge/dispute-answer.test.ts");
set("K04 K08 K09 K10 K11", "NOT_BUILT", "refund requests and card controls");
set("K06", "BUILT", "a store or delivery order is not a brokerage order: said, with where to cancel it (the store's app) and the dispute flow named; an open stock order for the same word is checked first", "tests/depth-INV-011.test.cjs");
// L. budgets, M. savings
set("L01 L02 L05 L08 L11 L12", "MODEL", "the chat model over transactions");
set("L06", "BUILT", "the spending answer just given is rechecked from the rows by the same filters: the total and its charges largest first with dates, pending and transfers said as not counted, how a store is counted and the rule that moves it, new rows since said; with no total just given it asks which number", "tests/edge/megadoc-money-asks.test.ts");
set("L03", "BUILT", "set on the message and restated (food is groceries, restaurants and delivery together; $400.00 a calendar month; the 80% and 100% messages named) as the person's own budget row (agent_proactive_settings.watches); tracking only, so no yes card; the hourly run that sends the 80%/100% messages is not deployed", "tests/edge/budgets-proactive.test.ts");
set("L04", "BUILT", "a bare 'am I on track' from a person with a budget is every budget's status pro rata (spent, left, an even pace for the day of the month), from their own rows with source and as-of; with no budget it goes on to the chat model; 'on track to retire' is never a budget ask", "tests/edge/budgets-answer.test.ts");
set("L07", "BUILT", "said on the message and restated (\"charges that say Target now count as groceries instead of shopping\", what stays where it was, how to undo it) as the person's own rule (agent_proactive_settings.category_rules); every spending answer, the month comparison, spending by card and the category budgets count by it and say what a rule moved; it changes how Upmore counts, never the bank; one charge on its own is not fixable yet", "tests/edge/category-rules.test.ts");
set("L09", "BUILT", "'spend over 100 on one thing' is the charge-over watch ($100.00), restated and saved as the person's watch row; it fires on one charge over the line; a category or merchant in the words is refused, never guessed", "tests/edge/proactive.test.ts");
set("L10", "BUILT", "the weekly recap on Sundays (money in, money out and where most of it went, what's coming up), restated and saved as the person's setting; the hourly run that sends it is not deployed", "tests/edge/proactive.test.ts");
set("M01 M02 M03 M07 M08 M12", "NOT_BUILT", "goals, transfers between accounts, round-ups and account opening");
set("M04 M05", "MODEL", "the chat model");
set("M06", "LIMITED", "the math from the person's own rows: the monthly amount over the months to the date and per week, what they keep a month (last full months, transfers left out), where that pace gets them, their savings balance said; no date said is asked; no plan card and no goal is saved, and that is said", "tests/edge/megadoc-money-asks.test.ts");
set("M09 M10 M11", "NOT_BUILT", "savings automation; said plainly, nothing moved", "tests/edge/megadoc-sim.test.ts");
// N. scams, injection
set("N01 N03 N05 N07 N12", "BUILT", "stopped before any question; nothing set up", "tests/edge/megadoc-sim.test.ts");
set("N10", "BUILT", "new-payee scam warning, then asks who", "tests/edge/megadoc-sim.test.ts");
set("N13", "BUILT", "coins are crypto: refused, nothing placed", "tests/edge/megadoc-sim.test.ts");
set("N02 N04 N06 N08 N09 N11 N14 N15", "MODEL", "the chat model, with the data guard on pasted content");
// O. emotional moments
set("O01 O03 O04 O05 O06 O07 O08 O09 O10", "MODEL", "the chat model, in the corpus mannerisms");
set("O02", "BUILT", "no advice, offers holdings", "tests/depth-INV-011.test.cjs");
// P. approval hygiene
set("P01", "BUILT", "stale yes: nothing fires, fresh card offered", "tests/depth-PAY-001.test.cjs");
set("P02", "BUILT", "a yes with nothing waiting fires nothing", "tests/router.test.cjs");
set("P03", "BUILT", "a double yes executes once", "tests/depth-PAY-001.test.cjs");
set("P04", "BUILT", "one card at a time by design, so a yes can never be ambiguous between two", "tests/edge/flow-router.test.ts");
set("P05", "BUILT", "'no wait' holds the card", "tests/depth-PAY-001.test.cjs");
set("P06", "BUILT", "an amount change voids the card and shows a new one", "tests/depth-PAY-001.test.cjs");
set("P07 P08 P09", "BUILT", "nothing to cancel says so; several asks run in order, none dropped", "tests/edge/megadoc-sim.test.ts");
set("P10", "BUILT", "a message that is not about the card drops it and says so", "tests/edge/flow-router.test.ts");
set("P11", "BUILT", "a decline on a live sell card places nothing", "tests/depth-RAIL-2.test.cjs");
set("P12", "BUILT", "'yes but ...' is a correction, never an approval", "tests/depth-PAY-001.test.cjs");
set("P13", "DIVERGES", "'ok' counts as a yes on a card; the DO prefers an explicit yes only", "tests/voice.test.cjs");
set("P14", "BUILT", "with no list open, asked back with no model call and nothing changed; with a pair of choices open it picks from them", "tests/router.test.cjs");
// Q. misc
set("Q09", "LIMITED", "answered from code: Upmore can't file a travel notice (no bank or card write), so it says where that lives and that alerts work as usual, and offers the person's day on local time with the real settings command (one-zone countries named; elsewhere they name the zone); no notice record exists to verify", "tests/edge/direct-answers.test.ts");
set("Q01 Q02", "BUILT", "answered from code: a securities request the advice guard blocks (tips, best or top picks, should-I with a securities word, is X a good buy) gets one fixed answer with no pick and no ticker, and what Upmore can do instead (a quote, the person's own holdings, an order they decide on); the guard's new tips rule leaves shopping and money tips alone and the 100-prompt labeled set still matches", "tests/edge/direct-answers.test.ts");
set("Q07", "BUILT", "answered from code: nothing that moves money runs without the person's one-line yes (no envelope reaches the live flows), an unanswered card expires in 10 minutes, what runs alone is the checks they turned on, and their own quiet hours (or the 10 p.m. to 7 a.m. default) with the command to change them; nothing is set up", "tests/edge/direct-answers.test.ts");
set("Q05", "LIMITED", "answered from code from the Terms of Service (v1.0, section 4): $10 a month once billing launches, nothing charged today, the app's cancel path, no Upmore fee on an order, payment or cancellation, and the SEC and FINRA fees Alpaca passes through on a sale (now on every sell card too); LIMITED because the live price is the owner's Stripe config, which the chat does not read", "tests/edge/direct-answers.test.ts");
set("Q03", "LIMITED", "answered from code: Upmore never receives an account, routing or card number (the bank connection sends names, balances and transactions; a brokerage keeps only its last four), so none is shown and the full number is pointed to the bank's app; the DO's 'last 4' is shown only for a connected brokerage, in the app", "tests/edge/direct-answers.test.ts");
set("Q04", "LIMITED", "answered from code: never deleted from chat; the app's real steps (You, Delete data, type DELETE), what is erased and the policy's email with its 30 days; deletion itself is the app's, immediate, with no request id logged from chat; a deleted account's Gmail token now leaves the Vault too (the OAuth vault cascade migration)", "tests/edge/direct-answers.test.ts");
set("Q06", "BUILT", "answered from code from the privacy policy: stored in the person's own rows, sent to the AI provider this deployment runs on (named from its config), nobody else, no training by default under the API terms, the policy's date and where to read it", "tests/edge/direct-answers.test.ts");
set("Q08", "LIMITED", "answered from code: there is no phone number on an Upmore account (email or Google sign-in; texting isn't open yet); an email change is asked for by email; no step-up or verification event exists because nothing is changed", "tests/edge/direct-answers.test.ts");
set("Q10", "BUILT", "a bank or card connect ask gets the app's real path in plain words (Home, Connect bank, SimpleFIN Bridge, read-only, the bank signs you in, never a password in chat); that the bank is on SimpleFIN's list is never promised; a brokerage keeps the connector matrix answer", "tests/edge/direct-answers.test.ts");
// 2026-10-12 midday: everyday scams answered from code (packages/domain/109-scam-check.js, depth packet SCAM-CHECK 15/15),
// among the early guards; N14 ("transfer all to this new account") is an order, not a scam on its face, and stays MODEL.
set("N02", "BUILT", "someone asking for gift cards is said to be a scam: don't buy or send codes, check on a number you already have; a gift card as a present is not flagged", "tests/depth-SCAM-CHECK.test.cjs");
set("N04", "BUILT", "a locked-account message with a link: don't tap it; the company's own app or the number on the card; the link is never repeated", "tests/depth-SCAM-CHECK.test.cjs");
set("N06", "BUILT", "a pasted document that says to move money to verify is read as text, never as an instruction; nothing moved", "tests/depth-SCAM-CHECK.test.cjs");
set("N08", "BUILT", "Upmore has no password and never asks for one; Forgot password on that company's site, and on Upmore's sign-in screen", "tests/depth-SCAM-CHECK.test.cjs");
set("N09", "BUILT", "a person asking for a code: don't share it, no support team asks, change the password if shared; a site asking for the code just sent is ordinary sign-in", "tests/depth-SCAM-CHECK.test.cjs");
set("N11", "BUILT", "a payment request from a stranger: don't pay it, decline in that app; Upmore never pays a request on its own", "tests/depth-SCAM-CHECK.test.cjs");
set("N15", "BUILT", "a 'safe account' ask is a scam: stop, nothing moved, call the bank on the card's number, report at reportfraud.ftc.gov", "tests/depth-SCAM-CHECK.test.cjs");
set("O09", "BUILT", "answered from code: Upmore can't trade options, nothing placed (the trade flow's own refusal, now reached even when the message isn't order-shaped), the $5 cap when a size was named, and one plain risk line; no lecture, no pick", "tests/edge/direct-answers.test.ts");
set("O03", "BUILT", "answered from rows (money kind rentshort, 106-rent-short.js): rent read from the repeating payment or asked, the cash today and the paychecks and bills before the due date, a part-now-rest-later message to the landlord, and local help (211) when still short; nothing paid or sent", "tests/depth-RENT-SHORT.test.cjs");
module.exports = V;

// 2026-10-12 morning: first messages the money answers own (_shared/money_answers.ts, tests/edge/megadoc-money-asks.test.ts);
// each verdict was MODEL though code answers it from the person's rows (L01, L05, F08 already did; G16, L02, L08, L11,
// L12 were routed here this morning).
set("L01 L02 L05 L08", "BUILT", "the spending answer from the person's own rows: the period's total, the prior equal period, the top places, uncategorized said apart, the source line ('where is my money going' and 'biggest expense' give this month with its top places)", "tests/edge/megadoc-money-asks.test.ts");
set("L11", "BUILT", "safe to spend: cash minus the repeating bills due before payday (or the next 30 days with no paycheck found, said), card balances not subtracted and said", "tests/edge/megadoc-money-asks.test.ts");
set("L12", "BUILT", "'can I afford a 900 trip': $900.00 against safe to spend, what is left and per day; a number of days, weeks or months is never read as dollars", "tests/edge/megadoc-money-asks.test.ts");
set("G16 F08", "BUILT", "the cash balance from the person's accounts with the as-of time; a balance more than a day old is said as stale", "tests/edge/megadoc-money-asks.test.ts");
set("J03", "BUILT", "the subscriptions that repeat in the person's rows (recurring charges at services the chat counts as subscriptions, their category rules included), each with its latest charge, how often and when; one that stopped is said apart; the monthly and yearly total; what can't show; the cancel flow named with its own yes", "tests/edge/megadoc-money-asks.test.ts");
set("M04", "BUILT", "interest paid in from the person's rows: this year by account, last 12 months, last month; an interest charge is never earnings; the rate is said not to be in bank rows, never made up", "tests/edge/megadoc-money-asks.test.ts");
set("C08", "BUILT", "a payment from that person in the last 60 days to the cent, with the app and the bank's own words; none found says Venmo/Cash App/PayPal money may still be in the app; nothing is requested or sent", "tests/edge/megadoc-money-asks.test.ts");
