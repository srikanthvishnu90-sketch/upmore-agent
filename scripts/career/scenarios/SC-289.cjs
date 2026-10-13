"use strict";
// SC-289 (canonical) Session dies mid-run: only dependent tasks pause; one re-auth text; rest continues.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-289", "session-dies-mid-run");
  s.user("Session dies mid-run");
  const plan = A.healthPlan({
    health: [{ source: "google_career", status: "expired", checked_at: "2026-10-12T15:00:00.000Z" }, { source: "linkedin", status: "ok", checked_at: "2026-10-12T15:00:00.000Z" }],
    tasks: [
      { id: "send-outreach", title: "Send outreach from own Gmail", needs: ["gmail"] },
      { id: "book-call", title: "Book on Calendar", needs: ["calendar"] },
      { id: "view-profile", title: "View a LinkedIn profile", needs: ["linkedin"] },
      { id: "draft-answers", title: "Draft answers from the stored profile", needs: [] },
    ],
    secureLinkFor: (src) => `https://secure.example/connect/${src}`,
  });
  s.tool("CareerAccess.healthPlan(google_career expired)", plan);
  for (const m of plan.reauth) s.agent(m.text);
  const ok = plan.paused.map((p) => p.id).join(",") === "send-outreach,book-call"
    && plan.running.map((p) => p.id).join(",") === "view-profile,draft-answers"
    && plan.messages.length === 1 && plan.reauth[0].source === "google_career"
    && /I never see your password/.test(plan.messages[0]) && !/(send|give|tell|enter|type|share) (me )?(your )?(password|code|card)/i.test(plan.messages[0]);
  s.verify("health plan state: only the dead grant's tasks paused, everything else running, exactly ONE re-auth text for the one dead grant (BUG-005 grouping), no password ask", { ok, paused: plan.paused.map((p) => p.id), running: plan.running.map((p) => p.id), messages: plan.messages });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "The dead session paused only its dependent tasks (Gmail send + Calendar booking); LinkedIn and profile work continued, and exactly one re-auth text went out with a secure link and no password request." }
    : { status: "LEARN", outcome: "Session-death isolation or the one-text rule failed.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix healthPlan in 120 and rerun SC-289." });
})().catch((e) => { console.error(e); process.exit(1); });
