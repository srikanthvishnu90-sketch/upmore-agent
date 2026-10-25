"use strict";
// ALERT PATH (2026-10-24, owner scope reset: iMessage job alerts end to
// end is the ONE active feature). The coordinator probed head 21cb640b
// with 5 private alert conversations (21 turns): only 3 behaved. The
// gaps, by family: create asks in delivery-verb shapes never create
// (and lose to goal capture / the disclosure reading); out-of-taxonomy
// roles are refused outright; every change op on a standing watch
// banners; list/history questions go unanswered from state; pause /
// resume / stop shapes banner, refuse wrongly, or contradict the
// record; and the create reply carries handler-internal wording
// ("automatic alert delivery is not wired in this handler") instead of
// reading the delivery flag. This suite pins ONE alert-intent path in
// the dispatcher — create · change · list · pause · resume · stop ·
// history resolved from the alert frame + the standing watch record —
// on phrasings invented HERE (never the coordinator's probe words).
// Fail-first: at 121bc6d6 every family below fails on its first
// required assertion (the turns land on career_catchall / career_goal
// / the refusal, and no watch state moves).
// Check: node --test tests/career-alert-path-20261024.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const A = D("152-career-assign.js");

const seam = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"),
  CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"),
  CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"),
  CareerContainment: D("143-career-containment.js"),
});

const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const PROFILE = {
  basics: { name: "Alex Testcase", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Python", text: "Skill: Python", fact_id: "F-010", evidence: ["resume lists Python"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};

let seq = 0;
function convo(opts = {}) {
  const user = `alertpath-${++seq}`;
  const ctx = seam.createTurnCtx({ userId: user, threadId: `ap-${seq}`, now: NOW, snapshot: null, profile: PROFILE });
  if (opts.delivery) ctx.workerCapabilities.job_alert_delivery = opts.delivery;
  const wpOf = () => (seam.extractSnapshot(ctx).stores.alertWatchState || {})[A.PROFILE_KEY(user)] || null;
  const say = (turn) => seam.runTurn(turn, ctx);
  return { user, ctx, wpOf, say };
}
const NO_INTERNAL = /not wired in this handler|saved in this conversation only/i;
const BANNER = /I did not catch what to do|I'm Trainee, a career agent/i;

// ---------- (a) create: delivery-verb shapes create a watch ----------
test("create: 'text me the minute a <role> opens up' creates the watch, target in the user's words", () => {
  const { say, wpOf } = convo();
  const r = say("text me the minute a ux research role opens up");
  assert.equal(r.intent, "career_watch_create", r.reply);
  assert.equal(r.resultStatus, "prepared", r.reply);
  const wp = wpOf();
  assert.ok(wp && wp.interests.length === 1, "one watch saved");
  assert.match(wp.interests[0].role.title, /ux research/i, JSON.stringify(wp.interests[0].role));
  assert.ok(wp.interests[0].role.terms.some((x) => /ux|research/.test(x)), "terms carry the user's words");
});

test("create: out-of-taxonomy stack word creates a watch carrying the user's own words", () => {
  const { say, wpOf } = convo();
  const r = say("heads up when somebody posts a golang backend role");
  assert.equal(r.intent, "career_watch_create", r.reply);
  const wp = wpOf();
  assert.ok(wp && wp.interests.length === 1, "one watch saved");
  assert.match(wp.interests[0].role.title, /golang/i, JSON.stringify(wp.interests[0].role));
  assert.doesNotMatch(r.reply, /not one the watch can save/i, r.reply);
});

test("create: 'ping me about accounting openings' creates (no taxonomy refusal)", () => {
  const { say, wpOf } = convo();
  const r = say("ping me about accounting openings");
  assert.equal(r.intent, "career_watch_create", r.reply);
  const wp = wpOf();
  assert.ok(wp && wp.interests.length === 1, "one watch saved");
  assert.match(wp.interests[0].role.title, /accounting/i, JSON.stringify(wp.interests[0].role));
});

test("create: sector word creates a watch whose target is the user's word, not an invented occupation", () => {
  const { say, wpOf } = convo();
  const r = say("notify me about finance roles");
  assert.equal(r.intent, "career_watch_create", r.reply);
  const wp = wpOf();
  assert.ok(wp && wp.interests.length === 1, "one watch saved");
  assert.match(wp.interests[0].role.title, /finance/i, JSON.stringify(wp.interests[0].role));
  assert.ok(wp.interests[0].role.terms.some((x) => /finance/.test(x)), "terms carry the stated word");
});

test("create wins over goal capture: a want-to-know alert ask is a watch, never a stored goal", () => {
  const { say, wpOf } = convo();
  const r = say("i want to hear about nursing openings the moment one goes up");
  assert.equal(r.intent, "career_watch_create", r.reply);
  assert.ok(wpOf() && wpOf().interests.length === 1, "the watch is what got saved");
});

test("create wins over the disclosure reading only when the recipient is the user", () => {
  const mine = convo();
  const r1 = mine.say("text me about new data analyst internships");
  assert.equal(r1.intent, "career_watch_create", r1.reply);
  assert.ok(mine.wpOf() && mine.wpOf().interests.length === 1);
  const boss = convo();
  const r2 = boss.say("text my boss about the new data analyst internships");
  assert.notEqual(r2.intent, "career_watch_create", r2.reply);
  assert.ok(!boss.wpOf(), "no watch may be created by a boss-directed text ask");
});

// ---------- (e) create reply truthfulness from the delivery flag ----------
test("create reply, flag OFF (default): saved, no delivery promise, no handler-internal wording", () => {
  const { say } = convo();
  const r = say("watch for data analyst roles in Chicago");
  assert.equal(r.intent, "career_watch_create", r.reply);
  assert.match(r.reply, /Watch set: Data Analyst/, r.reply);
  assert.match(r.reply, /saved/i, r.reply);
  assert.doesNotMatch(r.reply, NO_INTERNAL, r.reply);
  assert.doesNotMatch(r.reply, /I will text you matches/, r.reply);
  assert.match(r.reply, /delivery isn't on yet|delivery is not on yet|isn't turned on/i, r.reply);
});

test("create reply, flag ON: saved, and only then 'I will text you matches'", () => {
  const { say } = convo({ delivery: { live: true } });
  const r = say("watch for data analyst roles in Chicago");
  assert.equal(r.intent, "career_watch_create", r.reply);
  assert.match(r.reply, /I will text you matches/, r.reply);
  assert.doesNotMatch(r.reply, NO_INTERNAL, r.reply);
  assert.doesNotMatch(r.reply, /delivery isn't on yet/i, r.reply);
});

// ---------- (b) change ops on a standing watch ----------
test("change: add a city lands on the watch's filters and reads back", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("throw boston in too");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  const wp = wpOf();
  assert.deepEqual(wp.interests[0].filters.locations.slice().sort(), ["Boston", "Chicago"], JSON.stringify(wp.interests[0].filters));
  assert.match(r.reply, /Boston/, r.reply);
});

test("change: remote only clears the location list and keeps remote on", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("make it remote only");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  const f = wpOf().interests[0].filters;
  assert.deepEqual(f.locations, [], JSON.stringify(f));
  assert.equal(f.remote_ok, true);
  assert.match(r.reply, /remote/i, r.reply);
});

test("change: entry level only sets the entry bands and reads back in human words", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("entry-level roles only from here");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  const bands = wpOf().interests[0].filters.bands;
  assert.ok(bands.includes("intern") && bands.includes("new_grad"), JSON.stringify(bands));
  assert.doesNotMatch(r.reply, /new_grad/, r.reply);
  assert.match(r.reply, /entry|intern|new grad/i, r.reply);
});

