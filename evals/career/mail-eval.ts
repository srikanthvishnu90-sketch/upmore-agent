// WO-024: how well classifyMail reads application mail, on the labeled SYNTHETIC set evals/career/mail-labels.json.
// Prints precision and recall per kind, the overall numbers on the status kinds (everything but "other"), employer-name
// agreement, and every miss. Offline: no model, no network. The live number is NOT_RUN until real mail is labeled.
// Run: deno run --allow-read evals/career/mail-eval.ts [--json] [--check]
import { classifyMail, type MailKind, sameCompany, STATUS_KINDS } from "../../supabase/functions/_shared/career_mail.ts";
import set from "./mail-labels.json" with { type: "json" };

export const TARGET = { precision: 0.97, recall: 0.95 };
const KINDS: MailKind[] = [...STATUS_KINDS, "other"];

export function evaluate(mails: typeof set.mails) {
  const per: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }]));
  const misses: { id: string; want: string; got: string; subject: string }[] = [];
  let statusPredicted = 0, statusRight = 0, statusLabeled = 0, statusFound = 0, coRight = 0, coChecked = 0;
  for (const m of mails) {
    const got = classifyMail(m), want = m.expect.kind as MailKind;
    if (got.kind === want) per[want].tp++;
    else { per[got.kind].fp++; per[want].fn++; misses.push({ id: m.id, want, got: got.kind, subject: m.subject }); }
    if (got.kind !== "other") { statusPredicted++; if (got.kind === want) statusRight++; }
    if (want !== "other") { statusLabeled++; if (got.kind === want) statusFound++; }
    if (want !== "other" && got.kind === want) {
      coChecked++;
      if (got.company && sameCompany(got.company, m.expect.company)) coRight++;
      else misses.push({ id: m.id, want: `company ${m.expect.company}`, got: `company ${got.company ?? "(none)"}`, subject: m.subject });
    }
  }
  const ratio = (a: number, b: number) => (b ? a / b : 1);
  const kinds = Object.fromEntries(KINDS.map((k) => [k, { precision: ratio(per[k].tp, per[k].tp + per[k].fp), recall: ratio(per[k].tp, per[k].tp + per[k].fn), n: per[k].tp + per[k].fn }]));
  return {
    total: mails.length, kinds,
    status: { precision: ratio(statusRight, statusPredicted), recall: ratio(statusFound, statusLabeled), predicted: statusPredicted, labeled: statusLabeled },
    company: { right: coRight, checked: coChecked, accuracy: ratio(coRight, coChecked) },
    misses,
  };
}

// The rules were tuned on "tune" and then "tune2"; "holdout" was written afterwards and never used to change them, so it
// is the honest number (and below the target: docs/career/mail-tracking.md). --check guards the tuned splits against a
// regression; it does not steer by the holdout.
if (import.meta.main) {
  const splits = { all: set.mails, tune: set.mails.filter((m) => m.split === "tune"), tune2: set.mails.filter((m) => m.split === "tune2"), holdout: set.mails.filter((m) => m.split === "holdout") };
  const results = Object.fromEntries(Object.entries(splits).map(([k, v]) => [k, evaluate(v)]));
  if (Deno.args.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else {
    const pct = (x: number) => (100 * x).toFixed(1) + "%";
    for (const [name, r] of Object.entries(results)) {
      console.log(`mail classification, SYNTHETIC set, ${name}: ${r.total} emails`);
      for (const [k, v] of Object.entries(r.kinds)) console.log(`  ${k.padEnd(16)} n=${String(v.n).padStart(3)}  precision ${pct(v.precision).padStart(6)}  recall ${pct(v.recall).padStart(6)}`);
      console.log(`  status kinds: precision ${pct(r.status.precision)} (${r.status.predicted} predicted), recall ${pct(r.status.recall)} (${r.status.labeled} labeled); target ${pct(TARGET.precision)} / ${pct(TARGET.recall)}`);
      console.log(`  employer named right: ${r.company.right}/${r.company.checked} (${pct(r.company.accuracy)})`);
      if (name !== "all") for (const m of r.misses) console.log(`  MISS ${m.id}: want ${m.want}, got ${m.got} -- ${m.subject}`);
    }
  }
  const tuned = evaluate([...splits.tune, ...splits.tune2]);
  if (Deno.args.includes("--check") && (tuned.status.precision < TARGET.precision || tuned.status.recall < TARGET.recall)) Deno.exit(1);
}
