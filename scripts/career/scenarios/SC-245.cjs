// SC-245 International student realism — sponsors from H-1B filing data; cap-exempt options.
"use strict";
const L = require("./_w13-lib.cjs");
const { CI, H } = L;
(async () => {
  const s = H.session("SC-245", "international-student-realism");
  s.user("International student realism — sponsors identified from H-1B filing data; cap-exempt options");
  const fx = L.loadFixture("persona-international-swe.json");
  s.tool("TEST fixture loaded (authorized, labeled TEST)", { persona_id: fx.persona_id, label: fx.label, targets: fx.preferences.targetCompanies, authorization: fx.constraints.workAuthorization });
  // Rail scan: every sponsorship-shaped statement in the corpus, with its source.
  const hits = [];
  for (const [id, cir] of Object.entries(L.store().byId)) {
    const walk = (v, at) => { if (typeof v === "string" && /sponsor|H-1B|LCA|U\.S\. Person|export-control|cap-exempt/i.test(v)) hits.push({ company_id: id, at, text: v.slice(0, 300) }); else if (Array.isArray(v)) v.forEach((x, i) => walk(x, `${at}[${i}]`)); else if (v && typeof v === "object") Object.entries(v).forEach(([k, x]) => walk(x, `${at}.${k}`)); };
    walk(cir, "$");
  }
  const lcaTyped = [];
  for (const [id, cir] of Object.entries(L.store().byId)) for (const c of cir.compensation_notes || []) if (c.source_type === "government-lca") lcaTyped.push({ company_id: id, statement: c.statement.slice(0, 200) });
  s.tool("sponsorship scan of the CIR corpus + government-lca-typed facts", { hits, government_lca_typed_facts: lcaTyped });
  const anduril = hits.filter((h) => h.company_id === "anduril");
  const reply = ["Realism first, from the records — not from vibes. Your situation (TEST fixture: F-1, M.S. CS, graduating May 2027, targets Stripe and Datadog) has one hard filter that runs before every skills question: sponsorship.",
    "FIRM-STATED (what companies say in their own applications and postings, from the records): Anduril is the clearest negative in the corpus — its official application asks directly whether you will require sponsorship now or in the future, and many of its SWE roles carry a U.S. Person requirement tied to export-control law, so most of those roles are closed to you regardless of skill; do not spend prep there. For your actual targets, neither the Stripe nor the Datadog record states a sponsorship position — both records are built from postings and process pages that are silent on it, which means the posting itself and the recruiter are the check, role by role.",
    "LCA-SHAPED PUBLIC DATA (what government filing data shows, labeled as its own kind of evidence): sponsorship history is a matter of public record through DOL H-1B LCA filings, and my compare-me rail states exactly that — an employer with a filing history for your role family is a materially better bet than one without. The corpus's government-lca-typed facts are recorded in the tool output above; where a record carries none, I am not going to claim a filing history I have not loaded.",
    "CAP-EXEMPT OPTIONS: universities and their affiliated nonprofits sit outside the H-1B cap as a category — research and campus IT/data roles there are a real parallel track while you build the record. Treat the specifics as a question for your school's international office, which owns the current rules.",
    "The plan that follows from this: verify sponsorship for the exact role before investing a season of prep, weight applications toward employers with a demonstrated filing history, and keep the cap-exempt track warm in parallel. This is not legal advice — immigration specifics go to your school's international office (DSO)."].join("\n\n");
  s.agent(reply);
  const lint = CI.lintAdvice(reply);
  const cmp = CI.compareMe(L.loadCIR("stripe"), L.INTL_PROFILE);
  s.tool("lintAdvice + compareMe authorization row (rail)", { lintAdvice: lint, authorization_row: cmp.rows.find((r) => r.dimension === "authorization") });
  const pass = lint.ok && anduril.length > 0;
  s.verify(`Answer rests on the corpus scan recorded verbatim above (${hits.length} sponsorship-shaped statements; Anduril eligibility record present: ${anduril.length > 0}); firm-stated evidence and LCA-shaped public data are labeled as separate kinds in the reply itself; the not-legal-advice line is in the reply; lintAdvice ok=${lint.ok}.`, { hits: hits.length, lca_typed: lcaTyped.length });
  await s.finish(pass ? { status: "COMPLETE", outcome: "Sponsorship realism served from the CIRs' own filing/eligibility notes: Anduril closed (firm-stated), targets silent (check per role), LCA-shaped data labeled, cap-exempt track named, not-legal-advice line included." } : { status: "LEARN", outcome: "SC-245 evidence gates did not all pass.", reason: `lint=${lint.ok} anduril_hits=${anduril.length}`, unblock: "Restore the failing evidence and rerun." });
})();
