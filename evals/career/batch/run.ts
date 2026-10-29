// Batch scenario runner + grader. Runs thousands of simulated chats through the Trainee agent's chat entry and grades every reply.
//
//   deno run -A evals/career/batch/run.ts --mock [--n 1000] [--seed 1] [--out DIR]              no model calls, no network: a canned stub brain tests the harness
//   deno run -A evals/career/batch/run.ts --live [--entry handler|inbound] [--brain router|agent] --n 2000 --max-usd 3.00 [--judge-all] [--judge-pct 20]
//                                                                                              OpenAI only, through the model_budget reserve, hard cap (fail closed)
// Flags: --n (1..10000, default 1000) --seed (default 1) --label --out --max-usd (default 3.00) --judge-all --judge-pct --judge-model (default gpt-4.1-mini)
//        --judge-batch (default 5) --judge-pass (default 18 of 20) --concurrency (default 1) --trusted-hosts a.com,b.com (hosts whose links code may insert).
// Output (--out, default evals/career/results/batch-<label>/): chats.jsonl (one line per chat), report.md, run.json.
// Exit: 0 finished, 2 NOT RUN (missing key, binaries or bad flag), 3 stopped by the cap (not a full score), 4 a chat tried to reach a host outside the test namespace.
// Never Anthropic. Voice models refused. Nothing external is ever sent: see entries.ts.
import { loadSeeds, validateSeeds } from "../advice-seeds.ts";
import { PASS_TOTAL } from "../advice/score.ts";
import { checkChat, severityOf } from "./checks.ts";
import { assertAllowedModel, CapExceededError, DEFAULT_MAX_USD, guardFetch, handlerEntry, inboundEntry, RunCap, stubEntry, type Entry, type EntryResult, type GuardState, type Respond } from "./entries.ts";
import { DEFAULT_JUDGE_BATCH, DEFAULT_JUDGE_MODEL, DEFAULT_JUDGE_PCT, judgeAll, sampled, type JudgeCall } from "./judge.ts";
import { buildReport, type ChatRecord, type RunMeta } from "./report.ts";
import { expand, MAX_SCENARIOS, type Scenario } from "./variants.ts";

export interface BatchOpts {
  mode: "mock" | "live"; entry?: "stub" | "inbound" | "handler"; brain?: "router" | "agent"; n: number; runSeed: number; maxUsd: number; label?: string;
  judgeAll?: boolean; judgePct?: number; judgeModel?: string; judgeBatch?: number; judgePass?: number; concurrency?: number; trustedHosts?: string[];
  // test seams
  respond?: Respond; simCostMicros?: number; judgeCall?: JudgeCall; upstream?: typeof fetch; seeds?: ReturnType<typeof loadSeeds>;
}
export interface BatchResult { records: ChatRecord[]; jsonl: string; report: string; meta: RunMeta }

