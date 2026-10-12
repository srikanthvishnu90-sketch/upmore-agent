// Unclaimed money answered from code (agent-chat/_shared/unclaimed_answer.ts; packages/domain/91-unclaimed.js): which
// messages fire, and that the person's accounts and transactions are read only for a failed-bank question naming no
// bank. Accounts and rows are MOCK; the readers are injected the way the handler injects its RLS-client reads.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { unclaimedKind, unclaimedReply } from "../../supabase/functions/agent-chat/_shared/unclaimed_answer.ts";

const TODAY = "2026-10-12";
function readers(accounts: any[], rows: any[]) {
  const n = { tx: 0, acc: 0 };
  return { tx: async () => { n.tx++; return rows; }, acc: async () => { n.acc++; return accounts; }, n };
}

Deno.test("only unclaimed-money questions fire; nothing else reads the person's rows", async () => {
  const r = readers([], []);
  for (const t of ["what's my balance", "find me money", "am i owed any money?", "my payment failed at chase", "is my money at fdic insured?", "dispute this charge", "cancel netflix"]) {
    assertEquals(unclaimedKind(t), null, t);
    assertEquals(await unclaimedReply(t, TODAY, r.tx, r.acc), null, t);
  }
  assertEquals(r.n, { tx: 0, acc: 0 });
});

Deno.test("a named bank and a pasted letter read nothing", async () => {
  const r = readers([], []);
  assertMatch((await unclaimedReply("did silicon valley bank fail?", TODAY, r.tx, r.acc))!, /^Silicon Valley Bank \(Santa Clara, CA\) failed on Mar 10, 2023/);
  assertMatch((await unclaimedReply("From: moneymatch@illinoistreasurer.gov\nYou have unclaimed property of $412.", TODAY, r.tx, r.acc))!, /^This matches the official sender on file for Illinois Money Match/);
  assertEquals(r.n, { tx: 0, acc: 0 });
});

Deno.test("'do I have money at a failed bank' reads the person's accounts (closed ones included) and history", async () => {
  const r = readers([{ account_id: "MOCK-old", institution: "Republic First Bank", name: "Old Checking", status: "disconnected" }], []);
  const reply = (await unclaimedReply("do i have money at a failed bank?", TODAY, r.tx, r.acc))!;
  assertEquals(r.n, { tx: 1, acc: 1 });
  assertMatch(reply, /linked account at Republic First Bank/);
  assertMatch(reply, /From your linked accounts and transactions\.$/);
});

Deno.test("the handler asks after the airline rules and before money owed, inside the plain-failure catch", () => {
  const h = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
  const air = h.indexOf("if (!direct) direct = await airlineReply(");
  const unc = h.indexOf("if (!direct) direct = await unclaimedReply(message, today, oldestFirst, () => readOwedAccounts(supabase, user.id));");
  const owed = h.indexOf("if (!direct) direct = await moneyOwedReply(");
  const caught = h.indexOf("} catch { direct = MONEY_UNAVAILABLE; }");
  assert(air > 0 && unc > air && owed > unc && caught > owed);
});
