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
// `show` (WO-033): a tool whose output the person must read exactly (a batch of outreach drafts, each in full) sets it;
// the reply is then code's text, never the model's retelling, and `intent` makes the next text an answer to it. `parts`
// (WO-038's contract): the same text as separate messages, so a texting channel delivers each whole and in order.
// `before` (WO-091b): the previous turn's reply as the person saw it ("" on a first turn), so a tool can check that "the
// first one" is a posting that reply showed. Undefined only for a caller that runs a tool without the loop's history.
export interface ToolCtx { userId: string; threadId: string; now: number; state: Record<string, unknown>; turn?: { message: string; added: string[]; before?: string; show?: { intent: string; text: string; parts?: string[] } } }
export interface ToolSpec {
  name: string;
  description: string;
  input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] };
  effect: Effect;
  run(input: any, ctx: ToolCtx): Promise<unknown>;
}
export type ModelFn = (payload: { system: string; messages: any[]; tools: { name: string; description: string; input_schema: unknown }[]; max_tokens: number; tool_choice?: { type: "none" } }) =>
  Promise<{ content: any[]; stop_reason: string; usage?: unknown }>;
export interface TurnResult {
  reply: string;
  steps: number;
  // WO-080: a failed call carries `error`, its reason cleaned by scrubError; a call that ran carries none.
  tool_calls: { name: string; ok: boolean; effect: Effect | null; error?: string }[];
  pending_approvals: { tool: string; input: unknown; summary: string }[];
  stopped: "final" | "max_steps" | "model_error";
  show?: { intent: string; text: string; parts?: string[] };
}

