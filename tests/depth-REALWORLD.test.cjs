// The real-world 206 engine (docs/depth/REALWORLD.md): packages/domain/65-agent-realworld.js names each item's connector
// path (a live adapter the person linked, or NOT_WIRED), checks a read-back against the item's proof kind (done, not
// done, pending, unknown), writes the failure text and the dollar statement with source and as-of, and computes the
// audit status scripts/realworld-audit.cjs publishes in docs/realworld/README.md. Done counts only a live run read back
// from the real counterparty. One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect
// makes exactly this test fail. The map, catalog and registry are the shipped files; every read-back here is MOCK.
// Check: node --test tests/depth-REALWORLD.test.cjs && node evals/depth/run.cjs REALWORLD
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const RW = require(path.join(dir, "65-agent-realworld.js"));
const read = rel => JSON.parse(fs.readFileSync(path.join(root, rel), "utf8"));
const map = read("packages/capabilities/realworld.json"), catalog = read("packages/connectors/catalog.json");
const registry = read("packages/capabilities/registry.json"), overlay = read("packages/capabilities/status-overlay.json");
const depth = {};
for (const f of fs.readdirSync(path.join(root, "evals/depth/results"))) if (/\.json$/.test(f)) { const r = read("evals/depth/results/" + f); depth[r.capability] = r; }
const E = RW.load(map, catalog, registry);
const clone = x => JSON.parse(JSON.stringify(x));
const T = Date.UTC(2026, 9, 11, 13, 0, 0);
const FILL = { order_id: "mock-o1", status: "filled", fill_price_cents: 51210, quantity: 1, filled_at: T, position: { symbol: "VOO", quantity: 1 } };
const live = (item, readback, o) => E.status(item, { depth, overlay, evidence: { [item]: [Object.assign({ item, provider_mode: "live", counterparty: "Mock Brokerage", observed_at: "2026-10-11T13:00:00Z", readback }, o)] } });

test("[S01] nothing linked is NOT_WIRED, and each connector on the path says why", () => {
  const p = E.plan("C46", { connected: [] });
  assert.equal(p.rail, RW.NOT_WIRED);
  assert.equal(p.wired, false);
  assert.deepEqual(p.path.map(x => x.connector), map.items.find(i => i.id === "C46").connectors);
  assert.ok(p.path.length >= 2);
  for (const x of p.path) assert.deepEqual([x.wired, x.reason], [false, "not linked by the user"], x.connector);
});

test("[S02] linked but no adapter built is still NOT_WIRED, said as 'adapter not built'", () => {
  const p = E.plan("C46", { connected: ["schwab"] });
  assert.equal(p.rail, RW.NOT_WIRED);
  assert.equal(p.path[0].linked, true);
  assert.equal(p.path[0].reason, "adapter not built");
});

test("[S03] wired only with a linked provider whose adapter is live; a gap connector is never wired, the next live one is", () => {
  assert.equal(E.plan("C46", { connected: ["schwab"], adapters: { schwab: { state: "live" } } }).rail, "schwab");
  assert.equal(E.plan("C46", { connected: ["fidelity"], adapters: { schwab: { state: "live" } } }).rail, RW.NOT_WIRED, "live but not linked");
  const g = E.plan("C90", { connected: ["gmail", "gap:settlement-administrators"], adapters: { gmail: { state: "live" }, "gap:settlement-administrators": { state: "live" } } });
  assert.deepEqual([g.path[0].connector, g.path[0].wired, g.path[0].reason], ["gap:settlement-administrators", false, "settlement-administrators is not in the connector catalog"]);
  assert.equal(g.rail, "gmail");
});

test("[S04] a sandbox adapter is not a live rail: NOT_WIRED, never a pretend connection", () => {
  // CLAUDE.md: everything is LIVE; a rail that is not live returns NOT_WIRED; mocks exist only inside tests.
  const p = E.plan("C46", { connected: ["schwab"], adapters: { schwab: { state: "sandbox" } } });
  assert.equal(p.rail, RW.NOT_WIRED);
  assert.equal(p.wired, false);
  assert.equal(p.path[0].reason, "adapter is sandbox, not live");
});

test("[S05] a catalog row is live only when its adapter state says live, not when the word appears inside 'not live'", () => {
  const cat = clone(catalog);
  cat.connectors.find(c => c.provider === "schwab").adapter_state = "not live: awaiting the partner agreement";
  const E2 = RW.load(map, cat, registry);
  assert.equal(E2.plan("C46", { connected: ["schwab"] }).rail, RW.NOT_WIRED);
  assert.equal(E2.status("C46", { depth, overlay }).rail, RW.NOT_WIRED);
  cat.connectors.find(c => c.provider === "schwab").adapter_state = "live";
  const E3 = RW.load(map, cat, registry);
  assert.equal(E3.plan("C46", { connected: ["schwab"] }).rail, "schwab");
  assert.equal(E3.status("C46", { depth, overlay }).rail, "LIVE");
});

