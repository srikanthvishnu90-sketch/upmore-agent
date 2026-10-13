// Crypto tax export (real-world C163; registry TAX-007; docs/depth/CRYPTO-TAX.md). One test per sub-capability,
// tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail. All rows are stand-in
// data, labeled as such; the expected figures were computed by hand before the engine was run.
// Check: node --test tests/depth-CRYPTO-TAX.test.cjs && node evals/depth/run.cjs CRYPTO-TAX
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
const CT = require(path.join(dir, "118-crypto-tax.js"));

const MAIN = [
  "Date,Type,Asset,Quantity,Price,Total,Fee,Exchange,Note",
  "2024-03-10,buy,BTC,0.5,40000,20000,50,StandIn Exchange,first buy",
  "2024-06-15,buy,BTC,0.25,52000,13000,25,StandIn Exchange,",
  "2025-02-20,buy,ETH,2,2500,5000,10,StandIn Exchange,",
  "2025-05-01,sell,BTC,0.6,60000,36000,60,StandIn Exchange,",
  "2025-08-10,sell,ETH,1,3200,3200,5,StandIn Exchange,",
  "2025-09-05,reward,SOL,0.8,200,160,0,StandIn Exchange,staking reward",
  "2025-11-01,sell,BTC,0.3,70000,21000,0,StandIn Exchange,",
].join("\n");
const parsed = CT.parseCsv(MAIN);
const fifo = CT.compute(parsed.rows, { method: "fifo", year: 2025 });

test("[S01] the generic CSV imports every row, in date order, with its venue", () => {
  const shuffled = MAIN.split("\n").slice(0, 1).concat(MAIN.split("\n").slice(1).reverse()).join("\n");
  const p = CT.parseCsv(shuffled);
  assert.equal(p.rows.length, 7); assert.equal(p.rows[0].on, "2024-03-10"); assert.equal(p.rows[6].on, "2025-11-01");
  assert.deepEqual(p.venues, ["StandIn Exchange"]); assert.equal(p.skipped.length, 0);
});

test("[S02] Coinbase-style headers import, and an inclusive total is the basis (spread included, fee not doubled)", () => {
  const cb = ["Timestamp,Transaction Type,Asset,Quantity Transacted,Spot Price Currency,Spot Price at Transaction,Subtotal,Total (inclusive of fees and/or spread),Fees and/or Spread,Notes",
    "2025-03-01T10:00:00Z,Buy,BTC,0.00000012,USD,60000,7.20,7.28,0.05,small",
    "2025-04-01T10:00:00Z,Sell,BTC,0.00000012,USD,65000,7.80,7.75,0.05,sold"].join("\n");
  const p = CT.parseCsv(cb);
  assert.equal(p.rows.length, 2); assert.equal(p.rows[0].basis_cents, null); assert.equal(p.rows[0].value_cents, 728);
  const r = CT.compute(p.rows, { method: "fifo", year: 2025 });
  assert.equal(r.totals.proceeds_gross_cents, 780); assert.equal(r.totals.proceeds_net_cents, 775); assert.equal(r.totals.gain_cents, 47);
});

test("[S03] FIFO matches the oldest lots first, to the cent", () => {
  assert.equal(fifo.totals.gain_cents, 1405500); assert.equal(fifo.totals.short_cents, 147000); assert.equal(fifo.totals.long_cents, 1258500);
  const may = fifo.disposals[0];
  assert.equal(may.portions[0].basis_cents, 2005000); assert.equal(may.portions[1].basis_cents, 521000);
});

test("[S04] LIFO takes the newest lots first: the short/long split moves, the total does not", () => {
  const lifo = CT.compute(parsed.rows, { method: "lifo", year: 2025 });
  assert.equal(lifo.totals.short_cents, 264000); assert.equal(lifo.totals.long_cents, 1141500); assert.equal(lifo.totals.gain_cents, fifo.totals.gain_cents);
});

