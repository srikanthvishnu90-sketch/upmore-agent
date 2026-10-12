// Export data reads every table on the list a person's data lives in (privacy policy: "Export your data (delivered as
// JSON)"). Found 2026-10-12: it read none of the agent tables but the chat, and one select per table, which PostgREST
// caps at 1,000 rows, so a long transaction history was cut off without a word. The app's EXPORT_TABLES must equal
// tests/fixtures/export-tables.json, which tests/db/export_coverage.test.sql checks against the database (every table a
// person can read about themselves is listed or left out with a reason). The export itself runs here against a MOCK
// Supabase client with 2,345 transactions.
// Check: node --test tests/export-coverage.test.cjs
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const APP = fs.readFileSync(path.join(root, "src/upmore-app-template.html"), "utf8");
const DOC = JSON.parse(fs.readFileSync(path.join(root, "tests/fixtures/export-tables.json"), "utf8"));
const fnSrc = (() => { const i = APP.indexOf("  async function exportUserData() {"), j = APP.indexOf("\n  }\n", i); return APP.slice(i, j + 4); })();

test("the app's export list equals the fixture the database check reads", () => {
  const m = /const EXPORT_TABLES = (\[[\s\S]*?\]);/.exec(fnSrc);
  assert.ok(m, "EXPORT_TABLES in exportUserData");
  const list = JSON.parse(m[1].replace(/,\s*\]$/, "]"));
  assert.deepEqual(list, DOC.export.map((e) => [e.table, e.order.join(",")].concat(e.select ? [e.select] : [])));
  for (const t of ["agent_financial_transactions", "agent_financial_accounts", "agent_proactive_settings", "standing_payments", "saved_recipients", "brokerage_accounts", "manual_connections", "user_oauth_connections", "agent_ledger"]) assert.ok(list.some((e) => e[0] === t), t);
  for (const t of Object.keys(DOC.excluded)) assert.ok(!list.some((e) => e[0] === t), `${t} is excluded, with the reason: ${DOC.excluded[t]}`);
  // The brokerage row's Vault pointer is not granted to the person, so its columns are listed (select * is refused).
  assert.doesNotMatch(DOC.export.find((e) => e.table === "brokerage_accounts").select, /vault_key_ref|paper/);
});

// A MOCK Supabase client: PostgREST's 1,000-row cap, a missing table, and the calls the export makes.
function mockClient(db, calls) {
  return {
    from(table) {
      const q = { table, filters: [], orders: [], cols: "*" };
      const api = {
        select(cols) { q.cols = cols; return api; },
        eq(k, v) { q.filters.push([k, v]); return api; },
        or() { return api; },
        order(c, o) { q.orders.push([c, o && o.ascending]); return api; },
        maybeSingle: async () => ({ data: (db[table] || [])[0] || null, error: null }),
        range(a, b) { q.range = [a, b]; return api; },
        then(res, rej) {
          calls.push(q);
          if (!(table in db)) return Promise.resolve({ data: null, error: { message: "relation does not exist" } }).then(res, rej);
          let rows = db[table].filter((r) => q.filters.every(([k, v]) => r[k] === v));
          for (const [c, asc] of q.orders.slice().reverse()) rows = rows.slice().sort((x, y) => (x[c] < y[c] ? -1 : x[c] > y[c] ? 1 : 0) * (asc === false ? -1 : 1));
          const [a, b] = q.range || [0, 999];
          return Promise.resolve({ data: rows.slice(a, Math.min(b, a + 999) + 1), error: null }).then(res, rej);
        },
      };
      return api;
    },
  };
}

async function runExport(db) {
  const calls = [];
  let blobText = null;
  const ctx = {
    supa: mockClient(db, calls), financeCapture: () => ({ owner: "u1", current: () => true }), toast() {},
    Blob: class { constructor(parts) { blobText = parts.join(""); } }, URL: { createObjectURL: () => "blob:x", revokeObjectURL() {} },
    document: { createElement: () => ({ click() {}, remove() {} }), body: { appendChild() {} } }, setTimeout() {},
  };
  const f = new Function(...Object.keys(ctx), `${fnSrc}\nreturn exportUserData;`)(...Object.values(ctx));
  await f();
  return { out: JSON.parse(blobText), calls };
}

test("a long history is exported whole, in pages of 1,000 in a stable order; a table that can't be read is named", async () => {
  const tx = Array.from({ length: 2345 }, (_, i) => ({ user_id: "u1", account_id: "chk", provider_transaction_id: `mock-${String(i).padStart(5, "0")}`, posted_on: `2026-${String(1 + (i % 9)).padStart(2, "0")}-01`, amount_cents: -100 - i }));
  const db = { agent_financial_transactions: tx.concat([{ user_id: "someone-else", account_id: "x", provider_transaction_id: "z", posted_on: "2026-01-01" }]), agent_threads: [], profiles: [{ id: "u1" }] };
  for (const e of DOC.export) if (!(e.table in db) && e.table !== "plaid_requests") db[e.table] = [];
  const { out, calls } = await runExport(db);
  assert.equal(out.agent_financial_transactions.length, 2345, "every transaction, past the 1,000-row cap");
  assert.equal(new Set(out.agent_financial_transactions.map((r) => r.provider_transaction_id)).size, 2345, "no row twice");
  const txCalls = calls.filter((c) => c.table === "agent_financial_transactions");
  assert.deepEqual(txCalls.map((c) => c.range), [[0, 999], [1000, 1999], [2000, 2999]]);
  assert.deepEqual(txCalls[0].orders.map((o) => o[0]), ["posted_on", "account_id", "provider_transaction_id"]);
  assert.ok(txCalls.every((c) => c.filters.some(([k, v]) => k === "user_id" && v === "u1")), "only the person's own rows are asked for");
  assert.deepEqual(out._unreadable, ["plaid_requests"], "a missing table is named, never exported as empty");
  assert.equal(calls.find((c) => c.table === "brokerage_accounts").cols, DOC.export.find((e) => e.table === "brokerage_accounts").select);
});
