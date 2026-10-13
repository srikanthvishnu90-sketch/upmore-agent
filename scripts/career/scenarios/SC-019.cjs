"use strict";
// SC-019 School SSO source (Handshake) plan — SSO sign-in once in the shown session; no password in chat.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-019", "handshake-sso-plan");
  s.user("connect my Handshake");
  const ctx = { secureLinkFor: (src) => `https://secure.example/connect/${src}` };
  const r = A.handleChat("connect my Handshake", ctx);
  s.tool("CareerAccess.handleChat -> browserConnectPlan(handshake)", r);
  s.agent(r.reply, { card: { type: "browser_connect_plan", title: "Connect Handshake (school SSO)", source: r.source, method: r.method, agent_sees_password: r.agent_sees_password, risk_note: r.risk_note } });
  const ok = r.intent === "connect_browser_source" && r.ok === true && r.source === "handshake"
    && r.method === "cloud_browser_user_sign_in" && r.agent_sees_password === false
    && /school SSO/.test(r.risk_note) && /do that step yourself in the shown session/.test(r.risk_note)
    && /secure\.example\/connect\/handshake/.test(r.reply)
    && !/(send|give|tell|enter|type|share) (me )?(your )?(password|code)/i.test(r.reply);
  s.verify("plan state: Handshake connects via the user's own school-SSO sign-in in the shown session (agent_sees_password=false), the terms/SSO caveat is stated in the reply, and no password is requested in chat", { ok, method: r.method, risk_note: r.risk_note });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Handshake plan stated plainly: sign in once through your school SSO in the shown session, the agent never sees the password, with the Handshake/SSO caveat up front and no password requested in chat." }
    : { status: "LEARN", outcome: "Handshake plan was incomplete or asked for a credential.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix browserConnectPlan in 120 and rerun SC-019." });
})().catch((e) => { console.error(e); process.exit(1); });
