# WO-002: The agent brain (model + tools), behind a flag

Status: ready · Depends on: WO-001 · Decisions: D-002 (model; build against env `CAREER_MODEL`, default `gpt-5-mini`), D-008 (flag)
Size cap: ~600 changed lines excluding the architect tests

## Why
The live career chat makes zero model calls: a 10,077-line regex router answers with canned text.
On 45 realistic job-seeker messages it gave 0 correct answers (76% fallback/misroute/garbled).
This order replaces the decision-maker with a model that calls tools. Tools wrap the domain
modules that already work. The router stays the default until the eval says the brain is better.

## Files
- `supabase/functions/_shared/agent/loop.ts` (new) — the loop
- `supabase/functions/_shared/agent/career_tools.ts` (new) — the first 8 tools
- `supabase/functions/_shared/agent/prompt.ts` (new) — `careerSystemPrompt()`, text below, verbatim
- `supabase/functions/agent-chat/career_brain.ts` (new) — `chooseBrain(env)`, `agentTurn(...)`
- `supabase/functions/agent-chat/handler-career.ts` — the flag branch only (see Wiring)
- `tests/architect/pending/wo-002-*.test.ts` → move to `tests/architect/` (do not edit)
- `scripts/gate.sh` — add nothing; the architect tests are already in the gate

## Interfaces (exact)
`loop.ts`
```ts
export type Effect = "read" | "write_own" | "external";
export interface ToolCtx { userId: string; threadId: string; now: number; state: Record<string, unknown> }
export interface ToolSpec { name: string; description: string; input_schema: { type: "object"; properties: Record<string, unknown>; required: string[] }; effect: Effect; run(input: any, ctx: ToolCtx): Promise<unknown> }
export type ModelFn = (payload: { system: string; messages: any[]; tools: { name: string; description: string; input_schema: unknown }[]; max_tokens: number }) => Promise<{ content: any[]; stop_reason: string; usage?: unknown }>;
export const MAX_STEPS_REPLY: string;   // honest, < 300 chars, says nothing was sent
export const MODEL_ERROR_REPLY: string; // honest, < 300 chars, says nothing was sent
export function runAgentTurn(o: { system: string; history: any[]; message: string; tools: ToolSpec[]; model: ModelFn; ctx: ToolCtx; maxSteps?: number /* default 6 */ }): Promise<{
  reply: string; steps: number;
  tool_calls: { name: string; ok: boolean; effect: Effect | null }[];
  pending_approvals: { tool: string; input: unknown; summary: string }[];
  stopped: "final" | "max_steps" | "model_error";
}>;
```
Messages use the Anthropic block shape (`text`, `tool_use`, `tool_result`); `_shared/model_gateway.ts`
already converts that to and from OpenAI. Rules the tests pin: external tools never run (they return
`{"status":"needs_approval"}` to the model and are listed in `pending_approvals`); unknown tools, missing
`required` inputs and thrown errors are `is_error` tool results and the loop continues; a model
failure never throws out of the turn.

`career_tools.ts`
```ts
export function careerTools(deps: { postings: () => Promise<any[]> }): ToolSpec[];
```
The 8 tools and their effects are pinned in `wo-002-career-tools.test.ts`. Each tool is a thin wrapper:
- `get_profile` / `add_profile_fact` / `confirm_profile_fact` → `CareerProfile` (122) on `ctx.state.profile`
  (created with `createProfile({})` when absent). `add_profile_fact` always stores `needs_confirmation: true`.
- `list_applications` / `track_application` → `CareerTrack` (126) on `ctx.state.trackStore`
  (`createMemoryStore([])` when absent); an existing company moves stage (`manualUpdate`), otherwise `addApplication`.
- `search_jobs` → filters `deps.postings()`; returns `{ postings, total, source: "live" }`, or `{ postings: [], source: "none" }`
  for an empty pool. Default limit 10. (WO-005 gives it a real pool and ranking with `scoreFit`.)