test("[S06] a report is never evidence: 'done', 'task completed', {status: completed} and no read-back are all unknown", () => {
  for (const id of ["C1", "C46", "C73", "C90", "C139"]) {
    for (const e of [undefined, null, "done", "task completed", "Task completed.", "Cancelled", { status: "completed" }, { status: "done" }, 42]) assert.equal(E.proof(id, e).done, null, `${id} ${JSON.stringify(e)}`);
  }
  assert.equal(E.proof("C73", "cancelled").reason, "a report is not evidence");
});

test("[S07] a read-back missing a field the proof kind needs is unknown, and says which field", () => {
  const r = E.proof("C46", { order_id: "mock-o1" });
  assert.equal(r.done, null);
  assert.equal(r.reason, "read-back lacks status");
  assert.equal(E.proof("C128", { status: "delivered" }).reason, "read-back lacks rail");
});

test("[S08] a feed number is done only when it equals the sum of rows that each carry a source and an as-of", () => {
  const rows = [{ id: "t1", amount_cents: 21240, source: "mock-feed", as_of: T }, { id: "t2", amount_cents: 1500, source: "mock-feed", as_of: T - 1000 }];
  const ok = E.proof("C1", { rows, total_cents: 22740 });
  assert.deepEqual([ok.done, ok.total_cents, ok.as_of], [true, 22740, T - 1000]);
  assert.equal(E.proof("C1", { rows, total_cents: 22741 }).reason, "total $227.41 does not equal the rows ($227.40)");
  assert.equal(E.proof("C1", { rows: [{ id: "t1", amount_cents: 5 }], total_cents: 5 }).done, false, "a row without a source");
});

test("[S09] a cancellation is done when the provider's record reads cancelled and no next charge is scheduled", () => {
  assert.equal(E.proof("C73", { expected_state: "cancelled", record: { state: "cancelled", read_at: T }, next_charge_at: null }).done, true);
  assert.equal(E.proof("C73", { expected_state: "cancelled", record: { state: "active" } }).reason, "provider record reads active, not cancelled");
  assert.equal(E.proof("C73", { expected_state: "cancelled", record: { state: "cancelled" }, next_charge_at: T + 86400000 }).reason, "a next charge is still scheduled");
  // The finished state is the item's, never the read-back's own claim: a record that "expects" active and reads active is
  // not a cancellation (merge review of this packet). US spelling is the same state.
  const self = E.proof("C73", { expected_state: "active", record: { state: "active" }, next_charge_at: null });
  assert.deepEqual([self.done, self.reason], [false, "C73 is finished only when the provider record reads cancelled; the read-back expected active"]);
  assert.equal(E.proof("C73", { expected_state: "canceled", record: { state: "Canceled", read_at: T }, next_charge_at: null }).done, true);
  assert.equal(E.proof("C141", { expected_state: "locked", record: { state: "locked" } }).done, true);
  assert.equal(E.proof("C141", { expected_state: "cancelled", record: { state: "cancelled" } }).done, false, "a fraud lock is not finished by a cancelled record");
  const own = map.items.filter(i => i.proof_kind === "provider_state").map(i => i.id);
  assert.deepEqual(own.filter(id => !RW.FINISHED_STATE[id]), [], "every provider-record item names the state that finishes it");
});

test("[S10] a fill is done with a price, a quantity above zero and a time; queued off-hours is in flight; queued while open is not done", () => {
  const f = E.proof("C46", FILL);
  assert.deepEqual([f.done, f.reason, f.total_cents], [true, "filled 1 at $512.10", 51210]);
  assert.equal(E.proof("C46", Object.assign({}, FILL, { quantity: 0 })).done, false, "nothing was bought");
  assert.equal(E.proof("C46", Object.assign({}, FILL, { fill_price_cents: 0 })).done, false, "no real price");
  const q = E.proof("C46", { order_id: "mock-o1", status: "queued", market_open: false });
  assert.deepEqual([q.done, q.pending], [true, true]);
  assert.equal(E.proof("C46", { order_id: "mock-o1", status: "queued", market_open: true }).done, false);
  assert.equal(E.proof("C46", Object.assign({}, FILL, { quantity: 2, position: { quantity: 1 } })).reason, "position does not reflect the fill");
});

test("[S11] a resting order is done only when it rests with the requested parameters, and there must be parameters to compare", () => {
  const params = { limit_cents: 10500, expires_at: "2026-10-16" };
  assert.equal(E.proof("C57", { order_id: "mock-o2", status: "open", params, wanted: params }).done, true);
  assert.equal(E.proof("C57", { order_id: "mock-o2", status: "open", params: { limit_cents: 10500, expires_at: "2026-10-30" }, wanted: params }).reason, "expires_at rests as 2026-10-30, not 2026-10-16");
  const blind = E.proof("C57", { order_id: "mock-o2", status: "open", params: { limit_cents: 99900 } });
  assert.equal(blind.done, null, "no requested parameters means nothing was checked");
});