test("[S05] HIFO takes the highest unit basis first, even when it is neither oldest nor newest", () => {
  const rows = CT.parseCsv(["Date,Type,Asset,Quantity,Total,Fee,Exchange",
    "2024-01-01,buy,BTC,1,10000,0,HifoEx", "2025-01-01,buy,BTC,1,30000,0,HifoEx", "2025-06-01,buy,BTC,1,20000,0,HifoEx",
    "2025-07-01,sell,BTC,1,25000,0,HifoEx"].join("\n")).rows;
  assert.equal(CT.compute(rows, { method: "hifo", year: 2025 }).totals.gain_cents, -500000);
  assert.equal(CT.compute(rows, { method: "fifo", year: 2025 }).totals.gain_cents, 1500000);
  assert.equal(CT.compute(rows, { method: "lifo", year: 2025 }).totals.gain_cents, 500000);
});

test("[S06] term is by the one-year anniversary of each lot, portion by portion", () => {
  const may = fifo.disposals[0];
  assert.equal(may.portions[0].long, true); // 2024-03-10 -> 2025-05-01
  assert.equal(may.portions[1].long, false); // 2024-06-15 -> 2025-05-01
  const nov = fifo.disposals.find((d) => d.on === "2025-11-01");
  assert.equal(nov.portions[0].long, true); // the same 2024-06-15 lot, sold after its anniversary
});

test("[S07] a sale bigger than the file's buys: the shortfall's proceeds are listed as missing basis, never guessed", () => {
  assert.equal(fifo.totals.missing_cents, 1050000);
  assert.match(fifo.problems.map((p) => p.text).join(" "), /0\.15 BTC of the Nov 1, 2025 sale has no buy in the file/);
  const csv8949 = CT.form8949Csv(fifo);
  assert.match(csv8949, /0\.15 BTC,,2025-11-01,10500\.00,,,,BTC,StandIn Exchange,"no buy in the file covers this part; basis unknown, not guessed"/);
});

test("[S08] a reward is income at the value the file states, and that value becomes its lot's basis", () => {
  assert.equal(fifo.totals.income_cents, 16000);
  const sol = fifo.holdings.find((h) => h.asset === "SOL");
  assert.equal(sol.basis_cents, 16000); assert.equal(sol.qty_text, "0.8");
});

test("[S09] a transfer out between the person's own venues is not a sale and is not taxed", () => {
  const rows = CT.parseCsv(["Date,Type,Asset,Quantity,Total,Fee,Exchange",
    "2025-01-05,buy,ETH,3,6000,0,ExA", "2025-03-01,send,ETH,1,0,0,ExA", "2025-04-01,sell,ETH,2,5000,0,ExA"].join("\n")).rows;
  const r = CT.compute(rows, { method: "fifo", year: 2025 });
  assert.equal(r.disposals.length, 1); assert.equal(r.transfers.length, 1); assert.equal(r.totals.gain_cents, 100000); assert.equal(r.holdings.length, 0);
});

test("[S10] a loss sale bought back within 30 days is flagged, and the loss stands (no wash-sale disallowance for crypto)", () => {
  const rows = CT.parseCsv(["Date,Type,Asset,Quantity,Total,Fee,Exchange",
    "2025-01-10,buy,BTC,1,50000,0,WashEx", "2025-06-01,sell,BTC,1,40000,0,WashEx", "2025-06-20,buy,BTC,1,41000,0,WashEx"].join("\n")).rows;
  const r = CT.compute(rows, { method: "fifo", year: 2025 });
  assert.equal(r.totals.gain_cents, -1000000);
  const pairs = CT.washPairs(rows, r);
  assert.equal(pairs.length, 1); assert.equal(pairs[0].rebuy_on, "2025-06-20");
  assert.match(CT.WASH_NOTE, /wash-sale rule \(IRC 1091\) covers stocks and securities\. Crypto is treated as property/);
});

test("[S11] rows that cannot be read are listed as skipped with the reason, never dropped quietly", () => {
  const p = CT.parseCsv(["Date,Type,Asset,Quantity,Total,Fee,Exchange",
    "not-a-date,buy,BTC,1,100,0,X", "2025-01-01,dance,BTC,1,100,0,X", "2025-01-02,buy,BTC,abc,100,0,X", "2025-01-03,buy,BTC,1,100,0,X"].join("\n"));
  assert.equal(p.rows.length, 1); assert.equal(p.skipped.length, 3);
  assert.match(p.skipped.map((s) => s.reason).join(" "), /date could not be read/);
  const out = CT.handle("crypto taxes for tax year 2025\n" + ["Date,Type,Asset,Quantity,Total,Fee,Exchange", "not-a-date,buy,BTC,1,100,0,X", "2025-01-03,buy,BTC,1,100,0,X", "2025-02-03,sell,BTC,1,150,0,X"].join("\n"));
  assert.match(out, /Rows I could not read, skipped rather than dropped quietly: line 2/);
});

