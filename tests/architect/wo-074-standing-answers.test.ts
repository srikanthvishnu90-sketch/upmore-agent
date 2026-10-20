// WO-074: standing answers. The person states once, in their own words, an answer for a CLASS of question (how they
// hear about jobs, relatives at the employer, work rights by country, office and place). Code alone decides which
// questions belong to a class (question_map standingClass: rules and an exclusion list) and derives each form's answer
// from the statement and the posting's own facts, only onto the form's own options. What the statement does not settle
// is asked as before. Contract: docs/architect/work-orders/WO-074-standing-answers.md.
import {
  answerOnceQuestions, answerOnceRows, cardLines, planForm, type PreparedPosting, reviewPayload, type SnapField,
} from "../../extension/src/apply_core.ts";
import { factsWithTextAnswers } from "../../workers/career-browser/ask-once.ts";
import { standingClass } from "../../supabase/functions/_shared/question_map.ts";
import { parseStanding, postingCountryName, STANDING_INPUTS, standingSummary } from "../../supabase/functions/_shared/standing_answers.ts";
import PANEL from "../../extension/panel.js" with { type: "text" };
import MIGRATION from "../../supabase/migrations/20261022120200_career_apply_standing_answers.sql" with { type: "text" };

function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
const opts = (...l: string[]) => l.map((x) => ({ label: x, value: x }));
const YN = opts("Yes", "No");
type F = { name: string; label: string; type: string; required: boolean; options: { label: string; value: string }[] };
const field = (name: string, label: string, o: Partial<F> = {}): F => ({ name, label, type: o.type ?? "multi_value_single_select", required: o.required ?? true, options: o.options ?? [] });
const fact = (value: string, id: string) => ({ value, factId: `TEST-${id}` });
// A synthetic TEST person in Chicago, authorized in the US with no sponsorship needed (their facts).
const BASE: Record<string, { value: string; factId: string }> = {
  first_name: fact("Test", "fn"), city: fact("Chicago", "city"), state: fact("IL", "state"), country: fact("United States", "country"),
  location: fact("Chicago, IL", "loc"), work_authorization: fact("Yes", "auth"), sponsorship: fact("No", "sp"), onsite_ok: fact("Yes", "onsite"),
};
const row = (cls: string, v: unknown, id = cls) => ({ [`standing:${cls}`]: { value: JSON.stringify(v), factId: `text-answer:TEST-${id}` } });
const HOW = row("how_heard", { channels: ["company_site", "job_board"] });
const REL = row("relatives_at_employer", { none: true });
const RIGHTS = row("work_rights", { countries: ["United States"], complete: true, sponsorshipElsewhere: "yes" });
const OFFICE = row("office", { places: ["San Francisco, CA", "Chicago, IL"], maxDays: 3 });
const ALL = { ...HOW, ...REL, ...RIGHTS, ...OFFICE };

function plan(schema: F[], o: { location?: string; company?: string; answers?: Record<string, any>; saved?: Record<string, any>; jobId?: string } = {}) {
  return planForm({ userId: "TEST", jobId: o.jobId ?? "lever:acme:1", company: o.company ?? "Acme", family: "lever", schema, answers: o.answers ?? BASE, saved: o.saved ?? ALL, now: Date.UTC(2026, 9, 20), location: o.location });
}
const filled = (r: ReturnType<typeof plan>, name: string) => r.fill.find((x) => x.name === name) ?? null;
const asked = (r: ReturnType<typeof plan>, label: string) => r.needs.some((n) => n.label === label);
// One question, answered from a standing answer: its value (which must be one of the form's options) and source.
function one(label: string, o: Parameters<typeof plan>[1] & { options?: { label: string; value: string }[]; type?: string } = {}) {
  const f = field("q", label, { options: o.options ?? YN, type: o.type });
  const r = plan([f], o);
  const p = filled(r, "q");
  if (p && f.options.length) assert(f.options.some((x) => x.value === p.value), `${label}: ${p.value} is not one of the form's options`);
  return { value: p?.value ?? null, factId: p?.factId ?? null, asked: asked(r, label) };
}
const fromStanding = (x: { factId: string | null }, cls: string) => assert(String(x.factId).startsWith(`standing:${cls}:`), `factId ${x.factId}`);