test("[S12] money sent is done only when the rail says delivered with a reference; staged or drafted is not delivered", () => {
  assert.equal(E.proof("C128", { rail: "zelle", status: "delivered", reference: "Z-9981" }).done, true);
  assert.equal(E.proof("C128", { rail: "venmo", status: "staged" }).reason, "staged, not delivered");
  assert.equal(E.proof("C128", { rail: "venmo", status: "drafted" }).done, false);
  assert.equal(E.proof("C128", { rail: "zelle", status: "delivered" }).reason, "delivered without a rail reference");
  assert.equal(E.proof("C128", { rail: "zelle", status: "returned", reference: "Z-1" }).done, false);
});

test("[S13] a transfer is done only when both balances moved by an amount above zero, in the right direction", () => {
  assert.equal(E.proof("C126", { amount_cents: 3000000, from: { before: 3200000, after: 200000 }, to: { before: 0, after: 3000000 } }).done, true);
  assert.equal(E.proof("C126", { amount_cents: 3000000, from: { before: 3200000, after: 200000 }, to: { before: 0, after: 2999900 } }).reason, "destination balance did not move by the amount");
  assert.equal(E.proof("C126", { amount_cents: 0, from: { before: 100, after: 100 }, to: { before: 0, after: 0 } }).done, false, "nothing moved");
  assert.equal(E.proof("C126", { amount_cents: -500, from: { before: 100, after: 600 }, to: { before: 500, after: 0 } }).done, false, "money went the other way");
});

test("[S14] a credit or payout is done only when a row above zero posted; the wrong amount, $0, or no row yet is not", () => {
  assert.equal(E.proof("C79", { expected_cents: 3400, credit_row: { amount_cents: 3400, posted_at: T } }).done, true);
  assert.equal(E.proof("C79", { expected_cents: 3400, credit_row: { amount_cents: 1700, posted_at: T } }).reason, "credit of $17.00 is not the $34.00 expected");
  assert.equal(E.proof("C79", { expected_cents: 0, credit_row: { amount_cents: 0, posted_at: T } }).done, false, "a $0 credit is no credit");
  assert.equal(E.proof("C96", { reference: "BONUS-2026-77", payout_row: { amount_cents: 0, posted_at: T } }).done, false, "a $0 payout is no payout");
  const p = E.proof("C96", { reference: "BONUS-2026-77" });
  assert.deepEqual([p.done, p.pending], [false, true]);
});

test("[S15] a freeze needs one confirmation per bureau and never carries the PIN", () => {
  const b = { equifax: { confirmation: "EQ-1001", pin_stored: true }, experian: { confirmation: "EX-1001", pin_stored: true }, transunion: { confirmation: "TU-1001", pin_issued: false } };
  assert.equal(E.proof("C139", { bureaus: b }).done, true);
  assert.equal(E.proof("C139", { bureaus: { equifax: b.equifax, experian: b.experian } }).reason, "transunion has no confirmation");
  assert.equal(E.proof("C139", { bureaus: Object.assign({}, b, { equifax: { confirmation: "EQ-1001", pin_stored: true, pin: "123456" } }) }).reason, "equifax PIN is present in the evidence; PINs live in the vault only");
});

test("[S16] the failure text names what it knows and never invents the rest", () => {
  assert.equal(E.failure("C46", { brokerage: "Schwab" }), "Order not placed: Schwab is NOT_WIRED. Nothing was submitted.");
  assert.equal(E.failure("C46", {}), "Order not placed: that brokerage is NOT_WIRED. Nothing was submitted.");
  assert.equal(E.failure("C3", { bank: "Chase", as_of: Date.UTC(2026, 9, 10) }), "I can't give a safe-to-spend number right now: pending transactions are unavailable from Chase since 2026-10-10.");
  assert.equal(E.failure("C3", {}), "I can't give a safe-to-spend number right now: pending transactions are unavailable from that bank since its last sync.");
});

