// Fixture pages for tests/career-portal-browser.test.cjs — served by THIS
// standalone process, never by the test process itself. Why: module 150's
// synchronous bridge (Atomics.wait) blocks the caller's event loop while a
// command is in flight, so a fixture server living in the test process
// could never answer Chromium's requests and every navigation timed out
// (BUG-045). Prints "FIXTURE_PORT <n>" on stdout once listening.
"use strict";
const http = require("node:http");

const GH_FORM = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">
  <div><label for="first_name">First Name *</label><input id="first_name" name="first_name" type="text" required></div>
  <div><label for="last_name">Last Name *</label><input id="last_name" name="last_name" type="text" required></div>
  <div><label for="email">Email *</label><input id="email" name="email" type="email" required></div>
  <div><label for="phone">Phone</label><input id="phone" name="phone" type="tel"></div>
  <div><label for="location">Location (City)</label><input id="location" name="location" type="text"></div>
  <div><label for="school">School</label><input id="school" name="school" type="text"></div>
  <div><label for="degree">Degree</label><input id="degree" name="degree" type="text"></div>
  <div><label for="fos">Field of Study</label><input id="fos" name="field_of_study" type="text"></div>
  <div><label for="gpa">GPA</label><input id="gpa" name="gpa" type="text"></div>
  <div><label for="gy">Graduation Year</label><input id="gy" name="graduation_year" type="text"></div>
  <div><label for="country">Country</label>
    <select id="country" name="country"><option value="">Select...</option><option>United States</option><option>Canada</option></select></div>
  <div><label for="resume">Resume/CV *</label><input id="resume" name="resume" type="file" required></div>
  <div><label for="wa">Are you authorized to work in the US? *</label>
    <select id="wa" name="work_authorization" required><option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option></select></div>
  <div><label for="sp">Will you require sponsorship? *</label>
    <select id="sp" name="sponsorship" required><option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option></select></div>
  <div><label for="gender">Gender (voluntary)</label>
    <select id="gender" name="gender"><option value="">Select...</option><option>Male</option><option>Female</option><option>Decline to self-identify</option></select></div>
  <div><label><input id="certify" name="certify_true" type="checkbox" required> I certify the above is true *</label></div>
  <button type="submit" id="submit-btn">Submit application</button>
</form></body></html>`;

const CAPTCHA_OPEN = `<!doctype html><html><head><title>Apply (TEST fixture)</title></head><body>
<h1>Apply</h1><p>Please verify you are human to continue.</p>
<div class="g-recaptcha" data-sitekey="TEST-KEY-NEVER-SOLVED"></div>
<form><div><label for="email">Email *</label><input id="email" type="email" required></div>
<button type="submit">Submit application</button></form></body></html>`;

const CAPTCHA_REVIEW_STEP1 = `<!doctype html><html><head><title>Apply step 1 (TEST fixture)</title></head><body>
<h1>Apply — step 1</h1>
<form id="f"><div><label for="first_name">First Name *</label><input id="first_name" type="text" required></div>
<div><label for="last_name">Last Name *</label><input id="last_name" type="text" required></div>
<div><label for="email">Email *</label><input id="email" type="email" required></div>
<button type="button" id="next-btn">Next</button></form>
<script>document.getElementById('next-btn').addEventListener('click', () => {
  document.body.innerHTML = '<h1>Review your application</h1><p>Please verify you are human.</p>' +
    '<div class="h-captcha" data-sitekey="TEST-KEY-NEVER-SOLVED"></div>' +
    '<button type="submit">Submit application</button>';
});</script></body></html>`;

// Submit-landing fixtures for the confirmation-capture tests: same form as
// GH_FORM, but the submit button swaps the page (SPA-style) to a landing
// page — one with a real employer confirmation, one deliberately ambiguous.
const FORM_FIELDS = `
  <div><label for="first_name">First Name *</label><input id="first_name" name="first_name" type="text" required></div>
  <div><label for="last_name">Last Name *</label><input id="last_name" name="last_name" type="text" required></div>
  <div><label for="email">Email *</label><input id="email" name="email" type="email" required></div>
  <div><label for="phone">Phone</label><input id="phone" name="phone" type="tel"></div>
  <div><label for="location">Location (City)</label><input id="location" name="location" type="text"></div>
  <div><label for="resume">Resume/CV *</label><input id="resume" name="resume" type="file" required></div>
  <div><label for="wa">Are you authorized to work in the US? *</label>
    <select id="wa" name="work_authorization" required><option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option></select></div>
  <div><label for="sp">Will you require sponsorship? *</label>
    <select id="sp" name="sponsorship" required><option value="">Select...</option><option value="yes">Yes</option><option value="no">No</option></select></div>
  <div><label><input id="certify" name="certify_true" type="checkbox" required> I certify the above is true *</label></div>`;

const GH_CONFIRM = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">${FORM_FIELDS}
  <button type="button" id="submit-btn">Submit application</button>
</form>
<script>document.getElementById('submit-btn').addEventListener('click', () => {
  document.body.innerHTML = '<h1>Thank you for applying</h1><p>Your application has been received.</p><p>Application ID: TEST-APP-12345</p>';
});</script></body></html>`;

