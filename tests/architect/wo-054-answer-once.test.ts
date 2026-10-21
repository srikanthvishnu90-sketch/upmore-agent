// WO-054: answer once, before the session. The queue's postings are read first (nothing filled or clicked), the questions
// only the person can answer are gathered by the key the planner reads saved answers by (answerKey), each is asked once in
// the panel, and each answer fills every posting that asks it, through that posting's own options. Contract:
// docs/architect/work-orders/WO-054-answer-once.md. The extension in a real Chromium: tests/career-extension-browser.test.cjs.
import {
  answerOnceQuestions, answerOnceRows, beforeSession, cardLines, MASKED, planForm, type PreparedPosting, reviewPayload, type SnapField,
} from "../../extension/src/apply_core.ts";
import { factsWithTextAnswers } from "../../workers/career-browser/ask-once.ts";
import BACKGROUND from "../../extension/background.js" with { type: "text" };
import CONTENT from "../../extension/content.js" with { type: "text" };
import PANEL from "../../extension/panel.js" with { type: "text" };
import PANEL_HTML from "../../extension/panel.html" with { type: "text" };

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const opts = (...l: string[]) => l.map((x) => ({ label: x, value: x }));
const field = (name: string, label: string, o: Partial<{ type: string; required: boolean; options: { label: string; value: string }[]; personal: boolean }> = {}) =>
  ({ name, label, type: o.type ?? "multi_value_single_select", required: o.required ?? true, options: o.options ?? [], ...(o.personal ? { personal: true } : {}) });
// A synthetic TEST person who stated their name and email only: every other question here is theirs to answer.
const ANSWERS = { first_name: { value: "Test", factId: "TEST-f1" }, email: { value: "test.person@example.test", factId: "TEST-f2" } };
const AWS = "How many years of experience do you have with AWS?";
const SPONSOR_1 = "Will you now or in the future require visa sponsorship?";
const SPONSOR_2 = "Do you require sponsorship to work in the US?";
const OFFICE = "Are you able to work from our office 3 days a week?";
const HERE = "Are you legally authorized to work in the country where this job is located?";

// What the content script reports for one posting it read in a hidden tab: the extension's own planForm, strict.
function prepared(jobId: string, company: string, schema: ReturnType<typeof field>[], location?: string, answers: Record<string, any> = ANSWERS, saved = {}): PreparedPosting {
  const p = planForm({ userId: "TEST", jobId, company, family: "lever", schema, answers, saved, now: Date.UTC(2026, 9, 20), location });
  return { jobId, company, location, needs: p.needs };
}
const merge = (ps: PreparedPosting[], answers: Record<string, unknown> = ANSWERS) => answerOnceQuestions({ postings: ps, answers, answered: new Set() });

Deno.test("WO-054/1 one question per key: the same wording, or the same fact in other words, is asked once for every posting", () => {
  const ps = [
    prepared("lever:alpha:1", "alpha", [field("a1", AWS, { options: opts("0-2 years", "3-5 years", "6+ years") }), field("a2", SPONSOR_1, { options: opts("Yes", "No") })]),
    prepared("lever:beta:2", "beta", [field("b1", AWS, { options: opts("0-2 years", "3-5 years", "6+ years") }), field("b2", SPONSOR_2, { options: opts("Yes", "No") })]),
    prepared("lever:gamma:3", "gamma", [field("c1", AWS, { options: opts("0-2 years", "3-5 years", "6+ years") }), field("c2", SPONSOR_1, { options: opts("Yes", "No") })]),
  ];
  const { questions } = merge(ps);
  eq(questions.length, 2, JSON.stringify(questions.map((q) => q.key)));
  const aws = questions.find((q) => q.key.startsWith("label:"))!, spons = questions.find((q) => q.key === "fact:sponsorship")!;
  eq(aws.postings.map((p) => p.company), ["alpha", "beta", "gamma"], "asked by three postings");
  eq(aws.similar, 0, "one wording");
  eq(aws.options, ["0-2 years", "3-5 years", "6+ years"], "the employer's own options");
  eq(spons.postings.length, 3);
  eq(spons.label, SPONSOR_1, "the most common wording is shown");
  eq(spons.similar, 1, "and 1 similar");
  eq(questions.map((q) => q.perPosting), [false, false]);
});

