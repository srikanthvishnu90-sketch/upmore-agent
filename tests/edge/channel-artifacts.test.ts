// CHANNEL-DOC-1 fixtures for the artifact seam (fail-first): the
// agent-chat reply contract's artifacts[] entries are bytes-refs into
// the owner-scoped channel_artifacts store — never public URLs — and
// WhatsApp media rides a signed, expiring URL on the channel function
// itself. Pins: documentsOf reads only byte-carrying documents;
// materialize stores owner+thread-scoped rows and returns refs;
// fetch is owner-scoped (a foreign user or thread gets nothing, an
// expired row gets nothing); the signed URL verifies exactly and
// fails closed on tamper and expiry.
import {
  ARTIFACTS_TABLE, documentsOf, fetchArtifactBytes, materializeArtifacts,
  signedArtifactUrl, verifyArtifactUrl,
} from "../../supabase/functions/_shared/channel_artifacts.ts";
import { extractArtifacts } from "../../supabase/functions/_shared/channel_present.ts";
import { FakeAdminArtifacts, assert, assertEq, envOf, TEST_USER } from "./lib/channel_fixture.ts";

const OTHER_USER = "7b1e0b6a-1f4a-4b0f-9c1d-foreign0001";
const THREAD = "thread-1";
const PDF_BYTES = new TextEncoder().encode("%PDF-1.4 fixture bytes — not a real resume");
const PDF_B64 = btoa(String.fromCharCode(...PDF_BYTES));
const DOC = { kind: "document", format: "pdf", filename: "Alex_Testcase_Resume.pdf", mime: "application/pdf", base64: PDF_B64, sha256: "f".repeat(64) };

const env = envOf({
  SUPABASE_URL: "https://fixture.supabase.co",
  CHANNEL_ARTIFACT_SECRET: "fixture-artifact-secret",
  TWILIO_AUTH_TOKEN: "fixture-twilio-auth-token",
});

Deno.test("documentsOf reads only byte-carrying documents from a turn result", () => {
  assertEq(documentsOf(null).length, 0);
  assertEq(documentsOf({}).length, 0);
  assertEq(documentsOf({ artifact: { kind: "truth_audit" } }).length, 0, "a non-document artifact yields nothing");
  const fromArtifact = documentsOf({ artifact: { kind: "tailored_resume", pdf: { format: "pdf", filename: "Alex_Testcase_Resume.pdf", contentType: "application/pdf", base64: PDF_B64, sha256: DOC.sha256 } } });
  assertEq(fromArtifact.length, 1, "the tailor artifact's PDF is a deliverable document");
  assertEq(fromArtifact[0].filename, "Alex_Testcase_Resume.pdf");
  assertEq(fromArtifact[0].mime, "application/pdf");
  const fromDocs = documentsOf({ documents: [DOC, { kind: "document", filename: "no-bytes.pdf" }, null, { filename: "x" }] });
  assertEq(fromDocs.length, 1, "entries without bytes are dropped, never half-carried");
  assertEq(fromDocs[0].base64, PDF_B64);
  const both = documentsOf({ documents: [DOC], artifact: { kind: "tailored_resume", pdf: { format: "pdf", filename: "Alex_Testcase_Resume.pdf", contentType: "application/pdf", base64: PDF_B64, sha256: DOC.sha256 } } });
  assertEq(both.length, 1, "the same document named twice (documents[] + artifact) is delivered once");
});

Deno.test("extractArtifacts accepts the landed ref shape and keeps the legacy url shape", () => {
  const arts = extractArtifacts({
    artifacts: [
      { kind: "document", ref: "art-123", filename: "a.pdf", mime: "application/pdf" },
      { kind: "document", url: "https://files.example.com/b.pdf", filename: "b.pdf" },
      { kind: "document" },
      { kind: "other", ref: "art-999" },
      { kind: "document", ref: "" },
      "junk",
    ],
  });
  assertEq(arts.length, 2, "exactly the two deliverable shapes survive");
  assertEq(arts[0].ref, "art-123");
  assertEq(arts[0].url, undefined);
  assertEq(arts[1].url, "https://files.example.com/b.pdf");
  assertEq(extractArtifacts({}).length, 0, "absent field -> no artifacts (the pre-DOC-1 contract)");
  assertEq(extractArtifacts({ artifacts: "nope" }).length, 0);
});

