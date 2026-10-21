/* Module 172 guard — ASK-ON-MISSING lane (owner ruling 2026-10-21
   14:11 CDT). Synthetic personas ONLY. Proves the owner's rule — a
   required application field is covered ONLY by a user-stated,
   confirmed fact (read through module 167); a derivable value NEVER
   covers — for every field type, in the same five cells:
     (a) no fact           -> the ask fires, exactly one, field-specific
     (b) derivable only    -> the ask STILL fires, derivation named+refused
     (c) stated fact       -> no ask, field covered REAL
     (d) reply             -> stored confirmed w/ full provenance,
                              field covered, resume signal emitted
     (e) unparseable reply -> clarifying re-ask, NOTHING stored
   Plus the regression in the shape of the owner's real 2026-10-21
   case (pre-14:10 his sponsorship + years existed only as module-149
   derivations -> exactly two asks; post-14:10, stated -> none). Only
   his two stated values (No / 3) appear; every other fact is invented. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const Ask = require("../packages/domain/172-career-missing-fact-ask.js");
const Trusted167 = require("../packages/domain/167-career-trusted-facts.js");

const T0 = "2026-10-21T19:00:00.000Z"; // 14:00 CDT
const T1 = "2026-10-21T19:01:00.000Z";
const T2 = "2026-10-21T19:02:00.000Z";

// ---- synthetic fact builders (bank shapes: 122 facts / 149 answers) ----
const elig = (name, value) => ({ id: "E-" + name, kind: "eligibility", name, title: name, value, status: "confirmed" });
const prof = (name, value, extra) => Object.assign({ id: "P-" + name, kind: "profile", name, title: name, value, status: "confirmed" }, extra || {});
const edu = (extra) => Object.assign({ id: "ED1", kind: "education", name: "Example University", title: "Example University", status: "confirmed" }, extra || {});
const exp = (name, start, extra) => Object.assign({ id: "X-" + name, kind: "experience", name, title: name, start, status: "confirmed" }, extra || {});

const CELLS = [
  {
    key: "sponsorship", type: "yes_no", askBits: ["sponsorship", "yes or no"], reply: "No", value: "No", bad: "maybe later",
    derivableProfile: () => ({ facts: [elig("Work authorization", "Yes")] }),
    statedProfile: () => ({ facts: [elig("Work authorization", "Yes"), elig("Sponsorship", "No")] }),
  },
  {
    key: "work_authorization", type: "yes_no", askBits: ["authorized to work", "yes or no"], reply: "Yes", value: "Yes", bad: "huh?",
    derivableProfile: () => ({ basics: { location: "Chicago, IL" }, facts: [prof("Country", "United States")] }),
    statedProfile: () => ({ facts: [elig("Work authorization", "Yes")] }),
  },
  {
    key: "years_of_experience", type: "number", askBits: ["years of experience", "number"], reply: "3", value: 3, bad: "a lot",
    derivableProfile: () => ({ facts: [exp("Founder, Example Agency Co", "2023"), exp("Intern, Example Widgets", "2025")] }),
    statedProfile: () => ({ facts: [{ id: "Y1", kind: "experience", name: "Years of experience", title: "Years of experience", value: 3, status: "confirmed" }] }),
  },
  {
    key: "graduation_month", type: "month_year", askBits: ["graduation month", "May 2029"], reply: "May 2029", value: "2029-05", bad: "2029",
    derivableProfile: () => ({ facts: [edu({ start: "2025", end: "2029" })] }),
    statedProfile: () => ({ facts: [edu({ start: "2025", end: "2029-05" })] }),
  },
  {
    key: "graduation_year", type: "year", askBits: ["graduation year", "4-digit"], reply: "2029", value: 2029, bad: "soon",
    derivableProfile: () => ({ facts: [edu({ start: "2025", text: "Four-year bachelor's program at Example University." })] }),
    statedProfile: () => ({ facts: [edu({ start: "2025", end: "2029" })] }),
  },
  {
    key: "education_level", type: "level", askBits: ["level of education", "Bachelor's Degree"], reply: "Bachelor's Degree", value: "Bachelor's Degree", bad: "college",
    derivableProfile: () => ({ facts: [edu({ title: "Bachelors in Computer Science", text: "Bachelor's degree in Computer Science.", end: "2029" })] }),
    statedProfile: () => ({ facts: [edu({ level: "Bachelor's Degree", end: "2029" })] }),
  },
  {
    key: "located_in_us", type: "yes_no", askBits: ["located in the United States", "yes or no"], reply: "Yes", value: "Yes", bad: "over there",
    derivableProfile: () => ({ basics: { time_zone: "America/Chicago" }, facts: [] }),
    statedProfile: () => ({ facts: [prof("Country", "United States")] }),
  },
  {
    key: "country", type: "text", askBits: ["country", "country name"], reply: "United States", value: "United States", bad: "12345",
    derivableProfile: () => ({ basics: { location: "Chicago, IL" }, facts: [prof("Hometown", "Chicago, IL")] }),
    statedProfile: () => ({ facts: [prof("Country", "United States")] }),
  },
  {
    key: "start_date", type: "date", askBits: ["start", "June 2027"], reply: "June 2027", value: "2027-06", bad: "whenever",
    derivableProfile: () => ({ facts: [edu({ start: "2025", end: "2029" })] }),
    statedProfile: () => ({ facts: [prof("Start date", "2027-06")] }),
  },
  {
    key: "relocation_willingness", type: "yes_no", askBits: ["relocate", "yes or no"], reply: "No", value: "No", bad: "it depends",
    derivableProfile: () => ({ basics: { location: "Chicago, IL" }, facts: [prof("Hometown", "Chicago, IL")] }),
    statedProfile: () => ({ facts: [prof("Relocation willingness", "Yes")] }),
  },
  {
    key: "security_clearance", type: "text", askBits: ["security clearance", "none"], reply: "None", value: "None", bad: "",
    derivableProfile: () => ({ facts: [exp("Engineer, Example Defense Systems", "2024", { org: "Example Defense Systems", text: "Built internal tooling for a defense contractor." })] }),
    statedProfile: () => ({ facts: [prof("Security clearance", "None")] }),
  },
  {
    key: "age_18_plus", type: "attestation", askBits: ["18 years of age or older", "yes or no"], reply: "Yes", value: "Yes", bad: "perhaps",
    derivableProfile: () => ({ facts: [prof("Date of birth", "2005-04-02")] }),
    statedProfile: () => ({ facts: [{ id: "A1", kind: "profile", name: "Age 18+", title: "Age 18+", value: "Yes", status: "confirmed", attestation: true }] }),
  },
];

for (const cell of CELLS) {
  test("field " + cell.key + " (" + cell.type + "): missing triggers an ask EVERY time; stated covers; reply stores with provenance", () => {
    const defs = [{ key: cell.key }];

    // (a) no fact at all -> exactly one ask, specific to the field
    let a = Ask.assessCoverage({ facts: [] }, defs);
    assert.deepEqual(a.missing.map((m) => m.field_key), [cell.key], "(a) the field is missing");
    assert.deepEqual(a.covered, [], "(a) nothing covered");
    let session = Ask.createSession({ facts: [] }, defs, { now: T0 });
    assert.equal(session.queue.length, 1, "(a) exactly one question queued");
    assert.equal(session.complete, false);
    const q = Ask.currentQuestion(session);
    assert.equal(q.field_key, cell.key);
    assert.equal(q.type, cell.type);
    assert.equal(q.question_id, "mfq_" + cell.key, "stable question id");
    for (const bit of cell.askBits) assert.ok(q.text.toLowerCase().includes(bit.toLowerCase()), "(a) ask text names the field: " + bit);
    assert.ok(q.accepted_shape.length > 0, "(a) accepted shape stated");
    assert.equal(q.asked_at, T0, "(a) asked_at stamped");

    // (b) only a derivable value exists -> the ask STILL fires, named
    const dp = cell.derivableProfile();
    a = Ask.assessCoverage(dp, defs);
    assert.deepEqual(a.missing.map((m) => m.field_key), [cell.key], "(b) derivable value does NOT cover");
    assert.deepEqual(a.covered, [], "(b) nothing covered by a derivation");
    assert.ok(typeof a.missing[0].derivable_refused === "string" && a.missing[0].derivable_refused.length > 10, "(b) the refused derivation is named: " + a.missing[0].derivable_refused);
    session = Ask.createSession(dp, defs, { now: T0 });
    assert.equal(session.queue.length, 1, "(b) exactly one ask fires");

    // (c) a stated confirmed fact -> no ask
    a = Ask.assessCoverage(cell.statedProfile(), defs);
    assert.deepEqual(a.missing, [], "(c) stated fact covers — no ask");
    assert.equal(a.covered.length, 1);
    assert.equal(a.covered[0].field_key, cell.key);
    assert.equal(a.covered[0].tag, "REAL");
    session = Ask.createSession(cell.statedProfile(), defs, { now: T0 });
    assert.equal(session.complete, true, "(c) session complete with zero questions");
    assert.equal(Ask.currentQuestion(session), null);

    // (e) unparseable reply -> re-ask, NOTHING stored (run before (d)
    // on the (a) session, to prove the binding survives a bad reply)
    session = Ask.createSession({ facts: [] }, defs, { now: T0 });
    const bad = Ask.intakeReply(session, cell.bad, { now: T1 });
    assert.equal(bad.status, "reask", "(e) unparseable reply re-asks");
    assert.equal(bad.stored, false);
    assert.equal(bad.session.stored_facts.length, 0, "(e) nothing stored — no guess");
    assert.equal(Ask.currentQuestion(bad.session).question_id, q.question_id, "(e) the same question stays open");
    assert.match(bad.text, /Nothing was saved/);

    // (d) a parseable reply -> stored confirmed, full provenance,
    // field covered on re-assessment, resume signal emitted
    const good = Ask.intakeReply(bad.session, cell.reply, { now: T2 });
    assert.equal(good.status, "stored", "(d) reply stored");
    assert.equal(good.value, cell.value, "(d) the stated value is stored verbatim in meaning");
    assert.equal(good.tag, "REAL");
    const fact = good.fact;
    assert.equal(fact.status, "confirmed", "(d) stored as a confirmed fact");
    assert.equal(fact.needs_confirmation, false);
    assert.equal(fact.answer_key, cell.key);
    assert.equal(fact.provenance.source, "owner_reply");
    assert.equal(fact.provenance.question_id, q.question_id, "(d) provenance binds the question id");
    assert.equal(fact.provenance.asked_at, T0);
    assert.equal(fact.provenance.answered_at, T2);
    assert.equal(fact.provenance.verbatim, cell.reply, "(d) the verbatim reply is carried");
    assert.equal(good.resume.signal, "all_fields_covered", "(d) resume signal: single-field queue drained");
    assert.equal(good.resume.complete, true);
    assert.equal(good.resume.field_key, cell.key);
    const after = Ask.assessCoverage(Ask.applyStoredFact({ facts: [] }, fact), defs);
    assert.deepEqual(after.missing, [], "(d) the stored fact covers the field on re-assessment");
    assert.equal(after.covered[0].value, cell.value);
  });
}

test("D-007 discipline: quarantined / unconfirmed facts never cover, through the REAL module 167", () => {
  const defs = [{ key: "sponsorship" }];
  for (const poisoned of [
    elig("Sponsorship", "No"), // cloned + poisoned below
  ]) { void poisoned; }
  const variants = [
    Object.assign(elig("Sponsorship", "No"), { needs_confirmation: true, status: "draft" }),
    Object.assign(elig("Sponsorship", "No"), { status: "quarantined" }),
    Object.assign(elig("Sponsorship", "No"), { status: "held" }),
    Object.assign(elig("Sponsorship", "No"), { status: "suppressed" }),
    Object.assign(elig("Sponsorship", "No"), { quarantined: true }),
  ];
  for (const fact of variants) {
    assert.equal(Trusted167.isTrusted(fact), false, "167 itself holds this fact back");
    const a = Ask.assessCoverage({ facts: [fact] }, defs);
    assert.deepEqual(a.missing.map((m) => m.field_key), ["sponsorship"], "a held fact does not cover — the ask fires");
  }
  const a = Ask.assessCoverage({ facts: [] }, defs);
  assert.equal(a.reader_mode, "module167", "the shipped tree reads through the real 167, labeled");
  // injection seam: a host-supplied reader is used verbatim and labeled
  let calls = 0;
  const injected = { trustedFacts: (p) => { calls += 1; return Trusted167.trustedFacts(p); } };
  const b = Ask.assessCoverage({ facts: [elig("Sponsorship", "No")] }, defs, { reader: injected });
  assert.equal(b.reader_mode, "injected");
  assert.ok(calls >= 1);
  assert.deepEqual(b.missing, [], "the injected reader's cleared pool governs");
});

test("module 149's DERIVED answer map never covers (the exact 14:05 failure shape)", () => {
  // 149's deriveAnswers output shape: {value, confirmed:true, factId} —
  // confirmed, traced, and still a derivation. It must not cover.
  const profile = {
    facts: [elig("Work authorization", "Yes"), exp("Founder, Example Agency Co", "2023")],
    answers: {
      sponsorship: { value: "No", confirmed: true, factId: "E-Work authorization" },
      years_of_experience: { value: 3, confirmed: true, factId: "X-Founder, Example Agency Co" },
    },
  };
  const a = Ask.assessCoverage(profile, ["sponsorship", "years_of_experience"]);
  assert.deepEqual(a.missing.map((m) => m.field_key), ["sponsorship", "years_of_experience"], "derived answers leave both fields missing");
  // ...but an answers entry the USER stated (owner_reply provenance) does cover
  const stated = { facts: [], answers: { sponsorship: { value: "No", confirmed: true, stated: true, provenance: { source: "owner_reply" } } } };
  assert.deepEqual(Ask.assessCoverage(stated, ["sponsorship"]).missing, []);
});

test("REGRESSION — the owner's 2026-10-21 case: two derivations -> exactly two asks; his two statements -> none", () => {
  // Shape mirrors the TEST-profile bank that day (synthetic persona;
  // only the owner's two stated VALUES — sponsorship No, years 3 —
  // appear, as the brief allows). Before his 14:10 statement, both
  // fields existed only as module-149 derivations.
  const pre = {
    facts: [
      elig("Work authorization", "Yes"),
      edu({ title: "Bachelors, CS + Finance", org: "Example University", start: "2025", end: "2029" }),
      exp("Founder, Example Ventures", "2025"),
      exp("Founder, Example Agency", "2023"),
      prof("Country", "United States"),
    ],
    answers: { // module 149's derived map, present and confirmed — and not coverage
      sponsorship: { value: "No", confirmed: true, factId: "E-Work authorization" },
      years_of_experience: { value: 3, confirmed: true, factId: "X-Founder, Example Agency" },
    },
  };
  const fields = ["sponsorship", "years_of_experience", "work_authorization"];
  const a = Ask.assessCoverage(pre, fields);
  assert.deepEqual(a.covered.map((c) => c.field_key), ["work_authorization"], "only the stated fact covers");
  assert.deepEqual(a.missing.map((m) => m.field_key), ["sponsorship", "years_of_experience"], "exactly those two asks — no more, no fewer");

  // The owner answers both, in queue order; each stores with provenance.
  let session = Ask.createSession(pre, fields, { now: "2026-10-21T19:10:00.000Z" });
  assert.deepEqual(session.queue.map((q) => q.field_key), ["sponsorship", "years_of_experience"]);
  let r = Ask.intakeReply(session, "No", { now: "2026-10-21T19:10:30.000Z" });
  assert.equal(r.status, "stored");
  assert.equal(r.fact.value, "No");
  assert.equal(r.resume.signal, "fact_stored");
  assert.equal(r.resume.remaining, 1);
  let bank = Ask.applyStoredFact(pre, r.fact);
  r = Ask.intakeReply(r.session, "3", { now: "2026-10-21T19:10:45.000Z" });
  assert.equal(r.status, "stored");
  assert.equal(r.fact.value, 3);
  assert.equal(r.resume.signal, "all_fields_covered");
  bank = Ask.applyStoredFact(bank, r.fact);
  const post = Ask.assessCoverage(bank, fields);
  assert.deepEqual(post.missing, [], "post-statement: no asks remain");
  assert.deepEqual(post.covered.map((c) => c.field_key), ["sponsorship", "years_of_experience", "work_authorization"], "covered reads back in field order — all three stated now");
});

test("queue discipline: ordered, one open at a time, advance + asked_at on the next, stale ids refused", () => {
  const fields = ["sponsorship", "years_of_experience", "graduation_month"];
  let session = Ask.createSession({ facts: [] }, fields, { now: T0, context: { company: "Example Corp", title: "Finance Intern" } });
  assert.deepEqual(session.queue.map((q) => q.field_key), fields, "queue preserves the field order");
  assert.match(session.queue[0].text, /Example Corp/, "context names the application");
  assert.equal(session.queue[0].question_id, "mfq_sponsorship");
  assert.equal(session.queue[1].asked_at, null, "a queued question is not 'asked' until it opens");

  const stale = Ask.intakeReply(session, "No", { now: T1, question_id: "mfq_years_of_experience" });
  assert.equal(stale.status, "stale_question", "a reply bound to a non-open question stores nothing");
  assert.equal(stale.session.stored_facts.length, 0);

  let r = Ask.intakeReply(session, "No", { now: T1 });
  assert.equal(r.resume.next_question.field_key, "years_of_experience");
  assert.equal(r.resume.next_question.asked_at, T1, "the next question's asked_at stamps when it opens");
  r = Ask.intakeReply(r.session, "3", { now: T2 });
  r = Ask.intakeReply(r.session, "May 2029", { now: T2 });
  assert.equal(r.session.complete, true);
  const done = Ask.intakeReply(r.session, "extra", { now: T2 });
  assert.equal(done.status, "no_open_question", "a drained queue takes no more replies");
});

test("field-def shapes: 149 question_key / 171 field_id normalize; optional fields never asked; duplicates dedupe; unknown keys ask generically", () => {
  const s1 = Ask.createSession({ facts: [] }, [{ question_key: "sponsorship" }, { field_id: "years_of_experience" }, { key: "sponsorship" }], { now: T0 });
  assert.deepEqual(s1.queue.map((q) => q.field_key), ["sponsorship", "years_of_experience"], "shapes normalize and dedupe");
  const s2 = Ask.createSession({ facts: [] }, [{ key: "sponsorship", required: false }], { now: T0 });
  assert.equal(s2.complete, true, "an optional missing field is never asked about");
  const s3 = Ask.createSession({ facts: [] }, [{ key: "favorite_color", label: "favorite color" }], { now: T0 });
  assert.equal(s3.queue.length, 1, "an unknown required field still asks — generically, never derived");
  const r = Ask.intakeReply(s3, "blue", { now: T1 });
  assert.equal(r.status, "stored");
  assert.equal(r.fact.answer_key, "favorite_color");
  assert.deepEqual(Ask.assessCoverage(Ask.applyStoredFact({ facts: [] }, r.fact), ["favorite_color"]).missing, []);
});

test("reply parsing: free-text routes through module 170; month precision never gains a day; word numbers parse", () => {
  // 170 cascade: a labeled free-text reply the strict parser can't take
  let s = Ask.createSession({ facts: [] }, ["work_authorization"], { now: T0 });
  let r = Ask.intakeReply(s, "Work authorization: Yes", { now: T1 });
  assert.equal(r.status, "stored");
  assert.equal(r.fact.value, "Yes");
  assert.equal(r.fact.provenance.parsed_via, "parser170", "the cascade is named in provenance");
  // sentence-form yes/no
  s = Ask.createSession({ facts: [] }, ["sponsorship"], { now: T0 });
  r = Ask.intakeReply(s, "I don't need sponsorship", { now: T1 });
  assert.equal(r.status, "stored");
  assert.equal(r.fact.value, "No");
  // word number
  s = Ask.createSession({ facts: [] }, ["years_of_experience"], { now: T0 });
  r = Ask.intakeReply(s, "three", { now: T1 });
  assert.equal(r.fact.value, 3);
  // month precision: the stored value is YYYY-MM — no day is invented
  s = Ask.createSession({ facts: [] }, ["graduation_month"], { now: T0 });
  r = Ask.intakeReply(s, "I graduate in May 2029", { now: T1 });
  assert.equal(r.status, "stored");
  assert.equal(r.fact.value, "2029-05");
  assert.match(r.fact.value, /^\d{4}-\d{2}$/, "month precision only");
  assert.equal(r.fact.provenance.precision, "month");
  // level abbreviation canonicalizes to the board's label
  s = Ask.createSession({ facts: [] }, ["education_level"], { now: T0 });
  r = Ask.intakeReply(s, "I have a bachelor's", { now: T1 });
  assert.equal(r.fact.value, "Bachelor's Degree");
  // start date: day precision kept when the user states a day
  s = Ask.createSession({ facts: [] }, ["start_date"], { now: T0 });
  r = Ask.intakeReply(s, "June 3, 2027", { now: T1 });
  assert.equal(r.fact.value, "2027-06-03");
  assert.equal(r.fact.provenance.precision, "day");
  // attestation via the explicit-tap shape (171) also covers
  const att = { facts: [], attestations: { age_18_plus: { explicit: true } } };
  assert.deepEqual(Ask.assessCoverage(att, ["age_18_plus"]).missing, []);
  // stated residence in a US state covers located_in_us (owner's restatement ruling)
  const res = { basics: { location: "Chicago, IL" }, facts: [] };
  const cov = Ask.assessCoverage(res, ["located_in_us"]);
  assert.deepEqual(cov.missing, [], "a stated US residence is the user's own statement of where they live");
});
