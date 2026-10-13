"use strict";
// SC-014 Re-auth does not spam — same expiry re-planned 3x in a day sends ONE message (130 dedupe log).
const { H, A, O } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-014", "reauth-does-not-spam");
  s.user("(session expires three times in a day)");
  const log = O.createReauthLog();
  const results = [];
  for (let i = 0; i < 3; i++) {
    const plan = A.healthPlan({ health: [{ source: "google_career", status: "expired", checked_at: "2026-10-12T15:00:00.000Z" }, { source: "linkedin", status: "ok", checked_at: "2026-10-12T15:00:00.000Z" }], tasks: [{ id: "send-outreach", needs: ["gmail"] }, { id: "view-profile", needs: ["linkedin"] }], secureLinkFor: (src) => `https://secure.example/connect/${src}` });
    const send = O.planReauthSends(log, plan, "expiry-2026-10-12-google");
    results.push(send);
    s.tool(`healthPlan + planReauthSends (attempt ${i + 1}, same expiry event)`, send);
    if (send.to_send.length) s.agent(send.to_send[0].text);
    // Other work continues throughout: the LinkedIn task is in `running` on every plan.
    if (!plan.running.some((t) => t.id === "view-profile")) throw new Error("unrelated work blocked");
  }
  const totalSent = results.reduce((n, r) => n + r.to_send.length, 0);
  const suppressed = results.reduce((n, r) => n + r.suppressed.length, 0);
  const ok = totalSent === 1 && suppressed === 2 && log.sent.length === 1 && log.sent[0].source === "google_career";
  s.verify("dedupe log state: 3 re-plans of the SAME expiry produced exactly 1 sent re-auth (2 suppressed as duplicates), and the unrelated LinkedIn task stayed in `running` on every plan", { ok, total_sent: totalSent, suppressed, log: log.sent.map((x) => x.key) });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Three expiry re-plans in one day produced exactly one re-auth message (the other two were suppressed as duplicates for the same expiry event), and unrelated work continued throughout." }
    : { status: "LEARN", outcome: "Re-auth dedupe failed — duplicate nags would have been sent.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix planReauthSends in 130 and rerun SC-014." });
})().catch((e) => { console.error(e); process.exit(1); });
