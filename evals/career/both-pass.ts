// WO-061: the combined score. Each judge's verdict per item: gpt-5-mini and gpt-4.1-mini from the run's result file (each
// item's judges[]; a slot that errored is read from evals/career/results/<label>-rejudge-<model>.json when there is one),
// and Instinct, the owner-appointed second judge, from evals/career/instinct/<run>[-pN].json ({ "run", "pass_label",
// "items": [{ "id", "pass", "note" }] }). An item passes only when every judge that scored the run passes it; an item a
// judge did not score, or errored on, is not a pass. One line in SCORE-LOG.md per pass, with each judge's own count.
//   deno run -A evals/career/both-pass.ts evals/career/results/heldout-agent-<label>.json evals/career/instinct/<label>.json
const [resultFile, instinctFile] = Deno.args;
const r = JSON.parse(await Deno.readTextFile(resultFile));
const ins = JSON.parse(await Deno.readTextFile(instinctFile));
const err = (n?: string) => /^judge error/.test(n ?? "");
const verdicts: Record<string, Map<string, boolean | null>> = {};
for (const m of [r.judge_model, r.judge_model_2].filter(Boolean)) {
  let re: any = null;
  try { re = JSON.parse(await Deno.readTextFile(resultFile.replace(/\.json$/, `-rejudge-${m}.json`))); } catch { /* no re-score */ }
  const reBy = new Map<string, any>((re?.items ?? []).map((x: any) => [x.id, x]));
  verdicts[m] = new Map(r.items.map((x: any) => {
    const j = (x.judges ?? []).find((y: any) => y.model === m) ?? (m === r.judge_model && !x.judges ? { pass: x.pass, note: x.note } : null);
    const v = j && !err(j.note) ? !!j.pass : reBy.has(x.id) && !err(reBy.get(x.id).note) ? !!reBy.get(x.id).pass : null;
    return [x.id, v];
  }));
}
verdicts["Instinct"] = new Map((ins.items ?? []).map((x: any) => [String(x.id), x.pass === true]));
const ids: string[] = r.items.map((x: any) => x.id), total = ids.length;
const count = (m: string) => ids.filter((id) => verdicts[m].get(id) === true).length;
const unscored = (m: string) => ids.filter((id) => verdicts[m].get(id) == null).length;
const all = ids.filter((id) => Object.values(verdicts).every((v) => v.get(id) === true));
const judges = Object.keys(verdicts).map((m) => `${m} ${count(m)}${unscored(m) ? ` (${unscored(m)} unscored)` : ""}`).join(", ");
const label = ins.pass_label ?? r.label;
const file = new URL("./SCORE-LOG.md", import.meta.url);
const log = await Deno.readTextFile(file).catch(() => "");
await Deno.writeTextFile(file, log + `| ${new Date().toISOString().slice(0, 19).replace("T", " ")} | ${r.source_commit ?? r.commit} | ${r.set} | ${r.brain} | ${total} | ${all.length} | ${(all.length / total * 100).toFixed(1)}% | COMBINED, every judge passes: ${judges} | ${r.stopped ? "STOPPED" : "no"} | ${ins.run ?? ""} ${label}${r.harness ? `; harness: ${r.harness}` : ""} |\n`);
console.log(`${label}: combined ${all.length}/${total} (${(all.length / total * 100).toFixed(1)}%) · ${judges}`);
console.log(`not passed by every judge: ${ids.filter((id) => !all.includes(id)).map((id) => `${id}(${Object.keys(verdicts).map((m) => `${m.replace("gpt-", "")}${verdicts[m].get(id) === true ? "+" : verdicts[m].get(id) === false ? "-" : "?"}`).join(" ")})`).join(", ")}`);
