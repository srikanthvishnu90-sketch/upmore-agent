// CHANNEL-DOC-1 end-to-end (tier 2, harness) — the full document
// journey over BOTH channel bridges, with every production piece real
// except the two transports:
//
//   user text -> telegram-inbound / whatsapp-inbound handler (real)
//     -> agent-chat call (fetch double) answered by the REAL career
//        host + the REAL domain chain (packages/domain — the bundle's
//        own sources, composed exactly as the node harnesses compose
//        them; the deployed handler injects the bundle built from
//        these same sources, an equivalence tests/router-bundle.test
//        .cjs pins with --check) + the REAL artifact materialization
//        (channel_artifacts.ts)
//     -> reply artifacts[] (bytes-refs)
//     -> Telegram: sendDocument multipart with the exact PDF bytes
//     -> WhatsApp: Twilio media on a signed function URL, then the
//        URL fetched back through the real handler -> exact bytes.
//
// The CB-0495 ask is the journey text, verbatim from the 2026-10-19
// channel battery. The seam, disclosed: agent-chat's HTTP hop is
// replaced by an in-process host run (the battery's own composition),
// and the Telegram/Twilio APIs are fetch doubles that record calls.
import { handleTelegramWebhook } from "../../supabase/functions/_shared/telegram_bridge.ts";
import { handleWhatsappWebhook, twilioSignature } from "../../supabase/functions/_shared/whatsapp_twilio.ts";
import { documentsOf, materializeArtifacts } from "../../supabase/functions/_shared/channel_artifacts.ts";
// @ts-ignore: plain-JS production module, composed exactly as handler-career.ts composes it
import { CareerHost } from "../../supabase/functions/_shared/career_host.js";
import {
  FakeAdminArtifacts, assert, assertEq, envOf, TEST_USER, SUPABASE_URL, SERVICE_KEY,
} from "./lib/channel_fixture.ts";
import { createRequire } from "node:module";

// The domain chain, loaded from the bundle's own sources through
// Deno's CJS interop — the composition every repo harness uses, so
// module 148's renderer runs with the require it was built for and
// the tailored PDF in this journey is a real rendered document.
const req = createRequire(import.meta.url);
const CareerAccess = req("../../packages/domain/120-career-access.js");
const CareerProfile = req("../../packages/domain/122-career-profile.js");
const CareerOnboarding = req("../../packages/domain/130-career-onboarding.js");
const CareerDoorstep = req("../../packages/domain/141-career-doorstep.js");
const CareerRouter = req("../../packages/domain/142-career-router.js");
const CareerReply = req("../../packages/domain/140-career-reply.js");
const CareerContainment = req("../../packages/domain/143-career-containment.js");

const TG_SECRET = "fixture-webhook-secret";
const TG_CHAT = 424242;
const TW_AUTH = "fixture-twilio-auth-token";
const WA_FROM = "whatsapp:+14155238886";
const WA_USER = "+12246029341";
const HOOK_WA = `${SUPABASE_URL}/functions/v1/whatsapp-inbound`;
const NOW = Date.parse("2026-10-20T15:00:00.000Z");
const ASK = "tailor my resume for the New Grad Software Engineer role at Northwind Ledger (fictional) and send me the PDF as a file in this chat";
const JD = "New Grad Software Engineer at Northwind Ledger (TEST posting)\nRequired: Python, JavaScript, React, SQL, PostgreSQL, Git.\nNice to have: Kubernetes, Docker, AWS.\nYou will build APIs and deploy services.";
const POSTING = { id: "nw-ledger-1", corpus_id: "nw-ledger-1", title: "New Grad Software Engineer", company: "Northwind Ledger", jd_text: JD, source: "fixture" };
const clone = (v: any) => JSON.parse(JSON.stringify(v));
async function sha256Hex(buf: ArrayBuffer | Uint8Array): Promise<string> {
  const h = await crypto.subtle.digest("SHA-256", buf as ArrayBuffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function buildWorld() {
  const host = (CareerHost as any).createCareerHost({
    CareerAccess, CareerOnboarding, CareerRouter, CareerDoorstep, CareerReply, CareerContainment,
  });
  const personaRaw = JSON.parse(await Deno.readTextFile(new URL("../../packages/career-data/fixtures/test-persona.json", import.meta.url)));
  const persona = (CareerProfile as any).profileFromData(personaRaw);
  const admin = new FakeAdminArtifacts();
  const hostThreads = new Map<string, any>();
  let tick = 0;
  const calls: { url: string; init: any }[] = [];
  const fetchFn = async (url: string, init: any) => {
    const u = String(url);
    calls.push({ url: u, init });
    if (u.includes("/functions/v1/agent-chat")) {
      const body = JSON.parse(init.body);
      const threadId = body.thread_id;
      if (!hostThreads.has(threadId)) {
        hostThreads.set(threadId, { v: 1, scope: { userId: TEST_USER }, stores: { profile: clone(persona), posting: clone(POSTING) } });
      }
      tick += 1;
      const ctx = host.createTurnCtx({ userId: TEST_USER, threadId, now: NOW + tick * 60000, accountPersistence: true, snapshot: hostThreads.get(threadId), account: {}, watchState: {} });
      const out = host.runTurn(body.message, ctx);
      hostThreads.set(threadId, host.extractSnapshot(ctx));
      const docs = documentsOf(out.result);
      let artifactsField: any[] | undefined;
      if (docs.length) {
        const m = await materializeArtifacts(admin as any, { userId: TEST_USER, threadId, documents: docs });
        if (m.artifacts.length) artifactsField = m.artifacts;
      }
      return new Response(JSON.stringify({ thread_id: threadId, reply: out.reply, ...(artifactsField ? { artifacts: artifactsField } : {}) }), { status: 200, headers: { "Content-Type": "application/json" } });
    }
    if (u.includes("api.telegram.org")) return new Response(JSON.stringify({ ok: true, result: { message_id: 1 } }), { status: 200 });
    if (u.includes("api.twilio.com")) return new Response(JSON.stringify({ sid: "SMfixture" }), { status: 201 });
    return new Response("{}", { status: 200 });
  };
  const env = envOf({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TELEGRAM_BOT_TOKEN: "fixture-bot-token", TELEGRAM_WEBHOOK_SECRET: TG_SECRET,
    TWILIO_ACCOUNT_SID: "ACfixture", TWILIO_AUTH_TOKEN: TW_AUTH, TWILIO_WHATSAPP_FROM: WA_FROM,
    CHANNEL_ARTIFACT_SECRET: "fixture-artifact-secret",
    CHANNEL_TEST_USER_ID: TEST_USER,
    TELEGRAM_ALLOWED_CHAT_IDS: String(TG_CHAT), WHATSAPP_ALLOWED_NUMBERS: WA_USER,
  });
  const deps: any = { env, fetchFn, createAdmin: () => admin, paceMs: 0 };
  return { host, admin, calls, deps };
}

function tgRequest(text: string, id = 21) {
  return new Request(`${SUPABASE_URL}/functions/v1/telegram-inbound`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": TG_SECRET },
    body: JSON.stringify({ update_id: 9000 + id, message: { message_id: id, date: 1760000000, text, chat: { id: TG_CHAT, type: "private" }, from: { id: 777, is_bot: false } } }),
  });
}
let sidSeq = 5000;
async function waRequest(text: string) {
  const params = { From: `whatsapp:${WA_USER}`, To: WA_FROM, Body: text, MessageSid: `SM${sidSeq++}`, NumMedia: "0", ProfileName: "Test" };
  return new Request(HOOK_WA, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": await twilioSignature(TW_AUTH, HOOK_WA, params) },
    body: new URLSearchParams(params).toString(),
  });
}

