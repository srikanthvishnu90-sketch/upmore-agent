"use strict";
<<<<<<< HEAD
const { H, M, NOW, PROFILE, poolOverFirms, FIRM_SETS } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-059", "teachers-turned-product-people");
  const q = M.parseTarget("Find 100 teachers-turned-product people for a career switcher", PROFILE);
  const firms = FIRM_SETS.sets.faang_plus.firms.map((f) => f.name);
  const records = poolOverFirms(firms, 12, { per: (i) => ({ title: "Product Manager", prior_career: "teaching", personalization_facts: [{ fact: "taught high-school math for 4 years before moving into product (TEST fact)", source_url: "https://example.test/sw" + i, strength: "medium" }] }) });
  const pool = M.buildList(records, q, { profile: PROFILE, nowMs: NOW });
  s.user("Find 100 teachers-turned-product people for a career switcher");
  s.tool("124.parseTarget+buildList", { prior_career_filter: q.background_filters.prior_career, role_family: q.role_family, yield: pool.yield });
  s.agent(`Found ${pool.selected.length} teachers-turned-product people — the exact switch you're making, already done. Sample: ${pool.selected.slice(0, 5).map((c) => `${c.full_name} — ${c.title}, ${c.current_firm}`).join("; ")}.`);
  s.verify("selection read back: exactly 100, every person carries prior_career=teaching and a product title", { selected: pool.selected.length, trait_ok: pool.selected.every((c) => c.prior_career === "teaching"), product_ok: pool.selected.every((c) => /product/i.test(c.title)) });
  await s.finish({ status: "COMPLETE", outcome: `100 teachers-turned-product people selected and verified from buildList state (parser now captures the prior-career switcher filter)` });
=======
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
>>>>>>> origin/career/sc-f03
})();
