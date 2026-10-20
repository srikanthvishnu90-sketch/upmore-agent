// WO-052 (architect): zero wrong answers is measured on every fill, not only on the 17 forms with an answer key. An
// independent reviewer read only the TEST persona and the planner's fills on samples A and B (never the code) and judged
// 73 of 719 distinct fills wrong and 35 not settled by the persona. Each of those questions must no longer get the answer
// it got: it is asked, or answered correctly from the persona. Synthetic persona; real employers' questions.
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { PERSONA } from "../../evals/apply/fill-coverage.ts";
import AUDIT from "../fixtures/apply/wo-052-audit.json" with { type: "json" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
// One required question on one posting: the label of the option (or the text) the planner filled, or "ASKED".
function fill(label: string, options: string[], o: { company?: string; type?: string; answers?: Record<string, { value: string; factId: string }> } = {}) {
  const fields = [{ name: "q", label, required: true, type: o.type ?? (options.length ? "multi_value_single_select" : "input_text"), options: options.map((x) => ({ label: x, value: x })) }];
  const p = planBatch({ userId: "TEST", postings: [{ job_id: "TEST-1", company: o.company ?? "Example Co", title: "", fields }], answers: o.answers ?? PERSONA, saved: {}, log: [], now: Date.UTC(2026, 9, 19) });
  return p.ready.length ? p.ready[0].fields[0].value : "ASKED";
}

Deno.test("WO-052/1 every fill the independent review judged wrong or unsettled no longer gets that answer", () => {
  const still: string[] = [];
  for (const c of (AUDIT as any).cases) {
    const got = fill(c.label, c.options, { company: c.company, type: c.type });
    if (got === c.was) still.push(`#${c.audit_id} ${c.verdict} ${c.company}: "${c.label.slice(0, 90)}" -> ${got} (${c.why.slice(0, 80)})`);
  }
  eq(still, [], `${still.length} of ${(AUDIT as any).cases.length} still answered as before`);
});

Deno.test("WO-052/2 the right answer where the persona settles it", () => {
  // "Without sponsorship" asks the opposite of the sponsorship fact: authorized (yes) and needing none (no) is a yes.
  eq(fill("Are you legally authorized to work in the US without sponsorship?", ["Yes", "No"]), "Yes");
  eq(fill("Do you have an unrestricted right to work and remain in the United States without sponsorship now or in the future?", ["Yes", "No", "N/A"]), "Yes");
  eq(fill("Are you legally authorized to work in the US without sponsorship?", ["Yes", "No"], { answers: { ...PERSONA, sponsorship: { value: "Yes", factId: "T" } } }), "No");
  // Another country's authorization or visa is not the person's US authorization.
  eq(fill("Are you legally authorized to work for any employer in South Korea?", [], { type: "checkbox" }), "ASKED");
  eq(fill("Do you need visa sponsorship in the UK now or in the future?", ["Yes", "No"]), "ASKED");
  // An office in another city is not the person's yes to working on site.
  eq(fill("Are you willing to be onsite 3 days per week in Detroit?", ["Yes", "No"]), "ASKED");
  eq(fill("Are you able to work in person at our Chicago, IL office?", ["Yes", "No"]), "Yes");
  // The question's own shape: a name for a name, the employer's currency where it is asked for.
  eq(fill("First Name and Last Name", []), "Test Person");
  eq(fill("Hoe ben je met deze vacature in contact gekomen? (bijv. linkedin / instagram / google/via een vriend)", []), "Company website");
  eq(fill("Are you currently employed by TEGNA or any TEGNA subsidiaries?", ["Yes", "No"], { company: "TEGNA" }), "No");
});

Deno.test("WO-052/3 a consent is the person's only when a standing consent covers it", () => {
  eq(fill("Agreement to Arbitrate", ["I understand and agree to the terms of the Agreement to Arbitrate set forth above."]), "ASKED");
  eq(fill("Confidentiality Acknowledgement", ["I Agree"]), "ASKED");
  eq(fill("Please review the linked document:", ["I acknowledge that I have read and understood the terms of the Lyft Candidate Privacy Notice."]),
    "I acknowledge that I have read and understood the terms of the Lyft Candidate Privacy Notice.", "a privacy notice stays the standing consent");
});

Deno.test("WO-052/4 a form that names its office elsewhere: the person's yes to the office is not for that city", () => {
  const plan = (fields: { name: string; label: string; options: string[] }[]) => planBatch({
    userId: "TEST", answers: PERSONA, saved: {}, log: [], now: Date.UTC(2026, 9, 19),
    postings: [{ job_id: "TEST-1", company: "Anthropic", title: "", fields: fields.map((f) => ({ ...f, required: false, type: "multi_value_single_select", options: f.options.map((x) => ({ label: x, value: x })) })) }],
  }).ready[0].fields.map((x) => x.name);
  const office = { name: "office", label: "Our Account Executive team is in office 4 days/week. Are you open to working in our office 4 days/week?", options: ["Yes", "No"] };
  eq(plan([{ name: "where", label: "Are you currently located in SF/NYC or open to relocation, if not?", options: ["Yes", "No"] }, office]).includes("office"), false, "SF/NYC is not Chicago: asked");
  eq(plan([office]), ["office"], "no office named anywhere: the person's own yes");
  eq(plan([{ name: "where", label: "Are you currently located in Chicago, IL?", options: ["Yes", "No"] }, office]).includes("office"), true, "their own city");
});