// ---------------------------------------------------------------------------------------------------- how they heard
Deno.test("WO-074/how 1 applies on the class's wordings across postings, onto each form's own options", () => {
  const cases: [string, string[], string][] = [
    ["How did you hear about us?", ["Job Board", "Employee Referral", "Other"], "Job Board"],
    ["How'd you hear about us?", ["Detroit Lions Website", "Employee Referral", "University"], "Detroit Lions Website"],
    ["Where did you first hear about this job?", ["Award Annoucement", "Employee Presentation", "Acme Careers Site", "Other"], "Acme Careers Site"],
    ["How did you learn about this opportunity?", ["Referred by current employee", "Job Board (Handshake, Indeed, ZipRecruiter etc.)", "Career Fair", "Other"], "Job Board (Handshake, Indeed, ZipRecruiter etc.)"],
    ["How did you hear about this position?", ["Acme Careers", "Friend", "Other"], "Acme Careers"],
  ];
  for (const [label, o, want] of cases) {
    // The person's usual how-heard fact ("Company website") fits none of these lists; the standing answer does.
    const x = one(label, { options: opts(...o), answers: { ...BASE, how_heard: fact("Company website", "hh") }, company: /Lions/.test(o[0]) ? "Detroit Lions" : "Acme" });
    eq(x.value, want, label);
    fromStanding(x, "how_heard");
  }
});

Deno.test("WO-074/how 2 refuses near-miss wordings, and a list where no option fits is asked", () => {
  for (const label of [
    "Have you heard of Acme before applying?", "If you selected Other, please indicate where you heard about this position.",
    "Who referred you or where did you see our job ad?", "Please enter the name of the person that referred you",
  ]) {
    eq(standingClass({ label, type: "input_text" }), null, label);
    const x = one(label, { type: "input_text", options: [] });
    assert(!String(x.factId).startsWith("standing:"), `${label}: ${x.factId}`);
  }
  // Nothing on the list is a careers site or a plain job board ("Other Online Job Board" is a board the person never named).
  const x = one("How did you hear about this job?", { options: opts("LinkedIn Post", "Other Online Job Board", "Referral", "Job Fair") });
  eq(x.value, null);
  assert(x.asked, "asked as before");
});

// ---------------------------------------------------------------------------------------------------- relatives
Deno.test("WO-074/relatives 1 a yes/no relatives question at this employer is answered No, across wordings", () => {
  for (const [label, company] of [
    ["Do you have any relatives, spouses, partners or in-laws currently employed at The New York Times?", "The New York Times"],
    ["Do you have any immediate family that work at Heartflow?", "HeartFlow"],
    ["Do you have any family members (including those by marriage) employed by our Company or close personal relationships employed by our Company?", "Nexus Engineering"],
    ["Do you have any relatives currently working for Acme?", "Acme"],
  ]) {
    const x = one(label, { company });
    eq(x.value, "No", label);
    fromStanding(x, "relatives_at_employer");
  }
});

Deno.test("WO-074/relatives 2 relation types the statement does not cover, names asked for, or another company: asked", () => {
  for (const [label, type] of [
    ["Do you have any friends or family members that are currently employed by Acme?", "multi_value_single_select"],
    ["To the best of your knowledge, do you have any family members / relatives or personal relationships at Acme or at any suppliers, partners, or vendors?", "multi_value_single_select"],
    ["Are you related to anyone who is currently working for Acme? If Yes - please list the name of the person(s) and their relationship to you.", "multi_value_single_select"],
    ["Are you a family member (spouse, parent, child, sibling, in-law) of a current employee of Deloitte?", "multi_value_single_select"],
    ["Are any of your immediate family members practicing health care professionals that may use or purchase Acme products?", "multi_value_single_select"],
    ["Do you have any relatives currently working for Acme or any affiliated company?", "multi_value_single_select"],
    ["Do you know anyone who currently works at Acme?", "multi_value_single_select"],
  ]) {
    const x = one(label, { type });
    eq(x.value, null, label);
    assert(x.asked, `${label}: asked`);
  }
});

