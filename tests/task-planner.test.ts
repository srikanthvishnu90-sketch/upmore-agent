// Task intelligence P1 acceptance (TASK-INTELLIGENCE-SPEC §8): TI-S2 ask once, TI-S3 compound, TI-S4 gate, never-automated.
// Every assertion is on state (plan/step/effect rows, provider calls), never reply prose. No model calls: the model is scripted.
// deno-lint-ignore-file no-explicit-any
import nodeAssert from "node:assert/strict";
const assert = (c: unknown, m?: string) => nodeAssert.ok(c, m);
const assertEquals = (a: unknown, b: unknown) => nodeAssert.deepEqual(a, b);
import { executeApproved, plannerTurn, type PlannerIO } from "../supabase/functions/_shared/task/planner.ts";
import { registry, type TaskDeps } from "../supabase/functions/_shared/task/registry.ts";
import { memoryPlanStore } from "../supabase/functions/_shared/task/store.ts";

const U = "u1";
const script = (...plans: any[]) => { let i = 0; return async () => ({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "plan_task", input: plans[Math.min(i++, plans.length - 1)] }] }); };
function io(over: { model?: any; deps?: Partial<TaskDeps>; has?: Record<string, boolean>; last?: string | null; defer?: string[]; store?: ReturnType<typeof memoryPlanStore> } = {}): PlannerIO {
  const store = over.store ?? memoryPlanStore();
  const has = over.has ?? {};
  return {
    store, registry: registry(), model: over.model, userId: U, threadId: "t1", channel: "web", now: () => 1_800_000_000_000, worker: "w1",
    lastIntent: async () => over.last ?? null, facts: { has: async (k) => has[k] ?? false }, ...(over.defer ? { defer: over.defer } : {}),
    deps: { profile: () => ({}), postings: { search: async () => [{ job_id: "j1", company: "Acme", title: "Data Intern", url: "https://acme.com/j1", location: "Chicago" }] }, plans: async () => [], ...(over.deps ?? {}) } as TaskDeps,
  };
}
const dump = (i: PlannerIO) => (i.store as any).dump();

Deno.test("TI-S3 compound ask is two steps, both done", async () => {
  const i = io({ model: script({ kind: "task", goal: "data internships and my tracker", steps: [{ capability: "jobs.search", inputs: { query: "data intern" } }, { capability: "status.read", inputs: {} }] }) });
  const r = await plannerTurn(i, "find data internships in chicago and tell me what my tracker looks like");
  assert(r.claimed);
  const d = dump(i);
  assertEquals(d.steps.map((s: any) => [s.capability, s.status]), [["jobs.search", "done"], ["status.read", "done"]]);
  assertEquals(d.plans[0].status, "done");
});

Deno.test("TI-S2 ask once: the resume is asked in plan A and never again in plan B", async () => {
  const store = memoryPlanStore(), has: Record<string, boolean> = {};
  const q = { kind: "task", goal: "queue", steps: [{ capability: "apply.queue", inputs: { postings: [] } }] };
  const wants = { list: async () => [] } as any;
  const a = io({ store, has, model: script(q), deps: { wants } });
  const r1 = await plannerTurn(a, "apply to those");
  assert(r1.claimed && r1.facts.asks.length === 1 && r1.facts.asks[0].first_time);
  const b = io({ store, has, model: script(q), deps: { wants } });
  const r2 = await plannerTurn(b, "apply to those too");
  assert(r2.claimed && r2.facts.asks.length === 1 && !r2.facts.asks[0].first_time);
  const d = dump(a);
  assertEquals(d.asks.filter((x: any) => x.ask_key === "resume.confirmed").length, 1);
  assertEquals(d.asks[0].times, 1);
  assert(d.steps.every((s: any) => s.status === "needs_person"));
});

