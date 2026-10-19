// MI-034 BOARD DIRECTORY INTEGRITY (tier 2) — guards the product-data
// board directory (packages/career-data/board-directory.json).
// Doctrine under guard (BUG-096, unchanged): an entry is "live" ONLY if a
// real fetch in a discovery run returned that board's postings JSON;
// transport errors are never verdicts; unsupported providers are recorded
// as discovered_unsupported and never enter the live set; a board whose
// postings disprove the slug-guess company hint is labeled by its TOKEN,
// never upgraded to the unverified employer name (MI-034 tranche-2
// spot-checks: greenhouse "current"/"galaxy"/"wise" and ashby
// "circle"/"unit" postings are not the financial firms guessed).
// Check: node --test tests/career-board-directory.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = JSON.parse(fs.readFileSync(path.join(root, "packages/career-data/board-directory.json"), "utf8"));
const W = require(path.join(root, "packages/domain/151-career-alert-watch.js"));

const SUPPORTED = new Set(["greenhouse", "lever", "ashby", "smartrecruiters"]);
const boards = dir.boards || [];
const live = boards.filter((b) => b.status === "live");

test("directory entries are unique per provider:token", () => {
  const keys = boards.map((b) => `${b.provider}:${String(b.board_token).toLowerCase()}`);
  assert.equal(new Set(keys).size, keys.length, "duplicate provider:token entries");
});

test("every live entry is a supported provider with a fetch-shaped record", () => {
  assert.ok(live.length > 0);
  for (const b of live) {
    assert.ok(SUPPORTED.has(b.provider), `live entry on unsupported provider: ${b.provider}`);
    assert.ok(typeof b.board_token === "string" && b.board_token.length > 0, "empty token");
    assert.ok(Number.isFinite(b.postings_seen) && b.postings_seen >= 0, `bad postings_seen for ${b.provider}:${b.board_token}`);
    assert.match(String(b.last_verified), /^\d{4}-\d{2}-\d{2}$/, `bad last_verified for ${b.provider}:${b.board_token}`);
  }
  for (const b of boards.filter((x) => x.status !== "live")) {
    assert.equal(b.status, "discovered_unsupported", `unexpected status ${b.status}`);
    assert.ok(!SUPPORTED.has(b.provider), "supported provider must not sit in discovered_unsupported");
  }
});

test("MI-034 tranche 2 grew the watchable universe past the 107-board v2 line", () => {
  assert.ok(live.length >= 176, `live boards ${live.length} < 176 (107 v2 + 69 banks tranche minimum)`);
});

test("MI-034 egress 2 (Corpus 3A resume) grew the universe past 262 and token-labels its unattributable boards", () => {
  assert.ok(live.length >= 305, `live boards ${live.length} < 305 (262 tranche-2 + 47 egress-2, less the 4 WO-006 dropped)`);
  const key = (p, t) => live.some((b) => b.provider === p && String(b.board_token).toLowerCase() === t);
  for (const [p, t] of [
    ["smartrecruiters", "expeditors"], ["smartrecruiters", "harvarduniversity"],
    ["ashby", "preply"], ["greenhouse", "blankstreet"], ["lever", "elfbeauty"],
    ["greenhouse", "geotab"], ["ashby", "instructure"],
  ]) assert.ok(key(p, t), `missing egress-2 board ${p}:${t}`);
  for (const [p, t] of [["ashby", "ondeck"], ["ashby", "project44"], ["greenhouse", "coursehero"], ["greenhouse", "greenpeace"], ["greenhouse", "mit"], ["lever", "blueorigin"], ["lever", "mit"]]) {
    const b = live.find((x) => x.provider === p && String(x.board_token).toLowerCase() === t);
    assert.ok(b, `missing ${p}:${t}`);
    assert.equal(b.company, b.board_token, `${p}:${t} company must stay the token (0 postings, unattributable), got ${b.company}`);
  }
});

test("MI-034 banks tranche boards are present and live", () => {
  const key = (p, t) => live.some((b) => b.provider === p && String(b.board_token).toLowerCase() === t);
  for (const [p, t] of [
    ["greenhouse", "williamblair"], ["greenhouse", "lincolninternational"],
    ["greenhouse", "adyen"], ["greenhouse", "toast"], ["greenhouse", "point72"],
    ["ashby", "plaid"], ["ashby", "airwallex"], ["lever", "dlocal"],
    ["smartrecruiters", "wise"], ["smartrecruiters", "northwesternmutual"],
  ]) assert.ok(key(p, t), `missing banks-tranche board ${p}:${t}`);
});

test("hint-disproven boards stay token-labeled (no unverified employer upgrade)", () => {
  for (const [p, t] of [["greenhouse", "current"], ["greenhouse", "galaxy"], ["greenhouse", "wise"], ["greenhouse", "apollo"], ["ashby", "circle"], ["ashby", "unit"]]) {
    const b = live.find((x) => x.provider === p && String(x.board_token).toLowerCase() === t);
    assert.ok(b, `missing ${p}:${t}`);
    assert.equal(b.company, b.board_token, `${p}:${t} company must stay the token, got ${b.company}`);
  }
});

test("feedsFromDirectory serves exactly the live set from the real directory", () => {
  const feeds = W.feedsFromDirectory(boards);
  assert.equal(feeds.length, live.length, "151 must build one feed per live board and none for unsupported");
});

test("WO-006: no ATS vendor or demo board, and one board per employer where a duplicate was found", () => {
  for (const [p, t] of [["lever", "leverdemo"], ["greenhouse", "greenhouse"], ["ashby", "ashby"], ["smartrecruiters", "palantir"]])
    assert.ok(!boards.some((b) => b.provider === p && String(b.board_token).toLowerCase() === t), `${p}:${t} must not be in the directory`);
  const palantir = live.filter((b) => /^palantir$/i.test(b.company));
  assert.deepEqual(palantir.map((b) => `${b.provider}:${b.board_token}`), ["lever:palantir"]);
});
