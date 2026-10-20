// WO-039 (architect): the cloud worker. The engine is a fake here; the real engine drives local forms in
// tests/career-cloud-worker.test.cjs and the database's gate, opt-in, claim limits and throttle are pinned in
// tests/db/career_apply_cloud.test.sql. Contract: docs/architect/work-orders/WO-039-cloud-worker.md.
import {
  type CloudJob,
  cloudEngineRunner,
  cloudLoop,
  type CloudQueue,
  preflight,
  runCloudJob,
  settle,
} from "../../workers/career-cloud/worker.ts";
import { factsFromPayload } from "../../workers/career-browser/approve-first.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";
import { CLOUD_INTENT, cloudTurn, type CloudOptinStore, parseCloudCommand, termsText } from "../../supabase/functions/_shared/career_cloud_optin.ts";
import { receiptText } from "../../supabase/functions/_shared/career_apply_receipts.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const exists = async (p: string) => {
  try {
    await Deno.lstat(p);
    return true;
  } catch {
    return false;
  }
};
const RESUME = new TextEncoder().encode("%PDF-1.4 TEST resume");
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((n) => n.toString(16).padStart(2, "0")).join("");
const RESUME_SHA = hex(await crypto.subtle.digest("SHA-256", RESUME));
const b64 = btoa(String.fromCharCode(...RESUME));

// A payload as the card's yes enqueues it; its engine approval is the hash of the answers it carries, so the fake engine
// below can check, as the real one does, that the application it would send is still exactly the one approved.
async function job(user: string, n: number, over: Record<string, unknown> = {}): Promise<CloudJob> {
  const fields = [
    { name: "first_name", label: "First name", value: `TEST ${user}`, factId: `TEST-${user}-1` },
    { name: "email", label: "Email", value: `${user.toLowerCase()}@example.test`, factId: `TEST-${user}-2` },
  ];
  const payload: any = {
    version: 1, user_id: user, job_id: `lever:t${n}:${n}`, company: `TEST Co ${n}`, url: `https://jobs.lever.co/t${n}/${n}`, fields,
    destination: `https://jobs.lever.co/t${n}/${n}/apply`, resume_sha256: RESUME_SHA, privacy_epoch: 1, account_version: 1,
    expires_at: "2026-10-22T00:00:00Z",
  };
  payload.engine_approval = await hashApplyPayload(factsFromPayload(payload).saved);
  Object.assign(payload, over);
  return { id: `job-${user}-${n}`, lease_token: `lease-${n}`, user_id: user, company: payload.company, url: payload.url, payload };
}
function memQueue(jobs: CloudJob[], o: { resume?: (j: CloudJob) => any; finishFails?: number } = {}) {
  const finished: { id: string; state: string; outcome: string; errorKind: string | null; evidence: any }[] = [];
  let pending = [...jobs], fails = o.finishFails ?? 0;
  const q: CloudQueue = {
    claim: async (limit) => {
      const out = pending.slice(0, limit);
      pending = pending.slice(limit);
      return out;
    },
    resume: async (j) => (o.resume ? o.resume(j) : { filename: "resume.pdf", sha256: RESUME_SHA, b64 }),
    finish: async (j, state, evidence, outcome, errorKind) => {
      if (fails-- > 0) throw Error("network");
      finished.push({ id: j.id, state, outcome, errorKind, evidence });
    },
    gatePresent: async () => true,
  };
  return { q, finished };
}
const arg = (args: string[], k: string) => args[args.indexOf(k) + 1];
// The fake engine: reads the facts and resume the worker wrote, refuses an application that is no longer the approved
// one (APPROVED_APPLICATION_CHANGED, nothing sent), and otherwise reports what `then` says.
function fakeEngine(then: (args: string[], facts: any) => any, seen: any[] = []) {
  return async (args: string[]) => {
    const facts = JSON.parse(await Deno.readTextFile(arg(args, "--facts")));
    const st = await Deno.stat(arg(args, "--facts"));
    seen.push({ args, facts, mode: (st.mode ?? 0) & 0o777, resume: await Deno.readFile(arg(args, "--resume")) });
    if (!args.includes("--approved") || arg(args, "--approved") !== await hashApplyPayload(facts.saved)) {
      return { result: { state: "not_submitted", reason: "APPROVED_APPLICATION_CHANGED" }, evidence: null };
    }
    return then(args, facts);
  };
}
const sent = { result: { state: "submitted_unconfirmed", reason: "acknowledged" }, evidence: { post: { status: 200, mutations: 1, destination: "https://jobs.lever.co/x" }, observation: { url_after: "https://jobs.lever.co/x/thanks", page_text: "Thanks" } } };

