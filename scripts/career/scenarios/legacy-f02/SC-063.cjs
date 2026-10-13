"use strict";
const L = require("./lib.cjs");
const { J, D, H, T, P, A3 } = L;
const fs = require("fs"); const path = require("path");

(async () => {
  const s = H.session("SC-063", "apply-new-grad-swe-48h-starred");
  s.user("Apply to every new-grad SWE role posted in the last 48 hours at my starred companies");
  const prof = L.profile("test-persona.json"); const profP = L.personaProfile("test-persona.json");
  const r = await L.pollLive();
  s.tool("121.poll (live)", { totals: L.feedTotals(r) });
  const now = Date.now();
  const starred = prof.preferences.starred_companies.map((x) => x.toLowerCase());
  const rows = r.postings.filter((p) => p.role_family === "SWE" && p.seniority_band === "new_grad" && starred.includes(p.company.toLowerCase()) && p.posted_at && (now - Date.parse(p.posted_at)) <= 48 * 3600000);
  const packets = rows.map((p) => { const t = T.tailorResume(profP, p.title + "\n" + p.jd_text.slice(0, 2000), { jobId: p.job_id }); return { posting: L.slim(p), audit_ok: t.audit ? t.audit.ok : false, fit: J.scoreFit(p, prof) }; });
  s.agent(`Pulled forward from the Apply block: in the last 48 hours, your starred companies posted ${rows.length} new-grad SWE roles that match the rule. ${packets.length ? packets.map((x) => `${x.posting.title} at ${x.posting.company} — packet built, audit ${x.audit_ok}, fit ${x.fit.excluded ? "excluded: " + x.fit.reasons[0] : x.fit.score}`).join(" | ") : "None — the honest count is zero for this window; I am not widening the window or the company set to manufacture work."} Packets stop at the doorstep for your yes; nothing is submitted as the TEST persona.`, { card: { title: "New-grad SWE @ starred, last 48h", packets } });
  s.verify("filter applied to live rows on family + band + starred membership + posted_at window", { matches: rows.length, packets: packets.length });
  await s.finish({ status: "COMPLETE", outcome: `48-hour starred new-grad SWE sweep: ${rows.length} matching live roles, ${packets.filter((x) => x.audit_ok).length} audited doorstep packets ready` });
})().catch((e) => { console.error(e); process.exit(1); });
