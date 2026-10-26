// FEATURE 17 units: the hosted preparation's door, dispatcher and bridge (cloud_prepare.ts), the runner's routes and their
// secrets and numbers (cloud_runner_http.ts), the reply after answers (career_hosted_prepare.ts), and what a person is
// told when nothing could be prepared or a verification check stopped an application. No database, no network.
import assertNode from "node:assert/strict";
import { dispatchPrepare, handlePrepareBridge, handlePrepareDoor, notPreparedText, PREPARE_SCRIPT, prepareToken } from "../../supabase/functions/_shared/cloud_prepare.ts";
import { createRunnerHandler, LIMIT_DEFAULTS, runnerLimits } from "../../supabase/functions/_shared/cloud_runner_http.ts";
import { dispatch, handleBridge, jobToken, type SandboxHost } from "../../supabase/functions/_shared/cloud_runner.ts";
import { prepareAfterAnswers } from "../../supabase/functions/_shared/career_hosted_prepare.ts";
import { receiptText } from "../../supabase/functions/_shared/career_apply_receipts.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const SECRET = "TEST-unit-runner-secret-0123456789abcdef0123";
const U = "7b0f8f8e-6a43-4a49-9d2c-0000000001a1", OTHER = "7b0f8f8e-6a43-4a49-9d2c-0000000001a2";
const RID = "aaaaaaaa-bbbb-4ccc-8ddd-0000000000f1", LEASE = "11111111-2222-4333-8444-0000000000f1";
const noSleep = async () => {};
const fresh = () => new Date().toISOString();

Deno.test("F17 door: 202 accepted and the dispatcher kicked; 429 over today's number (not kicked); 409 nothing of theirs to prepare; 400 a malformed kick", async () => {
  let kicked = 0;
  const calls: any[] = [];
  const rpc = async (name: string, args: any) => {
    calls.push({ name, args });
    if (args.p_job_ids.includes("not-theirs")) throw Error("nothing_to_prepare");
    return args.p_job_ids.includes("capped") ? { id: RID, accepted: false, waiting_for: "per_person_day" } : { id: RID, accepted: true };
  };
  eq(await handlePrepareDoor({ user_id: U, job_ids: ["ashby:ramp:1"] }, { rpc, perPersonDay: 7, kick: () => { kicked++; } }), { status: 202, body: { accepted: 1, request: RID } });
  eq(calls[0], { name: "career_apply_prepare_request_put", args: { p_user: U, p_job_ids: ["ashby:ramp:1"], p_per_person_day: 7 } }, "the person and the number go to the database as given");
  eq(kicked, 1);
  eq((await handlePrepareDoor({ user_id: U, job_ids: ["capped"] }, { rpc, perPersonDay: 7, kick: () => { kicked++; } })).status, 429);
  eq(kicked, 1, "an over-the-number request starts nothing now");
  eq(await handlePrepareDoor({ user_id: U, job_ids: ["not-theirs"] }, { rpc, perPersonDay: 7 }), { status: 409, body: { error: "nothing to prepare" } });
  for (const bad of [{}, { user_id: "x", job_ids: ["a"] }, { user_id: U, job_ids: [] }, { user_id: U, job_ids: "a" }]) {
    eq((await handlePrepareDoor(bad, { rpc, perPersonDay: 7 })).status, 400, JSON.stringify(bad));
  }
});

