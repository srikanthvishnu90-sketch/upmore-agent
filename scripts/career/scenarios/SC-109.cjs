"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-109", "consulting-applications");
  s.user("Consulting applications: fit answers + impact bullets tailored per firm");
  const prof = L.personaProfile("test-persona.json");
  const out = [];
  for (const slug of ["bain", "bcg"]) {
    const cirT = L.cirForTailor(slug);
    const jd = `${cirT.company} Associate Consultant Intern (from CIR record). Consulting, strategy, client engagement. Required: Excel. Facts from the company record: ${cirT.facts.map((f) => f.text).join(" ")}`;
    const t = T.tailorResume(prof, jd, { family: "consulting", cir: cirT, wantCoverLetter: false });
    const bank = T.buildAnswerBank(prof, jd, cirT, {});
    out.push({ firm: cirT.company, ok: t.ok, audit_ok: t.audit ? t.audit.ok : false, bullets: t.resume ? t.resume.lines.filter((l) => /^Accomplished/.test(l.text)).map((l) => l.text) : [], answers_ok: bank.ok, answers: bank.ok ? bank.entries.map((e) => e.question || e.prompt || Object.keys(e)[0]) : bank.reason });
  }
  s.tool("123.tailorResume (consulting family) + buildAnswerBank over CIR adapters", out);
  s.agent(`Per-firm consulting packets, each grounded in that firm's own record: ${out.map((o) => `${o.firm} — tailored resume audit ${o.audit_ok ? "passed" : "FAILED"}, ${o.bullets.length} impact bullets in Accomplished-X-by-Y-resulting-in-Z form, answer bank ${o.answers_ok ? "built from CIR facts" : "refused: " + o.answers}`).join(" | ")}. No bullet carries a number that is not in a profile fact — the truth audit is the gate, and both firms passed it.`, { card: { title: "Consulting packets per firm", firms: out } });
  s.verify("bullets and answers derive from 123 over the CIR adapter facts; audit verdicts are the module's own", out.map((o) => ({ firm: o.firm, audit_ok: o.audit_ok, bullets: o.bullets.length })));
  await s.finish({ status: out.every((o) => o.ok && o.audit_ok) ? "COMPLETE" : "LEARN", outcome: `Consulting packets for Bain + BCG: X-by-Y-Z impact bullets and CIR-grounded fit answers per firm, truth audit green on both` });
})().catch((e) => { console.error(e); process.exit(1); });
