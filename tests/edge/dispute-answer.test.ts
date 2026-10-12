// "Dispute this charge" from code (agent-chat/_shared/dispute_answer.ts), live gauntlet S16-17, 2026-10-12.
// Transactions here are MOCK fixtures; the reader is injected the way the handler injects its observed-rows query.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { disputeReply, disputePhotoReply, isDisputeAsk } from "../../supabase/functions/agent-chat/_shared/dispute_answer.ts";
import type { TxRow } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";

const TODAY = "2026-10-12";
const row = (id: string, on: string, cents: number | null, m: string, pending = false): TxRow => ({ account_id: "MOCK-card", provider_transaction_id: `MOCK-${id}`, amount_cents: cents, posted_on: on, merchant_raw: m, is_pending: pending, is_transfer: false });
const ROWS: TxRow[] = [
  row("1", "2026-09-03", -4820, "STREAMFLIX*PREMIUM"),
  row("2", "2026-10-03", -4820, "STREAMFLIX*PREMIUM"),
  row("3", "2026-10-05", -1250, "UBER *TRIP"),
  row("4", "2026-10-08", -6400, "TRADER JOES #552"),
  row("5", "2026-10-09", null, "BROKEN ROW"),
];
const reader = (rows: TxRow[]) => { let calls = 0; const f = async () => { calls++; return rows; }; return { f, calls: () => calls }; };
const SOURCE = "From your linked accounts, as of 2026-10-08.";
const GAUNTLET = { matches: [/[Dd]ispute/, /48\.20|STREAMFLIX|Streamflix/], not: /Done:|[Ff]iled\b(?! for you to)/ };

Deno.test("only dispute words fire, and nothing else reads the person's transactions", async () => {
  const r = reader(ROWS);
  for (const t of ["find me money", "what is a chargeback", "cancel netflix", "connect my fidelity"]) assertEquals(await disputeReply(t, TODAY, r.f), null, t);
  assertEquals(r.calls(), 0);
  for (const t of ["dispute this charge", "chargeback", "charge back the uber ride", "wrong charge", "didn't authorize this", "unauthorized charge", "refund this charge"]) assert(isDisputeAsk(t), t);
});

Deno.test("Streamflix $48.20 (the gauntlet's media case): a pre-filled draft that passes S16-17's checks", async () => {
  const reply = (await disputeReply("dispute the streamflix charge for $48.20 on oct 3", TODAY, reader(ROWS).f))!;
  for (const m of GAUNTLET.matches) assertMatch(reply, m);
  assert(!GAUNTLET.not.test(reply), reply);
  assertMatch(reply, /Nothing has been sent\./);
  assertMatch(reply, /Step 1, ask Streamflix for a refund/);
  assertMatch(reply, /Step 2, if Streamflix says no/);
  assertMatch(reply, /Fair Credit Billing Act/);
  assertMatch(reply, /Regulation E/);
  assert(reply.endsWith(SOURCE), reply);
});

Deno.test("exact match by merchant and by amount", async () => {
  const byName = (await disputeReply("wrong charge at trader joes", TODAY, reader(ROWS).f))!;
  assertMatch(byName, /^Here's a dispute for the Trader Joes charge/);
  assertMatch(byName, /\$64\.00/);
  const byAmount = (await disputeReply("dispute the $12.50 charge", TODAY, reader(ROWS).f))!;
  assertMatch(byAmount, /^Here's a dispute for the Uber charge/);
  for (const r of [byName, byAmount]) { assert(!/Done:|[Ff]iled\b/.test(r)); assert(r.endsWith(SOURCE)); }
});

Deno.test("ambiguous charges come back as a numbered list to pick from", async () => {
  const reply = (await disputeReply("dispute the streamflix charge", TODAY, reader(ROWS).f))!;
  assertMatch(reply, /^I found 2 charges that could be it\./);
  assertMatch(reply, /\n1\. Streamflix, \$48\.20, posted Oct 3, 2026\n2\. Streamflix, \$48\.20, posted Sep 3, 2026\n/);
  assert(reply.endsWith(SOURCE));
});

Deno.test("no such charge: one honest line; nothing linked: says so", async () => {
  assertEquals(await disputeReply("dispute the lyft charge", TODAY, reader(ROWS).f),
    "I couldn't find that charge in your linked accounts (I checked 4 charges through 2026-10-08). Tell me the merchant, amount and date as they show on your statement, or send a photo of it, and I'll draft the dispute.");
  assertMatch((await disputeReply("dispute this charge", TODAY, reader([]).f))!, /^I don't see a connected bank or card/);
});

Deno.test("a photo with nothing in the text goes on to the photo reader (null), never a guess", async () => {
  assertEquals(await disputeReply("dispute this charge", TODAY, reader(ROWS).f, { hasPhoto: true }), null);
  assertMatch((await disputeReply("dispute this charge", TODAY, reader(ROWS).f))!, /^Which charge do you want to dispute\?/);
});

Deno.test("photo fields: matched to a linked charge, or drafted from the photo and said so", async () => {
  const matched = await disputePhotoReply({ merchant: "STREAMFLIX", amount_cents: 4820, date: "2026-10-03" }, TODAY, reader(ROWS).f);
  assertMatch(matched, /Matched to your photo\.\nFrom your linked accounts, as of 2026-10-08\.$/);
  const fromPhoto = await disputePhotoReply({ merchant: "STREAMFLIX", amount_cents: 4820, date: "2026-10-03" }, TODAY, reader([]).f);
  for (const m of GAUNTLET.matches) assertMatch(fromPhoto, m);
  assert(!GAUNTLET.not.test(fromPhoto));
  assertMatch(fromPhoto, /These details come from your photo/);
  assert(fromPhoto.endsWith("From your photo, charge dated 2026-10-03."));
});
