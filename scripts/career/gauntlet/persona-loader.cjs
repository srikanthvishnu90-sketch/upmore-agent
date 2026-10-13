// Persona loader + swap scaffolding for the Quality Spec Pack v1.0 personas
// (docs/quality-spec/04-GRADER-AND-ADVERSARIAL.md Part 5). GAUNTLET TOOLING
// ONLY — no product code is touched or changed by this file. It reuses the
// harness's existing profile loader path (122-career-profile profileFromData,
// exactly as pilot-lib.cjs's gauntletProfile does) so a pack persona is loaded
// the same way an F1 profile is loaded.
//
// WHY THIS FILE EXISTS (parameterization note):
//   The existing gauntlet runners hardcode F1 directory names, e.g.
//   pilot-lib gauntletProfile("p1-early-career-swe"), run-c-var-a.cjs's
//   PROFILE_DIRS, run-c-var-b.cjs's PDIR. There was no single place that could
//   select a PACK persona (04 Part 5: P1/P2/P3/P4) by id. This module is that
//   place. A runner parameterizes by persona like:
//
//     const Personas = require("./persona-loader.cjs");
//     const id = Personas.resolvePersonaId(process.env.GAUNTLET_PERSONA || "P1");
//     const profile = Personas.loadPackProfile(id);        // 122 profile object
//     const ctx = { profile };                             // same ctx shape the
//                                                          // existing runners pass
//                                                          // to L.chatTurn(...)
//
//   GAUNTLET_PERSONA accepts P1..P4 and PACK-P1..PACK-P4. It deliberately
//   REJECTS GAUNTLET-P2 / GAUNTLET-P3 / GAUNTLET-P4: those ids already mean
//   the F1 fixtures (international graduate / operations switcher /
//   experienced product) and silently aliasing them to the pack personas is
//   exactly the swap the pack mapping forbids. GAUNTLET-P1 is accepted only
//   because F1 P1 and pack P1 are the same slot (see PACK_PERSONAS.P1).
//
// MAPPING (pack -> fixture on disk) — the single source of truth for it:
//   PACK-P1 -> F1 GAUNTLET-P1, packages/career-data/fixtures/gauntlet/
//              profiles/p1-early-career-swe/{profile,manifest}.json
//              Maya Rivera (TEST), early-career SWE. REFERENCED, not copied:
//              there is intentionally no persona-p1.json in the pack fixture
//              directory.
//   PACK-P2 -> tests/fixtures/career-gauntlet/persona-p2.json (finance)
//   PACK-P3 -> tests/fixtures/career-gauntlet/persona-p3.json (nurse switcher)
//   PACK-P4 -> tests/fixtures/career-gauntlet/persona-p4.json (F-1 MS CS)
//
// assemblePersonaContext(id, ask) is the swap-test surface: it deterministically
// assembles the persona context a parameterized run would carry for one ask,
// from the raw fixture data only (facts, unknowns, exclusions, preferences,
// constraints). Two personas given the same ask must assemble different
// contexts; identical contexts across personas on a personalized ask are the
// 04 Part 5 S1 failure, and tests/career-quality-personas.test.cjs asserts it.
"use strict";
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..", "..", "..");
const GAUNTLET = path.join(ROOT, "packages", "career-data", "fixtures", "gauntlet");
const PACK_DIR = path.join(ROOT, "tests", "fixtures", "career-gauntlet");
const CareerProfile = require(path.join(ROOT, "packages", "domain", "122-career-profile.js"));

const loadJson = (p) => JSON.parse(fs.readFileSync(p, "utf8"));

const PACK_PERSONAS = {
  P1: {
    pack_id: "P1",
    persona_id: "GAUNTLET-P1",
    kind: "f1-profile-dir",
    dir: "p1-early-career-swe",
    note: "Pack P1 IS the existing F1 SWE fixture persona (referenced, not duplicated).",
  },
  P2: { pack_id: "P2", persona_id: "PACK-P2", kind: "pack-persona-file", file: "persona-p2.json" },
  P3: { pack_id: "P3", persona_id: "PACK-P3", kind: "pack-persona-file", file: "persona-p3.json" },
  P4: { pack_id: "P4", persona_id: "PACK-P4", kind: "pack-persona-file", file: "persona-p4.json" },
};

