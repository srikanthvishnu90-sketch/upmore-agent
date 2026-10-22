"use strict";
// BUG-277 / FR-432 (alert delivery lane, 2026-10-22) — a detected alert
// died between 151's gate and 152's queue, silently.
//
// Live signature (scheduler cycle log, test user): cycles at
// 2026-10-19T13:00Z, 2026-10-20T11:00Z, 2026-10-21T01:15Z and
// 2026-10-22T04:00Z each recorded alerts=1 with reminders_queued=0 and
// delivered=0, status "ok", no error anywhere — while the outbox
// (public.career_reminder_outbox) held only the two reminders that ever
// delivered. Mechanism (reproduced below against the REAL host cycle):
// 152's locationOk treated "the interest names no locations" as a
// location RESTRICTION whenever remote_ok was true — the fallthrough
// returned ok only for `locations empty && remote_ok === false`. The
// standard chat-created interest (142: locations from the ask, empty
// when the ask names no place; remote_ok true unless the ask refuses
// remote) therefore rejected EVERY on-site posting at the location
// gate, whatever its title/band/firm match — e.g. an interest for
// "Operations Analyst, Fulfillment" with no filters at all rejected
// the exact-title posting in Chicago with the single reason
// 'location Chicago, IL is outside this interest's locations
// (none + remote)'. 151 had already fired the alert on that interest's
// own terms (the host's occupations bridge), so the alert existed,
// was counted, and vanished: runAssignCycle's no-match path records
// nothing but per-interest rejections the host never surfaced.
//
// Fix: locationOk — an interest with no location list has no location
// gate (on-site and remote both in scope), except that remote_ok:false
// still refuses a REMOTE posting. Interests WITH a location list are
// unchanged (city match, or remote when remote_ok). The host cycle
// result now also carries assign.rejected, so a future gate divergence
// is visible in the cycle record instead of vanishing.
//
// Disposable throughout: the repo's in-memory PostgREST/RPC fakes and a
// temp delivered-log file stand in for the product inbox (the test
// sink). Nothing live, nothing sent.
// Check: node --test tests/career-alert-delivery-enqueue.test.cjs
const { test, before } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { pathToFileURL } = require("node:url");

const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const A = D("152-career-assign.js");
const rpcFake = require("./helpers/career-alerts-rpc-fake.cjs");
const hostP = import(pathToFileURL(path.join(root, "scripts/career/alerts-host.mjs")).href);
let H;
before(async () => { H = await hostP; });

const BLOCKERS = ["senior", "sr.", "lead", "head of", "director", "vp", "vice president", "manager", "principal", "chief", "staff"];
const T0 = Date.parse("2026-10-22T15:00:00.000Z"); // 10:00 at tz -300 (daytime)
const HOUR = 3600 * 1000;

function makeFakePostgrest() {
  const rows = new Map();
  const from = () => ({
    select: () => {
      const filters = []; let limitN = null;
      const run = () => {
        let out = [...rows.values()].filter((r) => filters.every(([k, v]) => r[k] === v));
        if (limitN != null) out = out.slice(0, limitN);
        return { data: out, error: null };
      };
      const b = { eq(k, v) { filters.push([k, v]); return b; }, limit(n) { limitN = n; return b; },
        async maybeSingle() { const r = run(); return { data: r.data.length ? r.data[0] : null, error: null }; },
        then(res, rej) { return Promise.resolve().then(run).then(res, rej); } };
      return b;
    },
    upsert: async (row) => { rows.set(`${row.user_id}|${row.key}`, { ...row }); return { data: null, error: null }; },
  });
  return { rows, from, rpc: rpcFake(rows, true) };
}

// The standard chat-created interest shape (142): no location named in
// the ask -> locations [], remote_ok true, no firm list, no band list.
function watchProfile(userId, filterOverrides = {}) {
  return {
    type: "career_watch_profile", user_id: userId, version: 1,
    opt_out: { global: false, companies: [] },
    scoring_profile: { level: "student", degree: "CS + Finance, graduating 2028", skills: [], summary: "", experience_years: 0,
      constraints: { locations: [], needs_sponsorship: false, work_authorization: "" },
      preferences: { roles: [], locations: [], role_families: [], starred_companies: [], excluded_companies: [] } },
    interests: [{
      interest_id: "int-operations-analyst-fulfillment",
      role: { title: "Operations Analyst, Fulfillment", soc: "13-1111", split: null, derived: false,
        terms: ["operations analyst, fulfillment"], blockers: BLOCKERS },
      filters: Object.assign({ bands: [], locations: [], remote_ok: true, firms_include: [], firms_exclude: [] }, filterOverrides),
    }],
  };
}