// ---------------------------------------------------------------------------------------------------- work rights
Deno.test("WO-074/rights 1 a country outside the confirmed list: not authorized (No), needs sponsorship (Yes)", () => {
  const cases: [string, string, string][] = [
    ["Are you legally authorized to work in the country where this job is located?", "London, United Kingdom", "No"],
    ["Will you now or at any point in the future require sponsorship to maintain lawful employment in the country where this job is located?", "London, United Kingdom", "Yes"],
    ["Will you now or in the future require visa sponsorship?", "Munich", "Yes"],
    ["Are you legally entitled to work in Canada?", "Toronto", "No"],
    ["Do you have the right to work in the UK without requiring a visa sponsor now or in the future?", "London", "No"],
    ["Are you legally authorized to work in the country in which you are applying?", "Tokyo, Japan", "No"],
  ];
  for (const [label, location, want] of cases) {
    const x = one(label, { location });
    eq(x.value, want, `${label} @ ${location}`);
    fromStanding(x, "work_rights");
  }
  // Options that say yes or no in sentences.
  const y = one("Will you now or in the future require employment sponsorship?", { location: "Dublin, Ireland", options: opts("Yes, I will require sponsorship", "No, I will not require sponsorship") });
  eq(y.value, "Yes, I will require sponsorship");
});

Deno.test("WO-074/rights 2 unknown country, a list not confirmed complete, a status list, or a question beyond yes/no: asked", () => {
  const sponsor = "Will you now or in the future require visa sponsorship?";
  // (Without the person's US facts, so that only a standing answer could fill these.)
  const { work_authorization: _a, sponsorship: _s, ...noFacts } = BASE;
  for (const location of ["Remote", "Remote, US or CAN", "Cape Town", undefined]) eq(one(sponsor, { location, answers: noFacts }).value, null, String(location));
  const partial = row("work_rights", { countries: ["United States"], complete: false, sponsorshipElsewhere: "yes" });
  eq(one(sponsor, { location: "London, United Kingdom", saved: { ...ALL, ...partial } }).value, null, "not confirmed as every country");
  eq(one("Do You have the Right to Work in the UK?", { location: "London", options: opts("Yes", "No", "I require sponsorship") }).value, null, "an option that is neither yes nor no");
  for (const label of ["What is your current visa status?", "If yes, please confirm which type of Visa would be required",
    "Avez-vous le droit permanent et sans restriction de travailler au Canada pendant au moins trois ans? / Do you have the permanent and unrestricted right to work in Canada for a minimum of 3 years?",
    "Will you now or in the future require employer sponsorship to work in the United States, Greece or Canada (e.g., H-1B visa status)?",
    "Are you eligible to live and work in South Africa or would you need sponsorship?"]) {
    eq(one(label, { location: "London, United Kingdom" }).value, null, label);
  }
});

Deno.test("WO-074/rights 3 the US stays the person's facts; a listed country other than home answers Yes/No from the statement", () => {
  const us = one("Are you legally authorized to work in the country where this job is located?", { location: "Austin, TX" });
  eq(us.value, "Yes");
  eq(us.factId, "TEST-auth", "the person's own fact, unchanged (WO-053)");
  const both = row("work_rights", { countries: ["United States", "Canada"], complete: true, sponsorshipElsewhere: "yes" });
  const ca = one("Are you legally entitled to work in Canada?", { location: "Toronto, ON", saved: { ...ALL, ...both } });
  eq(ca.value, "Yes");
  const caSp = one("Will you now or in the future require sponsorship to work in Canada?", { location: "Toronto, ON", saved: { ...ALL, ...both } });
  eq(caSp.value, "No");
  eq(postingCountryName("London, England, United Kingdom"), "United Kingdom");
  eq(postingCountryName("Toronto, ON; Edmonton, AB"), "Canada");
  eq(postingCountryName("Remote"), null);
  eq(postingCountryName("San Francisco; London"), null, "two countries");
});

