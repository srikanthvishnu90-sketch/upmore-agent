// Paying a bill, decided by code (docs/depth/WORKFLOWS.md): packages/domain/36-agent-workflows.js turns what a person
// or a biller says about a bill into a checked obligation (exact cents, real dates, a real three-letter currency, a safe
// https handoff link) and plans the payment: it stops on a stopped agent, money owed to the person, an unconfirmed or
// disputed bill, missing details, stale data, a payment already applied or in flight, autopay, no verified connection,
// no exact allocation, no owned funding account, stale or short funds, an unknown fee or unknown other bills; only then
// is there a proposal, which lapses in 15 minutes and which a yes approves only exactly as shown. A provider event
// settles it only when it matches and covers the bill. supabase/functions/_shared/workflow_service.ts calls plan() and
// normalize(); the module is in the router bundle (scripts/build-router-core.py) and the financial core. It loads alone.
// One test per sub-capability, tagged so evals/depth/run.cjs can prove its planted defect makes exactly this test fail.
// Bills, accounts, adapters and events are MOCK.
// Check: node --test tests/depth-WORKFLOWS.test.cjs && node evals/depth/run.cjs WORKFLOWS
const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const root = path.resolve(__dirname, "..");
const dir = process.env.UPMORE_DOMAIN_DIR || path.join(root, "packages/domain");
// The edge runtime (Deno) has URL; a bare vm context does not, and safeUrl would refuse every link.
const ctx = vm.createContext({ URL });
vm.runInContext(["36-agent-workflows.js"].map(f => fs.readFileSync(path.join(dir, f), "utf8")).join("\n") + "\nthis.W = AgentWorkflows;", ctx);
const { W } = ctx;
const plain = x => JSON.parse(JSON.stringify(x));

const NOW = "2026-10-12T15:00:00Z";
// A verified MOCK water bill: $45.12 due Oct 20, read from the biller this morning, autopay off.
const BILL = { id: "mock-bill-1", revision: 2, creditor: "City Water (MOCK)", provider_key: "mock-citywater", provider_account_id: "mock-acct-881",
  reference: "mock-inv-2026-10", kind: "utility", amount_due_cents: 4512, currency: "USD", due_on: "2026-10-20", status: "verified", source_type: "biller",
  observed_at: "2026-10-12T09:00:00Z", funding_account_id: "mock-chk", autopay: "off", biller_url: "https://pay.citywater.example/bill?acct=881" };
const ADAPTER = { id: "mock-adapter", verified: true, actions: ["pay_obligation"], providers: ["mock-citywater"], currencies: ["USD"], kinds: ["utility"], idempotent: true, reconciles: true, fee_cents: 150 };
const CHECKING = { id: "mock-chk", currency: "USD", owned: true, payment_enabled: true, available_cents: 250000, observed_at: "2026-10-12T14:55:00Z" };
const CTX = { stopped: false, now: NOW, adapters: [ADAPTER], accounts: [CHECKING], attempts: [], cash_coverage_complete: true, other_obligations_cents: 30000, buffer_cents: 50000 };
const plan = (bill, context) => plain(W.plan(Object.assign({}, BILL, bill), Object.assign({}, CTX, context)));
const what = p => [p.state, p.code, p.message, p.missing];
const withAccount = a => ({ accounts: [Object.assign({}, CHECKING, a)] });
const withAdapter = a => ({ adapters: [Object.assign({}, ADAPTER, a)] });

test("[S01] an amount typed as text becomes exact cents; anything it cannot read exactly is refused, never guessed", () => {
  assert.equal(W.moneyToCents("$45.5"), 4550);
  assert.equal(W.moneyToCents("45.05"), 4505);
  assert.equal(W.moneyToCents(" 0.07 "), 7);
  assert.equal(W.moneyToCents("1200"), 120000);
  for (const v of ["$1,234.56", "12.345", "-5", "", "45.", "1e3", null]) assert.equal(W.moneyToCents(v), null, String(v));
});

test("[S02] a due date is a real calendar day in YYYY-MM-DD; Feb 29 in 2026 and other shapes are invalid", () => {
  assert.equal(W.date("2026-10-12"), "2026-10-12");
  assert.equal(W.date("2028-02-29"), "2028-02-29");
  for (const v of ["2026-02-29", "2026-04-31", "10/12/2026", "2026-10-12T00:00:00Z", "2026-13-01"]) assert.equal(W.date(v), null, v);
  assert.deepEqual(plain(W.normalize({ creditor: "City Water (MOCK)", due_on: "2026-02-29" }).errors), ["invalid_due_date"]);
});

