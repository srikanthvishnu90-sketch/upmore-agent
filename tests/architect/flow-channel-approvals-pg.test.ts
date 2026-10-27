// One approval model on every channel (2026-10-26; three-channel readiness E-3, E-5, E-12, E-15), end to end on a real
// Postgres 16 through each channel's own webhook, composed exactly as its index.ts composes it:
//   iMessage  supabase/functions/trainee-inbound/handler.ts handleInbound   (LoopMessage)
//   WhatsApp  supabase/functions/trainee-whatsapp/handler.ts handleWhatsApp (Meta's Cloud API, HMAC-signed)
//   Telegram  supabase/functions/trainee-telegram/handler.ts handleTelegram (Bot API, secret header)
// with agent-chat's real handler reached through the real chatThroughAgent fetch and every reply sent through the outbox
// by the real deliverer. Each webhook body is the provider's own documented example with only the identifying values
// changed (tests/fixtures/channels/*.json; sources below). What each step asserts is state: auth.users, channel_contacts,
// channel_inbound, career_apply_cards (its code, misses, state, how it was answered), career_apply_jobs (one row per
// approved item, its approval hash the hash the card showed), career_outbox, and the exact requests each provider got;
// and that every reply says only what that state shows and names only what that channel has.
//
// The chain for a messy brand-new person on each channel:
//   1. a first message in their own words: an account, their contact, the reply delivered to them
//   2. a resume on file and two applications their computer prepared (SETUP, disclosed: the confirmed-resume rows and
//      the dry run's career_apply_prepared rows are written here, as tests/flow/resume-seed.ts and the db tests do; the
//      engine's dry run is tests/architect/flow-telegram-e2e.test.ts's subject, not this one's)
//   3. "Show my applications!": the card, its last line naming its own code; buttons only where the channel sends them
//   4. a bare "yes": nothing approved; the reply names only gestures that exist on this channel
//   5. a wrong code, another person's code, a payload changed since the card, a card older than 10 minutes: nothing
//   6. "Yes, <code> but not 2": exactly item 1 queued, by the shown hash; the card answered once, by code
//   7. the same again, and the provider's retry of the same webhook: nothing more
//   8. a newer card: the old code is out of date; the channel's own gesture approves the new one (Telegram and WhatsApp:
//      the button; iMessage: the code)
//   9. the provider gets its 200 before the turn runs, and a retry while it runs is a duplicate (E-15)
// Telegram also: a "yes" in reply to a text whose Telegram message_id equals the card message's agent_messages.id
// approves nothing (E-15's id collision). iMessage also: the documented `sender` field (Trainee's own sender id) is never
// read as the person; a reaction runs nothing; a file with no text is answered, never silence.
//
// Fixture sources (read 2026-10-26):
//   whatsapp-text.json            https://developers.facebook.com/documentation/business-messaging/whatsapp/webhooks/overview/
//   whatsapp-button-reply.json    https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/interactive-reply-buttons-messages
//   whatsapp-send-text-response.json  https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/text-messages
//   loopmessage-inbound.json, loopmessage-reaction.json  https://loopmessage.com/apidocs/conversation-api-webhooks
//   Telegram: https://core.telegram.org/bots/api gives field tables, not example JSON; the updates below are built from
//   those fields (update_id; message.message_id, from, chat {id, type}, date, text, reply_to_message; callback_query).
// Seams, disclosed: the HTTP hop to Supabase (tests/flow/postgrest.ts over the real Postgres, as every flow test), and
// the three providers' APIs answered here (each request recorded). Any other host fails the test. No model is called.
import assertNode from "node:assert/strict";
import { pgBinDir, startPg } from "../flow/pg.ts";
import { careerHandler, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../flow/handler.ts";
import { handleTelegram } from "../../supabase/functions/trainee-telegram/handler.ts";
import { handleWhatsApp } from "../../supabase/functions/trainee-whatsapp/handler.ts";
import { handleInbound } from "../../supabase/functions/trainee-inbound/handler.ts";
import { chatThroughAgent, deliverer } from "../../supabase/functions/_shared/channel_runtime.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";
import { loopSend } from "../../supabase/functions/_shared/loopmessage.ts";
import { whatsappSignature } from "../../supabase/functions/_shared/whatsapp.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const CI = Deno.env.get("CI") === "true";
const fixture = (name: string) => JSON.parse(Deno.readTextFileSync(`${ROOT}/tests/fixtures/channels/${name}`));

const TG_TOKEN = "123456:TEST-bot-token-not-real", TG_SECRET = "TEST_webhook_secret_0123456789_abcdefghij";
const WA_TOKEN = "TEST-wa-token", WA_SECRET = "TEST-wa-app-secret-0123456789", WA_VERIFY = "TEST-wa-verify-token-0123456789-abcdef";
const WA_PNID = "106540352242922"; // the fixture's metadata.phone_number_id
const LM_KEY = "TEST-loopmessage-key", LM_SECRET = "TEST-inbound-secret-0123456789-abcdefghij", LM_SENDER = "a1b2c3d4-0000-4000-8000-trainee00001";
type Ch = "imessage" | "whatsapp" | "telegram";
const PEOPLE: Record<Ch, { a: string; b: string }> = {
  imessage: { a: "+13231112233", b: "+13231114455" }, // a: the fixture's own contact
  whatsapp: { a: "16505551234", b: "16505559876" }, // a: the fixture's own wa_id
  telegram: { a: "700000301", b: "700000302" },
};
// The resume file the prepared payloads bind (its sha256), stored as the person's upload.
const RESUME = new TextEncoder().encode("%PDF-1.4\n% TEST resume of Alex Testcase (synthetic)\n%%EOF\n");
const RESUME_SHA = [...new Uint8Array(await crypto.subtle.digest("SHA-256", RESUME))].map((x) => x.toString(16).padStart(2, "0")).join("");
const contactKey = (ch: Ch, who: string) => (ch === "imessage" ? who : ch === "whatsapp" ? `wa:${who}` : `tg:${who}`);

Deno.test({
  name: "one approval model, end to end on iMessage, WhatsApp and Telegram: the card's code, the channel's buttons, nothing else approves",
  sanitizeResources: false,
  sanitizeOps: false,
  async fn(t) {
    if (!pgBinDir()) {
      if (CI) throw Error("the channel approval flow needs Postgres 16 binaries in CI");
      console.log("NOT_RUN locally: no Postgres binaries");
      return;
    }
    const pg = await startPg();
    let agentChat: Awaited<ReturnType<typeof careerHandler>> | null = null;
    const keys = ["TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "WHATSAPP_TOKEN", "WHATSAPP_PHONE_NUMBER_ID", "WHATSAPP_APP_SECRET", "WHATSAPP_VERIFY_TOKEN",
      "LOOPMESSAGE_API_KEY", "TRAINEE_INBOUND_SECRET", "TRAINEE_ALLOWED_CONTACTS", "TRAINEE_SIGNUP"];
    const envBefore = new Map(keys.map((k) => [k, Deno.env.get(k)]));
    const realFetch = globalThis.fetch;
    try {
      await supabaseParity(pg);
      agentChat = await careerHandler(pg, {});
      const { handleChat } = await import("../../supabase/functions/agent-chat/handler-career.ts");
      Deno.env.set("TELEGRAM_BOT_TOKEN", TG_TOKEN); Deno.env.set("TELEGRAM_WEBHOOK_SECRET", TG_SECRET);
      Deno.env.set("WHATSAPP_TOKEN", WA_TOKEN); Deno.env.set("WHATSAPP_PHONE_NUMBER_ID", WA_PNID); Deno.env.set("WHATSAPP_APP_SECRET", WA_SECRET); Deno.env.set("WHATSAPP_VERIFY_TOKEN", WA_VERIFY);
      Deno.env.set("LOOPMESSAGE_API_KEY", LM_KEY); Deno.env.set("TRAINEE_INBOUND_SECRET", LM_SECRET);
      Deno.env.delete("TRAINEE_SIGNUP");
      Deno.env.set("TRAINEE_ALLOWED_CONTACTS", [PEOPLE.imessage.a, PEOPLE.imessage.b, `whatsapp:${PEOPLE.whatsapp.a}`, `whatsapp:${PEOPLE.whatsapp.b}`,
        `telegram:${PEOPLE.telegram.a}`, `telegram:${PEOPLE.telegram.b}`].join(","));

      // ---- the three providers, answered here; every request recorded as what that person received
      type Wire = { ch: Ch; to: string; text: string; buttons: { text: string; data: string }[]; raw: any; id: string };
      const wire: Wire[] = [];
      const outbound: string[] = [];
      let tgNext = 5000, tgForce: number | null = null, waNext = 1, lmNext = 1;
      const double = globalThis.fetch;
      globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const req = input instanceof Request && !init ? input : new Request(input as any, init);
        const u = new URL(req.url);
        if (u.origin === new URL(SUPABASE_URL).origin && u.pathname === "/functions/v1/agent-chat") return await handleChat(req);
        if (u.origin === new URL(SUPABASE_URL).origin || u.hostname === "127.0.0.1") return double(req);
        outbound.push(`${req.method} ${u.origin}${u.pathname.replace(TG_TOKEN, "<token>")}`);
        if (u.hostname === "api.telegram.org") {
          const method = u.pathname.split("/").pop();
          const body = await req.json().catch(() => ({}));
          if (method === "sendMessage") {
            const id = tgForce ?? tgNext++; tgForce = null;
            wire.push({ ch: "telegram", to: String(body.chat_id), text: body.text, raw: body, id: String(id),
              buttons: (body.reply_markup?.inline_keyboard ?? []).flat().map((b: any) => ({ text: b.text, data: b.callback_data })) });
            return Response.json({ ok: true, result: { message_id: id, chat: { id: body.chat_id, type: "private" }, date: 1, text: body.text } });
          }
          if (method === "answerCallbackQuery" || method === "sendChatAction") { wire.push({ ch: "telegram", to: "callback", text: String(body.text ?? ""), raw: body, id: "", buttons: [] }); return Response.json({ ok: true, result: true }); }
          return Response.json({ ok: false, error_code: 400, description: `unexpected ${method}` }, { status: 400 });
        }
        if (u.hostname === "graph.facebook.com" && req.method === "POST" && u.pathname.endsWith(`/${WA_PNID}/messages`)) {
          const body = await req.json();
          assert(req.headers.get("authorization") === `Bearer ${WA_TOKEN}`, "WhatsApp: the bearer token");
          const id = `wamid.TEST${String(waNext++).padStart(6, "0")}`;
          const text = body.type === "text" ? body.text.body : body.type === "interactive" ? body.interactive.body.text : JSON.stringify(body);
          wire.push({ ch: "whatsapp", to: String(body.to ?? body.recipient), text, raw: body, id,
            buttons: body.type === "interactive" ? body.interactive.action.buttons.map((b: any) => ({ text: b.reply.title, data: b.reply.id })) : [] });
          const ok = fixture("whatsapp-send-text-response.json");
          ok.contacts[0] = { input: String(body.to), wa_id: String(body.to) };
          ok.messages[0].id = id;
          return Response.json(ok);
        }
        if (u.hostname === "a.loopmessage.com" && req.method === "POST" && u.pathname === "/api/v1/message/send/") {
          const body = await req.json();
          assert(req.headers.get("authorization") === LM_KEY, "LoopMessage: the API key in Authorization");
          const id = `LM-OUT-${lmNext++}`;
          wire.push({ ch: "imessage", to: body.contact, text: body.text, raw: body, id, buttons: [] });
          return Response.json({ success: true, message_id: id, contact: body.contact, text: body.text });
        }
        return Promise.reject(new Error(`the channel test reaches no real host: ${u.href}`));
      }) as typeof fetch;
      const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.117.1");
      const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
      const q1 = async (sql: string) => await pg.sql(sql);
      const json = async (sql: string) => JSON.parse((await q1(sql)) || "null");

      // ---- each webhook, composed as its index.ts composes it
      let seq = 0;
      const deferred: Promise<unknown>[] = [];
      type Post = { status: number; body: any; id: string };
      const post = async (ch: Ch, who: string, o: { text?: string; replyTo?: string; id?: string; raw?: any; tap?: { data: string; messageId: string }; defer?: boolean }): Promise<Post> => {
        const id = o.id ?? `${ch}-${++seq}`;
        const defer = o.defer ? { defer: (p: Promise<unknown>) => { deferred.push(p); } } : {};
        if (ch === "telegram") {
          const n = Number(id.replace(/\D/g, "")) || ++seq;
          const update = o.raw ?? (o.tap
            ? { update_id: n, callback_query: { id: `cbq-${n}`, from: { id: Number(who), is_bot: false, first_name: "TEST" }, message: { message_id: Number(o.tap.messageId), chat: { id: Number(who), type: "private" }, date: 1 }, data: o.tap.data } }
            : { update_id: n, message: { message_id: 100 + n, from: { id: Number(who), is_bot: false, first_name: "TEST" }, chat: { id: Number(who), type: "private" }, date: 1, text: o.text,
              ...(o.replyTo ? { reply_to_message: { message_id: Number(o.replyTo), chat: { id: Number(who), type: "private" }, date: 1 } } : {}) } });
          const deliverNow = deliverer(admin, Deno.env);
          const res = await handleTelegram(new Request(`${SUPABASE_URL}/functions/v1/trainee-telegram`, {
            method: "POST", headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": TG_SECRET }, body: JSON.stringify(update),
          }), { env: Deno.env, now: Date.now, store: () => supabaseInboundStore(admin), chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY), admin,
            deliver: (a) => deliverNow({ userId: a.userId, key: a.key, now: a.now }), ...defer } as any);
          return { status: res.status, body: await res.json(), id };
        }
        if (ch === "whatsapp") {
          const b = o.raw ?? (() => {
            const f = o.tap ? fixture("whatsapp-button-reply.json") : fixture("whatsapp-text.json");
            const v = f.entry[0].changes[0].value, m = v.messages[0];
            v.contacts[0].wa_id = who; m.from = who; m.id = `wamid.IN.${id}`;
            if (o.tap) { m.context.id = o.tap.messageId; m.interactive.button_reply = { id: o.tap.data, title: "Approve" }; }
            else { m.text.body = o.text; if (o.replyTo) m.context = { from: "15550783881", id: o.replyTo }; }
            return f;
          })();
          const raw = new TextEncoder().encode(JSON.stringify(b));
          const deliverNow = deliverer(admin, Deno.env);
          const res = await handleWhatsApp(new Request(`${SUPABASE_URL}/functions/v1/trainee-whatsapp`, {
            method: "POST", headers: { "content-type": "application/json", "x-hub-signature-256": await whatsappSignature(WA_SECRET, raw) }, body: raw,
          }), { env: Deno.env, now: Date.now, store: () => supabaseInboundStore(admin), chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY), admin,
            deliver: (a) => deliverNow({ userId: a.userId, key: a.key, now: a.now, wholeUser: true }), ...defer } as any);
          return { status: res.status, body: await res.json(), id: `wamid.IN.${id}` };
        }
        const b = o.raw ?? Object.assign(fixture("loopmessage-inbound.json"), { contact: who, text: o.text, message_id: `LM-IN-${id}`, webhook_id: `LM-WH-${id}`, sender: LM_SENDER },
          o.replyTo ? { thread: { thread_id: `TH-${id}`, initial_message_id: o.replyTo } } : {});
        const deliverNow = deliverer(admin, Deno.env);
        const res = await handleInbound(new Request(`${SUPABASE_URL}/functions/v1/trainee-inbound?secret=${LM_SECRET}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) }), {
          env: Deno.env, now: Date.now, store: () => supabaseInboundStore(admin), send: (apiKey: string) => loopSend({ apiKey, sleep: async () => {} }),
          chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY), deliverReply: (a: any) => deliverNow({ userId: a.userId, key: a.key, now: a.now }), ...defer,
        } as any);
        return { status: res.status, body: await res.json(), id: String(b.message_id) };
      };
      // What one person received on their channel since a mark.
      const addr = (ch: Ch, who: string) => (ch === "whatsapp" ? who : who);
      const got = (ch: Ch, who: string, since: number) => wire.slice(since).filter((w) => w.ch === ch && (w.to === addr(ch, who) || w.to === `+${who}`));
      const say = async (ch: Ch, who: string, text: string, extra: { replyTo?: string } = {}) => {
        const mark = wire.length;
        const r = await post(ch, who, { text, ...extra });
        eq(r.status, 200, JSON.stringify(r.body));
        const out = got(ch, who, mark);
        assert(out.length >= 1, `${ch}: Trainee answered "${text}": ${JSON.stringify(r.body)}`);
        // iMessage sends a bare link as its own bubble (its preview card; conversation.ts toBubbles), the label before it:
        // read back as one line, "label: link", so one assertion serves every channel.
        const reply = out.map((w) => w.text).join("\n\n").replace(/:?\n\n(https?:\/\/\S+)/g, (_m, u) => `: ${u}`).replace(/\) : (https?:)/g, ") $1").replace(/\): (https?:)/g, ") $1");
        return { reply, out, post: r };
      };
      // The inspect link, opened as a phone would (trainee-inspect/handler.ts handleInspect over the same database).
      const { handleInspect, supabaseInspectDeps } = await import("../../supabase/functions/trainee-inspect/handler.ts");
      const inspect = async (url: string) => {
        const res = await handleInspect(new Request(url), { now: Date.now, ...supabaseInspectDeps(admin) });
        const bytes = new Uint8Array(await res.arrayBuffer());
        return { status: res.status, text: new TextDecoder().decode(bytes), bytes, type: res.headers.get("content-type") };
      };
      const sha = async (b: Uint8Array) => [...new Uint8Array(await crypto.subtle.digest("SHA-256", b as BufferSource))].map((x) => x.toString(16).padStart(2, "0")).join("");
      const personOf = async (ch: Ch, who: string) => await q1(`select coalesce(user_id::text, '') from public.channel_contacts where contact = '${contactKey(ch, who)}'`);
      const jobs = async (u: string) => await json(`select coalesce(json_agg(row_to_json(j) order by j.created_at), '[]') from public.career_apply_jobs j where user_id = '${u}'`);
      const openCard = async (u: string) => await json(`select row_to_json(c) from public.career_apply_cards c where user_id = '${u}' and state = 'open'`);
      // SETUP (disclosed above): a confirmed resume on file, and applications the person's computer prepared.
      const seed = async (u: string, ch: Ch, ns: number[]) => {
        const ev = `seed-resume-${u.slice(-12)}`;
        if ((await q1(`select count(*) from public.career_events where user_id = '${u}' and kind = 'fact_confirmed'`)) === "0") {
          await q1(`with th as (insert into public.agent_threads (user_id, title) values ('${u}', 'TEST seeded resume') returning id)
            insert into public.agent_flow_state (thread_id, user_id, state, updated_at) select id, '${u}',
              '{"career":{"stores":{"profile":{"facts":[{"id":"seed-resume","kind":"experience","status":"confirmed","needs_confirmation":false,"confirmation_event_id":"${ev}","text":"TEST Analyst, TEST Co"}]}}}}',
              now() - interval '30 days' from th;
            insert into public.career_events (user_id, kind, subject, detail) values ('${u}', 'fact_confirmed', 'TEST Analyst, TEST Co', '{"confirmation_event_id":"${ev}"}');
            insert into public.career_watch_kv (user_id, key, value) values ('${u}', 'career:account', '{"epoch":0,"version":0,"paused":false}') on conflict do nothing;
            insert into public.career_resume_uploads (user_id, channel, provider_ref, filename, mime, bytes, sha256, content_b64, message_sha256)
              values ('${u}', '${ch}', 'TEST:resume', 'Alex_Testcase_Resume.pdf', 'application/pdf', ${RESUME.length}, '${RESUME_SHA}', '${btoa(String.fromCharCode(...RESUME))}', repeat('c', 64));`);
        }
        for (const n of ns) {
          await q1(`with a as (select coalesce((value->>'epoch')::bigint, 0) e, coalesce((value->>'version')::bigint, 0) v from public.career_watch_kv where user_id = '${u}' and key = 'career:account'),
            pl as (select jsonb_build_object('version', 1, 'user_id', '${u}', 'job_id', 'TEST-${ch}-${n}', 'company', 'TEST ${ch} Employer ${n}', 'url', 'https://jobs.lever.co/test${n}/1',
              'fields', '[{"name":"name","label":"Full name","value":"Alex Testcase"},{"name":"email","label":"Email","value":"alex.testcase@example.test"},{"name":"why","label":"Why this team?","value":"TEST answer ${n}"}]'::jsonb,
              'privacy_epoch', a.e, 'account_version', a.v, 'expires_at', now() + interval '1 day', 'resume_sha256', '${RESUME_SHA}') p from a)
            insert into public.career_apply_prepared (user_id, job_id, company, url, payload, payload_hash, card_lines)
            select '${u}', 'TEST-${ch}-${n}', 'TEST ${ch} Employer ${n}', 'https://jobs.lever.co/test${n}/1', p, public.career_apply_payload_hash(p),
              array['TEST ${ch} Employer ${n}: Analyst (TEST)', 'Full name: Alex Testcase', 'Email: alex.testcase@example.test', 'Why this team?: TEST answer ${n}', 'Resume: the file with sha256 ${RESUME_SHA.slice(0, 12)}'] from pl`);
        }
      };
      const preparedHash = async (u: string, ch: Ch, n: number) => await q1(`select payload_hash from public.career_apply_prepared where user_id = '${u}' and job_id = 'TEST-${ch}-${n}'`);

      for (const ch of ["imessage", "whatsapp", "telegram"] as Ch[]) {
        const A = PEOPLE[ch].a, B = PEOPLE[ch].b;
        let a = "", b = "", card: any = null, cardWire: Wire[] = [];
        await t.step(`${ch} 1. a messy first message: an account for this contact, the answer delivered to them`, async () => {
          const r = await say(ch, A, "heyy, can u help me find an internship??");
          a = await personOf(ch, A);
          assert(/^[0-9a-f-]{36}$/.test(a), `${ch}: an account for the contact: ${a}`);
          eq(await q1(`select count(*) from public.channel_contacts where user_id = '${a}'`), "1");
          eq(await q1(`select string_agg(status, ',') from public.career_outbox where user_id = '${a}'`), "delivered", "the one reply, delivered");
          assert(r.out.every((w) => w.to === addr(ch, A) || w.to === `+${A}`), "to this person only");
        });
        if (ch === "imessage") {
          await t.step("imessage 1b. the documented payload: `sender` (Trainee's own sender id) is never the person; a reaction runs nothing; a file is answered", async () => {
            eq(await q1(`select count(*) from public.channel_contacts where contact like '%${LM_SENDER.slice(0, 8)}%'`), "0", "no contact made from the sender id");
            const mark = wire.length, before = await q1(`select count(*) from public.career_outbox where user_id = '${a}'`);
            const react = await post("imessage", A, { raw: Object.assign(fixture("loopmessage-reaction.json"), { contact: A, message_id: "LM-REACT-1", webhook_id: "LM-WH-REACT-1" }) });
            eq(react.status, 200);
            eq([wire.length - mark, await q1(`select count(*) from public.career_outbox where user_id = '${a}'`)], [0, before], `a "like" runs no turn and sends nothing: ${JSON.stringify(react.body)}`);
            const file = await post("imessage", A, { raw: Object.assign(fixture("loopmessage-inbound.json"), { contact: A, text: "", message_type: "attachments", attachments: ["https://cdn.loopmessage.test/resume.pdf"], message_id: "LM-FILE-1", webhook_id: "LM-WH-FILE-1", sender: LM_SENDER }) });
            eq(file.status, 200);
            const said = got("imessage", A, mark);
            assert(said.length === 1 && /can't open files sent here yet/.test(said[0].text), `a file gets an answer, never silence: ${JSON.stringify(file.body)} ${JSON.stringify(said)}`);
          });
        }
        await t.step(`${ch} 2-3. "Show my applications!": one application per ask, saying what happens, to whom, that it can't be undone, links to the exact answers and resume, and "YES <code>"`, async () => {
          await seed(a, ch, [1, 2]);
          const mark = wire.length;
          const r = await say(ch, A, "Show my applications!");
          card = await openCard(a);
          assert(card && /^[0-9]{4}$/.test(String(card.approve_code)) && /^[0-9a-f]{32}$/.test(String(card.inspect_token)), `${ch}: the open card carries a 4-digit code and an inspect token: ${JSON.stringify(card)}`);
          eq(card.items.map((i: any) => i.payload_hash), [await preparedHash(a, ch, 1)], "one application per card, bound by its payload hash");
          const base = `${SUPABASE_URL}/functions/v1/trainee-inspect?t=${card.inspect_token}`;
          for (const w of [`Ready to submit your application to TEST ${ch} Employer 1 (jobs.lever.co).`, "Full name: Alex Testcase", "Why this team?: TEST answer 1",
            `Review the exact answers: ${base}`, `Review the exact resume file: ${base}&f=resume`, `Once it's submitted, TEST ${ch} Employer 1 keeps a copy: withdrawing it later doesn't erase it.`,
            `Reply "YES ${card.approve_code}" to submit it, or "no" to skip it.`]) assert(r.reply.includes(w), `${ch}: the ask says "${w}":\n${r.reply}`);
          assert(!r.reply.includes("Employer 2") && !/\[\[|tap Approve|tap the card|yes but not/i.test(r.reply), `never two asks in one message, no slot left: ${r.reply}`);
          cardWire = got(ch, A, mark);
          const buttons = cardWire.flatMap((w) => w.buttons);
          if (ch === "imessage") eq(buttons, [], "iMessage: no buttons");
          else {
            eq(buttons.map((x) => x.text), ["Approve", "Decline"], `${ch}: Approve and Decline sent under the card`);
            assert(buttons.every((x) => new RegExp(`^tc[ad]:${card.id}:[0-9a-f]{16}$`).test(x.data)), JSON.stringify(buttons));
          }
          if (ch === "whatsapp") {
            const inter = cardWire.find((w) => w.raw.type === "interactive")!;
            eq([inter.raw.interactive.type, inter.raw.interactive.action.buttons.length], ["button", 2]);
            assert(inter.raw.interactive.body.text.length <= 1024 && inter.raw.interactive.action.buttons.every((x: any) => x.type === "reply" && x.reply.title.length <= 20 && x.reply.id.length <= 256), "Meta's limits");
          }
          eq(await q1(`select count(*) from public.career_outbox where user_id = '${a}' and card_id = '${card.id}' and status = 'delivered'`), "1", "the outbox row that carried it is recorded against the card");
          // The inspect links open exactly what the card binds: the answers page hashes to the card's hash, the resume file to the payload's.
          const page = await inspect(`${base}`);
          eq(page.status, 200);
          assert(page.text.includes(`Check: it hashes to ${card.items[0].payload_hash}, the hash on the card.`) && page.text.includes("- Full name: Alex Testcase") && page.text.includes("- Why this team?: TEST answer 1"), page.text);
          const file = await inspect(`${base}&f=resume`);
          eq([file.status, await sha(file.bytes)], [200, RESUME_SHA], "the resume link is the exact file, byte for byte");
        });
        await t.step(`${ch} 4. a bare "yes": nothing approved; the reply names only what this channel has`, async () => {
          const r = await say(ch, A, "yes");
          assert(/^Nothing was approved\./.test(r.reply) && r.reply.includes("YES and the 4-digit code at the end of the card"), `${ch}: ${r.reply}`);
          if (ch === "imessage") assert(!/tap|button|press and hold|reply directly|in the app/i.test(r.reply), `iMessage has no button and no verified reply: ${r.reply}`);
          else assert(/tap Approve under the card/.test(r.reply) && !/in the app/.test(r.reply), `${ch}: ${r.reply}`);
          eq([(await jobs(a)).length, (await openCard(a))?.id], [0, card.id], "nothing queued; the card stands");
        });
        if (ch === "telegram") {
          await t.step("telegram 4b. a yes in reply to a text whose Telegram message_id equals the card message's agent_messages.id approves nothing", async () => {
            const m = await q1(`select m.id from public.agent_messages m join public.agent_threads th on th.id = m.thread_id where th.user_id = '${a}' and m.role = 'assistant' and m.meta->>'card_id' = '${card.id}' order by m.id desc limit 1`);
            assert(/^\d+$/.test(m), `the card's agent_messages id: ${m}`);
            tgForce = Number(m); // the next text Telegram delivers gets that number as its message_id
            const other = await say("telegram", A, "what time is it");
            eq(other.out.at(-1)!.id, m, "Telegram gave the unrelated reply the same number");
            const r = await say("telegram", A, "yes", { replyTo: m });
            assert(/^Nothing was approved\./.test(r.reply), `a reply to the unrelated text approves nothing: ${r.reply}`);
            eq((await jobs(a)).length, 0, "nothing queued");
            eq((await openCard(a))?.id, card.id);
          });
        }
        await t.step(`${ch} 5. a wrong code, another person's code, a changed payload, a card older than 10 minutes: nothing`, async () => {
          const wrong = String((Number(card.approve_code) + 1) % 10000).padStart(4, "0");
          const w = await say(ch, A, `Yes ${wrong}`);
          assert(/doesn't match your card/.test(w.reply) && /nothing was approved/.test(w.reply), w.reply);
          eq(await q1(`select code_misses from public.career_apply_cards where id = '${card.id}'`), "1", "the miss is counted on the card");
          // Another person on the same channel, with their own card.
          await say(ch, B, "hello");
          b = await personOf(ch, B);
          assert(/^[0-9a-f-]{36}$/.test(b) && b !== a);
          await seed(b, ch, [1]);
          await say(ch, B, "show my applications");
          const bc = await openCard(b);
          if (bc.approve_code !== card.approve_code) {
            const x = await say(ch, A, `YES ${bc.approve_code}`);
            assert(/doesn't match your card/.test(x.reply), x.reply);
          }
          eq([(await jobs(a)).length, (await jobs(b)).length, (await openCard(b))?.id], [0, 0, bc.id], "another person's code approves nothing for anyone");
          // The prepared payload changed after the card was shown.
          const before = await q1(`select payload::text from public.career_apply_prepared where user_id = '${a}' and job_id = 'TEST-${ch}-1'`);
          await q1(`update public.career_apply_prepared set payload = jsonb_set(payload, '{fields,2,value}', '"TEST changed answer"') where user_id = '${a}' and job_id = 'TEST-${ch}-1'`);
          const c = await say(ch, A, `YES ${card.approve_code}`);
          assert(/changed after it was shown/.test(c.reply) && /nothing was approved/.test(c.reply), c.reply);
          const warned = await inspect(`${SUPABASE_URL}/functions/v1/trainee-inspect?t=${card.inspect_token}`);
          assert(/^The application to/.test(warned.text) && warned.text.includes("WARNING: this application changed after the card was shown"), `the link never shows a changed application as the approved one: ${warned.text}`);
          eq((await inspect(`${SUPABASE_URL}/functions/v1/trainee-inspect?t=${card.inspect_token}&f=resume`)).status, 409, "nor its resume");
          await q1(`update public.career_apply_prepared set payload = $p$${before}$p$::jsonb where user_id = '${a}' and job_id = 'TEST-${ch}-1'`);
          // Shown more than 10 minutes ago.
          const shown = await q1(`select shown_at from public.career_apply_cards where id = '${card.id}'`);
          await q1(`update public.career_apply_cards set shown_at = now() - interval '11 minutes' where id = '${card.id}'`);
          const s = await say(ch, A, `YES ${card.approve_code}`);
          assert(/more than 10 minutes ago/.test(s.reply) && /nothing was sent/.test(s.reply), s.reply);
          await q1(`update public.career_apply_cards set shown_at = '${shown}' where id = '${card.id}'`);
          eq([(await jobs(a)).length, (await openCard(a))?.id], [0, card.id], "still nothing queued; the card stands");
        });
        let approvedMsg: Post | null = null;
        await t.step(`${ch} 6. "yes, <code>!!": exactly that application queued by the shown hash; the card answered once, by code`, async () => {
          const r = await say(ch, A, `yes,  ${card.approve_code}!!`);
          approvedMsg = r.post;
          assert(/^1 approved exactly as shown\. Nothing has gone to an employer yet\./.test(r.reply) && /Employer 1: approved/.test(r.reply), r.reply);
          const j = await jobs(a);
          eq(j.length, 1, "one queue row");
          eq([j[0].state, j[0].job_id, j[0].approval_hash, j[0].payload_hash], ["queued", `TEST-${ch}-1`, await preparedHash(a, ch, 1), await preparedHash(a, ch, 1)]);
          eq(await q1(`select state || ' ' || (answer->>'via') from public.career_apply_cards where id = '${card.id}'`), "answered code");
          eq(await q1(`select state from public.career_apply_prepared where user_id = '${a}' and job_id = 'TEST-${ch}-2'`), "ready", "the other application was never on this card");
          // What was queued, behind the card's link, hashes to the hash the person approved.
          const sent = await inspect(`${SUPABASE_URL}/functions/v1/trainee-inspect?t=${card.inspect_token}&f=sent`);
          assert(sent.status === 200 && sent.text.includes(`Check: it hashes to ${card.items[0].payload_hash}, the hash on the card you approved.`) && /Its state: queued\./.test(sent.text), sent.text);
        });
        await t.step(`${ch} 7. the same code again, and the provider's retry of the same webhook: nothing more`, async () => {
          const again = await say(ch, A, `YES ${card.approve_code}`);
          assert(/already answered/.test(again.reply), again.reply);
          const mark = wire.length, rows = await q1(`select count(*) from public.career_outbox where user_id = '${a}'`);
          const words = `yes,  ${card.approve_code}!!`;
          const retry = ch === "telegram" ? await post(ch, A, { text: words, id: approvedMsg!.id })
            : ch === "whatsapp" ? await post(ch, A, { text: words, id: approvedMsg!.id.replace("wamid.IN.", "") })
            : await post(ch, A, { text: words, id: approvedMsg!.id.replace("LM-IN-", "") });
          eq(retry.status, 200);
          assert(JSON.stringify(retry.body).includes("duplicate webhook"), JSON.stringify(retry.body));
          eq([wire.length - mark, await q1(`select count(*) from public.career_outbox where user_id = '${a}'`), (await jobs(a)).length], [0, rows, 1], "a retried webhook runs nothing");
        });
        await t.step(`${ch} 8. the next card: the old code approves nothing; this channel's own gesture approves the new one; "where are my applications" lists both, newest first, with links`, async () => {
          const mark = wire.length;
          await say(ch, A, "show my applications");
          const c2 = await openCard(a);
          assert(c2 && c2.id !== card.id && c2.approve_code !== card.approve_code, "a new card, a new code");
          const old = await say(ch, A, `YES ${card.approve_code}`);
          assert(/already answered|out of date/.test(old.reply), old.reply);
          eq((await openCard(a))?.id, c2.id, "the old code did not touch the new card");
          const shownWire = got(ch, A, mark);
          if (ch === "imessage") {
            const r = await say(ch, A, `${c2.approve_code} yes`);
            assert(/^1 approved exactly as shown/.test(r.reply), r.reply);
          } else {
            const approve = shownWire.flatMap((w) => w.buttons.map((x) => ({ ...x, msg: w.id }))).find((x) => x.data.startsWith("tca:"))!;
            assert(approve, `${ch}: the new card's Approve button was sent`);
            const m2 = wire.length;
            const r = await post(ch, A, { tap: { data: approve.data, messageId: approve.msg } });
            eq(r.status, 200, JSON.stringify(r.body));
            const reply = got(ch, A, m2).map((w) => w.text).join("\n");
            assert(/^1 approved exactly as shown/.test(reply), `${ch}: the tap's answer: ${reply} ${JSON.stringify(r.body)}`);
          }
          const j = await jobs(a);
          eq(j.map((x: any) => x.job_id), [`TEST-${ch}-1`, `TEST-${ch}-2`]);
          eq(j[1].approval_hash, await preparedHash(a, ch, 2));
          eq(await q1(`select state from public.career_apply_cards where id = '${c2.id}'`), "answered");
          const st = await say(ch, A, "where are my applications?");
          const lines = st.reply.split("\n").filter((l) => l.startsWith("- "));
          eq(lines.length, 2, st.reply);
          assert(/Employer 2[^\n]*: approved, not sent yet\. \(under an hour in this stage\) http:\/\/supabase\.test\/functions\/v1\/trainee-inspect\?t=[0-9a-f]{32}&f=sent$/.test(lines[0]), `newest first, stage, time in it, the link: ${st.reply}`);
          assert(/Employer 1/.test(lines[1]) && !/viewed|opened|seen/i.test(st.reply), st.reply);
        });
        await t.step(`${ch} 9. the provider gets 200 before the turn runs; a retry while it runs is a duplicate (E-15)`, async () => {
          const mark = wire.length, rows = await q1(`select count(*) from public.career_outbox where user_id = '${a}'`);
          const ackId = ch === "telegram" ? "990001" : `ack-${ch}`;
          const first = await post(ch, A, { text: "thanks!!", id: ackId, defer: true });
          eq(first.status, 200);
          eq([await q1(`select count(*) from public.career_outbox where user_id = '${a}'`), wire.length - mark], [rows, 0], `${ch}: answered before the turn ran: ${JSON.stringify(first.body)}`);
          const inbound = ch === "imessage" ? `LM-IN-${ackId}` : ch === "whatsapp" ? `wamid.IN.${ackId}` : ackId;
          eq(await q1(`select count(*) from public.channel_inbound where provider_message_id = '${inbound}'`), "1", "the message id was claimed before the answer");
          const retry = await post(ch, A, { text: "thanks!!", id: ackId, defer: true });
          assert(JSON.stringify(retry.body).includes("duplicate webhook"), JSON.stringify(retry.body));
          await Promise.all(deferred.splice(0));
          eq(Number(await q1(`select count(*) from public.career_outbox where user_id = '${a}'`)), Number(rows) + 1, "then the one turn ran and its reply was queued");
          eq(got(ch, A, mark).length >= 1, true, "and delivered");
        });
      }
      await t.step("only the three providers were called", () => {
        assert(outbound.every((u) => /^POST https:\/\/(api\.telegram\.org\/bot<token>\/|graph\.facebook\.com\/v[0-9.]+\/106540352242922\/messages|a\.loopmessage\.com\/api\/v1\/message\/send\/)/.test(u)), outbound.join("\n"));
      });
    } finally {
      agentChat?.restore();
      globalThis.fetch = realFetch;
      for (const [k, v] of envBefore) { if (v === undefined) Deno.env.delete(k); else Deno.env.set(k, v); }
      await pg.stop();
    }
  },
});
