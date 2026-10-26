// G4: a cover letter drafted before the person asked (workers/career-browser/prepare-ahead.ts) is shown only if it passes,
// at the moment they ask for it, every check a new draft must pass (essay_draft.ts checkDraft): the employer's AI policy as
// the posting's questions read now, and the person's confirmed facts as they are now. A draft that no longer passes is
// never shown: a new one is written from what is true now, or, under a ban, none. "redo" always writes a new one, and
// only "use N" saves either. The connected flow (flow-connected.test.ts, G4) proves the path on a real database; this file
// proves the re-check, which that flow cannot reach (nothing changes there between drafting and asking). No model, no network.
import { checkDraft } from "../../supabase/functions/_shared/essay_draft.ts";
import {
  type AheadDraft,
  type OpenQuestion,
  type QuestionStore,
  QUESTIONS_INTENT,
  questionsTurn,
  supabaseQuestionStore,
} from "../../supabase/functions/_shared/career_apply_questions.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const T = Date.UTC(2026, 9, 24, 15);
const FACTS = [
  { id: "F-001", kind: "experience", text: "Senior accountant at Brightline Health, 2021 to 2024; closed the monthly books in 5 days instead of 9", needs_confirmation: false, status: "confirmed" },
  { id: "F-002", kind: "project", text: "Built a NetSuite to Snowflake reconciliation in Python that cut manual matching by 40%", needs_confirmation: false, status: "confirmed" },
  { id: "F-003", kind: "education", text: "B.S. Accounting, University of Iowa, 2019", needs_confirmation: false, status: "confirmed" },
  { id: "F-004", kind: "preference", text: "Wants to build finance software used by controllers", needs_confirmation: false, status: "confirmed" },
];
// Written ahead from all four facts.
const AHEAD =
  "At Brightline Health I was the senior accountant who got our monthly close from 9 days to 5. I built a NetSuite to Snowflake reconciliation in Python that cut manual matching by 40%, and I want to build finance software used by controllers at Ramp.";
// Written now, from what is still confirmed (no F-002).
const FRESH =
  "At Brightline Health I was the senior accountant who got our monthly close from 9 days to 5, and I want to build finance software used by controllers at Ramp.";
const BAN = "I confirm that my answers to this application are written in only my own words, without the use of AI tools.";

const letter = (o: Partial<OpenQuestion> = {}): OpenQuestion => ({
  id: "c1", key: "job:00000000000000c1", kind: "essay", label: "Cover letter", type: "textarea", options: [], company: "Ramp",
  job_ids: ["ashby:ramp:1"], misfit: false, answer: null, ...o,
});
function stub(text: string) {
  const calls: unknown[] = [];
  return { calls, model: async (p: unknown) => { calls.push(p); return { content: [{ type: "text", text }], stop_reason: "end_turn" }; } };
}
function fakeStore(rows: OpenQuestion[], ahead: Record<string, AheadDraft>, extra: OpenQuestion[] = []) {
  let shown: any = null, last: string | null = null;
  const all = () => [...rows, ...extra];
  const store: QuestionStore & { setIntent(i: string | null): void } = {
    setIntent(i) { last = i; },
    async open(_u, limit) { return rows.filter((r) => !r.answer).slice(0, limit); },
    async countOpen() { return rows.filter((r) => !r.answer).length; },
    async get(_u, ids) { return all().filter((r) => ids.includes(r.id)); },
    async answer(_u, id, a) { all().find((x) => x.id === id)!.answer = a; },
    async shown() { return shown ? structuredClone(shown) : null; },
    async setShown(_u, s) { shown = structuredClone(s); },
    async lastAssistantIntent() { return last; },
    async onPostings(_u, jobIds) { return all().filter((r) => r.job_ids.some((j) => jobIds.includes(j))); },
    async drafted(_u, ids) { return Object.fromEntries(Object.entries(ahead).filter(([id]) => ids.includes(id))); },
  };
  return store;
}
async function say(store: ReturnType<typeof fakeStore>, message: string, model: ReturnType<typeof stub>, facts: unknown[] = FACTS) {
  const r = await questionsTurn({ message, userId: "u", threadId: "t", now: T, store, draft: { model: model.model, facts: () => facts } });
  if (r) store.setIntent(QUESTIONS_INTENT);
  return r!;
}
const ready = { c1: { text: AHEAD, at: new Date(T - 3600000).toISOString() } };

Deno.test("G4/1 a draft written ahead is said to be ready, shown whole on \"draft 1\" with no model call, and saved only by \"use 1\"", async () => {
  const s = fakeStore([letter()], ready), m = stub("unused");
  const list = await say(s, "what do you need from me", m);
  assert(list.reply.includes(`A draft of 1 is ready, written only from your confirmed facts. Say "draft 1" to read it; nothing is saved until you say "use 1".`), list.reply);
  eq((await say(s, "use 1", m)).status, "draft_none", "unread, it is never saved");
  const read = await say(s, "draft 1", m);
  eq(read.status, "drafted_ahead");
  assert(read.reply.includes(AHEAD), "shown whole");
  eq(m.calls.length, 0, "no model call");
  eq((await s.get("u", ["c1"]))[0].answer, null, "reading saves nothing");
  eq((await say(s, "use 1", m)).status, "answered");
  eq((await s.get("u", ["c1"]))[0].answer, AHEAD);
});

