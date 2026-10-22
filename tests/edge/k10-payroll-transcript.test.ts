// K10 payroll/benefits/equity preparation through the bundled edge code path
// (agent-chat/_shared/payroll_answer.ts over the router bundle's PayrollBenefits).
// The profile is the STAND-IN fixture (tests/fixtures/k10-standin.json), labeled stand-in in every reply.
import { assert, assertEquals, assertMatch } from "jsr:@std/assert@1";
import { payrollKind, payrollReply } from "../../supabase/functions/agent-chat/_shared/payroll_answer.ts";
import PROFILE from "../fixtures/k10-standin.json" with { type: "json" };
const SRC_HANDLER = Deno.readTextFileSync(new URL("../../supabase/functions/agent-chat/handler.ts", import.meta.url));

const TODAY = "2026-10-12";
const CASES: Array<[string, string, RegExp]> = [
  ["I had a 401(k) at my first job. Find it.", "C101", /\$21,337\.61/],
  ["Submit my FSA expenses before I lose the money.", "C103", /\$222\.18/],
  ["Am I leaving money on the table at work?", "C108", /\$3,117\.32/],
  ["My refund was $4,000 - fix my W-4 withholding.", "C159", /\$18,181\.82/],
  ["Keep my PSLF on track.", "C172", /February 2031/],
  ["Set up and use my dependent care FSA.", "C184", /\$1,482\.50/],
  ["Split my paycheck - $500 a month to the new savings account.", "C196", /\$230\.77 \+ \$2,616\.54 = \$2,847\.31/],
  ["Pick my benefits for next year.", "C202", /\$2,980\.00/],
  ["Keep my equity grants from becoming tax disasters.", "C204", /16 days from today/],
];

Deno.test("all 9 K10 asks answer through the edge wrapper with hand-parity dollars", () => {
  for (const [msg, id, dollars] of CASES) {
    assertEquals(payrollKind(msg), id, msg);
    const reply = payrollReply(msg, TODAY, PROFILE)!;
    assertMatch(reply, dollars, msg);
    assertMatch(reply, /Stand-in data/, msg);
  }
});

Deno.test("unrelated messages fire nothing; with no profile the wrapper never invents facts", () => {
  for (const m of ["what's my balance", "cancel netflix", "what is home equity"]) {
    assertEquals(payrollKind(m), null, m);
    assertEquals(payrollReply(m, TODAY, PROFILE), null, m);
  }
  assertMatch(payrollReply("Pick my benefits for next year.", TODAY, null)!, /don't have the facts/);
});

Deno.test("the handler asks payroll after deadlines, inside the plain-failure catch", () => {
  const h = SRC_HANDLER;
  const dl = h.indexOf("if (!direct) direct = await deadlinesReply(");
  const pr = h.indexOf("if (!direct) direct = payrollReply(message, today, null);");
  const caught = h.indexOf("} catch { direct = MONEY_UNAVAILABLE; }");
  assert(dl > 0 && pr > dl && caught > pr);
});