Deno.test("F17 dispatcher: one sandbox per claimed request with four values and no credential; a sandbox that never starts finishes the request failed", async () => {
  const runs: any[] = [], stopped: string[] = [], finished: any[] = [], sandboxes: any[] = [];
  let creates = 0;
  const host: SandboxHost = {
    create: async ({ name }) => { creates++; if (name.includes("bbbbbbbb")) throw Error("vercel 500"); return `sbx_${creates}`; },
    run: async (s, env, script) => { runs.push({ s, env, script }); },
    stop: async (s) => { stopped.push(s); },
  };
  const rpc = async (name: string, args: any) => {
    if (name === "career_apply_prepare_request_claim") {
      eq(args, { p_want: 3, p_global: 2, p_per_person_day: 4, p_per_site_minute: 5 }, "the limits go to the database as given");
      return [{ id: RID, user_id: U, job_ids: ["a"], lease_token: LEASE }, { id: "bbbbbbbb-bbbb-4ccc-8ddd-0000000000f2", user_id: U, job_ids: ["b"], lease_token: LEASE }];
    }
    if (name === "career_apply_prepare_request_sandbox") { sandboxes.push(args); return null; }
    if (name === "career_apply_prepare_request_finish") { finished.push(args); return { state: "failed" }; }
    throw Error("unexpected " + name);
  };
  const r = await dispatchPrepare({ rpc, host, secret: SECRET, bridgeUrl: "https://bridge.test", limits: { want: 3, global: 2, perPersonDay: 4, perSiteMinute: 5 },
    retry: { tries: 3, baseMs: 1, sleep: noSleep }, log: () => {} });
  eq(r.started.map((x) => x.request), [RID]);
  eq(runs.length, 1);
  eq(runs[0].script, PREPARE_SCRIPT, "the preparation runner, never the send runner");
  eq(Object.keys(runs[0].env).sort(), ["CLOUD_BRIDGE_URL", "CLOUD_JOB_TOKEN", "CLOUD_PREPARE_ID", "CLOUD_SANDBOX_ID"]);
  eq(runs[0].env.CLOUD_JOB_TOKEN, await prepareToken(SECRET, RID, LEASE, runs[0].s));
  eq(sandboxes, [{ p_id: RID, p_lease: LEASE, p_sandbox: runs[0].s }], "the sandbox is recorded on the request");
  eq(r.unavailable.map((x) => x.request), ["bbbbbbbb-bbbb-4ccc-8ddd-0000000000f2"]);
  eq(finished.map((f) => [f.p_state, f.p_outcome.reason]), [["failed", "RUNNER_UNAVAILABLE"]], "finished, not left running");
  // The queue cannot be read: nothing claimed, nothing started.
  const down = await dispatchPrepare({ rpc: async () => { throw Error("503"); }, host, secret: SECRET, bridgeUrl: "x",
    limits: { want: 1, global: 1, perPersonDay: 1, perSiteMinute: 1 }, retry: { sleep: noSleep }, log: () => {} });
  eq([down.claimed, down.started.length, typeof down.claim_error], [0, 0, "string"]);
});

