// CHANNEL-DOC-1 fixtures for the Telegram bridge (fail-first): a reply
// carrying an artifacts[] bytes-ref delivers the stored document as a
// real file (multipart sendDocument with the exact bytes) to the
// artifact's owner in their own thread — and to nobody else. A ref
// whose row belongs to another user, or that reads as nothing, sends
// NO file and speaks the failure in product voice; the reply text is
// never swallowed by a document failure.
import { handleTelegramWebhook } from "../../supabase/functions/_shared/telegram.ts";
import {
  FakeAdminArtifacts, assert, assertEq, envOf, fakeFetchRich, TEST_USER, SUPABASE_URL, SERVICE_KEY,
} from "./lib/channel_fixture.ts";

const CHAT_ID = 424242;
const SECRET = "fixture-webhook-secret";
const OTHER_USER = "7b1e0b6a-1f4a-4b0f-9c1d-foreign0001";
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fixture bytes — tailored resume (TEST)");
const PDF_B64 = btoa(String.fromCharCode(...PDF_BYTES));
const REF = "art-fixture-0001";

function seedArtifact(admin: FakeAdminArtifacts, userId = TEST_USER) {
  admin.artifacts.set(REF, {
    id: REF, user_id: userId, thread_id: "thread-1", kind: "document",
    filename: "Alex_Testcase_Resume.pdf", mime: "application/pdf",
    bytes_b64: PDF_B64, sha256: "f".repeat(64),
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
}

function deps(chat: (body: any) => any, userId = TEST_USER) {
  const admin = new FakeAdminArtifacts();
  seedArtifact(admin, userId);
  const f = fakeFetchRich({ chat });
  const env = envOf({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TELEGRAM_BOT_TOKEN: "fixture-bot-token",
    TELEGRAM_WEBHOOK_SECRET: SECRET,
    CHANNEL_TEST_USER_ID: TEST_USER,
    TELEGRAM_ALLOWED_CHAT_IDS: String(CHAT_ID),
  });
  return { admin, calls: f.calls, d: { env, fetchFn: f.fn, createAdmin: () => admin, paceMs: 0 } as any };
}

function tgReq(update: any) {
  return new Request("https://fixture.supabase.co/functions/v1/telegram-inbound", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-telegram-bot-api-secret-token": SECRET },
    body: JSON.stringify(update),
  });
}
const textUpdate = (text: string, id = 11) => ({
  update_id: 9000 + id,
  message: { message_id: id, date: 1760000000, text, chat: { id: CHAT_ID, type: "private" }, from: { id: 777, is_bot: false } },
});
const tgCalls = (calls: any[], method: string) => calls.filter((c) => c.url.includes("api.telegram.org") && c.url.endsWith("/" + method));
const sendTexts = (calls: any[]) => tgCalls(calls, "sendMessage").map((c) => JSON.parse(c.init.body).text as string);

const docReply = () => ({
  reply: "Your tailored resume — the PDF is attached to this message.",
  artifacts: [{ kind: "document", ref: REF, filename: "Alex_Testcase_Resume.pdf", mime: "application/pdf" }],
});

Deno.test("a ref artifact is delivered as a real file: multipart sendDocument with the exact stored bytes", async () => {
  const { d, calls } = deps(docReply);
  const res = await handleTelegramWebhook(tgReq(textUpdate("send me the PDF in this chat")), d);
  assertEq(res.status, 200);
  assert(sendTexts(calls).some((t) => t.includes("tailored resume")), "the reply text still arrives");
  const docs = tgCalls(calls, "sendDocument");
  assertEq(docs.length, 1, "exactly one document is sent");
  const body = docs[0].init.body;
  assert(body instanceof FormData, "the ref path uploads the file itself (multipart), never a URL");
  const file = body.get("document") as File;
  assert(file, "the multipart carries a document part");
  assertEq(file.name, "Alex_Testcase_Resume.pdf");
  const bytes = new Uint8Array(await file.arrayBuffer());
  assertEq(new TextDecoder().decode(bytes), new TextDecoder().decode(PDF_BYTES), "the sent bytes are the stored bytes, exactly");
  assertEq(String(body.get("chat_id")), String(CHAT_ID));
});

Deno.test("an artifact owned by another user is NEVER delivered into this thread", async () => {
  const { d, calls } = deps(docReply, OTHER_USER);
  const res = await handleTelegramWebhook(tgReq(textUpdate("send me the PDF in this chat")), d);
  assertEq(res.status, 200);
  assertEq(tgCalls(calls, "sendDocument").length, 0, "a foreign artifact sends no file");
  assert(sendTexts(calls).some((t) => t.includes("didn't go through")), "the failure is spoken in product voice");
});

Deno.test("a ref with no stored row sends no file and speaks the failure", async () => {
  const { d, calls, admin } = deps(docReply);
  admin.artifacts.clear();
  const res = await handleTelegramWebhook(tgReq(textUpdate("send me the PDF in this chat")), d);
  assertEq(res.status, 200);
  assertEq(tgCalls(calls, "sendDocument").length, 0, "nothing stored -> nothing sent, never claimed");
  assert(sendTexts(calls).some((t) => t.includes("didn't go through")), "the failure is spoken in product voice");
  assert(sendTexts(calls).some((t) => t.includes("tailored resume")), "the reply text itself still arrived");
});
