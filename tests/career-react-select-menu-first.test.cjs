"use strict";
// REACT-SELECT MENU-FIRST — synthetic-fixture capability suite for the
// helper's custom-select drive (scripts/career/portal-browser-helper.cjs,
// driveWidget via cmdFill — the same executor path the forms-ci coverage
// suite drives).
//
// SYNTHETIC CONSTRUCTED FIXTURE — not a captured form, not live evidence.
// The page below is built for this suite: three Greenhouse-shaped
// react-select widgets whose options exist ONLY inside the opened menu
// (rendered by the page's script when the control is engaged, filtered
// by the search box's text with react-select's substring semantics).
// A green run proves a driver CAPABILITY on this fixture; it makes no
// captured-form coverage claim and changes no pin.
//
// THE GAP THIS PINS (measured in the forms-ci coverage work, 2026-10-24):
// the widget drive types the wanted value into the search box FIRST and
// then polls for a matching option among the FILTERED list. An option
// whose label shares no token with the wanted value filters itself out
// of its own menu — the EEO decline is the standing example (wanted
// "Decline to self-identify", the board's option "I don't wish to
// answer"): the typed text hides it, and the ladder can only judge it
// after the cleared-search rung (i=16 — sixteen fixed 500 ms polls,
// >= 8 s of constructed wait) renders the full list again. On the
// captured Greenhouse forms the same drive shape burns ~19-71 s per
// custom-select field and ends value_did_not_persist wherever the
// option service never answers; that per-fill burn is the root pressure
// behind the coverage suite's timeout crossings.
//
// THE CONTRACT: the drive opens the menu and reads the options it
// actually renders, judging the wanted value against that list with the
// ladder's own matcher, BEFORE typing anything. A pick counts only when
// the widget's own single-value renders it (the verification cmdFill
// already applies). When the opened menu renders no matching option —
// a search-first widget, a scriptless capture — the drive falls through
// to the existing ladder, unchanged: same bindings, same outcome
// vocabulary (filled / value_did_not_persist), same read-back.
//
// FAIL-FIRST: the decline test below is red on the pre-fix driver — the
// pick lands only via the cleared-search rung, so the fill takes >= 8 s
// of constructed poll waits against this suite's 5 s bound — and green
// once the menu read leads. The exact-match and no-match tests are
// green before and after: they guard the common path and the
// fall-through, not the fix.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const http = require("node:http");
const { spawn } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const HELPER = path.join(ROOT, "scripts", "career", "portal-browser-helper.cjs");
require(path.join(ROOT, "extension", "lib", "trainee-core.js"));
const bindFields = globalThis.TraineeCore.bindFields;

