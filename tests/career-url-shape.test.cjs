"use strict";
/* F-010 URL-SHAPE GUARD — fail-first suite (DISCO-QUALITY, 2026-10-21).
   Fixtures: the junk rows and posting rows are the AUDITED URLs from the F-003
   link audit (the 2026-10-20 job-link audit file, 60 links,
   fetched + content-checked 2026-10-20), copied verbatim. Synthetic shapes are
   labeled as such. The guard classifies URL SHAPE only — never liveness. */
const test = require("node:test");
const assert = require("node:assert/strict");
const Shape = require("../packages/domain/166-career-url-shape.js");

// ---- the audited junk (must be not_posting) ----
const JUNK = [
  // nyc-open-data: Socrata dataset API endpoints served to users as "job links"
  ["https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=804297", "api_endpoint"],
  ["https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=789321", "api_endpoint"],
  ["https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=799331", "api_endpoint"],
  ["https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=797143", "api_endpoint"],
  ["https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=790014", "api_endpoint"],
  ["https://data.cityofnewyork.us/resource/kpav-sd4t.json?job_id=770018", "api_endpoint"],
  // hn-algolia: Hacker News discussion threads, not postings
  ["https://news.ycombinator.com/item?id=49994263", "thread"],
  ["https://news.ycombinator.com/item?id=49924889", "thread"],
];
// ---- synthetic junk shapes (generalization, not in the audit) ----
const JUNK_SYNTHETIC = [
  ["https://data.cityofchicago.org/resource/abc1-def2.json?$limit=10", "api_endpoint"], // another Socrata host
  ["https://api.ashbyhq.com/posting-api/job-board/openai", "api_endpoint"],              // ATS data API, not a posting page
  ["https://job-boards.greenhouse.io/planetscale", "search_or_listing"],                 // board root, no job id
  ["https://jobs.lever.co/palantir", "search_or_listing"],                               // board root, no job id
  ["https://jobs.ashbyhq.com/openai", "search_or_listing"],                              // board root, no job id
  ["https://example.com/job-search?q=intern", "search_or_listing"],                      // search page
  ["", "invalid"],
  ["not a url", "invalid"],
  [null, "invalid"],
];
// ---- audited real postings (must be posting) ----
const POSTINGS = [
  "https://job-boards.greenhouse.io/planetscale/jobs/4395260009",
  "https://databricks.com/company/careers/open-positions/job?gh_jid=8755666002", // employer-hosted greenhouse wrapper
  "https://veracyte.com/job-detail?gh_jid=5233903007",
  "https://stripe.com/jobs/search?gh_jid=5416444", // audited: employer's route is NAMED search; gh_jid is the posting identity
  "https://jobs.ashbyhq.com/sierra/f3308520-6d7d-45ac-b96d-3f5a5012e6c9",
  "https://jobs.ashbyhq.com/openai/f8b84ae5-743b-41c9-8432-02dff9993d6b",
  "https://jobs.lever.co/palantir/bb7af139-064c-4a59-a784-9ba8c4324d21",
  "https://tysonfoods.wd5.myworkdayjobs.com/en-US/TSN/job/Vicksburg-Plant---Vicksburg-Mississippi/Skilled-Operator-All-Shifts-Vicksburg_R0489264-1",
  "https://www.themuse.com/jobs/walmart/retail-customer-service-associate-7c91bd",
  "https://www.arbeitnow.com/jobs/companies/legartis/legal-ai-counsel-berlin-or-leipzig-147252",
  "https://jobicy.com/jobs/153112-staff-information-security-engineer-ai-first",
  "https://remoteOK.com/remote-jobs/remote-junior-crypto-analyst-trader-empire-assets-1137460",
  "https://remotive.com/remote-jobs/software-development/senior-react-full-stack-developer-2091133",
];
// ---- neither junk nor a recognized posting grammar: must stay unknown ----
const UNKNOWN = [
  "https://careers.example-corp.com/some-custom-path",     // unclassifiable: never silently "posting"
  "https://blog.example.com/we-are-hiring",                // a blog post about hiring is not a posting shape
];

for (const [url, shape] of [...JUNK, ...JUNK_SYNTHETIC]) {
  test(`not_posting: ${url}`, () => {
    const r = Shape.classifyPostingUrl(url);
    assert.equal(r.verdict, "not_posting", JSON.stringify(r));
    assert.equal(r.shape, shape, JSON.stringify(r));
    assert.ok(Array.isArray(r.reasons) && r.reasons.length > 0);
  });
}
for (const url of POSTINGS) {
  test(`posting: ${url}`, () => {
    const r = Shape.classifyPostingUrl(url);
    assert.equal(r.verdict, "posting", JSON.stringify(r));
    assert.ok(r.reasons.length > 0);
  });
}
for (const url of UNKNOWN) {
  test(`unknown: ${url}`, () => {
    const r = Shape.classifyPostingUrl(url);
    assert.equal(r.verdict, "unknown", JSON.stringify(r));
  });
}
test("isPostingUrl agrees with classifyPostingUrl", () => {
  for (const url of POSTINGS) assert.equal(Shape.isPostingUrl(url), true);
  for (const [url] of [...JUNK, ...JUNK_SYNTHETIC]) assert.equal(Shape.isPostingUrl(url), false);
  for (const url of UNKNOWN) assert.equal(Shape.isPostingUrl(url), false); // unknown is NOT a posting
});