test("[S03] the biller link handed to the person is a plain https page: no http, credentials, ports or private hosts", () => {
  assert.equal(W.safeUrl("https://pay.citywater.example/bill?acct=881"), "https://pay.citywater.example/bill?acct=881");
  for (const v of ["http://pay.citywater.example/bill", "https://user:pw@pay.citywater.example/", "https://pay.citywater.example:8443/", "https://192.168.1.10/pay",
    "https://10.0.0.5/pay", "https://localhost/pay", "https://[::1]/pay", "https://billing.internal/pay", "javascript:alert(1)", "not a url"]) assert.equal(W.safeUrl(v), null, v);
  assert.equal(W.normalize(Object.assign({}, BILL, { biller_url: "http://pay.citywater.example/bill" })).obligation.biller_url, null);
});

test("[S04] the currency is a real three-letter code as written: \"usd\" is USD, but USDC or \"dollars\" is not cut down to one", () => {
  const n = c => plain(W.normalize({ creditor: "City Water (MOCK)", currency: c }));
  assert.deepEqual([n("usd").ok, n("usd").obligation.currency], [true, "USD"]);
  assert.deepEqual([n(undefined).ok, n(undefined).obligation.currency], [true, "USD"]);
  assert.deepEqual(n("EUR").obligation.currency, "EUR");
  for (const c of ["USDC", "USDT", "dollars", "euros", "US$"]) assert.deepEqual(n(c).errors, ["invalid_currency"], c);
  // A stablecoin bill must never become a dollar payment: it stops at normalize, before any plan.
  assert.deepEqual(what(plan({ currency: "USDC" })), ["needs_information", "invalid_obligation", "Some bill details need correcting.", ["invalid_currency"]]);
});

test("[S05] a bill needs a creditor, and every amount is whole non-negative cents; the rest defaults to the cautious value", () => {
  const n = plain(W.normalize({ creditor: "  ", amount_due_cents: -4500, minimum_due_cents: 12.5, balance_cents: "300" }));
  assert.deepEqual(n.errors, ["creditor_required", "invalid_amount", "invalid_minimum", "invalid_balance"]);
  assert.deepEqual(plain(W.normalize({ creditor: "x", status: "paid", direction: "owed", kind: "loan", source_type: "sms" }).errors), ["invalid_kind", "invalid_status", "invalid_direction", "invalid_source"]);
  const o = W.normalize({ creditor: "City Water (MOCK)", autopay: "yes" }).obligation;
  assert.deepEqual([o.status, o.source_type, o.kind, o.direction, o.autopay, o.revision], ["asserted", "user", "other", "payable", "unknown", 1]);
});

test("[S06] a stopped agent, or one whose stop setting could not be read, proposes nothing", () => {
  const stopped = ["blocked", "agent_stopped", "The agent is stopped or its permissions could not be loaded.", []];
  assert.deepEqual(what(plan({}, { stopped: true })), stopped);
  assert.deepEqual(what(plan({}, { stopped: undefined })), stopped);
  assert.deepEqual(what(plan({}, { stopped: null })), stopped);
});

test("[S07] money owed to the person is never turned into an outgoing payment", () => {
  assert.deepEqual(what(plan({ direction: "receivable" })), ["needs_review", "collect_receivable",
    "This is money owed to you. Review a collection or follow-up workflow; it must not become an outgoing payment.", []]);
});

test("[S08] a bill no one has confirmed, or one in dispute, is reviewed before any payment; a partly paid one can proceed", () => {
  assert.deepEqual(what(plan({ status: "asserted" })), ["needs_review", "unverified", "Confirm who this bill belongs to and the current amount before paying.", []]);
  assert.deepEqual(what(plan({ status: "disputed" })), ["needs_review", "disputed", "Review this dispute before making a payment.", []]);
  assert.equal(plan({ status: "partially_paid" }).code, "proposal_ready");
  assert.deepEqual(what(plan({ status: "settled" })), ["resolved", "already_resolved", "This obligation is already resolved.", []]);
});

