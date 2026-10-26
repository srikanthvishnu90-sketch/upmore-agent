// FEATURE 9 unit tests: standing needs on the router path (career_account_memory.ts) and stated-fact provenance
// (career_router_evidence.ts evidenceStatedFacts), with in-memory stores. The handler-level proof is
// flow-account-memory.test.ts.
import assertNode from "node:assert/strict";
import { accountMemoryAfterTurn, recordLines, standingAsk, statedFactsBefore } from "../../supabase/functions/_shared/career_account_memory.ts";
import { evidenceStatedFacts } from "../../supabase/functions/_shared/career_router_evidence.ts";
import { memoryStandingStore } from "../../supabase/functions/_shared/agent/memory.ts";
import type { CareerEvent, EventStore } from "../../supabase/functions/_shared/agent/timeline.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const ok = (v: unknown, m?: string) => assertNode.ok(v, m);
const U = "00000000-0000-4000-8000-0000000009f1", T = "00000000-0000-4000-8000-0000000009f2", NOW = Date.parse("2026-10-26T12:00:00Z");
function events(fail = false): EventStore & { rows: CareerEvent[] } {
  const rows: CareerEvent[] = [];
  return { rows, async add(e: CareerEvent) { if (fail) throw new Error("TEST write refused"); rows.push(e); }, async recall() { return rows; } } as any;
}
const catchall = { reply: "I did not catch what to do with that one.", intent: "career_catchall", resultStatus: "awaiting_user" };

Deno.test("standingAsk: a need in their words, never a question, a refusal or an ordinary no", () => {
  for (const [m, text] of [["never send me staffing agencies", "Never send me staffing agencies"], ["Remember that I only want roles in Chicago.", "I only want roles in Chicago"],
    ["from now on, no recruiting firms", "No recruiting firms"], ["I never want contract roles", "I never want contract roles"], ["please don't show me temp agencies", "Please don't show me temp agencies"]]) {
    eq(standingAsk(m)?.text, text, m);
  }
  for (const m of ["no thanks", "what do you remember about me?", "never mind", "remember", "do you avoid staffing agencies?", "", "x".repeat(400)]) eq(standingAsk(m), null, m);
});

Deno.test("a standing need the router did not act on is kept, with its event; one it answered is never taken", async () => {
  const store = memoryStandingStore(), ev = events();
  const r = await accountMemoryAfterTurn({ message: "never send me staffing agencies", userId: U, threadId: T, now: NOW, out: catchall, ctx: {}, statedBefore: [], events: ev, standing: store });
  eq(r.standing, "kept");
  ok(/^Kept on your account for every conversation: "Never send me staffing agencies"\./.test(r.out.reply) && /do not filter on it yet/.test(r.out.reply), r.out.reply);
  eq((await store.standing(U)).map((x) => x.said), ["never send me staffing agencies"]);
  eq(ev.rows.map((e) => e.kind), ["instruction_kept"]);
  // The same need again is not kept twice.
  await accountMemoryAfterTurn({ message: "never send me staffing agencies", userId: U, threadId: T, now: NOW, out: catchall, ctx: {}, statedBefore: [], events: ev, standing: store });
  eq((await store.standing(U)).length, 1);
  // A turn the router answered keeps the router's reply.
  const answered = { reply: "Recorded.", intent: "profile_correction", resultStatus: "completed" };
  const a = await accountMemoryAfterTurn({ message: "remember that I need sponsorship", userId: U, threadId: T, now: NOW, out: answered, ctx: {}, statedBefore: [], events: ev, standing: store });
  eq(a.out, answered); eq(a.standing, null);
});

Deno.test("a standing need that waives the person's yes is refused and said; an unreadable store keeps nothing and says so", async () => {
  const store = memoryStandingStore();
  const r = await accountMemoryAfterTurn({ message: "from now on, just apply without asking me", userId: U, threadId: T, now: NOW, out: catchall, ctx: {}, statedBefore: [], events: events(), standing: store });
  eq(r.standing, "refused"); ok(/^I did not keep that: Not kept: every application/.test(r.out.reply), r.out.reply);
  eq((await store.standing(U)).length, 0);
  const broken = { async standing() { throw new Error("TEST unreadable"); }, async saveStanding() {} };
  const b = await accountMemoryAfterTurn({ message: "never send me staffing agencies", userId: U, threadId: T, now: NOW, out: catchall, ctx: {}, statedBefore: [], events: events(), standing: broken });
  eq(b.standing, "unreadable"); ok(/did not keep this one/.test(b.out.reply), b.out.reply);
});

