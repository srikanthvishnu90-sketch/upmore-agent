/* CANONICAL PROFILE STRUCTURER (Lane F, owner ruling 2026-10-21) — a
   user's confirmed facts become ONE canonical, platform-shaped profile:
   headline, normalized education / experience entries, canonical date /
   degree / GPA formats — that boards and surfaces consume, instead of
   every form re-deriving fields from a raw fact list.

   POSITION IN THE STACK:
     - INPUT is trusted facts ONLY, read through the shared trusted-fact
       reader contract (module 167, D-007 quarantine). 167 is a lane in
       flight and has NOT landed on this base: this module ships a stub
       implementing the documented contract (READER_CONTRACT below) and
       accepts the real reader by injection (deps.reader) at integration
       time. model.reader.stub says which one ran — never silently.
     - Fact shapes consumed (both are standing shapes in this repo):
       (a) fact-bank facts (module 122): { id, kind, title, text,
           bullets, status, needs_confirmation, source, data? } — the
           optional `data` object carries structured slots when the
           producer has them ({school, degree, discipline, start, end,
           gpa, ...}); without it the entry is carried UNSTRUCTURED with
           a gap flag per missing slot — free text is never parsed into
           structure it does not declare.
       (b) host stated facts (career_host): { kind, key?, value } —
           assertion-only by construction, so they carry no status and
           are trusted as-is; kinds read here: school, majors, year,
           geography, level, goal, target_firm (tone is not
           profile-shaped and is reported unplaced, never dropped).
     - OUTPUT feeds: module 149's standing profile contract (the
       Greenhouse-shaped flat profile + F-001 education shape it
       resolves form fields against) via toBoardProfile, and module
       157's connector match profile ({needs, offers} carriage under
       profile._careerConnector) via toMatchProfile. One model, both
       shapes — that is the point of the lane.

   NORMALIZATION LAW: every normalization is an explicit, named rule
   (RULES below) and is REVERSIBLE — every normalized field carries
   { value, verbatim, fact_id, rule }: the normalized value, the
   original value exactly as the fact stated it, the source fact's id,
   and the rule that produced it. Nothing is converted silently; a GPA
   is never rescaled, a year-only date never grows a month, a degree
   that matches no canonical token stays verbatim and flagged.

   GAP LAW: a missing element is a GAP FLAG ({code, where, detail}) on
   the model — never invented, never smoothed over. The standing test
   case: graduation month. A fact whose end date has year precision
   only renders as the year and is flagged DATE_PARTIAL.

   Pure + deterministic: no clock, no randomness; the one timestamped
   emitter (match profile) takes its timestamp from the caller, in
   module 157's never-guess-the-clock discipline. UMD like the other
   domain modules. */
