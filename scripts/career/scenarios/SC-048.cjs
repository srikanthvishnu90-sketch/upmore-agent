"use strict";
<<<<<<< HEAD
const { H, M, NOW, USER, PROFILE, poolOverFirms, FIRM_SETS, mockTransport } = require("./w03-common.cjs");
(async () => {
  const s = H.session("SC-048", "reserve-pool-bounce-backfill");
  const allFirms = [].concat(FIRM_SETS.sets.bulge_bracket.firms.filter((f) => f.status !== "historical"), FIRM_SETS.sets.elite_boutique.firms, FIRM_SETS.sets.middle_market.firms, FIRM_SETS.sets.mega_fund_pe.firms, FIRM_SETS.sets.big4.firms, FIRM_SETS.sets.mbb.firms, FIRM_SETS.sets.quant.firms, FIRM_SETS.sets.faang_plus.firms).map((f) => f.name);
  const firms = [...new Set(allFirms)].slice(0, 54);
  const records = poolOverFirms(firms, 10, { per: (i) => ({ personalization_facts: [{ fact: "spoke at a campus finance panel (TEST fact)", source_url: "https://example.test/p" + i, strength: "medium" }] }) });
  const q = M.parseTarget("Find 500 bankers for a campaign", PROFILE);
  const pool = M.buildList(records, Object.assign({}, q, { count: 500 }), { profile: PROFILE, nowMs: NOW });
  s.user("Build 500 for the campaign — and keep a reserve pool behind them");
  s.tool("124.buildList", pool.yield);
  s.agent(`Built: ${pool.selected.length} selected + ${pool.reserve.length} in reserve.`);
  const supp = M.createSuppressionStore();
  const camp = M.createCampaign({ id: "w03-camp-reserve", userId: "w03-user", approved: true });
  M.enqueue(camp, pool.selected.slice(0, 12).map((c) => ({ candidate: c, draft: { subject: "s", body: "b", tier: "B" } })), { suppression: supp });
  await M.sendPending(camp, { transport: mockTransport(), suppression: supp });
  const bouncedItems = camp.items.slice(0, 3);
  for (const it of bouncedItems) M.recordOutcome(camp, { type: "bounce", item: it, suppression: supp });
  const bouncedIds = new Set(bouncedItems.map((i) => i.person_id));
  pool.selected = pool.selected.filter((c) => !bouncedIds.has(c.person_id));
  const bf = M.backfillFromReserve(pool, camp, { count: 3, suppression: supp, user: USER });
  s.tool("124.backfillFromReserve after 3 bounces", bf);
  s.agent(`3 sends bounced — those people are suppressed and never retried. The reserve pool backfilled automatically: ${bf.promoted.map((p) => `${p.name} (${p.firm})`).join(", ")} promoted and queued. Active list is back to ${bf.selected_count}; reserve now ${bf.reserve_count}.`);
  s.verify("backfill read back from pool + campaign state: selected restored to 500, reserve 40->37, promoted are queued in the campaign and none is a bounced/suppressed person", { selected: bf.selected_count, reserve: bf.reserve_count, enqueued: bf.enqueued, promoted_suppressed: bf.promoted.filter((p) => supp.isSuppressed({ email: p.email }, "w03-user")).length });
  await s.finish({ status: "COMPLETE", outcome: `${pool.yield.selected} selected + ${pool.yield.reserve} reserve built; after 3 bounces the reserve backfilled automatically (${bf.promoted.length} promoted + ${bf.enqueued} queued, selected back to ${bf.selected_count}, reserve ${bf.reserve_count}), bounced people suppressed and never retried` });
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-048", "doorstep-greenhouse");
  s.user("apply for me (Greenhouse posting)");
  const postings = await L.feed("greenhouse", "figma");
  const posting = postings.find((p) => /engineer/i.test(p.title)) || postings[0];
  const t = L.Tailor.tailorResume(L.persona(), posting.jd_text, { jobId: posting.job_id, company: "Figma" });
  s.tool("121-career-jobs greenhouse feed + 123 tailor (doorstep prep)", { posting: { title: posting.title, url: posting.url, job_id: posting.job_id }, tailorOk: t.ok, resumeVersion: t.version && t.version.versionId, fieldMapNote: "Greenhouse apply forms live on boards.greenhouse.io / the employer's careers page; there is NO public Greenhouse test/demo board. Field map of a live form cannot be captured without the parent's live browser task." });
  s.agent(`Your tailored resume for ${posting.title} at Figma is ready (version ${t.version ? t.version.versionId : "n/a"}, audit passed). The last step — filling the Greenhouse form to its final review screen — has to happen on the live board, and Greenhouse runs no public test/demo board I can fill safely. I have NOT submitted anything, and I won't submit a fake application to a real employer. The parent agent's browser task can do the doorstep fill on the real posting with you watching, stopping before Submit.`);
  s.verify("tailor prep is real (audit state), and NO submission was made or claimed", { tailorOk: t.ok, submitted: false });
  await s.finish({ status: "LEARN", outcome: "Tailored resume ready for the real Figma Greenhouse posting; doorstep fill not performed — no Greenhouse test/demo board exists.", reason: "live doorstep fill on the real board needs the parent's browser task", unblock: "Parent runs a browser task on the posting URL (see messages.json tool record), fills to the final review step with the TEST persona only if the user approves a test fill, screenshots, and stops before Submit." });
>>>>>>> origin/career/sc-f03
})();
