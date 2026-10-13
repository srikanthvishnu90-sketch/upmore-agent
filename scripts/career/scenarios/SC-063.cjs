"use strict";
const L = require("./_w04-lib.cjs");
(async () => {
  const s = L.H.session("SC-063", "starred-48h-new-grad-swe-sweep");
  s.user("Apply to every new-grad SWE role posted in the last 48 hours at my starred companies");
  const postings = await L.feedMany(L.STARRED_FEEDS);
  const now = Date.parse("2026-10-13T05:00:00Z");
  const fresh = postings.filter((p) => p.posted_at && now - Date.parse(p.posted_at) <= 48 * 3600 * 1000 && now - Date.parse(p.posted_at) >= 0);
  const swe = fresh.filter((p) => /engineer|software/i.test(p.title) && /intern|new grad|early career/i.test(p.title + " " + p.jd_text.slice(0, 200)));
  s.tool("121-career-jobs starred feeds freshness sweep", { totalStarred: postings.length, within48h: fresh.length, freshNewGradSwe: swe.length, roles: swe.map((p) => ({ company: p.company, title: p.title, posted_at: p.posted_at })) });
  if (!swe.length) {
    s.agent(`I swept your starred companies (Stripe, Datadog, Ramp — ${postings.length} live postings). ${fresh.length} were posted/updated in the last 48 hours, but none of them is a new-grad SWE role right now. I applied to nothing rather than stretching the rule. The sweep re-runs on the next poll; the moment one appears, it lands on a card for you.`);
    s.verify("sweep counts come from the feeds' own posted_at fields, not memory", { totalStarred: postings.length, within48h: fresh.length, freshNewGradSwe: 0 });
    await s.finish({ status: "LEARN", outcome: "48h starred sweep ran: 0 new-grad SWE roles posted in the window, so nothing was applied — honestly reported, not stretched.", reason: "No new-grad SWE posting at Stripe/Datadog/Ramp carries a posted_at inside the 48h window at run time (feeds' own timestamps).", unblock: "Nothing owed by the user; the sweep matches the moment a starred company posts a new-grad SWE role inside a 48h window (poll cadence in 121: starred every 15 min)." });
    return;
  }
  const scoring = L.scoringProfile();
  const items = swe.map((post) => { const t = L.Tailor.tailorResume(L.persona(), post.jd_text, { jobId: post.job_id, company: post.company }); const f = L.Jobs.scoreFit(post, scoring); return { company: post.company, role: post.title, fit: f.excluded ? null : f.score, resumeVersion: t.ok ? t.version.versionId : null, posting: post }; });
  const log = L.Apply.createLog();
  const card = L.Apply.batchCard(items, { title: `48h starred sweep — ${items.length} new-grad SWE roles` });
  s.agent(`Found ${items.length} new-grad SWE roles posted in the last 48 hours at your starred companies — tailored and on one card:`, { card });
  s.user("yes, apply to all of them");
  const recs = items.map((i) => L.Apply.buildAuditRecord(log, { jobId: i.posting.job_id, company: i.company, role: i.role, url: i.posting.url, timestamp: "2026-10-13T09:45:00Z", resumeVersionId: i.resumeVersion, status: "submitted under user-approved batch card (TEST record)", channel: "batch-card" }));
  s.tool("132-career-apply records", recs.map((r) => r.applicationId));
  s.verify("every applied role's posted_at is inside the 48h window per the feed data; one record per role after the yes", { count: recs.length, windowOk: swe.every((p) => now - Date.parse(p.posted_at) <= 48 * 3600 * 1000) });
  await s.finish({ status: "COMPLETE", outcome: `48h starred sweep: ${items.length} fresh new-grad SWE roles tailored and applied under one card.`, reason: null, unblock: null });
})();
