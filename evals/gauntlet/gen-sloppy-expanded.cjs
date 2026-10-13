// Generates evals/gauntlet/sloppy-expanded.json: the expanded local sloppy corpus (Spec 16 understanding bar).
// Deterministic: every variant, world and extractor mode is derived from the tables below by index, never by
// randomness, so a failure reproduces from the item id alone. Graded by tests/sloppy-corpus.test.cjs, which drives
// the real AgentRouter + flow sessions in three in-memory worlds:
//   full    the sloppy preconditions: saved Sam, monthly charges for five merchants, a brokerage with cash and a
//           VOO position, quotes. Complete intents must CARD here.
//   nodata  nothing linked and nobody saved: the words are complete, the data is absent. The correct first message
//           is an honest statement about the missing data (a data gap), never a question about the person's words.
//   partial some data: Spotify charges and a brokerage, no Netflix charge.
//   nohold  a brokerage with cash but no VOO position (a sell must be answered honestly, not carded).
//   rent    full world plus a standing rent rule.
// Categories: complete (all details present, data present -> card), datagap (details present, data absent ->
// honest answer, still "understood"), incomplete (a detail missing from the words -> ask for exactly that detail),
// notanorder (negations, past tense, questions, other people's actions -> never a card).
// Extractor modes simulate the live model paths: model (a correct extraction), drops (the intent is right but the
// spans are dropped, the gpt-5-nano omissions seen live on 2026-10-12; the regex net must fill them), down (the
// model call fails; the regex net alone must route). Modes rotate by index: 60% model, 20% drops, 20% down,
// unless an item pins a mode (word orders only the model can read are pinned to model/drops).
const fs = require("node:fs"), path = require("node:path");
const out = [];
let n = 0;
const MODES = ["model", "model", "model", "drops", "down"];
function add(flow, world, category, text, slots, expect, mode) {
  n += 1;
  out.push({ id: "X" + String(n).padStart(3, "0"), suite: "sloppy-expanded", flow, world, category, text, slots: slots || null, mode: mode || MODES[(n - 1) % MODES.length], expect });
}
// Messy surface variants of one base text: the same intent typed the ways people actually type it.
function variants(text) {
  const v = [text, text + " pls", "hey " + text, text + "!!"];
  if (text === text.toLowerCase()) v.push(text.toUpperCase());
  v.push(text + " thanks");
  return v;
}
const card = (must) => ({ outcome_in: ["confirm"], must, must_not: ["How much\\?", "Cancel what", "Who should I send"] });
const honest = (must) => ({ outcome_in: ["ask", "stop", "blocked", "answer"], must, must_not: [] });

// ---- Cancel: five merchants, full world -> a card each ----------------------------------------------
const MERCHANTS = [
  { key: "netflix", name: "Netflix", dollars: "17.99", typo: "netflx" },
  { key: "spotify", name: "Spotify", dollars: "11.99", typo: "spotfy" },
  { key: "hulu", name: "Hulu", dollars: "7.99", typo: null },
  { key: "planet fitness", name: "Planet Fitness", dollars: "25.00", typo: null },
  { key: "dropbox", name: "Dropbox", dollars: "11.99", typo: null },
];
const CANCEL_TEMPLATES = [
  (m) => `cancel ${m}`, (m) => `cancel my ${m}`, (m) => `can u cancel ${m} for me`, (m) => `cancle ${m}`,
  (m) => `stop paying for ${m}`, (m) => `get rid of ${m}`, (m) => `kill my ${m} sub`,
  (m) => `unsubscribe me from ${m}`, (m) => `end my ${m} subscription`, (m) => `i wanna cancel ${m}`,
  (m) => `cancel ${m} rn`, (m) => `please cancel my ${m} subscription today`,
];
for (const mer of MERCHANTS) {
  const must = [`^Cancel ${mer.name} \\(Standard, \\$${mer.dollars.replace(".", "\\.")}\\/mo\\)`];
  for (const t of CANCEL_TEMPLATES) add("cancel", "full", "complete", t(mer.key), { intent: "cancel_subscription", merchant: mer.key }, card(must));
  // A few templates get the full messy-variant spread.
  for (const t of [CANCEL_TEMPLATES[0], CANCEL_TEMPLATES[2], CANCEL_TEMPLATES[5]]) for (const v of variants(t(mer.key))) if (v !== t(mer.key)) add("cancel", "full", "complete", v, { intent: "cancel_subscription", merchant: mer.key }, card(must));
  if (mer.typo) add("cancel", "full", "complete", `cancel ${mer.typo}`, { intent: "cancel_subscription", merchant: mer.typo }, card(must));
}
// Cancel, named by amount: one matching charge -> card; no data -> the honest no-charge answer.
add("cancel", "full", "complete", "cancel the thing that charged me 17.99", { intent: "cancel_subscription" }, card([`^Cancel Netflix \\(Standard, \\$17\\.99\\/mo\\)`]), "model");
add("cancel", "full", "complete", "cancel the 25.00 charge", { intent: "cancel_subscription" }, card([`^Cancel Planet Fitness \\(Standard, \\$25\\.00\\/mo\\)`]), "model");
add("cancel", "nodata", "datagap", "cancel the 17.99 charge", { intent: "cancel_subscription" }, honest([`I don't see a recurring \\$17\\.99 charge`]), "model");
// Cancel, batch with no usage data: a data gap, said plainly.
add("cancel", "full", "datagap", "cancel everything i don't use", { intent: "cancel_subscription" }, honest([`I don't have usage data`]));
add("cancel", "full", "datagap", "cancel all my unused subscriptions", { intent: "cancel_subscription" }, honest([`I don't have usage data`]));

