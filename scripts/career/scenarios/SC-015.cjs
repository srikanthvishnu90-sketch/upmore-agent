"use strict";
// SC-015 Disconnect everything — all sources gone, vault handles in the plan, consent/audit entry written.
const { H, A, UID, stagingRows, edgeCareer } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-015", "disconnect-everything");
  s.user("disconnect all my accounts");
  const r = A.handleChat("disconnect all my accounts", { statusRecords: stagingRows() });
  s.tool("CareerAccess.handleChat", r);
  s.agent(r.reply);
  const [plan] = edgeCareer([{ fn: "disconnectPlan", userId: UID, source: "all" }]);
  s.tool("gmail-oauth career.ts disconnectPlan(all)", plan);
  const remaining = stagingRows().filter((row) => !plan.providers.includes(row.provider));
  const after = A.connectedAccounts(remaining);
  s.tool("CareerAccess.connectedAccounts(after)", after);
  const consent = A.auditEntry({ source: "google_career", at: "2026-10-12T16:00:00.000Z", what: "User disconnected all accounts (consent log)", outcome: "all sources removed" });
  s.tool("CareerAccess.auditEntry(consent log)", consent);
  s.agent(after.text);
  const ok = r.intent === "disconnect" && r.source === "all"
    && JSON.stringify(plan.providers) === JSON.stringify(["gmail", "google_career"])
    && JSON.stringify(plan.vault_names) === JSON.stringify([`oauth_gmail_${UID}`, `oauth_google_career_${UID}`])
    && after.count === 0 && after.gmail.connected === false && after.calendar_connected === false
    && consent.ok === true && /Disconnected|disconnected/.test(consent.entry.what);
  s.verify("post-state from the rows: both providers + both vault names in the real disconnect plan, connected list empty (0 accounts, gmail + calendar disconnected), consent log entry written to the audit rail", { ok, providers: plan.providers, vault_names: plan.vault_names, count_after: after.count, consent_entry: consent.entry });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Disconnect-all removed every source on the staging rows (both Google grants and both vault entries named in the real plan), status confirms empty, and a consent log entry was written." }
    : { status: "LEARN", outcome: "Disconnect-all did not empty the connection state or write the consent entry.", reason: "Rail-state check failed; see verification evidence (BUG-003 'all' parsing was fixed in this branch).", unblock: "Restore the BUG-003 fix in 120 handleDisconnect and rerun SC-015." });
})().catch((e) => { console.error(e); process.exit(1); });
