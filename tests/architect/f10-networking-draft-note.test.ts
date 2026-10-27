// FEATURE 10 follow-up (2026-10-27): a draft-note ask whose recipient is a role with no name and no firm
// ("Draft a short note to a recruiter asking about next steps. Do not send it.") is the networking path's to
// answer: the recipient is unresolved, so the reply asks which specific person — naming the matches in the
// person's own contacts — and says the note will be drafted and held for approval. It must never fall through
// to a send plan, and it must never be silence. Before the fix, parseNetworkingAsk returned null for this
// phrasing (the role target required a firm; the name target's STOP list rejected "a"/"recruiter"), so the
// turn fell to the router, which answered with a campaign send-plan and no draft (live v253, msg 19441→19442).
// Run: deno test -A --no-check tests/architect/f10-networking-draft-note.test.ts
import nodeAssert from "node:assert/strict";
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);
const assertEquals = (a: unknown, b: unknown, m?: string) => nodeAssert.deepStrictEqual(a, b, m);
const assertMatch = (s: string, re: RegExp) => nodeAssert.match(s, re);
import { networkingTurn, parseNetworkingAsk } from "../../supabase/functions/_shared/career_networking.ts";
import { memoryOutreachStore } from "../../supabase/functions/_shared/career_outreach.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const LINKEDIN = await Deno.readTextFile(`${ROOT}tests/fixtures/f10/Connections.csv`);
const CONTACTS = await Deno.readTextFile(`${ROOT}tests/fixtures/f10/contacts.csv`);
const U = "u-1", T = "t-1", NOW = Date.parse("2026-10-27T07:00:00Z");
const FACTS = [
  { id: "f1", kind: "education", school: "TEST University", degree: "B.S. Computer Science", status: "confirmed" },
  { id: "f2", kind: "experience", title: "Software Engineering Intern", company: "TEST Systems Inc", status: "confirmed" },
];
const LIVE = "Draft a short note to a recruiter asking about next steps. Do not send it.";
const HM = "Write a short message to the hiring manager asking about next steps — don't send";
// The scripted model, same shape as f10-networking's: writes from the recipient row and the ask it was given.
const said = (payload: any) => String(payload.messages?.[0]?.content ?? "");
const model = async (payload: any) => {
  const p = said(payload), first = /- name: (\S+)/.exec(p)![1], topic = /ASK ABOUT[^\n]*\n- (.+)/.exec(p)?.[1];
  const ask = topic ? `ask about ${topic}` : "hear how you got started";
  return { content: [{ type: "text", text: `Subject: A quick question\n\nHi ${first},\n\nI'd be grateful for 15 minutes to ${ask}. Would you be open to a short call?` }], stop_reason: "end_turn" };
};
async function imported(files: { name: string; text: string }[]): Promise<Record<string, unknown>> {
  const state: Record<string, unknown> = { profile: { facts: FACTS } };
  await networkingTurn({ message: "x", userId: U, threadId: T, now: NOW, state, store: memoryOutreachStore(), model: null,
    attachments: files.map((f) => ({ name: f.name, text: f.text })) });
  return state;
}

Deno.test("parse: a role recipient with no firm is a draft ask, recipient unresolved; the do-not-send tail is not part of the topic", () => {
  assertEquals(parseNetworkingAsk(LIVE), { kind: "draft", topic: "next steps", target: { by: "role", role: "recruiter", count: 1, firm: null } });
  assertEquals(parseNetworkingAsk("draft a note to a recruiter"), { kind: "draft", topic: null, target: { by: "role", role: "recruiter", count: 1, firm: null } });
  assertEquals(parseNetworkingAsk(HM), { kind: "draft", topic: "next steps", target: { by: "role", role: "hiring manager", count: 1, firm: null } });
  // Not claimed by this branch: an unnamed person who is not a role, and asks the f10 suite already locks as null.
  assertEquals(parseNetworkingAsk("draft a note to a friend about my search"), null);
  assertEquals(parseNetworkingAsk("email my resume to them"), null);
});

Deno.test("turn: the live string gets a clarification naming the matches on file — no draft, no plan, no model call", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  await store.setPrefs(U, { signature: "Alex" }); // a resolved ask could draft with this on file; this one must clarify first
  let calls = 0;
  const counting = async (p: any) => { calls++; return await model(p); };
  const r = await networkingTurn({ message: LIVE, userId: U, threadId: T, now: NOW, state, store, model: counting });
  assert(r, "the networking path must claim the turn, not pass it on");
  assertEquals([r!.intent, r!.status], ["career_networking_draft", "which"]);
  assertMatch(r!.reply, /Which recruiter should the note go to\?/);
  assertMatch(r!.reply, /Sam Rivera, Technical Recruiter at Stripe/);
  assertMatch(r!.reply, /held for your approval/);
  assertMatch(r!.reply, /nothing is sent/i);
  assert(!/wave|send plan/i.test(r!.reply), r!.reply);
  assertEquals(calls, 0, "no model call: nothing is drafted until the recipient is one specific person");
  assertEquals(await store.latestBatch(U), []);
  // With drafting off (the live configuration) the same clarification comes first: drafting_off is not what
  // this phrasing reaches, because the recipient is resolved before any drafting is considered.
  const off = await networkingTurn({ message: LIVE, userId: U, threadId: T, now: NOW, state, store, model: null });
  assertEquals([off!.intent, off!.status], ["career_networking_draft", "which"]);
});

Deno.test("turn: no matching role in contacts — the clarification says what it needs; the hiring-manager variant is handled the same way", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "contacts.csv", text: CONTACTS }]);
  let calls = 0;
  const counting = async (p: any) => { calls++; return await model(p); };
  const r = await networkingTurn({ message: "draft a note to a recruiter about next steps", userId: U, threadId: T, now: NOW, state, store, model: counting });
  assertEquals([r!.intent, r!.status], ["career_networking_draft", "which"]);
  assertMatch(r!.reply, /There's no recruiter in your 2 contacts yet, so I don't have one specific person to draft to/);
  assertMatch(r!.reply, /held for your approval; nothing is sent/);
  assertEquals(calls, 0);
  assertEquals(await store.latestBatch(U), []);
  const state2 = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  const hm = await networkingTurn({ message: HM, userId: U, threadId: T, now: NOW, state: state2, store, model: counting });
  assertEquals([hm!.intent, hm!.status], ["career_networking_draft", "which"]);
  assertMatch(hm!.reply, /There's no hiring manager in your 6 contacts yet/);
  assertEquals(calls, 0);
});

Deno.test("turn: no contacts at all — the live string gets the plain no-contacts answer, not silence", async () => {
  const store = memoryOutreachStore(), state: Record<string, unknown> = { profile: { facts: FACTS } };
  const r = await networkingTurn({ message: LIVE, userId: U, threadId: T, now: NOW, state, store, model: null });
  assert(r);
  assertEquals([r!.intent, r!.status], ["career_networking_draft", "no_contacts"]);
  assertMatch(r!.reply, /haven't sent me any contacts yet/);
});

Deno.test("drafting_off: a resolved ask with drafting off says nothing was written, sent or queued", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  const off = await networkingTurn({ message: "email Maya at Stripe about the data analyst role", userId: U, threadId: T, now: NOW, state, store, model: null });
  assertEquals(off!.status, "drafting_off");
  assertMatch(off!.reply, /Drafting emails isn't switched on here yet, so nothing was written or sent, and nothing is queued/);
  assertMatch(off!.reply, /Maya Chen, Data Analyst at Stripe <maya\.chen@stripe\.example>/);
  assertEquals(await store.latestBatch(U), []);
});
