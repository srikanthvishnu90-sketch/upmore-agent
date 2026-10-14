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

const pages = { "/gh-form": GH_FORM, "/captcha-open": CAPTCHA_OPEN, "/captcha-review": CAPTCHA_REVIEW_STEP1, "/gh-confirm": GH_CONFIRM, "/gh-ambiguous": GH_AMBIGUOUS };const server = http.createServer((req, res) => {
  const body = pages[req.url];
  res.writeHead(body ? 200 : 404, { "content-type": "text/html" });
  res.end(body || "<html><body>not found</body></html>");
});
server.listen(0, () => { console.log(`FIXTURE_PORT ${server.address().port}`); });
