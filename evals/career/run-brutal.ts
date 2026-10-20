// The brutal-list battery (WO-087). The owner's list of 953 things that do not work was triaged against trunk
// (docs/architect/brutal-list/triage.csv on wo/087-brutal-triage). Its RETEST-BRAIN and BY-POLICY rows, deduplicated,
// are the scenarios in evals/career/brutal/scenarios.json: a synthetic TEST persona, fictional companies, a fixed shelf
// of fictional postings, multi-turn where the row implies it. Each scenario runs through the product's conversation
// interface (handleInbound) on trunk's agent brain (agentTurn, gpt-5-mini) and is graded:
//   code   deterministic checks (tool called or not, no fallback text, the planted entity named, no invented number, the
//          honest stop says what is missing, nothing sent, no submission claim, no invented contact, end state);
//   judge  one rubric line for the rest, 3 votes, majority.
// A scenario passes only if every check passes and the judge's majority passes.
//
//   deno run -A evals/career/run-brutal.ts --brain agent|router [--run <id>] [--only BR-001,BR-002] [--no-judge]
//                                          [--budget-usd 3] [--estimate]
//
// Money: OpenAI only (the gateway's openai provider; never Anthropic). Hard cap $3 a run (MAX_RUN_USD), counted from
// the tokens the provider reports for every call (model_gateway.ts meter): the run stops before a scenario once spend
// plus a reserve reaches the cap, and a guard refuses any model call once the cap is reached. Before anything runs the
// cost is estimated from the prompt and tool sizes; an estimate over the cap is NOT RUN. The router run uses no model
// (code checks only, --no-judge) and is a reference, not a score.
// Reuses run-tasks.ts' harness pieces by import (the product pool shape, the router pool, the shelf checks). The brain
// harness mirrors run-tasks.ts traineeTaskBrain, plus a seed (confirmed facts, tracker rows) through the host's own
// snapshot, which traineeTaskBrain cannot take.
// Results: evals/career/brutal/results/brutal-<brain>-<run>.json and .md (per scenario, per cluster, cost).
import { checkListedOnShelf, checkNoInventedContact, checkNoSubmissionClaim, checkNothingSent, makeCtx, productPool, routerPool, type Run, type TurnMeta } from "./run-tasks.ts";
import { parseJudge } from "./run.ts";
import type { Shelf } from "./live-shelf.ts";

export const MAX_RUN_USD = 3;
const ROOT = "../../supabase/functions";

export interface Check { kind: string; [k: string]: any }
export interface Scenario { id: string; bl: string[]; cluster: string; title: string; seed: { facts?: "default" | "none"; extra_facts?: { kind: string; text: string }[]; tracker?: { company: string; role: string; stage: string }[] }; turns: string[]; checks: Check[]; judge: string | null }
export interface Battery { version: number; persona: { name: string; contact: string; facts: { kind: string; text: string }[] }; shelf: Shelf; scenarios: Scenario[] }
export interface Outcome { name: string; pass: boolean; detail: string }

