// WO-043: the mail classifier generalises. dev4 (348 SYNTHETIC emails, labeled and committed before any classifier
// change; dev4check a fixed-seed quarter scored once), the intent scorer's weights (fitted on the tuning splits only,
// reproducible), and the safety rules code keeps whatever the weights say: words that decide against the person are
// never another status, a rejection is never read as an interview, an offer talked about is never an interview, a call is
// an interview only about the application, a kind needs its own words, and conditions and other people's outcomes are not
// decisions. Offline: no model, no network.
// Run: deno test --no-check tests/architect/wo-043-mail-generalise.test.ts
import { classifyMail, MAIL_BIAS, MAIL_WEIGHTS, normText } from "../../supabase/functions/_shared/career_mail.ts";
import { dev4Splits, evaluate, SEALED, splitsOf } from "../../evals/career/mail-eval.ts";
import { fit, TUNING_SPLITS, tuningMails } from "../../evals/career/mail-fit.ts";
import labels from "../../evals/career/mail-labels.json" with { type: "json" };
import dev4 from "../../evals/career/mail-dev4.json" with { type: "json" };
import SRC from "../../supabase/functions/_shared/career_mail.ts" with { type: "text" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const kind = (from: string, subject: string, snippet: string) => classifyMail({ from, subject, snippet, date: "2026-10-20T15:00:00Z" }).kind;
const ATS = "Acme <no-reply@hire.lever.co>";

// ------------------------------------------------------------------------------------------------ the set
Deno.test("WO-043/E1 dev4: 250+ synthetic labeled emails, split by a fixed seed, disjoint from every older split; dev4check is sealed", () => {
  const fnv = (s: string) => { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  assert(dev4.synthetic === true && dev4.mails.length >= 250, `at least 250 synthetic emails, got ${dev4.mails.length}`);
  for (const m of dev4.mails) {
    eq(m.split, fnv(m.id + "wo-043-seed-20261020") % 4 === 0 ? "dev4check" : "dev4", `${m.id} split by the seed`);
    assert(/synthetic/i.test(String(m.origin)) && /^V\d{3}$/.test(m.id), `${m.id} is marked synthetic`);
  }
  const ids = new Set(labels.mails.map((m) => m.id));
  assert(!dev4.mails.some((m) => ids.has(m.id)), "no dev4 id is in mail-labels.json");
  const d = dev4Splits();
  eq(d.dev4.length + d.dev4check.length, dev4.mails.length, "every dev4 email is in exactly one of dev4 and dev4check");
  assert(d.dev4check.length >= 0.2 * dev4.mails.length, "dev4check is about a quarter");
  assert(SEALED.includes("dev4check") && SEALED.includes("blind40"), "dev4check and blind40 print only when named");
  eq(Object.keys(splitsOf(labels.mails as any)).includes("dev4check"), false, "dev4check is not in the WO-040 families");
});

Deno.test("WO-043/E2 the splits tuned on hold the target, with no rejection ever read as an interview", () => {
  for (const [name, mails] of [["dev", splitsOf(labels.mails as any).dev], ["dev4", dev4Splits().dev4]] as const) {
    const r = evaluate(mails);
    assert(r.status.precision >= 0.97 && r.status.recall >= 0.95, `${name} ${JSON.stringify(r.status)}`);
    eq(r.confusions.rejection_as_interview, 0, `${name}: a rejection read as an interview`);
  }
});

// ------------------------------------------------------------------------------------------------ the weights
Deno.test("WO-043/W1 the weights in career_mail.ts are what mail-fit.ts fits from the tuning splits only", () => {
  eq(TUNING_SPLITS, ["tune", "tune2", "dev3", "dev4"]);
  assert(tuningMails().every((m) => TUNING_SPLITS.includes(m.split)), "only tuning splits are read");
  assert(!tuningMails().some((m) => ["devcheck", "holdout", "blind40", "dev4check"].includes(m.split)), "no held-out split");
  const r = fit();
  eq(r.bias, Object.fromEntries(Object.entries(MAIL_BIAS)), "the bias is the fitted one");
  eq(r.weights, Object.fromEntries(Object.entries(MAIL_WEIGHTS)), "every weight is the fitted one (run mail-fit.ts --write)");
});

Deno.test("WO-043/W2 offline and deterministic: no network, no model, no clock in the classifier", () => {
  const code = SRC.split("\n").filter((l) => !/^\s*\/\//.test(l)).join("\n");
  assert(!/\bfetch\(|Deno\.env|openai|anthropic|Math\.random|Date\.now\(\)/i.test(code.slice(0, code.indexOf("export interface TrackedApp"))), "the classifier is pure");
  eq(normText("We WON'T be moving forward;\nwe're sorry"), "we will not be moving forward;. we are sorry");
});

// ------------------------------------------------------------------------------------------------ generalisation
Deno.test("WO-043/G1 a rejection is read however it is worded: negated progress, someone else chosen, the role closed, declined", () => {
  for (const snippet of [
    "We appreciate your interest, but we've opted for applicants whose skills align more closely with the role.",
    "The hiring team has concluded its review and you have not been progressed.",
    "We're afraid we can't move ahead with you at this point.",
    "After much deliberation, the position has been offered to someone else.",
    "Your application for Data Analyst has been declined.",
    "Your application was reviewed and it was decided not to take it further.",
    "We regret to say the Data Analyst role will not be filled this year due to budget changes.",
    "Thank you for interviewing with us. Unfortunately we have made the difficult decision to not extend an offer.",
  ]) eq(kind(ATS, "Acme | Data Analyst", snippet), "rejection", snippet);
});

Deno.test("WO-043/G2 the other kinds in wordings no rule lists", () => {
  eq(kind(ATS, "Data Analyst", "Hi! Your application is in our system and a recruiter will review it shortly."), "received");
  eq(kind(ATS, "Data Analyst", "We'd love to learn more about you! Pick a 30-minute slot to meet our hiring manager."), "interview");
  eq(kind(ATS, "Data Analyst - next round", "Congrats on passing the screen. Next is a 2-hour virtual panel with the analytics team. Send me your availability."), "interview");
  eq(kind(ATS, "Data Analyst - quick exercise", "Before we talk again, we'd like you to try a short data exercise. Return it by Friday."), "assessment");
  eq(kind(ATS, "Welcome to Acme!", "We are thrilled to welcome you as our new Data Analyst. Please review and sign your offer by Monday."), "offer");
  eq(kind("Sam Park <sam.park@acme.com>", "Re: Data Analyst", "Sorry for the delay! You're still in consideration; the hiring manager was out sick."), "recruiter_reply");
});

// ------------------------------------------------------------------------------------------------ safety
Deno.test("WO-043/S1 the worst error: words that decide against the person are never an interview (or any other forward step)", () => {
  for (const snippet of [
    "After reviewing your application with care, we are not able to invite you to the first round of interviews.",
    "Thanks for your time last week. We are not able to move forward to the onsite, but we would love to keep you in mind.",
    "Kindly note that your candidature has not been shortlisted for the further rounds of interview.",
    "We will not be scheduling an interview for the Data Analyst role.",
    "Unfortunately, we've made the difficult decision to not extend an offer.",
    // A rejection that offers a feedback call: the interview words outweigh the rejection's, and code still says no step.
    "Unfortunately we won't be moving you to the onsite interview. Please book a time with your recruiter on Tuesday at 2pm for feedback.",
    "We have decided not to proceed. You are still welcome to schedule a 30 minute call with the hiring manager to hear feedback; pick a time below.",
  ]) {
    const k = kind(ATS, "Your interview", snippet);
    assert(k === "rejection" || k === "other", `${snippet} -> ${k}`);
  }
});

Deno.test("WO-043/S2 conditions and other people's outcomes are not decisions", () => {
  for (const snippet of [
    "Thanks for applying to Acme. If you are not selected for an interview, we will keep your resume on file for future openings.",
    "Candidates who are not selected will be notified by email. We review every application within two weeks.",
    "Your application will not be considered complete until you finish the questionnaire in your candidate portal.",
  ]) {
    const k = kind(ATS, "Your Acme application", snippet);
    assert(k !== "rejection" && k !== "interview", `${snippet} -> ${k}`);
  }
});

Deno.test("WO-043/S3 an offer talked about is never an interview; a call is an interview only about the application", () => {
  const k = kind("Dana Cole <dana@acme.com>", "Great news from Acme", "We want you to join us as Product Designer. I've attached the offer details; let's set up a call to go through them.");
  assert(k === "offer" || k === "other", `offer talk -> ${k}`);
  for (const [subject, snippet] of [
    ["Offer call", "Let's set up a call with the hiring manager to walk through your offer letter next week. Please pick a time on Tuesday or Wednesday."],
    ["Next steps", "Congratulations on the offer! Please schedule your onboarding call with the team at 10am on Monday; choose a time slot."],
  ]) {
    const o = kind(ATS, subject, snippet);
    assert(o === "offer" || o === "other", `${snippet} -> ${o}`);
  }
  eq(kind("\"Ana Cruz\" <acruz@acme.com>", "Hello from Acme", "I'm a recruiter at Acme. We're hiring engineers and I'd love to set up a call."), "other", "a sourcer's call");
  eq(kind("\"Ana Cruz\" <acruz@acme.com>", "Data Analyst - next steps", "Hi Sam, I'd like to set up a 20 min call this week about the Data Analyst role. Here's my calendar."), "interview", "the same call about the application");
});

Deno.test("WO-043/S4 a kind needs its own words: a sender and a thank-you alone never say no", () => {
  const k = kind("Hilton <hilton@taleo.net>", "Hilton - Thank you", "Thank you for submitting your candidacy for Front Desk Agent. We appreciate your interest.");
  assert(k === "received" || k === "other", `a thank-you from an ATS -> ${k}`);
  for (const [subject, snippet] of [["Acme", "Hi Sam, thanks for your patience. We have news about the Account Manager role; please see the portal."], ["Application status", "There has been an update to your application. Please sign in to view it."]]) {
    eq(kind(ATS, subject, snippet), "other", snippet);
  }
});

Deno.test("WO-043/S5 look-alikes stay 'other': gigs, trusted-traveler and visa interviews, admissions, volunteering, press, vendor promos", () => {
  for (const [from, subject, snippet] of [
    ["Upwork <donotreply@upwork.com>", "You have a new invitation to interview", "A client invited you to interview for the job 'Build a landing page'."],
    ["CBP <noreply@cbp.dhs.gov>", "Global Entry application update", "Your Global Entry application is conditionally approved. Please schedule an interview at an enrollment center."],
    ["Graduate Admissions <gradadm@school.edu>", "Your application to the MS program", "Thank you for your application. We have received all of your materials and it is under review."],
    ["Peace Corps <volunteer@peacecorps.gov>", "Your volunteer application", "Thank you for your volunteer application. We will contact you to schedule a placement interview."],
    ["Ana Lopez <ana.lopez@npr.org>", "Interview request", "I'm a producer working on a story about new grads and would love to interview you this week."],
    ["CodeSignal <noreply@codesignal.com>", "Practice for your next technical interview", "Get interview-ready with 100+ practice questions. Start practicing for free."],
  ]) eq(kind(from, subject, snippet), "other", subject);
});

Deno.test("WO-043/S6 whatever the weights say: code keeps the safety rules (weights inflated on purpose, then restored)", () => {
  const keep = JSON.parse(JSON.stringify(MAIL_WEIGHTS));
  try {
    MAIL_WEIGHTS["s:ats"] = { ...MAIL_WEIGHTS["s:ats"], rejection: 20 };
    MAIL_WEIGHTS["iv:schedule"] = { ...MAIL_WEIGHTS["iv:schedule"], interview: 20 };
    // No words of no: never a rejection, however heavy the sender's weight.
    assert(kind(ATS, "Acme", "We appreciate your interest in Acme.") !== "rejection", "a sender alone said no");
    // Words that decide against the person: never an interview, however heavy the scheduling weight.
    const k = kind(ATS, "Acme", "We have decided not to proceed with your application. Feel free to schedule time with your recruiter for feedback.");
    assert(k === "rejection" || k === "other", `a rejection read as ${k}`);
    // An offer talked about: never an interview.
    const o = kind(ATS, "Offer call", "Please schedule a call to walk through your offer letter.");
    assert(o === "offer" || o === "other", `an offer call read as ${o}`);
  } finally {
    for (const k of Object.keys(MAIL_WEIGHTS)) delete MAIL_WEIGHTS[k];
    Object.assign(MAIL_WEIGHTS, keep);
  }
});
