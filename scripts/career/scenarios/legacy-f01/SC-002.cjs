"use strict";
// SC-002 Connected accounts list — answered from real connection rows via 120 connectedAccounts.
const { H, A, EMAIL, CAREER, stagingRows } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-002", "connected-accounts-list");
  s.user("what accounts do I have connected?");
  const ctx = { statusRecords: stagingRows() };
  const r = A.handleChat("what accounts do I have connected?", ctx);
  s.tool("CareerAccess.handleChat -> connectedAccounts(statusRecords)", r);
  s.agent(r.reply, { card: { type: "connected_accounts", title: "Connected accounts", accounts: r.accounts, connected_email: r.connected_email } });
  const gmail = r.accounts.find((a) => a.source === "gmail");
  const cal = r.accounts.find((a) => a.source === "calendar");
  const ok = r.intent === "connected_accounts" && r.connected_email === EMAIL && gmail && gmail.scope_set === "career"
    && gmail.scopes.includes(A.GMAIL_SEND_SCOPE) && cal && cal.via === "google_career"
    && new Set(r.granted_scopes).size === 4 && CAREER.every((x) => r.granted_scopes.includes(x));
  s.verify("answer derived from the connection rows themselves: per-source scopes, Gmail can_send from gmail.send scope, calendar via the career grant, connected email = TEST persona email", { ok, accounts: r.accounts.map((a) => a.source), granted_scopes: r.granted_scopes, connected_email: r.connected_email });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Chat listed the connected accounts from the real (staging) connection rows: Gmail read+send as the TEST persona, Calendar via the career Google grant, all 4 granted scopes named." }
    : { status: "LEARN", outcome: "Connected-accounts answer did not match the connection rows.", reason: "Rail-state check failed; see verification evidence (BUG-002 phrase routing was fixed in this branch — if intent is null the fix regressed).", unblock: "Restore the BUG-002 routing fix in 120 handleChat and rerun SC-002." });
})().catch((e) => { console.error(e); process.exit(1); });
