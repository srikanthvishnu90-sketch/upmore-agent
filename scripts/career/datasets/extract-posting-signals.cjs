"use strict";
/* Degree/major signal extraction from REAL posting text (SC-244, finisher lane C).
   Pure functions (exported for unit tests) + a CLI that reads a postings JSON file
   ([{company, title, jd_text}]) and emits per-company aggregate signals only.
   Signals are counted from the posting's own words — a posting counts once per signal
   family no matter how many times it repeats the phrase. */
const DEGREE_PATTERNS = [
  ["bachelor_required_or_preferred", /\bbachelor'?s\b/i],
  ["master_or_phd_mentioned", /\b(master'?s|m\.?s\.?|ph\.?d\.?|doctorate)\b/i],
  ["degree_generic", /\b(degree|degreed)\b/i],
  ["cs_or_related_field", /\b(computer science|related (technical )?field|related discipline|quantitative field|stem (field|degree|background))\b/i],
  // FIN-C-001: a named major counts ONLY with a requirement-context word within 120 chars —
  // company boilerplate ("future of finance", "finance teams") must never count as a requirement.
  ["specific_majors_named", null],
  ["no_degree_or_equivalent_experience", /\b(or equivalent (practical |work )?experience|equivalent experience|no degree required|degree not required)\b/i],
];
const MAJOR_RE = /\b(computer science|software engineering|electrical engineering|mathematics|statistics|economics|finance|data science)\b/gi;
const CONTEXT_RE = /\b(degree|field|major|education|background in|qualifications?|studying|pursuing|graduat)/i;
function majorsNamedInRequirementContext(t) {
  MAJOR_RE.lastIndex = 0;
  let m;
  while ((m = MAJOR_RE.exec(t))) {
    const window = t.slice(Math.max(0, m.index - 120), m.index + m[0].length + 120);
    if (CONTEXT_RE.test(window)) return true;
  }
  return false;
}
function signalsFor(text) {
  const t = String(text || "");
  const out = {};
  for (const [name, re] of DEGREE_PATTERNS) out[name] = name === "specific_majors_named" ? majorsNamedInRequirementContext(t) : re.test(t);
  out.any_degree_signal = Object.values(out).some(Boolean);
  return out;
}
function aggregatePostings(postings) {
  const byCompany = {};
  for (const p of postings || []) {
    const c = (byCompany[p.company] = byCompany[p.company] || { company: p.company, postings: 0, signals: {}, titles_sample: [] });
    c.postings++;
    const sig = signalsFor(`${p.title || ""}\n${p.jd_text || ""}`);
    for (const [k, v] of Object.entries(sig)) if (v) c.signals[k] = (c.signals[k] || 0) + 1;
    if (c.titles_sample.length < 3 && p.title) c.titles_sample.push(p.title);
  }
  const companies = Object.values(byCompany).sort((a, b) => b.postings - a.postings);
  const totals = { postings: companies.reduce((n, c) => n + c.postings, 0), companies: companies.length, signals: {} };
  for (const c of companies) for (const [k, v] of Object.entries(c.signals)) totals.signals[k] = (totals.signals[k] || 0) + v;
  return { totals, companies };
}
if (require.main === module) {
  const fs = require("fs");
  const input = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
  process.stdout.write(JSON.stringify(aggregatePostings(input.postings || input), null, 2) + "\n");
}
module.exports = { signalsFor, aggregatePostings, DEGREE_PATTERNS };
