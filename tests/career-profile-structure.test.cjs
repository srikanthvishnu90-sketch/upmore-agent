/* Module 169 guard — CANONICAL PROFILE STRUCTURER lane (Lane F,
   2026-10-21). Synthetic fixture corpus ONLY (privacy law: the
   owner's real facts never enter this repo; the real-corpus run is
   local evidence). Proves: trusted facts (via the module-167 reader
   contract stub) -> ONE canonical profile; normalization correctness
   (degree / date / GPA variants), GAP FLAGS instead of invention
   (grad month = the standing case), REVERSIBILITY (every normalized
   value traces to its source fact id + verbatim), the QUARANTINE
   marker proof (draft / flagged / placeholder facts are never read),
   and both platform emitters (module 149 board profile, module 157
   match profile) fed by the one model. */
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const P = require("../packages/domain/169-career-profile-structure.js");

const AT = "2026-10-21T19:00:00.000Z";
const FULL = {
  user_id: "user-alex",
  facts: [
    { id: "c-name", kind: "contact", key: "name", value: "Alex Example", status: "confirmed" },
    { id: "c-email", kind: "contact", key: "email", value: "alex@example.test", status: "confirmed" },
    { id: "c-phone", kind: "contact", key: "phone", value: "(555) 010-2030", status: "confirmed" },
    { id: "c-city", kind: "contact", key: "city", value: "Springfield, IL", status: "confirmed" },
    { id: "c-li", kind: "contact", key: "linkedin", value: "linkedin.com/in/alex-example", status: "confirmed" },
    { id: "e-1", kind: "education", status: "confirmed", data: { school: "State Example University", detail: "College of Examples", degree: "Bachelor of Science", discipline: "Computer Science", start_year: 2023, graduation_year: 2027, gpa: 3.7, gpa_scale: "4.0" } },
    { id: "x-1", kind: "experience", status: "confirmed", data: { org: "Example Widgets Inc", title: "Software Intern", location: "Remote", start: "June 2026", end: "Present" }, bullets: ["Built an example dashboard"] },
    { id: "x-2", kind: "experience", status: "confirmed", data: { org: "Example Coffee Co", title: "Barista", dates: "2024 – 2025" }, bullets: ["Trained 3 example new hires"] },
    { id: "s-1", kind: "skill", status: "confirmed", data: { group: "Languages", items: ["Python", "JavaScript"] } },
    { id: "s-2", kind: "skill", status: "confirmed", skills: ["Git", "Excel"] },
    { id: "cert-1", kind: "certification", status: "confirmed", data: { name: "Example Cloud Certificate", issuer: "Example Provider" } },
  ],
  stated_facts: [
    { kind: "goal", value: "a data analyst internship for summer 2027" },
    { kind: "level", value: "intern" },
  ],
};

test("full corpus: canonical model, headline derived from the current role", () => {
  const m = P.buildProfile(FULL);
  assert.equal(m.kind, "career_canonical_profile");
  assert.equal(m.headline.text, "Software Intern at Example Widgets Inc");
  assert.equal(m.headline.rule, "HEADLINE_CURRENT_ROLE");
  assert.deepEqual(m.headline.fact_ids, ["x-1"]);
  assert.equal(m.contact.name.value, "Alex Example");
  assert.equal(m.education[0].degree.value.level, "bachelors");
  assert.equal(m.education[0].degree.value.abbr, "BS");
  assert.equal(m.education[0].fields_of_study[0].value, "Computer Science");
  assert.equal(m.education[0].gpa.text, "3.7/4.0");
  assert.equal(m.experience[0].org.value, "Example Widgets Inc"); // present end sorts first
  assert.equal(m.target.goal.value, "a data analyst internship for summer 2027");
  assert.equal(m.provenance.reader.stub, true); // 167 has not landed — said out loud
  assert.equal(m.provenance.quarantined.length, 0);
});

test("degree variants canonicalize; unknown degrees stay verbatim + flagged", () => {
  const variants = [
    ["B.S.", "bachelors", "BS"], ["BS", "bachelors", "BS"], ["Bachelor's", "bachelors", null],
    ["B.A. in History", "bachelors", "BA"], ["M.S.", "masters", "MS"], ["Master of Science", "masters", "MS"],
    ["MBA", "masters", "MBA"], ["PhD", "doctorate", "PhD"], ["Associate", "associates", null],
  ];
  for (const [text, level, abbr] of variants) {
    const c = P.canonicalDegree(text);
    assert.equal(c.level, level, text);
    assert.equal(c.abbr, abbr, text);
    assert.equal(c.recognized, true, text);
  }
  const split = P.canonicalDegree("B.A. in History");
  assert.equal(split.discipline_candidate, "History");
  const m = P.buildProfile({ user_id: "u", facts: [{ id: "e", kind: "education", status: "confirmed", data: { school: "Example School", degree: "Diploma in Examples" } }] });
  assert.equal(m.education[0].degree.value.level, null);
  assert.equal(m.education[0].degree.value.display, "Diploma in Examples"); // verbatim, not classified
  assert.ok(m.gaps.some((g) => g.code === "DEGREE_UNRECOGNIZED"));
});

