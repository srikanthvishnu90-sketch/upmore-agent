// This month against last month and the person's own average, and spending by card (capability list items 12 and 13;
// packages/domain/94-spending-views.js). Exact strings and exact cents. Every account and transaction row is MOCK test
// data in the database's own shapes (agent_financial_accounts, agent_financial_transactions); nothing is a real account.
// Check: node --test tests/spending-views.test.cjs
const test = require("node:test"), assert = require("node:assert/strict");
const V = require("../packages/domain/94-spending-views.js");

const TZ = "America/New_York";
const NOW = "2026-10-13T03:30:00Z"; // 11:30 p.m. Monday Oct 12 in New York: day 12 of October; the bank's UTC date is already Oct 13
const SYNC = "2026-10-13T03:00:00Z"; // 11:00 PM EDT Oct 12
let n = 0;
const tx = (posted_on, amount_cents, merchant_raw, account_id = "mock-chk", o) => Object.assign({ account_id, provider_transaction_id: `mock-${++n}`, amount_cents, posted_on, merchant_raw, is_pending: false, is_transfer: false, currency: "USD", fetched_at: SYNC }, o);
const acct = (account_id, name, institution, account_kind, o) => Object.assign({ account_id, name, institution, account_kind, balance_cents: 0, available_cents: null, balance_as_of: SYNC, fetched_at: SYNC, status: "active", currency: "USD" }, o);
const ACCOUNTS = [
  acct("mock-chk", "Everyday Checking", "Mock Bank", "checking"),
  acct("mock-amex", "Gold Card", "American Express", "credit", { mask: "1005" }),
  acct("mock-ff", "Freedom Flex", "Chase", "credit"),
  acct("mock-citi", "Double Cash", "Citi", "credit"),
];
// Jul, Aug and Sep 2026 are full months on file (the first row is Jul 1); October so far, then the edge rows.
const HISTORY = [
  tx("2026-07-01", -20000, "KROGER #0042", "mock-amex"), tx("2026-07-08", -3000, "CHIPOTLE 1234", "mock-ff"), tx("2026-07-20", -5000, "BLUE HERON HARDWARE"),
  tx("2026-08-02", -18000, "KROGER #0042", "mock-amex"), tx("2026-08-10", -1500, "STARBUCKS STORE 01234", "mock-ff"), tx("2026-08-25", -4000, "SHELL OIL 57444"),
  tx("2026-09-04", -16000, "KROGER #0042", "mock-amex"), tx("2026-09-05", -1599, "NETFLIX.COM", "mock-ff"), tx("2026-09-15", -2500, "CHIPOTLE 1234", "mock-ff"), tx("2026-09-20", -9000, "TARGET 00012345", "mock-amex"),
];
const OCTOBER = [
  tx("2026-10-01", 250000, "MOCK EMPLOYER PAYROLL"), tx("2026-10-02", -25000, "KROGER #0042", "mock-amex"), tx("2026-10-03", -50000, "ONLINE TRANSFER TO SAV 9921", "mock-chk", { is_transfer: true }),
  tx("2026-10-04", -3000, "PARIS CAFE", "mock-amex", { currency: "EUR" }), tx("2026-10-05", -1599, "NETFLIX.COM", "mock-ff"), tx("2026-10-06", -6000, "TRADER JOE S #552", "mock-amex"),
  tx("2026-10-07", -4500, "CHIPOTLE 1234", "mock-ff"), tx("2026-10-08", -30000, "CREDIT CARD PAYMENT THANK YOU"), tx("2026-10-09", -3000, "BLUE HERON HARDWARE"),
  tx("2026-10-10", 2000, "KROGER #0042 REFUND", "mock-amex"), tx("2026-10-11", -4000, "SHELL OIL 57444"),
  tx("2026-10-13", -1200, "STARBUCKS STORE 01234", "mock-ff"), // the bank's UTC date: this evening in New York
  tx(null, -2850, "DOORDASH*THAI PLACE", "mock-ff", { is_pending: true }),
];
const TX = HISTORY.concat(OCTOBER);
const SRC = "From your linked accounts, transactions through Oct 13, 2026, as of Oct 12, 11:00 PM EDT.";
const compare = (words, rows = TX, now = NOW, tz = TZ) => V.compare(rows, words, now, { tz });
const byCard = (words, rows = TX, accounts = ACCOUNTS, now = NOW) => V.byCard(accounts, rows, words, now, { tz: TZ });

