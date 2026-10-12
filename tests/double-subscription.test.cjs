// Duplicate and overlapping charges (real-world C7): the monitors' double-subscription detector
// (33-agent-monitors.js) reports the same service paid for twice — two iCloud plans, and Spotify billed
// direct and through the App Store — with the exact transactions; the same-day double charge and the
// three-way overlap ride the existing monitors. The kill chain runs as one flow: the person picks the
// direct Spotify duplicate, the real cancel flow (68-agent-cancel.js) cancels it against a fake merchant
// record, the feed's own verdict confirms it dead from the statement, and the detector — handed the
// cancellation claim — stops reporting the pair. A charge after the claim is a zombie, never a kill.
// Check: node --test tests/double-subscription.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
vm.runInContext(["32-merchant-label.js", "33-agent-monitors.js", "35-agent-intents.js", "36-agent-workflows.js", "41-agent-recovery.js", "42-agent-recipients.js", "43-agent-loop.js", "45-advice-guard.js", "46-voice.js", "47-data-guard.js", "48-money-math.js", "49-agent-save.js", "50-agent-invest.js", "53-compliance.js", "54-agent-money.js", "57-agent-ledger.js", "59-agent-alerts.js", "60-agent-money-plans.js", "67-agent-cards.js", "68-agent-cancel.js", "79-dispute.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.M=AgentMonitors;this.X=AgentCancel;this.D=AgentDispute;", ctx);
const M = ctx.M, X = ctx.X;
const D = require(path.join(root, "packages/domain/79-dispute.js"));
const same = (a, b, msg) => assert.equal(JSON.stringify(a), JSON.stringify(b), msg);
const Registry = require(path.join(root, "packages/capabilities/registry.js"));
const registry = Registry.load(JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8")), rel => fs.existsSync(path.join(root, rel)));
const TODAY = "2026-10-20";
const rows = [];
const add = (id, d, a, m, acct) => rows.push({ id, account_id: acct || "visa", posted_at: d, amount: -a, merchant_raw: m, is_pending: false, is_transfer: false });
// Spotify twice: direct, and through the App Store (the store descriptor names no service).
["2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"].forEach((d, i) => add("sd" + (i + 1), d, 11.99, "SPOTIFY"));
["2026-07-07", "2026-08-07", "2026-09-07", "2026-10-07"].forEach((d, i) => add("sa" + (i + 1), d, 11.99, "APL*ITUNES"));
// iCloud twice: two plans, two amounts, the same account.
["2026-07-15", "2026-08-15", "2026-09-15", "2026-10-15"].forEach((d, i) => add("ic" + (i + 1), d, 0.99, "ICLOUD", "chk"));
["2026-07-18", "2026-08-18", "2026-09-18", "2026-10-18"].forEach((d, i) => add("is" + (i + 1), d, 2.99, "ICLOUD STORAGE", "chk"));
// Three video services (the overlap), one music service that is NOT doubled, and a dormant Spotify stream.
["2026-07-03", "2026-08-03", "2026-09-03", "2026-10-03"].forEach((d, i) => add("nf" + (i + 1), d, 17.99, "NETFLIX.COM"));
["2026-07-09", "2026-08-09", "2026-09-09", "2026-10-09"].forEach((d, i) => add("hu" + (i + 1), d, 7.99, "HULU"));
["2026-07-11", "2026-08-11", "2026-09-11", "2026-10-11"].forEach((d, i) => add("di" + (i + 1), d, 13.99, "DISNEY PLUS"));
["2026-07-06", "2026-08-06", "2026-09-06", "2026-10-06"].forEach((d, i) => add("am" + (i + 1), d, 10.99, "APPLE MUSIC"));
["2026-01-05", "2026-02-05", "2026-03-05", "2026-04-05"].forEach((d, i) => add("sx" + (i + 1), d, 11.99, "SPOTIFY", "amex"));
// The same-day double charge (two identical Shell charges on one day).
add("sh1", "2026-10-19", 40.00, "SHELL OIL"); add("sh2", "2026-10-19", 40.00, "SHELL OIL");
const accounts = [{ id: "visa", nickname: "Visa" }, { id: "chk", nickname: "checking" }, { id: "amex", nickname: "Amex" }];
const input = (extra) => Object.assign({ today: TODAY, transactions: rows, isLive: true, accounts }, extra || {});
const doubles = (inp) => M.runAll(inp || input()).findings.filter(f => f.kind === "double_subscription");

test("detection: Spotify direct + App Store and two iCloud plans are each reported with the exact transactions", () => {
  const found = doubles();
  assert.equal(found.length, 2, JSON.stringify(found.map(f => f.key)));
  const sp = found.find(f => f.evidence.computed.service === "spotify");
  assert.ok(sp); assert.equal(sp.capabilityId, "subscriptions.cancel");
  const streams = sp.evidence.computed.streams;
  assert.equal(streams.length, 2, "the dormant Amex stream from January-April is not a third");
  const direct = streams.find(s => s.channel === "direct"), store = streams.find(s => s.channel === "app_store");
  assert.ok(direct && store);
  assert.equal(direct.amount, 11.99); assert.equal(direct.last_date, "2026-10-05"); assert.equal(direct.occurrences, 4);
  assert.equal(store.amount, 11.99); assert.equal(store.last_date, "2026-10-07"); assert.equal(store.correlated, true, "the store stream names no service: paired by amount and cadence, and the finding says so");
  assert.equal(sp.evidence.computed.monthly_total, 23.98); assert.equal(sp.evidence.computed.yearly_total, 287.76);
  const ids = sp.evidence.rows.map(r => r.id);
  for (const id of ["sd1", "sd4", "sa1", "sa4"]) assert.ok(ids.includes(id), "exact transactions: " + id);
  assert.match(sp.detail, /\$11\.99 monthly billed direct, last charged 2026-10-05/);
  assert.match(sp.detail, /\$11\.99 monthly billed through the App Store \(matched by amount and cadence\), last charged 2026-10-07/);
  assert.match(sp.detail, /One of them can go/);
  const ic = found.find(f => f.evidence.computed.service === "icloud");
  assert.ok(ic);
  same(ic.evidence.computed.streams.map(s => s.amount).sort(), [0.99, 2.99], "two plans of the one service");
  assert.ok(ic.evidence.computed.streams.every(s => s.account_id === "chk"));
  assert.match(ic.detail, /\$0\.99 monthly billed direct/); assert.match(ic.detail, /\$2\.99 monthly billed direct/);
  assert.equal(ic.evidence.computed.monthly_total, 3.98);
});

test("detection: a single subscription, a different service, and a dormant stream fire nothing", () => {
  const found = doubles();
  assert.ok(!found.some(f => /netflix|apple music|hulu|disney/.test(f.evidence.computed.service)), "no service with one live stream is reported doubled");
  const only = M.doubleSubscriptions({ today: TODAY, transactions: rows.filter(r => r.id.startsWith("nf")), isLive: true, accounts });
  assert.equal(only.length, 0);
});

test("the other two C7 shapes ride the same run: the same-day double charge and the overlap, with their rows", () => {
  const all = M.runAll(input()).findings;
  const dup = all.find(f => f.kind === "duplicate_charge");
  assert.ok(dup, "two identical Shell charges on 2026-10-19");
  same(dup.evidence.rows.map(r => r.id).sort(), ["sh1", "sh2"]);
  assert.equal(dup.capabilityId, "recovery.duplicate_charge_dispute");
  const ov = all.find(f => f.kind === "overlap");
  assert.ok(ov, "Netflix + Hulu + Disney are three video services at once");
  same(ov.evidence.computed.services, ["DISNEY PLUS", "HULU", "NETFLIX.COM"]);
});

test("the dispute leg: the duplicate is picked from the finding's own charges, then gets its pre-filled dispute draft", () => {
  const dRows = rows.map(r => ({ account_id: r.account_id, provider_transaction_id: r.id, amount_cents: Math.round(r.amount * 100), posted_on: r.posted_at, merchant_raw: r.merchant_raw, is_pending: false }));
  const opts = { today: TODAY, source: "From your linked accounts, as of 2026-10-19." };
  // Two identical charges are genuinely ambiguous: the flow lists both exact charges and asks, it never guesses.
  const pick = D.answer("dispute the $40.00 Shell charge from Oct 19", dRows, opts);
  assert.equal(pick.kind, "pick");
  assert.equal(pick.candidates.length, 2);
  same(pick.candidates.map(c => c.provider_transaction_id).sort(), ["sh1", "sh2"]);
  const r = D.answer("dispute the last one", dRows, opts);
  assert.equal(r.kind, "draft");
  assert.match(r.text, /dispute for the Shell Oil charge, pre-filled for you to send yourself\. Nothing has been sent\./);
  assert.match(r.text, /Shell Oil, \$40\.00, posted Oct 19, 2026/);
});

// ---- The kill chain, as one flow. ----
function spotifyWorld() {
  const w = { now: Date.UTC(2026, 9, 20, 14, 0, 0), writes: [], record: { state: "active", next_charge_on: "2026-11-05" } };
  const connectors = {
    read: async (kind) => {
      if (kind === "subscription_terms") return { value: { plan: "Premium", access_until: "2026-11-05", refund_policy: "no refunds", next_charge_on: "2026-11-05", fee_cents: 0, remaining_contract_cents: 0 }, source: "Spotify account page", as_of: w.now };
      if (kind === "merchant_record") return { value: { ...w.record }, source: "Spotify", as_of: w.now };
      return { value: 1, source: "x", as_of: w.now };
    },
    write: async (id, p, key) => { w.writes.push({ id, key }); if (id === "BILL-003") { w.record = { state: "cancelled", next_charge_on: null }; return { ok: true, reference: "cx-1", confirmation_text: "Your subscription is cancelled." }; } return { reference: "ref-1" }; },
    verify: async () => ({ confirmed: true, source: "Spotify" }),
  };
  return { w, connectors };
}

test("kill chain: pick the direct duplicate -> cancel card -> yes -> merchant record cancelled -> statement verdict -> the detector stops reporting the pair", async () => {
  const { w, connectors } = spotifyWorld();
  const s = X.create({ registry, connectors, clock: () => w.now, transactions: rows, directory: { spotify: { kind: "portal", url: "spotify.com/account", display_name: "Spotify" } } });
  const card = await s.start("cancel spotify");
  assert.equal(card.outcome, "confirm"); assert.match(card.text, /Cancel Spotify \(Premium, \$11\.99\/mo\)/);
  assert.equal(w.writes.length, 0, "nothing is cancelled before the yes");
  const done = await s.reply("yes");
  assert.equal(done.outcome, "cancelled"); assert.match(done.text, /confirmation cx-1/);
  assert.equal(w.record.state, "cancelled", "the merchant's own record says cancelled");
  const kase = s.cases.find(c => c.claim);
  assert.ok(kase); assert.equal(kase.claim.amount_cents, 1199); assert.equal(kase.claim.expected_billing_date, "2026-11-05");
  // The verdict: past the expected billing date plus grace, with no new direct charge, the statement confirms it.
  w.now = Date.UTC(2026, 10, 8, 14, 0, 0);
  const verdict = s.check(rows, "2026-11-08", "2026-11-08");
  assert.equal(verdict.length, 1); assert.equal(verdict[0].status, "verified");
  assert.match(s.status().text, /confirmed cancelled, no charge through 2026-11-08/);
  // The detector, handed the claim and the post-cancel rows (the App Store stream bills on; the direct one does not):
  const after = rows.concat([Object.assign({}, rows.find(r => r.id === "sa4"), { id: "sa5", posted_at: "2026-11-07" })]);
  const claim = { merchant: "SPOTIFY", amount_cents: 1199, created_at: "2026-10-20" };
  const found = doubles(input({ transactions: after, cancelClaims: [claim], today: "2026-11-08" }));
  assert.ok(!found.some(f => f.evidence.computed.service === "spotify"), "one live stream left: no longer doubled");
  assert.ok(found.some(f => f.evidence.computed.service === "icloud"), "the untouched double is still reported");
});

test("verification is a real check: a charge after the claim keeps the stream live and fires charged-after-cancel", async () => {
  const zombie = rows.concat([Object.assign({}, rows.find(r => r.id === "sd4"), { id: "sd5", posted_at: "2026-11-05" }), Object.assign({}, rows.find(r => r.id === "sa4"), { id: "sa5", posted_at: "2026-11-07" })]);
  const claim = { merchant: "SPOTIFY", amount_cents: 1199, created_at: "2026-10-20" };
  const all = M.runAll(input({ transactions: zombie, cancelClaims: [claim], today: "2026-11-08" })).findings;
  assert.ok(all.some(f => f.kind === "double_subscription" && f.evidence.computed.service === "spotify"), "it charged after the cancel: still doubled, not dead");
  assert.ok(all.some(f => f.kind === "charged_after_cancel"), "and the zombie charge is reported on its own");
  // A claim for a different amount kills nothing.
  const wrong = doubles(input({ cancelClaims: [{ merchant: "SPOTIFY", amount_cents: 999, created_at: "2026-10-20" }] }));
  assert.ok(wrong.some(f => f.evidence.computed.service === "spotify"));
});