const FIXTURE = `<!doctype html><html><body>
<h1>Application (synthetic fixture)</h1>
<form id="app">
  <div class="field-wrapper"><div class="select"><div class="select__container">
    <label id="gender-label" for="gender" class="label select__label">Gender</label>
    <div class="select-shell">
      <div class="select__control"><div class="select__value-container">
        <div class="select__placeholder">Select...</div>
        <div class="select__input-container"><input class="select__input" id="gender" name="gender" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-labelledby="gender-label"></div>
      </div></div>
      <div class="select__menu-slot"></div>
    </div>
  </div></div></div>
  <div class="field-wrapper"><div class="select"><div class="select__container">
    <label id="country-label" for="country" class="label select__label">Country</label>
    <div class="select-shell">
      <div class="select__control"><div class="select__value-container">
        <div class="select__placeholder">Select...</div>
        <div class="select__input-container"><input class="select__input" id="country" name="country" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-labelledby="country-label"></div>
      </div></div>
      <div class="select__menu-slot"></div>
    </div>
  </div></div></div>
  <div class="field-wrapper"><div class="select"><div class="select__container">
    <label id="school-label" for="school" class="label select__label">School</label>
    <div class="select-shell">
      <div class="select__control"><div class="select__value-container">
        <div class="select__placeholder">Select...</div>
        <div class="select__input-container"><input class="select__input" id="school" name="school" type="text" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-labelledby="school-label"></div>
      </div></div>
      <div class="select__menu-slot"></div>
    </div>
  </div></div></div>
</form>
<script>
const WIDGETS = {
  gender: ["Female", "Male", "Non-binary", "I don't wish to answer"],
  country: ["Canada", "Mexico", "United States"],
  school: ["Alpha University", "Beta College"]
};
function wire(id, options) {
  const input = document.getElementById(id);
  const shell = input.closest(".select-shell");
  const slot = shell.querySelector(".select__menu-slot");
  const vc = input.closest(".select__value-container");
  function close() { slot.innerHTML = ""; input.setAttribute("aria-expanded", "false"); }
  function render() {
    const q = (input.value || "").toLowerCase();
    slot.innerHTML = "";
    const menu = document.createElement("div");
    menu.className = "select__menu";
    const hits = options.filter((o) => !q || o.toLowerCase().indexOf(q) !== -1);
    if (!hits.length) {
      const n = document.createElement("div");
      n.className = "select__menu-notice--no-options";
      n.textContent = "No options";
      menu.appendChild(n);
    }
    for (const opt of hits) {
      const d = document.createElement("div");
      d.className = "select__option";
      d.textContent = opt;
      d.addEventListener("mousedown", () => {
        let sv = vc.querySelector(".select__single-value");
        if (!sv) { sv = document.createElement("div"); sv.className = "select__single-value"; vc.insertBefore(sv, vc.firstChild); }
        sv.textContent = opt;
        const ph = vc.querySelector(".select__placeholder"); if (ph) ph.style.display = "none";
        input.value = "";
        close();
      });
      menu.appendChild(d);
    }
    slot.appendChild(menu);
    input.setAttribute("aria-expanded", "true");
  }
  input.addEventListener("focus", render);
  input.addEventListener("click", render);
  input.addEventListener("input", render);
  input.addEventListener("keydown", (e) => { if (e.key === "Escape") close(); });
}
for (const id of Object.keys(WIDGETS)) wire(id, WIDGETS[id]);
</script>
</body></html>`;

const requests = [];
const server = http.createServer((req, res) => {
  requests.push(req.method + " " + req.url);
  if (req.url !== "/fixture") { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { "content-type": "text/html" });
  res.end(FIXTURE);
});

let base = null, sessionDir = null, helper = null;
let seq = 0;
const cmdTypesSent = [];
async function send(cmd, ms = 120000, boardId = "react-select-menu-first") {
  const id = String(++seq).padStart(4, "0");
  cmdTypesSent.push(cmd.type);
  fs.writeFileSync(path.join(sessionDir, `cmd-${id}.json`), JSON.stringify({ boardId, ...cmd }));
  const respFile = path.join(sessionDir, `resp-${id}.json`);
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try { const r = JSON.parse(fs.readFileSync(respFile, "utf8")); fs.rmSync(respFile, { force: true }); return r; }
    catch { await new Promise((r) => setTimeout(r, 60)); }
  }
  throw new Error("helper response timeout for " + cmd.type);
}

