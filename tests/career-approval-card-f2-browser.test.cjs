// F2 (e) — THE APPROVAL CARD IN A REAL BROWSER (BUILDER-PLAN-48H
// item F2, 2026-10-22). Playwright drives the REAL surface: the
// shared card model + review wiring from
// packages/domain/175-career-approval-ui.js, styled by the REAL
// design tokens (src/trainee-design-tokens.css) and component CSS
// (src/career-approval-review.css), assembled the way a host page
// assembles them. No network: the page is fulfilled locally; the
// commit handler is the host seam, recorded in-page.
//
// Exercised end to end: render with every field answer visible,
// the loud treatment on an unverified answer (class + computed
// style), approve per application, edit per field (value changes,
// EDITED chip, alert), reject per application (reason required and
// shown), batch approve, the commit receiving the exact partition,
// and 'Submit when complete' inert (disabled; a forced synthetic
// click records nothing).
//
// Browser posture: sandboxed Chromium wherever the host allows it;
// the operator opt-out posture (UPMORE_CHROMIUM_SANDBOX=off, the
// product's own posture env) only where the host cannot initialize
// a sandbox at all — the posture is printed, never hidden.
// Check: UPMORE_PLAYWRIGHT_PATH=<playwright> node --test tests/career-approval-card-f2-browser.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path");
const root = path.resolve(__dirname, "..");
const { chromium } = require(process.env.UPMORE_PLAYWRIGHT_PATH || "playwright");
const MODULE_SRC = fs.readFileSync(path.join(root, "packages/domain/175-career-approval-ui.js"), "utf8");
const TOKENS_CSS = fs.readFileSync(path.join(root, "src/trainee-design-tokens.css"), "utf8");
const CARD_CSS = fs.readFileSync(path.join(root, "src/career-approval-review.css"), "utf8");
const STAGED_SHA = "0a67147cb950acfa85720c9de4de0ab1129294cf673b09c8b1db733cdbfff8e5";
const POSTURE = (process.env.UPMORE_CHROMIUM_SANDBOX || "on").toLowerCase();
let browser;
before(async () => {
  console.log(`F2 BROWSER POSTURE: UPMORE_CHROMIUM_SANDBOX=${POSTURE} (chromiumSandbox=${POSTURE !== "off"})`);
  browser = await chromium.launch({
    headless: true, chromiumSandbox: POSTURE !== "off",
    ...(process.env.UPMORE_CHROMIUM_PATH ? { executablePath: process.env.UPMORE_CHROMIUM_PATH } : {}),
    timeout: 60000,
  });
});
after(async () => { if (browser) await browser.close(); });

const FIXTURE = {
  runId: "batch-1ada7107528f", cardSha256: STAGED_SHA, eventId: "evt-f2-staged",
  title: "Apply to 2 software engineering intern roles?",
  world: "TEST profile — staged batch (executor stored record, flag OFF)",
  applications: [
    {
      id: "app-fdse", jobTitle: "Forward Deployed Software Engineer, Internship - Commercial",
      company: "Palantir", location: "Chicago, IL",
      url: "https://jobs.lever.co/palantir/d5486403-c050-4920-b2e0-91b69b61ebb2",
      matchReason: "TEST match record: software engineering internships in Chicago; data and JavaScript work the profile states.",
      fields: [
        { name: "full_name", label: "Full name", value: "TEST — Vishnu Srikanth", verification: "verified" },
        { name: "school", label: "School", value: "DePaul University (Driehaus College of Business)", verification: "verified" },
        { name: "graduation_year", label: "Graduation year", value: "2029", verification: "verified" },
        { name: "eeo", label: "EEO self-identification", value: "Decline to self-identify", verification: "unverified" },
      ],
      blank: ["Cover letter (optional)"],
    },
    {
      id: "app-swe", jobTitle: "Software Engineer, Internship",
      company: "Palantir", location: "New York, NY",
      url: "https://jobs.lever.co/palantir/7d69cf8a-06fd-4f05-bd84-27149db29c4d",
      matchReason: "TEST match record: software engineering internship; location outside the stated Chicago preference — shown for review.",
      fields: [
        { name: "full_name", label: "Full name", value: "TEST — Vishnu Srikanth", verification: "verified" },
        { name: "relocation", label: "Willing to relocate to New York", value: "Yes", verification: "unverified" },
      ],
      blank: [],
    },
  ],
};

