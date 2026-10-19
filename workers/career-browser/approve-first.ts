// WO-021 W1 + W4: approve first, then apply without asking twice (D-014: one stack, D-017: the person's own browser).
//
// prepare: the engine's dry run (scripts/apply.ts without --submit) on one posting. When everything is answered it
// returns the card (every answer, the destination, the resume) and the queue payload. The payload carries the engine's
// approval hash, so the application that runs later must be exactly the one shown.
// run: claims approved applications from career_apply_jobs and runs the engine with --submit --approved <hash>. The
// answers are rebuilt from the approved payload itself, so the engine reproduces the same application or stops it
// (APPROVED_APPLICATION_CHANGED, nothing sent). The outcome goes back with career_apply_finish; an engine that gave no
// result is recorded unknown_outcome and never retried.
import { normLabel } from "../../supabase/functions/_shared/career_apply.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";

export interface EngineResult {
  result: {
    state: string;
    reason?: string;
    confirmation_id?: string | null;
    evidence_path?: string;
    fields?: string[];
  };
  evidence: any;
}
export type RunEngine = (args: string[]) => Promise<EngineResult | null>;

export interface Job {
  id: string;
  lease_token: string;
  url: string;
  payload: any;
}

const OUTCOMES = new Set([
  "confirmed",
  "submitted_unconfirmed",
  "needs_user",
  "failed",
  "not_submitted",
  "unknown_outcome",
]);

export async function prepare(o: {
  url: string;
  factsPath: string;
  resumePath: string;
  account: { epoch: number; version: number };
  now: number;
  ttlHours?: number;
  runEngine: RunEngine;
}) {
  const run = await o.runEngine(["--url", o.url, "--facts", o.factsPath, "--resume", o.resumePath]);
  if (!run || run.result.reason !== "dry_run" || !run.evidence?.approval_hash) {
    return { ready: false as const, result: run?.result ?? { state: "not_submitted", reason: "ENGINE_NO_RESULT" } };
  }
  const ev = run.evidence;
  const fields = ev.fields.map((f: any) => ({ name: f.name, label: f.label, value: f.value, factId: f.factId }));
  const payload = {
    version: 1,
    user_id: ev.payload.user_id,
    job_id: ev.payload.posting,
    company: ev.payload.company,
    url: o.url,
    fields,
    destination: ev.payload.destination,
    resume_sha256: ev.payload.resume.sha256,
    page_field_names: Object.keys(ev.payload.page_fields || {}).sort(),
    engine_approval: ev.approval_hash,
    privacy_epoch: o.account.epoch,
    account_version: o.account.version,
    expires_at: new Date(o.now + (o.ttlHours ?? 24) * 3600_000).toISOString(),
  };
  // What the person reads before the yes: every answer as the form itself shows it (the engine's readback, so a select
  // reads "Yes", never its internal value "1"), the resume once by name, and where it goes. Nothing on the card that the
  // application does not carry, and nothing the application carries that is not on the card.
  const shown = (f: any) => {
    const r = ev.readback?.[f.name];
    return typeof r === "string" ? r : typeof r === "boolean" ? (r ? "Yes (checked)" : "No") : String(f.value);
  };
  const card = [
    payload.company,
    ...fields.filter((f: any) => f.value !== payload.resume_sha256).map((f: any) => `${f.label}: ${shown(f)}`),
    `Resume: ${ev.payload.resume.filename} (${payload.resume_sha256.slice(0, 12)})`,
    ...(payload.page_field_names.length
      ? [`Also sent, set by the employer's page, unchanged: ${payload.page_field_names.join(", ")}`]
      : []),
    ...((ev.payload.verification || []).length
      ? [
        `The page runs a verification check (${
          ev.payload.verification.join(", ")
        }); its token carries none of your answers`,
      ]
      : []),
    `Sends to ${payload.destination}`,
  ];
  return { ready: true as const, payload, hash: await hashApplyPayload(payload), card };
}

// The approved answers as the engine's confirmed facts: each under its question, with its fact id, so the engine maps
// the same question to the same answer and the approval hash comes out the same.
export function factsFromPayload(payload: any) {
  const saved: Record<string, { value: unknown; factId: string; confirmed: true }> = {};
  for (const f of payload.fields) {
    if (f.value && typeof f.value === "object") continue; // the resume is passed as a file, checked by its hash
    const key = normLabel(f.label);
    if (Object.hasOwn(saved, key) && saved[key].value !== f.value) {
      throw Error("CONFLICTING_APPROVED_ANSWERS: " + f.label);
    }
    saved[key] = { value: f.value, factId: f.factId, confirmed: true };
  }
  return { user_id: payload.user_id, answers: {}, saved };
}

