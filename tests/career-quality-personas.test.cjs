// Persona fixtures (Quality Spec Pack v1.0, docs/quality-spec/04 Part 5) —
// fixture/schema tests + the persona-swap scaffolding test (S1 rule).
//
// What this proves, deterministically and without any scored run:
//   1. persona-p2.json / persona-p3.json / persona-p4.json (in
//      tests/fixtures/career-gauntlet/) parse and conform to the F1 fixture
//      schema (profile shape + manifest shape in one file; every fact carries
//      an id, kind, text, source and source_class; unknowns, exclusions,
//      allowed/forbidden effects all present).
//   2. The pack<->F1 mapping holds: pack P1 is the existing F1 GAUNTLET-P1
//      profile dir (referenced, never duplicated — no persona-p1.json), and
//      the pack P2/P3/P4 ids can never be silently aliased to the colliding
//      F1 GAUNTLET-P2/P3/P4 fixtures.
//   3. All four pack personas load through the harness profile loader
//      (scripts/career/gauntlet/persona-loader.cjs -> 122-career-profile
//      profileFromData, the same path pilot-lib.cjs gauntletProfile uses).
//   4. SWAP TEST (04 Part 5): the same ask parameterized by P1/P2/P3/P4
//      assembles different, persona-appropriate persona contexts. Identical
//      context across personas = failure, mirroring the S1 rule that
//      identical replies across personas on a personalized ask are an S1.
//
// Check: node --test tests/career-quality-personas.test.cjs
"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const PACK_DIR = path.join(ROOT, "tests", "fixtures", "career-gauntlet");
const Personas = require(path.join(ROOT, "scripts", "career", "gauntlet", "persona-loader.cjs"));
const CareerProfile = require(path.join(ROOT, "packages", "domain", "122-career-profile.js"));

const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const PACK_FILES = { P2: "persona-p2.json", P3: "persona-p3.json", P4: "persona-p4.json" };
const SOURCE_CLASSES = new Set(["candidate-stated", "resume-document", "fixture-evidence"]);
const ASK = "Find roles that fit me and tailor my resume to the best one.";

// ---------------------------------------------------------------- fixtures