// ---- Cancel on the live test account's shape (no data): the seven phrasings that were MISSED live ----
// Kept verbatim from evals/gauntlet/sloppy-20.json (G08-G14), plus close variants. The correct reply states the
// missing charge plainly; understood_first must be true (reason no_charge is a data gap).
const LIVE_NODATA = ["cancel netflix", "cancel my netflix", "can u cancel netflix for me", "cancle netflix", "stop paying for netflix", "get rid of netflix", "kill my netflix sub",
  "cancel my netflix subscription", "end netflix", "cancel netflix pls", "i want to cancel netflix", "CANCEL NETFLIX", "cancel the netflix", "unsubscribe me from netflix", "cancel netflx"];
for (const text of LIVE_NODATA) add("cancel", "nodata", "datagap", text, { intent: "cancel_subscription", merchant: "netflix" }, honest([`^I don't see a netfl(i)?x charge on your linked cards`]));
// Partial world: no Netflix charge, but Spotify exists and is named in the answer; Spotify itself cards.
for (const text of ["cancel netflix", "cancle netflix", "get rid of netflix", "stop paying for netflix"]) add("cancel", "partial", "datagap", text, { intent: "cancel_subscription", merchant: "netflix" }, honest([`^I don't see a netflix charge on your linked cards`, `I see Spotify`]));
for (const text of ["cancel spotify", "cancle spotify", "kill my spotify sub"]) add("cancel", "partial", "complete", text, { intent: "cancel_subscription", merchant: "spotify" }, card([`^Cancel Spotify \\(Standard, \\$11\\.99\\/mo\\)`]));

// ---- Send ---------------------------------------------------------------------------------------------
const AMOUNTS = [["$40", 4000], ["40", 4000], ["forty", 4000], ["40 bucks", 4000], ["$40.00", 4000], ["fifty", 5000], ["$25", 2500]];
const moneyRe = (c) => "\\$" + String(Math.floor(c / 100)).replace(/\B(?=(\d{3})+(?!\d))/g, ",") + "\\." + String(c % 100).padStart(2, "0");
const SEND_TEMPLATES = [
  (a) => `send sam ${a[0]}`, (a) => `pay sam back ${a[0]}`, (a) => `can u send sam ${a[0]} pls`,
  (a) => `send ${a[0]} to sam`, (a) => `zelle sam ${a[0]}`, (a) => `pls pay sam ${a[0]} for rent`,
  (a) => `send sam ${a[0]} for dinner`,
];
AMOUNTS.forEach((a, i) => { const t = SEND_TEMPLATES[i % SEND_TEMPLATES.length]; add("send", "full", "complete", t(a), { intent: "send_money", recipient: "sam", amount_text: a[0], amount_cents: a[1] }, card([`${moneyRe(a[1])} to Sam K`])); });
AMOUNTS.forEach((a, i) => { const t = SEND_TEMPLATES[(i + 3) % SEND_TEMPLATES.length]; add("send", "full", "complete", t(a), { intent: "send_money", recipient: "sam", amount_text: a[0], amount_cents: a[1] }, card([`${moneyRe(a[1])} to Sam K`])); });
for (const v of variants("send sam $40")) if (v !== "send sam $40") add("send", "full", "complete", v, { intent: "send_money", recipient: "sam", amount_text: "$40", amount_cents: 4000 }, card([`\\$40\\.00 to Sam K`]));
add("send", "full", "complete", "venmo sam 40 for pizza", { intent: "send_money", recipient: "sam", amount_text: "40", amount_cents: 4000, memo: "pizza" }, card([`\\$40\\.00 to Sam K`, `in Venmo`]));
add("send", "full", "complete", "send sam 50 no wait make it 40", { intent: "send_money", recipient: "sam", amount_text: "40", amount_cents: 4000 }, card([`Using 40, your last number`, `\\$40\\.00 to Sam K`]), "model");
// Send, recipient not saved (data gap): the new-recipient question, understood on the first message.
for (const text of ["send sam $40", "pay sam back forty", "venmo sam 40 for pizza"]) add("send", "nodata", "datagap", text, { intent: "send_money", recipient: "sam", amount_text: /\d/.test(text) ? text.match(/\d+|forty/)[0] : "forty", amount_cents: 4000 }, honest([`Sam`]));
for (const text of ["send jane $20", "pay jane back twenty"]) add("send", "full", "datagap", text, { intent: "send_money", recipient: "jane", amount_text: /\$?\d+|twenty/.exec(text)[0], amount_cents: 2000 }, honest([`Jane`]));
// Send, a detail missing from the words: ask for exactly that detail.
add("send", "full", "incomplete", "send sam", { intent: "send_money", recipient: "sam" }, { outcome_in: ["ask"], must: [`How much\\?`], must_not: [] });
add("send", "full", "incomplete", "pay sam back", { intent: "send_money", recipient: "sam" }, { outcome_in: ["ask"], must: [`How much\\?`], must_not: [] });
add("send", "full", "incomplete", "send $40", { intent: "send_money", amount_text: "$40", amount_cents: 4000 }, { outcome_in: ["ask"], must: [`Who should I send it to\\?`], must_not: [] });

