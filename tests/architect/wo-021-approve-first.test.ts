// WO-021 W1 + W4 (architect): approve first, then apply without asking twice. The engine is a fake here; the real
// engine runs in tests/career-approve-first.test.cjs. Contract: docs/architect/work-orders/WO-021-approve-first.md.
import { factsFromPayload, prepare, runApproved } from "../../workers/career-browser/approve-first.ts";
import { hashApplyPayload } from "../../supabase/functions/_shared/career_apply_store.ts";
import { normLabel } from "../../supabase/functions/_shared/career_apply.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const HASH = "a".repeat(64);
const evidence = {
  approval_hash: HASH,
  readback: { first_name: "TEST Ada", email: "test@example.test", q1: "Yes" },
  fields: [
    { name: "first_name", label: "First name", value: "TEST Ada", factId: "TEST-1" },
    { name: "email", label: "Email", value: "test@example.test", factId: "TEST-2" },
    { name: "q1", label: "Are you authorized to work in the US?", value: "Yes", factId: "TEST-3" },
  ],
  payload: {
    user_id: "TEST-USER",
    posting: "greenhouse:acme:1",
    company: "job-boards.greenhouse.io/acme",
    destination: "https://job-boards.greenhouse.io/acme/jobs/1",
    resume: { filename: "r.pdf", sha256: "b".repeat(64) },
    page_fields: { accountId: "x" },
  },
};
const dry = async () => ({ result: { state: "not_submitted", reason: "dry_run" }, evidence });

Deno.test("WO-021/1 a prepared application carries every answer on its card and the engine's approval in its payload", async () => {
  const r = await prepare({
    url: "https://job-boards.greenhouse.io/acme/jobs/1",
    factsPath: "f",
    resumePath: "r",
    account: { epoch: 3, version: 7 },
    now: Date.parse("2026-10-20T00:00:00Z"),
    runEngine: dry,
  });
  assert(r.ready);
  eq(r.payload.engine_approval, HASH);
  eq(r.payload.fields.length, 3);
  eq(r.payload.privacy_epoch, 3);
  eq(r.payload.expires_at, "2026-10-21T00:00:00.000Z");
  eq(r.hash, await hashApplyPayload(r.payload), "the queue's approval is the hash of exactly this payload");
  for (const f of evidence.fields) assert(r.card.some((l) => l === `${f.label}: ${f.value}`), "card shows " + f.label);
  eq(r.card.filter((l) => l.startsWith("Resume")).length, 1, "the resume appears once, by name");
  assert(
    r.card.some((l) => l.includes("set by the employer's page") && l.includes("accountId")),
    "the employer's own fields are on the card",
  );
  assert(r.card.some((l) => l.includes("job-boards.greenhouse.io/acme/jobs/1")), "card shows where it goes");
});

Deno.test("WO-021/2 a posting with open questions is not prepared", async () => {
  const r = await prepare({
    url: "u",
    factsPath: "f",
    resumePath: "r",
    account: { epoch: 0, version: 0 },
    now: 0,
    runEngine: async () => ({
      result: { state: "not_submitted", reason: "needs_answers", fields: ["Q"] },
      evidence: {},
    }),
  });
  eq(r.ready, false);
  eq(r.result.reason, "needs_answers");
});

Deno.test("WO-021/3 the approved answers become the engine's facts under each question, fact ids kept", () => {
  const f = factsFromPayload({ user_id: "TEST-USER", fields: evidence.fields });
  eq(f.saved[normLabel("Are you authorized to work in the US?")], { value: "Yes", factId: "TEST-3", confirmed: true });
  eq(Object.keys(f.answers).length, 0);
  let threw = false;
  try {
    factsFromPayload({
      user_id: "u",
      fields: [{ label: "Name", value: "A", factId: "1" }, { label: "Name", value: "B", factId: "2" }],
    });
  } catch {
    threw = true;
  }
  assert(threw, "two answers to the same question are refused, never one picked");
});

function harness(over: Partial<Parameters<typeof runApproved>[0]> = {}) {
  const finished: unknown[] = [], calls: string[][] = [];
  const job = {
    id: "J1",
    lease_token: "L1",
    url: "https://x.test/1",
    payload: {
      ...evidence,
      ...{ user_id: "TEST-USER" },
      fields: evidence.fields,
      engine_approval: HASH,
      resume_sha256: "b".repeat(64),
    },
  };
  const deps = {
    claim: async () => [job],
    finish: async (id: string, lease: string, state: string, ev: Record<string, unknown>) => {
      finished.push({ id, lease, state, reason: ev.reason });
    },
    resumeFor: async () => ({ path: "/r.pdf", sha256: "b".repeat(64) }),
    writeFacts: async () => "/facts.json",
    runEngine: async (args: string[]) => {
      calls.push(args);
      return {
        result: { state: "confirmed", reason: "employer confirmation on the page", confirmation_id: "C-1" },
        evidence: {},
      };
    },
    ...over,
  };
  return { deps, finished, calls };
}

Deno.test("WO-021/4 the worker submits an approved application with --approved and records the employer's answer", async () => {
  const h = harness();
  await runApproved(h.deps);
  eq(h.calls.length, 1);
  const a = h.calls[0];
  assert(a.includes("--submit") && a[a.indexOf("--approved") + 1] === HASH, JSON.stringify(a));
  eq(h.finished, [{ id: "J1", lease: "L1", state: "confirmed", reason: "employer confirmation on the page" }]);
});

Deno.test("WO-021/5 a different resume than the approved one stops before the engine runs: not submitted", async () => {
  const h = harness({ resumeFor: async () => ({ path: "/r.pdf", sha256: "c".repeat(64) }) });
  await runApproved(h.deps);
  eq(h.calls.length, 0);
  eq(h.finished, [{ id: "J1", lease: "L1", state: "not_submitted", reason: "RESUME_CHANGED" }]);
});

Deno.test("WO-021/6 an engine that started and gave no result is unknown, never retried as not sent", async () => {
  const h = harness({ runEngine: async () => null });
  await runApproved(h.deps);
  eq((h.finished[0] as any).state, "unknown_outcome");
});

Deno.test("WO-021/7 an application that changed since the approval is passed through as not submitted", async () => {
  const h = harness({
    runEngine: async () => ({
      result: { state: "not_submitted", reason: "APPROVED_APPLICATION_CHANGED" },
      evidence: {},
    }),
  });
  await runApproved(h.deps);
  eq(h.finished, [{ id: "J1", lease: "L1", state: "not_submitted", reason: "APPROVED_APPLICATION_CHANGED" }]);
});
