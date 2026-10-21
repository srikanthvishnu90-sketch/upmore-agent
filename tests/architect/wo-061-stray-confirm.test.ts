// WO-061 (H002, H009; traced run 39588330975): "Is that right?" is for a draft fact saved this turn. With none saved (a
// refused save, a thank-you, a tracker update), the question points at nothing: it goes to the model once in code's
// review, and code removes what stands after that unless nothing else would be left. Synthetic data; a scripted model.
import { runAgentTurn, type ModelFn, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";
import { strayConfirm } from "../../supabase/functions/_shared/agent/reply_guards.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const text = (t: string) => ({ content: [{ type: "text", text: t }], stop_reason: "end_turn" });
const call = (id: string, name: string, input: unknown) => ({ content: [{ type: "tool_use", id, name, input }], stop_reason: "tool_use" });
function scripted(responses: any[]): ModelFn & { payloads: any[] } {
  const payloads: any[] = [];
  const fn = (async (p: any) => { payloads.push(JSON.parse(JSON.stringify(p))); const r = responses.shift(); if (!r) throw new Error("ran out"); return r; }) as ModelFn & { payloads: any[] };
  fn.payloads = payloads;
  return fn;
}
const addFact: ToolSpec = { name: "add_profile_fact", description: "add", effect: "write_own", input_schema: { type: "object", properties: {}, required: [] }, run: async (_i, c) => { c.turn?.added.push("F-009"); return { id: "F-009" }; } };
const track: ToolSpec = { name: "track_application", description: "track", effect: "write_own", input_schema: { type: "object", properties: {}, required: [] }, run: async () => ({ application: { company: "Northfield Labs", stage: "Interview rounds" } }) };
const turn = (m: ModelFn, message: string, tools: ToolSpec[] = [addFact, track]) =>
  runAgentTurn({ system: "SYSTEM", history: [], message, tools, model: m, ctx: { userId: "TEST-U", threadId: "TH", now: Date.UTC(2026, 9, 21, 15), state: {} } });

Deno.test("WO-061/C1 the guard finds a short confirm question, and nothing else", () => {
  eq(strayConfirm("You're welcome.\n\nIs that right?"), [1]);
  eq(strayConfirm("Recorded: Northfield Labs, interview rounds. Is that correct?"), [1]);
  eq(strayConfirm("Did I get that right?"), [0]);
  eq(strayConfirm("Is the onsite in Denver or remote?"), [], "a real question is not a confirm question");
  eq(strayConfirm("Want me to search analyst roles in Denver now?"), []);
});

Deno.test("WO-061/C2 no draft saved this turn: the confirm question goes to the model once, tools off; its rewrite is the reply", async () => {
  const m = scripted([text("You're welcome.\n\nIs that right?"), text("You're welcome. Want me to search analyst roles in Denver next?")]);
  const r = await turn(m, "thanks!!");
  eq(r.reply, "You're welcome. Want me to search analyst roles in Denver next?");
  eq(m.payloads[1].tool_choice, { type: "none" });
  assert(/no draft fact was saved this turn/.test(m.payloads[1].system), "the note is in that call's system prompt");
  eq(m.payloads[1].messages.at(-1), { role: "user", content: [{ type: "text", text: "thanks!!" }] }, "the conversation is as the person left it");
});

Deno.test("WO-061/C3 what stands after the check is removed by code; a reply that is only the question is left alone", async () => {
  const r = await turn(scripted([call("t1", "track_application", {}), text("Recorded: Northfield Labs, onsite next. Is that right?"), text("Recorded: Northfield Labs, onsite next. Is that right?")]), "moved to the onsite with northfield labs");
  eq(r.reply, "Recorded: Northfield Labs, onsite next.", "a tracker update needs no yes");
  const bare = await turn(scripted([text("Is that right?"), text("Is that right?")]), "ok");
  eq(bare.reply, "Is that right?", "never an empty reply");
});

Deno.test("WO-061/C4 a draft saved this turn: the confirm question is what it is for, and is left alone", async () => {
  const m = scripted([call("t1", "add_profile_fact", {}), text("Saved: data analyst roles in Denver. Is that right?")]);
  const r = await turn(m, "I'm looking for data analyst roles in Denver");
  eq(r.reply, "Saved: data analyst roles in Denver. Is that right?");
  eq(m.payloads.length, 2, "no review call");
});