test("change: restrict to named firms sets firms_include in the user's words", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("only roles at ferrow and talbot from now on");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  const firms = wpOf().interests[0].filters.firms_include;
  assert.equal(firms.length, 2, JSON.stringify(firms));
  assert.ok(firms.some((x) => /ferrow/i.test(x)) && firms.some((x) => /talbot/i.test(x)), JSON.stringify(firms));
  assert.match(r.reply, /Ferrow/, r.reply);
});

test("change: daily summary time is unsupported — said plainly, nothing changes", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const before = JSON.stringify(wpOf().interests);
  const r = say("move my daily summary to 6 in the morning");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.doesNotMatch(r.reply, BANNER, r.reply);
  assert.match(r.reply, /can't|can not|not.*yet|no setting/i, r.reply);
  assert.match(r.reply, /summary|digest|roundup/i, r.reply);
  assert.equal(JSON.stringify(wpOf().interests), before, "no state change behind an unsupported ask");
});

test("change: remove one of several watches removes exactly that one", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  say("watch for software engineering roles");
  const r = say("drop the software engineering watch");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  const wp = wpOf();
  assert.equal(wp.interests.length, 1, JSON.stringify(wp.interests.map((i) => i.role.title)));
  assert.equal(wp.interests[0].role.title, "Data Analyst");
});

