// The form-source picker (WO-009b-6): without a seed it is the biggest boards' first postings, one per employer, so a
// re-run measures the same employers; with a seed it is an independent sample that repeats exactly for the same seed,
// changes with the seed, takes a posting other than the first, and shares no employer with an excluded capture.
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { pick } = require("../scripts/career/pick-form-sources.cjs");

const boards = Array.from({ length: 30 }, (_, i) => ({ provider: "greenhouse", status: "live", board_token: `co${i}`, company: `Co ${i % 25}`, postings_seen: 100 - i }));
const directory = { boards: [...boards, { provider: "greenhouse", status: "dead", board_token: "gone", company: "Gone", postings_seen: 999 }] };
const fetchFn = async (url) => {
  const t = /boards\/([^/]+)\/jobs/.exec(url)[1];
  return { status: 200, json: async () => ({ jobs: Array.from({ length: 20 }, (_, k) => ({ id: `${t}${k}` })) }) };
};
const run = (opts) => pick(directory, { greenhouse: 8 }, fetchFn, 0, opts);
const companies = (xs) => xs.map((x) => x.company);
// The posting's index on its board: ids are greenhouse-<token>-<token><k>.
const index = (s) => { const [, token, last] = s.id.split("-"); return Number(last.slice(token.length)); };

test("unseeded: the biggest live boards, their first posting, one per employer", async () => {
  const a = await run();
  assert.deepEqual(companies(a), ["Co 0", "Co 1", "Co 2", "Co 3", "Co 4", "Co 5", "Co 6", "Co 7"]);
  assert.ok(a.every((s) => index(s) === 0), "first posting of each board");
  assert.ok(!a.some((s) => s.company === "Gone"));
});

test("seeded: the same seed gives the same sample, another seed a different one", async () => {
  const a = await run({ seed: 2 }), b = await run({ seed: 2 }), c = await run({ seed: 3 });
  assert.deepEqual(a, b);
  assert.notDeepEqual(companies(a), companies(c));
  assert.equal(new Set(companies(a)).size, 8, "one per employer");
  assert.notDeepEqual(companies(a), companies(await run()), "not the biggest boards");
  assert.ok(a.filter((s) => index(s) > 0).length >= 4, "a random posting, not the first");
});

test("seeded with exclude: no employer of the earlier capture is picked", async () => {
  const first = await run();
  const b = await run({ seed: 2, exclude: companies(first) });
  assert.equal(b.length, 8);
  for (const c of companies(b)) assert.ok(!companies(first).includes(c), c);
});

test("a board with no postings is skipped, never guessed", async () => {
  const empty = async () => ({ status: 200, json: async () => ({ jobs: [] }) });
  assert.deepEqual(await pick(directory, { greenhouse: 3 }, empty, 0, { seed: 1 }), []);
});
