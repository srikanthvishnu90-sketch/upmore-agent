"use strict";
/* Fixture pages for tests/career-widget-attach.test.cjs (widget/attach
 * lane, 2026-10-21). Served by a SEPARATE process for the BUG-045
 * reason: module 150's sync bridge blocks the test process's event
 * loop while a command is in flight, so an in-process server could
 * never answer Chromium.
 * Pages:
 *   /scan-form     — a Lever-shaped form (text fields, a 60-option
 *                    checkbox group, radio groups, a select, resume +
 *                    cover file inputs) whose own script counts how
 *                    many FULL field-discovery scans run against it
 *                    (document.querySelectorAll with the discovery
 *                    selector) and reports the count to /__report.
 *   /remount-form  — Greenhouse-shaped upload section: on the resume
 *                    input's first change, the whole section vanishes
 *                    for ~2.5 s (parse state) and returns with the
 *                    cover input FIRST in DOM order and the resume
 *                    input under a NEW id — the 2026-10-21 live shape.
 *   /widget-stuck  — a react-select-shaped widget that is never
 *                    actionable (visibility:hidden subtree) + one
 *                    normal text field after it.
 *   /widget-select — a working react-select clone whose decline
 *                    option shares no token with the wanted text, so
 *                    only the cleared-search rung can reach it.
 *   /chip-form     — the live Greenhouse post-upload state: on the
 *                    resume input's change, its group is replaced by
 *                    the attached file's NAME (the chip) — no input
 *                    exists afterwards to digest or to hunt for. */
const http = require("node:http");

let lastScanCount = 0;

const scanForm = `<!doctype html><html><body>
<h1>Application (fixture)</h1>
<script>
window.__scanCount = 0;
const __origQSA = document.querySelectorAll.bind(document);
document.querySelectorAll = function (sel) {
  if (String(sel).indexOf("input, select, textarea") !== -1) window.__scanCount += 1;
  return __origQSA(sel);
};
setInterval(() => { fetch("/__report?c=" + window.__scanCount).catch(() => {}); }, 400);
</script>
<form>
  <label>Full name <input type="text" name="name"></label>
  <label>Email <input type="email" name="email"></label>
  <fieldset><legend>Language skills (check all that apply)</legend>
    ${Array.from({ length: 60 }, (_, i) => `<label><input type="checkbox" name="language_skills" value="Skill ${i + 1}"> Skill ${i + 1}</label>`).join("\n    ")}
  </fieldset>
  <fieldset><legend>Are you legally authorized to work in the country?</legend>
    ${["Yes", "No", "Not sure", "Prefer not to say", "Other"].map((v) => `<label><input type="radio" name="auth" value="${v}"> ${v}</label>`).join("\n    ")}
  </fieldset>
  <fieldset><legend>Will you now or in the future require sponsorship?</legend>
    ${["Yes", "No", "Not sure", "Prefer not to say", "Other"].map((v) => `<label><input type="radio" name="spons" value="${v}"> ${v}</label>`).join("\n    ")}
  </fieldset>
  <label>Graduation year
    <select name="grad_year"><option value="">Select</option><option value="2027">2027</option><option value="2028">2028</option><option value="2029">2029</option></select>
  </label>
  <label>Attach <input type="file" id="resume" name="resume"></label>
  <label>Cover letter <input type="file" id="cover_letter" name="cover_letter"></label>
</form>
${Array.from({ length: 800 }, () => "<div class='filler'><p>posting prose</p></div>").join("\n")}
</body></html>`;

const remountForm = `<!doctype html><html><body>
<h1>Application (fixture)</h1>
<form>
  <label>Full name <input type="text" name="name"></label>
  <label>Email <input type="email" name="email"></label>
  <div id="upload-section">
    <label>Attach <input type="file" id="resume" name="resume"></label>
    <label>Cover letter <input type="file" id="cover_letter" name="cover_letter"></label>
  </div>
</form>
<script>
let remounted = false;
document.addEventListener("change", (e) => {
  if (remounted || !e.target || e.target.id !== "resume") return;
  remounted = true;
  const section = document.getElementById("upload-section");
  setTimeout(() => {
    section.innerHTML = "<p>Processing your resume…</p>";
    setTimeout(() => {
      section.innerHTML =
        '<label>Cover letter <input type="file" id="cover_letter" name="cover_letter"></label>' +
        '<label>Resume <input type="file" id="resume_upload_2" name="resume"></label>';
    }, 2500);
  }, 300);
});
</script>
</body></html>`;

