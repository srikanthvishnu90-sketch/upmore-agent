// Architect ruling R1 (2026-10-27): contacts belong to the person's account, not the thread, and a contact the person
// told Trainee to forget is NEVER restored by the account merge-back. Before this, persistContacts wrote a thread's whole
// working copy back whenever it differed from the account, so a stale thread (one that loaded the list before the
// forget) put every forgotten row back. Here: forget in thread B, ask in thread A (which still holds the old copy):
// still gone, and the account record stays empty. Also: a name forgotten stays forgotten across a later turn; the
// person sending them again brings them back; another thread writing first is merged, not overwritten; a turn that
// started before an erase writes nothing after it. In-memory stores, synthetic data.
// Run: deno test -A --no-check tests/architect/f10-networking-forget.test.ts
import nodeAssert from "node:assert/strict";
const assertEquals = (a: unknown, b: unknown, m?: string) => nodeAssert.deepStrictEqual(a, b, m);
const assertMatch = (s: string, re: RegExp) => nodeAssert.match(s, re);
import { forgetAsk, networkingTurn } from "../../supabase/functions/_shared/career_networking.ts";
import { memoryOutreachStore, type OutreachStore } from "../../supabase/functions/_shared/career_outreach.ts";
import { contactsOf, type ContactRow } from "../../supabase/functions/_shared/career_contacts.ts";

const ROOT = new URL("../..", import.meta.url).pathname;
const LINKEDIN = await Deno.readTextFile(`${ROOT}tests/fixtures/f10/Connections.csv`);
const CONTACTS = await Deno.readTextFile(`${ROOT}tests/fixtures/f10/contacts.csv`);
const U = "u-1", NOW = Date.parse("2026-10-27T15:00:00Z");
const turn = (store: OutreachStore, threadId: string, state: Record<string, unknown>, message: string, attachments?: { name: string; text: string }[]) =>
  networkingTurn({ message, userId: U, threadId, now: NOW, state, store, model: null, ...(attachments ? { attachments } : {}) });
const names = (rows: ContactRow[]) => [...new Set(rows.map((r) => r.name))].sort();

Deno.test("R1 forget: forgotten in thread B, asked in thread A (a stale copy): still gone, and never written back", async () => {
  const store = memoryOutreachStore();
  const a: Record<string, unknown> = {}, b: Record<string, unknown> = {};
  assertEquals((await turn(store, "t-a", a, "here", [{ name: "Connections.csv", text: LINKEDIN }]))!.status, "imported");
  assertEquals(contactsOf(a).length, 6, "thread A holds its working copy of the 6 rows");
  const gone = await turn(store, "t-b", b, "forget my contacts");
  assertEquals([gone!.intent, gone!.status], ["career_contacts_forget", "forgotten"], gone!.reply);
  assertMatch(gone!.reply, /^Deleted 6 contacts from your contacts, in every conversation\./);
  assertEquals((await store.contactsRecord!(U)).items, [], "the account holds none");
  // Thread A still carries all 6 rows in its own state. Asking there must not restore them.
  const who = await turn(store, "t-a", a, "who do I know at Ramp?");
  assertEquals(who!.status, "no_contacts", who!.reply);
  assertEquals(contactsOf(a), [], "thread A's stale rows were dropped, not merged");
  assertEquals((await store.contactsRecord!(U)).items, [], "nothing was written back to the account (was 0 -> 6 before this fix)");
  const stripe = await turn(store, "t-a", a, "email Maya at Stripe about the data analyst role");
  assertEquals(stripe!.status, "no_contacts", `a forgotten person is never a recipient: ${stripe!.reply}`);
  // A third thread that kept an even older copy of one row: still gone.
  const c: Record<string, unknown> = { contacts: [{ file: "Connections.csv", row: 5, name: "Priya Shah", email: "priya.shah@ramp.example", firm: "Ramp", firm_raw: "Ramp", company: "Ramp", title: "Product Manager", school: "", connected_on: null, verified: true }] };
  assertEquals((await turn(store, "t-c", c, "who do I know at Ramp"))!.status, "no_contacts");
  assertEquals((await store.contactsRecord!(U)).items, []);
});

Deno.test("R1 forget one person by name: gone in every thread; sending them again brings them back", async () => {
  const store = memoryOutreachStore();
  const a: Record<string, unknown> = {}, b: Record<string, unknown> = {};
  await turn(store, "t-a", a, "here", [{ name: "Connections.csv", text: LINKEDIN }, { name: "contacts.csv", text: CONTACTS }]);
  const gone = await turn(store, "t-b", b, "please remove maya chen from my contacts");
  assertEquals(gone!.status, "forgotten", gone!.reply);
  assertMatch(gone!.reply, /^Deleted Maya Chen from your contacts, in every conversation\./);
  const who = await turn(store, "t-a", a, "who do I know at Stripe");
  assertEquals(who!.status, "listed", who!.reply);
  nodeAssert.ok(!/Maya Chen/.test(who!.reply), who!.reply);
  assertMatch(who!.reply, /Lee Park/);
  assertEquals(names((await store.contactsRecord!(U)).items).includes("Maya Chen"), false, "not on the account");
  assertEquals((await store.contactsRecord!(U)).forgotten, ["e:maya.chen@stripe.example"]);
  // Ambiguous and unknown names delete nothing.
  assertEquals((await turn(store, "t-b", b, "remove lee from my contacts"))!.status, "forgotten", "one Lee Park (two rows, one person by name)");
  assertEquals((await turn(store, "t-b", b, "remove nobody here from my contacts"))!.status, "nothing");
  // The person sends the export again: Maya is theirs again, and no longer forgotten.
  await turn(store, "t-b", b, "here it is again", [{ name: "Connections.csv", text: LINKEDIN }]);
  const rec = await store.contactsRecord!(U);
  assertEquals(names(rec.items).includes("Maya Chen"), true, "re-imported on purpose");
  assertEquals(rec.forgotten.includes("e:maya.chen@stripe.example"), false);
  assertMatch((await turn(store, "t-a", a, "who do I know at Stripe"))!.reply, /Maya Chen/);
});