Deno.test("F17 bridge: the token binds request, lease and sandbox; the person and the postings come from the request, never the body", async () => {
  let row: any = { id: RID, user_id: U, job_ids: ["ashby:ramp:1"], lease_token: LEASE, state: "running", claimed_at: fresh() };
  const calls: any[] = [];
  const deps = {
    secret: SECRET, readRequest: async () => row,
    rpc: async (name: string, args: any) => {
      calls.push({ name, args });
      if (name === "career_apply_prepare_candidates") return [{ user_id: U, job_id: "ashby:ramp:1" }, { user_id: U, job_id: "ashby:other:9" }, { user_id: OTHER, job_id: "ashby:ramp:1" }];
      return { ok: true };
    },
  };
  const token = await prepareToken(SECRET, RID, LEASE, "sbx_A");
  const call = (op: string, extra: any = {}, t = token, sandbox = "sbx_A") => handlePrepareBridge(op, { id: RID, sandbox, token: t, ...extra }, deps);
  eq((await call("request")).body, { id: RID, user_id: U, job_ids: ["ashby:ramp:1"] });
  eq((await call("request", {}, token, "sbx_B")).status, 403, "another sandbox's token");
  eq((await call("request", {}, await prepareToken(SECRET + "x", RID, LEASE, "sbx_A"))).status, 403, "a token under another secret");
  eq((await call("request", {}, await jobToken(SECRET, RID, LEASE, "sbx_A"))).status, 403, "a send token opens no preparation");
  eq((await call("drop")).status, 404, "only the four operations");
  // Candidates: only this person's, only this request's postings.
  eq((await call("rpc", { name: "career_apply_prepare_candidates", args: { p_now: "x", p_per_person: 999, p_limit: 999 } })).body, [{ user_id: U, job_id: "ashby:ramp:1" }]);
  // The person is the request's, whatever the body says.
  calls.length = 0;
  await call("rpc", { name: "career_apply_answers_for", args: { p_user: OTHER } });
  eq(calls, [{ name: "career_apply_answers_for", args: { p_user: U } }]);
  eq((await call("rpc", { name: "career_apply_prepare_for", args: { p_user: OTHER, p_posting_job_id: "ashby:ramp:1" } })).status, 403, "a forged person is refused");
  eq((await call("rpc", { name: "career_apply_prepare_for", args: { p_posting_job_id: "ashby:other:9" } })).status, 403, "a posting not in the request is refused");
  calls.length = 0;
  eq((await call("rpc", { name: "career_apply_prepare_for", args: { p_posting_job_id: "ashby:ramp:1", p_payload: { a: 1 }, p_card_lines: ["x"] } })).status, 200);
  eq(calls[0].args.p_user, U, "the person is set from the request");
  for (const name of ["career_apply_card_answer_as", "career_apply_enqueue", "career_apply_cloud_finish", "career_apply_message_cloud_sources", "exec_vault_read"]) {
    eq((await call("rpc", { name, args: {} })).status, 403, `${name} is not a preparation call`);
  }
  // A finished, expired or re-leased request opens nothing.
  for (const r of [{ ...row, state: "done" }, { ...row, claimed_at: new Date(Date.now() - 16 * 60_000).toISOString() }, { ...row, lease_token: "99999999-2222-4333-8444-0000000000f1" }, null]) {
    row = r;
    eq((await call("request")).status, 403, JSON.stringify(r));
  }
});

