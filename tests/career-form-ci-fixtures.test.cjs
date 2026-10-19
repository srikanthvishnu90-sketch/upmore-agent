// WO-009b-2: the real application pages captured in CI (tests/fixtures/forms-ci) are what the fill-readback harness
// (009b-3) and the coverage benchmark (009b-6) run against. Real pages only: each has provenance, an application is a
// resume input plus required fields, the stored HTML is the one the manifest hashes and still holds that resume input,
// and what blocked the rest is recorded, not hidden. The read-only rule of the renderer is pinned here too.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { readOnly, publicURL } = require("../scripts/career/render-form.cjs");
const { strip } = require("../scripts/career/build-form-fixtures.cjs");

const root = path.join(__dirname, "fixtures/forms-ci");
const manifest = JSON.parse(fs.readFileSync(path.join(root, "manifest.json"), "utf8"));
const apps = manifest.forms.filter((f) => f.status === "application");

test("WO-009b-2 at least 5 real applications each on Greenhouse, Lever and Ashby, with provenance", () => {
  for (const family of ["greenhouse", "lever", "ashby"]) assert.ok(apps.filter((f) => f.family === family).length >= 5, family);
  const urls = new Set();
  for (const f of manifest.forms) {
    assert.ok(publicURL(f.source_url) && !urls.has(f.source_url), f.id);
    urls.add(f.source_url);
    assert.ok(Number.isFinite(Date.parse(f.rendered_at)), f.id);
  }
});

test("WO-009b-2 every stored application is the hashed page and still holds its resume input and required fields", () => {
  for (const f of apps) {
    const html = fs.readFileSync(path.join(root, f.html), "utf8");
    assert.equal(crypto.createHash("sha256").update(html).digest("hex"), f.html_sha256, f.id);
    assert.ok(f.resume_inputs > 0 && f.required.length > 0, f.id);
    assert.match(html, /<input[^>]*type="file"/i, f.id);
    assert.ok(!/<script\b[^>]*>[^<]+<\/script>/i.test(html), `${f.id}: script bodies stripped`);
  }
});

test("WO-009b-2 what blocked the rest is recorded: SmartRecruiters application pages answer 403 behind DataDome", () => {
  const sr = manifest.forms.filter((f) => f.family === "smartrecruiters");
  assert.ok(sr.length > 0 && sr.every((f) => f.status === "blocked_403" && f.bot_check.includes("datadome")), JSON.stringify(sr.map((f) => f.status)));
  for (const f of apps) assert.ok(f.bot_check.length > 0, `${f.id}: every live application form loaded a bot check on submit`);
});

test("WO-009b-2 the renderer is read-only: GETs and GraphQL queries pass; mutations, form posts and anything unparseable do not", () => {
  const r = (m, u, b) => ({ method: () => m, url: () => u, postData: () => b });
  const G = "https://jobs.ashbyhq.com/api/non-user-graphql?op=x";
  assert.equal(readOnly(r("GET", "https://jobs.lever.co/a", null)), true);
  assert.equal(readOnly(r("POST", G, JSON.stringify({ query: "query A($id:String!){x}" }))), true);
  assert.equal(readOnly(r("POST", G, JSON.stringify({ query: "mutation Submit{x}" }))), false);
  assert.equal(readOnly(r("POST", G, JSON.stringify([{ query: "query A{x}" }, { query: "mutation B{y}" }]))), false);
  assert.equal(readOnly(r("POST", "https://jobs.lever.co/a/b/apply", "name=x")), false);
  assert.equal(readOnly(r("POST", G, "not json")), false);
  assert.equal(readOnly(r("PUT", G, "{}")), false);
  assert.throws(() => publicURL("https://jobs.lever.co.evil.test/a"));
  assert.equal(strip('<script src="a.js"></script><script>var a=1</script><style>p{}</style><iframe id="{&quot;a&quot;:1}"><p>w</p></iframe><p>x</p>'),
    '<script src="a.js"></script><script></script><style></style><p>x</p>');
});
