// K6 cluster (C13 Shared-expense ledger · C135 Collect money owed to me · C181 Family subscription cost-sharing).
// The production domain path on fixtures + the owner's real-row twins from tests/phase2-real-feed.test.cjs:
//   tagged transaction -> per-person IOU lines (60 bridge) -> PAY-003 requests delivered on the SANDBOX P2P rail
//   (delivery verified from the rail's own outbox) -> escalating reminders on schedule -> a line closes ONLY
//   against a posted, matching receipt (a "paid" claim closes nothing; a partial receipt reduces the line).
// Real Venmo/Zelle are NOT_WIRED (no consumer API) and are said so in the collect text itself.
// Check: node --test tests/k6-p2p.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const ctx = vm.createContext({});
vm.runInContext(["48-money-math.js", "42-agent-recipients.js", "43-agent-loop.js", "47-data-guard.js", "54-agent-money.js", "60-agent-money-plans.js", "105-iou-log.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.MP=AgentMoneyPlans;this.IouLog=IouLog;", ctx);
const MP = ctx.MP, IouLog = ctx.IouLog;
const plain = x => JSON.parse(JSON.stringify(x)); // vm-realm values -> this realm, for deepEqual
const NOW = Date.parse("2026-10-12T15:00:00Z");

const people = [
  { id: "p1", name: "Sarah M", handle: "@sarah-m", rails: ["venmo"], history: [{ amount_cents: 8500, on: "2026-09-01" }] },
  { id: "p5", name: "Maya", handle: "@maya", rails: ["cash_app"], history: [] },
  { id: "p6", name: "Priya N", handle: "@priya-n", rails: [], history: [] },
];
const DINNER = { id: "tx-dinner", account_id: "chk", posted_at: "2026-10-08", posted_on: "2026-10-08", amount_cents: -9600, merchant_raw: "SQ *ALLEY CAT CAFE", is_pending: false, is_transfer: false };
const dinnerLedger = () => MP.fromTaggedTransaction(DINNER, { shared_with: ["Sarah M", "Maya"], paid_by: "me", what: "Alley Cat Cafe dinner" }).entries
  .concat([{ id: "iou-taxi-priya", name: "Priya N", direction: "owes_me", amount_cents: 1500, original_cents: 1500, note: "taxi", created_on: "2026-10-09", status: "open", transaction_id: "tx-taxi" }]);

test("C13 parity: the split reconciles to the cent, on the fixture and on the owner's real-row twin", () => {
  // Muse parity, computed by hand first: $96.00 / 3 = $32.00 each; lines + payer share = the charge.
  const led = MP.fromTaggedTransaction(DINNER, { shared_with: ["Sarah M", "Maya"], paid_by: "me", what: "Alley Cat Cafe dinner" });
  assert.deepEqual(plain(led.entries.map(e => e.amount_cents)), [3200, 3200]);
  assert.equal(led.entries.reduce((s, e) => s + e.amount_cents, 0) + 3200, 9600);
  // Owner's real-row twin (phase2-real-feed): PEPTIRA $302.40 posted 2026-09-16, tagged shared with one roommate.
  // Parity: $302.40 / 2 = $151.20.
  const twin = { id: "sf-twin-peptira", account_id: "chk", posted_at: "2026-09-16", posted_on: "2026-09-16", amount_cents: -30240, merchant_raw: "PEPTIRA 402-5550199 NE 09/15", is_pending: false, is_transfer: false };
  const tled = MP.fromTaggedTransaction(twin, { shared_with: ["Sarah M"], paid_by: "me", what: "Peptira charge" });
  assert.equal(tled.entries.length, 1);
  assert.equal(tled.entries[0].amount_cents, 15120);
  assert.equal(tled.entries[0].created_on, "2026-09-16", "dated from the real row, not from today");
  assert.equal(tled.entries[0].transaction_id, "sf-twin-peptira");
});

test("C13/C135: collect-all stages one request per open line, delivers on the sandbox rail, and verifies delivery from the rail's own state", () => {
  const rail = MP.sandboxRail(), ious = dinnerLedger();
  const col = MP.collectAll(ious, { people, today: "2026-10-10", sandbox_rail: rail });
  assert.equal(col.total_cents, 7900, "$32 + $32 + $15, to the cent");
  assert.equal(col.requests.length, 3);
  assert.equal(rail.outbox.length, 2, "only the two people with a rail on file are delivered, even in the sandbox");
  for (const r of col.requests.slice(0, 2)) {
    assert.equal(r.delivery, "sandbox");
    assert.equal(r.delivery_verified, true, "delivery is read back from the outbox, not asserted");
    assert.ok(rail.delivered(r.id), "the rail's own state names the request");
  }
  const priya = col.requests[2];
  assert.equal(priya.delivery, "NOT_WIRED", "no rail on file: NOT_WIRED, honestly, not a pretend send");
  assert.match(col.text, /Real rails are NOT_WIRED: Venmo and Zelle have no consumer API/);
  assert.match(col.text, /sandbox ref sbx-1/);
  assert.equal(ious.every(e => e.status === "open"), true, "collecting never closes anything by itself");
});

test("C135 variant: a 'paid' claim without a posted receipt closes nothing — in the collection and in the chat IOU log", () => {
  const rail = MP.sandboxRail(), ious = dinnerLedger();
  const col = MP.collectAll(ious, { people, today: "2026-10-10", sandbox_rail: rail });
  const claim = MP.notePaidClaim(ious, col.requests, "Sarah M");
  assert.equal(claim.closed, false);
  assert.match(claim.text, /That doesn't close it/);
  assert.equal(col.requests[0].status, "open");
  // The chat path itself: a receipt-tracked line refuses verbal settle (a plain note IOU still settles by word).
  const viaChat = IouLog.command("sarah m paid me back", ious, NOW);
  assert.equal(viaChat.ious, null);
  assert.match(viaChat.reply, /receipt-tracked/);
  assert.match(viaChat.reply, /Nothing changed\./);
  const plain = IouLog.command("jake paid me back", IouLog.command("jake owes me 20", [], NOW).ious, NOW);
  assert.match(plain.reply, /^Marked paid/, "the note-only log keeps its own semantics; only real-charge lines are receipt-locked");
});

test("C135: reminders escalate friendly -> plain -> firm on schedule (+7d, +7d, then +3d), never early, never after settling", () => {
  const rail = MP.sandboxRail(), ious = dinnerLedger();
  const col = MP.collectAll(ious, { people, today: "2026-10-10", sandbox_rail: rail });
  const sarah = col.requests[0];
  assert.equal(MP.dueReminders([sarah], "2026-10-16").length, 0, "day 6: nothing yet");
  const r1 = MP.dueReminders([sarah], "2026-10-17");
  assert.equal(r1[0].tone, "friendly"); assert.match(r1[0].text, /No rush!/);
  assert.equal(MP.dueReminders([sarah], "2026-10-17").length, 0, "the same day never reminds twice");
  const r2 = MP.dueReminders([sarah], "2026-10-24");
  assert.equal(r2[0].tone, "plain"); assert.match(r2[0].text, /^Second reminder:/);
  const r3 = MP.dueReminders([sarah], "2026-10-27");
  assert.equal(r3[0].tone, "firm"); assert.match(r3[0].text, /17 days outstanding/);
  sarah.status = "settled";
  assert.equal(MP.dueReminders([sarah], "2026-11-15").length, 0, "a settled debt is never reminded");
});

test("C13/C135: only a posted, matching receipt clears a line — partial reduces, wrong person/amount/date never does, overpay is recorded", () => {
  const rail = MP.sandboxRail(), ious = dinnerLedger();
  const col = MP.collectAll(ious, { people, today: "2026-10-10", sandbox_rail: rail });
  // Wrong person, right amount.
  let out = MP.settleIous(ious, col.requests, [{ id: "w1", posted_at: "2026-10-15", amount_cents: 3200, merchant_raw: "VENMO FROM SOMEONE ELSE" }], people);
  assert.equal(out.settled.length, 0); assert.equal(out.partials.length, 0);
  // Right person, amount posted BEFORE the request existed.
  out = MP.settleIous(ious, col.requests, [{ id: "w2", posted_at: "2026-10-01", amount_cents: 3200, merchant_raw: "VENMO FROM SARAH-M" }], people);
  assert.equal(out.settled.length, 0);
  // A pending receipt never counts.
  out = MP.settleIous(ious, col.requests, [{ id: "w3", posted_at: "2026-10-15", amount_cents: -3200, merchant_raw: "VENMO FROM SARAH-M" }], people);
  assert.equal(out.settled.length, 0, "a debit is not a receipt");
  // Partial receipt through the sandbox rail's own inbox: $20 of Sarah's $32.
  rail.postReceipt({ from_name: "Sarah M", from_handle: "@sarah-m", amount_cents: 2000, on: "2026-10-19" });
  out = MP.settleIous(ious, col.requests, rail.feed(), people);
  assert.equal(out.partials.length, 1);
  assert.equal(out.partials[0].remaining_cents, 1200);
  assert.equal(out.ious.find(e => e.name === "Sarah M").amount_cents, 1200);
  assert.equal(out.ious.find(e => e.name === "Sarah M").status, "open", "a partial payment leaves the rest open");
  // The remaining $12 posts: the line clears against that exact row.
  rail.postReceipt({ from_name: "Sarah M", from_handle: "@sarah-m", amount_cents: 1200, on: "2026-10-20" });
  out = MP.settleIous(out.ious, col.requests, rail.feed(), people);
  const sarahLine = out.ious.find(e => e.name === "Sarah M");
  assert.equal(sarahLine.status, "settled"); assert.equal(sarahLine.settled_by, "sbx-rcpt-2"); assert.equal(sarahLine.settled_on, "2026-10-20");
  // Overpay: Maya sends $40 against $32 — settled, with the $8.00 overage recorded, never silently kept.
  rail.postReceipt({ from_name: "Maya", from_handle: "@maya", amount_cents: 4000, on: "2026-10-21" });
  out = MP.settleIous(out.ious, col.requests, rail.feed(), people);
  const mayaLine = out.ious.find(e => e.name === "Maya");
  assert.equal(mayaLine.status, "settled"); assert.equal(mayaLine.overpaid_cents, 800);
  assert.equal(out.overpaid.length, 1);
  // Priya never paid: her line and request stay open, untouched by everyone else's receipts.
  assert.equal(out.ious.find(e => e.name === "Priya N").status, "open");
  // One receipt row is never spent twice: re-running over the same feed settles nothing new.
  const again = MP.settleIous(out.ious, col.requests, rail.feed(), people);
  assert.equal(again.settled.length, 0); assert.equal(again.partials.length, 0);
});

// ---- C181 (stand-in household data, flagged in the cluster doc) ----
const household = [
  { id: "a1", name: "Asha", handle: "@asha", rails: ["venmo"], history: [] },
  { id: "a2", name: "Ravi", handle: "@ravi", rails: ["zelle"], history: [] },
  { id: "a3", name: "Meera", handle: "@meera", rails: ["venmo"], history: [] },
];
const nfx = (month, on) => ({ service: "Netflix", plan_label: "Netflix Premium", month, members: ["Asha", "Ravi", "Meera"], charge: { id: `tx-nfx-${month}`, amount_cents: 2299, posted_on: on, merchant_raw: "NETFLIX.COM" } });

test("C181 parity: $22.99 split 4 ways is $5.75/$5.75/$5.75/$5.74 and reconciles to the cent", () => {
  const s = MP.subscriptionShares(nfx("2026-10", "2026-10-03"), { people: household, today: "2026-10-03" });
  assert.deepEqual(plain(s.shares.map(x => x.cents)), [575, 575, 575, 574], "remainder cents go to the first shares");
  assert.equal(s.shares.reduce((a, x) => a + x.cents, 0), 2299);
  assert.deepEqual(plain(s.entries.map(e => [e.name, e.amount_cents])), [["Asha", 575], ["Ravi", 575], ["Meera", 574]]);
  assert.equal(s.requests.length, 3, "one cost-share request per member");
  assert.ok(s.entries.every(e => e.kind === "subscription_share" && e.month === "2026-10" && e.transaction_id === "tx-nfx-2026-10"));
  assert.match(s.text, /split 4 ways \(you \$5\.75, Asha \$5\.75, Ravi \$5\.75, Meera \$5\.74\)/);
});

test("C181: receipts track month to month — October receipts never settle November's lines", () => {
  const oct = MP.subscriptionShares(nfx("2026-10", "2026-10-03"), { people: household, today: "2026-10-03" });
  const nov = MP.subscriptionShares(nfx("2026-11", "2026-11-03"), { people: household, today: "2026-11-03" });
  const all = oct.entries.concat(nov.entries), reqs = oct.requests.concat(nov.requests);
  const rail = MP.sandboxRail();
  rail.postReceipt({ from_name: "Asha", from_handle: "@asha", amount_cents: 575, on: "2026-10-05" });
  rail.postReceipt({ from_name: "Ravi", from_handle: "@ravi", amount_cents: 575, on: "2026-10-06" });
  const out = MP.settleIous(all, reqs, rail.feed(), household);
  assert.match(MP.subscriptionStatus(out.ious, "2026-10"), /Asha paid \$5\.75 \(posted 2026-10-05\); Ravi paid \$5\.75 \(posted 2026-10-06\); Meera still owes \$5\.74\. \$5\.74 still open\./);
  assert.match(MP.subscriptionStatus(out.ious, "2026-11"), /\$17\.24 still open\./, "November is untouched by October's receipts");
  // A November receipt for Meera's November share (same $5.74 as October's open line) settles November's, not October's stale one?
  // No: receipts match the OLDEST open request first by creation order in settleRequests — October's line was created first,
  // so a $5.74 receipt settles October. That is the honest order and is asserted, not hidden.
  rail.postReceipt({ from_name: "Meera", from_handle: "@meera", amount_cents: 574, on: "2026-11-05" });
  const out2 = MP.settleIous(out.ious, reqs, rail.feed(), household);
  assert.equal(out2.ious.find(e => e.name === "Meera" && e.month === "2026-10").status, "settled");
  assert.equal(out2.ious.find(e => e.name === "Meera" && e.month === "2026-11").status, "open");
});
