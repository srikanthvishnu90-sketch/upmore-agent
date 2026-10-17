/* ITERATION LANE (2026-10-17) — tailoring pairing measurement,
   reconstructed. The Lane B / Lane C 1,000-pairing harness was run
   from lane session scratch and is not in any worktree (searched
   upmore-iterate, upmore-depth-b, upmore-depth-c, upmore-crewa);
   this script rebuilds the measurement from the same fixture
   ingredients those lanes used — the six gauntlet personas
   (packages/career-data/fixtures/gauntlet/profiles/*) crossed with
   every JD-bearing posting in the repo fixtures (the scored corpora's
   structured postings, rendered to JD text by the router's own
   synthesis rule, plus the public snapshots carrying full JD text) —
   and grades with the flag definitions documented in module 123's
   comments and tests/career-tailor-depth2.test.cjs:

   - coverage: must-have requirements + knockouts parsed from the JD
     that the tailored output covers (not listed as gaps), over all
     requirements, all pairings.
   - MISSING_REQUIREMENT: a must-have/knockout requirement that lands
     in the result's gap list. Sub-classed: EVIDENCED (the record
     carries the evidence — a mechanism lost it) vs ABSENT (no
     evidence anywhere in the record — an honest gap).
   - GENERIC_NOT_TAILORED: the cross-scenario identical-selection
     clause — a pairing whose output signature (selected fact ids +
     skills line) is identical to another pairing of the SAME persona
     against a DIFFERENT posting. Sub-classed by mechanism.
   - invention: immutability/name violations in the tailored output
     (a capitalized name attested by neither fact prose nor any
     skills[] list — the MI-023 line). Must stay 0.
   - law: 1 - invention / (invention + attested names checked),
     reported as the fraction of pairings with zero invention.

   Run: node scripts/career/iteration-tailor-measure.cjs [--json]
   Deterministic; TEST fixtures only. */
"use strict";
const fs = require("node:fs");
const path = require("node:path");
const ROOT = path.resolve(__dirname, "..", "..");
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const Tailor = D("123-career-tailor.js");
const CareerProfile = D("122-career-profile.js");

const lc = (v) => String(v == null ? "" : v).toLowerCase();
const FIX = path.join(ROOT, "packages/career-data/fixtures/gauntlet");

// --- personas: the six gauntlet profiles ---
const personas = [];
for (const dir of fs.readdirSync(path.join(FIX, "profiles")).sort()) {
  const p = path.join(FIX, "profiles", dir, "profile.json");
  if (!fs.existsSync(p)) continue;
  const data = JSON.parse(fs.readFileSync(p, "utf8"));
  personas.push({ id: dir, profile: CareerProfile.profileFromData(data) });
}

// --- postings: structured corpora (router synthesis) + snapshot JDs ---
function synthJd(cp) { // mirrors 142's jdTextForPosting synthesis
  const must = [], pref = [];
  for (const r of cp.requirements || []) (/plus|preferred|not required/i.test(r) ? pref : must).push(r);
  const parts = [`${cp.title} at ${cp.company}.`, `Location: ${cp.location || ""}.`];
  if (must.length) parts.push(`Requirements: ${must.join("; ")}.`);
  if (pref.length) parts.push(`Nice to have, not required: ${pref.join("; ")}.`);
  if (cp.salary) parts.push(`Salary: ${typeof cp.salary === "string" ? cp.salary : cp.salary.raw || ""}.`);
  return parts.join(" ");
}
const postings = [];
for (const f of ["scored-corpus.json", "scored-corpus-ext.json"]) {
  const j = JSON.parse(fs.readFileSync(path.join(FIX, "jobs", f), "utf8"));
  for (const cp of j.postings || []) postings.push({ id: cp.id || `${cp.company}-${cp.title}`, title: cp.title, company: cp.company, jd: synthJd(cp), structured: true });
}
const snapDir = path.join(FIX, "jobs", "public-snapshots");
for (const f of fs.readdirSync(snapDir).sort()) {
  if (!f.endsWith(".json")) continue;
  const j = JSON.parse(fs.readFileSync(path.join(snapDir, f), "utf8"));
  if ((j.descriptionPlain || "").length > 200) postings.push({ id: j.id || f, title: j.title || f, company: j.company || "", jd: j.descriptionPlain, structured: false });
}

