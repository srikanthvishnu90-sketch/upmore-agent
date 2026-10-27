// FEATURE 10 follow-up (2026-10-27): a draft-note ask whose recipient is a role with no name and no firm
// ("Draft a short note to a recruiter asking about next steps. Do not send it.") is the networking path's to
// answer. Two steps landed in order:
//   1. The recipient being unresolved must not lose the turn: parseNetworkingAsk used to return null for this
//      phrasing (the role target required a firm; the name target's STOP list rejected "a"/"recruiter"), so
//      the turn fell to the router, which answered with a campaign send-plan and no draft (live v253, msg
//      19441→19442). The parse fix claimed the phrasing and answered with a which-recruiter clarification.
//   2. Judged against the raw ask, a clarification is still not what was requested: the person asked for a
//      short generic note. A recipient is needed before a SEND (approval-gated, off) — not before a DRAFT.
//      So an unresolved role WITH a topic now gets a template draft, composed deterministically with NO model
//      call: placeholders [Name] and [Company] stand in for the recipient, only facts the record carries
//      (a confirmed goal) are woven in, it is presented as held for approval with nothing sent, and it is
//      never persisted as a sendable batch. Naming a specific person remains available as personalisation.
//      The clarification survives only where a draft cannot be composed at all: the ask names no topic.
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

Deno.test("turn: the live string gets a generic draft with placeholders — held, not sent, not persisted, no model call", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  await store.setPrefs(U, { signature: "Alex" }); // on file; the template signs with it, and still drafts to no one
  let calls = 0;
  const counting = async (p: any) => { calls++; return await model(p); };
  const r = await networkingTurn({ message: LIVE, userId: U, threadId: T, now: NOW, state, store, model: counting });
  assert(r, "the networking path must claim the turn, not pass it on");
  assertEquals([r!.intent, r!.status], ["career_networking_draft", "template_draft"]);
  // The requested output: a complete short draft note — subject, greeting, body — with placeholders.
  assertMatch(r!.reply, /Subject: Asking about next steps/);
  assertMatch(r!.reply, /Hi \[Name\],/);
  assertMatch(r!.reply, /I'm writing to ask about next steps at \[Company\]\./);
  assertMatch(r!.reply, /Alex/); // the signature on file signs it
  // Held, not sent; a recipient is needed before a send, not before a draft.
  assertMatch(r!.reply, /held for your approval/);
  assertMatch(r!.reply, /nothing is sent/i);
  assert(!/Which recruiter should the note go to/.test(r!.reply), r!.reply);
  assert(!/wave|send plan/i.test(r!.reply), r!.reply);
  // Personalisation stays available as the secondary line: the matches on file are named.
  assertMatch(r!.reply, /Sam Rivera, Technical Recruiter at Stripe/);
  assertEquals(calls, 0, "no model call: the template is composed deterministically");
  assertEquals(await store.latestBatch(U), [], "no batch or draft is persisted for a send");
  // With drafting off (the live configuration) the same template comes back: it never needed the model.
  const off = await networkingTurn({ message: LIVE, userId: U, threadId: T, now: NOW, state, store, model: null });
  assertEquals([off!.intent, off!.status], ["career_networking_draft", "template_draft"]);
  assertMatch(off!.reply, /Hi \[Name\],/);
  assertEquals(await store.latestBatch(U), []);
});

Deno.test("turn: no matching role in contacts — the generic draft still comes back; the hiring-manager variant is handled the same way", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "contacts.csv", text: CONTACTS }]);
  let calls = 0;
  const counting = async (p: any) => { calls++; return await model(p); };
  const r = await networkingTurn({ message: "draft a note to a recruiter about next steps", userId: U, threadId: T, now: NOW, state, store, model: counting });
  assertEquals([r!.intent, r!.status], ["career_networking_draft", "template_draft"]);
  assertMatch(r!.reply, /Hi \[Name\],/);
  assertMatch(r!.reply, /ask about next steps at \[Company\]/);
  assertMatch(r!.reply, /held for your approval/);
  assertMatch(r!.reply, /nothing is sent/i);
  assertEquals(calls, 0);
  assertEquals(await store.latestBatch(U), []);
  const state2 = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  const hm = await networkingTurn({ message: HM, userId: U, threadId: T, now: NOW, state: state2, store, model: counting });
  assertEquals([hm!.intent, hm!.status], ["career_networking_draft", "template_draft"]);
  assertMatch(hm!.reply, /draft to a hiring manager/);
  assertMatch(hm!.reply, /Hi \[Name\],/);
  assertEquals(calls, 0);
  assertEquals(await store.latestBatch(U), []);
});

