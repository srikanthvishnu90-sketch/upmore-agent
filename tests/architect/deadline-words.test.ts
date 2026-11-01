// Deadlines said exactly (reqs Q588, Q589, Q590): weekday, date, and for a moment the time and its zone, in the person's own zone;
// never the UTC calendar day of a moment. A date-only deadline is open until that day has ended everywhere, so a posting is never
// refused (or shown as passed) while its last day is still running. Through the real job card (captionOf) and the real Apply screen
// (postingVerdict, which the jobs page and the Telegram Confirm both run). The jobs page's own "Apply by" line is left as it is:
// tests/architect/scenarios-file-apply-battery.ts pins it to the UTC day (an owner/architect call). Pure: no network, no database.
import assertNode from "node:assert/strict";
import { deadlineOf, deadlinePassed, deadlineWords } from "../../supabase/functions/_shared/date_words.ts";
import { captionOf, postingVerdict, type JobView } from "../../supabase/functions/_shared/telegram_jobs.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const NOW = Date.parse("2026-11-01T15:00:00Z"); // Sunday, Nov 1, 2026 (US clocks went back at 2 AM local that morning)
const ET = "America/New_York", CT = "America/Chicago", PT = "America/Los_Angeles", LON = "Europe/London", TOKYO = "Asia/Tokyo";

Deno.test("deadlineWords: weekday + date + time + zone, in the person's zone; a calendar day is that day in every zone", () => {
  const rows: [string, string | null, string | null][] = [
    // A moment: the person's own clock and zone name.
    ["2026-11-06T23:59:00-05:00", ET, "Friday, Nov 6, 11:59 PM EST"],
    ["2026-11-06T23:59:00-05:00", CT, "Friday, Nov 6, 10:59 PM CST"],
    ["2026-11-06T23:59:00-05:00", PT, "Friday, Nov 6, 8:59 PM PST"],
    ["2026-11-06T23:59:00-05:00", TOKYO, "Saturday, Nov 7, 1:59 PM GMT+9"],
    ["2026-11-06T23:59:00-05:00", LON, "Saturday, Nov 7, 4:59 AM GMT"],
    // The DST edges: the zone name follows the date, not today.
    ["2026-10-31T17:00:00Z", CT, "Saturday, Oct 31, 12:00 PM CDT"],
    ["2026-11-02T17:00:00Z", CT, "Monday, Nov 2, 11:00 AM CST"],
    ["2027-03-14T12:00:00Z", ET, "Sunday, Mar 14, 2027, 8:00 AM EDT"],
    // No zone known (or one the runtime does not know): Chicago's, and the words say so.
    ["2026-11-06T23:59:00-05:00", null, "Friday, Nov 6, 10:59 PM CST (Chicago time)"],
    ["2026-11-06T23:59:00-05:00", "Mars/Olympus", "Friday, Nov 6, 10:59 PM CST (Chicago time)"],
    // A calendar day: the same day in every zone, no time, no zone (nothing to convert).
    ["2026-11-06", TOKYO, "Friday, Nov 6"],
    ["2026-11-06", PT, "Friday, Nov 6"],
    ["2026-11-06T00:00:00Z", PT, "Friday, Nov 6"],
    ["2026-11-06T00:00:00.000+00:00", null, "Friday, Nov 6"],
    ["2027-01-08", CT, "Friday, Jan 8, 2027"],
    // Not a date: nothing (never a guess).
    ["", CT, null], ["next Friday", CT, null], ["2026-02-31", CT, null], ["2026-11-06T23:59:00", CT, null],
  ];
  for (const [raw, tz, want] of rows) eq(deadlineWords(raw, NOW, tz), want, `${raw} in ${tz}`);
  for (const [raw] of rows) { const w = deadlineWords(raw, NOW, CT) ?? ""; ok(!/\b(soon|today|tomorrow|tonight|yesterday)\b/i.test(w), `no relative word: ${w}`); }
});

Deno.test("deadlinePassed: a moment passes at that moment; a calendar day only once it has ended everywhere", () => {
  const m = "2026-11-06T23:59:00-05:00";
  eq(deadlinePassed(m, Date.parse("2026-11-07T04:58:59Z")), false);
  eq(deadlinePassed(m, Date.parse("2026-11-07T04:59:00Z")), true);
  // "2026-11-06": still open on the evening of Nov 6 in Chicago (already Nov 7 in UTC) and in Honolulu late that night.
  eq(deadlinePassed("2026-11-06", Date.parse("2026-11-07T02:00:00Z")), false, "8 PM Chicago on the deadline day");
  eq(deadlinePassed("2026-11-06", Date.parse("2026-11-07T09:30:00Z")), false, "11:30 PM Honolulu on the deadline day");
  eq(deadlinePassed("2026-11-06", Date.parse("2026-11-07T12:00:00Z")), true, "the day has ended everywhere");
  eq(deadlinePassed("2026-11-06T00:00:00Z", Date.parse("2026-11-06T18:00:00Z")), false, "midnight UTC is a date-only source's calendar day");
  eq(deadlinePassed("not a date", NOW), false);
  eq(deadlineOf("2026-11-06")?.dateOnly, true);
});

const job = (deadline: string | null): JobView => ({ job_id: "greenhouse:acme:1", company: "Acme", title: "Data Analyst", location: "Austin, TX", url: "https://boards.greenhouse.io/acme/jobs/1",
  pay: "$90k", level: null, remote: null, posted_at: "2026-10-30T12:00:00Z", first_seen_at: null, deadline, source: "Greenhouse", reasons: [], gaps: [], company_domain: null });

Deno.test("the Telegram job card: 'Apply by' names the weekday, and a moment keeps its own day (never the UTC day)", () => {
  // 11:59 PM Eastern on Friday Nov 6 is 04:59 UTC on Nov 7: the card said "Apply by: Nov 7", a day late.
  const cap = captionOf(job("2026-11-06T23:59:00-05:00"), NOW);
  ok(/^Apply by: Friday, Nov 6, 10:59 PM CST \(Chicago time\)$/m.test(cap), cap);
  ok(!/Nov 7/.test(cap), cap);
  const day = captionOf(job("2026-11-06"), NOW);
  ok(/^Apply by: Friday, Nov 6$/m.test(day), day);
  ok(!/Apply by/.test(captionOf(job("rolling"), NOW)), "a deadline that is not a date is not shown as one");
});

Deno.test("the Apply screen: a date-only deadline is open all of its last day; once passed, the reason names the day exactly", () => {
  const row = { job_id: "greenhouse:acme:1", description: "<p>Build dashboards for the growth team.</p>" };
  const lastEvening = Date.parse("2026-11-07T02:00:00Z"); // 8 PM Friday Nov 6 in Chicago
  const v1 = postingVerdict(job("2026-11-06"), { ...row, deadline: "2026-11-06" }, [], false, lastEvening);
  ok(!/deadline/i.test(v1 ?? ""), `not refused on its last day: ${v1}`);
  const v2 = postingVerdict(job("2026-11-06"), { ...row, deadline: "2026-11-06" }, [], false, Date.parse("2026-11-08T15:00:00Z"));
  eq(v2, "its deadline to apply (Friday, Nov 6) has passed");
  const v3 = postingVerdict(job(null), { ...row, deadline: "2026-11-06T23:59:00-05:00" }, [], false, Date.parse("2026-11-07T05:00:00Z"));
  eq(v3, "its deadline to apply (Friday, Nov 6, 10:59 PM CST (Chicago time)) has passed");
});