const ghJob = (id, title, postedMs, locationName, content) => ({
  id, title, location: { name: locationName },
  absolute_url: `https://boards.greenhouse.io/acmecorp/jobs/${id}`,
  first_published: new Date(postedMs).toISOString(),
  requisition_id: `REQ-${id}`, departments: [{ name: "Operations" }], content,
});
const OPS_JOB = ghJob(201, "Operations Analyst, Fulfillment", T0 + HOUR, "Chicago, IL",
  "&lt;p&gt;Operations Analyst, Fulfillment — keep our fulfillment network running across the Midwest. Entry level role for a recent graduate.&lt;/p&gt;");

async function makeWorld(userId, filterOverrides) {
  const client = makeFakePostgrest();
  const store = H.createSupabaseStore({ client, userId });
  const wp = watchProfile(userId, filterOverrides);
  await store.set(A.PROFILE_KEY(userId), wp);
  const board = { name: "Acme Corp", jobs: [] };
  const fetchImpl = async () => ({ status: 200, json: async () => board });
  const logDir = fs.mkdtempSync(path.join(os.tmpdir(), "alert-delivery-"));
  const world = { client, store, wp, board,
    logPath: path.join(logDir, "delivered.jsonl"),
    feeds: [H.Jobs.feeds.greenhouse("acmecorp")],
    cycle: (now, extra = {}) => H.runUserAlertCycle(userId, { store, fetch: fetchImpl, feeds: world.feeds, now, deliveredLogPath: world.logPath, ...extra }) };
  return world;
}

test("BUG-277: a detected alert for a no-location-filter interest ENQUEUES and delivers to the test sink", async () => {
  const w = await makeWorld("user-bug277-e2e");
  const seed = await w.cycle(T0);
  assert.equal(seed.alerts, 0);
  assert.equal(seed.boards_seeded, 1);
  w.board.jobs = [OPS_JOB];
  const r = await w.cycle(T0 + 2 * HOUR);
  assert.equal(r.status, "ok", JSON.stringify(r.errors));
  assert.equal(r.alerts, 1, "151 must fire on the interest's own terms");
  assert.equal(r.reminders_queued, 1, "the detected alert must enter the reminder queue (pre-fix: 0 — the silent drop)");
  assert.equal(r.delivered.length, 1, "the queued reminder must be delivered to the sink");
  const lines = fs.readFileSync(w.logPath, "utf8").trim().split("\n").filter(Boolean);
  assert.equal(lines.length, 1, "the test sink (delivered log) holds exactly one record");
  const rec = JSON.parse(lines[0]);
  assert.equal(rec.type, "career_job_reminder_delivered");
  assert.equal(rec.title, "Operations Analyst, Fulfillment");
  const st = await w.store.delivery.status("user-bug277-e2e", r.delivered[0].reminder_id);
  assert.equal(st.status, "delivered", "the outbox row is acked delivered, not stranded");
  assert.deepEqual(await w.store.delivery.pending("user-bug277-e2e"), { reminders: [] }, "nothing left pending after delivery");
});

