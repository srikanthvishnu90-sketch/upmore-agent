"use strict";
// BUG-228 / FR-386 (MI-031, Crew A, 2026-10-15): cross-board dedupe
// must not eat the new copy or the clean copy. (1) Copies posted more
// than 14 days apart are distinct openings and never merge — LA-0016's
// new Lever posting died exactly this way (merged into the old record,
// its job_id already in the snapshot, diffNew silent). (2) When copies
// do merge, the cleaner copy supplies the identity — order-independent.
const test = require("node:test");
const assert = require("node:assert/strict");
const J = require("../packages/domain/121-career-jobs.js");

const GH_OLD = { name: "CarePoint Health", jobs: [
  { id: 9001, title: "Registered Nurse", location: { name: "Chicago, IL" }, absolute_url: "https://boards.greenhouse.io/carepoint/jobs/9001", updated_at: "2026-09-12T00:00:00Z", requisition_id: "GH-9", departments: [{ name: "Nursing" }], content: "RN role, Chicago. BSN preferred, rotating shifts, benefits listed in full on the board page for this opening." },
]};
const LEVER_NEW = [
  { id: "S16B-1057", text: "Registered Nurse", categories: { location: "Chicago, IL", team: "Nursing" }, hostedUrl: "https://jobs.lever.co/carepoint-health/S16B-1057", createdAt: Date.parse("2026-10-12T00:00:00Z"), descriptionPlain: "RN role, Chicago. New opening on the med-surg unit; BSN preferred, rotating shifts." },
];
const GH_FRESH = { name: "CarePoint Health", jobs: [
  { id: 9002, title: "Registered Nurse", location: { name: "Chicago, IL" }, absolute_url: "https://boards.greenhouse.io/carepoint/jobs/9002", updated_at: "2026-10-10T00:00:00Z", requisition_id: "GH-10", departments: [{ name: "Nursing" }], content: "RN role, Chicago. BSN preferred, rotating shifts, benefits listed in full on the board page for this opening." },
]};

test("BUG-228: LA-0016 replay — a posting 30 days newer than its twin is a distinct opening and diffNew fires", () => {
  const oldCopy = J.normalizeGreenhouse(GH_OLD, "carepoint")[0];
  const newCopy = J.normalizeLever(LEVER_NEW, "carepoint-health", "CarePoint Health")[0];
  const dd = J.dedupe([oldCopy, newCopy]);
  assert.equal(dd.length, 2, `expected 2 distinct openings, got ${dd.length}: ${dd.map((p) => p.job_id).join(", ")}`);
  const fresh = J.diffNew(dd, { job_ids: [oldCopy.job_id] });
  assert.deepEqual(fresh.map((p) => p.job_id), [newCopy.job_id], "the new Lever posting must surface as new");
});

test("BUG-228: a genuine cross-post (copies 1 day apart, SAME JD text) still collapses with both URLs kept", () => {
  const gh = J.normalizeGreenhouse(GH_FRESH, "carepoint");
  const lv = J.normalizeLever([{ ...LEVER_NEW[0], createdAt: Date.parse("2026-10-09T00:00:00Z"), descriptionPlain: "RN role, Chicago. BSN preferred, rotating shifts, benefits listed in full on the board page for this opening." }], "carepoint-health", "CarePoint Health");
  const dd = J.dedupe([...gh, ...lv]);
  assert.equal(dd.length, 1);
  assert.equal(dd[0].source_urls.length, 2);
  assert.deepEqual(dd[0].sources.sort(), ["greenhouse", "lever"]);
});

test("BUG-228/MI-051: LA-0016's staged pair — same-day twins whose JD texts differ (one carries a license-knockout sentence) never merge", () => {
  // The seed scenario's exact shapes: both posted 2026-10-13, same
  // company/title/city; the Greenhouse text carries a requirement
  // sentence the Lever text lacks. Merging them poisoned the survivor
  // (the gate read the knockout text) and the Lever reminder died.
  const gh = J.normalizeGreenhouse({ name: "CarePoint Health", jobs: [
    { id: 1056, title: "Registered Nurse", location: { name: "Chicago, IL" }, absolute_url: "https://boards.greenhouse.io/carepoint/jobs/1056", updated_at: "2026-10-13T15:00:00Z", requisition_id: "S16A-1056", departments: [{ name: "Nursing" }], content: "Provide direct patient care on a medical-surgical unit. Collaborate with physicians and care teams. Must hold a current RN license." },
  ] }, "carepoint-health");
  const lv = J.normalizeLever([
    { id: "S16B-1057", text: "Registered Nurse", categories: { location: "Chicago, IL", team: "Nursing" }, hostedUrl: "https://jobs.lever.co/carepoint-health/S16B-1057", createdAt: Date.parse("2026-10-13T15:00:00Z"), descriptionPlain: "Provide direct patient care on a medical-surgical unit. Collaborate with physicians and care teams on care plans." },
  ], "carepoint-health", "CarePoint Health");
  const dd = J.dedupe([...gh, ...lv]);
  assert.equal(dd.length, 2, `eligibility-differing twins must both survive, got ${dd.length}`);
  assert.ok(dd.some((p) => p.job_id === lv[0].job_id), "the Lever copy keeps its own record (its reminder is LA-0016's ground truth)");
});

test("BUG-228/MI-051: the same req id on two boards is one posting even when the boards render its text differently", () => {
  const a = { ...J.normalizeGreenhouse(GH_FRESH, "carepoint")[0], req_id: "OPS-4471", jd_text: "Requirements: BSN; telemetry experience." };
  const b = { ...J.normalizeLever(LEVER_NEW, "carepoint-health", "CarePoint Health")[0], req_id: "OPS-4471", jd_text: "You bring: BSN and telemetry skills." };
  const dd = J.dedupe([a, b]);
  assert.equal(dd.length, 1, "a shared req id is the employer's identity for the opening");
  assert.deepEqual(dd[0].sources.sort(), ["greenhouse", "lever"]);
});

test("BUG-228: when copies merge, the cleaner copy supplies the identity — in either arrival order", () => {
  // The degraded copy is the same document TRUNCATED by its board
  // (a prefix of the clean text) with the department dropped — the
  // containment case of the same-text identity rule (MI-051).
  const clean0 = J.normalizeLever([{ ...LEVER_NEW[0], createdAt: Date.parse("2026-10-11T00:00:00Z") }], "carepoint-health", "CarePoint Health")[0];
  const degraded = { ...J.normalizeGreenhouse(GH_FRESH, "carepoint")[0], jd_text: clean0.jd_text.slice(0, 40), department: "", url: "https://boards.example/degraded", job_id: "greenhouse:carepoint-health:degraded" };
  const clean = { ...clean0 };
  for (const pair of [[degraded, clean], [clean, degraded]]) {
    const dd = J.dedupe(pair.map((p) => ({ ...p })));
    assert.equal(dd.length, 1, "the pair is one opening (posted 1 day apart)");
    assert.equal(dd[0].url, clean.url, `survivor must be the clean copy, got ${dd[0].url}`);
    assert.equal(dd[0].job_id, clean.job_id);
    assert.ok(dd[0].jd_text.length >= clean.jd_text.length, "the longest JD is kept");
    assert.deepEqual(dd[0].sources.sort(), ["greenhouse", "lever"]);
    assert.equal(dd[0].posted_at, "2026-10-10T00:00:00.000Z", "the earliest posted_at is kept");
  }
});
