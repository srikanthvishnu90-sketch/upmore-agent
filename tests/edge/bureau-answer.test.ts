// Credit-bureau guided flows from code (K9: C139/C140/C151/C205), agent-chat/_shared/bureau_answer.ts
// over packages/domain/118-agent-bureaus.js. The submissions are the person's own taps at each bureau;
// the reply carries the real steps and says so. No bureau is connected, so nothing here reads rows.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
const handler = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));
import { bureauReply, isBureauAsk } from "../../supabase/functions/agent-chat/_shared/bureau_answer.ts";

const TODAY = "2026-10-12";

Deno.test("C139: the freeze ask gets all three bureaus, real links and the owner's-tap boundary", () => {
  const r = bureauReply("Freeze my credit. There was a breach at my doctor's office.", TODAY)!;
  assert(r);
  for (const s of ["equifax.com/personal/credit-report-services/credit-freeze", "experian.com/freeze/center.html", "transunion.com/credit-freeze"]) assert(r.includes(s), s);
  assertMatch(r, /the final tap at each bureau are yours/);
});

Deno.test("C140/C151/C205 asks route; bank-charge disputes and card freezes do not", () => {
  assertMatch(bureauReply("There's a collections account on my report that isn't mine.", TODAY)!, /annualcreditreport\.com/);
  assertMatch(bureauReply("Someone opened a card in my name. Fix my identity.", TODAY)!, /identitytheft\.gov/);
  assertMatch(bureauReply("Freeze my child's credit before someone abuses it.", TODAY)!, /protected consumer freeze/);
  for (const t of ["dispute this charge", "freeze my card", "freeze my credit card", "what is a credit freeze", "what is my credit score", "cancel netflix"]) {
    assertEquals(bureauReply(t, TODAY), null, t);
    assertEquals(isBureauAsk(t), false, t);
  }
});

Deno.test("a pasted PIN is refused and never echoed", () => {
  const r = bureauReply("Equifax is frozen, my PIN is 482916", TODAY)!;
  assertMatch(r, /do not send a PIN in this chat/);
  assert(!r.includes("482916"));
});

Deno.test("the handler answers bureau asks from code, ahead of the model-driven answers", () => {
  assertMatch(handler, /bureauReply\(message, localClock\(Date\.now\(\), tz\)\.date\)/);
  assert(handler.indexOf("bureauReply(message") < handler.indexOf("paperTradingReply(message)"), "bureau answers sit in the early direct chain");
});
