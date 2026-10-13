"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-059", "resume-variant-finance");
  s.user("make me a finance version of my resume");
  const p = L.persona();
  const ibJd = "Investment Banking Summer Analyst (TEST posting). Required: Excel, Financial Modeling, Valuation. Nice to have: Bloomberg. You will build DCF models and support deal teams.";
  const r = L.Tailor.tailorResume(p, ibJd, { family: "ib_finance" });
  s.tool("123-career-tailor tailorResume (ib_finance variant)", { ok: r.ok, family: r.resume && r.resume.family, pageLimit: r.resume && r.resume.pageLimit, conventions: r.resume && r.resume.conventions, audit: r.audit });
  if (!r.ok) { await s.finish({ status: "LEARN", outcome: "Finance variant refused by audit.", reason: JSON.stringify(r.violations), unblock: "Fix 123." }); return; }
  s.agent(`Finance version ready. It follows the strict IB conventions: Education first, one page, and skills on a single "Technical skills:" line. Bloomberg is NOT on it — the JD lists it as a nice-to-have, but no profile fact evidences Bloomberg, so the truth audit excludes it.`, { card: { type: "resume_variant", title: "Finance (IB) resume variant", sections: r.resume.sections.map((x) => x.heading), skillsLine: (r.resume.lines.find((l) => l.type === "skills") || {}).text, pageLimit: r.resume.pageLimit } });
  const skills = r.resume.lines.find((l) => l.type === "skills");
  const checks = { educationFirst: r.resume.sections[0].heading === "Education", onePage: r.resume.pageLimit === 1, singleTechnicalLine: !!skills && /^Technical skills: /.test(skills.text) && r.resume.lines.filter((l) => l.type === "skills").length === 1, bloombergOut: !/Bloomberg/.test(r.rendered.text), auditOk: r.audit.ok };
  s.verify("IB conventions from the rail's own variant state: education first, pageLimit 1, exactly one 'Technical skills:' line, Bloomberg absent from the rendered text, audit passes", checks);
  const ok = Object.values(checks).every(Boolean);
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Finance resume variant: education-first one-pager, single Technical skills line, unevidenced Bloomberg excluded by the audit.", reason: ok ? null : "a convention check failed — see verification", unblock: ok ? null : "Fix FAMILIES.ib_finance in 123." });
})();
