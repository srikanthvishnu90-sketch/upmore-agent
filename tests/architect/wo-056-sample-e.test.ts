// WO-056 (architect): sealed sample E (100 new real postings, each with its location), scored once on trunk f23d3d81
// (then spent): 605 of 619 fills judged right, 10 wrong, 4 not settled. Each was a rule reading a question as another:
// a marketing opt-in or a data-sharing consent as the privacy notice, office days that mention travel as the travel
// question, a bonus amount as the currency, an "authorized to work in the US?" with a note about sponsorship as the
// sponsorship question, the state that granted a certification as the person's state, and "U.S." read as the end of a
// sentence. Synthetic persona (Chicago, IL; US citizen; no certifications; marketing opt-in no); real employers' words.
import { beyondFact, planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { postingCountry, postingPlaces } from "../../supabase/functions/_shared/posting_place.ts";
import { PERSONA } from "../../evals/apply/fill-coverage.ts";
import AUDIT from "../fixtures/apply/wo-056-sample-e-audit.json" with { type: "json" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function fill(label: string, location: string | undefined, options: string[] = ["Yes", "No"], o: { company?: string; type?: string } = {}) {
  const fields = [{ name: "q", label, required: true, type: o.type ?? (options.length ? "multi_value_single_select" : "input_text"), options: options.map((x) => ({ label: x, value: x })) }];
  const p = planBatch({ userId: "TEST", postings: [{ job_id: "TEST-1", company: o.company ?? "Example Co", title: "", location, fields }], answers: PERSONA, saved: {}, log: [], now: Date.UTC(2026, 9, 20) });
  return p.ready.length ? p.ready[0].fields[0].value : "ASKED";
}

Deno.test("WO-056/1 every fill the review of sample E judged wrong or unsettled no longer gets that answer", () => {
  const still: string[] = [];
  for (const c of (AUDIT as any).cases) {
    const got = fill(c.label, c.location, c.options, { company: c.company, type: c.type });
    if (got === c.was) still.push(`#${c.audit_id} ${c.verdict} ${c.company} @ ${c.location}: "${c.label.slice(0, 90)}" -> ${got}`);
  }
  eq(still, [], `${still.length} of ${(AUDIT as any).cases.length} still answered as before`);
  eq((AUDIT as any).cases.length, 14);
});

Deno.test("WO-056/2 where the persona settles it, the right answer", () => {
  // Retell AI: the question asks the authorization; the note after it is about sponsorship (a checkbox: checked is yes).
  eq(fill("Are you currently authorized to work in the United States? Retell AI DOES assist with visa sponsorship, so please feel free to share your current status.", "San Francisco Bay Area", [], { type: "checkbox" }), "Yes");
  eq(fill("Will you now or in the future require visa sponsorship?", "Austin, TX"), "No", "the sponsorship question is unchanged");
  // SharkNinja: a recruitment-marketing opt-in is the marketing opt-in (no), never a privacy notice's yes.
  eq(fill("You can choose to receive recruitment marketing communications from us, including updates on job opportunities. Select yes if you wish to receive email communications from our recruitment team.", "Needham, MA, United States"), "No");
  // Mastery Charter: no certifications, so the state that granted them is "Not Applicable", never Illinois.
  eq(fill("Which state granted your certification(s)?", "Philadelphia, PA", ["New Jersey", "Pennsylvania", "Not Applicable", "Illinois"], { type: "select" }), "Not Applicable");
  eq(fill("What state do you live in?", "Philadelphia, PA", ["Illinois", "Pennsylvania"], { type: "select" }), "Illinois", "the person's state is still theirs");
  // Scout Motors: "current location: city?" takes the city alone.
  eq(fill("What is your current location: city?", "Charlotte, NC", [], { type: "input_text" }), "Chicago");
  // Anduril: "U.S. Person status and/or U.S. clearance eligibility" is met by being a U.S. person.
  eq(fill("U.S. Person status and/or U.S. clearance eligibility is required for this role due to access requirements for U.S. export-controlled information/facilities and/or depending on program, are you eligible to meet this requirement?", "Costa Mesa, California, United States"), "Yes");
});

Deno.test("WO-056/3 what the persona does not settle is asked", () => {
  eq(fill("I consent to have my personal data disclosed to other Momentum Group entities to be considered for all open positions that fit my profile.", "Dallas, Texas"), "ASKED", "consent to share beyond this employer");
  eq(fill("We value in-person collaboration, and this role requires in-office presence 3 days per week with periodic travel to K2's headquarters in Torrance, CA. Are you able to support this hybrid expectation?", "Seattle, WA"), "ASKED", "Seattle office days for a Chicago person, not travel");
  eq(fill("Are you open to working fully remote, with occasional travel for team offsites?", "United States/Canada", [], { type: "checkbox" }), "ASKED");
  eq(fill("What is your desired bonus expectation? Please specify the amount and currency.", "New York, NY", []), "ASKED");
  eq(fill("If \"Employee Referral\" was selected for \"How did you hear about this job?\" please type the full name of the referring employee. If not, please type in \"N/A\".", "New York, NY", []), "ASKED");
  eq(fill("Are you aware of any information that could be considered a conflict of interest, either actual or perceived, if you were to work for a DoD contractor?", "Palo Alto, CA"), "ASKED");
  eq(fill("If you've previously served in the U.S. Armed Forces: As part of the application process, are you willing to voluntarily authorize the release of documentation verifying any prior separation from the U.S. Armed Forces?", "Palo Alto, CA", ["Yes", "No", "Not Applicable"]), "ASKED");
  eq(fill("Have you worked at a startup or quant firm? (i.e., internship, part-time, etc)", "Chicago, IL", [], { type: "checkbox" }), "ASKED");
  eq(beyondFact("security_clearance", { label: "Active Security Clearance(s)", type: "multi_value_single_select", options: [{ label: "Secret" }, { label: "Expired clearance" }, { label: "Never held a clearance" }] }), true);
  eq(beyondFact("us_person", { label: "Are you a U.S. Person who can obtain and maintain a Security Clearance?", type: "radio" }), true, "sample D's CHAOS stays asked");
});

Deno.test("WO-056/4 every country is a country: Nepal is abroad, and \"United States/Canada\" is two places", () => {
  eq(postingCountry(postingPlaces("Niural Nepal")), "abroad");
  eq(fill("Expected Salary", "Niural Nepal", [], { type: "text" }), "ASKED", "Niural: a US salary is not a Nepal expectation");
  eq(postingPlaces("United States/Canada").map((p) => p.country), ["us", "abroad"]);
  eq(["Kathmandu, Nepal", "Lahore, Pakistan", "Kyiv, Ukraine", "Montevideo, Uruguay", "Colombo, Sri Lanka"].map((t) => postingCountry(postingPlaces(t))), Array(5).fill("abroad"));
  eq(["Lebanon, PA", "Peru, IL", "Mexico, MO", "Jordan, MN"].map((t) => postingCountry(postingPlaces(t))), Array(4).fill("us"), "a US town named after a country stays in the US");
});
