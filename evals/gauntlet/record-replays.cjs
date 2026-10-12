#!/usr/bin/env node
// Every live gauntlet failure becomes a permanent replay fixture (v3 standing instruction, 2026-10-11). run-live.cjs calls
// record() after every run inside the repo; a result file from the single-file build is recorded with
//   node evals/gauntlet/record-replays.cjs evals/gauntlet/results/<label>.<suite>.json [...]
// tests/edge/live-replays.test.ts replays each fixture: provider outages and planner wording against a dead provider,
// flow turns through the real router with the live test user's data. A fixture that still fails and is not triaged
// fails the suite, so a live failure is red until it is fixed or a person writes down why it is not the code's
// (precondition, not_built, grader). When the same item fails again for different reasons, its triage is cleared.
const fs = require("node:fs"), path = require("node:path"), crypto = require("node:crypto");
const FILE = path.join(__dirname, "replays", "live-failures.json");
const corpus = name => JSON.parse(fs.readFileSync(path.join(__dirname, name), "utf8"));

function classify(o) {
  if (o.error || o.failure_code === "model_unavailable") return "provider_outage";
  if (/couldn.t complete the requested financial plan/i.test(o.reply || "")) return "planner_wording";
  if (o.route && o.route.flow) return "flow";
  return "other";
}
// The failed turns of one result, each with the texts that came before it in the same thread.
function failures(result) {
  const out = [];
  if (result.suite === "spec16") {
    const items = new Map(corpus("spec16-20.json").items.map(i => [i.id, i]));
    const before = [];
    for (const r of result.rows || []) {
      if (r.status === "NOT RUN") continue;
      if (r.status === "FAIL") out.push({ suite: "spec16", id: r.id, text: r.text, media: r.media || (items.get(r.id) || {}).needs_media || null, context: before.slice(), checks: (items.get(r.id) || {}).checks || {}, observed: { reply: r.reply || null, route: r.route || null, error: r.error || (/handler error: (.*)/.exec((r.reasons || []).join(" ")) || [])[1] || null, failure_code: r.failure_code || null }, reasons: r.reasons || [] });
      before.push(r.text);
    }
  } else if (result.suite === "l3") {
    const cases = new Map(corpus("l3-adversarial.json").cases.map(c => [c.id, c]));
    for (const c of result.cases || []) {
      const before = [];
      (c.turns || []).forEach((t, i) => {
        if (t.reasons && t.reasons.length) out.push({ suite: "l3", id: `${c.id}#${i + 1}`, text: t.text, media: null, context: before.slice(), checks: t.checks || ((cases.get(c.id) || { turns: [] }).turns[i] || {}).checks || {}, observed: { reply: (t.replies || [])[0] || null, route: (t.routes || [])[0] || null, error: (t.errors || [])[0] || null, failure_code: null }, reasons: t.reasons });
        before.push(t.text);
      });
    }
  } else if (result.suite === "sloppy") {
    const items = new Map(corpus("sloppy-20.json").items.map(i => [i.id, i]));
    for (const r of result.rows || []) if (!r.pass) {
      const it = items.get(r.id) || {};
      out.push({ suite: "sloppy", id: r.id, text: r.text, media: null, context: [], checks: { flow: it.flow, outcome: "confirm", matches: (it.card_contains || []).map(s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")) }, observed: { reply: r.reply || null, route: r.route || null, error: (/handler error: (.*)/.exec((r.reasons || []).join(" ")) || [])[1] || null, failure_code: null }, reasons: r.reasons || [] });
    }
  }
  return out;
}
const keyOf = f => crypto.createHash("sha256").update(JSON.stringify([f.suite, f.id, f.text, f.context])).digest("hex").slice(0, 16).match(/.{4}/g).join("-"); // dashed so no key reads as an account number
function load(file = FILE) { return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, "utf8")) : { about: "Every live gauntlet failure, replayed by tests/edge/live-replays.test.ts. Written by evals/gauntlet/record-replays.cjs; a person only edits triage.", fixtures: [] }; }
function record(result, o = {}) {
  const file = o.file || FILE, db = load(file); let added = 0, seen = 0;
  for (const f of failures(result)) {
    const key = keyOf(f), kind = classify(f.observed), at = result.run_at || new Date().toISOString();
    const prior = db.fixtures.find(x => x.key === key);
    if (prior) {
      seen++;
      const changed = JSON.stringify(prior.reasons) !== JSON.stringify(f.reasons);
      Object.assign(prior, { observed: f.observed, reasons: f.reasons, kind, checks: f.checks, last_label: result.label, last_seen: at, times: (prior.times || 1) + 1 });
      if (changed && prior.triage) prior.triage = Object.assign({}, prior.triage, { stale: `reasons changed on ${result.label}; re-triage` });
    } else {
      added++;
      db.fixtures.push(Object.assign({ key, kind }, f, { label: result.label, first_seen: at, last_label: result.label, last_seen: at, times: 1, triage: null }));
    }
  }
  if (!o.dryRun) { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, JSON.stringify(db, null, 1) + "\n"); }
  return { added, seen, db };
}
module.exports = { record, failures, classify, FILE };
if (require.main === module) {
  const files = process.argv.slice(2);
  if (!files.length) { console.error("usage: node evals/gauntlet/record-replays.cjs <result.json> [...]"); process.exit(2); }
  for (const f of files) { const r = record(JSON.parse(fs.readFileSync(f, "utf8"))); console.log(`${f}: ${r.added} new, ${r.seen} seen again`); }
}