Deno.test("F17 bridge finish: the ready ones as the card shows them, pushed now; else the questions; else they are told why; the sandbox stopped", async () => {
  const row = { id: RID, user_id: U, job_ids: ["ashby:ramp:1"], lease_token: LEASE, state: "running", claimed_at: fresh() };
  const run = async (ready: any[], questions: any[], pushAnswer: any, questionsPushed = true) => {
    const calls: any[] = [], stopped: string[] = [];
    const deps = { secret: SECRET, readRequest: async () => row, stop: async (s: string) => { stopped.push(s); },
      rpc: async (name: string, args: any) => {
        calls.push({ name, args });
        if (name === "career_apply_prepare_request_ready") return ready;
        if (name === "career_apply_prepare_request_questions") return questions;
        if (name === "career_apply_card_push_requested_for") return pushAnswer;
        if (name === "career_apply_questions_push_requested_for") return questionsPushed;
        if (name === "career_apply_prepare_request_notice") return true;
        if (name === "career_apply_prepare_request_finish") return { state: "done" };
        throw Error(name);
      } };
    const outcomes = ready.length ? [{ job_id: "ashby:ramp:1", outcome: "ready", detail: "" }] : questions.length ? [{ job_id: "ashby:ramp:1", outcome: "asked", detail: "2" }] : [{ job_id: "ashby:ramp:1", outcome: "no_resume", detail: "x" }];
    const out = await handlePrepareBridge("finish", { id: RID, sandbox: "sbx_A", token: await prepareToken(SECRET, RID, LEASE, "sbx_A"), outcomes }, deps);
    return { out, calls, stopped };
  };
  const prepared = { id: "cccccccc-bbbb-4ccc-8ddd-0000000000f3", company: "Ramp", card_lines: ["Ramp: Software Engineering Intern, Frontend", "Email: a@example.test"], created_at: fresh() };
  const a = await run([prepared], [], "dddddddd-bbbb-4ccc-8ddd-0000000000f4");
  const push = a.calls.find((c) => c.name === "career_apply_card_push_requested_for");
  eq([push.args.p_user, push.args.p_request, push.args.p_ids], [U, RID, [prepared.id]]);
  for (const l of prepared.card_lines) assert(push.args.p_text.includes(l), "the card carries every line");
  eq((a.out.body as any).push, "shown");
  eq(a.calls.at(-1).args.p_card, "dddddddd-bbbb-4ccc-8ddd-0000000000f4");
  eq(a.stopped, ["sbx_A"]);
  const q = await run([], [{ id: "eeeeeeee-bbbb-4ccc-8ddd-0000000000f5", key: "fact:email", kind: "fact", label: "Email", type: "input_text", options: [], company: "Ramp", job_ids: ["x"], misfit: false, answer: null }], null);
  const qp = q.calls.find((c) => c.name === "career_apply_questions_push_requested_for");
  assert(qp && /Email/.test(qp.args.p_text) && qp.args.p_request === RID, "the questions are texted now");
  eq((q.out.body as any).push, "questions");
  assert(!q.calls.some((c) => c.name === "career_apply_prepare_request_notice"), "asked is not 'could not prepare'");
  // Asked, but the database held the questions text back: no "could not prepare" in its place (it was prepared as far
  // as their answers allow; the scheduled questions push texts them).
  const qh = await run([], [{ id: "eeeeeeee-bbbb-4ccc-8ddd-0000000000f6", key: "fact:email", kind: "fact", label: "Email", type: "input_text", options: [], company: "Ramp", job_ids: ["x"], misfit: false, answer: null }], null, false);
  assert(!qh.calls.some((c) => c.name === "career_apply_prepare_request_notice"), "held questions are not told as a failure");
  const n = await run([], [], null);
  const notice = n.calls.find((c) => c.name === "career_apply_prepare_request_notice");
  eq(notice.args.p_text, "I couldn't prepare the application you asked for: I don't have your resume file to attach. Send your resume here as a PDF or Word file, say it's yours, then ask again. Nothing was sent.");
  eq((n.out.body as any).push, "told");
  // A card the database held back (STOP, WhatsApp's window): no notice in its place; the scheduled push may show it.
  const h = await run([prepared], [], null);
  eq((h.out.body as any).push, "held");
  assert(!h.calls.some((c) => c.name === "career_apply_prepare_request_notice"));
});

Deno.test("F17 not-prepared text: never an engine code, always 'Nothing was sent'", () => {
  eq(notPreparedText([{ outcome: "refused" }, { outcome: "error" }]), "I couldn't prepare the application you asked for: the employer's form could not be filled ahead of time; preparing it failed on my side. Nothing was sent.");
  eq(notPreparedText([{ outcome: "PERSON_SUBMITS_NEEDS_HEADED" }]), "I couldn't prepare the application you asked for: preparing it failed on my side. Nothing was sent.");
  assert(/no longer open on file/.test(notPreparedText([])));
});

