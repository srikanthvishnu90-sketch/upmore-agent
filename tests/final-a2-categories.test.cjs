// Final A2 — category truth from merchant knowledge (2026-10-12).
// The defect: the category tables labelled by word-matching. On the owner's real rows the ledger filed a $10.00
// "POLYMARKET CLEARING POLYMARKETCLE FL" charge as GROCERIES (the bare word "market"), and MoneyAnswers placed
// almost none of the real merchants at all. The fix gives both classifiers dated merchant knowledge
// (packages/offers/merchant-knowledge.json: what each merchant IS) consulted BEFORE the word rules; the word
// rules remain the fallback, and a person's own category rule (95) still wins over knowledge.
//
// HAND COUNT FIRST (from the task's hand labels and the phase2 twins; amounts are the real rows' where the task
// or tests/phase2-real-feed.test.cjs gives them; Topgolf/Zara/the small dining rows are twin amounts, marked *):
//   Polymarket  $10.00 ×1                                  -> prediction markets
//   Kalshi      $15.31 + $15.31 + $10.21 = $40.83          -> prediction markets   (prediction markets total $50.83)
//   Rebet       12 rows: 30.00+50.00+50.00+25.00+85.00+80.00+25.00+25.00+20.00+55.13+71.66+27.56 = $544.35 -> sports betting
//   Peptira     $302.40 + $27.99 = $330.39                 -> health & wellness
//   Fiverr      $1,582.50                                  -> freelance/work services
//   Anthropic   $20.00                                     -> software/AI subscription (subscriptions)
//   Topgolf     $54.00*                                    -> entertainment
//   Zara        $76.50*                                    -> shopping
//   Dining      Starbucks 12.50* + Life Cafe 18.25* + Naf Naf Grill 14.75* + TST*The Lobby 32.00*
//               + Tropical Chill 9.50* + Gelatoteca Suso 2.89 = $89.89 -> dining / restaurants
//   Fees        MONTHLY SERVICE FEE $25.00 ×3 = $75.00     -> fees
//   Robinhood   $5.00 ×3 = $15.00                          -> investing transfer (ledger: transfers, NOT spending)
//   Zelle $100.00 + Apple Cash $85.00 = $185.00            -> person-to-person (ledger: transfers)
//   Affirm      61.44+11.42+13.93+10.84+6.03+16.00 = $119.66 (September rows, phase2) -> pay-later
//   GROCERIES, whole snapshot: $0.00 — there is no grocery store anywhere in the rows.
// Ledger spending total (transfers excluded, as spendRows does): $2,943.12.
// Check: node --test tests/final-a2-categories.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const MA = require(path.join(root, "packages/domain/80-money-answers.js"));
const LG = require(path.join(root, "packages/domain/57-agent-ledger.js"));
const KNOWLEDGE = JSON.parse(fs.readFileSync(path.join(root, "packages/offers/merchant-knowledge.json"), "utf8"));
const NOW = new Date("2026-10-12T15:05:00Z");