// ---------------------------------------------------------------------------------------------------- office
Deno.test("WO-074/office 1 a listed place, days within the stated maximum: Yes; across wordings", () => {
  const cases: [string, string][] = [
    ["Are you able to work from our office 3 days a week?", "San Francisco, CA"],
    ["Our team is in office 2 days/week. Are you open to working in our office 2 days/week?", "San Francisco, California, United States"],
    ["Are you willing to work onsite at least 3 days a week in San Francisco, CA?", "Remote"],
    ["Are you able to work from our US office three days per week?", "San Francisco"],
  ];
  for (const [label, location] of cases) {
    const x = one(label, { location });
    eq(x.value, "Yes", `${label} @ ${location}`);
    fromStanding(x, "office");
  }
});

Deno.test("WO-074/office 2 more days than stated, a place not listed, no place known, or another question: asked", () => {
  const cases: [string, string | undefined][] = [
    ["Are you willing to work in the office 5 days a week?", "San Francisco, CA"], // 5 > 3
    ["Are you able to work in person at our Louisville, CO HQ?", "Louisville, Colorado"], // not listed
    ["Are you able to work from our office 3 days a week?", "Remote"], // no place
    ["Are you able to work from our office 3 days a week?", undefined],
    ["Are you able to work from our office 3 days a week?", "San Francisco; Austin, TX"], // Austin not listed
    ["Do you live within 30 miles of our San Francisco office?", "San Francisco"],
    ["Would you be open to occasional in-person meetings in San Francisco?", "San Francisco"],
    ["If selected for an interview, would you be able to attend in person at our San Francisco office?", "San Francisco"],
    ["Are you willing to relocate to San Francisco and work in the office 3 days a week?", "San Francisco"],
  ];
  for (const [label, location] of cases) eq(one(label, { location }).value, null, `${label} @ ${location}`);
  eq(one("Are you open to working 3 days onsite in one of our central offices?", { location: "San Francisco", options: opts("NYC", "SF", "Remote only") }).value, null, "not a yes/no list");
});

// ---------------------------------------------------------------------------------------------------- the review's findings
Deno.test("WO-074/review what the independent review marked wrong is asked now", () => {
  // A statement naming two ways (careers site or job board) on a form offering both, or a typed box: either could be it.
  for (const o of [["Detroit Lions Website", "Employee Referral", "Job Board", "LinkedIn"], ["Acme Career Site", "Indeed", "Glassdoor", "Other"],
    ["Acme career page (acme.com)", "Third party career site (LinkedIn, Indeed, etc.)", "Web search"]]) {
    eq(one("How did you hear about this job?", { options: opts(...o), company: /Lions/.test(o[0]) ? "Detroit Lions" : "Acme" }).value, null, o.join(" / "));
  }
  eq(one("Where did you see this job posting?", { type: "input_text", options: [] }).value === "Company careers website", false, "a typed box takes one way only");
  // The person who named one way: that way, when the form offers it once.
  const site = row("how_heard", { channels: ["company_site"] });
  eq(one("How did you hear about this job?", { options: opts("Acme Career Site", "Indeed", "Glassdoor", "Other"), saved: { ...ALL, ...site } }).value, "Acme Career Site");
  // "Dublin" alone may be Dublin, California or Ohio.
  eq(one("Will you now or in the future require visa sponsorship?", { location: "Dublin" }).value, null);
  eq(one("Will you now or in the future require visa sponsorship?", { location: "Dublin, Ireland" }).value, "Yes");
  // A feeling, or a start time, is not the statement's.
  const sf = row("office", { places: ["San Francisco, CA"], maxDays: 5 });
  for (const label of ["Are you excited to work in-office five days a week?", "Are you willing and excited for a 5 day in person office culture?",
    "Are you able to work out of our San Francisco office immediately?"]) eq(one(label, { location: "San Francisco", saved: { ...ALL, ...sf } }).value, null, label);
  eq(one("Can you work full-time from our San Francisco office?", { location: "San Francisco", saved: { ...ALL, ...sf } }).value, "Yes");
});