test("[S17] the statement says done, in flight, not done or unknown, with its source and as-of, never 'task completed'", () => {
  assert.equal(E.statement("C46", E.proof("C46", FILL), { source: "Mock Brokerage", as_of: T }), "Buy a stock or ETF from a text: done. filled 1 at $512.10, $512.10 (source: Mock Brokerage, as of 2026-10-11).");
  assert.match(E.statement("C46", E.proof("C46", { order_id: "mock-o1", status: "queued", market_open: false })), /: in flight\. .* I'll confirm when it lands\.$/);
  assert.match(E.statement("C128", E.proof("C128", { rail: "venmo", status: "staged" })), /: not done\. staged, not delivered\.$/);
  assert.match(E.statement("C73", E.proof("C73", "done")), /: unknown\. a report is not evidence\. I will not call it done until I can read it back\.$/);
  for (const id of ["C1", "C46", "C73"]) assert.doesNotMatch(E.statement(id, E.proof(id, null)), /task completed|: done\./i);
});

test("[S18] done means a live run read back from a real counterparty that passes the item's own proof, and nothing else", () => {
  assert.equal(map.items.filter(it => E.status(it.id, { depth, overlay }).done).length, 0, "nothing is done today");
  assert.equal(live("C46", FILL).done, true, "a live fill read back is done");
  assert.equal(live("C46", FILL, { provider_mode: "sandbox" }).done, false, "a sandbox fill is not done");
  assert.equal(live("C46", { order_id: "mock-o1", status: "queued", market_open: false }).done, false, "queued is in flight, not done");
  assert.equal(live("C46", "task completed").done, false, "a report is not evidence");
  assert.equal(live("C46", FILL, { counterparty: "" }).done, false, "no counterparty");
  assert.equal(live("C46", FILL, { observed_at: "yesterday-ish" }).done, false, "no real time");
  assert.equal(live("C73", { expected_state: "cancelled", record: { state: "active" } }).done, false);
  assert.equal(live("C46", FILL).evidence_rejected, 0);
  assert.equal(live("C46", FILL, { provider_mode: "sandbox" }).evidence_rejected, 1);
});

test("[S19] logic is proven only by the item's own depth packet: 15 or more sub-capabilities, every defect biting, each sub-capability covered", () => {
  const c128 = E.status("C128", { depth, overlay });
  assert.deepEqual([c128.logic, c128.proven], ["LOGIC_PROVEN", ["PAY-001"]]);
  const pay = depth["PAY-001"], with_ = rows => ({ depth: Object.assign({}, depth, { "PAY-001": Object.assign({}, pay, { rows, proven: rows.filter(r => r.bites).length }) }), overlay });
  assert.notEqual(E.status("C128", with_(pay.rows.map((r, i) => i === 0 ? Object.assign({}, r, { bites: false }) : r))).logic, "LOGIC_PROVEN", "a defect that does not bite");
  assert.notEqual(E.status("C128", with_(pay.rows.filter(r => r.sub !== "S13"))).logic, "LOGIC_PROVEN", "a sub-capability with no defect");
  const small = { depth: Object.assign({}, depth, { "PAY-001": Object.assign({}, pay, { sub_capabilities: 14, rows: pay.rows.filter(r => !["S15", "S16"].includes(r.sub)) }) }), overlay };
  assert.notEqual(E.status("C128", small).logic, "LOGIC_PROVEN", "14 sub-capabilities are not a depth packet");
  assert.equal(E.status("C1", { depth, overlay }).logic, "LOGIC_TESTED");
});

test("[S20] the rail is LIVE only with a live catalog adapter, SANDBOX only for the local counterparty, else NOT_WIRED; gaps are named", () => {
  assert.equal(E.status("C73", { depth, overlay }).rail, "SANDBOX");
  assert.equal(E.status("C81", { depth, overlay }).rail, RW.NOT_WIRED);
  assert.ok(!map.items.some(it => E.status(it.id, { depth, overlay }).rail === "LIVE"), "no adapter is live; a LIVE row would be a lie");
  assert.deepEqual(E.status("C90", { depth, overlay }).gaps, ["settlement-administrators"]);
});

test("[ADV] planted evidence never makes an item done: say-so dressed as a read-back, a PIN, a pretend reference, a future-proofed mode", () => {
  for (const e of [{ status: "Completed." }, { status: "success" }, "Sent", "  done  "]) assert.equal(E.proof("C128", e).done, null, JSON.stringify(e));
  assert.equal(E.proof("C90", { counterparty: "Mock Administrator", reference: " pending " }).done, false);
  assert.equal(E.proof("C90", { counterparty: "Mock Administrator", reference: "N/A" }).done, false);
  assert.equal(live("C46", FILL, { provider_mode: "LIVE " }).done, false, "only the exact live mode counts");
  assert.equal(live("C46", FILL, { provider_mode: "paper" }).done, false);
  assert.equal(E.proof("C155", { doc_id: "mock-w2", sha256: "z".repeat(64) }).done, false);
  assert.equal(E.proof("C33", { claims: [{ text: "Revenue $1.2B", source_url: "javascript:alert(1)", as_of: "2026-08-01" }] }).done, false);
  assert.throws(() => E.plan("C999", {}), /unknown real-world capability C999/);
  assert.doesNotMatch(E.failure("C46", { brokerage: undefined, provider: null }), /undefined|null/);
});
