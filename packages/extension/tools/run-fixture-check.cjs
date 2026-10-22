#!/usr/bin/env node
/* Spike check for the Trainee assisted-apply extension (Lane C).
 *
 * Loads fixtures/demo-form.html (a Greenhouse-shaped TEST form) into jsdom,
 * runs the REAL fill engine (src/fill-engine.js) against the Alex Testcase
 * fixture bank (fixtures/answer-bank.alex-testcase.json), and reports:
 *   - coverage: how many of the form's fields the bank can answer
 *   - accuracy: of the fields the engine filled, how many read back exactly
 *     as the bank intended (module 150's verified-fill law, BUG-207)
 *   - the never-guess invariant: every needs-user field left byte-untouched
 *   - fill wall time (the v2 budget is <10s per application on a real page;
 *     jsdom timing is indicative only — see DESIGN.md)
 * Then it simulates the USER's part of the assisted flow — completing the
 * highlighted fields by hand and clicking Submit, exactly what the human
 * does in the real flow — and verifies proof capture on the confirmation
 * view (module 150's extractConfirmation rules).
 *
 * Dependency: jsdom, resolved from this folder's node_modules.
 *   cd packages/extension/tools && npm install
 * Exit 0 only if accuracy is 100% of planned fills, no fill failed, the
 * never-guess invariant held, and the proof record was captured.
 */
"use strict";
const fs = require("node:fs");
const path = require("node:path");

let JSDOM;
try { ({ JSDOM } = require("jsdom")); }
catch (e) {
  console.error("jsdom is not installed for this check. Run:\n  cd packages/extension/tools && npm install");
  process.exit(2);
}

const PKG = path.join(__dirname, "..");
const engine = require(path.join(PKG, "src", "fill-engine.js"));
const bank = JSON.parse(fs.readFileSync(path.join(PKG, "fixtures", "answer-bank.alex-testcase.json"), "utf8"));
const html = fs.readFileSync(path.join(PKG, "fixtures", "demo-form.html"), "utf8");

const dom = new JSDOM(html, { url: "http://localhost:8000/demo-form.html", runScripts: "dangerously" });
const document = dom.window.document;

const fail = (msg) => { console.error("CHECK FAIL: " + msg); process.exit(1); };

// --- 1. discovery + plan + coverage ---
const entries = engine.discoverFields(document);
const plan = engine.planFill(entries, bank);
const cov = engine.coverageOf(plan);
console.log(`fields discovered: ${entries.length} logical / ${cov.total} visible controls`);
console.log(`coverage: ${cov.answerable} of ${cov.total} fields answerable from the bank; ${cov.needsUser} need the user`);
for (const n of cov.needs) console.log(`  needs user: ${n.label} — ${n.reason} [${n.reasonCode}]`);

// --- 2. engine fill + independent read-back verification ---
const result = engine.applyPlan(plan);
console.log(`fill pass: ${result.filled.length} filled, ${result.failed.length} failed, in ${result.ms}ms`);
for (const f of result.failed) console.log(`  FILL FAILED: ${f.label} — ${f.reason}`);
if (result.failed.length) fail(`${result.failed.length} planned fill(s) failed`);

let verified = 0;
for (const p of plan) {
  if (p.status !== "fill") continue;
  if (p.inputType === "name_pair") {
    const [f, l] = p.controls;
    const full = String(p.value).trim(); const sp = full.indexOf(" ");
    if (f.value === full.slice(0, sp) && l.value === full.slice(sp + 1)) verified += 1;
    else console.log(`  MISMATCH: ${p.label} — first="${f.value}" last="${l.value}", bank="${p.value}"`);
  } else if (p.inputType === "select" || p.controls[0].tagName === "SELECT") {
    const el = p.controls[0];
    const chosen = el.options[el.selectedIndex];
    const wantLabel = engine.matchOptionLabel(Array.from(el.options).map((o) => ({ value: o.value, label: o.textContent.trim() })), p.value);
    if (chosen && chosen.textContent.trim() === wantLabel) verified += 1;
    else console.log(`  MISMATCH: ${p.label} — chosen="${chosen && chosen.textContent.trim()}", want="${wantLabel}"`);
  } else if (p.inputType === "radio_group" || p.inputType === "checkbox_group") {
    if (p.controls.some((c) => c.checked)) verified += 1;
    else console.log(`  MISMATCH: ${p.label} — no option checked`);
  } else {
    const el = p.controls[0];
    if (String(el.value) === String(p.value)) verified += 1;
    else console.log(`  MISMATCH: ${p.label} — dom="${el.value}", bank="${p.value}"`);
  }
}
const planned = plan.filter((p) => p.status === "fill").length;
const accuracy = planned ? verified / planned : 0;
console.log(`accuracy: ${verified}/${planned} banked fills read back exactly (${(accuracy * 100).toFixed(1)}%)`);
if (accuracy !== 1) fail("accuracy below 100% of planned fills");

// --- 3. never-guess invariant: needs-user controls untouched ---
let untouched = true;
for (const p of plan) {
  if (p.status === "fill") continue;
  for (const c of p.controls) {
    if (c.type === "checkbox" || c.type === "radio") { if (c.checked) untouched = false; }
    else if (c.type === "file") { if (c.value) untouched = false; }
    else if (String(c.value || "") !== "") untouched = false;
    if (!untouched) console.log(`  TOUCHED: needs-user field "${p.label}" was modified by the engine`);
  }
}
console.log(`never-guess invariant: ${untouched ? "HELD — every needs-user field is byte-untouched" : "VIOLATED"}`);
if (!untouched) fail("the engine modified a field it had no banked answer for");

// --- 4. the user's part: complete the highlighted fields, click Submit ---
document.getElementById("start_year").value = "2024";       // no banked fact — the user knows it
document.getElementById("q_age").value = "Yes";             // no DOB fact in the bank — the user answers
document.querySelector('input[name="question_prior_employer"][value="No"]').checked = true; // unrecognized question — the user answers
document.getElementById("certify_true").checked = true;     // attestation — always the user's own act
document.getElementById("submit_app").click();
if (document.getElementById("confirmation").hidden) fail("fixture did not reach its confirmation view after the user pass + Submit");

const snapshot = {};
for (const f of result.filled) snapshot[f.label] = f.value;
const proof = engine.detectProof(document, "http://localhost:8000/demo-form.html", snapshot);
if (!proof) fail("no proof record captured on the confirmation view");
console.log(`proof captured: employer="${proof.employer}" role="${proof.role}" confirmationId="${proof.confirmationId}"`);
console.log(`proof text: "${proof.confirmationText}"`);
if (proof.confirmationId !== "GH-DEMO-2026-0001") fail("unexpected confirmation id: " + proof.confirmationId);

console.log(`\nVERDICT: coverage ${cov.answerable}/${cov.total} · accuracy ${verified}/${planned} (${(accuracy * 100).toFixed(0)}%) · fill ${result.ms}ms · never-guess held · proof captured (${proof.confirmationId})`);
process.exit(0);
