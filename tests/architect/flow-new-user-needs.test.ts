// FEATURE NEEDS (2026-10-26, product directive): a brand-new person who knows nothing about Trainee, through the REAL
// handler (agent-chat handleChat) on real Postgres, on Telegram, SMS (iMessage) and the web. What they can ask, and what is
// true in the records after each answer:
//   "what can you do?"            -> each capability with what it needs from them now, from their records and the switches
//   "what do you need from me?"   -> the one thing applying needs (the resume), never "nothing is waiting" when it isn't
//   a password, key or code typed into the chat -> removed before anything stores it; the safe path; what they must do recorded
//   changing their mind (an apply ask, then a question, then the resume) -> nothing queued before the resume, nothing asked twice
//   "connect gmail" on SMS and the web -> a link bound to that channel; the Telegram browser note only on Telegram
// The seams are the HTTP hops only (tests/flow/postgrest.ts); nothing reaches a real host.
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, type Chat, SERVICE_KEY, supabaseParity } from "../flow/handler.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const RESUME = await Deno.readTextFile(`${ROOT}/packages/career-data/fixtures/test-resume.txt`);
const LEE = "7b0f8f8e-6a43-4a49-9d2c-0000000000d1", RAY = "7b0f8f8e-6a43-4a49-9d2c-0000000000d2", WEB = "7b0f8f8e-6a43-4a49-9d2c-0000000000d3";
const LINK = "https://jobs.ashbyhq.com/ramp/a13ae586-f4cb-4385-8822-c42b9b54ed74";