- `get_interview_questions` → `CareerPrep.questionBank(...).questions` (first 10); `score_interview_answer` → `CareerPrep.scoreAnswer`.
Import the modules from `../router_core.career.js` (already bundled). No new reply prose in tools: they return data.

`ctx.state` is the CareerHost snapshot's `stores` object (the same keys `career_host.js` persists), so a
thread can move between brains without losing its profile or tracker.

`career_brain.ts`
```ts
export function chooseBrain(env: { get(k: string): string | undefined }): "agent" | "router"; // "agent" only when CAREER_BRAIN === "agent"
export function agentTurn(o: { message: string; history: { role: "user" | "assistant"; content: string }[]; stores: Record<string, unknown>; userId: string; threadId: string; now: number; model: ModelFn; postings?: () => Promise<any[]> }): ReturnType<typeof runAgentTurn>;
```

## Wiring (handler-career.ts)
- `chooseBrain(Deno.env)`; `"router"` keeps today's path byte-for-byte.
- `"agent"`: load the last 20 messages of the thread (role + text) as history; load the career snapshot as today;
  run `agentTurn` with `model = (p) => callModel(modelConfig(Deno.env, "chat") with model = CAREER_MODEL ?? "gpt-5-mini", p, { meter })`;
  save the snapshot back through the host's extract path; save the reply with `meta: { career: true, brain: "agent", tool_calls, stopped, pending_approvals }`.
- If `stopped === "model_error"`, answer with the router instead (log it), so an outage never leaves the user with nothing.
- Record turn cost the way `handler.ts` does (`agent_turn_costs`), since career turns now spend.

## System prompt (prompt.ts, verbatim; `{today}` is the user's local date, YYYY-MM-DD)
```
You are Trainee, a career agent that helps one person get hired: find the right jobs, make their
applications strong and truthful, prepare them for interviews, track every application, and tell them
plainly where they stand. Today is {today}.

How you work:
- Do the thing they asked, for them specifically. Use tools to read and change their real state. If you
  need one missing fact to do it well, ask one short question and offer a sensible default.
- Facts about the user come only from their profile. When they tell you something about themselves, save
  it with add_profile_fact, play it back in a few words and ask if it's right; call confirm_profile_fact
  only after they say yes. Never invent experience, skills, numbers, dates, schools or titles.
- Facts about a job come only from the posting a tool returned. Facts about a company come only from tool
  results. If you don't have it, say you don't, and say how you'd get it.
- Anything that leaves their account (an email, a message, an application) is prepared for their approval,
  never done silently. Say exactly what will go and to whom.
- When a tool returns nothing (no postings, no applications), say so plainly and give the next real step.
- Be direct and warm, like a sharp friend who works in hiring. Answer first. Short paragraphs or a short
  list. No filler, no flattery, no "as an AI". Tell them their real odds and gaps when it helps them.
- You are not a lawyer, doctor or financial adviser; for those, give general information and say who to ask.
```

## Acceptance
- `deno test --no-check tests/architect/` green, including all 17 WO-002 tests.
- `bash scripts/gate.sh` → `GATE OK`.
- With `CAREER_BRAIN` unset, `tests/career-http-host.test.cjs` and every existing career test are unchanged and green.

## Demo (run locally with your own OpenAI key; paste the transcript in the PR)
Set `CAREER_BRAIN=agent`, `OPENAI_API_KEY=<yours>`, call the handler in-process (or `supabase functions serve`)
with these turns in one thread and paste replies plus `tool_calls`:
1. "I'm a registered nurse in Ohio, 6 years in the ICU, want to move into a remote nurse case manager role"
   → saves draft facts, plays them back, asks to confirm.
2. "yes that's right" → confirms them.
3. "any remote case manager jobs?" → calls search_jobs, says honestly there are no live postings yet.
4. "I applied to Cleveland Clinic yesterday for case manager" → track_application.
5. "where do my applications stand?" → list_applications, answers from the row.
6. "give me a mock interview question for case management" → get_interview_questions, asks one question.

## Out of scope
Real job data (WO-005), sending or submitting anything (no external tools yet), deleting 142 (after the eval).
