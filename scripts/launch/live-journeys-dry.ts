// The dry mode of scripts/launch/live-journeys.ts (R3 of docs/architect/TEST-STRATEGY-2026-11-01.md): the SAME journeys, sent
// over real HTTP with the real secret header, to the REAL trainee-telegram handler composed exactly as its index.ts composes it
// (the inbound store over supabase-js, agent-chat through chatThroughAgent, the deliverer, the service client), listening on
// 127.0.0.1, with the REAL agent-chat career handler, on a throwaway Postgres 16 with every migration (tests/flow/pg.ts) behind
// the PostgREST double. Telegram is the fake Bot API (tests/architect/scenarios/telegram-bot-api.ts), the model the scripted
// stand-in the acceptance suite uses; any other host is refused and recorded, and the record must be empty. The database is
// read through the same scoped reads as production. $0, no network. Run as an unprivileged user (initdb refuses root).
//   deno run -A [--import-map=tests/flow/supabase-npm.json] scripts/launch/live-journeys.ts --dry
import { startPg } from "../../tests/flow/pg.ts";
import { careerHandler, SERVICE_KEY, SUPABASE_URL, supabaseParity } from "../../tests/flow/handler.ts";
import { fakeBot } from "../../tests/architect/scenarios/telegram-bot-api.ts";
import { handleTelegram } from "../../supabase/functions/trainee-telegram/handler.ts";
import { chatThroughAgent, deliverer } from "../../supabase/functions/_shared/channel_runtime.ts";
import { supabaseInboundStore } from "../../supabase/functions/trainee-inbound/store.ts";
// Types only from live-journeys.ts (its main dynamically imports this file; a value import would be a cycle under its top-level
// await): the journey itself is passed in.
import type { JourneyReport, runJourneys as RunJourneys, webhookPoster as WebhookPoster } from "./live-journeys.ts";
export interface Core { runJourneys: typeof RunJourneys; webhookPoster: typeof WebhookPoster; SYNTHETIC_CHAT: number }

const TOKEN = "123456:TEST-live-journeys-token-not-real", SECRET = "TEST_live_journeys_webhook_secret_0123456789";
const ENV_KEYS = ["CAREER_BRAIN", "CAREER_NETWORKING_DRAFT", "OPENAI_API_KEY", "CAREER_MODEL", "TELEGRAM_BOT_TOKEN", "TELEGRAM_WEBHOOK_SECRET", "TELEGRAM_BOT_USERNAME", "TRAINEE_SIGNUP",
  "TRAINEE_ALLOWED_CONTACTS", "TRAINEE_DELIVER_SECRET", "CAREER_PREPARE_AHEAD_URL", "CAREER_PREPARE_AHEAD_TOKEN", "CAREER_EMAIL_SEND", "LOOPMESSAGE_API_KEY", "WHATSAPP_TOKEN", "TRAINEE_FILE_BASE_URL", "TRAINEE_FILE_LINK_SECRET"];

// The scripted networking writer at the OpenAI URL (as the acceptance suite): one short email.
function fakeOpenAI(body: any): Response {
  const user = String((body.messages ?? []).find((m: any) => m.role === "user")?.content ?? "");
  const first = /- name: (\S+)/.exec(user)?.[1] ?? "there";
  const text = `Subject: A quick question\n\nHi ${first},\n\nI'd be grateful for 15 minutes to hear how you got started. Would you be open to a short call?`;
  return Response.json({ id: "chatcmpl-test", model: body.model, choices: [{ index: 0, message: { role: "assistant", content: text }, finish_reason: "stop" }], usage: { prompt_tokens: 400, completion_tokens: 60 } });
}

export interface DryReport extends JourneyReport { outbound: string[]; botViolations: string[]; botMessages: number; webhookRequests: number; badSecretStatus: number }

