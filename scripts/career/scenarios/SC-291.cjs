"use strict";
// SC-291 (canonical) "Disconnect LinkedIn" — session and tokens deleted; connected-accounts list shown.
const { H, A, stagingRows } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-291", "disconnect-linkedin");
  s.user("Disconnect LinkedIn");
  const rows = [...stagingRows(), { provider: "linkedin", email: "alex.testcase@example.test", scopes: "browser_session", connected_at: "2026-10-05T00:00:00.000Z" }];
  const before = A.connectedAccounts(rows);
  s.tool("CareerAccess.connectedAccounts(before)", before);
  const r = A.handleChat("Disconnect LinkedIn", { statusRecords: rows });
  s.tool("CareerAccess.handleChat", r);
  s.agent(r.reply);
  // Host executes the disconnect for the named source; the row (session + token record) is deleted.
  const after = A.connectedAccounts(rows.filter((row) => row.provider !== r.source));
  s.tool("CareerAccess.connectedAccounts(after deletion)", after);
  s.agent(after.text, { card: { type: "connected_accounts", title: "Connected accounts now", accounts: after.accounts } });
  const ok = r.intent === "disconnect" && r.edge_action === "disconnect" && r.source === "linkedin"
    && before.accounts.some((a) => a.source === "linkedin")
    && !after.accounts.some((a) => a.source === "linkedin")
    && after.gmail.connected === true && after.calendar_connected === true;
  s.verify("connection-row state: LinkedIn present before, absent after its disconnect executed; Gmail + Calendar untouched; the list shown to the user is the post-deletion state", { ok, before: before.accounts.map((a) => a.source), after: after.accounts.map((a) => a.source) });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "\"Disconnect LinkedIn\" deleted LinkedIn's session/token record and showed the connected-accounts list from the post-deletion rows: Gmail (read+send) and Calendar remain, LinkedIn is gone." }
    : { status: "LEARN", outcome: "LinkedIn disconnect did not produce the required list state.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix handleDisconnect/connectedAccounts in 120 and rerun SC-291." });
})().catch((e) => { console.error(e); process.exit(1); });
