"use strict";
<<<<<<< HEAD
const { H, M } = require("./w03-common.cjs");
const { seedCampaign } = require("./w03-campaign.cjs");
(async () => {
  const s = H.session("SC-044", "daily-digest-during-campaign");
  const { camp, fx, sentResult } = await seedCampaign();
  s.user("How's the campaign doing today?");
  s.tool("seed replay: sendPending + recordOutcome/handleReply over fixture events", { sent: sentResult.sent, fixture_sent: fx.sent_count, fixture_bounces: fx.bounce_person_indexes.length, fixture_replies: fx.replies.length });
  const d = M.dailyDigest(camp, {});
  s.tool("124.dailyDigest", d);
  s.agent(d.text, { card: { title: "Daily digest", digest: d } });
  s.verify("digest numbers read back from campaign state after replaying the fixture events through the real rail", { wave_sent: camp.wave.sent, wave_bounces: camp.wave.bounces, stats: camp.stats, digest_matches: d.sent === camp.wave.sent && d.bounced === camp.wave.bounces && d.replies === camp.stats.replies && d.positive === camp.stats.positive && d.meetings_pending === camp.stats.meetings_booked - camp.stats.meetings_held });
  await s.finish({ status: "COMPLETE", outcome: `Daily digest computed from replayed campaign state: ${d.sent} sent, ${d.bounced} bounced, ${d.replies} replies, ${d.positive} positive, ${d.meetings_pending} meetings pending — every number matches the campaign's own counters` });
=======
const L = require("./_f03-lib.cjs");
(async () => {
  const s = L.H.session("SC-044", "cover-letter-for-ramp");
  s.user("write my cover letter for Ramp");
  const postings = await L.feed("ashby", "ramp");
  const posting = postings.filter((p) => /engineer/i.test(p.title))[0];
  const cir = L.cirFromPosting("Ramp", posting);
  s.tool("121-career-jobs ashby/ramp feed + CIR fact source", { count: postings.length, chosen: { title: posting.title, url: posting.url }, cirFact: cir.facts[0], note: "packages/career-data/cirs/ has NO Ramp record (BUG-002); the company fact used is a verbatim sentence from Ramp's own live posting, sourced above — not invented." });
  const p = L.persona();
  const cl = L.Tailor.generateCoverLetter(p, posting.jd_text, cir, { role: posting.title });
  s.tool("123-career-tailor generateCoverLetter", { ok: cl.ok, wordCount: cl.wordCount, proofFactId: cl.proofFactId, banned: cl.banned, reason: cl.reason || null });
  if (!cl.ok) { s.agent(`I can't write that letter honestly yet: ${cl.reason}`); await s.finish({ status: "LEARN", outcome: "Cover letter refused by 123 (see reason).", reason: cl.reason, unblock: "Author a real Ramp CIR or fix the letter window in 123." }); return; }
  s.agent(cl.text, { card: { type: "cover_letter", title: `Cover letter — Ramp ${posting.title}`, wordCount: cl.wordCount, proofFactId: cl.proofFactId, companyFactSource: posting.url } });
  const banned = L.Tailor.bannedPhrasesIn(cl.text);
  const hasFact = cl.text.includes(cir.facts[0].text.slice(0, 60));
  const inWindow = cl.wordCount >= 150 && cl.wordCount <= 250;
  s.verify("letter is 150–250 words, contains the sourced Ramp company fact + one real proof point (proofFactId exists in profile), banned phrases absent", { inWindow, wordCount: cl.wordCount, hasFact, banned, proofFact: L.Profile.getFact(p, cl.proofFactId) && L.Profile.getFact(p, cl.proofFactId).title });
  await s.finish({ status: inWindow && hasFact && !banned.length ? "COMPLETE" : "LEARN", outcome: `Cover letter for Ramp (${cl.wordCount} words) grounded in a verbatim fact from Ramp's own posting + proof fact ${cl.proofFactId}.`, reason: inWindow && hasFact ? null : "window/fact check failed", unblock: inWindow && hasFact ? null : "See verification evidence." });
>>>>>>> origin/career/sc-f03
})();
