// WO-061: the score log (owner, 2026-10-21: "one line per eval run: date/time, commit hash, score, set size"). Each result
// file named on the command line adds one line to evals/career/SCORE-LOG.md, never edits an earlier one.
//   deno run -A evals/career/score-log.ts evals/career/results/<label>.json [...] [--run <ci run id>]
export function judgeErrors(r: any): number {
  return (r.items ?? []).filter((x: any) => /^judge error/.test(x.note ?? "") || (x.judges ?? []).some((j: any) => /^judge error/.test(j.note ?? ""))).length;
}
if (import.meta.main) {
const args = [...Deno.args];
const ri = args.indexOf("--run"), run = ri >= 0 ? args.splice(ri, 2)[1] : "";
const file = new URL("./SCORE-LOG.md", import.meta.url);
let log = "";
try { log = await Deno.readTextFile(file); } catch { /* first line */ }
if (!log.trim()) log = "# Brain score log (WO-061)\n\nOne line per eval run, appended by CI; never edited. The bar (D-030): 95% on the held-out set, both-pass with Instinct, on the live build.\n\n| run at (UTC) | brain commit | set | brain | set size | passed | score | judges | stopped | CI run |\n|---|---|---|---|---|---|---|---|---|---|\n";
for (const f of args) {
  const r = JSON.parse(await Deno.readTextFile(f));
  const judges = [r.judge_model, r.judge_model_2].filter(Boolean).join(" + ") + " (alone; the score is both-pass with Instinct)";
  // A judge that errored scored nothing: the run is not a score (run 39541224991 logged 0/38 when its second judge failed every call).
  const errs = judgeErrors(r);
  log += `| ${String(r.run_at).slice(0, 19).replace("T", " ")} | ${r.source_commit ?? r.commit} | ${r.set} | ${r.brain} | ${r.total} | ${r.passed} | ${(r.pass_rate * 100).toFixed(1)}% | ${judges} | ${r.stopped ? "STOPPED" : errs ? `NOT A SCORE: ${errs} judge errors` : "no"} | ${run} |\n`;
}
await Deno.writeTextFile(file, log);
console.log(log.trim().split("\n").slice(-args.length).join("\n"));
}