// ---------------------------------------------------------------------------------------------------- precedence
Deno.test("WO-074/own a standing answer never overrides the person's own answer to that exact question, nor their facts", () => {
  const label = "Will you now or in the future require visa sponsorship?";
  const base = plan([field("q", label, { options: YN })], { location: "London, United Kingdom", saved: {} });
  assert(asked(base, label), "asked without a standing answer");
  // The person answered this exact question for this posting before (ask once, a job: key): theirs stands.
  const p = answerOnceQuestions({ postings: [{ jobId: "lever:acme:1", company: "Acme", location: "London, United Kingdom", needs: base.needs }], answers: BASE, answered: new Set(["standing:work_rights"]) });
  const key = p.questions[0].key;
  assert(key.startsWith("job:"), key);
  const own = { [key]: { value: "No", factId: "text-answer:TEST-own" } };
  const x = one(label, { location: "London, United Kingdom", saved: { ...ALL, ...own } });
  eq([x.value, x.factId], ["No", "text-answer:TEST-own"]);
  // An answer of theirs for that question that fits none of the options is still theirs: asked, never replaced.
  const misfit = { [key]: { value: "Not sure", factId: "text-answer:TEST-own" } };
  eq(one(label, { location: "London, United Kingdom", saved: { ...ALL, ...misfit } }).value, null);
  // The person's fact is used first where it applies (relatives).
  const r = one("Do you have any relatives currently working for Acme?", { answers: { ...BASE, relative_here: fact("No", "rel") } });
  eq(r.factId, "TEST-rel");
});

// ---------------------------------------------------------------------------------------------------- store and panel
Deno.test("WO-074/store standing rows read back under their class key; malformed statements fill nothing", () => {
  const f = factsWithTextAnswers({ answers: {}, saved: {} }, [
    { id: "s1", key: "standing:work_rights", kind: "fact", answer: JSON.stringify({ countries: ["United States"], complete: true, sponsorshipElsewhere: "yes" }) },
    { id: "s2", key: "standing:nonsense", kind: "fact", answer: "x" },
  ]) as any;
  eq(Object.keys(f.saved), ["standing:work_rights"]);
  eq(f.saved["standing:work_rights"].factId, "text-answer:s1");
  eq(parseStanding("work_rights", "United States only"), null, "free text is not a statement");
  eq(parseStanding("work_rights", JSON.stringify({ countries: ["Atlantis"], complete: true, sponsorshipElsewhere: "yes" })), null, "an unknown country");
  eq(parseStanding("office", JSON.stringify({ places: ["San Francisco, CA"], maxDays: 9 })), null, "days beyond a week");
  const bad = { "standing:work_rights": { value: "United States only", factId: "text-answer:x" } };
  eq(one("Will you now or in the future require visa sponsorship?", { location: "London, United Kingdom", saved: bad }).value, null);
  assert(/standing:\(how_heard\|relatives_at_employer\|work_rights\|office\)/.test(MIGRATION), "the store accepts the four class keys");
});

