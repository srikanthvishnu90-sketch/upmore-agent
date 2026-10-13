// FINAL K3 doorstep — the trade action a market alert/screen offers (C18's alert message, C32's routing),
// driven through the production chat trade path (66-agent-trade.js) over the production Alpaca adapter against
// the MOCK Alpaca server (sandbox rail; the broker is a mock and is named on the card's quote line). The card
// is filled in and ready — and the run stops there: no YES is ever sent, and the mock must record zero writes.
// The live doorstep (the person's own Alpaca session) is pending the Alpaca OAuth app registration (owner).
// Check: node --test tests/final-k3-doorstep.test.cjs
const { test, after } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const domainDir = path.join(root, "packages/domain");
const Mock = require("./fixtures/alpaca-mock.cjs");
const ctx = vm.createContext({ fetch, AbortController, setTimeout, clearTimeout, URL, btoa, Buffer });
vm.runInContext(["35-agent-intents.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "50-agent-invest.js", "53-compliance.js", "66-agent-trade.js", "67-agent-cards.js", "71-alpaca.js", "76-connect-cards.js", "73-broker-accounts.js"].map((f) => fs.readFileSync(path.join(domainDir, f), "utf8")).join("\n") + "\nthis.T=AgentTrade;this.A=AlpacaTrading;this.C=Compliance;", ctx);
const { T, A, C } = ctx;
const Registry = require(path.join(root, "packages/capabilities/registry.js"));
const registry = Registry.load(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")), (rel) => fs.existsSync(path.join(root, rel)));
const TOKEN = "tok-person-1", ACCT = "acct-live-1", T0 = Date.UTC(2026, 9, 12, 14, 0, 0);
const servers = []; after(async () => { for (const s of servers) await s.close(); });
async function world(mockOpts) {
  const t = { now: T0 };
  const m = await Mock.start(Object.assign({ now: () => t.now, account: ACCT, tokens: { [TOKEN]: ACCT } }, mockOpts || {}));
  servers.push(m);
  const adapter = A.create({ base: m.base, mock: true, token: TOKEN, account_id: ACCT, order_cap_cents: 1000000, clock: () => t.now });
  const conn = A.connectors(adapter, { clock: () => t.now });
  const s = T.create({ registry, connectors: conn, clock: () => t.now, instruments: [], partners: { broker_dealer: { live: true, paper: false, name: "Alpaca (your account)" } }, compliance: C });
  return { m, s };
}

test("C18 doorstep: the alert's trade words stage a filled LIVE card for $5 of NVDA — ready, not executed", async () => {
  const w = await world({ positions: { NVDA: 50 }, quotes: { NVDA: [18200, 18240] } });
  const r = await w.s.start("buy $5 of NVDA");
  assert.equal(r.text, "LIVE: Buy $5.00 of NVDA (NVIDIA Corporation Common Stock) in your Alpaca account. No fee. Quote $182.40 (Alpaca mock server, IEX ask, 13:59 UTC). Can't be undone once filled. Reply YES or NO within 10 min, or DETAILS.");
  assert.equal(w.m.writes().length, 0, "the doorstep stops before execution: zero writes at the broker");
  assert.equal(w.m.state.orders.length, 0, "no order exists");
});

test("C32 doorstep: the risers screen's trade words stage the same card for $5 of AMD — ready, not executed", async () => {
  const w = await world({ quotes: { AMD: [22600, 22640] }, assets: { AMD: { name: "Advanced Micro Devices, Inc. Common Stock", fractionable: true, tradable: true } } });
  const r = await w.s.start("buy $5 of AMD");
  assert.match(r.text, /^LIVE: Buy \$5\.00 of AMD \(Advanced Micro Devices, Inc\. Common Stock\) in your Alpaca account\./);
  assert.match(r.text, /Reply YES or NO within 10 min/);
  assert.equal(w.m.writes().length, 0);
  assert.equal(w.m.state.orders.length, 0);
});
