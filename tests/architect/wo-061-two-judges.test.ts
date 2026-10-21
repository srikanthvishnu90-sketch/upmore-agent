// WO-061 (owner, 2026-10-21): two independent judges; an item passes only when both pass it; a judge that errors fails it.
import { bothJudges } from "../../evals/career/run.ts";
function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
Deno.test("WO-061/J1 an item passes only when both judges pass it; their verdicts and reasons are both kept", () => {
  const pass = { pass: true, failed: [], score: 4, note: "ok" }, fail = { pass: false, failed: ["asks one question"], score: 2, note: "two questions" };
  const both = bothJudges([{ model: "gpt-5-mini", v: pass }, { model: "gpt-4.1-mini", v: pass }]);
  assert(both.pass && both.judges.length === 2, JSON.stringify(both));
  for (const [a, b] of [[pass, fail], [fail, pass], [fail, fail]]) {
    const r = bothJudges([{ model: "gpt-5-mini", v: a }, { model: "gpt-4.1-mini", v: b }]);
    assert(!r.pass && r.failed.includes("asks one question") && r.score === 2 && /FAIL/.test(r.note), JSON.stringify(r));
  }
  assert(!bothJudges([]).pass, "no judge, no pass");
});
