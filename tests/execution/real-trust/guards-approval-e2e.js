// Fixture 4 — approval E2E: request -> approve -> execute -> ledger.
//
// Drives the REAL shared production functions
// (supabase/functions/agent-exec/execution-guards.ts):
//   - missingApprovalContext  (informed-consent completeness)
//   - decideExecuteGate       (the execute-path gate, in order)
//   - runDeclarative          (the real step loop + stop-guard)
//   - buildCancelClaimRow     (the cancel-claim computation)
//
// The FakeDb below models the row lifecycle the deployed executor performs
// (exec_approvals / exec_runs / cancel_claims / subscriptions) and enforces
// the same transition rules the SQL does (status-gated updates: the atomic
// approved -> executing claim has exactly one winner; a done approval never
// executes again). It makes NO guard decisions — every decision comes from
// the shared functions. Proves a complete approval runs exactly once,
// reaches the done/cancel-claimed lifecycle, and writes the expected
// audit/ledger records through the shared production orchestration.

import {
  buildCancelClaimRow,
  decideExecuteGate,
  missingApprovalContext,
  runDeclarative,
} from "../../../supabase/functions/agent-exec/execution-guards.ts";
import { FakePage } from "./fake-page.js";
import { check, section } from "./assert.js";

const USER = "user-1";

// The exact disclosure keys the client renders on the approval screen.
function fullContext(over = {}) {
  return {
    merchant_name: "Spotify",
    merchant_key: "spotify",
    plan_name: "Premium Individual",
    amount: 11.99,
    billing_interval: "monthly",
    next_billing_date: "2026-10-15",
    subscription_id: "sub-1",
    twelve_month_projection: "About $143.88 a year — that's a projection, not a promise.",
    reversibility: "You keep access until the end of the current billing period. You can re-subscribe anytime from the merchant's site.",
    retention_known: null,
    agent_mechanics: "The agent signs in to your account as you, using the login you saved in your Upmore vault.",
    agent_will_not: "The agent will not change your plan, add or change payment methods, accept offers or terms, or touch anything except the cancellation.",
    failure_path: "If it can't complete, nothing is changed — you'll get the direct link and steps to do it yourself.",
    shown_at: new Date().toISOString(),
    ...over,
  };
}

class FakeDb {
  constructor() {
    this.approvals = new Map();
    this.runs = new Map();
    this.claims = [];
    this.subscriptions = new Map();
    this.n = 1;
  }

  // request: user asks to cancel -> pending approval row
  requestApproval({ merchant, merchant_key }) {
    const id = `appr-${this.n++}`;
    this.approvals.set(id, {
      id, user_id: USER, merchant, merchant_key,
      action: "cancel_subscription", status: "pending", approval_context: null,
    });
    return id;
  }

  // approve: user taps approve on the disclosure screen. The context must be
  // COMPLETE per the real missingApprovalContext — otherwise no approval.
  approve(id, context) {
    const a = this.approvals.get(id);
    const missing = missingApprovalContext(context);
    if (missing.length) throw new Error(`incomplete approval_context: ${missing.join(",")}`);
    a.status = "approved";
    a.approval_context = context;
    return a;
  }

  doneRunExists(approvalId) {
    return [...this.runs.values()].some((r) => r.approval_id === approvalId && r.status === "done");
  }

  // execute: the real gate decides; the atomic claim (approved -> executing)
  // has exactly one winner, like the deployed UPDATE ... WHERE status='approved'.
  execute(id, userId) {
    const a = this.approvals.get(id);
    const gate = decideExecuteGate(a || null, {
      callerOwns: !!a && a.user_id === userId,
      doneRunExists: this.doneRunExists(id),
    });
    if (!gate.proceed) return { refused: gate.reason, status: gate.status };
    if (a.status !== "approved") return { refused: "claim_race", status: 409 };
    a.status = "executing";
    const runId = `run-${this.n++}`;
    const run = {
      id: runId, approval_id: id, user_id: userId, status: "started",
      evidence: {}, error: null, finished_at: null,
    };
    this.runs.set(runId, run);
    return { run };
  }

  // finish: terminal outcome -> ledger writes. A real cancel_claims row is
  // computed by the shared buildCancelClaimRow; "done" never means the
  // merchant confirmed — it means CLAIMED (subscription -> cancel_claimed).
  finishRun(runId, outcome, ev, merchantKey) {
    const run = this.runs.get(runId);
    const a = this.approvals.get(run.approval_id);
    if (outcome.ok) {
      run.status = "done";
      run.evidence = ev;
      run.finished_at = new Date().toISOString();
      const claim = buildCancelClaimRow(a, USER, runId, merchantKey);
      this.claims.push(claim);
      this.subscriptions.set(merchantKey, { merchant_key: merchantKey, status: "cancel_claimed" });
      a.status = "done";
    } else {
      run.status = "failed";
      run.error = outcome.error;
      run.evidence = ev;
      run.finished_at = new Date().toISOString();
      a.status = "approved"; // guided refusals are not terminal: claim reverts
    }
    return run;
  }
}