test("date variants: month precision only where the fact carries a month", () => {
  const monthSpan = P.normSpan({ start: "May 2025", end: "September 2026" });
  assert.deepEqual(monthSpan.start, { year: 2025, month: 5, precision: "month" });
  assert.equal(monthSpan.text, "May 2025 – September 2026");
  const yearSpan = P.normSpan({ dates: "2025-2029" });
  assert.deepEqual(yearSpan.end, { year: 2029, month: null, precision: "year" });
  assert.equal(yearSpan.text, "2025 – 2029");
  // the standing grad-month case: a year-only graduation end is flagged
  const m = P.buildProfile({ user_id: "u", facts: [{ id: "e", kind: "education", status: "confirmed", data: { school: "Example U", degree: "BS", graduation_year: 2029 } }] });
  assert.equal(m.education[0].span.end.precision, "year");
  assert.equal(m.education[0].span.text, "2029");
  assert.ok(m.gaps.some((g) => g.code === "DATE_PARTIAL" && /month is not invented/.test(g.detail)));
});

test("GPA: stated scale kept verbatim, missing scale never invented, never rescaled", () => {
  assert.deepEqual(P.canonicalGpa("3.9/4.0"), { value: 3.9, scale: 4, text: "3.9/4.0" });
  assert.deepEqual(P.canonicalGpa(3.9, "4.0"), { value: 3.9, scale: 4, text: "3.9/4.0" });
  const bare = P.canonicalGpa("3.9");
  assert.equal(bare.scale, null);
  assert.equal(bare.text, "3.9"); // no "/4.0" appears from nowhere
});

test("gap flags: missing elements are flagged, never filled", () => {
  const m = P.buildProfile({ user_id: "u", facts: [{ id: "c", kind: "contact", key: "name", value: "Solo Name", status: "confirmed" }] });
  const codes = m.gaps.map((g) => g.code);
  for (const code of ["EMAIL_MISSING", "PHONE_MISSING", "CITY_MISSING", "LINKEDIN_MISSING", "EDUCATION_MISSING", "EXPERIENCE_MISSING", "SKILLS_MISSING", "HEADLINE_MISSING"]) {
    assert.ok(codes.includes(code), code);
  }
  assert.equal(m.contact.email, null);
  assert.equal(m.headline, null);
});

test("reversibility: every consumed fact id is accounted and verbatim survives", () => {
  const m = P.buildProfile(FULL);
  const expected = FULL.facts.map((f) => f.id);
  for (const id of expected) assert.ok(m.provenance.consumed_fact_ids.includes(id), id);
  // every field record carries verbatim + fact_id + rule
  const frs = [m.contact.name, m.education[0].school, m.experience[0].org, m.experience[0].bullets[0], m.skills[0].items[0], m.certifications[0].name];
  for (const fr of frs) {
    assert.ok(typeof fr.verbatim === "string" && fr.verbatim.length > 0);
    assert.ok(typeof fr.fact_id === "string" && fr.fact_id.length > 0);
    assert.ok(P.RULES.includes(fr.rule), fr.rule);
  }
  // original ordering recoverable despite span sorting
  assert.equal(m.experience.find((e) => e.org.value === "Example Coffee Co").source_index, 1);
});

test("QUARANTINE marker proof: draft / flagged / placeholder facts are never read", () => {
  const poisoned = {
    user_id: "u",
    facts: [
      { id: "ok-1", kind: "contact", key: "name", value: "ZZQ-CONFIRMED-NAME", status: "confirmed" },
      { id: "bad-1", kind: "experience", status: "draft", needs_confirmation: true, data: { org: "ZZQ-DRAFT-ORG", title: "Ghost" } },
      { id: "bad-2", kind: "education", quarantined: true, status: "confirmed", data: { school: "ZZQ-QUARANTINED-SCHOOL", degree: "BS" } },
      { id: "bad-3", kind: "skill", status: "confirmed", data: { items: ["[28]"] } },
    ],
  };
  const m = P.buildProfile(poisoned);
  const ser = JSON.stringify(m);
  assert.ok(ser.includes("ZZQ-CONFIRMED-NAME")); // confirmed facts ARE read
  assert.ok(!ser.includes("ZZQ-DRAFT-ORG"));
  assert.ok(!ser.includes("ZZQ-QUARANTINED-SCHOOL"));
  assert.ok(!ser.includes("[28]"));
  const reasons = Object.fromEntries(m.provenance.quarantined.map((q) => [q.id, q.reason]));
  assert.equal(reasons["bad-1"], "UNCONFIRMED_DRAFT");
  assert.equal(reasons["bad-2"], "QUARANTINED_FLAG");
  assert.equal(reasons["bad-3"], "UNRESOLVED_PLACEHOLDER");
});

test("injected reader (the real 167) is used when provided, and the model says so", () => {
  const m = P.buildProfile(FULL, { reader: (facts) => ({ trusted: facts, quarantined: [] }) });
  assert.equal(m.provenance.reader.stub, false);
});