export const MAX_STEPS_REPLY = "I couldn't finish that in one go, so I stopped partway. Nothing was sent or submitted. Tell me which part to do first.";
export const MODEL_ERROR_REPLY = "I can't answer right now because the AI service isn't responding. Nothing was sent, saved or submitted. Try again in a minute.";
// When a turn saved something before it stopped, it says so: "nothing saved" would be false.
export const MAX_STEPS_AFTER_SAVE_REPLY = "I saved what you told me, but couldn't finish the rest in one go, so I stopped partway. Nothing was sent or submitted. Tell me which part to do next.";
export const MODEL_ERROR_AFTER_SAVE_REPLY = "I saved what you told me, but the AI service stopped responding before I could finish. Nothing was sent or submitted. Try again in a minute.";
// WO-077: a reply never claims a change that did not happen this turn (battery run 39485101366, T12: "Kept for good" after
// only a read). Each kind of claim names the tools that make it true; a sentence that negates, offers or asks is not a
// claim. An unbacked claim is put to the model once (do it, or say it plainly); if it stands, the reply is this one.
export const CLAIM_UNBACKED_REPLY = "I haven't actually done that yet: nothing was saved, set up or queued this time. Tell me again and I'll do it.";
const CLAIMS: { kind: string; said: RegExp; by: string[] | "any_write" }[] = [
  { kind: "an alert set", said: /\b(?:i(?:'ve| have)? (?:set|created|turned on|switched on)(?: up)? (?:an?|your|the) (?:job )?alerts?|alerts? (?:is |are )?(?:now )?(?:set|on|live|active)\b)/i, by: ["set_job_alerts"] },
  { kind: "postings queued", said: /\b(?:(?:were|was|have been|has been|i(?:'ve| have)?|are now) queued\b|queued (?:\d+|them|it|all|these|those)\b|added (?:\d+|them|it|these|those) to your (?:apply )?queue)/i, by: ["queue_applications"] },
  { kind: "an application tracked", said: /\b(?:i(?:'m| am) (?:now )?tracking|now tracking|added (?:it|this|that|them) to your (?:tracker|applications)|(?:is|are) now (?:on|in) your tracker)/i, by: ["track_application"] },
  { kind: "something saved", said: /\b(?:kept for good|saved(?: as\b|:| it\b| that\b| this\b| your\b| for good)|i(?:'ve| have)? (?:saved|kept|noted|remembered|stored|recorded)\b|i(?:'ll| will) (?:keep|remember) (?:that|this|it)\b|(?:saved|kept) as a standing)/i, by: "any_write" },
];
// Only what comes before the claim can negate or condition it ("Nothing was sent, saved…", "If you say yes, I'll queue");
// the instruction quoted after it ("Saved: you never want agencies") cannot. A question is never a claim.
const NEGATED = /\b(?:nothing|not|never|no longer|haven't|hasn't|didn't|couldn't|can't|cannot|won't|unable|if|want me|should i|shall i|do you want|would you like|i can|i could|will|going to|tell you|once|when|after|until)\b|n't\b|'ll\b/i;
// What follows a claim can undo it too: "Saved: none.", "I'll keep it in this conversation" (kept nowhere else).
const UNDONE = /^\s*:?\s*(?:none|nothing)\b|^[^.!?]{0,40}\b(?:in this (?:conversation|chat)|for (?:this|the rest of this) (?:conversation|chat)|for now)\b/i;
export function unbackedClaim(reply: string, calls: { name: string; ok: boolean; effect: Effect | null }[]): string | null {
  const sentences = String(reply || "").split(/(?<=[.!?])\s+|\n+/).map((x) => x.trim()).filter(Boolean);
  const claims = (re: RegExp) => sentences.some((x) => {
    if (/\?\s*$/.test(x)) return false;
    const m = re.exec(x);
    return !!m && !NEGATED.test(x.slice(0, m.index)) && !UNDONE.test(x.slice(m.index + m[0].length));
  });
  for (const c of CLAIMS) {
    if (!claims(c.said)) continue;
    const backed = calls.some((t) => t.ok && (c.by === "any_write" ? t.effect === "write_own" : c.by.includes(t.name)));
    if (!backed) return c.kind;
  }
  return null;
}
// WO-080: a failed tool call's record carries its reason, so a diagnosis starts from the record, not from the code. The
// reason is cleaned first: tokens, keys, long secrets, database URLs, secret-carrying query values, emails and phone
// numbers become [bracketed] placeholders; the words that say what went wrong, and record ids (UUIDs), stay. Pure; at
// most 300 characters.
// (What the model is told about the failure is unchanged.)
export const ERROR_CHARS = 300;
const SCRUB: [RegExp, string][] = [
  [/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[db-url]"],
  [/\b(authorization["']?\s*[:=]\s*)(?:(?:Bearer|Basic|Token|Digest)\s+)?[^\s,;)}\]]+/gi, "$1[redacted]"],
  [/\b(Bearer|Basic)\s+(?=[A-Za-z0-9._~+\/=-]*\d)[A-Za-z0-9._~+\/=-]{8,}/gi, "$1 [token]"],
  [/\beyJ[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]{4,}\.[A-Za-z0-9_-]+/g, "[jwt]"],
  [/\b(?:sk|pk|rk)-[A-Za-z0-9_-]{12,}/g, "[key]"],
  [/\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+/g, "[key]"],
  [/([?&#][^=&\s#"']*(?:secret|token|key|password|passwd|sig|signature|auth|code)[^=&\s#"']*=)[^&\s#"']*/gi, "$1[redacted]"],
  [/\b((?:api[_-]?key|apikey|password|passwd|pwd|secret|token|access[_-]?token|refresh[_-]?token|authorization|client[_-]?secret)["']?\s*[:=]\s*)(?!\[)(?:"[^"]*"|'[^']*'|[^\s,;)}\]]+)/gi, "$1[redacted]"],
  [/[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, "[email]"],
  [/(?<![\w.\/-])\+\d{1,3}[\s.-]?(?:\(\d{1,4}\)|\d{1,4})(?:[\s.-]?\d{2,4}){2,4}(?![\w-])/g, "[phone]"],
  [/(?<![\w.\/-])(?:\([2-9]\d{2}\)|[2-9]\d{2})[\s.-]?\d{3}[\s.-]?\d{4}(?![\w-])/g, "[phone]"],
  [/\b[A-Fa-f0-9]{24,}\b/g, "[secret]"],
  [/(?<![A-Za-z0-9+\/_-])(?![0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}(?![A-Za-z0-9+\/_-]))(?=[A-Za-z0-9+\/_-]*\d)(?=[A-Za-z0-9+\/_-]*[A-Za-z])[A-Za-z0-9+\/_-]{24,}={0,2}/g, "[secret]"],
];
function errorText(e: unknown): string {
  if (e instanceof Error) return e.message || e.name;
  if (typeof e === "string") return e;
  if (e && typeof e === "object" && typeof (e as { message?: unknown }).message === "string") return (e as { message: string }).message;
  try { return JSON.stringify(e) ?? String(e); } catch { return String(e); }
}
export function scrubError(text: string): string {
  let s = errorText(text);
  for (const [re, to] of SCRUB) s = s.replace(re, to);
  s = s.replace(/\s+/g, " ").trim();
  return s.length > ERROR_CHARS ? `${s.slice(0, ERROR_CHARS - 1)}…` : s;
}
// WO-085: a refusal that means "the next move is the person's" (a resume waiting on their yes). The model reads its
// message like any refusal; the loop then forbids tools on the next call, so the model writes the question and the turn
// ends on its words, never on max steps.
export class AskPerson extends Error {}
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
  const last = [...o.history].reverse().find((m) => m && m.role === "assistant");
  const before = !last ? "" : typeof last.content === "string" ? last.content
    : Array.isArray(last.content) ? last.content.filter((b: any) => b && b.type === "text").map((b: any) => String(b.text ?? "")).join("\n") : "";
  o.ctx.turn = { message: o.message, added: [], before };
  const saved = () => tool_calls.some((t) => t.ok && t.effect === "write_own");
  let steps = 0, checked = false, ask = false;
  while (steps < max) {
    steps++;
    let res;
    try { res = await o.model({ system: o.system, messages, tools: toolDefs, max_tokens: MAX_TOKENS, ...(ask ? { tool_choice: { type: "none" } } : {}) }); }
    catch {
      const show = o.ctx.turn?.show; // what the person must read was already made: it is the reply
      if (show) return { reply: show.text, steps, tool_calls, pending_approvals, stopped: "final", show };
      return { reply: saved() ? MODEL_ERROR_AFTER_SAVE_REPLY : MODEL_ERROR_REPLY, steps, tool_calls, pending_approvals, stopped: "model_error" };
    }
    const content = Array.isArray(res && res.content) ? res.content : [];
    const uses = content.filter((b: any) => b && b.type === "tool_use");
    if (!uses.length) {
      const reply = content.filter((b: any) => b && b.type === "text").map((b: any) => b.text).join("").trim();
      const show = o.ctx.turn?.show;
      if (show) return { reply: show.text, steps, tool_calls, pending_approvals, stopped: "final", show };
      const claim = unbackedClaim(reply, tool_calls);
      if (claim && !checked && steps < max) {
        checked = true;
        messages.push({ role: "assistant", content: [{ type: "text", text: reply }] });
        messages.push({ role: "user", content: [{ type: "text", text: `[check, not from the person] Your reply says ${claim}, but no tool that does that succeeded this turn. Either call the tool now, or rewrite the reply without saying it happened.` }] });
        continue;
      }
      return { reply: claim ? CLAIM_UNBACKED_REPLY : reply, steps, tool_calls, pending_approvals, stopped: "final" };
    }
    messages.push({ role: "assistant", content });
    const results: any[] = [];
    for (const u of uses) {
      const t = byName.get(u.name);
      const fail = (effect: Effect | null, msg: string, why: unknown = msg) => { tool_calls.push({ name: u.name, ok: false, effect, error: scrubError(why as string) }); results.push({ type: "tool_result", tool_use_id: u.id, is_error: true, content: msg }); };
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
      } catch (e) { if (e instanceof AskPerson) ask = true; fail(t.effect, e instanceof Error ? e.message : String(e), e); }
    }
    messages.push({ role: "user", content: results });
  }
  const show = o.ctx.turn?.show;
  if (show) return { reply: show.text, steps, tool_calls, pending_approvals, stopped: "final", show };
  return { reply: saved() ? MAX_STEPS_AFTER_SAVE_REPLY : MAX_STEPS_REPLY, steps, tool_calls, pending_approvals, stopped: "max_steps" };
}
