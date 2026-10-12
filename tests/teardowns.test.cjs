// The owner's feature teardowns (docs/teardowns): every feature row parsed once, counts equal to each doc's own "At a
// glance" numbers, ids stable, and the standing rules gate what they must (scripts/build-teardowns.cjs).
const test = require("node:test");
const assert = require("node:assert");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const { build } = require("../scripts/build-teardowns.cjs");

const ROOT = path.join(__dirname, "..");
const { rows, counts, problems } = build();
const byId = id => rows.find(r => r.id === id);
const features = rows.filter(r => !r.not_a_feature);

test("every app's parsed rows equal the count its teardown states", () => {
  assert.deepStrictEqual(problems, []);
  assert.deepStrictEqual(Object.fromEntries(Object.entries(counts).map(([a, c]) => [a, c.features + c.not_a_feature])),
    { dub: 144, Alinea: 85, Autopilot: 67, Origin: 209, Albert: 148, "Rocket Money": 132, Monarch: 330, "Copilot Money": 311, YNAB: 242, Cleo: 156 });
  assert.strictEqual(features.length, 1818);
  assert.strictEqual(rows.length - features.length, 6); // Alinea's checked-and-not-found rows, kept but not features
});

test("ids are unique, stable and carry at least one permission tag", () => {
  assert.strictEqual(new Set(rows.map(r => r.id)).size, rows.length);
  assert.strictEqual(byId("T1-DUB-001").feature, "Account sign-up");
  assert.strictEqual(byId("T2-ROCKET-029").feature, "Bill Negotiation (Lower Bills)");
  for (const r of rows) assert.ok(r.tags.length, `${r.id} has no tag`);
});

test("[Flag] rows are hard-gated, every one", () => {
  for (const r of features.filter(r => r.tags.includes("Flag"))) assert.ok(r.hard_gated && r.gates.includes("flag"), r.id);
});

test("decisions 2 and 3 stay off: event contracts and crypto connections are hard-gated", () => {
  assert.ok(byId("T1-ALINEA-043").gates.includes("decision_2")); // Event contracts
  for (const id of ["T1-ALINEA-042", "T2-MONARCH-020", "T2-COPILOT-016", "T2-COPILOT-017", "T2-COPILOT-018"]) {
    assert.ok(byId(id).gates.includes("decision_3") && byId(id).hard_gated, id);
  }
  // Crypto named among other holdings: built without the crypto part, not dropped. "No crypto" is no gate.
  assert.deepStrictEqual(byId("T1-ORIGIN-083").gates, ["crypto_part_off"]);
  assert.ok(!byId("T1-DUB-064").gates.some(g => /crypto|decision/.test(g)));
});

test("identity digits, phone calls and lending are hard-gated; tracking a loan is not lending", () => {
  assert.ok(byId("T1-DUB-003").gates.includes("identity_digits")); // collects an SSN
  assert.ok(byId("T2-ROCKET-029").gates.includes("phone_calls")); // negotiators call the provider
  assert.ok(byId("T1-ALBERT-054").gates.includes("lending")); // Instant Advance
  assert.ok(!byId("T2-YNAB-066").gates.includes("lending")); // Loan accounts: tracking
  assert.ok(!byId("T2-ROCKET-017").gates.includes("lending")); // Payday View: a bills view
});

test("hand overrides name their reason and still match their row", () => {
  assert.ok(!byId("T1-DUB-005").gates.includes("identity_digits") && byId("T1-DUB-005").override);
  assert.ok(!byId("T2-ROCKET-125").gates.includes("phone_calls") && byId("T2-ROCKET-125").override);
});

test("automations that move money carry the per-run yes rule", () => {
  assert.ok(byId("T1-DUB-047").gates.includes("per_run_yes")); // Auto-Copy
  assert.ok(!byId("T2-COPILOT-022").gates.includes("per_run_yes")); // marks Venmo transfers: bookkeeping
});

// The capability-list map (docs/teardowns/map.cjs): every section once, items in 1..149, the status derived.
const { applyMap, STATUS_ORDER } = require("../scripts/build-teardowns.cjs");
const MAP = require("../docs/teardowns/map.cjs");
const { build: buildList } = require("../scripts/capability-list.cjs");
const listItems = buildList().rows;
const fresh = () => build().rows; // a fresh copy of the rows for each broken map below

