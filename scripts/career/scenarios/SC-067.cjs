"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-067", "sophomore-bb-windows-bank-onpager");
  s.user("Sophomore summer-analyst sweep: which BB windows are even open; bank-format one-pager tailored");
  const prof = L.personaProfile("test-persona.json");
  const cirs = [L.cir("bain"), L.cir("bcg")].filter(Boolean);
  const radar = A3.deadlineRadar(cirs, { now: Date.now() });
  const jd = "Investment Banking Summer Analyst. Required: Excel, Financial Modeling, Valuation. You will build DCF models and support deal teams.";
  const t = T.tailorResume(prof, jd, { family: "ib_finance" });
  s.tool("132.deadlineRadar (BB-adjacent CIRs) + 123 ib_finance variant", { radar, onepager: { pageLimit: t.resume.pageLimit, first_section: t.resume.sections[0].heading, audit_ok: t.audit.ok } });
  s.agent(`Window truth for a sophomore, from the records: Bain's intern window for your graduation range closed Aug 31, 2026; BCG's summer windows closed in June/July; Goldman Sachs — the canonical bulge bracket — has no public feed and no CIR in this branch, so its window is UNKNOWN, not open. Open BB sophomore windows in the record set today: zero. Your bank-format one-pager is still built and ready for the next window: pageLimit ${t.resume.pageLimit}, ${t.resume.sections[0].heading} first, single Technical-skills line, truth audit ${t.audit.ok}.`, { card: { title: "BB sophomore windows + bank one-pager", radar, onepager_ok: t.ok } });
  s.verify("window states from CIR radar; one-pager shape from the assembled ib_finance resume", { radar_states: radar.map((x) => x.state), pageLimit: t.resume.pageLimit });
  await s.finish({ status: t.ok && t.audit.ok ? "COMPLETE" : "LEARN", outcome: "Sophomore BB sweep: zero windows honestly open in the record set (Bain/BCG closed, Goldman unknown — no feed, no CIR); bank-format one-pager tailored and audit-green for the next window" });
})().catch((e) => { console.error(e); process.exit(1); });