Deno.test("WO-054/2 a question about one job never merges: each posting's own entry, with its company", () => {
  const ps = ["alpha", "beta", "gamma"].map((c, i) => prepared(`lever:${c}:${i}`, c, [field("o", OFFICE, { options: opts("Yes", "No") })], "San Francisco, CA"));
  const { questions } = merge(ps);
  eq(questions.length, 3, "three postings, three entries");
  for (const q of questions) {
    assert(q.key.startsWith("job:"), q.key);
    eq(q.perPosting, true);
    eq(q.postings.length, 1, "a job: key is one posting's");
  }
  eq(questions.map((q) => q.postings[0].company), ["alpha", "beta", "gamma"]);
  eq(new Set(questions.map((q) => q.key)).size, 3);
});

Deno.test("WO-054/3 work rights 'in the country where this job is located': London and the US are separate entries", () => {
  const ps = [
    prepared("greenhouse:wppmedia:1", "wppmedia", [field("w", HERE, { options: opts("Yes", "No") })], "London, United Kingdom"),
    prepared("greenhouse:anduril:2", "anduril", [field("w", HERE, { options: opts("Yes", "No") })], "Costa Mesa, California, United States"),
  ];
  const { questions } = merge(ps);
  eq(questions.length, 2);
  assert(questions.every((q) => q.key.startsWith("job:") && q.postings.length === 1), JSON.stringify(questions));
  eq(questions.map((q) => q.postings[0].company).sort(), ["anduril", "wppmedia"]);
  // With the person's US authorization stated, the US posting fills and only London is asked.
  const withAuth = { ...ANSWERS, work_authorization: { value: "Yes", factId: "TEST-auth" } };
  const again = [prepared("greenhouse:wppmedia:1", "wppmedia", [field("w", HERE, { options: opts("Yes", "No") })], "London, United Kingdom", withAuth),
    prepared("greenhouse:anduril:2", "anduril", [field("w", HERE, { options: opts("Yes", "No") })], "Costa Mesa, California, United States", withAuth)];
  eq(merge(again, withAuth).questions.map((q) => q.postings[0].company), ["wppmedia"]);
});

Deno.test("WO-054/4 never listed: essays, EEO and self-identification, identity numbers, file uploads (and agreements, which are one employer's)", () => {
  const needs = [
    { label: "Why do you want to work at Example?", type: "textarea", options: [] },
    { label: "Gender", type: "multi_value_single_select", options: ["Male", "Female", "Decline to self-identify"] },
    { label: "Are you a protected veteran?", type: "multi_value_single_select", options: ["Yes", "No", "I don't wish to answer"] },
    { label: "Disability status (voluntary)", type: "multi_value_single_select", options: ["Yes", "No"], personal: true },
    { label: "Social Security Number", type: "input_text", options: [] },
    { label: "SIN (Social Insurance Number)", type: "input_text", options: [] },
    { label: "Cover Letter", type: "input_file", options: [] },
    { label: "I acknowledge that I have read and agree to the arbitration agreement.", type: "checkbox", options: [] },
    { label: AWS, type: "multi_value_single_select", options: ["0-2 years", "3-5 years"] },
  ];
  const { questions, left } = merge([{ jobId: "lever:alpha:1", company: "alpha", needs }, { jobId: "lever:beta:2", company: "beta", needs }]);
  eq(questions.map((q) => q.label), [AWS], "only the experience screen is the person's to answer here");
  eq(questions[0].postings.length, 2);
  const why = (l: string) => [...new Set(left.filter((x) => x.label === l).map((x) => x.why))];
  eq(why("Why do you want to work at Example?"), ["essay"]);
  eq(why("Gender"), ["personal"]);
  eq(why("Are you a protected veteran?"), ["personal"]);
  eq(why("Disability status (voluntary)"), ["personal"]);
  eq(why("Social Security Number"), ["identity"]);
  eq(why("SIN (Social Insurance Number)"), ["identity"]);
  eq(why("Cover Letter"), ["file"]);
  eq(why("I acknowledge that I have read and agree to the arbitration agreement."), ["agreement"]);
  // Through the extension's own reader shape too: a real form's EEO select, essay and upload never reach the panel.
  const p = prepared("lever:gamma:3", "gamma", [field("e", "Gender", { options: opts("Male", "Female", "Decline") }), field("t", "Why do you want to work at Example?", { type: "textarea" }),
    field("f", "Cover Letter", { type: "input_file" }), field("s", "Social Security Number", { type: "input_text" }), field("x", AWS, { options: opts("0-2 years", "3-5 years") })]);
  eq(merge([p]).questions.map((q) => q.label), [AWS]);
});

