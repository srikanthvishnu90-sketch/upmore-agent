// Eval runner and rubric judge (WO-003). Scores a brain (the CareerHost router or the agent) on the architect-owned set
// evals/career/messages.json. Each item runs in a fresh thread through the same conversation interface the product uses;
// a model judge grades the last reply (and the end state, where the item names one) against must / must_not.
//
//   deno run -A evals/career/run.ts --brain router|agent --label <label> [--set official|heldout] [--only E001,E002]
//                                   [--budget-usd 15]
//
// --budget-usd (or EVAL_BUDGET_USD) is a total across runs: the spend already recorded in evals/career/results/*.json
// counts against it, and the run stops before the next item once the spend plus a reserve for one more item reaches it.
// --run-budget-usd caps this run alone (prior result files do not count against it).
// A stopped run is written with "stopped", and is not a score.
// Needs OPENAI_API_KEY (the judge; and the agent brain). Without it: NOT RUN, exit 2. A score is never faked.
// Results: evals/career/results/<label>.json, plus the pass rate and failing ids on stdout.
export interface EvalItem { id: string; persona: string; turns: string[]; must: string[]; must_not?: string[]; state?: string }
// `trace` (WO-061): per turn, how the agent loop ended and every tool it called (name, ok, error). Never shown to a judge;
// it is there so a failure reply (the step-limit text) can be traced to its cause instead of guessed.
export type Trace = { stopped: string; steps: number; tools: { name: string; ok: boolean; error?: string }[]; errors?: string[] }[];
export type Brain = (turns: string[]) => Promise<{ replies: string[]; state: unknown; trace?: Trace }>;
export type Judge = (item: EvalItem, lastReply: string, state: unknown) => Promise<{ pass: boolean; failed: string[]; score: number; note: string }>;
export interface EvalItemResult { id: string; pass: boolean; failed: string[]; score: number; replies: string[]; note: string; state?: unknown; trace?: Trace; judges?: { model: string; pass: boolean; failed: string[]; note: string }[] }
export interface EvalResult { total: number; passed: number; pass_rate: number; items: EvalItemResult[]; planned: number; stopped: string | null }