export async function runApproved(d: {
  claim: () => Promise<Job[]>;
  finish: (id: string, lease: string, state: string, evidence: Record<string, unknown>) => Promise<unknown>;
  resumeFor: (job: Job) => Promise<{ path: string; sha256: string }>;
  writeFacts: (job: Job, facts: unknown) => Promise<string>;
  runEngine: RunEngine;
}) {
  const done: { id: string; state: string; reason?: string }[] = [];
  for (const job of await d.claim()) {
    let state = "not_submitted", evidence: Record<string, unknown> = {};
    let started = false;
    try {
      const p = job.payload;
      if (!/^[0-9a-f]{64}$/.test(String(p?.engine_approval))) throw Error("NO_ENGINE_APPROVAL");
      const resume = await d.resumeFor(job);
      if (resume.sha256 !== p.resume_sha256) throw Error("RESUME_CHANGED");
      const factsPath = await d.writeFacts(job, factsFromPayload(p));
      started = true;
      const run = await d.runEngine([
        "--url",
        job.url,
        "--facts",
        factsPath,
        "--resume",
        resume.path,
        "--submit",
        "--approved",
        p.engine_approval,
      ]);
      if (!run || !OUTCOMES.has(run.result.state)) {
        state = "unknown_outcome";
        evidence = { reason: "the engine gave no result after it started; not retried" };
      } else {
        state = run.result.state;
        evidence = {
          reason: run.result.reason ?? null,
          confirmation_id: run.result.confirmation_id ?? null,
          evidence_path: run.result.evidence_path ?? null,
        };
      }
    } catch (e: any) {
      // Before the engine started nothing could have been sent; after it started, nothing is known.
      state = started ? "unknown_outcome" : "not_submitted";
      evidence = { reason: String(e?.message || e) };
    }
    await d.finish(job.id, job.lease_token, state, evidence);
    done.push({ id: job.id, state, reason: evidence.reason as string | undefined });
  }
  return done;
}

// The engine as a child process: scripts/apply.ts with a fresh private evidence folder; reads its RESULT line and its
// evidence file. No result line is null (the caller decides what that means).
export function engineRunner(o: { root: string; extra?: string[]; deno?: string }): RunEngine {
  return async (args) => {
    const evidenceDir = await Deno.makeTempDir({ prefix: "trainee-evidence-" });
    await Deno.remove(evidenceDir);
    const cmd = new Deno.Command(o.deno || Deno.execPath(), {
      args: ["run", "-A", o.root + "/scripts/apply.ts", ...args, ...(o.extra || []), "--evidence-dir", evidenceDir],
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
    });
    const out = new TextDecoder().decode((await cmd.output()).stdout);
    const line = out.split("\n").filter((l) => l.startsWith("RESULT ")).at(-1);
    if (!line) return null;
    const result = JSON.parse(line.slice(7));
    let evidence = null;
    try {
      evidence = JSON.parse(await Deno.readTextFile(evidenceDir + "/evidence.json"));
    } catch { /* a refusal before the evidence folder was used */ }
    return { result, evidence };
  };
}

// Command line, for the owner's own machine (the first cohort): prepare one posting, or run one approved payload.
//   deno run -A workers/career-browser/approve-first.ts prepare <url> <facts.json> <resume.pdf> <epoch> <version>
//   deno run -A workers/career-browser/approve-first.ts run-one <payload.json> <resume.pdf> [engine args...]
if (import.meta.main) {
  const [cmd, ...rest] = Deno.args;
  const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
  if (cmd === "prepare") {
    const [url, facts, resume, epoch, version, ...extra] = rest;
    const r = await prepare({
      url,
      factsPath: facts,
      resumePath: resume,
      account: { epoch: Number(epoch), version: Number(version) },
      now: Date.now(),
      runEngine: engineRunner({ root, extra }),
    });
    console.log("PREPARED " + JSON.stringify(r));
  } else if (cmd === "run-one") {
    const [payloadFile, resume, ...extra] = rest;
    const payload = JSON.parse(await Deno.readTextFile(payloadFile));
    const bytes = await Deno.readFile(resume);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map((n) => n.toString(16).padStart(2, "0")).join("");
    const dir = await Deno.makeTempDir({ prefix: "trainee-facts-" });
    const done = await runApproved({
      claim: async () => [{ id: "local", lease_token: "local", url: payload.url, payload }],
      finish: async () => {},
      resumeFor: async () => ({ path: resume, sha256 }),
      writeFacts: async (_j, facts) => {
        const f = dir + "/facts.json";
        await Deno.writeTextFile(f, JSON.stringify(facts), { mode: 0o600 });
        return f;
      },
      runEngine: engineRunner({ root, extra }),
    });
    console.log("RAN " + JSON.stringify(done));
  } else {
    console.error("usage: approve-first.ts prepare|run-one ...");
    Deno.exitCode = 2;
  }
}
