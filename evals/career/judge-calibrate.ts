// Judge calibration (owner, 2026-10-20). Replays the battery's judge on the stored transcripts of eight runs and
// measures how often it agrees with the architect's labels (judge-calibration.json): split runs 1-6 (tune: the
// judge's rules were written from their disagreements) and runs 7-8 (held out). The held-out disagreement rate is the
// judge-noise band every battery report prints beside its pass rate.
//
//   deno run -A evals/career/judge-calibrate.ts --run <id> [--split tune|heldout|all] [--code-only] [--budget-usd 15]
//   deno run -A evals/career/judge-calibrate.ts --latest     (prints the latest calibration result for this judge)
//
// --code-only grades only the items code decides, with no model call (local, free): an item passes when every code item
// passes and is "open" when the model would still have to grade something. Needs OPENAI_API_KEY otherwise; NOT RUN
// without it. Results: evals/career/results/judge-calibration-<run>.json (counted in the battery's spend cap).
import { makeCtx, type Run, type TaskDef } from "./run-tasks.ts";
import { codeFailed, combine, forJudge, judgeFingerprint, judgeV2Prompt, needsJudge, parseItemJudge, rubricItems, type V2Verdict } from "./judge-v2.ts";
import { budgetStop, spentUsd } from "./run.ts";

export interface Label { run: string; run_n: number; split: "tune" | "heldout"; brain: "agent" | "router"; task: string; label: "pass" | "fail"; sure: boolean; reason: string; first_judge: "pass" | "fail" }
export interface Confusion { n: number; agree: number; rate: number; label_pass_judge_pass: number; label_fail_judge_fail: number; label_fail_judge_pass: number; label_pass_judge_fail: number }
export function confusion(rows: { label: boolean; judge: boolean }[]): Confusion {
  const c = { n: rows.length, agree: 0, rate: 0, label_pass_judge_pass: 0, label_fail_judge_fail: 0, label_fail_judge_pass: 0, label_pass_judge_fail: 0 };
  for (const r of rows) {
    if (r.label && r.judge) c.label_pass_judge_pass++; else if (!r.label && !r.judge) c.label_fail_judge_fail++;
    else if (!r.label && r.judge) c.label_fail_judge_pass++; else c.label_pass_judge_fail++;
  }
  c.agree = c.label_pass_judge_pass + c.label_fail_judge_fail;
  c.rate = rows.length ? Number((c.agree / rows.length).toFixed(4)) : 0;
  return c;
}
// The stored transcript as the harness's Run: replies, per-turn trace, and the end state the item recorded.
export function storedRun(item: any): Run {
  const es = item.end_state || {};
  return { replies: item.replies || [], meta: item.meta || [], state: { stores: { trackStore: { rows: es.tracker || [] }, alertWatchState: es.router_watch ?? null }, alerts: es.alerts || { rows: {}, outbox: [] }, queued: es.queued ?? null } as any };
}