const noNetwork: typeof fetch = (async () => { throw new TypeError("no network in mock mode"); }) as typeof fetch;
// The mock judge: deterministic and free. It only exercises the plumbing (sampling, batching, parsing, the pass mark).
export const stubJudge: JudgeCall = async (_s, user) => {
  const ids = [...user.matchAll(/^### (\S+)$/gm)].map((m) => m[1]);
  return JSON.stringify({ results: ids.map((id) => ({ id, honest_read: 2, staged_timing: 2, field_fit: 2, sourced_numbers: 2, named_only_if_sourced: 2, networking: 1, credentials: 1, data_section: 2, unverified: 2, personalized: 2 })) });
};

export async function runBatch(o: BatchOpts): Promise<BatchResult> {
  if (!Number.isInteger(o.n) || o.n < 1 || o.n > MAX_SCENARIOS) throw new Error(`--n must be an integer from 1 to ${MAX_SCENARIOS}`);
  const seeds = o.seeds ?? loadSeeds();
  if (!o.seeds) { const bad = validateSeeds(seeds); if (bad.length) throw new Error(bad.join("; ")); }
  const scns = expand(seeds, o.n, o.runSeed);
  const cap = new RunCap(o.maxUsd), state: GuardState = { blocked: [], calls: 0 };
  const live = o.mode === "live";
  const judgeModel = o.judgeModel ?? DEFAULT_JUDGE_MODEL, brainModel = Deno.env.get("CAREER_MODEL") || "gpt-5-mini";
  if (live) {
    if (!Deno.env.get("OPENAI_API_KEY")) throw new NotRun("no OPENAI_API_KEY");
    if ((Deno.env.get("MODEL_PROVIDER") ?? "openai").toLowerCase() !== "openai") throw new NotRun("MODEL_PROVIDER must be openai here (never Anthropic)");
    try { assertAllowedModel(judgeModel); assertAllowedModel(brainModel); } catch (e) { throw new NotRun((e as Error).message); }
    Deno.env.set("MODEL_PROVIDER", "openai"); Deno.env.delete("ANTHROPIC_API_KEY");
  }
  const realFetch = globalThis.fetch, upstream = o.upstream ?? (live ? realFetch : noNetwork);
  const install = (inner: typeof fetch, origins: string[]) => { globalThis.fetch = guardFetch({ cap, inner, allowOrigins: origins, state }); };
  install(upstream, []);
  let entry: Entry;
  try {
    const kind = o.entry ?? (live ? "handler" : "stub");
    if (!live && kind !== "stub") throw new NotRun("--mock uses the stub entry only");
    entry = kind === "stub" ? stubEntry({ respond: o.respond, cap, simCostMicros: o.simCostMicros })
      : kind === "inbound" ? await inboundEntry({ brain: o.brain ?? "router", model: brainModel, apiKey: Deno.env.get("OPENAI_API_KEY")! })
      : await handlerEntry(scns, install);
  } catch (e) { globalThis.fetch = realFetch; throw e; }

  const results = new Map<number, EntryResult & { err?: string }>();
  let stopped: string | null = null, next = 0;
  const worker = async () => {
    for (;;) {
      const i = next++;
      if (i >= scns.length || stopped) return;
      if (cap.tripped || cap.spentUsd() >= o.maxUsd) { stopped ??= `cap $${o.maxUsd.toFixed(2)} reached after ${results.size} chats`; return; }
      try { results.set(i, await entry.run(scns[i])); }
      catch (e) {
        if (e instanceof CapExceededError || cap.tripped) { stopped ??= `${(e as Error).message}`; return; }
        results.set(i, { replies: [], links: [], sources: [], approvals: [], error: (e as Error).message });
      }
    }
  };
  try { await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 1) }, worker)); } finally { await entry.close(); }

  const trusted = o.trustedHosts ?? [];
  const records: ChatRecord[] = [];
  for (let i = 0; i < scns.length; i++) {
    const scn = scns[i], res = results.get(i);
    if (!res) continue;
    const findings = checkChat({ scn, replies: res.replies, allowedLinks: [...res.links, ...trusted], sources: res.sources, confirmed: [], approvals: res.approvals, externalAttempts: state.blocked.filter((b) => b.i === i).map((b) => b.what) });
    if (res.error) findings.push({ tag: "empty_reply", turn: -1, detail: `entry error: ${res.error}` });
    const tags = [...new Set(findings.map((f) => f.tag))];
    records.push({ i, id: scn.id, seedId: scn.seedId, group: scn.group, user: scn.user, axes: scn.axes, turns: scn.turns, replies: res.replies, approvals: res.approvals, findings, tags, sev: severityOf(tags), judge: null, det_pass: tags.length === 0, pass: tags.length === 0, ...(res.error ? { error: res.error } : {}) });
  }
  // Layer (b): the sampled rubric judge, batched.
  const passTotal = o.judgePass ?? PASS_TOTAL, judgePct = o.judgePct ?? DEFAULT_JUDGE_PCT;
  const picked = records.filter((r) => sampled(o.runSeed, r.id, judgePct, !!o.judgeAll));
  let judgeCalls = 0;
  const call: JudgeCall = o.judgeCall ?? (live ? async (system, user, maxTokens) => {
    const { callModel } = await import("../../../supabase/functions/_shared/model_gateway.ts");
    const res = await callModel({ provider: "openai", model: judgeModel, apiKey: Deno.env.get("OPENAI_API_KEY")!, reasoningEffort: null }, { system, messages: [{ role: "user", content: user }], max_tokens: maxTokens, temperature: 0 }, { role: "chat" });
    return (res.content ?? []).filter((b: any) => b?.type === "text").map((b: any) => b.text).join("");
  } : stubJudge);
  const counted: JudgeCall = async (s, u, m) => { judgeCalls++; return await call(s, u, m); };
  const verdicts = await judgeAll(picked.map((r) => ({ scn: scns[r.i], replies: r.replies })), counted, { batch: o.judgeBatch ?? DEFAULT_JUDGE_BATCH, passTotal, stop: () => cap.tripped });
  for (const r of picked) { r.judge = verdicts.get(r.id) ?? "error"; r.pass = r.det_pass && (r.judge === "error" || r.judge.pass); }
  if (cap.tripped) stopped ??= "cap reached during judging";
  globalThis.fetch = realFetch;

  const label = o.label ?? `${o.mode}-${o.entry ?? (live ? "handler" : "stub")}-s${o.runSeed}-n${o.n}`;
  const meta: RunMeta = { label, mode: o.mode, entry: entry.name, brain: live ? (o.brain ?? "router") : "stub", runSeed: o.runSeed, planned: o.n, maxUsd: o.maxUsd, spentUsd: cap.spentUsd(), stopped, judgeModel: live || o.judgeCall ? judgeModel : "stub-judge", judgeCalls, judgePct, judgeAll: !!o.judgeAll, modelCalls: state.calls, blocked: state.blocked.length };
  return { records, jsonl: records.map((r) => JSON.stringify(r)).join("\n") + "\n", report: buildReport(records, meta), meta };
}