test("[S09] a missing amount or due date is asked for by name, never assumed", () => {
  const ask = "I need the current amount due and due date.";
  assert.deepEqual(what(plan({ due_on: undefined })), ["needs_information", "missing_bill_details", ask, ["due_on"]]);
  assert.deepEqual(what(plan({ amount_due_cents: null })), ["needs_information", "missing_bill_details", ask, ["amount_due_cents"]]);
  assert.deepEqual(what(plan({ amount_due_cents: null, due_on: null })), ["needs_information", "missing_bill_details", ask, ["amount_due_cents", "due_on"]]);
});

test("[S10] a bill read more than 48 hours ago, or with a sync error, is refreshed before its amount is relied on", () => {
  const stale = ["needs_sync", "stale_obligation", "Refresh the bill before relying on its amount or payment status.", ["fresh_obligation"]];
  assert.equal(plan({ observed_at: "2026-10-10T15:00:00Z" }).code, "proposal_ready", "exactly 48 hours old is still current");
  assert.deepEqual(what(plan({ observed_at: "2026-10-10T14:59:59Z" })), stale);
  assert.deepEqual(what(plan({ evidence: { sync_error: "biller timeout" } })), stale);
  assert.deepEqual(what(plan({ observed_at: "2026-10-12T15:30:00Z" })), stale, "a reading from the future is not current");
  assert.deepEqual(what(plan({ observed_at: undefined })), stale);
});

test("[S11] a $0 balance read from a stale bill is not \"No amount is currently due\"; a fresh $0 is", () => {
  assert.deepEqual(what(plan({ amount_due_cents: 0, observed_at: "2026-10-01T09:00:00Z" })),
    ["needs_sync", "stale_obligation", "Refresh the bill before relying on its amount or payment status.", ["fresh_obligation"]]);
  assert.deepEqual(what(plan({ amount_due_cents: 0 })), ["resolved", "nothing_due", "No amount is currently due.", []]);
});

test("[S12] a payment already applied to this bill stops a second one, even after the bill was revised", () => {
  const applied = [{ obligation_id: "mock-bill-1", obligation_revision: 1, status: "applied" }];
  assert.deepEqual(what(plan({}, { attempts: applied })), ["needs_sync", "applied_payment_reconciliation_required",
    "A payment was applied to this bill. Confirm the remaining debt with the creditor before proposing another payment.", ["creditor_remaining_debt_reconciliation"]]);
  assert.equal(plan({}, { attempts: [{ obligation_id: "mock-bill-other", status: "applied" }] }).code, "proposal_ready", "another bill's payment is not this one");
});

test("[S13] a payment in flight, including one whose result is unknown, is waited on; a failed or returned one is not", () => {
  const wait = ["monitoring", "payment_in_flight", "A payment is already pending. I'll wait for its result before proposing another.", []];
  for (const status of ["reserved", "submitted", "processing", "settled", "unknown"]) assert.deepEqual(what(plan({}, { attempts: [{ obligation_id: "mock-bill-1", status }] })), wait, status);
  for (const status of ["failed", "returned"]) assert.equal(plan({}, { attempts: [{ obligation_id: "mock-bill-1", status }] }).code, "proposal_ready", status);
});

test("[S14] autopay on is watched, not doubled; autopay unknown is asked about", () => {
  assert.deepEqual(what(plan({ autopay: "on" })), ["monitoring", "autopay_active", "Autopay is enabled. Verify its funding and result before considering an additional payment.", []]);
  const ask = ["needs_information", "autopay_unknown", "Check whether autopay or a pending payment already covers this bill.", ["autopay"]];
  assert.deepEqual(what(plan({ autopay: undefined })), ask);
  assert.deepEqual(what(plan({ autopay: "yes" })), ask);
});

test("[S15] only a verified, idempotent, reconciling connection for this biller, currency and kind can pay", () => {
  const none = ["needs_connection", "unsupported_execution", "No verified payment connection covers this bill yet. Its details are saved; use the biller's payment flow or connect a supported method.", ["payment_connector"]];
  for (const a of [{ idempotent: false }, { reconciles: false }, { verified: "true" }, { currencies: ["EUR"] }, { kinds: ["rent"] }, { providers: ["mock-other"] }, { actions: ["read"] }])
    assert.deepEqual(what(plan({}, withAdapter(a))), none, JSON.stringify(a));
  const p = plan({}, withAdapter({ idempotent: false }));
  assert.equal(p.handoff_url, "https://pay.citywater.example/bill?acct=881", "the biller's own page is offered instead");
});

