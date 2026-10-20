// WO-039: the cloud worker (D-010: the owner's VM, holding only this worker and its service key; D-017: the fallback
// to the person's own computer; D-022: unlocked in code only by the gate in the database).
//
// A long-running Deno process. It claims approved applications for anyone who turned the cloud on, through one door:
// career_apply_cloud_claim (20261021080000_career_apply_cloud.sql), which refuses every job whose portal family has not
// passed the gate (3 hand submissions confirmed by the employer's email), whose person has not said yes in chat, whose
// portal or person is paused, or that is over the person's daily limit or a second one to the same company in 30 days.
//
// Each claimed job runs the same engine as the person's own computer (scripts/apply.ts --submit --approved <hash>),
// headless, in its own process, so its own browser and its own fresh context: cookies and storage never cross people.
// The answers are rebuilt from the approved payload alone (approve-first's factsFromPayload) and, with the approved
// resume fetched for this job only, written to a private temp folder (0700, files 0600) that is removed in finally,
// whatever happens. The engine submits only if the application is still exactly the approved one.
//
// A verification check (a captcha) at open, review or Submit is never solved or got around: the job goes back to the
// person with its link ("finish this one yourself"), and the check counts in the telemetry, which pauses a portal or a
// person before failures pile up under their name.
import { factsFromPayload, type RunEngine } from "../career-browser/approve-first.ts";

export interface CloudJob {
  id: string;
  lease_token: string;
  user_id: string;
  company: string;
  url: string;
  payload: any;
}
export interface CloudResume { filename: string; sha256: string; b64: string }
export interface CloudQueue {
  claim(limit: number): Promise<CloudJob[]>;
  resume(job: CloudJob): Promise<CloudResume | null>;
  finish(job: CloudJob, state: string, evidence: Record<string, unknown>, outcome: Outcome, errorKind: string | null): Promise<unknown>;
  gatePresent(): Promise<boolean>;
}
// "interrupted": the worker was stopped on purpose (systemctl stop, Ctrl+C) while the engine ran. The application is
// unknown and never re-driven, but a deliberate shutdown is not a failure the employer saw, so the throttle skips it.
export type Outcome = "submitted" | "bot_check" | "error" | "not_sent" | "interrupted";

const OUTCOMES = new Set(["confirmed", "submitted_unconfirmed", "needs_user", "failed", "not_submitted", "unknown_outcome"]);
// Stopped before anything left the browser, by design (a changed application, a question the person never answered, a
// form that asks for what Trainee never fills): not sent, and not a failure the employer saw.
const BY_DESIGN = new Set([
  "APPROVED_APPLICATION_CHANGED", "APPROVED_BODY_MISMATCH", "needs_answers", "IDENTITY_NUMBER_REQUESTED", "ACCOUNT_LOGIN_REQUIRED",
  "RESUME_CHANGED", "RESUME_NOT_IN_CLOUD", "NO_ENGINE_APPROVAL", "CONFLICTING_APPROVED_ANSWERS", "FACTS_EXPIRED", "ACCOUNT_PAUSED",
  "FACTS_ERASED", "duplicate_job", "daily_cap", "company_cooldown", "UNCONFIRMED_HIDDEN_FIELD", "UNSUPPORTED_FILE_ARTIFACT",
  "SUBMIT_DESTINATION_NOT_BOUND", "PERSON_SUBMITS_NEEDS_HEADED", "HANDOFF_NEEDS_HEADED",
]);
const BOT_CHECK = (state: string, reason: string) =>
  (state === "needs_user" && reason === "captcha") || (state === "not_submitted" && reason === "CAPTCHA_AT_SUBMIT");

// What the queue records for one engine result: the final state, its reason, and the telemetry outcome. A bot check is
// always handed back as needs_user (the person finishes it at the link) and never as sent.
export function settle(result: { state?: string; reason?: string } | null): { state: string; reason: string; outcome: Outcome; errorKind: string | null } {
  const state = String(result?.state ?? ""), reason = String(result?.reason ?? "").split(":")[0].slice(0, 80);
  if (!result || !OUTCOMES.has(state)) {
    return { state: "unknown_outcome", reason: "the engine gave no result after it started; not retried", outcome: "error", errorKind: "ENGINE_NO_RESULT" };
  }
  if (BOT_CHECK(state, reason)) return { state: "needs_user", reason: "bot_check", outcome: "bot_check", errorKind: reason };
  if (state === "confirmed" || state === "submitted_unconfirmed") return { state, reason, outcome: "submitted", errorKind: null };
  if (state === "not_submitted" && BY_DESIGN.has(reason)) return { state, reason, outcome: "not_sent", errorKind: reason };
  return { state, reason, outcome: "error", errorKind: reason || state };
}

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((n) => n.toString(16).padStart(2, "0")).join("");
const sha256 = async (b: Uint8Array) => hex(await crypto.subtle.digest("SHA-256", b as BufferSource));
const b64bytes = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const clip = (v: unknown, n: number) => String(v ?? "").slice(0, n);