Deno.test("WO-054/5 an answer under a merged key fills another posting only through that posting's own options; where it fits none, it is asked again", () => {
  const X = [field("q", AWS, { options: opts("0-2 years", "3-5 years", "6+ years") })];
  const Y = [field("q", AWS, { options: opts("Less than 3 years", "3 to 5 years", "More than 5 years") })];
  const ps = [prepared("lever:x:1", "x", X), prepared("lever:y:2", "y", Y), prepared("lever:z:3", "z", X)];
  const { questions } = merge(ps);
  eq(questions.length, 1);
  const q = questions[0];
  eq(q.options, ["0-2 years", "3-5 years", "6+ years"], "the most common option list is shown");
  // The person picks one of the employer's own options; one not on the list, or a typed identity-shaped number, is refused.
  const r = answerOnceRows({ questions, picks: [{ key: q.key, answer: "3-5 years" }] });
  eq(r.refused, []);
  eq(r.groups.length, 1);
  eq(r.groups[0].answers.map((a) => [a.key, a.answer]), [[q.key, "3-5 years"]]);
  eq(r.groups[0].questions.map((x) => x.key), [q.key], "the question is stored (put_own) before it is answered");
  eq(answerOnceRows({ questions, picks: [{ key: q.key, answer: "about four" }] }).refused.map((x) => x.key), [q.key], "not one of the employer's options");
  eq(answerOnceRows({ questions, picks: [{ key: q.key, answer: MASKED }] }).groups, []);
  // The store hands it back as the person's saved answer (career_apply_answers_own -> factsWithTextAnswers); each posting plans again.
  const facts = factsWithTextAnswers({ answers: ANSWERS, saved: {} }, r.groups[0].answers.map((a, i) => ({ id: `TEST-row-${i}`, key: a.key, kind: a.kind, answer: a.answer })));
  const plan = (jobId: string, schema: ReturnType<typeof field>[]) => planForm({ userId: "TEST", jobId, company: "c", family: "lever", schema, answers: facts.answers, saved: facts.saved, now: Date.UTC(2026, 9, 20) });
  eq(plan("lever:x:1", X).fill.map((f) => [f.value, f.factId]), [["3-5 years", "text-answer:TEST-row-0"]]);
  eq(plan("lever:z:3", X).fill.map((f) => f.value), ["3-5 years"]);
  const y = plan("lever:y:2", Y);
  eq(y.fill, [], "never forced onto another employer's list");
  eq(y.needs.map((n) => n.label), [AWS], "asked again on that posting's card");
  // A fact merged across wordings goes through each posting's own options (the planner's chooseOption).
  const S = [prepared("lever:a:1", "a", [field("s", SPONSOR_1, { options: opts("Yes", "No") })]),
    prepared("lever:b:2", "b", [field("s", SPONSOR_2, { options: opts("Yes, I will need sponsorship", "No, I will not need sponsorship") })])];
  const sq = merge(S).questions;
  eq(sq.map((x) => x.key), ["fact:sponsorship"]);
  const sr = answerOnceRows({ questions: sq, picks: [{ key: "fact:sponsorship", answer: "No" }] });
  const sf = factsWithTextAnswers({ answers: ANSWERS, saved: {} }, sr.groups[0].answers.map((a) => ({ id: "TEST-s", key: a.key, kind: a.kind, answer: a.answer })));
  const b = planForm({ userId: "TEST", jobId: "lever:b:2", company: "b", family: "lever", schema: [field("s", SPONSOR_2, { options: opts("Yes, I will need sponsorship", "No, I will not need sponsorship") })],
    answers: sf.answers, saved: sf.saved, now: Date.UTC(2026, 9, 20) });
  eq(b.fill.map((f) => f.value), ["No, I will not need sponsorship"]);
  // An answer that names one employer never travels to another (formAnswersToKeep's rule, the same here).
  const t = merge([prepared("lever:acme:1", "acme", [field("h", "What is your preferred last name?", { type: "input_text" })]),
    prepared("lever:beta:2", "beta", [field("h", "What is your preferred last name?", { type: "input_text" })])]).questions;
  eq(answerOnceRows({ questions: t, picks: [{ key: t[0].key, answer: "I love Acme" }] }).groups, []);
  eq(answerOnceRows({ questions: t, picks: [{ key: t[0].key, answer: "Person" }] }).groups[0].answers[0].answer, "Person");
});

