// WO-048: Workday in the extension, the pure parts. The shared planner (planBatch) answers Workday's fields with the
// same answer keys and zero-wrong shape rules; repeating sections (work experience, education, languages) are filled only
// from confirmed facts with the dates as stated; the card says what Save and Continue sends and that nothing is submitted;
// a sign-in page is never the extension's. The extension in a real Chromium on the TEST Workday-shaped pages is
// tests/career-extension-workday.test.cjs; the measurement is evals/apply/workday-fill.cjs.
// Contract: docs/architect/work-orders/WO-048-workday.md.
import {
  cardLines, planForm, postingKey, reviewPayload, type SnapField, WORKDAY_NOTICE, WORKDAY_PAGE_SET, workdayDraftLine, workdayEmployer,
  workdaySignIn, workdaySubmitLine,
} from "../../extension/src/apply_core.ts";
import { type FormField, planBatch, rowsToAdd } from "../../supabase/functions/_shared/career_apply.ts";
import { mapQuestion } from "../../supabase/functions/_shared/question_map.ts";
import { chooseOption } from "../../supabase/functions/_shared/answer_options.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const fact = (value: string, id = "TEST-fact") => ({ value, factId: id });
const opts = (...ls: string[]) => ls.map((l) => ({ label: l, value: l }));
const YN = opts("Yes", "No");
const field = (name: string, label: string, o: Partial<FormField> = {}): FormField =>
  ({ name, label, type: o.type ?? "text", required: o.required ?? false, options: o.options ?? [], ...o } as FormField);
const row = (kind: string, n: number, part: string, label: string, o: Partial<FormField> & { anchor?: string; format?: string } = {}) =>
  field(`${kind}-${n}--${part}`, `${kind} ${n}: ${label}`, { ...o, section: { kind, row: n, part, anchor: o.anchor ?? "", format: o.format } } as any);

// The TEST persona of the Workday fixtures (tests/fixtures/workday/sources.md, Persona), as confirmed facts.
const WORK = JSON.stringify([
  { employer: "Example Analytics", title: "Data Analyst", start: "06/2022", end: "present" },
  { employer: "Sample Retail", title: "Sales Associate", start: "01/2020", end: "05/2022" },
]);
const PERSONA = {
  first_name: fact("Test"), last_name: fact("Person"), email: fact("test.person@example.test"), phone: fact("+1 555 010 0000"),
  phone_type: fact("Mobile"), street_address: fact("1 Example St"), full_address: fact("1 Example St, Chicago, IL 60601"),
  city: fact("Chicago"), state: fact("IL"), postal_code: fact("60601"), country: fact("United States"),
  work_history: fact(WORK, "TEST-work"), former_employers: fact("Example Analytics; Sample Retail"),
  school: fact("Example State University"), education_level: fact("bachelor"), major: fact("Statistics"), gpa: fact("3.6"),
  graduation_date: fact("05/2022", "TEST-grad"), languages: fact("English (native)"), salary_expectation: fact("95000"),
  work_authorization: fact("Yes"), sponsorship: fact("No"), over_18: fact("Yes"), relocation: fact("No"), notice_period: fact("2 weeks"),
  how_heard: fact("Company website"),
};
const plan = (fields: FormField[], answers: Record<string, { value: string; factId: string }> = PERSONA, company = "northwind") =>
  planBatch({ userId: "u", postings: [{ job_id: "workday:northwind:R1", company, title: "", fields: fields.map((f) => ({ ...f, required: false })) }], answers, saved: {}, log: [], now: 0 })
    .ready[0].fields;
const valueOf = (fields: { name: string; value: string }[], name: string) => fields.find((f) => f.name === name)?.value ?? null;

