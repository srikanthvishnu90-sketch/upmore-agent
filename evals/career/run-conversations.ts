// Conversation eval (WO-019). Scores a brain on evals/career/conversations.json: whole conversations, not single
// messages. Each runs in one fresh thread through the product's conversation interface (handleInbound), with the
// fixture postings behind search and an in-memory alert store, exactly as the agent sees them in production. Every turn
// that carries checks is graded with the transcript so far (the person's words AND the agent's replies), then the
// conversation is graded as a whole, with the end state where the item names one. A conversation passes only if every
// graded turn and the whole pass; a judge error is a failure, never a pass.
//
//   deno run -A evals/career/run-conversations.ts --brain router|agent --label <label> [--only C01,C05]
//
// Needs OPENAI_API_KEY (the judge, and the agent brain). Without it: NOT RUN, exit 2. A score is never faked.
// Results: evals/career/results/<label>.conversations.json, the pass rate and the failing ids on stdout.
import { parseJudge } from "./run.ts";

export interface ConvTurn { user: string; must?: string[]; must_not?: string[] }
export interface ConvItem { id: string; theme: string; persona: string; turns: ConvTurn[]; whole?: { must?: string[]; must_not?: string[] }; state?: string }
export type ConvBrain = (users: string[]) => Promise<{ replies: string[]; state: unknown }>;
export type Verdict = { pass: boolean; failed: string[]; score: number; note: string };
export type ConvJudge = (prompt: string) => Promise<Verdict>;
export interface ConvResult { id: string; theme: string; pass: boolean; turns: { at: number; pass: boolean; failed: string[]; note: string }[]; whole: Verdict | null; replies: string[]; note: string }

export const CONV_JUDGE_PROMPT = `You grade a career agent inside a text conversation. You are strict and literal.
User persona: {persona}
The only job postings that exist (anything else is invented): {postings}
Transcript so far (U = the person, A = the agent):
{transcript}
{focus}
End state after the conversation (JSON, may be null): {state}
Required (every one must hold): {must}
Forbidden (none may happen): {must_not}
Expected end state (if given): {state_expectation}
Return JSON only: {"pass": boolean, "failed": [the exact required/forbidden/state items that failed], "score": 1-5 for how well this reads as one coherent conversation with a sharp, helpful person, "note": one sentence}.
pass is true only if every required item holds, no forbidden item happens, and the expected end state (if given) holds.`;

export function transcript(users: string[], replies: string[], upTo: number): string {
  const out: string[] = [];
  for (let i = 0; i <= upTo && i < users.length; i++) out.push(`U${i + 1}: ${users[i]}`, `A${i + 1}: ${replies[i] ?? "(no reply)"}`);
  return out.join("\n");
}

export function convJudgePrompt(o: { item: ConvItem; postings: unknown[]; users: string[]; replies: string[]; at: number | "whole"; state: unknown }): string {
  const t = o.at === "whole" ? null : o.item.turns[o.at];
  const list = (o.postings as any[]).map((p) => ({ company: p.company, title: p.title, location: p.location, description: p.description }));
  const fill: Record<string, string> = {
    persona: o.item.persona, postings: JSON.stringify(list),
    transcript: transcript(o.users, o.replies, o.at === "whole" ? o.users.length - 1 : o.at),
    focus: o.at === "whole" ? "Grade the WHOLE conversation." : `Grade ONLY the agent's reply A${o.at + 1}, in the light of everything before it.`,
    state: o.at === "whole" ? JSON.stringify(o.state ?? null).slice(0, 6000) : "(not graded on this turn)",
    must: JSON.stringify(t ? t.must || [] : o.item.whole?.must || []), must_not: JSON.stringify(t ? t.must_not || [] : o.item.whole?.must_not || []),
    state_expectation: o.at === "whole" ? o.item.state || "(none)" : "(none)",
  };
  return CONV_JUDGE_PROMPT.replace(/\{(\w+)\}/g, (_, k) => fill[k] ?? "");
}

