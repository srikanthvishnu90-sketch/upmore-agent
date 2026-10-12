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
set("B05", "MODEL", "'make it 50' with nothing open goes to the chat model");
set("B06", "BUILT", "an amount change on a live card voids it and puts up a new card", "tests/depth-PAY-001.test.cjs");
set("B07", "DIVERGES", "DO asks '$50 or $5?'; Upmore takes the last number and shows it on the card ('Using 5, your last number'), which still needs a yes", "tests/edge/megadoc-sim.test.ts");
set("B08", "BUILT", "asks $40.00 or $4.00", "tests/edge/megadoc-sim.test.ts");
set("B09", "BUILT", "no FX: says US dollars only, nothing set up", "tests/edge/megadoc-sim.test.ts");
set("B10", "DIVERGES", "asks 'How much?' instead of 'Your share of what?' and offers no recent bills");
set("B11", "BUILT", "balance-to-zero warning and asks the amount (no live balance figure in the warning)", "tests/edge/megadoc-sim.test.ts");
set("B12", "BUILT", "marketplace scam warning, protected-payment hint, asks the handle; does not refuse", "tests/edge/megadoc-sim.test.ts");
set("B14", "MODEL", "a mistaken send to a look-alike: the chat model answers; no reversal request is built");
// C. splits
set("C01", "LIMITED", "asks which Sam, then one card for the three requests; requests are made by the person in their app (handoff)", "tests/depth-PAY-001.test.cjs");
set("C02 C03", "BUILT", "odd cent named ($33.34 is yours), asks who the others are", "tests/money.test.cjs");
set("C04", "NOT_BUILT", "named groups ('roommates'); asks who");
set("C05 C08 C12", "MODEL", "answered by the chat model (IOU log and request status reads are not flows)");
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
set("D13", "NOT_BUILT", "a rent shortfall plan (balance vs rent due) is not built; the message is not a rent command and goes to the chat model");
set("D05", "NOT_BUILT", "saved landlord payee change from text: never taken from text; a payee change is a new rent setup card the person confirms");
set("D08", "NOT_BUILT", "IOU log; says so and moves nothing", "tests/edge/megadoc-sim.test.ts");
set("D09 D10", "NOT_BUILT", "IOU log");
set("D11", "MODEL", "the handler's reminder path (not the flow router); graded live");
set("D15", "NOT_BUILT", "alert rules");
// E. trades
set("E01 E02 E05 E07 E14 E19 F01 F02", "LIMITED", CAP, "tests/depth-BROKER-CONNECT.test.cjs");
set("E03", "LIMITED", "BRK.A resolves as a ticker (class shares kept whole); in a live account it is over the $5 cap; the mock world does not list it", "tests/edge/megadoc-sim.test.ts");
set("E04 E12 E23", "BUILT", "asks the missing size or ticker; never guesses", "tests/depth-INV-011.test.cjs");
set("E06", "DIVERGES", "'when it hits 100' without a $ is not read as a limit price; asks the size only");
set("E08 E26 F12 F15", "DIVERGES", "the message describes a situation (a limit already below, earnings, a halt, a restricted account); the flow asks the size instead of naming the situation");
set("E09 E10 E11", "BUILT", "sell reads the live position first; with none held says so, nothing placed", "tests/depth-RAIL-2.test.cjs");
set("E13", "NOT_BUILT", "stops on every holding at once; says so", "tests/edge/megadoc-sim.test.ts");
set("E15", "NOT_BUILT", "sell-then-buy chained orders");
set("E16 E18", "MODEL", "order status questions go to the chat model");
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
set("G01 G06 G16", "MODEL", "the chat model with the brokerage read; graded live");
set("G02 G03 G05 G07 G10 G11 G14 G15", "NOT_BUILT", "performance, cost basis, sector weights, movers, tax estimates, benchmarks and dividends are not built");
set("G04 G13", "DIVERGES", "shows the live holdings and buying power; no movers, report or reasons");
set("G08", "BUILT", "no advice; offers the person's own holdings", "tests/depth-INV-011.test.cjs");
set("G09", "NOT_BUILT", "a quote-only answer (quotes are read only inside an order card)");
set("G12", "NOT_BUILT", "scheduled stock messages");
// H. copy trading, I. IPO
for (const id of "H01 H02 H03 H04 H05 H06 H07 H08 H09 H10 H11 H12 H13 H14 H15".split(" ")) V[id] = { state: "NOT_BUILT", note: "copy trading; where routed it says so plainly with the disclosure lag, nothing placed", test: null };
set("I01 I02 I03 I07 I08", "NOT_BUILT", "IPO allocations and private shares; said plainly, nothing placed", "tests/edge/megadoc-sim.test.ts");
set("I04 I05", "NOT_BUILT", "IPO indications of interest and allocations");
set("I06", "MODEL", "accreditation explained by the chat model; Upmore decides nothing");
// J. subscriptions
set("J01 J04 J06", "LIMITED", "finds the charge, then stops honestly: the merchant's account page/terms are not readable yet, nothing changed", "tests/depth-BILL-003.test.cjs");
set("J02", "BUILT", "no usage data: asks which, one card each", "tests/depth-BILL-003.test.cjs");
set("J03 J08", "MODEL", "the chat model over transactions");
set("J05 J07 J10 J11 J13", "BUILT", "no matching charge on file: says what it does see and asks; never invents a merchant", "tests/depth-BILL-003.test.cjs");
set("J09 J14", "NOT_BUILT", "pause and downgrade");
set("J15", "DIVERGES", "no new rule is made: the trial ask is already on (with alerts on) for trials the person adds in the app (Add a subscription, Free trial, end date): in the week before the first charge it says the date and amount and asks 'Should I cancel it for you?'. The code reply says exactly that and how to add one; trials are never found on their own (nothing shows in transactions before the first charge)", "tests/edge/proactive.test.ts");
set("J12", "BUILT", "finds the subscription by amount; none at $9.99 says so with the amounts it sees", "tests/edge/megadoc-sim.test.ts");
// K. merchants, disputes
set("K01 K02 K05 K12", "MODEL", "the chat model over transactions; no dispute or merchant-identity tool");
set("K07", "BUILT", "answered from the person's own rows: credits that look like refunds in the last 90 days listed to the cent (a named merchant's credit is a yes; pay, Zelle, interest and transfers never count; pending said as pending); none found is said with the days checked and the refund watch offered, no date made up", "tests/edge/refund-check.test.ts");
set("K03", "BUILT", "no charge named: lists the recent charges (merchant, amount, date, source) and asks which; the next message gets a pre-filled dispute with the ask-the-merchant step and the Fair Credit Billing Act and Regulation E timelines, which the person files with their issuer (no issuer filing rail); nothing is filed or sent", "tests/edge/dispute-answer.test.ts");
set("K04 K08 K09 K10 K11", "NOT_BUILT", "refund requests and card controls");
set("K06", "DIVERGES", "routed to brokerage orders ('no open order that I placed'); a food order is not Upmore's to cancel and the reply should say that");
// L. budgets, M. savings
set("L01 L02 L05 L06 L08 L11 L12", "MODEL", "the chat model over transactions");
set("L03", "BUILT", "set on the message and restated (food is groceries, restaurants and delivery together; $400.00 a calendar month; the 80% and 100% messages named) as the person's own budget row (agent_proactive_settings.watches); tracking only, so no yes card; the hourly run that sends the 80%/100% messages is not deployed", "tests/edge/budgets-proactive.test.ts");
set("L04", "BUILT", "a bare 'am I on track' from a person with a budget is every budget's status pro rata (spent, left, an even pace for the day of the month), from their own rows with source and as-of; with no budget it goes on to the chat model; 'on track to retire' is never a budget ask", "tests/edge/budgets-answer.test.ts");
set("L07", "BUILT", "said on the message and restated (\"charges that say Target now count as groceries instead of shopping\", what stays where it was, how to undo it) as the person's own rule (agent_proactive_settings.category_rules); every spending answer, the month comparison, spending by card and the category budgets count by it and say what a rule moved; it changes how Upmore counts, never the bank; one charge on its own is not fixable yet", "tests/edge/category-rules.test.ts");
set("L09", "BUILT", "'spend over 100 on one thing' is the charge-over watch ($100.00), restated and saved as the person's watch row; it fires on one charge over the line; a category or merchant in the words is refused, never guessed", "tests/edge/proactive.test.ts");
set("L10", "BUILT", "the weekly recap on Sundays (money in, money out and where most of it went, what's coming up), restated and saved as the person's setting; the hourly run that sends it is not deployed", "tests/edge/proactive.test.ts");
set("M01 M02 M03 M07 M08 M12", "NOT_BUILT", "goals, transfers between accounts, round-ups and account opening");
set("M04 M05 M06", "MODEL", "the chat model");
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
set("P14", "MODEL", "'the other one' with no list goes to the chat model");
// Q. misc
set("Q01 Q02 Q03 Q04 Q05 Q06 Q07 Q08 Q09 Q10", "MODEL", "the chat model and the app's own settings flows");
module.exports = V;

// 2026-10-12 morning: first messages the money answers own (_shared/money_answers.ts, tests/edge/megadoc-money-asks.test.ts);
// each verdict was MODEL though code answers it from the person's rows (L01, L05, F08 already did; G16, L02, L08, L11,
// L12 were routed here this morning).
set("L01 L02 L05 L08", "BUILT", "the spending answer from the person's own rows: the period's total, the prior equal period, the top places, uncategorized said apart, the source line ('where is my money going' and 'biggest expense' give this month with its top places)", "tests/edge/megadoc-money-asks.test.ts");
set("L11", "BUILT", "safe to spend: cash minus the repeating bills due before payday (or the next 30 days with no paycheck found, said), card balances not subtracted and said", "tests/edge/megadoc-money-asks.test.ts");
set("L12", "BUILT", "'can I afford a 900 trip': $900.00 against safe to spend, what is left and per day; a number of days, weeks or months is never read as dollars", "tests/edge/megadoc-money-asks.test.ts");
set("G16 F08", "BUILT", "the cash balance from the person's accounts with the as-of time; a balance more than a day old is said as stale", "tests/edge/megadoc-money-asks.test.ts");

