// Portal containment guards — the subset-containment ruling for
// composite facts (coordinator ruling 2026-10-17, under the owner's
// answer-delegation), forced by the live Sezzle finish drive
// (submissions/redrive-r3-finish-2026-10-17/30-sezzle): two REQUIRED
// selects stayed empty because the board's option vocabularies
// contain neither fact phrasing verbatim — the degree discipline
// fact "Computer Science and Finance" and the English fact "Native
// or bilingual proficiency" — and the driver (correctly, pre-ruling)
// failed safe rather than choose an answer the fact does not state.
//
// THE RULE: when no exact or equivalence tier matches, an option
// whose every token is one of the composite fact's tokens may be
// picked — it states a strict subset of the truth and invents
// nothing. An option carrying any foreign token (a superset, a
// different fact, or the fact's own tokens reordered — an equal
// claim, not a lesser one) is NEVER picked. Deterministic: an
// option equal to the fact's first component wins; else the
// longest qualifying option; else list order. Composite facts
// only. The rule lives where the other equivalence classes live:
// the helper's matchOption (native select / radio / checkbox) and
// driveWidget's in-page matcher (react-select), as the weakest
// tier in both.
//
// Fail-first map (verified against base 0c02148):
//   RED -> GREEN: degree widget alt (mid-string "Finance"),
//     english widget main (mid-string "Bilingual proficiency"),
//     degree select alt (mid-string "Finance"), english select
//     longest (longest-wins determinism over list order).
//   PINS (green on both, constraining the new tier): first-
//     component preference over list order, the "Native" pick,
//     the no-qualifying-option honest failure, and both superset
//     refusals — the same pin discipline as the R3-D3 seam pins.
// Live Sezzle note: the real board's lists qualify under NEITHER
// field (degree options are exactly Yes/No; English options are
// the CEFR scale A1..C2, no token of which is in the fact) — both
// fields stay honest owner picks there; the disposition row in
// docs/bug-ledger.md carries the verbatim lists.
// Ledger: PENDING-ALLOCATION row on branch fix/portal-driver-r3
// (BUG/FR numbers requested from the Crew A registry per MI-093).
// Check: node --test tests/career-portal-containment.test.cjs
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

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "upmore-portal-containment-test-"));
const RESUME_PATH = path.join(tmpDir, "containment-guard-resume.txt");
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
  const board = BrowserBoard.createBrowserBoard({ url: `${base}/gh-containment`, userId: "user-alex-test", resumePath: RESUME_PATH, evidenceDir: tmpDir });
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

test("containment (widget): the first component wins over list order, a mid-string component is reachable, and the first component itself is picked", { skip: SKIP, timeout: 300000 }, async () => {
  const board = openBoard();
  try {
    // board.fill echoes the wanted value on success; the PICK the
    // board holds is judged by the verified rendering + readback.
    // [Finance, Computer Science, ...] with Finance listed FIRST:
    // the pick is the fact's first component, never list order.
    const main = defOf(board, "question_degree_main");
    board.fill(main.field_id, "Computer Science and Finance");
    assert.deepEqual(failuresOf(board, main.field_id), []);
    assert.equal(board.renderedValues[main.field_id], "Computer Science", "the verified rendering is the first-component pick");
    assert.equal(board.answers()[main.field_id], "Computer Science", "the doorstep readback agrees");

    // [Finance, Data Science, Mathematics]: no first component, no
    // prefix — only the containment tier reaches "Finance".
    // RED on base 0c02148 (value_did_not_persist).
    const alt = defOf(board, "question_degree_alt");
    board.fill(alt.field_id, "Computer Science and Finance");
    assert.deepEqual(failuresOf(board, alt.field_id), []);
    assert.equal(board.renderedValues[alt.field_id], "Finance");
    assert.equal(board.answers()[alt.field_id], "Finance");

    // [Fluent, Bilingual proficiency, ...]: "Bilingual proficiency"
    // is token-contained mid-string — not a prefix of the fact, so
    // no earlier tier reaches it. RED on base 0c02148.
    const eng = defOf(board, "question_english_main");
    board.fill(eng.field_id, "Native or bilingual proficiency");
    assert.deepEqual(failuresOf(board, eng.field_id), []);
    assert.equal(board.renderedValues[eng.field_id], "Bilingual proficiency");
    assert.equal(board.answers()[eng.field_id], "Bilingual proficiency");

    // [Native, Fluent]: the fact's first component itself.
    const nat = defOf(board, "question_english_native");
    board.fill(nat.field_id, "Native or bilingual proficiency");
    assert.deepEqual(failuresOf(board, nat.field_id), []);
    assert.equal(board.renderedValues[nat.field_id], "Native");
    assert.equal(board.answers()[nat.field_id], "Native");
  } finally { board.close(); }
});

