// WO-023 (architect): Trainee's reply manner. Every canonical example obeys the text rules the head to head grades on,
// never teaches the eval its answers, never claims an action happened, and the closest examples plus the two honesty
// guards reach every turn's system prompt.
import { ALWAYS, MANNER, selectStyle, STYLE_EXAMPLES, styleBlock } from "../../supabase/functions/_shared/agent/style.ts";
import { HYGIENE } from "../../evals/career/compare.ts";
import { agentTurn } from "../../supabase/functions/agent-chat/career_brain.ts";
import set from "../../evals/career/conversations.json" with { type: "json" };

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}

Deno.test("WO-023/S1 every example reads like a text: no hygiene fault, at most one question, under 400 characters", () => {
  eq(new Set(STYLE_EXAMPLES.map((e) => e.id)).size, STYLE_EXAMPLES.length, "unique ids");
  for (const e of STYLE_EXAMPLES) {
    for (const h of HYGIENE) assert(!h.test(e.reply), `${e.id}: ${h.id}`);
    assert((e.reply.match(/\?/g) || []).length <= 1, `${e.id}: at most one question`);
    assert(e.reply.length <= 400, `${e.id}: ${e.reply.length} characters`);
  }
});

Deno.test("WO-023/S2 no example claims an application went out, and none teaches the eval its answers", () => {
  for (const e of STYLE_EXAMPLES) assert(!/\b(i (have )?(applied|submitted|sent)|it'?s been (sent|submitted)|application (was )?(sent|submitted))\b/i.test(e.reply), `${e.id} claims a send`);
  const fixtureCompanies = [...new Set(((set as any).postings as any[]).map((p) => p.company))];
  const evalUsers = ((set as any).items as any[]).flatMap((i) => i.turns.map((t: any) => String(t.user).toLowerCase()));
  for (const e of STYLE_EXAMPLES) {
    for (const c of fixtureCompanies) assert(!e.reply.includes(c) && !e.user.includes(c), `${e.id} uses eval company ${c}`);
    assert(!evalUsers.includes(e.user.toLowerCase()), `${e.id} copies an eval message`);
  }
});

Deno.test("WO-023/S3 the closest examples and the two honesty guards go in; the manner leads", () => {
  const ids = (m: string) => selectStyle(m).map((e) => e.id);
  for (const m of ["tell me about the 2nd one", "", "asdfgh", "apply for me"]) for (const a of ALWAYS) assert(ids(m).includes(a), `${a} for "${m}"`);
  assert(ids("tell me about the 2nd one")[0] === "T02", ids("tell me about the 2nd one").join());
  assert(ids("never show me contract roles ever")[0] === "T04");
  assert(ids("max 1 alert a day")[0] === "T06");
  assert(selectStyle("find jobs alerts apply status practice salary help remember").length <= 6, "at most 4 picked plus the 2 guards");
  const b = styleBlock("any nursing jobs");
  assert(b.startsWith(MANNER) && b.includes("copy the manner, never the facts"));
});

Deno.test("WO-023/S4 every agent turn carries the manner and its examples", async () => {
  let system = "";
  await agentTurn({ message: "what about the second one", history: [], stores: {}, userId: "TEST-U", threadId: "TH", now: Date.UTC(2026, 9, 19),
    model: async (p: any) => { system = p.system; return { content: [{ type: "text", text: "ok" }], stop_reason: "end_turn" }; } });
  assert(system.includes("HOW YOUR REPLIES READ") && system.includes("U: what about the 2nd"), "the manner and the closest example");
});
