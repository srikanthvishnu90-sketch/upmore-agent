// WO-007 acceptance tests (architect-authored; builders make them pass, never edit them).
// Alerts and reports: new postings that match what the person asked for reach them within minutes, capped,
// held in quiet hours, and everything else rolls into one daily report at their time. Pure planning; delivery is
// the conversation interface's proactive queue (WO-004). Contract: docs/architect/work-orders/WO-007-alerts-reports.md
import { planProactive, matchPosting, type AlertPrefs, type PlanUser } from "../../supabase/functions/_shared/career_alerts.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
// 2026-10-19 15:00 UTC = 11:00 in New York (EDT).
const NOW = Date.UTC(2026, 9, 19, 15);
const iso = (ms: number) => new Date(ms).toISOString();
const posting = (id: string, title: string, company: string, location: string, minsAgo: number, extra: Record<string, unknown> = {}) =>
  ({ job_id: `greenhouse:${company.toLowerCase()}:${id}`, title, company, location, url: `https://boards.greenhouse.io/${company.toLowerCase()}/jobs/${id}`, description: `${title}. SQL, Python.`, first_seen_at: iso(NOW - minsAgo * 60000), closed_at: null, ...extra });
const prefs = (p: Partial<AlertPrefs> = {}): AlertPrefs => ({ on: true, keywords: ["data analyst"], locations: [], remote_ok: true, report_hour: 8, quiet_start: 22, quiet_end: 7, max_instant_per_day: 3, ...p });
const user = (p: Partial<PlanUser> = {}): PlanUser => ({ id: "u1", tz: "America/New_York", prefs: prefs(), last_checked_at: iso(NOW - 15 * 60000), instant_sent_today: 0, last_report_on: "2026-10-19", ...p });

Deno.test("WO-007/1 matching: keywords in the title, location or remote, closed postings never match", () => {
  const p = prefs({ keywords: ["data analyst"], locations: ["new york"], remote_ok: true });
  assert(matchPosting(posting("1", "Senior Data Analyst", "Stripe", "New York, NY", 5), p), "keyword + city");
  assert(matchPosting(posting("2", "Data Analyst", "Ramp", "Remote", 5), p), "remote counts when remote_ok");
  // SERIAL-1530: a remote posting limited to a country is screened against the person's STATED location; with none on
  // record it is held, never passed (the first form of this line admitted it for everyone). The stated location rides
  // the watch (interests[].home); nothing is inferred from the watched city or the person's zone.
  assert(!matchPosting(posting("2b", "Data Analyst", "Ramp", "Remote - US", 5), p), "US-only remote, location not on record: held");
  const home = (h: string) => prefs({ interests: [{ keywords: ["data analyst"], locations: ["new york"], remote_ok: true, home: h }] });
  assert(matchPosting(posting("2c", "Data Analyst", "Ramp", "Remote - US", 5), home("Brooklyn, NY")), "US-only remote for a person in New York");
  assert(!matchPosting(posting("2d", "Data Analyst", "Ramp", "Remote - US", 5), home("Toronto, ON")), "US-only remote for a person in Canada: no");
  assert(!matchPosting(posting("2e", "Data Analyst", "Ramp", "Remote (Canada)", 5), home("Brooklyn, NY")), "Canada-only remote for a person in New York: no");
  assert(!matchPosting(posting("3", "Data Analyst", "Ramp", "Austin, TX", 5), p), "wrong city");
  assert(!matchPosting(posting("4", "Software Engineer", "Ramp", "New York, NY", 5), p), "wrong role");
  assert(!matchPosting(posting("5", "Data Analyst", "Ramp", "New York, NY", 5, { closed_at: iso(NOW) }), p), "closed");
  assert(matchPosting(posting("6", "data analyst II", "Ramp", "Anywhere", 5), prefs({ locations: [] })), "no location filter = any location, case-insensitive");
});

Deno.test("WO-007/2 a new match becomes one instant alert with company, title, place, minutes since posted and the link", () => {
  // The person's stated location (interests[].home) is what admits a US-only remote posting (SERIAL-1530).
  const u = user({ prefs: prefs({ interests: [{ keywords: ["data analyst"], locations: [], remote_ok: true, home: "New York, NY" }] }) });
  const out = (planProactive as (o: any) => any[])({ users: [u], postings: [posting("1", "Data Analyst", "Stripe", "Remote - US", 4)], now: NOW });
  eq(out.length, 1);
  const a = out[0];
  eq([a.userId, a.key, a.kind], ["u1", "alert:greenhouse:stripe:1", "alert"]);
  assert(a.text.includes("Data Analyst") && a.text.includes("Stripe") && a.text.includes("Remote - US"), "what and where");
  assert(/4 min/.test(a.text), "how fresh");
  assert(a.text.includes("https://boards.greenhouse.io/stripe/jobs/1"), "the link");
  eq(a.at, NOW, "now, outside quiet hours");
});

