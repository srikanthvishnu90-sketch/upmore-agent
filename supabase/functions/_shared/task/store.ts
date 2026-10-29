// Task intelligence, the plan store (TASK-INTELLIGENCE-SPEC-2026-10-27 §3): plans and steps per person, asks once per
// person, and every external effect with its payload hash and approval. Two implementations with one contract: the
// in-memory one for unit tests, and the service client's over 20261027260000_career_task_plans.sql. The effect claim is the
// database's own (career_plan_effect_claim); the memory store enforces the same rule, so a unit test of the planner and a
// Postgres test of the store prove the same gate.
// deno-lint-ignore-file no-explicit-any

export type PlanStatus = "drafting" | "waiting_on_person" | "waiting_on_outside" | "running" | "done" | "stopped" | "failed";
export type StepStatus = "pending" | "blocked" | "needs_person" | "awaiting_approval" | "approved" | "queued" | "running" | "done" | "failed" | "skipped";
export type EffectStatus = "shown" | "approved" | "declined" | "executing" | "done" | "failed" | "unknown" | "changed" | "refused";
export interface Card { id: string; thread_id: string; shown_at: string; items: { n: number; effect_id: string; hash: string }[] }
export interface PlanRow {
  id: string; user_id: string; goal: string; status: PlanStatus; revision: number;
  origin_channel: string | null; last_channel: string | null; card: Card | null; created_at: string; updated_at: string;
}
export interface StepRow {
  id: string; plan_id: string; user_id: string; idx: number; capability: string; inputs: Record<string, unknown>; depends_on: number[];
  status: StepStatus; blocker: Record<string, unknown> | null; output: Record<string, unknown> | null;
  verified_at: string | null; verify_result: Record<string, unknown> | null; next_check_at: string | null;
  lease_owner?: string | null; lease_until?: string | null; attempts?: number;
}
export interface EffectRow {
  id: string; user_id: string; plan_id: string; step_id: string; capability: string; idem_key: string;
  payload: Record<string, unknown>; payload_hash: string; status: EffectStatus; card_id: string | null; card_n: number | null;
  approved_hash: string | null; approved_at: string | null; claimed_by: string | null; claimed_at: string | null; result: Record<string, unknown> | null;
}
export type Claim = "ok" | "changed" | "not_approved" | "taken" | "missing";
export interface AskRow { ask_key: string; plan_id: string | null; channel: string | null; asked_at: string; times: number; answered_at: string | null }

export interface PlanStore {
  // The person's open plans (bounded) with their steps.
  openPlans(userId: string, limit: number): Promise<{ plan: PlanRow; steps: StepRow[] }[]>;
  plan(userId: string, planId: string): Promise<{ plan: PlanRow; steps: StepRow[] } | null>;
  createPlan(userId: string, p: { goal: string; channel: string; steps: { capability: string; inputs: Record<string, unknown>; depends_on: number[] }[] }, now: number): Promise<{ plan: PlanRow; steps: StepRow[] }>;
  // Optimistic: saved only when the stored revision is still `expect`; null on a conflict.
  savePlan(plan: PlanRow, expect: number, now: number): Promise<PlanRow | null>;
  saveStep(step: StepRow, now: number): Promise<void>;
  asks(userId: string): Promise<AskRow[]>;
  recordAsk(userId: string, key: string, planId: string, channel: string, now: number): Promise<void>;
  answerAsk(userId: string, key: string, now: number): Promise<void>;
  // Idempotent on (person, idem_key): an item already recorded comes back as it is.
  putEffects(rows: Omit<EffectRow, "id" | "status" | "card_id" | "card_n" | "approved_hash" | "approved_at" | "claimed_by" | "claimed_at" | "result">[]): Promise<EffectRow[]>;
  effectsOf(userId: string, planId: string): Promise<EffectRow[]>;
  updateEffect(userId: string, id: string, patch: Partial<EffectRow>, expect?: EffectStatus[]): Promise<boolean>;
  claimEffect(userId: string, id: string, hash: string, worker: string): Promise<Claim>;
  stuckEffects(userId: string, olderThanIso: string): Promise<EffectRow[]>;
  claimDue(worker: string, limit: number, leaseSeconds: number, now: number): Promise<StepRow[]>;
}

