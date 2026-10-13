"use strict";
// SC-001 Connect Google for career — staging path: chat handler -> gmail-oauth start_career routing
// (real career.ts under Deno) -> staging connection rows -> real buildStatus + 120 connectedAccounts.
const { H, A, EMAIL, UID, CAREER, stagingRows, edgeCareer } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-001", "connect-google-for-career");
  s.user("connect my Google so you can use my Gmail and calendar");
  const ctx = { secureLinkFor: (src) => `https://secure.example/connect/${src}` };
  const r = A.handleChat("connect my Google so you can use my Gmail and calendar", ctx);
  s.tool("CareerAccess.handleChat", r);
  s.agent(r.reply, { card: { type: "connect", title: "Connect Google (career)", edge_action: r.edge_action, scopes: r.scopes } });
  const [routing] = edgeCareer([{ fn: "purpose", action: "start_career", userId: UID }]);
  s.tool("gmail-oauth career.ts purposeForAction(start_career)", routing);
  // Staging grant completes: the host (staging) writes the google_career connection row the callback
  // would write; rows are synthetic TEST-persona records, no live grant, no token values anywhere.
  const rows = stagingRows();
  const [status] = edgeCareer([{ fn: "buildStatus", rows }]);
  s.tool("gmail-oauth career.ts buildStatus(staging rows)", status);
  const list = A.connectedAccounts(rows);
  s.tool("CareerAccess.connectedAccounts(staging rows)", list);
  s.agent(list.text);
  const ok = r.intent === "connect_google" && r.edge_action === "start_career"
    && JSON.stringify(r.scopes) === JSON.stringify(CAREER)
    && routing.purpose === "career" && routing.provider === "google_career" && routing.vault === `oauth_google_career_${UID}`
    && status.gmail.scope_set === "career" && status.gmail.can_send === true && status.calendar.connected === true
    && status.connected_email === EMAIL && list.gmail.can_send === true && list.calendar_connected === true
    && !JSON.stringify(s.messages).match(/refresh_token|access_token|client_secret/);
  s.verify("staging grant state: start_career routes to google_career vault entry; buildStatus shows career scope set + calendar connected; zero secret-shaped values in the transcript", { ok, scope_set: status.gmail.scope_set, can_send: status.gmail.can_send, calendar_connected: status.calendar.connected, connected_email: status.connected_email, vault: routing.vault });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Connect-Google ask produced the start_career edge action with the exact 4 career scopes; on the staging path the grant's status shows Gmail career scope set (read+send) + Calendar connected for the TEST persona, with no password or token value in any record." }
    : { status: "LEARN", outcome: "Staging connect path did not verify end to end.", reason: "One or more rail-state checks failed; see verification evidence.", unblock: "Fix the failing rail check in 120/career.ts and rerun SC-001." });
})().catch(async (e) => { console.error(e); process.exit(1); });
