// WO-017: the persona coverage measure counts what search_jobs would return in the person's place, title matches, and
// postings from the last 7 days, before and after; a board that fails to read is counted as failed, never as empty.
import { countFor, measure, PERSONAS } from "../../evals/career/coverage-personas.ts";

function assertEquals(a: unknown, b: unknown) { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${x} !== ${y}`); }
const NOW = Date.parse("2026-10-19T12:00:00Z");
const job = (title: string, location: string, daysAgo: number, description = "") =>
  ({ job_id: `x:${title}:${location}`, ats_id: "1", company: "Acme", title, location, url: "https://x.test/1", description, posted_at: new Date(NOW - daysAgo * 86400_000).toISOString() });

Deno.test("a persona counts only postings in its place; title matches and the last 7 days are counted apart", () => {
  const p = PERSONAS.find((x) => x.id === "P02")!; // data analyst in New York
  const pool = [job("Data Analyst", "New York, NY", 2), job("Senior Data Analyst", "Brooklyn, NY", 30), job("Data Analyst", "Austin, TX", 1),
    job("Engineer", "New York, NY", 1, "work with our data analyst team")];
  assertEquals(countFor(pool, p, NOW), { open: 3, title_match: 2, new_7d: 1 });
});

Deno.test("the US persona reads 'City, ST', a country name or remote, and not a foreign country code in lower case", () => {
  const p = PERSONAS.find((x) => x.id === "P01")!;
  const pool = [job("Software Engineer", "Seattle, WA", 1), job("Software Engineer", "Remote", 1), job("Software Engineer", "London, United Kingdom", 1),
    job("Software Engineer", "United States", 1), job("Software Engineer", "Campus Town", 1)];
  assertEquals(countFor(pool, p, NOW).title_match, 3);
});

Deno.test("measure reads each board once, sums before and after, and reports failed reads", async () => {
  const feeds: Record<string, any> = { "greenhouse:old": [job("Data Analyst", "New York, NY", 1)], "ashby:new": [job("Data Analyst", "NYC", 3)] };
  let reads = 0;
  const r = await measure({ before: [{ company: "Old", provider: "greenhouse", board: "old" }],
    after: [{ company: "Old", provider: "greenhouse", board: "old" }, { company: "New", provider: "ashby", board: "new" }, { company: "Gone", provider: "lever", board: "gone" }],
    now: NOW, personas: PERSONAS.filter((x) => x.id === "P02"),
    fetchFeed: async (b) => { reads++; const f = feeds[`${b.provider}:${b.board}`]; if (!f) throw new Error("HTTP 500"); return f; } });
  assertEquals(reads, 3);
  assertEquals(r.boards, { before: 1, after: 3, read: 2, failed: 1 });
  assertEquals([r.rows[0].before.title_match, r.rows[0].after.title_match], [1, 2]);
  assertEquals([r.storage.before.rows, r.storage.after.rows], [1, 2]);
});
