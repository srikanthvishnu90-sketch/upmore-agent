// WO-017: a board read for the first time brings its whole backlog in at once, all "first seen" now. A posting its employer
// published days before Trainee first saw it is a discovery, not news: it is searchable, but it is never an instant
// "New match" and never counted in the daily report's "in the last day". A posting with no publish time stays as before.
// Run: deno test -A --no-check tests/edge/career-backlog-alerts.test.ts
import { planProactive, DEFAULT_PREFS, type PlanUser } from "../../supabase/functions/_shared/career_alerts.ts";
import { freshWhenSeen, ingestBoards, memoryPostingsDb } from "../../supabase/functions/_shared/career_ingest.ts";

function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const NOW = Date.UTC(2026, 9, 19, 15); // 11:00 New York
const iso = (t: number) => new Date(t).toISOString();
const DAY = 86400000;
const user = (p: Partial<PlanUser> = {}): PlanUser => ({ id: "u1", tz: "America/New_York", prefs: { ...DEFAULT_PREFS, keywords: ["data analyst"] },
  last_checked_at: iso(NOW - 15 * 60000), instant_sent_today: 0, last_report_on: "2026-10-18", ...p });
const posting = (id: string, extra: Record<string, unknown> = {}) =>
  ({ job_id: `lever:acme:${id}`, title: "Data Analyst", company: "Acme", location: "Remote - US", url: `https://jobs.lever.co/acme/${id}`, first_seen_at: iso(NOW - 4 * 60000), closed_at: null, ...extra });

Deno.test("WO-017/A1 a backlog posting (published 90 days before first seen) is neither an instant alert nor in the day's count", () => {
  const out = planProactive({ users: [user()], now: NOW, postings: [
    posting("backlog", { posted_at: iso(NOW - 90 * DAY) }),
    posting("fresh", { posted_at: iso(NOW - 6 * 3600000) }),
    posting("unknown"), // no publish time: unchanged behavior
  ] }) as any[];
  eq(out.filter((o) => o.kind === "alert").map((o) => o.job_id).sort(), ["lever:acme:fresh", "lever:acme:unknown"]);
  const report = out.find((o) => o.kind === "report");
  eq(/2 matches in the last day/.test(report.text), true, report.text);
  eq(/backlog/.test(report.text), false, "a backlog posting is not in the report");
});

Deno.test("WO-017/A2 freshWhenSeen: published within 3 days before first seen; later updates or no time count as fresh", () => {
  const seen = iso(NOW);
  eq([iso(NOW - 2 * DAY), iso(NOW - 4 * DAY), iso(NOW + 3600000), undefined, "not a date"].map((t) => freshWhenSeen({ posted_at: t, first_seen_at: seen })),
    [true, false, true, true, true]);
});

Deno.test("WO-017/A3 a board's first read lands in search but not in newSince; its next new posting does", async () => {
  const db = memoryPostingsDb();
  const job = (id: string, posted: number) => ({ job_id: `greenhouse:newco:${id}`, ats_id: id, company: "NewCo", title: "Data Analyst", location: "Remote", url: `https://x.test/${id}`, posted_at: iso(posted) });
  const boards = [{ company: "NewCo", provider: "greenhouse", board: "newco" }];
  await ingestBoards({ boards, db, now: NOW, fetchFeed: async () => [job("old1", NOW - 40 * DAY), job("old2", NOW - 9 * DAY)] });
  eq((await db.search(["data", "analyst"], 10)).length, 2, "the backlog is searchable");
  eq((await db.newSince(iso(NOW - DAY))).map((p) => p.job_id), [], "the backlog is not news");
  await ingestBoards({ boards, db, now: NOW + 3600000, fetchFeed: async () => [job("old1", NOW - 40 * DAY), job("old2", NOW - 9 * DAY), job("new1", NOW + 1800000)] });
  eq((await db.newSince(iso(NOW - DAY))).map((p) => p.job_id), ["greenhouse:newco:new1"]);
});
