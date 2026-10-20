// WO-064: the panel's questions drafted from the person's confirmed facts; the person reviews and saves, never the model.
// The pure core (supabase/functions/_shared/answer_draft.ts) and the edge's core (career_answer_card.ts) with a stub
// model. Real wording from the captured CI question sets. No model, no network, no database.
import {
  BATCH, draftShortAnswers, neverDraft, type ShortQuestion, vetoDraft,
} from "../../supabase/functions/_shared/answer_draft.ts";
import {
  ANSWER_CAP, type AnswerCounter, handleAnswerDraft, readShortRequest,
} from "../../supabase/functions/_shared/career_answer_card.ts";

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}

const FACTS = [
  { id: "F-1", kind: "experience", text: "Data Analyst at Example Analytics since 2023; built SQL dashboards in Looker for the sales team", status: "confirmed" },
  { id: "F-2", kind: "education", text: "B.S. Statistics, Example State University, graduated May 2022", status: "confirmed" },
  { id: "F-3", kind: "preference", text: "Salary expectation: $95,000 a year", status: "confirmed" },
  { id: "F-4", kind: "other", text: "Has never been referred by an employee of any company applied to", status: "confirmed" },
  { id: "F-5", kind: "experience", text: "Led a team of 12 engineers at Stripe", needs_confirmation: true, status: "draft" },
  { id: "F-6", kind: "other", text: "Work authorization: US citizen; will not need visa sponsorship now or in the future", status: "confirmed" },
  { id: "F-7", kind: "other", text: "non compete: No", status: "confirmed" },
];
const q = (key: string, label: string, options: string[] = [], type = options.length ? "select" : "text"): ShortQuestion =>
  ({ key, label, type, options, company: "Acme", location: "Chicago, IL" });
const reply = (drafts: unknown) => ({ type: "message", role: "assistant", content: [{ type: "text", text: JSON.stringify({ drafts }) }], stop_reason: "end_turn" });
function stub(fn: (payload: any, n: number) => any) {
  const calls: any[] = [];
  return { calls, model: async (p: any) => { calls.push(p); const r = fn(p, calls.length); if (r instanceof Error) throw r; return r; } };
}
const payloadText = (p: any) => JSON.stringify(p);

Deno.test("WO-064/1 never drafted: crime, a government's question about the person, EEO, identity, consent; ordinary questions pass", () => {
  for (const l of [
    "Have you ever been convicted of a felony?",
    "Are you willing to undergo a background check and drug test?",
    "Do you currently hold an active security clearance?",
    "Have you ever renounced your United States citizenship?",
    "Have you previously been determined to be unsuitable for a federal public trust position?",
    "Are you subject to U.S. export control restrictions or sanctions?",
    "Do you identify as a veteran?",
    "What is your gender?",
    "Please indicate your race/ethnicity",
    "Do you have a disability?",
    "What is your date of birth?",
    "Social Security Number",
    "I certify that the information provided is true and complete",
    "I agree to the processing of my personal data",
    "Signature",
  ]) assert(neverDraft(l), `should never draft: ${l}`);
  for (const l of [
    "What is your most recent company?",
    "Do you have experience with SQL?",
    "What are your salary expectations?",
    "Were you referred by a current employee? If yes, who?",
  ]) eq(neverDraft(l), null, l);
  // Run 2's reviewers: work rights depend on the job's country, which the planner's rules read from the posting.
  assert(neverDraft("Will you now or in the future require sponsorship? If so, please explain"));
});

Deno.test("WO-064/2 the model sees confirmed facts only, and never a never-drafted question", async () => {
  const s = stub(() => reply([]));
  const out = await draftShortAnswers([q("a", "What is your most recent company?"), q("b", "Have you ever been convicted of a felony?", ["Yes", "No"])],
    { model: s.model, facts: () => FACTS });
  eq(s.calls.length, 1);
  const t = payloadText(s.calls[0]);
  assert(!/Stripe/.test(t), "an unconfirmed fact reached the model");
  assert(!/convicted/.test(t), "a never-drafted question reached the model");
  assert(/Example Analytics/.test(t), "a confirmed fact is missing from the model's payload");
  eq(out.find((d) => d.key === "b"), { key: "b", ok: false, why: "never" });
  eq(out.find((d) => d.key === "a"), { key: "a", ok: false, why: "no_fact" }, "a key the model left out is no_fact");
});

