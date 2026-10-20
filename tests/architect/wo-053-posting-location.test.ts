// WO-053 (architect): two questions depend on where the job is, and only the posting's own location settles them: work
// rights "in the country where this job is located" (a London posting is not the person's US authorization) and an
// office question that names no place (an office in San Francisco is not a Chicago person's yes). The location text is
// the employer's own, as the posting page shows it (every string below is from a captured real page,
// tests/fixtures/forms-ci, or a real posting's API); without it, both are asked. Synthetic persona (Chicago, IL; US
// authorized, no sponsorship, onsite yes, relocation no).
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
import { postingCountry, postingPlaces } from "../../supabase/functions/_shared/posting_place.ts";
import { mapQuestion } from "../../supabase/functions/_shared/question_map.ts";
import { PERSONA } from "../../evals/apply/fill-coverage.ts";

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const fill = (label: string, location: string | undefined, options = ["Yes", "No"]) => {
  const p = planBatch({ userId: "TEST", answers: PERSONA, saved: {}, log: [], now: Date.UTC(2026, 9, 20),
    postings: [{ job_id: "TEST-1", company: "Example Co", title: "", location, fields: [{ name: "q", label, required: true, type: "multi_value_single_select", options: options.map((x) => ({ label: x, value: x })) }] }] });
  return p.ready.length ? p.ready[0].fields[0].value : "ASKED";
};

Deno.test("WO-053/1 the posting's country, only from what its location text says", () => {
  const country = (t: string) => postingCountry(postingPlaces(t));
  eq(["Costa Mesa, California, United States; Fort Collins, Colorado, United States", "Mesa, AZ: Power Rd / Elliot Rd", "Hawthorne, CA",
    "San Francisco, CA - US", "San Francisco", "United States", "New Jersey - Lyndhurst", "Remote - US"].map(country), Array(8).fill("us"));
  eq(["London, United Kingdom", "GB-London", "HK - Hong Kong SAR", "Germany", "Spain (Remote); Basque (Remote)", "Abu Dhabi", "Riyadh",
    "Brazil", "Vancouver, BC", "NYC; London"].map(country), Array(10).fill("abroad"));
  // Not settled: a city that is also abroad, a remote posting with no country, nothing at all.
  eq(["Cambridge", "Remote", "Atlanta, GA / Hybrid / Remote / Charlotte, NC", ""].map(country), ["", "", "", ""]);
});

Deno.test("WO-053/2 work rights in the job's country: the person's US answer only for a US posting", () => {
  const auth = "Are you lawfully authorized to work in the country where this job is located?";
  const sponsor = "Will you now or at any point in the future require sponsorship to maintain lawful employment in the country where this job is located?";
  eq(fill(auth, "Costa Mesa, California, United States"), "Yes");
  eq(fill(sponsor, "Hawthorne, CA"), "No");
  eq(fill(auth, "London, United Kingdom"), "ASKED", "WPP Media's London posting: a US person's UK work rights are not stated");
  eq(fill(sponsor, "London, United Kingdom"), "ASKED");
  eq(fill("For Snowflake to anticipate possible immigration timelines and obligations, could you confirm you are currently authorized to work in the country to which you are applying?", "GB-London"), "ASKED");
  eq(fill("Are you authorized to work in the country where the job is located?", "San Francisco"), "Yes", "OpenAI's San Francisco");
  eq(fill("Are you legally authorized to work in the country in which you are applying?", undefined), "ASKED", "no location: asked");
  eq(fill("Are you authorized to work in the stated location of this role?", "Riyadh"), "ASKED");
  // A question that names its country is unchanged by where the job is.
  eq(fill("Are you legally authorized to work in the United States?", "London, United Kingdom"), "Yes");
});

Deno.test("WO-053/3 an office question naming no place: the person's yes only for a posting in their city", () => {
  const office = "Are you able to work from our US office three days per week?";
  eq(fill(office, "San Francisco"), "ASKED", "OpenAI: a San Francisco office, a Chicago person who will not relocate");
  eq(fill(office, "Chicago, IL"), "Yes");
  eq(fill(office, "San Francisco, CA | New York, NY | Chicago, IL"), "Yes", "one of its offices is theirs");
  eq(fill(office, "Remote"), "ASKED");
  eq(fill(office, "Illinois"), "ASKED", "a state-wide posting names no office");
  eq(fill(office, undefined), "ASKED", "no location: asked");
  // The question's own place still decides first.
  eq(fill("Are you able to work in person at our Chicago, IL office?", "San Francisco, CA"), "Yes");
  eq(fill("Are you willing to be onsite 3 days per week in Detroit?", "Chicago, IL"), "ASKED");
});

Deno.test("WO-053/4 two of sealed-wd3's misses (WO-048 round 3; that set is spent): the person's own state and notice period", () => {
  // "...notice period with your current employer?" read as the current employer (asked); the stated notice period answers it.
  eq(fill("What is your notice period with your current employer?", "Chicago, IL", ["Immediately available", "1 week", "2 weeks", "1 month", "More than 1 month"]), "2 weeks");
  eq(fill("In which U.S. state do you currently reside?", "Chicago, IL", ["Alabama", "California", "Illinois", "New York"]), "Illinois");
  // The employer is still the employer.
  eq(mapQuestion({ label: "Current employer", type: "input_text", options: [] }).fact, "current_employer");
});

Deno.test("WO-053/5 an answer about work rights somewhere else is never kept as the person's own", async () => {
  const { answerKey } = await import("../../supabase/functions/_shared/question_map.ts");
  const yn = [{ label: "Yes" }, { label: "No" }];
  const key = (label: string, job = "gh:wpp:1") => answerKey({ label, type: "multi_value_single_select", options: yn } as any, job);
  const here = "Are you lawfully authorized to work in the country where this job is located?";
  const sponsorUK = "Do you need visa sponsorship in the UK now or in the future?";
  // The job's own country: that posting's alone.
  eq(key(here).startsWith("job:"), true);
  eq(key(here) === key(here, "gh:acme:2"), false, "a London answer does not travel to another posting");
  // Another named country: only with that wording, never the person's sponsorship fact.
  eq(key(sponsorUK).startsWith("label:"), true);
  eq(key("Will you now or in the future require visa sponsorship?"), "fact:sponsorship", "the US question stays the person's fact");
  // End to end: the person said "No" for WPP's London posting; a US posting with the same wording is not answered by it.
  const saved = { [key(here)]: { value: "No", factId: "TEXT" }, [key(sponsorUK)]: { value: "Yes", factId: "TEXT" } };
  const plan = (job: string, location: string, label: string) => planBatch({ userId: "TEST", answers: PERSONA, saved, log: [], now: 0,
    postings: [{ job_id: job, company: "Example Co", title: "", location, fields: [{ name: "q", label, required: true, type: "multi_value_single_select", options: yn.map((o) => ({ ...o, value: o.label })) }] }] }).ready[0]?.fields[0]?.value ?? "ASKED";
  eq(plan("gh:wpp:1", "London, United Kingdom", here), "No", "the person's own answer for that posting");
  eq(plan("gh:acme:2", "Austin, TX", here), "Yes", "a US posting: the person's US authorization, not the London answer");
  eq(plan("gh:acme:2", "Austin, TX", "Will you now or in the future require visa sponsorship?"), "No", "the UK sponsorship yes is not theirs here");
});
