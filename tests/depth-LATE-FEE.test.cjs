// Late-fee alert (megadoc D15; docs/depth/LATE-FEE.md). One test per sub-capability, tagged so evals/depth/run.cjs can
// prove its planted defect makes exactly this test fail. Rows MOCK. The hourly side through plan() is
// tests/edge/late-fee.test.ts.
// Check: node --test tests/depth-LATE-FEE.test.cjs && node evals/depth/run.cjs LATE-FEE
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const LF = require(path.join(dir, "112-late-fee-watch.js"));

const NOW = Date.parse("2026-10-12T15:00:00Z"), TZ = "America/New_York";
const W = [{ id: "latefee-20261005", kind: "late_fee", created_on: "2026-10-05", status: "active" }];
let n = 0;
const r = (d, c, m, o) => Object.assign({ id: `mock-${n++}`, posted_on: d, amount_cents: c, merchant_raw: m, is_pending: false }, o || {});

test("[S01] set: restated in exact terms (what, when, from where, that it only tells, how to stop); stored as a watch with today's date", () => {
  const c = LF.command("set a late fee alert for bills", [], NOW, TZ);
  assert.equal(c.reply, "Late-fee alert on, from today (Oct 12). When a charge your bank calls a late fee posts on any linked account, I'll tell you once, with the amount, your bank's words, the account and the date, from your bank rows. I see new charges after you refresh your connected bank. It only tells you: nothing is paid, disputed or asked of the bank. Say \"stop the late fee alert\" to turn it off.");
  assert.equal(c.watches.length, 1); assert.equal(c.watches[0].kind, "late_fee"); assert.equal(c.watches[0].created_on, "2026-10-12");
  for (const t of ["alert me about late fees", "tell me if i get charged a late fee", "let me know if I get a late fee", "turn on a late fee alert"]) assert.ok(LF.command(t, [], NOW, TZ).watches, t);
});

test("[S02] once: a second set changes nothing; stop removes only this alert; show says whether it is on", () => {
  const other = { id: "b", kind: "category_budget" };
  assert.equal(LF.command("set a late fee alert", W, NOW, TZ).reply, "Your late-fee alert is already on, since Oct 5. Nothing changed.");
  assert.equal(LF.command("set a late fee alert", W, NOW, TZ).watches, null);
  const s = LF.command("stop the late fee alert", W.concat([other]), NOW, TZ); assert.equal(JSON.stringify(s.watches), JSON.stringify([other]));
  assert.equal(LF.command("stop the late fee alert", [other], NOW, TZ).reply, "You don't have a late-fee alert on, so nothing changed.");
  assert.match(LF.command("is my late fee alert on", W, NOW, TZ).reply, /^Your late-fee alert is on, since Oct 5\./);
});

test("[S03] a late fee in the bank's own words, to the cent, with the account and date", () => {
  const a = LF.alerts(W, [r("2026-10-09", -3900, "LATE FEE", { account_name: "Everyday Checking" })], NOW);
  assert.equal(a.length, 1);
  assert.equal(a[0].text, "A late fee posted: $39.00, \"LATE FEE\" on Everyday Checking, Oct 9. Your bank or card issuer is who can waive it; Upmore hasn't contacted anyone.");
  for (const words of ["LATE PAYMENT FEE", "Late Charge", "LATE PMT FEE", "CHASE CARD LATE FEE 10/08"]) assert.equal(LF.alerts(W, [r("2026-10-09", -2900, words)], NOW).length, 1, words);
});

test("[S04] never a fee: before the alert was set, pending, a credit or reversal, or 'late' that isn't a fee", () => {
  const rows = [r("2026-10-01", -2900, "LATE FEE"), r("2026-10-09", -500, "LATE FEE", { is_pending: true }), r("2026-10-09", 3900, "LATE FEE"), r("2026-10-09", -3900, "LATE FEE REVERSAL"), r("2026-10-09", -4200, "LATE NIGHT TACOS"), r("2026-10-09", -1800, "LATE SHOW TICKETS")];
  assert.equal(LF.alerts(W, rows, NOW).length, 0);
});