Deno.test("WO-064/3 an option answer comes back in the option's own spelling; anything else is not_an_option", () => {
  const sq = q("s", "Are you bound by a non-compete agreement?", ["Yes", "No"]);
  const no = vetoDraft(sq, { answer: " no ", fact_ids: ["F-7"] }, FACTS);
  assert(no.ok, JSON.stringify(no));
  eq([no.answer, no.fact_ids, no.from.length], ["No", ["F-7"], 1]);
  assert(/non compete/.test(no.from[0]), "the panel names the fact it came from by label");
  eq(vetoDraft(sq, { answer: "Not now", fact_ids: ["F-7"] }, FACTS).ok, false);
  eq((vetoDraft(sq, { answer: "Not now", fact_ids: ["F-7"] }, FACTS) as any).why, "not_an_option");
  eq((vetoDraft(sq, { answer: "Yes", fact_ids: ["F-7"] }, FACTS) as any).why, "unverified", "a yes the yes/no fact says no to");
  const multi = q("m", "Which tools have you used?", ["SQL", "Looker", "Tableau"], "multi_value_multi_select");
  const d = vetoDraft(multi, { answer: "sql; looker", fact_ids: ["F-1"] }, FACTS);
  assert(d.ok, JSON.stringify(d));
  eq(d.answer, "SQL; Looker");
});

Deno.test("WO-064/4 free text must trace to the cited facts: an employer, number or tool not in them is unverified", () => {
  const recent = q("r", "What is your most recent company?");
  const good = vetoDraft(recent, { answer: "Example Analytics", fact_ids: ["F-1"] }, FACTS);
  assert(good.ok, JSON.stringify(good));
  eq((vetoDraft(recent, { answer: "Stripe", fact_ids: ["F-1"] }, FACTS) as any).why, "unverified");
  const pay = q("p", "What are your salary expectations?");
  assert(vetoDraft(pay, { answer: "$95,000 a year", fact_ids: ["F-3"] }, FACTS).ok);
  eq((vetoDraft(pay, { answer: "$120,000 a year", fact_ids: ["F-3"] }, FACTS) as any).why, "unverified");
  eq((vetoDraft(recent, { answer: "Example Analytics, using Kubernetes", fact_ids: ["F-1"] }, FACTS) as any).why, "unverified");
});

Deno.test("WO-064/5 a no is never drafted from the absence of a fact; a yes to experience names the thing in a cited fact", () => {
  const sql = q("x", "Do you have experience with SQL?", ["Yes", "No"]);
  const tf = q("t", "Do you have experience with Terraform?", ["Yes", "No"]);
  eq((vetoDraft(tf, { answer: "No", fact_ids: ["F-1"] }, FACTS) as any).why, "negative_from_absence");
  eq((vetoDraft(tf, { answer: "No", fact_ids: [] }, FACTS) as any).why, "no_fact");
  assert(vetoDraft(sql, { answer: "Yes", fact_ids: ["F-1"] }, FACTS).ok);
  eq((vetoDraft(tf, { answer: "Yes", fact_ids: ["F-1"] }, FACTS) as any).why, "unverified", "a yes citing a fact that never names Terraform");
  const ref = q("f", "Were you referred by a current employee?", ["Yes", "No"]);
  assert(vetoDraft(ref, { answer: "No", fact_ids: ["F-4"] }, FACTS).ok, "a no stated by a fact passes");
  eq((vetoDraft(ref, { answer: "No", fact_ids: ["F-1"] }, FACTS) as any).why, "negative_from_absence");
  const yrs = q("y", "How many years of experience do you have with Terraform?", ["No Experience", "1+ years", "2+ years"]);
  eq((vetoDraft(yrs, { answer: "No Experience", fact_ids: ["F-1"] }, FACTS) as any).why, "negative_from_absence");
});

Deno.test("WO-064/5b years claimed in an option must be carried by a cited fact's dates or years", () => {
  const NOW = Date.UTC(2026, 9, 20);
  const yrs = q("y", "How many years of experience do you have with SQL?", ["Less than 1 year", "1-3 years", "3-5 years", "5+ years"]);
  assert(vetoDraft(yrs, { answer: "1-3 years", fact_ids: ["F-1"] }, FACTS, NOW).ok, "since 2023 carries 1-3 years in 2026");
  eq((vetoDraft(yrs, { answer: "5+ years", fact_ids: ["F-1"] }, FACTS, NOW) as any).why, "unverified", "since 2023 does not carry 5+ years");
  const sales = q("z", "Do you have 7+ years of direct software sales experience?", ["Yes", "No"]);
  eq((vetoDraft(sales, { answer: "Yes", fact_ids: ["F-1"] }, FACTS, NOW) as any).why, "unverified");
});