Deno.test("WO-048/1 work experience rows: from confirmed facts only, dates exactly as stated, the current job's end left", () => {
  const fields = [1, 2].flatMap((n) => [
    row("work", n, "title", "Job Title"), row("work", n, "employer", "Company"), row("work", n, "location", "Location"),
    row("work", n, "current", "I currently work here", { type: "checkbox" }), row("work", n, "start", "From", { type: "date", format: "MM/YYYY" }),
    row("work", n, "end", "To", { type: "date", format: "MM/YYYY" }), row("work", n, "description", "Role Description", { type: "textarea" }),
  ]);
  const got = plan(fields);
  eq(valueOf(got, "work-1--title"), "Data Analyst");
  eq(valueOf(got, "work-1--employer"), "Example Analytics");
  eq(valueOf(got, "work-1--start"), "06/2022");
  eq(valueOf(got, "work-1--current"), "Yes");
  eq(valueOf(got, "work-1--end"), null, "the current job has no end date: left");
  eq(valueOf(got, "work-2--current"), "No");
  eq(valueOf(got, "work-2--start"), "01/2020");
  eq(valueOf(got, "work-2--end"), "05/2022");
  for (const n of [1, 2]) {
    eq(valueOf(got, `work-${n}--location`), null, "a job's location was never stated: left, never the person's home city");
    eq(valueOf(got, `work-${n}--description`), null, "a role description was never stated: left");
  }
  assert(got.filter((f) => f.name.startsWith("work-")).every((f) => f.factId === "TEST-work"), "every row value cites the work history fact");
  // A date given only as a year never fills a month: nothing invented.
  const yearOnly = { ...PERSONA, work_history: fact(JSON.stringify([{ employer: "Example Analytics", title: "Data Analyst", start: "2022", end: "present" }])) };
  eq(valueOf(plan(fields.slice(0, 7), yearOnly), "work-1--start"), null, "MM/YYYY from a year alone: left and asked");
  eq(valueOf(plan([row("work", 1, "start", "From", { type: "date", format: "YYYY" })], yearOnly), "work-1--start"), "2022", "a year field takes the stated year");
  // No work history fact: no row is filled, whatever the labels say.
  const none = { ...PERSONA } as Record<string, { value: string; factId: string }>;
  delete none.work_history;
  eq(plan(fields, none).filter((f) => f.name.startsWith("work-")), [], "no confirmed history, no rows");
  // A fact that is not a list of jobs fills nothing.
  eq(plan(fields, { ...PERSONA, work_history: fact("I worked at a few places") }).filter((f) => f.name.startsWith("work-")), []);
});

Deno.test("WO-048/2 rows are matched by employer: a row Workday filled for another job is never written into", () => {
  // Row 1 was filled by Workday from the resume (Sample Retail); row 2 is empty. Sample Retail's facts go to row 1 only
  // where it is empty; the empty row takes the job no row names.
  const fields = [
    row("work", 1, "employer", "Company", { anchor: "Sample Retail" }), row("work", 1, "title", "Job Title", { anchor: "Sample Retail" }),
    row("work", 2, "employer", "Company"), row("work", 2, "title", "Job Title"),
    row("work", 3, "employer", "Company", { anchor: "Unlisted Co" }), row("work", 3, "title", "Job Title", { anchor: "Unlisted Co" }),
  ];
  const got = plan(fields);
  eq(valueOf(got, "work-1--title"), "Sales Associate", "the row naming Sample Retail is Sample Retail's");
  eq(valueOf(got, "work-2--employer"), "Example Analytics");
  eq(valueOf(got, "work-2--title"), "Data Analyst");
  eq(valueOf(got, "work-3--title"), null, "a row for a job the person never stated is not Trainee's");
  // How many rows to add: one per stated job no row holds yet, less the empty rows already there.
  eq(rowsToAdd("work", [], PERSONA), 2);
  eq(rowsToAdd("work", [""], PERSONA), 1);
  eq(rowsToAdd("work", ["Sample Retail", ""], PERSONA), 0);
  eq(rowsToAdd("work", ["Unlisted Co"], PERSONA), 2);
  eq(rowsToAdd("education", [], PERSONA), 1);
  eq(rowsToAdd("language", [], PERSONA), 1);
  eq(rowsToAdd("website", [], PERSONA), 0, "only work, education and languages are added");
  eq(rowsToAdd("work", [], { first_name: fact("Test") }), 0, "no facts, no rows");
});

