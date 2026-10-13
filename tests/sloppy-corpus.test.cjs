// The expanded sloppy corpus (Spec 16 understanding bar, measured locally): hundreds of messy first messages across
// every router intent, driven through the real AgentRouter and flow sessions in five in-memory worlds. Corpus data:
// evals/gauntlet/sloppy-expanded.json (regenerate with evals/gauntlet/gen-sloppy-expanded.cjs). Definitions match
// evals/gauntlet/run-live.cjs: a message is UNDERSTOOD when the route metadata names the right flow and
// understood_first is true (the intent was read from the person's words on the first message; a question caused by
// missing DATA — no charge, no brokerage, no saved recipient — is not a misunderstanding). CORRECT means the first
// reply does the right thing: a card with the right facts when the data is there, an honest statement about the
// missing data when it is not, a question for exactly the missing detail when the words lack it, and never a card
// for a non-order. Nothing may write in any case: the first message only ever stages.
// Check: node --test tests/sloppy-corpus.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({ setTimeout, clearTimeout });
vm.runInContext(["33-agent-monitors.js", "35-agent-intents.js", "41-agent-recovery.js", "42-agent-recipients.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "49-agent-save.js", "50-agent-invest.js", "53-compliance.js", "54-agent-money.js", "64-agent-send.js", "65-agent-realworld.js", "66-agent-trade.js", "67-agent-cards.js", "68-agent-cancel.js", "69-agent-router.js", "70-agent-split.js", "81-standing-rent.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.R=AgentRouter;this.T=AgentTrade;this.X=AgentCancel;this.S=AgentSend;this.SP=AgentSplit;this.C=Compliance;this.Rec=AgentRecipients;this.SR=StandingRent;", ctx);
const { R, T, X, S, SP, C, Rec, SR } = ctx;
const Registry = require(path.join(root, "packages/capabilities/registry.js"));
const registry = Registry.load(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")), rel => fs.existsSync(path.join(root, rel)));
const corpus = JSON.parse(fs.readFileSync(path.join(root, "evals/gauntlet/sloppy-expanded.json"), "utf8"));
const T0 = Date.UTC(2026, 9, 12, 14, 0, 0);
const instruments = [{ symbol: "VOO", name: "Vanguard S&P 500 ETF" }, { symbol: "VTI", name: "Vanguard Total Stock Market ETF" }];
const PEOPLE = [{ id: "p1", name: "Sam K", handle: "@samk", handles: { venmo: "@samk", zelle: "sam@example.com" }, rails: ["venmo", "zelle"], saved: true, history: [{ amount_cents: 2000, on: "2026-09-01" }] }];
const DIRECTORY = { netflix: { kind: "portal", url: "netflix.com/cancelplan", display_name: "Netflix" }, spotify: { kind: "portal", url: "spotify.com/cancel", display_name: "Spotify" }, hulu: { kind: "portal", url: "hulu.com/cancel", display_name: "Hulu" }, "planet fitness": { kind: "portal", url: "planetfitness.com/cancel", display_name: "Planet Fitness" }, dropbox: { kind: "portal", url: "dropbox.com/cancel", display_name: "Dropbox" } };
const CHARGES = [["NETFLIX.COM", 17.99], ["SPOTIFY", 11.99], ["HULU", 7.99], ["PLANET FITNESS", 25.00], ["DROPBOX", 11.99]];
function txsFor(list) { const t = []; let n = 0; for (const [raw, amt] of list) for (const d of ["2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"]) t.push({ id: "t" + (++n), account_id: "visa", posted_at: d, amount: -amt, merchant_raw: raw, is_pending: false, is_transfer: false }); return t; }
const WORLDS = {
  full: { txs: txsFor(CHARGES), broker: true, position: 2, people: PEOPLE, rentRule: null },
  partial: { txs: txsFor([["SPOTIFY", 11.99]]), broker: true, position: 2, people: PEOPLE, rentRule: null },
  nodata: { txs: [], broker: false, position: 0, people: [], rentRule: null },
  nohold: { txs: txsFor(CHARGES), broker: true, position: 0, people: PEOPLE, rentRule: null },
  rent: { txs: txsFor(CHARGES), broker: true, position: 2, people: PEOPLE, rentRule: { id: "sp-1", kind: "rent", payee_name: "Sam K", payee_handle: "@samk", rail: "venmo", amount_cents: 90000, day_of_month: 1, funding: "checking", status: "active", created_at: "2026-09-01T00:00:00Z", last_staged_month: null } },
};
function sessionsFor(worldName, writes) {
  const w = WORLDS[worldName], clock = () => T0;
  const read = async (kind) => {
    if (kind === "brokerage_accounts") return { value: w.broker ? [{ id: "schwab-1", name: "Schwab brokerage", fractional: true, cash_cents: 1000000 }] : [], source: "Example Broker", as_of: T0 };
    if (kind === "quote") return { value: { price_cents: 51210 }, source: "Example Quotes", as_of: T0 - 60000 };
    if (kind === "position") return { value: { qty: w.position, qty_available: w.position }, source: "Example Broker", as_of: T0 };
    if (kind === "holdings") return { value: w.position ? [{ symbol: "VOO", qty: 2, market_value_cents: 102420 }] : [], source: "Example Broker", as_of: T0 };
    if (kind === "subscription_terms") return { value: { plan: "Standard", access_until: "2026-11-03", refund_policy: "no refunds", next_charge_on: "2026-11-03", fee_cents: 0, remaining_contract_cents: 0 }, source: "account page", as_of: T0 };
    if (kind === "merchant_record") return { value: { state: "active", next_charge_on: "2026-11-03" }, source: "merchant", as_of: T0 };
    return { value: 1, source: "x", as_of: T0 };
  };
  const conn = { read, write: async (id, p, key) => { writes.push({ id, key }); return { ok: true, reference: "ref-1" }; }, verify: async () => ({ confirmed: true, source: "Example Rail", reference: "ref-1" }) };
  const book = Rec.book({ people: w.people, clock });
  return {
    trade: T.create({ registry, connectors: conn, clock, instruments, partners: { broker_dealer: { live: true } }, compliance: C }),
    cancel: X.create({ registry, connectors: conn, clock, transactions: w.txs, directory: DIRECTORY }),
    send: S.create({ registry, connectors: conn, clock, people: w.people, partners: { ach: true }, limits: { per_day_cents: 1000000, per_week_cents: 3000000 }, large_cents: 50000 }),
    split: SP.create({ registry, connectors: conn, clock, recipients: book, partners: {}, compliance: C }),
    rent: SR.create({ clock, rule: w.rentRule, recipients: Rec.book({ people: PEOPLE, clock }) }),
  };
}
const parsers = { trade: t => T.parse(t), send: t => S.parse(t), cancel: t => X.parse(t), split: t => SP.parse(t) };
// The extraction a correct model returns for the item's slots, with every span taken verbatim from the tidied text
// the router actually hands the model. "drops" keeps only the intent (the omissions seen live from gpt-5-nano);
// "down" throws, so the regex net routes alone.
function extractorFor(item) {
  if (item.mode === "down") return async () => { throw new Error("router model down"); };
  const s = item.slots;
  if (!s) return async () => ({ intent: "other" });
  if (item.mode === "drops") return async () => ({ intent: s.intent });
  return async (tidied) => {
    const find = (needle) => { if (needle == null) return undefined; const i = tidied.toLowerCase().indexOf(String(needle).toLowerCase()); return i < 0 ? undefined : tidied.slice(i, i + String(needle).length); };
    const ex = { intent: s.intent };
    if (s.merchant) ex.merchant_span = find(s.merchant);
    if (s.recipient) ex.recipient_span = find(s.recipient);
    if (s.instrument) ex.instrument_span = find(s.instrument);
    if (s.amount_text) { ex.amount_span = find(s.amount_text); ex.amount_cents = s.amount_cents; ex.unit = "dollars"; }
    if (s.quantity) { ex.quantity = s.quantity; ex.unit = "shares"; ex.amount_span = find(String(s.quantity)); }
    if (s.memo) ex.memo_span = find(s.memo);
    return ex;
  };
}
function grade(item, r, writes) {
  const reply = r && r.result && typeof r.result.text === "string" ? r.result.text : "";
  const outcome = r && r.result ? r.result.outcome : r && r.route === "fallthrough" ? "fallthrough" : null;
  // Sloppy input is matched loosely (a person who typed in caps gets their capitalization echoed back); the card
  // facts themselves (amounts, names) still have to match exactly.
  const mustOk = item.expect.must.every(src => new RegExp(src, "i").test(reply));
  const notOk = item.expect.must_not.every(src => !new RegExp(src, "i").test(reply));
  const outcomeOk = item.expect.outcome_in.includes(outcome);
  const understood = !!(r && item.flow && r.flow === item.flow && r.understood_first === true);
  let correct = outcomeOk && mustOk && notOk && writes.length === 0;
  if (item.category === "notanorder") correct = correct && !(r && r.result && r.result.outcome === "confirm");
  return { understood, correct, outcome, reply, why: [!outcomeOk && `outcome ${outcome} not in ${item.expect.outcome_in}`, !mustOk && `reply misses ${item.expect.must.filter(src => !new RegExp(src).test(reply))}`, !notOk && "reply hits a must_not", writes.length && `${writes.length} writes`].filter(Boolean).join("; ") };
}

test("sloppy corpus: >=95% understood and >=95% correctly carded/answered on the first message", async () => {
  const items = corpus.items;
  assert.ok(items.length >= 200, `corpus too small: ${items.length}`);
  const rows = [];
  for (const item of items) {
    const writes = [];
    let r = null, err = null;
    try { r = await R.handle(item.text, { extract: extractorFor(item), sessions: sessionsFor(item.world, writes), parsers }); } catch (e) { err = String(e && e.message || e); }
    const g = err ? { understood: false, correct: false, outcome: null, reply: "", why: "threw: " + err } : grade(item, r, writes);
    rows.push({ item, g });
  }
  const scored = rows.filter(x => ["complete", "datagap"].includes(x.item.category));
  const und = scored.filter(x => x.g.understood).length;
  const correct = rows.filter(x => x.g.correct).length;
  const pct = (a, b) => (100 * a / b).toFixed(1) + "%";
  const lines = [`corpus: ${items.length} items; understood ${und}/${scored.length} (${pct(und, scored.length)}) over complete+datagap; correct ${correct}/${rows.length} (${pct(correct, rows.length)}) over all`];
  for (const mode of ["model", "drops", "down"]) {
    const ms = scored.filter(x => x.item.mode === mode), mc = rows.filter(x => x.item.mode === mode);
    lines.push(`  mode ${mode}: understood ${ms.filter(x => x.g.understood).length}/${ms.length}, correct ${mc.filter(x => x.g.correct).length}/${mc.length}`);
  }
  for (const flow of ["cancel", "send", "trade", "split", "rent"]) {
    const fs2 = scored.filter(x => x.item.flow === flow);
    if (fs2.length) lines.push(`  flow ${flow}: understood ${fs2.filter(x => x.g.understood).length}/${fs2.length}`);
  }
  const failures = rows.filter(x => !x.g.correct || (["complete", "datagap"].includes(x.item.category) && !x.g.understood));
  for (const f of failures.slice(0, 40)) lines.push(`  FAIL ${f.item.id} [${f.item.flow}/${f.item.world}/${f.item.category}/${f.item.mode}] ${JSON.stringify(f.item.text)} :: ${f.g.why} :: reply: ${String(f.g.reply).slice(0, 140)}`);
  console.log(lines.join("\n"));
  assert.ok(und / scored.length >= 0.95, `understood ${und}/${scored.length} below the 95% bar`);
  assert.ok(correct / rows.length >= 0.95, `correct ${correct}/${rows.length} below the 95% bar`);
});