// ---- Buy ----------------------------------------------------------------------------------------------
const BUYS = [
  ["$500", 50000, "VOO"], ["500", 50000, "VOO"], ["five hundred dollars", 50000, "VOO"], ["$5", 500, "VTI"],
  ["$250", 25000, "VTI"], ["$1,000", 100000, "VOO"], ["twenty five dollars", 2500, "VTI"],
];
const BUY_TEMPLATES = [(a, s) => `buy ${a} of ${s}`, (a, s) => `can u buy ${a} of ${s} for me`, (a, s) => `put ${a} in ${s}`, (a, s) => `get me ${a} of ${s}`, (a, s) => `i want to buy ${a} of ${s}`];
BUYS.forEach((b, i) => { const t = BUY_TEMPLATES[i % BUY_TEMPLATES.length]; add("trade", "full", "complete", t(b[0], b[2]), { intent: "buy_security", instrument: b[2], amount_text: b[0], amount_cents: b[1] }, card([`^Buy ${moneyRe(b[1])} of ${b[2]}`])); });
BUYS.forEach((b, i) => { const t = BUY_TEMPLATES[(i + 2) % BUY_TEMPLATES.length]; add("trade", "full", "complete", t(b[0], b[2]), { intent: "buy_security", instrument: b[2], amount_text: b[0], amount_cents: b[1] }, card([`^Buy ${moneyRe(b[1])} of ${b[2]}`])); });
for (const v of variants("buy $500 of VOO")) if (v !== "buy $500 of VOO") add("trade", "full", "complete", v, { intent: "buy_security", instrument: "VOO", amount_text: "$500", amount_cents: 50000 }, card([`^Buy \\$500\\.00 of VOO`]));
add("trade", "full", "complete", "buy 2 shares of VOO", { intent: "buy_security", instrument: "VOO", quantity: 2 }, card([`^Buy 2 shares of VOO`, `about \\$1,024\\.20`]), "model");
add("trade", "full", "complete", "buy 10 shares of VTI", { intent: "buy_security", instrument: "VTI", quantity: 10 }, card([`^Buy 10 shares of VTI`]), "model");
add("trade", "full", "complete", "buy VOO $500", { intent: "buy_security", instrument: "VOO", amount_text: "$500", amount_cents: 50000 }, card([`^Buy \\$500\\.00 of VOO`]), "model");
// Buy with no brokerage linked (data gap).
for (const text of ["buy $500 of VOO", "buy $5 of VTI", "can u buy $500 of VOO for me"]) add("trade", "nodata", "datagap", text, { intent: "buy_security", instrument: /VOO/.test(text) ? "VOO" : "VTI", amount_text: /\$[\d,]+/.exec(text)[0], amount_cents: /VTI/.test(text) ? 500 : 50000 }, honest([`No brokerage account is linked`]));