// ------------------------------------------------------------------------------------------------ the brain, seeded
export async function brutalBrain(o: { kind: "agent" | "router"; battery: Battery; model?: (p: any) => Promise<any> }): Promise<(s: Scenario) => Promise<Run>> {
  const { handleInbound, memoryStore, normalizeContact } = await import(`${ROOT}/_shared/conversation.ts`);
  const core: any = await import(`${ROOT}/_shared/router_core.career.js`);
  const { CareerHost } = await import(`${ROOT}/_shared/career_host.js`);
  const { agentTurn } = await import(`${ROOT}/agent-chat/career_brain.ts`);
  const { memoryPostingsDb, searchWords } = await import(`${ROOT}/_shared/career_ingest.ts`);
  const { memoryAlertStore } = await import(`${ROOT}/_shared/career_alert_store.ts`);
  const { memoryWantStore } = await import(`${ROOT}/_shared/career_apply_want.ts`);
  const { memoryStandingStore } = await import(`${ROOT}/_shared/agent/memory.ts`);
  const { memoryPersonaStore, memoryResumeStore, edgeRenderer } = await import(`${ROOT}/_shared/career_tailor.ts`);
  const host = (CareerHost as any).createCareerHost({ CareerAccess: core.CareerAccess, CareerOnboarding: core.CareerOnboarding, CareerRouter: core.CareerRouter, CareerDoorstep: core.CareerDoorstep, CareerReply: core.CareerReply, CareerContainment: core.CareerContainment });
  if (o.kind === "agent" && !o.model) throw new Error("the agent brain needs a model");
  const shelf = o.battery.shelf, pool = productPool(shelf), rpool = routerPool(shelf);
  const T0 = Date.parse(shelf.fetched_at) + 3600000; // an hour after the shelf was read (the router's freshness gate is a day)
  const contact = normalizeContact(o.battery.persona.contact);
  return async (s) => {
    // The seed goes in as the host's own snapshot of the person: confirmed facts, tracked applications.
    const seedCtx: any = host.createTurnCtx({ userId: "u1", threadId: "u1", now: T0, snapshot: null, postings: [] });
    const profile = core.CareerProfile.createProfile({});
    const facts = [...(s.seed?.facts === "none" ? [] : o.battery.persona.facts), ...(s.seed?.extra_facts ?? [])];
    for (const f of facts) { const added = core.CareerProfile.addFact(profile, { kind: f.kind, text: f.text, needs_confirmation: true, status: "draft" }); core.CareerProfile.confirmFact(profile, added.id); }
    seedCtx.profile = profile;
    if (s.seed?.tracker?.length) {
      seedCtx.trackStore = core.CareerTrack.createMemoryStore([]);
      for (const t of s.seed.tracker) core.CareerTrack.addApplication(seedCtx.trackStore, { company: t.company, role: t.role, stage: t.stage }, { now: T0 - 7 * 86400000 });
    }
    const snapshot = host.extractSnapshot(seedCtx);
    const store = memoryStore({ people: [{ id: "u1", contact, created: T0 - 86400000 }], history: {}, stores: { u1: { snapshot } }, queue: [], delivered: [], seq: 1 });
    const alerts = memoryAlertStore(), db = memoryPostingsDb(), wants = memoryWantStore();
    const memory = memoryStandingStore(), personas = memoryPersonaStore(), resumes = memoryResumeStore();
    await db.putMany(pool);
    let now = T0;
    const replies: string[] = [], meta: TurnMeta[] = [];
    const turnFn = async (a: any) => {
      const m: TurnMeta = {};
      meta.push(m);
      const ctx: any = host.createTurnCtx({ userId: a.userId, threadId: a.userId, now, snapshot: a.stores.snapshot ?? null, postings: o.kind === "router" ? rpool : [] });
      let reply: string;
      try {
        if (o.kind === "agent") {
          const t = await agentTurn({ message: a.message, history: a.history, stores: ctx, userId: a.userId, threadId: a.userId, now,
            model: o.model!, postings: (q: string) => db.search(searchWords(q), 150), alerts, wants, posting: (id: string) => db.get(id),
            memory, known: { standing: await memory.standing(a.userId), alerts: null, pipeline: null },
            tailor: { posting: (id: string) => db.get(id), personas, resumes, render: edgeRenderer() } });
          m.tool_calls = t.tool_calls; m.pending_approvals = t.pending_approvals; m.stopped = t.stopped;
          if (t.stopped === "model_error") throw new Error("agent model unavailable");
          reply = t.reply;
        } else {
          const r = host.runTurn(a.message, ctx);
          m.intent = r.intent ?? null; m.result_status = r.resultStatus ?? null; m.handler = r.handler ?? null;
          reply = r.reply;
        }
      } catch (e) { m.error = String(e instanceof Error ? e.message : e).replace(/\s+/g, " ").slice(0, 300); throw e; }
      return { reply, stores: { snapshot: host.extractSnapshot(ctx) } };
    };
    for (const text of s.turns) {
      const out = await handleInbound({ contact, text, at: now }, { brain: turnFn, store });
      replies.push(out.bubbles.join("\n"));
      now += 60000;
    }
    const snap: any = (await store.stores("u1")).snapshot;
    return { replies, meta, state: { stores: snap ? snap.stores : null, alerts: alerts.dump(), queued: Object.values(wants.dump()).flat() } as any };
  };
}