// What the queue keeps for one cloud application: the answers sent (from the approved payload, which the engine read
// back field by field before it clicked), the employer's response, the screenshots by path and hash (masked; they stay
// on the VM), and the time. Kept under the queue's 64 KB evidence limit.
export async function evidenceOf(job: CloudJob, run: any, s: ReturnType<typeof settle>, t: { started: number; finished: number }) {
  const ev = run?.evidence ?? {}, dir = run?.result?.evidence_path ?? null;
  const shots: Record<string, string> = {};
  for (const name of ["before-review.png", "after-submit.png"]) {
    if (!dir) break;
    try {
      shots[name] = await sha256(await Deno.readFile(`${dir}/${name}`));
    } catch { /* not taken: the run stopped before it */ }
  }
  const answers = (Array.isArray(job.payload?.fields) ? job.payload.fields : [])
    .filter((f: any) => !(f?.value && typeof f.value === "object"))
    .map((f: any) => ({ label: clip(f.label, 300), value: clip(f.value, 2000), fact: clip(f.factId, 200) }));
  const out: Record<string, unknown> = {
    reason: s.reason || null,
    confirmation_id: run?.result?.confirmation_id ?? null,
    by: "cloud",
    answers,
    resume_sha256: job.payload?.resume_sha256 ?? null,
    response: ev.post || ev.observation
      ? { status: ev.post?.status ?? null, destination: ev.post?.destination ?? null, final_url: clip(ev.observation?.url_after, 500) || null,
        page_text: clip(ev.observation?.page_text, 600) || null }
      : null,
    screenshots: { dir, sha256: shots },
    started_at: new Date(t.started).toISOString(),
    finished_at: new Date(t.finished).toISOString(),
    ...(s.outcome === "bot_check" ? { link: job.url, handed_back: "a verification check appeared; the person finishes it at the link" } : {}),
  };
  if (JSON.stringify(out).length > 60000) out.answers = answers.map((a: any) => ({ ...a, value: a.value.slice(0, 200) }));
  return out;
}

// One claimed job, start to finish. The engine runs at most once per claim; whatever happens, the facts and resume
// written for it are removed before this returns, and the outcome goes back with the lease.
export async function runCloudJob(job: CloudJob, d: {
  queue: CloudQueue;
  runEngine: RunEngine;
  tmpRoot?: string;
  now?: () => number;
  log?: (line: string) => void;
  stopping?: () => boolean;
}) {
  const now = d.now ?? Date.now, log = d.log ?? ((l: string) => console.log(l)), started = now();
  let s: ReturnType<typeof settle> = { state: "not_submitted", reason: "DRIVER_ERROR", outcome: "error", errorKind: "DRIVER_ERROR" };
  let run: any = null, began = false;
  const dir = await Deno.makeTempDir({ dir: d.tmpRoot, prefix: "trainee-cloud-" });
  try {
    await Deno.chmod(dir, 0o700);
    const p = job.payload;
    if (!/^[0-9a-f]{64}$/.test(String(p?.engine_approval))) throw Object.assign(Error("NO_ENGINE_APPROVAL"), { code: "NO_ENGINE_APPROVAL" });
    const r = await d.queue.resume(job);
    if (!r) throw Object.assign(Error("RESUME_NOT_IN_CLOUD"), { code: "RESUME_NOT_IN_CLOUD" });
    const bytes = b64bytes(r.b64);
    if ((await sha256(bytes)) !== p.resume_sha256 || r.sha256 !== p.resume_sha256) throw Object.assign(Error("RESUME_CHANGED"), { code: "RESUME_CHANGED" });
    const name = /^[^/\\.][^/\\]{0,199}$/.test(r.filename) ? r.filename : "resume.pdf";
    // The resume in its own folder, so no file name it may have (facts.json) can stand in for the facts.
    await Deno.mkdir(`${dir}/resume`, { mode: 0o700 });
    const resumePath = `${dir}/resume/${name}`, factsPath = `${dir}/facts.json`;
    await Deno.writeFile(resumePath, bytes, { mode: 0o600 });
    await Deno.writeTextFile(factsPath, JSON.stringify(factsFromPayload(p)), { mode: 0o600 });
    began = true;
    run = await d.runEngine(["--url", job.url, "--facts", factsPath, "--resume", resumePath, "--submit", "--approved", p.engine_approval]);
    s = settle(run?.result ?? null);
    if (s.state === "unknown_outcome" && d.stopping?.()) s = { ...s, outcome: "interrupted", errorKind: "WORKER_STOPPED" };
  } catch (e: any) {
    // Before the engine started nothing could have been sent; after it started, nothing is known.
    const code = String(e?.code || e?.message || e).split(":")[0].slice(0, 80);
    s = began
      ? { state: "unknown_outcome", reason: "the run stopped after the engine started; not retried",
        outcome: d.stopping?.() ? "interrupted" : "error", errorKind: d.stopping?.() ? "WORKER_STOPPED" : code }
      : settle({ state: "not_submitted", reason: code });
  } finally {
    await Deno.remove(dir, { recursive: true }).catch(() => {});
  }
  const evidence = await evidenceOf(job, run, s, { started, finished: now() });
  let recorded = false;
  for (let i = 0; i < 4 && !recorded; i++) {
    try {
      await d.queue.finish(job, s.state, evidence, s.outcome, s.errorKind);
      recorded = true;
    } catch {
      if (i < 3) await new Promise((res) => setTimeout(res, 50 * 2 ** i));
    }
  }
  log(`${job.id}: ${s.state} (${s.outcome}${s.errorKind ? ", " + s.errorKind : ""})${recorded ? "" : "; NOT RECORDED: the queue marks it unknown after 15 minutes"}`);
  return { id: job.id, user_id: job.user_id, ...s, recorded };
}

