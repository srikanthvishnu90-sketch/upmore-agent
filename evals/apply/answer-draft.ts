// WO-064: the panel's open questions drafted from confirmed facts, measured on the captured samples with the real model.
// Each sample is one queue, through the extension's own path:
//   1. planForm (strict) with the complete synthetic TEST persona of fill-coverage.ts and each posting's own location;
//   2. answerOnceQuestions (what the panel asks);
//   3. draftShortAnswers (answer_draft.ts) over the panel's questions, with the persona's confirmed facts plus a synthetic
//      TEST work history;
//   4. every drafted answer saved the way the panel saves it (answerOnceRows, factsWithTextAnswers), and every posting
//      planned again.
// Stops per posting are the required questions still open on its card after that: a panel question with no draft, an
// essay, an agreement, a file, an identity number or a self-identification question.
// Synthetic: this measures the mechanism, not any person (VERIFIED-S). Whether a draft is RIGHT is read by reviewers from
// the review file (--review), never by this script.
//   deno run -A evals/apply/answer-draft.ts --samples a,b --label <label> [--budget-usd 5] [--review <file>] [--write <md>]
// Needs OPENAI_API_KEY (OpenAI only). Spend is summed across evals/apply/results/answer-draft-*.json; a run stops before
// crossing --budget-usd, and a stopped run is not a score.
import { answerOnceQuestions, answerOnceRows, ownWordsAsked, planForm, shortDraftRequest } from "../../extension/src/apply_core.ts";
import { factsWithTextAnswers } from "../../workers/career-browser/ask-once.ts";
import { draftShortAnswers, type ShortDraft } from "../../supabase/functions/_shared/answer_draft.ts";
import { PERSONA, postingLocation } from "./fill-coverage.ts";

const NOW = Date.UTC(2026, 9, 20);
const SAMPLES: Record<string, string> = { a: "questions-ci.json", b: "questions-ci-b.json", c: "questions-ci-c.json", d: "questions-ci-d.json",
  e: "questions-ci-e.json", f: "questions-ci-f.json", g: "questions-ci-g.json", h: "questions-ci-h.json", i: "questions-ci-i.json" };

// The persona's facts as the person would have confirmed them, and a TEST work history (synthetic; never a real person's).
const SKIP = new Set(["eeo", "signature", "resume", "privacy_ack", "certify_true", "ai_policy_ack", "sms_opt_in", "marketing_opt_in"]);
export const TEST_FACTS = [
  ...Object.entries(PERSONA).filter(([k]) => !SKIP.has(k)).map(([k, v]) => ({ id: `TEST-P-${k}`, kind: "other", text: `${k.replace(/_/g, " ")}: ${v.value}`, status: "confirmed" })),
  { id: "TEST-J1", kind: "experience", status: "confirmed", text: "Data Analyst at Example Analytics, Chicago, IL, June 2023 to present: built SQL and Python reporting pipelines and Looker dashboards for the sales team; ran A/B test analysis for pricing pages; cut weekly reporting from 6 hours to 1" },
  { id: "TEST-J2", kind: "experience", status: "confirmed", text: "Analytics Intern at Sample Retail, June 2021 to August 2021: cleaned point-of-sale data in Excel and SQL and built a Tableau dashboard of store sales" },
  { id: "TEST-J3", kind: "experience", status: "confirmed", text: "Teaching Assistant for Introductory Statistics at Example State University, 2020 to 2022: ran weekly R labs for 40 students" },
  { id: "TEST-E1", kind: "education", status: "confirmed", text: "B.S. Statistics, Example State University, graduated May 2022, GPA 3.6" },
  ...["SQL", "Python", "Excel", "Looker", "Tableau", "R", "A/B testing", "statistics", "dashboards", "data cleaning", "pandas", "Git"].map((s, i) => ({
    id: `TEST-S${i + 1}`, kind: "skill", name: s, status: "confirmed", unproven: false, evidence: [i < 7 ? "TEST-J1" : "TEST-J3"], text: `Skill: ${s}`,
  })),
];

interface Posting { id: string; company: string; family: any; fields: any[]; location?: string; ownWords: boolean }
const postingsOf = (set: { postings: any[] }): Posting[] => set.postings.filter((p) => !p.reason).map((p) => ({
  id: p.id, company: p.company, family: p.family, location: postingLocation(p), ownWords: ownWordsAsked(p.fields.map((f: any) => String(f.label || ""))),
  fields: p.fields.map((f: any) => ({ name: f.name, label: f.label, required: !!f.required, type: f.type,
    options: (f.options || []).map((o: any) => ({ label: String(o.label), value: String(o.value ?? o.label) })) })),
}));
type Facts = { answers: Record<string, any>; saved: Record<string, any> };
const plan = (p: Posting, f: Facts) => planForm({ userId: "TEST", jobId: p.id, company: p.company, family: p.family, schema: p.fields, answers: f.answers, saved: f.saved, now: NOW, location: p.location });
const median = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0; };

