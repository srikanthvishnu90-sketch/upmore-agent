"use strict";
// BUG-212 / FR-370 (MI-031, Crew A, 2026-10-15): cross-board dedupe
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

test("BUG-212: LA-0016 replay — a posting 30 days newer than its twin is a distinct opening and diffNew fires", () => {
  const oldCopy = J.normalizeGreenhouse(GH_OLD, "carepoint")[0];
  const newCopy = J.normalizeLever(LEVER_NEW, "carepoint-health", "CarePoint Health")[0];
  const dd = J.dedupe([oldCopy, newCopy]);
  assert.equal(dd.length, 2, `expected 2 distinct openings, got ${dd.length}: ${dd.map((p) => p.job_id).join(", ")}`);
  const fresh = J.diffNew(dd, { job_ids: [oldCopy.job_id] });
  assert.deepEqual(fresh.map((p) => p.job_id), [newCopy.job_id], "the new Lever posting must surface as new");
});

test("BUG-212: a genuine cross-post (copies 1 day apart) still collapses with both URLs kept", () => {
  const gh = J.normalizeGreenhouse(GH_FRESH, "carepoint");
  const lv = J.normalizeLever([{ ...LEVER_NEW[0], createdAt: Date.parse("2026-10-09T00:00:00Z") }], "carepoint-health", "CarePoint Health");
  const dd = J.dedupe([...gh, ...lv]);
  assert.equal(dd.length, 1);
  assert.equal(dd[0].source_urls.length, 2);
  assert.deepEqual(dd[0].sources.sort(), ["greenhouse", "lever"]);
});

test("BUG-212: when copies merge, the cleaner copy supplies the identity — in either arrival order", () => {
  const degraded = { ...J.normalizeGreenhouse(GH_FRESH, "carepoint")[0], jd_text: "Nurses needed.", department: "", url: "https://boards.example/degraded", job_id: "greenhouse:carepoint-health:degraded" };
  const clean = { ...J.normalizeLever([{ ...LEVER_NEW[0], createdAt: Date.parse("2026-10-11T00:00:00Z") }], "carepoint-health", "CarePoint Health")[0] };
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
