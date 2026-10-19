// The agent loop (WO-002): the model decides what to do, code enforces it. Each turn the model reads the conversation
// and the tools' schemas, calls tools, and writes the reply. Policy lives here, at the tool boundary:
//   read       runs freely
//   write_own  changes only this person's own state; runs freely
//   external   touches the world (send, submit, message); NEVER runs here. It becomes a pending approval the
//              person approves on its exact payload (WO-005), and the model is told it is waiting.
// Messages use the Anthropic block shape (text / tool_use / tool_result); _shared/model_gateway.ts converts to OpenAI.
export type Effect = "read" | "write_own" | "external";
// `turn` is this turn's own record, filled by runAgentTurn: the person's message (a confirmation must come from it) and
// the ids of facts added during the turn (a fact can never be confirmed in the turn that added it).
export interface ToolCtx { userId: string; threadId: string; now: number; state: Record<string, unknown>; turn?: { message: string; added: string[] } }
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
  effect: Effect;
  run(input: any, ctx: ToolCtx): Promise<unknown>;
}
export type ModelFn = (payload: { system: string; messages: any[]; tools: { name: string; description: string; input_schema: unknown }[]; max_tokens: number }) =>
  Promise<{ content: any[]; stop_reason: string; usage?: unknown }>;
export interface TurnResult {
  reply: string;
  steps: number;
  tool_calls: { name: string; ok: boolean; effect: Effect | null }[];
  pending_approvals: { tool: string; input: unknown; summary: string }[];
  stopped: "final" | "max_steps" | "model_error";
}

export const MAX_STEPS_REPLY = "I couldn't finish that in one go, so I stopped partway. Nothing was sent or submitted. Tell me which part to do first.";
export const MODEL_ERROR_REPLY = "I can't answer right now because the AI service isn't responding. Nothing was sent, saved or submitted. Try again in a minute.";
// When a turn saved something before it stopped, it says so: "nothing saved" would be false.
export const MAX_STEPS_AFTER_SAVE_REPLY = "I saved what you told me, but couldn't finish the rest in one go, so I stopped partway. Nothing was sent or submitted. Tell me which part to do next.";
export const MODEL_ERROR_AFTER_SAVE_REPLY = "I saved what you told me, but the AI service stopped responding before I could finish. Nothing was sent or submitted. Try again in a minute.";
const MAX_TOKENS = 1200;
const RESULT_CHARS = 12000; // a tool result larger than this is cut, and the cut is said

function resultText(v: unknown): string {
  let s: string;
  try { s = typeof v === "string" ? v : JSON.stringify(v ?? null); } catch { s = String(v); }
  return s.length > RESULT_CHARS ? `${s.slice(0, RESULT_CHARS)}… [cut: ${s.length - RESULT_CHARS} more characters]` : s;
}

export async function runAgentTurn(o: { system: string; history: any[]; message: string; tools: ToolSpec[]; model: ModelFn; ctx: ToolCtx; maxSteps?: number }): Promise<TurnResult> {
  const max = o.maxSteps ?? 6;
  const byName = new Map(o.tools.map((t) => [t.name, t]));
  const toolDefs = o.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.input_schema }));
  const messages: any[] = [...o.history, { role: "user", content: [{ type: "text", text: o.message }] }];
  const tool_calls: TurnResult["tool_calls"] = [], pending_approvals: TurnResult["pending_approvals"] = [];
  o.ctx.turn = { message: o.message, added: [] };
  const saved = () => tool_calls.some((t) => t.ok && t.effect === "write_own");
  let steps = 0;
  while (steps < max) {
    steps++;
    let res;
    try { res = await o.model({ system: o.system, messages, tools: toolDefs, max_tokens: MAX_TOKENS }); }
    catch { return { reply: saved() ? MODEL_ERROR_AFTER_SAVE_REPLY : MODEL_ERROR_REPLY, steps, tool_calls, pending_approvals, stopped: "model_error" }; }
    const content = Array.isArray(res && res.content) ? res.content : [];
    const uses = content.filter((b: any) => b && b.type === "tool_use");
    if (!uses.length) {
      const reply = content.filter((b: any) => b && b.type === "text").map((b: any) => b.text).join("").trim();
      return { reply, steps, tool_calls, pending_approvals, stopped: "final" };
    }
    messages.push({ role: "assistant", content });
    const results: any[] = [];
    for (const u of uses) {
      const t = byName.get(u.name);
      const fail = (effect: Effect | null, msg: string) => { tool_calls.push({ name: u.name, ok: false, effect }); results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: msg }); };
      if (!t) { fail(null, `unknown tool: ${u.name}`); continue; }
      const input = u.input && typeof u.input === "object" ? u.input : {};
      const missing = (t.input_schema.required || []).filter((k) => input[k] === undefined || input[k] === null || input[k] === "");
      if (missing.length) { fail(t.effect, `missing required input: ${missing.join(", ")}`); continue; }
      if (t.effect === "external") {
        pending_approvals.push({ tool: t.name, input: JSON.parse(JSON.stringify(input)), summary: t.description });
        tool_calls.push({ name: t.name, ok: true, effect: t.effect });
        results.push({ type: "tool_result", tool_use_id: u.id, content: JSON.stringify({ status: "needs_approval", note: "Nothing has been sent. The person must approve this exact action first." }) });
        continue;
      }
      try {
        const out = await t.run(input, o.ctx);
        tool_calls.push({ name: t.name, ok: true, effect: t.effect });
        results.push({ type: "tool_result", tool_use_id: u.id, content: resultText(out) });
      } catch (e) { fail(t.effect, e instanceof Error ? e.message : String(e)); }
    }
    messages.push({ role: "user", content: results });
  }
  return { reply: saved() ? MAX_STEPS_AFTER_SAVE_REPLY : MAX_STEPS_REPLY, steps, tool_calls, pending_approvals, stopped: "max_steps" };
}
