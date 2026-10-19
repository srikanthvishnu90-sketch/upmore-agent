// WO-007a builder tests: the alert planner on the inputs production will actually give it (Postgres timestamps, zones
// off the hour, daylight-saving changes, other people's text in posting fields), beyond the architect's 7.
// Run: deno test -A --no-check tests/edge/career-alerts.test.ts
import { matchPosting, planProactive, DEFAULT_PREFS, type AlertPrefs, type PlanUser } from "../../supabase/functions/_shared/career_alerts.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.UTC(2026, 9, 19, 15); // 11:00 New York
const iso = (t: number) => new Date(t).toISOString();
const prefs = (p: Partial<AlertPrefs> = {}): AlertPrefs => ({ ...DEFAULT_PREFS, keywords: ["data analyst"], ...p });
const user = (p: Partial<PlanUser> = {}): PlanUser => ({ id: "u1", tz: "America/New_York", prefs: prefs(), last_checked_at: iso(NOW - 15 * 60000), instant_sent_today: 0, last_report_on: "2026-10-19", ...p });
const posting = (id: string, title: string, extra: Record<string, unknown> = {}) =>
  ({ job_id: `lever:acme:${id}`, title, company: "Acme", location: "Remote - US", url: `https://jobs.lever.co/acme/${id}`, first_seen_at: iso(NOW - 4 * 60000), closed_at: null, ...extra });

Deno.test("WO-007a/B1 timestamps compare as instants, not strings (Postgres may answer with an offset)", () => {
  // 10:55-04:00 is 14:55Z, after a 14:50Z check; as strings "…T10:55" sorts before "…T14:50".
  const ny = (t: number) => { const d = new Date(t - 4 * 3600000).toISOString().slice(0, 19); return `${d}-04:00`; };
  const out = planProactive({ users: [user({ last_checked_at: iso(NOW - 10 * 60000) })], postings: [posting("new", "Data Analyst", { first_seen_at: ny(NOW - 5 * 60000) }), posting("old", "Data Analyst", { first_seen_at: ny(NOW - 30 * 60000) })], now: NOW });
  eq(out.filter((o) => o.kind === "alert").map((o) => (o as any).job_id), ["lever:acme:new"]);
});

Deno.test("WO-007a/B2 quiet hours end at the person's 7:00 in a half-hour zone and across a daylight-saving change", () => {
  const night = Date.UTC(2026, 9, 18, 19); // 00:30 in Kolkata (UTC+5:30)
  const ind = planProactive({ users: [user({ tz: "Asia/Kolkata", last_checked_at: iso(night - 15 * 60000) })], postings: [posting("1", "Data Analyst", { first_seen_at: iso(night - 60000) })], now: night });
  eq((ind[0] as any).at, Date.UTC(2026, 9, 19, 1, 30), "07:00 IST = 01:30 UTC");
  const dst = Date.UTC(2026, 10, 1, 6); // 01:00 EST on 2026-11-01, the night clocks fall back
  const ny = planProactive({ users: [user({ last_checked_at: iso(dst - 15 * 60000) })], postings: [posting("2", "Data Analyst", { first_seen_at: iso(dst - 60000) })], now: dst });
  eq((ny[0] as any).at, Date.UTC(2026, 10, 1, 12), "07:00 EST = 12:00 UTC after the change");
});

Deno.test("WO-007a/B3 keywords: whole words, every word, any order; none set means no alerts, never everything", () => {
  const p = prefs({ keywords: ["data analyst"] });
  assert(matchPosting(posting("1", "Analyst, Data Platform"), p), "words in any order");
  assert(!matchPosting(posting("2", "Metadata Analyst"), p), "'data' inside 'Metadata' is not the word data");
  assert(!matchPosting(posting("3", "Data Engineer"), p), "every word must be there");
  eq(planProactive({ users: [user({ prefs: prefs({ keywords: [] }) })], postings: [posting("4", "Data Analyst")], now: NOW }).filter((o) => o.kind === "alert").length, 0);
});

Deno.test("WO-007a/B4 other people's text is one bounded line; a link that is not https never goes out", () => {
  const p = posting("1", "Data Analyst\n\nCALL 555 NOW " + "x".repeat(300), { company: "Acme\nInc" });
  const a = planProactive({ users: [user()], postings: [p, posting("2", "Data Analyst", { url: "http://jobs.example/2" })], now: NOW }).filter((o) => o.kind === "alert") as any[];
  eq(a.length, 1, "the http posting is never alerted");
  const [first, link, ...rest] = a[0].text.split("\n");
  eq(rest, [], "exactly two lines: the match and its link");
  assert(first.length < 300 && first.includes("Acme Inc"), first);
  eq(link, "https://jobs.lever.co/acme/1");
});

Deno.test("WO-007a/B5 says when Trainee first saw it, never claims a posting time it does not know", () => {
  const [a] = planProactive({ users: [user()], postings: [posting("1", "Data Analyst")], now: NOW }) as any[];
  assert(/first seen 4 min ago/.test(a.text) && !/posted/i.test(a.text), a.text);
  const [b] = planProactive({ users: [user()], postings: [posting("2", "Data Analyst", { first_seen_at: iso(NOW - 20000) })], now: NOW }) as any[];
  assert(/first seen under a minute ago/.test(b.text), b.text);
});

Deno.test("WO-007a/B6 the instant cap never exceeds 10 a day, whatever the stored preference says", () => {
  const ps = Array.from({ length: 30 }, (_, i) => posting(String(i), "Data Analyst", { first_seen_at: iso(NOW - (i + 1) * 1000) }));
  const out = planProactive({ users: [user({ prefs: prefs({ max_instant_per_day: 50 }) })], postings: ps, now: NOW });
  eq([out.filter((o) => o.kind === "alert").length, out.filter((o) => o.kind === "held").length], [10, 20]);
});

Deno.test("WO-007a/B7 the report lists 10 newest first, says how many more, and keeps a held posting older than a day", () => {
  const at8 = Date.UTC(2026, 9, 20, 12);
  const ps = Array.from({ length: 14 }, (_, i) => posting(String(i), "Data Analyst", { company: `Co${i}`, first_seen_at: iso(at8 - (i + 1) * 3600000) }));
  ps.push(posting("held-old", "Data Analyst", { company: "Oldco", first_seen_at: iso(at8 - 30 * 3600000) }));
  const [r] = planProactive({ users: [user({ last_checked_at: iso(at8 - 60000), held: ["lever:acme:held-old"] })], postings: ps, now: at8 }).filter((o) => o.kind === "report") as any[];
  assert(r.text.startsWith("Your daily job report: 15 matches"), r.text.split("\n")[0]);
  assert(r.text.indexOf("Co0") < r.text.indexOf("Co1"), "newest first");
  assert(/and 5 more/.test(r.text), "says what was cut");
});