// The loop: up to `contexts` applications at a time (default 3, at most 6), one per engine process and so one per
// browser context; a slot that frees is filled from the next claim. A queue that cannot be read waits and asks again.
// stop() ends claiming; the applications in flight finish and are recorded.
export async function cloudLoop(o: {
  queue: CloudQueue;
  runEngine: RunEngine;
  stop: () => boolean;
  contexts?: number;
  idleMs?: number;
  tmpRoot?: string;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}) {
  const n = Math.max(1, Math.min(6, Math.floor(o.contexts ?? 3)));
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = o.log ?? ((l: string) => console.log(l));
  const inFlight = new Set<Promise<unknown>>();
  const done: Awaited<ReturnType<typeof runCloudJob>>[] = [];
  while (!o.stop()) {
    const free = n - inFlight.size;
    let jobs: CloudJob[] = [];
    if (free > 0) {
      try {
        jobs = await o.queue.claim(free);
      } catch (e: any) {
        log(`The queue could not be read (${e?.message ?? e}); asking again shortly. Nothing was run.`);
      }
    }
    for (const job of jobs.slice(0, free)) {
      const p: Promise<unknown> = runCloudJob(job, { queue: o.queue, runEngine: o.runEngine, tmpRoot: o.tmpRoot, log, stopping: o.stop })
        .then((r) => { done.push(r); })
        .finally(() => inFlight.delete(p));
      inFlight.add(p);
    }
    if (!jobs.length) {
      if (inFlight.size >= n || free <= 0) await Promise.race(inFlight);
      else await Promise.race([sleep(o.idleMs ?? 15_000), ...inFlight]);
    }
  }
  await Promise.all(inFlight);
  return done;
}

// What the engine's process may see of the worker's environment: where its tools are, nothing else. The service key and
// every other secret stay in the worker (clearEnv), so neither the engine nor Chromium nor a page can read them.
export const ENGINE_ENV_KEYS = ["PATH", "HOME", "TMPDIR", "DENO_DIR", "PLAYWRIGHT_BROWSERS_PATH", "UPMORE_PLAYWRIGHT_PATH", "UPMORE_CHROMIUM_PATH"];
export function engineEnv(from: (k: string) => string | undefined = (k) => Deno.env.get(k)) {
  const env: Record<string, string> = { UPMORE_MASK_SCREENSHOTS: "1", UPMORE_BROWSER_HEADED: "0" };
  for (const k of ENGINE_ENV_KEYS) {
    const v = from(k);
    if (v) env[k] = v;
  }
  return env;
}

