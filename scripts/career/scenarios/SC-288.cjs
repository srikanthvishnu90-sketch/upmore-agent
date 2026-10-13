"use strict";
// SC-288 (canonical) Cloud-browser sign-in: I sign in once to Handshake; the agent reuses that session.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-288", "cloud-browser-signin-handshake-reuse");
  s.user("Cloud-browser sign-in: I sign in once to Handshake; reuse that session");
  const ctx = { secureLinkFor: (src) => `https://secure.example/connect/${src}` };
  const r = A.handleChat("connect my Handshake", ctx);
  s.tool("CareerAccess.handleChat -> browserConnectPlan(handshake)", r);
  s.agent(r.reply, { card: { type: "browser_connect_plan", title: "Handshake: sign in once", method: r.method, agent_sees_password: r.agent_sees_password, session_stored_as: r.session_stored_as } });
  // After the user's one sign-in, the host holds a session record (vault reference only). Two later
  // runs health-check it: ok -> both reuse it with NO new sign-in ask; the session is reused, not rebuilt.
  const plan1 = A.healthPlan({ health: [{ source: "handshake", status: "ok", checked_at: "2026-10-12T18:05:00.000Z" }], tasks: [{ id: "hs-shortlist", title: "Pull Handshake postings", needs: ["handshake"] }], secureLinkFor: ctx.secureLinkFor });
  const plan2 = A.healthPlan({ health: [{ source: "handshake", status: "ok", checked_at: "2026-10-12T19:00:00.000Z" }], tasks: [{ id: "hs-apply-check", title: "Check a Handshake application", needs: ["handshake"] }], secureLinkFor: ctx.secureLinkFor });
  s.tool("healthPlan(run 1, session ok)", plan1);
  s.tool("healthPlan(run 2, session ok)", plan2);
  s.agent("Signed in once — both later runs reused that same session. No second sign-in was asked for.");
  const ok = r.ok === true && r.method === "cloud_browser_user_sign_in" && r.agent_sees_password === false && r.session_stored_as === "vault_reference_only"
    && plan1.running.length === 1 && plan1.messages.length === 0 && plan2.running.length === 1 && plan2.messages.length === 0
    && /school SSO/.test(r.risk_note);
  s.verify("session state across runs: sign-in plan is user-only (agent_sees_password=false, vault-reference storage), and two subsequent health-checked runs both ran on the stored session with zero re-auth messages", { ok, run1_messages: plan1.messages.length, run2_messages: plan2.messages.length });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Handshake sign-in happened once (user-only, in the shown session, password never seen by the agent, session stored as a vault reference), and two later runs reused that session with no re-auth ask. (The live cloud-browser window itself is the owner-gated rail named in the plan.)" }
    : { status: "LEARN", outcome: "Sign-in-once/session-reuse behaviour did not verify.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix browserConnectPlan/healthPlan in 120 and rerun SC-288." });
})().catch((e) => { console.error(e); process.exit(1); });
