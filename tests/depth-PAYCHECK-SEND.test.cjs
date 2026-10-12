// A send that waits for the paycheck (megadoc A15; docs/depth/PAYCHECK-SEND.md). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail. Rows MOCK. The chat and hourly sides are
// tests/edge/paycheck-send.test.ts.
// Check: node --test tests/depth-PAYCHECK-SEND.test.cjs && node evals/depth/run.cjs PAYCHECK-SEND
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const P = require(path.join(dir, "115-paycheck-send.js"));

const TZ = "America/New_York", NOW = Date.parse("2026-10-12T15:00:00Z"); // Mon Oct 12, 11 a.m. New York
const row = (on, c, m, o) => Object.assign({ posted_on: on, amount_cents: c, merchant_raw: m, is_pending: false }, o || {});
const PAY = (on) => row(on, 180000, "ACME CORP PAYROLL DIR DEP");
const W = [P.watch(P.parse("pay maya 40 but only if my paycheck landed"), NOW, TZ)];

test("[S01] the megadoc's words: the send and the condition read apart", () => {
  assert.equal(JSON.stringify(P.parse("pay maya 40 but only if my paycheck landed")), JSON.stringify({ command: "pay maya 40", name: "maya", amount_cents: 4000 }));
});
test("[S02] the ways people say the condition", () => {
  for (const t of ["send jake 25 when my paycheck hits", "venmo dana 15 after payday", "pay maya 40 once i get paid", "send maya 40 when my direct deposit posts", "pay maya 40 if my salary came in", "pay maya 40, but only after i get paid"]) assert.ok(P.parse(t), t);
});
test("[S03] not this: another condition, a time, rent or a bill, no number", () => {
  for (const t of ["send maya 40 if it rains", "pay maya 40 tomorrow at 9", "pay rent when my paycheck lands", "pay rent 1500 when my paycheck lands", "pay my card 200 after payday", "pay maya forty when my paycheck lands", "pay maya 40", "what if my paycheck is late"]) assert.equal(P.parse(t), null, t);
});
test("[S04] landed: a payroll deposit posted today or yesterday in the person's day", () => {
  assert.equal(P.landed([PAY("2026-10-12")], NOW, TZ).landed, true);
  assert.equal(P.landed([PAY("2026-10-11")], NOW, TZ).landed, true);
  assert.equal(P.landed([PAY("2026-10-10")], NOW, TZ).landed, false);
});
test("[S05] the latest payroll deposit is the one said", () => {
  assert.equal(P.landed([PAY("2026-09-25"), PAY("2026-10-09"), PAY("2026-09-11")], NOW, TZ).last.posted_on, "2026-10-09");
});
test("[S06] only a payroll deposit counts: not a refund, a transfer, a pending row, a charge", () => {
  const rows = [row("2026-10-12", 4000, "AMAZON REFUND"), row("2026-10-12", 50000, "TRANSFER FROM SAVINGS", { is_transfer: true }), row("2026-10-12", 180000, "ACME PAYROLL", { is_pending: true }), row("2026-10-12", -1800, "PAYROLL SERVICE FEE")];
  assert.equal(P.landed(rows, NOW, TZ).landed, false);
});
test("[S07] the bank's payroll words: payroll, direct deposit, salary, paycheck", () => {
  for (const m of ["ACME PAYROLL", "DIR DEP ACME", "DIRECT DEPOSIT GUSTO", "SALARY OCT", "PAYCHECK"]) assert.equal(P.landed([row("2026-10-12", 1000, m)], NOW, TZ).landed, true, m);
});
test("[S08] the watch saved: the command, name, amount, the person's day; no run of 9 digits", () => {
  const w = W[0];
  assert.equal(JSON.stringify([w.kind, w.command, w.name, w.amount_cents, w.created_on]), JSON.stringify(["paycheck_send", "pay maya 40", "maya", 4000, "2026-10-12"]));
  assert.doesNotMatch(JSON.stringify(w), /\d{9,}/);
  assert.equal(P.watch(P.parse("pay maya 40 when my paycheck lands"), Date.parse("2026-10-13T02:00:00Z"), TZ).created_on, "2026-10-12");
});
test("[S09] due when a paycheck posts on or after the day it was set up; never on an older one", () => {
  assert.equal(P.due(W, [PAY("2026-10-09")], NOW, TZ, []).length, 0);
  assert.equal(P.due(W, [PAY("2026-10-16")], NOW + 4 * 86400000, TZ, []).length, 1);
});
test("[S10] the question says the deposit and the send, and carries the person's words as the offer", () => {
  const d = P.due(W, [PAY("2026-10-16")], NOW + 4 * 86400000, TZ, [])[0];
  assert.equal(d.text, "Your paycheck posted: $1,800.00, \"ACME CORP PAYROLL DIR DEP\", on Oct 16. You asked me to send Maya $40.00 after it lands. Want the card? Reply yes and I'll put it up (it needs its own yes), or no to skip it.");
  assert.equal(d.offer.command, "pay maya 40"); assert.equal(d.offer.kind, "scheduled_send");
});
test("[S11] asked once", () => {
  const d = P.due(W, [PAY("2026-10-16")], NOW + 4 * 86400000, TZ, []);
  assert.equal(P.due(W, [PAY("2026-10-16")], NOW + 4 * 86400000, TZ, [d[0].key]).length, 0);
});
test("[S12] a send waiting more than 35 days lapses and says nothing", () => {
  assert.equal(P.due(W, [PAY("2026-11-20")], Date.parse("2026-11-20T15:00:00Z"), TZ, []).length, 0);
});
test("[S13] cancel by name or all; show what's waiting", () => {
  const two = W.concat([P.watch(P.parse("send jake 25 when my paycheck hits"), NOW + 1000, TZ)]);
  assert.equal(P.command("cancel the paycheck send to maya", two).watches.length, 1);
  assert.equal(P.command("cancel my paycheck payments", two).watches.length, 0);
  assert.match(P.command("show my paycheck sends", two).reply, /^Waiting on your paycheck: send Maya \$40\.00; send Jake \$25\.00\./);
  assert.equal(P.command("cancel the paycheck send to sam", two).reply, "You don't have a send to Sam waiting on your paycheck, so nothing changed.");
});
test("[S14] amounts from $0.01 to $10,000.00", () => {
  assert.equal(P.parse("send maya 20000 when my paycheck lands"), null);
  assert.equal(P.parse("send maya 9999.99 when my paycheck lands").amount_cents, 999999);
});
test("[S15] a row dated tomorrow (UTC) is tonight's deposit and counts as landed", () => {
  assert.equal(P.landed([PAY("2026-10-13")], Date.parse("2026-10-13T02:00:00Z"), TZ).landed, true);
});