Deno.test("G4/2 a fact the draft used is no longer confirmed: the draft written ahead is never shown; one is written now from what is true", async () => {
  const s = fakeStore([letter()], ready), m = stub(FRESH);
  await say(s, "what do you need from me", m);
  const facts = FACTS.map((f) => f.id === "F-002" ? { ...f, needs_confirmation: true, status: "draft" } : f);
  const r = await say(s, "draft 1", m, facts);
  eq(r.status, "drafted", r.reply);
  assert(!r.reply.includes("NetSuite"), "the stale draft is not shown");
  assert(r.reply.includes(FRESH));
  eq(m.calls.length, 1, "written again, once");
  assert(!JSON.stringify(m.calls[0]).includes("NetSuite"), "the model is not given the unconfirmed fact");
  eq((await say(s, "use 1", m, facts)).status, "answered");
  eq((await s.get("u", ["c1"]))[0].answer, FRESH, "what they read is what is saved");
});

Deno.test("G4/3 the employer's form now bans AI help: the draft written ahead is never shown and none is written", async () => {
  const ban = letter({ id: "b1", key: "job:00000000000000b1", kind: "consent", label: BAN, type: "checkbox", answer: "Yes" });
  const s = fakeStore([letter()], ready, [ban]), m = stub("unused");
  const list = await say(s, "what do you need from me", m);
  assert(list.reply.includes("A draft of 1 is ready"), "the list cannot see the sibling ban; the draft turn checks it");
  const r = await say(s, "draft 1", m);
  eq(r.status, "draft_policy", r.reply);
  assert(!r.reply.includes(AHEAD) && /own words/.test(r.reply), r.reply);
  eq(m.calls.length, 0);
  eq((await say(s, "use 1", m)).status, "draft_none", "nothing to save");
  // The question's own words ban it: no draft is offered at all.
  const own = fakeStore([letter({ label: `Cover letter. ${BAN}` })], ready);
  assert(!(await say(own, "what do you need from me", m)).reply.includes("is ready"));
});

Deno.test("G4/4 \"redo 1\" always writes a new draft, even with one written ahead", async () => {
  const s = fakeStore([letter()], ready), m = stub(FRESH);
  await say(s, "what do you need from me", m);
  eq((await say(s, "draft 1", m)).status, "drafted_ahead");
  const r = await say(s, "redo 1", m);
  eq(r.status, "drafted");
  assert(r.reply.includes(FRESH));
  eq(m.calls.length, 1);
  assert(JSON.stringify(m.calls[0]).includes("Write a different version"), "the earlier one is passed as the one to differ from");
});

Deno.test("G4/5 checkDraft: the same checks as a new draft, no model", async () => {
  const q = letter();
  const deps = { facts: () => FACTS };
  eq((await checkDraft({ q, siblingLabels: [], deps, text: AHEAD })).ok, true);
  const invented = await checkDraft({ q, siblingLabels: [], deps, text: `${AHEAD} I also led the Stripe finance team.` });
  eq([invented.ok, !invented.ok && invented.why], [false, "unverified"]);
  const cut = await checkDraft({ q, siblingLabels: [], deps, text: AHEAD.slice(0, 60) });
  eq(cut.ok, false, "a draft that stops mid-sentence is not shown");
  const thin = await checkDraft({ q, siblingLabels: [], deps: { facts: () => FACTS.slice(0, 1) }, text: AHEAD });
  eq([thin.ok, !thin.ok && thin.why], [false, "thin"]);
  const banned = await checkDraft({ q, siblingLabels: [BAN], deps, text: AHEAD });
  eq([banned.ok, !banned.ok && banned.why], [false, "policy"]);
});

Deno.test("G4/6 the production store reads drafts written ahead through career_apply_question_drafts_as, for the ids asked only", async () => {
  const calls: [string, unknown][] = [];
  const admin = {
    rpc: async (name: string, args: unknown) => {
      calls.push([name, args]);
      return { data: [{ question_id: "c1", text: AHEAD, fact_ids: ["F-001"], drafted_at: "2026-10-24T14:00:00Z" }, { question_id: "c2", text: "  " }], error: null };
    },
  };
  const store = supabaseQuestionStore(admin);
  eq(await store.drafted!("u", []), {}, "no ids, no read");
  eq(calls.length, 0);
  eq(await store.drafted!("u", ["c1", "c2"]), { c1: { text: AHEAD, at: "2026-10-24T14:00:00Z" } }, "an empty draft is no draft");
  eq(calls, [["career_apply_question_drafts_as", { p_user: "u", p_ids: ["c1", "c2"] }]]);
  const failing = supabaseQuestionStore({ rpc: async () => ({ data: null, error: { message: "boom" } }) });
  let threw = false;
  try { await failing.drafted!("u", ["c1"]); } catch { threw = true; }
  assert(threw, "a failed read is an error the turn handles (aheadDrafts offers none), never an empty success");
});
