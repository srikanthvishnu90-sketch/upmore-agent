// The owner's Full Agent Capability List against the code (docs/capability-list): every bullet mapped in order, every
// capability id real, the report current, and nothing called PROVEN without a VERIFIED registry row (none today).
const test = require("node:test"), assert = require("node:assert/strict"), path = require("node:path"), fs = require("node:fs"), { execFileSync } = require("node:child_process");
const root = path.join(__dirname, "..");
test("capability list: 149 items mapped in order to real capabilities, report current", () => {
  assert.match(execFileSync(process.execPath, [path.join(root, "scripts/capability-list.cjs"), "--check"], { encoding: "utf8" }), /capability list verified: 149 items/);
});
test("capability list: status is derived, weakest claim wins, and PROVEN needs every capability VERIFIED", () => {
  const md = fs.readFileSync(path.join(root, "docs/capability-list/README.md"), "utf8");
  assert.match(md, /PROVEN \(live, with the provider's record\): 0 of 149/);
  assert.match(md, /ends inside section 7/, "the report says the pasted list is incomplete");
  const { REACHABLE } = require("../docs/capability-list/map.cjs"), reg = require("../packages/capabilities/registry.json");
  for (const id of Object.keys(REACHABLE)) assert.notEqual(reg.capabilities.find(c => c.id === id).status, "CLAIMED", `${id} is reachable but only claimed`);
});

test('Alinea parity: the owner\'s ten features, status derived from the registry and the reachable list', () => {
  const { parity } = require('../scripts/capability-list.cjs');
  const p = parity();
  assert.equal(p.length, 10);
  for (const f of p) assert.ok(['not started', 'built', 'wired'].includes(f.status), f.feature);
  // Anything that places orders is approval-gated: recurring, fractional, copy.
  assert.deepEqual(p.filter(f => f.gated).map(f => f.feature.split(' ')[0]), ['Automated', 'Fractional', 'Copy']);
  // Claimed-only capabilities never read as built.
  assert.equal(p.find(f => f.feature.startsWith('Automated')).status, 'not started');
});
