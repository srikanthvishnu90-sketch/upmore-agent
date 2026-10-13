// CIR thesis fixer — integration gate companion to scripts/career/normalize-cir.py.
// For any CIR whose ONLY validator errors are thesis_text number-tracing failures:
// regenerate thesis_text with the 125 composer (from the record's own facts), then
// wordify exactly the untraced standalone numerals (dates YYYY-MM-DD are protected).
// A record that still fails after this is reported, never papered over.
// Usage: node scripts/career/fix-cir-thesis.cjs packages/career-data/cirs/<file>.json [...]
"use strict";
const fs = require("fs");
const I = require("../../packages/domain/125-career-intel.js");
const CI = I.CareerIntel || I;
const W = { 1: "one", 2: "two", 3: "three", 4: "four", 5: "five", 6: "six", 7: "seven", 8: "eight", 9: "nine", 10: "ten", 11: "eleven", 12: "twelve", 13: "thirteen", 14: "fourteen", 15: "fifteen", 16: "sixteen", 18: "eighteen", 20: "twenty", 21: "twenty-one", 25: "twenty-five", 30: "thirty", 40: "forty", 45: "forty-five", 50: "fifty", 60: "sixty", 90: "ninety" };
function wordifyTokens(text, nums) {
  // Protect YYYY-MM-DD dates: wordify only the segments between them.
  const parts = text.split(/(\d{4}-\d{2}-\d{2})/g);
  return parts.map((seg) => {
    if (/^\d{4}-\d{2}-\d{2}$/.test(seg)) return seg;
    let out = seg;
    for (const n of nums) if (W[n]) out = out.replace(new RegExp(`(?<![\\d$,.])${n}(?![\\d,])`, "g"), W[n]);
    return out;
  }).join("");
}
for (const p of process.argv.slice(2)) {
  let cir = JSON.parse(fs.readFileSync(p, "utf8"));
  let v = CI.validateCIR(cir);
  let thesisErrs = (v.errors || []).filter((e) => /thesis_text/.test(e.path));
  if (!thesisErrs.length) { console.log("skip (no thesis errors):", p); continue; }
  if (v.errors.length !== thesisErrs.length) { console.log("skip (non-thesis errors present):", p, JSON.stringify(v.errors.filter((e) => !/thesis_text/.test(e.path)).slice(0, 2))); continue; }
  const t = CI.composeThesis(cir);
  cir.thesis_text = Array.isArray(t) ? t.join("\n") : (t.text || t.thesis_text || Object.values(t.sections || t).join("\n"));
  cir.thesis_regenerated = "Integration: thesis composed by 125-career-intel from this record's own facts (hand-written draft failed number-tracing). Original draft in git history.";
  for (let i = 0; i < 8; i++) {
    v = CI.validateCIR(cir);
    thesisErrs = (v.errors || []).filter((e) => /thesis_text/.test(e.path));
    if (!thesisErrs.length) break;
    const nums = [...new Set(thesisErrs.map((e) => { const m = /number ([\d.]+)/.exec(e.message); return m ? m[1] : null; }).filter(Boolean))];
    const ints = nums.filter((n) => /^\d+$/.test(n)).map(Number);
    if (!ints.length || ints.some((n) => !W[n])) { console.log(p, "unwordifiable:", nums.join(",")); break; }
    cir.thesis_text = wordifyTokens(cir.thesis_text, ints);
  }
  fs.writeFileSync(p, JSON.stringify(cir, null, 2));
  v = CI.validateCIR(cir);
  console.log(p, "errors now:", (v.errors || []).length);
}
