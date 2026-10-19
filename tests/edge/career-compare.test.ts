// WO-023 part A: the head-to-head runner's own correctness, offline (scores need the judge's key; these need nothing).
// The judge is blind and grades every contestant on the same replies-only checks; Trainee's end state is its own line;
// an outside transcript that skips a conversation is "not recorded", never a failure; a judge error is a failure; text
// hygiene is counted in code; the testers' kit is what the set says.
import set from "../../evals/career/conversations.json" with { type: "json" };
import SCRIPT from "../../evals/career/compare/SCRIPT.md" with { type: "text" };
import TEMPLATE from "../../evals/career/compare/transcripts/TEMPLATE.json" with { type: "json" };
import {
  checkRecorded, DIMENSIONS, HYGIENE, hygiene, kit, opening, parseRubric, recordedBrain, repliesOnly, type Rubric, rubricPrompt,
  runContestant, scorecard,
} from "../../evals/career/compare.ts";
import type { ConvItem, Verdict } from "../../evals/career/run-conversations.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const items = (set as any).items as ConvItem[], postings = (set as any).postings as any[];

Deno.test("WO-023/1 the rubric is blind, names all six dimensions, and sees the whole transcript", () => {
  const p = rubricPrompt({ postings, users: ["find me data analyst jobs in chicago", "the second one"], replies: ["1. A\n2. B", "B is..."] });
  for (const d of DIMENSIONS) assert(p.includes(`- ${d}:`), d);
  assert(p.includes("U2: the second one") && p.includes("A2: B is..."), "the whole transcript");
  for (const name of ["Trainee", "Instinct", "Claude", "Dots", "ChatGPT", "OpenAI"]) assert(!p.includes(name), `the judge must not see "${name}"`);
  eq(DIMENSIONS, ["grammar", "structure", "listening", "comprehension", "tasks", "memory"]);
});

Deno.test("WO-023/2 a rubric is 1-5 per dimension; null only where no task or memory was at stake", () => {
  const r = parseRubric('x {"grammar":5,"structure":4,"listening":3,"comprehension":4.4,"tasks":null,"memory":2,"note":"n"} y');
  eq([r.grammar, r.structure, r.listening, r.comprehension, r.tasks, r.memory], [5, 4, 3, 4, null, 2]);
  for (const bad of ['{"grammar":null,"structure":4,"listening":3,"comprehension":4,"tasks":1,"memory":2}', '{"grammar":6,"structure":4,"listening":3,"comprehension":4,"tasks":1,"memory":2}', "no json"]) {
    let threw = false;
    try { parseRubric(bad); } catch { threw = true; }
    assert(threw, bad);
  }
});

Deno.test("WO-023/3 text hygiene is counted in code: each planted fault is caught, a clean text is not", () => {
  const faults: Record<string, string> = {
    markdown: "## Jobs\n**Northwind**", too_long: "x".repeat(1601), ai_talk: "As an AI, I can't apply.", filler_opener: "Great question! Here are two.",
    many_questions: "Where? When? How much?", non_answer: "I didn't catch that. Try naming the job.", empty: "  ",
  };
  eq(Object.keys(faults).sort(), HYGIENE.map((h) => h.id).sort(), "every rule has a planted fault");
  for (const [id, text] of Object.entries(faults)) eq(hygiene([text]).hits[id], 1, id);
  const clean = hygiene(["Two in Chicago:\n1. Data Analyst, Northwind Health ($72k-$88k)\n2. Data Analyst, BrightPath (pay not listed)\nWant alerts for these?"]);
  eq(Object.values(clean.hits).reduce((a, b) => a + b, 0), 0);
});

Deno.test("WO-023/4 a transcript needs its metadata and one reply per message; what it skips is not recorded, not failed", () => {
  const ok = { agent: "Claude (claude.ai)", recorded_by: "TEST", recorded_at: "2026-10-20", how: "website, fresh chat", replies: { C01: ["a", "b", "c"], C07: ["x"] } };
  const c = checkRecorded(ok, items);
  eq(c.ok, ["C01"]);
  assert(c.problems.some((p) => /C07: needs exactly 2 replies/.test(p)), c.problems.join("; "));
  const bare = checkRecorded({ ...ok, agent: "", replies: { C99: ["a"] } } as any, items);
  assert(bare.problems.includes('missing "agent"') && bare.problems.some((p) => /C99: no such conversation/.test(p)), bare.problems.join("; "));
});

