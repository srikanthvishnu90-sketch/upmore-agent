// WO-074: standing answers, measured offline on samples A-H. Every captured form goes through the extension's own path
// (planForm, strict) with the complete synthetic TEST persona of fill-coverage.ts and each posting's own location, once
// without standing answers and once with a synthetic set of standing answers (STANDING below). It counts:
//   - open questions and answer-once panel entries removed, and cards newly ready;
//   - the person's taps in the panel per 100 postings: the WO-054 panel (one pick per entry) against the panel with the
//     standing items (their inputs, in place of the entries they cover, plus every covered question the statement then
//     does not settle, which is shown again in the panel once the statement is saved);
//   - every answer a standing answer produced, written for an independent review (--dump <file>).
// Tune on A-D, report E-H (held out). Synthetic: this measures the mechanism, not any person (VERIFIED-S).
//   deno run -A evals/apply/standing-answers.ts [--dump <file.json>] [--write docs/apply/standing-answers.md]
import { answerOnceQuestions, planForm } from "../../extension/src/apply_core.ts";
import { parseStanding, standingSummary, type StandingClass } from "../../supabase/functions/_shared/standing_answers.ts";
import { PERSONA, postingLocation } from "./fill-coverage.ts";

const NOW = Date.UTC(2026, 9, 20);
const row = (v: unknown, id: string) => ({ value: JSON.stringify(v), factId: `text-answer:TEST-standing-${id}` });
// A synthetic TEST person's standing answers, consistent with PERSONA (Chicago; US work rights only; on site anywhere they list).
export const STANDING: Record<string, { value: string; factId: string }> = {
  "standing:how_heard": row({ channels: ["company_site", "job_board"] }, "how"),
  "standing:relatives_at_employer": row({ none: true }, "rel"),
  "standing:work_rights": row({ countries: ["United States"], complete: true, sponsorshipElsewhere: "yes" }, "rights"),
  "standing:office": row({ places: ["Chicago, IL", "New York, NY", "San Francisco, CA"], maxDays: 5 }, "office"),
};
export const SAMPLES: [string, string][] = [["A", "questions-ci.json"], ["B", "questions-ci-b.json"], ["C", "questions-ci-c.json"], ["D", "questions-ci-d.json"],
  ["E", "questions-ci-e.json"], ["F", "questions-ci-f.json"], ["G", "questions-ci-g.json"], ["H", "questions-ci-h.json"]];

interface Posting { id: string; company: string; family: any; fields: any[]; location?: string }
const postingsOf = (set: { postings: any[] }): Posting[] => set.postings.filter((p) => !p.reason).map((p) => ({
  id: p.id, company: p.company, family: p.family, location: postingLocation(p),
  fields: p.fields.map((f: any) => ({ name: f.name, label: f.label, required: !!f.required, type: f.type,
    options: (f.options || []).map((o: any) => ({ label: String(o.label), value: String(o.value ?? o.label) })) })),
}));
const plan = (p: Posting, saved: Record<string, any>) =>
  planForm({ userId: "TEST", jobId: p.id, company: p.company, family: p.family, schema: p.fields, answers: PERSONA, saved, now: NOW, location: p.location });
const ready = (r: ReturnType<typeof plan>) => !r.needs.length && !r.identity.some((x) => x.required) && !r.ambiguous.some((x) => x.required);

export interface Derived { sample: string; posting: string; company: string; location: string | null; cls: StandingClass; statement: string; question: string; type: string; options: string[]; answer: string; in_options: boolean }
export function measure(name: string, set: { postings: any[] }) {
  const ps = postingsOf(set);
  const before = ps.map((p) => ({ p, r: plan(p, {}) })), after = ps.map((p) => ({ p, r: plan(p, STANDING) }));
  const derived: Derived[] = [];
  for (const { p, r } of after) {
    for (const f of r.fill.filter((x) => String(x.factId).startsWith("standing:"))) {
      const cls = String(f.factId).split(":")[1] as StandingClass;
      const field = p.fields.find((x) => x.name === f.name)!;
      const shown = field.options.find((o: any) => o.value === f.value)?.label ?? f.value;
      derived.push({ sample: name, posting: p.id, company: p.company, location: p.location ?? null, cls, statement: standingSummary(cls, parseStanding(cls, STANDING[`standing:${cls}`].value)!),
        question: f.label, type: field.type, options: field.options.map((o: any) => o.label), answer: shown,
        in_options: !field.options.length || field.options.some((o: any) => o.value === f.value) });
    }
  }
  const prepared = (xs: typeof before) => xs.map(({ p, r }) => ({ jobId: p.id, company: p.company, location: p.location, needs: r.needs }));
  // The WO-054 panel (no standing answers), and the same panel offering the standing items for the first time.
  const old = answerOnceQuestions({ postings: prepared(before), answers: PERSONA, answered: new Set() });
  const covered = new Set(old.standing.flatMap((q) => q.covers ?? []));
  const inputs = old.standing.reduce((n, q) => n + (q.inputs ?? 1), 0);
  // A covered entry the statement does not settle at one of its postings is shown again in the panel, and answered there.
  const openAfter = new Set(after.flatMap(({ p, r }) => r.needs.map((n) => `${p.id}\n${n.label}`)));
  const unsettled = old.questions.filter((q) => covered.has(q.key) && q.postings.some((a) => openAfter.has(`${a.jobId}\n${a.label}`))).length;
  const firstTime = inputs + old.questions.filter((q) => !covered.has(q.key)).length + unsettled;
  // A later session, the standing answers already given: what the panel asks.
  const later = answerOnceQuestions({ postings: prepared(after), answers: PERSONA, answered: new Set(Object.keys(STANDING)) });
  const sum = (xs: typeof before) => xs.reduce((n, x) => n + x.r.needs.length, 0);
  return {
    name, postings: ps.length, openBefore: sum(before), openAfter: sum(after), panelBefore: old.questions.length, panelAfter: later.questions.length,
    readyBefore: before.filter((x) => ready(x.r)).length, readyAfter: after.filter((x) => ready(x.r)).length,
    standingItems: old.standing.map((q) => `${q.standing} (${q.inputs} input${q.inputs === 1 ? "" : "s"}, covers ${q.covers?.length})`),
    tapsBefore: old.questions.length, tapsFirst: firstTime, coveredEntries: covered.size, unsettled, derived,
    byClass: derived.reduce((a, d) => ((a[d.cls] = (a[d.cls] || 0) + 1), a), {} as Record<string, number>),
  };
}

