// Feature 6 (2026-10-25): lane sizing and coverage accounting for the hourly job index, in Node over the same plain-JS
// module the ingest function imports (supabase/functions/_shared/career_ingest_lanes.mjs). The committed lane plan
// (packages/career-data/ingest-lane-plan.json, from scripts/career/measure-ingest-lane.ts) is reproducible from its own
// measured inputs, is the fewest lanes that fit, reads every board within the hour in simulation, and the deploy packet's
// cron SQL is exactly what the plan says.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const L = () => import(path.join(root, "supabase/functions/_shared/career_ingest_lanes.mjs"));
const planFile = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/ingest-lane-plan.json"), "utf8"));
const boards = JSON.parse(fs.readFileSync(path.join(root, "supabase/functions/career-ingest/boards.json"), "utf8"));
const inputs = () => ({ boards, windowMin: 60, intervalMin: 5, measured: planFile.measured, assumed: planFile.assumed, concurrency: 8, limits: planFile.limits });

test("the lane plan is for the shipped directory and reproduces from its measured inputs", async () => {
  const { planLanes } = await L();
  assert.equal(planFile.directory_boards, boards.length, "stale plan: run deno run -A scripts/career/measure-ingest-lane.ts --write");
  const p = planLanes(inputs());
  assert.equal(p.ok, true);
  for (const k of ["lanes", "capacity_per_run", "cpu_ms_per_run", "wall_s_per_run", "posting_budget", "invocations_per_hour"]) assert.equal(p[k], planFile.plan[k], k);
  assert.equal(p.window_min, 60, "every board within the hour");
});

test("the plan is the fewest lanes that fit: one run fits the CPU budget, the deadline and the run cap; one lane fewer does not", async () => {
  const { planLanes } = await L();
  const p = planLanes(inputs());
  const at = p.tried.find((r) => r.lanes === p.lanes);
  assert.ok(at.fits_cpu && at.fits_wall && at.fits_capacity);
  assert.ok(p.cpu_ms_per_run <= planFile.limits.cpuMs * p.cpu_budget && p.wall_s_per_run <= planFile.limits.deadlineS && p.capacity_per_run <= 400);
  if (p.lanes > 1) { const below = p.tried.find((r) => r.lanes === p.lanes - 1); assert.ok(!(below.fits_cpu && below.fits_wall && below.fits_capacity), "one lane fewer also fits"); }
  // Lane loads: the heaviest lane, not the average, sizes the run (the 64 buckets are uneven).
  assert.equal(p.lane_loads.reduce((a, n) => a + n, 0), boards.length);
  assert.ok(Math.max(...p.lane_loads) > boards.length / p.lanes, "the buckets split unevenly");
});

test("sizing responds to cost: dearer reads need more lanes; with no body-hash savings the plan needs more than with them", async () => {
  const { planLanes } = await L();
  const base = planLanes(inputs());
  const dear = planLanes({ ...inputs(), measured: { ...planFile.measured, cpuMsPerBoardUnchanged: null } });
  assert.ok(!dear.ok || dear.lanes > base.lanes, `without the body hash: ${dear.lanes} lanes vs ${base.lanes}`);
  const cheap = planLanes({ ...inputs(), measured: { ...planFile.measured, cpuMsPerBoard: 1, cpuMsPerBoardUnchanged: 0.2 } });
  assert.ok(cheap.lanes < base.lanes);
  const none = planLanes({ ...inputs(), measured: { ...planFile.measured, cpuMsPerBoard: 5000, cpuMsPerBoardUnchanged: 5000 } });
  assert.equal(none.ok, false, "a cost no lane count can carry says so");
  assert.match(none.reason, /no lane count/);
});

test("simulated hours at the plan's lanes: every board read within 60 minutes when runs complete, and the recorded tails hold", async () => {
  const { simulateFreshness } = await L();
  const lanes = planFile.plan.lanes;
  const clean = simulateFreshness({ boards, lanes, windowMin: 60, intervalMin: 5, hours: 4, lose: 0, cut: 0 });
  assert.equal(clean.every_board_read, true);
  assert.ok(clean.worst_age_min <= 60, `oldest read ${clean.worst_age_min} min`);
  const some = simulateFreshness({ boards, lanes, windowMin: 60, intervalMin: 5, hours: 6, lose: 0.05, cut: 0.05, seed: 6 });
  assert.ok(some.worst_age_min <= 60, `5% lost, 5% cut: oldest read ${some.worst_age_min} min`);
  for (const r of planFile.simulated) assert.equal(simulateFreshness({ boards, lanes, windowMin: 60, intervalMin: 5, hours: r.hours, lose: r.lose, cut: r.cut, seed: 6 }).worst_age_min, r.worst_age_min, "the plan file's simulated tails");
  // Without headroom (capacity = an even share) the hour is missed: the headroom is what holds it.
  const tight = simulateFreshness({ boards, lanes, windowMin: 60, intervalMin: 5, hours: 4, lose: 0.05, cut: 0.05, headroom: 1, seed: 6 });
  assert.ok(tight.worst_age_min > 60, `no headroom still held: ${tight.worst_age_min}`);
});

