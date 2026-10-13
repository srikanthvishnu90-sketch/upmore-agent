// Final A5 — low-balance warning cadence at the domain layer (59-agent-alerts.js, 56-agent-proactive.js):
// the warning fires once per low-point EPISODE, re-fires only on a material worsening (the rule defined in
// one place in 59-agent-alerts.js: the projected low drops >= $50, or >= 10% of the last reported low's
// magnitude, or the first under-buffer day moves >= 7 days closer), closes on recovery, and fires fresh for
// a new episode. The detector's numbers are unchanged — only its key stopped following the moving date.
// Check: node --test tests/final-a5-cadence.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
vm.runInContext(["32-merchant-label.js", "33-agent-monitors.js", "35-agent-intents.js", "36-agent-workflows.js", "41-agent-recovery.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "49-agent-save.js", "44-agent-earn.js", "55-agent-news.js", "57-agent-ledger.js", "59-agent-alerts.js", "56-agent-proactive.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.A = AgentAlerts; this.P = AgentProactive;", ctx);
const A = ctx.A, P = ctx.P;
const plain = x => JSON.parse(JSON.stringify(x));

test("the detector's key no longer follows the moving projection: two days, two first-under days, one episode key; the numbers are the forecast's own", () => {
  const rows = [
    { id: "r1", account_id: "chk", posted_at: "2026-08-15", amount_cents: -60000, amount: -600, merchant_raw: "OAK PROPERTY MGMT RENT" },
    { id: "r2", account_id: "chk", posted_at: "2026-09-15", amount_cents: -60000, amount: -600, merchant_raw: "OAK PROPERTY MGMT RENT" },
  ];
  const acct = bal => [{ id: "chk", kind: "checking", balance_cents: bal, available_cents: bal, source: "Mock Bank via SimpleFIN", as_of: "2026-10-12T06:00:00Z" }];
  const d1 = A.detect({ today: "2026-10-12", transactions: rows, accounts: acct(80000), buffer_cents: 50000 }).find(x => x.kind === "low_balance");
  const d2 = A.detect({ today: "2026-10-13", transactions: rows, accounts: acct(79500), buffer_cents: 50000 }).find(x => x.kind === "low_balance");
  assert.equal(d1.key, "low_balance:ep:chk");
  assert.equal(d2.key, "low_balance:ep:chk", "the projected day moved (and the old key would have moved with it); the episode key does not");
  assert.deepEqual([d1.episode.low_cents, d1.episode.first_below_on], [20000, "2026-10-15"]);
  assert.deepEqual([d2.episode.low_cents, d2.episode.first_below_on], [19500, "2026-10-15"]);
  assert.equal(d1.text, "Your cash is $800.00 now; it goes under your $500.00 buffer on 2026-10-15 ($200.00) and bottoms at $200.00 on 2026-10-15.");
  // The $5.00 the low moved between the two days is jitter: the episode decision suppresses it.
  const s1 = A.lowBalanceEpisode(d1.episode, null, "2026-10-12");
  assert.equal(s1.action, "fire");
  assert.equal(A.lowBalanceEpisode(d2.episode, s1.state, "2026-10-13").action, "suppress");
});

test("materiality, in the one stated place: $50, 10 percent, 7 days — and nothing below all three", () => {
  assert.deepEqual([A.LOW_BALANCE_DROP_CENTS, A.LOW_BALANCE_DROP_PCT, A.LOW_BALANCE_DATE_DAYS], [5000, 10, 7]);
  const cur = (low_cents, first_below_on) => ({ scope: "chk", low_cents, first_below_on });
  const open = A.lowBalanceEpisode(cur(-100000, "2026-11-01"), null, "2026-10-12").state;
  // $49.99 lower, 0 days closer: not material (1 cent under the dollar leg, and under 10% of $1,000).
  assert.equal(A.lowBalanceEpisode(cur(-104999, "2026-11-01"), open, "2026-10-13").action, "suppress");
  // Exactly $50.00 lower: material.
  const fifty = A.lowBalanceEpisode(cur(-105000, "2026-11-01"), open, "2026-10-13");
  assert.equal(fifty.action, "refire");
  assert.equal(fifty.worsening_text, "The low is now -$1,050.00, $50.00 lower than when I last warned you (it was -$1,000.00).");
  // An improvement never re-fires, however large.
  assert.equal(A.lowBalanceEpisode(cur(-50000, "2026-11-01"), open, "2026-10-13").action, "suppress");
  // A later first day never re-fires.
  assert.equal(A.lowBalanceEpisode(cur(-100000, "2026-11-10"), open, "2026-10-13").action, "suppress");
});

test("the feed carries the episode picture for both detectors, and a different account set is a different episode", () => {
  const rows = [
    { id: "r1", account_id: "chk", posted_at: "2026-08-15", amount_cents: -60000, amount: -600, merchant_raw: "OAK PROPERTY MGMT RENT" },
    { id: "r2", account_id: "chk", posted_at: "2026-09-15", amount_cents: -60000, amount: -600, merchant_raw: "OAK PROPERTY MGMT RENT" },
  ];
  const accounts = [{ id: "chk", kind: "checking", balance_cents: 80000, available_cents: 80000, source: "Mock Bank via SimpleFIN", as_of: "2026-10-12T06:00:00Z" }];
  const f = plain(P.feed({ today: "2026-10-12", transactions: rows, accounts, buffer_cents: 50000, isLive: true }, { now: Date.UTC(2026, 9, 12, 16) }));
  const w = f.watches.concat(f.proactive).find(x => x.key.startsWith("low_balance:"));
  assert.ok(w, JSON.stringify(f.watches.concat(f.proactive).map(x => x.key)));
  assert.equal(w.key, "low_balance:ep:chk");
  assert.deepEqual([w.episode.low_cents, w.episode.first_below_on], [20000, "2026-10-15"]);
  assert.equal(A.lowBalanceScope([{ id: "a", kind: "checking" }, { id: "b", kind: "savings" }]), "a+b");
  assert.notEqual(A.lowBalanceScope([{ id: "a", kind: "checking" }]), A.lowBalanceScope([{ id: "b", kind: "checking" }]), "two different accounts dipping are two episodes");
});