test("[S16] a payment goes to the exact biller account and invoice, or not at all", () => {
  const ask = ["needs_information", "missing_allocation", "Connect the exact biller account and invoice or loan so payment reaches the right obligation.", ["provider_account_id", "reference"]];
  assert.deepEqual(what(plan({ reference: null })), ask);
  assert.deepEqual(what(plan({ provider_account_id: null })), ask);
});

test("[S17] the money comes from the person's own payment-enabled account in the bill's currency, read in the last 15 minutes", () => {
  const missing = ["needs_connection", "funding_missing", "Choose a verified funding account that supports this payment.", ["funding_account"]];
  for (const a of [{ owned: false }, { payment_enabled: false }, { currency: "EUR" }, { id: "mock-other" }]) assert.deepEqual(what(plan({}, withAccount(a))), missing, JSON.stringify(a));
  assert.deepEqual(what(plan({}, withAccount({ observed_at: "2026-10-12T14:44:59Z" }))), ["needs_sync", "stale_funding", "Refresh available funds before approving this payment.", ["fresh_available_balance"]]);
  assert.equal(plan({}, withAccount({ observed_at: "2026-10-12T14:45:00Z" })).code, "proposal_ready");
});

test("[S18] an overdrawn account is short of money, not stale: refreshing would never fix it", () => {
  assert.deepEqual(what(plan({}, withAccount({ available_cents: -5000 }))), ["blocked", "insufficient_funds", "This payment would leave less than your protected cash buffer.", []]);
  assert.deepEqual(what(plan({}, withAccount({ available_cents: null }))), ["needs_sync", "stale_funding", "Refresh available funds before approving this payment.", ["fresh_available_balance"]], "an unknown balance is still refreshed");
  assert.equal(plan({}, withAccount({ available_cents: 1.5 })).code, "stale_funding", "a balance that is not whole cents is not read");
});

test("[S19] the protected buffer counts the fee and the other bills, to the cent", () => {
  // $45.12 bill + $1.50 fee + $300.00 other bills + $500.00 buffer = $846.62.
  assert.equal(plan({}, withAccount({ available_cents: 84662 })).code, "proposal_ready", "leaves exactly the buffer");
  assert.deepEqual(what(plan({}, withAccount({ available_cents: 84661 }))), ["blocked", "insufficient_funds", "This payment would leave less than your protected cash buffer.", []]);
});

test("[S20] an unknown fee, unknown other bills or an unknown buffer is asked about, never taken as zero", () => {
  assert.deepEqual(what(plan({}, withAdapter({ fee_cents: undefined }))), ["needs_information", "fee_unknown", "The payment fee needs a verified quote.", ["fee_cents"]]);
  const cover = ["needs_information", "cash_coverage_unknown", "Confirm the other obligations and cash buffer used in this payment's affordability check.", ["cash_coverage"]];
  assert.deepEqual(what(plan({}, { cash_coverage_complete: undefined })), cover);
  assert.deepEqual(what(plan({}, { other_obligations_cents: null })), cover);
  assert.deepEqual(what(plan({}, { buffer_cents: undefined })), cover);
});

test("[S21] the proposal is exactly what would be paid, from where, for what fee, and it lapses in 15 minutes", () => {
  const p = plan({});
  assert.deepEqual(what(p), ["awaiting_approval", "proposal_ready", "Review this payment. Nothing has been submitted.", []]);
  assert.deepEqual(p.proposal, { version: 1, obligation_id: "mock-bill-1", obligation_revision: 2, action: "pay_obligation", creditor: "City Water (MOCK)",
    provider_key: "mock-citywater", provider_account_id: "mock-acct-881", reference: "mock-inv-2026-10", amount_cents: 4512, currency: "USD", due_on: "2026-10-20",
    funding_account_id: "mock-chk", adapter_id: "mock-adapter", fee_cents: 150, expires_at: "2026-10-12T15:15:00.000Z" });
  assert.deepEqual(p.steps.map(s => s.action + ":" + s.state), ["verify_obligation:done", "check_existing_payment:done", "check_funds:done", "obtain_authorization:pending", "submit_payment:pending", "verify_application:pending"]);
});

