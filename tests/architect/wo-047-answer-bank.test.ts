// WO-047 (architect): the answer bank answers what the person's confirmed facts already settle, on the employer's own
// options, and nothing more. Every case is a real wording from the captured samples (evals/apply/questions-ci*.json).
// A TEST persona (evals/apply/fill-coverage.ts): Chicago, IL, United States; a bachelor's degree. Synthetic data.
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { mapQuestion } from "../../supabase/functions/_shared/question_map.ts";
import { PERSONA } from "../../evals/apply/fill-coverage.ts";

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function fill(label: string, options: string[], o: { type?: string; answers?: Record<string, { value: string; factId: string }> } = {}) {
  const fields = [{ name: "q", label, required: true, type: o.type ?? (options.length ? "multi_value_single_select" : "input_text"), options: options.map((x) => ({ label: x, value: x })) }];
  const p = planBatch({ userId: "TEST", postings: [{ job_id: "TEST-1", company: "Example Co", title: "", fields }], answers: o.answers ?? PERSONA, saved: {}, log: [], now: 0 });
  return p.ready.length ? p.ready[0].fields[0].value : "ASKED";
}
const YN = ["Yes", "No"];
const elsewhere = { ...PERSONA, country: { value: "India", factId: "TEST-persona" }, citizenship: { value: "India", factId: "TEST-persona" } };

Deno.test("WO-047/1 where the person lives, by country, from their stated country", () => {
  eq(mapQuestion({ label: "Do you currently reside in the U.S.?", type: "select", options: [] }).fact, "country", "no word edge after 'U.S.'");
  eq(fill("Do you currently reside in the U.S.?", YN), "Yes");
  eq(fill("Do you currently reside in the U.S.?", YN, { answers: elsewhere }), "No");
  eq(fill("Are you based in the U.S.? We are only able to hire within the U.S. at this time.", [], { type: "checkbox" }), "yes");
  eq(fill("Are you currently located in Canada or the U.S?", ["Canada", "US", "Other"]), "US");
});

Deno.test("WO-047/2 a question that names two places: a yes is known, a no is not", () => {
  eq(fill("Are you currently located in Canada or the U.S?", YN), "Yes");
  eq(fill("Are you currently located in Canada or the U.S?", YN, { answers: elsewhere }), "ASKED", "living in India: the 'or' leaves the other half to them");
  eq(fill("Are you a U.S. citizen or permanent resident?", YN, { answers: elsewhere }), "ASKED", "a citizen of India may hold a green card");
});

Deno.test("WO-047/3 never compound: residence with authorization, a move, a distance, or someone else", () => {
  for (const l of [
    "Are you located in and able to work in the US without visa sponsorship for the next 5 years?",
    "Do you currently live in the US and have work authorization?",
    "Are you located in the US or willing to relocate?",
    "Is your current employer based in the US?",
  ]) eq(mapQuestion({ label: l, type: "select", options: [] }).fact === "country", false, l);
});

Deno.test("WO-047/4 a list with no yes is answered by the fact, not by a derived yes", () => {
  eq(fill("Identify the highest level of education you have completed beyond a High School Diploma or equivalent, if applicable:",
    ["Master's", "Bachelor's", "Associate's", "Some college - Enrollment Only/No Degree", "Certificate program", "Other", "Not applicable"]), "Bachelor's");
  eq(fill("Do you have at least a High School Diploma or equivalent (i.e. GED)?", YN), "Yes", "a yes/no list still takes the derived yes");
});

Deno.test("WO-047/5 the country itself, when a list also holds its territories", () => {
  eq(fill("Country of residence", ["Canada", "United States", "United States Minor Outlying Islands", "Mexico"]), "United States");
  eq(fill("Country of residence", ["United States of America - Illinois", "United States of America - Texas", "United States Minor Outlying Islands"]), "ASKED", "a country-and-state list needs the state too: asked");
});
