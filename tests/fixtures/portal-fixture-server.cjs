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
let __resetArmed = false;
let __resetDone = false;
document.addEventListener('change', (e) => {
  if (__resetDone || !e.target) return;
  if (e.target.type === 'file') { __resetArmed = true; return; }
  if (!__resetArmed) return;
  // Deterministic delayed reset (the live Labelbox shape): the board
  // wipes every filled field once the driver moves past the resume
  // upload — fired by the NEXT field's change event, never by a clock,
  // so the loss cannot be outrun by a fast or slow driver.
  __resetDone = true;
  document.querySelectorAll('input[type=text], input[type=email], input[type=tel], select').forEach((el) => {
    if (!el.id) return;
    const clone = el.cloneNode(el.tagName === 'SELECT');
    if (clone.tagName === 'SELECT') clone.selectedIndex = 0;
    // A real board remount re-creates inputs EMPTY (the live Labelbox
    // reset dropped the values outright). cloneNode alone would carry
    // the filled value attribute over — the clone must be cleared, or
    // the "wipe" silently keeps every text value and nothing is lost.
    else { clone.removeAttribute('value'); clone.value = ''; }
    el.replaceWith(clone);
  });
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

// CURRENT-UI fixture (BUG-237 / FR-395): the Greenhouse application
// form as captured live on 2026-10-15 (probes of the live liontree
// board, job-boards.greenhouse.io). This is the shape that defeated
// the drive while GH_TYPEAHEAD above (the OLD shape, with an outer
// .select__container the readback climbs to) kept passing:
//   - EVERY widget is a react-select v5 combobox: .select__control >
//     .select__value-container > (.select__placeholder +
//     .select__input-container[data-value] > input.select__input
//     [role=combobox]) + .select__indicators. There is NO
//     .select__container and NO native <select> anywhere.
//   - the chosen value renders as .select__single-value INSIDE the
//     value container — a sibling of the input container, never
//     inside it;
//   - the country widget's options read "United States +1" but its
//     single-value renders ONLY the dial code ("+1");
//   - hidden remix-css *-requiredInput dummy inputs sit after widgets;
//   - typed search text is discarded on blur unless an option was
//     picked; options are local (no network);
//   - the resume input is visually-hidden inside an Attach
//     button-container, present at rest.
// The late-file variant removes the resume input on the first form
// input and returns it only when the Attach control is engaged —
// the 18-of-24-boards file_input_not_mounted shape.
const GHX_MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
function ghxWidget(id, label, required, options, widgetOpts) {
  const opts = options.map((o, i) => {
    const text = Array.isArray(o) ? o[0] : o;
    const sv = Array.isArray(o) ? ` data-sv="${o[1]}"` : "";
    return `<div class="select__option remix-css-18355b6-option" id="react-select-${id}-option-${i}" role="option"${sv}>${text}</div>`;
  }).join("");
  const asyncAttr = widgetOpts && widgetOpts.async ? ` data-ghx-async="1"` : "";
  return `<div class="ghx-field"${asyncAttr}><label id="${id}-label" for="${id}">${label}${required ? " *" : ""}</label>
  <div><div class="select__control remix-css-13cymwt-control"><div class="select__value-container remix-css-hlgwow">
    <div class="select__placeholder remix-css-1jqq78o-placeholder" id="react-select-${id}-placeholder">Select...</div>
    <div class="select__input-container remix-css-19bb58m" data-value=""><input class="select__input" id="${id}" type="text" role="combobox" aria-expanded="false" aria-haspopup="true" aria-labelledby="${id}-label" autocomplete="off" value=""></div>
  </div><div class="select__indicators remix-css-1wy0on6"><button type="button" class="icon-button icon-button--sm" aria-label="Toggle flyout" tabindex="-1"></button></div></div>
  <div class="select__menu remix-css-sohgwi-menu" style="display:none"><div class="select__menu-list remix-css-qr46ko" id="react-select-${id}-listbox" role="listbox">${opts}</div></div></div>
  <input class="remix-css-1a0ro4n-requiredInput" tabindex="-1" aria-hidden="true" value=""></div>`;
}
function ghCurrentPage(lateFile) {
  return `<!doctype html><html><head><title>Job Application (TEST fixture — current Greenhouse UI shape, captured 2026-10-15)</title></head><body>
<h1>Software Engineering Intern</h1>
<form id="application" method="post" action="/never-submit">
  <div><label for="first_name">First Name *</label><input id="first_name" type="text" class="input input__single-line" required></div>
  <div><label for="last_name">Last Name *</label><input id="last_name" type="text" class="input input__single-line" required></div>
  <div><label for="email">Email *</label><input id="email" type="email" class="input input__single-line" required></div>
  ${ghxWidget("country", "Country", false, [["United States +1", "+1"], ["Canada +1", "+1"], ["United Kingdom +44", "+44"], ["Germany +49", "+49"]])}
  <div><label for="phone">Phone</label><input id="phone" type="tel" class="input input__single-line"></div>
  <div><span>Resume/CV *</span><div class="button-container"><div class="secondary-button"><div><button type="button" class="btn btn--pill" data-ghx-attach="1">Attach</button><label class="visually-hidden" for="resume">Attach</label><input id="resume" class="visually-hidden" type="file" accept=".pdf,.doc,.docx,.txt,.rtf" required></div></div></div></div>
  ${ghxWidget("school--0", "School", true, ["DePaul University", "Northwestern University", "University of Chicago", "Other"])}
  ${ghxWidget("degree--0", "Degree", true, ["Associate's Degree", "Bachelor's Degree", "Master's Degree", "Doctor of Philosophy (PhD)"])}
  ${ghxWidget("discipline--0", "Discipline", false, ["Computer Science", "Computer Science and Finance", "Finance", "Economics"], { async: true })}
  ${ghxWidget("start-month--0", "Start date month", false, GHX_MONTHS)}
  <div><label for="start-year--0">Start date year *</label><input id="start-year--0" type="number" class="input input__single-line" required></div>
  ${ghxWidget("end-month--0", "End date month", false, GHX_MONTHS)}
  <div><label for="end-year--0">End date year *</label><input id="end-year--0" type="number" class="input input__single-line" required></div>
  ${ghxWidget("question_13006485007", "Do you require visa sponsorship to work in the United States?", true, ["Yes", "No"])}
  ${ghxWidget("gender", "Gender", false, ["Male", "Female", "Decline To Self Identify"])}
  ${ghxWidget("hispanic_ethnicity", "Are you Hispanic/Latino?", false, ["Yes", "No", "Decline to self-identify"])}
  ${ghxWidget("veteran_status", "Veteran Status", false, ["I am not a protected veteran", "I identify as one or more of the classifications of a protected veteran", "I don't wish to answer"])}
  <div><label><input id="certify" name="certify_true" type="checkbox" required> I certify the above is true *</label></div>
  <button type="submit" id="submit-btn">Submit application</button>
</form>
<script>
document.querySelectorAll('.ghx-field').forEach((wrap) => {
  const inp = wrap.querySelector('.select__input');
  const menu = wrap.querySelector('.select__menu');
  const vc = wrap.querySelector('.select__value-container');
  const ph = wrap.querySelector('.select__placeholder');
  const ic = wrap.querySelector('.select__input-container');
  const all = () => Array.from(wrap.querySelectorAll('.select__option'));
  const open = () => { menu.style.display = 'block'; inp.setAttribute('aria-expanded', 'true'); filter(); churn(); };
  const close = () => { menu.style.display = 'none'; inp.setAttribute('aria-expanded', 'false'); };
  const filter = () => { const q = inp.value.toLowerCase(); all().forEach((o) => { o.style.display = o.hasAttribute('data-ghx-pending') ? 'none' : (o.textContent.toLowerCase().includes(q) ? 'block' : 'none'); }); };
  const pick = (o) => {
    let sv = vc.querySelector('.select__single-value');
    if (!sv) { sv = document.createElement('div'); sv.className = 'select__single-value remix-css-1dimb5e-singleValue'; vc.insertBefore(sv, ic); }
    sv.textContent = o.getAttribute('data-sv') || o.textContent;
    sv.style.display = 'block';
    if (ph) ph.style.display = 'none';
    inp.value = ''; ic.setAttribute('data-value', '');
    close();
  };
  // Live-tenancy realism (BUG-237): React re-creates the option nodes
  // shortly after the menu opens — a driver that marks a node in one
  // call and clicks it in another finds it gone. Picks here are
  // delegation-based so the churn changes nothing for a driver that
  // acts on live nodes; the churn exists so the fixture's DOM behaves
  // like the tenants', not like a static page.
  const list = wrap.querySelector('.select__menu-list');
  let churned = false;
  const churn = () => { if (churned) return; churned = true; setTimeout(() => { all().forEach((o) => { const c = o.cloneNode(true); o.replaceWith(c); }); filter(); }, 250); };
  inp.addEventListener('click', open);
  inp.addEventListener('input', () => { ic.setAttribute('data-value', inp.value); open(); });
  list.addEventListener('mousedown', (e) => { const o = e.target.closest('.select__option'); if (o) { e.preventDefault(); pick(o); } });
  list.addEventListener('click', (e) => { const o = e.target.closest('.select__option'); if (o) pick(o); });
  // Async option service (BUG-237, captured live 2026-10-15): the
  // discipline/school widgets answer from a remote search — a loading
  // indicator spins and NO options exist for seconds after the menu
  // opens. 7s here: longer than the pre-fix driver's whole poll
  // budget, so the old drive fails this fixture and the ladder drive
  // (segment/first-word retype + a poll that waits out the load)
  // passes it.
  if (wrap.hasAttribute('data-ghx-async')) {
    let loading = false;
    let timer = null;
    const ind = wrap.querySelector('.select__indicators');
    const spin = document.createElement('span');
    spin.className = 'select__loading-indicator remix-css-o9ehiq-loadingIndicator';
    spin.style.display = 'none';
    if (ind) ind.appendChild(spin);
    all().forEach((o) => o.setAttribute('data-ghx-pending', '1'));
    filter();
    // The board's search restarts on every new query: a driver that
    // retypes mid-load pushes the answer out by the full delay again
    // (the live degree search answered in 6-10s; a retype at 5s made
    // it land past the old driver's whole budget).
    const armLoad = () => { loading = true; spin.style.display = 'inline-block';
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { spin.style.display = 'none'; all().forEach((o) => o.removeAttribute('data-ghx-pending')); filter(); }, 7000); };
    inp.addEventListener('click', armLoad);
    inp.addEventListener('input', armLoad);
  }
  inp.addEventListener('blur', () => { setTimeout(() => { if (!vc.querySelector('.select__single-value')) { inp.value = ''; ic.setAttribute('data-value', ''); } close(); }, 0); });
});
const attachBtn = document.querySelector('[data-ghx-attach]');
if (attachBtn) attachBtn.addEventListener('click', () => {
  if (!document.getElementById('resume')) {
    const inp = document.createElement('input');
    inp.id = 'resume'; inp.className = 'visually-hidden'; inp.type = 'file'; inp.setAttribute('accept', '.pdf,.doc,.docx,.txt,.rtf'); inp.required = true;
    attachBtn.parentElement.appendChild(inp);
  }
});
${lateFile ? "document.addEventListener('input', () => { const r = document.getElementById('resume'); if (r) r.remove(); }, { capture: true, once: true });" : ""}
</script></body></html>`;
}
const GH_CURRENT = ghCurrentPage(false);
const GH_CURRENT_LATE_FILE = ghCurrentPage(true);

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

// MI-103 fixtures: the Thiel Fellowship's two page shapes, staged from
// the fellowship census 2026-10-15 §3 (the in-account field list comes
// from secondary walkthroughs — name, date of birth, hometown, current
// location, project/company name + URL, LinkedIn, previous projects,
// short written answers about the project; in the real product the live
// form's fields are read at drive time by module 150). THIEL_FORM is the
// IN-ACCOUNT application (the shape the owner sees after HE signs in):
// the written-answer textareas are owner-writing only, the drive must
// leave them untouched, and they are not required here so the fact-only
// doorstep can be verified around them. The live application stages
// carry no resume upload per the census, so neither does this fixture.
// THIEL_LOGIN is the ACCOUNT WALL itself: an email + password sign-in /
// create-account page. The drive must stop ACCOUNT_WALL_OWNER_HANDOFF
// on it before any form read or fill — no credential is ever typed here.
const THIEL_FORM = `<!doctype html><html><head><title>Thiel Fellowship Application (TEST fixture)</title></head><body>
<h1>Thiel Fellowship — Application</h1>
<form id="application" method="post" action="/never-submit">
  <div><label for="first_name">First Name *</label><input id="first_name" name="first_name" type="text" required></div>
  <div><label for="last_name">Last Name *</label><input id="last_name" name="last_name" type="text" required></div>
  <div><label for="email">Email *</label><input id="email" name="email" type="email" required></div>
  <div><label for="dob">Date of Birth *</label><input id="dob" name="date_of_birth" type="text" required></div>
  <div><label for="hometown">Hometown</label><input id="hometown" name="hometown" type="text"></div>
  <div><label for="location">Current Location</label><input id="location" name="location" type="text"></div>
  <div><label for="project_name">Project or Company Name *</label><input id="project_name" name="project_or_company_name" type="text" required></div>
  <div><label for="project_url">Project or Company URL</label><input id="project_url" name="project_url" type="text"></div>
  <div><label for="linkedin">LinkedIn Profile</label><input id="linkedin" name="linkedin" type="text"></div>
  <div><label for="previous_projects">Previous projects</label><textarea id="previous_projects" name="previous_projects"></textarea></div>
  <div><label for="project_description">Describe your project</label><textarea id="project_description" name="project_description"></textarea></div>
  <div><label for="project_progress">What progress have you made on your project so far?</label><textarea id="project_progress" name="project_progress"></textarea></div>
  <div><label><input id="certify" name="certify_true" type="checkbox" required> I certify the above is true *</label></div>
  <button type="submit" id="submit-btn">Submit application</button>
</form></body></html>`;

const THIEL_LOGIN = `<!doctype html><html><head><title>Thiel Fellowship — Sign In (TEST fixture)</title></head><body>
<h1>Sign in to the Thiel Fellowship</h1>
<p>Create an account or sign in to continue your application.</p>
<form id="login" method="post" action="/never-submit">
  <div><label for="login_email">Email *</label><input id="login_email" name="email" type="email" required></div>
  <div><label for="login_password">Password *</label><input id="login_password" name="password" type="password" required></div>
  <button type="submit" id="signin-btn">Sign in</button>
</form>
<p><a href="/thiel-login">Create account</a> · <a href="/thiel-login">Forgot password?</a></p>
</body></html>`;

const pages = { "/gh-form": GH_FORM, "/thiel-form": THIEL_FORM, "/thiel-login": THIEL_LOGIN, "/captcha-open": CAPTCHA_OPEN, "/captcha-review": CAPTCHA_REVIEW_STEP1, "/gh-confirm": GH_CONFIRM, "/gh-ambiguous": GH_AMBIGUOUS, "/gh-eeo-variant": GH_EEO_VARIANT, "/lever-card": LEVER_CARD, "/gh-remount": GH_REMOUNT, "/gh-remount-forever": GH_REMOUNT_FOREVER, "/gh-false-confirm": GH_FALSE_CONFIRM, "/gh-remount-late": GH_REMOUNT_LATE, "/gh-typeahead": GH_TYPEAHEAD, "/gh-file-vanish": GH_FILE_VANISH, "/gh-file-remount": GH_FILE_REMOUNT, "/gh-current": GH_CURRENT, "/gh-current-late-file": GH_CURRENT_LATE_FILE };const server = http.createServer((req, res) => {
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
