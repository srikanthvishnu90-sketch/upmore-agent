// Portal CEFR guards — the native-proficiency scale-map ruling
// (coordinator ruling 2026-10-17, under the owner's answer-
// delegation), forced by Sezzle's finish drive (submissions/
// redrive-r3-finish-2026-10-17/30-sezzle): the English question's
// options are a CEFR ladder — ["A1 - beginner", "A2 - Pre-
// Intermediate", "B1- Intermediate", "B2 - Upper-intermediate",
// "C1 - Advanced", "C2 - Mastery"] — and the confirmed fact is
// "Native or bilingual proficiency". No exact tier matches and no
// option is token-contained in the fact (the subset-containment
// rule, tests/career-portal-containment.test.cjs, correctly does
// not fire), so the field stopped value_did_not_persist although
// the record settles it: a native speaker sits at the TOP of any
// ordinal proficiency scale the board offers.
//
// THE RULE (narrow): when the fact value is native-class (it
// carries the token "native") and the board's options form the
// CEFR ladder (at least two options whose labels begin with a
// CEFR band A1/A2/B1/B2/C1/C2), the driver picks the top band
// present — C2 when offered, else the highest band offered. ONLY
// the CEFR pattern, ONLY native-class facts: a non-native fact
// ("Fluent") never scale-maps, and a proficiency list without CEFR
// band prefixes is not a ladder. The tier is the weakest in both
// option matchers (the helper's matchOption + driveWidget's
// in-page mirror), below subset-containment: an option stating a
// literal subset of the fact's words always wins over a scale
// translation.
//
// Fail-first map (verified against base d477103):
//   RED -> GREEN: CEFR widget verbatim list -> "C2 - Mastery";
//     CEFR widget ladder-to-C1 -> "C1 - Advanced"; CEFR native
//     select verbatim list -> "C2 - Mastery".
//   PINS (green on both code states): a "Fluent" fact on the same
//     verbatim list picks nothing (honest value_did_not_persist);
//     a non-CEFR proficiency select picks nothing (option_not_found).
// Ledger: PENDING-ALLOCATION row on branch fix/portal-driver-r3
// (BUG/FR numbers requested from the Crew A registry per MI-093).
// Check: node --test tests/career-portal-cefr.test.cjs
const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const os = require("node:os");
const { spawn } = require("node:child_process");
const root = path.resolve(__dirname, "..");
const BrowserBoard = require(path.join(root, "packages/domain/150-career-portal-browser.js"));

function resolvePlaywright() {
  const tries = [];
  if (process.env.UPMORE_PLAYWRIGHT_PATH) tries.push(process.env.UPMORE_PLAYWRIGHT_PATH);
  tries.push("playwright");
  tries.push(path.join(root, "..", "sporve-agent-clone", "node_modules", "playwright"));
  for (const t of tries) { try { require.resolve(t); return t; } catch (e) { /* next */ } }
  return null;
}
const PW = resolvePlaywright();
const SKIP = PW ? false : "playwright is not resolvable in this environment (set UPMORE_PLAYWRIGHT_PATH)";

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-portal-cefr-test-"));
const RESUME_PATH = path.join(tmpDir, "cefr-guard-resume.txt");
fs.writeFileSync(RESUME_PATH, "TEST RESUME - synthetic fixture, not a real person\n");

let fixtureProc, base;
before(async () => {
  fixtureProc = spawn(process.execPath, [path.join(__dirname, "fixtures", "portal-fixture-server.cjs")], { stdio: ["ignore", "pipe", "inherit"] });
  base = await new Promise((resolve, reject) => {
    let buf = "";
    const timer = setTimeout(() => reject(new Error("fixture server did not report a port in 15s")), 15000);
    fixtureProc.stdout.on("data", (d) => {
      buf += d;
      const m = buf.match(/FIXTURE_PORT (\d+)/);
      if (m) { clearTimeout(timer); resolve(`http://localhost:${m[1]}`); }
    });
    fixtureProc.on("exit", () => { clearTimeout(timer); reject(new Error("fixture server exited early")); });
  });
});
after(() => { if (fixtureProc) fixtureProc.kill(); if (BrowserBoard.shutdownAll) BrowserBoard.shutdownAll(); });

function openBoard() {
  const board = BrowserBoard.createBrowserBoard({ url: `${base}/gh-cefr`, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
  board.open();
  return board;
}
function defOf(board, fieldId) {
  const { fields } = board.form();
  const def = fields.find((f) => f.field_id === fieldId);
  assert.ok(def, `the fixture exposes ${fieldId} (got: ${fields.map((f) => f.field_id).join(", ")})`);
  return def;
}
const failuresOf = (board, fieldId) => board.fillFailures.filter((f) => f.field_id === fieldId);

test("CEFR (widget): a native-class fact takes the top band of the verbatim Sezzle ladder, and of a ladder that ends at C1", { skip: SKIP, timeout: 300000 }, async () => {
  const board = openBoard();
  try {
    // The verbatim Sezzle list. RED on base d477103
    // (value_did_not_persist — no tier reaches any band).
    const full = defOf(board, "question_english_cefr");
    board.fill(full.field_id, "Native or bilingual proficiency");
    assert.deepEqual(failuresOf(board, full.field_id), []);
    assert.equal(board.renderedValues[full.field_id], "C2 - Mastery", "the verified rendering is the ladder's top band");
    assert.equal(board.answers()[full.field_id], "C2 - Mastery", "the doorstep readback agrees");

    // The same ladder without C2: the top band PRESENT wins.
    const c1 = defOf(board, "question_english_cefr_c1");
    board.fill(c1.field_id, "Native or bilingual proficiency");
    assert.deepEqual(failuresOf(board, c1.field_id), []);
    assert.equal(board.renderedValues[c1.field_id], "C1 - Advanced");
    assert.equal(board.answers()[c1.field_id], "C1 - Advanced");
  } finally { board.close(); }
});

test("CEFR (widget) pin: a non-native fact never scale-maps — 'Fluent' on the verbatim ladder stays an honest failure", { skip: SKIP, timeout: 300000 }, async () => {
  const board = openBoard();
  try {
    const pin = defOf(board, "question_english_cefr_fluent");
    assert.equal(board.fill(pin.field_id, "Fluent"), undefined, "no band was invented for a non-native fact");
    assert.ok(failuresOf(board, pin.field_id).some((f) => f.reason === "value_did_not_persist"), "the failure is the honest value_did_not_persist");
  } finally { board.close(); }
});

test("CEFR (native select, matchOption): the verbatim ladder takes C2; a proficiency list without CEFR bands is not a ladder", { skip: SKIP, timeout: 240000 }, async () => {
  const board = openBoard();
  try {
    // RED on base d477103 (option_not_found).
    const sel = defOf(board, "english_cefr_select");
    board.fill(sel.field_id, "Native or bilingual proficiency");
    assert.deepEqual(failuresOf(board, sel.field_id), []);
    assert.equal(board.answers()[sel.field_id], "C2 - Mastery");

    // Pin: proficiency WORDS without band prefixes never scale-map.
    const plain = defOf(board, "english_plain_select");
    assert.equal(board.fill(plain.field_id, "Native or bilingual proficiency"), undefined, "no pick on a non-CEFR list");
    assert.ok(failuresOf(board, plain.field_id).some((f) => f.reason === "option_not_found"), "the refusal is the honest option_not_found");
  } finally { board.close(); }
});
