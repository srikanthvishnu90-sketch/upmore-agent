// Own-account transfers from chat (PAY-009; real-world C30, and the staging path C29's preventive move
// reuses): "move $500 from Everyday Checking to High Yield Savings" stages the money-plans transfer on a
// confirmation card through the loop (43-agent-loop.js) and the transfer session
// (117-agent-transfer.js), and a yes executes it on a fake rail and verifies by read-back. The gates are
// the real ones: the compliance module (53-compliance.js) with and without a live money-movement partner.
// Check: node --test tests/transfer.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
vm.runInContext(["33-agent-monitors.js", "35-agent-intents.js", "36-agent-workflows.js", "41-agent-recovery.js", "42-agent-recipients.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "49-agent-save.js", "44-agent-earn.js", "54-agent-money.js", "55-agent-news.js", "57-agent-ledger.js", "59-agent-alerts.js", "60-agent-money-plans.js", "53-compliance.js", "56-agent-proactive.js", "117-agent-transfer.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.T=AgentTransfer;this.Compliance=Compliance;", ctx);
const T = ctx.T, Compliance = ctx.Compliance;
let now = Date.UTC(2026, 9, 15, 14, 0, 0);
const clock = () => now;
const ACCOUNTS = () => [
  { account_id: "chk-1", name: "Everyday Checking", institution: "First Bank", account_kind: "checking", balance_cents: 500000, available_cents: 500000, currency: "USD", status: "active" },
  { account_id: "sav-1", name: "High Yield Savings", institution: "First Bank", account_kind: "savings", balance_cents: 128000, available_cents: 128000, currency: "USD", status: "active" },
];
const registry = { get: id => id === "PAY-009" ? { id, name: "Transfer between your accounts", tier: "T4", status: "TESTED" } : null, answer: () => ({ text: "" }) };
// A fake rail (mock, tests only): balances live on the rail; a write moves money between the person's own
// accounts and verify reads that state back, so "confirmed" means the end state changed.
function fakeRail(balances) {
  const writes = [];
  return { writes, balances, connectors: {
    read: async () => ({ value: 1, source: "Sandbox Bank", as_of: now }),
    write: async (id, p, key) => { writes.push(key); balances[p.from] -= p.amount_cents; balances[p.to] += p.amount_cents; return { reference: "sbx-" + writes.length }; },
    verify: async () => ({ confirmed: true, source: "Sandbox Bank" }),
  } };
}
const PARTNER = { money_movement: { live: true, name: "Sandbox Bank" } };
const KYC = { state: "verified" };
function session(rail, accounts, extra) {
  return T.create(Object.assign({ registry, connectors: rail.connectors, clock, compliance: Compliance, partners: PARTNER, kyc: KYC, accounts: accounts || ACCOUNTS() }, extra || {}));
}
const MOVE = "move $500 from Everyday Checking to High Yield Savings";

test("parse and match: only a move between two of the person's own accounts is captured", async () => {
  const s = session(fakeRail({}), ACCOUNTS());
  assert.equal(T.intent(MOVE), true);
  assert.equal(await s.matches(MOVE), true);
  assert.equal(await s.matches("transfer $50 to Maya"), false, "a person is not an account");
  assert.equal(await s.matches("send $50 to Maya"), false, "send is the person flow's verb");
  assert.equal(await s.matches("move $500 to savings"), true, "the source is the one other deposit account");
  assert.equal(await s.matches("what's my balance"), false);
  const p = T.parse("move $2,100.00 from Everyday Checking to High Yield Savings");
  assert.equal(p.amount_cents, 210000); assert.equal(p.from_query, "Everyday Checking"); assert.equal(p.to_query, "High Yield Savings");
});

test("the card: exact amount, both accounts by name, the fee, what happens next, reversibility — and nothing moves before the yes", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s = session(rail);
  const r = await s.start(MOVE);
  assert.equal(r.outcome, "confirm");
  assert.match(r.text, /Move \$500\.00 from Everyday Checking to High Yield Savings\?/);
  assert.match(r.text, /No fee\./);
  assert.match(r.text, /lands instantly/, "same bank on both ends");
  assert.match(r.text, /move it back the same way any time/, "reversibility is on the card");
  assert.match(r.text, /Reply YES to move it, or NO to drop it\./);
  assert.equal(rail.writes.length, 0); assert.deepEqual(rail.balances, { "chk-1": 500000, "sav-1": 128000 });
  assert.ok(s.pending && s.pending.confirmation_id === r.confirmation_id);
});

test("a yes executes exactly the card's move on the rail and the receipt cites the rail's read-back", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s = session(rail);
  await s.start(MOVE);
  const done = await s.reply("yes");
  assert.equal(done.outcome, "confirmed");
  assert.equal(done.reference, "sbx-1");
  assert.match(done.text, /\(ref sbx-1\)/);
  assert.match(done.text, /Confirmed by Sandbox Bank\./);
  assert.deepEqual(rail.balances, { "chk-1": 450000, "sav-1": 178000 }, "both balances moved by exactly $500.00");
  assert.equal(s.pending, null);
  const again = await s.reply("yes");
  assert.equal(again.outcome, "nothing_pending", "a second yes with no live card fires nothing");
  assert.equal(rail.writes.length, 1);
});

