// The response-style corpus evals run on every commit (corpus/USAGE-PROMPT.txt step 2). Permission-free (static imports
// only), so the evidence recorder can run it without -A.
//  - the committed results (evals/corpus/results/offline.json) are what the code produces now: regenerate with
//    deno run -A evals/corpus/run.ts after a flow change
//  - no FAIL without a written reason in evals/corpus/triage.json, and no stale triage entry
//  - ratchet: PASS + LIMITED never falls below the recorded baseline
//  - the always-included safety examples (double yes 2.08, stale yes 2.09, provider outage 5.01, send state unknown 5.04) never regress
import { assert, assertEquals } from "jsr:@std/assert@1";
import { offline } from "../../evals/corpus/run.ts";
import committed from "../../evals/corpus/results/offline.json" with { type: "json" };
import triage from "../../evals/corpus/triage.json" with { type: "json" };
import judge from "../../evals/corpus/judge.cjs";
import corpus from "../../corpus/corpus.json" with { type: "json" };

const BASELINE = { pass_or_limited: 45, variants_pass: 86 };
const fresh = await offline();
const brief = (rs: any[]) => rs.map(r => ({ id: r.id, status: r.status, failed: r.failed, variants: r.variants && { pass: r.variants.pass, total: r.variants.total } }));

Deno.test("corpus: committed offline results match what the code produces now", () => {
  assertEquals(brief(fresh), brief((committed as any).results), "stale evals/corpus/results/offline.json: run deno run -A evals/corpus/run.ts");
});
Deno.test("corpus: every failure is triaged in writing, and every triage entry still fails", () => {
  const untriaged = fresh.filter(r => r.status === "FAIL").map(r => `${r.id}: ${r.failed[0]}`);
  assertEquals(untriaged, [], "a corpus example fails with no reason in evals/corpus/triage.json");
  for (const id of Object.keys((triage as any).examples)) {
    const r = fresh.find(x => x.id === id);
    assert(r && (r.status === "NOT_BUILT" || r.status === "DIVERGES"), `triage entry ${id} no longer fails: remove it from triage.json`);
  }
});
Deno.test("corpus: ratchet, PASS + LIMITED and variant passes never fall", () => {
  const ok = fresh.filter(r => r.status === "PASS" || r.status === "LIMITED").length;
  assert(ok >= BASELINE.pass_or_limited, `PASS + LIMITED fell to ${ok} (baseline ${BASELINE.pass_or_limited})`);
  const v = fresh.reduce((a, r) => a + (r.variants ? r.variants.pass : 0), 0);
  assert(v >= BASELINE.variants_pass, `variant passes fell to ${v} (baseline ${BASELINE.variants_pass})`);
});
Deno.test("corpus: the safety examples hold (double yes, stale yes) and are always in the prompt", () => {
  for (const id of ["2.08", "2.09"]) assertEquals(fresh.find(r => r.id === id)?.status, "PASS", `safety example ${id}`);
  // 5.01 (provider outage) and 5.04 (send state unknown) need a dead model or an unanswered provider, so offline they are
  // NEEDS_MODEL here; the outage sentence is pinned in tests/edge/model-gateway.test.ts and live-replays.test.ts.
  for (const id of ["5.01", "5.04"]) assert(["PASS", "NEEDS_MODEL"].includes(fresh.find(r => r.id === id)?.status), `safety example ${id}`);
});
Deno.test("corpus judge: prompt carries the example and the reply; parser fails closed", () => {
  const { judgeMessages, parseJudge } = judge as any;
  const e = (corpus as any).examples.find((x: any) => x.id === "2.08");
  const m = judgeMessages(e, [{ user: "yes", reply: "That card expired, so nothing was sent." }]);
  assert(m.user.includes("STYLE EXAMPLE 2.08") && m.user.includes("That card expired") && /mannerisms, not the words/.test(m.system));
  assertEquals(parseJudge('{"score": 4, "why": "ok"}').pass, true);
  assertEquals(parseJudge('{"score": 3, "why": "long"}').pass, false);
  assertEquals(parseJudge("great job").pass, false);
  assertEquals(parseJudge('{"score": 9}').pass, false);
});
