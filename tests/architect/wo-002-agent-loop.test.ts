// WO-002 acceptance tests (architect-authored; Codex makes them pass, never edits them).
// The agent loop: the model decides, code enforces. Contract in docs/architect/work-orders/WO-002.md.
// Run: deno test --no-check tests/architect/
import {
  runAgentTurn,
  MAX_STEPS_REPLY,
  MODEL_ERROR_REPLY,
  type ToolSpec,
  type ModelFn,
} from "../../supabase/functions/_shared/agent/loop.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

const ctx = () => ({ userId: "u1", threadId: "t1", now: Date.UTC(2026, 9, 18, 15), state: {} as Record<string, unknown> });
const text = (t: string) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
const call = (id: string, name: string, input: unknown) => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });

// A scripted model: returns the queued responses in order and records every payload it was sent.
function scripted(responses: any[]): ModelFn & { payloads: any[] } {
  const payloads: any[] = [];
  const fn = (async (p: any) => {
    payloads.push(JSON.parse(JSON.stringify(p)));
    const r = responses.shift();
    if (!r) throw new Error("scripted model ran out of responses");
    if (r instanceof Error) throw r;
    return r;
  }) as ModelFn & { payloads: any[] };
  fn.payloads = payloads;
  return fn;
}

const runs: string[] = [];
const readTool: ToolSpec = {
  name: "get_profile", description: "Read the user's profile.", effect: "read",
  input_schema: { type: "object", properties: {}, required: [] },
  run: async () => { runs.push("get_profile"); return { name: "Ana", target: "data analyst" }; },
};
const writeTool: ToolSpec = {
  name: "update_application", description: "Update an application's stage.", effect: "write_own",
  input_schema: { type: "object", properties: { company: { type: "string" }, stage: { type: "string" } }, required: ["company", "stage"] },
  run: async (input: any, c) => { runs.push("update_application"); (c.state as any).last = input; return { ok: true }; },
};
const sendTool: ToolSpec = {
  name: "send_email", description: "Send an email from the user's account.", effect: "external",
  input_schema: { type: "object", properties: { to: { type: "string" }, body: { type: "string" } }, required: ["to", "body"] },
  run: async () => { runs.push("send_email"); return { sent: true }; },
};
const boomTool: ToolSpec = {
  name: "boom", description: "Always throws.", effect: "read",
  input_schema: { type: "object", properties: {}, required: [] },
  run: async () => { throw new Error("db down"); },
};
const tools = [readTool, writeTool, sendTool, boomTool];
const base = (model: ModelFn, extra: Record<string, unknown> = {}) => ({ system: "SYSTEM", history: [], message: "hi", tools, model, ctx: ctx(), ...extra });

Deno.test("WO-002/1 a plain answer: one model call, the text is the reply, no tools run", async () => {
  runs.length = 0;
  const m = scripted([text("  Hello Ana.  ")]);
  const r = await runAgentTurn(base(m));
  eq(r.reply, "Hello Ana.");
  eq(r.stopped, "final");
  eq(r.steps, 1);
  eq(runs, []);
  eq(m.payloads.length, 1);
});

Deno.test("WO-002/2 the model gets the system prompt, the history, the new message last, and every tool's schema", async () => {
  const m = scripted([text("ok")]);
  const history = [{ role: "user", content: "earlier" }, { role: "assistant", content: "earlier reply" }];
  await runAgentTurn(base(m, { history, message: "find me jobs" }));
  const p = m.payloads[0];
  eq(p.system, "SYSTEM");
  eq(p.messages.slice(0, 2), history);
  const last = p.messages[p.messages.length - 1];
  eq(last.role, "user");
  assert(JSON.stringify(last.content).includes("find me jobs"), "the new message is the last user turn");
  eq(p.tools.map((t: any) => t.name), ["get_profile", "update_application", "send_email", "boom"]);
  assert(p.tools.every((t: any) => t.input_schema && t.description), "each tool carries its schema and description");
  assert(p.tools.every((t: any) => !("run" in t) && !("effect" in t)), "only name, description and input_schema go to the model");
});

Deno.test("WO-002/3 a read tool runs, its result goes back as a tool_result, then the final text is the reply", async () => {
  runs.length = 0;
  const m = scripted([call("c1", "get_profile", {}), text("You're targeting data analyst roles.")]);
  const r = await runAgentTurn(base(m));
  eq(runs, ["get_profile"]);
  eq(r.reply, "You're targeting data analyst roles.");
  eq(r.steps, 2);
  eq(r.tool_calls, [{ name: "get_profile", ok: true, effect: "read" }]);
  const second = m.payloads[1].messages;
  const resultTurn = second[second.length - 1];
  eq(resultTurn.role, "user");
  const block = resultTurn.content.find((b: any) => b.type === "tool_result");
  eq(block.tool_use_id, "c1");
  assert(String(block.content).includes("data analyst"), "the tool's result is passed back to the model");
  const assistantTurn = second[second.length - 2];
  eq(assistantTurn.role, "assistant");
  assert(assistantTurn.content.some((b: any) => b.type === "tool_use" && b.id === "c1"), "the model's own tool call is kept in the transcript");
});

