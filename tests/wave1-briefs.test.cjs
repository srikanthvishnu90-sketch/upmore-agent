// Wave 1 PROACTIVE COMPOSITION at module level: C24 actions/dismissal/survival in packages/domain/103-reminders.js
// and the C28 consequence table in packages/domain/56-agent-proactive.js (the plan()-level delivery of both is
// proven in tests/edge/wave1-briefs.test.ts and tests/edge/wave1-reminders-action.test.ts). MOCK rows only.
// Check: node --test tests/wave1-briefs.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const R = require(path.join(root, "packages/domain/103-reminders.js"));
const ctx = vm.createContext({});
vm.runInContext(["32-merchant-label.js", "57-agent-ledger.js", "56-agent-proactive.js"].map(f => fs.readFileSync(path.join(root, "packages/domain", f), "utf8")).join("\n") + "\nthis.P = AgentProactive;", ctx);
const P = ctx.P;

const TZ = "America/New_York";
const SET_AT = Date.parse("2026-10-12T15:00:00Z");
const DAY1 = Date.parse("2026-10-28T13:30:00Z"), DAY = 86400000;
const set = (words) => R.parse(words, SET_AT, TZ).reminder;

test("C24 module: action() names exactly the action in the reminder's words, with its capability, and invents none", () => {
  assert.deepEqual(R.action(set("remind me the amex annual fee hits on oct 28")), { text: "Want me to get a retention offer first?", capability_id: "CARD-008" });
  assert.deepEqual(R.action(set("remind me to cancel netflix on oct 28")), { text: "Want me to set up the cancellation for Netflix? You approve it before anything happens.", capability_id: "subscriptions.cancel" });
  assert.equal(R.action(set("remind me to pay rent on the 28th")), null, "paying rent is not an action a reminder can route to");
  assert.equal(R.action(set("remind me about the dentist on friday")), null);
});

test("C24 module: a fired one-off reminder re-surfaces once a day until dismissed; an unfired one never does", () => {
  const r = set("remind me to check the amex annual fee on oct 28");
  const first = R.due([r], DAY1, TZ, []);
  assert.equal(first.length, 1);
  assert.match(first[0].text, /Want me to get a retention offer first\?/);
  assert.equal(first[0].capability_id, "CARD-008");
  const sent = first.map(x => x.key);
  const again = R.due([r], DAY1 + DAY, TZ, sent);
  assert.deepEqual(again.map(x => x.key), [`reminder:${r.id}:2026-10-28:again:2026-10-29`]);
  assert.deepEqual(R.due([r], DAY1 + DAY, TZ, sent.concat(again.map(x => x.key))), [], "at most once a day");
  assert.deepEqual(R.due([r], DAY1 + 2 * DAY, TZ, []), [], "never fired (no key in the log) means never re-surfaced");
  const monthly = set("remind me to pay rent on the 28th every month");
  const mFirst = R.due([monthly], DAY1, TZ, []);
  assert.deepEqual(R.due([monthly], DAY1 + DAY, TZ, mFirst.map(x => x.key)), [], "a monthly reminder comes back on its day, not daily");
});

test("C24 module: dismiss marks the stored watch dismissed (not deleted) and due() never says it again", () => {
  const r = set("remind me to check the amex annual fee on oct 28");
  const d = R.command("dismiss the amex annual fee reminder", [r], SET_AT, TZ);
  assert.match(d.reply, /^Dismissed the reminder: check the amex annual fee\. It won't come back\./);
  assert.equal(d.watches.length, 1);
  assert.equal(d.watches[0].status, "dismissed");
  assert.equal(d.watches[0].dismissed_on, "2026-10-12");
  const first = R.due([r], DAY1, TZ, []);
  assert.deepEqual(R.due(d.watches, DAY1 + DAY, TZ, first.map(x => x.key)), []);
  assert.equal(R.describe(d.watches, SET_AT, TZ), "", "a dismissed reminder is not listed as live");
  const none = R.command("dismiss the gym reminder", [r], SET_AT, TZ);
  assert.equal(none.watches, null);
  assert.match(none.reply, /don't have a reminder about "gym"/);
});

test("C28 module: the consequence table by bill kind — credit card, utility, subscription, generic — exact words", () => {
  assert.equal(P.billKind("Chase Card Payment", "debt_payment"), "credit_card");
  assert.equal(P.billConsequence("credit_card", "Chase Card Payment"), "a late fee and a penalty APR apply");
  assert.equal(P.billKind("Comcast Xfinity", "utilities"), "utility");
  assert.equal(P.billConsequence("utility", "Comcast Xfinity"), "a late fee applies, and your service could be cut off");
  assert.equal(P.billKind("Netflix", "subscriptions"), "subscription");
  assert.equal(P.billConsequence("subscription", "Netflix"), "Netflix stops until you pay");
  assert.equal(P.billKind("Springfield Tuition", "other"), "generic");
  assert.equal(P.billConsequence("generic", "Springfield Tuition"), "a late fee applies");
  assert.equal(P.BILL_CONSEQUENCES.credit_card, "a late fee and a penalty APR apply", "the words live in the table, not per message");
});
