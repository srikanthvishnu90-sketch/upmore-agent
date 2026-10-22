// The cloud drain: worker.ts's cloudLoop running on the Postgres
// queue (pg-queue.ts) — the process the H3 inventory found missing.
// Design: docs/e2e/H3-CLOUD-CLAIMER-DESIGN.md.
//
// One process, one database, one drain (F-034): main takes the
// session advisory lock before it claims anything and refuses to
// start when another drain holds it. systemd runs exactly one
// instance of scripts/career/systemd/trainee-cloud-drain.service;
// the REST worker (worker.ts) and this drain are never pointed at
// the same database at the same time — one claimer total, whichever
// transport it speaks.
//
// The kill switches are the database's, read inside the claim on
// every call: with CAREER_CLOUD_APPLY or CAREER_AGENT_SUBMIT off,
// the claim returns nothing and the drain idles. A job already
// claimed when the switches flip still finishes and is recorded —
// career_apply_cloud_finish does not consult the switches — so
// stopping mid-drive is operational (SIGTERM, below: stop claiming,
// let the drives in flight finish), never a flag flip.
import { cloudEngineRunner, cloudLoop, type CloudQueue } from "./worker.ts";
import type { RunEngine } from "../career-browser/approve-first.ts";
import { connectPg, pgQueue } from "./pg-queue.ts";

// The loop seam, exported so a harness can run the drain with its own
// engine (the E2E skeleton drives it with a stub engine against a
// disposable cluster — tier 2, and labeled wherever reported). In
// production main wires cloudEngineRunner, the same engine the REST
// worker runs.
export function runDrain(o: {
  queue: CloudQueue;
  runEngine: RunEngine;
  stop: () => boolean;
  contexts?: number;
  idleMs?: number;
  tmpRoot?: string;
  log?: (line: string) => void;
}) {
  return cloudLoop({
    queue: o.queue, runEngine: o.runEngine, stop: o.stop,
    contexts: o.contexts, idleMs: o.idleMs, tmpRoot: o.tmpRoot, log: o.log,
  });
}

// deno run -A workers/career-cloud/drain.ts, with DATABASE_URL,
// CLOUD_CONTEXTS (3), CLOUD_EVIDENCE_DIR and UPMORE_CLOUD_ENV_FILE
// from the systemd env file (docs/e2e/H3-CLOUD-CLAIMER-DESIGN.md).
if (import.meta.main) {
  const env = (k: string) => Deno.env.get(k) || "";
  const databaseUrl = env("DATABASE_URL");
  if (!databaseUrl) {
    console.error("usage: DATABASE_URL in the env file (docs/e2e/H3-CLOUD-CLAIMER-DESIGN.md)");
    Deno.exit(2);
  }
  const envFile = env("UPMORE_CLOUD_ENV_FILE") || null;
  if (envFile) {
    const st = await Deno.stat(envFile);
    if ((st.mode ?? 0) & 0o077) {
      console.error(`ENV_FILE_NOT_PRIVATE: chmod 600 ${envFile}`);
      Deno.exit(2);
    }
  }
  const db = await connectPg(databaseUrl);
  const queue = pgQueue(db.executor);
  if (!(await queue.gatePresent())) {
    console.error("GATE_FUNCTION_MISSING: apply 20261021080000_career_apply_cloud.sql first; nothing was claimed");
    await db.close();
    Deno.exit(2);
  }
  const releaseLock = await db.acquireDrainLock();
  if (!releaseLock) {
    console.error("DRAIN_ALREADY_RUNNING: another cloud drain holds this database's lock; refusing to start a second one (one claimer per database)");
    await db.close();
    Deno.exit(2);
  }
  const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
  const evidenceRoot = env("CLOUD_EVIDENCE_DIR") || `${Deno.env.get("HOME")}/trainee-evidence`;
  await Deno.mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  await Deno.chmod(evidenceRoot, 0o700);
  let stopping = false;
  for (const sig of ["SIGINT", "SIGTERM"] as const) {
    Deno.addSignalListener(sig, () => {
      stopping = true;
      console.log("Stopping: no new claims; the applications in flight finish and are recorded (systemd: KillMode=mixed).");
    });
  }
  const contexts = Number(env("CLOUD_CONTEXTS") || 3);
  console.log(`Cloud drain up: ${contexts} contexts, Postgres queue. The kill switch and the gate are read from the database on every claim.`);
  try {
    await runDrain({ queue, runEngine: cloudEngineRunner({ root, evidenceRoot }), stop: () => stopping, contexts });
  } finally {
    await releaseLock();
    await db.close();
  }
}
