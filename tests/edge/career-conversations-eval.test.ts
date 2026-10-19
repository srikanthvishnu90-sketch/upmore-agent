// WO-019: the conversation eval's own correctness, offline (the scores need the model; these need nothing). The set is
// well formed and its postings are what the product's search returns; the runner grades every checked turn with the
// agent's own earlier replies in view, fails a conversation on any failed turn, judge error or brain error, and grades
// the whole conversation (and its end state) when the item asks.
import set from "../../evals/career/conversations.json" with { type: "json" };
import { convJudgePrompt, runConversations, type ConvItem, type Verdict } from "../../evals/career/run-conversations.ts";
import { memoryPostingsDb, searchWords } from "../../supabase/functions/_shared/career_ingest.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const items = (set as any).items as ConvItem[], postings = (set as any).postings as any[];

Deno.test("WO-019/1 the set: 20 conversations of 2+ turns, unique ids, every one graded somewhere, fixture links only", () => {
  eq(items.length, 20);
  eq(new Set(items.map((i) => i.id)).size, items.length, "unique ids");
  for (const it of items) {
    assert(it.turns.length >= 2, `${it.id}: a conversation has 2+ turns`);
    assert(it.turns.every((t) => typeof t.user === "string" && t.user.trim()), `${it.id}: every turn has the person's words`);
    assert(it.turns.some((t) => (t.must || []).length || (t.must_not || []).length) || (it.whole && ((it.whole.must || []).length || (it.whole.must_not || []).length)), `${it.id}: graded somewhere`);
  }
  for (const p of postings) assert(/^https:\/\/jobs\.example\.test\//.test(p.url) && p.job_id && p.title && p.company && p.location && p.description && p.posted_at, `fixture ${p.job_id}`);
  assert(items.filter((i) => i.turns.length >= 10).length >= 1, "one thread long enough to fall past a 20-message window");
});

Deno.test("WO-019/2 the fixtures are what the product's own search returns", async () => {
  const db = memoryPostingsDb();
  await db.putMany(postings.map((p) => ({ ...p, provider: p.job_id.split(":")[0], board: p.job_id.split(":")[1], last_seen_at: p.first_seen_at, closed_at: null })));
  eq((await db.search(searchWords("data analyst chicago"), 150)).map((p) => p.job_id).sort(), ["greenhouse:northwind:101", "greenhouse:northwind:104", "lever:brightpath:201"]);
  eq((await db.search(searchWords("registered nurse icu detroit"), 150)).map((p) => p.job_id), ["ashby:tidal:502"]);
});

Deno.test("WO-019/3 each checked turn is graded with the agent's own earlier replies in view; unchecked turns are not graded", async () => {
  const it: ConvItem = { id: "T1", theme: "t", persona: "p", turns: [{ user: "find jobs" }, { user: "the second one", must: ["talks about the second posting"] }], whole: { must: ["coherent"] } };
  const prompts: string[] = [];
  const r = await runConversations([it], postings, async () => ({ replies: ["1. Data Analyst at Northwind 2. Data Analyst at BrightPath", "BrightPath wants 1+ year of Python"], state: null }),
    async (p) => { prompts.push(p); return { pass: true, failed: [], score: 5, note: "" }; });
  eq(prompts.length, 2, "turn 2 and the whole; turn 1 has no checks");
  assert(prompts[0].includes("A1: 1. Data Analyst at Northwind") && prompts[0].includes("U2: the second one") && prompts[0].includes("Grade ONLY the agent's reply A2"), prompts[0]);
  assert(!prompts[0].includes("A2: BrightPath") || prompts[0].indexOf("A2:") > prompts[0].indexOf("U2:"), "A2 follows U2");
  assert(prompts[1].includes("Grade the WHOLE conversation"));
  eq([r.passed, r.items[0].turns.map((t) => t.at)], [1, [2]]);
});

Deno.test("WO-019/4 one failed turn, a judge error or a brain error fails the conversation; never a pass by default", async () => {
  const it = items.find((i) => i.id === "C02")!;
  const reply = async () => ({ replies: it.turns.map(() => "ok"), state: null });
  const failTurn3 = async (p: string): Promise<Verdict> => ({ pass: !p.includes("reply A3"), failed: p.includes("reply A3") ? ["x"] : [], score: 2, note: "n" });
  eq((await runConversations([it], postings, reply, failTurn3)).items[0].pass, false);
  eq((await runConversations([it], postings, reply, async () => { throw new Error("bad json"); })).items[0].pass, false);
  const broken = await runConversations([it], postings, async () => { throw new Error("model down"); }, async () => ({ pass: true, failed: [], score: 5, note: "" }));
  eq([broken.items[0].pass, /brain error/.test(broken.items[0].note)], [false, true]);
});

Deno.test("WO-019/5 the whole-conversation grade carries the end state and its expectation", () => {
  const it = items.find((i) => i.id === "C14")!;
  const p = convJudgePrompt({ item: it, postings, users: it.turns.map((t) => t.user), replies: ["a", "b", "c"], at: "whole", state: { alerts: { n: 1 } } });
  assert(p.includes('"alerts":{"n":1}') && p.includes("one alert for data analyst in Chicago with at most 3"), p);
  const turn = convJudgePrompt({ item: it, postings, users: it.turns.map((t) => t.user), replies: ["a", "b", "c"], at: 1, state: { alerts: 1 } });
  assert(turn.includes("(not graded on this turn)") && !turn.includes("U3:"), "a turn sees nothing after itself");
});
