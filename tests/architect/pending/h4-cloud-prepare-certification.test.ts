// FAIL-FIRST — H4 cloud prepare: the attestation comes from the card tap.
// Design: docs/e2e/H4-NEEDS-ANSWERS-ROOT-CAUSE.md (2026-10-22). The product
// change this pins lives in workers/career-browser/approve-first.ts and is
// NOT committed: it waits for the architect's + Vishnu's OK (approval-path
// edit). On the current code the "valid certification" test fails with
// reason needs_answers — prepare() has no certification input at all.
//
// The rule (WO-094 carried to the cloud path): an attestation is authorized
// by the person's tap on the card that showed its exact words, bound to the
// hash of the card payload they approved — never by a standing fact, and
// never by a fixture. prepare() receives that certification record and,
// only after verifying the binding (posting, exact attestation text, the
// caller's card hash), carries it into the engine run as the person's own
// saved answer to that exact question (the WO-102 text-answer channel:
// trustedManifest keeps saved text-answers with authorizes=true).
import { prepare } from "../../../workers/career-browser/approve-first.ts";
import { answerKey } from "../../../supabase/functions/_shared/question_map.ts";
import { ownAnswerOnly } from "../../../extension/src/apply_core.ts";

const POSTING = "http://127.0.0.1:8797/jobs/mockco/1";
const ATTEST = "I certify that the information I have provided is true and complete.";
const KEY = answerKey({ label: ATTEST, type: "checkbox", options: [] }, POSTING);
const prov = "owner stated (synthetic TEST profile)";
const FACTS = {
  user_id: "TEST-E2E",
  answers: {
    first_name: { value: "TEST", factId: "TEST-1", confirmed: true, provenance: prov, confirmation_event_id: "evt-e2e-1" },
    last_name: { value: "Person", factId: "TEST-2", confirmed: true, provenance: prov, confirmation_event_id: "evt-e2e-2" },
    email: { value: "e2e@example.test", factId: "TEST-3", confirmed: true, provenance: prov, confirmation_event_id: "evt-e2e-3" },
    // NO attestation fact anywhere — that is the point of this test.
  },
  saved: {},
};

// An engine double that judges exactly one thing the way the real engine's
// contract does: the attestation question is answered only when the facts
// carry the person's own saved answer to that exact question (a
// text_answers row at its answerKey). Everything else is the RESULT
// protocol's shape, copied from scripts/apply.ts's needs_answers write.
function makeEngine() {
  const calls: any[] = [];
  const runEngine = async (args: string[]) => {
    const factsPath = args[args.indexOf("--facts") + 1];
    const facts = JSON.parse(await Deno.readTextFile(factsPath));
    calls.push(facts);
    const row = (facts.text_answers ?? []).find((r: any) => r.key === KEY && typeof r.answer === "string" && r.answer.trim());
    if (!row) {
      return { result: { state: "not_submitted", reason: "needs_answers", posting: POSTING,
        company: "127.0.0.1:8797", fields: [ATTEST],
        questions: [{ label: ATTEST, type: "checkbox", options: [] }] }, evidence: null };
    }
    return { result: { state: "not_submitted", reason: "dry_run" }, evidence: {
      approval_hash: "stub-approval-hash",
      fields: [{ name: "attestation", label: ATTEST, value: "Yes", factId: "text-answer:" + row.id }],
      sources: { ["text-answer:" + row.id]: { provenance: "owner answered this question (text-answer:" + row.id + ")",
        event: row.id, authorizes: true, table: "saved", key: KEY, value: "Yes" } },
      payload: { user_id: "TEST-E2E", posting: POSTING, company: "127.0.0.1:8797",
        destination: POSTING + "/apply", resume: { filename: "resume.pdf", sha256: "e".repeat(64) }, page_fields: {} },
      readback: { attestation: true },
    } };
  };
  return { runEngine, calls };
}

async function factsFile(): Promise<string> {
  const dir = await Deno.makeTempDir();
  const p = dir + "/facts.json";
  await Deno.writeTextFile(p, JSON.stringify(FACTS));
  return p;
}
const CERT = { approval_ref: "cardtap-1", job_id: POSTING, attestation_text: ATTEST, value: "Yes", payload_hash: "card-hash-1" };
const args = (engine: any, extra: any = {}) => ({
  url: POSTING, factsPath: "", resumePath: "/tmp/resume.pdf",
  account: { epoch: 1, version: 1 }, now: Date.now(), runEngine: engine.runEngine, ...extra,
});

Deno.test("control: no certification — prepare stops at the attestation ask", async () => {
  const e = makeEngine();
  const r = await prepare({ ...args(e), factsPath: await factsFile() });
  if (r.ready) throw new Error("prepare must not be ready without an authorized attestation");
  if ((r.result as any).reason !== "needs_answers") throw new Error("expected needs_answers, got " + JSON.stringify(r.result));
});

Deno.test("a valid card-tap certification carries the attestation into prepare", async () => {
  if (!ownAnswerOnly(ATTEST)) throw new Error("test premise: the certify label is an own-answer-only question");
  const e = makeEngine();
  const r = await prepare({ ...args(e), factsPath: await factsFile(), certification: CERT, cardPayloadHash: "card-hash-1" });
  if (!r.ready) throw new Error("prepare with a valid certification must be ready; got " + JSON.stringify((r as any).result));
  const derived = e.calls[e.calls.length - 1];
  const row = (derived.text_answers ?? []).find((x: any) => x.key === KEY);
  if (!row || row.id !== "cardtap-1" || row.answer !== "Yes")
    throw new Error("the engine run must carry the certification as the person's own saved answer (text_answers row at the question's answerKey)");
  if (derived.answers?.attestation) throw new Error("no attestation fact may be fabricated into the answers");
});

Deno.test("a certification bound to another card hash does not authorize", async () => {
  const e = makeEngine();
  const r = await prepare({ ...args(e), factsPath: await factsFile(), certification: CERT, cardPayloadHash: "a-different-card" });
  if (r.ready) throw new Error("a certification whose payload hash is not the tapped card's must not authorize");
});

Deno.test("a certification naming different attestation words does not authorize", async () => {
  const e = makeEngine();
  const r = await prepare({ ...args(e), factsPath: await factsFile(),
    certification: { ...CERT, attestation_text: "I certify something else entirely." }, cardPayloadHash: "card-hash-1" });
  if (r.ready) throw new Error("a certification for different attestation text must not authorize this form's question");
});

Deno.test("a certification for another posting does not authorize", async () => {
  const e = makeEngine();
  const r = await prepare({ ...args(e), factsPath: await factsFile(),
    certification: { ...CERT, job_id: "greenhouse:otherco:1" }, cardPayloadHash: "card-hash-1" });
  if (r.ready) throw new Error("a certification for another posting must not authorize");
});