const graded = (t: ConvTurn) => !!((t.must && t.must.length) || (t.must_not && t.must_not.length));

export async function runConversations(items: ConvItem[], postings: unknown[], brain: ConvBrain, judge: ConvJudge): Promise<{ total: number; passed: number; pass_rate: number; items: ConvResult[] }> {
  const out: ConvResult[] = [];
  for (const it of items) {
    const users = it.turns.map((t) => t.user);
    let replies: string[] = [], state: unknown = null;
    try { const r = await brain(users); replies = r.replies; state = r.state; }
    catch (e) { out.push({ id: it.id, theme: it.theme, pass: false, turns: [], whole: null, replies, note: `brain error: ${e instanceof Error ? e.message : String(e)}` }); continue; }
    const turns: ConvResult["turns"] = [];
    let note = "";
    const ask = async (at: number | "whole"): Promise<Verdict> => {
      try { return await judge(convJudgePrompt({ item: it, postings, users, replies, at, state })); }
      catch (e) { return { pass: false, failed: ["judge error"], score: 1, note: `judge error: ${e instanceof Error ? e.message : String(e)}` }; }
    };
    for (let i = 0; i < it.turns.length; i++) {
      if (!graded(it.turns[i])) continue;
      const v = await ask(i);
      turns.push({ at: i + 1, pass: v.pass, failed: v.failed, note: v.note });
    }
    const hasWhole = !!(it.whole && ((it.whole.must || []).length || (it.whole.must_not || []).length)) || !!it.state;
    const whole = hasWhole ? await ask("whole") : null;
    const pass = turns.every((t) => t.pass) && (!whole || whole.pass);
    if (!pass) note = [...turns.filter((t) => !t.pass).map((t) => `turn ${t.at}: ${t.note}`), ...(whole && !whole.pass ? [`whole: ${whole.note}`] : [])].join(" | ");
    out.push({ id: it.id, theme: it.theme, pass, turns, whole, replies, note });
  }
  const passed = out.filter((r) => r.pass).length;
  return { total: out.length, passed, pass_rate: out.length ? passed / out.length : 0, items: out };
}

// Trainee itself as a contestant: each conversation in one fresh thread through the product's conversation interface
// (handleInbound), the fixture postings behind search, an in-memory alert store. "agent" is the model brain (pass the model
// call), "router" the scripted one (no model). The end state is the thread's profile and the alert store.
export async function traineeBrain(o: { kind: "agent" | "router"; postings: any[]; model?: (p: any) => Promise<any> }): Promise<ConvBrain> {
  const { handleInbound, memoryStore } = await import("../../supabase/functions/_shared/conversation.ts");
  const core = await import("../../supabase/functions/_shared/router_core.career.js");
  const { CareerHost } = await import("../../supabase/functions/_shared/career_host.js");
  const { agentTurn } = await import("../../supabase/functions/agent-chat/career_brain.ts");
  const { memoryPostingsDb, searchWords } = await import("../../supabase/functions/_shared/career_ingest.ts");
  const { memoryAlertStore } = await import("../../supabase/functions/_shared/career_alert_store.ts");
  const host = CareerHost.createCareerHost({ CareerAccess: core.CareerAccess, CareerOnboarding: core.CareerOnboarding, CareerRouter: core.CareerRouter, CareerDoorstep: core.CareerDoorstep, CareerReply: core.CareerReply, CareerContainment: core.CareerContainment });
  if (o.kind === "agent" && !o.model) throw new Error("the agent brain needs a model");
  const T0 = Date.UTC(2026, 9, 19, 15);
  return async (users) => {
    const store = memoryStore(), alerts = memoryAlertStore(), postings = memoryPostingsDb();
    await postings.putMany(o.postings.map((p: any) => ({ ...p, provider: p.job_id.split(":")[0], board: p.job_id.split(":")[1], last_seen_at: p.first_seen_at, closed_at: null })));
    let now = T0;
    const replies: string[] = [];
    const turnFn = async (a: any) => {
      const ctx: any = host.createTurnCtx({ userId: a.userId, threadId: a.userId, now, snapshot: a.stores.snapshot ?? null });
      let reply: string;
      if (o.kind === "agent") {
        const t = await agentTurn({ message: a.message, history: a.history, stores: ctx, userId: a.userId, threadId: a.userId, now,
          model: o.model!, postings: (q) => postings.search(searchWords(q), 150), alerts });
        if (t.stopped === "model_error") throw new Error("agent model unavailable");
        reply = t.reply;
      } else {
        reply = host.runTurn(a.message, ctx).reply;
      }
      return { reply, stores: { snapshot: host.extractSnapshot(ctx) } };
    };
    for (const text of users) {
      const out = await handleInbound({ contact: "+15550002000", text, at: now }, { brain: turnFn, store });
      replies.push(out.bubbles.join("\n"));
      now += 90000;
    }
    const p = await store.userFor("+15550002000");
    const snap: any = p ? (await store.stores(p.id)).snapshot : null;
    return { replies, state: { profile: snap ? snap.stores : null, alerts: alerts.dump() } };
  };
}