export async function runDry(o: { resume: string; runId: string; log?: (l: string) => void }, core: Core): Promise<DryReport> {
  const { runJourneys, webhookPoster, SYNTHETIC_CHAT } = core;
  const pg = await startPg();
  const saved = Object.fromEntries(ENV_KEYS.map((k) => [k, Deno.env.get(k)]));
  for (const k of ENV_KEYS) Deno.env.delete(k);
  const realFetch = globalThis.fetch;
  let h: Awaited<ReturnType<typeof careerHandler>> | null = null;
  let server: Deno.HttpServer | null = null;
  try {
    await supabaseParity(pg);
    h = await careerHandler(pg, {});
    const { handleChat } = await import("../../supabase/functions/agent-chat/handler-career.ts");
    const bot = fakeBot({ token: TOKEN, now: Date.now });
    const viaDouble = globalThis.fetch, outbound: string[] = [];
    globalThis.fetch = (async (input: Request | URL | string, init?: RequestInit) => {
      const req = input instanceof Request && !init ? input : new Request(input as any, init);
      const u = new URL(req.url);
      if (u.hostname === "127.0.0.1") return await realFetch(req); // the journeys' own webhook POSTs
      if (u.origin === new URL(SUPABASE_URL).origin && u.pathname === "/functions/v1/agent-chat") return await handleChat(req);
      if (u.origin === new URL(SUPABASE_URL).origin) return await viaDouble(req);
      if (u.host === "api.telegram.org") return await bot.fetch(req);
      if (u.host === "api.openai.com") return fakeOpenAI(await req.json());
      outbound.push(`${req.method} ${u.host}${u.pathname}`);
      throw new TypeError(`network refused: ${u.host}`);
    }) as typeof fetch;
    for (const [k, v] of Object.entries({ TELEGRAM_BOT_TOKEN: TOKEN, TELEGRAM_WEBHOOK_SECRET: SECRET, TELEGRAM_BOT_USERNAME: "TraineeLiveJourneysBot", TRAINEE_SIGNUP: "closed",
      TRAINEE_ALLOWED_CONTACTS: `telegram:${SYNTHETIC_CHAT}`, TRAINEE_DELIVER_SECRET: "TEST-deliver-secret-0123456789-abcdefgh", CAREER_NETWORKING_DRAFT: "on", OPENAI_API_KEY: "sk-test-not-real",
      CAREER_MODEL: "gpt-5-mini" })) Deno.env.set(k, v);
    const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2.117.1");
    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    // trainee-telegram as index.ts serves it, on loopback.
    let webhookRequests = 0;
    server = Deno.serve({ hostname: "127.0.0.1", port: 0, onListen: () => {} }, async (req) => {
      if (new URL(req.url).pathname !== "/functions/v1/trainee-telegram") return new Response("not found", { status: 404 });
      webhookRequests++;
      const deliverNow = deliverer(admin, Deno.env);
      return await handleTelegram(req, { env: Deno.env, now: Date.now, store: () => supabaseInboundStore(admin), chat: chatThroughAgent(SUPABASE_URL, SERVICE_KEY, { channel: "telegram" }), admin,
        deliver: (a) => deliverNow({ userId: a.userId, key: a.key, now: a.now }) });
    });
    const url = `http://127.0.0.1:${(server.addr as Deno.NetAddr).port}/functions/v1/trainee-telegram`;
    // The door: a wrong secret is refused before anything is read.
    const bad = await webhookPoster(url, "wrong-secret-0000000000000000")({ update_id: 1, message: { message_id: 1, chat: { id: SYNTHETIC_CHAT, type: "private" }, from: { id: SYNTHETIC_CHAT }, date: 1, text: "hi" } });
    const report = await runJourneys({ post: webhookPoster(url, SECRET), db: { sql: (t) => pg.sql(t) }, chat: SYNTHETIC_CHAT, delivery: "verified", runId: o.runId, resume: o.resume, log: o.log, replyTimeoutMs: 15_000, tapWaitMs: 300 });
    const out: DryReport = { ...report, outbound, botViolations: bot.violations.slice(0, 5), botMessages: bot.to(SYNTHETIC_CHAT).length, webhookRequests, badSecretStatus: bad.status };
    (o.log ?? console.log)(`LIVE_JOURNEY dry: webhook_requests=${webhookRequests} bot_messages=${out.botMessages} bot_violations=${bot.violations.length} outbound=${outbound.length} bad_secret_status=${bad.status}`);
    if (outbound.length || bot.violations.length || ![401, 403].includes(bad.status)) out.pass = false;
    return out;
  } finally {
    await server?.shutdown();
    globalThis.fetch = realFetch;
    h?.restore();
    for (const [k, v] of Object.entries(saved)) v === undefined ? Deno.env.delete(k) : Deno.env.set(k, v);
    await pg.stop();
  }
}