if (import.meta.main) {
  const read = async (f: string) => JSON.parse(await Deno.readTextFile(new URL(f, import.meta.url)));
  const rows: ReturnType<typeof measure>[] = [];
  for (const [n, f] of SAMPLES) rows.push(measure(n, await read(`./${f}`)));
  const total = (xs: typeof rows) => {
    const s = (k: keyof (typeof rows)[number]) => xs.reduce((n, x) => n + (x[k] as number), 0);
    return { postings: s("postings"), openBefore: s("openBefore"), openAfter: s("openAfter"), panelBefore: s("panelBefore"), panelAfter: s("panelAfter"),
      readyBefore: s("readyBefore"), readyAfter: s("readyAfter"), tapsBefore: s("tapsBefore"), tapsFirst: s("tapsFirst"), derived: xs.reduce((n, x) => n + x.derived.length, 0),
      outside: xs.reduce((n, x) => n + x.derived.filter((d) => !d.in_options).length, 0) };
  };
  const tune = total(rows.slice(0, 4)), held = total(rows.slice(4)), all = total(rows);
  const per100 = (x: number, p: number) => (Math.round((x / p) * 1000) / 10).toFixed(1);
  const line = (n: string, t: ReturnType<typeof total>) =>
    `| ${n} | ${t.postings} | ${t.openBefore} → ${t.openAfter} (−${t.openBefore - t.openAfter}) | ${t.panelBefore} → ${t.panelAfter} (−${t.panelBefore - t.panelAfter}) | ${t.readyBefore} → ${t.readyAfter} (+${t.readyAfter - t.readyBefore}) | ${per100(t.tapsBefore, t.postings)} → ${per100(t.tapsFirst, t.postings)} | ${per100(t.tapsBefore, t.postings)} → ${per100(t.panelAfter, t.postings)} | ${t.derived} | ${t.outside} |`;
  const out = [
    "| Sample | Postings | Open questions on cards | Panel entries (later sessions) | Cards fully ready | Panel taps per 100 postings, first session | Panel taps per 100 postings, later sessions | Standing-derived answers | Not one of the form's options |",
    "|---|---|---|---|---|---|---|---|---|",
    ...rows.map((r) => line(r.name, total([r]))),
    line("A–D (tune)", tune), line("E–H (held out)", held), line("All", all),
    "",
    ...rows.map((r) => `- ${r.name}: standing items offered ${r.standingItems.join("; ") || "none"}; covered entries the statement did not settle (shown again in the panel) ${r.unsettled}; derived by class ${JSON.stringify(r.byClass)}`),
  ].join("\n");
  console.log(out);
  const d = Deno.args.indexOf("--dump");
  if (d >= 0) await Deno.writeTextFile(Deno.args[d + 1], JSON.stringify(rows.flatMap((r) => r.derived), null, 1));
  const w = Deno.args.indexOf("--write");
  if (w >= 0) {
    await Deno.writeTextFile(Deno.args[w + 1], [
      "# Standing answers (WO-074): measured offline",
      "",
      "Generated by `deno run -A evals/apply/standing-answers.ts --write docs/apply/standing-answers.md`. Samples A–H through the extension's own `planForm` with the synthetic TEST persona, without and with the synthetic standing answers (`STANDING` in the script). **VERIFIED-S**: this measures the mechanism; a real person's answers are NOT_RUN. Precision and the review: `docs/architect/work-orders/WO-074-standing-answers.md`.",
      "",
      out,
      "",
    ].join("\n"));
  }
}
