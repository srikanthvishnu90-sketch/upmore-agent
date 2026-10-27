// Launch readiness B7 (review of PR #195, items 2 and 3): EVERY entry point a signed-in person can reach refuses a person
// Trainee has not let in, and refuses it by its outcome, not by what its source says. The production entry files run
// unchanged (each index.ts is loaded with Deno.serve captured), on the flow harness's real Postgres with sign-up closed as
// production has it (20261026230000), behind the PostgREST double. For each entry two people call it:
//   A: signed in, never let in  -> the refusal, and NOTHING written or spent (no row, no model call, no Google call, no token)
//   B: let in (trainee_admit)   -> the entry goes on (the control: the refusal is about A, not about the entry being down)
//
//   agent-chat (handler-career.ts)     A: 403, no thread, no message, no queue row
//   career-essay-draft                 A: 401, no model call, no cost row
//   career-email-code                  A: 401, no Gmail or Google call
//   career-voice                       A: 403 not_admitted, no OpenAI call
//   gmail-oauth start_career           A: 403, no consent link (no signed state issued)
//   gmail-oauth callback (career)      A: lands on career=error, Google's token endpoint never called, no connection row
//   extension-sync application-proofs  A: 403, no extension_submission_reports row
//   extension-sync saved-answers       A: 403, nothing read
//
// Run (locally, with deno.land and esm.sh unreachable): deno test -A --no-check --import-map=tests/flow/supabase-npm.json
//   tests/architect/flow-admission-entrypoints.test.ts      (needs Postgres 16 binaries; NOT_RUN without them, a failure in CI)
import { pgBinDir, startPg } from "../flow/pg.ts";
import { postgrestDouble } from "../flow/postgrest.ts";
import { ANON_KEY, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { issueState } from "../../supabase/functions/gmail-oauth/career.ts";
import { signToken } from "../../supabase/functions/_shared/career_voice_link.ts";

const CI = Deno.env.get("CI") === "true";
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

type Handler = (req: Request) => Response | Promise<Response>;
// An entry file's request handler: its index.ts loaded unchanged, std's `serve` (Deno.serve) captured instead of listening.
// The import is written out at each call (a literal specifier), so Deno prepares the entry's remote modules with the graph.
async function entry(path: string, load: () => Promise<unknown>): Promise<Handler> {
  let handler: Handler | undefined;
  const real = Deno.serve;
  (Deno as unknown as { serve: unknown }).serve = (...a: unknown[]) => {
    handler = (a.find((x) => typeof x === "function") ?? (a[0] as { handler: Handler })?.handler) as Handler;
    return { finished: Promise.resolve(), shutdown() {}, ref() {}, unref() {}, addr: {} };
  };
  try { await load(); } finally { (Deno as unknown as { serve: unknown }).serve = real; }
  if (!handler) throw new Error(`${path} registered no handler`);
  return handler;
}

Deno.test({
  name: "entry points: a person not let in is refused by every one and nothing is written or spent; a person let in goes on",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn() {
    if (!pgBinDir()) {
      if (CI) throw Error("the entry-point admission test needs Postgres 16 binaries in CI");
      console.log("NOT_RUN locally: no Postgres binaries");
      return;
    }
    const pg = await startPg({ gate: "invite" });
    const realFetch = globalThis.fetch;
    const outbound: string[] = [];
    try {
      await supabaseParity(pg);
      eq(await pg.sql(`select public.trainee_signup_mode()`), "invite", "sign-up is closed, as production has it");
      const mk = async (n: number) => await pg.sql(`insert into auth.users (email, email_confirmed_at, phone, phone_confirmed_at) values ('p${n}@example.test', now(), '1312555010${n}', now()) returning id`);
      const A = await mk(1), B = await mk(2);
      await pg.sql(`select public.trainee_admit('${B}'::uuid, true)`);
      eq([await pg.sql(`select public.trainee_may_act('${A}')`), await pg.sql(`select public.trainee_may_act('${B}')`)], ["f", "t"], "A is not let in, B is");
      // A person's session token is a JWT whose role is "authenticated" (the essay and mail entries read that claim first).
      const b64 = (o: unknown) => btoa(JSON.stringify(o)).replace(/=+$/, "").replace(/\+/g, "-").replace(/\//g, "_");
      const jwt = (sub: string) => `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ role: "authenticated", sub })}.sig`;
      const TA = jwt(A), TB = jwt(B);
      const users: Record<string, { id: string; email?: string }> = { [TA]: { id: A, email: "p1@example.test" }, [TB]: { id: B, email: "p2@example.test" } };
      const double = postgrestDouble(pg, { url: SUPABASE_URL, serviceKey: SERVICE_KEY, users });
      for (const [k, v] of Object.entries({ SUPABASE_URL, SUPABASE_ANON_KEY: ANON_KEY, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY, OPENAI_API_KEY: "sk-test", CAREER_VOICE: "on",
        GOOGLE_OAUTH_CLIENT_ID: "client-id", GOOGLE_OAUTH_CLIENT_SECRET: "client-secret", OAUTH_STATE_SECRET: "s".repeat(40) })) Deno.env.set(k, v);
      // Supabase answers through the double; anything else is recorded (and answered with an error, so a call that should not
      // happen shows in `outbound` and fails the test).
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request && !init ? input : new Request(input as never, init);
        const u = new URL(req.url);
        if (u.origin === new URL(SUPABASE_URL).origin) return await double.fetch(req);
        outbound.push(`${u.hostname}${u.pathname}`);
        return Response.json({ error: "no real host in this test" }, { status: 502 });
      }) as typeof fetch;
      const count = async (sql: string) => Number(await pg.sql(sql));
      const rows = async () => ({
        threads: await count(`select count(*) from public.agent_threads`), messages: await count(`select count(*) from public.agent_messages`),
        queue: await count(`select (select count(*) from public.career_apply_prepared) + (select count(*) from public.career_apply_jobs) + (select count(*) from public.career_apply_cards)`),
        costs: await count(`select count(*) from public.agent_turn_costs`), connections: await count(`select count(*) from public.user_oauth_connections`),
        proofs: await count(`select count(*) from public.extension_submission_reports`),
      });
      const post = (url: string, token: string, body: unknown, method = "POST") => new Request(`${SUPABASE_URL}/functions/v1/${url}`,
        { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json", origin: "http://localhost" }, body: method === "GET" ? undefined : JSON.stringify(body) });
      const zero = await rows();
      const unchanged = async (why: string) => { eq(await rows(), zero, `${why}: no row was written`); eq(outbound, [], `${why}: no outside call (no model, no Google)`); };

      // agent-chat
      const { handleChat } = await import("../../supabase/functions/agent-chat/handler-career.ts");
      const chatA = await handleChat(post("agent-chat", TA, { message: "find me analyst jobs in Chicago" }));
      eq([chatA.status, (await chatA.json()).error], [403, "not_invited"], "agent-chat refuses A");
      const afterChat = await rows();
      eq([afterChat.threads, afterChat.messages, afterChat.queue], [0, 0, 0], "agent-chat: no thread, no message, no queue row for A");
      eq(outbound, [], "agent-chat: no outside call");
      const chatB = await handleChat(post("agent-chat", TB, { message: "hi" }));
      eq(chatB.status, 200, "agent-chat takes B's turn");
      const afterB = await rows();
      eq(afterB.messages > 0, true, "B's turn is recorded");
      Object.assign(zero, afterB); // from here on, B's own turn is the baseline

      // career-essay-draft: the model is the first thing it would spend
      const essay = await entry("career-essay-draft/index.ts", () => import("../../supabase/functions/career-essay-draft/index.ts"));
      const essayBody = { question: "Why do you want this role?", employer: "Acme", role: "Analyst" };
      const eA = await essay(post("career-essay-draft", TA, essayBody));
      eq(eA.status, 401, "essay draft refuses A");
      await unchanged("essay draft for A");
      eq((await essay(post("career-essay-draft", TB, essayBody))).status !== 401, true, "essay draft goes on for B");
      outbound.length = 0; Object.assign(zero, await rows());

      // career-email-code: Gmail is the first thing it would read
      const code = await entry("career-email-code/index.ts", () => import("../../supabase/functions/career-email-code/index.ts"));
      const cA = await code(post("career-email-code", TA, { job_id: crypto.randomUUID() }));
      eq(cA.status, 401, "email code refuses A");
      await unchanged("email code for A");
      eq((await code(post("career-email-code", TB, { job_id: crypto.randomUUID() }))).status !== 401, true, "email code goes on for B");
      outbound.length = 0; Object.assign(zero, await rows());

      // career-voice: its signed link names the person
      const voice = await entry("career-voice/index.ts", () => import("../../supabase/functions/career-voice/index.ts"));
      const link = async (u: string) => await signToken({ s: crypto.randomUUID(), u, k: "start", exp: Date.now() + 600_000 }, SERVICE_KEY);
      const vA = await voice(new Request(`${SUPABASE_URL}/functions/v1/career-voice`, { method: "POST", body: JSON.stringify({ action: "start", token: await link(A) }) }));
      eq([vA.status, (await vA.json()).reason], [403, "not_admitted"], "voice refuses A");
      await unchanged("voice for A");
      const vB = await voice(new Request(`${SUPABASE_URL}/functions/v1/career-voice`, { method: "POST", body: JSON.stringify({ action: "start", token: await link(B) }) }));
      eq(vB.status !== 403, true, "voice goes on for B");
      outbound.length = 0; Object.assign(zero, await rows());

      // gmail-oauth: the consent link, then the callback that would store the tokens
      const gmail = await entry("gmail-oauth/index.ts", () => import("../../supabase/functions/gmail-oauth/index.ts"));
      const gA = await gmail(post("gmail-oauth", TA, { action: "start_career" }));
      const gAbody = await gA.json();
      eq([gA.status, gAbody.error, "url" in gAbody], [403, "not_admitted", false], "no consent link for A");
      const gB = await gmail(post("gmail-oauth", TB, { action: "start_career" }));
      eq([gB.status, String((await gB.json()).url).startsWith("https://accounts.google.com/")], [200, true], "B gets the consent link");
      const state = await issueState(A, "career", Deno.env.get("OAUTH_STATE_SECRET")!);
      const cb = await gmail(new Request(`${SUPABASE_URL}/functions/v1/gmail-oauth?code=abc&state=${encodeURIComponent(state)}`));
      eq([cb.status, cb.headers.get("location")?.endsWith("#you?career=error")], [302, true], "A's callback lands on the error page");
      await unchanged("the Google callback for A (the token endpoint is never called, no connection row)");
      const stateB = await issueState(B, "career", Deno.env.get("OAUTH_STATE_SECRET")!);
      await gmail(new Request(`${SUPABASE_URL}/functions/v1/gmail-oauth?code=abc&state=${encodeURIComponent(stateB)}`));
      eq(outbound[0], "oauth2.googleapis.com/token", "B's callback goes on to Google's token endpoint");
      outbound.length = 0;

      // extension-sync: the proof is the row it would insert
      const ext = await entry("extension-sync/index.ts", () => import("../../supabase/functions/extension-sync/index.ts"));
      const proof = { employer: "Acme", role: "Analyst", posting: { url: "https://job-boards.greenhouse.io/acme/jobs/1" }, confirmation: { confirmationId: "X-1", confirmationText: "Thanks", successText: true, formStillOpen: false },
        answersSubmitted: {}, observedAt: new Date().toISOString() };
      const xp = (token: string, p: string, method = "POST") => new Request(`${SUPABASE_URL}/functions/v1/extension-sync/${p}`,
        { method, headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: method === "GET" ? undefined : JSON.stringify(proof) });
      const xA = await ext(xp(TA, "application-proofs"));
      eq([xA.status, (await xA.json()).code], [403, "NOT_ADMITTED"], "the extension refuses A's proof");
      const sA = await ext(xp(TA, "saved-answers", "GET"));
      eq(sA.status, 403, "the extension reads nothing for A");
      eq((await rows()).proofs, 0, "no proof row for A");
      const xB = await ext(xp(TB, "application-proofs"));
      eq(xB.status !== 403, true, "the extension goes on for B");
    } finally {
      globalThis.fetch = realFetch;
      await pg.stop();
    }
  },
});
