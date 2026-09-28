// SPEC 08 Investments X-ray — deterministic tests for pure engine functions.
// Extracts the pure functions from src/upmore-app-template.html and runs node:assert.
const fs = require("fs");
const assert = require("assert");
const path = require("path");

const html = fs.readFileSync(path.join(__dirname, "..", "src", "upmore-app-template.html"), "utf8");

// Grab the SPEC 08 pure block: from the FUND_FEES const through investSummaryText.
const start = html.indexOf("const FUND_FEES = {");
assert(start !== -1, "FUND_FEES block not found");
const pureEnd = html.indexOf("// ---- Plaid wiring", start);
assert(pureEnd !== -1, "Plaid wiring marker not found");
const block = html.slice(start, pureEnd);

// Stub the browser-only helpers the block references at load time.
const stubs = `
  const blsGet = (k, d) => d;
  const blsSet = () => {};
  const bm0 = v => "$" + Math.round(Number(v||0)).toLocaleString("en-US");
  const esc = s => String(s ?? "");
  const toast = () => {};
`;
const sandbox = {};
new Function("module", "exports", stubs + "\n" + block + `
  module.exports = { FUND_FEES, bc2, BUCKETS, bucketOf, normalizePlaidHoldings, feeFor, portfolioSummary, investSummaryText };
`)({ exports: {} }, sandbox);
const M = new Function("module", "exports", stubs + "\n" + block + "\nreturn { FUND_FEES, bc2, BUCKETS, bucketOf, normalizePlaidHoldings, feeFor, portfolioSummary, investSummaryText };")();

// --- bucketOf ---
assert.strictEqual(M.bucketOf("equity"), "Stocks");
assert.strictEqual(M.bucketOf("etf"), "Funds");
assert.strictEqual(M.bucketOf("mutual fund"), "Funds");
assert.strictEqual(M.bucketOf("fixed income"), "Bonds");
assert.strictEqual(M.bucketOf("cash"), "Cash");
assert.strictEqual(M.bucketOf("cryptocurrency"), "Crypto");
assert.strictEqual(M.bucketOf("option"), "Other");
assert.strictEqual(M.bucketOf(undefined), "Other");
console.log("bucketOf: ok");

// --- normalizePlaidHoldings ---
const plaidRes = {
  accounts: [{ id: "a1", name: "Roth IRA" }],
  securities: [
    { security_id: "s1", ticker_symbol: "VTI", name: "Vanguard Total Stock Market ETF", type: "etf" },
    { security_id: "s2", ticker_symbol: "AAPL", name: "Apple Inc.", type: "equity" },
    { security_id: "s3", ticker_symbol: null, name: "Settlement Fund", type: "cash" },
  ],
  holdings: [
    { account_id: "a1", security_id: "s1", quantity: 10, institution_price: 280.5, institution_value: 2805, cost_basis: 2500 },
    { account_id: "a1", security_id: "s2", quantity: 5, institution_price: 230, institution_value: 1150, cost_basis: null },
    { account_id: "a1", security_id: "s3", quantity: 500, institution_price: 1, institution_value: 500 },
  ],
};
const h = M.normalizePlaidHoldings(plaidRes);
assert.strictEqual(h.length, 3);
assert.strictEqual(h[0].symbol, "VTI");
assert.strictEqual(h[0].bucket, "Funds");
assert.strictEqual(h[0].account_name, "Roth IRA");
assert.strictEqual(h[0].expense_ratio, 0.0003);
assert.strictEqual(h[1].bucket, "Stocks");
assert.strictEqual(h[1].cost_basis, null);
assert.strictEqual(h[2].bucket, "Cash");
console.log("normalizePlaidHoldings: ok");

// --- feeFor ---
assert.deepStrictEqual(M.feeFor({ symbol: "VTI", expense_ratio: null }), { rate: 0.0003, known: true });
assert.deepStrictEqual(M.feeFor({ symbol: "ZZZ", expense_ratio: null }), { rate: null, known: false });
assert.deepStrictEqual(M.feeFor({ symbol: "ZZZ", expense_ratio: 0.005 }), { rate: 0.005, known: true });
console.log("feeFor: ok");

// --- portfolioSummary ---
const sum = M.portfolioSummary(h);
assert.strictEqual(sum.total, 2805 + 1150 + 500);
assert.strictEqual(sum.byBucket.Funds, 2805);
assert.strictEqual(sum.byBucket.Stocks, 1150);
assert.strictEqual(sum.byBucket.Cash, 500);
assert.strictEqual(sum.count, 3);
// VTI is 2805/4455 = 62.9% -> concentrated; AAPL is 1150/4455 = 25.8% -> also concentrated
assert.strictEqual(sum.concentrated.length, 2);
assert.strictEqual(sum.concentrated[0].symbol, "VTI");
assert.strictEqual(sum.concentrated[1].symbol, "AAPL");
// gains: only VTI has cost basis -> up 305
assert.strictEqual(sum.gainCount, 1);
assert.strictEqual(sum.gainKnown, 305);
// fees: VTI 2805*0.0003 = 0.8415; AAPL unknown (Stocks, no fee) -> feeUnknown=1
assert.ok(Math.abs(sum.feeYearly - 0.8415) < 1e-9, `feeYearly=${sum.feeYearly}`);
assert.strictEqual(sum.feeUnknown, 1);
assert.strictEqual(sum.cashValue, 500);
console.log("portfolioSummary: ok");

// --- concentration threshold boundary ---
const even = [
  { symbol: "A", value: 250, bucket: "Stocks", cost_basis: null, expense_ratio: null },
  { symbol: "B", value: 250, bucket: "Stocks", cost_basis: null, expense_ratio: null },
  { symbol: "C", value: 250, bucket: "Stocks", cost_basis: null, expense_ratio: null },
  { symbol: "D", value: 250, bucket: "Stocks", cost_basis: null, expense_ratio: null },
];
assert.strictEqual(M.portfolioSummary(even).concentrated.length, 4); // exactly 25% counts, all four flag
const justUnder = [
  { symbol: "A", value: 249, bucket: "Stocks", cost_basis: null, expense_ratio: null },
  { symbol: "B", value: 251, bucket: "Stocks", cost_basis: null, expense_ratio: null },
  { symbol: "C", value: 250, bucket: "Stocks", cost_basis: null, expense_ratio: null },
  { symbol: "D", value: 250, bucket: "Stocks", cost_basis: null, expense_ratio: null },
];
assert.strictEqual(M.portfolioSummary(justUnder).concentrated.length, 3); // B 25.1%, C+D exactly 25% flag; A at 24.9% does not
console.log("concentration boundary: ok");

// --- empty ---
const empty = M.portfolioSummary([]);
assert.strictEqual(empty.total, 0);
assert.strictEqual(empty.concentrated.length, 0);
console.log("empty: ok");

// --- investSummaryText ---
const t = M.investSummaryText(sum);
assert.ok(t.includes("across 3 positions"), t);
assert.ok(t.includes("up $305"), t);
assert.ok(t.includes("VTI"), t);
console.log("investSummaryText: ok");

console.log("\nAll SPEC 08 engine tests passed.");
