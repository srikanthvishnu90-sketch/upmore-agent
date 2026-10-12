// No phone calls (standing rule, CLAUDE.md). An ask for Upmore to place a call ("can you call my bank about the fee")
// went to the model, which could promise a call. Code answers it now, after the capability scripts (so "call comcast and
// negotiate my bill" still gets the script for the person to call). Look-alikes are not taken.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { phoneCallReply, PHONE_CALL_NONE } from "../../supabase/functions/agent-chat/_shared/direct_answers.ts";
import handler from "../../supabase/functions/agent-chat/handler.ts" with { type: "text" };

const ASKS = ["can you call my bank about the fee", "phone verizon and cancel", "call the IRS for me", "please call my landlord", "I need you to call my insurance company",
  "could u call chase for me", "can upmore call them", "hey can you phone my doctor's office about the bill", "will you call comcast on my behalf"];
const NOT = ["call me when my paycheck lands", "what's a call option", "I got a margin call", "my phone bill is too high", "phone bill due date?", "remind me to call mom",
  "should I call my bank", "how do I call the IRS", "what number do I call for chase", "is it better to call or chat with comcast", "buy a call on NVDA", "text me instead of calling"];

Deno.test("an ask for Upmore to place a call is answered from code: no call is made", () => {
  for (const ask of ASKS) assertEquals(phoneCallReply(ask), PHONE_CALL_NONE, ask);
  assert(/don't make phone calls/.test(PHONE_CALL_NONE) && !/I'll call|I will call/i.test(PHONE_CALL_NONE));
});

Deno.test("look-alikes are not taken", () => {
  for (const ask of NOT) assertEquals(phoneCallReply(ask), null, ask);
});

Deno.test("the handler asks it after the capability scripts and before the model", () => {
  const cap = handler.indexOf("const cap = bypassDeterministic ? null : await tryCapabilities("), call = handler.indexOf("phoneCallReply(message)"), model = handler.indexOf("reserveModelCall(");
  assert(cap > 0 && call > cap && model > call, `${cap} ${call} ${model}`);
});