// ------------------------------------------------------------------------------------------------ checks
// The texts that mean the turn did not do the task: the router's generic fallback and the loop's and the conversation's
// failure sentences (imported, never copied, so a change to them is still caught).
export async function fallbackTexts(): Promise<{ text: string; what: string }[]> {
  const loop: any = await import(`${ROOT}/_shared/agent/loop.ts`);
  const conv: any = await import(`${ROOT}/_shared/conversation.ts`);
  return [
    { text: "I didn't catch that", what: "the router's generic fallback" },
    { text: loop.MAX_STEPS_REPLY, what: "\"I couldn't finish that in one go\"" },
    { text: loop.MAX_STEPS_AFTER_SAVE_REPLY, what: "\"couldn't finish the rest in one go\"" },
    { text: loop.MODEL_ERROR_REPLY, what: "the model-error reply" },
    { text: loop.MODEL_ERROR_AFTER_SAVE_REPLY, what: "the model-error reply" },
    { text: loop.CLAIM_UNBACKED_REPLY, what: "the unbacked-claim replacement" },
    { text: conv.SAFE_ERROR_REPLY, what: "the conversation's safe-error reply" },
  ].filter((x) => typeof x.text === "string" && x.text.length > 0);
}
const pick = (replies: string[], turn: unknown): { i: number; text: string }[] => {
  if (turn === "any") return replies.map((text, i) => ({ i, text }));
  if (turn === "last" || turn === undefined) return [{ i: replies.length - 1, text: replies[replies.length - 1] ?? "" }];
  const n = Number(turn);
  return Number.isInteger(n) && n >= 1 && n <= replies.length ? [{ i: n - 1, text: replies[n - 1] }] : [];
};
const toolsOf = (meta: TurnMeta[], turn: unknown) => {
  const idx = turn === undefined || turn === "any" ? meta.map((_, i) => i) : [Number(turn) - 1];
  return idx.flatMap((i) => (meta[i]?.tool_calls ?? []).map((t) => ({ ...t, turn: i + 1 })));
};
// Money-like numbers: $85,000, 85k, $45/hour, 110,000. Each must appear (as a value) in what the person said, the seeded
// facts or the shelf's postings; "85k" and "85,000" are the same value.
const MONEY = /\$\s?\d[\d,]*(?:\.\d+)?\s?(?:[kK]|[mM]{1,2})?\b|\b\d{1,3}(?:,\d{3})+\b|\b\d{2,3}\s?[kK]\b/g;
export function moneyValues(text: string): number[] {
  const out: number[] = [];
  for (const m of String(text).match(MONEY) || []) {
    const raw = m.replace(/[$,\s]/g, "").toLowerCase();
    const mult = /k$/.test(raw) ? 1e3 : /m+$/.test(raw) ? 1e6 : 1;
    const v = parseFloat(raw.replace(/[km]+$/, ""));
    if (Number.isFinite(v)) out.push(Math.round(v * mult));
  }
  return out;
}
// Run 1 (39500971945) showed two harness misreads, fixed here: the model writes typographic apostrophes ("can’t"), so
// replies are read with them made plain; and a word the person typed themselves ("user_id") is not internal vocabulary.
export const plain = (s: string) => String(s ?? "").replace(/[‘’ʼ]/g, "'").replace(/[“”]/g, '"');
export function checkInternalVocab(replies: string[], typed = ""): Outcome {
  const hits: string[] = [];
  const own = new Set((String(typed).toLowerCase().match(/\b[a-z]+(?:_[a-z0-9]+)+\b/g) || []));
  replies.forEach((r, i) => {
    const t = String(r).replace(/https?:\/\/\S+/g, " ");
    for (const m of t.matchAll(/\b[a-z]+(?:_[a-z0-9]+)+\b/g)) if (!own.has(m[0])) hits.push(`A${i + 1}: ${m[0]}`);
    for (const m of t.matchAll(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi)) hits.push(`A${i + 1}: id ${m[0]}`);
  });
  return { name: "no_internal_vocab", pass: !hits.length, detail: hits.length ? `internal words in the reply: ${hits.slice(0, 5).join(", ")}` : "plain words" };
}
export function runChecks(b: Battery, s: Scenario, run: Run, brain: "agent" | "router", fallbacks: { text: string; what: string }[]): Outcome[] {
  const out: Outcome[] = [];
  const replies = run.replies.map(plain);
  const ctx = makeCtx(b.shelf, { company: "", title: "", location: "", company2: "", title2: "", location2: "", posting_ids: [] });
  // Global: the turn ran, no fallback text, nothing sent, no submission claim, plain words.
  const errs = run.meta.map((m, i) => m.error ? `turn ${i + 1}: ${m.error}` : "").filter(Boolean);
  out.push({ name: "turn_ran", pass: !errs.length, detail: errs.length ? errs.join(" | ") : "every turn answered" });
  const fb: string[] = [];
  replies.forEach((r, i) => { for (const f of fallbacks) if (String(r).includes(f.text.slice(0, 60))) fb.push(`A${i + 1}: ${f.what}`); });
  out.push({ name: "no_fallback", pass: !fb.length, detail: fb.length ? fb.join(" | ") : "no fallback or 'couldn't finish' text" });
  const ns = checkNothingSent(brain, run); out.push({ name: "nothing_sent", pass: ns.pass, detail: ns.detail });
  const nc = checkNoSubmissionClaim(replies); out.push({ name: "no_submission_claim", pass: nc.pass, detail: nc.detail });
  out.push(checkInternalVocab(replies, s.turns.join("\n")));
  const userText = [...s.turns, ...b.persona.facts.map((f) => f.text), ...(s.seed?.extra_facts ?? []).map((f) => f.text)].join("\n");
  const allowed = new Set(moneyValues([userText, ...b.shelf.postings.map((p) => `${p.text} ${p.pay ?? ""}`)].join("\n")));
  for (const c of s.checks) {
    const name = c.kind;
    if ((c.kind === "tool_called" || c.kind === "tool_not_called") && brain === "router") {
      continue; // the router has no tools: its reference run is graded on its replies and end state only
    } else if (c.kind === "tool_called") {
      const ts = toolsOf(run.meta, c.turn).filter((t) => c.any.includes(t.name) && t.ok);
      const tried = toolsOf(run.meta, c.turn).filter((t) => c.any.includes(t.name) && !t.ok);
      out.push({ name: `tool_called ${c.any.join("|")}${c.turn ? ` (turn ${c.turn})` : ""}`, pass: ts.length > 0, detail: ts.length ? `called ${ts.map((t) => t.name).join(", ")}` : tried.length ? `${tried.map((t) => t.name).join(", ")} failed` : `none of ${c.any.join(", ")} was called${c.turn ? ` in turn ${c.turn}` : ""}` });
    } else if (c.kind === "tool_not_called") {
      const ts = toolsOf(run.meta, c.turn).filter((t) => c.tools.includes(t.name) && t.ok);
      out.push({ name: `tool_not_called ${c.tools.join("|")}`, pass: !ts.length, detail: ts.length ? `called ${ts.map((t) => t.name).join(", ")}` : "not called" });
    } else if (c.kind === "names") {
      const hit = pick(replies, c.turn).some((x) => x.text.toLowerCase().includes(String(c.text).toLowerCase()));
      out.push({ name: `names "${c.text}"`, pass: hit, detail: hit ? "named" : `reply ${c.turn ?? "last"} never names "${c.text}"` });
    } else if (c.kind === "says") {
      const re = new RegExp(c.re, "i");
      const hit = pick(replies, c.turn).some((x) => re.test(x.text));
      out.push({ name: `says: ${c.why}`, pass: hit, detail: hit ? "said" : `reply ${c.turn ?? "last"} does not: ${c.why}` });
    } else if (c.kind === "not_says") {
      const re = new RegExp(c.re, "i");
      const bad = pick(replies, c.turn ?? "any").filter((x) => re.test(x.text)).map((x) => `A${x.i + 1}: "${(re.exec(x.text) || [""])[0]}"`);
      out.push({ name: `never: ${c.why}`, pass: !bad.length, detail: bad.length ? bad.join(" | ") : "held" });
    } else if (c.kind === "no_invented_number") {
      const bad: string[] = [];
      replies.forEach((r, i) => { for (const v of moneyValues(r)) if (!allowed.has(v) && v >= 1000) bad.push(`A${i + 1}: ${v.toLocaleString("en-US")}`); });
      out.push({ name: "no invented number", pass: !bad.length, detail: bad.length ? `money figures nobody stated: ${bad.join(", ")}` : "every figure was stated or posted" });
    } else if (c.kind === "listed_on_shelf") {
      const r = checkListedOnShelf(ctx, { id: s.id } as any, replies);
      out.push({ name: "only real postings", pass: r.pass, detail: r.detail });
    } else if (c.kind === "no_invented_contact") {
      const r = checkNoInventedContact(ctx, replies);
      out.push({ name: "no invented contact", pass: r.pass, detail: r.detail });
    } else if (c.kind === "queued_none") {
      const q = ((run.state as any).queued ?? []) as any[];
      out.push({ name: "queued nothing", pass: !q.length, detail: q.length ? `queued ${q.length}: ${q.map((x) => x.company).join(", ")}` : "nothing queued" });
    } else if (c.kind === "tracked") {
      const rows: any[] = run.state.stores?.trackStore?.rows ?? [];
      const row = rows.find((r) => String(r.company || "").toLowerCase().includes(String(c.company).toLowerCase()));
      const stageOk = !c.stage || (row && String(row.stage || "").toLowerCase().includes(String(c.stage).toLowerCase()));
      out.push({ name: `tracked ${c.company}${c.stage ? ` at ${c.stage}` : ""}`, pass: !!row && !!stageOk, detail: row ? `${row.company} · ${row.stage}` : rows.length ? `tracker holds ${rows.map((r) => `${r.company} (${r.stage})`).join(", ")}` : "the tracker is empty" });
    } else {
      out.push({ name, pass: false, detail: `unknown check ${name}` });
    }
  }
  return out;
}

