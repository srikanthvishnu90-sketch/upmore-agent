// QA diagnostic regression, invented independently of evaluation transcripts.
// Scripted runAgentTurn coverage only; this is not a model-quality measurement.
import { runAgentTurn, type ModelFn, type ToolSpec } from "../../supabase/functions/_shared/agent/loop.ts";

function eq(actual: unknown, expected: unknown, why = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${why}: got ${JSON.stringify(actual)}, expected ${JSON.stringify(expected)}`);
}
function ok(value: unknown, why: string): asserts value { if (!value) throw new Error(why); }
const text = (reply: string) => ({ content: [{ type: "text", text: reply }], stop_reason: "end_turn" });
const save = (pre = "") => ({ content: [...(pre ? [{ type: "text", text: pre }] : []),
  { type: "tool_use", id: "note-1", name: "save_note", input: {} }], stop_reason: "tool_use" });
const FACT = "I coordinate a neighborhood repair club.";
const REQUEST = `${FACT} Save that, and compare a hands-on workshop with a short demonstration for onboarding a new volunteer.`;
const RECEIPT = "I've saved your note. Is that correct?";
const COMPARISON = "A hands-on workshop gives volunteers practice and takes more time. A short demonstration is quicker but gives less practice.";

async function turn(message: string, responses: any[], maxSteps?: number) {
  let saves = 0;
  const payloads: Parameters<ModelFn>[0][] = [];
  const tools: ToolSpec[] = [{ name: "save_note", description: "Save the supplied personal note.", effect: "write_own",
    input_schema: { type: "object", properties: {}, required: [] },
    run: async () => { saves++; return { saved: true, text: FACT }; } }];
  const model: ModelFn = async (payload) => {
    payloads.push(structuredClone(payload));
    const response = responses[Math.min(payloads.length - 1, responses.length - 1)];
    if (response instanceof Error) throw response;
    return response;
  };
  const result = await runAgentTurn({ system: "Answer using supplied facts only.", history: [], message, model, tools, maxSteps,
    ctx: { userId: "SYNTHETIC-RECEIPT-USER", threadId: "SYNTHETIC-RECEIPT-THREAD", now: 0, state: {} } });
  return { result, payloads, saves };
}

Deno.test("receipt completeness: a successful save cannot replace a requested comparison", async () => {
  const { result, payloads, saves } = await turn(REQUEST, [save(), text(RECEIPT), text(COMPARISON)]);
  eq(result.reply, COMPARISON, "the comparison must reach the person"); eq(result.stopped, "final");
  eq(saves, 1); eq(result.tool_calls, [{ name: "save_note", ok: true, effect: "write_own" }]);
  eq(payloads.length, 3); eq(payloads[2].tool_choice, { type: "none" });
  eq(payloads[2].messages, payloads[1].messages, "repair instructions are not user evidence");
  const results = payloads[2].messages.flatMap((m: any) => Array.isArray(m.content) ? m.content : []).filter((b: any) => b.type === "tool_result");
  eq(results.map((b: any) => JSON.parse(b.content)), [{ saved: true, text: FACT }], "the repair retains the successful tool result");
  eq(result.pending_approvals, []);
});

Deno.test("receipt completeness: a successful save cannot replace a requested draft", async () => {
  const message = `${FACT} Keep that and write a two-sentence invitation asking a new volunteer to join a Saturday session.`;
  const draft = "Would you like to join our repair club this Saturday? Come along and try a session with us.";
  const { result, payloads, saves } = await turn(message, [save(), text("Saved: your note. Does this work?"), text(draft)]);
  eq(result.reply, draft); eq(result.stopped, "final"); eq(payloads.length, 3); eq(saves, 1);
  eq(payloads[2].tool_choice, { type: "none" });
});

Deno.test("receipt completeness: a plain fact statement still accepts a backed receipt", async () => {
  const { result, payloads, saves } = await turn(FACT, [save(), text(RECEIPT)]);
  eq(result.reply, RECEIPT); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
});

Deno.test("receipt completeness: a save-only question accepts its backed receipt", async () => {
  const { result, payloads, saves } = await turn(`${FACT} Can you save that?`, [save(), text(RECEIPT)]);
  eq(result.reply, RECEIPT); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
});

Deno.test("receipt completeness: a remember-only question accepts its backed receipt", async () => {
  const { result, payloads, saves } = await turn(`Please remember that ${FACT.replace(/\.$/, "")}?`, [save(), text(RECEIPT)]);
  eq(result.reply, RECEIPT); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
});

Deno.test("receipt completeness: words in the note being saved are not additional requests", async () => {
  for (const message of [
    "Please save my plan for how to welcome volunteers?",
    "Please remember that I explain repair steps to new volunteers?",
  ]) {
    const { result, payloads, saves } = await turn(message, [save(), text(RECEIPT)]);
    eq(result.reply, RECEIPT); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
  }
});

Deno.test("receipt completeness: a persistence question with an additional content request still needs the answer", async () => {
  for (const message of [
    `${FACT} Could you save that and compare a hands-on workshop with a short demonstration?`,
    `${FACT} Please remember that and draft an invitation to a Saturday session?`,
  ]) {
    const answer = message.includes("compare") ? COMPARISON : "Would you like to join our repair club this Saturday?";
    const { result, payloads, saves } = await turn(message, [save(), text(RECEIPT), text(answer)]);
    eq(result.reply, answer); eq(result.stopped, "final"); eq(payloads.length, 3); eq(saves, 1);
    eq(payloads[2].tool_choice, { type: "none" });
  }
});

Deno.test("receipt completeness: recall and separate polar questions still need their requested answer", async () => {
  for (const [message, answer] of [
    [`${FACT} What do you remember about my volunteering?`, "You coordinate a neighborhood repair club."],
    [`${FACT} Can you remember which club I coordinate?`, "You coordinate a neighborhood repair club."],
    [`${FACT} Can you save that? Is a short demonstration quicker than a hands-on workshop?`, COMPARISON],
  ]) {
    const { result, payloads, saves } = await turn(message, [save(), text(RECEIPT), text(answer)]);
    eq(result.reply, answer); eq(result.stopped, "final"); eq(payloads.length, 3); eq(saves, 1);
  }
});

Deno.test("receipt completeness: a concrete question for missing information remains valid after a save", async () => {
  const clarification = "Which two session formats should I compare?";
  const { result, payloads, saves } = await turn(`${FACT} Save that and compare the two session formats.`, [save(), text(clarification)]);
  eq(result.reply, clarification); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
});

Deno.test("receipt completeness: repeated receipts stop honestly after one repair", async () => {
  const { result, payloads, saves } = await turn(REQUEST, [save(), text(RECEIPT)]);
  eq(result.stopped, "incomplete_reply"); eq(payloads.length, 3); eq(saves, 1);
  eq(payloads[2].tool_choice, { type: "none" });
  ok(!/nothing.{0,10}saved/i.test(result.reply), "the failure must acknowledge the completed save");
});

Deno.test("receipt completeness: a repair that ignores text-only mode cannot repeat the write", async () => {
  const { result, payloads, saves } = await turn(REQUEST, [save(), text(RECEIPT), save(COMPARISON)]);
  eq(result.stopped, "incomplete_reply"); eq(payloads.length, 3); eq(saves, 1);
  eq(result.tool_calls.length, 1); eq(result.pending_approvals, []);
});

Deno.test("receipt completeness: exhausted step budget does not accept the receipt as finished work", async () => {
  const { result, payloads, saves } = await turn(REQUEST, [save(), text(RECEIPT)], 2);
  eq(result.stopped, "incomplete_reply"); eq(payloads.length, 2); eq(saves, 1);
});

Deno.test("receipt completeness: a receipt alongside a substantive answer needs no repair", async () => {
  const reply = `${RECEIPT}\n\n${COMPARISON}`;
  const { result, payloads, saves } = await turn(REQUEST, [save(), text(reply)]);
  eq(result.reply, reply); eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
});

Deno.test("receipt completeness: earlier requested content survives a final receipt without another call", async () => {
  const { result, payloads, saves } = await turn(REQUEST, [save(COMPARISON), text(RECEIPT)]);
  ok(result.reply.includes(COMPARISON), "the already-written comparison was lost");
  eq(result.stopped, "final"); eq(payloads.length, 2); eq(saves, 1);
});

Deno.test("receipt completeness: repaired output still passes personal-fact guards", async () => {
  const { result, payloads, saves } = await turn(REQUEST, [save(), text(RECEIPT), text("Your Python skills make the workshop a good choice.")]);
  ok(!result.reply.includes("Python"), "the repair invented a personal skill");
  eq(payloads.length, 3); eq(saves, 1); eq(result.pending_approvals, []);
});
