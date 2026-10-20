// WO-059 (architect): sealed sample H (100 new real postings, each with its location), scored once on trunk 14803c01
// (then spent): 595 of 632 fills judged right, 31 wrong, 6 not settled. The worst: "Do you have the permanent, legal right
// to work in the U.S.? (We do not offer visa sponsorship)" answered "No" for a US citizen, and Upvest's "Name" beside its
// own "Last name" box given the full name (26 postings). Also here: three Workday misses (sealed-wd3, spent) and the harness
// reading schema-2 radios, checkbox groups and multiselects. Synthetic persona (Chicago, IL; US citizen; Data Analyst at
// Example Analytics; no clearance); real employers' words.
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { chooseOption } from "../../supabase/functions/_shared/answer_options.ts";
import { PERSONA } from "../../evals/apply/fill-coverage.ts";
import AUDIT from "../fixtures/apply/wo-059-sample-h-audit.json" with { type: "json" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function fill(label: string, location: string | undefined, options: string[] = ["Yes", "No"], o: { type?: string; beside?: string[]; company?: string; answers?: Record<string, unknown> } = {}) {
  const opts = options.map((x) => ({ label: x, value: x }));
  const fields = [{ name: "q", label, required: true, type: o.type ?? (opts.length ? "multi_value_single_select" : "input_text"), options: opts },
    ...(o.beside ?? []).map((l, i) => ({ name: `b${i}`, label: l, required: true, type: "input_text", options: [] }))];
  const p = planBatch({ userId: "TEST", postings: [{ job_id: "TEST-1", company: o.company ?? "Example Co", title: "", location, fields }], answers: (o.answers ?? PERSONA) as any, saved: {}, log: [], now: Date.UTC(2026, 9, 20) });
  return p.ready.length ? p.ready[0].fields.find((f: any) => f.name === "q")?.value ?? "ASKED" : "ASKED";
}

Deno.test("WO-059/1 every fill the review of sample H judged wrong or unsettled no longer gets that answer", () => {
  const still: string[] = [];
  for (const c of (AUDIT as any).cases) {
    const got = fill(c.label, c.location, c.options, { type: c.type, beside: c.beside, company: c.company });
    if (got === c.was) still.push(`#${c.audit_id} ${c.verdict} ${c.company} @ ${c.location}: "${c.label.slice(0, 90)}" -> ${got}`);
  }
  eq(still, [], `${still.length} of ${(AUDIT as any).cases.length} still answered as before`);
  eq((AUDIT as any).cases.length, 12);
});

Deno.test("WO-059/2 where the persona settles it, the right answer", () => {
  // Viget: a permanent right to work in the US, for a US citizen; the note about sponsorship after it is not the question.
  eq(fill("Do you have the permanent, legal right to work in the U.S.? (We are only able to evaluate US citizens and green card holders/permanent residents. We do not offer visa sponsorship, CPT, or OPT.)", "Boulder, CO", ["Yes", "No"], { type: "radio" }), "Yes");
  // Someone authorized to work but not a citizen is not, by that, permanently authorized: asked.
  const visa = { ...PERSONA, citizenship: { value: "India", factId: "f-cit" } };
  eq(fill("Do you have the permanent, legal right to work in the U.S.?", "Boulder, CO", ["Yes", "No"], { type: "radio", answers: visa }), "ASKED");
  // Latitude AI: the title held at the most recent employer.
  eq(fill("Title Held at Most Recent Employer", "Pittsburgh, PA", []), "Data Analyst");
  eq(fill("Most Recent Employer", "Pittsburgh, PA", []), "Example Analytics", "the employer is still the employer");
  // Upvest: "Name" beside "Last name" is the first name; alone it is the full name.
  eq(fill("Name", "Berlin", [], { beside: ["Last name"] }), "Test");
  eq(fill("Name", "Chicago, IL", []), "Test Person");
  // A disability self-identification (CC-305) is declined, as the person declines voluntary self-identification.
  eq(fill("Form CC-305 Voluntary Self-Identification of Disability. Why are you being asked to complete this form?", "Arlington, VA", ["Yes, I have a disability, or have a history/record of having a disability", "No, I don't have a disability, or a history/record of having a disability", "I don't wish to answer"]), "I don't wish to answer");
});

Deno.test("WO-059/3 what the persona does not settle is asked", () => {
  eq(fill("This position requires the ability to obtain and maintain a U.S. government security clearance, although a clearance may not be required immediately. Do you meet the requirements to obtain and maintain a clearance if needed for the role?", "Playa Vista, California, United States"), "ASKED", "holding none does not say one could be obtained");
  eq(fill("Have you previously worked with Microsoft SQL Server?", "Remote", ["Yes", "No"], { type: "radio" }), "ASKED", "a tool, not this employer");
  eq(fill("Have you worked with us before?", "Chicago, IL", ["Yes", "No"], { type: "radio", company: "Northwind Ledger" }), "No", "this employer, from the complete employer list");
  // The same employer by name only: "Example Co" may or may not be the person's "Example Analytics"; "Meta" is never "Metabase".
  eq(fill("Have you worked with us before?", "Chicago, IL", ["Yes", "No"], { type: "radio", company: "Example Co" }), "ASKED");
  const metabase = { ...PERSONA, former_employers: { value: "Metabase; Sample Retail", factId: "f-emp" } };
  eq(fill("Have you worked with us before?", "Menlo Park, CA", ["Yes", "No"], { type: "radio", company: "Meta", answers: metabase }), "No");
  eq(fill("Are you currently employed by a Coupa partner?", "Charlotte, NC", ["Yes", "No"], { type: "select", company: "Coupa Software" }), "ASKED");
  eq(fill("Were you referred by, or do you personally know, a current Lightcast employee?", "Moscow, ID", ["Yes", "No"], { type: "radio" }), "ASKED");
  eq(fill("If you have ever worked or attended school under another name, please state the name below:", "Quantico, VA", [], { type: "text" }), "ASKED");
  eq(fill("Are you currently enrolled in an accredited undergraduate or graduate program? What is your expected graduation month and year?", "New York City", [], { type: "textarea" }), "ASKED");
  eq(fill("Academic Program or Department Website", "Remote", [], { type: "input_text" }), "ASKED");
  eq(fill("To work with us, you must be authorized to work in the United States. You will be considered an at-will employee. Do you agree?", "Trenton, New Jersey", ["Yes", "No", "I don't know"], { type: "radio" }), "ASKED");
});

Deno.test("WO-059/4 Workday misses (sealed-wd3, spent): a stated current employer, a leaf under categories, a corporate website", () => {
  eq(fill("Are you currently employed?", "Chicago, IL", ["Yes", "No"], { type: "radio" }), "Yes");
  eq(fill("What is your current employment status?", "Chicago, IL", ["Employed full-time", "Employed part-time", "Not employed"]), "ASKED", "a list of kinds is the person's to pick");
  eq(chooseOption("how_heard", "Company website", ["Job Board > Indeed", "Website > Corporate Website", "Website > Search Engine"].map((x) => ({ label: x, value: x }))), "Website > Corporate Website");
  eq(chooseOption("major", "Statistics", ["Business > Accounting", "Mathematics & Statistics > Statistics"].map((x) => ({ label: x, value: x }))), "Mathematics & Statistics > Statistics");
  eq(chooseOption("major", "Statistics", ["A > Statistics", "B > Statistics"].map((x) => ({ label: x, value: x }))), null, "two leaves of that name: asked");
});