function resolvePersonaId(input) {
  const raw = String(input == null ? "" : input).trim();
  const up = raw.toUpperCase();
  if (/^PACK-P[1-4]$/.test(up)) return up.slice("PACK-".length);
  if (/^P[1-4]$/.test(up)) return up;
  if (up === "GAUNTLET-P1") return "P1"; // same slot in both systems — see header
  if (/^GAUNTLET-P[2-4]$/.test(up)) {
    throw new Error(
      up + " is an F1 gauntlet fixture id (p2-international-graduate / " +
      "p3-career-switcher / p4-experienced-product), NOT a Quality Spec Pack " +
      "persona. Use P2/P3/P4 or PACK-P2/PACK-P3/PACK-P4 for the pack personas; " +
      "the two numbering systems must never be silently aliased."
    );
  }
  throw new Error("Unknown pack persona id: " + JSON.stringify(raw) + " (expected P1..P4 or PACK-P1..PACK-P4)");
}

// Raw unified fixture record for a pack persona: the profile-shaped fields
// (basics/constraints/defaults/preferences/facts) plus the manifest-shaped
// sections (known_facts/unknown_facts/exclusions/allowed_effects/
// forbidden_effects/expected_end_states), whichever file layout stores them.
function loadRawPackPersona(input) {
  const id = resolvePersonaId(input);
  const def = PACK_PERSONAS[id];
  if (def.kind === "f1-profile-dir") {
    const dir = path.join(GAUNTLET, "profiles", def.dir);
    const profile = loadJson(path.join(dir, "profile.json"));
    const manifest = loadJson(path.join(dir, "manifest.json"));
    return Object.assign({}, profile, {
      pack_id: id,
      pack_persona_id: id,
      source_layout: "f1-profile-dir:" + def.dir,
      known_facts: manifest.known_facts || [],
      unknown_facts: manifest.unknown_facts || [],
      exclusions: manifest.exclusions || [],
      allowed_effects: manifest.allowed_effects || [],
      forbidden_effects: manifest.forbidden_effects || [],
      expected_end_states: manifest.expected_end_states || [],
    });
  }
  const data = loadJson(path.join(PACK_DIR, def.file));
  if (data.pack_persona_id !== id || data.persona_id !== def.persona_id) {
    throw new Error(def.file + ": persona id mismatch (pack_persona_id=" + data.pack_persona_id + ", persona_id=" + data.persona_id + ")");
  }
  return Object.assign({}, data, { pack_id: id, source_layout: "pack-persona-file:" + def.file });
}

// The harness profile loader path: raw fixture data -> 122-career-profile
// profileFromData, identical to pilot-lib.cjs gauntletProfile(dirName).
function loadPackProfile(input) {
  const raw = loadRawPackPersona(input);
  const profile = CareerProfile.profileFromData(raw);
  profile.pack_persona_id = raw.pack_id;
  profile.fixture_persona_id = raw.persona_id;
  profile.source_layout = raw.source_layout;
  return profile;
}

// Deterministic persona-context assembly for one ask. This is what a
// parameterized run carries alongside the profile; the swap test compares it
// across personas for the SAME ask.
function assemblePersonaContext(input, ask) {
  const raw = loadRawPackPersona(input);
  const skills = (raw.facts || []).filter((f) => f.kind === "skill").map((f) => f.name).filter(Boolean);
  const lines = [];
  lines.push("PERSONA CONTEXT (synthetic fixture — harness only)");
  lines.push("pack_persona: " + raw.pack_id + " (" + raw.persona_id + ")");
  lines.push("ask: " + String(ask || ""));
  lines.push("name: " + (raw.basics && raw.basics.name));
  lines.push("label: " + raw.label);
  lines.push("target_roles: " + ((raw.preferences && raw.preferences.roles) || []).join("; "));
  lines.push("industries: " + ((raw.preferences && raw.preferences.industries) || []).join("; "));
  lines.push("locations: " + ((raw.preferences && raw.preferences.locations) || []).join("; "));
  const c = raw.constraints || {};
  lines.push("constraints: graduation=" + c.graduationDate + " start=" + c.startDate +
    " work_authorization=" + c.workAuthorization + " needs_sponsorship=" + c.needsSponsorship);
  lines.push("evidenced_skills: " + skills.join("; "));
  lines.push("facts:");
  for (const f of raw.facts || []) lines.push("- [" + f.id + "] " + f.text);
  lines.push("unknowns (ask, never fill):");
  for (const u of raw.unknown_facts || []) lines.push("- " + u.topic);
  lines.push("exclusions (never claim):");
  for (const e of raw.exclusions || []) lines.push("- " + e.claim);
  return lines.join("\n");
}

module.exports = { ROOT, GAUNTLET, PACK_DIR, PACK_PERSONAS, resolvePersonaId, loadRawPackPersona, loadPackProfile, assemblePersonaContext };