test("a no drops the card and moves nothing; the same move staged again the same day is not executed twice", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s = session(rail);
  await s.start(MOVE);
  const no = await s.reply("no");
  assert.equal(no.outcome, "declined"); assert.equal(rail.writes.length, 0);
  await s.start(MOVE);
  const yes = await s.reply("yes");
  assert.equal(yes.outcome, "confirmed"); assert.equal(rail.writes.length, 1);
  const dup = await s.start(MOVE);
  assert.equal(dup.outcome, "already_done", "the loop's idempotency key (from, to, amount, day) refuses a blind repeat");
  assert.equal(rail.writes.length, 1); assert.deepEqual(rail.balances, { "chk-1": 450000, "sav-1": 178000 });
});

test("the gates: no live money-movement partner, or an unverified identity, and no card is ever staged", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const noPartner = T.create({ registry, connectors: rail.connectors, clock, compliance: Compliance, partners: {}, kyc: KYC, accounts: ACCOUNTS() });
  const blocked = await noPartner.start(MOVE);
  assert.equal(blocked.outcome, "blocked"); assert.equal(blocked.reason, "compliance:no_live_partner");
  assert.match(blocked.text, /licensed money-movement partner/);
  assert.equal(noPartner.pending, null); assert.equal(rail.writes.length, 0);
  const noKyc = T.create({ registry, connectors: rail.connectors, clock, compliance: Compliance, partners: PARTNER, kyc: { state: "not_started" }, accounts: ACCOUNTS() });
  const kycBlocked = await noKyc.start(MOVE);
  assert.equal(kycBlocked.outcome, "blocked"); assert.match(kycBlocked.reason, /^compliance:kyc_/);
  assert.equal(noKyc.pending, null);
});

test("asks, never guesses: too much money, an ambiguous account, the same account twice, no amount", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s = session(rail);
  const tooMuch = await s.start("move $6,000 from Everyday Checking to High Yield Savings");
  assert.equal(tooMuch.outcome, "stop"); assert.match(tooMuch.text, /has \$5,000\.00 available/); assert.match(tooMuch.text, /Nothing moved/);
  assert.equal(s.pending, null);
  const twoSavings = ACCOUNTS().concat([{ account_id: "sav-2", name: "Vacation Savings", institution: "First Bank", account_kind: "savings", balance_cents: 10000, available_cents: 10000, currency: "USD", status: "active" }]);
  const amb = await session(rail, twoSavings).start("move $100 from checking to savings");
  assert.equal(amb.outcome, "ask"); assert.match(amb.text, /High Yield Savings, Vacation Savings/);
  const same = await s.start("move $100 from Everyday Checking to Everyday Checking");
  assert.equal(same.outcome, "ask"); assert.match(same.text, /same account/);
  const noAmt = await s.start("move from Everyday Checking to High Yield Savings");
  assert.equal(noAmt.outcome, "ask"); assert.match(noAmt.text, /How much/);
  assert.equal(rail.writes.length, 0);
});