Deno.test("F17 runner routes: each door checks its own secret; preparation off answers 503 so the chat says it has not started; the numbers come from the env with defaults", async () => {
  const env: Record<string, string> = { SUPABASE_URL: "http://supabase.test", SUPABASE_SERVICE_ROLE_KEY: "k", CLOUD_RUNNER_SECRET: SECRET, CLOUD_DISPATCH_SECRET: "D".repeat(40),
    CAREER_PREPARE_AHEAD_TOKEN: "K".repeat(40), CLOUD_BRIDGE_URL: "https://bridge.test" };
  const host: SandboxHost = { create: async () => "sbx_1", run: async () => {}, stop: async () => {} };
  const seen: string[] = [];
  const fetchStub = (async (input: string | URL | Request, init?: RequestInit) => {
    const u = String(input instanceof Request ? input.url : input);
    seen.push(u);
    if (u.endsWith("/rpc/career_apply_prepare_request_put")) return Response.json({ id: RID, accepted: true });
    if (u.endsWith("/rpc/career_apply_prepare_request_claim")) return Response.json([]);
    if (u.endsWith("/rpc/career_apply_cloud_dispatch_claim2")) { seen.push(String(init?.body)); return Response.json([]); }
    return new Response("[]", { status: 200 });
  }) as typeof fetch;
  const h = (e: Record<string, string>) => createRunnerHandler({ env: { get: (k) => e[k] }, fetch: fetchStub, host });
  const post = (fn: ReturnType<typeof h>, path: string, headers: Record<string, string> = {}, body: unknown = {}) =>
    fn(new Request(`https://x/functions/v1/career-cloud-runner${path}`, { method: "POST", headers, body: JSON.stringify(body) }));
  const kick = { user_id: U, job_ids: ["ashby:ramp:1"] };
  eq((await post(h(env), "/prepare", { authorization: "Bearer wrong" }, kick)).status, 401);
  eq((await post(h(env), "/prepare", { authorization: `Bearer ${"K".repeat(40)}` }, kick)).status, 503, "preparation off: the kick is not taken");
  const on = { ...env, CLOUD_PREPARE_ENABLED: "on" };
  eq((await post(h(on), "/prepare", { authorization: `Bearer ${"K".repeat(40)}` }, kick)).status, 202);
  eq((await post(h(on), "/prepare-dispatch", { "x-cloud-dispatch-secret": "wrong" })).status, 401);
  eq((await post(h(on), "/prepare-dispatch", { "x-cloud-dispatch-secret": "D".repeat(40) })).status, 200);
  eq((await post(h(env), "/dispatch", { "x-cloud-dispatch-secret": "D".repeat(40) })).status, 200);
  eq(await (await post(h(env), "/dispatch", { "x-cloud-dispatch-secret": "D".repeat(40) })).json(), { skipped: "CLOUD_RUNNER_ENABLED is not on" });
  await post(h({ ...env, CLOUD_RUNNER_ENABLED: "on", CLOUD_MAX_PER_PERSON_DAY: "3", CLOUD_MAX_PER_SITE_MINUTE: "1" }), "/dispatch", { "x-cloud-dispatch-secret": "D".repeat(40) });
  eq(JSON.parse(seen.at(-1)!), { p_want: 50, p_global: 20, p_per_portal: 8, p_per_person_day: 3, p_per_site_minute: 1 }, "the send numbers from the env, defaults for the rest");
  eq((await post(h({ ...env, CLOUD_RUNNER_SECRET: "short" }), "/dispatch")).status, 503, "no runner secret: not configured");
  eq(runnerLimits({ get: () => undefined }).send.perPersonDay, LIMIT_DEFAULTS.CLOUD_MAX_PER_PERSON_DAY);
  eq(runnerLimits({ get: (k) => (k === "CLOUD_PREPARE_PER_SITE_MINUTE" ? "0" : "x") }).prepare.perSiteMinute, LIMIT_DEFAULTS.CLOUD_PREPARE_PER_SITE_MINUTE, "a nonsense number is the default");
});

Deno.test("F17 the dispatcher keeps the old door without the new numbers, and takes both routes with them", async () => {
  const names: string[] = [];
  const rpc = async (name: string) => { names.push(name); return []; };
  const host: SandboxHost = { create: async () => "s", run: async () => {}, stop: async () => {} };
  await dispatch({ rpc, host, secret: SECRET, bridgeUrl: "x", limits: { want: 1, global: 1, perPortal: 1 }, log: () => {} });
  await dispatch({ rpc, host, secret: SECRET, bridgeUrl: "x", limits: { want: 1, global: 1, perPortal: 1, perPersonDay: 1, perSiteMinute: 1 }, log: () => {} });
  eq(names, ["career_apply_cloud_dispatch_claim", "career_apply_cloud_dispatch_claim2"]);
});

