"use strict";
const L = require("./_w02-lib.cjs"); const { H, M, USER } = L;
(async () => {
  const s = H.session("SC-036", "day6-followup-new-angle-threaded-nonresponders");
  s.user("Day-6 follow-up wave: new angle, threaded, only to non-responders");
  const supp = M.createSuppressionStore();
  const camp = M.createCampaign({ id: "TEST-CAMP-036", userId: "TEST-USER", approved: true });
  const people = L.gen(6, { tag: "036", count: 6, firms: ["Evercore", "Lazard", "Citi", "Baird", "Stifel", "Jefferies"], title: "Analyst", seniority: "analyst" });
  const sent = [];
  M.enqueue(camp, people.map((c) => ({ candidate: c, draft: M.draftAndGate(c, USER, {}).draft })), { suppression: supp });
  await M.sendPending(camp, { transport: L.testTransport(sent), suppression: supp });
  const responder = people[0]; // this one replied — must be excluded
  M.handleReply(camp, { body: "Happy to chat, Thursday works" }, responder, { suppression: supp });
  const noTap = M.runFollowUps(camp, { touch: 1, responders: [responder.person_id] });
  s.tool("CareerOutreach.runFollowUps without continue tap (must refuse)", noTap);
  const run = M.runFollowUps(camp, { touch: 1, continueTap: true, responders: [responder.person_id], suppression: supp });
  s.tool("CareerOutreach.runFollowUps day-6 (W02 extension)", { ok: run.ok, followups: run.followups.map((f) => ({ to: f.email, touch: f.touch, subject: f.draft.subject, threaded: f.draft.threaded })), excluded: run.excluded });
  const fu = run.followups;
  s.agent(`Day-6 follow-up wave built: ${fu.length} follow-ups queued — threaded (Re: your original subject), with a new angle (a specific project tied to their group), and only to non-responders. The one person who replied is excluded, as is anyone bounced or suppressed.`, { card: { title: "Day-6 follow-up wave", followups: fu.length, excluded: run.excluded, subjects: fu.map((f) => f.draft.subject) } });
  const ok = noTap.ok === false && run.ok && fu.length === 5 && fu.every((f) => f.touch === 1 && f.draft.threaded && f.draft.subject.startsWith("Re: ")) && !fu.some((f) => f.person_id === responder.person_id) && fu.every((f) => /different angle/i.test(f.draft.body));
  s.verify("queue state after runFollowUps: 5 touch-1 threaded follow-ups, responder absent, bodies carry the new angle; no-tap call refused first", { noTap, fu: fu.map((f) => ({ pid: f.person_id, touch: f.touch, subject: f.draft.subject })), excluded: run.excluded });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: `Day-6 wave: 5 threaded, new-angle follow-ups queued to non-responders only (1 responder excluded); the wave refused to run without the continue tap, then ran with it.` }
    : { status: "LEARN", outcome: "Follow-up wave did not verify.", reason: `noTap=${JSON.stringify(noTap)} run=${JSON.stringify(run).slice(0, 400)}`, unblock: "Fix runFollowUps responder/threading logic and rerun SC-036." });
})().catch((e) => { console.error(e); process.exit(1); });