test("which asks are a comparison, which are spending by card, and which go on", () => {
  for (const m of ["how does this month compare to last month", "am I spending more than usual", "this month vs last month", "how's my spending compared to normal",
    "did I spend more on food this month than last", "is my spending up or down from last month", "spending vs my average", "am i spending less than normal on groceries?"]) assert.equal(V.ask(m), "compare", m);
  for (const m of ["spending by card", "which card do I use most", "how much did I put on my amex this month", "what's on my chase card", "break down my spending by card last month",
    "how much did i spend on my freedom flex", "what did i put on my credit card this month", "spending by account this year"]) assert.equal(V.ask(m), "cards", m);
  for (const m of ["how much did i spend last month", "how much have i spent this month", "how much did i spend on my car", "what's on my credit report", "should i use my amex at walgreens",
    "should I spend less than last month", "do i spend more than the average american on food", "how did last month compare to my average", "this week vs last week",
    "how does september compare to august", "what's my credit card balance", "how am i doing on my freedom flex 5%", "is my sapphire preferred annual fee worth it",
    "am i spending more than i make", "did i spend more than $100 at target", "what's on my calendar", "how much did i spend on my credit card payment", "which card should i use for gas"]) assert.equal(V.ask(m), null, m);
});

test("this month against the same days of last month and the 3-month average: every number exact, everything left out said", () => {
  assert.equal(compare("how does this month compare to last month"), [
    "This month so far (Oct 1-12), you spent $432.99.",
    "Same days last month (Sep 1-12, day 12 vs day 12): $175.99, so this month is $257.00 more.",
    "Your average over the last 3 full months (Jul-Sep): $268.66 a month, $200.33 by day 12; this month is $232.66 above that.",
    "Biggest changes from the same days last month: groceries up $130.00 ($290.00 vs $160.00), restaurants up $57.00 ($57.00 vs $0.00), gas up $40.00 ($40.00 vs $0.00).",
    "Refunds taken off: $20.00.",
    "Pending, not added yet: $28.50 (1 charge).",
    "In another currency, not added: 30.00 EUR.",
    "$30.00 of this month's spending matched no category I know (none the same days last month), so it's in the totals but not in the changes.",
    `${SRC} Transfers and card payments are left out.`,
  ].join("\n"));
});

test("a category named in the ask narrows it, with the category's own average", () => {
  assert.equal(compare("did I spend more on food this month than last"), [
    "This month so far (Oct 1-12), you spent $347.00 on food: $290.00 groceries, $57.00 restaurants.",
    "Same days last month (Sep 1-12, day 12 vs day 12): $160.00, so this month is $187.00 more.",
    "Your average over the last 3 full months (Jul-Sep): $203.33 a month on food, $195.00 by day 12; this month is $152.00 above that.",
    "Biggest changes from the same days last month: groceries up $130.00 ($290.00 vs $160.00), restaurants up $57.00 ($57.00 vs $0.00).",
    "Refunds taken off: $20.00.",
    "Pending, not added yet: $28.50 (1 charge).",
    "In another currency, not added: 30.00 EUR.",
    "$30.00 of your other spending this month matched no category I know, so none of it is counted as food.",
    `${SRC} Transfers and card payments are left out.`,
  ].join("\n"));
});

test("Feb against March: on Mar 31 last month's same days are all of February, said; the month boundary is the person's", () => {
  const rows = [tx("2027-01-01", -1000, "KROGER #0042"), tx("2027-02-28", -5000, "KROGER #0042"), tx("2027-03-31", -7000, "KROGER #0042"), tx("2027-03-01", -2000, "SHELL OIL 57444")];
  const r = compare("this month vs last month", rows, "2027-04-01T02:00:00Z"); // 10 p.m. Mar 31 in New York
  assert.equal(r.split("\n").slice(0, 3).join("\n"), [
    "This month so far (Mar 1-31), you spent $90.00.",
    "Same days last month (Feb 1-28, day 31 vs day 28, February's last day): $50.00, so this month is $40.00 more.",
    "Your average over the 2 full months on file (Jan-Feb): $30.00 a month, $30.00 by day 31; this month is $60.00 above that.",
  ].join("\n"));
  // The same moment in UTC is already April 1: day 1, nothing of March's.
  assert.match(compare("this month vs last month", rows, "2027-04-01T02:00:00Z", "UTC"), /^This month so far \(Apr 1\), you spent \$0\.00\.\nSame days last month \(Mar 1, day 1 vs day 1\): \$20\.00, so this month is \$20\.00 less\./);
});

