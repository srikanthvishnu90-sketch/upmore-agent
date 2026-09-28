// Fixture 1 — stop-guard integration.
//
// Drives the REAL runDeclarative (imported from the shared production
// module supabase/functions/agent-exec/execution-guards.ts — the same
// function the deployed agent-exec calls) against a FakePage whose visible
// text changes mid-run. Proves an in-flight declarative execution HALTS
// when a tripwire appears: the next browser action never runs, evidence is
// recorded, and the run fails terminally.

import {
  runDeclarative,
  scanTripwiresText,
  TRIPWIRES,
} from "../../../supabase/functions/agent-exec/execution-guards.ts";
import { FakePage } from "./fake-page.js";
import { check, section } from "./assert.js";

const PB = {
  display_name: "Acme Music",
  steps: [
    { kind: "clickText", pattern: "Manage plan" },
    { kind: "clickText", pattern: "Cancel subscription" },
    { kind: "clickText", pattern: "Confirm cancellation" },
  ],
};
const CTX = { username: "user", password: "pass" };

export async function run() {
  section("stop-guard: tripwire mid-run halts the execution");

  // --- Scenario A: terms tripwire appears before step 1 ---
  {
    const page = new FakePage({
      texts: [
        "Acme Music — account overview. Manage plan.", // scan before step 0
        "Before you go: I agree to the terms of service. [Continue]", // scan before step 1
      ],
    });
    const ev = {};
    const out = await runDeclarative(CTX, page, PB, ev, 0, null);

    check("run fails (ok:false) on tripwire", out.ok === false, JSON.stringify(out));
    check(
      "error names the tripwire in plain words",
      typeof out.error === "string" && out.error.includes("terms acceptance"),
      out.error,
    );
    check("evidence records the tripwire kind", ev.stopped_at_tripwire === "terms_acceptance", JSON.stringify(ev));
    check("evidence records the step index", ev.tripwire_step_index === 1, JSON.stringify(ev));
    check(
      "step 0's browser action ran",
      page.countCalls("clickText", "Manage plan") === 1,
      JSON.stringify(page.calls),
    );
    check(
      "step 1's browser action NEVER ran (halted before it)",
      page.countCalls("clickText", "Cancel subscription") === 0,
      JSON.stringify(page.calls),
    );
    check(
      "step 2's browser action NEVER ran",
      page.countCalls("clickText", "Confirm cancellation") === 0,
      JSON.stringify(page.calls),
    );
    check(
      "tripwire screenshot captured as evidence",
      page.countCalls("screenshot", "tripwire-terms_acceptance") === 1 &&
        Array.isArray(ev.shots) && ev.shots.some((s) => s.label === "tripwire-terms_acceptance"),
      JSON.stringify(page.calls),
    );
  }

  // --- Scenario B: control — clean pages run every step to success ---
  {
    const page = new FakePage({
      texts: [
        "Acme Music — account overview.",
        "Manage your plan.",
        "Cancel subscription.",
        "Your cancellation is confirmed. Reference ACME-123.",
      ],
    });
    const ev = {};
    const steps = [
      { kind: "clickText", pattern: "Manage plan" },
      { kind: "clickText", pattern: "Cancel subscription" },
      { kind: "requireText", patterns: ["cancellation is confirmed"] },
      { kind: "screenshot", label: "final" },
    ];
    const out = await runDeclarative(CTX, page, { display_name: "Acme Music", steps }, ev, 0, null);
    check("clean run succeeds", out.ok === true, JSON.stringify(out));
    check("confirmation text captured", typeof ev.confirmation_text === "string" && ev.confirmation_text.includes("cancellation is confirmed"));
    check("all three browser actions ran", page.countCalls("clickText") === 2, JSON.stringify(page.calls));
    check("success note names the merchant", typeof ev.note === "string" && ev.note.includes("Acme Music"), ev.note);
  }

  // --- Scenario C: every production tripwire kind fires on its own text ---
  {
    const kinds = TRIPWIRES.map((t) => t.kind).sort();
    check(
      "production defines exactly the 5 stop-guard kinds",
      JSON.stringify(kinds) === JSON.stringify(["account_creation", "consent", "payment_details", "plan_change", "terms_acceptance"]),
      JSON.stringify(kinds),
    );
    const exemplars = {
      account_creation: "Create your account to continue",
      terms_acceptance: "By continuing, you agree to the Terms of Service",
      payment_details: "Please enter your credit card to proceed",
      consent: "We need you to consent to data sharing",
      plan_change: "Special offer! Stay for 50% off",
    };
    for (const [kind, text] of Object.entries(exemplars)) {
      check(`scanTripwiresText detects ${kind}`, scanTripwiresText(text) === kind, scanTripwiresText(text));
    }
    check("benign account page trips nothing", scanTripwiresText("Account overview. Cancel subscription.") === null);
  }

  // --- Scenario D: no false positive on the merchant login page ---
  {
    // Credential fields are expected on login pages — the playbook's
    // typeInto steps handle them; the guard must not fire there.
    check(
      "login page (sign in + password) does not trip",
      scanTripwiresText("Sign in to Acme Music\nEmail\nPassword\n[Sign in]") === null,
    );
  }
}
