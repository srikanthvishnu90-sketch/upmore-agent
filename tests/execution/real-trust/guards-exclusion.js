// Fixture 3 — category exclusion.
//
// Exercises the REAL checkExcludedCategory + decideExecuteGate from the
// shared production module (supabase/functions/agent-exec/execution-guards.ts
// — the same functions the deployed agent-exec calls before the atomic
// approval claim).
//
// The ExecutorPipeline below models the deployed execute path's ORDER:
// gate -> atomic claim -> vaulted credential lookup -> Browserbase session.
// The gate DECISION is the real shared function; the pipeline only records
// which side effects were reached. Proves excluded merchants/categories are
// rejected server-side even if the client requests them — they never reach
// the claim, the vault, or the browser.

import {
  checkExcludedCategory,
  decideExecuteGate,
  EXCLUDED_PATTERNS,
} from "../../../supabase/functions/agent-exec/execution-guards.ts";
import { check, section } from "./assert.js";

// Complete informed-consent record (the exact keys the client shows).
function fullContext(over = {}) {
  return {
    merchant_name: "Test Merchant",
    amount: 9.99,
    billing_interval: "monthly",
    twelve_month_projection: "About $119.88 a year — that's a projection, not a promise.",
    reversibility: "You keep access until the end of the current billing period.",
    agent_mechanics: "The agent signs in to your account as you.",
    agent_will_not: "The agent will not change your plan or touch payment methods.",
    failure_path: "If it can't complete, nothing is changed.",
    ...over,
  };
}

function approval(over = {}) {
  return {
    id: "appr-1",
    user_id: "user-1",
    merchant: "Test Merchant",
    merchant_key: "test",
    action: "cancel_subscription",
    status: "approved",
    approval_context: fullContext(),
    ...over,
  };
}

// Models the deployed execute order. Gate decision = real shared function.
class ExecutorPipeline {
  constructor() {
    this.claims = 0;
    this.vaultReads = 0;
    this.browserSessions = 0;
  }
  async execute(appr, userId) {
    const gate = decideExecuteGate(appr, {
      callerOwns: !!appr && appr.user_id === userId,
      doneRunExists: false,
    });
    if (!gate.proceed) return { refused: gate.reason, status: gate.status, note: gate.note };
    this.claims++; // atomic approved -> executing claim
    this.vaultReads++; // vaulted merchant credential lookup
    this.browserSessions++; // Browserbase session creation
    return { proceeded: true };
  }
}

export async function run() {
  section("category exclusion: rejected server-side before any side effect");

  const cats = EXCLUDED_PATTERNS.map((p) => p.category).sort();
  check(
    "production exclusion patterns cover insurance + utility",
    cats.includes("insurance") && cats.includes("utility"),
    JSON.stringify(cats),
  );

  const cases = [
    {
      name: "GEICO (insurance) refused",
      appr: approval({ merchant: "GEICO", merchant_key: "geico" }),
      expectNote: /insurance/,
    },
    {
      name: "utility (Con Edison) refused",
      appr: approval({ merchant: "Con Edison", merchant_key: "coned" }),
      expectNote: /utilit/,
    },
    {
      name: "early-termination-fee contract refused",
      appr: approval({
        merchant: "GymCo", merchant_key: "gymco",
        approval_context: fullContext({ has_early_termination_fee: true }),
      }),
      expectNote: /early termination fee/i,
    },
    {
      name: "user-marked keep refused",
      appr: approval({
        merchant: "Spotify", merchant_key: "spotify",
        approval_context: fullContext({ user_marked_keep: true }),
      }),
      expectNote: /marked keep/i,
    },
    {
      name: "shared subscription refused",
      appr: approval({
        merchant: "Hulu", merchant_key: "hulu",
        approval_context: fullContext({ user_marked_shared: true }),
      }),
      expectNote: /marked shared/i,
    },
  ];

  for (const c of cases) {
    const pipe = new ExecutorPipeline();
    const res = await pipe.execute(c.appr, "user-1");
    check(`${c.name}: refused at the gate`, res.refused === "excluded_category", JSON.stringify(res));
    check(`${c.name}: HTTP 400`, res.status === 400, String(res.status));
    check(`${c.name}: note names the category`, c.expectNote.test(res.note || ""), res.note);
    check(`${c.name}: atomic claim NEVER reached`, pipe.claims === 0, String(pipe.claims));
    check(`${c.name}: vaulted credentials NEVER read`, pipe.vaultReads === 0, String(pipe.vaultReads));
    check(`${c.name}: Browserbase session NEVER created`, pipe.browserSessions === 0, String(pipe.browserSessions));
  }

  // --- Regression guard (fixed 2026-09-28): the contract "etf" alternative
  // used to match INSIDE "netflix". Now \betf\b — Netflix is cancellable,
  // while a standalone ETF still refuses.
  {
    const r = checkExcludedCategory("netflix", "netflix", {});
    check('regression: "netflix" is NOT excluded as a contract', r === null, r);
    const r2 = checkExcludedCategory("someetf", "Early Termination Fee", {});
    check('regression: standalone "etf" still excluded as contract', r2 === "contract", r2);
  }

  // --- Control: an ordinary merchant passes the gate and proceeds ---
  {
    const pipe = new ExecutorPipeline();
    const res = await pipe.execute(approval({ merchant: "Spotify", merchant_key: "spotify" }), "user-1");
    check("ordinary merchant proceeds past the gate", res.proceeded === true, JSON.stringify(res));
    check("ordinary merchant reaches claim + vault + browser", pipe.claims === 1 && pipe.vaultReads === 1 && pipe.browserSessions === 1);
  }

  // --- checkExcludedCategory directly: the pure predicate ---
  {
    check("direct: geico -> insurance", checkExcludedCategory("geico", "geico", {}) === "insurance");
    check("direct: coned -> utility", checkExcludedCategory("coned", "con edison", {}) === "utility");
    check("direct: spotify clean -> null", checkExcludedCategory("spotify", "spotify", {}) === null);
    check(
      "direct: keep flag -> \"marked keep by you\"",
      checkExcludedCategory("spotify", "spotify", { approval_context: { user_marked_keep: true } }) === "marked keep by you",
    );
    check(
      "direct: shared flag -> \"marked shared by you\"",
      checkExcludedCategory("spotify", "spotify", { approval_context: { user_marked_shared: true } }) === "marked shared by you",
    );
    check(
      "direct: ETF flag -> \"contract (early termination fee)\"",
      checkExcludedCategory("gymco", "gymco", { approval_context: { has_early_termination_fee: true } }) === "contract (early termination fee)",
    );
  }
}
