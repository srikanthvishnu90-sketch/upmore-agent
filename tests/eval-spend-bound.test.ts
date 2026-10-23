// The eval runner's provable spend bound (2026-10-23; the parent's review, seconded by Codex: a fixed reserve is an
// estimate, not a bound). Unit tests of the bound and the in-flight guard, then the real evals/career/run.ts end to end
// with fetch to api.openai.com replaced by tests/fixtures/openai-mock-preload.ts: no request leaves the machine.
import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { callBoundMicros, MAX_JUDGE_INPUT_BYTES, newSpendGuard } from "../evals/career/run.ts";
import { PRICES, REASONING_HEADROOM } from "../supabase/functions/_shared/model_gateway.ts";

const ROOT = new URL("..", import.meta.url).pathname;

Deno.test("one judge call's bound: every input byte at the input price + the output cap (with reasoning headroom) at the output price", () => {
  // gpt-5-mini: 16384 x $0.25/M + (400 + 512) x $2.00/M = 4096 + 1824 micros
  assertEquals(callBoundMicros(PRICES["gpt-5-mini"], MAX_JUDGE_INPUT_BYTES, 400 + REASONING_HEADROOM), 5920);
  // gpt-4.1-mini: 16384 x $0.40/M + 400 x $1.60/M = 6553.6 + 640 -> 7194 micros (rounded up)
  assertEquals(callBoundMicros(PRICES["gpt-4.1-mini"], MAX_JUDGE_INPUT_BYTES, 400), 7194);
  assertThrows(() => callBoundMicros(PRICES["no-such-model"], 10, 10), Error, "unpriced");
  assertThrows(() => callBoundMicros(PRICES["gpt-5-mini"], 10, 0), Error, "no output cap");
});

Deno.test("the guard: reservations are all-or-nothing, a failed call is charged its whole bound, an over-bound call is a violation", () => {
  const g = newSpendGuard(10_000);
  assert(g.reserve([4000, 4000]));
  assertEquals(g.exposure(), 8000);
  assert(!g.reserve([1000, 1001]), "2001 more would pass 10000");
  assertEquals(g.exposure(), 8000, "a refused reservation reserves nothing");
  g.settle(4000, 300);            // succeeded: its bound is replaced by what it cost
  g.settle(4000, null);           // failed or unknown usage: charged in full
  assertEquals(g.settled, 4300); assertEquals(g.unmetered, 4000); assertEquals(g.reserved, 0);
  const h = newSpendGuard(10_000);
  h.reserve([100]); h.settle(100, 101);
  assertEquals(h.violations.length, 1); assert(h.refused);
});

type Run = { code: number; out: string; calls: { model: string; max_completion_tokens: number; bytes: number }[]; result: any };
async function run(args: string[], env: Record<string, string>): Promise<Run> {
  const dir = await Deno.makeTempDir();
  const log = `${dir}/calls.log`, label = `bound-test-${crypto.randomUUID().slice(0, 8)}`;
  const o = await new Deno.Command("deno", {
    args: ["run", "-A", "--preload", `${ROOT}tests/fixtures/openai-mock-preload.ts`, `${ROOT}evals/career/run.ts`, "--brain", "router", "--set", "heldout",
      "--exclude-file", `${ROOT}evals/career/heldout-burned.json`, "--label", label, ...args],
    env: { OPENAI_API_KEY: "mock-not-a-key", EVAL_JUDGE_MODEL: "gpt-5-mini", EVAL_JUDGE_MODEL_2: "gpt-4.1-mini", MOCK_OPENAI_LOG: log, ...env }, cwd: ROOT,
  }).output();
  const out = new TextDecoder().decode(o.stdout) + new TextDecoder().decode(o.stderr);
  let calls: any[] = []; try { calls = Deno.readTextFileSync(log).trim().split("\n").filter(Boolean).map((l) => JSON.parse(l)); } catch { /* no calls */ }
  const file = `${ROOT}evals/career/results/${label}.json`;
  let result: any = null; try { result = JSON.parse(Deno.readTextFileSync(file)); Deno.removeSync(file); } catch { /* none */ }
  await Deno.remove(dir, { recursive: true });
  return { code: o.code, out, calls, result };
}