test("coverage accounting: fresh is read successfully inside the window; per lane and for the directory", async () => {
  const { coverageOf, runReport, fraction, failureKind } = await L();
  const now = Date.parse("2026-10-26T12:00:00Z"), m = 60000;
  const states = [
    { bucket: 0, last_ok_at: new Date(now - 10 * m).toISOString() }, { bucket: 0, last_ok_at: new Date(now - 61 * m).toISOString() },
    { bucket: 1, last_ok_at: null }, { bucket: 2, last_ok_at: new Date(now - 60 * m).toISOString() },
  ];
  assert.deepEqual(coverageOf(states, now, 60), { fresh: 2, total: 4 });
  assert.deepEqual(coverageOf(states, now, 60, [0]), { fresh: 1, total: 2 });
  assert.equal(fraction(2140, 2179), "2,140/2,179");
  assert.equal(failureKind("HTTP 429"), "HTTP 429");
  assert.equal(failureKind("timed out after 15s"), "timed out");
  assert.equal(failureKind("not a workable board (unexpected body)"), "not the provider's feed shape");
  const r = runReport({ due: 2179, windowMin: 60, coverage: { directory: { fresh: 2140, total: 2179 } },
    stats: { attempted: 2179, boards_ok: 2140, boards_failed: 39, new: 9812, seen: 0, reopened: 0, closed: 0, failures: Array.from({ length: 39 }, (_, i) => ({ error: i < 30 ? "HTTP 404" : "timed out after 15s" })) } });
  assert.match(r.text, /boards read 2,179\/2,179 due; ok 2,140; failed 39 \(HTTP 404 x30, timed out x9\); postings new 9,812/);
  assert.match(r.text, /read within 60 min: directory 2,140\/2,179$/);
  assert.equal(r.directory_fresh_fraction, +(2140 / 2179).toFixed(4));
  assert.equal(r.lane_fresh_fraction, null, "no lane coverage given: none reported, never a guess");
});

test("the deploy packet: the cron SQL is generated from the plan, one job per lane, staggered, with the plan's lanes, window and budget", () => {
  const { scheduleSql, OUT } = require(path.join(root, "scripts/launch/build-ingest-schedule.cjs"));
  const sql = fs.readFileSync(OUT, "utf8");
  assert.equal(sql, scheduleSql(planFile), "stale: run node scripts/launch/build-ingest-schedule.cjs");
  const p = planFile.plan;
  assert.match(sql, new RegExp(`\\\\set lanes ${p.lanes}\\n`));
  assert.match(sql, /\\set window_min 60\n/);
  assert.match(sql, new RegExp(`\\\\set posting_budget ${p.posting_budget}\\n`));
  assert.ok(sql.includes("cron.schedule('trainee-career-ingest', '2-59/5 * * * *'"), "lane 0 keeps the job name the smoke check reads");
  assert.ok(sql.includes("'?lane=0&lanes=' || :lanes || '&window_min=' || :window_min || '&posting_budget=' || :posting_budget"));
  assert.ok(sql.includes("from generate_series(1, (:lanes)::int - 1) k"), "lanes 1..N-1");
  assert.ok(sql.includes("((2 + k) % 5) || '-59/5 * * * *'"), "staggered across the 5 minutes");
  assert.ok(sql.includes("jobname like 'trainee-career-ingest-lane-%'"), "re-running removes every earlier lane");
  assert.ok(!/[A-Za-z0-9]{32,}/.test(sql.replace(/trainee_career_ingest_secret|decrypted_secret/g, "")), "no secret value in the file");
  // The handler reads exactly the parameters the schedule sends.
  const handler = fs.readFileSync(path.join(root, "supabase/functions/career-ingest/handler.ts"), "utf8");
  for (const k of ["lane", "lanes", "window_min", "posting_budget"]) assert.ok(handler.includes(`q.get("${k}")`), `handler reads ${k}`);
});

test("go-live applies the run-log migration and checks its mark; the DB test runner applies it", () => {
  const live = fs.readFileSync(path.join(root, "scripts/launch/trainee-go-live.sh"), "utf8");
  assert.ok(live.includes("20261026060106_career_ingest_runs.sql") && live.includes("20261026060006_career_more_providers.sql"));
  assert.ok(live.includes("to_regclass('public.career_ingest_runs') is not null and exists (select 1 from pg_proc where proname = 'career_ingest_coverage')"));
  const run = fs.readFileSync(path.join(root, "tests/db/run.sh"), "utf8");
  assert.ok(run.includes("20261026060106_career_ingest_runs.sql"));
  assert.ok(fs.existsSync(path.join(root, "tests/db/career_ingest_runs.test.sql")));
});
