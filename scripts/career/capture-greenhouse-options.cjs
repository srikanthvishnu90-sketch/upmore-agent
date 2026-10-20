#!/usr/bin/env node
"use strict";
// WO-042: the option lists behind the captured Greenhouse forms' dropdowns (react-select widgets). A capture keeps the
// page's markup but not its scripts, so a widget's options never appear offline; Greenhouse's public Job Board API
// (https://developers.greenhouse.io/job-board.html, no key) returns every question of a posting with its options, and
// its degree and discipline lists. This reads them for each captured Greenhouse form in tests/fixtures/forms-ci and
// writes tests/fixtures/forms-ci/greenhouse-options.json, which the local TEST world serves as each widget's option list.
// GET only, one request at a time, a second apart, a plain User-Agent; nothing else is sent anywhere.
//
//   node scripts/career/capture-greenhouse-options.cjs [out.json]
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.join(__dirname, "../..");
const FORMS = path.join(ROOT, "tests/fixtures/forms-ci");
const OUT = process.argv[2] || path.join(FORMS, "greenhouse-options.json");
const UA = process.env.UA || "UpmoreTrainee-form-options/1.0 (+https://github.com/srikanthvishnu90-sketch/upmore-agent)";
const API = "https://boards-api.greenhouse.io/v1/boards";
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(url) {
  await sleep(1000);
  const r = await fetch(url, { headers: { "user-agent": UA, accept: "application/json" }, redirect: "follow" });
  const text = await r.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch { /* not json */ }
  return { status: r.status, json };
}
const label = (v) => String(v?.label ?? v?.text ?? v?.name ?? "").replace(/\s+/g, " ").trim();

// Every select question of one posting: {field name: {label, multi, options: [labels]}}.
function selects(job) {
  const out = {};
  const take = (q, f) => {
    const vals = f.values || [];
    if (!/select/.test(String(f.type || "")) || !vals.length) return;
    out[f.name] = { label: label(q), multi: /multi_select/.test(f.type), options: vals.map(label).filter(Boolean) };
  };
  for (const q of [...(job.questions || []), ...(job.location_questions || [])]) for (const f of q.fields || []) take(q, f);
  for (const c of job.compliance || []) for (const q of c.questions || []) for (const f of q.fields || []) take(q, f);
  // Demographic questions: the form names each by its id.
  for (const q of job.demographic_questions?.questions || []) {
    const opts = (q.answer_options || []).map(label).filter(Boolean);
    if (opts.length) out[String(q.id)] = { label: label(q), multi: /multi/.test(String(q.type || "")), options: opts };
  }
  return out;
}

// A paged education list (degrees, disciplines): every item's text.
async function education(board, kind) {
  const items = [];
  for (let page = 1; page <= 20; page++) {
    const r = await get(`${API}/${encodeURIComponent(board)}/education/${kind}?page=${page}`);
    const got = r.json?.items || [];
    if (r.status !== 200 || !got.length) return { status: r.status, items: items.length ? items : null };
    items.push(...got.map(label).filter(Boolean));
    if (got.length < (r.json?.meta?.per_page || 100)) break;
  }
  return { status: 200, items };
}

async function main() {
  const manifest = JSON.parse(fs.readFileSync(path.join(FORMS, "manifest.json"), "utf8"));
  const forms = manifest.forms.filter((f) => f.family === "greenhouse" && f.status === "application");
  const out = { version: 1, source: `${API}/{board}/jobs/{id}?questions=true and ${API}/{board}/education/{degrees,disciplines}`, captured_at: new Date().toISOString(), forms: {}, education: {} };
  for (const f of forms) {
    const u = new URL(f.source_url), seg = u.pathname.split("/").filter(Boolean);
    const board = u.searchParams.get("for") || seg[0], id = (u.pathname.match(/\/jobs\/(\d+)/) || [])[1];
    const r = await get(`${API}/${encodeURIComponent(board)}/jobs/${id}?questions=true`);
    out.forms[f.id] = r.status === 200 && r.json ? { status: "live", board, job_id: id, title: r.json.title || null, education: r.json.education || null, selects: selects(r.json) } : { status: r.status === 404 ? "gone" : `http_${r.status}`, board, job_id: id };
    if (!out.education[board] && r.status === 200) {
      const degrees = await education(board, "degrees"), disciplines = await education(board, "disciplines");
      out.education[board] = { degrees: degrees.items, disciplines: disciplines.items, status: { degrees: degrees.status, disciplines: disciplines.status } };
    }
    console.log(`${f.id}: ${out.forms[f.id].status}${out.forms[f.id].selects ? `, ${Object.keys(out.forms[f.id].selects).length} selects` : ""}`);
  }
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1) + "\n");
  console.log(`wrote ${path.relative(ROOT, OUT)}`);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
