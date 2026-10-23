// F3 — THE ONBOARDING OUTCOME IN A REAL BROWSER (coordinator review
// 2026-10-23, item 5: prove the outcome, not just the steps).
// Playwright drives the REAL flow (src/career-onboarding.js) over the
// REAL product models (122 master profile + typed resume ingest, 121
// profileFromPersona + scoreFit), styled by the REAL component CSS
// (src/career-onboarding.css), assembled the way a host page assembles
// them. The host seam is the flow's own contract: the profile object is
// the store, persisted after every answer (here: localStorage), so a
// reload resumes from the stored profile alone — no stubs anywhere in
// the scoring/matching path.
//
// A wholly synthetic person (Rowan Ellery, Lakeview State University)
// completes name -> resume (paste) -> target roles -> first reviewed
// match against a SYNTHETIC postings pool (fictional employers, .invalid
// URLs). The batch-outcome invariant is asserted on the rendered match
// screen: the kept postings are LISTED, every dropped posting is shown
// WITH the rule that dropped it, and kept + dropped-with-reason account
// for the whole pool (3 kept / 3 dropped / 6 considered — the partition
// the real 121 matcher produces for this pool, derived in Node from the
// same modules before this file was written).
//
// Browser posture: sandboxed Chromium wherever the host allows it; the
// operator opt-out posture (UPMORE_CHROMIUM_SANDBOX=off, the product's
// own posture env) only where the host cannot initialize a sandbox at
// all — the posture is printed, never hidden. On this VM the sandboxed
// launch fails with "Chromium sandboxing failed!" (measured 2026-10-23),
// so runs here use the opt-out.
// Check: UPMORE_PLAYWRIGHT_PATH=<playwright> UPMORE_CHROMIUM_SANDBOX=off node --test tests/career-onboarding-f3-browser.test.cjs
// Screenshots: set F3_SCREENSHOT_DIR to also capture the outcome screens.
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const { chromium } = require(process.env.UPMORE_PLAYWRIGHT_PATH || "playwright");
const PROFILE_SRC = fs.readFileSync(path.join(root, "packages/domain/122-career-profile.js"), "utf8");
const JOBS_SRC = fs.readFileSync(path.join(root, "packages/domain/121-career-jobs.js"), "utf8");
const FLOW_SRC = fs.readFileSync(path.join(root, "src/career-onboarding.js"), "utf8");
const FLOW_CSS = fs.readFileSync(path.join(root, "src/career-onboarding.css"), "utf8");
const POSTURE = (process.env.UPMORE_CHROMIUM_SANDBOX || "on").toLowerCase();
const SHOT_DIR = process.env.F3_SCREENSHOT_DIR || null;
let browser, page;
before(async () => {
  console.log(`F3 BROWSER POSTURE: UPMORE_CHROMIUM_SANDBOX=${POSTURE} (chromiumSandbox=${POSTURE !== "off"})`);
  browser = await chromium.launch({
    headless: true, chromiumSandbox: POSTURE !== "off",
    ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}),
    timeout: 60000,
  });
  if (SHOT_DIR) fs.mkdirSync(SHOT_DIR, { recursive: true });
});
after(async () => { if (browser) await browser.close(); });