Deno.test("WO-007/3 only postings first seen since the last check are alerted", () => {
  const out = (planProactive as (o: any) => any[])({ users: [user({ last_checked_at: iso(NOW - 10 * 60000) })], postings: [posting("old", "Data Analyst", "Stripe", "Remote", 30), posting("new", "Data Analyst", "Ramp", "Remote", 5)], now: NOW });
  eq(out.filter((o) => o.kind === "alert").map((o) => o.key), ["alert:greenhouse:ramp:new"]);
});

Deno.test("WO-007/4 the daily instant cap holds; the rest wait for the report (never dropped)", () => {
  const ps = [1, 2, 3, 4, 5].map((i) => posting(String(i), "Data Analyst", `Co${i}`, "Remote", i));
  const out = (planProactive as (o: any) => any[])({ users: [user({ instant_sent_today: 1 })], postings: ps, now: NOW });
  const alerts = out.filter((o) => o.kind === "alert");
  eq(alerts.length, 2, "cap 3 per day, 1 already sent");
  eq(alerts.map((a) => a.key), ["alert:greenhouse:co1:1", "alert:greenhouse:co2:2"], "freshest first");
  const held = out.filter((o) => o.kind === "held");
  eq(held.map((h) => h.job_id).sort(), ["greenhouse:co3:3", "greenhouse:co4:4", "greenhouse:co5:5"], "the rest are held for the report");
});

Deno.test("WO-007/5 quiet hours: an alert found at night is scheduled for the end of quiet hours in the person's zone", () => {
  const night = Date.UTC(2026, 9, 19, 5); // 01:00 New York
  const p = { ...posting("1", "Data Analyst", "Stripe", "Remote", 3), first_seen_at: iso(night - 3 * 60000) };
  const out = (planProactive as (o: any) => any[])({ users: [user({ last_checked_at: iso(night - 15 * 60000) })], postings: [p], now: night });
  eq(out.length, 1);
  eq(out[0].at, Date.UTC(2026, 9, 19, 11), "07:00 New York = 11:00 UTC");
});

Deno.test("WO-007/6 the daily report goes once a day at the person's hour with the held and recent matches", () => {
  const at8 = Date.UTC(2026, 9, 20, 12); // 08:00 New York next day
  const ps = [posting("1", "Data Analyst", "Stripe", "Remote", 60 * 20), posting("2", "Data Analyst", "Ramp", "Remote", 60 * 10)].map((p) => ({ ...p, first_seen_at: iso(at8 - 60000 * 60 * (p.job_id.endsWith(":1") ? 20 : 10)) }));
  const u = user({ last_report_on: "2026-10-19", last_checked_at: iso(at8 - 15 * 60000), held: ["greenhouse:stripe:1"] });
  const out = (planProactive as (o: any) => any[])({ users: [u], postings: ps, now: at8 });
  const rep = out.filter((o) => o.kind === "report");
  eq(rep.length, 1);
  eq(rep[0].key, "report:2026-10-20");
  assert(rep[0].text.includes("Stripe") && rep[0].text.includes("Ramp"), "lists the matches from the last day");
  assert(rep[0].text.includes("https://boards.greenhouse.io/stripe/jobs/1"), "with links");
  const again = (planProactive as (o: any) => any[])({ users: [{ ...u, last_report_on: "2026-10-20" }], postings: ps, now: at8 + 600000 });
  eq(again.filter((o) => o.kind === "report").length, 0, "once a day");
});

Deno.test("WO-007/7 alerts off means nothing at all; a report with no matches says so instead of staying silent", () => {
  eq((planProactive as (o: any) => any[])({ users: [user({ prefs: prefs({ on: false }) })], postings: [posting("1", "Data Analyst", "Stripe", "Remote", 3)], now: NOW }), []);
  const at8 = Date.UTC(2026, 9, 20, 12);
  const out = (planProactive as (o: any) => any[])({ users: [user({ last_report_on: "2026-10-19", last_checked_at: iso(at8 - 15 * 60000) })], postings: [], now: at8 });
  const rep = out.filter((o) => o.kind === "report");
  eq(rep.length, 1);
  assert(/no new/i.test(rep[0].text), "honest empty report");
});