const GH_AMBIGUOUS = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">${FORM_FIELDS}
  <button type="button" id="submit-btn">Submit application</button>
</form>
<script>document.getElementById('submit-btn').addEventListener('click', () => {
  document.body.innerHTML = '<h1>Done</h1><p>You may now close this window.</p>';
});</script></body></html>`;

// D8 fixture: same confirm form, but the EEO select offers the decline
// default only in the "Prefer not to answer" wording (no exact match for
// 149's "Decline to self-identify" string).
const GH_EEO_VARIANT = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">${FORM_FIELDS}
  <div><label for="gender">Gender (voluntary)</label>
    <select id="gender" name="gender"><option value="">Select...</option><option>Male</option><option>Female</option><option>Prefer not to answer</option></select></div>
  <button type="button" id="submit-btn">Submit application</button>
</form></body></html>`;

// D9 fixture (Lever custom-card shape): the card question has NO <label>;
// its human text is the card's .question heading, and the input's name is
// a machine name (cards_<id>_field<n>) — the ask must quote the heading.
const LEVER_CARD = `<!doctype html><html><head><title>Apply (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">
  <div><label for="email">Email *</label><input id="email" name="email" type="email" required></div>
  <div class="card"><div class="question">Are you willing to relocate to New York?</div>
    <div class="field"><input name="cards_9f2abc_field0" type="text" required></div></div>
  <button type="submit" id="submit-btn">Submit application</button>
</form></body></html>`;

// D11 fixture (BUG-207): a Greenhouse-shaped form whose framework REMOUNTS
// its fields — the first input/change on a field replaces its DOM node with
// a fresh empty clone ~300ms later (once per field), exactly the loss the
// 2026-10-15 live run proved (fills "successful", readback empty). A
// fill-once driver loses every value; a fill-then-readback-per-field driver
// detects the loss and re-fills the fresh node.
const REMOUNT_SCRIPT = (forever) => `<script>
const __replaced = new Set();
function __remount(el) {
  const id = el.id; if (!id) return;
  ${forever ? "" : "if (__replaced.has(id)) return; __replaced.add(id);"}
  setTimeout(() => {
    const cur = document.getElementById(id); if (!cur || cur !== el) return;
    const clone = cur.cloneNode(cur.tagName === 'SELECT');
    if (clone.tagName === 'SELECT') clone.selectedIndex = 0;
    cur.replaceWith(clone);
  }, 300);
}
document.addEventListener('input', (e) => __remount(e.target), true);
document.addEventListener('change', (e) => __remount(e.target), true);
</script>`;

