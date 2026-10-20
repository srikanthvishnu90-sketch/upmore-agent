// WO-045: the mail tracker reads interviews, recruiter replies and employer names that WO-043 missed on the architect's
// blind160, without weakening a safety rule. dev5 (253 SYNTHETIC emails, labeled and committed before the classifier
// change; dev5check a fixed-seed quarter scored once), floors on blind160 and dev5check, every blind160 miss WO-045 fixed
// pinned as a case, and the guards: decided-against words are never an interview, an offer said not to be made is not an
// offer, a calendar tool's notice is never the employer, look-alikes stay "other", and employer aliases are matching data
// only. Offline: no model, no network.
// Run: deno test --no-check tests/architect/wo-045-mail-interviews.test.ts
import { classifyMail, fromEmployer, MAIL_WEIGHTS, mailFeatures, planUpdates, sameCompany } from "../../supabase/functions/_shared/career_mail.ts";
import { dev4Splits, dev5Splits, evaluate, SEALED, splitsOf } from "../../evals/career/mail-eval.ts";
import { tuningMails } from "../../evals/career/mail-fit.ts";
import labels from "../../evals/career/mail-labels.json" with { type: "json" };
import dev4 from "../../evals/career/mail-dev4.json" with { type: "json" };
import blind200 from "../../evals/career/mail-blind200.json" with { type: "json" };
import dev5 from "../../evals/career/mail-dev5.json" with { type: "json" };
import blind160 from "../../evals/career/mail-blind160.json" with { type: "json" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const read = (from: string, subject: string, snippet: string) => classifyMail({ from, subject, snippet, date: "2026-10-20T15:00:00Z" });
const kind = (from: string, subject: string, snippet: string) => read(from, subject, snippet).kind;
const ATS = "Acme <no-reply@hire.lever.co>";

// ------------------------------------------------------------------------------------------------ the sets
Deno.test("WO-045/E1 dev5: 250+ synthetic labeled emails, split by a fixed seed, disjoint from every older set; dev5check is sealed and never fitted on", () => {
  const fnv = (s: string) => { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  assert(dev5.synthetic === true && dev5.mails.length >= 250, `at least 250 synthetic emails, got ${dev5.mails.length}`);
  for (const m of dev5.mails) {
    eq(m.split, fnv(m.id + "wo-045-seed-20261020") % 4 === 0 ? "dev5check" : "dev5", `${m.id} split by the seed`);
    assert(/synthetic/i.test(String(m.origin)) && /^F\d{3}$/.test(m.id), `${m.id} is marked synthetic`);
  }
  const older = new Set([...labels.mails, ...dev4.mails, ...blind160.mails].map((m) => m.id));
  assert(!dev5.mails.some((m) => older.has(m.id)), "no dev5 id is in an older set");
  const d = dev5Splits();
  eq(d.dev5.length + d.dev5check.length, dev5.mails.length, "every dev5 email is in exactly one of dev5 and dev5check");
  assert(d.dev5check.length >= 0.2 * dev5.mails.length, "dev5check is about a quarter");
  assert(SEALED.includes("dev5check") && SEALED.includes("blind160"), "dev5check and blind160 print only when named");
  assert(!tuningMails().some((m) => ["dev5", "dev5check", "blind160"].includes(m.split)), "the weights are fitted on the WO-043 tuning splits only");
});

Deno.test("WO-045/E2 the splits read for misses hold the target, with no rejection ever read as an interview", () => {
  for (const [name, mails] of [["dev", splitsOf(labels.mails as any).dev], ["dev4", dev4Splits().dev4], ["dev5", dev5Splits().dev5]] as const) {
    const r = evaluate(mails as any);
    assert(r.status.precision >= 0.97 && r.status.recall >= 0.95, `${name} ${JSON.stringify(r.status)}`);
    eq(r.confusions.rejection_as_interview, 0, `${name}: a rejection read as an interview`);
  }
});

Deno.test("WO-045/E3 blind160 never drops below its WO-043 floor, nor below WO-045's score (spent: WO-045 read its misses)", () => {
  // WO-043 floor (scored blind on 2640e546): 94.9% / 93.3%. WO-045 (rules written while reading its misses, so a tuned
  // number now, not a blind one): 100.0% (119/119) / 99.2% (119/120). The one miss left is S017, a Google Calendar notice:
  // a calendar tool is never the employer (WO-040 review B3), on purpose.
  const r = evaluate(blind160.mails as any);
  assert(r.status.precision >= 0.949 && r.status.recall >= 0.933, `blind160 under the WO-043 floor ${JSON.stringify(r.status)}`);
  assert(r.status.precision >= 0.99 && r.status.recall >= 0.99, `blind160 under the WO-045 floor ${JSON.stringify(r.status)}`);
  eq(r.confusions.rejection_as_interview, 0, "blind160: a rejection read as an interview");
  assert(r.company.accuracy >= 0.99, `blind160 employer names ${JSON.stringify(r.company)}`);
});

Deno.test("WO-045/E4 dev5check is a floor at its one-time score (VERIFIED at 57ff0d24), not a goal", () => {
  // Scored once, after the classifier commit: 92.0% (46/50) precision, 90.2% (46/51) recall, no rejection read as an
  // interview (trunk 55e5a61f: 87.8% / 84.3%). Below the 97% / 95% target. A regression floor only; never tune on it.
  const r = evaluate(dev5Splits().dev5check as any);
  assert(r.status.precision >= 0.92 && r.status.recall >= 0.90, `dev5check ${JSON.stringify(r.status)}`);
  eq(r.confusions.rejection_as_interview, 0, "dev5check: a rejection read as an interview");
});

// ------------------------------------------------------------------------------------------------ blind160, pinned
const B = new Map((blind160.mails as any[]).map((m) => [m.id, m]));
const pin = (id: string) => { const m = B.get(id)!; return { m, c: classifyMail(m) }; };

Deno.test("WO-045/B1 the blind160 interviews WO-043 missed: a reschedule, a vendor-scheduled live interview, a founder's coffee", () => {
  for (const id of ["S148", "S160", "S159"]) {
    const { m, c } = pin(id);
    eq(c.kind, "interview", `${id} ${m.subject}`);
    assert(sameCompany(c.company, m.expect.company), `${id} employer ${c.company}`);
  }
  // A calendar tool's notice is never the employer's words, even when it names the employer's desk (WO-040 review B3).
  eq(pin("S017").c.kind, "other", "S017 Google Calendar notice");
});

Deno.test("WO-045/B2 the blind160 recruiter replies and receipts WO-043 missed: AW:, a quick update, Re: checking in, a founder's receipt", () => {
  for (const [id, want] of [["S086", "recruiter_reply"], ["S110", "recruiter_reply"], ["S124", "recruiter_reply"], ["S117", "received"]] as const) {
    const { m, c } = pin(id);
    eq(c.kind, want, `${id} ${m.subject}`);
    assert(sameCompany(c.company, m.expect.company), `${id} employer ${c.company}`);
  }
  // A reply in the languages recruiters write in is a reply ("AW:", "SV:", "R:", "RES:").
  for (const subject of ["AW: Bewerbung Data Analyst", "SV: Ansökan Supply Planner", "R: Candidatura Ingegnere", "RES: Vaga Analista"]) {
    eq(mailFeatures({ from: "Lena Fischer <lena.fischer@sap.com>", subject, snippet: "Hello, a short note.", date: "2026-10-20T15:00:00Z" })?.has("s:re"), true, subject);
  }
});

Deno.test("WO-045/B3 the blind160 look-alikes WO-043 read as a status stay 'other'", () => {
  // An adoption application, a card decline, a candidate-experience survey, a practice site's challenge, a sales follow-up.
  for (const id of ["S023", "S106", "S030", "S045", "S065"]) eq(pin(id).c.kind, "other", `${id} ${B.get(id).subject}`);
});

Deno.test("WO-045/B4 the blind160 employer names WO-043 got wrong", () => {
  for (const [id, want] of [["S006", "Wipro"], ["S025", "Tata Consultancy Services"], ["S048", "Loom"], ["S095", "Lockheed Martin"], ["S096", "Linear"], ["S112", "Canva"], ["S127", "Baylor Scott & White"]]) {
    const { c } = pin(id);
    assert(c.kind !== "other" && sameCompany(c.company, want), `${id}: ${c.kind} ${c.company}, want ${want}`);
  }
});

// ------------------------------------------------------------------------------------------------ safety
Deno.test("WO-045/S1 words that decide against the person are never an interview, in calendar subjects, reschedules and vendor mail too", () => {
  for (const [from, subject, snippet] of [
    ["Maya Chen <maya.chen@ramp.com>", "Updated invitation: Interview Ramp", "We moved your interview to Thursday. Update: unfortunately the team has decided not to proceed with your application, so it is cancelled."],
    ["Acme Recruiting <recruiting@acme.com>", "Rescheduled: your Acme interview", "Hi Sam, we rescheduled your interview to Monday at 2pm. Later today the role was filled internally, so we are cancelling it. Sorry."],
    ["Karat Scheduling <scheduling@karat.io>", "Your Karat interview for Roblox", "Roblox has decided not to move forward with your application, so your Karat interview has been cancelled."],
    ["Nina Park <nina@rippling.com>", "Re: checking in", "Thanks for applying! Unfortunately we won't be moving you to the interview stage. Happy to hop on a call for feedback, pick a time."],
  ]) {
    const k = kind(from, subject, snippet);
    assert(k === "rejection" || k === "other", `${subject} -> ${k}`);
  }
  // Weights inflated on purpose: the earlier steps' evidence counted toward an interview never outvotes a "no".
  const keep = JSON.parse(JSON.stringify(MAIL_WEIGHTS));
  try {
    for (const f of ["iv:when", "iv:schedule", "rc:thanks", "s:person"]) MAIL_WEIGHTS[f] = { ...MAIL_WEIGHTS[f], interview: 20, received: 20, recruiter_reply: 20 };
    const k = kind("Dana Cole <dana.cole@acme.com>", "Updated: Acme interview - new time", "Thanks for applying. We have decided not to proceed, so Tuesday's interview at 2pm is cancelled.");
    assert(k === "rejection" || k === "other", `inflated weights -> ${k}`);
  } finally {
    for (const k of Object.keys(MAIL_WEIGHTS)) delete MAIL_WEIGHTS[k];
    Object.assign(MAIL_WEIGHTS, keep);
  }
});

Deno.test("WO-045/S2 an offer said not to be made is a rejection, never an offer; an offer talked about is still never an interview", () => {
  eq(kind("Duolingo <no-reply@greenhouse.io>", "Following up on your Duolingo application", "Hi Jordan, thanks for your time in the interview process. This was a tough call, but we won't be extending an offer for this role."), "rejection");
  eq(kind(ATS, "Acme", "We will not be extending you an offer for the Analyst role."), "rejection");
  const o = kind("Sophie at Loom <sophie@loom.com>", "Offer call", "Let's set up a call to go through your offer letter on Tuesday at 2pm.");
  assert(o === "offer" || o === "other", `offer talk -> ${o}`);
});

Deno.test("WO-045/S3 'the hiring team' is a group of people, not a hire: a negation about it decides nothing", () => {
  eq(kind(ATS, "Your Acme interview is confirmed", "Your interview with Acme is confirmed for Tuesday at 2pm. Your answers on the prep form will not be shared with the hiring team."), "interview");
});

Deno.test("WO-045/S4 a kind still needs its own words: a thank-you or a receipt never becomes an interview", () => {
  for (const [from, subject, snippet] of [
    ["Ben Hoffman <ben@quillbase.io>", "got your application", "Just confirming we got your application for the founding engineer role. Thanks for your patience!"],
    [ATS, "Thanks for applying to Acme", "Thanks for applying! We have received your application and will be in touch."],
  ]) {
    const k = kind(from, subject, snippet);
    assert(k === "received", `${subject} -> ${k}`);
  }
});

Deno.test("WO-045/S5 look-alikes stay 'other': foster and adoption, card decisions, surveys, practice games, sales sequences, calendar notices", () => {
  for (const [from, subject, snippet] of [
    ["Happy Tails <adopt@happytails.org>", "Thanks for applying to foster", "We got your foster application and will reach out to schedule a home visit."],
    ["Capital One <capitalone@notification.capitalone.com>", "An update on your application", "We need a little more information about your application before we can decide. Sign in to upload documents."],
    ["Chase <no.reply.alerts@chase.com>", "Update on your application", "We've reviewed your application for the Sapphire Preferred card and need more information."],
    ["Stripe <no-reply@greenhouse.io>", "Tell us about your candidate experience", "Thank you for interviewing with Stripe. Please take 3 minutes; your answers won't be shared with the hiring team."],
    ["LeetCode <no-reply@leetcode.com>", "Daily Coding Challenge", "Today's challenge is ready. Solve it to keep your 30-day streak and climb the leaderboard."],
    ["Kevin Tran <kevin@pipeline-outreach.io>", "Re: quick question", "Following up - are you the right person to talk to about outbound? Teams book 30% more meetings with us."],
    ["Anna <anna@saasco.io>", "Re: our call", "Thanks for the call! I'll send over the proposal and pricing tomorrow."],
    ["Google Calendar <calendar-notification@google.com>", "Updated invitation: Interview - Stripe @ Thu", "Stripe Recruiting has invited you to Interview. Join with Google Meet."],
  ]) eq(kind(from, subject, snippet), "other", subject);
});

Deno.test("WO-045/S6 employer names: desks and 'X at Y' name the company; aliases are matching data, never a looser sender check", () => {
  const co = (from: string, subject: string, snippet: string) => read(from, subject, snippet).company;
  eq(co("Hiring Team at Canva <no-reply@ashbyhq.com>", "Canva | Data Analyst", "Thanks for applying to the Data Analyst role! We have received your application."), "Canva");
  eq(co("Talent Acquisition | Deloitte <talent@deloitte.com>", "Interview invitation", "We are pleased to invite you to the first round interview for Consulting Analyst. Please select a slot."), "Deloitte");
  eq(co("Linear Hiring <no-reply@ashbyhq.com>", "Application received: Linear", "This email confirms we've received your application."), "Linear");
  eq(co("TCS Careers <careers.tcs@tcs.com>", "Regarding your application", "We regret to inform you that your profile has not been shortlisted."), "Tata Consultancy Services");
  // An ATS tenant stays a tenant: "Delta Air Lines <delta@myworkday.com>" is Delta, not a person at Workday.
  eq(co("Delta Air Lines <delta@myworkday.com>", "Your Delta application", "Thank you for applying. Your application has been received."), "Delta Air Lines");
  // A desk's name with no company in it names nobody; the employer's own domain does.
  assert(sameCompany(co("HR Department <hr.onboarding@infosys.com>", "Offer Letter", "We are pleased to offer you the position of Systems Engineer. Your offer letter is attached."), "Infosys"), "HR Department");
  // Aliases decide nothing about the sender: tcs.xyz is not Tata Consultancy Services' mail.
  const c = read("TCS Careers <careers@tcs.xyz>", "Offer letter", "We are pleased to offer you the position of Java Developer. Your offer letter is attached.");
  const auth = ["mx.google.com; dmarc=pass header.from=tcs.xyz"];
  eq(fromEmployer(c, { company: "Tata Consultancy Services" }, "TCS Careers <careers@tcs.xyz>", auth), false, "tcs.xyz is not TCS");
  eq(fromEmployer(read("TCS Careers <careers@tcs.com>", "Offer letter", "We are pleased to offer you the position of Java Developer. Your offer letter is attached."), { company: "Tata Consultancy Services" }, "TCS Careers <careers@tcs.com>", ["mx.google.com; dmarc=pass header.from=tcs.com"]), true, "tcs.com is TCS");
});

Deno.test("WO-045/S7 a calendar tool's interview notice moves no application", () => {
  const mail = { hash: "h1", from: "Google Calendar <calendar-notification@google.com>", subject: "Invitation: Interview: Jordan Lee / Duolingo – Hiring Manager @ Thu Mar 5, 2026 11am", snippet: "Duolingo Recruiting has invited you to Interview: Jordan Lee / Duolingo – Hiring Manager.", date: "2026-03-01T10:00:00Z" };
  const plan = planUpdates([mail], [{ ref: "q:1", company: "Duolingo", role: "Data Scientist", stage: "Submitted", source: "queue", applied_at: "2026-02-01T00:00:00Z" }], Date.parse("2026-03-02T00:00:00Z"));
  eq(plan.events.length, 0, "no event from a calendar notice");
  eq(plan.apps[0].stage, "Submitted");
});

Deno.test("WO-045/E9 blind200, written by an agent that never read the classifier, is a floor at its one-time score", () => {
  // Architect review, 2026-10-20: 200 SYNTHETIC emails (160 status; 27 in Spanish, Portuguese, French or German), sealed
  // (sha256 0b5f8fed...) and scored once. Trunk 55e5a61f: 98.4% / 77.5%. This branch (22d0ccf3): 99.2% (129/130)
  // precision, 80.6% (129/160) recall; English 100.0% / 91.9%, the 27 others 83.3% / 20.0%. Far below 97/95.
  assert(SEALED.includes("blind200"), "blind200 prints only when named");
  const r = evaluate(blind200.mails as any);
  assert(r.status.precision >= 0.992 && r.status.recall >= 0.806, `blind200 ${JSON.stringify(r.status)}`);
  assert(r.confusions.rejection_as_interview === 0, "blind200: a rejection read as an interview");
});
