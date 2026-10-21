/* Career PRE-DRIVE FORM INVENTORY (Lane G, owner ruling 2026-10-21 13:56 CDT).
   Pure domain module, UMD like the other domain modules. No I/O.

   The gap this closes (2026-10-21 structuring audit, gap 5): batches were
   approved blind and stops were discovered MID-DRAIN, by hitting them.
   This module turns a form snapshot — the field list a drive observes
   BEFORE any fill — into a structured question inventory, joins it
   against the user's facts under module 149's OWN coverage rules, and
   returns a per-posting verdict, so an approval card can state coverage
   ("47 of 50 fully covered; these stop on X") computed, not hoped.

   Inputs — two snapshot shapes, both produced by the existing drive:
     (a) RAW: module 150's discover output — raw DOM fields
         { label, name, id, tag, inputType, required, groupLabel,
           options?, selector, cls }. Classification reuses module 150's
         classifyFields (the same code the drive classifies with), so
         control types and select/radio option texts are carried.
     (b) DEFS: module 149/150's classified defs — what the worker board
         service's form() returns over the wire
         { field_id, label, kind, profile_key?, question_key?, required }.
         The wire carries no control type and no options; records built
         from defs say control "unknown" / control_source
         "defs_snapshot" and options null. NEVER invented.

   Question kinds (the card taxonomy): identity / education /
   experience / eeo / essay / unknown. The projection from 149 kinds:
   eeo -> eeo; free_text -> essay; education profile/question keys ->
   education; experience question keys -> experience; the remaining
   canonical standard/screening keys (identity + eligibility about the
   person) -> identity; attestation and anything unrecognized ->
   unknown. Unknown is a real answer, never force-classified: an
   unrecognized field stays unknown and, when required, is a named stop.

   Coverage — module 149's fill decision, evaluated WITHOUT a board,
   with 149's own code where it exists (profileValue for standard keys;
   deriveAnswers' confirmed-only rule for bank input):
     standard    covered iff profileValue(profile, profile_key) is a
                 non-empty value on the TRUSTED profile view.
     screening   covered iff answers[question_key] exists with
                 confirmed === true and a defined value; an existing
                 but unconfirmed answer stops "answer_unconfirmed".
     free_text   covered iff the answer is confirmed AND draft === true
                 (149's rule); otherwise "needs_user_draft_confirmation".
     eeo         always covered — 149 fills the user's eeoChoice or the
                 decline default; covered_by names which.
     attestation covered iff attestations[field_id].explicit === true;
                 otherwise "attestation_requires_explicit_confirmation"
                 (a stop the approval tap itself resolves — named as such).
     unknown     never covered by facts: "unknown_field_category".
   "Covered" means exactly: no REQUIRED question lacks a trusted fact —
   the precondition 149 needs to reach the doorstep. It is NOT a promise
   the drive succeeds (widgets and readback drift can still stop it).

   D-007 quarantine discipline: facts are read ONLY through a reader
   seam shaped for module 167's trusted-fact reader
   ({ trustedProfile(profile), trustedBank(bank), mode }). Module 167
   is vendored in this tree (packages/domain/167-career-trusted-facts.js)
   and is the DEFAULT reader, adapted to this seam (its isQuarantined
   is the single quarantine predicate: needs_confirmation, status in
   {draft, quarantined, held, suppressed}, or quarantined === true).
   An injected reader (createInventory({ factReader }) / the opts of
   coverageFor) still wins. If 167 cannot be resolved, resolution
   fails CLOSED to a conservative stub: bank facts count only when
   status === "confirmed" and not quarantined; profile answers
   flagged quarantined and profile keys named in
   profile.quarantinedKeys are withheld. Every verdict stamps
   reader_mode so a stub-backed verdict can never be mistaken for a
   167-backed one. */
