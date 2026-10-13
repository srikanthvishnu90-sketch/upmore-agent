"use strict";
// SC-007 CAPTCHA handoff — run stops, ticket + screenshot ref, single-use resume, replay refused.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-007", "captcha-handoff");
  s.user("(an ATS page throws a CAPTCHA mid-apply)");
  const now = Date.UTC(2026, 9, 12, 15, 0, 0);
  const made = A.createHandoff({ source: "portal", challenge: "captcha", screenshot_ref: "shot://run-apply-1/captcha-step", run_id: "run-apply-1", now, resumeToken: "mock-resume-token-sc007" });
  s.tool("CareerAccess.createHandoff", made);
  s.agent(made.text, { card: { type: "handoff", title: "Your step: CAPTCHA", ticket_id: made.ticket.id, screenshot_ref: made.ticket.screenshot_ref, expires_at: made.ticket.expires_at } });
  const wrong = A.resumeHandoff(made.ticket, { resume_token: "wrong-token", now: now + 1000 });
  s.tool("CareerAccess.resumeHandoff(wrong token)", wrong);
  const resumed = A.resumeHandoff(made.ticket, { resume_token: "mock-resume-token-sc007", now: now + 2000 });
  s.tool("CareerAccess.resumeHandoff(correct token)", resumed);
  s.agent(resumed.text);
  const replay = A.resumeHandoff({ ...made.ticket, status: "resumed" }, { resume_token: "mock-resume-token-sc007", now: now + 3000 });
  s.tool("CareerAccess.resumeHandoff(second attempt)", replay);
  const ok = made.ok === true && made.ticket.status === "awaiting_user" && made.ticket.screenshot_ref.includes("captcha-step")
    && wrong.ok === false && wrong.code === "bad_token"
    && resumed.ok === true && resumed.ticket.status === "resumed" && resumed.ticket.resume_token === null && resumed.run_id === "run-apply-1"
    && replay.ok === false && replay.code === "already_used"
    && !("solveCaptcha" in A) && !("solve" in A);
  s.verify("ticket lifecycle from the ticket state itself: awaiting_user -> wrong token refused -> resumed once (token cleared) -> second resume refused as already_used; the module exposes no CAPTCHA-solving surface", { ok, lifecycle: [made.ticket.status, wrong.code, resumed.ticket.status, replay.code] });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "The run stopped at the CAPTCHA, a handoff ticket with the screenshot reference was created, resume validated the single-use token exactly once, and a second resume was refused as already_used. No CAPTCHA-solving service exists in the rail." }
    : { status: "LEARN", outcome: "Handoff lifecycle did not meet the single-use standard.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix createHandoff/resumeHandoff in 120 and rerun SC-007." });
})().catch((e) => { console.error(e); process.exit(1); });