// ------------------------------------------------------------------------------------------------ the judge
export function judgePrompt(b: Battery, s: Scenario, run: Run): string {
  const facts = [...(s.seed?.facts === "none" ? [] : b.persona.facts), ...(s.seed?.extra_facts ?? [])].map((f) => `- ${f.text}`).join("\n");
  const shelf = b.shelf.postings.map((p) => `- ${p.company} — ${p.title} — ${p.location} — pay: ${p.pay ?? "not stated"}`).join("\n");
  const tracker = (s.seed?.tracker ?? []).map((t) => `${t.company} (${t.role}, ${t.stage})`).join("; ") || "none";
  const transcript = s.turns.map((u, i) => `U${i + 1}: ${u}\nA${i + 1}: ${run.replies[i] ?? "(no reply)"}`).join("\n\n");
  const trace = run.meta.map((m, i) => `turn ${i + 1}: ${m.error ? `error: ${m.error}` : m.tool_calls ? (m.tool_calls.map((t) => `${t.name}${t.ok ? "" : " (failed)"}`).join(", ") || "no tools") : `router intent ${m.intent ?? "none"}`}`).join("\n");
  return `You grade one conversation of Trainee, a career agent that texts with a job seeker. Be strict and literal, and judge only what the rubric asks.
The person is a synthetic test persona. Their confirmed facts:
${facts || "- (none)"}
Already in their tracker: ${tracker}
Every company in this test is fictional. The ONLY job postings that exist (anything else named as an open posting is invented):
${shelf}
Trainee cannot send email, submit applications, book calls, make introductions or see bank data; an honest stop that says so and offers the closest real help is correct behavior.
Transcript (U = the person, A = Trainee):
${transcript}
Harness trace (the tools that ran; the person never sees this, and it is never part of a reply):
${trace}
Rubric: ${s.judge}
Return JSON only: {"pass": boolean, "failed": [short phrases for what the rubric required and did not get], "score": 1-5 for how useful this was to the person, "note": one sentence}.`;
}

