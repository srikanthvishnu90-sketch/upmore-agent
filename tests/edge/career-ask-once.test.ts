// WO-009b-6: the ask-once measure counts required questions only, uses the product's classifier, reuses one saved answer
// per wording across postings, never counts a blocked posting, and a posting is ready only when nothing is left to ask.
import { coverage, report, rowsOf } from "../../evals/apply/ask-once.ts";
import SAMPLE_A from "../../evals/apply/questions-ci.json" with { type: "json" };
import SAMPLE_B from "../../evals/apply/questions-ci-b.json" with { type: "json" };
const REPORT_A = Deno.readTextFileSync(new URL("../../docs/apply/ask-once.md", import.meta.url));
const REPORT_B = Deno.readTextFileSync(new URL("../../docs/apply/ask-once-b.md", import.meta.url));
import { fromRendered } from "../../evals/apply/build-question-set.ts";

function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }
const f = (label: string, required = true, type = "input_text") => ({ name: label, label, required, type, options: [] });
const set = { postings: [
  { id: "a", family: "greenhouse", reason: null, fields: [f("First Name"), f("Email"), f("Resume/CV", true, "input_file"), f("Why do you want to work here?"), f("Twitter", false)] },
  { id: "b", family: "lever", reason: null, fields: [f("Full name"), f("Will you now or in the future require sponsorship?"), f("Why do you want to work here?")] },
  { id: "c", family: "ashby", reason: null, fields: [f("Email"), f("Describe a hard problem you solved")] },
  { id: "d", family: "smartrecruiters", reason: "BLOCKED_403", fields: [] },
] };

Deno.test("ask-once: optional questions and blocked postings are not counted; the product's classifier decides", () => {
  const rows = rowsOf(set);
  eq(rows.map((r) => r.id), ["a", "b", "c"]);
  eq(rows[0].required.map((q) => q.key), ["first_name", "email", "resume", "unknown"]);
  const c = coverage(rows, 0);
  eq([c.required, c.covered, c.ready_postings], [9, 6, 0]);
});

Deno.test("ask-once: answering the most common other wording once covers it on every posting that asks it", () => {
  const rows = rowsOf(set);
  const one = coverage(rows, 1);
  eq(one.ranked[0][1], { label: "Why do you want to work here?", postings: 2 });
  eq([one.covered, one.ready_postings], [8, 2], "a and b become ready; c still has its own question");
  eq(coverage(rows, 2).ready_postings, 3);
});

Deno.test("rendered questions keep only what a person is asked: a name, a label and a known required flag", () => {
  eq(fromRendered([{ name: "x", label: "Q", required: true, type: "radio", options: [{ label: "Yes", value: "Yes" }] }, { name: "", label: "no name", required: true }, { name: "y", label: "", required: true }]).length, 1);
});

Deno.test("the committed ask-once reports are what their committed question sets measure (no stale or hand-edited number)", () => {
  if (report(SAMPLE_A, "evals/apply/questions-ci.json") !== REPORT_A) throw new Error("docs/apply/ask-once.md is stale: rerun evals/apply/ask-once.ts");
  if (report(SAMPLE_B, "evals/apply/questions-ci-b.json") !== REPORT_B) throw new Error("docs/apply/ask-once-b.md is stale: rerun evals/apply/ask-once.ts on questions-ci-b.json");
});