const GH_REMOUNT = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">${FORM_FIELDS}
  <button type="submit" id="submit-btn">Submit application</button>
</form>${REMOUNT_SCRIPT(false)}</body></html>`;

// D11/D13 end-to-end fixture: the remount NEVER stops — no fill can ever
// persist. The product must end at a typed INCOMPLETE_PAYLOAD stop and the
// submit control must never be clicked, however it was approved.
const GH_REMOUNT_FOREVER = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">${FORM_FIELDS}
  <button type="submit" id="submit-btn">Submit application</button>
</form>${REMOUNT_SCRIPT(true)}</body></html>`;

// D12 fixture (BUG-208): the Labelbox shape end to end — the submit click
// lands on the SAME still-open form, now showing required-field errors,
// with the posting's own prose (including the token "security" right after
// the word "application", plus unrelated IDs) still on the page. A
// confirmation minted from this page is a manufactured false SUBMITTED.
const GH_FALSE_CONFIRM = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Cyber Security Intern</h1>
<p>Job ID: 5442881008. Our application security team reviews every submission
for tracking quality. This role works on application security tooling and
reference architectures for customer data protection.</p>
<form id="application" method="post" action="/never-submit">${FORM_FIELDS}
  <button type="button" id="submit-btn">Submit application</button>
</form>
<script>document.getElementById('submit-btn').addEventListener('click', () => {
  const errs = document.createElement('div');
  errs.innerHTML = '<p class="error">First Name is required</p><p class="error">Email is required</p>';
  document.querySelector('form').prepend(errs);
  window.scrollTo(0, 0);
});</script></body></html>`;

// Delayed board-wide reset fixture (the live Labelbox shape, 2026-10-15):
// every fill verifies, then — shortly after the resume upload — the board
// re-renders and the text/select fields filled BEFORE the upload lose
// their values. Per-field verification cannot see a loss that happens
// later; only a doorstep readback + repair pass recovers it, and the
// required-field gate must stop the run if the repair does not hold.
const GH_REMOUNT_LATE = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">${FORM_FIELDS}
  <button type="submit" id="submit-btn">Submit application</button>
</form>
<script>
let __resetDone = false;
document.addEventListener('change', (e) => {
  if (__resetDone || !e.target || e.target.type !== 'file') return;
  __resetDone = true;
  setTimeout(() => {
    document.querySelectorAll('input[type=text], input[type=email], input[type=tel], select').forEach((el) => {
      if (!el.id) return;
      const clone = el.cloneNode(el.tagName === 'SELECT');
      if (clone.tagName === 'SELECT') clone.selectedIndex = 0;
      el.replaceWith(clone);
    });
  }, 800);
}, true);
</script></body></html>`;

