"use strict";
// SC-290 (canonical) CAPTCHA mid-application: handoff tap for me; no solver services; resume right after.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-290", "captcha-handoff-resume");
  s.user("CAPTCHA mid-application: handoff tap for me; no solver services; resume right after");
  const now = Date.UTC(2026, 9, 12, 15, 0, 0);
  const made = A.createHandoff({ source: "portal", challenge: "captcha", screenshot_ref: "shot://run-apply-9/captcha-step", run_id: "run-apply-9", now, resumeToken: "mock-resume-token-sc290" });
  s.tool("CareerAccess.createHandoff", made);
  s.agent(made.text, { card: { type: "handoff", title: "Your tap: CAPTCHA", ticket_id: made.ticket.id, screenshot_ref: made.ticket.screenshot_ref, expires_at: made.ticket.expires_at } });
  s.user("(does the CAPTCHA step in the handoff window, taps resume)");
  const resumed = A.resumeHandoff(made.ticket, { resume_token: "mock-resume-token-sc290", now: now + 60 * 1000 });
  s.tool("CareerAccess.resumeHandoff", resumed);
  s.agent(resumed.text);
  const replay = A.resumeHandoff({ ...made.ticket, status: "resumed" }, { resume_token: "mock-resume-token-sc290", now: now + 120 * 1000 });
  s.tool("CareerAccess.resumeHandoff(second attempt)", replay);
  const ok = made.ok === true && made.ticket.status === "awaiting_user"
    && resumed.ok === true && resumed.run_id === "run-apply-9" && resumed.ticket.resume_token === null
    && replay.ok === false && replay.code === "already_used"
    && !("solveCaptcha" in A) && !("solve" in A) && A.CHALLENGES.includes("captcha");
  s.verify("ticket state: created awaiting_user with screenshot ref -> resumed exactly where the run stopped (same run_id, token cleared) -> replay refused already_used; the access module exposes no solver surface at all", { ok, lifecycle: [made.ticket.status, resumed.ticket.status, replay.code] });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "CAPTCHA stopped the application, the user got one handoff tap with the screenshot, and the run resumed at the exact step on the single-use token; a second resume was refused and no solver service exists in the rail." }
    : { status: "LEARN", outcome: "CAPTCHA handoff lifecycle did not verify.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix createHandoff/resumeHandoff in 120 and rerun SC-290." });
})().catch((e) => { console.error(e); process.exit(1); });
