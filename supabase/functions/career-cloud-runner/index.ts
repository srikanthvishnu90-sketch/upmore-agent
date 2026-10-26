// career-cloud-runner (F-RUNNER, docs/launch/CLOUD-RUNNER.md): the cloud runner's dispatcher and its job bridge.
//   POST /dispatch        the scheduled tick (pg_cron, every minute), with header x-cloud-dispatch-secret
//   POST /job/<op>        one sandbox, for its one job (op: job, sources, authorize, resume, ask, finish), with its token
// Off unless CLOUD_RUNNER_ENABLED=on, and the database's own kill switch (CAREER_CLOUD_APPLY) still decides every claim.
// Logic and tests: ../_shared/cloud_runner.ts, tests/architect/cloud-runner.test.ts.
import { dispatch, handleBridge, type ClaimedJob, type Rpc, vercelSandboxHost } from "../_shared/cloud_runner.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const env = (k: string) => Deno.env.get(k) || "";
const num = (k: string, d: number) => {
  const n = Number(env(k));
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : d;
};

Deno.serve(async (req) => {
  const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY"), secret = env("CLOUD_RUNNER_SECRET");
  if (!url || !key || secret.length < 32) return json(503, { error: "not configured" });
  if (req.method !== "POST") return json(405, { error: "POST only" });
  const rest = url.replace(/\/$/, "") + "/rest/v1";
  const headers = { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" };
  const rpc: Rpc = async (name, args) => {
    const r = await fetch(`${rest}/rpc/${name}`, { method: "POST", headers, body: JSON.stringify(args) });
    const text = await r.text();
    if (!r.ok) {
      let msg = text;
      try { msg = JSON.parse(text)?.message ?? text; } catch { /* as sent */ }
      throw Error(String(msg).slice(0, 300));
    }
    return text ? JSON.parse(text) : null;
  };
  const host = () => vercelSandboxHost({
    token: env("VERCEL_TOKEN"), teamId: env("VERCEL_TEAM_ID"), projectId: env("VERCEL_PROJECT_ID"),
    snapshotId: env("CLOUD_SANDBOX_SNAPSHOT_ID"), region: env("CLOUD_SANDBOX_REGION") || "iad1", vcpus: num("CLOUD_SANDBOX_VCPUS", 2),
  });
  const path = new URL(req.url).pathname;

  if (path.endsWith("/dispatch")) {
    const given = req.headers.get("x-cloud-dispatch-secret") || "";
    if (!env("CLOUD_DISPATCH_SECRET") || given !== env("CLOUD_DISPATCH_SECRET")) return json(401, { error: "unauthorized" });
    if (env("CLOUD_RUNNER_ENABLED") !== "on") return json(200, { skipped: "CLOUD_RUNNER_ENABLED is not on" });
    for (const k of ["VERCEL_TOKEN", "VERCEL_TEAM_ID", "VERCEL_PROJECT_ID", "CLOUD_SANDBOX_SNAPSHOT_ID", "CLOUD_BRIDGE_URL"]) {
      if (!env(k)) return json(503, { error: `not configured: ${k}` });
    }
    const r = await dispatch({
      rpc, host: host(), secret, bridgeUrl: env("CLOUD_BRIDGE_URL"),
      limits: { want: num("CLOUD_MAX_STARTS_PER_TICK", 50), global: num("CLOUD_MAX_CONCURRENT", 20), perPortal: num("CLOUD_MAX_PER_PORTAL", 8) },
    });
    return json(200, r);
  }

  const m = /\/job\/([a-z]+)$/.exec(path);
  if (m) {
    let body: unknown = null;
    try { body = await req.json(); } catch { return json(400, { error: "invalid request" }); }
    const readJob = async (id: string) => {
      const r = await fetch(`${rest}/career_apply_jobs?id=eq.${encodeURIComponent(id)}&select=id,lease_token,user_id,company,url,payload,payload_hash,approval_hash,job_id,state,source`, { headers });
      if (!r.ok) throw Error(`read ${r.status}`);
      return ((await r.json()) as ClaimedJob[])[0] ?? null;
    };
    const stop = env("VERCEL_TOKEN") ? (s: string) => host().stop(s) : undefined;
    const out = await handleBridge(m[1], body, { rpc, readJob, secret, stop });
    return json(out.status, out.body);
  }
  return json(404, { error: "not found" });
});