Deno.test("never automated: a LinkedIn target is refused and no plan is created", async () => {
  const i = io({ model: script({ kind: "task", goal: "x", steps: [{ capability: "jobs.search", inputs: { query: "https://www.linkedin.com/jobs/view/1" } }] }) });
  const r = await plannerTurn(i, "search https://www.linkedin.com/jobs/view/1");
  assert(r.claimed);
  assertEquals((r as any).facts.refused_steps[0].why, "never_automated");
  assertEquals(dump(i).plans.length, 0);
});

Deno.test("unknown capability is refused (the model can only pick from the registry)", async () => {
  const i = io({ model: script({ kind: "task", goal: "x", steps: [{ capability: "gmail.send_raw", inputs: {} }] }) });
  const r = await plannerTurn(i, "send");
  assert(r.claimed);
  assertEquals((r as any).facts.refused_steps[0].why, "unknown_capability");
  assertEquals(dump(i).effects.length, 0);
});

Deno.test("model outage or not-a-task falls through to today's handler (not claimed)", async () => {
  const boom = async () => { throw new Error("down"); };
  assertEquals((await plannerTurn(io({ model: boom }), "hi")).claimed, false);
  assertEquals((await plannerTurn(io({ model: script({ kind: "not_a_task" }) }), "thanks")).claimed, false);
});

Deno.test("a code-first prompt that is the thread's last word is never taken by the planner", async () => {
  const r = await plannerTurn(io({ last: "career_apply_card", defer: ["career_apply_card"], model: script({ kind: "task", goal: "x", steps: [{ capability: "status.read", inputs: {} }] }) }), "yes");
  assertEquals(r.claimed, false);
});

function submitSetup(hashRef: { h: string }, approved: string[]) {
  const applyCards = {
    prepared: async () => [{ id: "p1", job_id: "j1", company: "Acme", url: "https://acme.com/j1", payload_hash: hashRef.h, card_lines: ["Acme, Data Intern"], state: "ready" }],
    approve: async (_u: string, id: string) => { approved.push(id); return { result: "queued" }; },
    jobs: async () => [{ job_id: "j1", state: "queued", approval_hash: hashRef.h }],
  };
  return { store: memoryPlanStore(), has: { "resume.confirmed": true }, deps: { applyCards } as any };
}
const submitPlan = { kind: "task", goal: "submit", steps: [{ capability: "apply.submit_batch", inputs: { job_ids: ["j1"] } }] };

Deno.test("TI-S4 gate: planning runs nothing external; only the approved hash runs, once", async () => {
  const approved: string[] = [], h = { h: "h1" };
  const base = submitSetup(h, approved);
  const first = io({ ...base, model: script(submitPlan) });
  const r = await plannerTurn(first, "submit those");
  assert(r.claimed && r.facts.card?.items.length === 1);
  assertEquals(approved.length, 0);
  assertEquals(dump(first).effects[0].status, "shown");
  const unrelated = await plannerTurn(io({ ...base, last: "career_plan_card", model: script({ kind: "not_a_task" }) }), "what is the weather");
  assertEquals(unrelated.claimed, false);
  assertEquals(approved.length, 0);
  const y = await plannerTurn(io({ ...base, last: "career_plan_card", model: script({ kind: "not_a_task" }) }), "yes");
  assert(y.claimed);
  assertEquals(approved, ["p1"]);
  const again = await executeApproved(io({ ...base, model: script({}) }), dump(first).plans[0].id);
  assertEquals(again.length, 0);
  assertEquals(approved, ["p1"]);
});

Deno.test("TI-S4 gate: a payload that changed after it was shown is not run", async () => {
  const approved: string[] = [], h = { h: "h1" };
  const base = submitSetup(h, approved);
  const first = io({ ...base, model: script(submitPlan) });
  await plannerTurn(first, "submit");
  h.h = "h2";
  await plannerTurn(io({ ...base, last: "career_plan_card", model: script({ kind: "not_a_task" }) }), "yes");
  assertEquals(approved.length, 0);
  assert(dump(first).effects[0].status !== "done");
});
