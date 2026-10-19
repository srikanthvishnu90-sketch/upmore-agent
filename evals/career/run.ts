// Eval runner and rubric judge (WO-003). Scores a brain (the CareerHost router or the agent) on the architect-owned set
// evals/career/messages.json. Each item runs in a fresh thread through the same conversation interface the product uses;
// a model judge grades the last reply (and the end state, where the item names one) against must / must_not.
//
//   deno run -A evals/career/run.ts --brain router|agent --label <label> [--only E001,E002]
//
// Needs OPENAI_API_KEY (the judge; and the agent brain). Without it: NOT RUN, exit 2. A score is never faked.
// Results: evals/career/results/<label>.json, plus the pass rate and failing ids on stdout.
export interface EvalItem { id: string; persona: string; turns: string[]; must: string[]; must_not?: string[]; state?: string }
export type Brain = (turns: string[]) => Promise<{ replies: string[]; state: unknown }>;
export type Judge = (item: EvalItem, lastReply: string, state: unknown) => Promise<{ pass: boolean; failed: string[]; score: number; note: string }>;
export interface EvalItemResult { id: string; pass: boolean; failed: string[]; score: number; replies: string[]; note: string }
export interface EvalResult { total: number; passed: number; pass_rate: number; items: EvalItemResult[] }

