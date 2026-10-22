// WO-061: re-score a recorded run's stored replies with one judge, without running the brain again (owner, 2026-10-21:
// "re-score the affected runs after the fix"). Run 39541224991's second judge (gpt-4.1-mini) failed every call with HTTP
// 400 (reasoning_effort, fixed in model_gateway.ts). Files from before WO-061's judge-2 repair keep each item's replies but
// not the brain's end state, so their judge sees "state: null": disclosed in the output. Writes results/<label>-rejudge-<model>.json
// once; a file already there is never rewritten. Spend is recorded like any run's and counts against EVAL_BUDGET_USD.
//   deno run -A evals/career/rejudge.ts <label> <judge model>
import { judgePrompt, parseJudge, spentUsd, type EvalItem } from "./run.ts";
import { callModel, modelConfig, newMeter, PRICES } from "../../supabase/functions/_shared/model_gateway.ts";

const [label, model] = Deno.args;
if (!label || !model) { console.log("usage: rejudge.ts <label> <judge model>"); Deno.exit(2); }
if (!Deno.env.get("OPENAI_API_KEY")) { console.log("NOT RUN: no OPENAI_API_KEY."); Deno.exit(2); }
const out = new URL(`./results/${label}-rejudge-${model}.json`, import.meta.url);
try { await Deno.stat(out); console.log(`already re-scored: ${out.pathname}`); Deno.exit(0); } catch { /* not yet */ }
if (!PRICES[model]) { console.log(`NOT RUN: ${model} is unpriced, so its spend cannot be capped.`); Deno.exit(2); }
const src = JSON.parse(await Deno.readTextFile(new URL(`./results/${label}.json`, import.meta.url)));
const set = JSON.parse(await Deno.readTextFile(new URL(src.set === "heldout" ? "./heldout-live.json" : "./messages.json", import.meta.url)));
const byId = new Map<string, EvalItem>(set.items.map((i: EvalItem) => [i.id, i]));
const prior: any[] = [];
for await (const e of Deno.readDir(new URL("./results/", import.meta.url))) if (e.name.endsWith(".json")) prior.push(JSON.parse(await Deno.readTextFile(new URL(`./results/${e.name}`, import.meta.url))));
const budget = Number(Deno.env.get("EVAL_BUDGET_USD") ?? "0"), before = spentUsd(prior, `${label}-rejudge-${model}`);
const meter = newMeter(), cfg = { ...modelConfig(Deno.env, "chat"), model };
const items: any[] = [];
for (const x of src.items) {
  if (budget && before + meter.usd_micros / 1e6 + 0.05 >= budget) { console.log("STOPPED at the spend cap: not a score."); break; }
  const it = byId.get(x.id);
  const reply = (x.replies ?? []).at(-1) ?? "";
  if (!it) { items.push({ id: x.id, pass: false, failed: [], note: "item no longer in the set" }); continue; }
  let v;
  try {
    const res = await callModel(cfg, { system: "You are a strict grader. Output JSON only.", messages: [{ role: "user", content: judgePrompt(it, reply, x.state ?? null) }], max_tokens: 400 }, { meter, role: "chat" });
    v = parseJudge((res.content || []).filter((b: any) => b.type === "text").map((b: any) => b.text).join(""));
  } catch (e) { v = { pass: false, failed: it.must, score: 1, note: `judge error: ${e instanceof Error ? e.message : String(e)}` }; }
  items.push({ id: x.id, ...v });
}
const passed = items.filter((x) => x.pass).length;
const result = { label: `${label}-rejudge-${model}`, of: label, judge_model: model, state_given: src.items.some((x: any) => "state" in x) ? "the end state the run's judges saw" : "null (this run's file does not keep the brain's end state)", set: src.set, brain: src.brain, source_commit: src.source_commit, run_at: new Date().toISOString(),
  cost_usd: { brain: 0, judge: meter.usd_micros / 1e6 }, total: items.length, passed, pass_rate: items.length ? passed / items.length : 0, stopped: items.length < src.items.length ? "spend cap" : null, items };
await Deno.writeTextFile(out, JSON.stringify(result, null, 1));
console.log(`${result.label}: ${passed}/${items.length} · judge ${model} · cost $${(meter.usd_micros / 1e6).toFixed(4)} · judge errors ${items.filter((x) => /^judge error/.test(x.note ?? "")).length}`);
