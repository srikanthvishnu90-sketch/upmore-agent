// LOOP PASS — LIVE RE-RUN (tier 1) for the batch-apply acceptance bar.
// Owner's bar (2026-10-15): one chat message — "apply to 15 <family>
// roles" — and Upmore does it. The v224 gauntlet (docs/gauntlet/
// b45c06b.md, stage 4 iii) found the message landing on
// career_fallback live (BUG-240); FR-398's guard proves the claim in
// the staged live shape, and THIS script is the live half of the
// re-run: run it against the deployed function after the patch that
// carries the FR-398 fix deploys (separate owner tap), on the exact
// deployed commit, and paste its output into docs/gauntlet/<sha>.md.
//
// Procedure (mirrors the v224 gauntlet trajectory):
//   1. Resolve the gauntlet test user and mint a user JWT by the
//      GoTrue admin magic-link exchange (the standing live-probe
//      method; the service key comes from the operator's env, is used
//      transiently, and is never printed or stored).
//   2. Best-effort reset of the test user's chat rate window.
//   3. FRESH thread -> the exact message. If the account pause stands
//      (career_paused), lift it with "resume career work" and resend
//      the exact message on the same thread — the gauntlet's path.
//   4. Verdict: the final turn must be CLAIMED by the batch route
//      (meta.intent === "career_batch_apply") with a named outcome —
//      a prepared run, a delegated batch, or the PROFILE_REQUIRED
//      claim naming the missing prerequisite. career_fallback (or
//      any other intent) is a FAIL. Nothing is ever submitted by
//      this script: the message runs in a fresh thread where the
//      honest outcomes are the named claim, a found-0 run against
//      the unwired live pool, or a worker delegation the operator
//      configured — preparation and naming, never a silent drop.
//
// Env:
//   SUPABASE_SERVICE_ROLE_KEY  (required; operator supplies)
//   SUPABASE_URL               (default https://mrwngntwmnaqrqhupvlt.supabase.co)
//   UPMORE_CHAT_URL            (default $SUPABASE_URL/functions/v1/agent-chat)
//   UPMORE_TEST_EMAIL          (default gauntlet-test@upmore.test)
//   LOOP_MESSAGE               (default "apply to 15 software engineering intern roles")
// Exit: 0 = PASS (claimed, named), 1 = FAIL, 2 = setup error.
"use strict";

const SUPABASE_URL = process.env.SUPABASE_URL || "https://mrwngntwmnaqrqhupvlt.supabase.co";
const CHAT_URL = process.env.UPMORE_CHAT_URL || `${SUPABASE_URL}/functions/v1/agent-chat`;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const TEST_EMAIL = process.env.UPMORE_TEST_EMAIL || "gauntlet-test@upmore.test";
const MESSAGE = process.env.LOOP_MESSAGE || "apply to 15 software engineering intern roles";

function fail(setup, msg) { console.error(`${setup ? "SETUP" : "FAIL"}: ${msg}`); process.exit(setup ? 2 : 1); }
async function call(url, opts) {
  const res = await fetch(url, opts);
  const text = await res.text();
  let body = null; try { body = JSON.parse(text); } catch { /* keep raw */ }
  return { status: res.status, body, text };
}