test("yes-after-edit: a corrected amount replaces the card, and only the new card's amount can move", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s = session(rail);
  const first = await s.start(MOVE);
  const fixed = await s.reply("make it $300");
  assert.equal(fixed.corrected, true); assert.equal(fixed.outcome, "confirm");
  assert.match(fixed.text, /Got it\. Move \$300\.00 from Everyday Checking to High Yield Savings\?/);
  assert.notEqual(fixed.confirmation_id, first.confirmation_id);
  const done = await s.reply("yes");
  assert.equal(done.outcome, "confirmed");
  assert.deepEqual(rail.balances, { "chk-1": 470000, "sav-1": 158000 }, "exactly $300.00 moved, never $500.00");
  // A restated move while a card is live corrects it the same way.
  const rail2 = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s2 = session(rail2);
  await s2.start(MOVE);
  const restated = await s2.reply("move $200 from Everyday Checking to High Yield Savings");
  assert.equal(restated.corrected, true); assert.match(restated.text, /Move \$200\.00/);
  const done2 = await s2.reply("yes");
  assert.equal(done2.outcome, "confirmed"); assert.deepEqual(rail2.balances, { "chk-1": 480000, "sav-1": 148000 });
});

test("a stale yes never fires: past the card's life it re-offers a fresh card, and only a fresh yes moves", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s = session(rail, ACCOUNTS(), { confirm_ttl_ms: 60000 });
  const t0 = now;
  await s.start(MOVE);
  now = t0 + 61000;
  const stale = await s.reply("yes");
  assert.equal(stale.expired, true); assert.equal(stale.outcome, "confirm");
  assert.match(stale.text, /That card expired, so nothing was moved\. Here's a fresh one:/);
  assert.equal(rail.writes.length, 0);
  const done = await s.reply("yes");
  assert.equal(done.outcome, "confirmed"); assert.equal(rail.writes.length, 1);
  now = t0;
});

test("stop-on-change: the money left before the yes, so the yes moves nothing and says why", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  let accounts = ACCOUNTS();
  const s = session(rail, () => accounts);
  await s.start(MOVE);
  accounts = ACCOUNTS().map(a => a.account_id === "chk-1" ? Object.assign({}, a, { balance_cents: 20000, available_cents: 20000 }) : a);
  const r = await s.reply("yes");
  assert.equal(r.outcome, "changed");
  assert.match(r.text, /Stopped before moving/); assert.match(r.text, /Nothing was moved/);
  assert.equal(rail.writes.length, 0); assert.deepEqual(rail.balances, { "chk-1": 500000, "sav-1": 128000 });
  assert.equal(s.pending, null);
});

test("a stateless host restores the card from its snapshot and the yes still executes once", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s1 = session(rail);
  await s1.start(MOVE);
  const snap = s1.snapshot();
  const s2 = session(rail, ACCOUNTS(), { state: JSON.parse(JSON.stringify(snap)) });
  assert.ok(s2.pending, "the card survives the restore");
  const done = await s2.reply("yes");
  assert.equal(done.outcome, "confirmed"); assert.equal(rail.writes.length, 1);
  assert.deepEqual(rail.balances, { "chk-1": 450000, "sav-1": 178000 });
});

test("details: the card's full terms, with the balance it leaves, before any yes", async () => {
  const rail = fakeRail({ "chk-1": 500000, "sav-1": 128000 });
  const s = session(rail);
  await s.start(MOVE);
  const d = await s.reply("details");
  assert.equal(d.outcome, "details");
  assert.match(d.text, /fully reversible by moving it back/);
  assert.match(d.text, /has \$5,000\.00 available, so this leaves \$4,500\.00/);
  assert.ok(s.pending, "asking for details keeps the card live");
  const no = await s.reply("no");
  assert.equal(no.outcome, "declined"); assert.equal(rail.writes.length, 0);
});