test("[S05] said once: a fee already sent is not said again; two fees are two messages, oldest first", () => {
  const rows = [r("2026-10-10", -3900, "LATE FEE", { id: "f2" }), r("2026-10-08", -2500, "LATE PAYMENT FEE", { id: "f1" })];
  const a = LF.alerts(W, rows, NOW); assert.equal(JSON.stringify(a.map((x) => x.key)), JSON.stringify(["latefee:f1", "latefee:f2"]));
  assert.equal(LF.alerts(W, rows, NOW, { sent: ["latefee:f1"] }).length, 1);
});

test("[S06] no alert, no messages; a stopped alert says nothing", () => {
  const rows = [r("2026-10-09", -3900, "LATE FEE")];
  assert.equal(LF.alerts([], rows, NOW).length, 0);
  assert.equal(LF.alerts([Object.assign({}, W[0], { status: "stopped" })], rows, NOW).length, 0);
  assert.equal(LF.command("how much did i pay in late fees", W, NOW, TZ), null, "a question is not a command");
});

test("[S07] 'from today' is the person's own day: 10 p.m. in New York is still Oct 12 there", () => {
  const c = LF.command("set a late fee alert", [], Date.parse("2026-10-13T02:00:00Z"), TZ);
  assert.equal(c.watches[0].created_on, "2026-10-12"); assert.match(c.reply, /from today \(Oct 12\)/);
});

test("[S08] what is stored never carries a run of 9 digits (the table refuses one)", () => {
  const c = LF.command("set a late fee alert", [], NOW, TZ);
  assert.doesNotMatch(JSON.stringify(c.watches), /\d{9,}/);
});

test("[S09] the ways people stop it", () => {
  for (const t of ["stop the late fee alert", "turn off my late fee alerts", "stop telling me about late fees", "cancel the late-fee alert"]) assert.equal(JSON.stringify(LF.command(t, W, NOW, TZ).watches), "[]", t);
});

test("[S10] asked whether it's on when it's off: says so and how to turn it on", () => {
  assert.equal(LF.command("do i have a late fee alert", [], NOW, TZ).reply, "You don't have a late-fee alert on. Say \"set a late fee alert\" to turn one on.");
});

test("[S11] a row without an account name: no 'on undefined', the rest said", () => {
  assert.equal(LF.alerts(W, [r("2026-10-09", -2999, "LATE FEE")], NOW)[0].text, "A late fee posted: $29.99, \"LATE FEE\", Oct 9. Your bank or card issuer is who can waive it; Upmore hasn't contacted anyone.");
});

test("[S12] the bank's words from the description when there is no merchant field", () => {
  const a = LF.alerts(W, [{ id: "d1", posted_on: "2026-10-09", amount_cents: -2500, description: "LATE PAYMENT FEE", is_pending: false }], NOW);
  assert.equal(a.length, 1); assert.match(a[0].text, /"LATE PAYMENT FEE"/);
});

test("[S13] a row without an id still has one stable key, so it is said once", () => {
  const row = { posted_on: "2026-10-09", amount_cents: -3900, merchant_raw: "LATE FEE", is_pending: false };
  const a = LF.alerts(W, [row], NOW); assert.equal(a[0].key, "latefee:2026-10-09:-3900:LATE FEE");
  assert.equal(LF.alerts(W, [row], NOW, { sent: [a[0].key] }).length, 0);
});

test("[S14] other commands and questions are left alone", () => {
  for (const t of ["set a $400 grocery budget", "stop my grocery budget", "what's a late fee", "did i get a late fee"]) assert.equal(LF.command(t, W, NOW, TZ), null, t);
});

test("[S15] the bank's words are tidied: spaces collapsed, at most 60 characters", () => {
  const a = LF.alerts(W, [r("2026-10-09", -3900, "LATE   FEE   " + "X".repeat(80))], NOW);
  assert.match(a[0].text, /"LATE FEE X{51}"/);
});
