// MI-117 — ALERT FATIGUE POLICY (Spec 2 §4.1/§4.4) in module 152's delivery
// layer. Before this build, 152 queued reminders with NO delivery policy at
// all: no quiet hours, no instant cap, no batching, no skip tightening — the
// day the MI-032 scheduler lands, alerts would arrive unthrottled.
// Guards (fail-first; each names the defect class it keeps out):
//   FTG-1 an 8-opening burst at one company delivers as 8 separate instant
//         alerts instead of ONE batched alert (Spec 2 §4.4 batching)
//   FTG-2 an alert inside quiet hours buzzes immediately instead of holding
//         to the window's end (Spec 2 §4.1), unless night alerts opted in
//   FTG-3 the 6th instant alert in a day still goes instant instead of
//         folding into the digest (Spec 2 §4.4: ≤5 instant/day until raised)
//   FTG-4 five skips in a row never tightens the policy, or tightening
//         happens silently — it must announce itself in ONE sentence
//   FTG-5 held (quiet-hours) alerts consume the day's instant budget, or
//         company-less reminders batch together as if one employer
// Check: node --test tests/career-mi117-alert-fatigue.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const A = require(path.join(__dirname, "..", "packages/domain/152-career-assign.js"));
const W = require(path.join(__dirname, "..", "packages/domain/151-career-alert-watch.js"));

// Daytime anchor: 2026-10-14 15:00 UTC (outside the default 22:00–07:00 UTC
// quiet window); night anchor inside it.
const DAY = Date.parse("2026-10-14T15:00:00.000Z");
const NIGHT = Date.parse("2026-10-14T23:30:00.000Z");
const NEXT_MORNING = Date.parse("2026-10-15T07:05:00.000Z");

const PROFILE121 = {
  skills: [{ name: "Excel", proven: true, fact_id: "F-012" }],
  degree: "B.S. Computer Science + Finance, class of 2028",
  level: "student", experience_years: 0,
  experience_text: "financial modeling coursework, Python",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2028, clearance: null, locations: ["Chicago"] },
  preferences: { role_families: ["Finance"], locations: ["Chicago", "Remote"], starred_companies: [] },
};

function watch(userId, policy) {
  const wp = A.createWatchProfile(userId || "user-1", {
    scoring_profile: PROFILE121,
    interests: [{
      interest_id: "int-ib",
      role: A.roleSpecFor({ soc: "13-2051", split: "Investment Banking Analyst" }),
      filters: { locations: ["Chicago"], remote_ok: true, bands: ["intern"], firms_include: [], firms_exclude: [] },
    }],
  });
  if (policy) wp.alert_policy = A.normalizeAlertPolicy(policy);
  return wp;
}

const posting = (over) => Object.assign({
  job_id: "greenhouse:testbank:1", company: "Test Bank", title: "Investment Banking Summer Analyst",
  role_family: "Finance", seniority_band: "intern", location: "Chicago, IL", remote: "onsite",
  url: "https://boards.greenhouse.io/testbank/jobs/1", posted_at: "2026-10-14T14:00:00.000Z",
  jd_text: "Investment banking summer analyst program in Chicago. Financial modeling in Excel.",
  source: "greenhouse", req_id: "1",
}, over || {});

// N distinct-seat postings at one company (distinct titles = distinct seats).
const burst = (company, n) => Array.from({ length: n }, (_, i) => posting({
  job_id: `greenhouse:burst:${i + 1}`, company,
  title: `Investment Banking Summer Analyst ${String.fromCharCode(65 + i)}`,
  url: `https://boards.greenhouse.io/testbank/jobs/b${i + 1}`, req_id: `b${i + 1}`,
}));

async function remindersFor(store, wp, postings, now) {
  const res = await A.runAssignCycle({ postings, watchProfile: wp, store, now: now || DAY });
  return res.reminders;
}

test("policy defaults: cap 5, quiet 22:00-07:00 UTC, night alerts off; a raised cap is honored", () => {
  const wp = watch();
  assert.equal(wp.alert_policy.instant_daily_cap, 5);
  assert.equal(wp.alert_policy.quiet_hours.start, "22:00");
  assert.equal(wp.alert_policy.quiet_hours.end, "07:00");
  assert.equal(wp.alert_policy.night_alerts, false);
  assert.equal(A.validateWatchProfile(wp).ok, true);
  const raised = watch("u2", { instant_daily_cap: 10 });
  assert.equal(raised.alert_policy.instant_daily_cap, 10);
  const bad = watch("u3");
  bad.alert_policy = { instant_daily_cap: 0, quiet_hours: { start: "tea", end: "07:00", timezone: "UTC" } };
  const v = A.validateWatchProfile(bad);
  assert.equal(v.ok, false);
  assert.ok(v.errors.some((e) => /instant|cap/i.test(e)), v.errors.join(";"));
  assert.ok(v.errors.some((e) => /quiet/i.test(e)), v.errors.join(";"));
});

