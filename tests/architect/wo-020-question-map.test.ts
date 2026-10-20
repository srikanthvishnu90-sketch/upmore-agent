// WO-020 (architect): the question map reads real application questions by meaning. Held to the independent hand labels
// (precision, recall, and fill precision: what is written with no one looking first), to the committed report, to the
// product's existing classifier where both answer, and to the rules that keep values out of it.
import { kindOf, mapQuestion, norm } from "../../supabase/functions/_shared/question_map.ts";
import { classifyField } from "../../supabase/functions/_shared/career_apply.ts";
import { coverage, score } from "../../evals/apply/question-map.ts";
import schema from "../../supabase/functions/_shared/fact_schema.ts";
import sample from "../../evals/apply/question-sample.json" with { type: "json" };
import labels from "../../evals/apply/question-labels.json" with { type: "json" };
import A from "../../evals/apply/questions-ci.json" with { type: "json" };
import B from "../../evals/apply/questions-ci-b.json" with { type: "json" };
import REPORT from "../../docs/apply/question-map.md" with { type: "text" };

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}

Deno.test("WO-020/1 against the blind hand labels: precision >= 97%, fill precision >= 99%, recall >= 95%", () => {
  eq((labels as any).labels.map((l: any) => l.id), (sample as any).questions.map((q: any) => q.id), "one label per sampled question, same order");
  assert(/blind to the classifier/.test((labels as any).labeler));
  const s = score(sample as any, labels as any);
  assert(s.precision >= 0.97, `precision ${s.precision}`);
  assert(s.fill_precision >= 0.99, `fill precision ${s.fill_precision}`);
  // WO-052: recall 0.95 -> 0.94. An independent review of every fill found six labeled topics whose fact does not
  // answer the question as asked (an NDA beside a non-compete, a data-sharing consent, a drug screen beside a background
  // check, "do you plan to work remotely?", an AI notetaker, citizenship with the date it was obtained, "are you aware
  // this role requires relocating?"): each is now asked. Topic recall pays for zero wrong answers, by design.
  assert(s.recall >= 0.94, `recall ${s.recall}`);
});

Deno.test("WO-020/2 coverage on both captured samples meets WO-020's bar, and the committed report is today's", () => {
  const a = coverage(A as any), b = coverage(B as any);
  assert(a.median_left <= 2 && a.ready >= 20, `A: median ${a.median_left}, ready ${a.ready}`);
  assert(b.median_left <= 1 && b.ready >= 38, `B: median ${b.median_left}, ready ${b.ready}`);
  assert(REPORT.includes(`| ${a.postings} | ${a.required} |`) && REPORT.includes(`| ${a.median_left} | ${a.ready}/${a.postings} |`), "docs/apply/question-map.md is stale: regenerate it");
  assert(REPORT.includes(`| ${b.median_left} | ${b.ready}/${b.postings} |`), "docs/apply/question-map.md is stale: regenerate it");
});

Deno.test("WO-020/3 every fact the map names is in the schema, with the schema's kind; the map carries no values", () => {
  const facts = (schema as any).facts as Record<string, { kind: string }>;
  for (const set of [A, B] as any[]) for (const p of set.postings) for (const f of p.fields) {
    const m = mapQuestion({ label: f.label, type: f.type, options: f.options || [] });
    assert(m.fact === "unknown" || facts[m.fact], `${m.fact} is not in fact_schema.ts`);
    eq(m.kind, m.fact === "unknown" ? "unknown" : facts[m.fact].kind, m.fact);
    eq(Object.keys(m).sort(), ["fact", "kind", "why"], "a fact and a kind, never a value");
  }
  eq(kindOf("criminal_history"), "attestation");
  eq(kindOf("privacy_ack"), "consent");
});

Deno.test("WO-020/4 where the product's classifier already answers, the map agrees", () => {
  const same: Record<string, string> = { full_name: "full_name", first_name: "first_name", last_name: "last_name", email: "email", phone: "phone",
    resume: "resume", linkedin: "linkedin", github: "github", sponsorship: "sponsorship", work_authorization: "work_authorization" };
  let compared = 0;
  const off: string[] = [];
  for (const set of [A, B] as any[]) for (const p of set.postings) for (const f of p.fields) {
    if (!f.required) continue;
    const k = classifyField(f.label, f.type);
    if (!same[k]) continue;
    compared++;
    const m = mapQuestion({ label: f.label, type: f.type, options: f.options || [] });
    if (m.fact !== same[k]) off.push(`${f.label.slice(0, 60)}: classifier ${k}, map ${m.fact}`);
  }
  assert(compared > 500, `compared ${compared}`);
  assert(off.length / compared <= 0.02, `${off.length} of ${compared} differ:\n${off.slice(0, 15).join("\n")}`);
});

Deno.test("WO-020/5 the traps: an opt-in is not the email field, a license number is never filled, the employer's AI tools are not a policy", () => {
  eq(mapQuestion({ label: "Email me about other job openings within the group", type: "multi_value_single_select", options: [{ label: "Yes" }, { label: "No" }] }).fact, "marketing_opt_in");
  eq(mapQuestion({ label: "Please provide your TDLR license number", type: "text" }).fact, "unknown");
  eq(mapQuestion({ label: "Passport number", type: "text" }).fact, "unknown");
  eq(mapQuestion({ label: "What are your favourite AI tools/workflows at the moment?", type: "textarea" }).kind, "essay");
  eq(mapQuestion({ label: "Hoe ben je met deze vacature in contact gekomen? (bijv. linkedin / instagram)", type: "text" }).fact, "how_heard");
  eq(mapQuestion({ label: "Are you a fugitive from justice?", type: "multi_value_single_select" }).kind, "attestation");
  eq(mapQuestion({ label: "Why do you want to work at Example Co?", type: "textarea" }).fact, "essay_why_company");
  eq(mapQuestion({ label: "Are you willing to relocate to Denver, CO?", type: "checkbox" }).fact, "job_relocation");
  eq(mapQuestion({ label: "Are you open to relocation?", type: "checkbox" }).fact, "relocation");
  eq(mapQuestion({ label: "Ben jij 18 jaar of ouder?", type: "select" }).fact, "over_18");
  eq(mapQuestion({ label: "¿Tienes permiso de trabajo en España?", type: "checkbox" }).fact, "work_authorization");
  eq(norm("  3. Do you have at least 1 year?"), "do you have at least 1 year?");
});
