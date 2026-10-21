// Owner-assigned brain-reliability regressions. Invented conversations and
// scripted providers only; this is a mechanism test, not a model-quality score.
import { runAgentTurn, type ModelFn, type ToolCtx, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";

function eq(a: unknown, b: unknown, why = "") {
  if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(why + ": got " + JSON.stringify(a) + ", expected " + JSON.stringify(b));
}
function ok(a: unknown, why: string): asserts a { if (!a) throw new Error(why); }
const INPUT = "What can I do tonight to get ready for an interview? Give me two concrete steps.";
const ANSWER = "Read the role. Rehearse one example.";
const BARE = "Is that right?";
const text = (s: string) => ({ content: [{ type: "text", text: s }], stop_reason: "end_turn" });
const use = (pre = "") => ({ content: [...(pre ? [{ type: "text", text: pre }] : []), { type: "tool_use", id: "save-1", name: "add_profile_fact", input: {} }], stop_reason: "tool_use" });
function scripted(responses: any[]) {
  const payloads: any[] = [];
  const model: ModelFn = async (p) => {
    payloads.push(JSON.parse(JSON.stringify(p)));
    const r = responses[Math.min(payloads.length - 1, responses.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  return { model, payloads };
}
async function fixture(responses: any[], options: { message?: string; maxSteps?: number; tools?: ToolSpec[] } = {}) {
  const state: Record<string, unknown> = {};
  const m = scripted(responses);
  const save: ToolSpec = { name: "add_profile_fact", effect: "write_own", description: "TEST save", input_schema: { type: "object", properties: {}, required: [] },
    run: async () => { state.saves = Number(state.saves ?? 0) + 1; return { text: "Synthetic test fact" }; } };
  const r = await runAgentTurn({ system: "Answer the person's request using only their stated facts.", history: [], message: options.message ?? INPUT,
    model: m.model, tools: options.tools ?? [save], maxSteps: options.maxSteps,
    ctx: { userId: "SYNTHETIC-RELIABILITY-OWNER", threadId: "SYNTHETIC-RELIABILITY-THREAD", now: 0, state } });
  return { r, m, state };
}

Deno.test("reliability: bare confirmation recovers the requested answer once", async () => {
  const { r, m } = await fixture([text(BARE), text(ANSWER)]);
  eq(r.reply, ANSWER, "the requested work is answered");
  eq(r.stopped, "final"); eq(m.payloads.length, 2);
  eq(m.payloads[1].tool_choice, { type: "none" }, "recovery cannot repeat effects");
  eq(m.payloads[1].messages, m.payloads[0].messages, "code's recovery note is not a user message");
  ok(m.payloads[1].system !== m.payloads[0].system, "recovery instruction belongs in the system prompt");
});

Deno.test("reliability: completeness is checked after false save claims are filtered", async () => {
  const draft = "I've saved your interview plan. Is that right?";
  const { r, m, state } = await fixture([text(draft), text(draft), text(ANSWER)]);
  eq(r.reply, ANSWER); eq(r.stopped, "final"); eq(m.payloads.length, 3);
  eq(state, {}); eq(r.pending_approvals, []);
});

Deno.test("reliability: an answer beside a tool call survives its final confirmation trailer, even under 60 characters", async () => {
  const { r, m, state } = await fixture([use(ANSWER), text(BARE)]);
  ok(r.reply.includes(ANSWER), "the already-written answer was discarded");
  eq(m.payloads.length, 2, "preserve the answer without another provider call");
  eq(state.saves, 1, "save ran exactly once"); eq(r.stopped, "final");
});

Deno.test("reliability: preserved earlier text still passes through truth filtering", async () => {
  const read: ToolSpec = { name: "add_profile_fact", effect: "read", description: "TEST failed save", input_schema: { type: "object", properties: {}, required: [] },
    run: async () => { throw new Error("TEST refusal"); } };
  const { r } = await fixture([use("I've saved your interview plan."), text(BARE), text(BARE), text(ANSWER)], { tools: [read] });
  eq(r.reply, ANSWER);
  ok(!/saved your/i.test(r.reply), "earlier unsupported claim bypassed the guard");
});

Deno.test("reliability: repeated nonanswers stop honestly after one recovery", async () => {
  const { r, m } = await fixture([text(BARE)]);
  ok(r.stopped !== "final", "an unanswered request was labelled final");
  ok(r.reply !== BARE && !!r.reply.trim(), "failure must be explicit, never the bare trailer");
  eq(m.payloads.length, 2, "recovery is bounded");
});

Deno.test("reliability: no remaining step budget means no extra provider call", async () => {
  const { r, m } = await fixture([text(BARE)], { maxSteps: 1 });
  ok(r.stopped !== "final", "incomplete answer at the step bound was labelled final");
  eq(m.payloads.length, 1);
});

Deno.test("reliability: a recovery model returning tools cannot execute or enqueue them", async () => {
  const { r, state } = await fixture([text(BARE), use()]);
  eq(state, {}, "text-only recovery executed a write");
  eq(r.tool_calls, []); eq(r.pending_approvals, []);
  ok(r.stopped !== "final", "tool-only recovery cannot complete the answer");
});

Deno.test("reliability: bare acknowledgement is insufficient for an explicit question", async () => {
  const { r, m } = await fixture([text("Got it."), text(ANSWER)]);
  eq(r.reply, ANSWER); eq(m.payloads.length, 2);
});

Deno.test("reliability: supported short factual answers stay unchanged without recovery", async () => {
  const { r, m } = await fixture([text("2028.")], { message: "I graduate in 2028. What year do I graduate?" });
  eq(r.reply, "2028."); eq(m.payloads.length, 1);
});

Deno.test("reliability: a concrete clarification is a valid answer when information is missing", async () => {
  const reply = "What month and year did you graduate?";
  const { r, m } = await fixture([text(reply)], { message: "Put my graduation date on the form." });
  eq(r.reply, reply); eq(m.payloads.length, 1);
});

Deno.test("reliability: a deliberately requested literal phrase remains valid", async () => {
  const { r, m } = await fixture([text(BARE)], { message: 'Reply with exactly "Is that right?"' });
  eq(r.reply, BARE); eq(m.payloads.length, 1);
});

Deno.test("reliability: social acknowledgements do not require a fabricated task", async () => {
  const { r, m } = await fixture([text("Got it.")], { message: "Thanks!" });
  eq(r.reply, "Got it."); eq(m.payloads.length, 1);
});

Deno.test("reliability: a provider failure during recovery remains a model error", async () => {
  const { r, m } = await fixture([text(BARE), new Error("TEST provider failure")]);
  eq(r.stopped, "model_error"); eq(m.payloads.length, 2);
});

Deno.test("reliability: failure after a completed save does not claim nothing was saved", async () => {
  const { r, state } = await fixture([use(), text(BARE), text(BARE)]);
  eq(state.saves, 1);
  ok(r.stopped !== "final", "the remaining question is unanswered");
  ok(!/nothing.{0,10}saved/i.test(r.reply), "failure denied a completed save");
});

Deno.test("reliability: a substantive response passes without rewriting", async () => {
  const { r, m } = await fixture([text(ANSWER)]);
  eq(r.reply, ANSWER); eq(m.payloads.length, 1);
});

Deno.test("reliability: empty output uses the same bounded recovery", async () => {
  const { r, m } = await fixture([text(""), text(ANSWER)]);
  eq(r.reply, ANSWER); eq(m.payloads.length, 2);
});

Deno.test("reliability: code-owned show output keeps its exact payload", async () => {
  const shown: ToolSpec = { name: "add_profile_fact", effect: "read", description: "TEST shown output", input_schema: { type: "object", properties: {}, required: [] },
    run: async (_i, c: ToolCtx) => { c.turn!.show = { intent: "TEST", text: "Got it." }; return {}; } };
  const { r } = await fixture([use(), text(BARE)], { tools: [shown] });
  eq(r.reply, "Got it."); eq(r.show?.text, "Got it.");
});

Deno.test("reliability: formatting and multiple closing sentences do not masquerade as an answer body", async () => {
  for (const trailer of ["**Is that right?**", "Got it. Does that help?", "Sure — is that correct?"]) {
    const { r, m } = await fixture([text(trailer), text(ANSWER)]);
    eq(r.reply, ANSWER, trailer); eq(m.payloads.length, 2, trailer);
  }
});

Deno.test("reliability: recovery cannot create an external approval even alongside valid answer text", async () => {
  let executed = false;
  const external: ToolSpec = { name: "add_profile_fact", effect: "external", description: "TEST external", input_schema: { type: "object", properties: {}, required: [] },
    run: async () => { executed = true; return {}; } };
  const { r } = await fixture([text(BARE), use(ANSWER)], { tools: [external] });
  eq(executed, false); eq(r.pending_approvals, []); eq(r.tool_calls, []);
  ok(r.stopped !== "final", "provider broke the text-only recovery contract");
});

Deno.test("reliability: unsupported personal facts in a repair remain filtered", async () => {
  const { r, state, m } = await fixture([text(BARE), text("Your Excel skills will help in the interview.")]);
  ok(!r.reply.includes("Excel"), "repair bypassed fact tracing");
  ok(r.reply.includes("[your skill]"), "missing fact must remain a placeholder");
  eq(state, {}); eq(m.payloads.length, 2);
});

Deno.test("reliability: a substantive final answer supersedes earlier tool-call text", async () => {
  const { r, m } = await fixture([use("I will check the details."), text(ANSWER)]);
  eq(r.reply, ANSWER); eq(m.payloads.length, 2);
});

Deno.test("reliability: a save receipt and contracted confirmation cannot replace an earlier answer", async () => {
  const { r, m, state } = await fixture([use(ANSWER), text("I've saved your interview plan. Tell me if that's off.")]);
  ok(r.reply.includes(ANSWER), "only the save receipt survived");
  eq(state.saves, 1); eq(m.payloads.length, 2);
});

Deno.test("reliability: a promise to do the work is not an answer body", async () => {
  for (const pre of ["I'll put together a plan for tonight.", "Let me check the details."]) {
    const { r, m, state } = await fixture([use(pre), text(BARE), text(ANSWER)]);
    eq(r.reply, ANSWER); eq(m.payloads.length, 3); eq(state.saves, 1);
  }
  const { r } = await fixture([text("I'll draft a plan."), text(ANSWER)]);
  eq(r.reply, ANSWER);
});

Deno.test("reliability: concrete content and explicitly requested future wording remain valid", async () => {
  const answer = "I'll start with this: read the role, then rehearse one example.";
  const { r, m } = await fixture([text(answer)]);
  eq(r.reply, answer); eq(m.payloads.length, 1);
  const phrase = "I'll put together a plan for tonight.";
  const copied = await fixture([text(phrase)], { message: 'Reply with exactly "' + phrase + '"' });
  eq(copied.r.reply, phrase); eq(copied.m.payloads.length, 1);
});

Deno.test("reliability: acknowledgements cannot bypass unknown imperative work requests", async () => {
  for (const [message, clarification] of [
    ["Prepare an application for me.", "Which posting should I prepare it for?"],
    ["Find jobs near my preferred city.", "Which city should I search?"],
  ]) {
    const { r, m, state } = await fixture([text("Got it."), text(clarification)], { message });
    eq(r.reply, clarification); eq(m.payloads.length, 2); eq(state, {});
  }
});