const NOW = Date.parse("2026-10-23T14:00:00.000Z");
const RESUME_TEXT = [
  "Rowan Ellery — synthetic resume for the F3 browser proof",
  "Experience",
  "Data Intern, Nimbus Cartography Studio",
  "- Built SQL dashboards in Python for weekly reporting",
  "- Cleaned survey data in Excel for the mapping team",
  "Skills",
  "SQL, Python, Excel",
  "Education",
  "Lakeview State University, Computer Science, class of 2029",
].join("\n");
// The pool: 3 kept by the real matcher (in-family, no hard fail), 3 dropped,
// each by a DIFFERENT named rule (role family / clearance / work authorization).
const POOL = [
  { job_id: "syn-1", company: "Northwind Cartographers", title: "Data Analyst Intern", role_family: "Data/ML", seniority_band: "intern", location: "Chicago, IL", remote: "hybrid", url: "https://jobs.northwind-cartographers.invalid/postings/1", posted_at: "2026-10-20", jd_text: "Data Analyst Intern using SQL and Python to build dashboards and weekly reporting for the cartography analytics team.", source: "SYNTHETIC" },
  { job_id: "syn-2", company: "Fable & Finch Analytics", title: "Business Intelligence Intern", role_family: "Data/ML", seniority_band: "intern", location: "Remote", remote: "remote", url: "https://jobs.fableandfinch.invalid/postings/2", posted_at: "2026-10-20", jd_text: "Business Intelligence Intern writing SQL queries and Excel reporting for client dashboards on the analytics team.", source: "SYNTHETIC" },
  { job_id: "syn-3", company: "Cobalt Metrics Group", title: "Junior Data Analyst", role_family: "Data/ML", seniority_band: "entry", location: "Chicago, IL", remote: "onsite", url: "https://jobs.cobaltmetrics.invalid/postings/3", posted_at: "2026-10-19", jd_text: "Junior Data Analyst using Python and SQL to analyze product data and publish reporting for the metrics team.", source: "SYNTHETIC" },
  { job_id: "syn-4", company: "Halloway Legal LLP", title: "Paralegal", role_family: "Law", seniority_band: "entry", location: "Chicago, IL", remote: "onsite", url: "https://jobs.hallowaylegal.invalid/postings/4", posted_at: "2026-10-19", jd_text: "Paralegal supporting litigation attorneys with filings, discovery and legal research.", source: "SYNTHETIC" },
  { job_id: "syn-5", company: "Sentinel Grid Systems", title: "Data Analyst Intern", role_family: "Data/ML", seniority_band: "intern", location: "Chicago, IL", remote: "hybrid", url: "https://jobs.sentinelgrid.invalid/postings/5", posted_at: "2026-10-18", jd_text: "Data Analyst Intern using SQL dashboards for grid telemetry. Applicants must hold an active Top Secret security clearance.", source: "SYNTHETIC" },
  { job_id: "syn-6", company: "Meridian Ledger Co", title: "Data Analyst Intern", role_family: "Data/ML", seniority_band: "intern", location: "Chicago, IL", remote: "hybrid", url: "https://jobs.meridianledger.invalid/postings/6", posted_at: "2026-10-18", jd_text: "Data Analyst Intern using SQL and Python for ledger reporting. U.S. citizens only.", source: "SYNTHETIC" },
];
const KEPT_IDS = ["syn-1", "syn-2", "syn-3"];
const DROP_RULES = { "syn-4": /role family/, "syn-5": /clearance/, "syn-6": /work authorization/ };