test("BUG-277: dedupe preserved — the same seat re-presented never re-reminds, a duplicate delivery is refused", async () => {
  const w = await makeWorld("user-bug277-dedupe");
  await w.cycle(T0);
  w.board.jobs = [OPS_JOB];
  const r = await w.cycle(T0 + 2 * HOUR);
  assert.equal(r.delivered.length, 1);
  const alert = r.alert_records[0];
  // The same alert record arriving again (a re-presented req): 152's
  // seat history, persisted by the first cycle's commit, suppresses it.
  const again = await A.runAssignCycle({ alerts: [alert], watchProfile: w.wp, store: w.store, now: T0 + 3 * HOUR,
    presentJobIds: new Set([alert.job_id]) });
  assert.equal(again.reminders.length, 0, "a re-presented seat must not enqueue twice");
  assert.ok(again.suppressed.some((x) => /already reminded/.test(x.reason)), JSON.stringify(again.suppressed));
  // And the delivery ledger refuses a second delivery of the same reminder.
  const dup = await H.deliverReminder({ reminder_id: r.delivered[0].reminder_id, user_id: "user-bug277-dedupe" }, { store: w.store, now: T0 + 4 * HOUR });
  assert.equal(dup.delivered, false);
  assert.equal(dup.duplicate, true);
});

test("BUG-277: fatigue preserved — quiet hours HOLD the enqueued reminder in the outbox; the morning cycle delivers it", async () => {
  const w = await makeWorld("user-bug277-fatigue");
  const seed = await w.cycle(Date.parse("2026-10-22T14:00:00.000Z"), { tzOffsetMinutes: -300 }); // 09:00 local
  assert.equal(seed.boards_seeded, 1);
  w.board.jobs = [OPS_JOB];
  const quiet = await w.cycle(Date.parse("2026-10-23T08:00:00.000Z"), { tzOffsetMinutes: -300 }); // 03:00 local — quiet
  assert.equal(quiet.alerts, 1);
  assert.equal(quiet.reminders_queued, 1, "the alert enqueues even when delivery is held");
  assert.equal(quiet.delivered.length, 0, "quiet hours deliver nothing");
  assert.equal(quiet.fatigue.held, 1, "the fatigue plan reports the hold");
  const pending = await w.store.delivery.pending("user-bug277-fatigue");
  assert.equal(pending.reminders.length, 1, "the held reminder waits in the outbox — held, not dropped");
  const morning = await w.cycle(Date.parse("2026-10-23T14:00:00.000Z"), { tzOffsetMinutes: -300 }); // 09:00 local
  assert.equal(morning.delivered.length, 1, "the held reminder delivers on the morning cycle");
});

test("BUG-277 controls: the gates that SHOULD bind still bind (matcher strictness unchanged)", async () => {
  const posting = (over = {}) => Object.assign({
    job_id: "greenhouse:acme:REQ-9", company: "Acme Corp", title: "Operations Analyst, Fulfillment",
    location: "Chicago, IL", remote: "onsite", url: "https://boards.greenhouse.io/acmecorp/jobs/9",
    posted_at: null, source: "greenhouse", seniority_band: "new_grad", role_family: "Operations",
    jd_text: "Operations Analyst, Fulfillment — entry level role.",
  }, over);
  const run = async (filters, p) => {
    const mem = H.createMemoryStore();
    const wp = watchProfile("user-bug277-controls", filters);
    return A.runAssignCycle({ postings: [p], watchProfile: wp, store: mem, now: T0 });
  };
  // An interest WITH a location list still rejects an out-of-list city.
  let r = await run({ locations: ["Chicago"] }, posting({ location: "New York, NY" }));
  assert.equal(r.reminders.length, 0);
  assert.ok(r.rejected.some((x) => /location/.test(x.reasons.join(" "))), JSON.stringify(r.rejected));
  // No location list + remote refused: a REMOTE posting is still refused.
  r = await run({ remote_ok: false }, posting({ location: "Remote", remote: "remote" }));
  assert.equal(r.reminders.length, 0, "remote_ok:false must still refuse a remote posting");
  // No location list + remote refused: an ON-SITE posting still matches (the pre-fix pass shape).
  r = await run({ remote_ok: false }, posting());
  assert.equal(r.reminders.length, 1, "the shape that passed pre-fix must keep passing");
  // A firm list still binds.
  r = await run({ firms_include: ["Other Co"] }, posting());
  assert.equal(r.reminders.length, 0);
  assert.ok(r.rejected.some((x) => /firm list/.test(x.reasons.join(" "))), JSON.stringify(r.rejected));
  // And the fixed shape itself, at the matcher level: no locations, remote_ok true, on-site.
  r = await run({}, posting());
  assert.equal(r.reminders.length, 1, "no location filter + on-site posting must match (the BUG-277 fix)");
});
