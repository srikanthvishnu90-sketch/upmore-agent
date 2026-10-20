// WO-057 (architect): sealed sample F (100 new real postings, each with its location), scored once on trunk 7bdeaa63
// (then spent): 595 of 604 fills judged right, 7 wrong, 2 not settled. The worst: "Are you currently a U. S. citizen?"
// answered "No" for a US citizen, because a clearance named in the same label won the reading. Synthetic persona
// (Chicago, IL; US citizen; 3 years as a Data Analyst; start in 2 weeks); real employers' words.
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { PERSONA } from "../../evals/apply/fill-coverage.ts";
import AUDIT from "../fixtures/apply/wo-057-sample-f-audit.json" with { type: "json" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function fill(label: string, location: string | undefined, options: string[] | { label: string; value: string }[] = ["Yes", "No"], o: { type?: string } = {}) {
  const opts = (options as any[]).map((x) => typeof x === "string" ? { label: x, value: x } : x);
  const fields = [{ name: "q", label, required: true, type: o.type ?? (opts.length ? "multi_value_single_select" : "input_text"), options: opts }];
  const p = planBatch({ userId: "TEST", postings: [{ job_id: "TEST-1", company: "Example Co", title: "", location, fields }], answers: PERSONA, saved: {}, log: [], now: Date.UTC(2026, 9, 20) });
  return p.ready.length ? p.ready[0].fields[0].value : "ASKED";
}

Deno.test("WO-057/1 every fill the review of sample F judged wrong or unsettled no longer gets that answer", () => {
  const still: string[] = [];
  for (const c of (AUDIT as any).cases) {
    const got = fill(c.label, c.location, c.options, { type: c.type });
    if (got === c.was) still.push(`#${c.audit_id} ${c.verdict} ${c.company} @ ${c.location}: "${c.label.slice(0, 90)}" -> ${got}`);
  }
  eq(still, [], `${still.length} of ${(AUDIT as any).cases.length} still answered as before`);
  eq((AUDIT as any).cases.length, 9);
});

Deno.test("WO-057/2 where the persona settles it, the right answer", () => {
  // Tenet3: the question asked is citizenship ("U. S." spaced), not the clearance it explains.
  eq(fill("This position requires current U. S. citizenship in order to achieve and maintain a security clearance. Are you currently a U. S. citizen?", "Dayton, Ohio"), "Yes");
  // Magnet, Exegy, Rivian: a list that tells authorization by nationality from a work permit; a US citizen at a US job.
  const list = ["I am authorized to work in the country due to my nationality", "I am authorized to work in the country based on a valid work permit and do not need a company to sponsor my visa", "I am authorized to work in the country based on a valid work permit which needs to be sponsored by the company I work for", "I am not authorized to work in the country and need visa support"];
  eq(fill("Work authorization", "United States", list, { type: "select" }), list[0]);
  eq(fill("Work authorization", "London, United Kingdom", list, { type: "select" }), "ASKED", "a job abroad: that country's authorization");
  // MongoDB: the company's careers page, not a college's.
  eq(fill("How did you learn about this job?", "New York, NY", ["College Careers Page / Event", "LinkedIn", "MongoDB Careers Page", "Other"]), "MongoDB Careers Page");
});

Deno.test("WO-057/3 what the persona does not settle, or a format a fact does not fit, is asked", () => {
  eq(fill("What date are you available to begin employment (Month and Year)", "Chicago, Illinois", [], { type: "textarea" }), "ASKED", "\"2 weeks\" is not a month and year");
  eq(fill("When would you be available to start?", "Chicago, IL", [], { type: "text" }), "2 weeks", "a free start question keeps the stated start");
  eq(fill("How many years of professional experience do you working in UX/UI design?", "Remote, United States", ["No experience", "Less than 1 year", "More than 1 year and less than 3 years", "More than 3 years and less than 5 years"]), "ASKED");
  eq(fill("This position is HYBRID in Dayton, Ohio. Are you willing to travel to Dayton at least 2 days per week?", "Dayton, Ohio"), "ASKED");
  eq(fill("Are you willing to travel?", "Chicago, IL"), "Yes", "plain travel is still the person's yes");
  eq(fill("Where are you staying in Hyderabad? Mention full address.", "Hyderabad, Telangana, India", [], { type: "input_text" }), "ASKED");
  eq(fill("Do you have any relatives or contacts with whom you have personal or social relationships working at Eikon Therapeutics?", "Jersey City, NJ"), "ASKED");
  eq(fill("Are you currently employed by, or act as a representative of a political party in the US?", "Colorado", [], { type: "radio" }), "ASKED");
});