test("every (app, section) with feature rows is mapped exactly once, with valid items", () => {
  const { mapProblems } = build();
  assert.deepStrictEqual(mapProblems, []);
  const pairs = [...new Set(features.map(r => `${r.app}/${r.section}`))];
  assert.strictEqual(pairs.length, 154);
  assert.deepStrictEqual(Object.keys(MAP.SECTIONS).sort(), pairs.sort());
  assert.strictEqual(listItems.length, 149);
  for (const [k, [items, cov, note]] of Object.entries(MAP.SECTIONS)) {
    for (const n of items) assert.ok(Number.isInteger(n) && n >= 1 && n <= 149, `${k}: ${n}`);
    assert.ok(["full", "part", "none"].includes(cov), k);
    assert.strictEqual(items.length === 0, cov === "none", k);
    if (cov !== "full") assert.ok(note.trim(), `${k} needs a note`);
  }
  for (const r of features) {
    assert.ok(Array.isArray(r.capability_items), r.id);
    assert.ok([...STATUS_ORDER, "NO_ITEM"].includes(r.upmore_today), r.id);
    // A row in a partly covered section never claims its section's status in the counts.
    assert.strictEqual(r.upmore_today_row, r.capability_coverage === "part" ? "PART" : r.upmore_today, r.id);
  }
});

test("upmore_today is the best status among the row's items, NO_ITEM when none", () => {
  const st = Object.fromEntries(listItems.map(i => [i.n, i.status]));
  for (const r of features) {
    const want = r.capability_items.length
      ? STATUS_ORDER[Math.min(...r.capability_items.map(n => STATUS_ORDER.indexOf(st[n])))] : "NO_ITEM";
    assert.strictEqual(r.upmore_today, want, r.id);
  }
});

test("hand-picked rows sit where they should on the capability list", () => {
  const item = n => listItems.find(i => i.n === n);
  assert.match(item(106).text, /^Cancel any subscription by one sentence/);
  // Rocket Money's cancellation concierge is item 106; the cancel flow is reachable in the chat today.
  for (const r of features.filter(r => r.app === "Rocket Money" && r.section === "Cancellation concierge")) assert.ok(r.capability_items.includes(106), r.id);
  assert.strictEqual(byId("T2-ROCKET-021").feature, "Subscription Cancellation Assistant");
  assert.strictEqual(byId("T2-ROCKET-021").upmore_today, item(106).status);
  // Cleo's cash advance is lending: hard-gated, and no item on Upmore's list.
  for (const r of features.filter(r => r.app === "Cleo" && r.section === "Cash advance")) {
    assert.deepStrictEqual(r.capability_items, [], r.id);
    assert.strictEqual(r.upmore_today, "NO_ITEM", r.id);
  }
  assert.ok(byId("T2-CLEO-046").hard_gated && byId("T2-CLEO-046").gates.includes("lending"));
  // Bill negotiation is item 122, and its phone-call row stays hard-gated whatever Upmore has.
  assert.deepStrictEqual(byId("T2-ROCKET-029").capability_items, [122]);
  assert.ok(byId("T2-ROCKET-029").hard_gated && byId("T2-ROCKET-029").gates.includes("phone_calls"));
  // A row override wins over its section: dub's recurring investments are a recurring buy (53).
  assert.deepStrictEqual(byId("T1-DUB-055").capability_items, [53]);
  assert.ok(byId("T1-DUB-055").capability_note);
  // Event contracts have no item and stay off (decision 2); Alinea's crypto row is item 62 and stays off (decision 3).
  assert.deepStrictEqual(byId("T1-ALINEA-043").capability_items, []);
  assert.deepStrictEqual(byId("T1-ALINEA-042").capability_items, [62]);
  assert.ok(byId("T1-ALINEA-042").hard_gated);
  // Budgeting is not on Upmore's list.
  assert.strictEqual(byId("T2-YNAB-001").upmore_today, "NO_ITEM");
});

test("the map fails on a vanished section, a missing section, an item outside 1..149 and a renumbered override", () => {
  const without = Object.assign({}, MAP.SECTIONS); delete without["Cleo/Cash advance"];
  assert.ok(applyMap(fresh(), { SECTIONS: without, ROWS: MAP.ROWS }, listItems).some(p => /misses section "Cleo\/Cash advance"/.test(p)));
  const extra = Object.assign({}, MAP.SECTIONS, { "Cleo/Crypto wallet": [[], "none", "gone"] });
  assert.ok(applyMap(fresh(), { SECTIONS: extra, ROWS: MAP.ROWS }, listItems).some(p => /names section "Cleo\/Crypto wallet"/.test(p)));
  const bad = Object.assign({}, MAP.SECTIONS, { "Cleo/Savings": [[150], "part", "out of range"] });
  assert.ok(applyMap(fresh(), { SECTIONS: bad, ROWS: MAP.ROWS }, listItems).some(p => /item 150 is outside 1..149/.test(p)));
  const zero = Object.assign({}, MAP.SECTIONS, { "Cleo/Savings": [[0], "part", "out of range"] });
  assert.ok(applyMap(fresh(), { SECTIONS: zero, ROWS: MAP.ROWS }, listItems).some(p => /item 0 is outside/.test(p)));
  const rows = Object.assign({}, MAP.ROWS, { "T1-DUB-055": Object.assign({}, MAP.ROWS["T1-DUB-055"], { feature: "Something else" }) });
  assert.ok(applyMap(fresh(), { SECTIONS: MAP.SECTIONS, ROWS: rows }, listItems).some(p => /T1-DUB-055 was written for/.test(p)));
  const noneWithItems = Object.assign({}, MAP.SECTIONS, { "Cleo/Savings": [[14], "none", "x"] });
  assert.ok(applyMap(fresh(), { SECTIONS: noneWithItems, ROWS: MAP.ROWS }, listItems).some(p => /coverage "none" goes with no items/.test(p)));
});

