// MI-115 / BUG-235 — unknown_outcome is not terminal: a bounded resolver
// re-checks the employer's side for unresolved applications, records
// every attempt, resolves what can be proven, and re-presents the rest
// as a named question. It NEVER submits. The inbox half of Spec 2 §8.3
// is NOT_WIRED (Gmail not connected in-product, MI-074) — employer-side
// checks only; a missing inbox seam is recorded, never faked.
// Fixtures: the two standing cases from the owner's 2026-10-15 ledger
// (Arc Boat Company, Labelbox), faithful to submissions/ledger.jsonl.
// FAIL-FIRST: every test red until 149 exports resolveUnknownOutcomes.
// Check: node --test tests/career-unknown-outcome-resolver.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const Portal = require(path.join(root, "packages/domain/149-career-portal-apply.js"));

const NOW = "2026-10-16T18:00:00Z"; // >24h after both standing cases
const arc = () => ({
  userId: "owner", appId: "b2-16-arc", canonicalKey: "greenhouse:arcboatcompany:finance-and-strategy-intern",
  company: "Arc Boat Company", vendor: "greenhouse",
  url: "https://boards.greenhouse.io/arcboatcompany/jobs/000",
  status: "unknown_outcome", timestamp: "2026-10-15T15:47:42Z",
});
const labelbox = () => ({
  userId: "owner", appId: "21-labelbox", canonicalKey: "greenhouse:labelbox:business-operations-and-strategy-intern",
  company: "Labelbox", vendor: "greenhouse",
  url: "https://boards.greenhouse.io/labelbox/jobs/000",
  status: "unknown_outcome", timestamp: "2026-10-15T16:41:35Z",
});

test("MI-115 standing case — Arc: the employer-side read proves nothing landed, so the record resolves not_submitted with the attempt on record", () => {
  const rec = arc();
  const report = Portal.resolveUnknownOutcomes({
    records: [rec], now: NOW,
    readers: (r) => (r.appId === "b2-16-arc" ? { state: "not_submitted" } : null),
  });
  assert.equal(report.attempted, 1);
  assert.equal(rec.status, "not_submitted");
  assert.equal(rec.resolvedBy, "employer_verified_absent");
  assert.equal(rec.resolutionAttempts.length, 1);
  assert.equal(rec.resolutionAttempts[0].method, "employer_status_read");
  assert.equal(rec.resolutionAttempts[0].result, "resolved_not_submitted");
});

test("MI-115 standing case — Labelbox: the board cannot prove either way, so the record stays unknown with a NAMED user question and the attempt recorded", () => {
  const rec = labelbox();
  const report = Portal.resolveUnknownOutcomes({
    records: [rec], now: NOW,
    readers: () => ({ state: "unverifiable", reason: "no public status surface for this board" }),
  });
  assert.equal(report.attempted, 1);
  assert.equal(rec.status, "unknown_outcome", "unverifiable never resolves by hope");
  assert.equal(rec.stillUnknown, true);
  assert.match(rec.userQuestion, /Labelbox/, "the re-presented question names the application");
  assert.equal(rec.resolutionAttempts.length, 1);
  assert.equal(rec.resolutionAttempts[0].result, "still_unknown");
  assert.equal(report.stillUnknown.length, 1);
});

test("MI-115: an employer-confirmed case resolves to submitted and carries the employer's confirmation ID", () => {
  const rec = labelbox();
  Portal.resolveUnknownOutcomes({
    records: [rec], now: NOW,
    readers: () => ({ state: "submitted", confirmationId: "GH-998877" }),
  });
  assert.equal(rec.status, "submitted");
  assert.equal(rec.resolvedBy, "employer_confirmed");
  assert.equal(rec.confirmationId, "GH-998877");
});

test("MI-115: a reader claiming 'submitted' WITHOUT a confirmation ID proves nothing — the record stays unknown", () => {
  const rec = arc();
  Portal.resolveUnknownOutcomes({
    records: [rec], now: NOW,
    readers: () => ({ state: "submitted" }),
  });
  assert.equal(rec.status, "unknown_outcome", "an ID-less claim is not employer proof (the BUG-208 lesson)");
  assert.equal(rec.stillUnknown, true);
});

test("MI-115: bounds — records younger than 24h are untouched, a fresh attempt throttles the next pass, and a pass is capped", () => {
  const young = Object.assign(arc(), { appId: "young-1", timestamp: "2026-10-16T17:00:00Z" });
  Portal.resolveUnknownOutcomes({ records: [young], now: NOW, readers: () => ({ state: "not_submitted" }) });
  assert.equal(young.status, "unknown_outcome");
  assert.equal(young.resolutionAttempts, undefined, "no attempt was recorded against a too-young record");

  const fresh = Object.assign(arc(), { appId: "fresh-1", resolutionAttempts: [{ at: "2026-10-16T17:30:00Z", method: "employer_status_read", result: "still_unknown" }] });
  const rep2 = Portal.resolveUnknownOutcomes({ records: [fresh], now: NOW, readers: () => ({ state: "not_submitted" }) });
  assert.equal(rep2.attempted, 0, "attempted 30 minutes ago — the resolver does not hammer the board");
  assert.equal(fresh.resolutionAttempts.length, 1);

  const many = Array.from({ length: 25 }, (_, i) => Object.assign(arc(), { appId: `bulk-${i}`, canonicalKey: `greenhouse:co${i}:role`, timestamp: "2026-10-14T00:00:00Z" }));
  const rep3 = Portal.resolveUnknownOutcomes({ records: many, now: NOW, readers: () => ({ state: "not_submitted" }) });
  assert.equal(rep3.attempted, 20, "default bound per pass");
  assert.equal(many.filter((r) => r.status === "not_submitted").length, 20);
});

test("MI-115: no reader for a board records method none_available (and the missing inbox seam is noted, never faked); the resolver never submits", () => {
  const rec = arc();
  let submitCalls = 0;
  const report = Portal.resolveUnknownOutcomes({
    records: [rec], now: NOW,
    readers: () => null,
    boards: { submit: () => { submitCalls += 1; } }, // a trap: not part of the input contract, must stay untouched
  });
  assert.equal(rec.status, "unknown_outcome");
  assert.equal(rec.resolutionAttempts[0].method, "none_available");
  assert.match(rec.resolutionAttempts[0].notes || "", /inbox_unavailable/, "the un-checked inbox is on the record (MI-074)");
  assert.equal(submitCalls, 0, "the resolver has no submit path");
  assert.equal(report.resolved.length, 0);
});

test("MI-115: a throwing reader is an unverifiable read, not a crash and not a resolution", () => {
  const rec = arc();
  const report = Portal.resolveUnknownOutcomes({
    records: [rec], now: NOW,
    readers: () => { throw new Error("board read failed"); },
  });
  assert.equal(rec.status, "unknown_outcome");
  assert.equal(rec.resolutionAttempts[0].result, "still_unknown");
  assert.equal(report.attempted, 1);
});
