// WO-058 (architect): sealed sample G (100 new real postings, each with its location), scored once on trunk 2fc9e4f9
// (then spent): 608 of 624 fills judged right, 12 wrong, 4 not settled. The worst: "Candidates must be authorized ... without
// sponsorship. Are you legally authorized to work for ANY employer in the United States?" left unchecked for a US citizen,
// because the note before the question was read as the sponsorship question; and the full address typed into the city and
// zip boxes. Synthetic persona (Chicago, IL; US citizen; no SMS opt-in; employer list Example Analytics, Sample Retail);
// real employers' words.
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { PERSONA } from "../../evals/apply/fill-coverage.ts";
import AUDIT from "../fixtures/apply/wo-058-sample-g-audit.json" with { type: "json" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function fill(label: string, location: string | undefined, options: string[] = ["Yes", "No"], o: { type?: string } = {}) {
  const opts = options.map((x) => ({ label: x, value: x }));
  const fields = [{ name: "q", label, required: true, type: o.type ?? (opts.length ? "multi_value_single_select" : "input_text"), options: opts }];
  const p = planBatch({ userId: "TEST", postings: [{ job_id: "TEST-1", company: "Example Co", title: "", location, fields }], answers: PERSONA, saved: {}, log: [], now: Date.UTC(2026, 9, 20) });
  return p.ready.length ? p.ready[0].fields[0].value : "ASKED";
}

Deno.test("WO-058/1 every fill the review of sample G judged wrong or unsettled no longer gets that answer", () => {
  const still: string[] = [];
  for (const c of (AUDIT as any).cases) {
    const got = fill(c.label, c.location, c.options, { type: c.type });
    if (got === c.was) still.push(`#${c.audit_id} ${c.verdict} ${c.company} @ ${c.location}: "${c.label.slice(0, 90)}" -> ${got}`);
  }
  eq(still, [], `${still.length} of ${(AUDIT as any).cases.length} still answered as before`);
  eq((AUDIT as any).cases.length, 16);
});

Deno.test("WO-058/2 where the persona settles it, the right answer", () => {
  // Nexxen: the question asked is the authorization; the sentence before it states the employer's rule.
  eq(fill("Candidates must be authorized to work in the U.S. without current or future sponsorship by Nexxen. Are you legally authorized to work for ANY employer in the United States?", "New York, NY", [], { type: "checkbox" }), "yes", "a checkbox: checked");
  eq(fill("Will you now or in the future require sponsorship for employment visa status?", "New York, NY"), "No", "the sponsorship question is unchanged");
  // AvidXchange: each part of the address takes that part.
  eq(fill("Primary Address Line 1", "Charlotte, North Carolina, United States", []), "1 Example St");
  eq(fill("Primary Address City", "Charlotte, North Carolina, United States", []), "Chicago");
  eq(fill("Primary Address Zip Code", "Charlotte, North Carolina, United States", []), "60601");
  eq(fill("Primary Address Line 2", "Charlotte, North Carolina, United States", []), "ASKED", "a second line is never the address");
  eq(fill("Home Address", "Chicago, IL", []), "1 Example St, Chicago, IL 60601", "the whole address is still the address");
  // Still the person's own: spoken languages, a plain phone box, the field named "Source".
  eq(fill("What languages do you speak fluently?", "Chicago, IL", []), "English");
  eq(fill("Phone", "Chicago, IL", []), "+1 555 010 0000");
  eq(fill("Source", "Chicago, IL", ["Company website", "LinkedIn", "Other"]), "Company website");
});

Deno.test("WO-058/3 what the persona does not settle, or asks two things at once, is asked", () => {
  eq(fill("What programming languages are you most proficient in?", "Mississauga, Ontario", [], { type: "textarea" }), "ASKED", "a programming language is not a spoken one");
  eq(fill("So far this year, what percentage of what you've closed was net-new logos vs. renewals/expansion? And of those new logos, how many did you source yourself?", "Salt Lake City", [], { type: "textarea" }), "ASKED");
  eq(fill("What is the best phone number and email to reach you?", "Laurel, MD", [], { type: "textarea" }), "ASKED", "two facts in one box");
  eq(fill("Where are you located currently? Are you able/willing to relocate or commute for this position?", "Hickory, North Carolina, United States", []), "ASKED", "two questions");
  eq(fill("By providing your mobile number and consenting, you agree to receive SMS/text messages from Tevora for purposes related to your job application.", "Seattle, WA", [], { type: "text" }), "ASKED", "a number given as consent to texts the person declined");
  eq(fill("Have you ever been employed or worked with a staffing/contract agency to provide services for AvidXchange in the past?", "Charlotte, NC"), "ASKED", "agency work is not on the employer list");
  eq(fill("SpaceX & SpaceXAI Employment History", "Hawthorne, CA", ["I have never worked for SpaceX, SpaceXAI, xAI, X, or Twitter", "I am a former SpaceX, SpaceXAI, xAI, X, or Twitter employee", "I am currently working or have worked at a SpaceX, SpaceXAI, xAI, X, or Twitter facility for another employer (i.e. contracted by a third-party employer)"]), "ASKED", "a list with a third-party contractor");
  eq(fill("Do you consent to Allegiant sharing your application and candidate information with Sun Country Airlines, an affiliated subsidiary of Allegiant Travel Company, for employment consideration?", "Appleton, WI", ["Yes", "No"], { type: "checkbox" }), "ASKED", "sharing with another company");
  eq(fill("Applicant's Statement", "1 Remote", [], { type: "checkbox" }), "ASKED", "a heading does not say what is attested");
  eq(fill("Statement Certification: I certify that the statements made in this application are true and correct. In consideration of my employment, I agree to", "Boise, ID", ["I agree with this statement."], { type: "radio" }), "ASKED", "an agreement beyond certifying");
  eq(fill("Please confirm the following", "Montreal", ["I certify that the information I have provided is complete and accurate.", "I acknowledge that by submitting this application I am consenting to reference checks, background checks, and/or credit checks."], { type: "checkbox" }), "ASKED", "a credit check is not a background check");
});
