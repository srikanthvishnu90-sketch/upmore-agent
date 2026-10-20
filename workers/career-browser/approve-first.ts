// WO-021 W1 + W4: approve first, then apply without asking twice (D-014: one stack, D-017: the person's own browser).
//
// prepare: the engine's dry run (scripts/apply.ts without --submit) on one posting. When everything is answered it
// returns the card (every answer, the destination, the resume) and the queue payload. The payload carries the engine's
// approval hash, so the application that runs later must be exactly the one shown.
// run: claims approved applications from career_apply_jobs and runs the engine with --submit --approved <hash>. The
// answers are rebuilt from the approved payload itself, so the engine reproduces the same application or stops it
// (APPROVED_APPLICATION_CHANGED, nothing sent). The outcome goes back with career_apply_finish; an engine that gave no
// result is recorded unknown_outcome and never retried.
import { answerKey, mapQuestion, NEVER_BY_TEXT } from "../../supabase/functions/_shared/question_map.ts";
import { aiPolicyStatements } from "../../supabase/functions/_shared/ai_policy.ts";
import { createRequire } from "node:module";
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

// WO-028: a resume Trainee tailored for this posting (tailor_resume) is said as such on the card, with the persona it
// used, and tagged on the payload so the queue counts tailored and untailored applications apart. The database keeps the
// tag only when that exact file is one Trainee stored for this person (career-resumes/<user_id>/<sha256>.pdf).
export interface ResumeTag {
  tailored: true;
  persona: string | null;
}
export function resumeCardLine(filename: string, sha256: string, tag?: ResumeTag | null): string {
  return tag?.tailored
    ? `Resume: ${tag.persona ?? "your base resume"}, tailored for this role (${sha256.slice(0, 12)})`
    : `Resume: ${filename} (${sha256.slice(0, 12)})`;
}
// "--tailored-resume <persona|base>" on the command line; the rest goes to the engine.
export function takeResumeTag(args: string[]): { tag: ResumeTag | null; rest: string[] } {
  const i = args.indexOf("--tailored-resume");
  if (i < 0) return { tag: null, rest: args };
  const v = String(args[i + 1] ?? "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9 -]{0,23}$/.test(v)) throw Error("--tailored-resume needs a persona name or 'base'");
  return {
    tag: { tailored: true, persona: v === "base" ? null : v },
    rest: [...args.slice(0, i), ...args.slice(i + 2)],
  };
}

export async function prepare(o: {
  url: string;
  factsPath: string;
  resumePath: string;
  account: { epoch: number; version: number };
  now: number;
  ttlHours?: number;
  runEngine: RunEngine;
  resumeTag?: ResumeTag | null;
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
    ...(o.resumeTag?.tailored
      ? { resume_tailored: true, ...(o.resumeTag.persona ? { resume_persona: o.resumeTag.persona } : {}) }
      : {}),
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
    ...fields.filter((f: any) => f.value !== payload.resume_sha256).map((f: any) => `${MARK[mapQuestion({ label: f.label }).kind] ?? ""}${f.label}: ${shown(f)}`),
    resumeCardLine(ev.payload.resume.filename, payload.resume_sha256, o.resumeTag),
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

// On the card, an answer the person must read as theirs says so: a consent they give, a legal statement they make, an
// answer about this job's terms. The mark is drawn from the question's meaning; the application carries the answer only.
const MARK: Record<string, string> = { consent: "You agree: ", attestation: "Your statement: ", screen: "About this job: " };

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

// Ask once: the answers the person texted, as the engine's confirmed facts for the next preparation. A fact for every
// employer goes under the fact's name (their own facts file wins when it states the same fact); an answer for one wording
// or one posting goes under its key, which planBatch reads for that question only. Each is marked as a texted answer.
export interface TextAnswer { id: string; key: string; kind: string; answer: string }
export function factsWithTextAnswers(facts: any, rows: TextAnswer[]) {
  const answers = { ...(facts?.answers || {}) }, saved = { ...(facts?.saved || {}) };
  for (const r of rows || []) {
    if (!r || typeof r.answer !== "string" || !r.answer.trim() || typeof r.key !== "string") continue;
    const a = { value: r.answer, factId: `text-answer:${r.id}`, confirmed: true };
    if (r.key.startsWith("fact:")) {
      const f = r.key.slice(5);
      if (!Object.hasOwn(answers, f)) answers[f] = a;
    } else if (/^(label|job):[0-9a-f]{16}$/.test(r.key)) saved[r.key] = a;
  }
  return { ...facts, answers, saved };
}

// The questions that stopped one preparation, as rows to ask by text: keyed by how far an answer may travel (a stated fact
// that did not fit this form is asked for this posting only), never one asking for an identity, bank or card number or a
// password, and marked misfit when a question already answered came back because this form's options do not fit.
export function questionsToStore(result: any, o: { facts: Record<string, unknown>; answered: Set<string> }) {
  const posting = String(result?.posting || "");
  const out = new Map<string, Record<string, unknown>>();
  if (!posting) return { posting, questions: [] as Record<string, unknown>[] };
  // The form's own words about AI help go with each written answer of this posting (WO-030): Trainee reads them before it
  // drafts one, even when a standing consent already answered that statement on the form.
  const aiPolicy = aiPolicyStatements(Array.isArray(result?.ai_policy) ? result.ai_policy : []).join("\n").slice(0, 1200);
  for (const q of Array.isArray(result?.questions) ? result.questions : []) {
    const label = String(q?.label ?? "").replace(/\s+/g, " ").trim().slice(0, 600);
    if (!label || NEVER_BY_TEXT.test(label)) continue;
    const options = (Array.isArray(q.options) ? q.options : []).map((x: unknown) => String(x).slice(0, 300)).slice(0, 60);
    const type = String(q.type || "input_text").slice(0, 40);
    const shape = { label, type, options: options.map((l: string) => ({ label: l })) };
    const m = mapQuestion(shape);
    const key = answerKey(shape, posting, { haveFact: m.kind === "fact" && Object.hasOwn(o.facts, m.fact) });
    if (out.has(key)) continue;
    out.set(key, {
      key, kind: m.kind, label, type, options, company: result?.company ? String(result.company).slice(0, 200) : null, misfit: o.answered.has(key),
      ...(m.kind === "essay" && aiPolicy ? { ai_policy: aiPolicy } : {}),
    });
  }
  return { posting, questions: [...out.values()] };
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

// The person's own queue, signed in as them (D-017; migration 20261020010000_career_apply_own_worker.sql): it claims and
// finishes only that person's approved applications. The client is a Supabase client holding the person's own session,
// never the service key.
export interface RpcClient {
  rpc: (name: string, args: unknown) => PromiseLike<{ data: any; error: any }>;
}
export function ownQueue(client: RpcClient) {
  const must = (r: { data: any; error: any }) => {
    if (r.error) {
      // An expired or refused sign-in is not a queue outage: asking again would never work.
      const text = `${r.error.code ?? ""} ${r.error.message ?? ""}`;
      throw Error(/PGRST30[0-3]|jwt|not signed in/i.test(text) ? "SIGNED_OUT" : "APPLY_QUEUE_UNAVAILABLE");
    }
    return r.data;
  };
  return {
    async claim(limit = 1): Promise<Job[]> {
      const rows = must(await client.rpc("career_apply_claim_own", { p_limit: limit }));
      if (!Array.isArray(rows)) throw Error("APPLY_QUEUE_UNAVAILABLE");
      return rows;
    },
    async finish(id: string, lease: string, state: string, evidence: Record<string, unknown>) {
      return must(
        await client.rpc("career_apply_finish_own", { p_id: id, p_lease: lease, p_state: state, p_evidence: evidence }),
      );
    },
  };
}

// The worker on the person's own computer: one application at a time (one browser, and the person may be needed for a
// verification), until stopped. A queue that cannot be read waits and is asked again; nothing runs without a claim.
// Recording the outcome is retried, because an application the employer confirmed must not read as unknown over a
// network blip; if it still cannot be recorded, the drive is left to the database, which marks it unknown after 15
// minutes and never re-drives it, and the local evidence path is reported. The engine never runs twice for one claim.
export async function runLoop(o: {
  queue: ReturnType<typeof ownQueue>;
  resume: { path: string; sha256: string };
  writeFacts: (job: Job, facts: unknown) => Promise<string>;
  runEngine: RunEngine;
  stop: () => boolean;
  idleMs?: number;
  sleep?: (ms: number) => Promise<void>;
  log?: (line: string) => void;
}) {
  const sleep = o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const log = o.log ?? ((l: string) => console.log(l));
  const ran: { id: string; state: string; reason?: string; recorded: boolean }[] = [];
  while (!o.stop()) {
    let claimed: Job[];
    try {
      claimed = await o.queue.claim(1);
    } catch (e: any) {
      if (e?.message === "SIGNED_OUT") {
        log("Your sign-in has expired. Sign in again to keep going; nothing else was run.");
        break;
      }
      log("The queue could not be read; asking again shortly. Nothing was run.");
      await sleep(o.idleMs ?? 30_000);
      continue;
    }
    if (!claimed.length) {
      await sleep(o.idleMs ?? 30_000);
      continue;
    }
    let recorded = false;
    const done = await runApproved({
      claim: async () => claimed,
      finish: async (id, lease, state, evidence) => {
        for (let i = 0; i < 4 && !recorded; i++) {
          try {
            await o.queue.finish(id, lease, state, evidence);
            recorded = true;
          } catch {
            if (i < 3) await sleep(2_000 * 2 ** i);
          }
        }
      },
      resumeFor: async () => o.resume,
      writeFacts: o.writeFacts,
      runEngine: o.runEngine,
    });
    for (const d of done) {
      ran.push({ ...d, recorded });
      log(
        `${d.id}: ${d.state}${d.reason ? " (" + d.reason + ")" : ""}` +
          (recorded ? "" : "; NOT RECORDED: the queue will mark it unknown, the local evidence has the result"),
      );
    }
  }
  return ran;
}

// The engine as a child process: scripts/apply.ts with a fresh private evidence folder; reads its RESULT line and its
// evidence file. No result line is null (the caller decides what that means). The person is in the loop for anything
// that is theirs (a verification at the click, a code the employer emails): the engine's lines reach them as they are
// printed and their Enter reaches the engine.
export function engineRunner(o: { root: string; extra?: string[]; deno?: string }): RunEngine {
  return async (args) => {
    const evidenceDir = await Deno.makeTempDir({ prefix: "trainee-evidence-" });
    await Deno.remove(evidenceDir);
    const child = new Deno.Command(o.deno || Deno.execPath(), {
      args: ["run", "-A", o.root + "/scripts/apply.ts", ...args, ...(o.extra || []), "--evidence-dir", evidenceDir],
      stdin: "inherit",
      stdout: "piped",
      stderr: "piped",
    }).spawn();
    const stderr = new Response(child.stderr).text();
    let out = "", pending = "";
    for await (const chunk of child.stdout.pipeThrough(new TextDecoderStream())) {
      out += chunk;
      const lines = (pending + chunk).split("\n");
      pending = lines.pop()!;
      for (const l of lines) if (!l.startsWith("RESULT ")) console.log(l);
    }
    await child.status;
    await stderr;
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

// The person signs this computer in themselves, in a browser window on the Upmore app, the same way they sign in
// anywhere (their own password or Google, their own 2FA). The session is read only from the app's own origin, after
// they are signed in, from where the app keeps it (supabase-js: localStorage "sb-<project>-auth-token"); it stays in
// memory for this run and is never printed or written anywhere. The window is a fresh browser: nothing is loaded from
// or saved to disk. Ten minutes, then SIGN_IN_TIMEOUT.
export async function signInInBrowser(o: {
  appUrl: string;
  headed: boolean;
  timeoutMs?: number;
  say?: (line: string) => void;
}): Promise<{ access_token: string; refresh_token: string }> {
  const req = createRequire(import.meta.url);
  let pw: any = null;
  for (const t of [Deno.env.get("UPMORE_PLAYWRIGHT_PATH"), "playwright"]) {
    if (!t) continue;
    try {
      pw = req(t);
      break;
    } catch { /* next */ }
  }
  if (!pw) throw Error("PLAYWRIGHT_UNRESOLVABLE");
  const app = new URL(o.appUrl);
  const chrome = Deno.env.get("UPMORE_CHROMIUM_PATH");
  const browser = await pw.chromium.launch({
    headless: !o.headed,
    ...(Deno.env.get("UPMORE_CHROMIUM_SANDBOX") === "off" ? { args: ["--no-sandbox"] } : { chromiumSandbox: true }),
    ...(chrome ? { executablePath: chrome } : {}),
  });
  try {
    const page = await (await browser.newContext()).newPage();
    await page.goto(app.href);
    (o.say ?? console.log)(
      "Sign in to Upmore in the browser window. Trainee reads only your session from the app's own page, keeps it " +
        "in memory for this run, and never prints or saves it.",
    );
    const deadline = Date.now() + (o.timeoutMs ?? 600_000);
    while (Date.now() < deadline) {
      let origin = "";
      try {
        origin = new URL(page.url()).origin;
      } catch { /* about:blank while navigating */ }
      if (origin === app.origin) {
        const raw = await page.evaluate(() => {
          const ls = (globalThis as any).localStorage;
          for (let i = 0; i < ls.length; i++) {
            const k = ls.key(i);
            if (/^sb-[a-z0-9]+-auth-token$/.test(k)) return ls.getItem(k);
          }
          return null;
        }).catch(() => null);
        if (raw) {
          try {
            const j = JSON.parse(raw), s = j.currentSession ?? j;
            if (typeof s.access_token === "string" && typeof s.refresh_token === "string" && s.refresh_token) {
              return { access_token: s.access_token, refresh_token: s.refresh_token };
            }
          } catch { /* not a session yet */ }
        }
      }
      await new Promise((r) => setTimeout(r, 1000));
    }
    throw Error("SIGN_IN_TIMEOUT");
  } finally {
    await browser.close();
  }
}

// The person's own sign-in on this computer: UPMORE_SUPABASE_URL, UPMORE_SUPABASE_ANON_KEY (public) and either the
// person's session in UPMORE_ACCESS_TOKEN and UPMORE_REFRESH_TOKEN or, with UPMORE_APP_URL, their own sign-in in a
// browser window. Never printed. A service key is refused: it would let this computer act on other people's
// applications. Exits with a plain line when it cannot sign in.
async function signedInClient(cmd: string): Promise<any> {
  const env = (k: string) => Deno.env.get(k) || "";
  let [url, anon, access, refresh, appUrl] = [
    "UPMORE_SUPABASE_URL",
    "UPMORE_SUPABASE_ANON_KEY",
    "UPMORE_ACCESS_TOKEN",
    "UPMORE_REFRESH_TOKEN",
    "UPMORE_APP_URL",
  ].map(env);
  if (!url || !anon || (!(access && refresh) && !appUrl)) {
    console.error(
      `usage: approve-first.ts ${cmd} ..., with UPMORE_SUPABASE_URL, UPMORE_SUPABASE_ANON_KEY ` +
        "and UPMORE_APP_URL (you sign in in a browser window), or UPMORE_ACCESS_TOKEN and UPMORE_REFRESH_TOKEN",
    );
    Deno.exit(2);
  }
  const refuse = () => {
    console.error("SERVICE_KEY_REFUSED: this computer runs only your own applications; sign in as yourself.");
    Deno.exit(2);
  };
  if ([anon, access].some((t) => jwtRole(t) === "service_role")) refuse();
  if (!(access && refresh)) {
    try {
      ({ access_token: access, refresh_token: refresh } = await signInInBrowser({ appUrl, headed: true }));
    } catch (e: any) {
      console.error(`Not signed in (${e?.message ?? "error"}); nothing was run.`);
      Deno.exit(2);
    }
    if (jwtRole(access) === "service_role") refuse();
  }
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.117.1");
  const client = createClient(url, anon, { auth: { persistSession: false, autoRefreshToken: true } });
  const signed = await client.auth.setSession({ access_token: access, refresh_token: refresh });
  if (signed.error || !signed.data.session) {
    console.error("Your sign-in has expired or was not accepted. Sign in again; nothing was run.");
    Deno.exit(2);
  }
  return client;
}

// The role a Supabase key or session token claims, read from its payload without verifying it: used only to refuse a
// service key on a person's computer. Anything unreadable has no role.
export function jwtRole(token: string): string | null {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(atob(part + "=".repeat((4 - part.length % 4) % 4))).role ?? null;
  } catch {
    return null;
  }
}

// Command line, for the owner's own machine (the first cohort): prepare one posting, or run one approved payload.
//   deno run -A workers/career-browser/approve-first.ts prepare <url> <facts.json> <resume.pdf> <epoch> <version>
//     [--tailored-resume <persona|base>]   (the resume is one tailor_resume made for this posting)
//   deno run -A workers/career-browser/approve-first.ts run-one <payload.json> <resume.pdf> [engine args...]
if (import.meta.main) {
  const [cmd, ...rest] = Deno.args;
  const root = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
  if (cmd === "prepare") {
    const [url, facts, resume, epoch, version, ...more] = rest;
    const { tag, rest: extra } = takeResumeTag(more);
    const r = await prepare({
      url,
      factsPath: facts,
      resumePath: resume,
      account: { epoch: Number(epoch), version: Number(version) },
      now: Date.now(),
      runEngine: engineRunner({ root, extra }),
      resumeTag: tag,
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
  } else if (cmd === "run") {
    const [resume, ...extra] = rest;
    if (!resume) {
      console.error("usage: approve-first.ts run <resume.pdf> [engine args]");
      Deno.exit(2);
    }
    const client = await signedInClient("run");
    const bytes = await Deno.readFile(resume);
    const sha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)))
      .map((n) => n.toString(16).padStart(2, "0")).join("");
    const dir = await Deno.makeTempDir({ prefix: "trainee-facts-" });
    let stopping = false;
    Deno.addSignalListener("SIGINT", () => {
      stopping = true;
      console.log("Stopping after the current application.");
    });
    console.log("Running your approved applications one at a time. Ctrl+C stops after the current one.");
    await runLoop({
      queue: ownQueue(client),
      resume: { path: resume, sha256 },
      writeFacts: async (job, facts) => {
        const f = `${dir}/${job.id}.json`;
        await Deno.writeTextFile(f, JSON.stringify(facts), { mode: 0o600 });
        return f;
      },
      runEngine: engineRunner({ root, extra }),
      stop: () => stopping,
    });
  } else if (cmd === "prepare-batch") {
    // WO-022: the engine's dry run on each posting in a file (one https link a line), on this computer, signed in as the
    // person. Each ready application is stored for its card (career_apply_prepare_own: the database computes its hash and
    // checks it is theirs, for their current account); a posting with open questions is listed with them. Nothing is
    // sent: the card in their thread and their one text decide.
    const [urlsFile, facts, resume, ...more] = rest;
    const { tag, rest: extra } = takeResumeTag(more);
    if (!urlsFile || !facts || !resume) {
      console.error(
        "usage: approve-first.ts prepare-batch <urls.txt> <facts.json> <resume.pdf> [--tailored-resume <persona|base>] [engine args]",
      );
      Deno.exit(2);
    }
    const urls = [
      ...new Set(
        (await Deno.readTextFile(urlsFile)).split("\n").map((l) => l.trim()).filter((l) => /^https:\/\/\S+$/.test(l)),
      ),
    ];
    if (!urls.length || urls.length > 50) {
      console.error("The file must hold 1 to 50 https job links, one a line.");
      Deno.exit(2);
    }
    const client = await signedInClient("prepare-batch");
    const acct = await client.rpc("career_apply_account_own");
    if (acct.error || !acct.data) {
      console.error("Your account has no job settings yet; text Trainee first. Nothing was prepared.");
      Deno.exit(2);
    }
    if (acct.data.paused) {
      console.error("Your account is paused; nothing was prepared.");
      Deno.exit(2);
    }
    // Ask once: what the person already answered by text goes in as their confirmed facts, in a file only they can read,
    // removed when the batch ends.
    const texted = await client.rpc("career_apply_answers_own");
    if (texted.error) console.log(`Your texted answers could not be read (${texted.error.message}); preparing without them.`);
    const rows: TextAnswer[] = texted.error ? [] : texted.data ?? [];
    const merged = factsWithTextAnswers(JSON.parse(await Deno.readTextFile(facts)), rows);
    const factsDir = await Deno.makeTempDir({ prefix: "trainee-facts-" });
    const factsPath = `${factsDir}/facts.json`;
    await Deno.writeTextFile(factsPath, JSON.stringify(merged), { mode: 0o600 });
    const answered = new Set(rows.map((r) => r.key));
    let ready = 0, asked = 0;
    try {
      for (const url of urls) {
        const r = await prepare({
          url,
          factsPath,
          resumePath: resume,
          account: { epoch: Number(acct.data.epoch), version: Number(acct.data.version) },
          now: Date.now(),
          runEngine: engineRunner({ root, extra }),
          resumeTag: tag,
        });
        if (!r.ready) {
          const q = (r.result as any).fields?.length ? `: ${(r.result as any).fields.join("; ")}` : "";
          console.log(`NOT READY ${url} (${r.result.reason ?? r.result.state})${q}`);
          const ask = r.result.reason === "needs_answers" ? questionsToStore(r.result, { facts: merged.answers, answered }) : null;
          if (ask?.questions.length) {
            const put = await client.rpc("career_apply_questions_put_own", { p_job_id: ask.posting, p_questions: ask.questions });
            if (put.error) console.log(`  questions not stored (${put.error.message})`);
            else asked += ask.questions.length;
          }
          continue;
        }
        const saved = await client.rpc("career_apply_prepare_own", { p_payload: r.payload, p_card_lines: r.card });
        if (saved.error) console.log(`NOT STORED ${url} (${saved.error.message})`);
        else {
          ready++;
          console.log(`READY ${url} (${r.payload.company})`);
        }
      }
    } finally {
      await Deno.remove(factsDir, { recursive: true }).catch(() => {});
    }
    console.log(
      `${ready} of ${urls.length} ready. Text Trainee "show my applications" to see the card; nothing is sent before your yes.`,
    );
    if (asked) {
      console.log(
        `${asked} question${asked === 1 ? "" : "s"} only you can answer went to Trainee. Text "what do you need from me" to answer each once; then prepare again.`,
      );
    }
  } else {
    console.error("usage: approve-first.ts prepare|run-one|run|prepare-batch ...");
    Deno.exitCode = 2;
  }
}