// ---- Sell ---------------------------------------------------------------------------------------------
for (const [text, slots, must] of [
  ["sell 1 share of VOO", { intent: "sell_security", instrument: "VOO", quantity: 1 }, [`^Sell 1 share of VOO`]],
  ["sell $500 of VOO", { intent: "sell_security", instrument: "VOO", amount_text: "$500", amount_cents: 50000 }, [`^Sell .* of VOO|\\$500\\.00`]],
  ["sell all my VOO", { intent: "sell_security", instrument: "VOO" }, [`Sell`, `VOO`]],
  ["can u sell 1 share of VOO for me", { intent: "sell_security", instrument: "VOO", quantity: 1 }, [`^Sell 1 share of VOO`]],
  ["SELL 1 SHARE OF VOO", { intent: "sell_security", instrument: "VOO", quantity: 1 }, [`Sell 1 share of VOO`]],
]) add("trade", "full", "complete", text, slots, card(must));
for (const text of ["sell 1 share of VOO", "sell all my VOO"]) add("trade", "nohold", "datagap", text, { intent: "sell_security", instrument: "VOO", quantity: text.includes("1 share") ? 1 : undefined }, honest([`shows no VOO available to sell`]));

// ---- Split --------------------------------------------------------------------------------------------
add("split", "full", "complete", "split dinner 142.60 with sam", { intent: "split_expense", recipient: "sam", amount_text: "142.60", amount_cents: 14260, memo: "dinner" }, card([`Request \\$71\\.30 from Sam K`, `\\$142\\.60 split 2 ways`]));
add("split", "full", "complete", "split the $60 dinner with sam", { intent: "split_expense", recipient: "sam", amount_text: "$60", amount_cents: 6000, memo: "dinner" }, card([`Request \\$30\\.00 from Sam K`, `for dinner`]));
add("split", "full", "complete", "split $100 with sam", { intent: "split_expense", recipient: "sam", amount_text: "$100", amount_cents: 10000 }, card([`Request \\$50\\.00 from Sam K`]));
add("split", "full", "complete", "can u split dinner 142.60 with sam", { intent: "split_expense", recipient: "sam", amount_text: "142.60", amount_cents: 14260, memo: "dinner" }, card([`Request \\$71\\.30 from Sam K`]));
add("split", "full", "complete", "split the check 84.20 with sam", { intent: "split_expense", recipient: "sam", amount_text: "84.20", amount_cents: 8420 }, card([`Request \\$42\\.10 from Sam K`]));

// ---- Rent ---------------------------------------------------------------------------------------------
add("rent", "full", "datagap", "pay my rent", null, honest([`Who do you pay rent to`]), "down");
add("rent", "full", "datagap", "pls pay the rent", null, honest([`Who do you pay rent to`]), "down");
add("rent", "rent", "complete", "pay my rent", null, card([`Rent for November: \\$900\\.00 to Sam K on Venmo, due Nov 1`]), "down");

// ---- Not orders: never a card, never a write ----------------------------------------------------------
const NOT_ORDERS = [
  ["cancel", "dont cancel netflix"], ["cancel", "did i cancel netflix"], ["cancel", "i already cancelled netflix last month"],
  ["cancel", "netflix cancelled me"], ["send", "dont send sam 40"], ["send", "never mind sending sam 40"],
  ["send", "sam sent me 40"], ["send", "i already sent sam 40"], ["send", "maybe send sam 40 later"],
  ["trade", "do not sell 2 VOO"], ["trade", "i sold 2 VOO yesterday"], ["trade", "my friend told me to buy 2 VOO"],
  ["trade", "if i sell all my VOO how much would i owe"], ["trade", "should i buy VOO"], ["trade", "should i sell 2 VOO"],
];
for (const [flow, text] of NOT_ORDERS) add(flow, "full", "notanorder", text, null, { outcome_in: ["fallthrough", "refuse", "stop", "not_built"], must: [], must_not: [`Reply YES or NO`] }, "down");
add(null, "full", "notanorder", "what's my balance", null, { outcome_in: ["fallthrough"], must: [], must_not: [`Reply YES or NO`] }, "down");

// ---- Incomplete cancels / buys ------------------------------------------------------------------------
add("cancel", "full", "incomplete", "cancel", { intent: "cancel_subscription" }, { outcome_in: ["ask"], must: [`Cancel what\\?`], must_not: [] }, "model");
add("trade", "full", "incomplete", "buy VOO", { intent: "buy_security", instrument: "VOO" }, { outcome_in: ["ask"], must: [`How much|How many`], must_not: [] }, "model");

const file = path.join(__dirname, "sloppy-expanded.json");
fs.writeFileSync(file, JSON.stringify({ generated_by: "evals/gauntlet/gen-sloppy-expanded.cjs", items: out }, null, 1) + "\n");
const by = (k) => out.reduce((m, x) => ((m[x[k]] = (m[x[k]] || 0) + 1), m), {});
console.log(`wrote ${out.length} items -> ${file}`);
console.log("by flow:", JSON.stringify(by("flow")), "by world:", JSON.stringify(by("world")), "by category:", JSON.stringify(by("category")), "by mode:", JSON.stringify(by("mode")));