const iso = (t: number) => new Date(t).toISOString();
const copy = <T>(x: T): T => JSON.parse(JSON.stringify(x));
const OPEN = (s: PlanStatus) => !["done", "stopped", "failed"].includes(s);

// ------------------------------------------------------------------------------------------------ memory
export function memoryPlanStore(): PlanStore & { dump(): { plans: PlanRow[]; steps: StepRow[]; effects: EffectRow[]; asks: (AskRow & { user_id: string })[] } } {
  const plans: PlanRow[] = [], steps: StepRow[] = [], effects: EffectRow[] = [], asks: (AskRow & { user_id: string })[] = [];
  const id = () => crypto.randomUUID();
  const withSteps = (p: PlanRow) => ({ plan: copy(p), steps: copy(steps.filter((s) => s.plan_id === p.id).sort((a, b) => a.idx - b.idx)) });
  return {
    async openPlans(u, limit) { return plans.filter((p) => p.user_id === u && OPEN(p.status)).sort((a, b) => b.updated_at.localeCompare(a.updated_at)).slice(0, limit).map(withSteps); },
    async plan(u, pid) { const p = plans.find((x) => x.id === pid && x.user_id === u); return p ? withSteps(p) : null; },
    async createPlan(u, p, now) {
      const plan: PlanRow = { id: id(), user_id: u, goal: p.goal, status: "drafting", revision: 0, origin_channel: p.channel, last_channel: p.channel, card: null, created_at: iso(now), updated_at: iso(now) };
      plans.push(plan);
      p.steps.forEach((s, idx) => steps.push({ id: id(), plan_id: plan.id, user_id: u, idx, capability: s.capability, inputs: copy(s.inputs), depends_on: s.depends_on, status: "pending", blocker: null, output: null, verified_at: null, verify_result: null, next_check_at: null, attempts: 0 }));
      return withSteps(plan);
    },
    async savePlan(p, expect, now) {
      const i = plans.findIndex((x) => x.id === p.id && x.user_id === p.user_id);
      if (i < 0 || plans[i].revision !== expect) return null;
      plans[i] = { ...copy(p), revision: expect + 1, updated_at: iso(now) };
      return copy(plans[i]);
    },
    async saveStep(s) { const i = steps.findIndex((x) => x.id === s.id); if (i >= 0) steps[i] = { ...steps[i], ...copy(s) }; },
    async asks(u) { return copy(asks.filter((a) => a.user_id === u)); },
    async recordAsk(u, key, planId, channel, now) {
      const a = asks.find((x) => x.user_id === u && x.ask_key === key);
      if (a) { a.times++; a.answered_at = null; } else asks.push({ user_id: u, ask_key: key, plan_id: planId, channel, asked_at: iso(now), times: 1, answered_at: null });
    },
    async answerAsk(u, key, now) { const a = asks.find((x) => x.user_id === u && x.ask_key === key); if (a && !a.answered_at) a.answered_at = iso(now); },
    async putEffects(rows) {
      const out: EffectRow[] = [];
      for (const r of rows) {
        let e = effects.find((x) => x.user_id === r.user_id && x.idem_key === r.idem_key);
        if (!e) { e = { ...copy(r), id: id(), status: "shown", card_id: null, card_n: null, approved_hash: null, approved_at: null, claimed_by: null, claimed_at: null, result: null }; effects.push(e); }
        out.push(copy(e));
      }
      return out;
    },
    async effectsOf(u, pid) { return copy(effects.filter((e) => e.user_id === u && e.plan_id === pid)); },
    async updateEffect(u, eid, patch, expect) {
      const e = effects.find((x) => x.id === eid && x.user_id === u);
      if (!e || (expect && !expect.includes(e.status))) return false;
      Object.assign(e, copy(patch));
      return true;
    },
    // The same rule as career_plan_effect_claim.
    async claimEffect(u, eid, hash, worker) {
      const e = effects.find((x) => x.id === eid && x.user_id === u);
      if (!e) return "missing";
      if (e.status !== "approved") return ["executing", "done", "unknown"].includes(e.status) ? "taken" : "not_approved";
      if (!e.approved_hash || e.approved_hash !== e.payload_hash || hash !== e.approved_hash) { e.status = "changed"; return "changed"; }
      e.status = "executing"; e.claimed_by = worker; e.claimed_at = new Date().toISOString();
      return "ok";
    },
    async stuckEffects(u, older) { return copy(effects.filter((e) => e.user_id === u && e.status === "executing" && (e.claimed_at ?? "") < older)); },
    async claimDue(worker, limit, lease, now) {
      const due = steps.filter((s) => s.next_check_at && Date.parse(s.next_check_at) <= now && (!s.lease_until || Date.parse(s.lease_until) < now))
        .sort((a, b) => a.next_check_at!.localeCompare(b.next_check_at!));
      const firsts = new Map<string, StepRow>(), rest: StepRow[] = [];
      for (const s of due) { if (!firsts.has(s.user_id)) firsts.set(s.user_id, s); else rest.push(s); }
      const pick = [...firsts.values(), ...rest].slice(0, limit);
      for (const s of pick) { s.lease_owner = worker; s.lease_until = iso(now + lease * 1000); s.attempts = (s.attempts ?? 0) + 1; }
      return copy(pick);
    },
    dump() { return copy({ plans, steps, effects, asks }); },
  };
}