test("change: the per-day cap still sets through the alert path", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("no more than 3 alerts a day");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.equal(wpOf().alert_cap_per_day, 3);
});

// ---------- (c) list + history from the actual record ----------
test("list: 'what are you keeping an eye on for me' reads the standing watches", () => {
  const { say } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("what are you keeping an eye on for me");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.match(r.reply, /Data Analyst/, r.reply);
  assert.doesNotMatch(r.reply, BANNER, r.reply);
});

test("count: 'how many alerts am i set up for' answers from the record, not the cap alone", () => {
  const { say } = convo();
  say("watch for data analyst roles in Chicago");
  say("watch for software engineering roles");
  const r = say("how many alerts am i set up for");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.match(r.reply, /\b2\b/, r.reply);
  assert.match(r.reply, /watch/i, r.reply);
});

test("history: nothing sent today is said plainly when the record is empty and delivery is off", () => {
  const { say } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("what did you send me today");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.doesNotMatch(r.reply, BANNER, r.reply);
  assert.match(r.reply, /haven't sent|have not sent|nothing (was )?sent|no alerts (were )?sent/i, r.reply);
  assert.doesNotMatch(r.reply, NO_INTERNAL, r.reply);
});

test("history: a recorded match today is named, and queued is never called sent", () => {
  const { ctx, user, say } = convo();
  say("watch for data analyst roles in Chicago");
  const store = ctx.alertWatchState;
  store[A.HISTORY_KEY(user)] = { "Acme|Data Analyst Intern|Chicago, IL": { job_ids: ["job-1"], reminded_at: "2026-10-24T09:15:00.000Z" } };
  store[A.QUEUE_KEY(user)] = [{ reminder_id: "r-1", title: "Data Analyst Intern", company: "Acme", status: "queued", queued_at: "2026-10-24T09:15:00.000Z" }];
  const r = say("what did you send me today");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.match(r.reply, /Acme/, r.reply);
  assert.match(r.reply, /queued/i, r.reply);
  assert.doesNotMatch(r.reply, /I (sent|texted) you/, r.reply);
});

// ---------- (d) pause / resume / stop against the real state ----------
test("pause: a timed pause pauses, and says plainly it cannot lift itself on a timer", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("pause everything alert-wise for a week");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.equal(wpOf().opt_out.global, true, "the pause itself is applied");
  assert.match(r.reply, /stays paused until|until you (say|tell me)|can't.*timer|can not.*timer|no auto/i, r.reply);
  assert.doesNotMatch(r.reply, NO_INTERNAL, r.reply);
});

test("stop: bare 'ok stop' inside an alert conversation stops the alerts", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("ok stop");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.equal(wpOf().opt_out.global, true);
});

test("stop: 'no more alerts please' stops the alerts", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("no more alerts please");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.equal(wpOf().opt_out.global, true);
});

test("stop: 'delete my alert' with one watch removes that watch", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("delete my alert");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.equal(wpOf().interests.length, 0, "the one alert is gone");
});

test("stop: 'delete my alert' with several watches asks which — removes nothing", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  say("watch for software engineering roles");
  const r = say("delete my alert");
  assert.equal(r.intent, "career_watch_manage", r.reply);
  assert.equal(wpOf().interests.length, 2, "nothing removed behind an ambiguous delete");
  assert.match(r.reply, /which/i, r.reply);
});

test("resume: state answers reflect the record — stopped reads stopped, on reads on", () => {
  const { say, wpOf } = convo();
  say("watch for data analyst roles in Chicago");
  say("stop all alerts");
  assert.equal(wpOf().opt_out.global, true);
  const r1 = say("turn them back on");
  assert.equal(r1.intent, "career_watch_manage", r1.reply);
  assert.equal(wpOf().opt_out.global, false, "the stop is lifted");
  const r2 = say("turn them back on");
  assert.equal(r2.intent, "career_watch_manage", r2.reply);
  assert.match(r2.reply, /aren't paused|already on|not paused/i, r2.reply);
  assert.equal(wpOf().opt_out.global, false);
});

// ---------- stand-downs: the alert path never eats other families ----------
test("stand-down: a tracker assertion with a watch standing is not alert business", () => {
  const { say } = convo();
  say("watch for data analyst roles in Chicago");
  const r = say("i applied to acme yesterday");
  assert.ok(!/^career_watch/.test(r.intent || ""), r.intent);
});

test("stand-down: an ordinary greeting is not alert business", () => {
  const { say } = convo();
  const r = say("hi there");
  assert.ok(!/^career_watch/.test(r.intent || ""), r.intent);
});