Deno.test("turn: no contacts at all — a generic draft needs no recipient on file, so the live string still gets one", async () => {
  const store = memoryOutreachStore(), state: Record<string, unknown> = { profile: { facts: FACTS } };
  const r = await networkingTurn({ message: LIVE, userId: U, threadId: T, now: NOW, state, store, model: null });
  assert(r);
  assertEquals([r!.intent, r!.status], ["career_networking_draft", "template_draft"]);
  assertMatch(r!.reply, /Subject: Asking about next steps/);
  assertMatch(r!.reply, /Hi \[Name\],/);
  assertMatch(r!.reply, /\[Your name\]/); // no signature on file: the sign-off is a placeholder too
  assertEquals(await store.latestBatch(U), []);
});

Deno.test("turn: a confirmed goal on record is woven into the template in the person's own words; an unconfirmed one is not used", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  (state.profile as any).facts = [...FACTS, { id: "g1", kind: "goal", text: "a data analyst internship for summer 2027", status: "confirmed" }];
  const r = await networkingTurn({ message: LIVE, userId: U, threadId: T, now: NOW, state, store, model: null });
  assertEquals(r!.status, "template_draft");
  assertMatch(r!.reply, /I'm looking for a data analyst internship for summer 2027\./);
  const state2 = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  (state2.profile as any).facts = [...FACTS, { id: "g1", kind: "goal", text: "a data analyst internship for summer 2027", status: "confirmed", needs_confirmation: true }];
  const q = await networkingTurn({ message: LIVE, userId: U, threadId: T, now: NOW, state: state2, store, model: null });
  assertEquals(q!.status, "template_draft");
  assert(!/data analyst internship/.test(q!.reply), q!.reply);
  assertMatch(q!.reply, /Hi \[Name\],/);
});

Deno.test("turn: no topic at all — there is no ask to compose, so the clarification is what remains", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  let calls = 0;
  const counting = async (p: any) => { calls++; return await model(p); };
  const r = await networkingTurn({ message: "draft a note to a recruiter", userId: U, threadId: T, now: NOW, state, store, model: counting });
  assertEquals([r!.intent, r!.status], ["career_networking_draft", "which"]);
  assertMatch(r!.reply, /Which recruiter should the note go to\?/);
  assert(!/Subject:/.test(r!.reply), r!.reply);
  assertEquals(calls, 0);
  assertEquals(await store.latestBatch(U), []);
});

Deno.test("control: a role at a named firm is a group ask, not the generic draft — it keeps the group path", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  const r = await networkingTurn({ message: "email a recruiter at Stripe about next steps", userId: U, threadId: T, now: NOW, state, store, model: null });
  assert(r);
  assert(r!.status !== "template_draft", r!.status);
  assert(!/Hi \[Name\],/.test(r!.reply), r!.reply);
});

Deno.test("drafting_off: a resolved ask with drafting off says nothing was written, sent or queued", async () => {
  const store = memoryOutreachStore(), state = await imported([{ name: "Connections.csv", text: LINKEDIN }]);
  const off = await networkingTurn({ message: "email Maya at Stripe about the data analyst role", userId: U, threadId: T, now: NOW, state, store, model: null });
  assertEquals(off!.status, "drafting_off");
  assertMatch(off!.reply, /Drafting emails isn't switched on here yet, so nothing was written or sent, and nothing is queued/);
  assertMatch(off!.reply, /Maya Chen, Data Analyst at Stripe <maya\.chen@stripe\.example>/);
  assertEquals(await store.latestBatch(U), []);
});