Deno.test("WO-064/6 a cited id that is not a confirmed fact is no_fact", () => {
  const recent = q("r", "What is your most recent company?");
  eq((vetoDraft(recent, { answer: "Stripe", fact_ids: ["F-5"] }, FACTS) as any).why, "no_fact");
  eq((vetoDraft(recent, { answer: "Example Analytics", fact_ids: ["F-99"] }, FACTS) as any).why, "no_fact");
  eq((vetoDraft(recent, { answer: "Example Analytics", fact_ids: "F-1" }, FACTS) as any).why, "no_fact");
});

Deno.test("WO-064/7 one model call per 25 questions; a call failing twice fails its own batch only; nothing throws", async () => {
  eq(BATCH, 25);
  const qs = Array.from({ length: 60 }, (_, i) => q(`k${i}`, `What is your most recent company? (${i})`));
  const s = stub((p, n) => {
    if (/\bk30\b/.test(payloadText(p))) return new Error("timeout");
    const keys = [...payloadText(p).matchAll(/k(\d+)/g)].map((m) => `k${m[1]}`);
    return reply([...new Set(keys)].map((key) => ({ key, answer: "Example Analytics", fact_ids: ["F-1"] })));
  });
  const out = await draftShortAnswers(qs, { model: s.model, facts: () => FACTS });
  eq(s.calls.length, 4, "the second batch is tried twice");
  eq(out.length, 60);
  eq(out.filter((d) => d.ok).length, 35);
  eq(out.filter((d) => !d.ok && d.why === "model").length, 25);
  eq(out.map((d) => d.key), qs.map((x) => x.key), "drafts come back in the questions' order");
});

Deno.test("WO-064/8 the edge: own session only; facts in the body ignored; past the cap every question is cap and the model is not called", async () => {
  const jwt = (role: string) => `x.${btoa(JSON.stringify({ role })).replace(/=+$/, "")}.y`;
  const counter = (used: number): AnswerCounter & { rows: number } => {
    const c = { rows: 0, used: async () => used + c.rows, reserve: async (_u: string, _a: string, n: number) => { c.rows += n; return "1"; }, release: async () => {} };
    return c;
  };
  const s = stub((p) => reply([...new Set([...payloadText(p).matchAll(/\bk(\d+)\b/g)].map((m) => `k${m[1]}`))].map((key) => ({ key, answer: "Example Analytics", fact_ids: ["F-1"] }))));
  const deps = (used: number) => ({
    cors: {}, user: async () => ({ id: "U1" }),
    card: () => ({ facts: async () => FACTS, model: s.model, counter: counter(used), now: () => Date.UTC(2026, 9, 20) }),
  });
  const body = JSON.stringify({ questions: [q("k1", "What is your most recent company?")], facts: [{ id: "X", text: "CEO of Google", status: "confirmed" }] });
  const post = (auth: string | null, used = 0) =>
    handleAnswerDraft(new Request("https://x/f", { method: "POST", headers: auth ? { authorization: auth } : {}, body }), deps(used));
  eq((await post(null)).status, 401);
  eq((await post(`Bearer ${jwt("service_role")}`)).status, 403);
  const ok = await (await post(`Bearer ${jwt("authenticated")}`)).json();
  eq(ok.drafts[0].ok, true);
  assert(!/Google/.test(payloadText(s.calls)), "a fact sent in the request reached the model");
  const before = s.calls.length;
  const capped = await (await post(`Bearer ${jwt("authenticated")}`, ANSWER_CAP)).json();
  eq(capped.drafts[0], { key: "k1", ok: false, why: "cap" });
  eq(s.calls.length, before, "the model was called past the cap");
  const r = readShortRequest({ questions: Array.from({ length: 201 }, (_, i) => q(`k${i}`, "x")) });
  eq(r.ok, false, "more than 200 questions is refused");
});

