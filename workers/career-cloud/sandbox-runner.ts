// F-RUNNER: what runs inside one cloud sandbox (docs/launch/CLOUD-RUNNER.md). One application, then exit.
//
// The dispatcher claimed the application and started this sandbox with four values: the job id, this sandbox's id, the
// token binding them to the job's current lease, and the bridge URL. This process holds no database credential. It reads
// its one job through the bridge, then runs it exactly as the cloud worker does (worker.ts runCloudJob): the approved
// resume for this job only, the answers rebuilt from the approved payload, the authorization before the engine and again
// before the one Submit, the same engine (scripts/apply.ts --submit --approved <hash>) in its own process with no secret
// in its environment, and the outcome recorded with the finish. A verification check is handed back to the person
// (needs_user, bot_check), never solved and never retried.
import { cloudEngineRunner, type CloudJob, type CloudQueue, runCloudJob } from "./worker.ts";
import { authorizeCurrentCloudJob } from "./current_sources.ts";
import type { RunEngine } from "../career-browser/approve-first.ts";

export function bridgeQueue(o: { url: string; id: string; sandbox: string; token: string; fetch?: typeof fetch }) {
  const f = o.fetch ?? fetch;
  const call = async (op: string, extra: Record<string, unknown> = {}) => {
    const r = await f(`${o.url.replace(/\/$/, "")}/job/${op}`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: o.id, sandbox: o.sandbox, token: o.token, ...extra }),
    });
    const text = await r.text();
    let body: any = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = null; }
    if (!r.ok) throw Object.assign(Error(`${op}: ${r.status} ${String(body?.error ?? text).slice(0, 200)}`), { status: r.status });
    return body;
  };
  // The two calls the live authorization makes (current_sources.ts), each answered for this job only by the bridge.
  const rpc = async (name: string, args: Record<string, unknown>) => {
    if (name === "career_apply_message_cloud_sources") return await call("sources");
    if (name === "career_apply_message_cloud_authorize") return await call("authorize", { p_hash: args.p_hash, p_source_digest: args.p_source_digest });
    throw Error("CARD_CLOUD_AUTH_PROTOCOL");
  };
  const queue: CloudQueue = {
    claim: async () => [], // the dispatcher claims; a sandbox never does
    authorize: (job, phase) => authorizeCurrentCloudJob(job, phase, { rpc }),
    resume: () => call("resume"),
    ask: (_job, questions) => call("ask", { questions }),
    finish: (_job, state, evidence, outcome, errorKind) => call("finish", { state, evidence, outcome, error_kind: errorKind }),
    gatePresent: async () => true,
  };
  return { job: async () => (await call("job")) as CloudJob, queue };
}

// One job, start to finish. `queue` may wrap the bridge's (tests replace the authorization with a named stand-in).
export async function runSandboxJob(o: {
  bridge: ReturnType<typeof bridgeQueue>;
  runEngine: RunEngine;
  queue?: (q: CloudQueue) => CloudQueue;
  tmpRoot?: string;
  log?: (line: string) => void;
}) {
  const job = await o.bridge.job();
  const queue = o.queue ? o.queue(o.bridge.queue) : o.bridge.queue;
  return await runCloudJob(job, { queue, runEngine: o.runEngine, tmpRoot: o.tmpRoot, log: o.log });
}

if (import.meta.main) {
  const env = (k: string) => Deno.env.get(k) || "";
  const [url, id, sandbox, token] = ["CLOUD_BRIDGE_URL", "CLOUD_JOB_ID", "CLOUD_SANDBOX_ID", "CLOUD_JOB_TOKEN"].map(env);
  if (!url || !id || !sandbox || !token) {
    console.error("usage: CLOUD_BRIDGE_URL, CLOUD_JOB_ID, CLOUD_SANDBOX_ID and CLOUD_JOB_TOKEN (set by the dispatcher)");
    Deno.exit(2);
  }
  const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
  const evidenceRoot = `${Deno.env.get("HOME") || "/tmp"}/trainee-evidence`;
  await Deno.mkdir(evidenceRoot, { recursive: true, mode: 0o700 });
  const started = Date.now();
  const r = await runSandboxJob({ bridge: bridgeQueue({ url, id, sandbox, token }), runEngine: cloudEngineRunner({ root, evidenceRoot }) });
  console.log(`RUNNER ${JSON.stringify({ ...r, ms: Date.now() - started })}`);
  Deno.exit(0);
}