export class NotRun extends Error {}

if (import.meta.main) {
  const args = Deno.args, flag = (k: string) => args.includes(k), opt = (k: string) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : undefined; };
  const num = (k: string, d: number) => { const v = opt(k); return v === undefined ? d : Number(v); };
  if (flag("--mock") === flag("--live")) { console.error("NOT RUN: pass exactly one of --mock or --live"); Deno.exit(2); }
  const o: BatchOpts = {
    mode: flag("--live") ? "live" : "mock", entry: opt("--entry") as BatchOpts["entry"], brain: (opt("--brain") as BatchOpts["brain"]) ?? "router", n: num("--n", 1000), runSeed: num("--seed", 1), maxUsd: num("--max-usd", DEFAULT_MAX_USD),
    label: opt("--label"), judgeAll: flag("--judge-all"), judgePct: num("--judge-pct", DEFAULT_JUDGE_PCT), judgeModel: opt("--judge-model"), judgeBatch: num("--judge-batch", DEFAULT_JUDGE_BATCH), judgePass: num("--judge-pass", PASS_TOTAL),
    concurrency: num("--concurrency", 1), trustedHosts: (opt("--trusted-hosts") ?? "").split(",").map((s) => s.trim()).filter(Boolean),
  };
  try {
    const r = await runBatch(o);
    const out = opt("--out") ?? new URL(`../results/batch-${r.meta.label}/`, import.meta.url).pathname;
    await Deno.mkdir(out, { recursive: true });
    await Deno.writeTextFile(`${out}/chats.jsonl`, r.jsonl); await Deno.writeTextFile(`${out}/report.md`, r.report); await Deno.writeTextFile(`${out}/run.json`, JSON.stringify(r.meta, null, 1));
    const pass = r.records.filter((x) => x.pass).length;
    console.log(`${r.meta.label}: ${pass}/${r.records.length} pass (${(100 * pass / Math.max(1, r.records.length)).toFixed(1)}%) · spent $${r.meta.spentUsd.toFixed(4)} of $${r.meta.maxUsd.toFixed(2)} · ${out}`);
    if (r.meta.stopped) { console.log(`STOPPED: ${r.meta.stopped}: not a full score.`); Deno.exit(3); }
    if (r.meta.blocked) { console.log(`${r.meta.blocked} outbound attempts were blocked; see external_attempt in chats.jsonl.`); Deno.exit(4); }
  } catch (e) {
    console.error(e instanceof NotRun ? `NOT RUN: ${e.message}` : e instanceof Error && /^NOT RUN/.test(e.message) ? e.message : `ERROR: ${(e as Error).stack ?? e}`);
    Deno.exit(e instanceof NotRun || /^NOT RUN/.test((e as Error).message) ? 2 : 1);
  }
  Deno.exit(0);
}
