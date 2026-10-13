// Intake lane — FIRST REAL-INPUT RUN (2026-10-13): the 56 real junior
// bankers from ~/workspace/your_files/upmore-real-people-finance-v1.md
// (fixture: tests/fixtures/real-people-finance-v1.cjs) fed through module
// 146 as pasted CSV. Ground truth is the file's own: 0 published emails,
// 31 INFERRED-HELD, 25 NOT FOUND, 19 records carrying per-record staleness
// flags (the file's closing queue says 17 — it omits Holden Emery and
// Saran Diakite Kaba, whose own records carry the flag; per-record flags
// win). FAIL-FIRST: written against the pre-fix lane, which counted all
// 56 current + ready and preserved 0 of 31 email labels.
// Check: node --test tests/career-intake-real-data.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Intake = require(path.join(root, "packages/domain/146-career-intake.js"));
const { csv, groundTruth: GT } = require(path.join(root, "tests/fixtures/real-people-finance-v1.cjs"));

const run = Intake.intake({ pastedText: csv });
const byName = new Map(run.records.map((r) => [r.full_name, r]));
const notCurrent = (r) => r.flags.includes("departed") || r.flags.includes("currency_stale") || r.flags.includes("currency_unverified");

test("real run: pipeline counts against real data — 56 in, no dupes, no silent drops", () => {
  assert.equal(run.counts.received, 56);
  assert.equal(run.counts.deduped, 56);
  assert.equal(run.counts.duplicates_removed, 0);
  assert.deepEqual(run.errors, []);
  assert.equal(run.records.length, 56);
});

test("real run: currency stage honors the file's per-record flags — 19 flagged are NOT current, 37 are", () => {
  assert.equal(run.counts.current, GT.currentCount, "current must exclude every file-flagged record");
  assert.equal(run.counts.ready, GT.currentCount, "every current record carries a firm, so ready == current here");
  for (const name of GT.flagged) {
    const r = byName.get(name);
    assert.ok(r, `${name} missing from output`);
    assert.ok(notCurrent(r), `${name} is flagged in the source file but the lane carries them as current`);
    assert.ok(run.flagged.some((f) => f.full_name === name), `${name} must appear in the flagged list with its reason`);
  }
  for (const r of run.records) {
    if (!GT.flagged.includes(r.full_name)) assert.ok(!notCurrent(r), `${r.full_name} is current in the file but flagged by the lane`);
  }
});

test("real run: the two hard-stale DePaul records (registration ended) are stale, never ready", () => {
  const nyqvist = byName.get("Annie Nyqvist"); // Blair registration ended 03/2024, "not currently registered"
  assert.equal(nyqvist.currency_status, "stale");
  assert.ok(nyqvist.flags.includes("currency_stale"));
  const sharma = byName.get("Srijan Sharma"); // BDO registration ran to 08/2026, "not currently registered"
  assert.ok(notCurrent(sharma));
});

test("real run: every email label survives exactly — INFERRED-HELD stays held, NOT FOUND stays empty, nothing becomes published", () => {
  for (const [name, email] of Object.entries(GT.inferredByName)) {
    const r = byName.get(name);
    assert.equal(r.email, email, `${name}: inferred address must be carried verbatim`);
    assert.equal(r.email_status, "inferred_held", `${name}: a pattern guess must stay labeled held`);
  }
  for (const name of GT.notFoundNames) {
    const r = byName.get(name);
    assert.equal(r.email, null, `${name}: NOT FOUND in the file, lane must not produce an address`);
    assert.equal(r.email_status, "not_found");
  }
  assert.equal(run.records.filter((r) => r.email_status === "published").length, GT.published,
    "the file contains zero published emails; the lane may not mint any");
});

test("real run: real name shapes survive intact — compound surname, suffix, apostrophe", () => {
  for (const name of ["Saran Diakite Kaba", "William A. Tyndall Jr.", "Dylan D'Agate", "Rachel O'Brien", "Guram Khatchapuridze"]) {
    assert.ok(byName.has(name), `${name} must survive parsing byte-for-byte`);
  }
  // Kaba's compound surname is exactly why no address was constructed for
  // her in the source research — the lane must not construct one either.
  assert.equal(byName.get("Saran Diakite Kaba").email, null);
});

test("real run: an email with NO stated status defaults to unverified — never silently upgraded", () => {
  const r = Intake.intake({ pastedText: "Name,Firm,Title,Office,Email\nTest Person,Example Bank,Analyst,Chicago,tp@example.com" });
  assert.equal(r.records[0].email, "tp@example.com");
  assert.equal(r.records[0].email_status, "unverified");
});
