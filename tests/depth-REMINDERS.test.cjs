// Reminders in chat (megadoc D11 "remind me to pay rent on the 28th"; docs/depth/REMINDERS.md). One test per
// sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Check: node --test tests/depth-REMINDERS.test.cjs && node evals/depth/run.cjs REMINDERS
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const R = require(path.join(dir, "103-reminders.js"));

const TZ = "America/New_York";
const NOW = Date.parse("2026-10-12T15:00:00Z"); // Monday, Oct 12, 11 a.m. in New York
const EARLY = Date.parse("2026-10-12T11:00:00Z"); // 7 a.m. in New York
const at = (iso) => Date.parse(iso);
const on = (words, now = NOW, tz = TZ) => { const p = R.parse(words, now, tz); return p && p.ok ? p.reminder.on || `monthly:${p.reminder.monthly_day}` : p && p.reply; };
const set = (words, now = NOW) => R.parse(words, now, TZ).reminder;

test("[S01] a dated reminder is restated with the day, the 9 a.m. hour in the person's zone, and that nothing moves", () => {
  assert.equal(R.parse("remind me to pay rent on the 28th", EARLY, TZ).reply, "I'll remind you to pay rent on Wednesday, Oct 28, from 9 a.m. New York time. It's a reminder only: nothing is paid or moved. Say \"remind me to pay rent on the 28th every month\" if you want it monthly.");
  assert.match(R.parse("remind me about the dentist on friday", NOW, "America/Los_Angeles").reply, /^I'll remind you about the dentist on Friday, Oct 16, from 9 a\.m\. Los Angeles time\. It's a reminder only: nothing is paid or moved\.$/);
});

