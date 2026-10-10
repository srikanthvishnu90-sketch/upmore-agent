#!/usr/bin/env node
// Parity matrix generator (Instinct spec doc 03). Generated, never hand-maintained.
//   node evals/parity/build-matrix.cjs             regenerate evals/parity/matrix.json and evals/parity/apps/*.md, print coverage per app
//   node evals/parity/build-matrix.cjs --check     fail if the matrix is stale, any row lacks a registry id or a non-parity reason, or coverage fell below the ratchet
// Rows: the catalog's outcomes (docs/competition/features.json, Codex: seeds plus discoveries; atomic children roll up to
// their parent). Columns: the 10 apps, marking which app has the outcome. Upmore column: the registry id and its recorded
// status (packages/capabilities/registry.json) from Claude's mapping (evals/parity/registry-map.json), or the non-parity
// reason. Investment-platform features stay in the matrix marked excluded, so the matrix is honest instead of padded.
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..", "..");
const here = __dirname;
const catalog = JSON.parse(fs.readFileSync(path.join(root, "docs/competition/features.json"), "utf8"));
const map = JSON.parse(fs.readFileSync(path.join(here, "registry-map.json"), "utf8")).rows;
const registry = JSON.parse(fs.readFileSync(path.join(root, "packages/capabilities/registry.json"), "utf8"));
const byId = new Map(registry.capabilities.map(c => [c.id, c]));
const APPS = catalog.cohort.map(c => ({ id: c.id, app: c.app }));
const PROVEN = ["TESTED", "VERIFIED"];

