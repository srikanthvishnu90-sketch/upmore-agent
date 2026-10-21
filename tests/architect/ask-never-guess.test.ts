// Ask, never guess (owner goal 2026-10-21): a required application field with no confirmed fact is ASKED of the person —
// every time, every field type — never filled with a guess and never tagged as theirs. Two layers:
//   1. the contract: planForm leaves it in needs (no fact at all) or contractFill turns it into an ask (a fact the contract
//      refuses: quarantined, unconfirmed, another person's), and it is never in fill;
//   2. the cloud worker: the engine's stop on those fields (needs_answers) puts each one to the person as an open
//      question (queue.ask -> career_apply_cloud_ask -> the career_apply_questions row Messages asks), while the lease is
//      held and before finish; an identity number is never asked by text.
// The person's reply comes back as text-answer:<row id> (trustedManifest), the provenance the contract trusts.
// Synthetic values; no network, no model, no browser.
import { contractFill, planForm, trustedManifest } from "../../extension/src/apply_core.ts";
import { runCloudJob } from "../../workers/career-cloud/worker.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
type F = { name: string; label: string; type: string; required: boolean; options: { label: string; value: string }[] };
const opts = (...l: string[]) => l.map((label, i) => ({ label, value: String(i + 1) }));
const OWNER = "TEST-owner", NOW = Date.UTC(2026, 9, 21), JOB = "lever:test-co:ask-1111";
const RESUME = { filename: "TEST-resume.pdf", sha256: "b".repeat(64) };
// One required field per type the forms carry, none of which the person has a confirmed fact for.
const TYPES: F[] = [
  { name: "q_text", label: "Years of experience with SQL", type: "input_text", required: true, options: [] },
  { name: "q_area", label: "Why do you want to work at Test Co?", type: "textarea", required: true, options: [] },
  { name: "q_select", label: "Will you now or in the future require visa sponsorship?", type: "multi_value_single_select", required: true, options: opts("Yes", "No") },
  { name: "q_multi", label: "Which offices could you work from?", type: "multi_value_multi_select", required: true, options: opts("Austin", "Denver", "Remote") },
  { name: "q_radio", label: "Are you legally authorized to work in the United States?", type: "radio", required: true, options: opts("Yes", "No") },
  { name: "q_check", label: "I certify that the information I provided is true", type: "checkbox", required: true, options: opts("Yes") },
  { name: "q_date", label: "Earliest start date", type: "date", required: true, options: [] },
  { name: "q_number", label: "Expected salary (USD)", type: "number", required: true, options: [] },
];
const own = (factId: string, value: string, extra: Record<string, unknown> = {}) =>
  ({ value, factId, confirmed: true, user_id: OWNER, provenance: "owner stated in chat 2026-10-21", confirmation_event_id: `evt-${factId}`, ...extra });
const CLEAN = { user_id: OWNER, answers: { first_name: own("F-001", "Test"), email: own("F-003", "test@example.test") }, saved: {} };

function outcome(schema: F[], file: unknown = CLEAN) {
  const m = trustedManifest({ owner: OWNER, file, rows: [], resume: RESUME });
  const plan = planForm({ userId: OWNER, jobId: JOB, company: "Test Co", family: "lever", schema, answers: m.answers, saved: m.saved, now: NOW });
  const c = contractFill({ schema, plan, manifest: m, resume: RESUME });
  const asked = [...plan.needs.map((q: any) => q.label), ...c.asks.map((q) => q.label)];
  return { filled: c.fill.map((p: any) => p.name), asked };
}

for (const field of TYPES) {
  Deno.test(`ask, never guess / contract: a required ${field.type} with no confirmed fact is asked, never filled`, () => {
    const r = outcome([field]);
    assert(!r.filled.includes(field.name), `${field.type} was filled: ${JSON.stringify(r)}`);
    assert(r.asked.filter((l) => l === field.label).length === 1, `${field.type} is asked exactly once: ${JSON.stringify(r)}`);
  });
}

Deno.test("ask, never guess / contract: a fact the contract refuses (quarantined, unconfirmed, another person's) is asked, not filled", () => {
  const field = TYPES[2]; // sponsorship: maps to the person's sponsorship fact
  for (const bad of [
    own("F-040", "No"), // D-007 quarantined id
    own("F-200", "No", { provenance: "owner-delegated 2026-10-17 (answer-all directive)" }),
    own("F-201", "No", { confirmed: false }),
    own("F-202", "No", { user_id: "TEST-someone-else" }),
    own("F-203", "No", { confirmation_event_id: undefined }),
  ]) {
    const r = outcome([field], { ...CLEAN, answers: { ...CLEAN.answers, sponsorship: bad } });
    assert(!r.filled.includes(field.name) && r.asked.includes(field.label), `${JSON.stringify(bad)} -> ${JSON.stringify(r)}`);
  }
  const ok = outcome([field], { ...CLEAN, answers: { ...CLEAN.answers, sponsorship: own("F-005", "No") } });
  assert(ok.filled.includes(field.name) && !ok.asked.includes(field.label), `a confirmed fact of the person's fills: ${JSON.stringify(ok)}`);
});

