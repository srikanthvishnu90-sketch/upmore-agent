// WO-053 (architect): the posting's own location, read in the page by the same function the extension and the cloud
// worker run (scripts/career/page-functions.cjs fnPostingLocation), on every captured real application page
// (tests/fixtures/forms-ci) and on a Workday-shaped page whose only location is in its URL. Each expected text is what
// that page shows a person beside the job title. Nothing reaches the internet: every page is served from the fixtures.
// Needs Playwright and a Chromium (as tests/career-extension-browser.test.cjs); UPMORE_CHROMIUM_SANDBOX=off as root.
"use strict";
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { fnPostingLocation } = require("../scripts/career/page-functions.cjs");

let pw = null;
for (const id of [process.env.UPMORE_PLAYWRIGHT_PATH, "playwright", "/opt/node22/lib/node_modules/playwright"]) {
  if (!id) continue;
  try {
    pw = require(id);
    break;
  } catch { /* next */ }
}
const CHROME = [process.env.UPMORE_CHROMIUM_PATH, "/opt/pw-browsers/chromium"].find((p) => p && fs.existsSync(p));
const SANDBOX_OFF = process.env.UPMORE_CHROMIUM_SANDBOX === "off";
const FORMS = path.join(__dirname, "fixtures/forms-ci");

const EXPECTED = {
  "greenhouse-andurilindustries-4802172007": "Costa Mesa, California, United States; Fort Collins, Colorado, United States",
  "greenhouse-eosfitness-4336050009": "Mesa, AZ: Power Rd / Elliot Rd",
  "greenhouse-prolificacademicltd-4979452101": "Germany",
  "greenhouse-spacex-8643277002": "Hawthorne, CA",
  "greenhouse-wppmedia-5437567008": "London, United Kingdom",
  "lever-cgsfederal-0130d854-9bae-48d4-8ef0-e9da1ee778a5": "Atlanta, GA / Hybrid / Remote / Charlotte, NC",
  "lever-lyrahealth-35bffe8b-ac9f-4749-ba4c-5f3a4d2bd77d": "United States",
  "lever-shieldai-ba945088-38ec-4e58-8f66-01c0497a3bd3": "Abu Dhabi",
  "lever-tsmg-9e43a7f6-3476-482f-9cdd-ed5b73fb9df7": "Riyadh",
  "lever-veeva-9ac55b31-df46-4acb-b305-2c0b7ed56027": "New Jersey - Lyndhurst",
  "lever-weloglobal-6e0ac589-3fba-429a-8ce4-5c48a2cf0e2d": "Brazil",
  "ashby-airwallex-cba0ab2e-5ab8-416b-ac9b-115638e3c65c": "HK - Hong Kong SAR",
  "ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03": "San Francisco, CA - US",
  "ashby-harvey-977e6184-2dc4-422b-8ab3-bc26bb73f778": "San Francisco",
  "ashby-lilt-production-959498b8-a18e-457b-9e93-07662c38f3d3": "Spain (Remote); Basque (Remote)",
  "ashby-openai-8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3": "San Francisco",
  "ashby-snowflake-479e06f1-273d-4a1b-af56-6543761ebd75": "GB-London",
};

let browser, page;
before(async () => {
  assert.ok(pw, "PLAYWRIGHT_UNRESOLVABLE: set UPMORE_PLAYWRIGHT_PATH; nothing was downloaded");
  browser = await pw.chromium.launch({ headless: true, ...(CHROME ? { executablePath: CHROME } : {}), ...(SANDBOX_OFF ? { args: ["--no-sandbox"] } : { chromiumSandbox: true }) });
  page = await browser.newPage();
  // Every request is answered here; nothing leaves the machine.
  await page.route("**/*", (r) => r.fulfill({ status: 404, body: "" }));
});
after(async () => { if (browser) await browser.close(); });

async function at(url, html) {
  await page.unroute("**/*");
  await page.route("**/*", (r) => r.request().url() === url ? r.fulfill({ status: 200, contentType: "text/html", body: html }) : r.fulfill({ status: 404, body: "" }));
  await page.goto(url, { waitUntil: "domcontentloaded" });
  return page.evaluate(fnPostingLocation);
}

test("WO-053/R1 every captured real page: the location it shows beside the job", async () => {
  const files = fs.readdirSync(FORMS).filter((f) => f.endsWith(".html"));
  assert.deepEqual(files.map((f) => f.replace(/\.html$/, "")).sort(), Object.keys(EXPECTED).sort(), "one expectation per captured page");
  const got = {};
  for (const f of files) got[f.replace(/\.html$/, "")] = await at("https://example.test/" + f, fs.readFileSync(path.join(FORMS, f), "utf8"));
  assert.deepEqual(got, EXPECTED);
});

test("WO-053/R2 elsewhere: Workday's locations, a schema.org JobPosting, a Workday job URL; none shown is none", async () => {
  assert.equal(await at("https://acme.wd1.myworkdayjobs.com/en-US/External/job/X_R1/apply",
    `<div data-automation-id="locations"><dt>locations</dt><dd>Chicago, IL</dd></div>`), "Chicago, IL");
  assert.equal(await at("https://jobs.example.test/1", `<script type="application/ld+json">${JSON.stringify({ "@context": "https://schema.org", "@type": "JobPosting",
    jobLocation: [{ "@type": "Place", address: { addressLocality: "Austin", addressRegion: "TX", addressCountry: "US" } }] })}</script><form></form>`), "Austin, TX, US");
  assert.equal(await at("https://jobs.example.test/2", `<script type="application/ld+json">{"@type":"JobPosting","jobLocationType":"TELECOMMUTE"}</script>`), "Remote");
  assert.equal(await at("https://acme.wd1.myworkdayjobs.com/en-US/External/job/San-Francisco-CA/Staff-Engineer_JR-0042/apply/applyManually", "<form></form>"), "San Francisco, CA");
  assert.equal(await at("https://acme.wd1.myworkdayjobs.com/en-US/External/job/USA-IL-Chicago/Analyst_R123", "<form></form>"), "Chicago, IL, USA");
  assert.equal(await at("https://jobs.example.test/3", "<h1>Engineer</h1><form><label>Location<input name=location></label></form>"), "", "a form's own location box is the person's, not the job's");
});
