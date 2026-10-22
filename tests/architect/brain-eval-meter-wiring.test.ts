// The paid eval path is metered (owner, 2026-10-21): a failed cost publication blocks every paid call. No network, no
// provider, no approval is consumed by these tests.
const root = new URL("../../", import.meta.url).pathname;
const ok = (v: unknown, why: string) => { if (!v) throw new Error(why); };
async function deno(args: string[], env: Record<string, string> = {}) {
  const r = await new Deno.Command(Deno.execPath(), { cwd: root, args: ["run", "--no-check", "--allow-read", "--allow-write", "--allow-run=git", "--allow-env", "--deny-net", "--no-prompt", ...args],
    env: { ...env, NO_COLOR: "1" }, clearEnv: true, stdout: "piped", stderr: "piped" }).output();
  return { code: r.code, out: new TextDecoder().decode(r.stdout) + new TextDecoder().decode(r.stderr) };
}
const CORPUS = ["--corpus", "evals/brain-reliability/scenarios320.json", "--manifest", "evals/brain-reliability/manifest320.json"];

Deno.test("meter wiring: the unmetered paid CLI refuses before reading any approval", async () => {
  const dir = await Deno.makeTempDir(), approval = dir + "/absent-approval.json";
  const r = await deno(["evals/brain-reliability/run-comparison.ts", ...CORPUS, "--run-approved", "--model", "gpt-5-mini", "--approval-file", approval, "--out", dir + "/out"]);
  ok(r.code !== 0 && /NOT RUN: a paid arm runs only through evals\/brain-reliability\/live-meter\.ts/.test(r.out), "unmetered paid path still reachable: " + r.out.slice(-400));
  ok(![...Deno.readDirSync(dir)].length, "nothing written");
});

Deno.test("meter wiring: the metered CLI refuses without a publication token, before any approval is consumed or call made", async () => {
  const dir = await Deno.makeTempDir(), approval = dir + "/approval.json";
  await Deno.writeTextFile(approval, JSON.stringify({ owner_approval_ref: "SYN", live_meter_approval_ref: "SYN", model: "gpt-5-mini", cap_usd: 1, comparison_spent_usd: 0 }));
  const r = await deno(["evals/brain-reliability/live-meter.ts", ...CORPUS, "--run-approved", "--model", "gpt-5-mini", "--approval-file", approval, "--out", dir + "/out"],
    { GITHUB_REPOSITORY: "synthetic/eval", GITHUB_RUN_ID: "1", OPENAI_API_KEY: "sk-SYNTHETIC" });
  ok(r.code === 2 && /NOT RUN: GITHUB_TOKEN required/.test(r.out), "ran without a publication token: " + r.out.slice(-400));
  ok([...Deno.readDirSync(dir)].map((e) => e.name).join() === "approval.json", "no journal, no consumed approval");
});

Deno.test("meter wiring: the paid workflow runs only the metered CLI, with its publication token, network and the owner's meter word", async () => {
  const wf = await Deno.readTextFile(root + ".github/workflows/brain-reliability-320.yml");
  ok(!/run-comparison\.ts --run-approved/.test(wf), "the paid workflow still calls the unmetered CLI");
  ok(/evals\/brain-reliability\/live-meter\.ts --run-approved/.test(wf), "the paid workflow does not call the metered CLI");
  ok(/GITHUB_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/.test(wf) && /--allow-net=api\.openai\.com,api\.github\.com/.test(wf), "no publication token or no publication network");
  ok(/contents: write/.test(wf), "the token cannot publish the snapshot");
  ok(/"live_meter_approval_ref":os\.environ\["LIVE_METER_APPROVAL_REF"\]/.test(wf) && /test "\$LIVE_METER_APPROVAL_REF" != "NOT_APPROVED"/.test(wf), "the owner's meter word is not bound into the approval");
});