const CareerProfileStructure = (() => {
  "use strict";

  const VERSION = 1;
  const MODEL_KIND = "career_canonical_profile";

  // ================= module 167 reader contract (STUB) =================
  // CONTRACT v1 — shared trusted-fact reader (D-007 quarantine bypass fix):
  //   readTrustedFacts(facts) -> { trusted: [fact...],
  //     quarantined: [{ fact, reason }] }
  //   A fact is QUARANTINED (excluded, with reason) when:
  //     QUARANTINED_FLAG        fact.quarantined === true, or
  //                             fact.trust === "quarantined", or
  //                             fact.status === "quarantined"
  //     UNCONFIRMED_DRAFT       fact.needs_confirmation === true, or
  //                             fact.status === "draft" (122's drafts:
  //                             resume/LinkedIn ingest arrives draft and
  //                             may only be read after confirmation)
  //     UNRESOLVED_PLACEHOLDER  a placeholder-shaped value ("[28]")
  //                             ANYWHERE in the record (checked over the
  //                             serialized record, so a placeholder
  //                             hidden in a structured payload is still
  //                             caught) — an unresolved slot is not a
  //                             fact, wherever it sits.
  //   Host stated facts carry no status (assertion-only by
  //   construction) and pass unless explicitly quarantined.
  // When 167 lands, integration injects it as deps.reader and this stub
  // is bypassed; until then the stub IS the enforcement and the model
  // records reader.stub: true.
  const READER_CONTRACT = Object.freeze({
    module: 167, version: 1, fn: "readTrustedFacts",
    reasons: ["QUARANTINED_FLAG", "UNCONFIRMED_DRAFT", "UNRESOLVED_PLACEHOLDER"],
  });
  const PLACEHOLDER_RE = /\[\d+\]/;
  const isPlaceholder = (v) => typeof v === "string" && PLACEHOLDER_RE.test(v);
  function stubReadTrustedFacts(facts) {
    const trusted = []; const quarantined = [];
    for (const f of Array.isArray(facts) ? facts : []) {
      if (!f || typeof f !== "object") continue;
      let reason = null;
      if (f.quarantined === true || f.trust === "quarantined" || f.status === "quarantined") reason = "QUARANTINED_FLAG";
      else if (f.needs_confirmation === true || f.status === "draft") reason = "UNCONFIRMED_DRAFT";
      else if (PLACEHOLDER_RE.test(JSON.stringify(f))) reason = "UNRESOLVED_PLACEHOLDER";
      if (reason) quarantined.push({ fact: f, reason });
      else trusted.push(f);
    }
    return { trusted, quarantined };
  }

  // ================= small helpers =================
  const cleanStr = (v) => (typeof v === "string" ? v.trim().replace(/\s+/g, " ") : (typeof v === "number" && Number.isFinite(v) ? String(v) : null));
  const listOf = (v) => (Array.isArray(v) ? v : (v == null ? [] : [v]));
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  function monthOf(name) {
    if (name == null) return null;
    if (typeof name === "number") return name >= 1 && name <= 12 ? name : null;
    const s = String(name).trim().toLowerCase();
    let i = MONTHS.findIndex((m) => m.toLowerCase() === s); if (i >= 0) return i + 1;
    i = MONTH_SHORT.findIndex((m) => m.toLowerCase() === s); if (i >= 0) return i + 1;
    return null;
  }
  // A field record: the ONLY shape a normalized value travels in.
  const FR = (value, verbatim, fact_id, rule) => ({ value, verbatim, fact_id, rule });

  // ================= spans (dates) =================
  // Date point: { year, month|null, precision: "month"|"year" } — month
  // precision exists ONLY where the fact carries a month. Present:
  // { present: true }.
  function normPoint(v) {
    if (v == null) return null;
    if (typeof v === "object") {
      if (v.present === true || v.current === true) return { present: true };
      const year = v.year != null ? Number(v.year) : null;
      if (!year) return null;
      const month = monthOf(v.month);
      return { year, month, precision: month ? "month" : "year" };
    }
    const s = cleanStr(v);
    if (!s) return null;
    if (/^(present|current|now)$/i.test(s)) return { present: true };
    const m = s.match(/^(?:([A-Za-z]+)\.?\s+)?(\d{4})$/);
    if (m) { const month = m[1] ? monthOf(m[1]) : null; return { year: Number(m[2]), month, precision: month ? "month" : "year" }; }
    const y = s.match(/^(\d{4})$/);
    if (y) return { year: Number(y[1]), month: null, precision: "year" };
    return null; // unparseable date text: caller flags it, never guesses
  }
  function pointText(p) {
    if (!p) return null;
    if (p.present) return "Present";
    return p.month ? `${MONTHS[p.month - 1]} ${p.year}` : String(p.year);
  }
  // Span from a data payload: {start, end} | {dates: "2025-2029"} |
  // {start_year/end_year(+_month)} | {graduation_year} (education end).
  function normSpan(d) {
    let start = null, end = null, raw = null;
    if (typeof d.dates === "string" && d.dates.trim()) {
      raw = d.dates;
      const parts = d.dates.split(/\s*[–—-]\s*/).filter(Boolean);
      if (parts.length >= 2) { start = normPoint(parts[0]); end = normPoint(parts.slice(1).join(" - ")); }
      else if (parts.length === 1) end = normPoint(parts[0]);
    }
    if (!start) start = normPoint(d.start != null ? d.start : (d.start_year != null ? { year: d.start_year, month: d.start_month } : (d.start_date != null ? d.start_date : null)));
    if (!end) end = normPoint(d.end != null ? d.end : (d.end_year != null ? { year: d.end_year, month: d.end_month } : (d.end_date != null ? d.end_date : (d.graduation_year != null ? { year: d.graduation_year } : (d.current ? { present: true } : null)))));
    if (!start && !end) return null;
    const text = start && end ? `${pointText(start)} – ${pointText(end)}` : pointText(end || start);
    return { start, end, text, verbatim: raw != null ? raw : undefined };
  }
  const spanSortKey = (sp) => {
    if (!sp) return 0;
    const e = sp.end, s = sp.start;
    const ey = e ? (e.present ? 9999 : (e.year || 0)) : 0;
    const sy = s ? (s.year || 0) : 0;
    return ey * 10000 + sy;
  };

  // ================= degree canonicalization =================
  // Explicit token table (rule DEGREE_CANONICAL). The token match is a
  // case-insensitive substring match on the degree text; text remaining
  // after the token (minus separators / "in") is a discipline candidate
  // ONLY when the fact states no discipline of its own.
  const DEGREE_TOKENS = [
    { level: "doctorate", abbr: "PhD", tokens: ["ph.d.", "phd", "doctor of philosophy"] },
    { level: "doctorate", abbr: "MD", tokens: ["m.d.", "doctor of medicine"] },
    { level: "doctorate", abbr: "JD", tokens: ["j.d.", "juris doctor"] },
    { level: "doctorate", abbr: null, tokens: ["doctorate", "doctoral"] },
    { level: "masters", abbr: "MBA", tokens: ["m.b.a.", "mba", "master of business administration"] },
    { level: "masters", abbr: "MS", tokens: ["m.s.", "m.sc.", "master of science"] },
    { level: "masters", abbr: "MA", tokens: ["m.a.", "master of arts"] },
    { level: "masters", abbr: null, tokens: ["master's", "masters", "master"] },
    { level: "bachelors", abbr: "BS", tokens: ["b.s.", "b.sc.", "bachelor of science"] },
    { level: "bachelors", abbr: "BA", tokens: ["b.a.", "bachelor of arts"] },
    { level: "bachelors", abbr: "BBA", tokens: ["b.b.a.", "bachelor of business administration"] },
    { level: "bachelors", abbr: null, tokens: ["bachelor's", "bachelors", "bachelor"] },
    { level: "associates", abbr: null, tokens: ["associate's", "associates", "associate", "a.s.", "a.a.", "a.a.s."] },
    { level: "high_school", abbr: null, tokens: ["high school diploma", "high school"] },
  ];
  const LEVEL_DISPLAY = { doctorate: "Doctorate", masters: "Master's", bachelors: "Bachelor's", associates: "Associate", high_school: "High School" };
  // Bare-abbreviation heads ("BS", "B.S. Computer Science", "MS 2027"):
  // the first word, periods stripped, IS the degree token.
  const ABBR_HEADS = {
    BS: { level: "bachelors", abbr: "BS" }, BSC: { level: "bachelors", abbr: "BS" },
    BA: { level: "bachelors", abbr: "BA" }, BBA: { level: "bachelors", abbr: "BBA" },
    MS: { level: "masters", abbr: "MS" }, MSC: { level: "masters", abbr: "MS" },
    MA: { level: "masters", abbr: "MA" }, MBA: { level: "masters", abbr: "MBA" },
    PHD: { level: "doctorate", abbr: "PhD" }, MD: { level: "doctorate", abbr: "MD" },
    JD: { level: "doctorate", abbr: "JD" },
    AS: { level: "associates", abbr: null }, AA: { level: "associates", abbr: null }, AAS: { level: "associates", abbr: null },
  };
  function canonicalDegree(degreeText) {
    const verbatim = cleanStr(degreeText);
    if (!verbatim) return null;
    const lower = ` ${verbatim.toLowerCase()} `;
    for (const row of DEGREE_TOKENS) {
      for (const tok of row.tokens) {
        const i = lower.indexOf(tok);
        if (i < 0) continue;
        let rest = (verbatim.slice(0, Math.max(0, i - 1)) + " " + verbatim.slice(i - 1 + tok.length + 1)).trim();
        rest = rest.replace(/^[\s,;:—–-]+|[\s,;:—–-]+$/g, "").replace(/^in\s+/i, "").trim();
        return { level: row.level, abbr: row.abbr, display: row.abbr || LEVEL_DISPLAY[row.level], discipline_candidate: rest || null, recognized: true };
      }
    }
    const words = verbatim.split(/\s+/);
    const head = words[0].replace(/\./g, "").toUpperCase();
    if (ABBR_HEADS[head]) {
      const row = ABBR_HEADS[head];
      let rest = words.slice(1).join(" ").replace(/^[\s,;:—–-]+/, "").replace(/^in\s+/i, "").trim();
      return { level: row.level, abbr: row.abbr, display: row.abbr || LEVEL_DISPLAY[row.level], discipline_candidate: rest || null, recognized: true };
    }
    return { level: null, abbr: null, display: verbatim, discipline_candidate: null, recognized: false };
  }

  // ================= GPA canonicalization =================
  // Rule GPA_CANONICAL: value + scale as stated; "3.9/4.0" splits; a
  // scale is NEVER invented and a value is NEVER rescaled to one.
  function canonicalGpa(gpaRaw, scaleRaw) {
    let value = null, scale = null, valueText = null, scaleText = null;
    if (typeof gpaRaw === "number" && Number.isFinite(gpaRaw)) { value = gpaRaw; valueText = String(gpaRaw); }
    else {
      const s = cleanStr(gpaRaw);
      if (s) {
        const m = s.match(/^(\d+(?:\.\d+)?)\s*(?:\/\s*(\d+(?:\.\d+)?))?$/);
        if (m) { value = Number(m[1]); valueText = m[1]; if (m[2]) { scale = Number(m[2]); scaleText = m[2]; } }
      }
    }
    if (value == null) return null;
    if (scale == null && scaleRaw != null) { const s = cleanStr(scaleRaw); const sc = Number(s); if (s && Number.isFinite(sc)) { scale = sc; scaleText = s; } }
    return { value, scale, text: scale != null ? `${valueText}/${scaleText}` : valueText };
  }

  const RULES = Object.freeze([
    "TEXT_CLEAN", "DEGREE_CANONICAL", "DEGREE_DISCIPLINE_SPLIT", "GPA_CANONICAL",
    "SPAN_NORMALIZE", "SPAN_SORT", "SKILLS_AS_STATED", "SKILL_DEDUPE",
    "STATED_FILL", "STATED_SCHOOL_ENTRY", "HEADLINE_STATED", "HEADLINE_CURRENT_ROLE",
    "HEADLINE_RECENT_ROLE", "HEADLINE_STUDENT", "MATCH_NEED_FROM_GOAL",
  ]);


  // ================= the builder =================
  // Slots are read from a fact's `data` object when present, else from
  // the fact record itself; a fact with NO structured slots is carried
  // as an unstructured entry (verbatim title/text/bullets) with a gap
  // flag per missing slot — never parsed into invented structure.
  const slotsOf = (f) => (f.data && typeof f.data === "object" && !Array.isArray(f.data)) ? f.data : f;
  const firstStr = (o, keys) => { for (const k of keys) { const s = cleanStr(o[k]); if (s) return s; } return null; };

  function buildProfile(input, deps) {
    const src = input && typeof input === "object" ? input : {};
    const d = deps && typeof deps === "object" ? deps : {};
    const gaps = []; const gap = (code, where, detail) => gaps.push({ code, where, detail });
    const conflicts = []; const unplaced = []; const consumed = [];
    const consume = (f) => { if (f && f.id && !consumed.includes(f.id)) consumed.push(f.id); };

    // ---- one fact stream: bank facts keep their ids; stated facts get
    // deterministic ids (stated:<kind>:<key|index>) so every value in
    // the model traces to exactly one source record.
    const stream = [];
    for (const f of listOf(src.facts)) if (f && typeof f === "object") stream.push(f);
    listOf(src.stated_facts || src.statedFacts).forEach((f, i) => {
      if (!f || typeof f !== "object" || !f.kind || f.value == null) return;
      stream.push({ id: `stated:${f.kind}:${f.key ? String(f.key).toLowerCase() : i}`, kind: f.kind, key: f.key || null, value: f.value, _stated: true });
    });

    // ---- the quarantine gate: ONLY the reader's trusted output is read
    // below. Quarantined records are reported (id + reason), never read.
    const reader = typeof d.reader === "function" ? d.reader : stubReadTrustedFacts;
    const read = reader(stream.slice()) || {};
    const trusted = Array.isArray(read.trusted) ? read.trusted : [];
    const quarantined = (Array.isArray(read.quarantined) ? read.quarantined : [])
      .map((q) => ({ id: q && q.fact ? (q.fact.id || null) : null, reason: q ? (q.reason || null) : null }));

    const byKind = (kinds) => trusted.filter((f) => kinds.includes(f.kind));
    const stated = (kind) => trusted.filter((f) => f._stated && f.kind === kind);
    const userId = cleanStr(src.user_id) || cleanStr(src.userId) || null;
    if (!userId) gap("USER_ID_MISSING", "user_id", "no user_id on the input — emitters that require one will refuse");

    // ---- contact block (kind "contact", keyed by field) ----
    const contact = { name: null, city: null, email: null, phone: null, linkedin: null, website: null, country: null };
    const CONTACT_KEYS = { name: "name", email: "email", phone: "phone", city: "city", location: "city", linkedin: "linkedin", website: "website", country: "country" };
    for (const f of byKind(["contact"])) {
      const slot = CONTACT_KEYS[String(f.key || "").toLowerCase()];
      const val = cleanStr(f.value != null ? f.value : f.text);
      if (!slot || !val) { unplaced.push({ fact_id: f.id || null, kind: f.kind, reason: "CONTACT_KEY_UNKNOWN" }); continue; }
      if (!contact[slot]) { contact[slot] = FR(val, f.value != null ? f.value : f.text, f.id || null, "TEXT_CLEAN"); consume(f); }
    }

    // ---- education entries ----
    const education = [];
    byKind(["education"]).forEach((f, idx) => {
      const dta = slotsOf(f);
      const school = firstStr(dta, ["school", "institution", "university"]);
      const degreeText = firstStr(dta, ["degree", "degree_text", "degrees"]);
      const span = normSpan(dta);
      const hasSlots = !!(school || degreeText || span || dta.discipline || dta.field || dta.fields || dta.major || dta.gpa != null);
      const entry = {
        source_index: idx, fact_id: f.id || null, kind: "education",
        school: school ? FR(school, dta.school != null ? dta.school : (dta.institution || dta.university), f.id || null, "TEXT_CLEAN") : null,
        detail: (() => { const s = firstStr(dta, ["detail", "college"]); return s ? FR(s, dta.detail != null ? dta.detail : dta.college, f.id || null, "TEXT_CLEAN") : null; })(),
        degree: null, fields_of_study: [], span: null, gpa: null, notes: [],
        unstructured: hasSlots ? null : { title: f.title || null, text: f.text || null, bullets: listOf(f.bullets).slice() },
      };
      if (degreeText) {
        const c = canonicalDegree(degreeText);
        entry.degree = { value: { level: c.level, abbr: c.abbr, display: c.display }, verbatim: degreeText, fact_id: f.id || null, rule: "DEGREE_CANONICAL", recognized: c.recognized };
        if (!c.recognized) gap("DEGREE_UNRECOGNIZED", `education[${idx}].degree`, `degree text ${JSON.stringify(degreeText)} matches no canonical token — carried verbatim, not classified`);
        const statedFields = dta.discipline != null ? dta.discipline : (dta.field != null ? dta.field : (dta.fields != null ? dta.fields : dta.major));
        if (statedFields != null) {
          for (const item of listOf(statedFields)) { const s = cleanStr(item); if (s) entry.fields_of_study.push(FR(s, item, f.id || null, "TEXT_CLEAN")); }
        } else if (c.discipline_candidate) {
          entry.fields_of_study.push(FR(c.discipline_candidate, degreeText, f.id || null, "DEGREE_DISCIPLINE_SPLIT"));
        }
      }
      if (span) entry.span = { start: span.start, end: span.end, text: span.text, fact_id: f.id || null, rule: "SPAN_NORMALIZE" };
      const g = canonicalGpa(dta.gpa, dta.gpa_scale != null ? dta.gpa_scale : dta.gpa_max);
      if (g) entry.gpa = { value: g.value, scale: g.scale, text: g.text, verbatim: dta.gpa, fact_id: f.id || null, rule: "GPA_CANONICAL" };
      for (const n of listOf(dta.notes)) { const s = cleanStr(n); if (s) entry.notes.push(FR(s, n, f.id || null, "TEXT_CLEAN")); }
      for (const b of listOf(f.bullets)) { const s = cleanStr(b); if (s && hasSlots) entry.notes.push(FR(s, b, f.id || null, "TEXT_CLEAN")); }
      if (!entry.school) gap("SCHOOL_MISSING", `education[${idx}].school`, "education entry states no school — flagged, not guessed");
      if (!entry.degree) gap("DEGREE_MISSING", `education[${idx}].degree`, "education entry states no degree");
      if (!entry.span) gap("DATE_MISSING", `education[${idx}].span`, "education entry states no dates");
      else if (entry.span.end && !entry.span.end.present && entry.span.end.precision === "year") {
        gap("DATE_PARTIAL", `education[${idx}].span.end`, "graduation month is not in the facts — year precision only, the month is not invented");
      }
      education.push(entry);
      consume(f);
    });
    education.sort((a, b) => spanSortKey(b.span) - spanSortKey(a.span));

    // ---- experience entries (experience / project / leadership) ----
    const experience = [];
    byKind(["experience", "project", "leadership"]).forEach((f, idx) => {
      const dta = slotsOf(f);
      const org = firstStr(dta, ["org", "company", "employer", "organization"]);
      const title = firstStr(dta, ["title", "role", "position"]);
      const span = normSpan(dta);
      const hasSlots = !!(org || title || span);
      const bullets = [];
      const seenB = new Set();
      for (const b of [...listOf(dta.bullets), ...listOf(f.bullets)]) {
        const s = cleanStr(b); if (!s) continue;
        const k = s.toLowerCase(); if (seenB.has(k)) continue; seenB.add(k);
        bullets.push(FR(s, b, f.id || null, "TEXT_CLEAN"));
      }
      const entry = {
        source_index: idx, fact_id: f.id || null, kind: f.kind,
        org: org ? FR(org, dta.org != null ? dta.org : (dta.company || dta.employer || dta.organization), f.id || null, "TEXT_CLEAN") : null,
        title: title ? FR(title, dta.title != null ? dta.title : (dta.role || dta.position), f.id || null, "TEXT_CLEAN") : null,
        location: (() => { const s = firstStr(dta, ["location", "city"]); return s ? FR(s, dta.location != null ? dta.location : dta.city, f.id || null, "TEXT_CLEAN") : null; })(),
        span: span ? { start: span.start, end: span.end, text: span.text, fact_id: f.id || null, rule: "SPAN_NORMALIZE" } : null,
        bullets,
        unstructured: hasSlots ? null : { title: f.title || null, text: f.text || null, bullets: listOf(f.bullets).slice() },
      };
      if (!entry.org) gap("ORG_MISSING", `experience[${idx}].org`, "experience entry states no org — flagged, not guessed");
      if (!entry.title) gap("TITLE_MISSING", `experience[${idx}].title`, "experience entry states no title — flagged, not guessed");
      if (!entry.span) gap("DATE_MISSING", `experience[${idx}].span`, "experience entry states no dates");
      experience.push(entry);
      consume(f);
    });
    experience.sort((a, b) => spanSortKey(b.span) - spanSortKey(a.span));

    // ---- skills (grouped exactly as stated; flat facts share one
    // unlabeled group; case-insensitive dedupe keeps the first) ----
    const skillGroups = new Map();
    const pushSkill = (label, itemRaw, factId, deduped) => {
      const s = cleanStr(itemRaw); if (!s) return;
      const key = label == null ? "" : label.toLowerCase();
      if (!skillGroups.has(key)) skillGroups.set(key, { label, items: [], seen: new Set() });
      const g = skillGroups.get(key);
      const k = s.toLowerCase();
      if (g.seen.has(k)) { deduped.count += 1; return; }
      g.seen.add(k); g.items.push(FR(s, itemRaw, factId, "SKILLS_AS_STATED"));
    };
    const deduped = { count: 0 };
    for (const f of byKind(["skill"])) {
      const dta = slotsOf(f);
      const label = firstStr(dta, ["group", "label", "category"]);
      const items = dta.items != null ? listOf(dta.items) : (Array.isArray(f.skills) ? f.skills : (f.name ? [f.name] : []));
      if (!items.length) { unplaced.push({ fact_id: f.id || null, kind: f.kind, reason: "SKILL_WITHOUT_ITEMS" }); continue; }
      for (const it of items) pushSkill(label, it, f.id || null, deduped);
      consume(f);
    }
    const skills = [...skillGroups.values()].map((g) => ({ label: g.label, items: g.items }));

    // ---- certifications + honors ----
    const certifications = [];
    for (const f of byKind(["certification", "cert"])) {
      const dta = slotsOf(f);
      const name = firstStr(dta, ["name", "title"]) || cleanStr(f.title) || cleanStr(f.text);
      if (!name) { unplaced.push({ fact_id: f.id || null, kind: f.kind, reason: "CERT_WITHOUT_NAME" }); continue; }
      const issuer = firstStr(dta, ["issuer", "provider"]);
      certifications.push({
        name: FR(name, dta.name != null ? dta.name : (f.title || f.text), f.id || null, "TEXT_CLEAN"),
        issuer: issuer ? FR(issuer, dta.issuer != null ? dta.issuer : dta.provider, f.id || null, "TEXT_CLEAN") : null,
        text: issuer ? `${name} — ${issuer}` : name, fact_id: f.id || null,
      });
      consume(f);
    }
    const honors = [];
    for (const f of byKind(["award"])) {
      const s = cleanStr(f.text) || cleanStr(f.title);
      if (s) { honors.push(FR(s, f.text != null ? f.text : f.title, f.id || null, "TEXT_CLEAN")); consume(f); }
    }

    // ---- target block + stated-fact fills ----
    const target = { goal: null, level: null, firms: [] };
    for (const f of stated("goal")) { if (!target.goal) { target.goal = FR(cleanStr(f.value), f.value, f.id, "TEXT_CLEAN"); consume(f); } }
    for (const f of stated("level")) { if (!target.level) { target.level = FR(cleanStr(f.value), f.value, f.id, "TEXT_CLEAN"); consume(f); } }
    for (const f of stated("target_firm")) { target.firms.push(FR(cleanStr(f.value), f.value, f.id, "TEXT_CLEAN")); consume(f); }

    // geography -> contact.city (fill-if-absent; conflict, never overwrite)
    for (const f of stated("geography")) {
      const v = cleanStr(f.value); if (!v) continue;
      if (!contact.city) { contact.city = FR(v, f.value, f.id, "STATED_FILL"); consume(f); }
      else if (contact.city.value.toLowerCase() !== v.toLowerCase()) {
        conflicts.push({ where: "contact.city", kept_fact_id: contact.city.fact_id, stated_fact_id: f.id, kept_value: contact.city.value, stated_value: v });
      } else consume(f);
    }
    // school -> the education record (fill a missing school; a stated
    // school with NO education entry founds a school-only entry whose
    // other slots stay gap flags — the school was stated, the rest not)
    for (const f of stated("school")) {
      const v = cleanStr(f.value); if (!v) continue;
      const missing = education.filter((e) => !e.school);
      if (education.length && missing.length === 1) { missing[0].school = FR(v, f.value, f.id, "STATED_FILL"); consume(f); }
      else if (missing.length > 1) { unplaced.push({ fact_id: f.id, kind: f.kind, reason: "STATED_SCHOOL_AMBIGUOUS" }); }
      else if (!education.length) {
        const entry = { source_index: education.length, fact_id: f.id, kind: "education", school: FR(v, f.value, f.id, "STATED_SCHOOL_ENTRY"), detail: null, degree: null, fields_of_study: [], span: null, gpa: null, notes: [], unstructured: null };
        education.push(entry); consume(f);
        gap("DEGREE_MISSING", "education[0].degree", "school stated without a degree — flagged, not guessed");
        gap("DATE_MISSING", "education[0].span", "school stated without dates — flagged, not guessed");
      } else if (education.every((e) => e.school && e.school.value.toLowerCase() !== v.toLowerCase())) {
        conflicts.push({ where: "education.school", kept_fact_id: education[0].school.fact_id, stated_fact_id: f.id, kept_value: education[0].school.value, stated_value: v });
      } else consume(f);
    }
    // majors -> fields of study (single education entry only; with more
    // than one the target entry is ambiguous and the fact is reported)
    for (const f of stated("majors")) {
      const v = cleanStr(f.value); if (!v) continue;
      if (education.length === 1 && !education[0].fields_of_study.length) {
        for (const part of v.split(/\s*(?:\+|,|&|\band\b)\s*/i)) { const s = cleanStr(part); if (s) education[0].fields_of_study.push(FR(s, f.value, f.id, "STATED_FILL")); }
        consume(f);
      } else if (education.length === 1) consume(f);
      else unplaced.push({ fact_id: f.id, kind: f.kind, reason: "STATED_MAJORS_AMBIGUOUS" });
    }
    // year -> graduation year (single entry, year precision only; a
    // differing structured year is a conflict, never an overwrite)
    for (const f of stated("year")) {
      const v = cleanStr(f.value); const yr = v && v.match(/^\d{4}$/) ? Number(v) : null;
      if (!yr) { unplaced.push({ fact_id: f.id, kind: f.kind, reason: "STATED_YEAR_UNPARSED" }); continue; }
      if (education.length !== 1) { unplaced.push({ fact_id: f.id, kind: f.kind, reason: "STATED_YEAR_AMBIGUOUS" }); continue; }
      const e = education[0];
      if (!e.span) {
        e.span = { start: null, end: { year: yr, month: null, precision: "year" }, text: String(yr), fact_id: f.id, rule: "STATED_FILL" };
        const gi = gaps.findIndex((g) => g.code === "DATE_MISSING" && g.where === "education[0].span");
        if (gi >= 0) gaps.splice(gi, 1);
        gap("DATE_PARTIAL", "education[0].span.end", "graduation month is not in the facts — year precision only, the month is not invented");
        consume(f);
      } else if (e.span && !e.span.end) {
        e.span = { start: e.span.start, end: { year: yr, month: null, precision: "year" }, text: e.span.start ? `${pointText(e.span.start)} – ${yr}` : String(yr), fact_id: f.id, rule: "STATED_FILL" };
        gap("DATE_PARTIAL", "education[0].span.end", "graduation month is not in the facts — year precision only, the month is not invented");
        consume(f);
      } else if (e.span.end && !e.span.end.present && e.span.end.year !== yr) {
        conflicts.push({ where: "education.span.end", kept_fact_id: e.span.fact_id, stated_fact_id: f.id, kept_value: String(e.span.end.year), stated_value: v });
      } else consume(f);
    }
    // any stated kind not profile-shaped is REPORTED, never swallowed
    const STATED_USED = ["goal", "level", "target_firm", "geography", "school", "majors", "year", "headline"];
    for (const f of trusted) {
      if (!f._stated || STATED_USED.includes(f.kind)) continue;
      unplaced.push({ fact_id: f.id, kind: f.kind, reason: "NOT_PROFILE_SHAPED" });
    }
    // trusted bank facts of unmapped kinds likewise
    const BANK_USED = ["contact", "education", "experience", "project", "leadership", "skill", "certification", "cert", "award", "headline"];
    for (const f of trusted) {
      if (f._stated || BANK_USED.includes(f.kind)) continue;
      unplaced.push({ fact_id: f.id || null, kind: f.kind, reason: "KIND_NOT_PROFILE_MAPPED" });
    }

    // ---- headline (stated wins; else a named derivation rule over
    // facts — never a model call, never a guess) ----
    let headline = null;
    const hf = trusted.find((f) => !f._stated && f.kind === "headline") || trusted.find((f) => f._stated && f.kind === "headline");
    if (hf) { const t = cleanStr(hf.value != null ? hf.value : hf.text); if (t) { headline = { text: t, rule: "HEADLINE_STATED", fact_ids: [hf.id || null] }; consume(hf); } }
    if (!headline) {
      const cur = experience.find((e) => e.span && e.span.end && e.span.end.present && e.title && e.org);
      const recent = experience.find((e) => e.title && e.org);
      const pick = cur || recent;
      if (pick) headline = { text: `${pick.title.value} at ${pick.org.value}`, rule: cur ? "HEADLINE_CURRENT_ROLE" : "HEADLINE_RECENT_ROLE", fact_ids: [pick.fact_id] };
      else if (education.length && education[0].school) {
        const fld = education[0].fields_of_study.length ? education[0].fields_of_study[0].value : null;
        headline = { text: fld ? `${fld} student at ${education[0].school.value}` : `Student at ${education[0].school.value}`, rule: "HEADLINE_STUDENT", fact_ids: [education[0].fact_id] };
      }
    }
    if (!headline) gap("HEADLINE_MISSING", "headline", "no stated headline and no role or school to derive one from — flagged, not invented");

    // ---- section-level gap flags ----
    if (!contact.name) gap("NAME_MISSING", "contact.name", "no name in the trusted facts");
    if (!contact.email) gap("EMAIL_MISSING", "contact.email", "no email in the trusted facts");
    if (!contact.phone) gap("PHONE_MISSING", "contact.phone", "no phone in the trusted facts");
    if (!contact.city) gap("CITY_MISSING", "contact.city", "no city in the trusted facts");
    if (!contact.linkedin) gap("LINKEDIN_MISSING", "contact.linkedin", "no LinkedIn in the trusted facts");
    if (!education.length) gap("EDUCATION_MISSING", "education", "no education entries in the trusted facts");
    if (!experience.length) gap("EXPERIENCE_MISSING", "experience", "no experience entries in the trusted facts");
    if (!skills.length) gap("SKILLS_MISSING", "skills", "no skills in the trusted facts");

    const model = {
      kind: MODEL_KIND, version: VERSION, user_id: userId,
      headline,
      contact, education, experience, skills, certifications, honors,
      target, gaps, conflicts, unplaced,
      skills_deduped: deduped.count,
      provenance: {
        consumed_fact_ids: consumed,
        quarantined,
        reader: { module: 167, contract: READER_CONTRACT.version, stub: typeof d.reader !== "function" },
      },
    };
    return model;
  }

  // ================= emitters =================
  // (a) BOARD PROFILE — module 149's standing profile contract: flat
  // keys (name, email, phone, location, linkedin, github, website,
  // current_company, preferred_name, country) + education in the
  // fact-bank F-001 shape { school, degree, discipline, start_date,
  // end_date, gpa, graduation_year } (149's EDUCATION_KEYS). Those are
  // the fields profile-import board forms ask for; the sandbox board
  // in 149 (Greenhouse-shaped SANDBOX_FIELDS) asks the same core set.
  // A field the canonical model does not source (github,
  // preferred_name) emits null and is listed in _unfilled — a board
  // field is never back-filled from a guess.
  function toBoardProfile(model) {
    const c = model.contact || {};
    const v = (fr) => (fr ? fr.value : null);
    const cur = (model.experience || []).find((e) => e.span && e.span.end && e.span.end.present && e.org)
      || (model.experience || []).find((e) => e.org);
    const ed = (model.education || [])[0] || null;
    const board = {
      name: v(c.name), email: v(c.email), phone: v(c.phone),
      location: v(c.city), linkedin: v(c.linkedin), github: null,
      website: v(c.website), current_company: cur ? cur.org.value : null,
      preferred_name: null, country: v(c.country),
      education: ed ? {
        school: v(ed.school),
        degree: ed.degree ? ed.degree.value.display : null,
        discipline: ed.fields_of_study.length ? ed.fields_of_study.map((f) => f.value).join(", ") : null,
        start_date: ed.span && ed.span.start ? pointText(ed.span.start) : null,
        end_date: ed.span && ed.span.end ? pointText(ed.span.end) : null,
        gpa: ed.gpa ? ed.gpa.text : null,
        graduation_year: ed.span && ed.span.end && ed.span.end.year ? ed.span.end.year : null,
      } : null,
    };
    board._unfilled = Object.keys(board).filter((k) => board[k] == null);
    if (board.education) board._unfilled.push(...Object.keys(board.education).filter((k) => board.education[k] == null).map((k) => `education.${k}`));
    board._gaps = (model.gaps || []).map((g) => g.code);
    board._profile_kind = MODEL_KIND;
    return board;
  }

  // (b) CONNECTOR MATCH PROFILE — module 157's shape, exactly:
  // { kind: "connector_match_profile", version: 1, user_id, needs,
  //   offers, visibility_scope, created_at, updated_at } with 157's
  //   caps (<= 12 items, <= 280 chars each, deduped case-insensitively)
  //   and its clock discipline (timestamps are the CALLER's, canonical
  //   ISO, never guessed). needs are sourced from the stated career
  //   goal (rule MATCH_NEED_FROM_GOAL) plus caller-passed stated needs;
  //   offers ONLY from caller-passed stated offers — the model never
  //   manufactures an offer out of a skill list. Non-conforming items
  //   are excluded and named in notes, never silently truncated.
  const MATCH_MAX_ITEMS = 12; const MATCH_MAX_CHARS = 280;
  function toMatchProfile(model, opts) {
    const o = opts && typeof opts === "object" ? opts : {};
    if (!model || model.kind !== MODEL_KIND) return { ok: false, reason: "invalid_model", notes: [] };
    if (!model.user_id) return { ok: false, reason: "user_id_required", notes: [] };
    const atMs = typeof o.at === "string" ? Date.parse(o.at) : NaN;
    if (Number.isNaN(atMs) || new Date(atMs).toISOString() !== o.at) return { ok: false, reason: "timestamp_required", notes: [] };
    const notes = [];
    const collect = (items, label) => {
      const seen = new Set(); const out = [];
      for (const raw of items) {
        const s = cleanStr(raw);
        if (!s) continue;
        if (s.length > MATCH_MAX_CHARS) { notes.push({ code: "ITEM_TOO_LONG", label, detail: `${label} item of ${s.length} chars exceeds 157's ${MATCH_MAX_CHARS} — excluded, not truncated` }); continue; }
        const k = s.toLowerCase(); if (seen.has(k)) continue; seen.add(k);
        if (out.length >= MATCH_MAX_ITEMS) { notes.push({ code: "ITEMS_CAPPED", label, detail: `${label} exceeds 157's ${MATCH_MAX_ITEMS}-item cap — extra items excluded` }); break; }
        out.push(s);
      }
      return out;
    };
    const needItems = [];
    if (model.target && model.target.goal) needItems.push(model.target.goal.value);
    for (const n of listOf(o.needs)) needItems.push(n);
    const needs = collect(needItems, "needs");
    const offers = collect(listOf(o.offers), "offers");
    const profile = {
      kind: "connector_match_profile", version: 1, user_id: model.user_id,
      needs, offers, visibility_scope: "internal_only",
      created_at: o.at, updated_at: o.at,
    };
    return { ok: true, profile, notes };
  }

  return {
    buildProfile, toBoardProfile, toMatchProfile,
    canonicalDegree, canonicalGpa, normSpan, normPoint, pointText,
    stubReadTrustedFacts, READER_CONTRACT, RULES, VERSION, MODEL_KIND,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerProfileStructure;
