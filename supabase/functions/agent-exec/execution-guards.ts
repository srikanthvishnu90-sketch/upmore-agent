// Upmore execution guards — shared trust logic (2026-09-28).
//
// Pure, dependency-free TypeScript: NO Deno APIs, NO npm imports, only
// `import type` (fully erased). This module is imported by BOTH:
//   - supabase/functions/agent-exec/index.ts (the deployed edge function), and
//   - tests/execution/* fixtures (Node, via type-stripping).
//
// The fixtures exercise THIS code — the same functions the deployed executor
// calls. If a guard is weakened here, the fixtures fail. If a guard CALL is
// removed from index.ts, the wiring assertions in the fixtures fail.

import type { DriverAction } from "./merchant-catalog.ts";

// ================= Browser outcome =================

export type BrowserOutcome =
  | { awaitingOtp: true; otpHint: string; resume: Record<string, unknown> }
  | { ok: true }
  | { ok: false; error: string };

// ================= GuardPage =================
// Structural type for the page driver. The real BbPage (index.ts)
// satisfies this; fixtures supply a fake page recording every call.
// (Named PageShot: Node's type-stripping cannot parse nested object
// literal types like Promise<{...}> — keep type positions flat.)
export type PageShot = { label: string; data: string };
export type GuardPage = {
  eval(js: string): Promise<unknown>;
  goto(url: string, timeoutMs?: number): Promise<void>;
  waitFor(js: string, timeoutMs?: number): Promise<boolean>;
  clickText(pattern: string): Promise<string | null>;
  clickFirst(selectors: string[]): Promise<string | null>;
  clickDialogButton(pattern: string): Promise<string | null>;
  typeInto(selectors: string[], text: string): Promise<string | null>;
  fillOtp(code: string): Promise<string | null>;
  screenshot(label: string): Promise<PageShot | null>;
};

// ================= pushShot =================

export function pushShot(ev: Record<string, unknown>, shot: PageShot | null) {
  if (!shot) return;
  const shots = (ev.shots as Array<PageShot>) || (ev.shots = []);
  shots.push(shot);
}

// ================= Stop-guard tripwires =================
// Verbatim from the executor: before EVERY browser step, the visible page
// text is scanned for tripwires. On tripwire the run aborts immediately
// with evidence — the agent never improvises through account creation,
// terms acceptance, payment entry, consent, or plan changes.

  export type TripwireDef = { kind: string; patterns: RegExp[] };
