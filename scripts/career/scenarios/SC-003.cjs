"use strict";
// SC-003 Disconnect calendar only — chat handler names the edge action; the REAL career.ts
// disconnectPlan decides what is removed; post-state verified via 120 connectedAccounts.
const { H, A, UID, stagingRows, edgeCareer } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-003", "disconnect-calendar-only");
  s.user("disconnect my calendar");
  const r = A.handleChat("disconnect my calendar", { statusRecords: stagingRows() });
  s.tool("CareerAccess.handleChat", r);
  s.agent(r.reply);
  const [plan] = edgeCareer([{ fn: "disconnectPlan", userId: UID, source: "calendar" }]);
  s.tool("gmail-oauth career.ts disconnectPlan(calendar)", plan);
  // Host executes the plan on the staging rows: remove the plan's providers, keep the rest.
  const remaining = stagingRows().filter((row) => !plan.providers.includes(row.provider));
  const after = A.connectedAccounts(remaining);
  s.tool("CareerAccess.connectedAccounts(rows after plan execution)", after);
  s.agent(after.text);
  const ok = r.intent === "disconnect" && r.source === "calendar"
    && JSON.stringify(plan.providers) === JSON.stringify(["google_career"])
    && JSON.stringify(plan.vault_names) === JSON.stringify([`oauth_google_career_${UID}`])
    && plan.also_affects.includes("gmail_career") && /career Google grant/.test(plan.note || "")
    && after.calendar_connected === false && after.gmail.connected === true && after.gmail.scope_set === "readonly" && after.gmail.can_send === false;
  s.verify("post-disconnect state from the rows: calendar gone, legacy Gmail read-only intact, honest note that calendar + Gmail send lived in the one career grant", { ok, providers_removed: plan.providers, also_affects: plan.also_affects, calendar_connected_after: after.calendar_connected, gmail_scope_set_after: after.gmail.scope_set });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Calendar disconnect executed per-source on the staging rows: the career grant (and its vault entry) was removed, calendar is gone, the separate read-only Gmail connection stays, and the user was told plainly that both lived in one Google grant." }
    : { status: "LEARN", outcome: "Calendar-only disconnect did not produce the required post-state.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix disconnectPlan/handleDisconnect behaviour and rerun SC-003." });
})().catch((e) => { console.error(e); process.exit(1); });