test("a row is counted PART only on its own row entry, which names the missing half", () => {
  const part = features.filter(r => r.upmore_today_row === "PART");
  assert.ok(part.length > 0 && part.length < 60, `${part.length} PART rows`);
  for (const r of part) {
    const o = MAP.ROWS[r.id];
    assert.ok(o, `${r.id} is counted PART without a row entry`);
    assert.strictEqual(o.coverage, "part", r.id);
    assert.ok(o.items.length && o.note.trim(), r.id);
  }
  // Every row of a section mapped "part" is placed on its own.
  for (const r of features) if (MAP.SECTIONS[`${r.app}/${r.section}`][1] === "part") assert.ok(MAP.ROWS[r.id], r.id);
});

test("the map fails on a row that would inherit PART from its section", () => {
  // A whole section turned "part" with no row entries: each of its rows is named.
  const sections = Object.assign({}, MAP.SECTIONS, { "Cleo/Savings": [[14], "part", "a test section"] });
  const savings = features.filter(r => r.app === "Cleo" && r.section === "Savings").map(r => r.id);
  const p1 = applyMap(fresh(), { SECTIONS: sections, ROWS: MAP.ROWS }, listItems);
  for (const id of savings) assert.ok(p1.some(p => p.includes(id) && /counted PART from its section "Cleo\/Savings"/.test(p)), id);
  // One row entry dropped from a section placed row by row.
  const rows = Object.assign({}, MAP.ROWS); delete rows["T1-DUB-021"];
  const p2 = applyMap(fresh(), { SECTIONS: MAP.SECTIONS, ROWS: rows }, listItems);
  assert.ok(p2.some(p => /T1-DUB-021 "Discover tab" is counted PART/.test(p)), p2.join("\n"));
  assert.deepStrictEqual(applyMap(fresh(), MAP, listItems), []);
});

test("the same kind of feature sits in the same place in every app", () => {
  const same = (ids, items, coverage) => {
    for (const id of ids) {
      assert.deepStrictEqual(byId(id).capability_items, items, id);
      assert.strictEqual(byId(id).capability_coverage, coverage, id);
    }
  };
  same(["T1-ORIGIN-031", "T2-ROCKET-046", "T2-MONARCH-036", "T2-COPILOT-060", "T2-YNAB-108"], [7], "full"); // search and filters
  same(["T1-ORIGIN-023", "T2-ROCKET-054", "T2-MONARCH-051", "T2-COPILOT-096", "T2-YNAB-080"], [11], "full"); // splits
  same(["T1-ORIGIN-020", "T2-ROCKET-055", "T2-MONARCH-053", "T2-COPILOT-078"], [8], "full"); // rules that remember a fix
  same(["T1-ORIGIN-009", "T2-MONARCH-016", "T2-COPILOT-052"], [15], "part"); // automatic home value feeds
  same(["T1-ORIGIN-019", "T2-ROCKET-052", "T2-MONARCH-060", "T2-COPILOT-084"], [], "none"); // tags
  same(["T1-ORIGIN-062", "T2-MONARCH-208"], [], "none"); // lifetime plan: Monte Carlo odds, retirement
  same(["T1-ORIGIN-066", "T2-MONARCH-210"], [20], "full"); // a home purchase what-if
  same(["T1-DUB-033", "T1-AUTOPILOT-026"], [46], "full"); // copying members of Congress
  // Placement never lifts a gate: the politician trackers stay hard-gated, the crypto links stay off.
  assert.ok(byId("T1-AUTOPILOT-026").hard_gated && byId("T1-DUB-033").hard_gated);
  for (const id of ["T2-MONARCH-020", "T2-COPILOT-016"]) assert.ok(byId(id).hard_gated && byId(id).gates.includes("decision_3"), id);
});

test("features.json and README.md are current", () => {
  execFileSync(process.execPath, [path.join(ROOT, "scripts/build-teardowns.cjs"), "--check"], { stdio: "pipe" });
});
