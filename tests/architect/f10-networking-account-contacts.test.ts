// FEATURE 10 follow-up (PR #214): contacts are the ACCOUNT's, not the thread's. Outreach records have always
// been keyed by user id in the outreach store; contacts lived only in the thread's state, so a list imported
// in one thread was invisible in another thread of the same person. Here: one shared outreach store, two
// thread states — what one thread imports, the other thread answers from; a row only a thread holds joins
// the account instead of being lost; another account sees none of it. In-memory stores, synthetic data.
// Run: deno test -A --no-check tests/architect/f10-networking-account-contacts.test.ts
import nodeAssert from "node:assert/strict";
const assert = (v: unknown, m?: string) => nodeAssert.ok(v, m);
const assertEquals = (a: unknown, b: unknown, m?: string) => nodeAssert.deepStrictEqual(a, b, m);
const assertMatch = (s: string, re: RegExp) => nodeAssert.match(s, re);
import { networkingTurn } from "../../supabase/functions/_shared/career_networking.ts";
import { memoryOutreachStore } from "../../supabase/functions/_shared/career_outreach.ts";
import { contactsOf, type ContactRow } from "../../supabase/functions/_shared/career_contacts.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const LINKEDIN = await Deno.readTextFile(`${ROOT}tests/fixtures/f10/Connections.csv`);
const CONTACTS = await Deno.readTextFile(`${ROOT}tests/fixtures/f10/contacts.csv`);
const U = "u-1", U2 = "u-2", NOW = Date.parse("2026-10-25T15:00:00Z");
const FACTS = [
  { id: "f1", kind: "education", school: "TEST University", degree: "B.S. Computer Science", status: "confirmed" },
  { id: "f2", kind: "experience", title: "Software Engineering Intern", company: "TEST Systems Inc", status: "confirmed" },
];

Deno.test("F10 account contacts: imported in one thread, answered from in another thread of the same account", async () => {
  const store = memoryOutreachStore();
  const stateA: Record<string, unknown> = {};
  const imp = await networkingTurn({ message: "here are my connections", userId: U, threadId: "t-a", now: NOW, state: stateA, store, model: null, attachments: [{ name: "Connections.csv", mime: "text/csv", text: LINKEDIN }] });
  assertEquals(imp!.status, "imported");
  assertEquals(contactsOf(stateA).length, 6);
  // The account itself now holds the list (the outreach store is keyed by user id, like every outreach record).
  assertEquals((await (store as any).contacts(U)).length, 6, "the account store holds the imported contacts");
  // A second thread of the same person starts with no contacts in its thread state — and still answers from them.
  const stateB: Record<string, unknown> = { profile: { facts: FACTS } };
  const who = await networkingTurn({ message: "who do I know at Stripe?", userId: U, threadId: "t-b", now: NOW, state: stateB, store, model: null });
  assertEquals(who!.status, "listed", who!.reply);
  assertMatch(who!.reply, /You have 4 contacts at Stripe/);
  assertMatch(who!.reply, /Lee Park/);
  assertEquals(contactsOf(stateB).length, 6, "the second thread's working copy was hydrated from the account");
  // And a draft ask in the second thread resolves recipients from the first thread's import (the signature is
  // the account's too — outreach prefs — so no signature gate stands in the way here).
  await store.setPrefs(U, { signature: "Jordan Lee\nDePaul University" });
  const draft = await networkingTurn({ message: "email Maya at Stripe about the data analyst role", userId: U, threadId: "t-b", now: NOW, state: stateB, store, model: null });
  assertEquals(draft!.status, "drafting_off", draft!.reply);
  assertMatch(draft!.reply, /Maya Chen/);
});

Deno.test("F10 account contacts: an import in the second thread grows the same account list", async () => {
  const store = memoryOutreachStore();
  const stateA: Record<string, unknown> = {}, stateB: Record<string, unknown> = {};
  await networkingTurn({ message: "here are my connections", userId: U, threadId: "t-a", now: NOW, state: stateA, store, model: null, attachments: [{ name: "Connections.csv", mime: "text/csv", text: LINKEDIN }] });
  const imp = await networkingTurn({ message: `add these\n${CONTACTS}`, userId: U, threadId: "t-b", now: NOW, state: stateB, store, model: null });
  assertEquals(imp!.status, "imported");
  assertEquals((await (store as any).contacts(U)).length, 8, "both threads' imports are one account list");
  const who = await networkingTurn({ message: "who do I know at Stripe?", userId: U, threadId: "t-a", now: NOW, state: stateA, store, model: null });
  assertEquals(who!.status, "listed");
  assertEquals(contactsOf(stateA).length, 8, "the first thread now sees the second thread's import too");
});

Deno.test("F10 account contacts: a row only the thread holds joins the account, and another account sees none", async () => {
  const store = memoryOutreachStore();
  const legacy: ContactRow = { file: "what you typed in chat", row: 1, name: "Maya Chen", email: "maya@stripe.example", firm: "Stripe", firm_raw: "Stripe", company: "Stripe", title: "", school: "", connected_on: null, verified: true };
  const state: Record<string, unknown> = { contacts: [legacy] };
  const who = await networkingTurn({ message: "who do I know at Stripe?", userId: U, threadId: "t-a", now: NOW, state, store, model: null });
  assertEquals(who!.status, "listed", who!.reply);
  const held = await (store as any).contacts(U);
  assertEquals(held.length, 1, "the thread-only row was kept and joined the account");
  assertEquals(held[0].email, "maya@stripe.example");
  // Another account, same store: nothing.
  const other: Record<string, unknown> = {};
  const none = await networkingTurn({ message: "who do I know at Stripe?", userId: U2, threadId: "t-c", now: NOW, state: other, store, model: null });
  assertEquals(none!.status, "no_contacts");
  assertEquals((await (store as any).contacts(U2)).length, 0);
});
