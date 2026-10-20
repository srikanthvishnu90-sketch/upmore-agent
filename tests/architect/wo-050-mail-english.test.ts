// WO-050: the mail tracker reads the English shapes blind240 and dev6check missed: scheduling tools' confirmations that
// name the employer and the job, reschedules and reminders, a hiring manager's terse "are you free Thursday?", onsite
// logistics, "next steps", assessment centres, one-way video and vendors' tests, agency and contract offers, DocuSign
// envelopes, rejections that mention interviews or next steps, requisition closures, and recruiter replies that decide
// nothing. dev7 (301 SYNTHETIC emails, labeled and committed before the classifier change; dev7check a fixed-seed quarter
// scored once), floors on blind240 and dev7check, per-family cases, and the guards: a rejection is never an interview, a
// calendar notice without the job stays "other", and a scheduling tool's mail is the employer's word only when it names
// the employer and the job. Offline: no model, no network. Labels and mail here are SYNTHETIC.
// Run: deno test --no-check tests/architect/wo-050-mail-english.test.ts
import { classifyMail, fromEmployer, MAIL_WEIGHTS, mailFeatures, planUpdates, sameCompany, type TrackedApp } from "../../supabase/functions/_shared/career_mail.ts";
import { dev7Splits, evaluate, SEALED } from "../../evals/career/mail-eval.ts";
import { TUNING_SPLITS, tuningMails } from "../../evals/career/mail-fit.ts";
import labels from "../../evals/career/mail-labels.json" with { type: "json" };
import dev4 from "../../evals/career/mail-dev4.json" with { type: "json" };
import dev5 from "../../evals/career/mail-dev5.json" with { type: "json" };
import dev6 from "../../evals/career/mail-dev6.json" with { type: "json" };
import dev7 from "../../evals/career/mail-dev7.json" with { type: "json" };
import blind160 from "../../evals/career/mail-blind160.json" with { type: "json" };
import blind200 from "../../evals/career/mail-blind200.json" with { type: "json" };
import blind240 from "../../evals/career/mail-blind240.json" with { type: "json" };

