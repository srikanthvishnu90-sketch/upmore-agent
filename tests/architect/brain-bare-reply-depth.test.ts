// Provider-completion regressions. All conversations, providers and effects are local synthetic fixtures.
import { runAgentTurn, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";
import { callModel, fromOpenAI, newMeter } from "../../supabase/functions/_shared/model_gateway.ts";

function eq(got: unknown, expected: unknown, why = "") {
  if (JSON.stringify(got) !== JSON.stringify(expected)) throw new Error(`${why}: got ${JSON.stringify(got)}, expected ${JSON.stringify(expected)}`);
}
function ok(value: unknown, why: string): asserts value { if (!value) throw new Error(why); }
const QUESTION = "Compare the two postings by responsibilities and schedule.";
const COMPLETE = "The first posting focuses on reporting on weekdays. The second focuses on payroll on weekends.";
const text = (reply: string, reason = "end_turn") => ({ content: [{ type: "text", text: reply }], stop_reason: reason });
const cut = (reply: string) => fromOpenAI({ choices: [{ message: { content: reply }, finish_reason: "length" }] });
const call = () => ({ content: [{ type: "tool_use", id: "save-fixture", name: "save_fixture", input: {} }], stop_reason: "tool_use" });
const gatewayCall = (reason: string) => fromOpenAI({ choices: [{ message: { content: "", tool_calls: [
  { id: "save-fixture", type: "function", function: { name: "save_fixture", arguments: "{}" } },
] }, finish_reason: reason }] });
async function run(responses: any[], options: { maxSteps?: number; show?: boolean } = {}) {
  let saves = 0;
  const payloads: any[] = [];
  const tool: ToolSpec = { name: "save_fixture", effect: "write_own", description: "Synthetic save", input_schema: { type: "object", properties: {}, required: [] },
    run: async (_i, c) => { saves++; if (options.show) c.turn!.show = { intent: "SYNTHETIC_SHOW", text: "Synthetic exact preview." }; return { saved: true }; } };
  const result = await runAgentTurn({ system: "Use only the supplied synthetic posting details.", message: QUESTION, history: [], tools: [tool], maxSteps: options.maxSteps,
    ctx: { userId: "SYNTHETIC-DEPTH-OWNER", threadId: "SYNTHETIC-DEPTH-THREAD", now: 0, state: {} },
    model: async (p) => { payloads.push(structuredClone(p)); return responses[Math.min(payloads.length - 1, responses.length - 1)]; } });
  return { result, payloads, saves };
}

Deno.test("reply depth: provider token truncation cannot be labelled a complete answer", async () => {
  const { result, payloads, saves } = await run([cut("Compare the two postings by responsibilities and"), text(COMPLETE)]);
  eq(result.reply, COMPLETE); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 0);
  eq(payloads[1].tool_choice, { type: "none" });
  eq(payloads[1].messages, payloads[0].messages, "truncated output is not conversation evidence");
});

Deno.test("reply depth: repeated truncated output stops after one text-only repair", async () => {
  const { result, payloads } = await run([cut("Read the first posting.")]);
  eq(result.stopped, "incomplete_reply"); eq(payloads.length, 2);
  ok(result.reply !== "Read the first posting.", "a provider-declared partial response escaped as the answer");
});

Deno.test("reply depth: truncation after a completed save never repeats or denies the save", async () => {
  const { result, payloads, saves } = await run([call(), cut("The comparison is"), cut("The comparison is")]);
  eq(result.stopped, "incomplete_reply"); eq(payloads.length, 3); eq(saves, 1);
  eq(result.tool_calls.length, 1); eq(result.pending_approvals, []);
  ok(!/nothing.{0,10}saved/i.test(result.reply), "completed save was denied");
});

Deno.test("reply depth: no remaining step budget prevents a truncation repair call", async () => {
  const { result, payloads } = await run([cut("The first posting is")], { maxSteps: 1 });
  eq(result.stopped, "incomplete_reply"); eq(payloads.length, 1);
});

Deno.test("reply depth: a truncated provider response cannot execute embedded tool calls", async () => {
  const truncated = { ...call(), stop_reason: "max_tokens" };
  const { result, payloads, saves } = await run([truncated, text(COMPLETE)]);
  eq(result.reply, COMPLETE); eq(payloads.length, 2); eq(saves, 0); eq(result.tool_calls, []); eq(result.pending_approvals, []);
});

Deno.test("reply depth: OpenAI length remains truncated even beside a fully parsed tool call", async () => {
  const truncated = gatewayCall("length");
  eq(truncated.stop_reason, "max_tokens"); eq(truncated.content, [], "other gateway callers cannot consume even a parsed truncated call");
  const { result, payloads, saves } = await run([truncated, text(COMPLETE)]);
  eq(result.reply, COMPLETE); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 0);
  eq(result.tool_calls, []); eq(result.pending_approvals, []); eq(payloads[1].tool_choice, { type: "none" });
});

Deno.test("reply depth: an OpenAI completed tool call still executes once", async () => {
  const { result, payloads, saves } = await run([gatewayCall("tool_calls"), text(COMPLETE)]);
  eq(result.reply, COMPLETE); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
  eq(result.tool_calls.length, 1); eq(result.tool_calls[0].ok, true);
});