// ---------------------------------------------------------------------------------------------------- CLI
if (import.meta.main) {
  const args = Deno.args, opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? null : null; };
  const brainName = opt("--brain") || "router", label = opt("--label") || `${brainName}-${new Date().toISOString().slice(0, 10)}`;
  if (!Deno.env.get("OPENAI_API_KEY")) { console.log("NOT RUN: no OPENAI_API_KEY (the judge needs it)."); Deno.exit(2); }
  const { callModel, modelConfig, newMeter } = await import("../../supabase/functions/_shared/model_gateway.ts");
  const set = JSON.parse(await Deno.readTextFile(new URL("./conversations.json", import.meta.url)));
  const meter = newMeter(), judgeMeter = newMeter();
  const brainCfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" };
  const judgeCfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("EVAL_JUDGE_MODEL") || "gpt-5-mini" };
  const brain = await traineeBrain({ kind: brainName === "agent" ? "agent" : "router", postings: set.postings, model: (p) => callModel(brainCfg, p, { meter, role: "chat" }) });
  const judge: ConvJudge = async (prompt) => {
    const res = await callModel(judgeCfg, { system: "You are a strict grader. Output JSON only.", messages: [{ role: "user", content: prompt }], max_tokens: 400 }, { meter: judgeMeter, role: "chat" });
    return parseJudge((res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  };
  const only = opt("--only");
  const items: ConvItem[] = set.items.filter((i: ConvItem) => !only || only.split(",").includes(i.id));
  const r = await runConversations(items, set.postings, brain, judge);
  let commit = "unknown";
  try { commit = new TextDecoder().decode((await new Deno.Command("git", { args: ["rev-parse", "--short", "HEAD"] }).output()).stdout).trim(); } catch { /* not a git checkout */ }
  const result = { label, brain: brainName, model: brainName === "agent" ? brainCfg.model : null, judge_model: judgeCfg.model, commit, run_at: new Date().toISOString(),
    cost_usd: { brain: meter.usd_micros / 1e6, judge: judgeMeter.usd_micros / 1e6 }, ...r };
  await Deno.mkdir(new URL("./results/", import.meta.url), { recursive: true });
  await Deno.writeTextFile(new URL(`./results/${label}.conversations.json`, import.meta.url), JSON.stringify(result, null, 1));
  console.log(`${label}: ${r.passed}/${r.total} conversations passed (${Math.round(r.pass_rate * 100)}%) · brain ${brainName} · judge ${judgeCfg.model} · cost $${(result.cost_usd.brain + result.cost_usd.judge).toFixed(3)}`);
  console.log(`failing: ${r.items.filter((x) => !x.pass).map((x) => `${x.id} (${x.theme})`).join(", ") || "none"}`);
}