Deno.test("WO-048/3 education and languages: the person's stated school, degree, field, GPA, graduation year; native means fluent", () => {
  const fields = [
    row("education", 1, "school", "School or University"), row("education", 1, "degree", "Degree", { type: "select", options: opts("High School", "Associates", "Bachelors", "Masters", "Other") }),
    row("education", 1, "major", "Field of Study", { type: "select", options: opts("Statistics", "Statistics and Data Science", "Physics") }),
    row("education", 1, "gpa", "Overall Result (GPA)"), row("education", 1, "start", "From", { type: "date", format: "YYYY" }),
    row("education", 1, "end", "To (Actual or Expected)", { type: "date", format: "YYYY" }),
    row("language", 1, "language", "Language", { type: "select", options: opts("Dutch", "English", "French") }),
    row("language", 1, "fluent", "I am fluent in this language.", { type: "checkbox" }),
    row("language", 1, "proficiency", "Reading", { type: "select", options: opts("1 - Beginner", "3 - Intermediate", "5 - Fluent") }),
  ];
  const got = plan(fields);
  eq(valueOf(got, "education-1--school"), "Example State University");
  eq(valueOf(got, "education-1--degree"), "Bachelors");
  eq(valueOf(got, "education-1--major"), "Statistics", "the exact field, not the longer one that contains it");
  eq(valueOf(got, "education-1--gpa"), "3.6");
  eq(valueOf(got, "education-1--end"), "2022");
  eq(valueOf(got, "education-1--start"), null, "a start year never stated: left and asked");
  eq(valueOf(got, "language-1--language"), "English");
  eq(valueOf(got, "language-1--fluent"), "Yes");
  eq(valueOf(got, "language-1--proficiency"), "5 - Fluent");
  // A degree list that splits arts from science is the person's call; a level never stated fills no proficiency.
  const split = [row("education", 1, "degree", "Degree", { type: "select", options: opts("Bachelor of Arts", "Bachelor of Science", "Master of Science") })];
  eq(valueOf(plan(split), "education-1--degree"), null);
  const plain = plan(fields, { ...PERSONA, languages: fact("English") });
  eq(valueOf(plain, "language-1--language"), "English");
  eq(valueOf(plain, "language-1--fluent"), null);
  eq(valueOf(plain, "language-1--proficiency"), null);
  // A row the reader could not place (a website row, an unknown part) is never filled.
  eq(plan([row("website", 1, "url", "URL"), row("work", 1, "salary", "Salary")]), []);
});

Deno.test("WO-048/4 field shapes Workday asks: national number beside its country code, no extension, no second address line", () => {
  const phone = (dial?: string) => plan([field("ph", "Phone Number", dial === undefined ? {} : { dial } as any)]);
  eq(valueOf(phone("+1"), "ph"), "555 010 0000", "the country code is its own field: the national number only");
  eq(valueOf(phone("+44"), "ph"), null, "another country's code: the person's call");
  eq(valueOf(phone(""), "ph"), null, "no country code chosen yet: left");
  eq(valueOf(phone(), "ph"), "+1 555 010 0000", "a plain phone box (no code field) is unchanged");
  eq(valueOf(plan([field("ext", "Phone Extension")]), "ext"), null, "never the phone number in the extension");
  eq(valueOf(plan([field("a2", "Address Line 2")]), "a2"), null, "never the full address in the second line");
  eq(valueOf(plan([field("a1", "Address Line 1")]), "a1"), "1 Example St");
  eq(valueOf(plan([field("pt", "Phone Device Type", { type: "select", options: opts("Landline", "Mobile") })]), "pt"), "Mobile");
  eq(mapQuestion({ label: "Phone Device Type" }).fact, "phone_type");
  eq(valueOf(plan([field("pt", "Phone Device Type", { type: "select", options: opts("Home", "Work") })]), "pt"), null);
  // A salary range list takes the one range the stated amount is in; two ranges sharing the amount is asked.
  const sal = opts("$40,000 - $59,999", "$60,000 - $79,999", "$80,000 - $99,999", "$100,000 - $119,999", "$120,000+");
  eq(valueOf(plan([field("s", "What are your base salary expectations (USD)?", { type: "select", options: sal })]), "s"), "$80,000 - $99,999");
  eq(chooseOption("salary_expectation", "95000", opts("$80,000 - $95,000", "$95,000 - $110,000")), null, "an edge shared by two ranges: asked");
  eq(chooseOption("salary_expectation", "95000", opts("80k - 100k", "100k+")), "80k - 100k");
  eq(chooseOption("salary_expectation", "competitive", sal), null);
});

Deno.test("WO-048/5 voluntary disclosures: only the person's own answer, a decline only where the form offers one", () => {
  const vets = opts("I IDENTIFY AS ONE OR MORE OF THE CLASSIFICATIONS OF PROTECTED VETERANS LISTED ABOVE", "I AM NOT A VETERAN", "I DO NOT WISH TO SELF-IDENTIFY");
  const fields = [
    field("g", "Gender", { type: "select", options: opts("Male", "Female", "I do not wish to self-identify") }),
    field("h", "Are you Hispanic or Latino?", { type: "select", options: YN }),
    field("v", "Please select one of the options below:", { type: "select", options: vets }),
    field("r", "Race Category: (Please select all that apply.)", { type: "checkbox", options: opts("Asian", "White") }),
  ];
  eq(mapQuestion({ label: "Please select one of the options below:", options: vets }).fact, "eeo", "a veteran list under a generic label is a disclosure");
  eq(mapQuestion({ label: "Please select one of the options below:", options: YN }).fact === "eeo", false);
  eq(plan(fields), [], "the person gave no disclosure: nothing, never a default");
  const declined = plan(fields, { ...PERSONA, eeo: fact("decline") });
  eq(declined.map((f) => [f.name, f.value]), [["g", "I do not wish to self-identify"], ["v", "I DO NOT WISH TO SELF-IDENTIFY"]],
    "a decline only where a decline option exists");
});

