// WO-024: how well classifyMail reads application mail, on the labeled SYNTHETIC set evals/career/mail-labels.json.
// Prints precision and recall per kind, the overall numbers on the status kinds (everything but "other"), employer-name
// agreement, and every miss. Offline: no model, no network. The live number is NOT_RUN until real mail is labeled.
// Run: deno run --allow-read evals/career/mail-eval.ts [--json] [--check]
import { classifyMail, type MailKind, sameCompany, STATUS_KINDS } from "../../supabase/functions/_shared/career_mail.ts";
import set from "./mail-labels.json" with { type: "json" };
import blind from "./mail-blind.json" with { type: "json" };
import dev4set from "./mail-dev4.json" with { type: "json" };
import blind160 from "./mail-blind160.json" with { type: "json" };
import blind200 from "./mail-blind200.json" with { type: "json" };
import blind240 from "./mail-blind240.json" with { type: "json" };
import blind300 from "./mail-blind300.json" with { type: "json" };
import dev5set from "./mail-dev5.json" with { type: "json" };
import dev6set from "./mail-dev6.json" with { type: "json" };
import dev7set from "./mail-dev7.json" with { type: "json" };

export const TARGET = { precision: 0.97, recall: 0.95 };
const KINDS: MailKind[] = [...STATUS_KINDS, "other"];

export function evaluate(mails: typeof set.mails) {
  const per: Record<string, { tp: number; fp: number; fn: number }> = Object.fromEntries(KINDS.map((k) => [k, { tp: 0, fp: 0, fn: 0 }]));
  const misses: { id: string; want: string; got: string; subject: string }[] = [];
  let statusPredicted = 0, statusRight = 0, statusLabeled = 0, statusFound = 0, coRight = 0, coChecked = 0;
  // WO-040: what the model's second pass would see (rules said "other" but marked it ambiguous), and how many status
  // emails the rules missed are inside that set (the most a perfect second pass could add) or outside it.
  let secondCalls = 0, secondReach = 0, secondOut = 0;
  // WO-043: the worst error is a rejection read as an interview (the person preps for a call that is not coming); a status
  // read as a different status is the next worst. Both are counted.
  let rejectionAsInterview = 0, wrongStatus = 0;
  for (const m of mails) {
    const got = classifyMail(m), want = m.expect.kind as MailKind;
    if (want === "rejection" && got.kind === "interview") rejectionAsInterview++;
    if (want !== "other" && got.kind !== "other" && got.kind !== want) wrongStatus++;
    if (got.kind === want) per[want].tp++;
    else { per[got.kind].fp++; per[want].fn++; misses.push({ id: m.id, want, got: got.kind, subject: m.subject }); }
    if (got.kind !== "other") { statusPredicted++; if (got.kind === want) statusRight++; }
    if (got.ambiguous) secondCalls++;
    if (got.kind === "other" && want !== "other") { if (got.ambiguous) secondReach++; else secondOut++; }
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
    second_pass: { calls: secondCalls, missed_reachable: secondReach, missed_unreachable: secondOut },
    confusions: { rejection_as_interview: rejectionAsInterview, status_as_other_status: wrongStatus },
    misses,
  };
}

