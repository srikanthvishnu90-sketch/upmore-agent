// WO-075: Greenhouse's "Resume/CV" is one question with two ways to answer it, an upload (resume) and a paste box
// (resume_text), both named "Resume/CV" and both marked required in the board's schema. planForm's same-label rule (two
// fields under one label: neither is answered, both are left to the person) took the pair for two questions, so every
// Greenhouse card planned from the board's schema waited on the person: 7% of 320 captured Greenhouse postings were ready,
// 21% once the pair is one question (samples A-H, the complete TEST persona). The server's planBatch already reads the
// paste box as the upload's alternative (career_apply.ts fileAlternative); planForm now does too. Two real fields under one
// label still go to the person.
import { planForm } from "../../extension/src/apply_core.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

const ANSWERS = {
  first_name: { value: "Test", factId: "f1" }, last_name: { value: "Person", factId: "f2" },
  email: { value: "test.person@example.com", factId: "f3" }, phone: { value: "+1 312 555 0100", factId: "f4" },
  resume: { value: "TEST-resume-sha256", factId: "f5" },
};
const plan = (schema: any[], answers: any = ANSWERS) => planForm({ userId: "T", jobId: "gh-1", company: "Acme", family: "greenhouse" as any, schema: schema.map((f) => ({ options: [], ...f })), answers, saved: {}, now: Date.UTC(2026, 9, 20) });
const BASE = [
  { name: "first_name", label: "First Name", type: "input_text", required: true },
  { name: "last_name", label: "Last Name", type: "input_text", required: true },
  { name: "email", label: "Email", type: "input_text", required: true },
  { name: "phone", label: "Phone", type: "input_text", required: true },
];

Deno.test("WO-075/1 the resume upload and its paste box are one question: not ambiguous, not asked", () => {
  const r = plan([...BASE,
    { name: "resume", label: "Resume/CV", type: "input_file", required: true },
    { name: "resume_text", label: "Resume/CV", type: "textarea", required: true },
    { name: "cover_letter", label: "Cover Letter", type: "input_file", required: false },
    { name: "cover_letter_text", label: "Cover Letter", type: "textarea", required: false }]);
  eq(r.ambiguous, [], "the pair is not two questions");
  assert(!r.needs.some((n: any) => /resume|cover/i.test(n.label)), `nothing about the resume is asked: ${JSON.stringify(r.needs)}`);
  assert(!r.fill.some((f: any) => f.name === "resume_text"), `nothing is typed into the paste box: ${JSON.stringify(r.fill.map((f: any) => f.name))}`);
});

Deno.test("WO-075/1b without a resume on file, the upload is asked once, as the one question it is", () => {
  const { resume: _, ...noResume } = ANSWERS;
  const r = plan([...BASE,
    { name: "resume", label: "Resume/CV", type: "input_file", required: true },
    { name: "resume_text", label: "Resume/CV", type: "textarea", required: true }], noResume);
  eq(r.ambiguous, []);
  eq(r.needs.filter((n: any) => /resume/i.test(n.label)).map((n: any) => n.type), ["input_file"]);
});

Deno.test("WO-075/2 two real fields under one label still go to the person", () => {
  const r = plan([...BASE.filter((f) => f.name !== "phone"),
    { name: "phone", label: "Phone", type: "input_text", required: true },
    { name: "question_9", label: "Phone", type: "input_text", required: true }]);
  eq(r.ambiguous.map((a: any) => a.name).sort(), ["phone", "question_9"]);
});

Deno.test("WO-075/3 a paste box with no upload beside it is an ordinary field", () => {
  const r = plan([...BASE, { name: "summary_text", label: "Summary", type: "textarea", required: true },
    { name: "question_2", label: "Summary", type: "textarea", required: true }]);
  eq(r.ambiguous.map((a: any) => a.name).sort(), ["question_2", "summary_text"]);
});
