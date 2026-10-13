"use strict";
// SC-020 Revoked grant detected — health check sees the dead grant; dependent work pauses with ONE
// calm message; unrelated answers still work (profile recall runs while gmail/calendar are paused).
const { H, A, O, fixtureProfile } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-020", "revoked-grant-detected");
  s.user("(user revokes Google access in Google settings, then asks for a shortlist)");
  s.user("send me today's shortlist");
  // Host health check after revocation: the career grant record now reports expired (dead grant).
  const plan = A.healthPlan({
    health: [{ source: "google_career", status: "expired", checked_at: "2026-10-12T17:00:00.000Z" }],
    tasks: [
      { id: "build-shortlist", title: "Build today's shortlist from the inbox/feeds", needs: ["gmail"] },
      { id: "check-calendar", title: "Check calendar for interview slots", needs: ["calendar"] },
    ],
    secureLinkFor: (src) => `https://secure.example/connect/${src}`,
  });
  s.tool("CareerAccess.healthPlan(grant revoked)", plan);
  for (const m of plan.reauth) s.agent(m.text);
  s.user("what's my graduation date?");
  const recall = O.answerFromProfile(fixtureProfile(), "what's my graduation date?");
  s.tool("CareerOnboarding.answerFromProfile(while grant dead)", recall);
  s.agent(recall.answer);
  const ok = plan.paused.map((p) => p.id).join(",") === "build-shortlist,check-calendar" && plan.running.length === 0
    && plan.messages.length === 1 && /I never see your password/.test(plan.messages[0])
    && recall.found === true && /2028-05/.test(recall.answer);
  s.verify("health state: the dead grant paused both dependent tasks with exactly one calm re-auth message, while the unrelated profile question still answered from stored state (2028-05)", { ok, paused: plan.paused.map((p) => p.id), messages: plan.messages.length, recall_found: recall.found });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "The revoked Google grant was detected by the health check: the shortlist + calendar work paused with one calm re-auth message (secure link, no password ask), and an unrelated question — graduation date — still answered from the stored profile." }
    : { status: "LEARN", outcome: "Revoked-grant handling failed: dependent work not paused, spam, or unrelated answers blocked.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix healthPlan in 120 / answerFromProfile in 130 and rerun SC-020." });
})().catch((e) => { console.error(e); process.exit(1); });
