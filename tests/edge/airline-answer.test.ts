// Airline refunds from code (agent-chat/_shared/airline_answer.ts; overnight C1, 2026-10-12): which messages fire, and
// that a fired one answers from the offer book and the person's own rows without sending anything.
// Transactions here are MOCK fixtures; the reader is injected the way the handler injects its observed-rows query.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { airlineReply, isAirlineAsk } from "../../supabase/functions/agent-chat/_shared/airline_answer.ts";
import type { TxRow } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";

const TODAY = "2026-10-12";
const row = (id: string, on: string, cents: number | null, m: string): TxRow => ({ account_id: "MOCK-card", provider_transaction_id: `MOCK-${id}`, amount_cents: cents, posted_on: on, merchant_raw: m, is_pending: false, is_transfer: false });
const ROWS: TxRow[] = [
  row("fare", "2026-09-02", -41260, "DELTA AIR 0062345678901"),
  row("bag", "2026-10-09", -3500, "DELTA AIR BAG FEE"),
  row("broken", "2026-10-10", null, "BROKEN ROW"),
];
const reader = (rows: TxRow[]) => { let calls = 0; const f = async () => { calls++; return rows; }; return { f, calls: () => calls }; };

Deno.test("clear airline-refund messages fire", () => {
  for (const t of [
    "My Delta flight was cancelled, what am I owed?",
    "my united flight got cancelled and they want to give me a voucher, can I get cash instead?",
    "Delta moved my flight 4 hours earlier, can I get a refund?",
    "southwest delayed my flight 5 hours and I didn't fly, refund?",
    "my bag showed up 14 hours late on my jetblue flight, do they owe me the bag fee?",
    "the wifi didn't work on my American Airlines flight, refund?",
    "I paid for an extra legroom seat on my Delta flight and they moved me out of my seat, refund?",
    "I got bumped from my Alaska Airlines flight, what compensation do I get?",
    "I was denied boarding on my Spirit flight, am I owed anything?",
    "Your flight DL 1234 has been cancelled. We have rebooked you on DL 1240.",
  ]) assert(isAirlineAsk(t), t);
});

Deno.test("everything else returns null and never reads the person's transactions", async () => {
  const r = reader(ROWS);
  for (const t of [
    "cancel my delta flight", "find me money", "dispute this charge", "dispute the delta charge", "book me a flight to Denver",
    "what's the cheapest flight to Miami", "I have 200k airline miles, should I use them?", "should I buy travel insurance for my flight",
    "what is the DOT refund rule for cancelled flights?", "refund my Netflix", "cancel netflix and get a refund", "my flight was great",
    "my united flight fare dropped, can I get a refund?", "pay my rent", "how much did I spend on flights this year?", "my bag is too heavy",
    "the delta faucet is broken, refund?", "American Express charged me twice", "united healthcare denied my claim",
  ]) {
    assertEquals(isAirlineAsk(t), false, t);
    assertEquals(await airlineReply(t, TODAY, r.f), null, t);
  }
  assertEquals(r.calls(), 0);
});

Deno.test("a fired message answers from the offer book and the person's own row, and sends nothing", async () => {
  const r = reader(ROWS);
  const reply = (await airlineReply("My Delta flight DL 1234 on Oct 10 was cancelled and I declined the new flight. What am I owed?", TODAY, r.f))!;
  assertEquals(r.calls(), 1);
  assertMatch(reply, /Nothing has been sent/);
  assertMatch(reply, /per DOT final rule requiring automatic refunds of airline tickets and ancillary service fees, checked 2026-10-11/);
  assertMatch(reply, /full ticket price of \$412\.60/);
  assertMatch(reply, /From your linked accounts, as of 2026-10-09\./); // the row with no amount is not read
  assertMatch(reply, /Before you accept a voucher/);
  assert(!/0062345678901|DELTA AIR/.test(reply), reply);
});

Deno.test("nothing linked: the rule is still read, no amount is made up", async () => {
  const reply = (await airlineReply("My bag on my domestic Delta flight on Oct 10 arrived 13 hours after landing, I filed a report. Refund?", TODAY, reader([]).f))!;
  assertMatch(reply, /later than the 12 hours the DOT rule allows on a domestic flight/);
  assertMatch(reply, /No card is linked/);
  assert(!/\$35\.00/.test(reply));
});
