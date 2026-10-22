// The card-bound cloud worker (20261024130000, worker.ts) authorizes every job with the queue before the engine and
// again before the one effect, and refuses (CARD_CLOUD_AUTH_REQUIRED) without it. Test fakes that drive runCloudJob or
// cloudLoop say so explicitly through these three helpers; the behaviour under test is otherwise unchanged.
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";

// The queue row's own hashes, as career_apply_cloud_claim returns them for a card-bound job: both the canonical payload hash.
export async function cardBound<T extends { payload: unknown }>(job: T): Promise<T & { payload_hash: string; approval_hash: string }> {
  const h = await hashApplyPayload(job.payload);
  return { ...job, payload_hash: h, approval_hash: h };
}

// A fake queue's authorize: records each call; allows unless the test says otherwise (a revoked or expired card).
export function authorizer(o: { allow?: (phase: string) => boolean } = {}) {
  const calls: { id: string; phase: string }[] = [];
  const authorize = async (job: { id: string }, phase: "before_engine" | "before_effect") => {
    calls.push({ id: job.id, phase });
    if (o.allow && !o.allow(phase)) throw Error("CARD_CLOUD_PERMISSION_REVOKED");
  };
  return { authorize, calls };
}

// A fake engine reports a sent application only after asking for the effect's authorization, as scripts/apply.ts does
// before its Submit click; refused, it sends nothing (not_submitted, CARD_CLOUD_AUTHORIZATION_REFUSED).
const SENT = new Set(["confirmed", "submitted_unconfirmed"]);
type Controls = { beforeEffect?: () => Promise<void> } | undefined;
export function effectAware<A extends unknown[]>(engine: (...a: A) => Promise<any>) {
  return async (args: string[], env?: Record<string, string>, controls?: Controls) => {
    const run = await (engine as any)(args, env);
    if (!SENT.has(run?.result?.state)) return run;
    try { await controls?.beforeEffect?.(); } catch {
      return { result: { state: "not_submitted", reason: "CARD_CLOUD_AUTHORIZATION_REFUSED" }, evidence: null };
    }
    return run;
  };
}
