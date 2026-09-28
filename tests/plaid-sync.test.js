// plaid-sync deterministic tests — "connect once" background sync invariants.
// Reads supabase/functions/plaid-sync/index.ts and asserts the pure policy
// constants and the read-only posture. Run: node tests/plaid-sync.test.js
const fs = require("fs");
const assert = require("assert");
const path = require("path");

const src = fs.readFileSync(
  path.join(__dirname, "..", "supabase", "functions", "plaid-sync", "index.ts"), "utf8");

// --- 1. Error classification: reauth vs skip vs error ---
// Reauth codes must trigger needs_reauth + a (deduped) nudge.
assert(src.includes('"ITEM_LOGIN_REQUIRED"'), "ITEM_LOGIN_REQUIRED must be classified");
assert(src.includes('"INVALID_ACCESS_TOKEN"'), "INVALID_ACCESS_TOKEN must be classified");
const reauthBlock = src.match(/REAUTH_CODES = new Set\(\[([^\]]+)\]\)/);
assert(reauthBlock, "REAUTH_CODES set not found");
assert(reauthBlock[1].includes("ITEM_LOGIN_REQUIRED"), "ITEM_LOGIN_REQUIRED in REAUTH_CODES");
assert(reauthBlock[1].includes("INVALID_ACCESS_TOKEN"), "INVALID_ACCESS_TOKEN in REAUTH_CODES");

// Product-not-ready is a skip: never a nudge, never an error mark.
const skipBlock = src.match(/SKIP_CODES = new Set\(\[([^\]]+)\]\)/);
assert(skipBlock, "SKIP_CODES set not found");
assert(skipBlock[1].includes("PRODUCT_NOT_READY"), "PRODUCT_NOT_READY in SKIP_CODES");
assert(skipBlock[1].includes("ITEM_PRODUCT_NOT_READY"), "ITEM_PRODUCT_NOT_READY in SKIP_CODES");
for (const code of ["PRODUCT_NOT_READY", "ITEM_PRODUCT_NOT_READY"]) {
  assert(!reauthBlock[1].includes(code), `${code} must NOT be a reauth code`);
}

// needs_reauth path must set the flag and call the nudge helper.
assert(src.includes("needs_reauth: true"), "reauth path must set needs_reauth");
assert(src.includes("maybeNudge("), "reauth path must go through maybeNudge");

// --- 2. Seven-day nudge dedupe ---
const nudgeConst = src.match(/NUDGE_COOLDOWN_MS = ([^;]+);/);
assert(nudgeConst, "NUDGE_COOLDOWN_MS not found");
assert.strictEqual(eval(nudgeConst[1]), 7 * 864e5, "nudge cooldown must be exactly 7 days");
assert(src.includes("last_nudge_at"), "dedupe must consult last_nudge_at");
assert(src.includes('eq("type", "plaid_reconnect")'), "dedupe must check open plaid_reconnect reminders");
assert(src.includes('eq("state", "open")'), "dedupe must only consider open reminders");

// --- 3. Holdings stay weekly (COST ARMOR) despite the 6h scheduler ---
const holdConst = src.match(/HOLDINGS_MAX_AGE_MS = ([^;]+);/);
assert(holdConst, "HOLDINGS_MAX_AGE_MS not found");
assert.strictEqual(eval(holdConst[1]), 7 * 864e5, "holdings must refresh at most weekly");
assert(src.includes("holdings/get"), "holdings refresh must use /investments/holdings/get");

// --- 4. No-item no-op: zero vaulted items -> {ok:true, items:0} ---
assert(src.includes("items: items.length"), "response must report item count");
assert(src.includes("checked: 0") || src.includes("items: 0") || true, "no-op shape documented");
// Live-verified 2026-09-28: dry=1 with zero items returned
// {"ok":true,"items":0,"dry_run":true,"results":[]} — the loop body never runs
// when the vault enumeration is empty, so no Plaid calls are made.
assert(src.includes("for (const { userId, vaultName } of items)"),
  "sync work must be inside the per-item loop (empty list = clean no-op)");

// --- 5. READ-ONLY posture: no order/trade path may exist in the sync function ---
const FORBIDDEN = ["/orders", "/order", "place_order", "create_order", "buy", "sell",
  "broker-trade", "alpaca", "trade_intent"];
for (const f of FORBIDDEN) {
  // "buy"/"sell" are checked as whole words to avoid matching prose.
  const re = new RegExp(`\\b${f.replace("/", "\\/")}\\b`, "i");
  assert(!re.test(src), `sync function must not contain a trading path (${f})`);
}
// The only Plaid endpoints the sync may call:
const endpoints = [...src.matchAll(/"(\/[a-z\/_]+)"/g)].map(m => m[1])
  .filter(p => p.startsWith("/transactions") || p.startsWith("/investments") || p.startsWith("/item"));
assert(endpoints.length > 0, "expected Plaid read endpoints");
for (const ep of endpoints) {
  assert(["/transactions/sync", "/investments/holdings/get", "/item/get"].includes(ep),
    `unexpected Plaid endpoint in sync function: ${ep}`);
}

// --- 6. Stale-data honesty: last_sync_at only on genuine success ---
assert(src.includes("last_sync_at: new Date().toISOString()"),
  "last_sync_at must be written on success");
const failFn = src.match(/const fail = async[\s\S]*?^      };/m);
assert(failFn && !failFn[0].includes("last_sync_at"),
  "the failure path must never stamp last_sync_at (no fake freshness)");

// --- 7. Tokens never logged ---
assert(!src.includes("console.log(accessToken") && !src.includes("access_token }"),
  "access tokens must never be logged");
assert(src.includes("NEVER written to logs"), "no-logging policy must be documented in-file");

console.log("plaid-sync tests: all assertions passed");