test("stated facts fill gaps; a conflict is recorded, never overwritten", () => {
  const base = { user_id: "u", facts: [{ id: "e", kind: "education", status: "confirmed", data: { degree: "BS", graduation_year: 2029 } }] };
  const filled = P.buildProfile({ ...base, stated_facts: [{ kind: "school", value: "Stated Example University" }, { kind: "majors", value: "Computer Science + Finance" }] });
  assert.equal(filled.education[0].school.value, "Stated Example University");
  assert.equal(filled.education[0].school.rule, "STATED_FILL");
  assert.deepEqual(filled.education[0].fields_of_study.map((f) => f.value), ["Computer Science", "Finance"]);
  // conflicting stated school: structured fact wins, conflict on record
  const clash = P.buildProfile({ user_id: "u", facts: [{ id: "e", kind: "education", status: "confirmed", data: { school: "Real Example University", degree: "BS" } }], stated_facts: [{ kind: "school", value: "Other University" }] });
  assert.equal(clash.education[0].school.value, "Real Example University");
  assert.equal(clash.conflicts.length, 1);
  assert.equal(clash.conflicts[0].stated_value, "Other University");
  // a non-profile stated kind is reported unplaced, never swallowed
  const tone = P.buildProfile({ user_id: "u", facts: [], stated_facts: [{ kind: "tone", value: "warm" }] });
  assert.ok(tone.unplaced.some((u) => u.kind === "tone" && u.reason === "NOT_PROFILE_SHAPED"));
});

test("unstructured facts are carried verbatim with slot gap flags — never parsed into structure", () => {
  const m = P.buildProfile({ user_id: "u", facts: [{ id: "e", kind: "education", status: "confirmed", title: "Some University — BS Computer Science 2029", text: "Some University — BS Computer Science 2029", bullets: [] }] });
  assert.equal(m.education[0].unstructured.title, "Some University — BS Computer Science 2029");
  assert.equal(m.education[0].school, null); // the structurer does not pretend to parse this
  assert.ok(m.gaps.some((g) => g.code === "SCHOOL_MISSING"));
  assert.ok(m.gaps.some((g) => g.code === "DEGREE_MISSING"));
});

test("board emitter: module 149's flat profile + F-001 education shape, nulls named", () => {
  const b = P.toBoardProfile(P.buildProfile(FULL));
  assert.equal(b.name, "Alex Example");
  assert.equal(b.location, "Springfield, IL");
  assert.equal(b.current_company, "Example Widgets Inc");
  assert.deepEqual(b.education, { school: "State Example University", degree: "BS", discipline: "Computer Science", start_date: "2023", end_date: "2027", gpa: "3.7/4.0", graduation_year: 2027 });
  assert.equal(b.github, null);
  assert.ok(b._unfilled.includes("github")); // not sourced by the model — said, not filled
  assert.ok(b._unfilled.includes("preferred_name"));
});

test("match emitter: module 157's exact shape; goal becomes a need; offers never manufactured", () => {
  const r = P.toMatchProfile(P.buildProfile(FULL), { at: AT });
  assert.equal(r.ok, true);
  assert.deepEqual(Object.keys(r.profile), ["kind", "version", "user_id", "needs", "offers", "visibility_scope", "created_at", "updated_at"]);
  assert.equal(r.profile.kind, "connector_match_profile");
  assert.deepEqual(r.profile.needs, ["a data analyst internship for summer 2027"]);
  assert.deepEqual(r.profile.offers, []); // skills exist, but no offer is invented from them
  const withOffers = P.toMatchProfile(P.buildProfile(FULL), { at: AT, offers: ["Python mentoring"] });
  assert.deepEqual(withOffers.profile.offers, ["Python mentoring"]);
  // 157's clock discipline: no caller timestamp, no profile
  assert.equal(P.toMatchProfile(P.buildProfile(FULL), {}).reason, "timestamp_required");
  // oversized items are excluded + named, never truncated
  const long = P.toMatchProfile(P.buildProfile(FULL), { at: AT, offers: ["x".repeat(300)] });
  assert.deepEqual(long.profile.offers, []);
  assert.ok(long.notes.some((n) => n.code === "ITEM_TOO_LONG"));
});

test("skills stay grouped as stated; duplicates dedupe to the first", () => {
  const m = P.buildProfile(FULL);
  assert.equal(m.skills.length, 2);
  assert.equal(m.skills[0].label, "Languages");
  assert.deepEqual(m.skills[0].items.map((i) => i.value), ["Python", "JavaScript"]);
  const dup = P.buildProfile({ user_id: "u", facts: [{ id: "s", kind: "skill", status: "confirmed", data: { items: ["Git", "git", "GIT", "Excel"] } }] });
  assert.deepEqual(dup.skills[0].items.map((i) => i.value), ["Git", "Excel"]);
  assert.equal(dup.skills_deduped, 2);
});

test("determinism: same facts -> byte-identical model", () => {
  assert.equal(JSON.stringify(P.buildProfile(FULL)), JSON.stringify(P.buildProfile(FULL)));
});
