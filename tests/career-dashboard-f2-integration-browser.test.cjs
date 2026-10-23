// F1–F2 INTEGRATION — the dashboard's awaiting-approval slot mounts the REAL
// F2 review card (coordinator review 2026-10-23, item 3).
//
// On the F1 branch alone the queue's awaiting-approval group renders an empty
// slot (data-f1-card-slot) and nothing ever mounts into it. This e2e renders
// the REAL dashboard (src/career-dashboard.js) in a real browser with an
// awaiting-approval prepared row, mounts through TraineeDashboard.mountCards
// via the integration adapter (src/career-dashboard-f2-mount.js) over the REAL
// F2 module (packages/domain/175-career-approval-ui.js), approves through the
// mounted card, and asserts the commit seam receives EXACTLY the shown set —
// same application, same answers as displayed — and that the production seam
// (175's tapReviewCommit over the prepared row's stored batch state) mints
// the approval record bound to the shown run + payload hash.
//
// Fixtures are wholly synthetic: fictional person, fictional school,
// fictional employer, .invalid posting URL. No network: the page is
// fulfilled locally. Browser posture follows the repo's: sandboxed Chromium
// wherever the host allows; UPMORE_CHROMIUM_SANDBOX=off only where the host
// cannot initialize a sandbox at all — printed, never hidden.
// Check: UPMORE_PLAYWRIGHT_PATH=<playwright> node --test tests/career-dashboard-f2-integration-browser.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const { chromium } = require(process.env.UPMORE_PLAYWRIGHT_PATH || "/home/hatch/workspace/sporve-agent-clone/node_modules/playwright");

const readIf = (p) => (fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null);
const DASH_SRC = fs.readFileSync(path.join(root, "src/career-dashboard.js"), "utf8");
const UI_SRC = readIf(path.join(root, "packages/domain/175-career-approval-ui.js"));
const ADAPTER_SRC = readIf(path.join(root, "src/career-dashboard-f2-mount.js"));
const DASH_CSS = fs.readFileSync(path.join(root, "src/career-dashboard.css"), "utf8");
const TOKENS_CSS = readIf(path.join(root, "src/trainee-design-tokens.css")) || "";
const CARD_CSS = readIf(path.join(root, "src/career-approval-review.css")) || "";

const PAYLOAD_HASH = "c1".repeat(32);
const PREPARED = {
  id: "prep-test-1", job_id: "job-test-1", company: "Northwind Test Labs",
  url: "https://postings.northwind.invalid/jobs/1",
  payload: {
    version: "1", job_id: "job-test-1", company: "Northwind Test Labs",
    url: "https://postings.northwind.invalid/jobs/1",
    fields: [
      { name: "full_name", label: "Full name", value: "Test Person", factId: "F-T1", confirmation_event_id: "evt-test-1" },
      { name: "school", label: "School", value: "Fictional State University", factId: "F-T2" },
      { name: "graduation_year", label: "Graduation year", value: "2030", factId: "F-T3", confirmation_event_id: "evt-test-3" },
    ],
    blank: ["Cover letter (optional)"],
  },
  payload_hash: PAYLOAD_HASH, state: "ready",
  created_at: "2026-10-23T09:00:00.000Z", updated_at: "2026-10-23T09:00:00.000Z",
};
const JOBS = [{
  id: "job-row-1", user_id: "user-test-1", job_id: "job-test-0", company: "Contoso Test Systems",
  url: "https://postings.contoso.invalid/jobs/0", payload: {}, payload_hash: "d2".repeat(32),
  state: "queued", reason: null, confirmation_id: null, attempts: 0, claimed_at: null,
  created_at: "2026-10-23T08:00:00.000Z", updated_at: "2026-10-23T08:00:00.000Z",
  evidence: {}, source: null, email_confirmed_at: null, confirmation_mail_hash: null,
}];

const POSTURE = (process.env.UPMORE_CHROMIUM_SANDBOX || "on").toLowerCase();
let browser;
before(async () => {
  console.log(`F1-F2 INTEGRATION BROWSER POSTURE: UPMORE_CHROMIUM_SANDBOX=${POSTURE} (chromiumSandbox=${POSTURE !== "off"})`);
  browser = await chromium.launch({
    headless: true, chromiumSandbox: POSTURE !== "off",
    ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}),
    timeout: 60000,
  });
});
after(async () => { if (browser) await browser.close(); });

async function surface(t, { withMount }) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const scripts = [
    `<script>${DASH_SRC}\n;globalThis.TraineeDashboard = TraineeDashboard;</script>`,
    UI_SRC ? `<script>${UI_SRC}\n;globalThis.CareerApprovalUi = CareerApprovalUi;</script>` : "",
    ADAPTER_SRC ? `<script>${ADAPTER_SRC}\n;globalThis.TraineeDashboardF2Mount = TraineeDashboardF2Mount;</script>` : "",
  ].join("\n");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>F1 dashboard + F2 card</title>