// Location-widget fixture (BUG-207, live Greenhouse shape): the location
// field is a react-select async component — the visible input
// (class select__input) is only a SEARCH BOX; typed text is not a value
// and is cleared by the widget; the field's value exists only as the
// component's chosen .select__single-value after an option is picked.
// A driver that fills/reads the box's text proves nothing.
const GH_TYPEAHEAD = `<!doctype html><html><head><title>Job Application (TEST fixture)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">
  <div><label for="first_name">First Name *</label><input id="first_name" name="first_name" type="text" required></div>
  <div><label for="last_name">Last Name *</label><input id="last_name" name="last_name" type="text" required></div>
  <div><label for="email">Email *</label><input id="email" name="email" type="email" required></div>
  <div><label for="candidate-location">Location (City) *</label>
    <div class="select__container"><div class="select__control"><div class="select__value-container">
      <div class="select__single-value" style="display:none"></div>
      <input id="candidate-location" class="select__input" type="text" autocomplete="off">
    </div></div>
    <div class="select__menu" style="display:none">
      <div class="select__option">Chicago, IL, United States</div>
      <div class="select__option">Chicago Heights, IL, United States</div>
    </div></div></div>
  <div><label for="country">Country *</label>
    <div class="select__container"><div class="select__control"><div class="select__value-container">
      <div class="select__single-value" style="display:none"></div>
      <input id="country" class="select__input" type="text" autocomplete="off">
    </div></div>
    <div class="select__menu" style="display:none">
      <div class="select__option">United States</div>
      <div class="select__option">Canada</div>
    </div></div></div>
  <div><label for="resume">Resume/CV *</label><input id="resume" name="resume" type="file" required></div>
  <div><label><input id="certify" name="certify_true" type="checkbox" required> I certify the above is true *</label></div>
  <button type="submit" id="submit-btn">Submit application</button>
</form>
<script>
document.querySelectorAll('.select__container').forEach((c) => {
  const inp = c.querySelector('.select__input');
  const menu = c.querySelector('.select__menu');
  const sv = c.querySelector('.select__single-value');
  inp.addEventListener('input', () => { menu.style.display = inp.value ? 'block' : 'none'; });
  menu.querySelectorAll('.select__option').forEach((o) => o.addEventListener('click', () => {
    sv.textContent = o.textContent; sv.style.display = 'block'; inp.value = ''; menu.style.display = 'none';
  }));
});
</script></body></html>`;

// The resume input is present at discovery and REMOVED shortly after
// load — the live boards' mount/unmount churn in miniature. A driver
// that lets the file fill throw loses the whole run; the honest end is
// a recorded fill failure and the completeness gate's stop.
const GH_FILE_VANISH = GH_FORM.replace(
  "</body>",
  `<script>document.getElementById('email').addEventListener('input', () => { const r = document.getElementById('resume'); if (r) r.remove(); });</script></body>`
);

// The resume input is REMOUNTED under a fresh id once filling starts
// (the live boards regenerate input ids when the form re-renders): the
// discovery-time selector goes stale, and the fill must re-discover
// the live input rather than wait on a node that will never return.
const GH_FILE_REMOUNT = GH_FORM.replace(
  "</body>",
  `<script>document.getElementById('email').addEventListener('input', () => { const r = document.getElementById('resume'); if (r) { const n = document.createElement('input'); n.type = 'file'; n.id = 'resume-file-2'; n.name = 'resume'; n.required = true; r.replaceWith(n); } });</script></body>`
);

const pages = { "/gh-form": GH_FORM, "/captcha-open": CAPTCHA_OPEN, "/captcha-review": CAPTCHA_REVIEW_STEP1, "/gh-confirm": GH_CONFIRM, "/gh-ambiguous": GH_AMBIGUOUS, "/gh-eeo-variant": GH_EEO_VARIANT, "/lever-card": LEVER_CARD, "/gh-remount": GH_REMOUNT, "/gh-remount-forever": GH_REMOUNT_FOREVER, "/gh-false-confirm": GH_FALSE_CONFIRM, "/gh-remount-late": GH_REMOUNT_LATE, "/gh-typeahead": GH_TYPEAHEAD, "/gh-file-vanish": GH_FILE_VANISH, "/gh-file-remount": GH_FILE_REMOUNT };const server = http.createServer((req, res) => {
  // D1 fixture: an allowed-host page that server-redirects OFF the
  // allowlist (the HRT Greenhouse -> employer-site shape). The target is
  // a .invalid host: pre-fix Chromium burned minutes on proxy/DNS; the
  // fixed driver's navigation gate aborts the hop before any network.
  if (req.url === "/redirect-offlist") {
    res.writeHead(302, { Location: "http://employer.example.invalid/apply" });
    res.end(); return;
  }
  const body = pages[req.url];
  res.writeHead(body ? 200 : 404, { "content-type": "text/html" });
  res.end(body || "<html><body>not found</body></html>");
});
server.listen(0, () => { console.log(`FIXTURE_PORT ${server.address().port}`); });