Deno.test("WO-054/6 nothing is pre-selected and nothing is answered for the person", () => {
  const ps = [prepared("lever:x:1", "x", [field("q", AWS, { options: opts("0-2 years", "3-5 years") }), field("s", SPONSOR_1, { options: opts("Yes", "No") }),
    field("p", "What is your preferred last name?", { type: "input_text" })])];
  const { questions } = merge(ps);
  eq(questions.length, 3);
  for (const q of questions) eq(q.selected, null, `${q.label}: nothing chosen until the person chooses`);
  eq(answerOnceRows({ questions, picks: [] }).groups, [], "no pick, nothing stored");
  eq(answerOnceRows({ questions, picks: questions.map((q) => ({ key: q.key, answer: "" })) }).groups, [], "skipped stays for the card");
  // The panel starts every choice empty, and only the person's own tap saves.
  assert(/selected/.test(PANEL) && !/\.selected\s*=\s*true/.test(PANEL), "the panel never selects an option itself");
  assert(/isTrusted/.test(PANEL.slice(PANEL.indexOf("ao-save"))), "Save counts only the person's own click");
});

Deno.test("WO-054/7 each card marks an answer given before the session; the payload and its approval are unchanged", async () => {
  const f = (name: string, label: string, value: string, factId: string | null, source: SnapField["source"] = "trainee"): SnapField =>
    ({ name, label, value, source, factId, masked: false });
  const fields = [f("a", AWS, "3-5 years", "text-answer:R1"), f("b", "Email", "test.person@example.test", "TEST-f2"), f("c", "Pronouns", "they/them", "text-answer:R9", "you")];
  eq(beforeSession(fields, ["text-answer:R1", "text-answer:R9"]), ["a"], "only what Trainee filled from an answer given in the panel");
  const payload = reviewPayload({ userId: "TEST", jobId: "lever:x:1", company: "x", url: "https://jobs.lever.co/x/1/apply", family: "lever", fields,
    resume: null, account: { epoch: 0, version: 1 }, expiresAt: "2026-10-20T00:00:00Z" });
  const base = { company: "x", family: "lever" as const, payload, openRequired: [], identity: [], blockers: [], verification: [] };
  const marked = cardLines({ ...base, before: ["a"] });
  assert(marked.some((l) => l.includes(`${AWS}: 3-5 years`) && l.includes("answered before the session")), JSON.stringify(marked));
  eq(marked.filter((l) => l.includes("answered before the session")).length, 1);
  assert(!cardLines(base).some((l) => l.includes("answered before the session")));
  // The content script passes the marks to every card; the approval binds the payload, which carries no mark.
  assert(/C\.beforeSession\(/.test(CONTENT) && /C\.cardLines\([^;]*\bbefore \}/.test(CONTENT), "content.js marks the card");
  assert(!JSON.stringify(payload).includes("before the session"));
});

Deno.test("WO-054/8 wiring: prepare reads in hidden tabs, never fills or clicks there, skips Workday, saves with the person's own RPCs", () => {
  const at = CONTENT.indexOf("async function survey(");
  assert(at > 0, "content.js has survey()");
  const body = CONTENT.slice(at, CONTENT.indexOf("\n  }\n", at));
  for (const bad of ["D.fill(", ".click(", "refresh(", "type: \"card\"", "type: \"questions\"", "type: \"begin\""]) assert(!body.includes(bad), `survey() must not ${bad}`);
  assert(/C\.planForm\(/.test(body) && /fnPostingLocation\(\)/.test(body), "survey reads the form and the posting's location");
  assert(/active: false/.test(BACKGROUND), "postings are read in background tabs");
  assert(/PREPARE_MAX = (\d+)/.test(BACKGROUND) && Number(/PREPARE_MAX = (\d+)/.exec(BACKGROUND)![1]) <= 100, "a cap of at most 100 (owner ruling 2026-10-21: 50 in one batch, one tap; docs/apply/FIFTY-IN-THIRTY.md)");
  const prep = BACKGROUND.slice(BACKGROUND.indexOf("async function prepareQueue"), BACKGROUND.indexOf("\n}\n", BACKGROUND.indexOf("async function prepareQueue")));
  assert(/workday/.test(prep), "Workday postings are left out of prepare");
  const panelOnly = /const PANEL_ONLY = new Set\(\[([^\]]+)\]/.exec(BACKGROUND)![1], tabOnly = /const TAB_ONLY = new Set\(\[([^\]]+)\]/.exec(BACKGROUND)![1];
  for (const t of ["answer-once-prepare", "answer-once-save", "answer-once-skip"]) assert(panelOnly.includes(`"${t}"`), `${t} is the panel's only`);
  assert(tabOnly.includes(`"survey"`), "survey is a tab's report only");
  for (const rpc of ["career_apply_questions_put_own", "career_apply_questions_answer_from_form_own", "career_apply_answers_own"]) assert(BACKGROUND.includes(rpc), rpc);
  assert(/id="q-prepare"/.test(PANEL_HTML) && /id="ao-list"/.test(PANEL_HTML) && /id="ao-save"/.test(PANEL_HTML), "the panel's Prepare, list and Save");
  assert(/Workday/.test(prep) && /signed in/.test(prep), "the panel is told why Workday is left out");
});

Deno.test("WO-054/9 (WO-055) a question about a job abroad is that posting's entry, never merged into the person's fact", () => {
  const sponsor = "Will you now, or in the future, require sponsorship?";
  const { sponsorship: _, ...noSponsor } = ANSWERS as Record<string, unknown>;
  const m = merge([
    prepared("greenhouse:neo4j:1", "neo4j", [field("s", sponsor, { options: opts("Yes", "No") })], "London", noSponsor as any),
    prepared("lever:acme:2", "acme", [field("s", sponsor, { options: opts("Yes", "No") })], "Austin, TX", noSponsor as any),
    prepared("lever:beta:3", "beta", [field("s", sponsor, { options: opts("Yes", "No") })], "Chicago, IL", noSponsor as any),
  ], noSponsor);
  const london = m.questions.find((q) => q.postings.some((a) => a.jobId === "greenhouse:neo4j:1"))!;
  const us = m.questions.find((q) => q.postings.some((a) => a.jobId === "lever:acme:2"))!;
  eq([london.perPosting, london.postings.length, london.key.startsWith("job:")], [true, 1, true], "London's is its own, shown with its company");
  eq([us.key, us.postings.map((a) => a.jobId)], ["fact:sponsorship", ["lever:acme:2", "lever:beta:3"]], "the two US postings ask the person's fact once");
});
