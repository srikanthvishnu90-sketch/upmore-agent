// Owner's Ashby scope (2026-10-21): the 6 captured Ashby forms fill and ask correctly, end to end through the engine's own
// plan (scripts/apply.ts planApplication: planner, then the WO-102 contract). F-013 is the baseline: every Ashby posting on
// the shelf has an empty location, so each form is planned with its page's location AND with none. With none, a question
// about the job's country is asked: the person's US work rights never stand in for an unknown job country, and the
// person's own location ("Chicago, IL") answers only where they live, never where the job is (location alone never
// authorizes; same rule as the Prolific compound-question fix). Schemas: what the engine read from each captured page.
import S from "../fixtures/forms-ci/ashby-schemas.json" with { type: "json" };
import { planApplication, trustedFacts } from "../../scripts/apply.ts";
import { planBatch } from "../../supabase/functions/_shared/career_apply.ts";
const eq = (a: unknown, b: unknown, why: string) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${why}:\n got ${JSON.stringify(a)}\nwant ${JSON.stringify(b)}`); };
const ok = (v: unknown, why: string) => { if (!v) throw new Error(why); };
// Owner-shaped synthetic facts (the owner's real values never enter the repo).
const FACTS: [string, string][] = [["full_name", "Sam Synthetic"], ["first_name", "Sam"], ["last_name", "Synthetic"], ["email", "sam@example.test"],
  ["phone", "(555) 010-0199"], ["location", "Chicago, IL"], ["city", "Chicago"], ["state", "IL"], ["country", "United States"],
  ["linkedin", "https://linkedin.com/in/sam-synthetic"], ["current_employer", "Synthetic Labs"], ["current_title", "Founder"],
  ["work_authorization", "Yes"], ["sponsorship", "No"], ["years_experience", "3"], ["school", "Example University"], ["gpa", "3.9"]];
const KEY_OF = Object.fromEntries(FACTS.map(([k], i) => ["SYN-" + i, k]));
const M = trustedFacts({ user_id: "SYN", saved: {}, answers: Object.fromEntries(FACTS.map(([k, v], i) =>
  [k, { value: v, factId: "SYN-" + i, confirmed: true, provenance: "owner stated (TEST)", confirmation_event_id: "evt-" + i }])) }, { sha256: "a".repeat(64) });
const short = (l: string) => String(l).replace(/\s+/g, " ").trim().slice(0, 70);
function plan(id: string, location: string) {
  const schema = (S as any).forms[id].schema;
  const p: any = planApplication({ manifest: M, userId: "SYN", jobId: "ashby:" + id, employer: "SynCo", location, schema, artifact: { filename: "r.pdf", sha256: "a".repeat(64) }, now: Date.UTC(2026, 9, 21) });
  // Every field the planner would fill (as if all were optional), with the fact it came from.
  const b: any = planBatch({ userId: "SYN", postings: [{ job_id: "ashby:" + id, company: "SynCo", title: "", location, fields: schema.map((f: any) => ({ ...f, required: false })) }],
    answers: M.answers, saved: M.saved, log: [], now: Date.UTC(2026, 9, 21) });
  return { asked: p.ready ? [] : p.needs.map((n: any) => short(n.label)),
    filled: (b.ready[0]?.fields ?? []).filter((f: any) => KEY_OF[f.factId]).map((f: any) => [short(f.label), KEY_OF[f.factId]]),
    full: (b.ready[0]?.fields ?? []).filter((f: any) => KEY_OF[f.factId]).map((f: any) => [String(f.label).replace(/\s+/g, " ").trim(), KEY_OF[f.factId]]) };
}
const RESIDENCE = /^location$|currently located|currently live|where (are|do) you (currently )?(live|located|based)|which state, province, or region do you currently live/i;
const NAMES_US = /\bu\.?s\.?a?\b|united states|\bamerica\b/i, HOME_STATUS = /\byour current work authori[sz]ation\b/i;
// WO-055 (kept, owner's decision pending): a sponsorship question that names no place ("require immigration sponsorship to
// work for Crusoe?") is the person's own fact at a posting with no location. Pinned here by name so a change is visible.
const WO055_GENERIC_SPONSORSHIP = /^Will you now or in the future require immigration sponsorship to work for Crusoe/;

const EXPECT: Record<string, { asked_no_location: string[]; filled_no_location: [string, string][]; asked_page: string[] }> = {
 "ashby-airwallex-cba0ab2e-5ab8-416b-ac9b-115638e3c65c": {
  "asked_no_location": [
   "Salary Expectations",
   "What is your notice period?",
   "Do you have any relatives currently working for Airwallex?",
   "How did you first hear about Airwallex?",
   "We encourage you to use AI tools to help research, prepare, or refine "
  ],
  "filled_no_location": [
   [
    "Full Name",
    "full_name"
   ],
   [
    "First Name",
    "first_name"
   ],
   [
    "Last Name / Surname",
    "last_name"
   ],
   [
    "Email",
    "email"
   ],
   [
    "Phone",
    "phone"
   ],
   [
    "Location",
    "location"
   ],
   [
    "Linkedin Link",
    "linkedin"
   ]
  ],
  "asked_page": [
   "Salary Expectations",
   "What is your notice period?",
   "Do you have any relatives currently working for Airwallex?",
   "How did you first hear about Airwallex?",
   "We encourage you to use AI tools to help research, prepare, or refine "
  ]
 },
 "ashby-crusoe-b1b99030-d393-4329-80fe-5bc2e4c93b03": {
  "asked_no_location": [
   "Do you currently work for Crusoe, or have you worked for Crusoe in the"
  ],
  "filled_no_location": [
   [
    "Name",
    "full_name"
   ],
   [
    "Email",
    "email"
   ],
   [
    "Phone Number",
    "phone"
   ],
   [
    "Which state, province, or region do you currently live in?",
    "state"
   ],
   [
    "Will you now or in the future require immigration sponsorship to work ",
    "sponsorship"
   ],
   [
    "Linkedin URL",
    "linkedin"
   ]
  ],
  "asked_page": [
   "Do you currently work for Crusoe, or have you worked for Crusoe in the"
  ]
 },
 "ashby-harvey-977e6184-2dc4-422b-8ab3-bc26bb73f778": {
  "asked_no_location": [
   "Preferred Last Name",
   "Are you legally authorized to work in the country where this role is l",
   "Will you now or will you in the future require employment visa sponsor",
   "This role is tied to the office location listed in the job posting. Te"
  ],
  "filled_no_location": [
   [
    "Legal First and Last Name",
    "full_name"
   ],
   [
    "Preferred First Name",
    "first_name"
   ],
   [
    "Email",
    "email"
   ],
   [
    "Phone Number",
    "phone"
   ],
   [
    "Location",
    "location"
   ],
   [
    "Current or Most Recent Employer",
    "current_employer"
   ],
   [
    "University or School Attended",
    "school"
   ],
   [
    "LinkedIn",
    "linkedin"
   ]
  ],
  "asked_page": [
   "Preferred Last Name",
   "This role is tied to the office location listed in the job posting. Te"
  ]
 },
 "ashby-lilt-production-959498b8-a18e-457b-9e93-07662c38f3d3": {
  "asked_no_location": [
   "How long have you been a professional Translator?",
   "Do you have translation experience in Marketing?",
   "Do you have Technology translation experience?",
   "Do you have Legal translation experience?",
   "Are you a native Basque translator?"
  ],
  "filled_no_location": [
   [
    "Name",
    "full_name"
   ],
   [
    "Phone Number",
    "phone"
   ],
   [
    "Email",
    "email"
   ],
   [
    "Link to your LinkedIn Profile",
    "linkedin"
   ]
  ],
  "asked_page": [
   "How long have you been a professional Translator?",
   "Do you have translation experience in Marketing?",
   "Do you have Technology translation experience?",
   "Do you have Legal translation experience?",
   "Are you a native Basque translator?"
  ]
 },
 "ashby-openai-8fb1615c-34bf-47c4-a1d1-b7b2f836bbd3": {
  "asked_no_location": [
   "Legal Name",
   "When can you start a new role?",
   "Are you authorized to work in the country where the job is located?",
   "Will you now or in the future require sponsorship for employment visa ",
   "Are you able to work from our US office three days per week?",
   "I acknowledge that I have opened, read, and understood the Arbitration",
   "I confirm I have read the above."
  ],
  "filled_no_location": [
   [
    "Email",
    "email"
   ],
   [
    "Phone Number",
    "phone"
   ],
   [
    "Where are you currently located?",
    "location"
   ]
  ],
  "asked_page": [
   "Legal Name",
   "When can you start a new role?",
   "Are you able to work from our US office three days per week?",
   "I acknowledge that I have opened, read, and understood the Arbitration",
   "I confirm I have read the above."
  ]
 },
 "ashby-snowflake-479e06f1-273d-4a1b-af56-6543761ebd75": {
  "asked_no_location": [
   "In office attendance is an essential function for this role and necess",
   "Have you worked at Snowflake in the past in a Full-time, Part-time, co",
   "For Snowflake to anticipate possible immigration timelines and obligat",
   "A “U.S. person” is a citizen, legal permanent resident, or legal tempo",
   "Due to SEC auditor independence requirements, please let us know wheth",
   "Have you ever been directly employed by (1) any government or military",
   "I have read and agree to the Snowflake Candidate Privacy Notice."
  ],
  "filled_no_location": [
   [
    "Full Name",
    "full_name"
   ],
   [
    "Email",
    "email"
   ],
   [
    "Phone Number",
    "phone"
   ],
   [
    "Location",
    "location"
   ],
   [
    "LinkedIn Profile, if available",
    "linkedin"
   ],
   [
    "Will you require company sponsorship now or in the future to maintain ",
    "sponsorship"
   ],
   [
    "Where have you most recently worked?",
    "current_employer"
   ]
  ],
  "asked_page": [
   "In office attendance is an essential function for this role and necess",
   "Have you worked at Snowflake in the past in a Full-time, Part-time, co",
   "For Snowflake to anticipate possible immigration timelines and obligat",
   "A “U.S. person” is a citizen, legal permanent resident, or legal tempo",
   "Due to SEC auditor independence requirements, please let us know wheth",
   "Have you ever been directly employed by (1) any government or military",
   "I have read and agree to the Snowflake Candidate Privacy Notice."
  ]
 }
};

for (const id of Object.keys((S as any).forms)) {
  Deno.test(`ashby ${id.split("-")[1]}: no posting location (F-013) asks the job-country questions; the page location fills them only in the US`, () => {
    const none = plan(id, ""), page = plan(id, (S as any).forms[id].page_location);
    eq(none.asked, EXPECT[id].asked_no_location, "asked with no posting location");
    eq(none.filled, EXPECT[id].filled_no_location, "filled with no posting location");
    eq(page.asked, EXPECT[id].asked_page, "asked with the page's location");
    for (const r of [none, page]) for (const [label, key] of r.full) {
      if (key === "location" || key === "city" || key === "state") ok(RESIDENCE.test(label), `the person's location answered a question that is not where they live: ${label}`);
    }
    for (const [label, key] of none.full) {
      if (key === "work_authorization" || key === "sponsorship") ok(NAMES_US.test(label) || HOME_STATUS.test(label) || WO055_GENERIC_SPONSORSHIP.test(label), `US work rights filled for an unknown job country: ${label}`);
    }
  });
}
