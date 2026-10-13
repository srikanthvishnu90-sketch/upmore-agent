"use strict";
// SC-005 Access audit log — entries listed from the audit rail; a secret-shaped field is refused.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-005", "access-audit-log");
  s.user("show me everything you've accessed for me");
  const e1 = A.auditEntry({ source: "gmail", at: "2026-10-12T15:02:00.000Z", what: "Read inbox for application confirmations", outcome: "3 messages" });
  const e2 = A.auditEntry({ source: "google_career", at: "2026-10-12T15:01:00.000Z", what: "Connected career Google grant", outcome: "connected" });
  const e3 = A.auditEntry({ source: "calendar", at: "2026-10-12T15:03:00.000Z", what: "Checked free/busy for a coffee chat", outcome: "ok" });
  s.tool("CareerAccess.auditEntry x3", [e1, e2, e3]);
  const refused = A.auditEntry({ source: "gmail", at: "2026-10-12T15:04:00.000Z", what: "probe", token: "mock-secret-value-999" });
  s.tool("CareerAccess.auditEntry(secret-shaped field)", refused);
  const ctx = { auditEntries: [e1.entry, e2.entry, e3.entry] };
  const r = A.handleChat("show me everything you've accessed for me", ctx);
  s.tool("CareerAccess.handleChat -> auditLog", r);
  s.agent(r.reply, { card: { type: "access_log", title: "Access log", entries: r.entries } });
  const ok = r.intent === "access_log" && r.entries.length === 3 && r.entries[0].source === "google_career"
    && refused.ok === false && refused.code === "secret_in_record"
    && !JSON.stringify(s.messages).includes("mock-secret-value-999");
  s.verify("audit view from the entries themselves (time-sorted, source + what + outcome); the secret-shaped entry was refused and its value appears nowhere in the transcript", { ok, count: r.entries.length, refused_code: refused.code });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Chat listed every access from the audit rail (source, time, what was done, outcome, time-sorted); a secret-shaped audit field was refused and never echoed." }
    : { status: "LEARN", outcome: "Audit log answer did not match the audit entries or leaked a refused value.", reason: "Rail-state check failed; see verification evidence (BUG-004 phrase routing was fixed in this branch).", unblock: "Fix auditLog/handleChat in 120 and rerun SC-005." });
})().catch((e) => { console.error(e); process.exit(1); });