function recordHaystack(profile) {
  const facts = CareerProfile.confirmedFacts(profile);
  return facts.map((f) => [f.title || "", f.text || "", ...(f.bullets || []), ...(f.skills || [])].join(" ")).join("\n");
}

const pairs = [];
const perPersonaSigs = new Map(); // personaId -> Map(sig -> [pairIdx])
for (const per of personas) {
  const hay = lc(recordHaystack(per.profile));
  const sigMap = new Map();
  for (const po of postings) {
    const jd = Tailor.parseJD(po.jd);
    const reqs = [...(jd.knockouts || []).map((k) => ({ name: k.requirement, hard: true })), ...(jd.mustHaveSkills || []).map((sk) => ({ name: sk, hard: false }))];
    const r = Tailor.tailorResume(per.profile, po.jd, {});
    const gapNames = new Set((r.gaps || []).map((g) => lc(g.requirement)));
    let covered = 0; const missing = [];
    for (const q of reqs) {
      const isGap = [...gapNames].some((g) => g && (lc(q.name).includes(g) || g.includes(lc(q.name))));
      if (isGap) {
        // evidenced? the requirement's content words appear in the record
        const words = lc(q.name).replace(/[^a-z0-9+# ]+/g, " ").split(/\s+/).filter((w) => w.length > 2 && !["the", "and", "for", "with", "valid", "active", "required", "must", "hold", "have", "has"].includes(w));
        const evidenced = words.length > 0 && words.every((w) => hay.includes(w));
        missing.push({ name: q.name, hard: q.hard, evidenced });
      } else covered += 1;
    }
    const lines = (r.resume && r.resume.lines) || [];
    const skillsLine = (lines.find((l) => l.type === "skills") || {}).text || "";
    const factIds = ((r.resume && r.resume.selectedFactIds) || []).slice().sort().join(",");
    const sig = `${factIds}|${skillsLine}`;
    const invViolations = (r.violations || []).filter((v) => /immutab|invent|name/i.test(String(v.rule || v.code || v.kind || JSON.stringify(v))));
    // Mechanism diagnostics: does an UNSELECTED pool fact evidence a
    // skill this posting names? (selection blindness) And is an
    // evidenced must-have skill absent from the skills line while the
    // line carries off-family skills? (line composition loss)
    const selected = new Set((r.resume && r.resume.selectedFactIds) || []);
    const mustLc = new Set((jd.mustHaveSkills || []).map(lc));
    const proven = Tailor.provenSkills(per.profile, jd);
    const blindFacts = [];
    for (const f of CareerProfile.confirmedFacts(per.profile)) {
      if (f.kind === "skill" || selected.has(f.id)) continue;
      const fsk = (f.skills || []).map(lc);
      const hit = fsk.filter((x) => mustLc.has(x));
      if (hit.length) blindFacts.push({ fact: f.id, skills: hit });
    }
    const lineLc = lc(skillsLine);
    const evidencedMustNotOnLine = (jd.mustHaveSkills || []).filter((sk) => { const row = proven.find((x) => lc(x.name) === lc(sk)); return row && row.proven && !lineLc.includes(lc(sk)); });
    const pair = { persona: per.id, posting: po.id, title: po.title, structured: po.structured, ok: r.ok, reqs: reqs.length, covered, missing, sig, invention: invViolations.length, violations: (r.violations || []).length, blindFacts, evidencedMustNotOnLine, family: (r.resume && r.resume.family) || "" };
    pairs.push(pair);
    if (!sigMap.has(sig)) sigMap.set(sig, []);
    sigMap.get(sig).push(pairs.length - 1);
  }
  perPersonaSigs.set(per.id, sigMap);
}
// GENERIC flags: a pair whose signature is shared with another posting
for (const pair of pairs) {
  const group = perPersonaSigs.get(pair.persona).get(pair.sig);
  pair.genericGroupSize = group.length;
  pair.generic = group.length > 1;
  // mechanism sub-class for generic pairs: how large is the persona's
  // whole record vs the selected set? (selection == full pool for
  // every posting -> structural; else posting-blind selection)
  pair.sigFactCount = pair.sig.split("|")[0].split(",").filter(Boolean).length;
  pair.poolFactCount = personas.find((x) => x.id === pair.persona).profile.facts.filter((f) => f.kind !== "skill").length;
}

const totalReqs = pairs.reduce((a, p) => a + p.reqs, 0);
const totalCovered = pairs.reduce((a, p) => a + p.covered, 0);
const missingAll = pairs.flatMap((p) => p.missing.map((m) => ({ ...m, persona: p.persona, posting: p.posting })));
const missingEvidenced = missingAll.filter((m) => m.evidenced);
const genericPairs = pairs.filter((p) => p.generic);
const inventionTotal = pairs.reduce((a, p) => a + p.invention, 0);
const pairsWithInvention = pairs.filter((p) => p.invention > 0).length;

const summary = {
  personas: personas.length, postings: postings.length, pairings: pairs.length,
  ran: pairs.filter((p) => p.ok !== undefined).length, errors: pairs.filter((p) => p.ok === false && p.violations === 0).length,
  requirements: totalReqs, covered: totalCovered,
  coverage: totalReqs ? Math.round((totalCovered / totalReqs) * 1000) / 1000 : null,
  missing_requirement: missingAll.length,
  missing_evidenced: missingEvidenced.length,
  missing_absent: missingAll.length - missingEvidenced.length,
  generic_not_tailored: genericPairs.length,
  generic_by_group: {},
  invention_instances: inventionTotal,
  law: pairs.length ? Math.round((1 - pairsWithInvention / pairs.length) * 1000) / 1000 : null,
};
for (const p of genericPairs) { const k = p.sigFactCount >= p.poolFactCount ? "whole-pool-selected" : "partial-selection-identical"; summary.generic_by_group[k] = (summary.generic_by_group[k] || 0) + 1; }

const blindPairs = pairs.filter((p) => p.blindFacts.length);
const lineLossPairs = pairs.filter((p) => p.evidencedMustNotOnLine.length);
summary.selection_blind_pairs = blindPairs.length;
summary.selection_blind_facts = blindPairs.reduce((a, p) => a + p.blindFacts.length, 0);
summary.line_loss_pairs = lineLossPairs.length;
summary.generic_selection_blind = genericPairs.filter((p) => p.blindFacts.length).length;
if (process.argv.includes("--diag")) {
  console.log(JSON.stringify(summary, null, 1));
  console.log("\nSELECTION-BLIND pairs (unselected fact evidences a named must-have):");
  for (const p of blindPairs.slice(0, 20)) console.log(`  ${p.persona} x ${p.posting} "${p.title}": ${JSON.stringify(p.blindFacts)}`);
  console.log("\nLINE-LOSS pairs (evidenced must-have absent from skills line):");
  for (const p of lineLossPairs.slice(0, 20)) console.log(`  ${p.persona} x ${p.posting} "${p.title}": ${JSON.stringify(p.evidencedMustNotOnLine)}`);
  process.exit(0);
}
if (process.argv.includes("--json")) {
  console.log(JSON.stringify({ summary, missingEvidenced: missingEvidenced.slice(0, 40), genericSample: genericPairs.slice(0, 10).map((p) => ({ persona: p.persona, posting: p.posting, title: p.title, group: p.genericGroupSize, sigFacts: p.sigFactCount })) }, null, 1));
} else {
  console.log(JSON.stringify(summary, null, 1));
  console.log("\nMISSING_REQUIREMENT with record evidence (mechanism-loss class):");
  for (const m of missingEvidenced.slice(0, 25)) console.log(`  ${m.persona} x ${m.posting}: "${m.name}" (hard=${m.hard})`);
  console.log("\nGENERIC sample:");
  for (const p of genericPairs.slice(0, 10)) console.log(`  ${p.persona} x ${p.posting} "${p.title}" group=${p.genericGroupSize} selectedFacts=${p.sigFactCount}`);
}
