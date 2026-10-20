// CHANNEL-DOC-1 fixtures for the WhatsApp (Twilio) bridge
// (fail-first): a reply carrying an artifacts[] bytes-ref delivers the
// document as media whose MediaUrl is a SIGNED, EXPIRING URL on the
// whatsapp-inbound function itself — never a permanent public link —
// and that URL serves the exact bytes only to a valid, unexpired
// signature. Tamper, expiry, and unknown refs fail closed.
import { handleWhatsappWebhook } from "../../supabase/functions/_shared/whatsapp_twilio.ts";
import { signedArtifactUrl } from "../../supabase/functions/_shared/channel_artifacts.ts";
import {
  FakeAdminArtifacts, assert, assertEq, envOf, fakeFetchRich, TEST_USER, SUPABASE_URL, SERVICE_KEY,
} from "./lib/channel_fixture.ts";

const AUTH = "fixture-twilio-auth-token";
const SID = "ACfixture";
const FROM_NUM = "whatsapp:+14155238886";
const USER_NUM = "+12246029341";
const HOOK_URL = "https://fixture.supabase.co/functions/v1/whatsapp-inbound";
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fixture bytes — tailored resume (TEST)");
const PDF_B64 = btoa(String.fromCharCode(...PDF_BYTES));
const REF = "art-fixture-0001";
const ART_SECRET = "fixture-artifact-secret";

async function twilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  let data = url;
  for (const k of Object.keys(params).sort()) data += k + params[k];
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return btoa(String.fromCharCode(...new Uint8Array(sig)));
}

function deps(chat: (body: any) => any) {
  const admin = new FakeAdminArtifacts();
  admin.artifacts.set(REF, {
    id: REF, user_id: TEST_USER, thread_id: "thread-1", kind: "document",
    filename: "Alex_Testcase_Resume.pdf", mime: "application/pdf",
    bytes_b64: PDF_B64, sha256: "f".repeat(64),
    created_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3600_000).toISOString(),
  });
  const f = fakeFetchRich({ chat });
  const env = envOf({
    SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY: SERVICE_KEY,
    TWILIO_ACCOUNT_SID: SID, TWILIO_AUTH_TOKEN: AUTH, TWILIO_WHATSAPP_FROM: FROM_NUM,
    CHANNEL_ARTIFACT_SECRET: ART_SECRET,
    CHANNEL_TEST_USER_ID: TEST_USER,
    WHATSAPP_ALLOWED_NUMBERS: USER_NUM,
  });
  return { admin, calls: f.calls, d: { env, fetchFn: f.fn, createAdmin: () => admin, paceMs: 0 } as any };
}

let sidSeq = 3000;
async function waReq(body: string) {
  const params = { From: `whatsapp:${USER_NUM}`, To: FROM_NUM, Body: body, MessageSid: `SM${sidSeq++}`, NumMedia: "0", ProfileName: "Test" };
  return new Request(HOOK_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "x-twilio-signature": await twilioSignature(AUTH, HOOK_URL, params) },
    body: new URLSearchParams(params).toString(),
  });
}
const sendForms = (calls: any[]) => calls.filter((c) => c.url.includes("api.twilio.com")).map((c) => new URLSearchParams(c.init.body));

const docReply = () => ({
  reply: "Your tailored resume — the PDF is attached to this message.",
  artifacts: [{ kind: "document", ref: REF, filename: "Alex_Testcase_Resume.pdf", mime: "application/pdf" }],
});

Deno.test("a ref artifact goes out as media on a signed, expiring function URL — and the URL serves the exact bytes", async () => {
  const { d, calls } = deps(docReply);
  const res = await handleWhatsappWebhook(await waReq("send me the PDF in this chat"), d);
  assertEq(res.status, 200);
  const withMedia = sendForms(calls).filter((f) => f.get("MediaUrl"));
  assertEq(withMedia.length, 1, "exactly one media send");
  const mediaUrl = withMedia[0].get("MediaUrl")!;
  assert(mediaUrl.startsWith(HOOK_URL + "?"), "the media URL is the channel function itself, not a file host: " + mediaUrl);
  const u = new URL(mediaUrl);
  assertEq(u.searchParams.get("artifact"), REF);
  assertEq(u.searchParams.get("u"), TEST_USER);
  assert(u.searchParams.get("sig"), "the URL is signed");
  assert(Number(u.searchParams.get("exp")) > Math.floor(Date.now() / 1000), "the URL carries a future expiry");

  // Twilio now fetches the URL: the function serves the bytes itself.
  const got = await handleWhatsappWebhook(new Request(mediaUrl, { method: "GET" }), d);
  assertEq(got.status, 200);
  assertEq(got.headers.get("content-type"), "application/pdf");
  const bytes = new Uint8Array(await got.arrayBuffer());
  assertEq(new TextDecoder().decode(bytes), new TextDecoder().decode(PDF_BYTES), "the served bytes are the stored bytes, exactly");
});

Deno.test("the media URL fails closed: tampered signature, swapped user, expired, unknown ref", async () => {
  const { d } = deps(docReply);
  const env = (d as any).env as (k: string) => string | undefined;
  const good = await signedArtifactUrl(env, { base: HOOK_URL, ref: REF, userId: TEST_USER });
  assert(good, "signed url minted");
  const tampered = good!.replace(/sig=([0-9a-f])/, (_m, c) => "sig=" + (c === "a" ? "b" : "a"));
  const r1 = await handleWhatsappWebhook(new Request(tampered, { method: "GET" }), d);
  assertEq(r1.status, 403, "a tampered signature is refused");
  const swapped = good!.replace(TEST_USER, "7b1e0b6a-1f4a-4b0f-9c1d-foreign0001");
  const r2 = await handleWhatsappWebhook(new Request(swapped, { method: "GET" }), d);
  assertEq(r2.status, 403, "a swapped user is refused");
  const expired = await signedArtifactUrl(env, { base: HOOK_URL, ref: REF, userId: TEST_USER, now: Date.now() - 3600_000 });
  const r3 = await handleWhatsappWebhook(new Request(expired!, { method: "GET" }), d);
  assertEq(r3.status, 403, "an expired URL is refused");
  const unknown = await signedArtifactUrl(env, { base: HOOK_URL, ref: "art-does-not-exist", userId: TEST_USER });
  const r4 = await handleWhatsappWebhook(new Request(unknown!, { method: "GET" }), d);
  assertEq(r4.status, 404, "a validly-signed unknown ref is a 404, never bytes");
  const unsigned = await handleWhatsappWebhook(new Request(`${HOOK_URL}?artifact=${REF}`, { method: "GET" }), d);
  assertEq(unsigned.status, 403, "no signature, no bytes");
});