test("[S22] a yes approves only the exact proposal it was shown, before the proposal lapses", () => {
  const proposal = plan({}).proposal;
  const yes = { approved_at: "2026-10-12T15:01:00Z", snapshot: proposal };
  assert.equal(W.validateConsent(proposal, yes, "2026-10-12T15:02:00Z"), true);
  assert.equal(W.validateConsent(proposal, { approved_at: yes.approved_at, snapshot: Object.assign({}, proposal, { amount_cents: 45120 }) }, "2026-10-12T15:02:00Z"), false, "a different amount");
  assert.equal(W.validateConsent(proposal, { approved_at: yes.approved_at, snapshot: Object.assign({}, proposal, { funding_account_id: "mock-savings" }) }, "2026-10-12T15:02:00Z"), false, "a different account");
  assert.equal(W.validateConsent(proposal, yes, "2026-10-12T15:15:00Z"), false, "at the lapse instant");
  assert.equal(W.validateConsent(proposal, yes, "2026-10-12T15:00:30Z"), false, "approved after now");
  assert.equal(W.validateConsent(proposal, Object.assign({ revoked_at: "2026-10-12T15:01:30Z" }, yes), "2026-10-12T15:02:00Z"), false, "revoked");
});

test("[S23] a bill is settled only by a provider event that matches the payment and covers the amount due", () => {
  const bill = W.normalize(BILL).obligation;
  const attempt = { provider_payment_id: "mock-pay-1", amount_cents: 4512 };
  const event = { provider_event_id: "mock-evt-1", provider_payment_id: "mock-pay-1", reference: "mock-inv-2026-10", currency: "USD", amount_cents: 4512, status: "applied" };
  assert.deepEqual(plain(W.outcome(event, bill, attempt)), { ok: true, attempt_status: "applied", resolved: true });
  assert.deepEqual(plain(W.outcome(Object.assign({}, event, { amount_cents: 2000 }), bill, { provider_payment_id: "mock-pay-1", amount_cents: 2000 })), { ok: true, attempt_status: "applied", resolved: false }, "$20.00 of $45.12");
  assert.deepEqual(plain(W.outcome(Object.assign({}, event, { status: "returned" }), bill, attempt)), { ok: true, attempt_status: "returned", resolved: false });
  assert.deepEqual(plain(W.outcome(Object.assign({}, event, { status: "refunded" }), bill, attempt)), { ok: false, reason: "unknown_status" });
});

test("[S24] an event for another invoice, payment, currency or amount changes nothing", () => {
  const bill = W.normalize(BILL).obligation;
  const attempt = { provider_payment_id: "mock-pay-1", amount_cents: 4512 };
  const event = { provider_event_id: "mock-evt-1", provider_payment_id: "mock-pay-1", reference: "mock-inv-2026-10", currency: "USD", amount_cents: 4512, status: "applied" };
  for (const change of [{ reference: "mock-inv-2026-09" }, { provider_payment_id: "mock-pay-2" }, { currency: "CAD" }, { amount_cents: 4513 }, { provider_event_id: "" }])
    assert.deepEqual(plain(W.outcome(Object.assign({}, event, change), bill, attempt)), { ok: false, reason: "unmatched_event" }, JSON.stringify(change));
});

test("[ADV] hostile input: a forged consent, a negative fee, a huge amount and a stale yes never yield a payment", () => {
  const proposal = plan({}).proposal;
  assert.equal(W.validateConsent(proposal, { approved_at: "2026-10-12T15:01:00Z", snapshot: JSON.parse(JSON.stringify(proposal)) }, "2026-10-12T15:02:00Z"), true, "key order never matters");
  assert.equal(W.validateConsent(proposal, { approved_at: "not a time", snapshot: proposal }, "2026-10-12T15:02:00Z"), false);
  assert.equal(W.validateConsent(null, { approved_at: "2026-10-12T15:01:00Z", snapshot: null }, "2026-10-12T15:02:00Z"), false);
  assert.equal(plan({}, withAdapter({ fee_cents: -150 })).code, "fee_unknown", "a negative fee would raise the balance");
  assert.equal(W.moneyToCents("90071992547409.92"), null, "past the safe integer range");
  assert.equal(plan({ amount_due_cents: 2 ** 53 }).code, "invalid_obligation");
});