// ------------------------------------------------------------------------------------------------ Supabase (service role)
const must = <T>(r: { data: T; error: any }, what: string): T => { if (r.error) throw new Error(`${what}: ${r.error.message}`); return r.data; };
const PLAN_COLS = "id,user_id,goal,status,revision,origin_channel,last_channel,card,created_at,updated_at";
const STEP_COLS = "id,plan_id,user_id,idx,capability,inputs,depends_on,status,blocker,output,verified_at,verify_result,next_check_at,lease_owner,lease_until,attempts";
const EFFECT_COLS = "id,user_id,plan_id,step_id,capability,idem_key,payload,payload_hash,status,card_id,card_n,approved_hash,approved_at,claimed_by,claimed_at,result";

export function supabasePlanStore(admin: any): PlanStore {
  const stepsOf = async (planIds: string[]) => planIds.length
    ? (must(await admin.from("career_plan_steps").select(STEP_COLS).in("plan_id", planIds).order("idx", { ascending: true }), "read plan steps") ?? []) as StepRow[]
    : [];
  const join = async (ps: PlanRow[]) => { const ss = await stepsOf(ps.map((p) => p.id)); return ps.map((plan) => ({ plan, steps: ss.filter((s) => s.plan_id === plan.id) })); };
  return {
    async openPlans(u, limit) {
      const ps = (must(await admin.from("career_plans").select(PLAN_COLS).eq("user_id", u).not("status", "in", "(done,stopped,failed)").order("updated_at", { ascending: false }).limit(limit), "read plans") ?? []) as PlanRow[];
      return join(ps);
    },
    async plan(u, pid) {
      const ps = (must(await admin.from("career_plans").select(PLAN_COLS).eq("user_id", u).eq("id", pid).limit(1), "read plan") ?? []) as PlanRow[];
      return ps.length ? (await join(ps))[0] : null;
    },
    async createPlan(u, p, now) {
      const [plan] = must(await admin.from("career_plans").insert({ user_id: u, goal: p.goal.slice(0, 2000), status: "drafting", origin_channel: p.channel, last_channel: p.channel, created_at: iso(now), updated_at: iso(now) }).select(PLAN_COLS), "create plan") as PlanRow[];
      const rows = p.steps.map((s, idx) => ({ plan_id: plan.id, user_id: u, idx, capability: s.capability, inputs: s.inputs, depends_on: s.depends_on, status: "pending" }));
      const steps = rows.length ? must(await admin.from("career_plan_steps").insert(rows).select(STEP_COLS), "create plan steps") as StepRow[] : [];
      return { plan, steps: steps.sort((a, b) => a.idx - b.idx) };
    },
    async savePlan(p, expect, now) {
      const r = must(await admin.from("career_plans").update({ goal: p.goal, status: p.status, card: p.card, last_channel: p.last_channel, revision: expect + 1, updated_at: iso(now) })
        .eq("id", p.id).eq("user_id", p.user_id).eq("revision", expect).select(PLAN_COLS), "save plan") as PlanRow[];
      return r?.length ? r[0] : null;
    },
    async saveStep(s, now) {
      must(await admin.from("career_plan_steps").update({ status: s.status, inputs: s.inputs, blocker: s.blocker, output: s.output, verified_at: s.verified_at, verify_result: s.verify_result,
        next_check_at: s.next_check_at, lease_owner: s.lease_owner ?? null, lease_until: s.lease_until ?? null, updated_at: iso(now) }).eq("id", s.id).eq("user_id", s.user_id), "save plan step");
    },
    async asks(u) { return (must(await admin.from("career_plan_asks").select("ask_key,plan_id,channel,asked_at,times,answered_at").eq("user_id", u).limit(200), "read asks") ?? []) as AskRow[]; },
    async recordAsk(u, key, planId, channel, now) {
      const cur = must(await admin.from("career_plan_asks").select("times").eq("user_id", u).eq("ask_key", key).limit(1), "read ask") as any[];
      if (cur?.length) must(await admin.from("career_plan_asks").update({ times: Number(cur[0].times) + 1, answered_at: null }).eq("user_id", u).eq("ask_key", key), "record ask");
      else must(await admin.from("career_plan_asks").insert({ user_id: u, ask_key: key, plan_id: planId, channel, asked_at: iso(now) }), "record ask");
    },
    async answerAsk(u, key, now) { must(await admin.from("career_plan_asks").update({ answered_at: iso(now) }).eq("user_id", u).eq("ask_key", key).is("answered_at", null), "answer ask"); },
    async putEffects(rows) {
      if (!rows.length) return [];
      must(await admin.from("career_plan_effects").upsert(rows, { onConflict: "user_id,idem_key", ignoreDuplicates: true }), "record effects");
      const keys = rows.map((r) => r.idem_key);
      const got = must(await admin.from("career_plan_effects").select(EFFECT_COLS).eq("user_id", rows[0].user_id).in("idem_key", keys), "read effects") as EffectRow[];
      return keys.map((k) => got.find((g) => g.idem_key === k)!).filter(Boolean);
    },
    async effectsOf(u, pid) { return (must(await admin.from("career_plan_effects").select(EFFECT_COLS).eq("user_id", u).eq("plan_id", pid).order("card_n", { ascending: true }), "read effects") ?? []) as EffectRow[]; },
    async updateEffect(u, eid, patch, expect) {
      let q = admin.from("career_plan_effects").update({ ...patch, updated_at: new Date().toISOString() }).eq("id", eid).eq("user_id", u);
      if (expect?.length) q = q.in("status", expect);
      const r = must(await q.select("id"), "update effect") as any[];
      return !!r?.length;
    },
    async claimEffect(u, eid, hash, worker) {
      return must(await admin.rpc("career_plan_effect_claim", { p_effect: eid, p_user: u, p_hash: hash, p_worker: worker }), "claim effect") as Claim;
    },
    async stuckEffects(u, older) { return (must(await admin.from("career_plan_effects").select(EFFECT_COLS).eq("user_id", u).eq("status", "executing").lt("claimed_at", older).limit(500), "read stuck effects") ?? []) as EffectRow[]; },
    async claimDue(worker, limit, lease, now) {
      return (must(await admin.rpc("career_plan_claim_due", { p_worker: worker, p_limit: limit, p_lease_seconds: lease, p_now: iso(now) }), "claim due steps") ?? []) as StepRow[];
    },
  };
}
