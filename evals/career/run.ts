// Eval runner and rubric judge (WO-003). Scores a brain (the CareerHost router or the agent) on the architect-owned set
// evals/career/messages.json. Each item runs in a fresh thread through the same conversation interface the product uses;
// a model judge grades the last reply (and the end state, where the item names one) against must / must_not.
//
//   deno run -A evals/career/run.ts --brain router|agent --label <label> [--set official|heldout] [--only E001,E002]
//                                   [--budget-usd 15]
//
// --budget-usd (or EVAL_BUDGET_USD) is a total across runs: the spend already recorded in evals/career/results/*.json
// counts against it, and the run stops before the next item once the spend plus a reserve for one more item reaches it.
// A stopped run is written with "stopped", and is not a score.
// Needs OPENAI_API_KEY (the judge; and the agent brain). Without it: NOT RUN, exit 2. A score is never faked.
// Results: evals/career/results/<label>.json, plus the pass rate and failing ids on stdout.
export interface EvalItem { id: string; persona: string; turns: string[]; must: string[]; must_not?: string[]; state?: string }
export type Brain = (turns: string[]) => Promise<{ replies: string[]; state: unknown }>;
export type Judge = (item: EvalItem, lastReply: string, state: unknown) => Promise<{ pass: boolean; failed: string[]; score: number; note: string }>;
export interface EvalItemResult { id: string; pass: boolean; failed: string[]; score: number; replies: string[]; note: string; judges?: { model: string; pass: boolean; failed: string[]; note: string }[] }
export interface EvalResult { total: number; passed: number; pass_rate: number; items: EvalItemResult[]; planned: number; stopped: string | null }

// stop: asked before each item; a reason ends the run there (the spend cap), and the items not run are not scored.
export async function runEval(items: EvalItem[], brain: Brain, judge: Judge, stop?: () => string | null): Promise<EvalResult> {
  const out: EvalItemResult[] = [];
  let stopped: string | null = null;
  for (const it of items) {
    stopped = stop ? stop() : null;
    if (stopped) break;
    let replies: string[] = [], state: unknown = null;
    try { const r = await brain(it.turns); replies = r.replies; state = r.state; }
    catch (e) { out.push({ id: it.id, pass: false, failed: it.must, score: 1, replies, note: `brain error: ${e instanceof Error ? e.message : String(e)}` }); continue; }
    try {
      const j = await judge(it, replies[replies.length - 1] ?? "", state);
      out.push({ id: it.id, pass: !!j.pass, failed: j.failed || [], score: Number(j.score) || 1, replies, note: j.note || "", ...((j as any).judges ? { judges: (j as any).judges } : {}) });
    } catch (e) {
      out.push({ id: it.id, pass: false, failed: it.must, score: 1, replies, note: `judge error: ${e instanceof Error ? e.message : String(e)}` });
    }
  }
  const passed = out.filter((x) => x.pass).length;
  return { total: out.length, passed, pass_rate: out.length ? passed / out.length : 0, items: out, planned: items.length, stopped };
}

// WO-061 (owner, 2026-10-21: "Two independent judges score each item. One judge's reading never decides an item alone;
// when judges disagree, the item counts as a failure until both pass it."): both verdicts are kept, and the item passes
// only when every judge passes it. A judge that errors fails the item.
export type Verdict = { pass: boolean; failed: string[]; score: number; note: string };
export function bothJudges(verdicts: { model: string; v: Verdict }[]): Verdict & { judges: { model: string; pass: boolean; failed: string[]; note: string }[] } {
  const judges = verdicts.map(({ model, v }) => ({ model, pass: !!v.pass, failed: v.failed || [], note: v.note || "" }));
  return {
    pass: judges.length > 0 && judges.every((j) => j.pass),
    failed: [...new Set(judges.flatMap((j) => j.failed))],
    score: Math.min(...verdicts.map(({ v }) => Number(v.score) || 1)),
    note: judges.map((j) => `[${j.model}: ${j.pass ? "pass" : "FAIL"}] ${j.note}`).join(" "),
    judges,
  };
}