Deno.test("WO-002/4 a write_own tool runs with the turn's ctx and can change the user's own state", async () => {
  runs.length = 0;
  const c = ctx();
  const m = scripted([call("c1", "update_application", { company: "Stripe", stage: "Interview rounds" }), text("Moved Stripe to interviews.")]);
  const r = await runAgentTurn(base(m, { ctx: c }));
  eq(runs, ["update_application"]);
  eq((c.state as any).last, { company: "Stripe", stage: "Interview rounds" });
  eq(r.tool_calls, [{ name: "update_application", ok: true, effect: "write_own" }]);
});

Deno.test("WO-002/5 an external tool NEVER runs inside the loop: it becomes a pending approval and the model is told so", async () => {
  runs.length = 0;
  const m = scripted([call("c1", "send_email", { to: "recruiter@stripe.com", body: "Hi" }), text("Here's the email. Approve it and I'll send it.")]);
  const r = await runAgentTurn(base(m));
  eq(runs, [], "send_email.run must not be called");
  eq(r.pending_approvals.length, 1);
  eq(r.pending_approvals[0].tool, "send_email");
  eq(r.pending_approvals[0].input, { to: "recruiter@stripe.com", body: "Hi" });
  eq(r.tool_calls, [{ name: "send_email", ok: true, effect: "external" }]);
  const msgs = m.payloads[1].messages;
  const block = msgs[msgs.length - 1].content.find((b: any) => b.type === "tool_result");
  assert(/needs_approval/.test(String(block.content)), "the model learns the action awaits the user's approval");
  eq(r.reply, "Here's the email. Approve it and I'll send it.");
});

Deno.test("WO-002/6 an unknown tool, missing required input, or a throwing tool is an is_error result; the loop continues", async () => {
  runs.length = 0;
  const m = scripted([
    { content: [
      { type: "tool_use", id: "a", name: "no_such_tool", input: {} },
      { type: "tool_use", id: "b", name: "update_application", input: { company: "Stripe" } },
      { type: "tool_use", id: "c", name: "boom", input: {} },
    ], stop_reason: "tool_use" },
    text("Something went wrong saving that; nothing changed."),
  ]);
  const r = await runAgentTurn(base(m));
  eq(runs, [], "a tool with missing required input must not run");
  const msgs = m.payloads[1].messages;
  const results = msgs[msgs.length - 1].content.filter((b: any) => b.type === "tool_result");
  eq(results.map((b: any) => [b.tool_use_id, !!b.is_error]), [["a", true], ["b", true], ["c", true]]);
  assert(/stage/.test(String(results[1].content)), "the missing field is named");
  assert(/db down/.test(String(results[2].content)), "the thrown error message is passed back");
  eq(r.tool_calls.map((t) => [t.name, t.ok]), [["no_such_tool", false], ["update_application", false], ["boom", false]]);
  eq(r.stopped, "final");
});

Deno.test("WO-002/7 the loop stops at maxSteps and never calls the model again", async () => {
  const forever = Array.from({ length: 20 }, (_, i) => call(`c${i}`, "get_profile", {}));
  const m = scripted(forever);
  const r = await runAgentTurn(base(m, { maxSteps: 3 }));
  eq(m.payloads.length, 3);
  eq(r.stopped, "max_steps");
  eq(r.reply, MAX_STEPS_REPLY);
  const d = scripted(Array.from({ length: 20 }, (_, i) => call(`d${i}`, "get_profile", {})));
  await runAgentTurn(base(d));
  eq(d.payloads.length, 6, "default maxSteps is 6");
});

Deno.test("WO-002/8 a model failure never throws out of the turn: the reply is MODEL_ERROR_REPLY", async () => {
  const m = scripted([new Error("HTTP 500")]);
  const r = await runAgentTurn(base(m));
  eq(r.stopped, "model_error");
  eq(r.reply, MODEL_ERROR_REPLY);
  const late = scripted([call("c1", "get_profile", {}), new Error("timeout")]);
  const r2 = await runAgentTurn(base(late));
  eq(r2.stopped, "model_error");
  eq(r2.tool_calls, [{ name: "get_profile", ok: true, effect: "read" }], "tool calls made before the failure are still reported");
});

Deno.test("WO-002/9 text the model writes alongside tool calls is not the reply; only the final turn's text is", async () => {
  const m = scripted([
    { content: [{ type: "text", text: "Let me check." }, { type: "tool_use", id: "c1", name: "get_profile", input: {} }], stop_reason: "tool_use" },
    text("Done: you're set for data analyst roles."),
  ]);
  const r = await runAgentTurn(base(m));
  eq(r.reply, "Done: you're set for data analyst roles.");
});

Deno.test("WO-002/10 MAX_STEPS_REPLY and MODEL_ERROR_REPLY are honest: nothing claimed done, nothing sent", () => {
  for (const s of [MAX_STEPS_REPLY, MODEL_ERROR_REPLY]) {
    assert(typeof s === "string" && s.length > 20 && s.length < 300, "a short sentence");
    assert(!/\b(sent|submitted|applied|done)\b/i.test(s) || /\bnot\b|\bnothing\b/i.test(s), "it never claims an action happened");
  }
});
