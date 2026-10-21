// WO-061: the both-pass score. CI's judge (gpt-5-mini) is in the run's result file; Instinct, the owner-appointed second
// judge, records its per-item verdicts in evals/career/instinct/<run>.json ({ "run": "<ci run id>", "items": [{ "id",
// "pass", "note" }] }). An item passes only when both judges pass it; an item Instinct has not scored is not a pass. The
// both-pass score is one line in SCORE-LOG.md, judges "gpt-5-mini + Instinct".
//   deno run -A evals/career/both-pass.ts evals/career/results/heldout-agent-<run>.json evals/career/instinct/<run>.json
const [resultFile, instinctFile] = Deno.args;
const r = JSON.parse(await Deno.readTextFile(resultFile));
const ins = JSON.parse(await Deno.readTextFile(instinctFile));
const byId = new Map<string, { pass: boolean; note?: string }>((ins.items ?? []).map((x: any) => [String(x.id), { pass: x.pass === true, note: x.note }]));
const rows = r.items.map((x: any) => {
  const i = byId.get(x.id);
  return { id: x.id, ci: !!x.pass, instinct: i ? i.pass : null, both: !!x.pass && i?.pass === true };
});
const passed = rows.filter((x: any) => x.both).length, total = rows.length, unscored = rows.filter((x: any) => x.instinct === null).length;
const ciPass = rows.filter((x: any) => x.ci).length, insPass = rows.filter((x: any) => x.instinct === true).length;
const file = new URL("./SCORE-LOG.md", import.meta.url);
let log = await Deno.readTextFile(file).catch(() => "");
const run = String(ins.run ?? "");
log += `| ${new Date().toISOString().slice(0, 19).replace("T", " ")} | ${r.source_commit ?? r.commit} | ${r.set} | ${r.brain} | ${total} | ${passed} | ${(passed / total * 100).toFixed(1)}% | gpt-5-mini (${ciPass}) + Instinct (${insPass}) both-pass${unscored ? `; ${unscored} not scored by Instinct = not passed` : ""} | ${r.stopped ? "STOPPED" : "no"} | ${run} |\n`;
await Deno.writeTextFile(file, log);
console.log(`both-pass ${passed}/${total} (${(passed / total * 100).toFixed(1)}%): gpt-5-mini ${ciPass}/${total}, Instinct ${insPass}/${total}${unscored ? `, ${unscored} unscored` : ""}`);
console.log(`both-fail or disagree: ${rows.filter((x: any) => !x.both).map((x: any) => `${x.id}(${x.ci ? "ci+" : "ci-"}${x.instinct === null ? "ins?" : x.instinct ? "ins+" : "ins-"})`).join(", ")}`);