Deno.test("ask, never guess / contract: the person's reply to the asked question is trusted as text-answer:<row id>, theirs", () => {
  const field = TYPES[0];
  const key = "label:" + "0".repeat(16); // a reply row the texting side stored (career_apply_questions), keyed by wording
  const m = trustedManifest({ owner: OWNER, file: CLEAN, rows: [{ id: "row-1", key, kind: "screen", answer: "3", answered_at: "2026-10-21T19:00:00Z" }], resume: RESUME });
  const tf = Object.values(m.byFactId).find((x: any) => x.factId === "text-answer:row-1") as any;
  assert(tf && tf.value === "3" && tf.event === "text-answer:row-1" && /^owner answered/.test(tf.provenance), JSON.stringify(m.byFactId));
  assert(field.required);
});

// The cloud worker.
async function sha256Hex(b: Uint8Array) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", b))].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function cloudRun(questions: unknown[], ask?: (q: Record<string, unknown>[]) => Promise<number>) {
  const bytes = new TextEncoder().encode("%PDF-1.4 TEST");
  const sha = await sha256Hex(bytes);
  const calls: string[] = [], asked: Record<string, unknown>[][] = [], finished: any[] = [];
  const job = { id: "job-1", lease_token: "lease-1", user_id: OWNER, company: "Test Co", url: "https://jobs.lever.co/test-co/ask-1111",
    payload: { posting: JOB, engine_approval: "c".repeat(64), resume_sha256: sha, fields: [] } };
  const queue: any = {
    claim: async () => [], gatePresent: async () => true,
    resume: async () => ({ filename: "resume.pdf", sha256: sha, b64: btoa(String.fromCharCode(...bytes)) }),
    finish: async (_j: unknown, state: string, evidence: unknown) => { calls.push("finish"); finished.push({ state, evidence }); },
    ...(ask ? { ask: async (_j: unknown, q: Record<string, unknown>[]) => { calls.push("ask"); asked.push(q); return ask(q); } } : {}),
  };
  const runEngine = async () => ({ result: { state: "not_submitted", reason: "needs_answers", posting: JOB, company: "Test Co", questions } });
  await runCloudJob(job as any, { queue, runEngine: runEngine as any, log: () => {} });
  return { calls, asked, finished };
}
const engineQs = TYPES.map((f) => ({ label: f.label, type: f.type, options: f.options.map((o) => o.label) }));

Deno.test("ask, never guess / cloud: every field type the engine stopped on becomes the person's open question, before finish", async () => {
  const r = await cloudRun(engineQs, async (q) => q.length);
  assert(r.calls.join(",") === "ask,finish", `asked while the lease is held, then finished: ${r.calls}`);
  const labels = r.asked[0].map((q) => q.label);
  for (const f of TYPES) assert(labels.filter((l) => l === f.label).length === 1, `${f.type} asked once: ${JSON.stringify(labels)}`);
  for (const q of r.asked[0]) assert(typeof q.key === "string" && /^(fact|label|job):/.test(q.key as string) && !("answer" in q) && !("value" in q), JSON.stringify(q));
  const sel = r.asked[0].find((q) => q.label === TYPES[2].label)!;
  assert(JSON.stringify(sel.options) === '["Yes","No"]', "the employer's own choices travel with it");
  assert(r.finished[0].state === "not_submitted" && r.finished[0].evidence.asked === TYPES.length, JSON.stringify(r.finished[0]));
});

Deno.test("ask, never guess / cloud: an identity number is never asked by text; a failed ask is recorded, never silent", async () => {
  const ssn = await cloudRun([{ label: "Social Security Number", type: "input_text", options: [] }, ...engineQs.slice(0, 1)], async (q) => q.length);
  assert(!ssn.asked[0].some((q) => /social security/i.test(String(q.label))) && ssn.asked[0].length === 1, JSON.stringify(ssn.asked));
  assert(/never by text/.test(String(ssn.finished[0].evidence.not_asked_by_text)), JSON.stringify(ssn.finished[0].evidence));
  const down = await cloudRun(engineQs, async () => { throw new Error("TEST queue down"); });
  assert(down.finished[0].evidence.asked === 0 && /TEST queue down/.test(String(down.finished[0].evidence.ask_error)), JSON.stringify(down.finished[0].evidence));
  assert(down.finished[0].state === "not_submitted", "nothing sent, nothing guessed");
});
