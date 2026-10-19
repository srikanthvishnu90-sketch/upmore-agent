// WO-003 builder tests: the judge prompt carries everything the rubric needs, and the judge's answer is parsed strictly
// (no JSON or no boolean pass is an error, never a silent pass). Run: deno test --no-check tests/edge/eval-judge.test.ts
import { judgePrompt, parseJudge } from "../../evals/career/run.ts";
function assert(v: unknown, m = "assertion failed") { if (!v) throw new Error(m); }
const item = { id: "E1", persona: "nurse", turns: ["hi", "find jobs"], must: ["asks a question"], must_not: ["invents postings"], state: "profile has a draft fact" };

Deno.test("judgePrompt fills every field, including the state expectation", () => {
  const p = judgePrompt(item, "Here are 3 jobs", { profile: { facts: [] } });
  for (const s of ["nurse", "find jobs", "Here are 3 jobs", "asks a question", "invents postings", "profile has a draft fact", "\"facts\":[]"]) assert(p.includes(s), `missing ${s}`);
  assert(!/\{(persona|turns|reply|state|must|must_not|state_expectation)\}/.test(p), "no placeholder left");
});

Deno.test("parseJudge reads fenced or bare JSON and clamps the score", () => {
  const r = parseJudge('```json\n{"pass": false, "failed": ["asks a question"], "score": 9, "note": "no question"}\n```');
  assert(r.pass === false && r.failed[0] === "asks a question" && r.score === 5 && r.note === "no question");
});

Deno.test("parseJudge refuses an answer with no JSON or no boolean pass", () => {
  let n = 0;
  for (const bad of ["looks good to me", '{"pass": "yes"}']) { try { parseJudge(bad); } catch { n++; } }
  assert(n === 2, "both refused");
});