Deno.test("materialize stores owner+thread-scoped rows and returns refs, never bytes or urls", async () => {
  const admin = new FakeAdminArtifacts();
  const out = await materializeArtifacts(admin as any, { userId: TEST_USER, threadId: THREAD, documents: [DOC] });
  assertEq(out.failed, 0);
  assertEq(out.artifacts.length, 1);
  const ref = out.artifacts[0];
  assertEq(ref.kind, "document");
  assert(typeof ref.ref === "string" && ref.ref.length >= 32, "the ref is an opaque id");
  assert(!("base64" in ref) && !("url" in ref), "the reply contract carries no bytes and no URL");
  const row = admin.artifacts.get(ref.ref);
  assert(row, "the row is stored under the ref");
  assertEq(row.user_id, TEST_USER);
  assertEq(row.thread_id, THREAD);
  assertEq(row.bytes_b64, PDF_B64);
  assertEq(row.sha256, DOC.sha256);
  assert(new Date(row.expires_at).getTime() > Date.now(), "the row carries a future expiry");
  assertEq(ARTIFACTS_TABLE, "channel_artifacts");
});

Deno.test("fetchArtifactBytes is owner-scoped: foreign user, foreign thread, expiry, unknown ref all read as nothing", async () => {
  const admin = new FakeAdminArtifacts();
  const { artifacts } = await materializeArtifacts(admin as any, { userId: TEST_USER, threadId: THREAD, documents: [DOC] });
  const ref = artifacts[0].ref;
  const got = await fetchArtifactBytes(admin as any, { userId: TEST_USER, threadId: THREAD, ref });
  assert(got, "the owner fetches in their own thread");
  assertEq(new TextDecoder().decode(got!.bytes), new TextDecoder().decode(PDF_BYTES), "bytes round-trip exactly");
  assertEq(got!.filename, "Alex_Testcase_Resume.pdf");
  assertEq(got!.mime, "application/pdf");
  assertEq(await fetchArtifactBytes(admin as any, { userId: OTHER_USER, threadId: THREAD, ref }), null, "a foreign user gets nothing");
  assertEq(await fetchArtifactBytes(admin as any, { userId: TEST_USER, threadId: "thread-2", ref }), null, "a foreign thread gets nothing");
  assertEq(await fetchArtifactBytes(admin as any, { userId: TEST_USER, ref: "no-such-ref" }), null, "an unknown ref gets nothing");
  const row = admin.artifacts.get(ref);
  row.expires_at = new Date(Date.now() - 1000).toISOString();
  assertEq(await fetchArtifactBytes(admin as any, { userId: TEST_USER, ref }), null, "an expired row gets nothing");
});

Deno.test("the signed media URL verifies exactly; tamper and expiry fail closed", async () => {
  const base = "https://fixture.supabase.co/functions/v1/whatsapp-inbound";
  const url = await signedArtifactUrl(env, { base, ref: "art-123", userId: TEST_USER });
  assert(url, "a URL is minted when a secret is configured");
  const u = new URL(url!);
  assertEq(u.searchParams.get("artifact"), "art-123");
  assertEq(u.searchParams.get("u"), TEST_USER);
  const ok = await verifyArtifactUrl(env, url!);
  assertEq(ok?.ref, "art-123");
  assertEq(ok?.userId, TEST_USER);
  const tamperedId = url!.replace("art-123", "art-124");
  assertEq(await verifyArtifactUrl(env, tamperedId), null, "a swapped artifact id fails");
  const tamperedUser = url!.replace(TEST_USER, OTHER_USER);
  assertEq(await verifyArtifactUrl(env, tamperedUser), null, "a swapped user fails");
  const sig = u.searchParams.get("sig")!;
  const tamperedSig = url!.replace(sig, (sig[0] === "a" ? "b" : "a") + sig.slice(1));
  assertEq(await verifyArtifactUrl(env, tamperedSig), null, "a swapped signature fails");
  const expired = await signedArtifactUrl(env, { base, ref: "art-123", userId: TEST_USER, now: Date.now() - 3600_000 });
  assertEq(await verifyArtifactUrl(env, expired!), null, "an expired URL fails");
  const wrongSecret = envOf({ CHANNEL_ARTIFACT_SECRET: "another-secret" });
  assertEq(await verifyArtifactUrl(wrongSecret, url!), null, "a URL from another secret fails");
  assertEq(await signedArtifactUrl(envOf({}), { base, ref: "art-123", userId: TEST_USER }), null, "no secret configured -> no URL is minted");
});