Deno.test("parent finding 3 (pre-run): a run budget under the proven worst case is NOT RUN, with zero provider calls", async () => {
  const r = await run(["--run-budget-usd", "0.39"], {});
  assertEquals(r.code, 2, r.out);
  assert(/NOT RUN: the worst case is \$0\.393420 \(30 items x \$0\.013114\), over the \$0\.39 run budget/.test(r.out), r.out);
  assertEquals(r.calls.length, 0);
  const plan = await run(["--plan-only"], {});
  assertEquals(plan.code, 0); assert(/^EXPOSURE_USD 0\.393420 /m.test(plan.out), plan.out); assertEquals(plan.calls.length, 0);
});

Deno.test("a covered run completes: every call stays under its bound, and the recorded cost and exposure are within the budget", async () => {
  const r = await run(["--run-budget-usd", "0.3935"], {});
  assertEquals(r.code, 0, r.out);
  assertEquals(r.calls.length, 60, "two judges x 30 items");
  assert(r.calls.every((c) => c.bytes <= MAX_JUDGE_INPUT_BYTES), "no request above the byte bound was sent");
  assertEquals(new Set(r.calls.map((c) => `${c.model}:${c.max_completion_tokens}`)), new Set(["gpt-5-mini:912", "gpt-4.1-mini:400"]), "the output caps the bound assumes are the ones sent");
  assertEquals(r.result.guard.violations, []);
  assert(r.result.guard.settled_usd <= r.result.run_budget_usd);
  assertEquals(r.result.exposure_bound_usd, 0.39342);
});

Deno.test("in flight: a call billed above its bound (the bound was wrong) stops the run at the next item; not a score", async () => {
  const r = await run(["--run-budget-usd", "0.3935"], { MOCK_OPENAI: "overbill" });
  assertEquals(r.code, 3, r.out);
  assertEquals(r.calls.length, 2, "the two judges of the first item, then stop");
  assert(r.result.stopped && /more than its bound/.test(r.result.stopped), r.result?.stopped);
  assertEquals(r.result.guard.violations.length, 2);
});

Deno.test("in flight: a failed call (HTTP 500) or an unreadable response is charged its whole bound and recorded as unmetered spend", async () => {
  for (const mode of ["fail", "garbage"]) {
    const r = await run(["--run-budget-usd", "0.3935", "--only", "H001,H002"], { MOCK_OPENAI: mode });
    assertEquals(r.calls.length, 4, `${mode}: ${r.out}`);
    // 2 items x (5920 + bound of the actual request for gpt-4.1-mini...) : each failed call is charged its bound for its real bytes
    assert(r.result.cost_usd.unmetered_bound > 0, `${mode}: unmetered spend is recorded`);
    assertEquals(r.result.cost_usd.judge, 0, `${mode}: the meter saw no usage`);
    assert(r.result.guard.settled_usd === r.result.cost_usd.unmetered_bound, `${mode}: everything charged is the bound`);
  }
});

Deno.test("in flight: a judge request over the byte bound is never sent; the run stops, not a score", async () => {
  const r = await run(["--run-budget-usd", "0.3935"], { EVAL_MAX_JUDGE_INPUT_BYTES: "200" });
  assertEquals(r.code, 3, r.out);
  assertEquals(r.calls.length, 0, "nothing was sent");
  assert(/over the 200-byte bound: not sent/.test(r.result.stopped), r.result.stopped);
});

Deno.test("the knob can only lower the bound: a larger EVAL_MAX_JUDGE_INPUT_BYTES leaves the worst case unchanged", async () => {
  const plan = await run(["--plan-only"], { EVAL_MAX_JUDGE_INPUT_BYTES: "10000000" });
  assert(/^EXPOSURE_USD 0\.393420 /m.test(plan.out), plan.out);
});

Deno.test("the agent brain has no pre-run bound: --run-budget-usd and --plan-only refuse it", async () => {
  const o = await new Deno.Command("deno", { args: ["run", "-A", "--preload", `${ROOT}tests/fixtures/openai-mock-preload.ts`, `${ROOT}evals/career/run.ts`, "--brain", "agent", "--set", "heldout", "--run-budget-usd", "5", "--label", "x"],
    env: { OPENAI_API_KEY: "mock-not-a-key" }, cwd: ROOT }).output();
  assertEquals(o.code, 2);
  assert(/no pre-run bound/.test(new TextDecoder().decode(o.stdout)));
});
