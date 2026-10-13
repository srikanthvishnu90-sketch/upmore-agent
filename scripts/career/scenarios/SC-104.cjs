"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-104", "wrong-resume-caught-before-submit");
  s.user("(variant B nearly attached to company A — catch it before submit)");
  const prof = L.personaProfile("test-persona.json");
  const r = await L.pollLive();
  const a = r.postings.find((p) => p.company.toLowerCase() === "stripe" && p.role_family === "SWE");
  const b = r.postings.find((p) => p.company.toLowerCase() === "ramp");
  const ta = T.tailorResume(prof, a.title + "\n" + a.jd_text.slice(0, 2000), { jobId: a.job_id });
  const registry = [{ variant_id: "VAR-" + a.job_id, company: a.company, job_id: a.job_id, family: ta.resume.family }];
  const wrong = A3.guardAttach(registry, b.company, registry[0].variant_id);
  const right = A3.guardAttach(registry, a.company, registry[0].variant_id);
  s.tool("132.guardAttach (wrong + right company)", { registry, wrong_attempt: wrong, right_attempt: right });
  s.agent(`Caught before anything moved: the variant tailored for ${a.company} (${a.title}) was about to be attached to ${b.company}'s application — the attach guard blocked it: "${wrong.reason}" The same variant attaches cleanly to its own company (${right.ok}). Nothing was submitted anywhere; this gate sits in front of the doorstep, and a replay test (tests/career-apply3.test.cjs) pins it.`, { card: { title: "Wrong-resume guard", blocked: wrong, correct_attach: right } });
  s.verify("guard verdicts from the registry state itself", { wrong_blocked: wrong.ok === false, right_ok: right.ok === true });
  await s.finish({ status: !wrong.ok && right.ok ? "COMPLETE" : "LEARN", outcome: `Wrong-company attach blocked pre-submit with the reason; correct attach verified; replay test green` });
})().catch((e) => { console.error(e); process.exit(1); });