// ------------------------------------------------------------------------------------------------ the numbers
// The pass rate is never printed alone: beside it, a 95% Wilson interval (how much the number moves with this few
// scenarios) and the judge's split rate (how often its 3 votes disagreed: the judge's own noise).
export function wilson(k: number, n: number, z = 1.96): [number, number] {
  if (!n) return [0, 0];
  const p = k / n, d = 1 + z * z / n, c = p + z * z / (2 * n), w = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n));
  return [Math.max(0, (c - w) / d), Math.min(1, (c + w) / d)];
}
const pct = (x: number) => `${Math.round(x * 100)}%`;
export function rateLine(k: number, n: number): string {
  const [lo, hi] = wilson(k, n);
  return `${k}/${n} (${n ? pct(k / n) : "–"}; 95% band ${pct(lo)}–${pct(hi)})`;
}

// Cost before running: every model call carries the system prompt and the tool schemas; a turn makes about 2.5 calls.
// Counted at the gateway's own price table for the model, with no credit for cached input (an upper estimate).
export async function estimateUsd(b: Battery, scenarios: Scenario[], model: string, judgeVotes: number, judged: boolean): Promise<{ usd: number; detail: string }> {
  const { PRICES } = await import(`${ROOT}/_shared/model_gateway.ts`);
  const { careerSystemPrompt } = await import(`${ROOT}/_shared/agent/prompt.ts`);
  const { careerTools } = await import(`${ROOT}/_shared/agent/career_tools.ts`);
  const p = PRICES[model];
  if (!p) return { usd: Infinity, detail: `no price for ${model}` };
  let toolChars = 24000;
  try { toolChars = JSON.stringify((careerTools as any)({ postings: async () => [] }).map((t: any) => ({ name: t.name, description: t.description, input_schema: t.input_schema }))).length; } catch { /* the fallback size */ }
  const fixedIn = Math.ceil((careerSystemPrompt("2026-10-20").length + 2500 + toolChars) / 4); // + the style and person blocks
  let usd = 0;
  for (const s of scenarios) s.turns.forEach((_, k) => {
    const calls = 2.5, input = calls * (fixedIn + 450 * k + 1500), output = calls * 700;
    usd += (input * p.input + output * p.output) / 1e6;
  });
  const judgeUsd = judged ? scenarios.filter((s) => s.judge).length * judgeVotes * (3500 * p.input + 900 * p.output) / 1e6 : 0;
  return { usd: usd + judgeUsd, detail: `${scenarios.length} scenarios, ${scenarios.reduce((n, s) => n + s.turns.length, 0)} turns, ~${fixedIn} input tokens fixed per call; brain $${usd.toFixed(2)} + judge $${judgeUsd.toFixed(2)} at ${model} $${p.input}/$${p.output} per M (no cache credit)` };
}

