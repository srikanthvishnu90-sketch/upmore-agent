"use strict";
/* FAIL-FIRST REPRODUCTION — MUSE-F-005/F-006 classifier nuance (DISCO-QUALITY, 2026-10-21).
   Direct calls into the production classifier, packages/domain/121-career-jobs.js,
   exactly as measured by the throughput lane (2026-10-21): the ask/family text is
   passed as the title argument of seniorityBand(text, ""). No product code is edited.
   Expected = the band a user means. Exit 1 while any cell disagrees (the repro). */
const Jobs = require(process.env.F006_JOBS_SOURCE || "../../../packages/domain/121-career-jobs.js");

const FAMILIES = [
  ["SWE", "software engineering"],
  ["Data/ML", "data analyst"],
  ["Finance", "financial analyst"],
];
// [band phrase, expected band]
const BAND_PHRASES = [
  ["intern", "intern"],
  ["internship", "intern"],
  ["internships", "intern"],       // plural — the measured failure
  ["entry level", "new_grad"],     // control: space form binds today
  ["entry-level", "new_grad"],     // hyphen form
  ["early career", "new_grad"],    // control: singular binds today
  ["early careers", "new_grad"],   // plural — same failure class
];

let fail = 0, total = 0;
console.log("== ask-shaped: seniorityBand('<family> <phrase> roles', '') ==");
for (const [fam, famText] of FAMILIES) {
  for (const [phrase, want] of BAND_PHRASES) {
    const text = `${famText} ${phrase} roles`;
    const got = Jobs.seniorityBand(text, "");
    total++;
    const ok = got === want;
    if (!ok) fail++;
    console.log(`${ok ? "ok  " : "FAIL"} [${fam}] "${text}" -> band=${got} (want ${want})`);
  }
}
console.log("== title-shaped: seniorityBand('<Title>', '') ==");
const TITLES = [
  ["Software Engineering Intern", "intern"],
  ["Software Engineering Internship", "intern"],
  ["Software Engineering Internships", "intern"],   // aggregator-style plural title
  ["Data Analyst Internships", "intern"],
  ["Finance Internships, Summer 2027", "intern"],
  ["Entry-Level Software Engineer", "new_grad"],
  ["Early Careers — Data Analyst", "new_grad"],
];
for (const [title, want] of TITLES) {
  const got = Jobs.seniorityBand(title, "");
  total++;
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} "${title}" -> band=${got} (want ${want})`);
}
console.log("== jd-shaped: seniorityBand('Analyst', '<phrase> in JD head') ==");
for (const [phrase, want] of [["an intern", "intern"], ["internships", "intern"]]) {
  const jd = `We are hiring ${phrase} for the team. Responsibilities follow.`;
  const got = Jobs.seniorityBand("Analyst", jd);
  total++;
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "ok  " : "FAIL"} jd="${jd.slice(0, 40)}..." -> band=${got} (want ${want})`);
}
console.log(`\n${total - fail}/${total} cells bind as expected; ${fail} FAIL`);
process.exit(fail ? 1 : 0);
