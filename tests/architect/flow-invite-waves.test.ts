// FEATURE WAVES (GB-01, ON-01): the waitlist let in by invite waves, end to end on real Postgres (CI's migration order)
// with the real supabase-js client, the real inbound store (trainee-inbound/store.ts), the real Telegram webhook handler
// (trainee-telegram/handler.ts, the adapter over a fake Bot API), the real inbound core (channel_inbound.ts runInbound)
// and the production chat handler (handleChat) reached through chatThroughAgent, exactly as trainee-telegram composes it.
// The seams: the HTTP hop to the Supabase project (tests/flow/postgrest.ts), GoTrue's admin "create user" (answered
// below by inserting the auth.users row, as GoTrue would), the Bot API, and the invite's Send (captured, never sent).
// Every person is synthetic (+1 312 555 01xx, example.test).
//
//   1. Gates before any wave: the first wave is recommended at the policy's first size.
//   2. Opening a wave picks the next N consenting numbers in signup order and sends nothing; the same key is a no-op;
//      a second wave while one is in progress is refused.
//   3. Approval needs the exact text's sha256, STOP wording and the exact count.
//   4. STOP on iMessage before the send stops that invite; quiet hours send nothing; the send sends exactly the
//      approved text with each person's own link, and records it (token gone, expiry set).
//   5. Telegram's Start with the invite makes the account and the first reply (the 18+ question); the sign-up steps
//      record each consent with its version; then the router answers.
//   6. A second chat with the same invite, or the same chat again: refused, no second account.
//   7. The web: the first message with the invite token redeems it as the signed-in person; under 18 is blocked.
//   8. An expired invite is refused and makes no account; a first text from an invited number makes the account.
//   9. STOP stops everything for that person: opted out, the account quiet, every unredeemed invite to them stopped.
//  10. The web gate (TRAINEE_WEB_SIGNUP=invite, 20261026230000) on the same invites: not admitted without one; the
//      invite link's token admits (redeemed as the person, the admission recorded) and the sign-up steps begin.
//
// Run: the gate runs it with CI=true (a missing Postgres throws). Locally add --import-map=tests/flow/supabase-npm.json.
import assertNode from "node:assert/strict";
import { pgBinDir, type Pg, startPg } from "../flow/pg.ts";
import { careerHandler, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { chatThroughAgent } from "../../supabase/functions/_shared/channel_runtime.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";
import { handleTelegram } from "../../supabase/functions/trainee-telegram/handler.ts";
import { telegramAdapter } from "../../supabase/functions/_shared/telegram.ts";
import { runInbound } from "../../supabase/functions/_shared/channel_inbound.ts";
import { CHANNEL_REPLIES } from "../../supabase/functions/_shared/channel.ts";
import { INVITE_ALREADY_MEMBER, INVITE_REFUSED, sendWave, sha256Hex } from "../../supabase/functions/_shared/career_invites.ts";
import { SIGNUP_AGE_AGAIN, SIGNUP_AGE_ASK, SIGNUP_DONE, SIGNUP_UNDER18, termsAsk, termsFrom } from "../../supabase/functions/_shared/career_signup.ts";
import { NOT_INVITED_REPLY } from "../../supabase/functions/_shared/trainee_admission.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const CI = Deno.env.get("CI") === "true";
const WEB = "7b0f8f8e-6a43-4a49-9d2c-0000000017a1", WEB2 = "7b0f8f8e-6a43-4a49-9d2c-0000000017a2";
const PEOPLE: Record<string, string> = { "tok-wave-web": WEB, "tok-wave-web2": WEB2 };
const TG_TOKEN = "123456:wave-test-token", TG_SECRET = "wave_test_secret_0123456789abcdef_ok";
const ENV: Record<string, string> = {
  TRAINEE_APP_URL: "https://app.trainee.test", TELEGRAM_BOT_USERNAME: "trainee_wave_bot",
  TRAINEE_TERMS_URL: "https://trainee.test/terms", TRAINEE_TERMS_VERSION: "2026-10-26",
  TRAINEE_PRIVACY_URL: "https://trainee.test/privacy", TRAINEE_PRIVACY_VERSION: "2026-10-26",
  TELEGRAM_BOT_TOKEN: TG_TOKEN, TELEGRAM_WEBHOOK_SECRET: TG_SECRET,
};
const TEMPLATE = "Trainee: your spot is open. Start on the web: {link} or on Telegram: {telegram} Reply STOP to opt out.";
const phone = (n: number) => `+131255501${String(n).padStart(2, "0")}`;

const skip = () => {
  if (pgBinDir()) return false;
  if (CI) throw Error("the invite waves flow needs Postgres 16 in CI");
  console.log("NOT_RUN locally: no Postgres binaries");
  return true;
};

Deno.test({ name: "invite waves: wave open -> invites -> approved send -> redeem on Telegram, web and iMessage -> account and first reply; refusals; STOP", sanitizeResources: false, sanitizeOps: false, async fn(t) {
  if (skip()) return;
  const pg: Pg = await startPg();
  await supabaseParity(pg);
  await pg.sql(`insert into auth.users (id, email) values ('${WEB}', 'wave-web@example.test'), ('${WEB2}', 'wave-web2@example.test'); insert into public.profiles (id) values ('${WEB}'), ('${WEB2}');`);
  for (const [k, v] of Object.entries(ENV)) Deno.env.set(k, v);
  Deno.env.delete("TRAINEE_SIGNUP"); Deno.env.delete("TRAINEE_ALLOWED_CONTACTS"); Deno.env.delete("TRAINEE_UNDER18_POLICY");
  const handler = await careerHandler(pg, PEOPLE);
  const { handleChat } = await import("../../supabase/functions/agent-chat/handler-career.ts");
  const double = globalThis.fetch;
  const tgSent: { chat_id: number; text: string }[] = [];
  let createdUsers = 0;
  // GoTrue's admin create, the Bot API and agent-chat's URL; everything else goes to the PostgREST double.
  globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(String(input), init);
    const url = new URL(req.url);
    if (url.origin === new URL(SUPABASE_URL).origin && url.pathname === "/auth/v1/admin/users" && req.method === "POST") {
      const b = await req.json();
      const id = crypto.randomUUID();
      await pg.sql(`insert into auth.users (id, email) values ('${id}', ${b.email ? `'${String(b.email).replace(/'/g, "''")}'` : "null"})`);
      createdUsers++;
      return new Response(JSON.stringify({ id, aud: "authenticated", email: b.email ?? null, phone: b.phone ?? null, user_metadata: b.user_metadata ?? {} }), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.origin === new URL(SUPABASE_URL).origin && url.pathname === "/functions/v1/agent-chat") return await handleChat(req);
    if (url.hostname === "api.telegram.org") {
      const b = await req.json();
      tgSent.push({ chat_id: b.chat_id, text: b.text });
      return new Response(JSON.stringify({ ok: true, result: { message_id: tgSent.length } }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return await double(input as any, init);
  }) as typeof fetch;
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.117.1");
  const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const store = supabaseInboundStore(admin);
  let clock = Date.parse("2026-10-26T18:00:00Z");
  const now = () => clock;
  const iso = () => new Date(clock).toISOString();
  const rpc = (name: string, args: Record<string, unknown>) => admin.rpc(name, args) as unknown as Promise<{ data: any; error: any }>;
  const one = async (q: string) => await pg.sql(q);
  const num = async (q: string) => Number(await pg.sql(q));
  let update = 9000;
  const telegram = async (chat: number, text: string) => {
    const before = tgSent.length;
    const res = await handleTelegram(new Request("https://fn.test/trainee-telegram", {
      method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": TG_SECRET },
      body: JSON.stringify({ update_id: ++update, message: { message_id: update, chat: { id: chat, type: "private" }, from: { id: chat, is_bot: false }, text } }),
    }), { env: Deno.env, now, store: () => store, chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY), deliver: async () => {},
      adapter: (env) => telegramAdapter({ token: env.get("TELEGRAM_BOT_TOKEN") || "", webhookSecret: env.get("TELEGRAM_WEBHOOK_SECRET") || "", sleep: async () => {} }) });
    eq(res.status, 200, `telegram ${text}: ${res.status}`);
    return { body: await res.json(), direct: tgSent.slice(before).map((m) => m.text) };
  };
  // The newest reply queued for a person (replies to a known person ride the outbox; deliver is a no-op here).
  const lastReply = async (user: string) => await one(`select text from public.career_outbox where user_id = '${user}' and kind = 'reply' order by id desc limit 1`);
  const userOf = async (contact: string) => await one(`select coalesce(user_id::text, '') from public.channel_contacts where contact = '${contact}'`);
  const imessage = async (from: string, text: string) => {
    const said: string[] = [];
    const r = await runInbound({ provider: "loopmessage", channel: "imessage", messageId: `lm-${++update}`, kind: "text", contact: from, address: from, phone: from, text }, {
      env: Deno.env, now, store, render: (x) => [x], chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY), deliver: async () => {},
      reply: async (_c, b) => { said.push(...b); return { ok: true }; },
    });
    return { body: r.body, said };
  };

  // Synthetic waitlist: 01..07 in signup order; 03 gave no consent; 06 signed up twice (the earlier row counts).
  await pg.sql(`insert into public.site_waitlist (name, phone, consent, consent_text, consent_at, source, created_at) values
    ('Wave One', '${phone(1)}', true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-10-01T10:00:00Z', 'test', '2026-10-01T10:00:00Z'),
    ('Wave Two', '${phone(2)}', true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-10-01T10:01:00Z', 'test', '2026-10-01T10:01:00Z'),
    ('Wave Three', '${phone(3)}', false, null, null, 'test', '2026-10-01T10:02:00Z'),
    ('Wave Four', '${phone(4)}', true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-10-01T10:03:00Z', 'test', '2026-10-01T10:03:00Z'),
    ('Wave Five', '${phone(5)}', true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-10-01T10:04:00Z', 'test', '2026-10-01T10:04:00Z'),
    ('Wave Six', '${phone(6)}', true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-10-01T10:05:00Z', 'test', '2026-10-01T10:05:00Z'),
    ('Wave Six again', '${phone(6)}', true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-10-02T10:05:00Z', 'test', '2026-10-02T10:05:00Z'),
    ('Wave Seven', '${phone(7)}', true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-10-01T10:06:00Z', 'test', '2026-10-01T10:06:00Z');
    update public.career_wave_policy set first_wave_size = 3, min_sample = 1;`);
  const sent: { phone: string; text: string }[] = [];
  const fakeSend = async (contact: string, bubbles: string[]) => { sent.push({ phone: contact, text: bubbles.join("\n") }); return { ok: true as const, id: `lm-out-${sent.length}` }; };
  const tokenIn = (text: string) => /start=inv_([A-Za-z0-9_-]{32})/.exec(text)?.[1] ?? "";

  await t.step("1. gates before any wave: the first wave is recommended at the policy's first size", async () => {
    const r = await rpc("career_wave_recommendation", { p_now: iso() });
    eq(r.error, null);
    eq([r.data.action, r.data.recommended_size, r.data.eligible_remaining], ["first", 3, 6], JSON.stringify(r.data));
    eq(r.data.gates.find((g: any) => g.gate === "reply_truth").status, "warn", "no reply-truth sample yet is a warning, never a pass");
  });

  let wave1 = 0;
  await t.step("2. opening a wave picks the next 3 consenting numbers in signup order and sends nothing; replays and overlaps refused", async () => {
    const r = await rpc("career_wave_open", { p_size: 3, p_key: "wave-1", p_override_reason: null, p_now: iso() });
    eq(r.error, null, JSON.stringify(r.error));
    wave1 = r.data.wave_id;
    eq(r.data.picked, 3);
    eq(await one(`select string_agg(phone, ',' order by signed_up_at) from public.career_invites where wave_id = ${wave1}`), [phone(1), phone(2), phone(4)].join(","), "signup order; 03 gave no consent");
    eq(await num(`select count(*) from public.career_invites where state = 'ready' and token is not null`), 3);
    eq([sent.length, tgSent.length, await num(`select count(*) from public.career_outbox`)], [0, 0, 0], "opening sends nothing to anyone");
    const again = await rpc("career_wave_open", { p_size: 3, p_key: "wave-1", p_override_reason: null, p_now: iso() });
    eq([again.data?.replayed, again.data?.wave_id], [true, wave1]);
    eq(await num(`select count(*) from public.career_invites`), 3, "the same key opens nothing new");
    const other = await rpc("career_wave_open", { p_size: 2, p_key: "wave-1b", p_override_reason: null, p_now: iso() });
    assert(/wave_in_progress/.test(other.error?.message ?? ""), JSON.stringify(other));
  });

  await t.step("3. approval needs the exact text's hash, STOP wording and the exact count", async () => {
    const sha = await sha256Hex(TEMPLATE);
    const wrongCount = await rpc("career_wave_approve_send", { p_wave: wave1, p_text: TEMPLATE, p_text_sha256: sha, p_count: 4, p_now: iso() });
    assert(/count_mismatch/.test(wrongCount.error?.message ?? ""), JSON.stringify(wrongCount));
    const wrongHash = await rpc("career_wave_approve_send", { p_wave: wave1, p_text: TEMPLATE + " ", p_text_sha256: sha, p_count: 3, p_now: iso() });
    assert(/text_hash_mismatch/.test(wrongHash.error?.message ?? ""), JSON.stringify(wrongHash));
    const noStop = "Trainee: your spot is open: {link}";
    const ns = await rpc("career_wave_approve_send", { p_wave: wave1, p_text: noStop, p_text_sha256: await sha256Hex(noStop), p_count: 3, p_now: iso() });
    assert(/text_must_say_stop/.test(ns.error?.message ?? ""), JSON.stringify(ns));
    eq(await num(`select count(*) from public.career_invites where state = 'approved'`), 0, "a refused approval approves nothing");
    const ok = await rpc("career_wave_approve_send", { p_wave: wave1, p_text: TEMPLATE, p_text_sha256: sha, p_count: 3, p_now: iso() });
    eq([ok.error, ok.data?.approved], [null, 3]);
  });

  await t.step("4. STOP before the send stops that invite; quiet hours send nothing; the send is the approved text with each person's own link", async () => {
    const stop = await imessage(phone(2), "STOP");
    eq(stop.said, [CHANNEL_REPLIES.stop]);
    eq(await one(`select state from public.career_invites where phone = '${phone(2)}'`), "stopped");
    clock = Date.parse("2026-10-26T14:00:00Z"); // 9 am Central, 7 am Pacific
    const quiet = await sendWave({ db: admin, wave: wave1, send: fakeSend, env: Deno.env, now });
    eq([quiet.stoppedBy, quiet.sent, sent.length], ["quiet_hours", 0, 0]);
    clock = Date.parse("2026-10-26T18:05:00Z");
    const r = await sendWave({ db: admin, wave: wave1, send: fakeSend, env: Deno.env, now });
    eq([r.sent, r.failed, r.stoppedBy], [2, 0, null], JSON.stringify(r));
    eq(sent.map((s) => s.phone), [phone(1), phone(4)], "the stopped number got nothing");
    for (const s of sent) {
      const tok = tokenIn(s.text);
      eq(s.text, TEMPLATE.replace("{link}", `https://app.trainee.test/?invite=${tok}`).replace("{telegram}", `https://t.me/trainee_wave_bot?start=inv_${tok}`), "exactly the approved text with this person's links");
      eq(await one(`select state || ',' || (token is null) || ',' || (expires_at = sent_at + interval '14 days') from public.career_invites where token_hash = encode(sha256(convert_to('${tok}', 'UTF8')), 'hex')`), "sent,true,true");
    }
    eq(await one(`select status from public.career_invite_waves where id = ${wave1}`), "sent");
  });

  const tok1 = () => tokenIn(sent[0].text), tok4 = () => tokenIn(sent[1].text);
  let tgUser = "";
  await t.step("5. Telegram's Start with the invite makes the account and the first reply; the sign-up steps record each consent", async () => {
    clock = Date.parse("2026-10-26T19:00:00Z");
    const users = createdUsers;
    const r = await telegram(1001, `/start inv_${tok1()}`);
    eq(createdUsers, users + 1, `one account: ${JSON.stringify(r.body)}`);
    tgUser = await userOf("tg:1001");
    assert(/^[0-9a-f-]{36}$/.test(tgUser), "the chat is linked to the new account");
    eq(await one(`select state || ',' || redeemed_user || ',' || redeemed_via from public.career_invites where phone = '${phone(1)}'`), `redeemed,${tgUser},telegram`);
    eq(await one(`select step from public.career_signup_gate where user_id = '${tgUser}'`), "age");
    eq(await one(`select via || ',' || (waitlist_id is not null) from public.trainee_admissions where user_id = '${tgUser}'`), "waitlist,true", "the account made on Telegram is admitted on the web too");
    eq(await lastReply(tgUser), SIGNUP_AGE_ASK, "the first reply is the 18+ question, through the outbox to this chat");
    eq(await one(`select channel from public.career_outbox where user_id = '${tgUser}' order by id desc limit 1`), "telegram");
    eq(await one(`select string_agg(m.content, '|') from public.agent_messages m join public.agent_threads th on th.id = m.thread_id where th.user_id = '${tgUser}' and m.role = 'user'`), "/start", "the token never reaches the conversation");
    await telegram(1001, "yes");
    eq(await lastReply(tgUser), termsAsk(termsFrom(Deno.env)!));
    await telegram(1001, "I agree");
    eq(await lastReply(tgUser), SIGNUP_DONE);
    eq(await one(`select step from public.career_signup_gate where user_id = '${tgUser}'`), "active");
    eq(await one(`select string_agg(kind || ':' || coalesce(version, '') || ':' || source || ':' || coalesce(channel, ''), ',' order by kind) from public.career_consents where user_id = '${tgUser}'`),
      "age_18_plus:v1:chat:telegram,privacy:2026-10-26:chat:telegram,sms:site_waitlist:site_waitlist:site,terms:2026-10-26:chat:telegram");
    eq(await one(`select text_sha256 from public.career_consents where user_id = '${tgUser}' and kind = 'terms'`), await sha256Hex(termsAsk(termsFrom(Deno.env)!)), "the exact text shown");
    eq(await one(`select message_sha256 from public.career_consents where user_id = '${tgUser}' and kind = 'terms'`), await sha256Hex("I agree"), "the person's own answer");
    eq(await one(`select text_sha256 from public.career_consents where user_id = '${tgUser}' and kind = 'sms'`), await sha256Hex("I agree to receive automated texts from Trainee. Reply STOP to opt out."), "the waitlist's SMS consent, its exact text");
    await telegram(1001, "what can you do?");
    const after = await lastReply(tgUser);
    assert(![SIGNUP_AGE_ASK, SIGNUP_DONE, SIGNUP_UNDER18].includes(after) && after.length > 0, `after sign-up the product answers: ${after}`);
  });

  await t.step("6. the same invite from another chat, or the same chat again: refused, no second account", async () => {
    const users = createdUsers;
    const other = await telegram(1002, `/start inv_${tok1()}`);
    eq(other.direct, [INVITE_REFUSED.used], JSON.stringify(other.body));
    eq([createdUsers, await userOf("tg:1002")], [users, ""], "no account for the second chat");
    const same = await telegram(1001, `/start inv_${tok1()}`);
    eq(same.direct, [INVITE_ALREADY_MEMBER]);
    const forged = await telegram(1003, `/start inv_${"A".repeat(32)}`);
    eq(forged.direct, [INVITE_REFUSED.invalid]);
    eq(createdUsers, users);
    eq(await num(`select count(*) from public.career_invites where redeemed_user is not null`), 1);
  });

  await t.step("7. the web: the first message with the invite redeems it as the signed-in person; under 18 is blocked", async () => {
    const web = handler.chat("tok-wave-web");
    const bad = await web.say("hi", { invite: "B".repeat(32) });
    eq([bad.status, bad.reply], [200, INVITE_REFUSED.invalid]);
    eq(await num(`select count(*) from public.career_signup_gate where user_id = '${WEB}'`), 0, "an invalid token starts nothing");
    const first = await web.say("hi", { invite: tok4() });
    eq([first.status, first.reply, first.intent], [200, SIGNUP_AGE_ASK, "career_signup_age"]);
    eq(await one(`select state || ',' || redeemed_user || ',' || redeemed_via from public.career_invites where phone = '${phone(4)}'`), `redeemed,${WEB},web`);
    const minor = await web.say("I'm 16");
    eq(minor.reply, SIGNUP_UNDER18);
    eq(await one(`select step || ',' || age_answer from public.career_signup_gate where user_id = '${WEB}'`), "under18_blocked,I'm 16");
    const more = await web.say("find me software jobs in Chicago");
    eq([more.reply, more.intent], [SIGNUP_UNDER18, "career_signup_blocked"], "nothing else runs for a blocked account");
    eq(await num(`select count(*) from public.career_consents where user_id = '${WEB}' and kind in ('age_18_plus', 'terms', 'privacy')`), 0, "no adult or terms consent recorded");
    const reuse = await handler.chat("tok-wave-web").say("hi", { invite: tok4() });
    eq(reuse.reply, SIGNUP_UNDER18, "the same person again stays blocked");
    // STOP is never held behind the sign-up steps: "stop everything" reaches the account controls and quiets the account.
    eq(await one(`select public.career_user_quiet('${WEB}')::text`), "false");
    const stop = await handler.chat("tok-wave-web").say("stop everything");
    assert(stop.status === 200 && stop.reply !== SIGNUP_UNDER18, stop.reply);
    eq(await one(`select public.career_user_quiet('${WEB}')::text`), "true", `the account is quiet after "stop everything": ${stop.reply}`);
  });

  await t.step("8. an expired invite is refused and makes no account; a first text from an invited number makes the account", async () => {
    clock = Date.parse("2026-10-26T19:30:00Z");
    const w2 = await rpc("career_wave_open", { p_size: 2, p_key: "wave-2", p_override_reason: null, p_now: iso() });
    eq([w2.error, w2.data?.picked], [null, 2], JSON.stringify(w2));
    eq(w2.data.recommendation.action, "hold", "a warning gate holds the size (the 24-hour completion window has not passed)");
    eq(await one(`select string_agg(phone, ',' order by signed_up_at) from public.career_invites where wave_id = ${w2.data.wave_id}`), [phone(5), phone(6)].join(","), "06 once, by its earlier signup");
    const ok = await rpc("career_wave_approve_send", { p_wave: w2.data.wave_id, p_text: TEMPLATE, p_text_sha256: await sha256Hex(TEMPLATE), p_count: 2, p_now: iso() });
    eq(ok.error, null);
    const before = sent.length;
    eq((await sendWave({ db: admin, wave: w2.data.wave_id, send: fakeSend, env: Deno.env, now })).sent, 2);
    const tok5 = tokenIn(sent[before].text);
    // 06 texts the Trainee number from the invited phone: the account is made and the first reply is the 18+ question.
    const users = createdUsers;
    const six = await imessage(phone(6), "hello, I got your invite");
    eq(createdUsers, users + 1, JSON.stringify(six.body));
    const sixUser = await userOf(phone(6));
    eq(await one(`select state || ',' || redeemed_via from public.career_invites where phone = '${phone(6)}'`), "redeemed,imessage");
    eq(await lastReply(sixUser), SIGNUP_AGE_ASK);
    // A number that was never invited is still refused (the allow-list fallback is empty).
    const stranger = await imessage("+13125559999", "hi");
    eq(stranger.said, ["Trainee is invite-only right now, so I can't set you up yet. Nothing about you was saved except that you texted."]);
    eq(createdUsers, users + 1);
    clock += 15 * 24 * 3600 * 1000;
    const late = await telegram(1005, `/start inv_${tok5}`);
    eq(late.direct, [INVITE_REFUSED.expired]);
    eq([createdUsers, await userOf("tg:1005")], [users + 1, ""], "no account from an expired invite");
    eq(await one(`select state from public.career_invites where phone = '${phone(5)}'`), "expired");
  });

  await t.step("9. STOP stops everything for that person: opted out on every channel, the account quiet, unredeemed invites stopped", async () => {
    // 07 is invited in a third wave (opened past the failing completion gate with a reason, as the owner can), then
    // texts STOP from their number before anything is sent: the invite is stopped and there is nothing left to approve.
    const w3 = await rpc("career_wave_open", { p_size: 1, p_key: "wave-3", p_override_reason: "test: after the 15-day jump the gates are recomputed", p_now: iso() });
    eq([w3.error, w3.data?.picked], [null, 1], JSON.stringify(w3));
    eq(await one(`select phone || ',' || state from public.career_invites where wave_id = ${w3.data.wave_id}`), `${phone(7)},ready`);
    await imessage(phone(7), "stop");
    eq(await one(`select state || ',' || (token is null) from public.career_invites where phone = '${phone(7)}'`), "stopped,true");
    const sha = await sha256Hex(TEMPLATE);
    const ap = await rpc("career_wave_approve_send", { p_wave: w3.data.wave_id, p_text: TEMPLATE, p_text_sha256: sha, p_count: 0, p_now: iso() });
    eq([ap.error, ap.data?.approved], [null, 0], "nothing left to approve");
    eq(await one(`select status from public.career_invite_waves where id = ${w3.data.wave_id}`), "sent", "a wave with nothing left to send is done");
    // The Telegram person: STOP opts them out and quiets the account for every rail.
    const r = await telegram(1001, "/stop");
    eq(r.direct, [CHANNEL_REPLIES.stop]);
    eq(await one(`select public.channel_opted_out('tg:1001')::text || ',' || public.career_user_quiet('${tgUser}')::text`), "true,true");
    const elig = await one(`select count(*) from public.career_wave_eligible() where phone in ('${phone(1)}', '${phone(2)}', '${phone(7)}')`);
    eq(elig, "0", "no stopped or redeemed number is ever picked again");
  });

  await t.step("10. the web gate on the same invites: not admitted without one; the invite link's token admits and the sign-up begins", async () => {
    Deno.env.set("TRAINEE_WEB_SIGNUP", "invite");
    try {
      const w2 = () => handler.chat("tok-wave-web2");
      const no = await w2().say("hi");
      eq([no.status, no.reply], [403, NOT_INVITED_REPLY]);
      eq(await num(`select count(*) from public.trainee_admissions where user_id = '${WEB2}'`) + await num(`select count(*) from public.agent_threads where user_id = '${WEB2}'`), 0, "no admission, no turn");
      const forged = await w2().say("hi", { invite: "C".repeat(32) });
      eq([forged.status, forged.reply], [403, INVITE_REFUSED.invalid]);
      const used = await w2().say("hi", { invite: tok4() });
      eq([used.status, used.reply], [403, INVITE_REFUSED.used], "someone else's invite admits nobody");
      // The owner's next wave: 08 joins the waitlist and is invited and sent, as above.
      await pg.sql(`insert into public.site_waitlist (name, phone, consent, consent_text, consent_at, source, created_at) values
        ('Wave Eight', '${phone(8)}', true, 'I agree to receive automated texts from Trainee. Reply STOP to opt out.', '2026-10-01T10:07:00Z', 'test', '2026-10-01T10:07:00Z')`);
      // The sender closes a wave while a gate fails; here sign-up completion fails (wave 2: 0 of 2 finished), so the
      // invited people finish it first, as a healthy cohort would.
      eq((await rpc("career_wave_recommendation", { p_now: iso() })).data.status, "fail");
      await pg.sql(`update public.career_signup_gate set step = 'active' where step in ('age', 'terms')`);
      eq((await rpc("career_wave_recommendation", { p_now: iso() })).data.status === "fail", false);
      const w4 = await rpc("career_wave_open", { p_size: 1, p_key: "wave-4", p_override_reason: "test: the web gate", p_now: iso() });
      eq([w4.error, w4.data?.picked], [null, 1], JSON.stringify(w4));
      eq((await rpc("career_wave_approve_send", { p_wave: w4.data.wave_id, p_text: TEMPLATE, p_text_sha256: await sha256Hex(TEMPLATE), p_count: 1, p_now: iso() })).error, null);
      const before = sent.length;
      eq((await sendWave({ db: admin, wave: w4.data.wave_id, send: fakeSend, env: Deno.env, now })).sent, 1);
      const tok8 = tokenIn(sent[before].text);
      const ok = await w2().say("hi", { invite: tok8 });
      eq([ok.status, ok.reply], [200, SIGNUP_AGE_ASK], JSON.stringify(ok.body));
      eq(await one(`select via || ',' || (waitlist_id is not null) from public.trainee_admissions where user_id = '${WEB2}'`), "waitlist,true", "admitted via the waitlist, by the invite");
      eq(await one(`select state || ',' || redeemed_user || ',' || redeemed_via from public.career_invites where phone = '${phone(8)}'`), `redeemed,${WEB2},web`);
      const next = await w2().say("hi");
      eq([next.status, next.reply], [200, SIGNUP_AGE_AGAIN], "admitted now, without the token; the sign-up step is asked again");
      const first = await handler.chat("tok-wave-web").say("hi");
      eq(first.status, 200, "an account that came in by an invite earlier is admitted by it");
      eq(await one(`select via from public.trainee_admissions where user_id = '${WEB}'`), "waitlist");
    } finally { Deno.env.delete("TRAINEE_WEB_SIGNUP"); }
  });

  handler.restore();
  globalThis.fetch = handler.double.fetch as typeof fetch;
  await pg.stop();
} });