<style>${TOKENS_CSS}</style><style>${DASH_CSS}</style><style>${CARD_CSS}</style></head>
<body><main id="dash"></main>
${scripts}
</body></html>`;
  await page.route("**/*", (route) => {
    if (route.request().url() === "https://dash.integration.test/") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html });
    }
    return route.abort();
  });
  await page.goto("https://dash.integration.test/");
  await page.evaluate(({ jobs, prepared, withMount }) => {
    window.__seamSets = [];
    window.__seamResults = [];
    const deps = {};
    if (withMount && typeof TraineeDashboardF2Mount === "object") {
      deps.cards = {
        mountFn: TraineeDashboardF2Mount.createMountFn({
          commit: (set, card, row) => {
            window.__seamSets.push(JSON.parse(JSON.stringify(set)));
            const res = TraineeDashboardF2Mount.commitPrepared(row, card);
            window.__seamResults.push(JSON.parse(JSON.stringify(res)));
            return res;
          },
        }),
      };
    }
    TraineeDashboard.mount(document.querySelector("#dash"), { jobs, prepared, outcomes: [] }, deps);
    // The queue surface starts hidden behind the Feed tab; open it.
    for (const b of document.querySelectorAll(".f1-tab")) if (b.textContent === "Queue") b.click();
  }, { jobs: JOBS, prepared: [PREPARED], withMount });
  return page;
}
const slot = (page) => page.locator('[data-f1-card-slot][data-prepared-id="prep-test-1"]');

test("control: without the integration mount the awaiting-approval slot stays empty", async (t) => {
  const page = await surface(t, { withMount: false });
  assert.equal(await slot(page).count(), 1, "the F1 slot itself renders");
  assert.equal(await slot(page).locator(".f2-card").count(), 0, "nothing mounts into it — the gap this integration closes");
});

test("the awaiting-approval slot contains the REAL F2 review card, showing the prepared answers", async (t) => {
  const page = await surface(t, { withMount: true });
  const card = slot(page).locator(".f2-card");
  assert.equal(await card.count(), 1, "the F2 card is mounted inside the F1 slot");
  assert.equal(await card.getAttribute("data-run-id"), "prep-test-1");
  assert.equal(await card.getAttribute("data-card-sha256"), PAYLOAD_HASH);
  const body = await card.innerText();
  for (const s of ["Northwind Test Labs", "Test Person", "Fictional State University", "2030", "Cover letter (optional)"]) {
    assert.ok(body.includes(s), `shown on the mounted card: ${s}`);
  }
  // The unverified answer (no confirmation event on the prepared field) is loud.
  const school = card.locator('.f2-field[data-field="school"]');
  assert.match(await school.locator(".f2-chip").innerText(), /UNVERIFIED/);
  const name = card.locator('.f2-field[data-field="full_name"]');
  assert.match(await name.locator(".f2-chip").evaluate((el) => el.textContent), /^Verified$/,
    "the chip's DOM text is 'Verified' (innerText would be CSS-uppercased)");
});

test("approve through the mounted card: the commit seam receives exactly the shown set", async (t) => {
  const page = await surface(t, { withMount: true });
  const card = slot(page).locator(".f2-card");
  // What is shown, read off the DOM before approving.
  const shown = await card.evaluate((el) => [...el.querySelectorAll(".f2-field")].map((f) => ({
    name: f.getAttribute("data-field"),
    value: f.querySelector(".f2-field-value").textContent,
  })));
  assert.deepEqual(shown.map((f) => f.name), ["full_name", "school", "graduation_year"]);
  await card.locator('[data-f2-action="approve-app"]').click();
  assert.match(await card.locator(".f2-app-state").innerText(), /Approved/);
  await card.locator('[data-f2-action="commit"]').click();
  const sets = await page.evaluate(() => window.__seamSets);
  assert.equal(sets.length, 1, "the seam was reached exactly once");
  assert.equal(sets[0].approved.length, 1, "exactly the one shown application");
  assert.equal(sets[0].approved[0].id, "job-test-1");
  assert.deepEqual(sets[0].approved[0].fields.map((f) => ({ name: f.name, value: f.value })), shown,
    "the seam's answers are the displayed answers, field for field");
  assert.deepEqual(sets[0].approved[0].fields.map((f) => f.verification), ["verified", "unverified", "verified"]);
  assert.deepEqual(sets[0].dropped, []);
  assert.deepEqual(sets[0].heldBack, []);
  assert.deepEqual(sets[0].binding, { runId: "prep-test-1", cardSha256: PAYLOAD_HASH });
  // And the production seam minted the record bound to that exact set.
  const results = await page.evaluate(() => window.__seamResults);
  assert.equal(results.length, 1);
  assert.equal(results[0].ok, true);
  assert.equal(results[0].record.approvalRef, `batch:prep-test-1:${PAYLOAD_HASH}`);
  assert.equal(results[0].record.cardSha256, PAYLOAD_HASH);
  assert.deepEqual(Object.keys(results[0].record.approvals), ["job-test-1"]);
  assert.match(await card.locator(".f2-status").innerText(), /Approval recorded/);
});