function eq(a: unknown, b: unknown, m = "") {
  const x = JSON.stringify(a), y = JSON.stringify(b);
  if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`);
}
function assert(v: unknown, m = "assertion failed"): asserts v {
  if (!v) throw new Error(m);
}
const DATE = "2026-10-20T15:00:00Z";
const read = (from: string, subject: string, snippet: string) => classifyMail({ from, subject, snippet, date: DATE });
const kind = (from: string, subject: string, snippet: string) => read(from, subject, snippet).kind;
const app = (ref: string, company: string, stage: string, extra: Partial<TrackedApp> = {}): TrackedApp => ({ ref, company, stage, source: "queue", applied_at: "2026-09-01T00:00:00Z", ...extra });
const NOW = Date.parse("2026-10-21T00:00:00Z");
const GCAL = "Google Calendar <calendar-notification@google.com>";

// ------------------------------------------------------------------------------------------------ the sets
Deno.test("WO-050/E1 dev7: 300+ synthetic labeled emails, English-heavy with 40+ in the six languages, split by a fixed seed; dev7check is sealed and never fitted on", () => {
  const fnv = (s: string) => { let h = 0x811c9dc5; for (const b of new TextEncoder().encode(s)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; } return h; };
  const mails = dev7.mails as any[];
  assert(dev7.synthetic === true && /SYNTHETIC/.test(dev7.note) && mails.length >= 300, `at least 300 synthetic emails, got ${mails.length}`);
  for (const m of mails) {
    eq(m.split, fnv(m.id + "wo-050-seed-20261020") % 4 === 0 ? "dev7check" : "dev7", `${m.id} split by the seed`);
    assert(/synthetic/i.test(String(m.origin)) && /^Y\d{3}$/.test(m.id), `${m.id} is marked synthetic`);
    assert(["en", "es", "pt", "fr", "de", "it", "nl"].includes(m.lang) && typeof m.family === "string", `${m.id} names its language and family`);
  }
  const english = mails.filter((m) => m.lang === "en").length;
  assert(english >= 0.8 * mails.length && mails.length - english >= 40, `English-heavy with 40+ others: ${english} of ${mails.length}`);
  // The families the order names are all there.
  for (const fam of ["sched", "resched", "terse", "onsite", "nextsteps", "acentre", "oneway", "vendor", "agency_offer", "docusign", "rej_iv", "req_closed", "rr", "rr_agency", "received", "lookalike"]) {
    assert(mails.filter((m) => m.family === fam).length >= 3, `3+ of family ${fam}`);
  }
  const older = new Set([...labels.mails, ...dev4.mails, ...dev5.mails, ...dev6.mails, ...blind160.mails, ...blind200.mails, ...blind240.mails].map((m: any) => m.id));
  assert(!mails.some((m) => older.has(m.id)), "no dev7 id is in an older set");
  const d = dev7Splits();
  eq(d.dev7.length + d.dev7check.length, mails.length, "every dev7 email is in exactly one of dev7 and dev7check");
  assert(d.dev7check.length >= 0.2 * mails.length, "dev7check is about a quarter");
  assert(SEALED.includes("dev7check"), "dev7check prints only when named");
  // The fit's splits are unchanged (WO-043/W1): dev7 informs the word families, never the weights.
  eq(TUNING_SPLITS, ["tune", "tune2", "dev3", "dev4"]);
  assert(!tuningMails().some((m) => ["dev7", "dev7check", "blind240"].includes(m.split)), "the weights are fitted on the WO-043 tuning splits only");
});

Deno.test("WO-050/E2 dev7 (read for misses) holds the target, with no rejection ever read as an interview", () => {
  // VERIFIED at the WO-050 classifier commit: 99.5% (184/185) / 97.4% (184/189); branch point 94.7% / 75.1%.
  const r = evaluate(dev7Splits().dev7 as any);
  assert(r.status.precision >= 0.97 && r.status.recall >= 0.95, `dev7 ${JSON.stringify(r.status)}`);
  eq([r.confusions.rejection_as_interview, r.confusions.status_as_other_status], [0, 0], "dev7 confusions");
});

Deno.test("WO-050/E3 blind240 (spent: WO-050 read its misses) holds WO-050's score, English included", () => {
  // Branch point (WO-046): 99.4% (171/172) / 89.1% (171/192). WO-050: 99.5% (189/190) / 98.4% (189/192). A tuned number now,
  // not a blind one. WO-046/E9 keeps the blind floor.
  const r = evaluate(blind240.mails as any);
  assert(r.status.precision >= 0.994 && r.status.recall >= 0.984, `blind240 ${JSON.stringify(r.status)}`);
  eq(r.confusions.rejection_as_interview, 0, "blind240: a rejection read as an interview");
});

Deno.test("WO-050/E4 dev7check is a floor at its one-time score (VERIFIED at d48735f4), not a goal", () => {
  // Scored once, after the classifier commit, in one run with the branch point: 454cb215 97.9% (46/47) / 76.7% (46/60);
  // d48735f4 100.0% (52/52) / 86.7% (52/60), no rejection read as an interview, no status read as another. Recall is below
  // the 95% target. Its misses were read after the score and not fixed. A regression floor only; never tune on it.
  const r = evaluate(dev7Splits().dev7check as any);
  assert(r.status.precision >= 0.999 && r.status.recall >= 0.866, `dev7check ${JSON.stringify(r.status)}`);
  eq([r.confusions.rejection_as_interview, r.confusions.status_as_other_status], [0, 0], "dev7check confusions");
});

// ------------------------------------------------------------------------------------------------ families
Deno.test("WO-050/F1 a scheduling tool's confirmation that names the employer and the job is an interview with that employer, never the tool", () => {
  for (const [from, subject, snippet, co] of [
    ["\"Snowflake Recruiting via GoodTime\" <scheduling@goodtime.io>", "Your Snowflake interview is confirmed", "Hi Priya, your virtual onsite for Senior Data Engineer is confirmed for Thursday, 9:30am PT.", "Snowflake"],
    ["\"ModernLoop\" <no-reply@modernloop.io>", "Interview confirmed: Instacart - Machine Learning Engineer, Ads", "Hi Theo, your interview with Instacart has been confirmed for Wed, 11:00 AM PT with Rohan Mehta.", "Instacart"],
    ["\"Gusto Recruiting via ModernLoop\" <scheduling@modernloop.io>", "Gusto - your panel for Senior Accountant is booked", "Hi Erin, we've booked your panel for the Senior Accountant role: Tue, 1:00-3:30 PM MT.", "Gusto"],
    ["\"Discord via Gem\" <no-reply@gem.com>", "Discord: schedule your recruiter call (Staff Product Manager)", "Hi Alexis, use the link below to book a 30-minute call with Megan from our recruiting team about Staff Product Manager.", "Discord"],
    ["\"Plaid Recruiting via Prelude\" <scheduling@prelude.co>", "Plaid: confirm your interview - Product Manager, Credit", "Hi Grace, your interview for Product Manager, Credit is set for Tue, 3:00 PM PT. Please confirm.", "Plaid"],
    ["\"Olivia from Taco Bell\" <tacobell@paradox.ai>", "Your interview at Taco Bell is confirmed", "Hi Marco! Your interview for Shift Lead is confirmed for Friday at 3:30 PM. Reply 1 to confirm.", "Taco Bell"],
    ["\"Ramp\" <no-reply@ashbyhq.com>", "Interview confirmed: Ramp - Software Engineer, Payments", "Hi Chris, your interview for Software Engineer, Payments is confirmed for Thursday at 10:00 AM ET.", "Ramp"],
  ]) {
    const c = read(from, subject, snippet);
    eq(c.kind, "interview", subject);
    assert(sameCompany(c.company, co), `${subject}: employer ${c.company}, want ${co}`);
    eq(c.via, undefined, `${subject}: the employer's word, not a calendar's`);
  }
});

Deno.test("WO-050/F2 reschedules, reminders, onsite logistics, next steps and assessment centres are interviews", () => {
  for (const [from, subject, snippet] of [
    ["Chewy Talent Acquisition <talent@chewy.com>", "Moving your Thursday interview", "Hi Kayla, we need to shift your interview for Pharmacy Operations Supervisor to 2:30 PM on Thursday instead of 11:00 AM."],
    ["Kara Whitfield <kara.whitfield@okta.com>", "New time for Thursday", "Hi Ben, would it be OK to push our chat with the hiring manager to 3pm instead of 1pm Thursday? Same link."],
    ["Capital One Recruiting <recruiting@capitalone.com>", "Change to your Power Day schedule", "Hello Arjun, your Power Day for Associate, Product Manager has moved to Wednesday, December 2."],
    ["Chewy Talent Acquisition <talent@chewy.com>", "Reminder: Interview tomorrow at 11:00 AM", "Hi Taylor, just a reminder that your interview for Pharmacy Operations Supervisor at Chewy is tomorrow at 11:00 AM ET."],
    ["Chewy Careers <careers@chewy.com>", "Reminder", "Hi Taylor, a reminder about your interview on Thursday."],
    ["Acme <careers@acme.com>", "Interview reminder", "This is a reminder of your upcoming interview."],
    ["Meta Recruiting <recruiting@meta.com>", "Your onsite logistics - Menlo Park", "Hi Sarah, here are the details for your onsite on Tuesday: arrive at MPK 21 by 9:30 AM and check in at the front desk."],
    ["Boeing Talent Acquisition <talentacquisition@boeing.com>", "What to expect on your interview day", "Hi Leo, for your interview on Dec 1 at the Everett site: check in at Gate 4, three 45-minute interviews and a site tour."],
    ["Spotify <no-reply@smartrecruiters.com>", "Next steps for your application - Spotify", "Hi Leah, we'd like to invite you to the next stage for Data Scientist: a 45-minute conversation with the hiring manager."],
    ["KPMG Graduate Recruitment <graduaterecruitment@kpmg.co.uk>", "Invitation to our Assessment Centre", "Dear Amira, congratulations! We'd like to invite you to our virtual Assessment Centre for the Audit Graduate Programme, including a partner interview."],
  ]) eq(kind(from, subject, snippet), "interview", subject);
});

Deno.test("WO-050/F3 a hiring manager's or founder's terse ask is an interview; the same words about nothing applied to are not", () => {
  for (const [from, subject, snippet] of [
    ["Maya Chen <maya.chen@benchling.com>", "Thursday?", "Hi Sam, loved your take-home. Are you free Thursday for a chat with the team? 45 min, whenever suits you after 1pm."],
    ["Barry McCardel <barry@hex.tech>", "quick chat", "hey alex, saw your application for the analytics eng role. free tomorrow or friday for 20 min? happy to work around you"],
    ["Nina Park <nina.park@rippling.com>", "Re: Senior Recruiter role", "Thanks Ana! Want to grab 30 minutes with our Head of Talent this week? Let me know what works and I'll send an invite."],
    ["Rachel Gomez <rgomez@sweetgreen.com>", "Store manager role", "Hi Dante, I'm the area director. Can you come by the Union Square store Wednesday at 10 to meet me?"],
    ["Sara Lin <sara.lin@mixpanel.com>", "Re: Thanks for the call", "Great talking today! Next up I'd like you to meet Raj, our VP of Sales. Are you around Monday or Tuesday afternoon?"],
    // A reply whose own words lead, but which asks to meet and says nothing about where things stand, is an invitation.
    ["Sam Park <sam.park@acme.com>", "Re: Analyst role", "Thanks! I would like you to meet Raj."],
    ["Sara Lin <sara.lin@mixpanel.com>", "Re: Thanks for the call", "Next up I would like you to meet Raj, our VP of Sales."],
    ["Nina Alvarez <nina@harborloop.co>", "coffee next week?", "Hi Ola, loved your application for the ops lead role. Want to grab a coffee next week and talk through what we're building?"],
  ]) eq(kind(from, subject, snippet), "interview", subject);
  for (const [from, subject, snippet] of [
    ["Maya Chen <maya.chen@benchling.com>", "Thursday?", "Hi Sam, are you free Thursday for a chat with the team about the offsite planning? Want to lock the agenda before Friday."],
    ["Josh Reid <josh.reid@gmail.com>", "coffee next week?", "hey! back in town next week, free for coffee tuesday? would love to catch up"],
    ["Lena Park <lena.park@figma.com>", "Re: offsite", "Are you around Monday to talk through the offsite agenda? 20 min is enough."],
    ["Kim Lee <kim.lee@stripe.com>", "Thursday loop", "Hi Sam, can we move Thursday's interview with the backend candidate to 3pm? Same room."],
  ]) eq(kind(from, subject, snippet), "other", subject);
});

Deno.test("WO-050/F4 one-way video, vendors' tests, home tasks and paid trials are assessments; a live Karat interview stays an interview", () => {
  for (const [from, subject, snippet] of [
    ["\"Goldman Sachs via HireVue\" <noreply@hirevue.com>", "Goldman Sachs: your HireVue interview is ready", "Goldman Sachs invites you to complete a HireVue video interview for the Summer Analyst program. Record your answers by Nov 27."],
    ["HackerEarth <noreply@hackerearth.com>", "Flipkart Hiring Challenge - SDE-1", "Dear Candidate, you have been shortlisted for the online test for SDE-1 at Flipkart. Test window: 22 Nov 10:00 to 23 Nov 22:00 IST."],
    ["Revolut <no-reply@greenhouse.io>", "Revolut - Home task", "Hi Tim, thanks for the call. Please find the home task for the Product Owner position attached. Send it back within 4 days."],
    ["\"dev @ loopwork\" <dev@loopwork.app>", "before next steps", "hey jordan, before next steps could you do a small paid task for the backend role? 4h max, due friday"],
    ["Karat <noreply@karat.com>", "Robinhood: complete your Karat coding assessment", "Robinhood has partnered with Karat for its technical assessment for Software Engineer. Complete it within 7 days."],
  ]) eq(kind(from, subject, snippet), "assessment", subject);
  // WO-045/B1 pins blind160's "Schedule your Karat interview for Roblox" as an interview: a live Karat interview is one.
  eq(kind("Karat Scheduling <scheduling@karat.com>", "Schedule your live Karat interview for Pinterest", "Pinterest has partnered with Karat to run a live 60-minute technical interview with a Karat engineer. Pick a time."), "interview");
  // A vendor's own marketing is not a test.
  eq(kind("HackerRank <newsletter@hackerrank.com>", "New: 30 days of SQL challenge", "Join this month's challenge and climb the leaderboard."), "other");
});

Deno.test("WO-050/F5 agency and contract offers, DocuSign envelopes and revised offers are offers, with the client named as the employer", () => {
  for (const [from, subject, snippet, co] of [
    ["\"Amanda Ruiz | TEKsystems\" <aruiz@teksystems.com>", "Offer from Northrop Grumman - Network Engineer contract", "Hi Devon! Northrop Grumman extended you an offer: 12-month contract, $72/hr W2, start Oct 26. Let me know if you'd like to accept.", "Northrop Grumman"],
    ["\"Kevin Brooks | Insight Global\" <kbrooks@insightglobal.com>", "Great news - Cigna", "Hi Tara, Cigna wants you! They're offering the Business Analyst contract-to-hire at $55/hr, start date Nov 30. Can you confirm by end of day?", "Cigna"],
    ["\"Adecco Staffing\" <notifications@adeccousa.com>", "Assignment offer: Amazon Warehouse Associate", "Hi Luis, you've been offered a temp-to-hire assignment at Amazon (Warehouse Associate) starting Monday, $21/hr. Reply YES to accept.", "Amazon"],
    ["\"Plaid via DocuSign\" <dse_na2@docusign.net>", "Please DocuSign: Plaid Offer Letter - Jordan Kim", "Plaid sent you a document to review and sign. Offer Letter - Software Engineer, Data Platform.", "Plaid"],
    ["Grace Liu <grace.liu@nvidia.com>", "RE: Offer details - Deep Learning Engineer", "Hi Chris, attached is your updated NVIDIA offer reflecting the revised sign-on bonus we discussed. Please sign via the link by Friday.", "nvidia"],
    ["\"sam @ driftwood\" <sam@driftwood.ai>", "offer!!", "alex - we'd love to have you as driftwood's first designer. offer details attached: $145k + 0.6% equity. happy to jump on a call", "driftwood"],
  ]) {
    const c = read(from, subject, snippet);
    eq(c.kind, "offer", subject);
    assert(sameCompany(c.company, co), `${subject}: employer ${c.company}, want ${co}`);
  }
  // A lease or an NDA on DocuSign, a phone deal and an agency's job alert are not offers.
  for (const [from, subject, snippet] of [
    ["\"Greystar via DocuSign\" <dse_na2@docusign.net>", "Please DocuSign: Lease Agreement - 455 Pine St #4B", "Greystar sent you a document to review and sign: Residential Lease Agreement."],
    ["T-Mobile <offers@t-mobile.com>", "Your exclusive upgrade offer is here", "Hi Jordan, you're eligible for a new iPhone on us with a trade-in. This offer ends Sunday."],
    ["Hays <jobs@hays.com>", "12 new contract roles matching your profile", "Contract Data Analyst, Leeds, £400/day. View all jobs that match your search."],
  ]) eq(kind(from, subject, snippet), "other", subject);
});

Deno.test("WO-050/F6 rejections that mention interviews or next steps, requisition closures and an agency's relayed decision are rejections", () => {
  for (const [from, subject, snippet] of [
    ["\"Priya Shah | Hays\" <priya.shah@hays.com>", "Feedback from Arup", "Hi Tom, I've just heard back from Arup on the Senior Structural Engineer role - unfortunately they've decided not to take your application forward."],
    ["Monzo Talent <talent@monzo.com>", "Update on your Monzo application", "Hi Ama, thanks for the interviews with the team. We won't be offering you the role this time, but I'm happy to set up a 15-minute call to share feedback."],
    ["Coinbase Recruiting <no-reply@coinbase.com>", "Next steps for your Coinbase application", "Hi Dev, thanks for interviewing. Unfortunately there are no next steps for your candidacy for the Senior Software Engineer role."],
    ["Raj Gupta <rgupta@etsy.com>", "re: staff eng role", "hey Sam - honest answer: we're going to pass. the team wants someone with more search ranking depth."],
    ["Adobe Careers <adobe@myworkday.com>", "Update on requisition R154302", "Hello Pat, the requisition for Senior UX Researcher (R154302) has been closed and is no longer being filled."],
    ["Uber Recruiting <no-reply@uber.com>", "Update: Senior Data Scientist", "Hi Ahmed, due to a hiring freeze the Senior Data Scientist role will no longer be filled."],
  ]) eq(kind(from, subject, snippet), "rejection", subject);
});

Deno.test("WO-050/F7 recruiter replies that decide nothing are replies; a colleague's bare 'Re:' is not", () => {
  for (const [from, subject, snippet] of [
    ["\"Ben Carter | Aerotek\" <bcarter@aerotek.com>", "Re: Forklift Supervisor at Sysco", "Hi Taylor, thanks for sending your resume. Quick q - do you have your forklift cert and are you OK with 2nd shift?"],
    ["\"Michael Grant | Michael Page\" <michaelgrant@michaelpage.com>", "RE: Finance Manager - Diageo", "Hi Tom, I've sent your CV across to Diageo's hiring manager this morning and will chase for feedback early next week."],
    ["pete <pete@grainline.co>", "re: ops role", "thanks for the note! still going through applications for the ops role, tiny team so it's slow. will get back to you either way"],
    ["Aiden Murphy <aiden.murphy@fivetran.com>", "Re: Additional writing samples", "Hi Chris, thanks for the follow-up and the extra writing samples. I'll pass them along to the content team."],
    ["Kevin <kevin@brightwheel.com>", "Re: Thanks!", "Hey Jamie, appreciated your cover letter for the brightwheel role. Quick question: are you open to relocating to SF, or only remote?"],
  ]) eq(kind(from, subject, snippet), "recruiter_reply", subject);
  // The client the agency names is the employer.
  assert(sameCompany(read("\"Michael Grant | Michael Page\" <michaelgrant@michaelpage.com>", "RE: Finance Manager - Diageo", "I've sent your CV across to Diageo's hiring manager this morning.").company, "Diageo"), "Diageo");
  for (const [from, subject, snippet] of [
    ["Meera Iyer <meera.iyer@deloitte.com>", "Re: Q4 planning deck", "Thanks - I'll take a look tonight and send comments by tomorrow. Can you also share the latest headcount numbers?"],
    ["Ollie Grant <ollie.grant@stripe.com>", "Re: lunch Thursday?", "Sounds good! I'll grab a table at Tartine around 12:30. Bring the slides if you have them."],
    ["Taylor Brooks <taylor.brooks@notion.so>", "Re: candidate debrief", "Thanks all - for the PM candidate, I'm leaning no hire. Let's discuss in the debrief at 4."],
  ]) eq(kind(from, subject, snippet), "other", subject);
});

// ------------------------------------------------------------------------------------------------ guards
Deno.test("WO-050/G1 a rejection is never an interview: feedback calls, reschedule words, agency relays, replies, and with weights inflated on purpose", () => {
  const cases: [string, string, string][] = [
    ["Monzo Talent <talent@monzo.com>", "Update", "Thanks for the interviews. We won't be offering you the role, but happy to set up a call to go over feedback."],
    ["Nina Park <nina@rippling.com>", "Re: checking in", "Thanks for applying! Unfortunately we won't be moving you to the interview stage. Happy to hop on a call for feedback, pick a time."],
    ["Stripe <no-reply@greenhouse.io>", "Your interview", "We've had to cancel your onsite interview for Backend Engineer because the position has been filled."],
    ["\"Leo Grant | Randstad\" <leo.grant@randstadusa.com>", "Google update", "Hi Mia, Google got back to me - they went with another candidate for the Technical Writer contract. Free Thursday for a call about other roles?"],
    ["Peloton Recruiting via GoodTime <scheduling@goodtime.io>", "Your Peloton interview for Brand Marketing Manager", "Hi Claire, the team has decided not to move forward, so your interview for Brand Marketing Manager has been cancelled."],
    ["Natalie Fox <natalie.fox@getcruise.com>", "Re: next steps?", "Hi Rohan, the team decided to go with another candidate after the onsite. Are you free next week for a quick call?"],
  ];
  for (const [from, subject, snippet] of cases) assert(kind(from, subject, snippet) !== "interview", `never an interview: ${subject}`);
  const keep = JSON.parse(JSON.stringify(MAIL_WEIGHTS));
  try {
    for (const k of Object.keys(MAIL_WEIGHTS)) if (MAIL_WEIGHTS[k].interview !== undefined) MAIL_WEIGHTS[k].interview = 20;
    for (const [from, subject, snippet] of cases) assert(kind(from, subject, snippet) !== "interview", `never an interview, weights inflated: ${subject}`);
  } finally {
    for (const k of Object.keys(MAIL_WEIGHTS)) MAIL_WEIGHTS[k] = keep[k];
  }
  // A negation in a recruiter's update is not a decision said outright: never a rejection from a reply's own weights.
  assert(kind("Sam Park <sam.park@acme.com>", "Re: Data Analyst", "No decision yet - the team has not selected anyone, still interviewing this week. I'll keep you posted.") !== "rejection", "an update is not a rejection");
  assert(kind("Sam Park <sam.park@acme.com>", "Re: Data Analyst", "We have not scheduled the panel yet; I'll keep you posted.") !== "rejection", "a step not scheduled yet is not a rejection");
  // A reply that says where things stand stays a reply even when it mentions a call to come.
  eq(kind("Sam Park <sam.park@acme.com>", "Re: Data Analyst role", "Still waiting on the panel's feedback; once I hear back we can set up a call with the hiring manager."), "recruiter_reply");
});

Deno.test("WO-050/G2 a calendar notice that does not name an interview, the employer AND the job stays 'other'; with all three it is evidence only", () => {
  for (const [from, subject, snippet] of [
    [GCAL, "Updated invitation: Interview - Stripe @ Thu", "Stripe Recruiting has invited you to Interview. Join with Google Meet."],
    [GCAL, "Invitation: Asana <> Sam - Recruiter Screen @ Thu", "You have been invited to the following event. Recruiter screen with Asana."],
    [GCAL, "Invitation: Final Interview - Monzo @ Mon Oct 12", "Oliver Hart has invited you. Organizer: oliver.hart@monzo.com. Final interview with Monzo's CPO."],
    ["Calendly <notifications@calendly.com>", "Confirmed: 30 Minute Recruiter Call - Brex", "Hi Sam, a new event has been scheduled. Event type: 30 Minute Recruiter Call - Brex. Tuesday 11:00am."],
    ["Cal.com <notifications@cal.com>", "Confirmed: Lattice interview", "Your booking has been confirmed. What: Lattice interview. When: Thu 15:00. Where: Zoom."],
    [GCAL, "Invitation: Mock interview with career coach @ Thu 5pm", "Alex Lee has invited you to Mock interview with career coach (Software Engineer)."],
  ]) eq(kind(from, subject, snippet), "other", subject);
  // Named in the description and by the organizer's own domain: an interview, but only as evidence.
  const mail = { hash: "cal50", from: GCAL, subject: "Updated invitation: Hiring Manager Interview - Gusto @ Wed Sep 16, 2026 3:30pm", snippet: "This event has been changed. Organizer: lauren.ortiz@gusto.com. Hiring manager interview for the Senior Accountant role.", date: DATE };
  const c = classifyMail(mail);
  eq([c.kind, c.via], ["interview", "calendar"]);
  assert(sameCompany(c.company, "Gusto"), `Gusto: ${c.company}`);
  const plan = planUpdates([mail], [app("q:1", "Gusto", "Recruiter screen", { role: "Senior Accountant" })], NOW);
  eq([plan.apps[0].stage, plan.events.length, plan.texts.length, plan.evidence.length], ["Recruiter screen", 0, 0, 1], "a calendar notice moves nothing");
  const dh = read("\"Google Kalender\" <calendar-notification@google.com>", "Einladung: Interview Delivery Hero - Senior Backend Engineer @ Di. 29. Sept.", "Jonas Richter hat Sie eingeladen. Organisator: jonas.richter@deliveryhero.com.");
  eq([dh.kind, dh.via, dh.company], ["interview", "calendar", "Delivery Hero"], "the organizer's domain spells the employer");
});

Deno.test("WO-050/G3 a scheduling tool's mail is the employer's word only when it names the employer and the job", () => {
  // No job named: "other", whatever the tool.
  for (const [from, subject, snippet] of [
    ["\"Coinbase via GoodTime\" <scheduling@goodtime.io>", "Your Coinbase interviews are confirmed", "Hi Dev, your interviews with Coinbase are confirmed for Monday, 10:00am-12:30pm PT. Three sessions on Zoom."],
    ["\"ModernLoop\" <no-reply@modernloop.io>", "Reminder: interview with Figma tomorrow", "Hi Jules, a reminder that your interview with Figma is tomorrow at 1:00 PM PT with Alex Romero."],
    ["\"Stripe via GoodTime\" <scheduling@goodtime.io>", "Please select your interview times for Stripe", "Hi Sam, Stripe would like to schedule your interviews. Select your availability using the link below."],
    // The person is the interviewer, or in training: never their own step.
    ["GoodTime <scheduling@goodtime.io>", "You're scheduled to interview: Jane Doe - Backend Engineer", "Hi Sam, you've been added as an interviewer for Jane Doe (Backend Engineer) on Thursday. Submit your scorecard."],
    ["ModernLoop <no-reply@modernloop.io>", "Interviewer training: shadow session booked", "Hi Lee, you're booked to shadow a System Design interview for a Software Engineer loop on Tue as part of interviewer training."],
  ]) eq(kind(from, subject, snippet), "other", subject);
  // Named: an interview with the employer, which moves the stage like the employer's own mail...
  const named = { hash: "ml1", from: "\"ModernLoop\" <no-reply@modernloop.io>", subject: "Interview confirmed: Instacart - Machine Learning Engineer, Ads", snippet: "Hi Theo, your interview with Instacart has been confirmed for Wed 11:00 AM PT.", date: DATE, auth: ["mx.google.com; dmarc=pass header.from=modernloop.io"] };
  const c = classifyMail(named);
  eq([c.kind, c.company], ["interview", "Instacart"]);
  const plan = planUpdates([named], [app("q:2", "Instacart", "Recruiter screen", { role: "Machine Learning Engineer, Ads" })], NOW);
  eq(plan.apps[0].stage, "Interview rounds");
  // ...but a scheduling tool never confirms anything as the employer's own authenticated mail.
  for (const [from, domain] of [["\"ModernLoop\" <no-reply@modernloop.io>", "modernloop.io"], ["\"Plaid via Prelude\" <plaid@prelude.co>", "prelude.co"], ["\"Olivia from Taco Bell\" <tacobell@paradox.ai>", "paradox.ai"]]) {
    eq(fromEmployer({ ...c, domain }, { company: "Instacart" }, from, [`mx.google.com; dmarc=pass header.from=${domain}`]), false, `${domain} never confirms`);
  }
  // Calendar and forward guards are unchanged: no scheduling notice starts an application.
  const none = planUpdates([{ ...named, hash: "ml2" }], [], NOW);
  eq([none.apps.length, none.events.length], [0, 0]);
});

Deno.test("WO-050/W1 the classifier stays pure and the scheduling tools and agencies are matching data only", () => {
  // mailFeatures still reports the scorer's features for a scheduling tool's mail (it is read, not decided outside).
  const f = mailFeatures({ from: "\"ModernLoop\" <no-reply@modernloop.io>", subject: "Interview confirmed: Instacart - ML Engineer", snippet: "Your interview with Instacart has been confirmed.", date: DATE });
  assert(f && f.has("s:ats"), "a scheduling tool reads as the employer's ATS-like sender");
  // Agencies never make an employer's own mail: an offer relayed by an agency is not the employer's authenticated word.
  const c = read("\"Amanda Ruiz | TEKsystems\" <aruiz@teksystems.com>", "Offer from Northrop Grumman - Network Engineer contract", "Northrop Grumman extended you an offer: 12-month contract, $72/hr W2.");
  eq(fromEmployer(c, { company: "Northrop Grumman" }, "aruiz@teksystems.com", ["mx.google.com; dmarc=pass header.from=teksystems.com"]), false);
});
