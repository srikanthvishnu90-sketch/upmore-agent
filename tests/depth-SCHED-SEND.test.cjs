// Scheduled send (megadoc A08 "pay maya 40 tomorrow at 9"; docs/depth/SCHED-SEND.md). One test per sub-capability,
// tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail. The settings, hourly and offer
// side is tests/edge/scheduled-send.test.ts.
// Check: node --test tests/depth-SCHED-SEND.test.cjs && node evals/depth/run.cjs SCHED-SEND
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const S = require(path.join(dir, "113-scheduled-send.js"));

const TZ = "America/New_York", NOW = Date.parse("2026-10-12T15:00:00Z"); // Mon Oct 12, 11:00 a.m. New York
const set = (t, w, now) => S.command(t, w || [], now || NOW, TZ);
const at = (t) => { const r = set(t); return r && r.watches ? r.watches[r.watches.length - 1] : null; };
const when = (w) => [w.at_date, w.at_hour, w.at_min];

test("[S01] the megadoc's words: restated with the day and time in the person's zone, that nothing is sent before or without a yes, and how to cancel", () => {
  assert.equal(set("pay maya 40 tomorrow at 9").reply, "Scheduled: tomorrow, Tuesday, Oct 13, at 9:00 AM your time (I took that as morning; say the time with am or pm to change it), I'll ask you to send Maya $40.00. Nothing is sent before then, and nothing is sent without its own card and your yes at that time. The check runs hourly, so the question can come up to an hour after 9:00 AM. Say \"cancel the scheduled send to Maya\" to drop it.");
});
test("[S02] no am or pm: 7 to 11 is morning, 1 to 6 afternoon, and the reply says which it took", () => {
  assert.deepEqual(when(at("pay maya 40 tomorrow at 9")), ["2026-10-13", 9, 0]);
  const r = set("pay maya 40 tomorrow at 3"); assert.deepEqual(when(r.watches[0]), ["2026-10-13", 15, 0]); assert.match(r.reply, /at 3:00 PM your time \(I took that as afternoon or evening;/);
});
test("[S03] am, pm and minutes as said", () => {
  assert.deepEqual(when(at("send jake 25 on friday at 6:30pm")), ["2026-10-16", 18, 30]);
  assert.deepEqual(when(at("send jake 25 tomorrow at 8 am")), ["2026-10-13", 8, 0]);
  assert.deepEqual(when(at("send jake 25 tomorrow at 12am")), ["2026-10-13", 0, 0]);
});
test("[S04] noon, and tonight is evening", () => {
  assert.deepEqual(when(at("venmo dana 15.50 tomorrow at noon")), ["2026-10-13", 12, 0]);
  assert.deepEqual(when(at("pay maya 40 tonight at 8")), ["2026-10-12", 20, 0]);
  assert.deepEqual(when(at("pay maya 40 tonight")), ["2026-10-12", 19, 0]);
});
test("[S05] a weekday is the next one; today's weekday is next week's", () => {
  assert.equal(at("pay maya 40 friday at 9am").at_date, "2026-10-16");
  assert.equal(at("pay maya 40 on monday at 9am").at_date, "2026-10-19");
});
test("[S06] a month and day, or m/d; one already past is next year's", () => {
  assert.equal(at("pay maya 40 on oct 20 at 9am").at_date, "2026-10-20");
  assert.equal(at("pay maya 40 on 10/14 at 9am").at_date, "2026-10-14");
  // Oct 1 has passed, so it is next year's, which is past the 60-day limit: refused, never moved to this year.
  assert.match(set("pay maya 40 on oct 1 at 9am").reply, /up to 60 days ahead/);
});
test("[S07] a day with no time is 9 a.m., said", () => {
  const r = set("send sam 20 tomorrow"); assert.deepEqual(when(r.watches[0]), ["2026-10-13", 9, 0]); assert.match(r.reply, /\(no time was said, so the morning\)/);
});
test("[S08] a time with no day: today if still ahead, else tomorrow", () => {
  assert.equal(at("pay maya 40 at 3pm").at_date, "2026-10-12");
  assert.equal(at("pay maya 40 at 9am").at_date, "2026-10-13");
});
test("[S09] a time already past is refused, nothing saved", () => {
  const r = set("pay maya 40 today at 9am"); assert.equal(r.watches, null); assert.match(r.reply, /^9:00 AM today has already passed, so nothing was scheduled\./);
});
test("[S10] more than 60 days ahead is refused", () => {
  assert.equal(at("pay maya 40 on dec 1 at 9am").at_date, "2026-12-01");
  const far = set("pay maya 40 on dec 20 at 9am"); assert.equal(far.watches, null); assert.equal(far.reply, "I can schedule up to 60 days ahead, so nothing was scheduled.");
});
test("[S11] who and how much are needed; amounts from $0.01 to $10,000.00", () => {
  assert.match(set("send 40 tomorrow at 9").reply, /^Who to and how much\?/);
  assert.match(set("send maya 20000 tomorrow at 9").reply, /^I can schedule a send from \$0\.01 to \$10,000\.00\./);
  assert.equal(at("send maya 9999.99 tomorrow at 9").amount_cents, 999999);
});
test("[S12] not a scheduled send: rent, bills, repeating, a condition, no number", () => {
  for (const t of ["pay my rent tomorrow", "pay the electric bill 80 tomorrow", "pay maya 40 every friday", "pay maya 40 when my paycheck lands", "pay maya forty tomorrow", "send maya 40"]) assert.equal(set(t), null, t);
});
test("[S13] show and cancel: by name or all; a name not scheduled says so", () => {
  const w = set("pay maya 40 tomorrow at 9").watches.concat(set("send jake 25 friday at 5pm").watches);
  assert.match(set("show my scheduled sends", w).reply, /^Scheduled: send Maya \$40\.00 on Tuesday, Oct 13 at 9:00 AM; send Jake \$25\.00 on Friday, Oct 16 at 5:00 PM\./);
  assert.equal(set("cancel the scheduled send to maya", w).watches.length, 1);
  assert.equal(set("cancel my scheduled payments", w).watches.length, 0);
  assert.equal(set("cancel the scheduled send to sam", w).reply, "You don't have a scheduled send to Sam, so nothing changed.");
});
test("[S14] at most 5 ahead at a time", () => {
  let w = []; for (let i = 0; i < 5; i++) w = set(`send maya ${10 + i} tomorrow at 9`, w).watches;
  const r = set("send maya 99 tomorrow at 9", w); assert.equal(r.watches, null); assert.match(r.reply, /^You have 5 scheduled sends already/);
});
test("[S15] due: at its time once, never before, never a day late; the offer carries the person's words", () => {
  const w = set("pay maya 40 tomorrow at 9").watches, t = S.atMs(w[0], TZ);
  assert.equal(S.due(w, t - 60000, TZ, []).length, 0);
  const d = S.due(w, t + 7 * 60000, TZ, []); assert.equal(d.length, 1); assert.equal(d[0].offer.command, "pay maya 40"); assert.equal(d[0].offer.kind, "scheduled_send");
  assert.equal(S.due(w, t + 7 * 60000, TZ, [d[0].key]).length, 0);
  assert.equal(S.due(w, t + 25 * 3600000, TZ, []).length, 0);
});
test("[S16] the person's clock across a daylight-saving change: Nov 2 at 9 a.m. in New York is 14:00 UTC", () => {
  const w = at("pay maya 40 on nov 2 at 9am"); assert.equal(new Date(S.atMs(w, TZ)).toISOString(), "2026-11-02T14:00:00.000Z");
  assert.equal(new Date(S.atMs(at("pay maya 40 tomorrow at 9am"), TZ)).toISOString(), "2026-10-13T13:00:00.000Z");
});