async function surface(t) {
  const pg = await browser.newPage({ viewport: { width: 1100, height: 900 } });
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>F3 onboarding</title>
<style>${FLOW_CSS}</style></head>
<body><main id="host"></main>
<script>${PROFILE_SRC}</script>
<script>${JOBS_SRC}</script>
<script>${FLOW_SRC}</script>
<script>
window.__pool = ${JSON.stringify(POOL)};
window.__now = ${NOW};
const KEY = "f3-browser-proof:profile";
let profile = null;
try { profile = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) {}
if (!profile) profile = CareerProfile.createProfile({ id: "profile-f3-browser", user_id: "user-test-f3-browser", isTestFixture: true, label: "SYNTHETIC — F3 browser proof" });
window.__profile = profile;
window.__session = TraineeOnboarding.mount(document.getElementById("host"), {
  profile, postings: window.__pool, now: () => window.__now, owner: "user-test-f3-browser",
  save: (p) => localStorage.setItem(KEY, JSON.stringify(p)),
});
</script>
</body></html>`;
  await pg.route("**/*", (route) => {
    if (route.request().url() === "https://onboarding.f3.test/") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html });
    }
    return route.abort();
  });
  await pg.goto("https://onboarding.f3.test/");
  return pg;
}
const stepOf = (pg) => pg.locator("[data-f3-step]").getAttribute("data-f3-step");

test("full flow in a real browser: name -> resume paste -> roles -> first reviewed match, batch outcome accounted for", { timeout: 120000 }, async (t) => {
  page = await surface(t);
  // 1 — name
  assert.equal(await stepOf(page), "name");
  await page.locator("[data-f3-name-input]").fill("Rowan Ellery");
  await page.locator("[data-f3-continue]").click();
  // 2 — resume, pasted text, saved
  assert.equal(await stepOf(page), "resume");
  await page.locator("[data-f3-resume-input]").fill(RESUME_TEXT);
  await page.locator("[data-f3-continue]").click();
  // 3 — target roles
  assert.equal(await stepOf(page), "roles");
  await page.locator("[data-f3-roles-input]").fill("Data Analyst");
  await page.locator("[data-f3-goal-input]").fill("a data analyst internship for summer 2027");
  await page.locator("[data-f3-continue]").click();
  // 4 — the first reviewed match screen
  assert.equal(await stepOf(page), "match");
  if (SHOT_DIR) await page.locator('[data-f3-step="match"]').screenshot({ path: path.join(SHOT_DIR, "match-screen.png") });

  // coverage: the whole pool is accounted for in the header counts
  const coverage = await page.locator(".f3-coverage").innerText();
  assert.equal(coverage, "Postings considered 6 · kept 3/6 · dropped 3/6");
  const considered = Number(coverage.match(/considered (\d+)/)[1]);
  assert.equal(considered, POOL.length, "considered == the seeded pool size");

  // the featured card is the top kept posting, with the F2 slot bound to it
  const card = page.locator("[data-f3-match]");
  assert.equal(await card.count(), 1);
  assert.ok((await card.innerText()).includes("Data Analyst Intern — Northwind Cartographers"));
  assert.equal(await page.locator("[data-f3-card-slot]").getAttribute("data-job-id"), "syn-1");

  // THE INVARIANT, kept side: every kept posting is LISTED on the screen
  const keptItems = page.locator("[data-f3-kept]");
  assert.equal(await keptItems.count(), KEPT_IDS.length, "every kept posting is listed, not only the featured match");
  const keptIds = (await keptItems.evaluateAll((els) => els.map((e) => e.getAttribute("data-job-id")))).sort();
  assert.deepEqual(keptIds, [...KEPT_IDS].sort());
  const keptText = await keptItems.evaluateAll((els) => els.map((e) => e.textContent));
  for (const id of KEPT_IDS) {
    const item = keptText[keptIds.indexOf(id)];
    const posting = POOL.find((p) => p.job_id === id);
    assert.ok(item.includes(posting.title) && item.includes(posting.company) && item.includes("kept"), `kept listing names ${id}: ${item}`);
  }

  // THE INVARIANT, dropped side: every dropped posting shown WITH its rule
  const droppedItems = page.locator("[data-f3-dropped]");
  assert.equal(await droppedItems.count(), Object.keys(DROP_RULES).length, "every dropped posting is listed");
  for (const [id, rule] of Object.entries(DROP_RULES)) {
    const mine = page.locator(`[data-f3-dropped][data-job-id="${id}"]`);
    assert.equal(await mine.count(), 1, `dropped listing carries ${id}`);
    const text = await mine.innerText();
    const posting = POOL.find((p) => p.job_id === id);
    assert.ok(text.includes(posting.title) && text.includes(posting.company), `dropped listing names ${id}`);
    assert.ok(text.includes("dropped"), `dropped listing says dropped for ${id}`);
    assert.match(text, rule, `dropped listing names the rule for ${id}: ${text}`);
  }

  // accounting closes: listed kept + listed dropped == considered == pool
  assert.equal((await keptItems.count()) + (await droppedItems.count()), considered);

  // the answers rode the real stores: name, roles, and the flow's own stored
  // answers (source web-onboarding) carry the onboarding provenance — the
  // resume-ingest facts keep 122's own shape and are out of this claim's scope
  const state = await page.evaluate(() => ({
    name: window.__profile.basics.name,
    roles: window.__profile.preferences.roles,
    ownAnswers: window.__profile.facts.filter((f) => f.source === "web-onboarding").map((f) => ({ title: f.title || f.name, provenance: f.provenance })),
    step: window.__session.currentStep(),
  }));
  assert.equal(state.name, "Rowan Ellery");
  assert.deepEqual(state.roles, ["Data Analyst"]);
  assert.deepEqual(state.ownAnswers.map((f) => f.title), ["Full name", "Target roles", "Career goal"]);
  assert.ok(state.ownAnswers.every((f) => /^owner stated \(web onboarding, 2026-10-23\)$/.test(f.provenance)),
    `every flow-stored answer carries the onboarding provenance: ${JSON.stringify(state.ownAnswers)}`);
  assert.equal(state.step, "done", "after the match is presented the flow reads done on the stored profile");

  if (SHOT_DIR) {
    await page.locator("[data-f3-kept-list]").screenshot({ path: path.join(SHOT_DIR, "kept-postings.png") });
    await page.locator(".f3-dropped").screenshot({ path: path.join(SHOT_DIR, "dropped-with-rules.png") });
  }
});

test("reloading after the match resumes on the done screen — the outcome persists", { timeout: 60000 }, async () => {
  assert.ok(page, "the drive test ran first");
  await page.reload();
  assert.equal(await stepOf(page), "done");
  const done = page.locator('[data-f3-step="done"]');
  assert.ok((await done.innerText()).includes("You are set up"));
  assert.ok((await done.innerText()).includes("first reviewed match is in your queue"),
    "the done screen reports the match outcome, not just saved answers");
  if (SHOT_DIR) await done.screenshot({ path: path.join(SHOT_DIR, "done-screen.png") });
});
