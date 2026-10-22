// The cloud queue over a direct Postgres connection — the same five
// doors worker.ts's restQueue speaks, as SQL instead of PostgREST.
//
// Design: docs/e2e/H3-CLOUD-CLAIMER-DESIGN.md. Nothing here re-
// implements a rule: claim, resume, ask, finish, authorize and the
// gate probe call the database's own functions (20261021080000,
// 20261024110000, 20261024130000) with the same arguments the REST
// queue posts, so every predicate — the card binding, the switches,
// the gate, the pauses, the caps — is the database's, unchanged.
// The transport differs; the authority does not.
//
// The drain that runs this queue (drain.ts) connects with the
// database credential of the worker host (DATABASE_URL). It is a
// different credential from the service-role JWT restQueue carries,
// not a stronger one: both reach exactly these functions and no
// table writes of their own.
//
// Single instance (F-034): connectPg's acquireDrainLock takes a
// session advisory lock on a dedicated connection for the process's
// lifetime. A second drain against the same database finds the lock
// held and refuses to start. The lock is a startup fact, not a claim
// mechanism — the claim's own row locks already make double-claims
// impossible; what the lock forbids is two drains' throughput ever
// being pointed at one queue by accident.
import { authorizeCurrentCloudJob } from "./current_sources.ts";
import type { CloudJob, CloudQueue } from "./worker.ts";

export interface PgExecutor {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

export interface PgDatabase {
  executor: PgExecutor;
  // Null when another drain already holds this database's lock.
  acquireDrainLock(): Promise<(() => Promise<void>) | null>;
  close(): Promise<void>;
}

// Advisory lock identity for "the one cloud drain of this database":
// two-int form (key1 spells "TRAI"), key2 the queue generation.
export const DRAIN_LOCK_KEYS: [number, number] = [0x54524149, 1];

const isObj = (v: unknown) => v !== null && typeof v === "object" && !Array.isArray(v);

// One SQL call in the REST queue's shape: named arguments, jsonb
// values marshaled as JSON text with an explicit cast (the driver
// sends text; the function signature is the cast's authority).
function callArgs(args: Record<string, unknown>): { call: string; params: unknown[] } {
  const params: unknown[] = [];
  const parts = Object.keys(args).map((k) => {
    const v = args[k];
    params.push(isObj(v) || Array.isArray(v) ? JSON.stringify(v) : v);
    return `${k} => $${params.length}${isObj(v) || Array.isArray(v) ? "::jsonb" : ""}`;
  });
  return { call: parts.join(", "), params };
}

export function pgQueue(executor: PgExecutor): CloudQueue {
  // Scalar doors (a jsonb or integer comes back): the value the REST
  // queue would have parsed out of the response body.
  const scalar = async (name: string, args: Record<string, unknown>) => {
    const { call, params } = callArgs(args);
    const r = await executor.query(`select public.${name}(${call}) as v`, params);
    return r.rows.length ? r.rows[0].v : null;
  };
  const rpc = (name: string, body: Record<string, unknown>) => scalar(name, body);
  return {
    async claim(limit) {
      const { call, params } = callArgs({ p_limit: limit });
      const r = await executor.query(`select * from public.career_apply_cloud_claim(${call})`, params);
      if (!Array.isArray(r.rows)) throw Error("APPLY_QUEUE_UNAVAILABLE");
      return r.rows as CloudJob[];
    },
    authorize: (job, phase) => authorizeCurrentCloudJob(job, phase, { rpc }),
    resume: (job) => scalar("career_apply_cloud_resume", { p_id: job.id, p_lease: job.lease_token }),
    ask: (job, questions) => scalar("career_apply_cloud_ask", { p_id: job.id, p_lease: job.lease_token, p_questions: questions }),
    async finish(job, state, evidence, outcome, errorKind) {
      const { call, params } = callArgs({
        p_id: job.id, p_lease: job.lease_token, p_state: state,
        p_evidence: evidence, p_outcome: outcome, p_error_kind: errorKind,
      });
      const r = await executor.query(`select * from public.career_apply_cloud_finish(${call})`, params);
      return r.rows.length ? r.rows[0] : null;
    },
    async gatePresent() {
      try {
        // Presence is a boolean ANSWER, open or closed — the gate
        // being closed is a claim-time fact, never a startup one
        // (the REST queue's exact test: typeof boolean).
        return typeof (await scalar("career_apply_cloud_open", { p_portal: "lever" })) === "boolean";
      } catch (e: any) {
        // The REST queue's 404/PGRST202 case, in SQLSTATE: the gate
        // function is not in this database.
        if (e?.code === "42883") return false;
        throw e;
      }
    },
  };
}

// The connection factory. Kept apart from pgQueue so tests can drive
// the queue over any executor (a disposable cluster, a recording
// stub) without a pool.
export async function connectPg(connectionString: string): Promise<PgDatabase> {
  const pg = (await import("npm:pg@8.13.1")).default;
  const pool = new pg.Pool({ connectionString, max: 4 });
  const executor: PgExecutor = {
    query: (text: string, params?: unknown[]) => pool.query(text, params),
  };
  return {
    executor,
    async acquireDrainLock() {
      const client = await pool.connect();
      try {
        const r = await client.query(
          "select pg_try_advisory_lock($1, $2) as got", [...DRAIN_LOCK_KEYS]);
        if (!r.rows[0]?.got) {
          client.release();
          return null;
        }
      } catch (e) {
        client.release();
        throw e;
      }
      let released = false;
      return async () => {
        if (released) return;
        released = true;
        try {
          await client.query("select pg_advisory_unlock($1, $2)", [...DRAIN_LOCK_KEYS]);
        } finally {
          client.release();
        }
      };
    },
    close: () => pool.end(),
  };
}
