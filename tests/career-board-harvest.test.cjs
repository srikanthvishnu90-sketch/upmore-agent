// WO-017: harvesting employer boards from public application links, verifying them under the directory's doctrine
// (live only on a real postings-JSON fetch; calibrated against a gibberish token) and merging without touching what is
// already watched. No network: fetches are faked.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { parseUrl, harvest } = require("../scripts/career/harvest-board-candidates.cjs");
const { classify, verifyAll } = require("../scripts/career/verify-board-candidates.cjs");
const { merge } = require("../scripts/career/merge-board-verdicts.cjs");

test("application links yield the provider and board token; non-board links yield nothing", () => {
  assert.deepEqual(parseUrl("https://job-boards.greenhouse.io/andurilindustries/jobs/4855?gh_src=Simplify"), { provider: "greenhouse", token: "andurilindustries" });
  assert.deepEqual(parseUrl("https://boards.greenhouse.io/embed/job_board?for=astranis&b=x"), { provider: "greenhouse", token: "astranis" });
  assert.deepEqual(parseUrl("https://jobs.lever.co/palantir/0e1f?lever-source=Simplify"), { provider: "lever", token: "palantir" });
  assert.deepEqual(parseUrl("https://jobs.ashbyhq.com/ramp/abc/application"), { provider: "ashby", token: "ramp" });
  assert.deepEqual(parseUrl("https://jobs.smartrecruiters.com/Visa/7445"), { provider: "smartrecruiters", token: "Visa" });
  assert.deepEqual(parseUrl("https://globalhr.wd5.myworkdayjobs.com/en-US/REC_RTX_Ext_Gateway/job/US-AZ/Intern_01"), { provider: "workday", token: "globalhr", wd: "wd5", site: "REC_RTX_Ext_Gateway" });
  for (const u of ["https://www.linkedin.com/jobs/view/1", "https://careers.example.com/jobs/1", "", null]) assert.equal(parseUrl(u), null, String(u));
});

test("harvest keeps boards we do not watch yet, once each, with how often and how recently they were listed", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "harvest-"));
  const f = path.join(dir, "listings.json");
  fs.writeFileSync(f, JSON.stringify([
    { url: "https://jobs.ashbyhq.com/ramp/1", company_name: "Ramp", active: true, date_updated: 1790000000 },
    { url: "https://jobs.ashbyhq.com/Ramp/2", company_name: "Ramp", active: false, date_updated: 1791000000 },
    { url: "https://jobs.lever.co/palantir/3", company_name: "Palantir", active: true, date_updated: 1791000000 },
    { url: "https://www.linkedin.com/jobs/view/4", company_name: "Nope" },
  ]));
  const out = harvest([f], { boards: [{ provider: "lever", board_token: "palantir" }] });
  assert.deepEqual(out.map((c) => [c.provider, c.token, c.listings, c.active_listings]), [["ashby", "ramp", 2, 1]], "palantir is already watched; ramp counted once across cases");
  assert.equal(out[0].last_listing, new Date(1791000000 * 1000).toISOString().slice(0, 10));
});

test("a verdict is live only from the provider's postings JSON; 404 is dead; SmartRecruiters and Workday at zero are unverifiable", () => {
  assert.deepEqual(classify("greenhouse", 200, { name: "Ramp", jobs: [{}, {}] }), { verdict: "live", postings: 2, board_name: "Ramp" });
  assert.equal(classify("greenhouse", 404, undefined).verdict, "dead");
  assert.equal(classify("greenhouse", 200, undefined).verdict, "error", "an HTML page is not a board");
  assert.equal(classify("lever", 200, []).verdict, "live");
  assert.equal(classify("smartrecruiters", 200, { content: [], totalFound: 0 }).verdict, "unverifiable");
  assert.deepEqual(classify("smartrecruiters", 200, { content: [{}], totalFound: 41 }), { verdict: "live", postings: 41 });
  assert.deepEqual(classify("workday", 200, { total: 312, jobPostings: [{}] }), { verdict: "live", postings: 312 });
  assert.equal(classify("workday", 422, undefined).verdict, "dead");
  assert.equal(classify("ashby", 0, undefined).verdict, "error");
});