test("[S12] the Form 8949 export's rows tie to the summary to the cent", () => {
  const lines = CT.form8949Csv(fifo).split("\n");
  assert.equal(lines.length, 6); // header + 4 covered portions + 1 missing-basis row
  const sum = (i) => lines.slice(1).reduce((s, l) => s + (parseFloat((l.split(",")[i] || "0")) || 0), 0);
  assert.equal(Math.round(sum(3) * 100), fifo.totals.proceeds_net_cents);
  assert.equal(Math.round(sum(5) * 100), fifo.totals.gain_cents);
});

test("[S13] the 1099-DA check compares gross proceeds (fees not netted), match or difference to the cent", () => {
  assert.equal(CT.reconcile(fifo, 6020000).diff_cents, 0);
  const off = CT.reconcile(fifo, 6120000);
  assert.equal(off.diff_cents, -100000); assert.match(off.text, /a difference of \$1,000\.00/);
  assert.match(CT.DA_NOTE, /Form 1099-DA/);
});

test("[S14] with no file the answer is the honest prompt; trade asks are never this answer", () => {
  const out = CT.handle("Get my crypto taxes sorted.");
  assert.match(out, /no crypto venue is connected to Upmore and no crypto transactions are on file, so I won't invent any/);
  assert.match(out, /paste it here/);
  assert.equal(CT.handle("buy some bitcoin"), null);
  assert.equal(CT.ask("sell my bitcoin and do my taxes"), null);
  assert.equal(CT.ask("what's my checking balance"), null);
});

test("[S15] a trade disposes of the spent asset and opens a lot for what was received, at the trade's value", () => {
  const text = ["Date,Type,Asset,Quantity,Total,Fee,Exchange,Received Asset,Received Quantity",
    "2025-01-10,buy,ETH,2,4000,0,TradeEx,,", "2025-03-01,trade,ETH,1,2500,0,TradeEx,SOL,10", "2025-09-01,sell,SOL,10,3000,0,TradeEx,,"].join("\n");
  const rows = CT.parseCsv(text).rows;
  const r = CT.compute(rows, { method: "fifo", year: 2025 });
  assert.equal(r.disposals.length, 2);
  assert.equal(r.disposals[0].gain_cents, 50000); // 2,500 proceeds - 2,000 basis (half the ETH lot)
  assert.equal(r.disposals[1].gain_cents, 50000); // 3,000 - the trade's 2,500 value as the SOL lot's basis
  assert.match(CT.genericCsv(r).split("\n")[0], /^Date,Type,Asset,Quantity,Proceeds \(USD\),Cost Basis \(USD\)/);
});

test("[ADV] adversarial: a second venue's file, a receive with no basis, and a sale in an earlier year consuming lots", () => {
  const rows = CT.parseCsv(["Date,Type,Asset,Quantity,Total,Fee,Exchange",
    "2023-05-01,buy,BTC,1,20000,0,OldEx", "2023-11-01,sell,BTC,0.5,15000,0,OldEx",
    "2024-02-01,receive,BTC,0.25,0,0,NewEx", "2025-03-01,sell,BTC,0.6,30000,0,NewEx"].join("\n")).rows;
  const r = CT.compute(rows, { method: "fifo", year: 2025 });
  assert.equal(r.disposals.length, 1); // the 2023 sale is not in the 2025 export but consumed half the lot
  assert.equal(r.disposals[0].portions[0].basis_cents, 1000000); // remaining half of the 2023 lot
  assert.equal(r.disposals[0].portions[1].basis_cents, null); // the receive carries no basis in the file
  assert.equal(r.disposals[0].portions[1].gain_cents, null);
});