test("FTG-1: an 8-opening burst at one company produces ONE batched alert", async () => {
  const store = W.createMemoryStore();
  const wp = watch();
  const reminders = await remindersFor(store, wp, burst("Test Bank", 8));
  assert.equal(reminders.length, 8);
  const plan = await A.planDelivery({ reminders, watchProfile: wp, store, now: DAY });
  assert.equal(plan.instant.length, 0, "no individual instant alerts for a burst");
  assert.equal(plan.batched.length, 1);
  const b = plan.batched[0];
  assert.equal(b.type, "career_batched_alert");
  assert.equal(b.company, "Test Bank");
  assert.equal(b.count, 8);
  assert.equal(b.top.length, 3, "batched alert lists the best 3 (Spec 2 §4.4)");
  assert.ok(/Test Bank/.test(b.speak_line) && /8/.test(b.speak_line), b.speak_line);
  assert.equal(plan.instant_sent, 1, "a batched alert consumes exactly one instant slot");
  assert.equal(plan.digest.length, 0);
  assert.equal(plan.held.length, 0);
});

test("FTG-2: an alert in quiet hours holds to the window's end, then releases", async () => {
  const store = W.createMemoryStore();
  const wp = watch();
  const reminders = await remindersFor(store, wp, [posting()], NIGHT);
  assert.equal(reminders.length, 1);
  const plan = await A.planDelivery({ reminders, watchProfile: wp, store, now: NIGHT });
  assert.equal(plan.instant.length, 0);
  assert.equal(plan.batched.length, 0);
  assert.equal(plan.held.length, 1);
  assert.equal(plan.held[0].reminder_id, reminders[0].reminder_id);
  assert.equal(plan.release_at, "2026-10-15T07:00:00.000Z");
  assert.equal(plan.instant_sent, 0, "FTG-5: a held alert consumes no instant budget");
  // At the window's end the held alert releases without any new reminder.
  const morning = await A.planDelivery({ reminders: [], watchProfile: wp, store, now: NEXT_MORNING });
  assert.equal(morning.held.length, 0);
  assert.equal(morning.instant.length, 1);
  assert.equal(morning.instant[0].reminder_id, reminders[0].reminder_id);
});

test("FTG-2b: night-alerts opt-in delivers instantly inside quiet hours", async () => {
  const store = W.createMemoryStore();
  const wp = watch("user-1", { night_alerts: true });
  const reminders = await remindersFor(store, wp, [posting()], NIGHT);
  const plan = await A.planDelivery({ reminders, watchProfile: wp, store, now: NIGHT });
  assert.equal(plan.held.length, 0);
  assert.equal(plan.instant.length, 1);
});

test("FTG-3: the 6th instant alert in a day folds into the digest; the cap resets next day", async () => {
  const store = W.createMemoryStore();
  const wp = watch();
  const six = [1, 2, 3, 4, 5, 6].map((i) => posting({
    job_id: `greenhouse:c${i}:1`, company: `Bank ${i}`, title: "Investment Banking Summer Analyst",
    url: `https://boards.greenhouse.io/c${i}/jobs/1`, req_id: `${i}`,
  }));
  const reminders = await remindersFor(store, wp, six);
  assert.equal(reminders.length, 6);
  const plan = await A.planDelivery({ reminders, watchProfile: wp, store, now: DAY });
  assert.equal(plan.instant.length, 5);
  assert.equal(plan.digest.length, 1);
  assert.equal(plan.digest[0].job_id, "greenhouse:c6:1");
  assert.ok(plan.digest_record && plan.digest_record.type === "career_alert_digest" && plan.digest_record.count === 1);
  // Same day, one more: still digest (the count persisted, not per-call).
  const more = await remindersFor(store, wp, [posting({
    job_id: "greenhouse:c7:1", company: "Bank 7", url: "https://boards.greenhouse.io/c7/jobs/1", req_id: "7",
  })], DAY + 3600e3);
  const plan2 = await A.planDelivery({ reminders: more, watchProfile: wp, store, now: DAY + 3600e3 });
  assert.equal(plan2.instant.length, 0);
  assert.equal(plan2.digest.length, 1);
  // Next day the budget is fresh.
  const nextDay = await remindersFor(store, wp, [posting({
    job_id: "greenhouse:c8:1", company: "Bank 8", url: "https://boards.greenhouse.io/c8/jobs/1", req_id: "8",
  })], DAY + 24 * 3600e3);
  const plan3 = await A.planDelivery({ reminders: nextDay, watchProfile: wp, store, now: DAY + 24 * 3600e3 });
  assert.equal(plan3.instant.length, 1);
});

