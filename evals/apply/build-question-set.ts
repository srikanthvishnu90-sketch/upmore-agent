// WO-009b-6 data: the real required questions of real postings, in the FormField shape the planner reads
// (supabase/functions/_shared/career_apply.ts). Greenhouse from its public questions API through greenhouseQuestions;
// Lever and Ashby from the rendered page's questions (scripts/career/render-form.cjs). A page that showed no questions
// is kept with its reason, never filled in.
//   deno run --allow-read --allow-write evals/apply/build-question-set.ts <sources.json> <gh-dir> <rendered-dir> <out.json> <note>
import { greenhouseQuestions, type FormField } from "../../supabase/functions/_shared/career_apply.ts";

// location (WO-053): the posting's own location text from its ATS (null when the source gave none).
export interface QuestionPosting { id: string; family: string; company: string; source_url: string; location?: string | null; captured_at: string | null; evidence: string; reason: string | null; fields: FormField[] }

export function fromRendered(questions: any[]): FormField[] {
  return (questions || []).filter((q) => q && q.name && q.label && typeof q.required === "boolean")
    .map((q) => ({ name: String(q.name), label: String(q.label), required: q.required, type: String(q.type), options: Array.isArray(q.options) ? q.options.map((o: any) => ({ label: String(o.label), value: String(o.value) })) : [] }));
}

if (import.meta.main) {
  const [sourcesFile, ghDir, renderedDir, outFile, note] = Deno.args;
  const read = (p: string) => { try { return JSON.parse(Deno.readTextFileSync(p)); } catch { return null; } };
  const postings: QuestionPosting[] = [];
  for (const s of read(sourcesFile)) {
    const base = { id: s.id, family: s.family, company: s.company, source_url: s.url, location: s.location ?? null, evidence: "CI_CAPTURE" };
    if (s.family === "greenhouse") {
      const raw = read(`${ghDir}/${s.id}.questions.json`);
      const fields = raw ? greenhouseQuestions(raw) : [];
      postings.push({ ...base, location: raw?.location?.name ?? base.location, captured_at: raw ? new Date().toISOString() : null, reason: raw ? (fields.length ? null : "NO_QUESTIONS") : "QUESTIONS_NOT_FETCHED", fields });
    } else {
      const r = read(`${renderedDir}/${s.id}.rendered.json`);
      const fields = r ? fromRendered(r.questions) : [];
      postings.push({ ...base, captured_at: r ? r.rendered_at : null, reason: !r ? "NOT_RENDERED" : r.http_status === 403 ? "BLOCKED_403" : fields.some((f) => f.required) ? null : "NO_REQUIRED_QUESTIONS", fields });
    }
  }
  Deno.writeTextFileSync(outFile, JSON.stringify({ version: 1, captured_in: note, note: "Real public postings; questions as each ATS presents them to an applicant. Nothing was filled or submitted.", postings }, null, 1) + "\n");
  console.log(`QUESTION_SET ${postings.length} postings, ${postings.filter((p) => !p.reason).length} with required questions`);
}