// The engine for the cloud: scripts/apply.ts as its own headless process (its own browser and fresh context), stdin
// closed (there is no person at a server), screenshots masked, a private evidence folder per job, killed after a
// time limit (then no result, so unknown and never retried).
export function cloudEngineRunner(o: { root: string; evidenceRoot: string; deno?: string; timeoutMs?: number }): RunEngine {
  return async (args) => {
    const evidenceDir = `${o.evidenceRoot}/${crypto.randomUUID()}`;
    const child = new Deno.Command(o.deno || Deno.execPath(), {
      args: ["run", "-A", o.root + "/scripts/apply.ts", ...args, "--evidence-dir", evidenceDir],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      clearEnv: true,
      env: engineEnv(),
    }).spawn();
    const timer = setTimeout(() => { try { child.kill("SIGKILL"); } catch { /* gone */ } }, o.timeoutMs ?? 600_000);
    const [out] = await Promise.all([new Response(child.stdout).text(), new Response(child.stderr).text(), child.status]);
    clearTimeout(timer);
    const line = out.split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
    if (!line) return null;
    const result = JSON.parse(line.slice(7));
    let evidence = null;
    try {
      evidence = JSON.parse(await Deno.readTextFile(evidenceDir + "/evidence.json"));
    } catch { /* refused before the evidence folder was used */ }
    return { result, evidence };
  };
}

// The queue over PostgREST with the service key, the worker's only credential. Nothing but these five functions.
export function restQueue(o: { url: string; key: string; fetch?: typeof fetch }): CloudQueue {
  const f = o.fetch ?? fetch;
  const rpc = async (name: string, args: unknown) => {
    const r = await f(`${o.url.replace(/\/$/, "")}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: { apikey: o.key, Authorization: `Bearer ${o.key}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    const text = await r.text();
    if (!r.ok) throw Object.assign(Error(`${name}: ${r.status} ${text.slice(0, 200)}`), { status: r.status, body: text });
    return text ? JSON.parse(text) : null;
  };
  return {
    async claim(limit) {
      const rows = await rpc("career_apply_cloud_claim", { p_limit: limit });
      if (!Array.isArray(rows)) throw Error("APPLY_QUEUE_UNAVAILABLE");
      return rows;
    },
    resume: (job) => rpc("career_apply_cloud_resume", { p_id: job.id, p_lease: job.lease_token }),
    finish: (job, state, evidence, outcome, errorKind) =>
      rpc("career_apply_cloud_finish", { p_id: job.id, p_lease: job.lease_token, p_state: state, p_evidence: evidence, p_outcome: outcome, p_error_kind: errorKind }),
    async gatePresent() {
      try {
        return typeof (await rpc("career_apply_cloud_open", { p_portal: "lever" })) === "boolean";
      } catch (e: any) {
        if (e?.status === 404 || /PGRST202|could not find the function/i.test(String(e?.body ?? ""))) return false;
        throw e;
      }
    },
  };
}

// Before the loop: the worker refuses to start without the gate function in the database, with a key that is not the
// service key, or with its env file readable by anyone but its owner.
export async function preflight(o: { queue: CloudQueue; key: string; envFile?: string | null }) {
  const role = (() => {
    try {
      const part = o.key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
      return JSON.parse(atob(part + "=".repeat((4 - part.length % 4) % 4))).role ?? null;
    } catch {
      return null;
    }
  })();
  if (role !== "service_role") return { ok: false as const, why: "NOT_THE_SERVICE_KEY: the cloud worker runs only with the service role key (a JWT whose role is service_role)" };
  if (o.envFile) {
    const st = await Deno.stat(o.envFile);
    if ((st.mode ?? 0) & 0o077) return { ok: false as const, why: `ENV_FILE_NOT_PRIVATE: chmod 600 ${o.envFile}` };
  }
  if (!(await o.queue.gatePresent())) {
    return { ok: false as const, why: "GATE_FUNCTION_MISSING: apply 20261021080000_career_apply_cloud.sql first; nothing was claimed" };
  }
  return { ok: true as const };
}

// deno run -A workers/career-cloud/worker.ts, with SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, CLOUD_CONTEXTS (3),
// CLOUD_EVIDENCE_DIR and UPMORE_CLOUD_ENV_FILE from the systemd env file (docs/launch/CLOUD-WORKER.md).
if (import.meta.main) {
  const env = (k: string) => Deno.env.get(k) || "";
  const url = env("SUPABASE_URL"), key = env("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("usage: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the env file (docs/launch/CLOUD-WORKER.md)");
    Deno.exit(2);
  }
  const queue = restQueue({ url, key });
  const ok = await preflight({ queue, key, envFile: env("UPMORE_CLOUD_ENV_FILE") || null });
  if (!ok.ok) {
    console.error(ok.why);
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
  console.log(`Cloud worker up: ${contexts} contexts. The kill switch and the gate are read from the database on every claim.`);
  await cloudLoop({ queue, runEngine: cloudEngineRunner({ root, evidenceRoot }), stop: () => stopping, contexts });
}
