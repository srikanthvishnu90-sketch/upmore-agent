// FEATURE NEEDS (2026-10-26): what Trainee needs, asked once at the moment it is needed, and Gmail connected from the chat
// through a one-time link, driven through the REAL handler (agent-chat handleChat) and the REAL connect function
// (_shared/career_connect_flow.ts handleConnect, as supabase/functions/career-connect serves it) on real Postgres.
// The seams are the HTTP hops only: the Supabase project (tests/flow/postgrest.ts), Ashby's public posting API (one
// synthetic posting) and Google (a fake token, userinfo and revoke endpoint that records every call). Nothing reaches a
// real host; no message is delivered to anyone (no channel adapter is configured, so channel messages stay queued).
//   Pat texts on Telegram (the channel bridge's service-role turn, their chat bound to their thread); Sam uses the web.
//   (1) "apply me to <link>" with no resume: the reply asks for the resume, and only the resume;
//   (2) after the resume is confirmed: nothing on it (name, email) is asked; the reply says nothing else is needed;
//   (3) an application waiting on an employer's emailed code: the Gmail connect offered once, for reading only;
//   (4) "connect gmail" -> a one-time link -> the page only peeks -> the tap goes to Google with only the scopes asked ->
//       the callback stores the grant and tells Pat on Telegram "Gmail connected: ..."; the link and state work once;
//   (5) "what can you see?" answers from the records;
//   (6) "disconnect gmail": revoked at Google, tokens and row gone, live links burned;
//   (7) Sam never sees Pat's state, and Sam's own web connect lands in Sam's own thread.
import assertNode from "node:assert/strict";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.117.1";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { handleConnect } from "../../supabase/functions/_shared/career_connect_flow.ts";
import { careerCodeMailbox, fetchVerificationCode } from "../../supabase/functions/_shared/career_email_code.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const PAT = "7b0f8f8e-6a43-4a49-9d2c-0000000000c1", SAM = "7b0f8f8e-6a43-4a49-9d2c-0000000000c2";
const READ = "https://www.googleapis.com/auth/gmail.readonly", SEND = "https://www.googleapis.com/auth/gmail.send";
const JOB = "a13ae586-f4cb-4385-8822-c42b9b54ed74", LINK = `https://jobs.ashbyhq.com/ramp/${JOB}`, TITLE = "Frontend Engineer Intern (TEST)";
const CONNECT = `${SUPABASE_URL}/functions/v1/career-connect`;
const LINK_RX = new RegExp(`${CONNECT.replace(/[./]/g, "\\$&")}\\?t=([A-Za-z0-9_-]{32})`);
// An ask for something on the resume, in any wording.
const CONTACT_ASK = /\b(?:what(?:'s| is) your|tell me your|send me your|need your|share your)\s+(?:full\s+)?(?:name|e-?mail|phone)/i;

function fakes() {
  const ats: string[] = [];
  const google: { path: string; body: string }[] = [], other: string[] = [], gmail: { url: string; auth: string }[] = [];
  // Pat's inbox: one Ashby verification email, received just now, authenticated by Gmail as ashbyhq.com.
  const codeMail = () => ({ id: "code-1", internalDate: String(Date.now() - 5_000), payload: { mimeType: "text/plain",
    headers: [{ name: "From", value: "Ashby <no-reply@ashbyhq.com>" }, { name: "Subject", value: "Your verification code" },
      { name: "Authentication-Results", value: "mx.google.com; dkim=pass header.i=@ashbyhq.com header.s=s1; spf=pass smtp.mailfrom=no-reply@ashbyhq.com; dmarc=pass header.from=ashbyhq.com" }],
    body: { data: btoa("Your verification code is 482913. It expires in 10 minutes.").replace(/\+/g, "-").replace(/\//g, "_") } } });
  const board = { apiVersion: "1", jobs: [{ id: JOB, title: TITLE, location: "New York, NY", departmentName: "Engineering", employmentType: "Intern", isListed: true,
    publishedAt: new Date().toISOString(), jobUrl: LINK, applyUrl: `${LINK}/application`, descriptionPlain: "TEST synthetic posting." }] };
  const idToken = (email: string) => `x.${btoa(JSON.stringify({ email })).replace(/=+$/, "")}.y`;
  const fetch = async (input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request && !init ? input : new Request(input as any, init);
    const u = new URL(req.url);
    if (u.hostname === "api.ashbyhq.com") { ats.push(u.href); return Response.json(board); }
    if (u.hostname === "oauth2.googleapis.com" || u.hostname === "openidconnect.googleapis.com") {
      const body = req.method === "POST" ? await req.text() : "";
      google.push({ path: `${req.method} ${u.hostname}${u.pathname}`, body });
      const form = new URLSearchParams(body);
      if (u.pathname === "/token") {
        if (form.get("client_secret") !== "test-client-secret" || form.get("redirect_uri") !== CONNECT) return Response.json({ error: "invalid_client" }, { status: 401 });
        const code = form.get("code");
        if (code === "CODE-NETFAIL") throw new TypeError("network down"); // the exchange never answers
        const who = code?.startsWith("CODE-SAM") ? "sam@gmail.test" : "pat@gmail.test";
        // A second consent often comes back with no refresh token (Google sends one only on the first grant).
        return Response.json({ access_token: `AT-${who}${code === "CODE-SAM2" ? "-2" : ""}`, ...(code === "CODE-SAM2" ? {} : { refresh_token: `RT-${who}` }), expires_in: 3599, token_type: "Bearer",
          scope: code === "CODE-SAM" ? `openid ${READ} email` : `openid ${READ} ${SEND} email`, id_token: idToken(who) });
      }
      if (u.pathname === "/revoke") return new Response("", { status: new URLSearchParams(body).get("token") === "RT-sam@gmail.test" ? 503 : 200 });
      return Response.json({ error: "not faked" }, { status: 404 });
    }
    if (u.hostname === "gmail.googleapis.com") {
      gmail.push({ url: u.href, auth: req.headers.get("authorization") ?? "" });
      if (req.headers.get("authorization") !== "Bearer AT-pat@gmail.test") return Response.json({ error: { code: 401 } }, { status: 401 });
      if (u.pathname === "/gmail/v1/users/me/messages") return Response.json({ messages: [{ id: "code-1" }] });
      if (u.pathname === "/gmail/v1/users/me/messages/code-1") return Response.json(codeMail());
      return Response.json({ error: "not found" }, { status: 404 });
    }
    other.push(u.href);
    return Promise.reject(new Error(`no real host: ${u.href}`));
  };
  return { fetch, ats, google, gmail, other, calls: (p: string) => google.filter((g) => g.path.endsWith(p)) };
}

Deno.test({ name: "FEATURE NEEDS: one next need at a time, and Gmail connected from Telegram through a one-time link", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  const f = fakes();
  const realFetch = globalThis.fetch;
  const keys = ["CAREER_MAIL_TRACKING", "CAREER_NEEDS_RESUME_FIRST", "GOOGLE_OAUTH_CLIENT_ID", "GOOGLE_OAUTH_CLIENT_SECRET", "OAUTH_STATE_SECRET", "CAREER_CONNECT_URL", "CAREER_PREPARE_AHEAD_URL", "CAREER_APPLY_LINK"];
  const before = Object.fromEntries(keys.map((k) => [k, Deno.env.get(k)]));
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  try {
    for (const k of keys) Deno.env.delete(k);
    Deno.env.set("CAREER_NEEDS_RESUME_FIRST", "on"); // the owner's "no queue row before the resume" (off: FEATURE 1 queues the want)
    Deno.env.set("GOOGLE_OAUTH_CLIENT_ID", "test-client");
    Deno.env.set("GOOGLE_OAUTH_CLIENT_SECRET", "test-client-secret");
    Deno.env.set("OAUTH_STATE_SECRET", "test-state-secret");
    await supabaseParity(pg);
    for (const [id, email] of [[PAT, "pat@example.test"], [SAM, "sam@example.test"]]) {
      await pg.sql(`insert into auth.users (id, email) values ('${id}', '${email}'); insert into public.profiles (id) values ('${id}');
        insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    }
    globalThis.fetch = f.fetch as typeof fetch; // the double passes every non-Supabase request to this
    handler = await careerHandler(pg, { "tok-sam": SAM });
    const q = (sql: string) => pg.sql(sql);
    // Pat's Telegram chat, as trainee-telegram runs it: the service-role turn as Pat, in the thread their chat is bound to.
    const tg: Chat = handler.chat(SERVICE_KEY);
    const pat = async (message: string) => { const r = await tg.say(message, { as_user_id: PAT }); eq(r.status, 200, r.reply); return r; };
    await pat("hi");
    await q(`insert into public.channel_contacts (contact, user_id, thread_id, last_inbound_at, created_at, updated_at) values ('tg:4242', '${PAT}', '${tg.thread()}', now(), now(), now())`);
    const web: Chat = handler.chat("tok-sam");
    const sam = async (message: string) => { const r = await web.say(message); eq(r.status, 200, r.reply); return r; };
    const svc = createClient(SUPABASE_URL, SERVICE_KEY);
    const connect = (req: Request) => handleConnect(req, { admin: svc, env: Deno.env, fetch: f.fetch as typeof fetch });

    await t.step("(1) 'apply me to <link>' with no resume: asks for the resume, and only the resume", async () => {
      const r = await pat(`apply me to ${LINK}`);
      eq(r.intent, "career_apply_queue", r.reply);
      eq((r.reply.match(/Next I need one thing/g) ?? []).length, 1, `exactly one need: ${r.reply}`);
      assert(/Next I need one thing: your resume/.test(r.reply) && /paste it here or attach the file/.test(r.reply), r.reply);
      assert(!CONTACT_ASK.test(r.reply) && !/sponsorship|authori[sz]ed|gmail|connect/i.test(r.reply), `nothing else is asked or offered: ${r.reply}`);
      eq(await q(`select count(*) from public.career_connect_links`), "0", "no connector offered for applying");
      assert(/^I haven't put that posting on your apply list yet\./.test(r.reply), `the reply says nothing was queued: ${r.reply}`);
      eq(await q(`select count(*) from public.career_apply_wanted where user_id = '${PAT}'`), "0", "no queue row before the resume");
      const again = await pat(`apply me to ${LINK}`);
      eq(await q(`select count(*) from public.career_apply_wanted where user_id = '${PAT}'`), "0", "still none on a second ask");
      eq(f.ats.length, 0, "the posting is not even read before the resume");
      assert(/Next I need one thing: your resume/.test(again.reply), again.reply);
      eq(await q(`select count(*) from public.career_needs_asked where user_id = '${PAT}'`), "0", "a need that is asked again is not an offer recorded");
    });

    await t.step("(2) after the resume is confirmed: nothing on it is asked again; nothing else is needed", async () => {
      const pasted = await pat(`here is my resume:\n${RESUME}`);
      eq(pasted.intent, "career_resume_ingest", pasted.reply);
      const yes = await pat("yes, that's my resume");
      eq([yes.intent, yes.resultStatus], ["career_resume_ingest", "completed"], yes.reply);
      const r = await pat(`apply me to ${LINK}`);
      eq([r.intent, r.resultStatus], ["career_apply_queue", "queued"], r.reply);
      eq(await q(`select string_agg(posting_key || ' ' || state, ',') from public.career_apply_wanted where user_id = '${PAT}'`), `ashby:ramp:${JOB} waiting`, "queued once the resume is confirmed");
      assert(/There's nothing else I need from you for it right now \(your name and email are on your resume\)\./.test(r.reply), r.reply);
      assert(!CONTACT_ASK.test(r.reply) && !/Next I need/.test(r.reply), `nothing re-asked: ${r.reply}`);
    });

    await t.step("(3) an employer's emailed code: the Gmail connect offered once, for reading only, never as a blocker", async () => {
      const payload = JSON.stringify({ version: "1", user_id: PAT, job_id: `ashby:ramp:${JOB}`, company: "Ramp", url: LINK, fields: [], title: TITLE });
      const h = "ab".repeat(32);
      await q(`set session_replication_role = replica;
        insert into public.career_apply_jobs (user_id, job_id, company, url, payload, payload_hash, approval_hash, state, reason, created_at, updated_at)
        values ('${PAT}', 'ashby:ramp:${JOB}', 'Ramp', '${LINK}', '${payload}'::jsonb, '${h}', '${h}', 'needs_user', 'email_code', now(), now());
        set session_replication_role = origin;`);
      const r = await pat("where are my applications?");
      assert(/Ramp/.test(r.reply), r.reply);
      assert(/emailed you a code to finish your application: type the code from that email on the application page in your browser; never send it here\. If you connect Gmail, I can read a code like that myself on your next applications/.test(r.reply), r.reply);
      assert(LINK_RX.test(r.reply), `the offer carries a one-time link: ${r.reply}`);
      assert(/read: Google's permission covers all of your mail/.test(r.reply) && !/send: only a message/.test(r.reply), `read only: ${r.reply}`);
      eq(await q(`select channel || '|' || connector || '|' || purpose || '|' || array_to_string(scopes, ' ') from public.career_connect_links where user_id = '${PAT}'`), `telegram|google|email_code|${READ} openid email`);
      eq(r.body?.meta?.link_button?.url, r.reply.match(LINK_RX)![0], "on Telegram the link rides as a URL button (a plain link, opened in the browser)");
      const again = await pat("where are my applications?");
      assert(!LINK_RX.test(again.reply) && !/connect Gmail/.test(again.reply), `offered once: ${again.reply}`);
      eq(await q(`select string_agg(need, ',') from public.career_needs_asked where user_id = '${PAT}'`), "gmail_read:email_code", "one offer recorded, no duplicate");
      eq(await q(`select count(*) from public.career_connect_links where user_id = '${PAT}'`), "1", "the second status ask minted no link");
      eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${PAT}'`), "0", "an offer connects nothing");
    });

    await t.step("(3b) a Gmail feature with no grant (F8 'check my email now'): a signed one-time link for reading only, never the unsigned app link", async () => {
      Deno.env.set("CAREER_MAIL_TRACKING", "on");
      try {
        const r = await pat("check my email now");
        eq(r.intent, "career_inbox_check", r.reply);
        assert(LINK_RX.test(r.reply) && !/\/connect\/gmail/.test(r.reply), `the signed link, not the app's: ${r.reply}`);
        assert(new RegExp(`connect it with the link below`).test(r.reply) && /read: Google's permission covers all of your mail/.test(r.reply) && !/send: only/.test(r.reply), r.reply);
        const token = r.reply.match(LINK_RX)![1];
        eq(await q(`select channel || '|' || purpose || '|' || array_to_string(scopes, ' ') from public.career_connect_links where nonce_hash = encode(sha256(convert_to('${token}', 'UTF8')), 'hex')`), `telegram|track_replies|${READ} openid email`);
        assert(/Google doesn't allow signing in inside Telegram's own browser/.test(r.reply), r.reply);
        eq(f.gmail.length, 0, "nothing read: there is no grant");
        eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${PAT}'`), "0");
      } finally { Deno.env.delete("CAREER_MAIL_TRACKING"); }
    });

    await t.step("(4-) before connecting, the reply and the records agree: not connected", async () => {
      const r = await pat("what can you see?");
      assert(/Gmail: not connected/.test(r.reply) && !/connected as/.test(r.reply), r.reply);
      eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${PAT}'`), "0");
    });

    let patLink = "";
    await t.step("(4a) 'connect gmail': a one-time link for read and send, in plain words; the page only peeks", async () => {
      const r = await pat("connect gmail");
      eq([r.intent, r.resultStatus], ["career_connect", "link"], r.reply);
      assert(/read: Google's permission covers all of your mail\. I use it for two things/.test(r.reply), r.reply);
      assert(/send: only a message you approve word for word/.test(r.reply), r.reply);
      assert(/works once, for you, and expires in 15 minutes/.test(r.reply) && /never ask for your password or a code/.test(r.reply), r.reply);
      assert(!/calendar|test email|self-test/i.test(r.reply), `claims only what is true: ${r.reply}`);
      assert(/Open it in your phone's browser \(Safari or Chrome\): Google doesn't allow signing in inside Telegram's own browser/.test(r.reply), r.reply);
      patLink = r.reply.match(LINK_RX)![0];
      eq(r.body?.meta?.link_button, { text: "Connect Gmail", url: patLink }, "the Telegram adapter's URL button: the same one-time link, never a web_app");
      for (let i = 0; i < 2; i++) { // a message preview, then the person: neither uses it
        const page = await connect(new Request(patLink));
        eq(page.status, 200);
        const html = await page.text();
        assert(/Connect Gmail to Trainee/.test(html) && /p•••@example\.test/.test(html) && /Continue to Google/.test(html) && /<form method="post"/.test(html), html);
      }
      eq(await q(`select count(*) from public.career_connect_links where user_id = '${PAT}' and opened_at is null and array_to_string(scopes, ' ') = '${READ} ${SEND} openid email'`), "1");
    });

    let state = "";
    await t.step("(4b) the tap goes to Google with only the link's scopes; the token works once", async () => {
      const token = patLink.match(LINK_RX)![1];
      const tap = () => connect(new Request(CONNECT, { method: "POST", body: new URLSearchParams({ t: token }) }));
      const go = await tap();
      eq(go.status, 303);
      const to = new URL(go.headers.get("location")!);
      eq(`${to.origin}${to.pathname}`, "https://accounts.google.com/o/oauth2/v2/auth");
      eq(to.searchParams.get("scope"), `${READ} ${SEND} openid email`);
      eq([to.searchParams.get("client_id"), to.searchParams.get("redirect_uri"), to.searchParams.get("access_type"), to.searchParams.get("include_granted_scopes")], ["test-client", CONNECT, "offline", "true"]);
      state = to.searchParams.get("state")!;
      const twice = await tap();
      eq(twice.status, 400, "a used token never reaches Google again");
      assert(/already used/.test(await twice.text()));
    });

    await t.step("(4c) Google's callback: the grant stored for Pat only, and Pat told on Telegram 'Gmail connected: ...'; once", async () => {
      const forged = state.replace(/.$/, (c) => (c === "A" ? "B" : "A"));
      const bad = await connect(new Request(`${CONNECT}?state=${encodeURIComponent(forged)}&code=CODE-PAT`));
      eq(bad.status, 400, "a forged state stores nothing");
      eq(f.calls("/token").length, 0);
      const back = await connect(new Request(`${CONNECT}?state=${encodeURIComponent(state)}&code=CODE-PAT`));
      eq(back.status, 200);
      assert(/Gmail connected: pat@gmail\.test/.test(await back.text()));
      eq(f.calls("/token").length, 1);
      const ex = new URLSearchParams(f.calls("/token")[0].body);
      eq([ex.get("code"), ex.get("client_id"), ex.get("client_secret"), ex.get("redirect_uri"), ex.get("grant_type")],
        ["CODE-PAT", "test-client", "test-client-secret", CONNECT, "authorization_code"], "the code exchanged at Google's token endpoint with this client and redirect");
      eq(await q(`select provider || '|' || email || '|' || scopes from public.user_oauth_connections where user_id = '${PAT}'`), `google_career|pat@gmail.test|openid ${READ} ${SEND} email`);
      eq(new Set((await q(`select scopes from public.user_oauth_connections where user_id = '${PAT}'`)).split(" ")), new Set([READ, SEND, "openid", "email"]), "exactly the scopes the link asked for");
      // The tokens live only in the vault (Supabase Vault encrypts them in production); the row holds only the entry's name.
      const row = await q(`select row_to_json(c)::text from public.user_oauth_connections c where user_id = '${PAT}'`);
      assert(!/AT-|RT-/.test(row) && row.includes(`"vault_name":"oauth_google_career_${PAT}"`), row);
      eq(await q(`select count(*) from vault.secrets where name = 'oauth_google_career_${PAT}'`), "1");
      const vault = JSON.parse(await q(`select public.oauth_vault_read('oauth_google_career_${PAT}')`));
      eq([vault.access_token, vault.refresh_token, vault.email], ["AT-pat@gmail.test", "RT-pat@gmail.test", "pat@gmail.test"]);
      eq(await q(`select channel || '|' || kind || '|' || status || '|' || text from public.career_outbox where user_id = '${PAT}' and key like 'status:connect:%'`),
        `telegram|status|queued|Gmail connected: pat@gmail.test. You allowed me to read your mail, for employers' replies and application codes, and to send from your Gmail, only messages you approve word for word. Say "disconnect gmail" any time to remove it.`);
      const replay = await connect(new Request(`${CONNECT}?state=${encodeURIComponent(state)}&code=CODE-PAT`));
      eq(replay.status, 400, "the callback lands once");
      assert(/This link was already used\. Links work once/.test(await replay.text()), "and says why");
      eq(f.calls("/token").length, 1);
      eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${SAM}'`), "0", "nothing for anyone else");
      const again = await pat("connect gmail");
      eq(again.resultStatus, "already", again.reply);
      assert(/Gmail is already connected: pat@gmail\.test/.test(again.reply) && !LINK_RX.test(again.reply), again.reply);
    });

    // The email-code reader (WO-096, career-email-code) over the grant as stored, exactly as the edge function builds it.
    const reader = () => careerCodeMailbox({
      env: Deno.env, fetch: f.fetch as typeof fetch, now: Date.now,
      connection: async (u) => (await svc.from("user_oauth_connections").select("vault_name,scopes").eq("user_id", u).eq("provider", "google_career").maybeSingle()).data ?? null,
      readVault: async (n) => { const r = await svc.rpc("oauth_vault_read", { p_name: n }); return r.data ? String(r.data) : null; },
      writeVault: async (n, sec) => { await svc.rpc("oauth_vault_store", { p_name: n, p_secret: sec }); },
    });
    await t.step("(4d) a Gmail feature works with that grant: the code reader reads Pat's code email with Pat's token", async () => {
      const got = await fetchVerificationCode({ userId: PAT, ats: "ashby", sinceMs: Date.now() - 60_000, maxWaitMs: 0 }, { mailbox: reader(), now: Date.now });
      eq(got.status, "found");
      eq((got as any).code.reveal(), "482913");
      assert(f.gmail.length >= 2 && f.gmail.every((g) => g.auth === "Bearer AT-pat@gmail.test"), JSON.stringify(f.gmail));
      assert(decodeURIComponent(f.gmail[0].url).includes("from:(ashbyhq.com)"), f.gmail[0].url);
      const none = await fetchVerificationCode({ userId: SAM, ats: "ashby", sinceMs: Date.now() - 60_000, maxWaitMs: 0 }, { mailbox: reader(), now: Date.now });
      eq(none.status, "no_google_connection", "Sam has no grant, so nothing is read for Sam");
    });

    // A link minted for Pat outside the chat (as the chat mints it), opened by the tap, its state returned.
    const openLink = async (scopes: string[], at = "now()") => {
      const token = await q(`select public.career_connect_link_issue('${PAT}', 'telegram', '${tg.thread()}', array[${scopes.map((x) => `'${x}'`).join(",")}], ${at})`);
      const go = await connect(new Request(CONNECT, { method: "POST", body: new URLSearchParams({ t: token }) }));
      return { token, go, state: go.status === 303 ? new URL(go.headers.get("location")!).searchParams.get("state")! : null };
    };
    const patGrant = () => q(`select scopes || '|' || public.oauth_vault_read('oauth_google_career_${PAT}') from public.user_oauth_connections where user_id = '${PAT}'`);
    await t.step("(4e) adversarial: declined on Google's page, a token exchange that fails, an expired link, an empty or unknown token", async () => {
      const before = await patGrant();
      const exchanges = f.calls("/token").length;
      const declined = await openLink([READ, "openid", "email"]);
      const no = await connect(new Request(`${CONNECT}?state=${encodeURIComponent(declined.state!)}&error=access_denied`));
      eq(no.status, 200);
      assert(/Gmail wasn&#39;t connected/.test(await no.text()));
      eq(await patGrant(), before, "a decline changes no grant");
      eq(f.calls("/token").length, exchanges, "and exchanges no code");
      eq(await q(`select outcome from public.career_connect_links where nonce_hash = encode(sha256(convert_to('${declined.token}', 'UTF8')), 'hex')`), "declined");
      const down = await openLink([READ, "openid", "email"]);
      const fail = await connect(new Request(`${CONNECT}?state=${encodeURIComponent(down.state!)}&code=CODE-NETFAIL`));
      eq(fail.status, 502);
      eq(await patGrant(), before, "a failed exchange changes no grant");
      eq(await q(`select outcome from public.career_connect_links where nonce_hash = encode(sha256(convert_to('${down.token}', 'UTF8')), 'hex')`), "error");
      eq(await q(`select string_agg(text, ' / ' order by id) from public.career_outbox where user_id = '${PAT}' and key like 'status:connect:%' and text not like 'Gmail connected:%'`),
        `Gmail wasn't connected: Google's page was closed or declined, so nothing changed. Text "connect gmail" if you want a new link. / Gmail wasn't connected: something went wrong on the way back from Google, so nothing was saved. Text "connect gmail" for a new link.`,
        "each outcome told in the same channel, and only as it happened");
      const late = await openLink([READ, "openid", "email"], "now() - interval '20 minutes'");
      eq(late.go.status, 400, "an expired link never reaches Google");
      const peek = await connect(new Request(`${CONNECT}?t=${late.token}`));
      eq(peek.status, 410);
      assert(/This link expired/.test(await peek.text()));
      for (const t of ["", "x".repeat(5000), "'; drop table public.career_connect_links; --"]) {
        const r = await connect(new Request(CONNECT, { method: "POST", body: new URLSearchParams({ t }) }));
        eq(r.status, 400, `refused: ${t.slice(0, 20)}`);
        eq((await connect(new Request(`${CONNECT}?t=${encodeURIComponent(t)}`))).status, 410);
      }
      eq(await q(`select to_regclass('public.career_connect_links') is not null`), "t");
      eq(await patGrant(), before);
    });

    await t.step("(4f) the chat carries on after the callback: a link asked for by 'check my email now' ends by saying how to continue", async () => {
      const token = await q(`select public.career_connect_link_issue('${PAT}', 'telegram', '${tg.thread()}', array['${READ}','openid','email'], now(), 'google', 'track_replies')`);
      const go = await connect(new Request(CONNECT, { method: "POST", body: new URLSearchParams({ t: token }) }));
      const st = new URL(go.headers.get("location")!).searchParams.get("state")!;
      eq((await connect(new Request(`${CONNECT}?state=${encodeURIComponent(st)}&code=CODE-PAT`))).status, 200);
      const told = await q(`select o.text from public.career_outbox o join public.career_connect_links l on o.key = 'status:connect:' || l.id where l.nonce_hash = encode(sha256(convert_to('${token}', 'UTF8')), 'hex')`);
      assert(/^Gmail connected: pat@gmail\.test\./.test(told) && /Text "check my email now" and I'll look for employers' replies\./.test(told), told);
      eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${PAT}'`), "1", "one grant, renewed in place");
    });

    await t.step("(5) 'what can you see?' answers from the records", async () => {
      const r = await pat("what can you see?");
      eq(r.intent, "career_connect", r.reply);
      assert(/Gmail: connected as pat@gmail\.test \(read and send\)\./.test(r.reply), r.reply);
      assert(/I read the sender, subject, date and Google's short preview of new mail, not the full messages/.test(r.reply) && /Your resume: on file, confirmed by you\./.test(r.reply), r.reply);
      assert(/can't see your LinkedIn, Indeed, passwords/.test(r.reply), r.reply);
    });

    await t.step("(7) Sam on the web: none of Pat's state; Sam's own connect lands in Sam's own thread", async () => {
      const seen = await sam("what can you see?");
      assert(/Gmail: not connected/.test(seen.reply) && /Your resume: not on file\./.test(seen.reply) && !/pat@|Ramp/.test(seen.reply), seen.reply);
      const apps = await sam("where are my applications?");
      assert(!/Ramp|pat@|connect Gmail/.test(apps.reply), apps.reply);
      const none = await sam("disconnect gmail");
      eq(none.resultStatus, "none", none.reply);
      eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${PAT}'`), "1", "Sam's disconnect leaves Pat's grant");
      const r = await sam("connect my gmail");
      const token = r.reply.match(LINK_RX)![1];
      eq(await q(`select channel || '|' || (thread_id = '${web.thread()}') from public.career_connect_links where user_id = '${SAM}'`), "web|true");
      const go = await connect(new Request(CONNECT, { method: "POST", body: new URLSearchParams({ t: token }) }));
      const st = new URL(go.headers.get("location")!).searchParams.get("state")!;
      const back = await connect(new Request(`${CONNECT}?state=${encodeURIComponent(st)}&code=CODE-SAM`));
      eq(back.status, 200);
      eq(await q(`select email || '|' || scopes from public.user_oauth_connections where user_id = '${SAM}'`), `sam@gmail.test|openid ${READ} email`);
      eq(await q(`select content from public.agent_messages where thread_id = '${web.thread()}' and meta->>'intent' = 'career_connect_done'`),
        `Gmail connected: sam@gmail.test. You allowed me to read your mail, for employers' replies and application codes. You didn't allow sending, so I won't do that. Say "disconnect gmail" any time to remove it.`);
      eq(await q(`select count(*) from public.career_outbox where user_id = '${SAM}'`), "0", "the web answer is the thread's, not a text");
      eq(await q(`select email from public.user_oauth_connections where user_id = '${PAT}'`), "pat@gmail.test", "Pat's grant untouched");
    });

    await t.step("(7b) Sam adds sending: the link asks for send only; Google's answer without a refresh token keeps the one stored", async () => {
      const r = await sam("connect gmail to send");
      eq(r.resultStatus, "link", r.reply);
      assert(/send: only a message you approve/.test(r.reply) && !/read: Google's permission/.test(r.reply), r.reply);
      const token = r.reply.match(LINK_RX)![1];
      const go = await connect(new Request(CONNECT, { method: "POST", body: new URLSearchParams({ t: token }) }));
      eq(new URL(go.headers.get("location")!).searchParams.get("scope"), `${SEND} openid email`);
      const st = new URL(go.headers.get("location")!).searchParams.get("state")!;
      eq((await connect(new Request(`${CONNECT}?state=${encodeURIComponent(st)}&code=CODE-SAM2`))).status, 200);
      const v = JSON.parse(await q(`select public.oauth_vault_read('oauth_google_career_${SAM}')`));
      eq([v.access_token, v.refresh_token], ["AT-sam@gmail.test-2", "RT-sam@gmail.test"], "the refresh token Google sent the first time is kept");
      eq(await q(`select scopes from public.user_oauth_connections where user_id = '${SAM}'`), `openid ${READ} ${SEND} email`);
    });

    await t.step("(6) 'disconnect gmail': revoked at Google, tokens and row deleted, live links burned", async () => {
      const live = (await pat("connect gmail to send")).reply; // already connected: no link; mint one by hand below
      assert(/already connected/.test(live), live);
      await q(`select public.career_connect_link_issue('${PAT}', 'telegram', null, array['${READ}','openid','email'], now())`);
      const r = await pat("disconnect gmail");
      eq([r.intent, r.resultStatus], ["career_connect", "disconnected"], r.reply);
      assert(/Gmail disconnected\. The stored tokens are deleted and Google confirmed the access is revoked\./.test(r.reply), r.reply);
      eq(f.calls("/revoke").map((c) => new URLSearchParams(c.body).get("token")), ["RT-pat@gmail.test"]);
      eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${PAT}'`), "0");
      eq(await q(`select coalesce(public.oauth_vault_read('oauth_google_career_${PAT}'), 'gone')`), "gone");
      eq(await q(`select count(*) from public.career_connect_links where user_id = '${PAT}' and finished_at is null`), "0", "no link of Pat's works now");
      eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${SAM}'`), "1", "Sam's grant untouched");
      const after = await pat("what can you see?");
      assert(/Gmail: not connected/.test(after.reply), after.reply);
      const calls = f.gmail.length;
      const closed = await fetchVerificationCode({ userId: PAT, ats: "ashby", sinceMs: Date.now() - 60_000, maxWaitMs: 0 }, { mailbox: reader(), now: Date.now });
      eq(closed.status, "no_google_connection", "a later Gmail use fails closed");
      eq(f.gmail.length, calls, "and makes no Gmail request");
    });

    await t.step("(6b) a revoke Google doesn't confirm: the tokens are still deleted here, and the reply says Google didn't confirm", async () => {
      const r = await sam("disconnect gmail");
      eq(r.resultStatus, "disconnected", r.reply);
      assert(/Google didn't confirm the revoke, so you can also remove Trainee at myaccount\.google\.com\/permissions/.test(r.reply) && !/Google confirmed/.test(r.reply), r.reply);
      eq(f.calls("/revoke").map((c) => new URLSearchParams(c.body).get("token")).at(-1), "RT-sam@gmail.test");
      eq(await q(`select count(*) from public.user_oauth_connections where user_id = '${SAM}'`), "0");
      eq(await q(`select coalesce(public.oauth_vault_read('oauth_google_career_${SAM}'), 'gone')`), "gone");
    });
    await t.step("(8) with CAREER_NEEDS_RESUME_FIRST off (FEATURE 1's design): the want is queued, and the reply says so and names one need", async () => {
      Deno.env.delete("CAREER_NEEDS_RESUME_FIRST");
      const r = await sam(`apply me to ${LINK}`);
      eq([r.intent, r.resultStatus], ["career_apply_queue", "queued"], r.reply);
      eq(await q(`select string_agg(posting_key, ',') from public.career_apply_wanted where user_id = '${SAM}'`), `ashby:ramp:${JOB}`, "the reply's 'queued' is true in the queue");
      assert(/^1\/1 queued/.test(r.reply), r.reply);
      eq((r.reply.match(/Next I need one thing: your resume/g) ?? []).length, 1, r.reply);
      assert(!/no confirmed resume on file yet/.test(r.reply) && !CONTACT_ASK.test(r.reply), `one need, said once: ${r.reply}`);
    });
    eq(f.other, [], "no other host was reached");
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(before)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    handler?.restore();
    await pg.stop();
  }
} });