Deno.test("WO-048/6 the Workday flow uses the whole planner; an unrecognised Workday page keeps the basic contact fields only", () => {
  const schema = [field("first", "First Name*", { required: true }), field("auth", "Are you legally authorized to work in the United States?*", { type: "select", required: true, options: YN })];
  const base = { userId: "u", jobId: "workday:northwind:R1", company: "northwind", family: "workday" as const, schema, answers: PERSONA, saved: {}, now: 0 };
  eq(planForm({ ...base, workdayFlow: true }).fill.map((f) => f.name), ["first", "auth"]);
  eq(planForm(base).fill.map((f) => f.name), ["first"], "WO-031: a Workday page that is not the application flow");
  // The disability form (CC-305) is always the person's: never planned, whatever facts exist.
  const personal = [field("dn", "Name", { personal: true } as any), field("dd", "Language", { type: "select", options: opts("English"), personal: true } as any)];
  const p = planForm({ ...base, workdayFlow: true, schema: personal, answers: { ...PERSONA, full_name: fact("Test Person"), eeo: fact("decline") } });
  eq(p.fill, [], "the disability form is never filled");
  eq(p.needs, [], "and never asked by text: it is filled by the person on the page");
});

Deno.test("WO-048/7 one posting across every step; the employer named from the tenant", () => {
  const steps = ["1-my-information.html", "2-my-experience.html", "6-review.html"].map((s) => postingKey(`https://northwind.wd5.myworkdayjobs.com/en-US/External/job/Chicago/Data-Analyst_R-10421/apply/${s}`));
  eq(new Set(steps).size, 1);
  eq(steps[0], "workday:northwind.wd5.myworkdayjobs.com:Data-Analyst_R-10421");
  eq(postingKey("https://northwind.wd5.myworkdayjobs.com/en-US/External/job/Chicago/Data-Analyst_R-10421/apply/applyManually"), steps[0]);
  eq(postingKey("https://acme.wd1.myworkdayjobs.com/en-US/External/job/Chicago/Analyst_R123/apply"), "workday:acme.wd1.myworkdayjobs.com:Analyst_R123", "WO-031's key unchanged");
  eq(workdayEmployer("https://northwind.wd5.myworkdayjobs.com/x"), "northwind");
  eq(workdaySignIn("northwind"), "Sign in to northwind's Workday yourself; I'll fill the application after.");
});

Deno.test("WO-048/9 zero wrong where Workday's wording or Workday's own rows could mislead", () => {
  // A row Workday filled with nearly a stated employer: never filled by Trainee, and no second row for that job.
  const near = [row("work", 1, "employer", "Company", { anchor: "Example Analytic" }), row("work", 1, "title", "Job Title", { anchor: "Example Analytic" }),
    row("work", 2, "employer", "Company"), row("work", 2, "title", "Job Title")];
  const got = plan(near);
  eq(valueOf(got, "work-1--title"), null);
  eq(valueOf(got, "work-2--employer"), "Sample Retail", "the empty row takes the job no row names, not Example Analytics again");
  eq(rowsToAdd("work", ["Example Analytic"], PERSONA), 1, "only Sample Retail is added");
  // Two questions in one: neither fact answers it.
  eq(valueOf(plan([field("lr", "Are you local to Chicago, IL or willing to relocate?", { type: "select", options: YN })]), "lr"), null);
  eq(valueOf(plan([field("r", "Are you willing to relocate?", { type: "select", options: YN })]), "r"), "No");
  // A decline worded "Not declared"; other disclosures (orientation) follow the same decline, never a default.
  const dec = { ...PERSONA, eeo: fact("decline") };
  eq(valueOf(plan([field("g", "Gender", { type: "select", options: opts("Male", "Female", "Not declared") })], dec), "g"), "Not declared");
  eq(valueOf(plan([field("so", "Sexual Orientation", { type: "select", options: opts("Heterosexual", "Gay", "I do not wish to answer") })], dec), "so"), "I do not wish to answer");
  eq(valueOf(plan([field("so", "Sexual Orientation", { type: "select", options: opts("Heterosexual", "Gay", "I do not wish to answer") })]), "so"), null);
  // A school or field list takes only the stated name itself.
  eq(valueOf(plan([row("education", 1, "school", "School", { type: "select", options: opts("Example State University Online", "Other") })]), "education-1--school"), null);
  eq(valueOf(plan([row("education", 1, "major", "Field of Study", { type: "select", options: opts("Applied Statistics", "Physics") })]), "education-1--major"), null);
  // A phone code list answered from the country only when the person's phone carries that code.
  const codes = opts("Canada (+1)", "United States Minor Outlying Islands (+1)", "United States of America (+1)", "United Kingdom (+44)");
  eq(valueOf(plan([field("cc", "Country Phone Code", { type: "select", options: codes })]), "cc"), "United States of America (+1)");
  eq(valueOf(plan([field("cc", "Country Phone Code", { type: "select", options: codes })], { ...PERSONA, phone: fact("+44 20 7946 0000") }), "cc"), null);
  // The former-employer question in Workday's longer wording is derived from the person's own list.
  eq(valueOf(plan([field("pw", "Have you previously been employed by Contoso Test Health as a Full-time, Part-time, Contractor or Temporary worker in any of our locations?",
    { type: "radio", options: [{ label: "Yes", value: "true" }, { label: "No", value: "false" }] })], PERSONA, "contoso-test-health"), "pw"), "false");
});