Deno.test("F17 after answers: prepared again now (the reply says so, not 'on your computer'); more waiting says when; off or failed is said as such", async () => {
  const reply = "Saved. I won't ask these again:\n1. no\nThey go on the forms the next time you prepare applications on your computer.";
  const admin = (open: number, waiting: string[]) => ({
    rpc: async () => ({ data: Array(open).fill({}), error: null }),
    from: () => ({ select: () => ({ eq: () => ({ eq: () => ({ limit: async () => ({ data: waiting.map((k) => ({ posting_key: k })), error: null }) }) }) }) }),
  });
  const env = (on: boolean) => ({ get: (k: string) => (on ? ({ CAREER_PREPARE_AHEAD_URL: "https://r.test/prepare", CAREER_PREPARE_AHEAD_TOKEN: "t" } as any)[k] : undefined) });
  const bodies: any[] = [];
  const fetch202 = (async (_u: any, init: any) => { bodies.push(JSON.parse(init.body)); return new Response("", { status: 202 }); }) as typeof fetch;
  let a: any = { reply, status: "answered" };
  eq(await prepareAfterAnswers(a, { admin: admin(0, ["ashby:ramp:1"]), userId: U, env: env(true), fetch: fetch202 }), "started");
  assert(/I'm preparing your application again now with these answers/.test(a.reply) && !/computer/.test(a.reply), a.reply);
  eq(bodies, [{ user_id: U, job_ids: ["ashby:ramp:1"] }], "their own waiting postings");
  a = { reply, status: "answered" };
  eq(await prepareAfterAnswers(a, { admin: admin(2, ["ashby:ramp:1"]), userId: U, env: env(true), fetch: fetch202 }), "skipped");
  assert(/Once the rest are answered, I'll prepare your application again here\./.test(a.reply), a.reply);
  a = { reply, status: "answered" };
  eq(await prepareAfterAnswers(a, { admin: admin(0, ["ashby:ramp:1"]), userId: U, env: env(false), fetch: fetch202 }), "off");
  eq(a.reply, reply, "with no hosted preparation the reply is as before");
  a = { reply, status: "answered" };
  eq(await prepareAfterAnswers(a, { admin: admin(0, ["ashby:ramp:1"]), userId: U, env: env(true), fetch: (async () => new Response("", { status: 503 })) as any }), "failed");
  assert(/Preparing it again hasn't started yet; it waits in your queue\./.test(a.reply), a.reply);
  a = { reply, status: "partial" };
  eq(await prepareAfterAnswers(a, { admin: admin(0, ["x"]), userId: U, env: env(true), fetch: fetch202 }), "skipped", "nothing kicked while some are not saved");
});

Deno.test("F17 a verification check's receipt says exactly what to do and that nothing reached the employer", () => {
  eq(receiptText({ company: "Ramp", url: "https://jobs.ashbyhq.com/ramp/a13ae586-f4cb-4385-8822-c42b9b54ed74", state: "needs_user", reason: "bot_check" }),
    "Ramp is not finished: a verification check appeared, and Trainee never solves one, so finish this one yourself: open the link below, enter the answers you approved on the card, complete the check on the page, then press Submit. Nothing reached Ramp. https://jobs.ashbyhq.com/ramp/a13ae586-f4cb-4385-8822-c42b9b54ed74");
  eq(receiptText({ company: "Ramp", url: "https://x.test/1", state: "needs_user", reason: "email_code" }), "Ramp is not finished: the employer emailed you a code to finish it. Nothing else was sent. https://x.test/1", "other hand-backs unchanged");
});

Deno.test("F17 the send bridge's authorization asks the database for either route's, chosen from the job, never the request", async () => {
  const id = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeee1", lease = "11111111-2222-4333-8444-5555555555e1";
  const calls: string[] = [];
  const row = { id, lease_token: lease, user_id: U, company: "c", url: "u", payload: {}, payload_hash: "h", approval_hash: "h", state: "driving", source: "cloud" };
  await handleBridge("authorize", { id, sandbox: "sbx_A", token: await jobToken(SECRET, id, lease, "sbx_A"), p_hash: "H", p_source_digest: "D" },
    { secret: SECRET, readJob: async () => row, rpc: async (name: string) => { calls.push(name); return { authorized: true }; } });
  eq(calls, ["career_apply_cloud_authorize_any"]);
});