// Found reading the first real-model run's drafts (CI run 39470452339, samples A-H): each of these was drafted and passed
// the veto, and each is wrong or rests on a fact that does not say it. Every one must now be refused.
const P = [
  { id: "P-onsite", kind: "other", text: "onsite ok: Yes", status: "confirmed" },
  { id: "P-loc", kind: "other", text: "location: Chicago, IL", status: "confirmed" },
  { id: "P-reloc", kind: "other", text: "relocation: No", status: "confirmed" },
  { id: "P-li", kind: "other", text: "linkedin: https://www.linkedin.com/in/test-person", status: "confirmed" },
  { id: "P-heard", kind: "other", text: "how heard: Company website", status: "confirmed" },
  { id: "P-bg", kind: "other", text: "background check ok: Yes", status: "confirmed" },
  { id: "P-name", kind: "other", text: "full name: Test Person", status: "confirmed" },
  { id: "P-pay", kind: "other", text: "salary expectation: 95000", status: "confirmed" },
  { id: "P-major", kind: "other", text: "major: Statistics", status: "confirmed" },
  { id: "P-auth", kind: "other", text: "work authorization: Yes", status: "confirmed" },
  { id: "P-cit", kind: "other", text: "citizenship: United States", status: "confirmed" },
  { id: "P-sal", kind: "other", text: "salary expectation: 95000; salary currency: USD ($)", status: "confirmed" },
  ...FACTS,
];
Deno.test("WO-064/9 a posting's office, place or relocation is never drafted (WO-074 is the person's standing answer)", () => {
  for (const l of [
    "Are you able to meet the 3 days in office per week (Monday and Wednesday) requirements for this role?",
    "Are you willing to work in the office 5-days a week?",
    "Do you have relocation limitations?",
    "If not located in the greater Seattle area, are you willing to relocate?",
    "This position is on-site at Kitware’s Clifton Park, NY, headquarters.",
    "Which location are you applying for?",
    "Are you currently located within 25 miles from of our offices in Boston, MA?",
    "We operate hybrid, with 3 days per week in our office. Can you commute?",
  ]) assert(neverDraft(l), `should never draft: ${l}`);
});
Deno.test("WO-064/10 a consent, acknowledgement or disclosure is never drafted, by its label or by the answer chosen", () => {
  for (const l of ["Voluntary Disclosures", "Authorization and Acknowledgement", "Please acknowledge our privacy notice", "Do you consent to a background check?"]) {
    assert(neverDraft(l), `should never draft: ${l}`);
  }
  const q1 = q("v", "Additional information", ["Yes, I have read and consent to the terms and conditions"]);
  eq((vetoDraft(q1, { answer: "Yes, I have read and consent to the terms and conditions", fact_ids: ["P-bg"] }, P) as any).why, "never");
});
Deno.test("WO-064/11 an answer must rest on a cited fact about the question; a named option must be named in it", () => {
  const heard = q("h", "How did you hear about us?", ["Campus visit", "LinkedIn Post", "Company website"]);
  eq((vetoDraft(heard, { answer: "LinkedIn Post", fact_ids: ["P-li"] }, P) as any).why, "unverified", "a LinkedIn URL is not hearing of the job on LinkedIn");
  assert(vetoDraft(heard, { answer: "Company website", fact_ids: ["P-heard"] }, P).ok);
  const subj = q("s", "Subject Area Preference #2", ["Bilingual", "Science", "English Language Arts"]);
  eq((vetoDraft(subj, { answer: "Science", fact_ids: ["P-major"] }, P) as any).why, "unverified");
  const rate = q("r", "If successful in receiving an offer, are you willing to accept the hourly rate stated in the job posting?", ["Yes", "No"]);
  eq((vetoDraft(rate, { answer: "Yes", fact_ids: ["P-pay"] }, P) as any).why, "unverified", "a salary figure says nothing about accepting this rate");
  // Work rights and citizenship are never drafted since run 2 (they depend on the job's country).
  assert(neverDraft("Are you legally authorized to work in the country for which you are applying?"));
  assert(neverDraft("Are you a Singapore citizen?"));
  const pay = q("p", "Expected Salary");
  assert(vetoDraft(pay, { answer: "95000", fact_ids: ["P-sal"] }, P).ok);
});
Deno.test("WO-064/12 'have you built / developed / led' is an experience question: a no is never drafted from absence", () => {
  const game = q("g", "Have you developed your own game projects?", ["Yes", "No"]);
  eq((vetoDraft(game, { answer: "No", fact_ids: ["F-1"] }, P) as any).why, "negative_from_absence");
  const api = q("i", "Have you built or consumed an API that connects your application to another system?", ["Yes", "No"]);
  eq((vetoDraft(api, { answer: "Yes", fact_ids: ["F-1"] }, P) as any).why, "unverified");
});
Deno.test("WO-064/13 a failed model call is tried once more before its batch is refused", async () => {
  const s = stub((p, n) => n === 1 ? new Error("timeout") : reply([...new Set([...payloadText(p).matchAll(/\bk(\d+)\b/g)].map((m) => `k${m[1]}`))].map((key) => ({ key, answer: "Example Analytics", fact_ids: ["F-1"] }))));
  const out = await draftShortAnswers([q("k1", "What is your most recent company?")], { model: s.model, facts: () => FACTS });
  eq(s.calls.length, 2);
  assert(out[0].ok, JSON.stringify(out));
});