// The snapshot, in both row shapes. Dates Jul 15 – Oct 9 2026 (the owner's window), September rows per phase2.
let n = 0;
const rows = []; // [posted, cents, descriptor]
const add = (d, c, m) => rows.push([d, c, m]);
add("2026-09-21", -1000, "POLYMARKET CLEARING POLYMARKETCLE FL");
add("2026-08-04", -1531, "KALSHI KALSHI.COM NY 08/04"); add("2026-09-22", -1021, "KALSHI KALSHI.COM NY 09/22"); add("2026-10-02", -1531, "KALSHI KALSHI.COM NY 10/01");
add("2026-07-18", -3000, "REBET 5550134477 NH 07/17"); add("2026-07-24", -5000, "Rebet 5550134477 NH 07/24");
add("2026-08-05", -5000, "Rebet 5550134477 NH 08/04"); add("2026-08-05", -2500, "Rebet 5550134477 NH 08/04");
add("2026-08-11", -8500, "Rebet 5550134477 NH 08/08"); add("2026-08-20", -8000, "Rebet 5550134477 NH 08/19");
add("2026-08-24", -2500, "Rebet 5550134477 NH 08/21"); add("2026-08-26", -2500, "Rebet 5550134477 NH 08/25");
add("2026-09-08", -2000, "Rebet 5550134477 NH 09/06"); add("2026-09-22", -5513, "Rebet 5550134477 NH 09/22");
add("2026-09-23", -7166, "Rebet 5550134477 NH 09/22"); add("2026-10-02", -2756, "REBET XXXXXX0000 NH 10/02");
add("2026-09-16", -30240, "PEPTIRA 402-5550199 NE 09/15"); add("2026-09-17", -2799, "PEPTIRA 402-5550199 NE 09/15");
add("2026-08-24", -158250, "WWW.FIVERR.COM NEW YORK NY");
add("2026-09-30", -2000, "ANTHROPIC");
add("2026-09-12", -5400, "TOPGOLF"); add("2026-09-19", -7650, "ZARA");
add("2026-09-05", -1250, "STARBUCKS STORE 01234"); add("2026-09-06", -1825, "LIFE CAFE"); add("2026-09-07", -1475, "NAF NAF GRILL");
add("2026-09-10", -3200, "TST*THE LOBBY"); add("2026-09-11", -950, "TROPICAL CHILL ICE CREAM");
add("2026-09-18", -289, "GELATOTECA SUSO VENEZIA 09/17 EURO 2.50 X 1.156000 (EXCHG RTE)");
add("2026-07-20", -2500, "MONTHLY SERVICE FEE"); add("2026-08-20", -2500, "MONTHLY SERVICE FEE"); add("2026-09-21", -2500, "MONTHLY SERVICE FEE");
add("2026-08-04", -500, "ROBINHOOD DEBITS 555001999 WEB ID:"); add("2026-09-01", -500, "ROBINHOOD DEBITS 555001999 WEB ID:"); add("2026-10-01", -500, "ROBINHOOD DEBITS XXXXX0000 WEB ID:");
add("2026-09-25", -10000, "Zelle payment to Avery"); add("2026-09-14", -8500, "APPLE CASH INST XFER SENT MONEY CUPERTINO CA");
add("2026-09-15", -6144, "AFFIRM.COM PAYMENTS 185-55501234 CA"); add("2026-09-21", -1142, "AFFIRM * PAY D15Z7DSK SAN FRANCISCO CA");
add("2026-09-25", -1393, "AFFIRM * PAY 6GGIXBJA SAN FRANCISCO CA"); add("2026-09-25", -1084, "AFFIRM * PAY Y8PRUXM0 SAN FRANCISCO CA");
add("2026-09-25", -603, "AFFIRM * PAY 3U3M7JEN SAN FRANCISCO CA"); add("2026-09-02", -1600, "AFFIRM * PAY KJ4OR9CH SAN FRANCISCO CA");

const maRows = rows.map(([d, c, m]) => ({ account_id: "chk", provider_transaction_id: "a2-" + (++n), amount_cents: c, posted_on: d, merchant_raw: m, is_pending: false, is_transfer: false, currency: "USD", fetched_at: "2026-10-12T14:00:00Z" }));
const lgRows = rows.map(([d, c, m]) => ({ id: "a2-" + (++n), account_id: "chk", amount_cents: c, posted_at: d, merchant_raw: m, is_pending: false, is_transfer: false }));

const HAND_MA = { prediction_markets: 5083, sports_betting: 54435, health: 33039, work_services: 158250, subscriptions: 2000, entertainment: 5400, shopping: 7650, restaurants: 8989, fees: 7500, investing: 1500, person_to_person: 18500, pay_later: 11966, groceries: 0 };
const HAND_LEDGER = { prediction_markets: 5083, sports_betting: 54435, health: 33039, work_services: 158250, subscriptions: 2000, entertainment: 5400, shopping: 7650, dining: 8989, fees: 7500, pay_later: 11966, groceries: 0 };

test("knowledge file: dated data, every entry says what the merchant IS, with a source note", () => {
  assert.equal(KNOWLEDGE.checked_on, "2026-10-12");
  assert.ok(KNOWLEDGE.merchants.length >= 100, KNOWLEDGE.merchants.length);
  for (const m of KNOWLEDGE.merchants) {
    assert.ok(m.id && m.name && m.match && m.is && m.category && m.source_note && m.checked_on, JSON.stringify(m));
    assert.ok(m.money_group || m.ledger_category, m.id);
    assert.doesNotThrow(() => new RegExp(m.match, "i"), m.id);
  }
  const poly = KNOWLEDGE.merchants.find((m) => m.id === "polymarket");
  assert.match(poly.is, /prediction-market/); assert.equal(poly.money_group, "prediction_markets"); assert.equal(poly.ledger_category, "prediction_markets");
});