Deno.test("WO-039/1 a bot check at open or at Submit goes back to the person with its link, counted, never as sent", async () => {
  for (const r of [{ state: "not_submitted", reason: "CAPTCHA_AT_SUBMIT" }, { state: "needs_user", reason: "captcha" }]) {
    const j = await job("A", 1), { q, finished } = memQueue([j]);
    let calls = 0;
    await runCloudJob(j, { queue: q, runEngine: fakeEngine(() => { calls++; return { result: r, evidence: null }; }), log: () => {} });
    eq(calls, 1, "the engine runs once; a check is never retried or worked around");
    eq([finished[0].state, finished[0].outcome, finished[0].evidence.reason], ["needs_user", "bot_check", "bot_check"]);
    eq(finished[0].evidence.link, j.url, "the person gets the link to finish it themselves");
  }
  const t = receiptText({ company: "TEST Co", url: "https://jobs.lever.co/t/1", state: "needs_user", reason: "bot_check" });
  assert(/finish this one yourself/.test(t) && t.endsWith("https://jobs.lever.co/t/1") && /never solves/.test(t), t);
  eq(settle({ state: "needs_user", reason: "captcha" }).outcome, "bot_check");
  assert(settle({ state: "confirmed" }).outcome === "submitted" && settle({ state: "submitted_unconfirmed" }).outcome === "submitted");
  eq(settle({ state: "not_submitted", reason: "APPROVED_APPLICATION_CHANGED" }).outcome, "not_sent", "stopped by design is not a failure");
  eq(settle({ state: "failed", reason: "Phone is invalid" }).outcome, "error");
  eq(settle(null), { state: "unknown_outcome", reason: "the engine gave no result after it started; not retried", outcome: "error", errorKind: "ENGINE_NO_RESULT" });
});

Deno.test("WO-039/2 the facts and resume are written private, for that job only, and removed even when the run crashes", async () => {
  const root = await Deno.makeTempDir();
  for (const crash of [false, true]) {
    const j = await job("A", 2), { q, finished } = memQueue([j]), seen: any[] = [];
    await runCloudJob(j, {
      queue: q, tmpRoot: root, log: () => {},
      runEngine: fakeEngine(() => { if (crash) throw Error("browser died"); return sent; }, seen),
    });
    eq(seen[0].mode, 0o600, "the facts file is readable by the worker only");
    eq(seen[0].facts.user_id, "A");
    eq(Object.values(seen[0].facts.saved).map((f: any) => f.value), ["TEST A", "a@example.test"], "only this job's approved answers");
    eq(Array.from(seen[0].resume), Array.from(RESUME), "the approved resume, by its hash");
    assert(!(await exists(arg(seen[0].args, "--facts"))) && !(await exists(arg(seen[0].args, "--resume"))), "removed after the run");
    eq([...Deno.readDirSync(root)].length, 0, "nothing of the person's is left in the temp folder");
    eq(finished[0].state, crash ? "unknown_outcome" : "submitted_unconfirmed", "a crash after the engine started is unknown, never retried");
  }
  // A resume that is not the approved one never reaches the engine.
  const j = await job("A", 3), { q, finished } = memQueue([j], { resume: () => ({ filename: "r.pdf", sha256: RESUME_SHA, b64: btoa("other") }) });
  let ran = false;
  await runCloudJob(j, { queue: q, tmpRoot: root, log: () => {}, runEngine: async () => { ran = true; return sent; } });
  assert(!ran && finished[0].state === "not_submitted" && finished[0].outcome === "not_sent", JSON.stringify(finished[0]));
});

