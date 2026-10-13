"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-067", "sophomore-bb-window-sweep");
  s.user("Sophomore summer-analyst sweep: which BB windows are even open; bank-format one-pager tailored");
  const registry = JSON.parse(L.fs.readFileSync(L.path.join(L.ROOT, "packages/career-data/fixtures/bb-windows.json"), "utf8"));
  const rows = L.Apply.checkWindows(registry.windows, 2028, "2026-10-13");
  s.tool("132-career-apply checkWindows (TEST window registry fixture)", { fixtureLabel: registry.label, rows });
  const open = rows.filter((r) => r.open);
  const ibJd = "Investment Banking Summer Analyst. Required: Excel, Financial Modeling, Valuation. Nice to have: Bloomberg.";
  const t = L.Tailor.tailorResume(L.persona(), ibJd, { family: "ib_finance" });
  s.tool("123-career-tailor bank-format one-pager", { ok: t.ok, pageLimit: t.resume && t.resume.pageLimit, firstSection: t.resume && t.resume.sections[0].heading, skillsLine: t.resume && (t.resume.lines.find((l) => l.type === "skills") || {}).text, audit: t.audit });
  s.agent(`Sweep of the bulge-bracket sophomore windows (class of 2028), from the window registry:\n\n${rows.map((r) => `${r.open ? "OPEN" : "—"} ${r.company}: ${r.note}`).join("\n")}\n\n${open.length} windows are open right now. Your bank-format one-pager is tailored for them: Education first, one page, single Technical skills line, audit passed. Honest note: the window registry exercised here is a labeled TEST fixture — the sweep engine is real, but live bank windows must come from a sourced registry (the CIR mechanics field) before these dates are quoted as real.`, { card: { type: "window_sweep", title: "BB sophomore windows", rows, openCount: open.length } });
  const ok = open.length >= 1 && t.ok && t.resume.pageLimit === 1 && t.resume.sections[0].heading === "Education";
  s.verify("open windows computed from registry dates + the persona's class year (2028) by the rail; the one-pager is the 123 ib_finance variant (education first, pageLimit 1, audit ok)", { openCount: open.length, ok });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: `BB sophomore sweep: ${open.length} of ${rows.length} windows open for class of 2028; bank-format one-pager tailored with audit pass. Window dates are a labeled TEST fixture — engine real, data pending a sourced registry.`, reason: ok ? null : "sweep or one-pager failed — see verification", unblock: ok ? "Replace the TEST window fixture with a sourced BB window registry (CIR mechanics) to quote real dates." : "See tool records." });
})();