// Splits. "dev" is what the rules may be tuned on: "tune" and "tune2" (WO-024) and "dev3" (WO-040's synthetic ATS-template
// mail). "devcheck" (WO-040, same origin, split off by a fixed seed) was never used to change a rule: it is the first check
// for over-fitting. "holdout" (WO-024's 50) was never tuned on; WO-040 read its misses for their causes (the work order
// asked for that error analysis), so after WO-040 it is an optimistic number, not a blind one. --check guards dev against
// a regression; it does not steer by devcheck or the holdout. "blind40" (WO-040 review, mail-blind.json) is 30 status
// emails in new wordings, written before the review's rule changes and scored once; it is printed only when named
// (--only blind40), so tuning never shows it. --only <split,...> prints just those splits (tune with --only dev). --json
// prints everything as JSON.
// WO-043: "dev4" (mail-dev4.json, 260 SYNTHETIC emails written and labeled before WO-043's classifier change) is tuned on;
// "dev4check" (88, a fixed-seed quarter of the same batch) is printed only when named, like blind40, and was scored once.
// "blind160" (WO-043 review, mail-blind160.json): 160 SYNTHETIC emails written by the architect without reading the
// classifier or any labeled mail, held outside the repo (sha256 fae488d3...) and scored once on WO-043's classifier. It is
// spent as a blind check now; a floor, printed only when named.
// WO-045: "dev5" (mail-dev5.json, 190 SYNTHETIC emails written by the WO-045 builder and committed before its classifier
// change) is read for misses; "dev5check" (63, a fixed-seed quarter) is printed only when named and was scored once.
// "blind200" (WO-045 review, mail-blind200.json): 200 SYNTHETIC emails written by a separate agent that never read the
// classifier, any labeled mail or any eval file; 27 in Spanish, Portuguese, French or German. Sealed (sha256 0b5f8fed...)
// and scored once on 22d0ccf3. Spent; a floor, printed only when named.
// WO-046: "dev6" (mail-dev6.json, 239 SYNTHETIC emails written by the WO-046 builder and committed before its classifier
// change; 152 of the 317 in Spanish, Portuguese, French, German, Italian or Dutch, 40 calendar notices and forwards) is
// read for misses; "dev6check" (78, a fixed-seed quarter) is printed only when named and was scored once.
// "blind240" (WO-046 review, mail-blind240.json): 240 SYNTHETIC emails written by a separate agent that never read the
// classifier, any labeled mail or any eval file; 60 in Spanish, Portuguese, French, German, Italian or Dutch (by the
// writer's count). Sealed (sha256 62690765...) and scored once on cab14bda. Spent; a floor, printed only when named.
// WO-050: "dev7" (mail-dev7.json, 225 of 301 SYNTHETIC English-heavy emails written by the WO-050 builder and committed
// before its classifier change: scheduling-tool notices, reschedules, terse invitations, onsite logistics, next steps,
// agency and DocuSign offers, rejections that mention interviews, recruiter replies that are not decisions) is read for
// misses; "dev7check" (76, a fixed-seed quarter) is printed only when named and was scored once.
// "blind300" (WO-050 review, mail-blind300.json): 300 SYNTHETIC emails written by a separate agent that never read the
// classifier, any labeled mail or any eval file, asked to make English mail hard and realistic (scheduling tools, look-alikes,
// assessments that look like interviews); 60 in six other languages by the writer's count. Sealed (sha256 bcdf74b9...; the
// labels moved under "expect" mechanically for this eval, unread) and scored once on b94ba00e. Spent; a floor.
export const SEALED = ["blind40", "dev4check", "blind160", "dev5check", "blind200", "dev6check", "blind240", "dev7check", "blind300"];
export function dev4Splits() {
  const mails = dev4set.mails as typeof set.mails;
  return { dev4: mails.filter((m) => m.split === "dev4"), dev4check: mails.filter((m) => m.split === "dev4check") };
}
export function dev5Splits() {
  const mails = dev5set.mails as typeof set.mails;
  return { dev5: mails.filter((m) => m.split === "dev5"), dev5check: mails.filter((m) => m.split === "dev5check") };
}
export function dev6Splits() {
  const mails = dev6set.mails as unknown as typeof set.mails;
  return { dev6: mails.filter((m) => m.split === "dev6"), dev6check: mails.filter((m) => m.split === "dev6check") };
}
export function dev7Splits() {
  const mails = dev7set.mails as unknown as typeof set.mails;
  return { dev7: mails.filter((m) => m.split === "dev7"), dev7check: mails.filter((m) => m.split === "dev7check") };
}
export function splitsOf(mails: typeof set.mails) {
  const of = (...names: string[]) => mails.filter((m) => names.includes(m.split));
  return { all: mails, dev: of("tune", "tune2", "dev3"), tune: of("tune"), tune2: of("tune2"), dev3: of("dev3"), devcheck: of("devcheck"), holdout: of("holdout") };
}
if (import.meta.main) {
  const splits = { ...splitsOf(set.mails), blind40: blind.mails as typeof set.mails, ...dev4Splits(), blind160: blind160.mails as typeof set.mails, ...dev5Splits(), blind200: blind200.mails as typeof set.mails, ...dev6Splits(), blind240: blind240.mails as typeof set.mails, ...dev7Splits(), blind300: blind300.mails as typeof set.mails };
  const at = Deno.args.indexOf("--only"), only = at >= 0 ? String(Deno.args[at + 1] ?? "").split(",") : null;
  const results = Object.fromEntries(Object.entries(splits).filter(([k]) => (only ? only.includes(k) : !SEALED.includes(k))).map(([k, v]) => [k, evaluate(v)]));
  if (Deno.args.includes("--json")) console.log(JSON.stringify(results, null, 2));
  else {
    const pct = (x: number) => (100 * x).toFixed(1) + "%";
    for (const [name, r] of Object.entries(results)) {
      console.log(`mail classification, SYNTHETIC set, ${name}: ${r.total} emails`);
      for (const [k, v] of Object.entries(r.kinds)) console.log(`  ${k.padEnd(16)} n=${String(v.n).padStart(3)}  precision ${pct(v.precision).padStart(6)}  recall ${pct(v.recall).padStart(6)}`);
      console.log(`  status kinds: precision ${pct(r.status.precision)} (${r.status.predicted} predicted), recall ${pct(r.status.recall)} (${r.status.labeled} labeled); target ${pct(TARGET.precision)} / ${pct(TARGET.recall)}`);
      console.log(`  employer named right: ${r.company.right}/${r.company.checked} (${pct(r.company.accuracy)})`);
      console.log(`  confusions: rejection read as interview ${r.confusions.rejection_as_interview}; a status read as another status ${r.confusions.status_as_other_status}`);
      console.log(`  second pass (CAREER_MAIL_MODEL, off by default): ${r.second_pass.calls} emails would go to the model; of the ${r.second_pass.missed_reachable + r.second_pass.missed_unreachable} status emails the rules missed, ${r.second_pass.missed_reachable} are among them`);
      if (name !== "all" && name !== "dev") for (const m of r.misses) console.log(`  MISS ${m.id}: want ${m.want}, got ${m.got} -- ${m.subject}`);
    }
  }
  // --check guards the splits tuned on (dev and, since WO-043, dev4) against a regression; never a held-out split.
  const low = [evaluate(splits.dev), evaluate(splits.dev4)].some((t) => t.status.precision < TARGET.precision || t.status.recall < TARGET.recall);
  if (Deno.args.includes("--check") && low) Deno.exit(1);
}