Deno.test("CHANNEL-DOC-1 E2E: the CB-0495 ask delivers the tailored PDF as a file on BOTH channels", async () => {
  const w = await buildWorld();

  // --- Telegram leg ---
  const resT = await handleTelegramWebhook(tgRequest(ASK), w.deps);
  assertEq(resT.status, 200);
  const tgTexts = w.calls.filter((c) => c.url.endsWith("/sendMessage")).map((c) => JSON.parse(c.init.body).text as string);
  assert(tgTexts.some((t) => /tailored/i.test(t)), `the tailor reply arrives as text (got: ${JSON.stringify(tgTexts).slice(0, 200)})`);
  assert(!tgTexts.some((t) => /Nothing was sent|no wave/.test(t)), "no outreach wave language anywhere");
  const docCalls = w.calls.filter((c) => c.url.endsWith("/sendDocument"));
  assertEq(docCalls.length, 1, "exactly one sendDocument on Telegram");
  const form = docCalls[0].init.body as FormData;
  assert(form instanceof FormData, "the document is uploaded as a file, not linked");
  const file = form.get("document") as File;
  const tgBytes = await file.arrayBuffer();
  assertEq(new TextDecoder().decode(new Uint8Array(tgBytes).subarray(0, 5)), "%PDF-", "real PDF bytes");
  assertEq(file.name, "Alex_Testcase_Resume.pdf");
  const tgSha = await sha256Hex(tgBytes);

  // --- WhatsApp leg (fresh thread, same ask) ---
  const before = w.calls.length;
  const resW = await handleWhatsappWebhook(await waRequest(ASK), w.deps);
  assertEq(resW.status, 200);
  const waCalls = w.calls.slice(before);
  const forms = waCalls.filter((c) => c.url.includes("api.twilio.com")).map((c) => new URLSearchParams(c.init.body));
  const media = forms.filter((f) => f.get("MediaUrl"));
  assertEq(media.length, 1, "exactly one media send on WhatsApp");
  const mediaUrl = media[0].get("MediaUrl")!;
  assert(mediaUrl.startsWith(HOOK_WA + "?"), "media rides the signed function URL");
  const got = await handleWhatsappWebhook(new Request(mediaUrl, { method: "GET" }), w.deps);
  assertEq(got.status, 200, "the signed URL serves the document");
  const waBytes = await got.arrayBuffer();
  assertEq(await sha256Hex(waBytes), tgSha, "both channels deliver the SAME document, byte for byte");
  const row = [...w.admin.artifacts.values()].find((r) => r.sha256 === tgSha);
  assert(row, "the delivered bytes are the stored artifact's bytes (hash-bound end to end)");

  // --- Follow-up delivery ask on the Telegram thread: same file again ---
  const before2 = w.calls.length;
  await handleTelegramWebhook(tgRequest("send me the PDF as a file in this chat", 22), w.deps);
  const doc2 = w.calls.slice(before2).filter((c) => c.url.endsWith("/sendDocument"));
  assertEq(doc2.length, 1, "the follow-up ask re-delivers the document");
  const file2 = (doc2[0].init.body as FormData).get("document") as File;
  assertEq(await sha256Hex(await file2.arrayBuffer()), tgSha, "the re-delivered file is byte-identical");
});
