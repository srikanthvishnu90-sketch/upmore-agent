// The chat reply guard (agent-chat/_shared/agent.ts checkGrounding) and the person's own rates and score (overnight
// 2026-10-12). Nothing in chat reads a person's APR, utilization, interest rate or credit score, and the guard only
// policed dollar amounts, so "Your APR is 24.99%" or "your score is 720" could go out made up. A percentage or a
// 300-850 score in a sentence addressed to the person ("your ...") must now come from verified data (route cards, the
// finance facts, settlements) or the person's own words; general statements are not touched. Replies are MOCK.
import { assertEquals } from "jsr:@std/assert@1";
import { checkGrounding } from "../../supabase/functions/agent-chat/_shared/agent.ts";

const v = (reply: string, user = "", routes: any[] = [], thread = "") => checkGrounding(reply, routes, user, false, [], thread);
const rates = (xs: string[]) => xs.filter((x) => /^invented_(rate|score):/.test(x));

Deno.test("existing behavior: an invented dollar amount is caught, one the person said is not", () => {
  assertEquals(v("You have $4,200 in savings."), ["invented_amount:$4,200"]);
  assertEquals(v("You have $4,200 in savings.", "I have $4,200 saved"), []);
});

Deno.test("a rate or score about the person that nothing verified contains is caught", () => {
  assertEquals(rates(v("Your APR on that card is 24.99%, so paying it first makes sense.")), ["invented_rate:24.99%"]);
  assertEquals(rates(v("Your utilization is at 31 %, a little high.")), ["invented_rate:31 %"]);
  assertEquals(rates(v("Your credit score is 720, which is good.")), ["invented_score:720"]);
  assertEquals(rates(v("With a FICO of 690 you're close.", "what's my credit score")), []); // no "your": general
  assertEquals(rates(v("Nice, your score of 742 puts you in the very good band.")), ["invented_score:742"]);
});

Deno.test("a rate or score the person gave, a card states, or a finance fact states is quoted, not invented", () => {
  assertEquals(rates(v("At 24.99%, your card costs about that much a year on the balance.", "my apr is 24.99%")), []);
  assertEquals(rates(v("Your score of 720 is in the good band.", "", [], "my score is 720")), []);
  assertEquals(rates(v("You'll earn 5% back on your groceries with this card.", "", [{ id: "r1", title: "5% back on groceries", steps: ["Activate the 5% category"] }])), []);
  assertEquals(rates(v("Keep your utilization under 30%, and under 10% is the lower band.")), []);
  assertEquals(rates(v("Payment history is about 35% of your FICO score.")), []);
});

Deno.test("a percentage worked out from the person's own figures is arithmetic, not invention", () => {
  assertEquals(rates(v("Your rent is 27% of your income.", "I make $5,000 a month and rent is $1,350, what percent is that?")), []);
  assertEquals(rates(v("Your plan went up 41.7%.", "netflix went from $11.99 to $16.99, how much is that?")), []);
  assertEquals(rates(v("That's 100% of your brokerage balance.", "put all $800 of my $800 brokerage cash into GME")), []);
  assertEquals(rates(v("Your rent is 32% of your income.", "I make $5,000 a month and rent is $1,350")), ["invented_rate:32%"]);
});

Deno.test("statements not addressed to the person are not judged here", () => {
  assertEquals(rates(v("The average card APR is around 21%.")), []);
  assertEquals(rates(v("Scores run from 300 to 850.")), []);
});