// stop: asked before each item; a reason ends the run there (the spend cap), and the items not run are not scored.
export async function runEval(items: EvalItem[], brain: Brain, judge: Judge, stop?: () => string | null): Promise<EvalResult> {
  const out: EvalItemResult[] = [];
  let stopped: string | null = null;
  for (const it of items) {
    stopped = stop ? stop() : null;
    if (stopped) break;
    let replies: string[] = [], state: unknown = null, trace: Trace | undefined;
    try { const r = await brain(it.turns); replies = r.replies; state = r.state; trace = r.trace; }
    catch (e) { out.push({ id: it.id, pass: false, failed: it.must, score: 1, replies, note: `brain error: ${e instanceof Error ? e.message : String(e)}` }); continue; }
    try {
      const j = await judge(it, replies[replies.length - 1] ?? "", state);
      // The end state the judges saw is kept, so a later re-score (rejudge.ts) grades exactly what they graded.
      out.push({ id: it.id, pass: !!j.pass, failed: j.failed || [], score: Number(j.score) || 1, replies, note: j.note || "", ...((j as any).judges ? { judges: (j as any).judges } : {}), state: state ?? null, ...(trace ? { trace } : {}) });
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

// Provable spend bound (2026-10-23; the parent's review, seconded by Codex: a fixed reserve is an estimate, not a bound).
// One OpenAI chat call bills at most every input token at the listed input price plus max_completion_tokens (which
// includes reasoning tokens) at the listed output price. Every token is at least one byte of the request, so the UTF-8
// byte length of the request's messages JSON bounds its input tokens (the JSON quoting covers the per-message tokens).
// A judge request larger than MAX_JUDGE_INPUT_BYTES is never sent, so one item's worst case is known before the run:
// the largest of the 240 judge requests of 2026-10-23 was 3,311 bytes.
export const MAX_JUDGE_INPUT_BYTES = 16384;
export type Price = { input: number; output: number };
export function callBoundMicros(price: Price, inputBytes: number, maxCompletionTokens: number): number {
  if (!price || !(price.input >= 0) || !(price.output >= 0) || !(inputBytes >= 0) || !(maxCompletionTokens > 0)) throw new Error("no bound: unpriced model or no output cap");
  return Math.ceil(inputBytes * price.input + maxCompletionTokens * price.output);
}
// In-flight accounting against one run's budget, in micro-dollars. Before calls go out, their bounds are reserved, all or
// none; after each call its bound is replaced by what the provider reported, or kept whole when the call failed or its
// usage is unknown (a timed-out request may still be billed). exposure() is what this run can have cost at most.
export function newSpendGuard(budgetMicros: number) {
  const g = {
    budgetMicros, settled: 0, reserved: 0, unmetered: 0, refused: null as string | null, violations: [] as string[],
    exposure: () => g.settled + g.reserved,
    fits: (micros: number) => g.settled + g.reserved + micros <= g.budgetMicros,
    reserve(bounds: number[]): boolean {
      const sum = bounds.reduce((a, b) => a + b, 0);
      if (!g.fits(sum)) { g.refused = `budget: exposure $${(g.exposure() / 1e6).toFixed(6)} + $${(sum / 1e6).toFixed(6)} would pass $${(g.budgetMicros / 1e6).toFixed(6)}`; return false; }
      g.reserved += sum; return true;
    },
    settle(bound: number, actual: number | null) {
      g.reserved -= bound;
      if (actual === null || !Number.isFinite(actual)) { g.settled += bound; g.unmetered += bound; return; }
      if (actual > bound) { g.violations.push(`a call cost ${actual} micros over its ${bound} bound`); g.refused = "a call cost more than its bound"; }
      g.settled += actual;
    },
  };
  return g;
}
export type SpendGuard = ReturnType<typeof newSpendGuard>;

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
  // --brain-root <checkout> (2026-10-22 router before/after): the router's own code (bundle + host seam) comes from that
  // checkout; the harness, judges, set and conversation plumbing stay this tree's, so both sides are measured alike.
  const brainRoot = opt("--brain-root");
  const routerBase = brainRoot ? `file://${await Deno.realPath(brainRoot)}/supabase/functions/_shared/` : "../../supabase/functions/_shared/";
  const core = await import(routerBase + "router_core.career.js");
  const { CareerHost } = await import(routerBase + "career_host.js");
  const { agentTurn } = await import("../../supabase/functions/agent-chat/career_brain.ts");
  const { callModel, modelConfig, newMeter, PRICES, toOpenAI, costMicros } = await import("../../supabase/functions/_shared/model_gateway.ts");
  const { memoryAlertStore } = await import("../../supabase/functions/_shared/career_alert_store.ts");
  const { situationFrom } = await import("../../supabase/functions/_shared/career_situation.ts");
  const { memoryBriefStores } = await import("../../supabase/functions/_shared/career_brief_store.ts");
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
    // WO-061 (production parity, second judge's ruling 2026-10-21): agent-chat gives the brain the interviews store
    // (handler-career.ts: supabaseInterviewStore) and readSituation reads its upcoming rows (career_situation.ts:
    // career_interviews id, company, role, starts_at, interview_date, from a day ago on). The harness keeps the same
    // store in memory for this persona; only rows the brain's own tools saved are in it.
    const { interviews } = memoryBriefStores();
    let now = T0;
    const replies: string[] = [], trace: Trace = [];
    const turnFn = async (a: any) => {
      const ctx: any = host.createTurnCtx({ userId: a.userId, threadId: a.userId, now, snapshot: a.stores.snapshot ?? null });
      let reply: string;
      if (brainName === "agent") {
        // WO-061 fix 2 (production parity): agent-chat reads the person's situation from their account every turn
        // (readSituation) and passes it; the harness passed none, so every records question met "could not be read this
        // turn". An eval persona's account holds nothing but the alerts it set in this chat: that is its situation.
        const row = await alerts.get(a.userId);
        const today = new Date(now - 86400000).toISOString();
        const upcoming = (await interviews.list(a.userId))
          .map((r) => ({ id: r.key, company: r.company, role: r.role, starts_at: r.starts_at, interview_date: r.date }))
          .filter((r) => (r.starts_at != null && r.starts_at >= today) || (r.interview_date != null && r.interview_date >= today.slice(0, 10)));
        const situation = situationFrom({ jobs: [], wanted: [], prepared: [], card: null, questions: [], outreach: [], mail_drafts: [], interviews: upcoming,
          alerts: row ? { prefs: row.prefs, tz: row.tz } : null, standing: [],
          // WO-061 (production parity, H004 traces; second judge's ruling 2026-10-21): readSituation reads every thread's
          // tracker rows from agent_flow_state (career_situation.ts: state->career->trackStore->rows), as saved after each
          // earlier turn; the harness passed none, so a row recorded earlier in the same chat was "not on file" by the next
          // turn. The eval persona's one thread is this chat: its own rows as saved after the last turn, nothing added.
          threads: [{ thread_id: a.userId, rows: a.stores?.snapshot?.stores?.trackStore?.rows ?? null }],
          connections: [], cloud: null, channel: null, last_search: null, unreadable: [] }, now);
        // WO-061 (H029, run 39593783917: the model call failed in all five passes and the reason was not recorded): a failed
        // model call's provider status and message go in the trace, never to a judge.
        const errors: string[] = [];
        const model = async (p: any) => { try { return await callModel(brainCfg, p, { meter, role: "chat" }); } catch (e) { errors.push(String((e as any)?.summary?.() ?? e).slice(0, 300)); throw e; } };
        const t = await agentTurn({ message: a.message, history: a.history, stores: ctx, userId: a.userId, threadId: a.userId, now, alerts, interviews, model,
          known: { standing: [], alerts: row ? { prefs: row.prefs, tz: row.tz } : null, pipeline: null, situation } });
        trace.push({ stopped: String(t.stopped), steps: Number(t.steps ?? 0), tools: (t.tool_calls ?? []).map((c: any) => ({ name: c.name, ok: !!c.ok, ...(c.error ? { error: String(c.error).slice(0, 200) } : {}) })), ...(errors.length ? { errors } : {}) });
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
    return { replies, state: snap ? snap.stores : null, ...(brainName === "agent" ? { trace } : {}) };
  };
  const judgePayload = (item: EvalItem, reply: string, state: unknown) => ({ system: "You are a strict grader. Output JSON only.", messages: [{ role: "user", content: judgePrompt(item, reply, state) }], max_tokens: 400 });
  // The bound of one judge call, from the exact request body the gateway sends (its messages and max_completion_tokens).
  const judgeBound = (cfg: any, payload: any, inputBytes?: number) => {
    const body = toOpenAI(payload, cfg);
    return callBoundMicros(PRICES[cfg.model], inputBytes ?? new TextEncoder().encode(JSON.stringify(body.messages)).length, body.max_completion_tokens);
  };
  let guard: SpendGuard | null = null;   // set below when --run-budget-usd is given
  // EVAL_MAX_JUDGE_INPUT_BYTES can only lower the bound (tests use it to reach the over-bound path), never raise it.
  const maxJudgeBytes = Math.min(MAX_JUDGE_INPUT_BYTES, Number(Deno.env.get("EVAL_MAX_JUDGE_INPUT_BYTES")) || MAX_JUDGE_INPUT_BYTES);
  const oneJudge = async (cfg: any, item: EvalItem, reply: string, state: unknown, bound: number | null) => {
    let res: any;
    try { res = await callModel(cfg, judgePayload(item, reply, state), { meter: judgeMeter, role: "chat" }); }
    catch (e) { if (guard && bound !== null) guard.settle(bound, null); throw e; }
    if (guard && bound !== null) guard.settle(bound, costMicros(cfg.model, res.usage));
    return parseJudge((res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  };
  const judge: Judge = async (item, reply, state) => {
    const cfgs = judge2Cfg ? [judgeCfg, judge2Cfg] : [judgeCfg];
    let bounds: (number | null)[] = cfgs.map(() => null);
    if (guard) {
      const payload = judgePayload(item, reply, state);
      const bytes = new TextEncoder().encode(JSON.stringify(toOpenAI(payload, judgeCfg).messages)).length;
      if (bytes > maxJudgeBytes) { guard.refused = `judge request of ${bytes} bytes is over the ${maxJudgeBytes}-byte bound: not sent`; throw new Error(guard.refused); }
      bounds = cfgs.map((c) => judgeBound(c, payload));
      if (!guard.reserve(bounds as number[])) throw new Error(guard.refused ?? "budget");
    }
    if (!judge2Cfg) return oneJudge(judgeCfg, item, reply, state, bounds[0]);
    const settle = async (cfg: any, bound: number | null) => { try { return await oneJudge(cfg, item, reply, state, bound); } catch (e) { return { pass: false, failed: item.must, score: 1, note: `judge error: ${e instanceof Error ? e.message : String(e)}` }; } };
    const [a, b] = await Promise.all([settle(judgeCfg, bounds[0]), settle(judge2Cfg, bounds[1])]);
    return bothJudges([{ model: judgeCfg.model, v: a }, { model: judge2Cfg.model, v: b }]);
  };
  // --set heldout: the held-out live phrasings (WO-059), reported beside the official set; D-008's bar is the official set's.
  const setName = opt("--set") || "official";
  const set = JSON.parse(await Deno.readTextFile(new URL(setName === "heldout" ? "./heldout-live.json" : "./messages.json", import.meta.url)));
  const only = opt("--only");
  // --exclude-file <json with items: [id...]> (e.g. heldout-burned.json): those ids are never run or scored.
  const excludeFile = opt("--exclude-file");
  const excluded = new Set<string>(excludeFile ? (JSON.parse(await Deno.readTextFile(excludeFile)).items ?? []).map((x: any) => typeof x === "string" ? x : x.id) : []);
  const items: EvalItem[] = set.items.filter((i: EvalItem) => (!only || only.split(",").includes(i.id)) && !excluded.has(i.id));
  if (brainName === "agent" && brainRoot) { console.log("NOT RUN: --brain-root measures the router only."); Deno.exit(2); }
  const budgetArg = opt("--budget-usd") ?? Deno.env.get("EVAL_BUDGET_USD") ?? null;
  const budget = budgetArg === null ? null : Number(budgetArg);
  // --run-budget-usd: what THIS run alone may spend (a caller that keeps its own ledger passes the remaining authorized
  // total here). Prior result files do not count against it; it applies on top of --budget-usd when both are given.
  const runBudgetArg = opt("--run-budget-usd");
  const runBudget = runBudgetArg === null ? null : Number(runBudgetArg);
  const planOnly = Deno.args.includes("--plan-only");
  if ((runBudget !== null || planOnly) && brainName !== "router") { console.log("NOT RUN: the provable bound covers the router brain (no model calls) and the judges; the agent brain's calls have no pre-run bound."); Deno.exit(2); }
  if ((runBudget !== null && !(runBudget > 0)) || ((runBudget !== null || planOnly) && (!PRICES[judgeCfg.model] || (judge2Cfg && !PRICES[judge2Cfg.model])))) {
    console.log(`NOT RUN: --run-budget-usd needs a positive number and priced judges (${judgeCfg.model}${judge2Cfg ? ", " + judge2Cfg.model : ""}).`);
    Deno.exit(2);
  }
  // The pre-run gate: the worst case of every item (each judge at MAX_JUDGE_INPUT_BYTES and its output cap) must fit.
  const anyPayload = { system: "", messages: [{ role: "user", content: "" }], max_tokens: 400 };
  const itemBoundMicros = (runBudget !== null || planOnly) ? (judge2Cfg ? [judgeCfg, judge2Cfg] : [judgeCfg]).reduce((a, c) => a + judgeBound(c, anyPayload, maxJudgeBytes), 0) : 0;
  const exposureMicros = itemBoundMicros * items.length;
  if (planOnly) { console.log(`EXPOSURE_USD ${(exposureMicros / 1e6).toFixed(6)} (${items.length} items x $${(itemBoundMicros / 1e6).toFixed(6)} worst case each)`); Deno.exit(0); }
  if (runBudget !== null) {
    if (exposureMicros > Math.floor(runBudget * 1e6)) { console.log(`NOT RUN: the worst case is $${(exposureMicros / 1e6).toFixed(6)} (${items.length} items x $${(itemBoundMicros / 1e6).toFixed(6)}), over the $${runBudget} run budget.`); Deno.exit(2); }
    guard = newSpendGuard(Math.floor(runBudget * 1e6));
  }
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
  if (runBudget !== null) console.log(`run budget $${runBudget.toFixed(6)} (this run alone) · proven worst case $${(exposureMicros / 1e6).toFixed(6)}`);
  const totalStop = budgetStop(budget, now$);
  // Before each item: one more worst-case item must fit, a call must not have cost more than its bound, and the router
  // brain must not have called a model (its calls have no bound).
  const runStop = () => !guard ? null : guard.refused ?? (meter.calls > 0 ? (guard.refused = "the router brain called a model") : null) ?? (guard.fits(itemBoundMicros) ? null : `budget: exposure $${(guard.exposure() / 1e6).toFixed(6)} leaves no room for one more worst-case item`);
  const r = await runEval(items, brain, judge, () => totalStop() ?? runStop());
  if (guard && !r.stopped && guard.refused) r.stopped = guard.refused;
  // The brain's own commit: a measurement commit on ci/brain-eval merges the branch measured as its second parent.
  let source = "unknown";
  try { const o = await new Deno.Command("git", { args: ["rev-parse", "--short", "HEAD^2"] }).output(); if (o.success) source = new TextDecoder().decode(o.stdout).trim(); } catch { /* no second parent */ }
  let commit = "unknown";
  try { commit = new TextDecoder().decode((await new Deno.Command("git", { args: ["rev-parse", "--short", "HEAD"] }).output()).stdout).trim(); } catch { /* not a git checkout */ }
  // WO-061 (owner, 2026-10-21): every score from fix (b) on carries this label, so the harness gain is never read as a brain gain.
  const harness = "situation parity since f265092a (production parity, not brain improvement)";
  const result = { label, harness, set: setName, brain: brainName, model: brainName === "agent" ? brainCfg.model : null, judge_model: judgeCfg.model, judge_model_2: judge2Cfg?.model ?? null, commit, source_commit: source === "unknown" ? commit : source, run_at: new Date().toISOString(),
    cost_usd: { brain: meter.usd_micros / 1e6, judge: judgeMeter.usd_micros / 1e6, ...(guard ? { unmetered_bound: guard.unmetered / 1e6 } : {}) }, unpriced_calls: meter.unpriced + judgeMeter.unpriced,
    ...(guard ? { exposure_bound_usd: exposureMicros / 1e6, guard: { settled_usd: guard.settled / 1e6, violations: guard.violations, refused: guard.refused } } : {}),
    budget_usd: budget, run_budget_usd: runBudget, spent_before_usd: before, brain_root: brainRoot ?? null, brain_root_commit: opt("--brain-commit") ?? null, excluded: [...excluded], ...r };
  await Deno.mkdir(new URL("./results/", import.meta.url), { recursive: true });
  await Deno.writeTextFile(new URL(`./results/${label}.json`, import.meta.url), JSON.stringify(result, null, 1));
  console.log(`${label}: ${r.passed}/${r.total} passed (${Math.round(r.pass_rate * 100)}%) · brain ${brainName} · judge ${judgeCfg.model} · cost $${(result.cost_usd.brain + result.cost_usd.judge).toFixed(3)}`);
  console.log(`failing: ${r.items.filter((x) => !x.pass).map((x) => x.id).join(", ") || "none"}`);
  if (r.stopped) { console.log(`STOPPED after ${r.total} of ${r.planned} items (${r.stopped}): not a score.`); Deno.exit(3); }
}