Deno.test("WO-039/3 parallel contexts: one engine process per job, never more than N at once, nothing shared between people", async () => {
  const jobs = [await job("A", 4), await job("B", 5), await job("A", 6), await job("C", 7), await job("B", 8)];
  const { q, finished } = memQueue(jobs), seen: any[] = [];
  let now = 0, peak = 0;
  const engine = fakeEngine(async () => {
    now++;
    peak = Math.max(peak, now);
    await new Promise((r) => setTimeout(r, 20));
    now--;
    return sent;
  }, seen);
  const deadline = Date.now() + 10_000;
  await cloudLoop({ queue: q, runEngine: engine, contexts: 3, idleMs: 1, stop: () => finished.length === 5 || Date.now() > deadline, log: () => {} });
  eq(finished.length, 5);
  assert(peak <= 3 && peak >= 2, `at most 3 at a time, and in parallel (peak ${peak})`);
  eq(seen.length, 5, "one engine run per job");
  eq(new Set(seen.map((s) => arg(s.args, "--facts"))).size, 5, "each job its own facts file");
  for (const s of seen) {
    const j = jobs.find((x) => x.url === arg(s.args, "--url"))!;
    eq(s.facts.user_id, j.user_id, "each run carries only its own person's facts");
    assert(Object.values(s.facts.saved).every((f: any) => String(f.factId).startsWith(`TEST-${j.user_id}-`)), "no other person's answer");
  }
  // The real runner: a new process for every job (its own browser and so its own fresh context), stdin closed,
  // screenshots masked, never the person's visible-browser or hand-off flags.
  const dir = await Deno.makeTempDir(), fake = `${dir}/fake-deno.sh`;
  await Deno.writeTextFile(fake, '#!/bin/sh\nread -r x && echo "STDIN_OPEN"\necho "RESULT {\\"state\\":\\"not_submitted\\",\\"reason\\":\\"dry_run\\",\\"pid\\":$$,\\"mask\\":\\"$UPMORE_MASK_SCREENSHOTS\\",\\"args\\":\\"$*\\"}"\n');
  await Deno.chmod(fake, 0o755);
  const run = cloudEngineRunner({ root: "/repo", evidenceRoot: dir, deno: fake });
  const [a, b] = await Promise.all([run(["--url", "u1"]), run(["--url", "u2"])]);
  assert(a && b && a.result.pid !== b.result.pid, "two jobs, two processes");
  eq(a!.result.mask, "1", "screenshots are masked in the cloud");
  assert(!/--headed|--handoff|--person-submits/.test(a!.result.args) && /--evidence-dir/.test(a!.result.args), a!.result.args);
});

Deno.test("WO-039/4 the approval hash still binds: a payload changed after approval is not submitted", async () => {
  const j = await job("A", 9);
  j.payload.fields[0].value = "TEST changed after the card"; // the engine approval stays the one the person said yes to
  const { q, finished } = memQueue([j]), seen: any[] = [];
  await runCloudJob(j, { queue: q, log: () => {}, runEngine: fakeEngine(() => sent, seen) });
  eq(arg(seen[0].args, "--approved"), j.payload.engine_approval, "the engine is always given the approved hash");
  assert(seen[0].args.includes("--submit") && seen[0].args.indexOf("--approved") > 0);
  eq([finished[0].state, finished[0].outcome, finished[0].evidence.reason], ["not_submitted", "not_sent", "APPROVED_APPLICATION_CHANGED"]);
  // No engine approval at all: refused before anything runs.
  const k = await job("A", 10, { engine_approval: null }), m = memQueue([k]);
  let ran = false;
  await runCloudJob(k, { queue: m.q, log: () => {}, runEngine: async () => { ran = true; return sent; } });
  assert(!ran && m.finished[0].evidence.reason === "NO_ENGINE_APPROVAL");
});

