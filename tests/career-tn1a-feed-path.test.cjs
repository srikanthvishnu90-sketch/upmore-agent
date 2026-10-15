"use strict";
// BUG-210 / FR-368 (MI-030, Crew A, 2026-10-15): TN-1a through the FEED
// path. A posting whose payload names no company — and whose feed
// descriptor states none — must arrive company-less (company: null +
// company_not_stated: true). The board token is an address, never a
// company; rendering it as one fabricates an attribution (the owner's
// TN-1a ruling, 2026-10-14: the record carries company not stated,
// never invented). Company sources, in order: the payload's own name,
// then the feed descriptor's stated company (registry boards carry one).
const test = require("node:test");
const assert = require("node:assert/strict");
const Jobs = require("../packages/domain/121-career-jobs.js");

const GH_JOB = { title: "Software Engineer", requisition_id: "REQ-1", location: { name: "New York, NY" }, absolute_url: "https://boards.example/j/1", content: "Build things." };
const LEVER_JOB = { text: "Product Designer", id: "lv-1", categories: { location: "Remote" }, hostedUrl: "https://jobs.lever.co/x/1", descriptionPlain: "Design things." };
const ASHBY_JOB = { title: "Data Analyst", id: "ab-1", location: "Chicago, IL", jobUrl: "https://jobs.ashbyhq.com/x/1", descriptionPlain: "Analyze things." };
const SR_JOB = { name: "Support Specialist", id: "sr-1", location: { city: "Austin", region: "TX", country: "US" }, jobAd: { sections: {} } };

test("BUG-210: a Greenhouse payload with no board name yields company-not-stated, never the token", () => {
  const out = Jobs.normalizeGreenhouse({ jobs: [GH_JOB] }, "opaque-board-9");
  assert.equal(out.length, 1);
  assert.equal(out[0].company, null, `company must be null, got ${JSON.stringify(out[0].company)}`);
  assert.equal(out[0].company_not_stated, true);
  assert.ok(!JSON.stringify(out[0]).includes('"opaque-board-9"') || out[0].url.includes("opaque-board-9"), "the token may appear in a URL, never as the company");
});

test("BUG-210: a Lever payload (which never names a company) yields company-not-stated without a descriptor company", () => {
  const out = Jobs.normalizeLever([LEVER_JOB], "opaque-board-9");
  assert.equal(out[0].company, null);
  assert.equal(out[0].company_not_stated, true);
});

test("BUG-210: an Ashby payload with no board name yields company-not-stated", () => {
  const out = Jobs.normalizeAshby({ jobs: [ASHBY_JOB] }, "opaque-board-9");
  assert.equal(out[0].company, null);
  assert.equal(out[0].company_not_stated, true);
});

test("BUG-210: a SmartRecruiters posting with no company object yields company-not-stated", () => {
  const out = Jobs.normalizeSmartRecruiters({ content: [SR_JOB] }, "opaque-board-9");
  assert.equal(out[0].company, null);
  assert.equal(out[0].company_not_stated, true);
});

test("BUG-210: the payload's own company name wins and is stated", () => {
  const gh = Jobs.normalizeGreenhouse({ name: "Acme Corp", jobs: [GH_JOB] }, "acme");
  assert.equal(gh[0].company, "Acme Corp");
  assert.equal(gh[0].company_not_stated, false);
  const sr = Jobs.normalizeSmartRecruiters({ content: [Object.assign({}, SR_JOB, { company: { name: "Globex" } })] }, "globex");
  assert.equal(sr[0].company, "Globex");
  assert.equal(sr[0].company_not_stated, false);
});

test("BUG-210: the feed descriptor's stated company is used when the payload is silent (registry boards)", async () => {
  const feed = { source: "lever", company_token: "acme", company: "Acme Corp", url: "https://api.lever.co/v0/postings/acme?mode=json" };
  const res = await Jobs.fetchFeed(feed, { fetch: async () => ({ status: 200, json: async () => [LEVER_JOB] }) });
  assert.equal(res.postings.length, 1);
  assert.equal(res.postings[0].company, "Acme Corp");
  assert.equal(res.postings[0].company_not_stated, false);
});

test("BUG-210: fetchFeed end to end — a silent payload on a company-less descriptor arrives not-stated", async () => {
  const feed = { source: "greenhouse", company_token: "opaque-board-9", url: "https://boards-api.greenhouse.io/v1/boards/opaque-board-9/jobs?content=true" };
  const res = await Jobs.fetchFeed(feed, { fetch: async () => ({ status: 200, json: async () => ({ jobs: [GH_JOB] }) }) });
  assert.equal(res.postings[0].company, null);
  assert.equal(res.postings[0].company_not_stated, true);
});

test("BUG-210: not-stated postings survive dedupe with the marker and a stable job_id", () => {
  const a = Jobs.normalizeGreenhouse({ jobs: [GH_JOB] }, "opaque-board-9");
  const b = Jobs.normalizeGreenhouse({ jobs: [GH_JOB] }, "opaque-board-9");
  assert.equal(a[0].job_id, b[0].job_id, "job_id must be stable across identical fetches");
  const merged = Jobs.dedupe([...a, ...b]);
  assert.equal(merged.length, 1);
  assert.equal(merged[0].company, null);
  assert.equal(merged[0].company_not_stated, true);
});
