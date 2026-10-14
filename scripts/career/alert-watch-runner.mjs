// HOST TOOLING (not product chat code, no deploy): exercises the standing watch loop
// (packages/domain/151-career-alert-watch.js) end to end outside the edge host —
// real global fetch + a file-backed snapshot store + a recording sink that appends
// alert records to a JSONL file. This is the shape the deployed host's scheduler
// wraps: it calls ONE cycle per invocation; the cron/systemd timer (host-side, not
// built here) supplies the cadence from 121's POLL_MINUTES (starred 15 / default 60).
//
//   node scripts/career/alert-watch-runner.mjs [--once] [--snapshot <path>] [--alerts <path>]
//
// Defaults: snapshot ./alert-watch-snapshot.json, alerts ./alert-watch-alerts.jsonl
// (both in the CWD — point them somewhere durable on the host). Profile below is a
// MOCK demo profile in 121's scoreFit shape; the deployed host injects the user's
// real profile per user. Nothing is sent anywhere: the sink only records.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const W = require("../../packages/domain/151-career-alert-watch.js");
const J = require("../../packages/domain/121-career-jobs.js");

const args = process.argv.slice(2);
const opt = (name, dflt) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : dflt; };
const snapshotPath = path.resolve(opt("--snapshot", "alert-watch-snapshot.json"));
const alertsPath = path.resolve(opt("--alerts", "alert-watch-alerts.jsonl"));

// File-backed KV with 121's store contract: the whole snapshot map is one JSON file.
const store = {
  get: (k) => { try { const all = JSON.parse(fs.readFileSync(snapshotPath, "utf8")); return all[k] ?? null; } catch { return null; } },
  set: (k, v) => {
    let all = {}; try { all = JSON.parse(fs.readFileSync(snapshotPath, "utf8")); } catch { /* first run */ }
    all[k] = v; fs.writeFileSync(snapshotPath, JSON.stringify(all, null, 2));
  },
};
// Recording sink: one JSON alert record per line, appended. The deployed host swaps
// this for its delivery channel (chat/push) — that channel is NOT built here.
const sink = async (record) => { fs.appendFileSync(alertsPath, JSON.stringify(record) + "\n"); };

const DEMO_PROFILE = { // MOCK — host injects the real per-user profile
  skills: [{ name: "Python", proven: true, fact_id: "F-010" }, { name: "React", proven: true, fact_id: "F-011" }],
  degree: "B.S. Computer Science + Finance, class of 2029", level: "student", experience_years: 1,
  experience_text: "built Python data pipelines and a React dashboard for finance analysts",
  constraints: { work_authorization: "US citizen", needs_sponsorship: false, graduation_year: 2029, clearance: null, locations: ["New York", "Chicago"] },
  preferences: { role_families: ["Finance", "SWE"], locations: ["New York", "Chicago"], starred_companies: [] },
};

const result = await W.runWatchCycle({
  feeds: J.boardFeeds(),          // canonical live boards from 121's registry
  fetch: (url) => fetch(url, { headers: { accept: "application/json" } }),
  profile: DEMO_PROFILE,
  store,
  sink,
  now: Date.now(),
});
console.log(JSON.stringify(result, null, 2));