async function surface(t) {
  const page = await browser.newPage();
  t.after(() => page.close());
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>F2 approval card</title>
<style>${TOKENS_CSS}</style><style>${CARD_CSS}</style></head>
<body><main id="card"></main>
<script>${MODULE_SRC}\n;globalThis.CareerApprovalUi = CareerApprovalUi;</script>
</body></html>`;
  await page.route("**/*", (route) => {
    if (route.request().url() === "https://card.f2.test/") {
      return route.fulfill({ status: 200, contentType: "text/html", body: html });
    }
    return route.abort();
  });
  await page.goto("https://card.f2.test/");
  await page.evaluate((fixture) => {
    window.__commits = [];
    const built = CareerApprovalUi.buildReviewCard(fixture);
    if (!built.ok) throw new Error("fixture refused: " + built.code);
    window.__handle = CareerApprovalUi.wireReviewCard(document.querySelector("#card"), built.card, {
      commit: (set, card) => {
        window.__commits.push(JSON.parse(JSON.stringify(set)));
        return { ok: true, text: "Approval recorded for the reviewed set exactly as shown. Nothing has been submitted to an employer." };
      },
    });
  }, FIXTURE);
  return page;
}
const app = (page, id) => page.locator(`.f2-app[data-app-id="${id}"]`);

test("(a)+(c) render: every answer visible; the unverified answer is loud in class and computed style", async (t) => {
  const page = await surface(t);
  const body = await page.locator("#card").innerText();
  for (const s of ["Forward Deployed Software Engineer, Internship - Commercial", "Software Engineer, Internship",
    "Palantir", "Chicago, IL", "New York, NY", "DePaul University (Driehaus College of Business)",
    "Decline to self-identify", "Willing to relocate to New York", "Cover letter (optional)",
    "Answers verified: 4/6", STAGED_SHA]) {
    assert.ok(body.includes(s), `visible on the card: ${s}`);
  }
  const eeo = app(page, "app-fdse").locator('.f2-field[data-field="eeo"]');
  assert.equal(await eeo.evaluate((el) => el.classList.contains("f2-field--alert")), true);
  assert.match(await eeo.locator(".f2-chip").innerText(), /⚠ UNVERIFIED/);
  const style = await eeo.evaluate((el) => {
    const cs = getComputedStyle(el);
    return { borderLeftWidth: cs.borderLeftWidth, backgroundColor: cs.backgroundColor };
  });
  assert.equal(style.borderLeftWidth, "4px", "the loud treatment is a real visual bar, not a footnote");
  assert.notEqual(style.backgroundColor, "rgba(0, 0, 0, 0)", "the alert row is tinted");
  const school = app(page, "app-fdse").locator('.f2-field[data-field="school"]');
  assert.equal(await school.evaluate((el) => el.classList.contains("f2-field--alert")), false, "a verified answer is not loud");
});

test("(b) approve per application, edit per field, reject with a reason — then the commit gets the exact partition", async (t) => {
  const page = await surface(t);
  // approve app A per application
  await app(page, "app-fdse").locator('[data-f2-action="approve-app"]').click();
  assert.match(await app(page, "app-fdse").locator(".f2-app-state").innerText(), /Approved/);
  // edit a field on app B: the editor opens, the value changes, the row turns loud EDITED
  await app(page, "app-swe").locator('.f2-field[data-field="relocation"] [data-f2-action="edit-field"]').click();
  await app(page, "app-swe").locator('.f2-field[data-field="relocation"] [data-f2-edit-input]').fill("No");
  await app(page, "app-swe").locator('.f2-field[data-field="relocation"] [data-f2-action="edit-save"]').click();
  const rel = app(page, "app-swe").locator('.f2-field[data-field="relocation"]');
  assert.match(await rel.locator(".f2-field-value").innerText(), /^No$/);
  assert.match(await rel.locator(".f2-chip").innerText(), /⚠ EDITED/);
  assert.equal(await rel.evaluate((el) => el.classList.contains("f2-field--alert")), true);
  assert.match(await app(page, "app-swe").innerText(), /Was: Yes/);
  // reject app B with a reason
  await app(page, "app-swe").locator('[data-f2-action="reject-app"]').click();
  await app(page, "app-swe").locator("[data-f2-reason]").fill("Not relocating to New York");
  await app(page, "app-swe").locator('[data-f2-action="reject-confirm"]').click();
  assert.match(await app(page, "app-swe").locator(".f2-app-state").innerText(), /Rejected — Not relocating to New York/);
  // commit: the host seam receives exactly the partition — A approved, B dropped with its reason
  await page.locator('[data-f2-action="commit"]').click();
  const commits = await page.evaluate(() => window.__commits);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].approved.map((x) => x.id), ["app-fdse"]);
  assert.deepEqual(commits[0].dropped, [{ id: "app-swe", reason: "Not relocating to New York" }]);
  assert.deepEqual(commits[0].binding, { runId: "batch-1ada7107528f", cardSha256: STAGED_SHA });
  assert.match(await page.locator(".f2-status").innerText(), /Nothing has been submitted to an employer/);
});

test("(b) batch approve approves the whole reviewed set in one action", async (t) => {
  const page = await surface(t);
  await page.locator('[data-f2-action="approve-all"]').click();
  assert.match(await app(page, "app-fdse").locator(".f2-app-state").innerText(), /Approved/);
  assert.match(await app(page, "app-swe").locator(".f2-app-state").innerText(), /Approved/);
  await page.locator('[data-f2-action="commit"]').click();
  const commits = await page.evaluate(() => window.__commits);
  assert.equal(commits.length, 1);
  assert.deepEqual(commits[0].approved.map((x) => x.id), ["app-fdse", "app-swe"]);
  assert.deepEqual(commits[0].dropped, []);
});

test("submit-when-complete is built disabled and inert, even to a forced click", async (t) => {
  const page = await surface(t);
  const btn = page.locator('[data-f2-action="submit-when-complete"]');
  assert.equal(await btn.count(), 1);
  assert.equal(await btn.isDisabled(), true);
  assert.match(await page.locator(".f2-submit-note").innerText(), /OFF/);
  await btn.evaluate((el) => el.dispatchEvent(new MouseEvent("click", { bubbles: true })));
  await page.waitForTimeout(25);
  assert.equal(await page.evaluate(() => window.__commits.length), 0, "no commit, no submit — the control is wired to nothing");
  assert.equal(await page.evaluate(() => window.__handle.getCard().applications.every((a) => a.state === "pending")), true);
});