Deno.test("WO-039/5 the evidence: captured answers, the response, masked screenshots by hash, the time; recorded through blips", async () => {
  const j = await job("A", 11), { q, finished } = memQueue([j], { finishFails: 2 });
  await runCloudJob(j, { queue: q, log: () => {}, runEngine: fakeEngine(() => sent), now: (() => { let t = Date.parse("2026-10-21T10:00:00Z"); return () => (t += 30_000); })() });
  const e = finished[0].evidence;
  eq(e.answers.map((a: any) => a.value), ["TEST A", "a@example.test"]);
  eq(e.response.status, 200);
  eq([e.started_at, e.finished_at], ["2026-10-21T10:00:30.000Z", "2026-10-21T10:01:00.000Z"]);
  eq(e.by, "cloud");
  assert(JSON.stringify(e).length < 65536);
});

Deno.test("WO-039/6 the worker refuses to start without the gate function, with a non-service key, or a readable env file", async () => {
  const { q } = memQueue([]);
  const noGate: CloudQueue = { ...q, gatePresent: async () => false };
  const svc = "x." + btoa(JSON.stringify({ role: "service_role" })) + ".y", anon = "x." + btoa(JSON.stringify({ role: "anon" })) + ".y";
  eq((await preflight({ queue: noGate, key: svc })).ok, false);
  assert(/GATE_FUNCTION_MISSING/.test((await preflight({ queue: noGate, key: svc }) as any).why));
  assert(/NOT_THE_SERVICE_KEY/.test((await preflight({ queue: q, key: anon }) as any).why));
  const f = await Deno.makeTempFile();
  await Deno.chmod(f, 0o644);
  assert(/ENV_FILE_NOT_PRIVATE/.test((await preflight({ queue: q, key: svc, envFile: f }) as any).why));
  await Deno.chmod(f, 0o600);
  eq((await preflight({ queue: q, key: svc, envFile: f })).ok, true);
});

function optStore(daily = 25) {
  const st = { enabled: false, terms: null as string | null, last: { intent: null as string | null, content: null as string | null }, daily };
  const s: CloudOptinStore = {
    dailyLimit: async () => st.daily,
    get: async () => ({ enabled: st.enabled, daily: st.daily }),
    set: async (_u, on, terms) => { st.enabled = on; st.terms = terms; return { enabled: on, daily: st.daily }; },
    lastAssistant: async () => st.last,
  };
  return { s, st };
}
Deno.test("WO-039/7 opt-in in chat: the exact terms, a yes only to those terms, and one text turns it off", async () => {
  const { s, st } = optStore(25);
  const say = async (message: string) => {
    const r = await cloudTurn({ message, userId: "A", threadId: "T", store: s });
    if (r) st.last = { intent: r.intent, content: r.reply };
    return r;
  };
  eq(await say("yes"), null, "a yes with no terms shown is not a yes to the cloud");
  const shown = await say("Apply for me in the cloud");
  assert(shown && shown.intent === CLOUD_INTENT && shown.reply === termsText(25));
  for (const must of ["only applications you approve on a card", "Greenhouse, Lever and Ashby", "up to 25 a day", "30 days", "still needs your yes on its card", "does not solve it", "cloud off"]) {
    assert(shown!.reply.includes(must), must);
  }
  assert(shown!.reply.length <= 1500 && !/[*_`#]|\]\(/.test(shown!.reply), "plain text, one message");
  eq(st.enabled, false, "showing the terms turns nothing on");
  st.daily = 40;
  const changed = await say("yes");
  assert(changed && changed.status === "changed" && !st.enabled, "terms that changed since they were shown are shown again, still off");
  const on = await say("yes");
  assert(on && on.status === "on" && st.enabled && st.terms === termsText(40), "on, with the exact words they said yes to");
  st.last = { intent: "agent", content: "something else" };
  eq(await say("yes"), null, "a yes to anything said after the terms is not a yes to them");
  const off = await say("cloud off");
  assert(off && off.status === "off" && !st.enabled, "one text turns it off");
  for (const t of ["turn off the cloud", "no more cloud", "Don't apply for me in the cloud anymore"]) eq(parseCloudCommand(t), { kind: "off" }, t);
  for (const t of ["turn on the cloud", "send my applications from the cloud", "apply for me in the cloud please"]) eq(parseCloudCommand(t), { kind: "ask" }, t);
  eq(parseCloudCommand("stop"), null, "STOP stays the carrier's word, never the cloud's");
  eq(parseCloudCommand("what is the cloud"), null);
});
