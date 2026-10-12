// IOU log in chat (megadoc C05, D08, D09, D10; docs/depth/IOU.md). One test per sub-capability, tagged so
// evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Check: node --test tests/depth-IOU.test.cjs && node evals/depth/run.cjs IOU
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const I = require(path.join(dir, "105-iou-log.js"));

const NOW = Date.parse("2026-10-12T15:00:00Z");
const NOTE = "It's a note only: nothing was paid, requested or sent.";
// Runs the person's messages in order over one log; returns the replies and the log.
function run(msgs, start = []) {
  let log = start; const replies = [];
  for (const m of msgs) { const c = I.command(m, log, NOW); replies.push(c && c.reply); if (c && c.ious) log = c.ious; }
  return { replies, log };
}
const last = (msgs, start) => { const r = run(msgs, start); return r.replies[r.replies.length - 1]; };

test("[S01] 'I owe Mom 200' is logged and restated exactly, with the note that nothing moved and how to pay", () => {
  const { replies, log } = run(["log that I owe mom 200"]);
  assert.equal(replies[0], `Logged: you owe Mom $200.00. ${NOTE} Say "pay mom 200" when you want to send it.`);
  assert.deepEqual(Object.assign({}, log[0], { id: "x" }), { id: "x", name: "mom", direction: "i_owe", amount_cents: 20000, original_cents: 20000, note: "", created_on: "2026-10-12", status: "open" });
});

test("[S02] 'Jake owes me 20', 'I lent Maya 40', 'Sam borrowed 30 from me' are owed to the person, with the note said", () => {
  const { replies, log } = run(["jake owes me 20", "i lent maya 40 for concert tickets", "sam borrowed $30 from me", "i lent 15 to ana"]);
  assert.equal(replies[0], `Logged: Jake owes you $20.00. ${NOTE}`);
  assert.equal(replies[1], `Logged: Maya owes you $40.00 (concert tickets). ${NOTE}`);
  assert.deepEqual(log.map((x) => [x.name, x.direction, x.amount_cents]), [["jake", "owes_me", 2000], ["maya", "owes_me", 4000], ["sam", "owes_me", 3000], ["ana", "owes_me", 1500]]);
});

test("[S03] other ways to say I owe: 'I owe $15 to Sam for lunch', 'I borrowed 50 from Dad'", () => {
  const { log } = run(["i owe $15 to sam for lunch", "i borrowed 50 from dad", "i owe sam 12.50"]);
  assert.deepEqual(log.map((x) => [x.name, x.direction, x.amount_cents, x.note]), [["sam", "i_owe", 1500, "lunch"], ["dad", "i_owe", 5000, ""], ["sam", "i_owe", 1250, ""]]);
});

test("[S04] no amount is asked, never guessed; an unreadable amount saves nothing", () => {
  assert.deepEqual(I.command("jake owes me money", [], NOW), { ious: null, reply: "How much? Say it like \"Jake owes me $20\". Nothing was saved." });
  assert.deepEqual(I.command("i owe mom", [], NOW), { ious: null, reply: "How much? Say it like \"I owe Mom $20\". Nothing was saved." });
  assert.equal(I.command("jake owes me 0", [], NOW).ious, null);
  assert.equal(I.command("jake owes me 200000", [], NOW).ious, null);
});

test("[S05] what do I owe people: what the person owes, totaled, said as their own log and not checked against accounts", () => {
  assert.equal(last(["log that I owe mom 200", "jake owes me 20", "i owe sam $15 for lunch", "what do I owe people"]), "You owe: Mom $200.00; Sam $15.00 (lunch). $215.00 in all.\nFrom your IOU log, what you've told me; I don't check it against your accounts.");
  assert.equal(last(["jake owes me 20", "who do i owe"]), "You don't owe anyone anything that you've told me about.\nFrom your IOU log, what you've told me; I don't check it against your accounts.");
});

test("[S06] who still owes me, and both sides on 'show my IOUs'; an empty log is said", () => {
  assert.equal(last(["log that I owe mom 200", "jake owes me 20", "i lent maya 40", "who still owes me"]), "Owed to you: Jake $20.00; Maya $40.00. $60.00 in all.\nFrom your IOU log, what you've told me; I don't check it against your accounts.");
  assert.equal(last(["log that I owe mom 200", "jake owes me 20", "show my ious"]), "You owe: Mom $200.00. $200.00 in all.\nOwed to you: Jake $20.00. $20.00 in all.\nFrom your IOU log, what you've told me; I don't check it against your accounts.");
  assert.match(last(["show my ious"]), /^Your IOU log is empty/);
});