function build() {
  const outcomes = catalog.features.filter(f => f.record_type !== "atomic");
  const atomsByParent = {}; for (const f of catalog.features) if (f.record_type === "atomic" && f.parent_id) (atomsByParent[f.parent_id] = atomsByParent[f.parent_id] || []).push(f.id);
  const rows = [], problems = [];
  for (const o of outcomes) {
    const m = map[o.id];
    const cols = Object.fromEntries(APPS.map(a => [a.id, o.app_ids.includes(a.id) ? (o.competitor_presence && o.competitor_presence[a.id]) || "PRESENT" : ""]));
    let upmore;
    if (!m) { problems.push(`${o.id}: no entry in registry-map.json`); upmore = { kind: "unmapped" }; }
    else if (m.registry_id) { const c = byId.get(m.registry_id); if (!c) problems.push(`${o.id}: registry id ${m.registry_id} does not exist`); upmore = { kind: "mapped", registry_id: m.registry_id, status: c ? c.status : null, tier: c ? c.tier : null, owner_doc: c ? c.owner_doc : null, gate_reason: c ? c.gate_reason : null, confidence: m.confidence || null, note: m.note || null, performed: !!c && PROVEN.includes(c.status) }; }
    else if (m.non_parity && m.reason) upmore = { kind: "non_parity", non_parity: m.non_parity, reason: m.reason, performed: false };
    else { problems.push(`${o.id}: mapped with neither a registry id nor a non-parity reason`); upmore = { kind: "unmapped" }; }
    rows.push({ id: o.id, outcome: o.outcome, record_type: o.record_type, apps: cols, atomic_children: (atomsByParent[o.id] || []).length, upmore });
  }
  const per_app = {};
  for (const a of APPS) {
    const mine = rows.filter(r => r.apps[a.id]);
    const mapped = mine.filter(r => r.upmore.kind === "mapped").length, nonParity = mine.filter(r => r.upmore.kind === "non_parity").length, performed = mine.filter(r => r.upmore.performed).length, gated = mine.filter(r => r.upmore.kind === "mapped" && r.upmore.status === "GATED").length;
    per_app[a.id] = { app: a.app, outcomes: mine.length, mapped, non_parity: nonParity, accounted: mapped + nonParity, accounted_pct: mine.length ? +((mapped + nonParity) * 100 / mine.length).toFixed(1) : 100, performed, performed_pct: mine.length ? +(performed * 100 / mine.length).toFixed(1) : 0, gated };
  }
  const total = rows.length, accounted = rows.filter(r => r.upmore.kind !== "unmapped").length, performed = rows.filter(r => r.upmore.performed).length;
  return { schema_version: 1, generated_from: { catalog: "docs/competition/features.json", map: "evals/parity/registry-map.json", registry: "packages/capabilities/registry.json" },
    apps: APPS, rows, per_app, totals: { outcomes: total, accounted, accounted_pct: +(accounted * 100 / total).toFixed(1), performed, performed_pct: +(performed * 100 / total).toFixed(1), non_parity: rows.filter(r => r.upmore.kind === "non_parity").length, non_parity_kinds: rows.filter(r => r.upmore.kind === "non_parity").reduce((m, r) => (m[r.upmore.non_parity] = (m[r.upmore.non_parity] || 0) + 1, m), {}) },
    legend: { accounted: "mapped to a registry id, or a non-parity cell with its reason (hardware-bound, investment-platform, discontinued, out of scope)", performed: "the mapped capability's recorded status is TESTED or VERIFIED; accounted is the honesty bar, performed is the parity bar" }, problems };
}
function appsMarkdown(matrix) {
  const out = {};
  for (const a of matrix.apps) {
    const rows = matrix.rows.filter(r => r.apps[a.id]);
    const lines = [`# ${a.app}: parity checklist (${a.id})`, "", "Audit source for doc 03, generated from the catalog and the registry; edit docs/competition/features.json or evals/parity/registry-map.json, then regenerate.", "", `${rows.length} outcomes, ${matrix.per_app[a.id].accounted_pct}% accounted, ${matrix.per_app[a.id].performed_pct}% performed.`, "", "| Outcome | Upmore | Status | Note |", "| --- | --- | --- | --- |"];
    for (const r of rows) { const u = r.upmore; lines.push(`| ${r.id} ${r.outcome.replace(/\|/g, "/")} | ${u.kind === "mapped" ? u.registry_id : u.kind === "non_parity" ? "non-parity: " + u.non_parity : "UNMAPPED"} | ${u.kind === "mapped" ? u.status : "n/a"} | ${(u.kind === "mapped" ? (u.gate_reason || u.note || "") : u.reason || "").replace(/\|/g, "/")} |`); }
    out[`${a.app.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}.md`] = lines.join("\n") + "\n";
  }
  return out;
}
const matrixPath = path.join(here, "matrix.json"), ratchetPath = path.join(here, "coverage-ratchet.json");
function ratchetCheck(matrix) {
  if (!fs.existsSync(ratchetPath)) return { ok: true, decreased: [] };
  const prev = JSON.parse(fs.readFileSync(ratchetPath, "utf8")), decreased = [];
  for (const [app, p] of Object.entries(prev.per_app || {})) { const now = matrix.per_app[app]; if (!now) continue; if (now.accounted_pct < p.accounted_pct) decreased.push(`${app} accounted ${p.accounted_pct} -> ${now.accounted_pct}`); if (now.performed_pct < p.performed_pct) decreased.push(`${app} performed ${p.performed_pct} -> ${now.performed_pct}`); }
  if (matrix.totals.accounted_pct < (prev.totals || {}).accounted_pct) decreased.push(`total accounted ${prev.totals.accounted_pct} -> ${matrix.totals.accounted_pct}`);
  if (matrix.totals.performed_pct < (prev.totals || {}).performed_pct) decreased.push(`total performed ${prev.totals.performed_pct} -> ${matrix.totals.performed_pct}`);
  return { ok: decreased.length === 0, decreased };
}
function report(matrix) {
  const lines = ["app".padEnd(32) + "outcomes".padStart(9) + "accounted".padStart(11) + "performed".padStart(11) + "gated".padStart(7) + "non-parity".padStart(12)];
  for (const a of matrix.apps) { const p = matrix.per_app[a.id]; lines.push(a.app.padEnd(32) + String(p.outcomes).padStart(9) + `${p.accounted_pct}%`.padStart(11) + `${p.performed_pct}%`.padStart(11) + String(p.gated).padStart(7) + String(p.non_parity).padStart(12)); }
  lines.push("all".padEnd(32) + String(matrix.totals.outcomes).padStart(9) + `${matrix.totals.accounted_pct}%`.padStart(11) + `${matrix.totals.performed_pct}%`.padStart(11) + "" .padStart(7) + String(matrix.totals.non_parity).padStart(12));
  lines.push(`non-parity kinds: ${JSON.stringify(matrix.totals.non_parity_kinds)}`);
  return lines.join("\n");
}
if (require.main === module) {
  const check = process.argv.includes("--check");
  const matrix = build(), content = JSON.stringify(matrix, null, 1) + "\n", md = appsMarkdown(matrix), r = ratchetCheck(matrix);
  if (check) {
    const stale = !fs.existsSync(matrixPath) || fs.readFileSync(matrixPath, "utf8") !== content || Object.entries(md).some(([f, body]) => !fs.existsSync(path.join(here, "apps", f)) || fs.readFileSync(path.join(here, "apps", f), "utf8") !== body);
    if (stale) { console.error("Parity matrix is stale: run node evals/parity/build-matrix.cjs"); process.exit(1); }
    if (matrix.problems.length) { console.error("Parity problems:\n" + matrix.problems.join("\n")); process.exit(1); }
    if (!r.ok) { console.error("Coverage decreased:\n" + r.decreased.join("\n")); process.exit(1); }
    console.log(`Parity matrix verified: ${matrix.totals.outcomes} outcomes, ${matrix.totals.accounted_pct}% accounted, ${matrix.totals.performed_pct}% performed`); process.exit(0);
  }
  fs.writeFileSync(matrixPath, content); fs.mkdirSync(path.join(here, "apps"), { recursive: true }); for (const [f, body] of Object.entries(md)) fs.writeFileSync(path.join(here, "apps", f), body);
  if (r.ok) fs.writeFileSync(ratchetPath, JSON.stringify({ note: "coverage may never decrease; updated automatically when it rises", per_app: Object.fromEntries(Object.entries(matrix.per_app).map(([k, v]) => [k, { accounted_pct: v.accounted_pct, performed_pct: v.performed_pct }])), totals: { accounted_pct: matrix.totals.accounted_pct, performed_pct: matrix.totals.performed_pct } }, null, 1) + "\n");
  console.log(report(matrix));
  if (matrix.problems.length) { console.error("Parity problems:\n" + matrix.problems.join("\n")); process.exit(1); }
  if (!r.ok) { console.error("Coverage decreased:\n" + r.decreased.join("\n")); process.exit(1); }
}
module.exports = { build, appsMarkdown, ratchetCheck, report };