// The spend already recorded: every result file's brain and judge cost, except the label being written now.
export function spentUsd(results: { label?: string; cost_usd?: { brain?: number; judge?: number } }[], label: string): number {
  return results.filter((r) => r.label !== label).reduce((a, r) => a + (Number(r.cost_usd?.brain) || 0) + (Number(r.cost_usd?.judge) || 0), 0);
}

// The cap: stop when what is spent, plus a reserve for one more item, reaches the budget.
export function budgetStop(budget: number | null, spent: () => number, reserve = 0.25): () => string | null {
  return () => budget !== null && spent() + reserve >= budget ? `budget: $${spent().toFixed(3)} spent of $${budget.toFixed(2)}` : null;
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
  const { callModel, modelConfig, newMeter, PRICES } = await import("../../supabase/functions/_shared/model_gateway.ts");
  const { memoryAlertStore } = await import("../../supabase/functions/_shared/career_alert_store.ts");
  const { situationFrom } = await import("../../supabase/functions/_shared/career_situation.ts");
  const meter = newMeter(), judgeMeter = newMeter();
  const host = CareerHost.createCareerHost({ CareerAccess: core.CareerAccess, CareerOnboarding: core.CareerOnboarding, CareerRouter: core.CareerRouter, CareerDoorstep: core.CareerDoorstep, CareerReply: core.CareerReply, CareerContainment: core.CareerContainment });
  const brainCfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("CAREER_MODEL") || "gpt-5-mini" };
  const judgeCfg = { ...modelConfig(Deno.env, "chat"), model: Deno.env.get("EVAL_JUDGE_MODEL") || "gpt-5-mini" };
  const judge2Model = Deno.env.get("EVAL_JUDGE_MODEL_2") || null;
  const judge2Cfg = judge2Model ? { ...modelConfig(Deno.env, "chat"), model: judge2Model } : null;
  const T0 = Date.UTC(2026, 9, 19, 15);
  const brain: Brain = async (turns) => {
    const store = memoryStore();
    // WO-061: the agent gets an alert store, as agent-chat gives it in production; without one every alert request
    // failed with "job alerts are not configured here", a harness artifact the router (its own state) never paid.
    const alerts = memoryAlertStore();
    let now = T0;
    const replies: string[] = [];
    const turnFn = async (a: any) => {
      const ctx: any = host.createTurnCtx({ userId: a.userId, threadId: a.userId, now, snapshot: a.stores.snapshot ?? null });
      let reply: string;
      if (brainName === "agent") {
        // WO-061 fix 2 (production parity): agent-chat reads the person's situation from their account every turn
        // (readSituation) and passes it; the harness passed none, so every records question met "could not be read this
        // turn". An eval persona's account holds nothing but the alerts it set in this chat: that is its situation.
        const row = await alerts.get(a.userId);
        const situation = situationFrom({ jobs: [], wanted: [], prepared: [], card: null, questions: [], outreach: [], mail_drafts: [], interviews: [],
          alerts: row ? { prefs: row.prefs, tz: row.tz } : null, standing: [], threads: [], connections: [], cloud: null, channel: null, last_search: null, unreadable: [] }, now);
        const t = await agentTurn({ message: a.message, history: a.history, stores: ctx, userId: a.userId, threadId: a.userId, now, alerts, model: (p) => callModel(brainCfg, p, { meter, role: "chat" }),
          known: { standing: [], alerts: row ? { prefs: row.prefs, tz: row.tz } : null, pipeline: null, situation } });
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
  const oneJudge = async (cfg: any, item: EvalItem, reply: string, state: unknown) => {
    const res = await callModel(cfg, { system: "You are a strict grader. Output JSON only.", messages: [{ role: "user", content: judgePrompt(item, reply, state) }], max_tokens: 400 }, { meter: judgeMeter, role: "chat" });
    return parseJudge((res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  };
  const judge: Judge = async (item, reply, state) => {
    if (!judge2Cfg) return oneJudge(judgeCfg, item, reply, state);
    const settle = async (cfg: any) => { try { return await oneJudge(cfg, item, reply, state); } catch (e) { return { pass: false, failed: item.must, score: 1, note: `judge error: ${e instanceof Error ? e.message : String(e)}` }; } };
    const [a, b] = await Promise.all([settle(judgeCfg), settle(judge2Cfg)]);
    return bothJudges([{ model: judgeCfg.model, v: a }, { model: judge2Cfg.model, v: b }]);
  };
  // --set heldout: the held-out live phrasings (WO-059), reported beside the official set; D-008's bar is the official set's.
  const setName = opt("--set") || "official";
  const set = JSON.parse(await Deno.readTextFile(new URL(setName === "heldout" ? "./heldout-live.json" : "./messages.json", import.meta.url)));
  const only = opt("--only");
  const items: EvalItem[] = set.items.filter((i: EvalItem) => !only || only.split(",").includes(i.id));
  const budgetArg = opt("--budget-usd") ?? Deno.env.get("EVAL_BUDGET_USD") ?? null;
  const budget = budgetArg === null ? null : Number(budgetArg);
  if (budget !== null && (!(budget > 0) || !PRICES[judgeCfg.model] || (judge2Cfg && !PRICES[judge2Cfg.model]) || (brainName === "agent" && !PRICES[brainCfg.model]))) {
    console.log(`NOT RUN: a budget needs a positive number and a priced model (judge ${judgeCfg.model}, brain ${brainCfg.model}); an unpriced call cannot be capped.`);
    Deno.exit(2);
  }
  const prior: any[] = [];
  try {
    for await (const e of Deno.readDir(new URL("./results/", import.meta.url))) {
      if (e.name.endsWith(".json")) prior.push(JSON.parse(await Deno.readTextFile(new URL(`./results/${e.name}`, import.meta.url))));
    }
  } catch { /* no results yet */ }
  const before = spentUsd(prior, label);
  const now$ = () => before + (meter.usd_micros + judgeMeter.usd_micros) / 1e6;
  if (budget !== null) console.log(`budget $${budget.toFixed(2)} · already spent $${before.toFixed(3)} (${prior.length} result files)`);
  const r = await runEval(items, brain, judge, budgetStop(budget, now$));
  // The brain's own commit: a measurement commit on ci/brain-eval merges the branch measured as its second parent.
  let source = "unknown";
  try { const o = await new Deno.Command("git", { args: ["rev-parse", "--short", "HEAD^2"] }).output(); if (o.success) source = new TextDecoder().decode(o.stdout).trim(); } catch { /* no second parent */ }
  let commit = "unknown";
  try { commit = new TextDecoder().decode((await new Deno.Command("git", { args: ["rev-parse", "--short", "HEAD"] }).output()).stdout).trim(); } catch { /* not a git checkout */ }
  // WO-061 (owner, 2026-10-21): every score from fix (b) on carries this label, so the harness gain is never read as a brain gain.
  const harness = "situation parity since f265092a (production parity, not brain improvement)";
  const result = { label, harness, set: setName, brain: brainName, model: brainName === "agent" ? brainCfg.model : null, judge_model: judgeCfg.model, judge_model_2: judge2Cfg?.model ?? null, commit, source_commit: source === "unknown" ? commit : source, run_at: new Date().toISOString(),
    cost_usd: { brain: meter.usd_micros / 1e6, judge: judgeMeter.usd_micros / 1e6 }, unpriced_calls: meter.unpriced + judgeMeter.unpriced,
    budget_usd: budget, spent_before_usd: before, ...r };
  await Deno.mkdir(new URL("./results/", import.meta.url), { recursive: true });
  await Deno.writeTextFile(new URL(`./results/${label}.json`, import.meta.url), JSON.stringify(result, null, 1));
  console.log(`${label}: ${r.passed}/${r.total} passed (${Math.round(r.pass_rate * 100)}%) · brain ${brainName} · judge ${judgeCfg.model} · cost $${(result.cost_usd.brain + result.cost_usd.judge).toFixed(3)}`);
  console.log(`failing: ${r.items.filter((x) => !x.pass).map((x) => x.id).join(", ") || "none"}`);
  if (r.stopped) { console.log(`STOPPED after ${r.total} of ${r.planned} items (${r.stopped}): not a score.`); Deno.exit(3); }
}
