// Task intelligence, follow-through (spec §3 "Background", §4.9): due plan steps are claimed in leased batches by any number
// of worker instances (career_plan_claim_due: SKIP LOCKED, an expired lease reclaimed, each person's oldest due step first
// so no one starves). A claimed step's plan is advanced (preparation finished, a back-off passed) or its queued effects
// are verified against their source (the lane's rail sent it). Idempotent: running the same wake twice changes nothing
// twice. NO LIMITS: the batch size is how many rows one claim reads, not a cap on anyone's work.
// The schedule that calls runPlanWakes is career-proactive's (another lane's file): see the PR's Requests.
// deno-lint-ignore-file no-explicit-any
import { advance, type PlannerIO, recover } from "./planner.ts";
import type { PlanStore, StepRow } from "./store.ts";

export async function runPlanWakes(o: {
  store: PlanStore; worker: string; batch: number; leaseSeconds: number; now: () => number;
  ioFor: (userId: string) => Promise<Omit<PlannerIO, "store" | "worker" | "now">>;
}): Promise<{ claimed: number; advanced: number; verified: number; errors: number }> {
  const stats = { claimed: 0, advanced: 0, verified: 0, errors: 0 };
  const due = await o.store.claimDue(o.worker, o.batch, o.leaseSeconds, o.now());
  stats.claimed = due.length;
  for (const step of due) {
    try {
      const io: PlannerIO = { ...(await o.ioFor(step.user_id)), store: o.store, worker: o.worker, now: o.now };
      const p = await o.store.plan(step.user_id, step.plan_id);
      if (!p) continue;
      await recover(io, p.plan);
      if (step.status === "queued") { if (await verifyQueued(io, p.plan.id, step)) stats.verified++; }
      else { await advance(io, p, ""); stats.advanced++; }
    } catch { stats.errors++; }
  }
  return stats;
}

// A step whose approved effects a lane's rail holds: read each back; the step is done once none is still in flight.
async function verifyQueued(io: PlannerIO, planId: string, step: StepRow): Promise<boolean> {
  const cap = io.registry.get(step.capability)!;
  const effs = (await io.store.effectsOf(io.userId, planId)).filter((e) => e.step_id === step.id && e.status === "done");
  const states: string[] = [];
  for (const e of effs) {
    const { _display, ...stored } = e.payload as any;
    const v = await cap.verify({ ...stored, ...((e.result as any)?.ref ?? {}), idem_key: e.idem_key }, { userId: io.userId, threadId: io.threadId, channel: io.channel, now: io.now(), personText: "" }, io.deps);
    states.push(v.state);
  }
  const inFlight = states.some((s) => ["approved", "sending", "queued"].includes(s));
  const next = { ...step, output: { ...(step.output ?? {}), states }, lease_owner: null, lease_until: null,
    status: inFlight ? step.status : "done", next_check_at: inFlight ? new Date(io.now() + 15 * 60_000).toISOString() : null,
    verified_at: inFlight ? step.verified_at : new Date(io.now()).toISOString() } as StepRow;
  await io.store.saveStep(next, io.now());
  return !inFlight;
}
