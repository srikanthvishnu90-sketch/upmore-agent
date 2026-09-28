// Execution trust primitives — dry/static tests (2026-09-28).
// Tests the pure logic: tripwire patterns, category exclusion, txn matching.
// These mirror the server implementations; they run without network/auth.
"use strict";

let passed = 0, failed = 0;
function ok(cond, name) {
  if (cond) { passed++; }
  else { failed++; console.error("FAIL:", name); }
}

// ---- Tripwire patterns (mirror agent-exec runDeclarative) ----
const TRIPWIRES = [
  { kind: "account_creation", patterns: [
    /create (your|an|a) account/i, /sign up for/i, /register (your|an|a) account/i,
    /set up (your|an) account/i, /create a password/i, /choose a password/i ] },
  { kind: "terms_acceptance", patterns: [
    /i agree to (the )?terms/i, /accept (the )?(terms|privacy)/i,
    /agree to (the )?(terms of (service|use)|privacy policy)/i,
    /by continuing,? you agree/i, /acknowledge (the )?(terms|privacy)/i ] },
  { kind: "payment_details", patterns: [
    /add (a |your )?card/i, /enter (your )?payment/i, /billing details/i,
    /card number/i, /payment method/i, /update (your )?billing/i,
    /enter (your )?credit card/i ] },
  { kind: "consent", patterns: [
    /consent to/i, /give (us )?permission/i, /authorize (us )?to/i,
    /opt.?in to (marketing|data|tracking)/i, /grant access to/i ] },
  { kind: "plan_change", patterns: [
    /switch (your )?plan/i, /change (your )?plan/i, /downgrade/i,
    /choose (a |your )?(new )?plan/i, /pick (a |your )?plan/i,
    /special offer/i, /stay (for|with)/i, /we'll (give|offer)/i ] },
];
function tripwireScan(text) {
  if (/sign ?in|log ?in/i.test(text) && /password/i.test(text) &&
      !/create (your|an) account|sign up/i.test(text)) return null;
  for (const t of TRIPWIRES)
    for (const re of t.patterns)
      if (re.test(text)) return t.kind;
  return null;
}

ok(tripwireScan("Create your account to continue") === "account_creation", "tripwire: account creation");
ok(tripwireScan("I agree to the Terms of Service") === "terms_acceptance", "tripwire: terms");
ok(tripwireScan("Add a card to keep your membership") === "payment_details", "tripwire: payment");
ok(tripwireScan("Please consent to data sharing") === "consent", "tripwire: consent");
ok(tripwireScan("Switch your plan and save 20%") === "plan_change", "tripwire: plan change");
ok(tripwireScan("Sign in\nEmail\nPassword\nSign in") === null, "tripwire: login page skipped");
ok(tripwireScan("Cancel subscription\nAre you sure?\nYes, cancel") === null, "tripwire: clean cancel page passes");
ok(tripwireScan("Downgrade to Basic instead?") === "plan_change", "tripwire: downgrade offer");

// ---- Category exclusion (mirror agent-exec checkExcludedCategory) ----
const EXCLUDED_PATTERNS = [
  { category: "insurance", re: /insurance|geico|progressive|state farm|allstate|usaa|liberty mutual|farmers ins|nationwide|travelers/i },
  { category: "utility", re: /comed|con ?ed|pseg|duke energy|pacific gas|pg&e|national grid|southern california edison|florida power|xcel|dte energy|ameranill|water|electric|gas company|power company/i },
  { category: "contract", re: /early termination|termination fee|etf|contract/i },
];
function checkExcludedCategory(merchantKey, merchantName, approval) {
  const hay = `${merchantKey} ${merchantName}`;
  for (const { category, re } of EXCLUDED_PATTERNS)
    if (re.test(hay)) return category;
  const ctx = approval.approval_context || {};
  if (ctx.has_early_termination_fee) return "contract (early termination fee)";
  if (ctx.user_marked_keep) return "marked keep by you";
  if (ctx.user_marked_shared) return "marked shared by you";
  return null;
}

ok(checkExcludedCategory("geico", "GEICO Insurance", {}) === "insurance", "exclusion: insurance");
ok(checkExcludedCategory("comed", "ComEd", {}) === "utility", "exclusion: utility");
ok(checkExcludedCategory("spotify", "Spotify", {}) === null, "exclusion: spotify clear");
ok(checkExcludedCategory("x", "X", { approval_context: { has_early_termination_fee: true } }) !== null, "exclusion: ETF via context");
ok(checkExcludedCategory("x", "X", { approval_context: { user_marked_keep: true } }) !== null, "exclusion: keep via context");
ok(checkExcludedCategory("x", "X", { approval_context: { user_marked_shared: true } }) !== null, "exclusion: shared via context");

// ---- Transaction matching (mirror cancel-watcher txnMatchesMerchant) ----
function normalizeMerchant(s) {
  return (s || "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim().replace(/\s+/g, " ");
}
function txnMatchesMerchant(txnDesc, merchantKey, merchantName) {
  const d = normalizeMerchant(txnDesc);
  const k = normalizeMerchant(merchantKey);
  const n = normalizeMerchant(merchantName);
  if (!d || (!k && !n)) return false;
  const tokens = (k || n).split(" ").filter((t) => t.length > 2);
  if (!tokens.length) return false;
  return tokens.some((t) => d.includes(t)) && d.includes(tokens[0]);
}

ok(txnMatchesMerchant("SPOTIFY USA 800-123-4567", "spotify", "Spotify") === true, "match: spotify descriptor");
ok(txnMatchesMerchant("AMZN MKTP US*2R38D1", "amazon", "Amazon") === false, "match: amazon not spotify");
ok(txnMatchesMerchant("NETFLIX.COM 866-579-7172", "netflix", "Netflix") === true, "match: netflix");
ok(txnMatchesMerchant("WHOLE FOODS MARKET", "spotify", "Spotify") === false, "match: unrelated");

// ---- OTP TTL logic ----
const TTL_MS = 30 * 60 * 1000;
function otpExpired(expiresAt, now) {
  return new Date(expiresAt).getTime() < now;
}
const now = Date.now();
ok(otpExpired(new Date(now - 1000).toISOString(), now) === true, "otp: expired in past");
ok(otpExpired(new Date(now + TTL_MS).toISOString(), now) === false, "otp: fresh not expired");
ok(otpExpired(new Date(now + 1000).toISOString(), now + TTL_MS + 2000) === true, "otp: expires after 30m");

// ---- Approval context completeness ----
function contextComplete(ctx) {
  const required = ["merchant_name", "amount", "billing_interval", "reversibility",
    "agent_mechanics", "agent_will_not", "failure_path", "twelve_month_projection"];
  return required.filter((k) => ctx[k] == null || ctx[k] === "");
}
const goodCtx = {
  merchant_name: "Spotify", amount: 10.99, billing_interval: "monthly",
  reversibility: "x", agent_mechanics: "x", agent_will_not: "x",
  failure_path: "x", twelve_month_projection: "About $131.88 a year — that's a projection, not a promise.",
};
ok(contextComplete(goodCtx).length === 0, "context: complete passes");
ok(contextComplete({}).length === 8, "context: empty fails all");
ok(contextComplete({ ...goodCtx, twelve_month_projection: null }).length === 1, "context: missing projection flagged");

console.log(`\nexecution-trust: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
