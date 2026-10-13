"use strict";
// SC-292 (canonical) Audit view: every action this week that used a login, listed for me.
const { H, A } = require("./_f01-lib.cjs");
(async () => {
  const s = H.session("SC-292", "audit-view-this-week");
  s.user("Audit view: show me every action this week that used a login");
  const mk = (source, at, what, outcome) => A.auditEntry({ source, at, what, outcome });
  const entries = [
    mk("gmail", "2026-10-06T09:00:00.000Z", "Read inbox for application confirmations", "2 found"),
    mk("google_career", "2026-10-08T10:00:00.000Z", "Sent outreach email from the user's own Gmail", "sent"),
    mk("linkedin", "2026-10-10T11:00:00.000Z", "User completed handoff sign-in", "session stored"),
    mk("portal", "2026-10-11T12:00:00.000Z", "Signed in to a Workday portal with the vault credential", "signed in"),
    mk("gmail", "2026-09-20T09:00:00.000Z", "OLD entry — outside this week", "read"),
  ];
  s.tool("CareerAccess.auditEntry x5 (one deliberately last-month)", entries);
  const log = A.auditLog(entries.filter((e) => e.ok).map((e) => e.entry));
  s.tool("CareerAccess.auditLog(all)", log);
  // "This week" view = the audit rail's entries inside the trailing 7 days of the newest entry.
  const newest = Date.parse(log.entries[log.entries.length - 1].at);
  const week = log.entries.filter((e) => newest - Date.parse(e.at) <= 7 * 24 * 3600 * 1000);
  const weekLog = { entries: week, count: week.length, text: week.map((e) => `${e.at} — ${A.label(e.source)}: ${e.what}${e.outcome ? ` (${e.outcome})` : ""}`).join("\n") };
  s.agent(weekLog.text, { card: { type: "access_log", title: "Login actions this week", entries: week } });
  const r = A.handleChat("show my access log", { auditEntries: log.entries });
  s.tool("CareerAccess.handleChat(show my access log)", r);
  const ok = log.count === 5 && week.length === 4 && week.every((e) => e.at >= "2026-10-05")
    && week.map((e) => e.source).join(",") === "gmail,google_career,linkedin,portal"
    && r.intent === "access_log" && r.entries.length === 5;
  s.verify("audit rail state: 5 entries total, the this-week view holds exactly the 4 inside the trailing 7 days (sources + times + what-done), the older entry is excluded from the week view and still in the full log", { ok, week: week.map((e) => [e.at, e.source]), total: log.count });
  await s.finish(ok
    ? { status: "COMPLETE", outcome: "Audit view listed every login-using action this week (Gmail read, career-grant send, LinkedIn handoff sign-in, portal sign-in) with source, time and outcome from the audit entries themselves; last month's entry stayed out of the week view." }
    : { status: "LEARN", outcome: "Audit week view did not match the audit entries.", reason: "Rail-state check failed; see verification evidence.", unblock: "Fix auditLog in 120 and rerun SC-292." });
})().catch((e) => { console.error(e); process.exit(1); });