export const TRIPWIRES: Array<TripwireDef> = [
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

/** Pure tripwire scan over visible page text. Returns the tripwire kind, or null. */
export function scanTripwiresText(text: string): string | null {
  // Skip the scan on the merchant's own login page (credential fields are
  // expected there — the playbook's typeInto steps handle them).
  if (/sign ?in|log ?in/i.test(text) && /password/i.test(text) &&
      !/create (your|an) account|sign up/i.test(text)) return null;
  for (const t of TRIPWIRES) {
    for (const re of t.patterns) {
      if (re.test(text)) return t.kind;
    }
  }
  return null;
}

// ================= Declarative runner =================

// Declarative runner: executes a VERIFIED catalog playbook using only the
// existing GuardPage capabilities. Unverified playbooks never reach this — the
// gate in serve() refuses them before vault/Browserbase access.
//
// Moved here (2026-09-28) from index.ts so the execution-trust fixtures can
// drive the REAL step loop (with the REAL stop-guard) against a fake page.
// index.ts imports and calls this — the deployed path is unchanged.
export async function runDeclarative(
  ctx: { username: string; password: string }, page: GuardPage,
  pb: { steps: DriverAction[]; display_name: string },
  ev: Record<string, unknown>, fromIndex: number, otp: string | null,
): Promise<BrowserOutcome> {
  const steps = pb.steps;
  const fail = (error: string): BrowserOutcome => ({ ok: false, error });
  // Stop-guards (2026-09-28): before EVERY step, scan the visible page
  // for tripwires via the shared scanTripwiresText. The agent cancels or it
  // stops — it never improvises through account creation, terms acceptance,
  // payment entry, consent, or plan changes. On tripwire: abort immediately
  // with evidence; guided fallback.
  async function tripwireScan(): Promise<string | null> {
    let text = "";
    try { text = String(await page.eval("document.body.innerText || \"\"").catch(() => "")); }
    catch { return null; }
    return scanTripwiresText(text);
  }
  for (let i = fromIndex; i < steps.length; i++) {
    const tripped = await tripwireScan();
    if (tripped) {
      ev.stopped_at_tripwire = tripped;
      ev.tripwire_step_index = i;
      try { pushShot(ev, await page.screenshot("tripwire-" + tripped)); } catch { /* best effort */ }
      return fail(`Stopped: the page asked for ${tripped.replace(/_/g, " ")} — the agent never proceeds through that. Nothing was changed.`);
    }
    const a = steps[i];
    switch (a.kind) {
      case "goto":
        await page.goto(a.url);
        break;
      case "waitFor": {
        const ok = await page.waitFor(a.js, a.timeoutMs ?? 20000);
        if (!ok && a.required !== false) {
          return fail(`Timed out waiting for ${a.label ?? "the page"} — the site layout may have changed. Nothing was changed.`);
        }
        break;
      }
      case "clickText": {
        const clicked = await page.clickText(a.pattern);
        if (!clicked) return fail(`Could not find a control matching "${a.pattern}" — the site layout may have changed. Nothing was changed.`);
        break;
      }
      case "clickFirst": {
        const clicked = await page.clickFirst(a.selectors);
        if (!clicked && a.required !== false) return fail("Could not find the expected control — the site layout may have changed. Nothing was changed.");
        break;
      }
      case "clickDialogButton": {
        const clicked = await page.clickDialogButton(a.pattern);
        if (!clicked) return fail(`Could not click the confirmation control matching "${a.pattern}". Nothing was changed.`);
        break;
      }
      case "typeInto": {
        const text = a.credential === "username" ? ctx.username
          : a.credential === "password" ? ctx.password
          : a.text ?? "";
        const typed = await page.typeInto(a.selectors, text);
        if (!typed) return fail("Could not find the sign-in field — the site layout may have changed. Nothing was changed.");
        break;
      }
      case "otpPause": {
        // Pause for the user's one-time code; keep the session alive.
        ev.resume = { stage: "otp", step_index: i + 1 };
        pushShot(ev, await page.screenshot("otp-prompt"));
        return {
          awaitingOtp: true,
          otpHint: a.hint,
          resume: ev.resume as Record<string, unknown>,
        };
      }
      case "fillOtp": {
        const how = await page.fillOtp(otp ?? "");
        ev.otp_entry = how || null;
        if (!how) return fail("The code field disappeared — the session may have expired. Nothing was changed.");
        break;
      }
      case "screenshot":
        pushShot(ev, await page.screenshot(a.label));
        break;
      case "requireText": {
        const pageText = ((await page.eval("document.body.innerText || \"\"").catch(() => "")) as string);
        const m = new RegExp(a.patterns.join("|"), "i").exec(pageText);
        if (m) {
          const idx = pageText.indexOf(m[0]);
          ev.confirmation_text = pageText.slice(Math.max(0, idx - 120), idx + 200);
        } else {
          return fail("Clicked cancel but no confirmation text appeared — check the merchant account before retrying.");
        }
        break;
      }
    }
  }
  // Success requires BOTH visible confirmation text AND a final screenshot.
  const shots = ev.shots as Array<PageShot> | undefined;
  if (!ev.confirmation_text || !shots || !shots.length) {
    return fail("No visible confirmation captured — not reporting success. Check the merchant account.");
  }
  ev.note = `${pb.display_name} subscription cancellation confirmed in the browser.`;
  return { ok: true };
}

// ================= Category exclusion =================
// Defense in depth: the client can be bypassed, so the executor re-checks
// before the atomic claim. Returns the exclusion reason, or null if clear.
// Insurance, utilities, and contracts/ETFs are matched deterministically;
// user-marked keep/shared arrives via approval_context (the client is the
// source of the user's marking; the server enforces it).

export type ExcludedPattern = { category: string; re: RegExp };
export const EXCLUDED_PATTERNS: Array<ExcludedPattern> = [
  { category: "insurance", re: /insurance|geico|progressive|state farm|allstate|usaa|liberty mutual|farmers ins|nationwide|travelers/i },
  { category: "utility", re: /comed|con ?ed|pseg|duke energy|pacific gas|pg&e|national grid|southern california edison|florida power|xcel|dte energy|ameranill|water|electric|gas company|power company/i },
  { category: "contract", re: /early termination|termination fee|\betf\b|contract/i },
];
export function checkExcludedCategory(
  merchantKey: string, merchantName: string,
  approval: Record<string, unknown>,
): string | null {
  const hay = `${merchantKey} ${merchantName}`;
  for (const { category, re } of EXCLUDED_PATTERNS) {
    if (re.test(hay)) return category;
  }
  const ctx = (approval.approval_context || {}) as Record<string, unknown>;
  if (ctx.has_early_termination_fee) return "contract (early termination fee)";
  if (ctx.user_marked_keep) return "marked keep by you";
  if (ctx.user_marked_shared) return "marked shared by you";
  return null;
}

// ================= OTP expiry =================
// Awaiting-OTP pauses carry a 30-minute TTL. submit_otp rejects expired codes
// (410); the lazy sweeper fails expired runs and kills the dangling session.
export const OTP_TTL_MS = 30 * 60 * 1000;

/** True when the OTP pause expired before nowMs. Missing expiry = not expired. */
export function otpIsExpired(expiresAtIso: string | null | undefined, nowMs: number): boolean {
  if (!expiresAtIso) return false;
  return new Date(expiresAtIso).getTime() < nowMs;
}

export type OtpSubmitDecision =
  | { proceed: true }
  | { proceed: false; status: 409 | 410; code: "not_awaiting" | "expired"; error: string };

/** The REAL submit_otp decision tree from serve(): status check, then TTL. */
export function decideOtpSubmit(
  run: { status: string; otp_expires_at?: string | null },
  nowMs: number,
): OtpSubmitDecision {
  // Never accept an OTP for a run that isn't awaiting one.
  if (run.status !== "awaiting_otp") {
    return { proceed: false, status: 409, code: "not_awaiting", error: `Run is ${run.status}, not waiting for a code` };
  }
  // 30-minute TTL: expired pauses are dead — the sweeper (or this check)
  // fails them and the session is killed. Never accept a code for an
  // expired pause.
  if (otpIsExpired(run.otp_expires_at ?? null, nowMs)) {
    return { proceed: false, status: 410, code: "expired", error: "This verification code expired — the 30-minute window passed. Nothing was changed." };
  }
  return { proceed: true };
}

// ================= Approval context completeness =================
// approval_context is the evidentiary record of informed consent — the exact
// strings the user saw on the approval screen. These keys must be non-empty.
export const REQUIRED_CONTEXT_KEYS = [
  "merchant_name", "amount", "billing_interval", "twelve_month_projection",
  "reversibility", "agent_mechanics", "agent_will_not", "failure_path",
];

/** Returns the required keys that are missing or empty. Empty = complete. */
export function missingApprovalContext(ctx: Record<string, unknown>): string[] {
  return REQUIRED_CONTEXT_KEYS.filter((k) => {
    const v = ctx[k];
    return v == null || v === "";
  });
}

// ================= Execute gate =================
// The REAL execute-path decision chain from serve(), in order:
// approval exists + caller-owned -> status approved -> no terminal done run
// -> supported action -> approval_context present -> category exclusion.
// DB-dependent inputs (ownership, done-run existence) are parameters; the
// decision logic itself is pure and fixture-testable.
export type ExecuteGateDecision =
  | { proceed: true; contextKeysMissing: string[] }
  | {
      proceed: false; status: 400 | 404 | 409;
      reason: "approval_not_found" | "not_approved" | "already_completed"
        | "unsupported_action" | "missing_approval_context" | "excluded_category";
      error: string; guidedReason?: string; note?: string;
    };

export function decideExecuteGate(
  approval: Record<string, unknown> | null,
  opts: { callerOwns: boolean; doneRunExists: boolean },
): ExecuteGateDecision {
  if (!approval || !opts.callerOwns) {
    return { proceed: false, status: 404, reason: "approval_not_found", error: "Approval not found" };
  }
  if (approval.status !== "approved") {
    return { proceed: false, status: 409, reason: "not_approved", error: `Approval is ${approval.status}, not approved` };
  }
  // Retry scoping: an approval that already produced a terminal "done" run
  // may NEVER execute again — a new cancellation needs a new approval.
  if (opts.doneRunExists) {
    return { proceed: false, status: 409, reason: "already_completed", error: "This approval already completed — approve again for a new cancellation" };
  }
  if (approval.action !== "cancel_subscription") {
    return { proceed: false, status: 400, reason: "unsupported_action", error: `Unsupported action ${approval.action}` };
  }
  // approval_context: refuse to execute approvals that predate it.
  if (!approval.approval_context || typeof approval.approval_context !== "object") {
    return {
      proceed: false, status: 409, reason: "missing_approval_context",
      guidedReason: "missing_approval_context", error: "missing_approval_context",
      note: "This approval was created before the full disclosure screen existed — approve again from the current screen so the record is complete.",
    };
  }
  // Category exclusion re-check (defense in depth): the client can be
  // bypassed, so the executor re-verifies before the atomic claim.
  const mkey = String(approval.merchant_key || "").toLowerCase();
  const mname = String(approval.merchant || "").toLowerCase();
  const excluded = checkExcludedCategory(mkey, mname, approval);
  if (excluded) {
    return {
      proceed: false, status: 400, reason: "excluded_category",
      guidedReason: "excluded_category", error: "excluded_category",
      note: `The agent never touches ${excluded} — that one stays with you to decide directly.`,
    };
  }
  return {
    proceed: true,
    contextKeysMissing: missingApprovalContext(approval.approval_context as Record<string, unknown>),
  };
}

// ================= Cancel-claim row =================
// A "done" agent run never means "cancelled" — it means CLAIMED. This builds
// the cancel_claims row (pure computation extracted from writeCancelClaim).
export function buildCancelClaimRow(
  approval: Record<string, unknown>, userId: string, runId: string,
  merchantKey: string, nowMs: number = Date.now(),
): Record<string, unknown> {
  const ctx = (approval.approval_context || {}) as Record<string, unknown>;
  let expected: string | null = typeof ctx.next_billing_date === "string" ? ctx.next_billing_date : null;
  if (!expected) {
    // Fall back to interval arithmetic: monthly +30d, annual +365d.
    const interval = String(ctx.billing_interval || approval.billing_interval || "monthly").toLowerCase();
    const days = interval.includes("annual") || interval.includes("year") ? 365 : 30;
    expected = new Date(nowMs + days * 864e5).toISOString().slice(0, 10);
  }
  return {
    user_id: userId,
    merchant: String(approval.merchant || ctx.merchant_name || merchantKey),
    merchant_key: merchantKey,
    amount: ctx.amount ?? approval.amount ?? null,
    expected_billing_date: expected,
    grace_days: 2,
    status: "open",
    run_id: runId,
    approval_id: approval.id,
    subscription_id: ctx.subscription_id ?? null,
  };
}

// ================= Learning from mistakes (2026-09-28) =================
// The agent's failure memory. Every terminal execution outcome is
// categorized here (pure, deterministic — the same function the fixtures
// exercise); agent-exec/index.ts persists the lesson and retrieves it
// before the next run for the same merchant. The loop is:
//   record (categorize the failure) -> understand (what to do instead) ->
//   fix (skip doomed retries, escalate repeats) -> apply (inject the lesson
//   into the next attempt) -> resolve (a later success closes the lesson).

export type ExecFailureCategory =
  | "tripwire_stop"
  | "layout_changed"
  | "otp_expired"
  | "no_confirmation"
  | "auth_failed"
  | "session_died"
  | "other";

export type ExecFailureAnalysis = {
  category: ExecFailureCategory;
  /** What the agent must do differently next time — stored as the lesson. */
  what_to_do_instead: string;
  /** Whether an immediate blind retry could ever help. */
  retryable: boolean;
};

/**
 * Deterministic failure categorization over the executor's own error
 * strings (runDeclarative's fail() messages and the resume path). Pure:
 * same error in -> same category out, no model, no network.
 */
export function categorizeExecFailure(
  error: string,
  ev?: Record<string, unknown>,
): ExecFailureAnalysis {
  const e = String(error || "");
  const stoppedKind =
    (ev && typeof ev.stopped_at_tripwire === "string" && ev.stopped_at_tripwire) ||
    (/Stopped: the page asked for ([a-z ]+)/i.exec(e)?.[1] ?? null);

  if (stoppedKind || /tripwire/i.test(e)) {
    const kind = (stoppedKind || "that step").replace(/_/g, " ");
    return {
      category: "tripwire_stop",
      what_to_do_instead:
        `Never proceed through "${kind}" — stop the browser run and use the guided self-serve fallback. ` +
        `Do not retry the automated path for this merchant until the playbook is re-verified; the stop is by design, not a flake.`,
      retryable: false,
    };
  }
  if (/code expired|window expired|otp.*expir/i.test(e)) {
    return {
      category: "otp_expired",
      what_to_do_instead:
        "The one-time code expired before it was used. Warn the user up front that the code dies after 30 minutes, " +
        "and only start the run when they are ready to paste the code immediately.",
      retryable: true,
    };
  }
  if (/timed out waiting/i.test(e)) {
    return {
      category: "layout_changed",
      what_to_do_instead:
        "The merchant's site layout changed — the playbook's selectors no longer match. " +
        "Do not blindly re-run the same steps; the flow must be re-verified against the live site first. " +
        "Offer the guided self-serve path meanwhile.",
      retryable: true,
    };
  }
  if (/sign-in field|credential|\blogin\b/i.test(e)) {
    return {
      category: "auth_failed",
      what_to_do_instead:
        "Sign-in failed — the login page or the stored credentials changed. Verify the login flow (and ask the user to " +
        "re-check saved credentials) before any retry; repeated login attempts can lock the account.",
      retryable: true,
    };
  }
  if (/Could not find|layout may have changed|expected control/i.test(e)) {
    return {
      category: "layout_changed",
      what_to_do_instead:
        "The merchant's site layout changed — the playbook's selectors no longer match. " +
        "Do not blindly re-run the same steps; the flow must be re-verified against the live site first. " +
        "Offer the guided self-serve path meanwhile.",
      retryable: true,
    };
  }
  if (/no confirmation|confirmation text/i.test(e)) {
    return {
      category: "no_confirmation",
      what_to_do_instead:
        "The cancel click happened but no confirmation text appeared. Never claim success without visible confirmation — " +
        "check the merchant account directly before retrying, and do not re-click blindly (double-cancel risk).",
      retryable: true,
    };
  }
  if (/session.*expired|Resume failed|session may have/i.test(e)) {
    return {
      category: "session_died",
      what_to_do_instead:
        "The browser session died mid-run. Start a fresh run rather than resuming a dead session, and tell the user " +
        "plainly what happened instead of silently retrying.",
      retryable: true,
    };
  }
  return {
    category: "other",
    what_to_do_instead:
      "An uncategorized failure occurred. Record the exact error, do not retry blindly, and surface the honest " +
      "failure to the user with the guided fallback.",
    retryable: true,
  };
}

export type ExecLessonRow = {
  id: string;
  category: string;
  title: string;
  times_seen: number;
  what_to_do_instead: string;
};

/** After this many sightings of the same failure, stop retrying the
 *  automated path entirely — the agent has learned it does not work. */
export const REPEAT_FAILURE_SKIP_THRESHOLD = 2;
/** After this many sightings, flag the playbook for re-verification. */
export const REPEAT_FAILURE_REVERIFY_THRESHOLD = 3;

/**
 * Decide whether the automated path should be skipped for this merchant
 * because past attempts kept failing the same way. Pure and fixture-tested.
 * tripwire_stop is never retried (by-design stop); layout_changed and
 * friends stop after REPEAT_FAILURE_SKIP_THRESHOLD sightings.
 */
export function shouldSkipRetryExec(
  lessons: ExecLessonRow[],
): { skip: boolean; lesson?: ExecLessonRow; reason?: string } {
  const open = lessons.filter((l) => l.category !== "other");
  // A by-design stop never becomes retryable — one sighting is enough.
  const stop = open.find((l) => l.category === "tripwire_stop");
  if (stop) {
    return {
      skip: true,
      lesson: stop,
      reason:
        "Learned from a past attempt: the automated path stops by design here " +
        `(${stop.title}). Going straight to the guided path instead of repeating a run that cannot proceed.`,
    };
  }
  const repeated = open.find((l) => l.times_seen >= REPEAT_FAILURE_SKIP_THRESHOLD);
  if (repeated) {
    return {
      skip: true,
      lesson: repeated,
      reason:
        `Learned from ${repeated.times_seen} past attempts: ${repeated.title}. ` +
        "Repeating the same automated run would fail the same way — using the guided path instead.",
    };
  }
  return { skip: false };
}

/** Human-readable lesson title for a fresh exec failure. */
export function execLessonTitle(
  category: ExecFailureCategory,
  merchantLabel: string,
): string {
  switch (category) {
    case "tripwire_stop":
      return `${merchantLabel}: automated run stopped by a safety tripwire`;
    case "layout_changed":
      return `${merchantLabel}: site layout changed, playbook steps no longer match`;
    case "otp_expired":
      return `${merchantLabel}: one-time code expired before use`;
    case "no_confirmation":
      return `${merchantLabel}: cancel clicked but no confirmation appeared`;
    case "auth_failed":
      return `${merchantLabel}: sign-in failed during the run`;
    case "session_died":
      return `${merchantLabel}: browser session died mid-run`;
    default:
      return `${merchantLabel}: automated run failed`;
  }
}