Deno.test("R1 merge-back: another thread writing first is merged, never overwritten (compare-and-set on the record's version)", async () => {
  const inner = memoryOutreachStore();
  let interleave = true;
  // Thread B's import lands between thread A's read of the record and its save.
  const store: OutreachStore = { ...inner, async saveContactsRecord(u, rec, expect) {
    if (interleave) { interleave = false; await turn(inner, "t-b", {}, "add", [{ name: "contacts.csv", text: CONTACTS }]); }
    return await inner.saveContactsRecord!(u, rec, expect);
  } };
  await turn(store, "t-a", {}, "here", [{ name: "Connections.csv", text: LINKEDIN }]);
  const rec = await inner.contactsRecord!(U);
  assertEquals(rec.items.length, 8, `both imports are on the account: ${names(rec.items).join(", ")}`);
  assertEquals(rec.version, 2);
});

Deno.test("R1 forget racing an import: a row of the forgotten person another thread wrote meanwhile is dropped too", async () => {
  const inner = memoryOutreachStore();
  const a: Record<string, unknown> = {};
  await turn(inner, "t-a", a, "here", [{ name: "Connections.csv", text: LINKEDIN }]);
  let interleave = true;
  // Between thread B's read and its save, thread C imports another list that has Maya Chen (same address) again.
  const store: OutreachStore = { ...inner, async saveContactsRecord(u, rec, expect) {
    if (interleave) { interleave = false; await turn(inner, "t-c", {}, "add", [{ name: "more.csv", text: "Name,Company,Email\nMaya Chen,Stripe,maya.chen@stripe.example\nDana Lopez,Plaid,dana.lopez@plaid.example" }]); }
    return await inner.saveContactsRecord!(u, rec, expect);
  } };
  const gone = await turn(store, "t-b", {}, "remove maya chen from my contacts");
  assertEquals(gone!.status, "forgotten", gone!.reply);
  const rec = await inner.contactsRecord!(U);
  assertEquals(rec.items.filter((r) => r.email === "maya.chen@stripe.example"), [], "no row of Maya is left on the account");
  assertEquals(names(rec.items).includes("Dana Lopez"), true, "the other thread's other row is kept");
});

Deno.test("R1 a forget the account did not take is never reported as done", async () => {
  const inner = memoryOutreachStore();
  const a: Record<string, unknown> = {};
  await turn(inner, "t-a", a, "here", [{ name: "Connections.csv", text: LINKEDIN }]);
  const down: OutreachStore = { ...inner, async saveContactsRecord() { throw new Error("store down"); } };
  const r = await turn(down, "t-b", {}, "forget my contacts");
  assertEquals([r!.intent, r!.status], ["career_contacts_forget", "not_saved"], r!.reply);
  assertMatch(r!.reply, /nothing was deleted/);
  assertEquals((await inner.contactsRecord!(U)).items.length, 6, "still there, as the reply says");
});

Deno.test("R1 epoch guard: a turn that started before an erase writes no contacts after it", async () => {
  const store = memoryOutreachStore();
  const a: Record<string, unknown> = {};
  let first = true;
  const erasing: OutreachStore = { ...store, async accountEpoch(u) { if (first) { first = false; return 0; } return 1; } };
  await turn(erasing, "t-a", a, "here", [{ name: "Connections.csv", text: LINKEDIN }]);
  assertEquals((await store.contactsRecord!(U)).items, [], "the import's rows were not written after the erase");
  assertEquals((await store.contactsRecord!(U)).version, 0);
});

Deno.test("R1 forget asks: the phrasings people type, and what is not a forget", () => {
  for (const m of ["forget my contacts", "Delete my contacts.", "pls wipe my contact list", "clear all my connections", "ok remove my imported contacts"]) assertEquals(forgetAsk(m), { all: true }, m);
  for (const m of ["delete my linkedin connections", "forget my LinkedIn contacts", "remove my linked in export"]) assertEquals(forgetAsk(m), { linkedin: true }, m);
  assertEquals(forgetAsk("remove Maya Chen from my contacts"), { name: "maya chen" });
  for (const m of ["forget the sponsorship one", "delete everything", "remove me from your list", "who do I know at stripe", "delete draft 1"]) assertEquals(forgetAsk(m), null, m);
});