export async function main(args: string[]): Promise<void> {
  const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? null : null; };
  const here = new URL("./", import.meta.url), resultsDir = new URL("./results/", import.meta.url);
  const codeOnly = args.includes("--code-only");
  const split = opt("--split") || "all";
  const runId = opt("--run") || Deno.env.get("GITHUB_RUN_ID") || `local-${new Date().toISOString().slice(0, 10)}`;
  const label = `judge-calibration-${runId}`;
  const cal = JSON.parse(await Deno.readTextFile(new URL("judge-calibration.json", here)));
  const tasks: Record<string, TaskDef> = Object.fromEntries(JSON.parse(await Deno.readTextFile(new URL("tasks-live.json", here))).tasks.map((t: TaskDef) => [t.id, t]));
  const votes = Math.max(1, Number(Deno.env.get("EVAL_JUDGE_VOTES") || 3));
  const effort = Deno.env.get("EVAL_JUDGE_REASONING") || null;
  let judge: ((prompt: string) => Promise<any>) | null = null, meter: any = null, model = "none";
  let stop: () => string | null = () => null;
  let before = 0;
  if (!codeOnly) {
    if (!Deno.env.get("OPENAI_API_KEY")) { console.log("NOT RUN: no OPENAI_API_KEY (the judge needs it)."); Deno.exit(2); }
    const { callModel, modelConfig, newMeter, PRICES } = await import("../../supabase/functions/_shared/model_gateway.ts");
    // The judge model is the battery's (EVAL_JUDGE_MODEL, set by the workflow), so the calibration describes that judge.
    const judgeModel = Deno.env.get("EVAL_JUDGE_MODEL");
    if (!judgeModel) { console.log("NOT RUN: EVAL_JUDGE_MODEL is not set (the battery's judge model)."); Deno.exit(2); }
    const cfg = { ...modelConfig(Deno.env, "chat"), model: judgeModel };
    if (effort) cfg.reasoningEffort = effort;
    model = cfg.model;
    const budget = Number(opt("--budget-usd") ?? Deno.env.get("EVAL_BUDGET_USD") ?? 15);
    if (!(budget > 0) || !PRICES[cfg.model]) { console.log("NOT RUN: a budget needs a positive number and a priced judge model."); Deno.exit(2); }
    const prior: any[] = [];
    for await (const e of Deno.readDir(resultsDir)) if (e.name.endsWith(".json")) { try { prior.push(JSON.parse(await Deno.readTextFile(new URL(e.name, resultsDir)))); } catch { /* not a result */ } }
    before = spentUsd(prior, label);
    meter = newMeter();
    stop = budgetStop(budget, () => before + meter.usd_micros / 1e6, 0.5);
    console.log(`budget $${budget.toFixed(2)} · already spent $${before.toFixed(3)} · judge votes ${votes} · reasoning ${effort || "default"}`);
    judge = async (prompt: string) => {
      let last: unknown;
      for (let t = 0; t < 2; t++) {
        try {
          const res = await callModel(cfg, { system: "You are a careful, literal grader. Output JSON only.", messages: [{ role: "user", content: prompt }], max_tokens: 3500 }, { meter, role: "chat" });
          return parseItemJudge((res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
        } catch (e) { last = e; }
      }
      throw last;
    };
  }
  const fingerprint = await judgeFingerprint(model, votes, effort);
  // --if-needed: a full calibration of this exact judge already on the branch is reused, not paid for again.
  if (args.includes("--if-needed")) {
    for await (const e of Deno.readDir(resultsDir)) {
      if (!e.name.startsWith("judge-calibration-")) continue;
      try {
        const r = JSON.parse(await Deno.readTextFile(new URL(e.name, resultsDir)));
        if (r.fingerprint === fingerprint && !r.code_only && !r.stopped && r.split === "all") { console.log(`calibration of judge ${fingerprint} exists: ${e.name} (held-out disagreement ${(100 * (r.noise?.heldout_disagreement_both ?? NaN)).toFixed(1)}%); not run again`); Deno.exit(0); }
      } catch { /* not a calibration */ }
    }
  }
  const shelves = new Map<string, any>(), results = new Map<string, any>();
  const load = async (name: string, cache: Map<string, any>) => { if (!cache.has(name)) cache.set(name, JSON.parse(await Deno.readTextFile(new URL(name, resultsDir)))); return cache.get(name); };
  const rows: any[] = [];
  let stopped: string | null = null;
  // One labeled item: code's items, then the model's votes (in parallel). A judged item with no vote back is an error,
  // reported and left out of the agreement, never counted as the judge's verdict.
  const grade = async (l: Label) => {
    const res = await load(`tasks-${l.brain}-${l.run}.json`, results);
    const item = res.items.find((x: any) => x.id === l.task);
    const shelf = await load(`shelf-${l.run}.json`, shelves);
    const task = tasks[l.task], c = makeCtx(shelf, item.fills), run = storedRun(item);
    const items = rubricItems(task, c, run);
    let v: V2Verdict, open = false, error: string | null = null;
    if (codeOnly) {
      open = needsJudge(items);
      v = { ...combine(items, []), pass: !codeFailed(items) };
    } else {
      const vs: any[] = [];
      if (needsJudge(items)) {
        const prompt = judgeV2Prompt(task, c, item.turns, run, items);
        const got = await Promise.allSettled(Array.from({ length: votes }, () => judge!(prompt)));
        for (const g of got) if (g.status === "fulfilled") vs.push(g.value); else error = g.reason instanceof Error ? g.reason.message : String(g.reason);
        if (!vs.length) console.log(`  judge error R${l.run_n} ${l.brain} ${l.task}: ${error}`); else error = null;
      }
      v = combine(items, vs);
    }
    const lab = l.label === "pass";
    if (!codeOnly) console.log(`R${l.run_n} ${l.brain.padEnd(6)} ${l.task} label ${l.label.padEnd(4)} judge ${error ? "ERROR" : v.pass ? "pass" : "fail"}${error || lab === v.pass ? "" : "   <-- disagree"}`);
    return { run_n: l.run_n, split: l.split, brain: l.brain, task: l.task, sure: l.sure, label: l.label, first_judge: l.first_judge, judge: v.pass ? "pass" : "fail", open, error, agree: lab === v.pass, label_reason: l.reason, items: v.items };
  };
  const todo = (cal.labels as Label[]).filter((l) => split === "all" || l.split === split);
  const width = codeOnly ? 1 : Math.max(1, Number(Deno.env.get("EVAL_JUDGE_PARALLEL") || 6));
  for (let i = 0; i < todo.length; i += width) {
    if (!codeOnly && (stopped = stop())) break;
    rows.push(...await Promise.all(todo.slice(i, i + width).map(grade)));
  }
  const pick = (f: (r: any) => boolean) => rows.filter(f).filter((r) => !r.open && !r.error);
  const cm = (f: (r: any) => boolean, by: "judge" | "first_judge" = "judge") => confusion(pick(f).map((r) => ({ label: r.label === "pass", judge: r[by] === "pass" })));
  const splits: Record<string, any> = {};
  for (const [name, f] of [["tune_runs_1_6", (r: any) => r.split === "tune"], ["tune_runs_4_6", (r: any) => r.split === "tune" && r.run_n >= 4], ["heldout_runs_7_8", (r: any) => r.split === "heldout"], ["all", () => true]] as [string, (r: any) => boolean][]) {
    splits[name] = {
      both: cm(f), agent: cm((r) => f(r) && r.brain === "agent"), router: cm((r) => f(r) && r.brain === "router"),
      both_sure_only: cm((r) => f(r) && r.sure), first_judge_both: cm(f, "first_judge"), first_judge_agent: cm((r) => f(r) && r.brain === "agent", "first_judge"),
    };
  }
  const held = splits.heldout_runs_7_8;
  const dis = (b: any) => b.n ? 1 - b.rate : null;
  const out = {
    label, kind: "judge-calibration", judge_version: 2, fingerprint, model: codeOnly ? null : model, votes: codeOnly ? 0 : votes, reasoning: effort, code_only: codeOnly, split,
    run_at: new Date().toISOString(), stopped,
    cost_usd: { brain: 0, judge: meter ? meter.usd_micros / 1e6 : 0 }, unpriced_calls: meter ? meter.unpriced : 0, spent_before_usd: before,
    noise: { heldout_disagreement_both: dis(held.both), heldout_disagreement_agent: dis(held.agent), heldout_disagreement_router: dis(held.router) },
    splits, open_items: rows.filter((r) => r.open).length, judge_errors: rows.filter((r) => r.error).length, graded: rows.length, labeled: todo.length,
    disagreements: rows.filter((r) => !r.agree && !r.open && !r.error).map((r) => ({ run_n: r.run_n, brain: r.brain, task: r.task, label: r.label, judge: r.judge, sure: r.sure, label_reason: r.label_reason, failed: r.items.filter((i: any) => i.ok === false).map((i: any) => `${i.text} [${i.by}: ${i.detail}]`) })),
    rows,
  };
  if (!codeOnly || args.includes("--write")) {
    await Deno.mkdir(resultsDir, { recursive: true });
    await Deno.writeTextFile(new URL(`${label}.json`, resultsDir), JSON.stringify(out, null, 1));
  }
  const fmt = (c: Confusion) => `${c.agree}/${c.n} = ${(c.rate * 100).toFixed(1)}% [label pass & judge pass ${c.label_pass_judge_pass} · label fail & judge fail ${c.label_fail_judge_fail} · label fail, judge pass ${c.label_fail_judge_pass} · label pass, judge fail ${c.label_pass_judge_fail}]`;
  for (const [name, s] of Object.entries(splits)) {
    if (!s.both.n) continue;
    console.log(`${name}: judge v2 ${fmt(s.both)} | agent ${fmt(s.agent)} | router ${fmt(s.router)} | sure-only ${fmt(s.both_sure_only)} | first judge ${fmt(s.first_judge_both)}`);
  }
  if (codeOnly) console.log(`open (the model would still grade): ${out.open_items} items; not counted above`);
  console.log(`${label}: fingerprint ${fingerprint} · cost $${out.cost_usd.judge.toFixed(3)}${stopped ? ` · STOPPED: ${stopped}` : ""}`);
  for (const d of out.disagreements) console.log(`  disagree R${d.run_n} ${d.brain} ${d.task}: label ${d.label}${d.sure ? "" : " (unsure)"}, judge ${d.judge} :: ${d.failed.join(" | ").slice(0, 300) || d.label_reason}`);
}
// Not awaited at the top: judge-v2.ts imports this module, and a top-level await on that import never resolves.
if (import.meta.main) main(Deno.args).catch((e) => { console.error(e); Deno.exit(1); });