test("FTG-4: five skips in a row tightens, announced in exactly one sentence, once", async () => {
  const store = W.createMemoryStore();
  const wp = watch();
  let out = null;
  for (let i = 0; i < 4; i++) out = await A.recordAlertFeedback(store, wp, "skip", { now: DAY });
  assert.equal(out.tightened, false);
  assert.equal(out.notice, null);
  assert.equal(out.skip_streak, 4);
  out = await A.recordAlertFeedback(store, wp, "skip", { now: DAY });
  assert.equal(out.tightened, true);
  assert.equal(out.skip_streak, 5);
  assert.ok(typeof out.notice === "string" && out.notice.length > 10, "tightening must announce itself");
  const sentences = out.notice.split(/[.!?]+/).filter((x) => x.trim().length);
  assert.equal(sentences.length, 1, `notice must be one sentence, got: ${out.notice}`);
  assert.equal(out.effective_cap, 2, "tightened cap is half the base 5, floored, min 1");
  // A sixth skip does not re-announce.
  out = await A.recordAlertFeedback(store, wp, "skip", { now: DAY });
  assert.equal(out.tightened, true);
  assert.equal(out.notice, null);
});

test("FTG-4b: a non-skip action resets the streak — 4 skips, a view, 4 skips never tightens", async () => {
  const store = W.createMemoryStore();
  const wp = watch();
  for (let i = 0; i < 4; i++) await A.recordAlertFeedback(store, wp, "skip", { now: DAY });
  const viewed = await A.recordAlertFeedback(store, wp, "view", { now: DAY });
  assert.equal(viewed.skip_streak, 0);
  let out = null;
  for (let i = 0; i < 4; i++) out = await A.recordAlertFeedback(store, wp, "skip", { now: DAY });
  assert.equal(out.tightened, false);
  assert.equal(out.skip_streak, 4);
});

test("FTG-4c: the tightened cap binds delivery — after tightening only 2 go instant", async () => {
  const store = W.createMemoryStore();
  const wp = watch();
  for (let i = 0; i < 5; i++) await A.recordAlertFeedback(store, wp, "skip", { now: DAY });
  const four = [1, 2, 3, 4].map((i) => posting({
    job_id: `greenhouse:t${i}:1`, company: `Firm ${i}`, url: `https://boards.greenhouse.io/t${i}/jobs/1`, req_id: `${i}`,
  }));
  const reminders = await remindersFor(store, wp, four);
  const plan = await A.planDelivery({ reminders, watchProfile: wp, store, now: DAY });
  assert.equal(plan.effective_cap, 2);
  assert.equal(plan.instant.length, 2);
  assert.equal(plan.digest.length, 2);
});

test("FTG-5: company-less reminders never batch together as if one employer", async () => {
  const store = W.createMemoryStore();
  const wp = watch();
  const anon = [1, 2].map((i) => posting({
    job_id: `lever:unknown:${i}`, company: "", source: "lever",
    title: `Investment Banking Summer Analyst ${i === 1 ? "A" : "B"}`,
    url: `https://jobs.lever.co/unknown/${i}`, req_id: `${i}`,
  }));
  const reminders = await remindersFor(store, wp, anon);
  assert.equal(reminders.length, 2);
  const plan = await A.planDelivery({ reminders, watchProfile: wp, store, now: DAY });
  assert.equal(plan.batched.length, 0);
  assert.equal(plan.instant.length, 2);
});

test("quiet hours honor the policy timezone (America/Chicago), not just UTC", async () => {
  // 2026-10-14T04:30Z is 23:30 CDT on Oct 13 in Chicago — inside a
  // 22:00–07:00 Chicago quiet window, outside it in UTC terms is irrelevant.
  const store = W.createMemoryStore();
  const wp = watch("user-1", { quiet_hours: { start: "22:00", end: "07:00", timezone: "America/Chicago" } });
  const at = Date.parse("2026-10-14T04:30:00.000Z");
  assert.equal(A.isInQuietHours(at, wp.alert_policy), true);
  const reminders = await remindersFor(store, wp, [posting()], at);
  const plan = await A.planDelivery({ reminders, watchProfile: wp, store, now: at });
  assert.equal(plan.held.length, 1);
  // 07:00 CDT = 12:00 UTC.
  assert.equal(plan.release_at, "2026-10-14T12:00:00.000Z");
});