const chipForm = `<!doctype html><html><body>
<h1>Application (fixture)</h1>
<form>
  <label>Full name <input type="text" name="full_name"></label>
  <div class="file-upload" id="resume-group">
    <div class="label upload-label" id="upload-label-resume">Resume/CV</div>
    <div class="file-upload__wrapper">
      <label>Attach <input type="file" id="resume" name="resume"></label>
    </div>
  </div>
  <div class="file-upload" id="cover-group">
    <div class="label upload-label" id="upload-label-cover_letter">Cover Letter</div>
    <div class="file-upload__wrapper">
      <label>Attach <input type="file" id="cover_letter" name="cover_letter"></label>
    </div>
  </div>
</form>
<script>
document.addEventListener("change", (e) => {
  if (!e.target || e.target.id !== "resume") return;
  const f = e.target.files && e.target.files[0];
  setTimeout(() => {
    document.getElementById("resume-group").innerHTML =
      '<div class="label upload-label" id="upload-label-resume">Resume/CV</div>' +
      '<div class="file-upload__wrapper"><span class="uploaded-chip">' + (f ? f.name : "") + '</span></div>';
  }, 700);
});
</script>
</body></html>`;

const widgetStuck = `<!doctype html><html><body>
<h1>Application (fixture)</h1>
<form>
  <div style="visibility:hidden">
    <label>Country
      <span class="select__control"><input type="text" class="select__input" name="country_widget" aria-expanded="false"></span>
    </label>
  </div>
  <label>City <input type="text" name="city"></label>
</form>
</body></html>`;

const widgetSelect = `<!doctype html><html><body>
<h1>Application (fixture)</h1>
<form>
  <label>Veteran status</label>
  <div class="select__control" id="eeo-control">
    <input type="text" class="select__input" id="eeo_input" name="eeo_veteran" aria-expanded="false">
    <div class="select__single-value" id="eeo_single" style="display:none"></div>
  </div>
  <div id="eeo_menu"></div>
</form>
<script>
const OPTIONS = ["I am a veteran", "I am not a veteran", "I don't wish to answer"];
const input = document.getElementById("eeo_input");
const menu = document.getElementById("eeo_menu");
const single = document.getElementById("eeo_single");
function render() {
  const q = (input.value || "").toLowerCase();
  menu.innerHTML = "";
  for (const opt of OPTIONS) {
    if (q && opt.toLowerCase().indexOf(q) === -1) continue;
    const d = document.createElement("div");
    d.className = "select__option";
    d.textContent = opt;
    d.addEventListener("mousedown", () => {
      single.textContent = opt;
      single.style.display = "";
      input.value = "";
      input.setAttribute("aria-expanded", "false");
      menu.innerHTML = "";
    });
    menu.appendChild(d);
  }
  input.setAttribute("aria-expanded", "true");
}
input.addEventListener("focus", render);
input.addEventListener("input", render);
input.addEventListener("click", render);
</script>
</body></html>`;

const server = http.createServer((req, res) => {
  const u = new URL(req.url, "http://localhost");
  if (u.pathname === "/__report") { lastScanCount = Number(u.searchParams.get("c") || 0); res.end("ok"); return; }
  if (u.pathname === "/__count") { res.setHeader("content-type", "application/json"); res.end(JSON.stringify({ count: lastScanCount })); return; }
  const pages = { "/scan-form": scanForm, "/remount-form": remountForm, "/widget-stuck": widgetStuck, "/widget-select": widgetSelect, "/chip-form": chipForm };
  const page = pages[u.pathname];
  if (!page) { res.statusCode = 404; res.end("nope"); return; }
  res.setHeader("content-type", "text/html");
  res.end(page);
});
server.listen(0, "127.0.0.1", () => {
  console.log("FIXTURE_PORT " + server.address().port);
});
