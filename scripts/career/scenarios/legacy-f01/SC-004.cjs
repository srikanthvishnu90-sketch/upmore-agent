"use strict";
// SC-004 Session expiry mid-run (T8) — healthPlan pauses only dependent tasks, exactly one re-auth.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-004", "session-expiry-mid-run");
  s.user("(a run is in progress when the Google session dies)");
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
  const msg = plan.messages[0] || "";
  const ok = plan.paused.map((p) => p.id).join(",") === "send-outreach,book-call"
    && plan.running.map((p) => p.id).join(",") === "view-profile,draft-answers"
    && plan.messages.length === 1 && plan.one_message_per_source === true
    && /I never see your password/.test(msg) && /secure\.example/.test(msg)
    && !/(send|give|tell|enter|type|share) (me )?(your )?(password|code|card)/i.test(msg);
  s.verify("health plan state: only gmail/calendar tasks paused, LinkedIn + profile work running, exactly ONE re-auth message with a secure link and no password ask", { ok, paused: plan.paused, running: plan.running, messages: plan.messages });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "When the Google session died mid-run, only the Gmail/Calendar tasks paused; LinkedIn and profile work kept running, and exactly one re-auth message went out — secure link, 'I never see your password', no password/code/card ever requested." }
    : { status: "LEARN", outcome: "Health plan did not isolate the dead source or over/under-sent re-auth messages.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix healthPlan in 120 and rerun SC-004." });
})().catch((e) => { console.error(e); process.exit(1); });