const SPOTIFY_PB = {
  display_name: "Spotify",
  steps: [
    { kind: "goto", url: "https://www.spotify.com/account/subscription/" },
    { kind: "clickText", pattern: "Cancel Premium" },
    { kind: "clickText", pattern: "Continue to cancel" },
    { kind: "clickDialogButton", pattern: "Yes, cancel" },
    { kind: "requireText", patterns: ["cancellation is confirmed", "subscription.*cancelled"] },
    { kind: "screenshot", label: "confirmation" },
  ],
};

export async function run() {
  section("approval e2e: request -> approve -> execute -> ledger");

  const db = new FakeDb();

  // --- 1. request ---
  const approvalId = db.requestApproval({ merchant: "Spotify", merchant_key: "spotify" });
  check("request creates a pending approval", db.approvals.get(approvalId).status === "pending");

  // --- 2a. incomplete consent is refused before an approval exists ---
  {
    let threw = "";
    try {
      db.approve(approvalId, fullContext({ reversibility: "" }));
    } catch (e) { threw = e.message; }
    check(
      "approval with a blank disclosure field is refused",
      /incomplete approval_context/.test(threw) && /reversibility/.test(threw),
      threw,
    );
    check("approval still pending after refused consent", db.approvals.get(approvalId).status === "pending");
  }

  // --- 2b. approve with the complete disclosure record ---
  const ctx = fullContext();
  check("complete context has zero missing keys", missingApprovalContext(ctx).length === 0);
  db.approve(approvalId, ctx);
  check("approve moves pending -> approved", db.approvals.get(approvalId).status === "approved");

  // --- 3. execute: gate passes, atomic claim won exactly once ---
  const first = db.execute(approvalId, USER);
  check("execute passes the real gate", !!first.run, JSON.stringify(first));
  check("claim flips approved -> executing", db.approvals.get(approvalId).status === "executing");
  const second = db.execute(approvalId, USER);
  check(
    "a second execute cannot claim again (atomic claim, one winner)",
    second.refused === "not_approved" && second.status === 409,
    JSON.stringify(second),
  );
  check("exactly one exec_runs row exists", db.runs.size === 1);

  // --- 4. the run: real declarative loop against the fake page ---
  const runId = first.run.id;
  const page = new FakePage({
    texts: [
      "Spotify — Subscription overview.",
      "Spotify — Subscription overview.",
      "Cancel Premium.",
      "Continue to cancel.",
      "Are you sure? Yes, cancel.",
      "Your cancellation is confirmed. Premium ends 2026-10-15.",
    ],
  });
  const ev = {};
  const outcome = await runDeclarative({ username: "u", password: "p" }, page, SPOTIFY_PB, ev, 0, null);
  check("real step loop completes the playbook", outcome.ok === true, JSON.stringify(outcome));
  db.finishRun(runId, outcome, ev, "spotify");

  // --- 5. ledger: the audit trail a done run must leave ---
  {
    const run = db.runs.get(runId);
    check("run reaches terminal done", run.status === "done", run.status);
    check("run evidence carries the confirmation", typeof run.evidence.confirmation_text === "string");
    check("approval reaches done", db.approvals.get(approvalId).status === "done");
    check("exactly one cancel_claims row", db.claims.length === 1, String(db.claims.length));
    const claim = db.claims[0];
    check("claim row is open + keyed to the merchant", claim.status === "open" && claim.merchant_key === "spotify", JSON.stringify(claim));
    check("claim carries the expected billing date", claim.expected_billing_date === "2026-10-15", claim.expected_billing_date);
    check("claim has a grace window", claim.grace_days === 2, String(claim.grace_days));
    check("claim links run + approval", claim.run_id === runId && claim.approval_id === approvalId);
    check(
      "subscription ledger reads cancel_claimed (a claim, not a confirmed cancel)",
      db.subscriptions.get("spotify").status === "cancel_claimed",
    );
  }

  // --- 6. retry scoping: a done approval can NEVER execute again ---
  {
    const retry = db.execute(approvalId, USER);
    check(
      "re-executing a completed approval is refused",
      retry.status === 409 && (retry.refused === "not_approved" || retry.refused === "already_completed"),
      JSON.stringify(retry),
    );
    check("no second run row was created", db.runs.size === 1, String(db.runs.size));

    // Defensive path the gate exists for: approval back at "approved" (as a
    // guided refusal would leave it) while a terminal done run exists — the
    // done-run guard must still refuse, independent of the status check.
    db.approvals.get(approvalId).status = "approved";
    const sneak = db.execute(approvalId, USER);
    check(
      "done-run guard refuses even when status reads approved",
      sneak.refused === "already_completed" && sneak.status === 409,
      JSON.stringify(sneak),
    );
    check("still exactly one run row", db.runs.size === 1, String(db.runs.size));
  }

  // --- 7. claim-row fallback: no next_billing_date -> interval arithmetic ---
  {
    const appr = { id: "a2", merchant: "Spotify", merchant_key: "spotify", amount: 11.99, billing_interval: "monthly", approval_context: fullContext({ next_billing_date: null }) };
    const row = buildCancelClaimRow(appr, USER, "run-x", "spotify", Date.UTC(2026, 8, 28));
    const expect = new Date(Date.UTC(2026, 8, 28) + 30 * 864e5).toISOString().slice(0, 10);
    check("monthly fallback = pause date + 30d", row.expected_billing_date === expect, `${row.expected_billing_date} vs ${expect}`);
  }
}