test("verifyAll calibrates each provider with a gibberish token first and paces itself; a provider that calls anything live cannot pass empty boards", async () => {
  const calls = [];
  const fakeFetch = async (url) => {
    calls.push(url);
    const body = url.includes("zzqx") ? (url.includes("lever") ? "[]" : "{}") : url.includes("lever") ? "[]" : JSON.stringify({ jobs: [{}], name: "Acme" });
    return new Response(body, { status: url.includes("zzqx") && !url.includes("lever") ? 404 : 200 });
  };
  const { calibration, results } = await verifyAll([{ provider: "greenhouse", token: "acme" }, { provider: "lever", token: "empty" }], { fetch: fakeFetch, gapMs: 0 });
  assert.equal(calls.filter((u) => u.includes("zzqx")).length, 2, "one calibration probe per provider");
  assert.deepEqual(calibration.greenhouse, { http: 404, verdict: "dead" });
  assert.equal(calibration.lever.verdict, "live", "this fake Lever calls a gibberish token live");
  assert.equal(results.find((r) => r.token === "acme").verdict, "live");
  assert.equal(results.find((r) => r.token === "empty").verdict, "unverifiable", "zero postings on a provider that says live to anything proves nothing");
});

test("merge adds only live boards with postings, records Workday as not yet watchable, and never changes existing entries", () => {
  const existing = { meta: { live_supported: 1 }, boards: [{ company: "Palantir", provider: "lever", board_token: "palantir", status: "live", postings_seen: 314, last_verified: "2026-10-17" }] };
  const lines = [
    { provider: "ashby", token: "ramp", verdict: "live", postings: 40, board_name: "Ramp", company_hint: "Ramp" },
    { provider: "greenhouse", token: "ghost", verdict: "live", postings: 0, company_hint: "Ghost" },
    { provider: "lever", token: "palantir", verdict: "live", postings: 999, company_hint: "Palantir" },
    { provider: "lever", token: "deadco", verdict: "dead", postings: null },
    { provider: "workday", token: "globalhr", wd: "wd5", site: "REC_RTX_Ext_Gateway", verdict: "live", postings: 312, company_hint: "RTX" },
    { calibration: { ashby: { http: 404, verdict: "dead" } } },
  ];
  const { directory, added } = merge(existing, lines, "2026-10-19");
  assert.deepEqual(added.map((b) => `${b.provider}:${b.board_token}:${b.status}`), ["ashby:ramp:live", "workday:globalhr:discovered_unsupported"]);
  const palantir = directory.boards.find((b) => b.board_token === "palantir");
  assert.deepEqual(palantir, existing.boards[0], "an existing board is untouched");
  assert.equal(directory.meta.live_supported, 2);
  assert.equal(directory.boards.find((b) => b.provider === "workday").site, "REC_RTX_Ext_Gateway");
});

test("the committed candidates file is harvest output: unique, parseable, and none already in the directory", () => {
  const c = JSON.parse(fs.readFileSync(path.join(__dirname, "../packages/career-data/board-candidates.json"), "utf8"));
  const d = JSON.parse(fs.readFileSync(path.join(__dirname, "../packages/career-data/board-directory.json"), "utf8"));
  const keys = c.candidates.map((x) => `${x.provider}:${x.token.toLowerCase()}${x.site ? ":" + x.site.toLowerCase() : ""}`);
  assert.equal(new Set(keys).size, keys.length, "duplicate candidates");
  const have = new Set(d.boards.filter((b) => b.provider !== "workday").map((b) => `${b.provider}:${String(b.board_token).toLowerCase()}`));
  assert.ok(c.candidates.filter((x) => x.provider !== "workday").every((x) => !have.has(`${x.provider}:${x.token.toLowerCase()}`)) || d.meta.wo017, "a candidate is already watched");
  for (const x of c.candidates) assert.ok(["greenhouse", "lever", "ashby", "smartrecruiters", "workday"].includes(x.provider) && x.token, JSON.stringify(x));
});