(function (root) {
  "use strict";
  const VERSION = 1;

  let Portal149 = null;
  let Browser150 = null;
  try { Portal149 = require("./149-career-portal-apply.js"); } catch (e) { Portal149 = null; }
  try { Browser150 = require("./150-career-portal-browser.js"); } catch (e) { Browser150 = null; }

  const QUESTION_KINDS = ["identity", "education", "experience", "eeo", "essay", "unknown"];

  // ---------- question-kind projection (149 kind + keys -> card taxonomy) ----------
  const EDUCATION_PROFILE_KEYS = new Set([
    "education_school", "education_degree", "education_discipline", "education_gpa",
    "education_graduation_year", "education_start_date", "education_end_date",
  ]);
  const EDUCATION_QUESTION_KEYS = new Set(["education_level", "education_level_completed"]);
  const EXPERIENCE_QUESTION_KEYS = new Set(["years_of_experience", "experience_3mo_plus"]);
  function classifyQuestionKind(def) {
    if (!def) return "unknown";
    const kind = def.kind || "unknown";
    if (kind === "eeo") return "eeo";
    if (kind === "free_text") return "essay";
    if (def.profile_key && EDUCATION_PROFILE_KEYS.has(def.profile_key)) return "education";
    if (def.profile_key === "education") return "education";
    if (def.question_key && EDUCATION_QUESTION_KEYS.has(def.question_key)) return "education";
    if (def.question_key && EXPERIENCE_QUESTION_KEYS.has(def.question_key)) return "experience";
    if (kind === "standard") return "identity"; // name/email/phone/location/links/resume/country/…
    if (kind === "screening") return "identity"; // work_authorization/sponsorship/age_18_plus/located_in_us — the person's own eligibility facts
    return "unknown"; // attestation + anything unrecognized: never force-classified
  }

  // ---------- control-type projection ----------
  // Precedence is deliberate: 150's bindingFor COLLAPSES every plain
  // input to inputType "text" (the helper drives email/tel/textarea
  // uniformly), so the binding is authoritative only for the structural
  // cases it actually decides — groups, native selects, file inputs,
  // the name pair. Otherwise the raw element's own tag/inputType is the
  // finer truth and wins.
  const KNOWN_CONTROLS = ["text", "email", "tel", "url", "number", "date", "file", "select", "textarea", "checkbox", "radio", "password", "search"];
  function controlOf(binding, raw) {
    const bit = binding && binding.inputType;
    if (bit === "radio_group") return { control: "radio", control_source: "binding" };
    if (bit === "checkbox_group") return { control: "checkbox", control_source: "binding" };
    if (bit === "name_pair") return { control: "text", control_source: "binding" };
    if (bit === "select" || bit === "file") return { control: bit, control_source: "binding" };
    if (raw) {
      if (raw.tag === "textarea") return { control: "textarea", control_source: "snapshot" };
      if (raw.tag === "select") return { control: "select", control_source: "snapshot" };
      if (KNOWN_CONTROLS.includes(raw.inputType)) return { control: raw.inputType, control_source: "snapshot" };
    }
    if (KNOWN_CONTROLS.includes(bit)) return { control: bit, control_source: "binding" };
    if (bit || (raw && raw.inputType)) return { control: "unknown", control_source: "unrecognized_input_type" };
    return { control: "unknown", control_source: "unavailable" };
  }
  function optionsOf(binding, raw) {
    const src = (binding && Array.isArray(binding.options) && binding.options.length ? binding.options : null)
      || (raw && Array.isArray(raw.options) && raw.options.length ? raw.options : null);
    if (!src) return null;
    const texts = src.map((o) => {
      if (o == null) return "";
      if (typeof o === "string") return o;
      return String(o.label != null ? o.label : (o.text != null ? o.text : (o.value != null ? o.value : ""))).trim();
    }).filter((t) => t !== "");
    return texts.length ? texts : null;
  }

  // ---------- inventory: snapshot -> records ----------
  function recordFromDef(def, binding, raw) {
    const c = controlOf(binding, raw);
    return {
      field_id: def.field_id,
      label: def.label || def.field_id,
      control: c.control,
      control_source: c.control_source,
      required: !!def.required,
      options: optionsOf(binding, raw),
      question_kind: classifyQuestionKind(def),
      source_kind: def.kind || "unknown",
      profile_key: def.profile_key || null,
      question_key: def.question_key || null,
    };
  }
  function isRawField(f) {
    return !!f && typeof f === "object" && !("kind" in f) && ("inputType" in f || "tag" in f || "selector" in f);
  }
  function inventoryFromSnapshot(snapshot, opts) {
    const snap = snapshot || {};
    const fields = Array.isArray(snap.fields) ? snap.fields : [];
    const records = [];
    let sourceShape = "empty";
    if (fields.length && isRawField(fields[0])) {
      sourceShape = "raw";
      if (!Browser150 || typeof Browser150.classifyFields !== "function") {
        // No classifier on hand: every field stays unknown rather than
        // being force-classified by a second, drifting rule set.
        for (const f of fields) {
          if (f.disabled || f.readOnly) continue;
          records.push({
            field_id: f.name || f.id || f.selector || "field",
            label: (f.label || f.groupLabel || f.name || f.id || "field"),
            control: controlOf(null, f).control, control_source: "snapshot",
            required: !!f.required, options: optionsOf(null, f),
            question_kind: "unknown", source_kind: "unknown", profile_key: null, question_key: null,
          });
        }
      } else {
        const { defs, bindings } = Browser150.classifyFields(fields);
        const rawBySelector = new Map();
        for (const f of fields) if (f && f.selector) rawBySelector.set(f.selector, f);
        for (const def of defs) {
          const binding = bindings[def.field_id] || null;
          const raw = binding && binding.selector ? rawBySelector.get(binding.selector) : null;
          records.push(recordFromDef(def, binding, raw));
        }
      }
    } else if (fields.length) {
      sourceShape = "defs";
      const bindings = snap.bindings || {};
      for (const def of fields) records.push(recordFromDef(def, bindings[def.field_id] || null, null));
    }
    return {
      version: VERSION,
      source_shape: sourceShape,
      captcha: snap.captcha != null ? snap.captcha : (snap.captchaAt != null ? snap.captchaAt : null),
      field_count: records.length,
      required_count: records.filter((r) => r.required).length,
      fields: records,
    };
  }

  // ---------- the fact reader (module 167 default; stub = fail-closed fallback) ----------
  function isTrustedFact(f) {
    return !!f && f.status === "confirmed" && f.needs_confirmation !== true
      && f.quarantined !== true && f.status !== "quarantined";
  }
  function createStubFactReader() {
    return {
      mode: "stub-167-absent",
      trustedBank(bank) {
        if (!bank || !Array.isArray(bank.facts)) return { bank: bank || null, excluded_quarantined: 0, excluded_unconfirmed: 0 };
        let q = 0, u = 0;
        const facts = bank.facts.filter((f) => {
          if (f && (f.quarantined === true || f.status === "quarantined")) { q += 1; return false; }
          if (!isTrustedFact(f)) { u += 1; return false; }
          return true;
        });
        return { bank: Object.assign({}, bank, { facts }), excluded_quarantined: q, excluded_unconfirmed: u };
      },
      trustedProfile(profile) {
        if (!profile) return { profile: null, withheld_keys: [] };
        const withheld = Array.isArray(profile.quarantinedKeys) ? profile.quarantinedKeys.slice() : [];
        const out = Object.assign({}, profile);
        for (const k of withheld) delete out[k];
        if (profile.answers && typeof profile.answers === "object") {
          const answers = {};
          for (const [k, a] of Object.entries(profile.answers)) {
            if (a && a.quarantined === true) { withheld.push(`answers.${k}`); continue; }
            answers[k] = a;
          }
          out.answers = answers;
        }
        delete out.quarantinedKeys;
        return { profile: out, withheld_keys: withheld };
      },
    };
  }
  // Adapter: module 167's real API (trustedFacts / trustedProfile /
  // isQuarantined over a profile's facts array) behind this module's
  // reader seam ({ trustedBank, trustedProfile, mode }). 167's
  // isQuarantined is the quarantine predicate on both paths; the
  // profile path additionally honors the profile store's own hold
  // list (profile.quarantinedKeys) and per-answer hold flags, and
  // reports what it withheld. Confirmation itself is NOT the reader's
  // call — fieldCoverage enforces it, mirroring 149.
  function create167FactReader(m167) {
    return {
      mode: "module-167",
      trustedBank(bank) {
        if (!bank || !Array.isArray(bank.facts)) return { bank: bank || null, excluded_quarantined: 0, excluded_unconfirmed: 0 };
        let q = 0;
        const facts = bank.facts.filter((f) => {
          if (m167.isQuarantined(f)) { q += 1; return false; }
          return true;
        });
        // 167 clears everything not quarantined (a fact carrying no
        // hold signal is cleared — the default 122 stamps), so there
        // is no separate unconfirmed exclusion to count.
        return { bank: Object.assign({}, bank, { facts }), excluded_quarantined: q, excluded_unconfirmed: 0 };
      },
      trustedProfile(profile) {
        if (!profile) return { profile: null, withheld_keys: [] };
        const base = m167.trustedProfile(profile); // filters profile.facts via 167
        const withheld = Array.isArray(base.quarantinedKeys) ? base.quarantinedKeys.slice() : [];
        const out = Object.assign({}, base);
        for (const k of withheld) delete out[k];
        if (base.answers && typeof base.answers === "object") {
          const answers = {};
          for (const [k, a] of Object.entries(base.answers)) {
            if (m167.isQuarantined(a)) { withheld.push(`answers.${k}`); continue; }
            answers[k] = a;
          }
          out.answers = answers;
        }
        delete out.quarantinedKeys;
        return { profile: out, withheld_keys: withheld };
      },
    };
  }
  // Probe for module 167 (either plausible filename) by EXPORT SHAPE,
  // never by name alone: the real module exports plain functions
  // (isQuarantined / trustedFacts / trustedProfile); a factory-shaped
  // reader in this seam's own shape is also accepted. Unresolvable ->
  // null, and the caller fails closed to the stub.
  function probe167() {
    for (const name of ["./167-career-trusted-facts.js", "./167-career-fact-reader.js"]) {
      try {
        const m = require(name);
        if (m && typeof m.isQuarantined === "function" && typeof m.trustedFacts === "function" && typeof m.trustedProfile === "function") {
          return create167FactReader(m);
        }
        const r = m && (typeof m.createFactReader === "function" ? m.createFactReader()
          : (typeof m.createTrustedFactReader === "function" ? m.createTrustedFactReader() : null));
        if (r && typeof r.trustedProfile === "function" && typeof r.trustedBank === "function") {
          return Object.assign({ mode: "module-167" }, r);
        }
      } catch (e) { /* not resolvable — the caller fails closed to the stub */ }
    }
    return null;
  }
  let cachedDefaultReader = null;
  function defaultFactReader() {
    if (!cachedDefaultReader) cachedDefaultReader = probe167() || createStubFactReader();
    return cachedDefaultReader;
  }

  // ---------- bank -> 149 profile projection (mirrors production-sources) ----------
  function profileFromBank(bank) {
    const b = (bank && bank.basics) || {};
    const profile = {};
    for (const k of ["name", "email", "phone", "location", "linkedin", "github", "website", "current_company", "country"]) {
      if (b[k] !== undefined && b[k] !== null && b[k] !== "") profile[k] = b[k];
    }
    if (bank && bank.resume && bank.resume.sha256) profile.resume = { filename: bank.resume.filename || "resume.pdf", sha256: bank.resume.sha256 };
    let answers = {};
    if (Portal149 && typeof Portal149.deriveAnswers === "function") {
      const derived = Portal149.deriveAnswers(bank, Date.now());
      answers = derived.answers || {};
      for (const [k, v] of Object.entries(derived.profileFields || {})) if (profile[k] === undefined) profile[k] = v;
    }
    // stored confirmed answers ride verbatim (module 149's composition)
    if (bank && bank.answers && typeof bank.answers === "object") {
      for (const [k, a] of Object.entries(bank.answers)) if (answers[k] === undefined) answers[k] = a;
    }
    profile.answers = answers;
    return profile;
  }

  // ---------- coverage join: inventory x facts -> verdict ----------
  function profileValueOf(profile, key) {
    if (Portal149 && typeof Portal149.profileValue === "function") return Portal149.profileValue(profile, key);
    if (!profile || !key) return undefined;
    if (key === "resume") return profile.resume;
    if (key.startsWith("education_")) {
      const sub = key.slice("education_".length);
      if (profile.education && profile.education[sub] !== undefined) return profile.education[sub];
      return profile[key];
    }
    return profile[key];
  }
  function fieldCoverage(rec, view) {
    const { profile, attestations } = view;
    const kind = rec.source_kind;
    if (kind === "standard") {
      const raw = profileValueOf(profile, rec.profile_key);
      if (raw === undefined || raw === null || raw === "") return { covered: false, reason: "no_confirmed_fact" };
      return { covered: true, covered_by: rec.profile_key === "resume" ? "profile_resume" : "profile" };
    }
    if (kind === "screening") {
      const a = (profile.answers || {})[rec.question_key];
      if (a && a.confirmed === true && a.value !== undefined) return { covered: true, covered_by: "confirmed_answer" };
      return { covered: false, reason: a ? "answer_unconfirmed" : "no_confirmed_fact" };
    }
    if (kind === "free_text") {
      const a = (profile.answers || {})[rec.question_key];
      if (a && a.confirmed === true && a.draft === true && a.value !== undefined) return { covered: true, covered_by: "confirmed_draft" };
      return { covered: false, reason: "needs_user_draft_confirmation" };
    }
    if (kind === "eeo") {
      return { covered: true, covered_by: profile.eeoChoice ? "user_eeo_choice" : "eeo_default_decline" };
    }
    if (kind === "attestation") {
      const att = (attestations || {})[rec.field_id];
      if (att && att.explicit === true && att.value !== undefined) return { covered: true, covered_by: "explicit_attestation" };
      return { covered: false, reason: "attestation_requires_explicit_confirmation" };
    }
    return { covered: false, reason: "unknown_field_category" };
  }
  function coverageFor(inventory, factSet, opts) {
    const o = opts || {};
    const reader = o.factReader || defaultFactReader();
    const fs0 = factSet || {};
    let profile = null, attestations = fs0.attestations || {};
    let excludedQuarantined = 0, excludedUnconfirmed = 0, withheldKeys = [];
    if (fs0.bank) {
      const tb = reader.trustedBank(fs0.bank);
      excludedQuarantined = tb.excluded_quarantined || 0;
      excludedUnconfirmed = tb.excluded_unconfirmed || 0;
      profile = profileFromBank(tb.bank);
    } else if (fs0.profile) {
      const tp = reader.trustedProfile(fs0.profile);
      withheldKeys = tp.withheld_keys || [];
      profile = tp.profile;
    }
    profile = profile || {};
    const stops = [], optionalUncovered = [], coveredFields = [];
    for (const rec of (inventory && inventory.fields) || []) {
      const c = fieldCoverage(rec, { profile, attestations });
      const entry = { field_id: rec.field_id, label: rec.label, question_kind: rec.question_kind, source_kind: rec.source_kind };
      if (c.covered) coveredFields.push(Object.assign({}, entry, { covered_by: c.covered_by }));
      else if (rec.required) stops.push(Object.assign({}, entry, { reason: c.reason }));
      else optionalUncovered.push(Object.assign({}, entry, { reason: c.reason }));
    }
    return {
      version: VERSION,
      covered: stops.length === 0,
      // A form exposing ZERO required questions is vacuous evidence —
      // the application form may never have been reached (149's own
      // EMPTY_FORM discipline, mirrored): "covered" with vacuous set
      // must never be read as a real coverage pass.
      vacuous: (inventory ? inventory.required_count : 0) === 0,
      reader_mode: reader.mode || "unknown",
      excluded_quarantined_facts: excludedQuarantined,
      excluded_unconfirmed_facts: excludedUnconfirmed,
      withheld_profile_keys: withheldKeys,
      field_count: inventory ? inventory.field_count : 0,
      required_count: inventory ? inventory.required_count : 0,
      covered_count: coveredFields.length,
      stops,
      optional_uncovered: optionalUncovered,
      covered_fields: coveredFields,
    };
  }

  // ---------- the batch-card coverage line ----------
  // items: [{ company, title, verdict }] — the owner's card format:
  // "N of M fully covered; the rest stop on named questions."
  function batchCoverageLine(items) {
    const list = items || [];
    const total = list.length;
    const ok = list.filter((i) => i.verdict && i.verdict.covered);
    let line = `Coverage: ${ok.length} of ${total} fully covered`;
    const bad = list.filter((i) => !(i.verdict && i.verdict.covered));
    if (bad.length) {
      const parts = bad.map((i) => {
        const names = (i.verdict.stops || []).map((s) => s.label).join("; ");
        return `${i.company} — ${i.title} stops on: ${names || "unreadable form"}`;
      });
      line += `; ${bad.length} stop${bad.length === 1 ? "s" : ""} on uncovered required questions — ${parts.join(" · ")}`;
    } else if (total) {
      line += " — every required question on every form is answered by a confirmed fact on file";
    }
    const vac = ok.filter((i) => i.verdict && i.verdict.vacuous);
    if (vac.length) {
      line += ` — note: ${vac.map((i) => `${i.company} — ${i.title}`).join(" · ")} showed no required questions (the application form may not have been reached; that "covered" is vacuous)`;
    }
    return line;
  }

  function createInventory(opts) {
    const o = opts || {};
    const factReader = o.factReader || defaultFactReader();
    return {
      version: VERSION,
      reader_mode: factReader.mode || "unknown",
      inventoryFromSnapshot: (snap) => inventoryFromSnapshot(snap),
      coverageFor: (inv, factSet) => coverageFor(inv, factSet, { factReader }),
      batchCoverageLine,
      classifyQuestionKind,
    };
  }

  const api = {
    VERSION, QUESTION_KINDS,
    inventoryFromSnapshot, classifyQuestionKind, coverageFor, batchCoverageLine,
    createStubFactReader, create167FactReader, createInventory, profileFromBank,
  };
  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.CareerFormInventory = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
