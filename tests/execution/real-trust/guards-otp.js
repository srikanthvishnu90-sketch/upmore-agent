// Fixture 2 — OTP expiry.
//
// Exercises the REAL OTP decision functions from the shared production
// module (supabase/functions/agent-exec/execution-guards.ts — the same
// functions the deployed agent-exec's submit_otp and sweeper call).
//
// The FakeRunStore below models the side-effect sequence of the deployed
// submit_otp / sweeper (row status transitions, session-stop calls, the
// atomic awaiting_otp -> started claim) WITHOUT re-implementing the
// accept/reject DECISION — every accept/reject comes from decideOtpSubmit
// / otpIsExpired. Proves: the 30-minute window expires, an expired code is
// rejected, a code cannot be reused, and expiry triggers failure + session
// cleanup.

import {
  decideOtpSubmit,
  otpIsExpired,
  OTP_TTL_MS,
} from "../../../supabase/functions/agent-exec/execution-guards.ts";
import { check, section } from "./assert.js";

// Models the deployed submit_otp + sweeper side effects. The DECISION at
// each step is delegated to the real shared functions.
class FakeRunStore {
  constructor() {
    this.runs = new Map();
    this.stoppedSessions = [];
    this.nextId = 1;
  }

  insertRun(row) {
    const id = `run-${this.nextId++}`;
    this.runs.set(id, { id, ...row });
    return id;
  }

  // Mirrors serve()'s submit_otp: decide (shared) -> on expiry stop the
  // session + fail the run (410); on non-awaiting 409; else the atomic
  // awaiting_otp -> started claim, exactly one winner.
  submitOtp(runId, _code, nowMs) {
    const run = this.runs.get(runId);
    if (!run) return { status: 404 };
    const d = decideOtpSubmit(
      { status: run.status, otp_expires_at: run.otp_expires_at },
      nowMs,
    );
    if (!d.proceed && d.code === "expired") {
      if (run.browserbase_session_id) this.stoppedSessions.push(run.browserbase_session_id);
      run.status = "failed";
      run.error = "The verification window expired (30 minutes). Nothing was changed — start again if you still want this cancelled.";
      run.finished_at = new Date(nowMs).toISOString();
      return { status: 410, error: d.error };
    }
    if (!d.proceed) return { status: d.status, error: d.error };
    // Atomic lock: only one resume proceeds (production: UPDATE ... WHERE
    // status='awaiting_otp', exactly one row wins).
    if (run.status !== "awaiting_otp") {
      return { status: 409, error: "This code is already being processed" };
    }
    run.status = "started";
    return { status: 200, claimed: true };
  }

  // Mirrors the lazy sweeper: expired awaiting_otp runs are failed and
  // their dangling sessions killed.
  sweep(nowMs) {
    let failed = 0;
    for (const run of this.runs.values()) {
      if (run.status === "awaiting_otp" && otpIsExpired(run.otp_expires_at, nowMs)) {
        if (run.browserbase_session_id) this.stoppedSessions.push(run.browserbase_session_id);
        run.status = "failed";
        run.error = "The verification window expired (30 minutes). Nothing was changed.";
        failed++;
      }
    }
    return failed;
  }
}

const NOW = Date.now();
const iso = (ms) => new Date(ms).toISOString();

export async function run() {
  section("otp: 30-minute window expires, rejects, cleans up");

  check("shared TTL is exactly 30 minutes", OTP_TTL_MS === 30 * 60 * 1000, String(OTP_TTL_MS));

  // --- Expired code is rejected with 410, run failed, session stopped ---
  {
    const store = new FakeRunStore();
    const id = store.insertRun({
      status: "awaiting_otp",
      otp_expires_at: iso(NOW - 60 * 1000), // expired 1 minute ago
      browserbase_session_id: "sess-expired-1",
    });
    const res = store.submitOtp(id, "123456", NOW);
    check("expired code -> HTTP 410", res.status === 410, JSON.stringify(res));
    check("410 error says the window passed", /30-minute window passed/.test(res.error || ""), res.error);
    const run = store.runs.get(id);
    check("expired run is marked failed", run.status === "failed", run.status);
    check("dangling browser session was stopped", store.stoppedSessions.includes("sess-expired-1"), JSON.stringify(store.stoppedSessions));

    // The dead run stays dead: a second submit cannot proceed.
    const again = store.submitOtp(id, "123456", NOW);
    check("resubmitting on a failed run -> 409, not 200", again.status === 409, JSON.stringify(again));
  }

  // --- A code cannot be reused: one claim wins, the second is refused ---
  {
    const store = new FakeRunStore();
    const id = store.insertRun({
      status: "awaiting_otp",
      otp_expires_at: iso(NOW + 20 * 60 * 1000), // 20 minutes left
      browserbase_session_id: "sess-valid-1",
    });
    const first = store.submitOtp(id, "654321", NOW);
    check("valid code proceeds (claim won)", first.status === 200 && first.claimed === true, JSON.stringify(first));
    check("run left awaiting_otp exactly once", store.runs.get(id).status === "started");
    const second = store.submitOtp(id, "654321", NOW);
    check("same code submitted again -> 409 (cannot be reused)", second.status === 409, JSON.stringify(second));
    check("no session stop on a clean claim", store.stoppedSessions.length === 0, JSON.stringify(store.stoppedSessions));
  }

  // --- Sweeper: stale pauses fail and sessions die; fresh pauses survive ---
  {
    const store = new FakeRunStore();
    const stale = store.insertRun({
      status: "awaiting_otp",
      otp_expires_at: iso(NOW - 2 * 60 * 60 * 1000),
      browserbase_session_id: "sess-stale-9",
    });
    const fresh = store.insertRun({
      status: "awaiting_otp",
      otp_expires_at: iso(NOW + 25 * 60 * 1000),
      browserbase_session_id: "sess-fresh-9",
    });
    const failed = store.sweep(NOW);
    check("sweeper failed exactly the stale run", failed === 1, String(failed));
    check("stale run marked failed", store.runs.get(stale).status === "failed");
    check("stale session killed", store.stoppedSessions.includes("sess-stale-9"));
    check("fresh run untouched", store.runs.get(fresh).status === "awaiting_otp", store.runs.get(fresh).status);
    check("fresh session NOT stopped", !store.stoppedSessions.includes("sess-fresh-9"), JSON.stringify(store.stoppedSessions));
  }

  // --- Boundary semantics of the shared expiry predicate ---
  {
    check("just-expired counts as expired", otpIsExpired(iso(NOW - 1), NOW) === true);
    check("just-inside the window is not expired", otpIsExpired(iso(NOW + 1), NOW) === false);
    check("missing expiry never counts as expired", otpIsExpired(null, NOW) === false);
    check(
      "decideOtpSubmit on a non-awaiting run refuses before checking TTL",
      decideOtpSubmit({ status: "started", otp_expires_at: iso(NOW - 99999) }, NOW).code === "not_awaiting",
    );
  }
}