test("[S07] how much does Jake owe me: that person only", () => {
  assert.equal(last(["jake owes me 20", "maya owes me 5", "how much does jake owe me"]), "Jake owes you $20.00.\nFrom your IOU log, what you've told me; I don't check it against your accounts.");
  assert.match(last(["how much does jake owe me"]), /^I don't have an open IOU with Jake\./);
  // Both ways with one person: the running balance between them.
  assert.equal(last(["jake owes me 20", "i owe jake 5 for coffee", "how much does jake owe me"]), "Jake owes you $20.00; you owe Jake $5.00 (coffee). Net: Jake owes you $15.00.\nFrom your IOU log, what you've told me; I don't check it against your accounts.");
});

test("[S08] 'Jake paid me back' settles it; 'mark Mom's 200 as paid' settles that one", () => {
  const a = run(["jake owes me 20", "jake paid me back"]);
  assert.equal(a.replies[1], `Marked paid: the $20.00 Jake owed you. ${NOTE}`);
  assert.equal(a.log[0].status, "settled");
  assert.equal(a.log[0].settled_on, "2026-10-12");
  assert.equal(last(["log that I owe mom 200", "mark mom's 200 as paid"]), `Marked paid: the $200.00 you owed Mom. ${NOTE}`);
  assert.equal(last(["log that I owe mom 200", "i paid mom back", "what do i owe people"]), "Nothing is open in your IOU log: everything you logged is marked paid.");
});

test("[S09] part paid leaves the rest open; more than open is said", () => {
  const a = run(["jake owes me 20", "jake paid me 5"]);
  assert.equal(a.replies[1], `Noted: $5.00 of the $20.00 Jake owed you is paid; $15.00 is still open. ${NOTE}`);
  assert.equal(a.log[0].amount_cents, 1500);
  assert.equal(last(["log that I owe mom 200", "i paid mom 300"]), `Marked paid: the $200.00 you owed Mom. That's $100.00 more than the IOU said. ${NOTE}`);
});

test("[S10] two open IOUs with one person: the one meant is asked, nothing changes; the amount picks it", () => {
  const a = run(["sam owes me 12.50 for pizza", "sam owes me 30", "sam paid me back"]);
  assert.equal(a.replies[1], `Logged: Sam owes you $30.00. With the earlier one, that's $42.50 in all. ${NOTE}`);
  assert.equal(a.replies[2], "You have 2 open IOUs with Sam: Sam owes you $12.50 (pizza); Sam owes you $30.00. Which one? Say it with the amount, like \"mark Sam's 12.50 as paid\". Nothing changed.");
  assert.ok(a.log.every((x) => x.status === "open"));
  const b = run(["sam owes me 12.50 for pizza", "sam owes me 30", "mark sam's 30 as paid"]);
  assert.deepEqual(b.log.map((x) => x.status), ["open", "settled"]);
});

test("[S11] the direction must match: 'Jake paid me back' never settles what the person owes Jake", () => {
  const a = run(["i owe jake 20", "jake paid me back"]);
  assert.equal(a.replies[1], "I don't have an open IOU for Jake owing you, so nothing changed.");
  assert.equal(a.log[0].status, "open");
});

test("[S12] not this: taxes, a card, rent, pronouns and questions that aren't an IOU", () => {
  for (const m of ["how much do i owe in taxes", "i owe it to myself", "i owe the irs 500", "what do i owe on my card", "how much do i owe on rent", "pay mom 200", "did jake pay me back", "i owe you one", "what is my balance"]) assert.equal(I.command(m, [], NOW), null, m);
});

test("[S13] forget one person's IOUs, or say none was there", () => {
  const a = run(["jake owes me 20", "i lent maya 40", "forget the iou with maya"]);
  assert.equal(a.replies[2], "Forgot the IOU: Maya owes you $40.00. Nothing else changed.");
  assert.deepEqual(a.log.map((x) => x.name), ["jake"]);
  assert.deepEqual(I.command("forget the iou with sam", a.log, NOW), { ious: null, reply: "I don't have an IOU with Sam, so nothing changed." });
});

test("[S14] stored safely: at most 40 (a settled one makes room, a full open log refuses), no long digit run, base-36 id", () => {
  const full = Array.from({ length: 40 }, (_, i) => ({ id: `i${i}`, name: `friend${String.fromCharCode(97 + (i % 26))}`, direction: "owes_me", amount_cents: 100, original_cents: 100, note: "", created_on: "2026-10-01", status: "open" }));
  assert.match(I.command("jake owes me 20", full, NOW).reply, /^Your IOU log is full \(40 open IOUs\)\./);
  const room = full.map((x, i) => (i === 3 ? Object.assign({}, x, { status: "settled" }) : x));
  const c = I.command("jake owes me 20", room, NOW);
  assert.equal(c.ious.length, 40);
  assert.ok(!c.ious.some((x) => x.id === "i3"));
  const d = I.command("jake owes me 20 for order 123456789012", [], NOW);
  assert.doesNotMatch(JSON.stringify(d.ious), /\d{9,}/);
  assert.match(d.ious[0].id, /^iou-[0-9a-z]+$/);
});

test("[S15] a relation is said as the person's own: 'my sister' is 'your sister', and paying her uses their words", () => {
  assert.equal(last(["i owe my sister 50"]), `Logged: you owe your sister $50.00. ${NOTE} Say "pay my sister 50" when you want to send it.`);
});

test("[S16] paid offline, as people say it: 'sam paid me back in cash', 'sam says he already paid cash', 'sam settled up' settle it (megadoc C10)", () => {
  for (const said of ["sam paid me back in cash", "sam says he already paid cash", "sam settled up", "sam paid me 37 cash", "sam already paid me back"]) {
    const a = run(["sam owes me 37 for dinner", said]);
    assert.equal(a.replies[1], `Marked paid: the $37.00 Sam owed you (dinner). ${NOTE}`, said);
    assert.equal(a.log[0].status, "settled", said);
  }
  // Still a note about the person's own log: someone saying they paid never settles what the person owes them.
  assert.notEqual(run(["i owe sam 37", "sam says he already paid cash"]).log[0].status, "settled");
});

test("[S17] \"who owes me money\" lists the log; \"who\" and \"what\" are never a name", () => {
  const { replies } = run(["sam owes me 40", "who owes me money"]);
  assert.match(replies[1], /^Owed to you: Sam \$40\.00\. \$40\.00 in all\./);
  for (const m of ["who owes me money", "who owes me anything", "does anyone owe me anything"]) { const r = I.command(m, [], NOW); assert.ok(r && !/How much\?/.test(r.reply), m); }
});

test("[S18] \"forget what sam owes me\" forgets Sam's IOU only, never the whole log; someone not in the log changes nothing", () => {
  const start = run(["sam owes me 40", "i owe mom 200", "jake owes me 15"]).log;
  const a = I.command("forget what sam owes me", start, NOW);
  assert.equal(a.reply, "Forgot the IOU: Sam owes you $40.00. Nothing else changed.");
  assert.deepEqual(a.ious.map((x) => x.name).sort(), ["jake", "mom"]);
  assert.equal(I.command("forget what i owe mom", start, NOW).ious.length, 2);
  const none = I.command("forget what dana owes me", start, NOW); assert.equal(none.ious, null); assert.match(none.reply, /I don't have an IOU with Dana, so nothing changed\./);
});

test("[S19] \"sam still owes me 40\" restates the open IOU, never logs it twice; a different amount asks what's left or new; \"still\" is never part of the name", () => {
  const start = run(["sam owes me 40"]).log;
  const same = I.command("sam still owes me 40 from last week", start, NOW); assert.equal(same.ious, null); assert.match(same.reply, /^That's in your log already: Sam owes you \$40\.00, logged \d{4}-\d\d-\d\d\. Nothing was added\.$/);
  const diff = I.command("sam still owes me 25", start, NOW); assert.equal(diff.ious, null);
  assert.equal(diff.reply, 'Your log has: Sam owes you $40.00. Is $25.00 what\'s left, or a new IOU on top? Say "Sam paid me 15" for what\'s left, or "Sam owes me 25" for a new one. Nothing was changed.');
  const fresh = I.command("jake still owes me 20", start, NOW); assert.equal(fresh.ious[fresh.ious.length - 1].name, "jake");
});
