// WO-085 (architect): when a tool says the next move is the person's ("ask them, do not call another tool this turn"),
// code holds it: the model's next call may not use a tool, so it writes the question. Found by the live task battery (T09,
// run 8): after WO-079's refusal named the drafts and the question, the model still called get_profile and
// add_profile_fact, ran out of steps, and the person read "I couldn't finish that in one go". The words stay the model's.
import { AskPerson, runAgentTurn, type ModelFn, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";
import { CareerProfile } from "../../supabase/functions/_shared/router_core.career.js";
import { careerTools } from "../../supabase/functions/_shared/agent/career_tools.ts";
import { edgeRenderer, memoryPersonaStore, memoryResumeStore } from "../../supabase/functions/_shared/career_tailor.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
const call = (id: string, name: string, input: unknown) => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });
const text = (t: string) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
// A model that keeps reaching for tools unless the call forbids them, as gpt models did in T09.
function stubborn(final: string): ModelFn & { payloads: any[] } {
  const payloads: any[] = [];
  let n = 0;
  const fn = (async (p: any) => {
    payloads.push(JSON.parse(JSON.stringify(p)));
    n++;
    if (n === 1) return call("c1", "tailor_resume", { posting_text: "Data Analyst, Acme (TEST)\nRequirements:\n- SQL" });
    if (p.tool_choice?.type === "none") return text(final);
    return call(`c${n}`, "get_profile", {});
  }) as ModelFn & { payloads: any[] };
  fn.payloads = payloads;
  return fn;
}
const tailorTools = () => careerTools({ postings: async () => [], tailor: { posting: async () => null, personas: memoryPersonaStore(), resumes: memoryResumeStore(), render: edgeRenderer() } });

Deno.test("WO-085/1 tailor refuses on drafts: the next model call forbids tools, the turn ends on the model's question, never on max steps", async () => {
  const p = CareerProfile.createProfile({ basics: { name: "Test Person", email: "test.person@example.com" } });
  CareerProfile.addFact(p, { kind: "experience", text: "2 years as a data analyst at a regional bank", needs_confirmation: true, status: "draft" });
  const model = stubborn("Before I make it: is this right? 2 years as a data analyst at a regional bank. Reply yes or correct it.");
  const r = await runAgentTurn({ system: "s", history: [], message: "tailor my resume for this", tools: tailorTools(), model, ctx: { userId: "u", threadId: "t", now: 0, state: { profile: p } } });
  assert(r.stopped === "final", `ended on the model's words, not ${r.stopped}`);
  assert(/is this right/.test(r.reply), r.reply);
  assert(model.payloads[1]?.tool_choice?.type === "none", `the call after the refusal forbids tools: ${JSON.stringify(model.payloads[1]?.tool_choice)}`);
  assert(!r.tool_calls.some((t) => t.name === "get_profile"), "no tool after the refusal");
});

Deno.test("WO-085/2 an ordinary refusal still lets the model try again with tools", async () => {
  const flaky: ToolSpec = { name: "flaky", description: "x", effect: "read", input_schema: { type: "object", properties: {}, required: [] }, run: async () => { throw new Error("not now"); } };
  const payloads: any[] = [];
  const responses = [call("a", "flaky", {}), text("done")];
  const model = (async (p: any) => { payloads.push(p); return responses.shift(); }) as ModelFn;
  const r = await runAgentTurn({ system: "s", history: [], message: "hi", tools: [flaky], model, ctx: { userId: "u", threadId: "t", now: 0, state: {} } });
  assert(r.stopped === "final" && payloads[1].tool_choice === undefined, JSON.stringify(payloads[1].tool_choice));
});

Deno.test("WO-085/3 AskPerson is an Error whose message the model reads like any refusal", () => {
  const e = new AskPerson("ask them");
  assert(e instanceof Error && e.message === "ask them");
});
