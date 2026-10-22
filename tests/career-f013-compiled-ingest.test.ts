// Synthetic F-013 QA: real compiled normalizer and ingestion/pool functions.
// No network, Supabase client, SQL, corpus, live posting, or source replacement.
import assert from "node:assert/strict";
import { boardFetchFeed, ingestBoards, memoryPostingsDb } from "../supabase/functions/_shared/career_ingest.ts";
import { CareerJobs } from "../supabase/functions/_shared/router_core.career.js";
import { CareerPool } from "../supabase/functions/_shared/career_pool.js";

const board = { provider: "ashby", board: "invented-f013", company: "Invented F013 Lab" };
const expectedUrl = "https://example.test/invented-f013";
const ownJob = (extra: Record<string, unknown>) => ({ id: "invented-f013", title: "Data Analyst", jobUrl: expectedUrl,
  descriptionPlain: "Analyze invented data for a synthetic fixture.", ...extra });
const profile = (preferences: Record<string, unknown>) => ({ skills: [], preferences, constraints: {} });
// Exact helper subset supplied by handler-career.ts; KB location is a text column.
const hostedJobs = { roleFamily: CareerJobs.roleFamily, seniorityBand: CareerJobs.seniorityBand, stripHtml: CareerJobs.stripHtml };

for (const [label, fields, expected] of [
  ["primary and every stated secondary", { location: "Chicago, IL", secondaryLocations: [{ location: "Boston, MA" }, { location: "Remote (Canada)" }] }, "Chicago, IL; Boston, MA; Remote (Canada)"],
  ["address-only primary", { location: { address: { postalAddress: { addressLocality: "Chicago", addressRegion: "IL", addressCountry: "USA" } } } }, "Chicago, IL, USA"],
  ["duplicate named location without invented address expansion", { location: "Chicago, IL", secondaryLocations: [{ location: "Chicago, IL", address: { postalAddress: { addressLocality: "Different fixture place" } } }] }, "Chicago, IL"],
  ["secondary-only source", { secondaryLocations: [{ locationName: "Boston, MA" }] }, "Boston, MA"],
  ["missing source", {}, "Location not stated"],
  ["ordinary primary positive control", { location: "Chicago, IL" }, "Chicago, IL"],
] as const) {
  Deno.test(`F013 actual compiled board read -> ingestion store: ${label}`, async () => {
    const calls: string[] = [];
    const fetchFeed = boardFetchFeed(async (url: string | URL | Request) => {
      calls.push(String(url));
      return new Response(JSON.stringify({ name: board.company, jobs: [ownJob(fields)] }), { status: 200, headers: { "content-type": "application/json" } });
    }, { timeoutMs: 1000 });
    const db = memoryPostingsDb();
    const result = await ingestBoards({ boards: [board], db, fetchFeed, now: Date.UTC(2026, 9, 22), maxBoards: 1 });
    assert.equal(calls.length, 1);
    assert.match(calls[0], /^https:\/\/api\.ashbyhq\.com\/posting-api\/job-board\/invented-f013\?includeCompensation=true$/);
    assert.equal(result.boards_failed, 0);
    assert.equal(result.new, 1);
    const rows = await db.all();
    assert.equal(rows.length, 1);
    assert.equal(rows[0].location, expected);
    assert.equal(rows[0].company, board.company);
    assert.equal(rows[0].url, expectedUrl);
    assert.equal(rows[0].job_id, "ashby:invented-f013:invented-f013");
  });
}

Deno.test("F013 actual hosted KB loader preserves stored multi-location text with production helper subset", async () => {
  let reads = 0;
  const result = await CareerPool.createKbPoolLoader({ jobs: hostedJobs, readRows: async (spec: {table: string}) => {
    reads++;
    assert.equal(spec.table, "career_kb_postings");
    return [{ posting_key: "invented-f013", source: "ashby", company: board.company, title: "Data Analyst", url: expectedUrl,
      location: "Chicago, IL; Boston, MA", fetched_on: "2026-10-22" }];
  } }).loadPool();
  assert.equal(reads, 1);
  assert.equal(result.error, null);
  assert.equal(result.postings.length, 1);
  assert.equal(result.postings[0].location, "Chicago, IL; Boston, MA");
  assert.equal(result.fetchedOn, "2026-10-22");
});

Deno.test("F013 actual hosted KB unknown remains unknown through compiled scoring", async () => {
  const result = await CareerPool.createKbPoolLoader({ jobs: hostedJobs, readRows: async () => [
    { posting_key: "invented-f013", source: "ashby", title: "Data Analyst", url: expectedUrl, location: "" },
  ] }).loadPool();
  assert.equal(result.postings[0].location, "Location not stated");
  const geographic = CareerJobs.scoreFit(result.postings[0], profile({ locations: ["Location"] }));
  assert.equal(geographic.excluded, true);
  assert.ok(geographic.reasons.some((reason: string) => reason.includes("does not state a location")));
  const remote = CareerJobs.scoreFit(result.postings[0], profile({ remote_only: true }));
  assert.equal(remote.excluded, true);
  assert.ok(remote.reasons.some((reason: string) => reason.includes("does not confirm remote work")));
  assert.ok(remote.reasons.every((reason: string) => !reason.includes("posting is on-site")));
});