// The second reading of the same run, after the rules above: the drafts that still passed and are still wrong.
Deno.test("WO-064/14 never drafted: a human check, a pronunciation, dismissal history, past employment with this employer, the posting's own terms, opt-ins, opinions", () => {
  for (const l of [
    "To prove you are a real person, please type Real below",
    "How do you pronounce your name? (e.g., 'An-na' or 'Ah-na')",
    "Have you ever been discharged by an employer?",
    "To avoid actual or perceived impairment of our auditor's independence, please confirm whether you are a current/an ex-employee of Deloitte",
    "Have you previously worked for Mastery? If so, what was your role?",
    "The salary for this position is listed in the description. Is this salary within your expectations?",
    "Would you like to get an email notification whenever we find a role that meets your requirements?",
    "If yes, is Babel Street considered a competitor to your most recent employer?",
  ]) assert(neverDraft(l), `should never draft: ${l}`);
  for (const l of ["Are you currently a Speechmatics employee?", "What is your expected compensation?", "Your current job title"]) eq(neverDraft(l), null, l);
});
Deno.test("WO-064/15 an answer that copies the question back is refused; a language is an experience question", () => {
  const url = q("u", "Please fill out the technical assessment here: https://docs.google.com/forms/d/e/abc");
  eq((vetoDraft(url, { answer: "Please fill out the technical assessment here: https://docs.google.com/forms/d/e/abc", fact_ids: ["F-1"] }, FACTS) as any).why, "unverified");
  const lang = q("l", "Are you bilingual in German/English?", ["Yes", "No"]);
  eq((vetoDraft(lang, { answer: "No", fact_ids: ["F-1"] }, FACTS) as any).why, "negative_from_absence");
});

// Run 2 (CI 39474047241) read by two independent reviewers: 80 of 368 drafts wrong (A 69, B 75; they agree on 336 of
// 368). Every one of those 80, as drafted, must now be refused; the ones both called right are counted, not required.
import RUN2 from "../fixtures/answer-draft/run2-reviewed.json" with { type: "json" };
import { TEST_FACTS } from "../../evals/apply/answer-draft.ts";
import { factText } from "../../supabase/functions/_shared/essay_draft.ts";
const RUN2_NOW = Date.UTC(2026, 9, 20);
function reveto(x: any) {
  const byText = new Map(TEST_FACTS.map((f: any) => [factText(f), f.id]));
  const ids = x.facts_cited.map((t: string) => byText.get(t) ?? "?");
  const qq = { key: "r", label: x.question, type: x.options.length ? "select" : "text", options: x.options, company: x.company ?? "" };
  return neverDraft(x.question) ? { ok: false, why: "never" } : vetoDraft(qq, { answer: x.answer, fact_ids: ids }, TEST_FACTS, RUN2_NOW);
}
Deno.test("WO-064/16 every draft the reviewers found wrong in run 2 is refused (80 of 80)", () => {
  const passed = (RUN2 as any).wrong.filter((x: any) => reveto(x).ok);
  eq(passed.map((x: any) => `${x.question.slice(0, 70)} => ${x.answer.slice(0, 30)}`), [], "wrong drafts still passing the veto");
});
Deno.test("WO-064/17 of the drafts both reviewers called right, the share still drafted is reported (not required)", () => {
  const right = (RUN2 as any).right as any[];
  const kept = right.filter((x) => reveto(x).ok).length;
  console.log(`run 2: ${kept} of ${right.length} drafts both reviewers called right still pass the veto`);
  assert(right.length > 0);
});
