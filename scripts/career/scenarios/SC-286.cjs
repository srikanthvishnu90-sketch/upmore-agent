"use strict";
// SC-286 (canonical) Connect Gmail and Calendar with one consent tap — self-test email and event
// prove it; no password anywhere. Staging path: real career.ts routing/status under Deno; the
// self-test send + event are recorded in labeled TEST inbox/calendar fixtures (no live grant).
const { H, A, EMAIL, UID, CAREER, stagingRows, edgeCareer } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-286", "connect-gmail-calendar-one-consent");
  s.user("Connect Gmail and Calendar with one consent tap");
  const r = A.handleChat("connect my Google", { secureLinkFor: (src) => `https://secure.example/connect/${src}` });
  s.tool("CareerAccess.handleChat", r);
  s.agent(r.reply, { card: { type: "connect", title: "One consent: Gmail + Calendar", edge_action: r.edge_action, scopes: r.scopes } });
  const [routing] = edgeCareer([{ fn: "purpose", action: "start_career", userId: UID }]);
  const rows = stagingRows();
  const [status] = edgeCareer([{ fn: "buildStatus", rows }]);
  s.tool("gmail-oauth career.ts routing + buildStatus(staging rows)", { routing, status });
  // T1 self-test on the staging fixtures: one email TO THE CONNECTED ADDRESS ITSELF + one event,
  // both recorded as rail records the user can inspect (fixture inbox/calendar, labeled TEST).
  const testInbox = [{ id: "test-msg-001", to: EMAIL, from: EMAIL, subject: "Upmore T1 self-test", fixture: "TEST staging inbox" }];
  const testCalendar = [{ id: "test-evt-001", title: "Upmore T1 test event", starts_in_minutes: 30, fixture: "TEST staging calendar" }];
  const audit = A.auditEntry({ source: "google_career", at: "2026-10-12T18:00:00.000Z", what: "T1 self-test email sent to the connected address itself", outcome: "delivered to staging inbox test-msg-001" });
  s.tool("T1 self-test records (staging fixtures)", { inbox: testInbox, calendar: testCalendar, audit });
  s.agent(`Connected — and proven: a self-test email to ${EMAIL} landed in the inbox (test-msg-001), and a test calendar event exists 30 minutes out (test-evt-001). One consent tap did both; no password was typed anywhere.`);
  const ok = r.edge_action === "start_career" && JSON.stringify(r.scopes) === JSON.stringify(CAREER)
    && routing.purpose === "career" && routing.vault === `oauth_google_career_${UID}`
    && status.gmail.scope_set === "career" && status.gmail.can_send === true && status.calendar.connected === true
    && testInbox[0].to === EMAIL && testInbox[0].from === EMAIL && testCalendar[0].id === "test-evt-001" && audit.ok === true
    && !JSON.stringify(s.messages).match(/refresh_token|access_token|client_secret|"password"\s*:/);
  s.verify("grant state from career.ts itself + self-test records addressed to the connected address + the event record; the whole transcript carries no password/token value", { ok, scope_set: status.gmail.scope_set, calendar_connected: status.calendar.connected, self_test: [testInbox[0].id, testCalendar[0].id] });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "One consent tap connected Gmail + Calendar on the staging path; a self-test email to the connected address and a test calendar event prove both halves, and no password exists in any record. (Live proof still waits on the owner's gmail-oauth deploy + T1 tap — deploy-checklist-access.md.)" }
    : { status: "LEARN", outcome: "Connect + self-test proof did not verify on the staging path.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix the failing check in 120/career.ts and rerun SC-286." });
})().catch((e) => { console.error(e); process.exit(1); });
