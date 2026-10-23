// Paid-workflow disable kit (2026-10-23). The fixtures are the exact workflow files on each triggering branch as of
// 2026-10-23 (tests/fixtures/paid-workflows/<branch>__<workflow>.yml). For each: the current copy's exposure (would a push
// reach a paid call?), and the disabled copy: every key-holding job skipped, zero paid calls, the change additive only.
import { assert, assertEquals } from "jsr:@std/assert@1";
import { disable, isAdditive, isDisabled, keyJobs, simulate } from "../scripts/eval/paid-workflow-disable.ts";

const DIR = new URL("./fixtures/paid-workflows/", import.meta.url);
const fx = (f: string) => Deno.readTextFileSync(new URL(f, DIR));
const FIXTURES: { file: string; branch: string; paid: boolean }[] = [
  { file: "eval_router-before-after__router-before-after.yml", branch: "eval/router-before-after", paid: true },
  { file: "ci_brain-eval__brain-eval.yml", branch: "ci/brain-eval", paid: true },
  { file: "ci_brain320-mini-20261021__brain-reliability-320.yml", branch: "ci/brain320-mini-20261021", paid: true },
  { file: "ci_brain320-higher-20261021__brain-reliability-320.yml", branch: "ci/brain320-higher-20261021", paid: true },
  { file: "wo_brain-eval-live-meter-20261021__brain-eval-live-meter-controls.yml", branch: "wo/brain-eval-live-meter-20261021", paid: false },
  // Found by the all-branch sweep (every branch copy holding a paid key whose own push trigger matches its branch):
  { file: "ci_answer-draft__answer-draft-eval.yml", branch: "ci/answer-draft", paid: true },
  { file: "ci_brain-reliability-one-20261021__brain-reliability-one.yml", branch: "ci/brain-reliability-one-20261021", paid: true },
  { file: "ci_brutal-battery__brutal-battery.yml", branch: "ci/brutal-battery", paid: true },
  { file: "ci_trainee-tasks__trainee-tasks.yml", branch: "ci/trainee-tasks", paid: true },
];

Deno.test("inventory: which workflows hold the OpenAI key (the live-meter controls job runs with an empty key and --deny-net)", () => {
  for (const f of FIXTURES) assertEquals(keyJobs(fx(f.file)).length > 0, f.paid, f.file);
});

Deno.test("exposure today, brain-eval on ci/brain-eval: a push runs five paid agent passes and the paid router pass (plus the paid re-score whenever rejudge.txt lists runs)", async () => {
  const r = await simulate(fx("ci_brain-eval__brain-eval.yml"), "ci/brain-eval");
  assertEquals(r.paidCalls.filter((c) => /run\.ts --brain agent/.test(c)).length, 5, JSON.stringify(r.paidCalls));
  assert(r.paidCalls.some((c) => /run\.ts --brain router/.test(c)));
});

Deno.test("exposure today, brain-eval: the paid router step is if: always(), so even a failing first step would not stop it", async () => {
  const withFailingGate = fx("ci_brain-eval__brain-eval.yml").replace("      - name: The key is present\n        run: |\n", "      - name: The key is present\n        run: |\n          exit 3\n");
  const r = await simulate(withFailingGate, "ci/brain-eval");
  assert(r.paidCalls.some((c) => /run\.ts --brain router/.test(c)), "a step-level kill switch is not enough: " + JSON.stringify(r.paidCalls));
});

Deno.test("exposure today, brain-reliability-320: the ARMED mini and higher copies pass their own approval gate (step 1); the inert proposal does not", async () => {
  for (const [file, branch] of [["ci_brain320-mini-20261021__brain-reliability-320.yml", "ci/brain320-mini-20261021"], ["ci_brain320-higher-20261021__brain-reliability-320.yml", "ci/brain320-higher-20261021"]]) {
    const r = await simulate(fx(file), branch);
    assertEquals(r.jobs[0].steps[0].code, 0, `${branch}: the gate passes on approvals baked into the branch copy`);
  }
  const trunkCopy = await simulate(Deno.readTextFileSync(new URL("../.github/workflows/brain-reliability-320.yml", import.meta.url)), "ci/brain320-mini-20261021");
  assert(trunkCopy.jobs[0].steps[0].code !== 0, "the trunk copy (NOT_PINNED / NOT_APPROVED) refuses at step 1");
  assertEquals(trunkCopy.paidCalls, []);
});

Deno.test("disabled copies: every key-holding job is skipped, no step runs, zero paid calls; the patch only adds lines", async () => {
  for (const f of FIXTURES) {
    const before = fx(f.file), after = disable(before);
    assert(isAdditive(before, after), `${f.file}: additive`);
    assert(isDisabled(after), `${f.file}: every key-holding job is disabled`);
    const r = await simulate(after, f.branch);
    assertEquals(r.paidCalls, [], `${f.file}: no paid call`);
    for (const j of r.jobs) if (keyJobs(before).includes(j.name)) { assert(j.skipped, `${f.file}: job ${j.name} skipped`); assertEquals(j.steps.length, 0); }
    if (!f.paid) assertEquals(after, before, `${f.file}: a workflow without the key is left as it is`);
  }
});

Deno.test("the trigger is unchanged by the patch, so pushing the disabled copy runs one job that is skipped at once ($0)", () => {
  for (const f of FIXTURES) {
    const on = (t: string) => t.slice(t.indexOf("\non:"), t.indexOf("\npermissions:"));
    assertEquals(on(disable(fx(f.file))), on(fx(f.file)), f.file);
  }
});

Deno.test("the prepared disabled copies (docs/integration/paid-workflow-disable/) are exactly the patcher's output for each fixture", () => {
  for (const f of FIXTURES) {
    const prepared = Deno.readTextFileSync(new URL(`../docs/integration/paid-workflow-disable/${f.file}`, import.meta.url));
    assertEquals(prepared, disable(fx(f.file)), f.file);
  }
});
