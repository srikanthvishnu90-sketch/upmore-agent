// Win-back watch in chat (agent-chat/_shared/win_back_answer.ts, overnight D4): which messages fire, what each reads,
// the service domains taken from the cancel catalog, and the cancellation records read from the flow state. All rows,
// records and emails are MOCK fixtures.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { winBackReply, readCancellations, serviceDomains } from "../../supabase/functions/agent-chat/_shared/win_back_answer.ts";
// Read as text imports so the suite runs without file permissions (the evidence recorder runs it with none).
import SRC_HANDLER from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const TODAY = "2026-10-12";
const ROWS = [
  { account_id: "mock-card", provider_transaction_id: "m1", posted_on: "2026-08-05", amount_cents: -1599, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false, currency: "USD" },
  { account_id: "mock-card", provider_transaction_id: "m2", posted_on: "2026-09-05", amount_cents: -1599, merchant_raw: "NETFLIX.COM", is_pending: false, is_transfer: false, currency: "USD" },
];
const CANCELS = [{ merchant: "NETFLIX.COM", name: "Netflix", state: "cancelled", cancelled_at: Date.parse("2026-09-20T12:00:00Z"), reference: null }];
const EMAIL = "From: Netflix <info@mailer.netflix.com>\nDate: Oct 10, 2026\nWe miss you! Come back to Netflix for $6.99/month for 3 months, then $15.99/month. Offer ends Nov 15, 2026.";
function readers() {
  const n = { tx: 0, cancels: 0 };
  return { n, tx: async () => { n.tx++; return ROWS as any[]; }, cancels: async () => { n.cancels++; return CANCELS; } };
}

Deno.test("the service domains come from the cancel catalog's own account pages", () => {
  const d = serviceDomains();
  assertEquals([d.netflix, d.hulu, d.disney_plus, d.max, d.peacock, d.paramount_plus, d.spotify], ["netflix.com", "hulu.com", "disneyplus.com", "max.com", "peacocktv.com", "paramountplus.com", "spotify.com"]);
});

Deno.test("a pasted offer reads the rows and the cancellation records once each and answers from them", async () => {
  const r = readers();
  const reply = (await winBackReply(EMAIL, TODAY, r.tx, r.cancels))!;
  assertMatch(reply, /^This email is from Netflix: the sender's address is on netflix\.com/);
  assertMatch(reply, /You cancelled Netflix through Upmore on 2026-09-20/);
  assertMatch(reply, /The offer, per the email you pasted, dated 2026-10-10: \$6\.99 a month for 3 months, then \$15\.99 a month\./);
  assertMatch(reply, /What you paid: \$15\.99 on 2026-09-05, your last Netflix charge before you cancelled/);
  assertMatch(reply, /That's \$9\.00 a month less than you paid/);
  assertMatch(reply, /Whether to resubscribe is your call/);
  assertEquals(r.n, { tx: 1, cancels: 1 });
});

Deno.test("a win-back question reads nothing", async () => {
  const r = readers();
  assertMatch((await winBackReply("watch for win-back offers from netflix", TODAY, r.tx, r.cancels))!, /I can't read your email, so I can't watch your inbox/);
  assertEquals(r.n, { tx: 0, cancels: 0 });
});

Deno.test("other messages are not win-back and read nothing", async () => {
  for (const m of ["what's my balance", "find me money", "cancel netflix", "am i overpaying for streaming", "should i switch peacock to annual", "is there a free alternative to netflix", "target dropped the price from $89.99 to $69.99", "my delta flight was cancelled, they offered a $200 voucher"]) {
    const r = readers();
    assertEquals(await winBackReply(m, TODAY, r.tx, r.cancels), null, m);
    assertEquals(r.n, { tx: 0, cancels: 0 }, m);
  }
});

Deno.test("cancellation records come from every thread's flow state through the person's own client; an error is null", async () => {
  const calls: string[] = [];
  const db = (result: any) => ({ from(t: string) { calls.push(t); const q: any = { select(c: string) { calls.push(`select ${c}`); return q; }, eq(k: string, v: string) { calls.push(`${k}=${v}`); return q; }, limit() { return Promise.resolve(result); } }; return q; } });
  const ok = await readCancellations(db({ data: [{ state: { cancel: { cases: [{ merchant: "HULU", name: "Hulu", state: "cancelled", cancelled_at: 1, otp: { run_id: "x" }, reference: "HL-1" }] } } }, { state: {} }], error: null }), "MOCK-user");
  assertEquals(ok, [{ merchant: "HULU", name: "Hulu", state: "cancelled", cancelled_at: 1, claim: null, reference: "HL-1" }]);
  assertEquals(calls.slice(0, 3), ["agent_flow_state", "select state", "user_id=MOCK-user"]);
  assertEquals(await readCancellations(db({ data: null, error: { message: "down" } }), "MOCK-user"), null);
});

Deno.test("the handler asks win-back before the savings answer, inside the plain-failure catch", () => {
  const h = SRC_HANDLER;
  const wb = h.indexOf("if (!direct) direct = await winBackReply(message, today, oldestFirst, () => readCancellations(supabase, user.id));");
  const subs = h.indexOf("if (!direct) direct = await subscriptionReply(message, today, oldestFirst);");
  const caught = h.indexOf("} catch { direct = MONEY_UNAVAILABLE; }");
  assert(wb > 0 && subs > wb && caught > subs);
});