test("the first day of a month compares day 1 with day 1, and a row dated tomorrow is this evening's", () => {
  const rows = HISTORY.concat([tx("2026-10-02", -1100, "STARBUCKS STORE 01234", "mock-ff")]);
  const r = compare("am i spending more than usual", rows, "2026-10-02T01:00:00Z"); // 9 p.m. Oct 1 in New York
  assert.equal(r.split("\n").slice(0, 3).join("\n"), [
    "This month so far (Oct 1), you spent $11.00.",
    "Same days last month (Sep 1, day 1 vs day 1): $0.00, so this month is $11.00 more.",
    "Your average over the last 3 full months (Jul-Sep): $268.66 a month, $66.67 by day 1; this month is $55.67 below that.",
  ].join("\n"));
});

test("fewer than 3 full months on file: how many is said; under one full month, no average at all", () => {
  const late = TX.filter((r) => r.posted_on === null || r.posted_on >= "2026-08-02");
  assert.match(compare("am i spending more than usual", late), /\nYour average over the 1 full month on file \(September\): \$290\.99 a month, \$175\.99 by day 12; this month is \$257\.00 above that\.\n/);
  const new_ = TX.filter((r) => r.posted_on === null || r.posted_on >= "2026-09-05");
  const r = compare("am i spending more than usual", new_);
  assert.match(r, /\nSame days last month \(Sep 1-12, day 12 vs day 12\): \$15\.99, so this month is \$417\.00 more\. Your linked transactions start Sep 5, 2026, so last month's number may be missing a few days\.\n/);
  assert.match(r, /\nYour linked transactions start Sep 5, 2026, so there isn't a full month on file to average yet\.\n/);
  assert.doesNotMatch(r, /average over/);
});

test("history that starts this month: nothing to compare with, never a $0.00 last month", () => {
  const rows = OCTOBER.filter((r) => r.posted_on === null || r.posted_on >= "2026-10-05");
  const r = compare("this month vs last month", rows);
  assert.equal(r.split("\n").slice(0, 3).join("\n"), [
    "This month so far (Oct 1-12), you spent $182.99. Your linked transactions start Oct 5, 2026, so this covers only from then.",
    "Your linked transactions start Oct 5, 2026, so there's nothing from last month to compare with yet.",
    "Your linked transactions start Oct 5, 2026, so there isn't a full month on file to average yet.",
  ].join("\n"));
  assert.doesNotMatch(r, /Biggest changes/);
});

test("an empty last month on file is a real $0.00, and a drop is said as less", () => {
  const rows = [tx("2026-08-01", -9000, "KROGER #0042"), tx("2026-10-02", -1000, "KROGER #0042")];
  const r = compare("how does this month compare to last month", rows);
  assert.equal(r.split("\n").slice(0, 4).join("\n"), [
    "This month so far (Oct 1-12), you spent $10.00.",
    "Same days last month (Sep 1-12, day 12 vs day 12): $0.00, so this month is $10.00 more.",
    "Your average over the 2 full months on file (Aug-Sep): $45.00 a month, $45.00 by day 12; this month is $35.00 below that.",
    "Biggest changes from the same days last month: groceries up $10.00 ($10.00 vs $0.00).",
  ].join("\n"));
});

test("nothing posted yet: said, no numbers", () => {
  assert.equal(compare("this month vs last month", [tx(null, -500, "KROGER", "mock-chk", { is_pending: true })]), "I don't see any posted transactions in your linked accounts yet, so there's nothing to compare. From your linked accounts, no posted transactions yet, as of Oct 12, 11:00 PM EDT.");
});

test("spending by card this month: each account as stored, its total, share and top 3 places; card payments never counted twice", () => {
  assert.equal(byCard("spending by card"), [
    "Spending by card and account this month so far (Oct 1-12), $432.99 in all:",
    "- American Express Gold Card (ending 1005): $290.00, 67% (top: Kroger $230.00, Trader Joe's $60.00)",
    "- Chase Freedom Flex: $72.99, 17% (top: Chipotle $45.00, Netflix $15.99, Starbucks $12.00)",
    "- Mock Bank Everyday Checking: $70.00, 16% (top: Shell $40.00, Blue Heron Hardware $30.00)",
    "Nothing posted on Citi Double Cash this month so far.",
    "Refunds taken off: American Express Gold Card (ending 1005) $20.00.",
    "Pending, not added yet: Chase Freedom Flex $28.50 (1 charge).",
    "In another currency, not added: American Express Gold Card (ending 1005) 30.00 EUR.",
    `${SRC} Transfers and card payments are left out, so a card paid from checking isn't counted twice.`,
  ].join("\n"));
});

test("which card carries the most, and the period asked: last month, this year", () => {
  assert.equal(byCard("which card do I use most").split("\n")[0], "Most of it went on American Express Gold Card (ending 1005): $290.00 of the $432.99 you spent this month so far (Oct 1-12), 67%.");
  assert.equal(byCard("spending by card last month").split("\n").slice(0, 4).join("\n"), [
    "Spending by card and account last month (Sep 1-30), $290.99 in all:",
    "- American Express Gold Card (ending 1005): $250.00, 86% (top: Kroger $160.00, Target $90.00)",
    "- Chase Freedom Flex: $40.99, 14% (top: Chipotle $25.00, Netflix $15.99)",
    "Nothing posted on Citi Double Cash last month.",
  ].join("\n"));
  assert.match(byCard("spending by account this year"), /^Spending by card and account this year so far \(Jan 1-Oct 12\), \$1,238\.98 in all:\n- American Express Gold Card \(ending 1005\): \$920\.00, 74% /);
});

test("one card named: the amex (American Express), the chase card; an unknown one is named back with the list", () => {
  assert.equal(byCard("how much did I put on my amex this month"), [
    "American Express Gold Card (ending 1005): $290.00 this month so far (Oct 1-12), 67% of the $432.99 you spent across your accounts. Top: Kroger $230.00, Trader Joe's $60.00.",
    "Refunds taken off: $20.00.",
    "In another currency, not added: 30.00 EUR.",
    `${SRC} Transfers and card payments are left out, so a card paid from checking isn't counted twice.`,
  ].join("\n"));
  assert.equal(byCard("what's on my chase card").split("\n").slice(0, 2).join("\n"), [
    "Chase Freedom Flex: $72.99 this month so far (Oct 1-12), 17% of the $432.99 you spent across your accounts. Top: Chipotle $45.00, Netflix $15.99, Starbucks $12.00.",
    "Pending, not added yet: $28.50 (1 charge).",
  ].join("\n"));
  assert.equal(byCard("what's on my citi card").split("\n")[0], "Citi Double Cash: nothing posted this month so far (Oct 1-12).");
  assert.equal(byCard("how much did i put on my discover card"), `I don't see a linked card or account called "discover". Your linked accounts: Mock Bank Everyday Checking, American Express Gold Card (ending 1005), Chase Freedom Flex, Citi Double Cash.\n${SRC}`);
});

test("one card only; no mask means no digits; a long number in a stored name is never shown", () => {
  const one = [acct("mock-v", "Visa Signature 4111 1111 1111 1111", "Mock Bank", "credit")];
  const rows = [tx("2026-10-02", -1234, "KROGER #0042", "mock-v"), tx("2026-10-03", -500, "NETFLIX.COM", "mock-v")];
  const r = byCard("spending by card", rows, one);
  assert.equal(r.split("\n").slice(0, 2).join("\n"), ["Spending by card and account this month so far (Oct 1-12), $17.34 in all:", "- Mock Bank Visa Signature: $17.34, 100% (top: Kroger $12.34, Netflix $5.00)"].join("\n"));
  assert.doesNotMatch(r, /4111|1111/);
});

test("nothing posted: said, no numbers; rows of an account no longer linked are named as such", () => {
  assert.equal(byCard("spending by card", []), "I don't see any posted transactions in your linked accounts yet, so I can't split your spending by card. From your linked accounts, no posted transactions yet.");
  const r = byCard("spending by card", [tx("2026-10-02", -1000, "KROGER #0042", "mock-gone")], [ACCOUNTS[0]]);
  assert.match(r, /^Spending by card and account this month so far \(Oct 1-12\), \$10\.00 in all:\n- An account that's no longer linked: \$10\.00, 100% \(top: Kroger \$10\.00\)\n/);
});