Deno.test("WO-074/panel each class is offered once, inside the answer-once panel, only when it saves taps; saved by the existing save", () => {
  const rights = (id: string, loc: string, answers: Record<string, any> = BASE) => {
    const r = plan([field("a", "Are you legally authorized to work in the country where this job is located?", { options: YN }),
      field("s", "Will you now or in the future require visa sponsorship?", { options: YN })], { location: loc, saved: {}, jobId: id, answers });
    return { jobId: id, company: id.split(":")[1], location: loc, needs: r.needs } as PreparedPosting;
  };
  const ps = [rights("lever:a:1", "London, United Kingdom"), rights("lever:b:2", "Munich"), rights("lever:c:3", "Tokyo, Japan")];
  const m = answerOnceQuestions({ postings: ps, answers: BASE, answered: new Set() });
  eq(m.standing.map((q) => q.key), ["standing:work_rights"], JSON.stringify(m.questions.map((q) => q.key)));
  const st = m.standing[0];
  eq(st.postings.length, 6, "six questions on three postings, asked once as one statement");
  eq(st.covers!.slice().sort(), m.questions.map((q) => q.key).sort(), "it stands in for every entry (shown again if skipped)");
  assert(STANDING_INPUTS.work_rights < m.questions.length, "fewer taps than the entries it replaces");
  // Answered before: never offered again; its questions are left to the planner (here: asked as their own entries).
  const again = answerOnceQuestions({ postings: ps, answers: BASE, answered: new Set(["standing:work_rights"]) });
  eq(again.standing, []);
  // One question only (fewer than the class's inputs): no class item, the question stays as it is.
  const lone = answerOnceQuestions({ postings: [rights("lever:a:1", "London, United Kingdom")].map((p) => ({ ...p, needs: p.needs.slice(0, 1) })), answers: BASE, answered: new Set() });
  eq(lone.standing, [], "a 2-input statement is not offered for 1 question");
  // A US posting's sponsorship question is the person's facts', not covered.
  const us = answerOnceQuestions({ postings: [...ps, rights("lever:d:4", "Austin, TX", { first_name: BASE.first_name })], answers: { first_name: BASE.first_name }, answered: new Set() });
  const usKeys = us.questions.filter((q) => q.postings.some((a) => a.jobId === "lever:d:4")).map((q) => q.key);
  assert(usKeys.length && usKeys.every((k) => !us.standing[0].covers!.includes(k)), "the US posting's questions stay their own entries");
  // The existing save: a complete statement is kept under its class key; an incomplete one is refused.
  const ok = JSON.stringify({ countries: ["United States"], complete: true, sponsorshipElsewhere: "yes" });
  const all = [...m.standing, ...m.questions];
  const saved = answerOnceRows({ questions: all, picks: [{ key: "standing:work_rights", answer: ok }] });
  eq(saved.refused, []);
  eq(saved.groups[0].answers[0].key, "standing:work_rights");
  eq(saved.groups[0].answers[0].answer, ok);
  eq(saved.reopen, [{ key: "standing:work_rights", keys: [] }], "it settles every entry it covered");
  // A statement that does not settle them (not every country) shows them again at once, in the panel.
  const partial = JSON.stringify({ countries: ["United States"], complete: false, sponsorshipElsewhere: "yes" });
  eq(answerOnceRows({ questions: all, picks: [{ key: "standing:work_rights", answer: partial }] }).reopen[0].keys.slice().sort(), st.covers!.slice().sort());
  const refused = answerOnceRows({ questions: all, picks: [{ key: "standing:work_rights", answer: JSON.stringify({ countries: [] }) }] });
  eq(refused.groups, []);
  eq(refused.refused.length, 1);
  // The panel draws the class's short form in the same list, and composes the statement for the same Save.
  assert(/standing/.test(PANEL) && /ao-answer/.test(PANEL), "panel.js renders standing items");
});

Deno.test("WO-074/card the card says which standing answer filled a field", () => {
  const r = plan([field("q", "Will you now or in the future require visa sponsorship?", { options: YN })], { location: "London, United Kingdom" });
  const p = filled(r, "q")!;
  const fields: SnapField[] = [{ name: "q", label: p.label, value: p.value, source: "trainee", factId: p.factId, masked: false }];
  const payload = reviewPayload({ userId: "TEST", jobId: "lever:acme:1", company: "Acme", url: "https://jobs.lever.co/acme/1/apply", family: "lever", fields, resume: null,
    account: { epoch: 0, version: 1 }, expiresAt: "2026-10-21T00:00:00Z" });
  const lines = cardLines({ company: "Acme", family: "lever", payload, openRequired: [], identity: [], blockers: [], verification: [],
    standing: { work_rights: standingSummary("work_rights", parseStanding("work_rights", ALL["standing:work_rights"].value)!) } });
  const l = lines.find((x) => x.includes("require visa sponsorship"))!;
  assert(/from your standing answer: .*United States/.test(l), l);
});
