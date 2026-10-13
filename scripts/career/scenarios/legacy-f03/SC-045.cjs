"use strict";
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-045", "ai-ban-company-outline-only");
  s.user("apply to this company (its CIR/posting bans AI-written text)");
  const p = L.persona();
  // TEST CIR fixture — same shape as tests/career-tailor.test.cjs S8 case; the
  // ledger company is defined by its ban, so the fixture is the honest input.
  const banCir = { company: "NoAi Bank (TEST)", aiPolicy: "ban", facts: [{ text: "NoAi Bank (TEST) states applications using AI-generated content will be disqualified (TEST fact)." }] };
  const jd = "Investment Banking Summer Analyst (TEST posting). Required: Excel, Financial Modeling, Valuation.";
  const r = L.Tailor.tailorResume(p, jd, { family: "ib_finance", cir: banCir, wantCoverLetter: true });
  const cl = L.Tailor.generateCoverLetter(p, jd, banCir, {});
  s.tool("123-career-tailor tailorResume (AI-ban CIR)", { mode: r.mode, ok: r.ok, coverLetter: r.coverLetter, rendered: r.rendered, outlinePoints: r.outline && r.outline.points.length });
  s.tool("123-career-tailor generateCoverLetter (AI-ban CIR)", cl);
  s.agent(`This company bans AI-written application text, so I won't write the letter for you — that would get you disqualified. Here is an outline with the facts to write from:\n\n${(r.outline ? r.outline.points : []).map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nThe bullets on the card are cited to your profile facts. You write the paragraph in your own words; I'll check it for banned phrases and facts before you send it.`, { card: { type: "ai_ban_outline", title: "Outline only — NoAi Bank (TEST) bans AI-written text", outline: r.outline, bullets: r.bullets } });
  const degraded = r.mode === "outline" && r.coverLetter === null && r.rendered === null && cl.text === null && cl.mode === "outline";
  const bulletsCited = (r.bullets || []).every((b) => b.factIds && b.factIds.length >= 1);
  s.verify("mode=outline, no cover-letter prose generated anywhere (tailor + direct cover-letter call both null), bullets all fact-cited", { degraded, bulletsCited });
  await s.finish({ status: degraded && bulletsCited ? "COMPLETE" : "LEARN", outcome: "AI-ban company degraded to outline + fact-cited bullets; zero prose generated for submission (Doc 2 S8).", reason: degraded ? null : "prose leaked in ban mode", unblock: degraded ? null : "Fix aiBan branch in 123 tailorResume." });
})();
