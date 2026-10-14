"use strict";
// BUG-LAW GUARD (pool-data gap, IB-AP-9): the served corpus once
// carried ZERO product-manager and near-zero data/ML postings, so
// family asks (SC-065 / SC-110) could only be answered with
// cross-domain padding or an honest empty. The pinned corpus is a
// ground-truth exam fixture and must not be edited in place; the
// extension corpus (scored-corpus-ext.json) is merged ONLY for the
// opt-in scenarios in pilot-lib. This test fails first if the
// opt-in merged pool ever drops below family coverage again.
const test = require("node:test");
const assert = require("node:assert");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");
const corpus = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/gauntlet/jobs/scored-corpus.json"), "utf8"));
const ext = JSON.parse(fs.readFileSync(path.join(ROOT, "packages/career-data/fixtures/gauntlet/jobs/scored-corpus-ext.json"), "utf8"));
const Jobs = require(path.join(ROOT, "packages/domain/121-career-jobs.js"));

test("pool coverage: opt-in merged pool carries >=2 PM and >=2 Data/ML postings", () => {
  const merged = [...(corpus.postings || []), ...(ext.postings || [])];
  const pm = merged.filter((p) => Jobs.roleFamily(p.title) === "PM");
  const data = merged.filter((p) => Jobs.roleFamily(p.title) === "Data/ML");
  assert.ok(pm.length >= 2, `merged pool PM postings: ${pm.length} (need >= 2)`);
  assert.ok(data.length >= 2, `merged pool Data/ML postings: ${data.length} (need >= 2)`);
});

test("pool coverage: the pinned corpus itself is untouched by the extension (PM stays 0 there)", () => {
  const pm = (corpus.postings || []).filter((p) => Jobs.roleFamily(p.title) === "PM");
  assert.equal(pm.length, 0, "the pinned exam corpus must not gain PM postings in place");
});

test("pool coverage: ext postings are fictional-labeled in the corpus idiom", () => {
  for (const p of ext.postings || []) {
    assert.match(String(p.company || ""), /\(fictional\)/, `${p.id} company must carry the fictional label`);
    assert.ok(p.ground_truth, `${p.id} must carry ground_truth labels`);
  }
});
