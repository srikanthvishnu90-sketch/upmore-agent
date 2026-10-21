// WO-077: a reply never claims a change that did not happen this turn. Found by the live task battery (CI run
// 39485101366, T12): told "stop. don't apply to anything", the agent read the person's memory (get_memory, a read) and
// replied "Kept for good: \"don't apply to anything\" as a standing instruction" — nothing was kept. The model decides;
// code enforces: a reply that says something was saved, an alert set, postings queued or an application tracked needs the
// tool that does it to have succeeded this turn. Otherwise the model is told once and may do it or say it plainly; if
// the claim stands, the reply is code's honest one.
import { CLAIM_UNBACKED_REPLY, runAgentTurn, unbackedClaim, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

const tool = (name: string, effect: ToolSpec["effect"], fail = false): ToolSpec => ({
  name, effect, description: name, input_schema: { type: "object", properties: {}, required: [] },
  run: async () => { if (fail) throw new Error("no"); return { ok: true }; },
});
const TOOLS = [tool("get_memory", "read"), tool("remember_instruction", "write_own"), tool("set_job_alerts", "write_own"),
  tool("queue_applications", "write_own"), tool("track_application", "write_own"), tool("add_profile_fact", "write_own"), tool("broken_save", "write_own", true)];
// A scripted model: each call returns the next scripted response; the payloads it saw are kept.
function scripted(steps: any[][]) {
  const seen: any[] = [];
  let i = 0;
  const model = async (p: any) => { seen.push(JSON.parse(JSON.stringify(p))); const c = steps[Math.min(i++, steps.length - 1)]; return { content: c, stop_reason: "end_turn" }; };
  return { model, seen, calls: () => i };
}
const text = (t: string) => [{ type: "text", text: t }];
const use = (name: string, id = name) => [{ type: "tool_use", id, name, input: {} }];
const run = (m: any, message = "stop. don't apply to anything") =>
  runAgentTurn({ system: "s", history: [], message, tools: TOOLS, model: m.model, ctx: { userId: "u", threadId: "t", now: 0, state: {} } });

Deno.test("WO-077/1 the battery's case: a read, then 'Kept for good' — the model is told once, saves, and the reply stands", async () => {
  const m = scripted([use("get_memory"), text('Kept for good: "don\'t apply to anything".'), use("remember_instruction"), text('Kept for good: "don\'t apply to anything".')]);
  const r = await run(m);
  eq(r.reply, 'Kept for good: "don\'t apply to anything".');
  assert(r.tool_calls.some((t) => t.name === "remember_instruction" && t.ok), "the save happened after the check");
  const told = JSON.stringify(m.seen[2].system); // WO-061: the review rides in the retry's system prompt, never the conversation
  assert(/no tool that (saves|does that) (ran|succeeded)/i.test(told), `the model is told why: ${told}`);
});

Deno.test("WO-077/2 a claim that stands after the check is replaced by code's honest reply", async () => {
  const m = scripted([text("Saved: you never want staffing agencies."), text("Saved it as a standing instruction.")]);
  const r = await run(m, "no staffing agencies ever");
  eq(r.reply, CLAIM_UNBACKED_REPLY);
  eq(m.calls(), 2, "one check, no loop");
});

Deno.test("WO-077/3 a claim backed by its tool this turn goes through untouched, with no extra model call", async () => {
  const m = scripted([use("add_profile_fact"), text("Saved: 2 years as a data analyst. Tell me if that's off.")]);
  const r = await run(m, "I'm a data analyst with 2 years");
  eq(r.reply, "Saved: 2 years as a data analyst. Tell me if that's off.");
  eq(m.calls(), 2);
});

Deno.test("WO-077/4 a failed save does not back a claim", async () => {
  const m = scripted([use("broken_save"), text("I saved that."), text("I saved that.")]);
  eq((await run(m, "remember this")).reply, CLAIM_UNBACKED_REPLY);
});

Deno.test("WO-077/5 each kind of claim needs its own tool: alerts, queue, tracking", () => {
  const ok = (name: string) => [{ name, ok: true, effect: "write_own" as const }];
  assert(unbackedClaim("Done — I've set an alert for data analyst roles in Chicago.", ok("add_profile_fact")), "an alert claim needs set_job_alerts");
  eq(unbackedClaim("Done — I've set an alert for data analyst roles in Chicago.", ok("set_job_alerts")), null);
  assert(unbackedClaim("21 were queued into your apply queue.", []), "a queue claim needs queue_applications");
  eq(unbackedClaim("21 were queued into your apply queue.", ok("queue_applications")), null);
  assert(unbackedClaim("I'm now tracking your Stripe application.", []), "a tracking claim needs track_application");
  assert(unbackedClaim("I'll remember that for every search.", []), "a promise to remember for good is a claim");
  eq(unbackedClaim("I'm now tracking your Stripe application.", ok("track_application")), null);
});

Deno.test("WO-077/6 what is not a claim: negations, offers and questions", () => {
  for (const r of [
    "I can't answer right now. Nothing was sent, saved or submitted.",
    "Nothing has been queued yet.",
    "I can prepare the 25 applications and put them in your apply queue — want me to?",
    "Should I set an alert for these?",
    "I didn't save anything this time.",
    "Want me to remember that for every search?",
    "If you say yes, I'll queue them.",
    // From the battery's own replies (runs 4 and 6): a plan, an empty list, a promise kept to this conversation.
    "- tell you how many were queued and which were refused and why,",
    "Saved: none. Drafting a short note now from what I know.",
    "I will keep it in this conversation: I will not prepare or queue any applications unless you explicitly ask.",
  ]) eq(unbackedClaim(r, []), null, r);
});