test("hand count, agent second: MoneyAnswers.classify totals over the real-row snapshot tie to the hand count", () => {
  const by = {};
  for (const r of maRows) { const c = MA.classify(r.merchant_raw); assert.ok(c, `unclassified: ${r.merchant_raw}`); by[c.group] = (by[c.group] || 0) - r.amount_cents; }
  assert.deepEqual(by, Object.fromEntries(Object.entries(HAND_MA).filter(([, v]) => v > 0)));
  assert.equal(by.groceries || 0, 0, "groceries is $0.00 — no grocery store is in the rows");
});

test("hand count, agent second: the ledger's categories tie, groceries $0.00, transfers are not spending", () => {
  const rep = LG.spendingByCategory(lgRows, "2026-07-15", "2026-10-09");
  const by = Object.fromEntries(rep.categories.map((c) => [c.category, c.spend_cents]));
  assert.deepEqual(by, Object.fromEntries(Object.entries(HAND_LEDGER).filter(([, v]) => v > 0)));
  assert.equal(by.groceries || 0, 0);
  assert.equal(rep.total_cents, 294312, "ledger spending excludes the Robinhood/Zelle/Apple Cash transfers ($200.00)");
  const cat = Object.fromEntries(lgRows.map((r) => [r.merchant_raw + r.posted_at, LG.categorize(r).category]));
  assert.equal(cat["ROBINHOOD DEBITS 555001999 WEB ID:2026-09-01"], "transfers");
  assert.equal(cat["Zelle payment to Avery2026-09-25"], "transfers");
  assert.equal(cat["APPLE CASH INST XFER SENT MONEY CUPERTINO CA2026-09-14"], "transfers");
  assert.match(LG.categorize(lgRows.find((r) => r.merchant_raw.startsWith("POLYMARKET"))).by, /^merchant knowledge:/, "knowledge, not the word rule, placed Polymarket");
});

test("chat answers: the September asks tie to the hand count, groceries $0.00", () => {
  const ask = (w) => MA.spend(maRows, w, NOW, { tz: "America/Chicago" });
  assert.match(ask("how much did i spend on groceries in september"), /^You spent \$0\.00 on groceries in September/);
  assert.match(ask("how much did i spend on prediction markets in september"), /^You spent \$20\.21 on prediction markets in September/, "Polymarket $10.00 + Kalshi $10.21");
  assert.match(ask("how much did i spend on sports betting in september"), /^You spent \$146\.79 on sports betting in September/);
  assert.match(ask("how much did i spend on health in september"), /^You spent \$330\.39 on health & wellness in September/);
  assert.match(ask("how much did i spend on pay-later in september"), /^You spent \$119\.66 on pay-later in September/);
  assert.match(ask("how much did i spend on fees in september"), /^You spent \$25\.00 on fees in September/);
  assert.match(ask("how much did i spend on person-to-person in september"), /^You spent \$185\.00 on person-to-person in September/);
  assert.match(ask("how much did i spend on dining in september"), /^You spent \$89\.89 on restaurants in September/);
  assert.match(ask("how much did i spend on entertainment in september"), /^You spent \$54\.00 on entertainment in September/);
  assert.match(ask("how much did i spend on freelance in august"), /^You spent \$1,582\.50 on freelance\/work services in August/);
  assert.match(ask("how much did i spend on subscriptions in september"), /^You spent \$20\.00 on subscriptions in September/);
});

