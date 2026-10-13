"use strict";
// Canonical SC-076 = AI-ban outline (fresh run under canonical ID).
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-076", "ai-ban-outline-only");
  s.user("This company bans AI-written applications — help me apply anyway");
  const p = L.persona();
  const banCir = { company: "NoAi Bank (TEST)", aiPolicy: "ban", facts: [{ text: "NoAi Bank (TEST) states applications using AI-generated content will be disqualified (TEST fact)." }] };
  const jd = "Investment Banking Summer Analyst (TEST posting). Required: Excel, Financial Modeling, Valuation.";
  const r = L.Tailor.tailorResume(p, jd, { family: "ib_finance", cir: banCir, wantCoverLetter: true });
  const cl = L.Tailor.generateCoverLetter(p, jd, banCir, {});
  s.tool("123-career-tailor AI-ban branch", { mode: r.mode, coverLetter: r.coverLetter, rendered: r.rendered, directCoverCall: cl });
  s.agent(`I can help — but I won't write the paragraph. This company bans AI-written applications and disqualifies them, so here is your kit instead:\n\nOutline:\n${(r.outline ? r.outline.points : []).map((x, i) => `${i + 1}. ${x}`).join("\n")}\n\nThe bullets (each cited to a profile fact) are on the card. You write the paragraph in your own words; I'll fact-check your draft against your profile before you submit it.`, { card: { type: "ai_ban_outline", title: "Outline + bullets — you write it", outline: r.outline, bullets: r.bullets } });
  const ok = r.mode === "outline" && r.coverLetter === null && r.rendered === null && cl.text === null && (r.bullets || []).every((b) => b.factIds.length >= 1);
  s.verify("AI-ban branch state: outline mode, zero prose on either generation path, bullets all fact-cited", { ok });
  await s.finish({ status: ok ? "COMPLETE" : "LEARN", outcome: "AI-ban company: agent degraded to outline + fact-cited bullets; the user writes the paragraph (Doc 2 S8 / T-36).", reason: ok ? null : "prose leaked in ban mode", unblock: ok ? null : "Fix aiBan branch in 123." });
})();
