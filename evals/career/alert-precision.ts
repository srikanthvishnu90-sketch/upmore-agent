// WO-037: alert precision and recall on the 200-role labeled set. The alert gate (career_alerts.ts matchPosting, the
// persona's stated keywords, place and relevance floor) against the labels a person gave with
// scripts/career/label-alerts.ts. Only human-labeled rows count; with none it says NOT_RUN. The target (precision 90%+
// before launch) is met only on human labels. --assumed also scores the architect's proposed labels, printed as ASSUMED.
//   deno run -A evals/career/alert-precision.ts [--assumed] [--json out.json]
import { type LabelFile, type Persona, type Row, score, STRATA } from "./alert-labels/label_set.ts";

const dir = new URL("./alert-labels/", import.meta.url);
const load = async (f: string) => JSON.parse(await Deno.readTextFile(new URL(f, dir)));
const rows: Row[] = (await load("candidates.json")).rows_data;
const personas: Persona[] = (await load("personas.json")).personas;
const empty: LabelFile = { kind: "human", note: "", labels: {} };
const human: LabelFile = await load("labels.human.json").catch(() => empty);
if (human.kind !== "human") throw new Error("labels.human.json must be kind human");

const pct = (x: number | null) => (x === null ? "n/a" : `${(x * 100).toFixed(1)}%`);
function report(tag: string, labels: LabelFile) {
  const all = score(rows, labels, personas);
  if (all.status === "NOT_RUN") { console.log(`${tag} NOT_RUN: 0 of ${rows.length} rows labeled`); return all; }
  const ci = all.precision_ci95 ? ` (95% CI ${pct(all.precision_ci95[0])}-${pct(all.precision_ci95[1])})` : "";
  console.log(`${tag} precision ${pct(all.precision)}${ci}, recall ${pct(all.recall)} on ${all.labeled} labeled rows (${all.skipped_unlabeled} unlabeled skipped): tp ${all.tp} fp ${all.fp} fn ${all.fn} tn ${all.tn}`);
  for (const p of personas) {
    const s = score(rows.filter((r) => r.persona === p.id), labels, personas);
    if (s.labeled) console.log(`${tag}   ${p.id} precision ${pct(s.precision)} recall ${pct(s.recall)} (tp ${s.tp} fp ${s.fp} fn ${s.fn} tn ${s.tn})`);
  }
  for (const st of STRATA) {
    const s = score(rows.filter((r) => r.stratum === st), labels, personas);
    if (s.labeled) console.log(`${tag}   ${st}: labeled match ${s.tp + s.fn} of ${s.labeled}`);
  }
  console.log(`${tag} target precision >= 90%: ${all.precision !== null && all.precision >= 0.9 ? "met" : "not met"}${tag === "HUMAN" ? "" : " (ASSUMED labels: never counts as the target)"}`);
  return all;
}
const out: Record<string, unknown> = { human: report("HUMAN", human) };
if (Deno.args.includes("--assumed")) {
  const assumed: LabelFile = await load("labels.assumed.json");
  if (assumed.kind !== "assumed") throw new Error("labels.assumed.json must be kind assumed");
  out.assumed = report("ASSUMED", assumed);
}
const j = Deno.args.indexOf("--json");
if (j >= 0) await Deno.writeTextFile(Deno.args[j + 1], JSON.stringify(out, null, 1) + "\n");
