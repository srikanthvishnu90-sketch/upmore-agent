"use strict";
// SC-013 Connect LinkedIn (assisted) — browser-connect plan presented honestly.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-013", "connect-linkedin-assisted");
  s.user("connect my LinkedIn");
  const ctx = { secureLinkFor: (src) => `https://secure.example/connect/${src}` };
  const r = A.handleChat("connect my LinkedIn", ctx);
  s.tool("CareerAccess.handleChat -> browserConnectPlan(linkedin)", r);
  s.agent(r.reply, { card: { type: "browser_connect_plan", title: "Connect LinkedIn (assisted)", source: r.source, method: r.method, agent_sees_password: r.agent_sees_password, risk_note: r.risk_note } });
  const ok = r.intent === "connect_browser_source" && r.ok === true && r.source === "linkedin"
    && r.method === "cloud_browser_user_sign_in" && r.agent_sees_password === false
    && /prohibit automation and scraping/.test(r.risk_note) && /low-volume only/.test(r.risk_note) && /no bulk scraping/.test(r.risk_note)
    && /secure\.example\/connect\/linkedin/.test(r.reply) && !/(send|give|tell|enter|type|share) (me )?(your )?(password|code)/i.test(r.reply);
  s.verify("plan state: user-sign-in method, agent_sees_password=false, LinkedIn restriction risk + low-volume/no-scraping default stated in the reply itself, no password ever requested in chat", { ok, method: r.method, agent_sees_password: r.agent_sees_password });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "LinkedIn connect presented as the honest assisted plan: the user signs in once in the shown session via a secure link, the agent never sees the password, and the restriction risk + low-volume/no-scraping default were stated up front. (The live browser session itself is the owner-gated rail named in the plan.)" }
    : { status: "LEARN", outcome: "LinkedIn connect plan was not presented honestly/completely.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix browserConnectPlan in 120 and rerun SC-013." });
})().catch((e) => { console.error(e); process.exit(1); });