export async function measureSample(set: { postings: any[] }, model: (p: any) => Promise<any>) {
  const ps = postingsOf(set);
  const f: Facts = { answers: PERSONA, saved: {} };
  const before = ps.map((p) => ({ p, r: plan(p, f) }));
  const m = answerOnceQuestions({ postings: before.map((x) => ({ jobId: x.p.id, company: x.p.company, location: x.p.location, needs: x.r.needs })), answers: f.answers, answered: new Set() });
  const req = shortDraftRequest(m.questions, ps.filter((p) => p.ownWords).map((p) => p.id));
  const drafts: ShortDraft[] = [];
  for (let i = 0; i < req.length; i += 200) drafts.push(...await draftShortAnswers(req.slice(i, i + 200), { model, facts: () => TEST_FACTS, now: NOW }));
  const ok = drafts.filter((d): d is Extract<ShortDraft, { ok: true }> => d.ok);
  const rows = answerOnceRows({ questions: m.questions, picks: ok.map((d) => ({ key: d.key, answer: d.answer })) });
  const stored = rows.groups.flatMap((g) => g.answers).map((a, i) => ({ id: `TEST-D-${i}`, key: a.key, kind: a.kind, answer: a.answer }));
  const next = factsWithTextAnswers(f, stored) as Facts;
  const after = ps.map((p) => ({ p, r: plan(p, next) }));
  const stops = (r: ReturnType<typeof plan>) => r.needs.length + r.identity.filter((x) => x.required).length;
  const why: Record<string, number> = {};
  for (const d of drafts) if (!d.ok) why[d.why] = (why[d.why] || 0) + 1;
  const byKey = new Map(m.questions.map((q) => [q.key, q]));
  return {
    postings: ps.length, panel: m.questions.length, drafted: ok.length, refused_on_save: rows.refused.length, why,
    stops_before: { mean: before.reduce((n, x) => n + stops(x.r), 0) / ps.length, median: median(before.map((x) => stops(x.r))) },
    stops_after: { mean: after.reduce((n, x) => n + stops(x.r), 0) / ps.length, median: median(after.map((x) => stops(x.r))) },
    ready_before: before.filter((x) => !stops(x.r) && !x.r.ambiguous.some((a) => a.required)).length,
    ready_after: after.filter((x) => !stops(x.r) && !x.r.ambiguous.some((a) => a.required)).length,
    review: ok.map((d) => {
      const q = byKey.get(d.key)!;
      return { key: d.key, company: q.postings[0]?.company, question: q.label, options: q.options, answer: d.answer, facts: d.fact_ids.map((id) => TEST_FACTS.find((x) => x.id === id)?.text ?? id) };
    }),
  };
}

if (import.meta.main) {
  const arg = (k: string) => { const i = Deno.args.indexOf(k); return i >= 0 ? Deno.args[i + 1] : undefined; };
  const label = arg("--label") ?? `local-${Date.now()}`;
  const samples = (arg("--samples") ?? "a,b,c,d,e,f,g,h").split(",").map((s) => s.trim()).filter(Boolean);
  const budget = Number(arg("--budget-usd") ?? Deno.env.get("EVAL_BUDGET_USD") ?? "5");
  const { callModel, newMeter } = await import("../../supabase/functions/_shared/model_gateway.ts");
  const { essayModelConfig } = await import("../../supabase/functions/_shared/career_essay_card.ts");
  if (!Deno.env.get("OPENAI_API_KEY")) { console.log("NOT RUN: OPENAI_API_KEY is not set (OpenAI only)."); Deno.exit(2); }
  const cfg = essayModelConfig(Deno.env);
  const dir = new URL("./results/", import.meta.url);
  let before = 0;
  for (const e of Deno.readDirSync(dir)) if (/^answer-draft-.*\.json$/.test(e.name)) before += JSON.parse(Deno.readTextFileSync(new URL(e.name, dir))).cost_usd ?? 0;
  const meter = newMeter();
  let stopped = false;
  const model = async (p: any) => {
    if (before + meter.usd_micros / 1e6 >= budget - 0.1) { stopped = true; throw new Error("budget"); }
    return await callModel(cfg, p, { meter, role: "chat" });
  };
  const out: Record<string, any> = {};
  for (const s of samples) {
    const set = JSON.parse(Deno.readTextFileSync(new URL(`./${SAMPLES[s]}`, import.meta.url)));
    out[s] = await measureSample(set, model);
    const r = out[s];
    console.log(`sample ${s}: ${r.postings} postings · panel ${r.panel} · drafted ${r.drafted} (${(100 * r.drafted / Math.max(1, r.panel)).toFixed(1)}%) · ` +
      `stops/posting ${r.stops_before.mean.toFixed(2)} -> ${r.stops_after.mean.toFixed(2)} (median ${r.stops_before.median} -> ${r.stops_after.median}) · ` +
      `ready ${r.ready_before} -> ${r.ready_after} · not drafted ${JSON.stringify(r.why)}`);
    if (stopped) break;
  }
  const result = { label, model: cfg.model, samples, stopped, cost_usd: meter.usd_micros / 1e6, unpriced_calls: meter.unpriced, at: new Date().toISOString(),
    by_sample: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { ...v, review: undefined }])) };
  Deno.writeTextFileSync(new URL(`answer-draft-${label}.json`, dir), JSON.stringify(result, null, 1) + "\n");
  const review = arg("--review");
  if (review) Deno.writeTextFileSync(review, JSON.stringify(Object.fromEntries(Object.entries(out).map(([k, v]) => [k, v.review])), null, 1) + "\n");
  console.log(stopped ? `STOPPED at the spend cap ($${budget}); a partial run is not a score.` : `done: $${result.cost_usd.toFixed(3)} this run, $${(before + result.cost_usd).toFixed(3)} of $${budget} in all`);
}