Deno.test("reply depth: provider truncation leaves an already generated exact preview authoritative", async () => {
  const { result, payloads, saves } = await run([call(), cut("A partial retelling")], { show: true });
  eq(result.reply, "Synthetic exact preview."); eq(result.show?.text, "Synthetic exact preview."); eq(payloads.length, 2); eq(saves, 1);
});

Deno.test("reply depth: completed short text and explicit refusal are not truncation", async () => {
  for (const reply of [text("Read both postings."), text("I cannot submit an application without your approval.", "refusal")]) {
    const { result, payloads } = await run([reply]);
    eq(result.reply, reply.content[0].text); eq(result.stopped, "final"); eq(payloads.length, 1);
  }
});

const wireCall = (name: string, args: string) => ({ id: name, type: "function", function: { name, arguments: args } });
const wire = (reason: string, calls: any[] = [], reply: string | null = null) => ({
  model: "gpt-5-mini", choices: [{ finish_reason: reason, message: { content: reply, tool_calls: calls } }],
  usage: { prompt_tokens: 100, completion_tokens: 50 },
});
async function providerRun(responses: any[], show = false) {
  let saves = 0, external = 0;
  const payloads: any[] = [], health: any[] = [], meter = newMeter();
  const tools: ToolSpec[] = [
    { name: "save_fixture", effect: "write_own", description: "Synthetic save", input_schema: { type: "object", properties: {}, required: [] },
      run: async (_i, c) => { saves++; if (show) c.turn!.show = { intent: "SYNTHETIC_SHOW", text: "Synthetic exact preview." }; return { saved: true }; } },
    { name: "external_fixture", effect: "external", description: "Synthetic external effect", input_schema: { type: "object", properties: {}, required: [] },
      run: async () => { external++; return {}; } },
  ];
  const result = await runAgentTurn({ system: "Use supplied synthetic posting information only.", history: [], message: QUESTION, tools,
    ctx: { userId: "SYNTHETIC-DEPTH-OWNER", threadId: "SYNTHETIC-DEPTH-THREAD", now: 0, state: {} },
    model: async (p) => callModel({ provider: "openai", model: "gpt-5-mini", apiKey: "synthetic-unusable-key", reasoningEffort: "minimal" }, p, {
      meter, health: (e) => { health.push(e); }, request: (async (_url, init) => {
        payloads.push(JSON.parse(String(init!.body)));
        return Response.json(responses[Math.min(payloads.length - 1, responses.length - 1)]);
      }) as typeof fetch,
    }),
  });
  return { result, payloads, saves, external, health, meter };
}

Deno.test("reply depth: partial tool JSON under length is discarded before decode and both wire calls remain metered", async () => {
  const { result, payloads, saves, health, meter } = await providerRun([
    wire("length", [wireCall("save_fixture", '{"note":"unfinished')]), wire("stop", [], COMPLETE),
  ]);
  eq(result.reply, COMPLETE); eq(result.stopped, "final"); eq(payloads.length, 2); eq(payloads[1].tool_choice, "none");
  eq(saves, 0); eq(result.tool_calls, []); eq(result.pending_approvals, []);
  eq([meter.calls, meter.failed, meter.input_tokens, meter.output_tokens, meter.usd_micros], [2, 0, 200, 100, 250]);
  eq(health.map((e) => [e.ok, e.error_type]), [[true, null], [true, null]]);
});

Deno.test("reply depth: mixed complete and partial tool JSON under length cannot execute or enqueue either call", async () => {
  const { result, payloads, saves, external } = await providerRun([
    wire("length", [wireCall("save_fixture", "{}"), wireCall("external_fixture", '{"to":')]), wire("stop", [], COMPLETE),
  ]);
  eq(result.reply, COMPLETE); eq(payloads.length, 2);
  eq([saves, external, result.tool_calls.length, result.pending_approvals.length], [0, 0, 0, 0]);
});

Deno.test("reply depth: repeated partial tool JSON gets one repair and an honest incomplete result", async () => {
  const { result, payloads, saves, external, meter } = await providerRun([
    wire("length", [wireCall("save_fixture", '{"note":')]),
  ]);
  eq(result.stopped, "incomplete_reply"); eq(payloads.length, 2); eq(payloads[1].tool_choice, "none");
  eq([saves, external, result.tool_calls.length, result.pending_approvals.length], [0, 0, 0, 0]);
  eq(meter.usd_micros, 250, "failed completion does not erase provider token cost");
});

Deno.test("reply depth: malformed completed tool JSON is a provider error with no effects or blind retry", async () => {
  const { result, payloads, saves, external, health } = await providerRun([
    wire("tool_calls", [wireCall("save_fixture", "{}"), wireCall("external_fixture", '{"to":')]), wire("stop", [], COMPLETE),
  ]);
  eq(result.stopped, "model_error"); eq(payloads.length, 1); eq(health[0].error_type, "bad_tool_call");
  eq([saves, external, result.tool_calls.length, result.pending_approvals.length], [0, 0, 0, 0]);
});

Deno.test("reply depth: malformed truncated retelling preserves an existing exact preview and its single save", async () => {
  const { result, payloads, saves, meter } = await providerRun([
    wire("tool_calls", [wireCall("save_fixture", "{}")]), wire("length", [wireCall("save_fixture", '{"note":')]),
  ], true);
  eq(result.reply, "Synthetic exact preview."); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
  eq(meter.usd_micros, 250, "preview delivery retains both provider calls' usage");
});
