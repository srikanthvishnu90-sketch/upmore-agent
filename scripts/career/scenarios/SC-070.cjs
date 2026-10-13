"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-070", "three-resume-variants-one-profile");
  s.user("Three resume variants (backend / full-stack / infra) built from one master profile");
  const p = L.persona();
  const jds = {
    backend: "Backend Software Engineer Intern. Required: Python, PostgreSQL, SQL, REST, GraphQL, Git. Build APIs and data pipelines.",
    fullstack: "Full-Stack Software Engineer Intern. Required: JavaScript, TypeScript, React, Node.js, REST. Ship web product end to end.",
    infra: "Infrastructure Software Engineer Intern. Required: Go, Kubernetes, Docker, AWS, Linux, CI/CD. Build deployment platforms.",
  };
  const out = {};
  for (const [name, jd] of Object.entries(jds)) { const r = L.Tailor.tailorResume(p, jd, { family: "swe" }); out[name] = { ok: r.ok, audit: r.audit, skillsLine: r.ok ? (r.resume.lines.find((l) => l.type === "skills") || {}).text : null, selectedFactIds: r.ok ? r.resume.selectedFactIds : [], version: r.ok ? r.version.versionId : null }; }
  s.tool("123-career-tailor three variants from one profile", out);
  s.agent(`Three variants from the same master profile — each leads with different evidenced work:\n\n• Backend (${out.backend.version}): skills — ${out.backend.skillsLine}\n• Full-stack (${out.fullstack.version}): skills — ${out.fullstack.skillsLine}\n• Infra (${out.infra.version}): skills — ${out.infra.skillsLine}\n\nSame facts, three rankings: selection is by JD relevance/recency/impact, and every variant passed the truth audit.`, { card: { type: "variants", title: "Backend / full-stack / infra", variants: out } });
  const distinct = new Set([out.backend.skillsLine, out.fullstack.skillsLine, out.infra.skillsLine]).size >= 2 && JSON.stringify(out.backend.selectedFactIds) !== JSON.stringify(out.infra.selectedFactIds);
  const ok = Object.values(out).every((v) => v.ok && v.audit.ok) && distinct;
  s.verify("all three variants audit-pass from the ONE profile; skills lines / selected fact sets genuinely differ by family (no hand-edited copies)", { distinct, ok });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "Backend, full-stack and infra variants built from one master profile, each audit-clean and genuinely re-ranked.", reason: ok ? null : "variants failed audit or did not differ", unblock: ok ? null : "Fix assemble/selectFacts in 123." });
})();