test.before(async () => {
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
  sessionDir = fs.mkdtempSync(path.join(os.tmpdir(), "react-select-menu-first-"));
  helper = spawn(process.execPath, [HELPER, sessionDir], { env: { ...process.env }, stdio: ["ignore", "pipe", "pipe"] });
  helper.stderr.on("data", (b) => process.stderr.write("[helper] " + b));
  const end = Date.now() + 60000;
  let ready = null;
  while (Date.now() < end) {
    try { ready = JSON.parse(fs.readFileSync(path.join(sessionDir, "ready.json"), "utf8")); break; }
    catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.ok(ready, "helper daemon did not become ready");
});

test.after(async () => {
  try { await send({ type: "shutdown" }, 5000); } catch {}
  if (helper) helper.kill("SIGKILL");
  server.close();
});

// One field of the fixture, driven exactly as the coverage suite drives a
// captured form: open -> discover -> bindFields -> fill (timed) ->
// readback of the filled binding against the same observation version.
async function driveOneField(boardId, fieldName, value) {
  const open = await send({ type: "open", url: `${base}/fixture` }, 120000, boardId);
  assert.equal(open.ok, true, JSON.stringify(open));
  const disc = await send({ type: "discover" }, 120000, boardId);
  assert.equal(disc.ok, true, JSON.stringify(disc));
  const { bindings, schema } = bindFields(disc.data.fields);
  const s = schema.find((x) => x.name === fieldName);
  assert.ok(s, `fixture field ${fieldName} was not mapped`);
  const b = bindings[fieldName];
  assert.equal(b.widget, "react-select", `fixture field ${fieldName} was not bound as a react-select widget`);
  const version = disc.data.observation.version;
  const f0 = Date.now();
  const r = await send({ type: "fill", binding: b, value, observationVersion: version }, 300000, boardId);
  const ms = Date.now() - f0;
  assert.equal(r.ok, true, JSON.stringify(r));
  let answer = null;
  if (r.data.filled) {
    const read = await send({ type: "readback", bindings: [b], observationVersion: version }, 120000, boardId);
    assert.equal(read.ok, true, JSON.stringify(read));
    answer = read.data.answers[b.field_id] ?? null;
  }
  await send({ type: "close" }, 120000, boardId);
  return { fill: r.data, ms, answer };
}

test("react-select menu-first: the decline option typed filtering hides is picked from the opened menu, not the cleared-search rung", { timeout: 60000 }, async () => {
  const { fill, ms, answer } = await driveOneField("rsmf-decline", "gender", "Decline to self-identify");
  console.log(`menu-first decline fill: outcome=${fill.filled ? "filled" : fill.reason} ms=${ms} readback=${JSON.stringify(answer)}`);
  assert.equal(fill.filled, true, `the decline pick did not land: ${JSON.stringify(fill)}`);
  assert.equal(answer, "I don't wish to answer", "the read-back is not the board's own decline wording");
  // The ladder reaches this option only at its cleared-search rung
  // (i=16): sixteen fixed 500 ms polls of constructed wait, >= 8 s,
  // before the full list is even rendered again. A drive that reads
  // the opened menu judges the full list at once.
  assert.ok(ms < 5000, `the decline fill took ${ms}ms — the pick still waits for the ladder's cleared-search rung (>= 8000ms of constructed polls) instead of reading the opened menu`);
});

test("react-select menu-first: an exact-match option still fills and reads back exactly", { timeout: 60000 }, async () => {
  const { fill, ms, answer } = await driveOneField("rsmf-exact", "country", "United States");
  console.log(`menu-first exact fill: outcome=${fill.filled ? "filled" : fill.reason} ms=${ms} readback=${JSON.stringify(answer)}`);
  assert.equal(fill.filled, true, `the exact-match pick did not land: ${JSON.stringify(fill)}`);
  assert.equal(answer, "United States", "the read-back is not exactly the chosen option");
});

test("react-select menu-first: a value with no matching option still ends value_did_not_persist via the unchanged ladder", { timeout: 120000 }, async () => {
  const { fill, ms, answer } = await driveOneField("rsmf-nomatch", "school", "Synthetic University");
  console.log(`menu-first no-match fill: outcome=${fill.filled ? "filled" : fill.reason} ms=${ms} readback=${JSON.stringify(answer)}`);
  assert.equal(fill.filled, false, `a value with no option in the menu was counted filled: ${JSON.stringify(fill)}`);
  assert.equal(fill.reason, "value_did_not_persist", `the no-match outcome vocabulary changed: ${JSON.stringify(fill)}`);
  assert.equal(answer, null, "an unfilled widget produced a read-back answer");
});

test("react-select menu-first: the drive stays inside the read-only command set", () => {
  const allowed = new Set(["open", "discover", "fill", "readback", "close", "shutdown"]);
  assert.deepEqual([...new Set(cmdTypesSent)].filter((t) => !allowed.has(t)), [], "a command outside the read-only drive set was sent");
  assert.ok(requests.every((r) => r.startsWith("GET ")), "the fixture server received a non-GET request");
});