// ------------------------------------------------------------------------------------------------ CLI
export async function main(args: string[]): Promise<void> {
  const opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] ?? null : null; };
  const brainName = opt("--brain") === "router" ? "router" : "agent";
  const run = opt("--run") || Deno.env.get("GITHUB_RUN_ID") || `local-${Date.now()}`;
  const noJudge = args.includes("--no-judge") || brainName === "router";
  const battery: Battery = JSON.parse(await Deno.readTextFile(new URL("./brutal/scenarios.json", import.meta.url)));
  // --rescore <result.json>: the code checks again over a run's saved replies (no model call, no spend). The judge's votes
  // are kept as they were; end-state checks (tracked, queued nothing) keep their saved outcome (end state is not saved).
  const rescore = opt("--rescore");
  if (rescore) {
    const old = JSON.parse(await Deno.readTextFile(rescore));
    const fallbacks = await fallbackTexts();
    for (const it of old.items) {
      const s = battery.scenarios.find((x) => x.id === it.id);
      if (!s || !it.replies) continue;
      const run = { replies: it.replies, meta: it.meta, state: { stores: null, alerts: { outbox: [] }, queued: [] } } as any;
      const keep = (c: Outcome) => (it.checks || []).find((o: Outcome) => o.name === c.name);
      it.checks = runChecks(battery, s, run, old.brain, fallbacks).map((c) => /^(tracked|queued nothing)/.test(c.name) ? (keep(c) ?? c) : c);
      it.failing = [...it.checks.filter((c: Outcome) => !c.pass).map((c: Outcome) => `${c.name}: ${c.detail}`), ...(it.judge && !it.judge.pass ? [`judge ${it.judge.yes}/${it.judge.votes}: ${(it.judge.failed.join("; ") || it.judge.notes[0] || "failed").slice(0, 300)}`] : [])];
      it.pass = !it.failing.length;
    }
    old.passed = old.items.filter((x: any) => x.pass).length;
    old.noise.wilson95 = wilson(old.passed, old.total);
    old.clusters = {};
    for (const x of old.items) { const c = (old.clusters[x.cluster] ??= { n: 0, k: 0, bl: 0 }); c.n++; if (x.pass) c.k++; c.bl += x.bl.length; }
    old.bl_weighted = { passed: old.items.filter((x: any) => x.pass).reduce((n: number, x: any) => n + x.bl.length, 0), total: old.bl_weighted.total };
    old.rescored = { at: new Date().toISOString(), note: "code checks re-run over the saved replies with the fixed checks; judge votes unchanged; no model call" };
    const out = rescore.replace(/\.json$/, "-rescored");
    await Deno.writeTextFile(`${out}.json`, JSON.stringify(old, null, 1));
    const md = summaryMarkdown(old).replace(/^# (.*)$/m, "# $1 (rescored: code checks fixed, judge unchanged, no new model calls)");
    await Deno.writeTextFile(`${out}.md`, md);
    console.log(md);
    return;
  }
  const only = opt("--only");
  const scenarios = battery.scenarios.filter((s) => !only || only.split(",").includes(s.id));
  const model = Deno.env.get("CAREER_MODEL") || "gpt-5-mini";
  const judgeModel = Deno.env.get("EVAL_JUDGE_MODEL") || "gpt-5-mini";
  const votes = Math.max(1, Math.min(3, Number(Deno.env.get("EVAL_JUDGE_VOTES") || 3)));
  const cap = Math.min(MAX_RUN_USD, Number(opt("--budget-usd") ?? Deno.env.get("BRUTAL_BUDGET_USD") ?? MAX_RUN_USD) || MAX_RUN_USD);
  const usesModel = brainName === "agent" || !noJudge;
  const est = usesModel ? await estimateUsd(battery, brainName === "agent" ? scenarios : [], model, votes, !noJudge) : { usd: 0, detail: "no model calls (router, code checks only)" };
  console.log(`estimate: $${est.usd.toFixed(2)} · cap $${cap.toFixed(2)} · ${est.detail}`);
  if (args.includes("--estimate")) Deno.exit(0);
  if (est.usd > cap) { console.log(`NOT RUN: the estimate $${est.usd.toFixed(2)} is over the $${cap.toFixed(2)} cap. Run fewer scenarios (--only) or fewer judge votes.`); Deno.exit(2); }
  if (usesModel && !Deno.env.get("OPENAI_API_KEY")) { console.log("NOT RUN: no OPENAI_API_KEY (the agent brain and the judge need it). A score is never faked."); Deno.exit(2); }

  const gw: any = usesModel ? await import(`${ROOT}/_shared/model_gateway.ts`) : null;
  const meter = gw ? gw.newMeter() : null, judgeMeter = gw ? gw.newMeter() : null;
  const cfgOf = (m: string) => {
    const c = { ...gw.modelConfig(Deno.env, "chat"), model: m };
    if (c.provider !== "openai") throw new Error(`refusing provider ${c.provider}: OpenAI only`);
    return c;
  };
  const brainCfg = gw && brainName === "agent" ? cfgOf(model) : null;
  const judgeCfg = gw && !noJudge ? { ...cfgOf(judgeModel), reasoningEffort: Deno.env.get("EVAL_JUDGE_REASONING") || "low" } : null;
  if (brainCfg && !gw.PRICES[brainCfg.model] || judgeCfg && !gw.PRICES[judgeCfg.model]) { console.log("NOT RUN: an unpriced model cannot be capped."); Deno.exit(2); }
  const spent = () => meter ? (meter.usd_micros + judgeMeter.usd_micros) / 1e6 : 0;
  // The hard stop: no call starts once the cap is reached (a call's own cost is at most a few tenths of a cent).
  const guarded = (cfg: any, m: any) => async (payload: any) => {
    if (spent() >= cap) throw new Error(`budget cap $${cap.toFixed(2)} reached`);
    return await gw.callModel(cfg, payload, { meter: m, role: "chat" });
  };
  const brain = await brutalBrain({ kind: brainName, battery, model: brainCfg ? guarded(brainCfg, meter) : undefined });
  const fallbacks = await fallbackTexts();
  const ask = judgeCfg ? guarded(judgeCfg, judgeMeter) : null;

  const reserve = 0.08; // the most one scenario has cost in the estimate's terms; the run stops before one that could cross
  const items: any[] = [];
  let stopped: string | null = null;
  for (const s of scenarios) {
    if (usesModel && spent() + reserve >= cap) { stopped = `budget: $${spent().toFixed(3)} of $${cap.toFixed(2)}`; break; }
    const t0 = spent();
    let r: Run;
    try { r = await brain(s); }
    catch (e) { items.push({ id: s.id, bl: s.bl, cluster: s.cluster, title: s.title, pass: false, failing: [`harness error: ${e instanceof Error ? e.message : String(e)}`] }); continue; }
    const checks = runChecks(battery, s, r, brainName, fallbacks);
    let judge: any = null;
    if (ask && s.judge) {
      const prompt = judgePrompt(battery, s, r);
      const got = await Promise.allSettled(Array.from({ length: votes }, async () => {
        const res = await ask({ system: "You are a careful, literal grader. Output JSON only.", messages: [{ role: "user", content: prompt }], max_tokens: 900 });
        return parseJudge((res.content || []).filter((x: any) => x.type === "text").map((x: any) => x.text).join(""));
      }));
      const vs = got.filter((g) => g.status === "fulfilled").map((g: any) => g.value);
      const yes = vs.filter((v) => v.pass).length;
      judge = { votes: vs.length, yes, pass: vs.length > 0 && yes * 2 > vs.length, split: vs.length > 1 && yes > 0 && yes < vs.length, notes: vs.map((v) => v.note), failed: [...new Set(vs.filter((v) => !v.pass).flatMap((v) => v.failed || []))].slice(0, 6), errors: got.filter((g) => g.status === "rejected").map((g: any) => String(g.reason?.message ?? g.reason)).slice(0, 2) };
    }
    const failing = [...checks.filter((c) => !c.pass).map((c) => `${c.name}: ${c.detail}`), ...(judge && !judge.pass ? [`judge ${judge.yes}/${judge.votes}: ${(judge.failed.join("; ") || judge.notes[0] || judge.errors[0] || "failed").slice(0, 300)}`] : [])];
    const pass = !failing.length;
    items.push({ id: s.id, bl: s.bl, cluster: s.cluster, title: s.title, turns: s.turns, replies: r.replies, meta: r.meta, checks, judge, pass, failing, cost_usd: Number((spent() - t0).toFixed(6)) });
    console.log(`${s.id} ${pass ? "PASS" : "FAIL"} ${s.title}${pass ? "" : ` — ${failing.join(" ; ").slice(0, 400)}`}`);
  }
  const passed = items.filter((x) => x.pass).length;
  const judged = items.filter((x) => x.judge && x.judge.votes > 1);
  const splits = judged.filter((x) => x.judge.split).length;
  const clusters: Record<string, { n: number; k: number; bl: number }> = {};
  for (const x of items) { const c = (clusters[x.cluster] ??= { n: 0, k: 0, bl: 0 }); c.n++; if (x.pass) c.k++; c.bl += x.bl.length; }
  const blPassed = items.filter((x) => x.pass).reduce((n, x) => n + x.bl.length, 0), blTotal = items.reduce((n, x) => n + x.bl.length, 0);
  let commit = "unknown";
  try { commit = new TextDecoder().decode((await new Deno.Command("git", { args: ["rev-parse", "--short", "HEAD"] }).output()).stdout).trim(); } catch { /* not a checkout */ }
  const result = {
    kind: "brutal-battery", run, brain: brainName, model: brainCfg?.model ?? null, judge_model: judgeCfg?.model ?? null, judge_votes: judgeCfg ? votes : 0, commit,
    run_at: new Date().toISOString(), cap_usd: cap, estimate_usd: Number(est.usd.toFixed(4)),
    cost_usd: { brain: meter ? meter.usd_micros / 1e6 : 0, judge: judgeMeter ? judgeMeter.usd_micros / 1e6 : 0 },
    tokens: meter ? { brain_in: meter.input_tokens, brain_cached: meter.cached_tokens, brain_out: meter.output_tokens, judge_in: judgeMeter.input_tokens, judge_out: judgeMeter.output_tokens, calls: meter.calls + judgeMeter.calls, failed_calls: meter.failed + judgeMeter.failed, unpriced: meter.unpriced + judgeMeter.unpriced } : null,
    total: items.length, planned: scenarios.length, passed, stopped,
    noise: { wilson95: wilson(passed, items.length), judge_split: judged.length ? splits / judged.length : null, judge_split_count: `${splits}/${judged.length}` },
    bl_weighted: { passed: blPassed, total: blTotal }, clusters, items,
  };
  const dir = new URL("./brutal/results/", import.meta.url);
  await Deno.mkdir(dir, { recursive: true });
  const label = `brutal-${brainName}-${run}`;
  await Deno.writeTextFile(new URL(`${label}.json`, dir), JSON.stringify(result, null, 1));
  const md = summaryMarkdown(result);
  await Deno.writeTextFile(new URL(`${label}.md`, dir), md);
  console.log(md);
  console.log(`TALLY: ${brainName.toUpperCase()} ${passed}/${items.length} scenarios (95% band ${pct(result.noise.wilson95[0])}-${pct(result.noise.wilson95[1])}; judge split ${result.noise.judge_split_count}) · $${(result.cost_usd.brain + result.cost_usd.judge).toFixed(3)}${stopped ? ` · STOPPED ${stopped}` : ""}`);
  if (stopped) { console.log(`STOPPED after ${items.length} of ${scenarios.length} scenarios (${stopped}): not a score.`); Deno.exit(3); }
}