test("containment (widget) pins: no qualifying option stays an honest failure, and superset / foreign-token / reordered-equal options are never picked", { skip: SKIP, timeout: 600000 }, async () => {
  const board = openBoard();
  try {
    // [Fluent, Conversational, Basic]: nothing token-contained —
    // the fail-safe behavior the ruling preserves, unchanged.
    const neg = defOf(board, "question_english_neg");
    assert.equal(board.fill(neg.field_id, "Native or bilingual proficiency"), undefined, "no option was invented for the fact");
    assert.ok(failuresOf(board, neg.field_id).some((f) => f.reason === "value_did_not_persist"), "the failure is the honest value_did_not_persist");

    // [Advanced Computer Science, Finance and Mathematics, Finance
    // and Computer Science]: a superset, a foreign token, and the
    // fact's tokens reordered — containment refuses all three.
    const sup = defOf(board, "question_degree_superset");
    assert.equal(board.fill(sup.field_id, "Computer Science and Finance"), undefined, "no superset or reordered option was picked");
    assert.ok(failuresOf(board, sup.field_id).some((f) => f.reason === "value_did_not_persist"), "the refusal is recorded, not hidden");
  } finally { board.close(); }
});

test("containment (native select, matchOption): first component, mid-string reach, and longest-wins determinism", { skip: SKIP, timeout: 240000 }, async () => {
  const board = openBoard();
  try {
    // [Finance, Computer Science, Data Science], Finance first:
    // the pick is the first component (pin — the prefix tier
    // agrees; the containment tier's preference must not disturb it).
    const main = defOf(board, "degree_select_main");
    board.fill(main.field_id, "Computer Science and Finance");
    assert.deepEqual(failuresOf(board, main.field_id), []);
    assert.equal(board.answers()[main.field_id], "Computer Science");

    // [Finance, Data Science]: only a mid-string component —
    // RED on base 0c02148 (option_not_found).
    const alt = defOf(board, "degree_select_alt");
    board.fill(alt.field_id, "Computer Science and Finance");
    assert.deepEqual(failuresOf(board, alt.field_id), []);
    assert.equal(board.answers()[alt.field_id], "Finance");

    // [Bilingual, Proficiency]: both token-contained, neither is
    // the first component — the LONGEST wins over list order.
    // RED on base 0c02148 (option_not_found).
    const longest = defOf(board, "english_select_longest");
    board.fill(longest.field_id, "Native or bilingual proficiency");
    assert.deepEqual(failuresOf(board, longest.field_id), []);
    assert.equal(board.answers()[longest.field_id], "Proficiency");
  } finally { board.close(); }
});

test("containment (native select) pin: superset and reordered-equal options are refused — option_not_found, nothing invented", { skip: SKIP, timeout: 240000 }, async () => {
  const board = openBoard();
  try {
    const sup = defOf(board, "degree_select_superset");
    assert.equal(board.fill(sup.field_id, "Computer Science and Finance"), undefined, "no superset or reordered option was picked");
    assert.ok(failuresOf(board, sup.field_id).some((f) => f.reason === "option_not_found"), "the failure is the honest option_not_found");
  } finally { board.close(); }
});
