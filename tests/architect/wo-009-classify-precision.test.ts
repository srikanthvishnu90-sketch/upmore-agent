// WO-009a precision (architect-authored, 2026-10-19). A wrong mapping sends a wrong answer to an employer; an unknown
// only asks the person. So a contact fact (name, email, phone, links, location, start date, salary) goes only into a
// free-text box, never into a checkbox, radio or select, and never into a question about someone else (a reference, a
// manager, an emergency contact). Every label below is verbatim from evals/apply/questions-ci*.json or Codex's
// WO-009b-3 cases; each was mapped to the person's own contact fact before this change.
// Run: deno test -A --no-check tests/architect/wo-009-classify-precision.test.ts
import { classifyField } from "../../supabase/functions/_shared/career_apply.ts";

function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

Deno.test("a contact fact never answers a checkbox, a radio or a select", () => {
  const cases: [string, string][] = [
    ["Do you own a Smartphone that you can use during the rating project?", "radio"],
    ["Would you be willing to make phone calls on behalf of the client, as needed, if required?", "radio"],
    ["I consent to receive text messages about the hiring process from Thomas & Hutton at the phone number I provide", "radio"],
    ["I understand that next steps will be sent via email and I have marked the sender address above as safe.", "checkbox"],
    ["Email me about other job openings within the Booking Holding’s entities and recruitment-related newsletters", "multi_value_single_select"],
    ["Would you like to receive communications via SMS and/or WhatsApp to the number provided on your application?", "multi_value_single_select"],
    ["Do your compensation expectations align with the posted range? (Base compensation)", "multi_value_single_select"],
    ["What currency should we use for your desired salary? Please select the currency of the country where this position is located.", "multi_value_single_select"],
    ["Which location are you applying for?", "select"],
  ];
  for (const [label, type] of cases) eq(classifyField(label, type), "unknown", label);
});

Deno.test("a question about someone else is never answered with the person's own contact fact", () => {
  const cases: [string, string][] = [
    ["Enter three professional references with name, company, position, phone number, and email address.", "textarea"],
    ["Please list the names and emails of two references. We will inform you before contacting references.", "textarea"],
    ["Phone number of a professional reference", "input_text"],
    ["Emergency contact phone", "input_text"],
    ["Manager's email address", "input_text"],
    ["Please enter the referring team member's Full Legal First and Last Name.", "textarea"],
    ["Name of the employee who referred you", "input_text"],
  ];
  for (const [label, type] of cases) eq(classifyField(label, type), "unknown", label);
});

Deno.test("phone means a phone number, not a word that contains it", () => {
  eq(classifyField("What smartphone do you use for work?", "input_text"), "unknown");
  eq(classifyField("Do you have mobile app development experience?", "textarea"), "unknown");
});

Deno.test("the person's own facts still map where the box asks for them", () => {
  const cases: [string, string, string][] = [
    ["First Name", "input_text", "first_name"], ["Preferred First Name", "input_text", "first_name"],
    ["Preferred First & Last Name", "text", "full_name"], ["Last Name", "input_text", "last_name"],
    ["Email", "input_text", "email"], ["Email", "email", "email"], ["Please confirm your email address", "input_text", "email"],
    ["Phone", "input_text", "phone"], ["Phone Number", "tel", "phone"], ["Mobile", "text", "phone"], ["Mobile Phone Number", "text", "phone"],
    ["LinkedIn Profile", "input_text", "linkedin"], ["Website", "url", "website"], ["Resume/CV", "input_file", "resume"],
    ["Are you legally authorized to work in the United States?", "multi_value_single_select", "work_authorization"],
    ["Will you now or in the future require visa sponsorship?", "multi_value_single_select", "sponsorship"],
    ["How did you hear about this job?", "multi_value_single_select", "how_heard"],
    ["Gender", "multi_value_single_select", "eeo"],
  ];
  for (const [label, type, key] of cases) eq(classifyField(label, type), key, label);
});

Deno.test("the resume answer goes only into a file upload, never typed into a text box", () => {
  // WO-052: a portfolio is the person's work samples, not their website: asked (never the file's hash either).
  eq(classifyField("Link to your resume or portfolio", "input_text"), "unknown");
  eq(classifyField("Resume", "text"), "unknown");
  eq(classifyField("Paste your CV here", "textarea"), "unknown");
  eq(classifyField("Resume/CV", "input_file"), "resume");
  eq(classifyField("Resume", "file"), "resume");
});

Deno.test("how-did-you-hear is not a request for a profile link", () => {
  eq(classifyField("How did you hear about us (e.g. LinkedIn, a friend)?", "input_text"), "how_heard");
  eq(classifyField("How did you hear about this job? LinkedIn / Indeed / Other", "multi_value_single_select"), "how_heard");
});

Deno.test("a negated sponsorship question is asked, never answered from the sponsorship fact", () => {
  eq(classifyField("Do you hold a visa that does NOT require sponsorship?", "multi_value_single_select"), "unknown");
  eq(classifyField("Are you able to work without requiring sponsorship now and in the future?", "multi_value_single_select"), "unknown");
  eq(classifyField("Will you now or in the future require visa sponsorship?", "multi_value_single_select"), "sponsorship");
  // verbatim: the note after the question mentions "without"; the question itself is the sponsorship question
  eq(classifyField("Will you now or in the future require sponsorship for employment visa status (e.g. H-1B, TN, F1, OPT, etc)? You must be work authorized in the United States without the need for employer sponsorship.", "multi_value_single_select"), "sponsorship");
  eq(classifyField("Are you legally authorized to work in the US without sponsorship?", "multi_value_single_select"), "unknown");
  eq(classifyField("Are you legally authorized to work in the United States?", "multi_value_single_select"), "work_authorization");
});

Deno.test("a long statement on one checkbox is an acknowledgement, never a fact", () => {
  eq(classifyField("AHEAD will consider the contents of an uploaded resume or LinkedIn profile only insofar as it pertains to the job and will not consider disability or veteran status.", "checkbox"), "unknown");
  // verbatim: a long question rendered as checkboxes is still the sponsorship question
  eq(classifyField("Do you currently need, or will you need in the future, employer sponsorship to work legally in your country of residence for this role?", "checkbox"), "sponsorship");
});

Deno.test("a paste box next to its file upload is the upload's alternative, not a second required question", async () => {
  const { planBatch, fileAlternative } = await import("../../supabase/functions/_shared/career_apply.ts");
  const fields = [
    { name: "resume", label: "Resume/CV", required: true, type: "input_file", options: [] },
    { name: "resume_text", label: "Resume/CV", required: true, type: "textarea", options: [] },
    { name: "first_name", label: "First Name", required: true, type: "input_text", options: [] },
  ];
  eq(fields.map((f) => fileAlternative(f, fields)), [false, true, false]);
  const p = planBatch({ userId: "u", postings: [{ job_id: "gh:a:1", company: "A", title: "T", fields }], log: [], now: 0,
    answers: { resume: { value: "sha", factId: "r" }, first_name: { value: "Ada", factId: "f" } }, saved: {} });
  eq(p.ready.length, 1, "the file answers the question");
  eq(p.ready[0].fields.map((f: any) => f.name), ["resume", "first_name"], "nothing is typed into the paste box");
  // a paste box with no file upload beside it is still a question
  const alone = [{ name: "resume_text", label: "Resume/CV", required: true, type: "textarea", options: [] }];
  eq(fileAlternative(alone[0], alone), false);
});