const snap = (o: Partial<SnapField>): SnapField => ({ name: "n", label: "L", value: "v", source: "trainee", factId: "f", masked: false, detail: "", ...o });
const payloadOf = (fields: SnapField[]) =>
  reviewPayload({ userId: "u", jobId: "workday:northwind:R1", company: "northwind", url: "https://northwind.wd5.myworkdayjobs.com/x/apply/1.html", family: "workday",
    fields, resume: null, account: { epoch: 0, version: 1 }, expiresAt: "2026-10-20T00:00:00.000Z" });

Deno.test("WO-048/8 a page's card: its answers exactly as sent, Workday's own values apart and never Trainee's, what Save and Continue does", () => {
  const p = payloadOf([snap({ name: "first", label: "First Name*", value: "Test" }), snap({ name: "country", label: "Country*", value: "United States of America", source: "workday", factId: null }),
    snap({ name: "w1", label: "Work Experience 1: Job Title", value: "Data Analyst II", source: "workday", factId: null }),
    snap({ name: "why", label: "Why us?", value: "TEST typed", source: "you", factId: null })]);
  const lines = cardLines({ company: "northwind", family: "workday", payload: p, openRequired: [], identity: [], blockers: [], verification: [],
    workday: { action: "draft", step: "My Information", employer: "northwind", conflicts: [{ label: "Work Experience 1: Job Title", workday: "Data Analyst II", yours: "Data Analyst" }] } });
  eq(lines[1], WORKDAY_NOTICE);
  assert(lines.includes("First Name: Test"));
  assert(lines.includes("Why us?: TEST typed (typed by you)"));
  const at = lines.indexOf(WORKDAY_PAGE_SET);
  assert(at > 0 && lines.indexOf("Country: United States of America") > at, "Workday's values under their own heading");
  eq(WORKDAY_PAGE_SET, "Filled by Workday from your resume: check them");
  assert(lines.some((l) => l.includes("Data Analyst II") && l.includes("Data Analyst") && /Workday/.test(l) && /your confirmed/i.test(l)), "a contradiction is side by side");
  assert(lines.includes(workdayDraftLine("northwind")));
  eq(workdayDraftLine("northwind"), "Save and Continue sends this page to northwind as a draft; nothing is submitted.");
  assert(!lines.some((l) => /submits? (this|your) application/i.test(l)), "a draft page never speaks of submitting");
  // The review page: the reading of every answer, and the one Submit.
  const r = payloadOf([snap({ name: "review:1", label: "My Information: First Name", value: "Test", source: "fixed", factId: null })]);
  const rl = cardLines({ company: "northwind", family: "workday", payload: r, openRequired: [], identity: [], blockers: [], verification: [], workday: { action: "submit", step: "Review", employer: "northwind" } });
  assert(rl.includes("My Information: First Name: Test"));
  assert(rl.includes(workdaySubmitLine("northwind")));
  assert(!rl.includes(workdayDraftLine("northwind")));
  // Without the Workday flow (WO-031's flat page), the card is the one it was.
  const old = cardLines({ company: "northwind", family: "workday", payload: p, openRequired: [], identity: [], blockers: [], verification: [] });
  assert(old.some((l) => l.startsWith("Approve sends it with the site's own Submit")));
});