Deno.test("evidenceStatedFacts: only this turn's facts in their own words get an event; a refused event stamps nothing", async () => {
  const before = [{ kind: "year", value: "sophomore", evidence: "I am a sophomore" }];
  const after = [
    { kind: "year", value: "junior", evidence: "I am a junior" }, // a new value under the same kind: this turn's
    { kind: "majors", value: "computer science", evidence: "majoring in computer science" },
    { kind: "school", value: "TEST University", evidence: "I go to TEST University" }, // not in this message
    { kind: "geography", value: "Chicago", confirmation_event_id: "already" }, // already evidenced
  ];
  const ev = events();
  const r = await evidenceStatedFacts({ userId: U, threadId: T, now: NOW, message: "I am a junior majoring in computer science", before, after, events: ev });
  eq(r, { stamped: 2, untraced: 1, refused: 0 });
  eq(ev.rows.map((e) => [e.kind, (e.detail as any).kind, (e.detail as any).thread_id]), [["fact_confirmed", "year", T], ["fact_confirmed", "majors", T]]);
  ok(after[0].hasOwnProperty("confirmation_event_id") && /owner stated in chat/.test((after[0] as any).provenance));
  ok(!("confirmation_event_id" in after[2]));
  // Unchanged facts on a later turn: nothing new.
  eq(await evidenceStatedFacts({ userId: U, threadId: T, now: NOW, message: "thanks", before: after, after, events: ev }), { stamped: 0, untraced: 0, refused: 0 });
  // A refused event write: counted, nothing stamped.
  const fresh = [{ kind: "level", value: "internship", evidence: "an internship" }];
  eq(await evidenceStatedFacts({ userId: U, threadId: T, now: NOW, message: "I want an internship", before: [], after: fresh, events: events(true) }), { stamped: 0, untraced: 0, refused: 1 });
  ok(!("confirmation_event_id" in fresh[0]));
});

Deno.test("recall: the router's 'nothing on record' becomes the account's record: resume entries, drafts, tracker and standing needs", async () => {
  const store = memoryStandingStore({ [U]: [{ id: "S-001", text: "Never send me staffing agencies", said: "never send me staffing agencies", at: "2026-10-26T00:00:00Z" }] });
  const ctx = { profile: { facts: [{ kind: "education", title: "TEST University, B.S.", status: "confirmed", needs_confirmation: false }, { kind: "skill", text: "Skill: Go", status: "draft", needs_confirmation: true }] },
    trackStore: { rows: [{ company: "Stripe", stage: "Submitted" }] } };
  const out = { reply: "Nothing is on your record yet.\nState the fact in your own words.", intent: "conversation_recall", resultStatus: "awaiting_user" };
  const r = await accountMemoryAfterTurn({ message: "what do you know about me", userId: U, threadId: T, now: NOW, out, ctx, statedBefore: [], events: events(), standing: store });
  eq(r.out.reply.split("\n"), ["Here is what I have on record for you.", "From your resume: 1 confirmed entry (TEST University, B.S.).",
    "1 resume entry is a draft waiting for your yes; a draft is never used.", "Your tracker: 1 application (Stripe, submitted).",
    "Standing instructions you gave me: \"Never send me staffing agencies\".", "Correct any of it in your own words, or tell me what to run on it first."]);
  eq(recordLines({}), []);
  eq(recordLines({ profile: { _fromStatedFacts: true, facts: [{ status: "confirmed", text: "x" }] } }), [], "a per-turn bridge profile is not the person's record");
});

Deno.test("statedFactsBefore: the account's two lists and the thread's copy", () => {
  eq(statedFactsBefore({ stated_facts: { facts: [{ kind: "year", value: "junior" }], keyed: [{ kind: "recruiter", key: "acme", value: "Dana" }] } },
    { stores: { statedFacts: { facts: [{ kind: "school", value: "TEST" }] } } }).map((f) => f.kind), ["year", "recruiter", "school"]);
  eq(statedFactsBefore(null, null), []);
});
