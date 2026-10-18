// WO-003 acceptance tests (architect-authored; Codex makes them pass, never edits them).
// The eval set is architect-owned; the runner scores any brain against it with a rubric judge.
// Run: deno test -A --no-check tests/architect/
import SET from "../../../evals/career/messages.json" with { type: "json" };
import { runEval, type EvalItem } from "../../../evals/career/run.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const items = (SET as any).items as EvalItem[];

Deno.test("WO-003/1 the set is well formed: unique ids, turns, must criteria", () => {
  assert(items.length >= 50, "at least 50 items");
  eq(new Set(items.map((i) => i.id)).size, items.length, "ids are unique");
  for (const i of items) {
    assert(Array.isArray(i.turns) && i.turns.length >= 1 && i.turns.every((t) => typeof t === "string" && t.length > 0), `${i.id} turns`);
    assert(Array.isArray(i.must) && i.must.length >= 1, `${i.id} must`);
  }
});

Deno.test("WO-003/2 no product code contains eval message text (no teaching to the test)", async () => {
  const phrases = items.flatMap((i) => i.turns).filter((t) => t.length >= 25).map((t) => t.toLowerCase());
  const roots = ["supabase/functions", "packages/domain"];
  const hits: string[] = [];
  async function walk(dir: string) {
    for await (const e of Deno.readDir(dir)) {
      const p = `${dir}/${e.name}`;
      if (e.isDirectory) { await walk(p); continue; }
      if (!/\.(ts|js|cjs|json)$/.test(e.name)) continue;
      const src = (await Deno.readTextFile(p)).toLowerCase();
      for (const ph of phrases) if (src.includes(ph)) hits.push(`${p}: "${ph.slice(0, 40)}…"`);
    }
  }
  for (const r of roots) await walk(r);
  eq(hits, [], "eval text found in product code");
});

Deno.test("WO-003/3 runEval runs every item's turns in order, judges the last reply, and summarizes", async () => {
  const sample: EvalItem[] = [
    { id: "A", persona: "x", turns: ["one", "two"], must: ["m"], must_not: [] },
    { id: "B", persona: "x", turns: ["three"], must: ["m"], must_not: [] },
  ];
  const seen: string[][] = [];
  const brain = async (turns: string[]) => { seen.push(turns); return { replies: turns.map((t) => `re:${t}`), state: { n: turns.length } }; };
  const judge = async (item: EvalItem, reply: string, state: any) => ({ pass: item.id === "A" && reply === "re:two" && state.n === 2, failed: item.id === "A" ? [] : ["m"], score: item.id === "A" ? 5 : 2, note: "" });
  const r = await runEval(sample, brain, judge);
  eq(seen, [["one", "two"], ["three"]]);
  eq([r.total, r.passed], [2, 1]);
  eq(r.pass_rate, 0.5);
  eq(r.items.map((x) => [x.id, x.pass, x.score]), [["A", true, 5], ["B", false, 2]]);
  eq(r.items[0].replies, ["re:one", "re:two"], "the whole transcript is kept");
});

Deno.test("WO-003/4 a brain or judge that throws fails that item and never aborts the run", async () => {
  const sample: EvalItem[] = [
    { id: "A", persona: "x", turns: ["boom"], must: ["m"], must_not: [] },
    { id: "B", persona: "x", turns: ["fine"], must: ["m"], must_not: [] },
    { id: "C", persona: "x", turns: ["judge-boom"], must: ["m"], must_not: [] },
  ];
  const brain = async (turns: string[]) => { if (turns[0] === "boom") throw new Error("brain exploded"); return { replies: ["ok"], state: null }; };
  const judge = async (item: EvalItem) => { if (item.id === "C") throw new Error("judge exploded"); return { pass: true, failed: [], score: 5, note: "" }; };
  const r = await runEval(sample, brain, judge);
  eq(r.items.map((x) => [x.id, x.pass]), [["A", false], ["B", true], ["C", false]]);
  assert(/brain exploded/.test(r.items[0].note), "the brain error is recorded");
  assert(/judge exploded/.test(r.items[2].note), "the judge error is recorded");
});
