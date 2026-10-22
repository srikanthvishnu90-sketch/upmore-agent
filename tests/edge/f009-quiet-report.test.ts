import { DEFAULT_PREFS, planProactive, quietAt } from "../../supabase/functions/_shared/career_alerts.ts";

function eq(a: unknown, b: unknown) { if (JSON.stringify(a) !== JSON.stringify(b)) throw Error(`got ${JSON.stringify(a)}, expected ${JSON.stringify(b)}`); }
function report(now: number, tz: string, start: number, end: number) {
  const prefs = { ...DEFAULT_PREFS, keywords: ["analyst"], report_hour: 0, quiet_start: start, quiet_end: end };
  const result = planProactive({ users: [{ id: "synthetic-owner", tz, prefs, last_checked_at: new Date(now).toISOString(), instant_sent_today: 0, last_report_on: null }], postings: [], now });
  const r = result.find(x => x.kind === "report");
  if (!r || r.kind !== "report") throw Error("expected a daily report");
  eq(quietAt(r.at, tz, prefs), false);
  return r.at;
}
Deno.test("F009 report inside overnight quiet hours waits until their end", () => {
  eq(report(Date.UTC(2026, 9, 22, 13), "America/Chicago", 22, 9), Date.UTC(2026, 9, 22, 14));
});
Deno.test("F009 daytime quiet hours also hold the report", () => {
  eq(report(Date.UTC(2026, 9, 22, 17), "America/Chicago", 12, 14), Date.UTC(2026, 9, 22, 19));
});
Deno.test("F009 delayed report follows the owner's half-hour zone", () => {
  eq(report(Date.UTC(2026, 9, 22, 0), "Asia/Kolkata", 22, 7), Date.UTC(2026, 9, 22, 1, 30));
});
Deno.test("F009 report at the quiet-end boundary is due now", () => {
  const now = Date.UTC(2026, 9, 22, 14);
  eq(report(now, "America/Chicago", 22, 9), now);
});
Deno.test("F009 equal start/end keeps the existing no-quiet-window meaning", () => {
  const now = Date.UTC(2026, 9, 22, 13);
  eq(report(now, "America/Chicago", 8, 8), now);
});