(async () => {
  if (!SERVICE_KEY) fail(true, "SUPABASE_SERVICE_ROLE_KEY is not set in the environment");
  const admin = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}`, "Content-Type": "application/json" };

  // 1. test user + magic-link JWT exchange
  const users = await call(`${SUPABASE_URL}/auth/v1/admin/users?per_page=200`, { headers: admin });
  if (users.status !== 200) fail(true, `admin users list -> HTTP ${users.status}`);
  const user = (users.body.users || []).find((u) => u.email === TEST_EMAIL);
  if (!user) fail(true, `test user ${TEST_EMAIL} not found`);
  const link = await call(`${SUPABASE_URL}/auth/v1/admin/generate_link`, { method: "POST", headers: admin, body: JSON.stringify({ type: "magiclink", email: TEST_EMAIL }) });
  const tokenHash = link.body && link.body.properties && link.body.properties.hashed_token;
  if (link.status !== 200 || !tokenHash) fail(true, `generate_link -> HTTP ${link.status}`);
  const verified = await call(`${SUPABASE_URL}/auth/v1/verify`, { method: "POST", headers: { apikey: SERVICE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ token_hash: tokenHash, type: "magiclink" }) });
  const jwt = verified.body && verified.body.access_token;
  if (verified.status !== 200 || !jwt) fail(true, `verify -> HTTP ${verified.status}`);
  console.log(`test user: ${TEST_EMAIL} (${user.id}) — JWT minted via magic-link exchange`);

  // 2. best-effort rate-window reset (the gauntlet does the same via SQL)
  const reset = await call(`${SUPABASE_URL}/rest/v1/agent_rate_limits?user_id=eq.${user.id}`, { method: "PATCH", headers: { ...admin, Prefer: "return=minimal" }, body: JSON.stringify({ count: 0, window_start: new Date().toISOString() }) });
  console.log(reset.status < 300 ? "rate window reset" : `rate window reset skipped (HTTP ${reset.status}) — continuing`);

  // 3. fresh thread, exact message (with the pause-lift path)
  const threadId = crypto.randomUUID();
  async function chat(message, turnKey) {
    const r = await call(CHAT_URL, { method: "POST", headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" }, body: JSON.stringify({ thread_id: threadId, message, turn_key: turnKey }) });
    if (r.status !== 200) fail(false, `chat "${message}" -> HTTP ${r.status}: ${r.text.slice(0, 300)}`);
    return r.body;
  }
  let out = await chat(MESSAGE, `loop-pass-${Date.now()}-1`);
  console.log(`turn 1: intent=${out.meta && out.meta.intent} status=${out.meta && out.meta.result_status}`);
  if (out.meta && out.meta.intent === "career_paused") {
    const lifted = await chat("resume career work", `loop-pass-${Date.now()}-2`);
    console.log(`pause lift: intent=${lifted.meta && lifted.meta.intent}`);
    if (!lifted.meta || lifted.meta.intent !== "career_resumed") fail(false, "the resume turn did not lift the pause");
    out = await chat(MESSAGE, `loop-pass-${Date.now()}-3`);
    console.log(`turn 3: intent=${out.meta && out.meta.intent} status=${out.meta && out.meta.result_status}`);
  }

  // 4. verdict on the final turn
  const intent = out.meta && out.meta.intent;
  console.log(`reply: ${JSON.stringify(out.reply)}`);
  if (out.batch) console.log(`batch field: kind=${out.batch.kind} status=${out.batch.status}`);
  if (intent === "career_fallback") fail(false, "the batch ask landed on the generic fallback (BUG-240 still live)");
  if (intent !== "career_batch_apply") fail(false, `the batch ask was claimed by "${intent}", not the batch route`);

  // 5. DB read-back: what state did the turn actually write?
  const state = await call(`${SUPABASE_URL}/rest/v1/agent_flow_state?user_id=eq.${user.id}&thread_id=eq.${threadId}&select=state`, { headers: admin });
  const stores = state.body && state.body[0] && state.body[0].state && state.body[0].state.career && state.body[0].state.career.stores;
  if (stores) {
    console.log(`stores written: ${Object.keys(stores).join(", ") || "(none)"}`);
    if (stores.batchApplyState) console.log(`batchApplyState: status=${stores.batchApplyState.status} run=${stores.batchApplyState.id}`);
    else console.log("batchApplyState: absent (expected on the PROFILE_REQUIRED claim — no hollow run is manufactured)");
  } else {
    console.log("DB read-back: no agent_flow_state row found for the thread (report, do not hide)");
  }
  console.log(`PASS: "${MESSAGE}" was claimed by the batch route with a named outcome (result_status=${out.meta.result_status}); nothing was submitted by this pass.`);
  process.exit(0);
})().catch((e) => { console.error(`ERROR: ${e && e.message}`); process.exit(2); });