export async function runEval(items: EvalItem[], brain: Brain, judge: Judge): Promise<EvalResult> {
  const out: EvalItemResult[] = [];
  for (const it of items) {
    let replies: string[] = [], state: unknown = null;
    try { const r = await brain(it.turns); replies = r.replies; state = r.state; }
    catch (e) { out.push({ id: it.id, pass: false, failed: it.must, score: 1, replies, note: `brain error: ${e instanceof Error ? e.message : String(e)}` }); continue; }
    try {
      const j = await judge(it, replies[replies.length - 1] ?? "", state);
      out.push({ id: it.id, pass: !!j.pass, failed: j.failed || [], score: Number(j.score) || 1, replies, note: j.note || "" });
    } catch (e) {
      out.push({ id: it.id, pass: false, failed: it.must, score: 1, replies, note: `judge error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const passed = out.filter((x) => x.pass).length;
  return { total: out.length, passed, pass_rate: out.length ? passed / out.length : 0, items: out };
}

export const JUDGE_PROMPT = `You grade one reply from a career agent. You are strict and literal.
User persona: {persona}
Conversation (user turns in order): {turns}
Agent's final reply: {reply}
End state after the conversation (JSON, may be null): {state}
Required (every one must hold): {must}
Forbidden (none may happen): {must_not}
Expected end state (if given): {state_expectation}
Return JSON only: {"pass": boolean, "failed": [the exact required/forbidden/state items that failed], "score": 1-5 for overall usefulness to this person, "note": one sentence}.
pass is true only if every required item holds, no forbidden item happens, and the expected end state (if given) holds.`;

export function judgePrompt(item: EvalItem, reply: string, state: unknown): string {
  const fill: Record<string, string> = {
    persona: item.persona, turns: JSON.stringify(item.turns), reply, state: JSON.stringify(state ?? null).slice(0, 6000),
    must: JSON.stringify(item.must), must_not: JSON.stringify(item.must_not || []), state_expectation: item.state || "(none)",
  };
  return JUDGE_PROMPT.replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? "");
}

export function parseJudge(text: string): { pass: boolean; failed: string[]; score: number; note: string } {
  const m = /\{[\s\S]*\}/.exec(text || "");
  if (!m) throw new Error("judge returned no JSON");
  const j = JSON.parse(m[0]);
  if (typeof j.pass !== "boolean") throw new Error("judge JSON has no boolean pass");
  return { pass: j.pass, failed: Array.isArray(j.failed) ? j.failed.map(String) : [], score: Math.max(1, Math.min(5, Number(j.score) || 1)), note: String(j.note || "") };
}

// ---------------------------------------------------------------------------------------------------- CLI
if (import.meta.main) {
  const args = Deno.args, opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? null : null; };
  const brainName = opt("--brain") || "router", label = opt("--label") || `${brainName}-${new Date().toISOString().slice(0, 10)}`;
  if (!Deno.env.get("OPENAI_API_KEY")) { console.log("NOT RUN: no OPENAI_API_KEY (the judge needs it)."); Deno.exit(2); }
  const { handleInbound, memoryStore } = await import("../../supabase/functions/_shared/conversation.ts");
  const core = await import("../../supabase/functions/_shared/router_core.career.js");
  const { CareerHost } = await import("../../supabase/functions/_shared/career_host.js");
  const { agentTurn } = await import("../../supabase/functions/agent-chat/career_brain.ts");
  const { callModel, modelConfig, newMeter } = await import("../../supabase/functions/_shared/model_gateway.ts");
  const meter = newMeter(), judgeMeter = newMeter();
  const host = CareerHost.createCareerHost({ CareerAccess: core.CareerAccess, CareerOnboarding: core.CareerOnboarding, CareerRouter: core.CareerRouter, CareerDoorstep: core.CareerDoorstep, CareerReply: core.CareerReply, CareerContainment: core.CareerContainment });
  const brainCfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" };
  const judgeCfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("EVAL_JUDGE_MODEL") || "gpt-5-mini" };
  const T0 = Date.UTC(2026, 9, 19, 15);
  const brain: Brain = async (turns) => {
    const store = memoryStore();
    let now = T0;
    const replies: string[] = [];
    const turnFn = async (a: any) => {
      const ctx: any = host.createTurnCtx({ userId: a.userId, threadId: a.userId, now, snapshot: a.stores.snapshot ?? null });
      let reply: string;
      if (brainName === "agent") {
        const t = await agentTurn({ message: a.message, history: a.history, stores: ctx, userId: a.userId, threadId: a.userId, now, model: (p) => callModel(brainCfg, p, { meter, role: "chat" }) });
        if (t.stopped === "model_error") throw new Error("agent model unavailable");
        reply = t.reply;
      } else {
        reply = host.runTurn(a.message, ctx).reply;
      }
      return { reply, stores: { snapshot: host.extractSnapshot(ctx) } };
    };
    for (const text of turns) {
      const out = await handleInbound({ contact: "+15550001000", text, at: now }, { brain: turnFn, store });
      replies.push(out.bubbles.join("\n"));
      now += 60000;
    }
    const p = await store.userFor("+15550001000");
    const snap: any = p ? (await store.stores(p.id)).snapshot : null;
    return { replies, state: snap ? snap.stores : null };
  };
  const judge: Judge = async (item, reply, state) => {
    const res = await callModel(judgeCfg, { system: "You are a strict grader. Output JSON only.", messages: [{ role: "user", content: judgePrompt(item, reply, state) }], max_tokens: 400 }, { meter: judgeMeter, role: "chat" });
    return parseJudge((res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  };
  const set = JSON.parse(await Deno.readTextFile(new URL("./messages.json", import.meta.url)));
  const only = opt("--only");
  const items: EvalItem[] = set.items.filter((i: EvalItem) => !only || only.split(",").includes(i.id));
  const r = await runEval(items, brain, judge);
  let commit = "unknown";
  try { commit = new TextDecoder().decode((await new Deno.Command("git", { args: ["rev-parse", "--short", "HEAD"] }).output()).stdout).trim(); } catch { /* not a git checkout */ }
  const result = { label, brain: brainName, model: brainName === "agent" ? brainCfg.model : null, judge_model: judgeCfg.model, commit, run_at: new Date().toISOString(),
    cost_usd: { brain: meter.usd_micros / 1e6, judge: judgeMeter.usd_micros / 1e6 }, ...r };
  await Deno.mkdir(new URL("./results/", import.meta.url), { recursive: true });
  await Deno.writeTextFile(new URL(`./results/${label}.json`, import.meta.url), JSON.stringify(result, null, 1));
  console.log(`${label}: ${r.passed}/${r.total} passed (${Math.round(r.pass_rate * 100)}%) · brain ${brainName} · judge ${judgeCfg.model} · cost $${(result.cost_usd.brain + result.cost_usd.judge).toFixed(3)}`);
  console.log(`failing: ${r.items.filter((x) => !x.pass).map((x) => x.id).join(", ") || "none"}`);
}
