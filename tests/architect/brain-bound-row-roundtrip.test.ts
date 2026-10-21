// Original synthetic whole-route checks. The production producer, persisted question shape,
// answer turn, manifest, planner and fill contract must agree; no provider, browser or network.
import { contractFill, planForm, questionsForTrainee, trustedManifest, type Manifest } from "../../extension/src/apply_core.ts";
import { type FormField } from "../../supabase/functions/_shared/career_apply.ts";
import { questionsTurn, QUESTIONS_INTENT, type OpenQuestion, type QuestionStore, type Shown } from "../../supabase/functions/_shared/career_apply_questions.ts";
import { decodeRowQuestionType, rowAnswerKey } from "../../supabase/functions/_shared/row_answer.ts";

const OWNER = "SYN-ROUNDTRIP-OWNER", JOB = "workday:synthetic:roundtrip", THREAD = "SYN-ROUNDTRIP-THREAD", NOW = 1000;
function eq(actual: unknown, expected: unknown, why = "") {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${why}: ${JSON.stringify(actual)} !== ${JSON.stringify(expected)}`);
}
function row(row = 1, format = "MM/YYYY"): FormField {
  return { name: `workExperience-${row}--start`, label: "From", type: "date", required: true, options: [],
    section: { kind: "work", row, part: "start", anchor: `Synthetic Employer ${row}`, format } };
}
function native(type: string): FormField {
  return { name: "native-start", label: "Available start date", type, required: true, options: [] };
}
const empty = () => trustedManifest({ owner: OWNER, file: null, rows: [], resume: null });
function plan(schema: FormField[], manifest: Manifest, jobId = JOB) {
  return planForm({ userId: OWNER, jobId, company: "Synthetic Hiring", family: "workday", workdayFlow: true,
    schema, answers: manifest.answers, saved: manifest.saved, now: NOW });
}
function checked(schema: FormField[], planned: ReturnType<typeof plan>, manifest: Manifest, jobId = JOB) {
  const input = { schema, plan: planned, manifest, resume: null, jobId };
  return contractFill(input);
}
function produce(schema: FormField[], jobId = JOB) {
  const first = plan(schema, empty(), jobId);
  const result = questionsForTrainee({ jobId, company: "Synthetic Hiring", needs: first.needs, answers: {}, answered: new Set() });
  // A JSON roundtrip and explicit DB columns prevent hidden section metadata from helping this test.
  const questions = JSON.parse(JSON.stringify(result.questions.map((q, i) => ({
    id: `SYN-Q-${i + 1}`, key: q.key, kind: q.kind, label: q.label, type: q.type, options: q.options,
    company: q.company, misfit: q.misfit, job_ids: [jobId], answer: null,
    ...(q.ai_policy ? { ai_policy: q.ai_policy } : {}),
  })))) as OpenQuestion[];
  return { first, questions };
}
async function answer(questions: OpenQuestion[], values: string[]) {
  eq(questions.length, values.length, "every actual persisted question has one own answer");
  let shown: Shown | null = null;
  const store: QuestionStore = {
    open: async () => questions.filter((q) => q.answer === null), countOpen: async () => questions.filter((q) => q.answer === null).length,
    get: async (_user, ids) => questions.filter((q) => ids.includes(q.id)), shown: async () => shown,
    setShown: async (_user, next) => { shown = next; }, lastAssistantIntent: async () => QUESTIONS_INTENT,
    answer: async (user, id, value) => { eq(user, OWNER); const q = questions.find((q) => q.id === id); if (!q) throw new Error("unknown question"); q.answer = value; },
  };
  for (let i = 0; i < questions.length; i++) {
    shown = { thread: THREAD, ids: [questions[i].id], at: new Date(NOW).toISOString() };
    await questionsTurn({ message: values[i], userId: OWNER, threadId: THREAD, now: NOW, store });
  }
  const rows = questions.filter((q): q is OpenQuestion & { answer: string } => q.answer !== null);
  return trustedManifest({ owner: OWNER, file: null, rows, resume: null });
}
async function roundtrip(schema: FormField[], values: string[]) {
  const produced = produce(schema), manifest = await answer(produced.questions, values), replanned = plan(schema, manifest);
  return { ...produced, manifest, replanned, contract: checked(schema, replanned, manifest) };
}

for (const [format, value, logical] of [["MM/YYYY", "02/2028", "month"], ["YYYY", "2028", "year"]]) {
  Deno.test(`bound row whole route: ${format} survives persisted question and fill contract`, async () => {
    const field = row(1, format), result = await roundtrip([field], [value]);
    eq(result.first.ambiguous, []); eq(result.questions.length, 1);
    const decoded = decodeRowQuestionType(result.questions[0].type);
    eq(decoded?.type, logical, "encoded protocol retains logical date precision");
    eq(decoded?.key, result.questions[0].key, "persisted key and protocol binding agree");
    eq(result.questions[0].key, rowAnswerKey(field, JOB), "actual producer binds exact job and row");
    eq(result.questions[0].answer, value, "actual answer turn saves exact stated precision");
    eq(result.replanned.fill.map((f) => [f.name, f.value]), [[field.name, value]]);
    eq(result.replanned.needs, []); eq(result.contract.fill, result.replanned.fill); eq(result.contract.asks, []);
  });
}

Deno.test("bound row whole route: two equal labels retain independent row answers", async () => {
  const a = row(1), b = row(2), produced = produce([a, b]);
  eq(produced.first.ambiguous, [], "identified rows are not ordinary ambiguous labels"); eq(produced.questions.length, 2);
  eq(new Set(produced.questions.map((q) => q.key)).size, 2, "persist both row questions");
  const byKey = new Map([[rowAnswerKey(a, JOB), "02/2028"], [rowAnswerKey(b, JOB), "03/2028"]]);
  const manifest = await answer(produced.questions, produced.questions.map((q) => byKey.get(q.key) ?? "missing binding"));
  const replanned = plan([a, b], manifest), safe = checked([a, b], replanned, manifest);
  eq(replanned.fill.map((f) => [f.name, f.value]), [[a.name, "02/2028"], [b.name, "03/2028"]]);
  eq(replanned.needs, []); eq(safe.fill, replanned.fill); eq(safe.asks, []);
  const partial = trustedManifest({ owner: OWNER, file: null, rows: produced.questions.filter((q) => q.key === rowAnswerKey(a, JOB)) as (OpenQuestion & { answer: string })[], resume: null });
  const next = plan([a, b], partial); eq(next.fill.map((f) => f.name), [a.name]);
  const open = questionsForTrainee({ jobId: JOB, company: "Synthetic Hiring", needs: next.needs, answers: {}, answered: new Set() }).questions;
  eq(open.length, 1); eq(open[0].key, rowAnswerKey(b, JOB), "only unresolved equal-label row is asked");
});

const changes: [string, (field: FormField) => FormField][] = [
  ["field name", (f) => ({ ...f, name: "workExperience-1--different" })],
  ["row index", (f) => ({ ...f, section: { ...f.section!, row: 2 } })],
  ["row anchor", (f) => ({ ...f, section: { ...f.section!, anchor: "Different Synthetic Employer" } })],
  ["option schema", (f) => ({ ...f, options: [{ label: "February 2028", value: "02/2028" }] })],
  ["field type", (f) => ({ ...f, type: "text" })],
  ["field label", (f) => ({ ...f, label: "Start date" })],
  ["date precision", (f) => ({ ...f, section: { ...f.section!, format: "YYYY" } })],
  ["section part", (f) => ({ ...f, section: { ...f.section!, part: "end" } })],
  ["section kind", (f) => ({ ...f, section: { ...f.section!, kind: "education", part: "end" } })],
];
for (const [label, change] of changes) Deno.test(`bound row whole route: changed ${label} cannot reuse or contract-fill an old answer`, async () => {
  const original = row(), result = await roundtrip([original], ["02/2028"]), changed = change(original);
  eq(result.contract.fill.length, 1, "unchanged route is a positive control");
  const next = plan([changed], result.manifest); eq(next.fill, [], "replanning requires a new answer");
  eq(checked([changed], result.replanned, result.manifest).fill, [], "stale plan cannot bypass the contract binding");
});
Deno.test("bound row whole route: another posting cannot reuse or contract-fill the row answer", async () => {
  const field = row(), result = await roundtrip([field], ["02/2028"]), other = "workday:synthetic:other";
  eq(result.contract.fill.length, 1); eq(plan([field], result.manifest, other).fill, []);
  eq(checked([field], result.replanned, result.manifest, other).fill, []);
});

Deno.test("bound row whole route: invalid date precision never becomes an answered row", async () => {
  const field = row(), result = await roundtrip([field], ["2028-02-29"]);
  eq(result.questions[0].answer, null); eq(result.manifest.saved, {}); eq(result.replanned.fill, []); eq(result.contract.fill, []);
});
for (const [type, value, filled] of [["date", "February 29, 2028", "2028-02-29"], ["month", "February 2028", "2028-02"]]) {
  Deno.test(`bound row whole route control: native ${type} preserves calendar meaning`, async () => {
    const field = native(type), result = await roundtrip([field], [value]);
    eq(result.questions[0].answer, value); eq(result.replanned.fill[0]?.value, filled); eq(result.contract.fill[0]?.value, filled);
  });
}
Deno.test("bound row whole route control: incomplete native full dates remain open", async () => {
  for (const value of ["02/2028", "2028"]) {
    const result = await roundtrip([native("date")], [value]);
    eq(result.questions[0].answer, null); eq(result.replanned.fill, []); eq(result.contract.fill, []);
  }
});
Deno.test("bound row whole route control: structured work history still rederives exact row dates", () => {
  for (const [format, start, expected] of [["MM/YYYY", "02/2028", "02/2028"], ["YYYY", "2028", "2028"]]) {
    const field = row(1, format), value = JSON.stringify([{ employer: "Synthetic Employer 1", title: "Synthetic Analyst", start }]);
    const manifest = trustedManifest({ owner: OWNER, file: { user_id: OWNER, answers: { work_history: { value, factId: "SYN-HISTORY", confirmed: true,
      provenance: "owner stated work history", confirmation_event_id: "SYN-HISTORY-EVENT" } } }, rows: [], resume: null });
    const planned = plan([field], manifest); eq(planned.fill[0]?.value, expected); eq(checked([field], planned, manifest).fill, planned.fill);
  }
});