for (const [id, file] of Object.entries(PACK_FILES)) {
  test(`fixture ${file}: parses, is labeled a synthetic fixture, F1 schema shape`, () => {
    const d = loadJson(path.join(PACK_DIR, file));
    assert.equal(d.fixture, true);
    assert.equal(d.isTestFixture, true);
    assert.equal(d.synthetic, true);
    assert.equal(d.fixture_version, "gauntlet-v1");
    assert.equal(d.pack_persona_id, id);
    assert.equal(d.persona_id, "PACK-" + id);
    assert.match(d.label, /synthetic fixture, not a real person/);
    assert.match(d.identity_note, /No real person's data/);
    // Identity hygiene: reserved domains only, TEST-marked name.
    assert.match(d.basics.name, /\(TEST\)$/);
    assert.match(d.basics.email, /@example\.test$/);
    assert.match(d.basics.phone, /^\+1 555-0/);
    assert.ok(!/vishnu|depaul/i.test(JSON.stringify(d)), "fixture must not carry a real person's data");
    // Profile shape.
    for (const k of ["basics", "constraints", "defaults", "preferences"]) assert.ok(d[k] && typeof d[k] === "object", k);
    assert.ok(Array.isArray(d.preferences.roles) && d.preferences.roles.length >= 1);
    // Facts: unique PACK- ids, full F1 fact fields, source + source class.
    assert.ok(Array.isArray(d.facts) && d.facts.length >= 7, "at least 7 facts");
    const ids = new Set();
    for (const f of d.facts) {
      assert.match(f.id, new RegExp("^PACK-" + id + "-F-\\d{3}$"), f.id);
      assert.ok(!ids.has(f.id), "duplicate fact id " + f.id);
      ids.add(f.id);
      assert.ok(typeof f.kind === "string" && f.kind.length > 0, f.id + " kind");
      assert.ok(typeof f.text === "string" && f.text.length >= 10, f.id + " text"); // F1 skill facts are short by design ("Skill: Python")
      assert.ok(Array.isArray(f.evidence), f.id + " evidence array");
      assert.equal(typeof f.needs_confirmation, "boolean", f.id + " needs_confirmation");
      assert.equal(f.source, "gauntlet-fixture", f.id + " source");
      assert.ok(SOURCE_CLASSES.has(f.source_class), f.id + " source_class: " + f.source_class);
    }
    // Manifest shape: known facts mirror the facts, unknowns/exclusions/effects present.
    assert.deepEqual(d.known_facts.map((k) => k.fact_id).sort(), [...ids].sort(), "known_facts mirror facts[]");
    assert.ok(d.unknown_facts.length >= 3, "unknowns present");
    for (const u of d.unknown_facts) {
      assert.equal(u.status, "unknown_by_design", u.topic);
      assert.match(u.agent_must, /^Ask the candidate\./, u.topic);
    }
    assert.ok(d.exclusions.length >= 4, "exclusions present");
    for (const e of d.exclusions) assert.ok(e.claim && e.reason, "exclusion claim+reason");
    assert.ok(d.allowed_effects.length >= 3 && d.forbidden_effects.length >= 3, "allowed/forbidden effects");
    assert.ok(d.expected_end_states.length >= 3, "expected end states");
  });
}

test("P2 fixture: the finance persona's defining facts are present (04 Part 5 row P2)", () => {
  const d = loadJson(path.join(PACK_DIR, "persona-p2.json"));
  const all = JSON.stringify(d).toLowerCase();
  for (const needle of ["finance & accounting", "sophomore", "non-target", "chicago", "search fund",
    "acquisition target", "venture", "pitch", "valuation", "finance club", "investment banking"]) {
    assert.ok(all.includes(needle), "P2 missing: " + needle);
  }
  assert.equal(d.constraints.graduationDate, "2028-05");
  assert.equal(d.constraints.needsSponsorship, false);
  // The SWE-contamination guard: no programming skill may be a P2 fact.
  const skillNames = d.facts.filter((f) => f.kind === "skill").map((f) => f.name);
  assert.ok(!skillNames.some((s) => /python|sql|java/i.test(s)), "P2 skills leaked SWE: " + skillNames);
});

test("P3 fixture: the nurse-switcher persona's defining facts are present (04 Part 5 row P3)", () => {
  const d = loadJson(path.join(PACK_DIR, "persona-p3.json"));
  const all = JSON.stringify(d).toLowerCase();
  for (const needle of ["32", "icu", "nurse", "data analyst", "sepsis", "excel", "tableau", "readmission"]) {
    assert.ok(all.includes(needle), "P3 missing: " + needle);
  }
  // Transferable-skills honesty: no paid data-analyst title may be claimed.
  assert.ok(d.exclusions.some((e) => /data analyst role or title/i.test(e.claim)));
});

test("P4 fixture: the F-1 persona's defining facts are present, split present/future (04 Part 5 row P4)", () => {
  const d = loadJson(path.join(PACK_DIR, "persona-p4.json"));
  const all = JSON.stringify(d).toLowerCase();
  for (const needle of ["f-1", "sponsorship", "may 2027", "m.s. computer science"]) {
    assert.ok(all.includes(needle), "P4 missing: " + needle);
  }
  assert.equal(d.constraints.graduationDate, "2027-05");
  assert.equal(d.constraints.needsSponsorship, true);
  const present = d.facts.find((f) => /PRESENT eligibility/.test(f.text));
  const future = d.facts.find((f) => /FUTURE need/.test(f.text));
  assert.ok(present && future && present.id !== future.id, "present eligibility and future sponsorship are separate facts");
  assert.ok(d.unknown_facts.some((u) => /STEM OPT/.test(u.topic)), "STEM OPT is unknown by design");
  // Nationality is deliberately not recorded; nothing may state one.
  assert.ok(!("nationality" in d.basics) && !("citizenship" in d.basics));
});

// ---------------------------------------------------------------- mapping

test("mapping: pack P1 is the F1 GAUNTLET-P1 profile dir, referenced not duplicated", () => {
  assert.equal(Personas.PACK_PERSONAS.P1.kind, "f1-profile-dir");
  assert.equal(Personas.PACK_PERSONAS.P1.dir, "p1-early-career-swe");
  assert.ok(!fs.existsSync(path.join(PACK_DIR, "persona-p1.json")), "pack P1 must not be duplicated as persona-p1.json");
  const raw = Personas.loadRawPackPersona("P1");
  assert.equal(raw.persona_id, "GAUNTLET-P1");
  assert.equal(raw.basics.name, "Maya Rivera (TEST)");
  const f1 = loadJson(path.join(Personas.GAUNTLET, "profiles", "p1-early-career-swe", "profile.json"));
  assert.deepEqual(raw.facts.map((f) => f.id), f1.facts.map((f) => f.id), "pack P1 facts ARE the F1 P1 facts");
});

test("mapping: colliding F1 ids are rejected, never silently aliased to pack personas", () => {
  for (const bad of ["GAUNTLET-P2", "GAUNTLET-P3", "GAUNTLET-P4"]) {
    assert.throws(() => Personas.resolvePersonaId(bad), /NOT a Quality Spec Pack persona/, bad);
  }
  assert.equal(Personas.resolvePersonaId("GAUNTLET-P1"), "P1"); // same slot in both systems
  assert.equal(Personas.resolvePersonaId("PACK-P2"), "P2");
  assert.equal(Personas.resolvePersonaId("p3"), "P3");
  assert.throws(() => Personas.resolvePersonaId("P9"), /Unknown pack persona id/);
});

// ---------------------------------------------------------------- loader

test("loader: every pack persona loads through the harness profile loader (profileFromData)", () => {
  for (const id of ["P1", "P2", "P3", "P4"]) {
    const raw = Personas.loadRawPackPersona(id);
    const profile = Personas.loadPackProfile(id);
    assert.equal(profile.pack_persona_id, id);
    assert.equal(profile.fixture_persona_id, raw.persona_id);
    assert.equal(profile.basics.name, raw.basics.name);
    assert.ok(profile.facts.length >= 7, id + " facts loaded");
    // Fact ids and texts survive the loader verbatim (ids are the audit trail).
    assert.deepEqual(profile.facts.map((f) => f.id), raw.facts.map((f) => f.id), id + " fact ids preserved");
    assert.deepEqual(profile.facts.map((f) => f.text), raw.facts.map((f) => f.text), id + " fact texts preserved");
    // Evidenced skills are proven; nothing unproven sneaks in as a skill claim.
    const unproven = CareerProfile.unprovenSkills(profile).map((f) => f.name);
    assert.deepEqual(unproven, [], id + " unproven skills: " + unproven);
  }
});

// ---------------------------------------------------------------- swap (S1)

const CONTEXT_MARKERS = {
  P1: { own: ["StudyBoard", "Software Engineer", "Python"], foreign: ["search fund", "sepsis", "Tableau", "F-1"] },
  P2: { own: ["search", "Investment Banking", "Finance Club"], foreign: ["StudyBoard", "sepsis", "Tableau", "F-1", "ICU"] },
  P3: { own: ["sepsis", "ICU", "Tableau", "readmission"], foreign: ["StudyBoard", "Investment Banking", "F-1", "Finance Club"] },
  P4: { own: ["F-1", "sponsorship", "Machine Learning Engineer"], foreign: ["StudyBoard", "sepsis", "Investment Banking", "Finance Club"] },
};

test("swap test (04 Part 5 S1): same ask, four personas -> four different, persona-appropriate contexts", () => {
  const contexts = {};
  for (const id of Object.keys(CONTEXT_MARKERS)) contexts[id] = Personas.assemblePersonaContext(id, ASK);
  const ids = Object.keys(contexts);
  for (let i = 0; i < ids.length; i++) {
    for (let j = i + 1; j < ids.length; j++) {
      assert.notEqual(contexts[ids[i]], contexts[ids[j]],
        `S1 failure shape: identical persona context for ${ids[i]} and ${ids[j]} on the same ask`);
    }
  }
  for (const [id, m] of Object.entries(CONTEXT_MARKERS)) {
    for (const own of m.own) assert.ok(contexts[id].includes(own), `${id} context missing its own marker: ${own}`);
    for (const foreign of m.foreign) assert.ok(!contexts[id].includes(foreign), `${id} context contaminated with another persona's marker: ${foreign}`);
    assert.ok(contexts[id].includes("ask: " + ASK), id + " context carries the shared ask");
  }
});

test("swap test: the parameterized profile itself changes with the persona selection", () => {
  const p1 = Personas.loadPackProfile("P1");
  const p2 = Personas.loadPackProfile("P2"); // explicit P2 selection, as a GAUNTLET_PERSONA=P2 runner would pass
  assert.notEqual(p1.basics.name, p2.basics.name);
  assert.notDeepEqual(p1.preferences.roles, p2.preferences.roles);
  assert.ok(p1.facts.some((f) => /StudyBoard/.test(f.text)) && !p2.facts.some((f) => /StudyBoard/.test(f.text)));
  assert.ok(p2.facts.some((f) => /[Ss]earch/.test(f.text)) && !p1.facts.some((f) => /search fund/i.test(f.text)));
});