Deno.test({ name: "FEATURE NEEDS: a brand-new person asks what Trainee can do and needs, types a secret, changes their mind; every answer true to the records", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (!pgBinDir()) { if (CI) throw new Error("needs Postgres 16 in CI"); console.log("NOT_RUN locally: no Postgres binaries"); return; }
  const pg: Pg = await startPg();
  const realFetch = globalThis.fetch;
  const outbound: string[] = [];
  const keys = ["CAREER_NEEDS_RESUME_FIRST", "CAREER_MAIL_TRACKING", "CAREER_EMAIL_SEND", "CAREER_PREPARE_AHEAD_URL"];
  const before = Object.fromEntries(keys.map((k) => [k, Deno.env.get(k)]));
  let handler: Awaited<ReturnType<typeof careerHandler>> | null = null;
  try {
    for (const k of keys) Deno.env.delete(k);
    Deno.env.set("CAREER_NEEDS_RESUME_FIRST", "on");
    await supabaseParity(pg);
    for (const id of [LEE, RAY, WEB]) {
      await pg.sql(`insert into auth.users (id, email) values ('${id}', '${id}@example.test'); insert into public.profiles (id) values ('${id}');
        insert into public.career_watch_kv (user_id, key, value) values ('${id}', 'career:account', '{"epoch":0,"version":0,"paused":false}');`);
    }
    globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
      const u = new URL(input instanceof Request ? input.url : String(input));
      outbound.push(u.href);
      return Promise.reject(new Error(`no real host: ${u.href}`));
    }) as typeof fetch;
    handler = await careerHandler(pg, { "tok-web": WEB });
    const q = (sql: string) => pg.sql(sql);
    // Lee on Telegram, Ray on SMS (iMessage): the channel bridge's turns, each chat bound to its thread.
    const channel = async (who: string, contact: string) => {
      const c: Chat = handler!.chat(SERVICE_KEY);
      const r = await c.say("hi", { as_user_id: who });
      eq(r.status, 200, r.reply);
      await q(`insert into public.channel_contacts (contact, user_id, thread_id, last_inbound_at, created_at, updated_at) values ('${contact}', '${who}', '${c.thread()}', now(), now(), now())`);
      return async (message: string) => { const x = await c.say(message, { as_user_id: who }); eq(x.status, 200, x.reply); return x; };
    };
    const lee = await channel(LEE, "tg:5151");
    const ray = await channel(RAY, "+13125550199");
    const webChat = handler.chat("tok-web");
    const web = async (message: string) => { const x = await webChat.say(message); eq(x.status, 200, x.reply); return x; };
    const rows = async (who: string) => JSON.parse(await q(`select json_build_object('wanted', (select count(*) from public.career_apply_wanted where user_id = '${who}'),
      'grants', (select count(*) from public.user_oauth_connections where user_id = '${who}'), 'links', (select count(*) from public.career_connect_links where user_id = '${who}'),
      'needs', (select coalesce(string_agg(need, ',' order by need), '') from public.career_needs_asked where user_id = '${who}'))`));

    await t.step("'hey what can you do?': each capability and what it needs from them now; nothing claimed that the records don't hold", async () => {
      const r = await lee("hey, what can you do??");
      eq([r.intent, r.resultStatus], ["career_connect", "capabilities"], r.reply);
      assert(/^Here's what I can do for you, and what each needs from you right now:/.test(r.reply), r.reply);
      assert(/2\. Apply for you: needs your resume first \(paste it or attach the file\)\. Each application goes only after you approve its exact answers\. The Trainee extension in Chrome on your computer prepares each one; I haven't seen it run for you yet\./.test(r.reply), r.reply);
      assert(/3\. Tailor your resume to a posting: needs your resume first/.test(r.reply), r.reply);
      assert(/7\. Track employers' replies: not switched on yet, so I can't read any mail for you\./.test(r.reply), `the switch is off, so it says so: ${r.reply}`);
      assert(/8\. Send follow-ups and application emails you approve: not switched on yet/.test(r.reply), r.reply);
      assert(/Never: applying, messaging or scraping on LinkedIn or Indeed; solving a captcha; taking a password, key or code in chat\./.test(r.reply), r.reply);
      assert(!/connected as|\bready \(Gmail/.test(r.reply), "nothing connected is claimed");
      eq(await rows(LEE), { wanted: 0, grants: 0, links: 0, needs: "" }, "a question changes nothing");
      Deno.env.set("CAREER_MAIL_TRACKING", "on");
      Deno.env.set("CAREER_EMAIL_SEND", "on");
      try {
        const on = await lee("what else can you help me with");
        assert(/7\. Track employers' replies: needs Gmail; say "connect gmail"\./.test(on.reply) && /8\. Send follow-ups and application emails you approve: needs Gmail for sending; say "connect gmail"\./.test(on.reply), on.reply);
      } finally { Deno.env.delete("CAREER_MAIL_TRACKING"); Deno.env.delete("CAREER_EMAIL_SEND"); }
    });

    await t.step("'what do you need from me?': the resume, not 'nothing is waiting'; asking twice records nothing twice", async () => {
      for (const m of ["what do you need from me?", "so what do you need from me"]) {
        const r = await lee(m);
        eq(r.intent, "career_apply_questions_answer", r.reply);
        assert(/^To apply for you, I need one thing first: your resume, because nothing can be prepared for the application without your resume\. Please paste it here or attach the file, then tell me it's yours\./.test(r.reply), r.reply);
        assert(!/Nothing is waiting on you/.test(r.reply), r.reply);
        assert(/I'll ask for Gmail only if you want me to track employers' replies or send an email you approve\./.test(r.reply), r.reply);
      }
      eq(await rows(LEE), { wanted: 0, grants: 0, links: 0, needs: "" });
    });

    await t.step("a password typed into the chat: removed before it is stored; the safe path; what they must do recorded once", async () => {
      const r = await lee("ok my gmail password is Hunter2!xyz can you just log in");
      assert(r.reply.startsWith("(I removed the password from your message and didn't keep it."), r.reply);
      assert(/I don't need your Google password or any Google key\. To let me read employers' replies or send what you approve, connect Gmail on Google's own page: say "connect gmail"/.test(r.reply), r.reply);
      assert(/If you shared that password anywhere else, change it\./.test(r.reply), r.reply);
      eq(r.resultStatus, "secret_refused");
      eq(await q(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${LEE}' and m.content like '%Hunter2!xyz%'`), "0", "the password is in no stored message");
      eq(await q(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${LEE}' and m.content like '%[password removed]%'`), "1");
      const again = await lee("my gmail password is Hunter2!xyz");
      eq(again.resultStatus, "secret_refused", again.reply);
      eq((await rows(LEE)).needs, "secret_refused:google", "recorded once, however often it is typed");
      eq((await rows(LEE)).grants, 0, "and nothing was connected with it");
    });

    await t.step("an API key, a token and an employer's password: none stored; each gets its own safe path", async () => {
      const key = "sk-proj-AbCdEfGhIjKlMnOpQrStUvWx0123456789";
      const k = await lee(`here's my openai api key ${key} if you need it`);
      assert(/^\(I removed the key or token from your message and didn't keep it\./.test(k.reply), k.reply);
      assert(/I don't use any key or token from you: your accounts connect only on their own sign-in pages \(for Gmail, say "connect gmail"\)\. If that was a real key, revoke it where you made it/.test(k.reply), k.reply);
      const gh = await lee("token: ghp_abcdefghijklmnopqrstuvwxyz0123456789AB");
      eq(gh.resultStatus, "secret_refused", gh.reply);
      const wd = await lee("my workday password is Spr1ng!2026 for the Ramp application");
      assert(/Sign in to the employer's site yourself, on its own page in your browser; I never take an employer account password or code\./.test(wd.reply), wd.reply);
      for (const s of [key, "ghp_abcdefghijklmnopqrstuvwxyz0123456789AB", "Spr1ng!2026"]) {
        eq(await q(`select count(*) from public.agent_messages m join public.agent_threads t on t.id = m.thread_id where t.user_id = '${LEE}' and position('${s}' in m.content) > 0`), "0", `${s.slice(0, 8)}… stored nowhere`);
      }
      eq((await rows(LEE)).needs, "secret_refused:employer,secret_refused:google,secret_refused:key");
    });

    await t.step("changing their mind: an apply ask, a question, then the resume; nothing queued before it, nothing re-asked after", async () => {
      const ask = await lee(`can u apply me to this ${LINK}`);
      eq([ask.intent, ask.resultStatus], ["career_apply_queue", "needs_resume"], ask.reply);
      eq((await rows(LEE)).wanted, 0, "nothing queued before the resume");
      eq(outbound.filter((u) => u.includes("ashbyhq")).length, 0, "the posting is not even read before the resume");
      const meh = await lee("actually wait, what can you do");
      eq(meh.resultStatus, "capabilities", meh.reply);
      await lee(`here is my resume:\n${RESUME}`);
      const drafts = await lee("what do you need from me");
      assert(/^To apply for you, I need one thing first: I read your resume, but you haven't told me it's yours yet\. Please check what I read and say "yes, that's my resume"/.test(drafts.reply), `a resume read but not confirmed asks to confirm, not to paste again: ${drafts.reply}`);
      const yes = await lee("yes, that's my resume");
      eq([yes.intent, yes.resultStatus], ["career_resume_ingest", "completed"], yes.reply);
      const need = await lee("what do you need from me now");
      assert(/^Your resume is on file, so nothing is needed to start applying\./.test(need.reply) && !/resume first|name|email address|phone/i.test(need.reply.split("\n")[0]), need.reply);
      const can = await lee("what can you do");
      assert(/2\. Apply for you: ready\./.test(can.reply) && /3\. Tailor your resume to a posting: ready\./.test(can.reply), can.reply);
      eq((await rows(LEE)).wanted, 0, "a question queues nothing");
    });

    await t.step("SMS and the web: 'connect gmail' is bound to that channel; the Telegram browser note and button only on Telegram", async () => {
      const r = await ray("can you connect my gmail");
      eq(r.resultStatus, "link", r.reply);
      assert(!/Telegram/.test(r.reply) && !r.body?.meta?.link_button, `SMS: no Telegram note or button: ${r.reply}`);
      eq(await q(`select channel from public.career_connect_links where user_id = '${RAY}'`), "imessage");
      const w = await web("connect gmail");
      assert(!/Telegram/.test(w.reply) && !w.body?.meta?.link_button, w.reply);
      eq(await q(`select channel from public.career_connect_links where user_id = '${WEB}'`), "web");
      const l = await lee("connect gmail please");
      assert(/Google doesn't allow signing in inside Telegram's own browser/.test(l.reply) && l.body?.meta?.link_button?.url, l.reply);
      eq(await q(`select channel from public.career_connect_links where user_id = '${LEE}'`), "telegram");
      const see = await web("what can you see?");
      assert(/Gmail: not connected/.test(see.reply) && /Your resume: not on file\./.test(see.reply), `the web person sees only their own state: ${see.reply}`);
      eq((await rows(WEB)).needs, "", "nothing of Lee's");
    });
    eq(outbound, [], "no host was reached");
  } finally {
    globalThis.fetch = realFetch;
    for (const [k, v] of Object.entries(before)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    handler?.restore();
    await pg.stop();
  }
} });