const fakeJudge = (failOn?: RegExp) => async (prompt: string): Promise<Verdict> => {
  if (failOn && failOn.test(prompt)) return { pass: false, failed: ["planted"], score: 1, note: "planted failure" };
  return { pass: true, failed: [], score: 5, note: "ok" };
};
const fakeRubric = async (): Promise<Rubric> => ({ grammar: 4, structure: 5, listening: 3, comprehension: 4, tasks: null, memory: 2, note: "n" });

Deno.test("WO-023/5 every contestant is graded on replies only; Trainee's end state is its own line; outside agents have none", async () => {
  const pick = items.filter((i) => ["C01", "C14"].includes(i.id));
  const seen: string[] = [];
  const judge = async (p: string) => { seen.push(p); return fakeJudge(/at most 3 instant alerts/)(p); };
  const brain = async (users: string[]) => ({ replies: users.map(() => "ok"), state: { alerts: { rows: {} } } });
  const t = await runContestant({ name: "trainee-agent", agent: "TEST", brain, stateful: true, items: pick, postings, judge, rubricJudge: fakeRubric });
  eq(t.replies, { passed: 2, total: 2, failing: [] }, "replies are graded without the end state");
  eq(t.state, { passed: 0, total: 1, failing: ["C14"] }, "C14's end state is graded on its own line");
  const outside = await runContestant({ name: "claude", agent: "TEST", brain, stateful: false, items: pick, postings, judge: fakeJudge(/at most 3 instant alerts/), rubricJudge: fakeRubric });
  eq(outside.state, null);
  eq(outside.replies.passed, 2, "an outside agent is never failed on an end state it cannot have");
  eq(repliesOnly(pick[1]).state, undefined);
  eq(t.rubric, { grammar: 4, structure: 5, listening: 3, comprehension: 4, tasks: null, memory: 2 });
});

Deno.test("WO-023/6 a recorded transcript plays back by the person's words; a judge error fails; the scorecard says coverage", async () => {
  const rec = { agent: "Claude (claude.ai)", recorded_by: "TEST", recorded_at: "2026-10-20", how: "website", replies: { C01: ["1. A\n2. B", "B is", "needs SQL"] } };
  const brain = recordedBrain(rec, items);
  eq((await brain(items[0].turns.map((t) => t.user))).replies[2], "needs SQL");
  let threw = "";
  try { await brain(items[1].turns.map((t) => t.user)); } catch (e) { threw = (e as Error).message; }
  eq(threw, "not recorded");
  const broken = await runContestant({ name: "claude", agent: rec.agent, brain, stateful: false, items: [items[0]], postings,
    judge: async () => { throw new Error("judge down"); }, rubricJudge: fakeRubric });
  eq(broken.replies.passed, 0, "a judge error is a failure, never a pass");
  const md = scorecard({ label: "TEST", commit: "abc", judge: "TEST", results: [broken], total: items.length });
  assert(md.includes(`| claude (Claude (claude.ai)) | 1/${items.length} | 0/1 (0%) | n/a |`), md);
  assert(/blind: it never sees which agent wrote the replies/.test(md));
});

Deno.test("WO-023/7 the testers' kit is generated from the set: the same opening for every agent, every message verbatim", () => {
  const k = kit(set as any);
  eq(SCRIPT, k.script, "evals/career/compare/SCRIPT.md is stale: run deno run -A evals/career/compare.ts --kit");
  eq(JSON.stringify(TEMPLATE, null, 1) + "\n", k.template, "TEMPLATE.json is stale");
  for (const it of items) for (const t of it.turns) assert(SCRIPT.includes(t.user), `${it.id}: "${t.user}" verbatim`);
  const o = opening(postings);
  assert(SCRIPT.includes(o), "the opening message");
  assert(/never claim you did it/.test(o) && postings.every((p) => o.includes(p.description)), "same world, same honesty rule");
});

Deno.test("WO-023/8 the set grades task creation and adjustment, a constraint past the window, and listening", () => {
  const byTheme = Object.fromEntries(items.map((i) => [i.id, i]));
  for (const id of ["C21", "C22", "C25"]) assert(byTheme[id].state, `${id} checks the alert it actually left`);
  assert(byTheme.C23.turns.length * 2 > 20, "C23's constraint is stated more than 20 messages before it is needed");
  assert(/sponsorship/.test(byTheme.C23.turns[0].user) && byTheme.C23.turns.at(-1)!.must!.some((m) => /sponsorship/.test(m)));
  assert(byTheme.C24.turns[0].must!.some((m) => /all five points/.test(m)));
  for (const p of postings) assert(!/sponsor/i.test(p.description), "no fixture says it sponsors, so any claim that one does is invented");
});