test("[S02] day words: today, tomorrow, in N days or weeks, next week, a weekday (the next one, never today)", () => {
  assert.equal(on("remind me to call the bank tomorrow"), "2026-10-13");
  assert.equal(on("remind me tomorrow to call the bank"), "2026-10-13");
  assert.equal(on("remind me to check my refund in 3 days"), "2026-10-15");
  assert.equal(on("remind me in 2 weeks to check my refund"), "2026-10-26");
  assert.equal(on("remind me next week to call the bank"), "2026-10-19");
  assert.equal(on("remind me to call the bank on monday"), "2026-10-19");
  assert.equal(on("remind me to call the bank today", EARLY), "2026-10-12");
  assert.match(R.parse("remind me to call the bank today", NOW, TZ).reply, /^I'll remind you to call the bank later today \(I check every hour\)\./);
});

test("[S03] the Nth is this month if still ahead, else next; a month day rolls to next year; m/d reads too", () => {
  assert.equal(on("remind me to pay rent on the 12th"), "2026-10-12");
  assert.equal(on("remind me to pay rent on the 5th"), "2026-11-05");
  assert.equal(on("remind me to pay rent on oct 28"), "2026-10-28");
  assert.equal(on("remind me to pay estimated taxes on jan 15"), "2027-01-15");
  assert.match(R.parse("remind me to pay estimated taxes on jan 15", NOW, TZ).reply, /on Friday, Jan 15, 2027,/);
  assert.equal(on("set a reminder for my car insurance on 11/3"), "2026-11-03");
  assert.equal(on("remind me to renew my passport on 2/1"), "2027-02-01");
});

test("[S04] monthly: every month on the 28th; the 31st is a shorter month's last day", () => {
  assert.equal(on("remind me to pay rent on the 28th every month"), "monthly:28");
  assert.match(R.parse("remind me to pay rent on the 31st every month", NOW, TZ).reply, /on the 31st of every month, from 9 a\.m\. New York time \(the last day in a shorter month\)\. .*Say "stop the reminder to pay rent" to end it\.$/);
  const r = set("remind me to pay rent on the 31st every month");
  assert.deepEqual(R.due([r], at("2026-11-30T15:00:00Z"), TZ, []).map((x) => x.key), [`reminder:${r.id}:2026-11-30`]);
  assert.deepEqual(R.due([r], at("2026-11-29T15:00:00Z"), TZ, []), []);
  assert.deepEqual(R.due([r], at("2027-02-28T15:00:00Z"), TZ, []).map((x) => x.key), [`reminder:${r.id}:2027-02-28`]);
});

test("[S05] no day is asked about, never guessed; no words asked; monthly without a day asked", () => {
  assert.equal(R.parse("remind me to pay rent", NOW, TZ).reply, "When should I remind you to pay rent? Say a day, like \"on the 28th\", \"on Friday\" or \"tomorrow\". Nothing was set.");
  assert.equal(R.parse("set a reminder", NOW, TZ).reply, "What should I remind you about? Say it like \"remind me to pay rent on the 28th\". Nothing was set.");
  assert.match(R.parse("remind me to pay rent every month", NOW, TZ).reply, /^Which day of the month\? .*Nothing was set\.$/);
});

test("[S06] a past or impossible date is refused, nothing set", () => {
  assert.match(on("remind me to pay rent on feb 30"), /^I couldn't read that date, so nothing was set\./);
  assert.match(on("remind me to pay rent on feb 30 2027"), /^I couldn't read that date, so nothing was set\./);
  assert.match(on("remind me to pay rent on 13/40"), /^I couldn't read that date/);
  assert.match(on("remind me to pay rent on oct 1 2026"), /^I couldn't read that date \(it's already past\)/);
  assert.match(on("remind me to pay rent before today"), /it's already past/);
});

test("[S07] 'before the 20th' is the 19th, said as the day before", () => {
  assert.equal(on("remind me to cancel netflix before the 20th"), "2026-10-19");
  assert.match(R.parse("remind me to cancel netflix before the 20th", NOW, TZ).reply, /^I'll remind you to cancel netflix on Monday, Oct 19, the day before Oct 20, from 9 a\.m\./);
  assert.match(R.parse("remind me before the 1st every month to pay rent", NOW, TZ).reply, /^Which day of the month should I remind you\?/);
});

test("[S08] due from 9 a.m. in the person's own zone, not before", () => {
  const r = set("remind me to pay rent on the 13th");
  assert.deepEqual(R.due([r], at("2026-10-13T12:59:00Z"), TZ, []), []);
  assert.equal(R.due([r], at("2026-10-13T13:00:00Z"), TZ, []).length, 1);
  assert.deepEqual(R.due([r], at("2026-10-13T13:00:00Z"), "America/Los_Angeles", []), []);
});

test("[S09] said once by its key; a sent key is never said again", () => {
  const r = set("remind me to pay rent on the 13th"), t = at("2026-10-13T15:00:00Z");
  const first = R.due([r], t, TZ, []);
  assert.deepEqual(first.map((x) => x.key), [`reminder:${r.id}:2026-10-13`]);
  assert.deepEqual(R.due([r], t, TZ, first.map((x) => x.key)), []);
  assert.deepEqual(R.due([r, r], t, TZ, []).length, 1);
});

test("[S10] a day the hourly run missed is said the next day from 9 a.m., with the day and an apology; never two days late", () => {
  const r = set("remind me to pay rent on the 13th");
  assert.deepEqual(R.due([r], at("2026-10-14T05:00:00Z"), TZ, []), []);
  assert.equal(R.due([r], at("2026-10-14T14:00:00Z"), TZ, [])[0].text, "Reminder: pay rent. This was for yesterday, Oct 13; I'm sorry it's late. (You asked me to remind you; nothing was paid or moved.)");
  assert.deepEqual(R.due([r], at("2026-10-15T14:00:00Z"), TZ, []), [], "never fired (no key in the log) means never caught up two days late");
  // C24 (real-world capabilities, Wave 1) supersedes fire-and-forget for a reminder that DID fire: it survives
  // until dismissed, re-surfacing once a day under its own key — so the day after a fired reminder, the sent key
  // no longer means silence; it means the still-open re-surface below (dismissal: tests/wave1-briefs.test.cjs).
  const again = R.due([r], at("2026-10-14T14:00:00Z"), TZ, [`reminder:${r.id}:2026-10-13`]);
  assert.deepEqual(again.map((x) => x.key), [`reminder:${r.id}:2026-10-13:again:2026-10-14`]);
  assert.match(again[0].text, /^Reminder, still open: pay rent\./);
});

test("[S11] said back in the person's words turned to Upmore's voice, 'to' or 'about'", () => {
  const r = set("remind me to check my refund tomorrow"), a = set("remind me about my car insurance tomorrow");
  assert.equal(r.text, "check my refund");
  assert.match(R.parse("remind me to check my refund tomorrow", NOW, TZ).reply, /^I'll remind you to check your refund on/);
  assert.equal(R.due([r], at("2026-10-13T14:00:00Z"), TZ, [])[0].text, "Reminder: check your refund. (You asked me to remind you; nothing was paid or moved.)");
  assert.equal(R.due([a], at("2026-10-13T14:00:00Z"), TZ, [])[0].text, "Reminder about: your car insurance. (You asked me to remind you; nothing was paid or moved.)");
  assert.match(R.due([set("remind me to pay rent on the 28th every month")], at("2026-10-28T14:00:00Z"), TZ, [])[0].text, /on this day each month; nothing was paid or moved\.\)$/);
});

test("[S12] not this: a route reminder, 'remind me when' (a watch), a free trial, anything not a reminder ask", () => {
  for (const m of ["remind me tomorrow to check the bonus terms for R2748", "remind me when netflix charges me", "remind me if my balance drops below $100", "remind me to cancel hulu before my trial ends oct 20", "what is my balance", "pay rent on the 28th", "i need to remember to pay rent", "remind me what you can do", "remind me how much i owe sam"]) assert.equal(R.parse(m, NOW, TZ), null, m);
  assert.equal(R.command("what is my balance", [], NOW, TZ), null);
});

test("[S13] stop by its words or all of them; one not found is said, nothing changed", () => {
  const w = [set("remind me to pay rent on the 28th every month"), Object.assign(set("remind me about the dentist on friday"), { id: "r-b" }), { id: "b1", kind: "category_budget" }];
  const one = R.command("stop the reminder to pay rent", w, NOW, TZ);
  assert.equal(one.reply, "Stopped the reminder: pay rent. Nothing else changed.");
  assert.deepEqual(one.watches.map((x) => x.id), ["r-b", "b1"]);
  const all = R.command("delete all my reminders", w, NOW, TZ);
  assert.deepEqual(all.watches.map((x) => x.id), ["b1"]);
  const none = R.command("cancel the reminder about the gym", w, NOW, TZ);
  assert.equal(none.reply, "I don't have a reminder about \"gym\", so nothing changed.");
  assert.equal(none.watches, null);
});

test("[S14] saved alongside other watches: at most 5, a past one-off dropped, the same one twice refused, listed on ask", () => {
  const old = Object.assign(set("remind me to pay rent on the 13th"), { id: "r-old", on: "2026-10-01" });
  const budget = { id: "b1", kind: "category_budget" };
  const c = R.command("remind me to call the bank tomorrow", [old, budget], NOW, TZ);
  assert.deepEqual(c.watches.map((x) => x.kind + ":" + (x.text || x.id)), ["category_budget:b1", "reminder:call the bank"]);
  const five = [1, 2, 3, 4, 5].map((n) => Object.assign(set(`remind me to do thing ${n} on the 28th`), { id: `r${n}` }));
  assert.match(R.command("remind me to call the bank tomorrow", five, NOW, TZ).reply, /^You already have 5 reminders, the most I keep\..*Nothing was set\.$/);
  assert.equal(R.command("remind me to call the bank tomorrow", five, NOW, TZ).watches, null);
  assert.equal(R.command("remind me to call the bank tomorrow", c.watches, NOW, TZ).reply, "You already have that reminder: call the bank (Tuesday, Oct 13). Nothing changed.");
  assert.equal(R.command("show my reminders", c.watches, NOW, TZ).reply, "Reminders: call the bank (Tuesday, Oct 13).");
  assert.match(R.command("show my reminders", [], NOW, TZ).reply, /^You have no reminders\./);
});

test("[S15] what is stored keeps no long digit run and a base-36 id; the words are capped", () => {
  const r = set("remind me to call about account 123456789012 tomorrow");
  assert.doesNotMatch(JSON.stringify(r), /\d{9,}/);
  assert.match(r.id, /^r-[0-9a-z]+$/);
  assert.ok(set(`remind me to ${"x ".repeat(200)}tomorrow`).text.length <= 120);
});

test("[S16] the list hides a one-off whose day is past and says the year when it isn't this one", () => {
  const past = Object.assign(set("remind me to pay rent on the 13th"), { on: "2026-10-01" });
  assert.equal(R.describe([past, set("remind me to pay estimated taxes on jan 15")], NOW, TZ), "Reminders: pay estimated taxes (Friday, Jan 15, 2027).");
  assert.equal(R.describe([past], NOW, TZ), "");
});

test("[S17] a reminder in hours or minutes is said not kept (once a day, in the morning), never garbled into its words; \"remind me about rent\" asks when, about rent", () => {
  for (const m of ["remind me in 2 hours to move money", "remind me in an hour to pay sam", "remind me in 20 minutes to check my balance"]) {
    const r = R.command(m, [], NOW, "America/New_York");
    assert.equal(r.reply, "Reminders go out once a day, in the morning, so I can't remind you in a few hours or minutes. Want it tomorrow morning instead? Say \"remind me tomorrow to ...\". Nothing was set.", m);
    assert.equal(r.watches, null, "nothing set: " + m);
  }
  assert.match(R.command("remind me about rent", [], NOW, "America/New_York").reply, /^When should I remind you about rent\? /);
  assert.match(R.command("remind me to pay rent", [], NOW, "America/New_York").reply, /^When should I remind you to pay rent\? /);
  assert.match(R.command("remind me in 2 days to pay sam", [], NOW, "America/New_York").reply, /^I'll remind you to pay sam on Wednesday, Oct 14/);
});