test("adversarial variants: grocery markets stay groceries, prediction markets stay prediction markets", () => {
  for (const m of ["CORNER MARKET", "THE FRESH MARKET", "SPROUTS FARMERS MARKET", "MARKET BASKET"]) {
    assert.equal(MA.classify(m).group, "groceries", `MA ${m}`);
    assert.equal(LG.categorize({ merchant_raw: m, amount: -5420 }).category, "groceries", `ledger ${m}`);
  }
  assert.equal(MA.spend([{ account_id: "chk", provider_transaction_id: "v1", amount_cents: -5420, posted_on: "2026-09-10", merchant_raw: "CORNER MARKET", is_pending: false, is_transfer: false, fetched_at: "2026-10-12T14:00:00Z" }], "how much did i spend on groceries in september", NOW, { tz: "America/Chicago" }).startsWith("You spent $54.20 on groceries in September"), true);
  // Unknown, on neither list: the LEDGER's word rules are its fallback and "market" places it in groceries, said as
  // a default rule — while MoneyAnswers deliberately never guesses an unknown merchant into a category
  // (depth-MONEY-ANSWERS S08, MAPLE STREET MARKET), so it stays unplaced there rather than guessed.
  const river = LG.categorize({ merchant_raw: "RIVER MARKET DELI", amount: -1200 });
  assert.deepEqual([river.category, river.by], ["groceries", "default rule"]);
  assert.equal(MA.classify("RIVER MARKET DELI"), null);
  assert.equal(MA.classify("MAPLE STREET MARKET 0042"), null, "the S08 no-guessing rule still holds");
  for (const m of ["POLYMARKET", "POLYMARKET CLEARING POLYMARKETCLE FL", "POLYMARKET.COM", "POLYMARKETCLEARING", "KALSHI.COM", "KALSHI KALSHI.COM NY 09/22"]) {
    assert.equal(MA.classify(m).group, "prediction_markets", `MA ${m}`);
    assert.equal(LG.categorize({ merchant_raw: m, amount: -1000 }).category, "prediction_markets", `ledger ${m}`);
  }
});

test("a person's own category rule (95) still overrides knowledge, on both surfaces", () => {
  const CR = require(path.join(root, "packages/domain/95-category-rules.js"));
  const cmd = CR.command("recategorize Target as groceries", [], NOW.getTime());
  assert.equal(cmd.rules.length, 1); assert.equal(cmd.rules[0].group, "groceries");
  assert.equal(MA.classify("TARGET 00012345", cmd.rules).group, "groceries", "the Target rule keeps working");
  assert.equal(MA.classify("POLYMARKET CLEARING POLYMARKETCLE FL", [{ term: "polymarket", group: "groceries" }]).group, "groceries", "a rule beats knowledge in MoneyAnswers");
  assert.equal(LG.categorize({ merchant_raw: "POLYMARKET CLEARING POLYMARKETCLE FL", amount: -1000 }, [{ match: "POLYMARKET", category: "groceries" }]).category, "groceries", "a rule beats knowledge in the ledger");
  // And the specificity guard survives knowledge: a "Costco" rule still leaves Costco Gas as gas.
  assert.equal(MA.classify("COSTCO GAS #123", [{ term: "costco", group: "groceries" }]).group, "gas");
});

test("every merchant the old tables already labelled correctly stays correct", () => {
  const cases = [["TRADER JOE S #552", "groceries"], ["KROGER #0042", "groceries"], ["WHOLEFDS MKT 10230", "groceries"], ["NETFLIX.COM", "subscriptions"], ["SPOTIFY", "subscriptions"], ["UBER *EATS", "delivery"], ["DOORDASH*THAI PLACE", "delivery"], ["UBER *TRIP", "transport"], ["COSTCO GAS #123", "gas"], ["SHELL OIL 57444", "gas"], ["AMZN MKTP US", "shopping"], ["TARGET 00012345", "shopping"], ["STARBUCKS STORE 01234", "restaurants"], ["CHIPOTLE 1234", "restaurants"]];
  for (const [m, g] of cases) assert.equal(MA.classify(m).group, g, `MA ${m}`);
  assert.equal(MA.classify("BLUE HERON HARDWARE"), null);
  assert.equal(MA.classify("JOES PLACE"), null);
  assert.equal(MA.classify("T-MOBILE AUTOPAY"), null, "Mobil the gas brand is still not T-Mobile");
  const lgCases = [["TRADER JOE S", "groceries"], ["NETFLIX.COM", "subscriptions"], ["AMZN MKTP US*2K4", "shopping"], ["STARBUCKS", "dining"], ["MONTHLY MAINTENANCE FEE", "fees"], ["ONLINE TRANSFER TO SAV", "transfers"]];
  for (const [m, g] of lgCases) assert.equal(LG.categorize({ merchant_raw: m, amount: -1000 }).category, g, `ledger ${m}`);
});

test("classified ledger (40) carries no merchant rules of its own — categories there come from the person's reviews, unchanged", () => {
  const src = fs.readFileSync(path.join(root, "packages/domain/40-agent-classified-ledger.js"), "utf8");
  assert.doesNotMatch(src, /CATEGORY_RULES|MERCHANTS|merchant-knowledge/, "no merchant table to feed knowledge to; nothing to change");
});
