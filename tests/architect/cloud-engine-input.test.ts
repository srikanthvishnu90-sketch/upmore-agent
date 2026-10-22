// The cloud producer's engine input (bridge review 1, A1): a cloud-only person's chat facts and texted answers become
// exactly the file scripts/apply.ts reads, and only what the one contract keeps reaches an application. Synthetic only.
import { engineInput, readEngineInput } from "../../workers/career-cloud/engine_input.ts";
import { trustedFacts } from "../../scripts/apply.ts";
const ok = (v: unknown, why: string) => { if (!v) throw new Error(why); };
const eq = (a: unknown, b: unknown, why: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${why}: ${JSON.stringify(a)} !== ${JSON.stringify(b)}`); };
const OWNER = "00000000-0000-4000-8000-0000000000a1", OTHER = "00000000-0000-4000-8000-0000000000b2";
const rid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
// A fact as confirm_profile_fact leaves it (provenance + the persisted event's id).
const chat = (id: string, kind: string, text: string, extra: Record<string, unknown> = {}) => ({ id, kind, text, title: "", source: "user", status: "confirmed",
  needs_confirmation: false, provenance: "owner confirmed in chat (2026-10-21T17:10:00.000Z)", confirmation_event_id: "evt-" + id, ...extra });
const row = (n: number, key: string, answer: string, extra: Record<string, unknown> = {}) => ({ id: rid(n), user_id: OWNER, key, kind: "fact", answer, state: "answered", ...extra });
const ACK = "label:0123456789abcdef";

Deno.test("engine input: confirmed chat facts and texted answers are what the contract keeps, by their own ids", () => {
  const profile = { facts: [chat("F-001", "other", "My phone number is (555) 010-0199"), chat("F-002", "other", "I am authorized to work in the United States"),
    { ...chat("F-003", "other", "My country is Canada"), status: "draft", needs_confirmation: true }] };
  const rows = [row(1, "fact:email", "sam.synthetic@example.test"), row(2, "fact:full_name", "Sam Synthetic"), row(3, "fact:sponsorship", "No"),
    row(4, ACK, "Yes", { kind: "consent" })];
  const r = engineInput({ owner: OWNER, profile, rows });
  eq(r.manifest.kept, { answers: ["email", "full_name", "phone", "sponsorship", "work_authorization"], saved: [ACK] }, "kept keys");
  ok(r.manifest.excluded.some((e) => e.factId === "F-003"), "a draft fact is excluded, by its id");
  ok(!r.manifest.kept.answers.includes("country"), "an unconfirmed fact answers nothing");
  eq(r.facts.text_answers.map((t) => t.id), [rid(1), rid(2), rid(3), rid(4)], "every answered row of the person is carried");
  eq(r.skipped, [], "nothing skipped");
});

Deno.test("engine input: the file is the engine's own (scripts/apply.ts trustedFacts reads it to the same manifest)", () => {
  const r = engineInput({ owner: OWNER, profile: { facts: [chat("F-001", "other", "My phone number is (555) 010-0199")] }, rows: [row(1, "fact:email", "sam@example.test")], resumeSha256: "a".repeat(64) });
  const m = trustedFacts(JSON.parse(JSON.stringify(r.facts)), { sha256: "a".repeat(64) });
  eq(m.hash, r.manifest.hash, "same manifest hash through the engine's loader");
  eq(m.answers.email?.factId, `text-answer:${rid(1)}`, "a texted answer is its row");
  eq(m.answers.phone?.factId, "F-001", "a chat fact is its fact id");
  eq(m.byFactId[`text-answer:${rid(1)}`]?.authorizes, false, "a fact-scoped answer never attests");
});

Deno.test("engine input: an attestation answered by the person is theirs to attest; a fact answer is not", () => {
  const r = engineInput({ owner: OWNER, profile: {}, rows: [row(4, ACK, "Yes", { kind: "consent" })] });
  const m = trustedFacts(JSON.parse(JSON.stringify(r.facts)), { sha256: "a".repeat(64) });
  eq(m.saved[ACK]?.factId, `text-answer:${rid(4)}`, "the attestation's answer, by its row");
  eq(m.byFactId[`text-answer:${rid(4)}`]?.authorizes, true, "only the person's own answer to it attests");
});

Deno.test("engine input: another person's, unanswered and malformed rows are named and left out, never repaired", () => {
  const rows = [row(1, "fact:email", "a@example.test", { user_id: OTHER }), row(2, "fact:email", "b@example.test", { state: "open" }),
    row(3, "fact:Email", "c@example.test"), row(4, "fact:email", "   "), { ...row(5, "fact:email", "d@example.test"), id: "x" }, "junk"];
  const r = engineInput({ owner: OWNER, profile: {}, rows });
  eq(r.skipped.map((s) => s.why), ["another person's row", "not answered", "malformed key", "no answer", "no row id", "not a row"], "named reasons");
  eq(r.facts.text_answers, [], "none carried");
  eq(r.manifest.kept, { answers: [], saved: [] }, "nothing kept");
});

Deno.test("engine input: another person's profile contributes nothing; the owner must be a uuid", () => {
  const r = engineInput({ owner: OWNER, profile: { user_id: OTHER, facts: [chat("F-001", "other", "My phone number is (555) 010-0199")] }, rows: [] });
  eq(r.facts.facts, [], "no foreign facts in the file");
  ok(r.skipped.some((s) => s.why === "another person's profile"), "named");
  let threw = "";
  try { engineInput({ owner: "SYN", profile: {}, rows: [] }); } catch (e) { threw = String((e as Error).message); }
  eq(threw, "ENGINE_INPUT_OWNER", "owner checked");
});

Deno.test("engine input: D-007 by bank factId; a bank row cannot reach an application through the profile projection", () => {
  // A bank row keeps its bank factId (F-033 ruling) under a chat id; the projection must not drop it on the way.
  const bank = chat("F-101", "other", "My phone number is (555) 010-0199", { factId: "F-033" });
  eq(engineInput({ owner: OWNER, profile: { facts: [bank] }, rows: [] }).manifest.kept.answers, [], "bank lineage projected (leak)");
  const delegated = chat("F-001", "other", "I am authorized to work in the United States", { provenance: "owner-delegated answer-all" });
  eq(engineInput({ owner: OWNER, profile: { facts: [delegated] }, rows: [] }).manifest.kept.answers, [], "delegated provenance projected");
  ok(!JSON.stringify(engineInput({ owner: OWNER, profile: {}, rows: [row(9, "fact:email", "x@example.test")] }).facts).includes("F-0"), "no bank id appears from rows");
});
Deno.test("engine input: KNOWN, flagged to the second judge: an own chat fact numbered F-027..F-079 is excluded (asked again) on projection", () => {
  // The projection names an answer by the chat row's id, and the manifest reads that as a bank factId. Fails closed (the
  // field is asked); the ruling says an own chat F-0xx stays the person's. Changing it is a quarantine-semantics call.
  const r = engineInput({ owner: OWNER, profile: { facts: [chat("F-033", "other", "My phone number is (555) 010-0199")] }, rows: [] });
  eq(r.manifest.kept.answers, [], "current behaviour: excluded, so asked");
  ok(r.manifest.excluded.some((e) => e.factId === "F-033" && /quarantined/.test(e.why)), "named as quarantined");
});

Deno.test("engine input: a chat fact and a texted answer that disagree exclude both (asked again)", () => {
  const r = engineInput({ owner: OWNER, profile: { facts: [chat("F-001", "other", "My phone number is (555) 010-0199")] }, rows: [row(1, "fact:phone", "(555) 010-0000")] });
  ok(!r.manifest.kept.answers.includes("phone"), "neither value is used");
  eq(r.manifest.conflicts.map((c) => c.key), ["phone"], "the conflict is named");
});

Deno.test("engine input: the reader stops named on a failed read and never prepares on an empty input", async () => {
  let threw = "";
  try { await readEngineInput({ latestProfile: async () => { throw Error("down"); }, answeredRows: async () => [] }, OWNER); } catch (e) { threw = String((e as Error).message); }
  eq(threw, "ENGINE_INPUT_READ_FAILED", "a failed profile read");
  threw = "";
  try { await readEngineInput({ latestProfile: async () => null, answeredRows: async () => ({}) as unknown as unknown[] }, OWNER); } catch (e) { threw = String((e as Error).message); }
  eq(threw, "ENGINE_INPUT_READ_FAILED", "a malformed rows read");
  const r = await readEngineInput({ latestProfile: async () => null, answeredRows: async () => [row(1, "fact:email", "sam@example.test")] }, OWNER);
  eq([r.profileFound, r.manifest.kept.answers], [false, ["email"]], "no profile yet: texted answers still count");
});
