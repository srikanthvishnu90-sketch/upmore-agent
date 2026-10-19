// WO-002 hardening (Codex's findings on PR #2, confirmed 2026-10-19): account controls and an account pause are the
// host's before any model call; what a person erased never reaches the model; a turn that saved something and then
// failed keeps its honest reply instead of the router's. Run: deno test --no-check tests/edge/agent-guards.test.ts
import { afterErase, historyWindow } from "../../supabase/functions/agent-chat/career_brain.ts";
import { CareerHost } from "../../supabase/functions/_shared/career_host.js";
import { CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment } from "../../supabase/functions/_shared/router_core.career.js";
import SRC from "../../supabase/functions/agent-chat/handler-career.ts" with { type: "text" };

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const host = CareerHost.createCareerHost({ CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment });
const ctx = (extra: Record<string, unknown> = {}) => ({ ...host.createTurnCtx({ userId: "u1", threadId: "t1", now: Date.UTC(2026, 9, 19, 15), snapshot: null }), ...extra });

Deno.test("WO-002/G1 STOP, resume and erase belong to the host, and so does every turn while the account is paused", () => {
  for (const m of ["STOP", "stop everything.", "pause all career work", "resume career work", "delete my career profile", "Forget my career profile!"])
    assert(host.isHostControlled(m, ctx()), m);
  assert(!host.isHostControlled("any remote data analyst jobs?", ctx()), "an ordinary ask goes to the brain");
  assert(host.isHostControlled("any remote data analyst jobs?", ctx({ globalPause: { set: true, source: "account_control" } })), "paused: nothing reaches a model");
  const paused = ctx({ globalPause: { set: true, source: "account_control" } });
  eq(host.runTurn("find me jobs", paused).intent, "career_paused", "and the host answers it");
});

Deno.test("WO-002/G2 the agent branch asks the host first, before any model call", () => {
  const i = SRC.indexOf('chooseBrain(Deno.env) === "agent"');
  assert(i > 0 && SRC.slice(i, i + 120).includes("!host.isHostControlled(message, ctx)"), "the agent condition checks the host's controls");
  assert(SRC.indexOf("isHostControlled") < SRC.indexOf("callModel(cfg"), "the check comes before the model is called");
});

Deno.test("WO-002/G3 what was erased never reaches the model: history is cut at the latest erase, which is left out too", () => {
  const rows = [
    { role: "user", content: "I'm a nurse", meta: null },
    { role: "assistant", content: "I removed your saved career profile…", meta: { intent: "career_profile_erased" } },
    { role: "user", content: "old secret stuff", meta: null },
    { role: "assistant", content: "I removed …", meta: { intent: "career_profile_erased" } },
    { role: "user", content: "older", meta: null },
  ];
  eq(afterErase(rows).map((r) => r.content), ["I'm a nurse"], "newest first, cut at the latest erase");
  eq(afterErase([{ role: "user", content: "hi", meta: {} }]).length, 1, "no erase: everything stays");
  // WO-027: the handler's window (historyWindow, 40 messages) applies the same cut before anything else.
  eq(historyWindow(rows).history.map((r) => r.content), ["I'm a nurse"], "the 40-message window keeps the cut");
  eq(historyWindow(rows).cut, false, "what was erased never counts as a longer thread");
  assert(/select\("role,content,meta"\)/.test(SRC) && /historyWindow\(\(hist\.data/.test(SRC), "the handler reads meta and applies the cut");
});

Deno.test("WO-002/G4 a model failure after a save keeps the turn's honest reply; only a failure with nothing saved falls back to the router", () => {
  assert(/turn\.stopped === "model_error" && !turn\.tool_calls\.some\(\(t\) => t\.ok && t\.effect === "write_own"\)/.test(SRC), "the router fallback is only for turns that saved nothing");
});