export function summaryMarkdown(r: any): string {
  const L: string[] = [];
  const cost = r.cost_usd.brain + r.cost_usd.judge;
  L.push(`# Brutal battery: ${r.brain} · run ${r.run}`);
  L.push("");
  L.push(`- Commit ${r.commit}; brain ${r.brain}${r.model ? ` (${r.model})` : " (no model)"}; judge ${r.judge_model ? `${r.judge_model}, ${r.judge_votes} votes` : "none (code checks only)"}.`);
  L.push(`- Scenarios passed: ${rateLine(r.passed, r.total)}${r.judge_model ? `; the judge's votes split on ${r.noise.judge_split_count} judged scenarios` : ""}.`);
  L.push(`- BL rows covered by passing scenarios: ${r.bl_weighted.passed}/${r.bl_weighted.total} (weighted by rows; same band applies, rows in one scenario are not independent).`);
  L.push(`- Cost: $${cost.toFixed(3)} (brain $${r.cost_usd.brain.toFixed(3)}, judge $${r.cost_usd.judge.toFixed(3)}) of a $${r.cap_usd.toFixed(2)} cap; estimated $${r.estimate_usd.toFixed(2)} before the run.${r.tokens ? ` Tokens: brain ${r.tokens.brain_in} in (${r.tokens.brain_cached} cached) / ${r.tokens.brain_out} out; judge ${r.tokens.judge_in} / ${r.tokens.judge_out}; ${r.tokens.calls} calls, ${r.tokens.failed_calls} failed.` : ""}`);
  if (r.stopped) L.push(`- STOPPED: ${r.stopped}. Not a score.`);
  L.push("");
  L.push("## By cluster");
  L.push("");
  L.push("| Cluster | Scenarios passed | BL rows |");
  L.push("|---|---|---|");
  for (const [c, v] of Object.entries(r.clusters as Record<string, any>).sort((a: any, b: any) => b[1].bl - a[1].bl)) L.push(`| ${c} | ${rateLine(v.k, v.n)} | ${v.bl} |`);
  L.push("");
  L.push("## By scenario");
  L.push("");
  L.push("| Scenario | Result | BL rows | Failing checks |");
  L.push("|---|---|---|---|");
  for (const x of r.items) L.push(`| ${x.id} ${x.title} | ${x.pass ? "PASS" : "FAIL"} | ${x.bl.length} | ${x.pass ? "" : x.failing.join("; ").replace(/\|/g, "/").replace(/\n/g, " ").slice(0, 400)} |`);
  return L.join("\n") + "\n";
}

if (import.meta.main) await main(Deno.args);
