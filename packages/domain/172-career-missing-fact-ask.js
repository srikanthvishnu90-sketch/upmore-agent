/* Career MISSING-FACT ASK (owner ruling 2026-10-21 14:11 CDT; top
   priority, Lane ASK-ON-MISSING). Pure domain module, UMD like its
   siblings. No I/O, no model calls, no sends — it composes ask TEXT;
   delivering the ask is the chat host's job (see the contract spec,
   docs/career/missing-fact-ask-contract-2026-10-21.md).

   THE GAP THIS CLOSES: the apply path knew how to DERIVE answers
   (module 149's deriveAnswers: sponsorship invited by a work-
   authorization fact, years of experience summed from role spans, age
   computed from a date of birth, a level token read off degree text)
   and how to STOP when nothing existed — but nothing in the product
   could tell the difference between a fact the user STATED and a value
   a machine could compute, and nothing could ASK. On 2026-10-21 the
   owner had to correct a batch card by hand: two answers tagged REAL
   were derivations, not statements (14:05 CDT ruling: nothing is REAL
   unless the user stated it), and he stated both himself at 14:10.

   THE RULE THIS MODULE IS: a required application field is covered
   ONLY by a user-stated, confirmed fact — read through module 167's
   trusted-fact reader, so quarantined / unconfirmed facts cannot cover
   either. A value that could be DERIVED never covers: derivation is
   exactly what this module exists to refuse. Every missing field
   produces exactly one specific question; a reply binds to its open
   question by stable id, is parsed by the field's type, and is stored
   as a CONFIRMED fact carrying provenance {source:"owner_reply",
   question_id, asked_at, answered_at, verbatim}. An unparseable reply
   stores NOTHING and re-asks. No guess is ever filled.

   DEPENDENCIES: module 167 (trusted-fact reader) is REQUIRED for the
   quarantine cut and is read through a seam: deps.reader injection,
   else the sibling file, else a stamped stub implementing 167's exact
   cleared rule (mode labeled on every record — a stub-backed verdict
   can never be mistaken for a 167-backed one). Module 170 (texted-
   facts parser) is the free-text fallback in reply parsing, when the
   strict per-type parse fails. */
const CareerMissingFactAsk = (() => {
  "use strict";
  const VERSION = 1;

  let Trusted167 = null;
  try { Trusted167 = require("./167-career-trusted-facts.js"); } catch (e) { Trusted167 = null; }
  let Parser170 = null;
  try { Parser170 = require("./170-career-facts-parser.js"); } catch (e) { Parser170 = null; }

  // 167's cleared rule, restated exactly (stub only — used solely when
  // the real module file is absent from the tree).
  const QUARANTINE_STATUSES = new Set(["draft", "quarantined", "held", "suppressed"]);
  const stubReader = {
    trustedFacts(profile) {
      const all = profile && Array.isArray(profile.facts) ? profile.facts : [];
      return all.filter((f) => f && typeof f === "object"
        && f.needs_confirmation !== true && f.quarantined !== true
        && !(typeof f.status === "string" && QUARANTINE_STATUSES.has(f.status)));
    },
  };
  function readerOf(deps) {
    if (deps && deps.reader && typeof deps.reader.trustedFacts === "function") return { reader: deps.reader, mode: "injected" };
    if (Trusted167 && typeof Trusted167.trustedFacts === "function") return { reader: Trusted167, mode: "module167" };
    return { reader: stubReader, mode: "stub167" };
  }

  // ---------- small helpers ----------
  const s = (v) => (v === undefined || v === null ? "" : String(v));
  const lc = (v) => s(v).trim().toLowerCase();
  function normYesNo(v) {
    if (v === true) return "Yes";
    if (v === false) return "No";
    const t = lc(v);
    if (t === "yes" || t === "y" || t === "true") return "Yes";
    if (t === "no" || t === "n" || t === "false") return "No";
    return null;
  }
  function factName(f) { return s(f && (f.name || f.title)); }
  // A fact STATES an answer for a key when it carries the key explicitly
  // (answer_key — the shape this module's own intake writes, and the
  // shape a host may write when a user states an answer in chat) with a
  // value attached.
  function statedByKey(facts, key) {
    return facts.find((f) => f.answer_key === key && f.value !== undefined && f.value !== null && f.value !== "") || null;
  }
  function byKindName(facts, kind, nameRe) {
    return facts.find((f) => f.kind === kind && nameRe.test(factName(f))) || null;
  }
  // An answers-map entry (149's shape) covers ONLY when it is marked as
  // user-stated. 149's deriveAnswers entries carry {value, confirmed,
  // factId} and NO stated provenance — they are derivations and never
  // cover here. That asymmetry is the point of the module.
  function statedAnswerEntry(profile, key) {
    const a = profile && profile.answers && typeof profile.answers === "object" ? profile.answers[key] : null;
    if (!a || a.confirmed !== true || a.value === undefined || a.value === null || a.value === "") return null;
    if (a.stated === true) return a;
    if (a.provenance && a.provenance.source === "owner_reply") return a;
    return null;
  }
  const US_PLACE_TAIL = /\b(united states|usa|u\.s\.a\.|u\.s\.)\b/i;
  const US_STATE_TAIL = /,\s*(AL|AK|AZ|AR|CA|CO|CT|DE|FL|GA|HI|ID|IL|IN|IA|KS|KY|LA|ME|MD|MA|MI|MN|MS|MO|MT|NE|NV|NH|NJ|NM|NY|NC|ND|OH|OK|OR|PA|RI|SC|SD|TN|TX|UT|VT|VA|WA|WV|WI|WY|DC)\s*$/i;

  // ---------- reply parsing, by type ----------
  const MONTHS = { jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4, may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8, sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12 };
  const WORD_NUMBERS = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20 };
  function pad2(n) { return (n < 10 ? "0" : "") + n; }
  function plausibleYear(y) { return Number.isInteger(y) && y >= 1950 && y <= 2100; }

  function parseMonthYear(text) {
    const t = s(text);
    let m = t.match(/\b(\d{4})-(\d{1,2})\b/);
    if (m && plausibleYear(+m[1]) && +m[2] >= 1 && +m[2] <= 12) return { value: m[1] + "-" + pad2(+m[2]), year: +m[1], month: +m[2], precision: "month" };
    m = t.match(/\b(\d{1,2})\/(\d{4})\b/);
    if (m && plausibleYear(+m[2]) && +m[1] >= 1 && +m[1] <= 12) return { value: m[2] + "-" + pad2(+m[1]), year: +m[2], month: +m[1], precision: "month" };
    m = t.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(?:of\s+)?(\d{4})\b/i);
    if (m && plausibleYear(+m[2])) { const mo = MONTHS[m[1].toLowerCase()]; return { value: m[2] + "-" + pad2(mo), year: +m[2], month: mo, precision: "month" }; }
    return null;
  }

  // Module 170 cascade: run the texted-facts parser over a free-text
  // reply and look for a fact that states THIS field. Returns the
  // parser's fact or null. Only reached when the strict parse failed.
  function parserFactFor(field, text) {
    if (!Parser170 || typeof Parser170.parseTextedFacts !== "function") return null;
    let out = null;
    try { out = Parser170.parseTextedFacts(text); } catch (e) { return null; }
    const facts = (out && Array.isArray(out.facts)) ? out.facts : [];
    const hit = facts.find((f) => field.factKinds.includes(f.kind) && field.nameRe.test(factName(f)) && f.value !== undefined);
    return hit || null;
  }

  function parseYesNo(field, text) {
    const t = lc(text).replace(/[.!]+$/g, "").trim();
    if (/^(yes|y|yeah|yep|yup)$/.test(t)) return { value: "Yes" };
    if (/^(no|n|nope|nah)$/.test(t)) return { value: "No" };
    // short statements with an unambiguous polarity
    if (/^(yes|yeah|yep)\b/.test(t)) return { value: "Yes" };
    if (/^(no|nope)\b/.test(t)) return { value: "No" };
    if (/\b(don'?t|do not|doesn'?t|never)\s+(need|require|want)\b/.test(t) || /\bno\s+(sponsorship|clearance|need)\b/.test(t)) return { value: "No" };
    if (/\bi\s+(do\s+)?(require|need)\s+(sponsorship|it|that)\b/.test(t)) return { value: "Yes" };
    if (/\bauthori[sz]ed\b/.test(t) && !/\bnot\s+authori[sz]ed\b/.test(t) && field.key === "work_authorization") return { value: "Yes" };
    if (/\bnot\s+authori[sz]ed\b/.test(t) && field.key === "work_authorization") return { value: "No" };
    const pf = parserFactFor(field, text);
    if (pf) { const v = normYesNo(pf.value); if (v) return { value: v, via: "parser170" }; }
    return null;
  }

  function parseNumber(field, text) {
    const t = lc(text);
    const m = t.match(/\b(\d+(?:\.\d+)?)\b/);
    if (m) { const n = parseFloat(m[1]); if (Number.isFinite(n) && n >= 0 && n <= 80) return { value: n }; return null; }
    for (const [w, n] of Object.entries(WORD_NUMBERS)) if (new RegExp("\\b" + w + "\\b").test(t)) return { value: n };
    return null;
  }

  function parseYear(field, text) {
    const m = s(text).match(/\b(19|20)\d{2}\b/);
    if (m && plausibleYear(+m[0])) return { value: +m[0] };
    return null;
  }

  const LEVEL_PATTERNS = [
    { re: /\bph\.?d\b|doctorate|doctoral/i, level: "PhD" },
    { re: /\bmaster/i, level: "Master's Degree" },
    { re: /\bbachelor/i, level: "Bachelor's Degree" },
    { re: /\bassociate/i, level: "Associate's Degree" },
    { re: /\bhigh school|secondary school/i, level: "High School Diploma" },
    { re: /\b(b\.?s\.?|b\.?a\.?)\b/i, level: "Bachelor's Degree" },
    { re: /\b(m\.?s\.?|m\.?a\.?|mba)\b/i, level: "Master's Degree" },
    { re: /\ba\.?s\.?\b|\ba\.?a\.?\b/i, level: "Associate's Degree" },
  ];
  function parseLevel(field, text) {
    for (const p of LEVEL_PATTERNS) if (p.re.test(s(text))) return { value: p.level };
    return null;
  }

  function parseDate(field, text) {
    const t = lc(text);
    if (/\b(immediately|right away|asap|straight away)\b/.test(t)) return { value: "immediately", precision: "immediate" };
    const dm = s(text).match(/\b(\d{4})-(\d{1,2})-(\d{1,2})\b/);
    if (dm && plausibleYear(+dm[1])) return { value: dm[1] + "-" + pad2(+dm[2]) + "-" + pad2(+dm[3]), precision: "day" };
    const named = parseMonthYear(text);
    if (named) return { value: named.value, precision: "month" };
    const full = s(text).match(/\b(january|february|march|april|may|june|july|august|september|october|november|december|jan|feb|mar|apr|jun|jul|aug|sep|sept|oct|nov|dec)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})\b/i);
    if (full && plausibleYear(+full[3])) return { value: full[3] + "-" + pad2(MONTHS[full[1].toLowerCase()]) + "-" + pad2(+full[2]), precision: "day" };
    return null;
  }

  function parseTextValue(field, text) {
    const t = s(text).trim();
    if (!t || t.length > 80 || !/[a-z]/i.test(t)) return null;
    if (field.key === "security_clearance" && /^(no|none|n\/a|nope)$/i.test(t)) return { value: "None" };
    return { value: t };
  }

  const PARSERS = { yes_no: parseYesNo, number: parseNumber, month_year: (f, t) => parseMonthYear(t), year: parseYear, level: parseLevel, date: parseDate, text: parseTextValue, attestation: parseYesNo };
  function parseReply(field, text) {
    const p = PARSERS[field.type] || parseTextValue;
    const r = p(field, text);
    if (!r) return { ok: false, reason: "unparseable_reply" };
    return { ok: true, value: r.value, precision: r.precision || null, via: r.via || "strict" };
  }

  // ---------- the field catalog ----------
  // covers(facts, profile): a STATED confirmed value or null.
  // derivable(facts, profile): names the derivation that was refused,
  // when one exists — evidence, never coverage.
  const F = (def) => def;
  const FIELD_CATALOG = {
    sponsorship: F({
      key: "sponsorship", type: "yes_no", factKinds: ["eligibility"], nameRe: /sponsorship/i,
      ask: "The application asks whether you will now, or at any time in the future, require sponsorship to work in the United States. I don't have your answer stated on file, and I won't infer it from anything else. Reply yes or no.",
      shape: "yes / no",
      covers(facts) {
        const f = statedByKey(facts, "sponsorship") || byKindName(facts, "eligibility", /sponsorship/i);
        if (f && f.value !== undefined) { const v = normYesNo(f.value); if (v) return { value: v, fact_id: f.id }; }
        return null;
      },
      derivable(facts) {
        if (byKindName(facts, "eligibility", /work authorization/i)) return "a stated work-authorization fact is on file; sponsorship does not follow from it";
        return null;
      },
      fact: (v) => ({ kind: "eligibility", name: "Sponsorship", title: "Sponsorship", value: v }),
    }),
    work_authorization: F({
      key: "work_authorization", type: "yes_no", factKinds: ["eligibility"], nameRe: /work authorization|authori[sz]ed to work/i,
      ask: "The application asks whether you are authorized to work in the United States. I don't have your answer stated on file. Reply yes or no.",
      shape: "yes / no",
      covers(facts) {
        const f = statedByKey(facts, "work_authorization") || byKindName(facts, "eligibility", /work authorization|authori[sz]ed to work/i);
        if (f && f.value !== undefined) { const v = normYesNo(f.value); if (v) return { value: v, fact_id: f.id }; }
        return null;
      },
      derivable(facts, profile) {
        if (byKindName(facts, "profile", /^country$/i) || (profile.basics && profile.basics.location)) return "a residence is on file; work authorization does not follow from where someone lives";
        return null;
      },
      fact: (v) => ({ kind: "eligibility", name: "Work authorization", title: "Work authorization", value: v }),
    }),
    years_of_experience: F({
      key: "years_of_experience", type: "number", factKinds: ["experience", "profile"], nameRe: /years of experience/i,
      ask: "The application asks how many years of experience you have. I won't add that up from your roles — it has to be your stated answer. Reply with a number, for example \"3\".",
      shape: "a number of years",
      covers(facts) {
        const f = statedByKey(facts, "years_of_experience")
          || facts.find((x) => (x.kind === "experience" || x.kind === "profile") && /years of experience/i.test(factName(x)) && x.value !== undefined)
          || null;
        if (f) { const n = typeof f.value === "number" ? f.value : parseFloat(s(f.value)); if (Number.isFinite(n)) return { value: n, fact_id: f.id }; }
        return null;
      },
      derivable(facts) {
        const exps = facts.filter((x) => x.kind === "experience" && x.start);
        if (exps.length) return "experience facts with start dates are on file; a summed span is a computation, not a stated answer";
        return null;
      },
      fact: (v) => ({ kind: "experience", name: "Years of experience", title: "Years of experience", value: v }),
    }),
    graduation_month: F({
      key: "graduation_month", type: "month_year", factKinds: ["education"], nameRe: /graduation month/i,
      ask: "The application asks for your graduation month. I don't have a month stated on file — a year alone isn't enough, and I won't pick one. Reply with the month and year, for example \"May 2029\".",
      shape: "month + year, e.g. May 2029",
      covers(facts) {
        const byKey = statedByKey(facts, "graduation_month");
        if (byKey) { const p = parseMonthYear(s(byKey.value)); if (p) return { value: p.value, fact_id: byKey.id }; }
        const named = byKindName(facts, "education", /graduation month/i);
        if (named && named.value !== undefined) { const p = parseMonthYear(s(named.value)); if (p) return { value: p.value, fact_id: named.id }; }
        const edu = facts.find((x) => x.kind === "education");
        if (edu) {
          if (edu.graduation_month !== undefined && edu.end) { const y = parseInt(s(edu.end), 10); const mo = parseInt(s(edu.graduation_month), 10); if (plausibleYear(y) && mo >= 1 && mo <= 12) return { value: y + "-" + pad2(mo), fact_id: edu.id }; }
          const p = parseMonthYear(s(edu.end)); // end at month precision ("2029-05") states the month
          if (p) return { value: p.value, fact_id: edu.id };
        }
        return null;
      },
      derivable(facts) {
        const edu = facts.find((x) => x.kind === "education" && x.end);
        if (edu && /\b\d{4}\b/.test(s(edu.end))) return "a graduation year is on file; the month was never stated";
        return null;
      },
      fact: (v) => ({ kind: "education", name: "Graduation month", title: "Graduation month", value: v }),
    }),
    graduation_year: F({
      key: "graduation_year", type: "year", factKinds: ["education"], nameRe: /graduation year/i,
      ask: "The application asks for your graduation year. I don't have it stated on file. Reply with a 4-digit year, for example \"2029\".",
      shape: "a 4-digit year",
      covers(facts) {
        const byKey = statedByKey(facts, "graduation_year");
        if (byKey) { const p = parseYear(null, s(byKey.value)); if (p) return { value: p.value, fact_id: byKey.id }; }
        const edu = facts.find((x) => x.kind === "education");
        if (edu && edu.end) { const p = parseYear(null, s(edu.end)); if (p) return { value: p.value, fact_id: edu.id }; }
        return null;
      },
      derivable(facts) {
        const edu = facts.find((x) => x.kind === "education" && x.start && !x.end);
        if (edu) return "a start year is on file; a graduation year computed from a program length was never stated";
        return null;
      },
      fact: (v) => ({ kind: "education", name: "Graduation year", title: "Graduation year", value: v }),
    }),
    education_level: F({
      key: "education_level", type: "level", factKinds: ["education"], nameRe: /education level|highest.*education|level of education/i,
      ask: "The application asks for your highest level of education. I don't have it stated as an answer on file — a degree name in your history isn't the same thing. Reply with one of: High School Diploma, Associate's Degree, Bachelor's Degree, Master's Degree, PhD.",
      shape: "one of: High School Diploma / Associate's Degree / Bachelor's Degree / Master's Degree / PhD",
      covers(facts) {
        const byKey = statedByKey(facts, "education_level");
        if (byKey) { const p = parseLevel(null, s(byKey.value)); if (p) return { value: p.value, fact_id: byKey.id }; }
        const edu = facts.find((x) => x.kind === "education" && x.level !== undefined);
        if (edu) { const p = parseLevel(null, s(edu.level)); if (p) return { value: p.value, fact_id: edu.id }; }
        const named = byKindName(facts, "education", /education level|highest.*education/i);
        if (named && named.value !== undefined) { const p = parseLevel(null, s(named.value)); if (p) return { value: p.value, fact_id: named.id }; }
        return null;
      },
      derivable(facts) {
        const edu = facts.find((x) => x.kind === "education");
        if (edu && LEVEL_PATTERNS.some((p) => p.re.test([factName(edu), s(edu.text)].join(" ")))) return "degree text on file suggests a level; the level as an answer was never stated";
        return null;
      },
      fact: (v) => ({ kind: "education", name: "Education level", title: "Education level", value: v }),
    }),
    located_in_us: F({
      key: "located_in_us", type: "yes_no", factKinds: ["profile"], nameRe: /located in|us resident|resides in/i,
      ask: "The application asks whether you are currently located in the United States. I don't have that stated as an answer on file. Reply yes or no.",
      shape: "yes / no",
      covers(facts, profile) {
        const f = statedByKey(facts, "located_in_us") || byKindName(facts, "profile", /located in|us resident/i);
        if (f && f.value !== undefined) { const v = normYesNo(f.value); if (v) return { value: v, fact_id: f.id }; }
        // A STATED country is the statement itself: "United States" on a
        // country fact restates to located-in-US Yes (owner card ruling
        // 2026-10-21: a direct restatement of the user's words is the
        // user's statement; a cross-fact inference is not).
        const country = byKindName(facts, "profile", /^country$/i);
        if (country && country.value) return { value: US_PLACE_TAIL.test(s(country.value)) ? "Yes" : "No", fact_id: country.id };
        // A stated residence in a US state is likewise the user's own
        // statement of where they live (same ruling, "Chicago, IL").
        const home = byKindName(facts, "profile", /hometown|residence|location/i);
        const place = (home && home.value) || (profile.basics && profile.basics.location) || "";
        if (place && (US_STATE_TAIL.test(s(place)) || US_PLACE_TAIL.test(s(place)))) return { value: "Yes", fact_id: home ? home.id : "basics.location" };
        return null;
      },
      derivable(facts, profile) {
        if ((profile.basics && profile.basics.time_zone) || byKindName(facts, "profile", /time ?zone/i)) return "a time zone is on file; a location inferred from it was never stated";
        return null;
      },
      fact: (v) => ({ kind: "profile", name: "Located in US", title: "Located in US", value: v }),
    }),
    country: F({
      key: "country", type: "text", factKinds: ["profile"], nameRe: /^country$/i,
      ask: "The application asks what country you live in. I don't have a country stated on file — a city isn't a country answer. Reply with the country name.",
      shape: "a country name",
      covers(facts) {
        const f = statedByKey(facts, "country") || byKindName(facts, "profile", /^country$/i);
        if (f && f.value) return { value: s(f.value), fact_id: f.id };
        return null;
      },
      derivable(facts, profile) {
        if (byKindName(facts, "profile", /hometown|residence|location/i) || (profile.basics && profile.basics.location)) return "a residence city is on file; the country was never stated";
        return null;
      },
      fact: (v) => ({ kind: "profile", name: "Country", title: "Country", value: v }),
    }),
    start_date: F({
      key: "start_date", type: "date", factKinds: ["profile"], nameRe: /start date|earliest start|available to start/i,
      ask: "The application asks when you could start. I don't have a start date stated on file, and it doesn't follow from your graduation date. Reply with a date or a month, for example \"June 2027\", or \"immediately\".",
      shape: "a date, a month + year, or \"immediately\"",
      covers(facts) {
        const f = statedByKey(facts, "start_date") || byKindName(facts, "profile", /start date|earliest start|available to start/i);
        if (f && f.value !== undefined && f.value !== "") return { value: s(f.value), fact_id: f.id };
        return null;
      },
      derivable(facts) {
        if (facts.some((x) => x.kind === "education" && x.end)) return "a graduation date is on file; a start date does not follow from it";
        return null;
      },
      fact: (v) => ({ kind: "profile", name: "Start date", title: "Start date", value: v }),
    }),
    relocation_willingness: F({
      key: "relocation_willingness", type: "yes_no", factKinds: ["profile", "eligibility"], nameRe: /relocat/i,
      ask: "The application asks whether you are willing to relocate for the role. I don't have your answer stated on file — where you live now says nothing about it. Reply yes or no.",
      shape: "yes / no",
      covers(facts) {
        const f = statedByKey(facts, "relocation_willingness")
          || facts.find((x) => (x.kind === "profile" || x.kind === "eligibility") && /relocat/i.test(factName(x)) && x.value !== undefined)
          || null;
        if (f) { const v = normYesNo(f.value); if (v) return { value: v, fact_id: f.id }; }
        return null;
      },
      derivable(facts, profile) {
        if (byKindName(facts, "profile", /hometown|residence|location/i) || (profile.basics && profile.basics.location)) return "a current location is on file; willingness to relocate does not follow from it";
        return null;
      },
      fact: (v) => ({ kind: "profile", name: "Relocation willingness", title: "Relocation willingness", value: v }),
    }),
    security_clearance: F({
      key: "security_clearance", type: "text", factKinds: ["profile"], nameRe: /clearance/i,
      ask: "The application asks whether you hold a security clearance. I don't have that stated on file. Reply \"none\" if you don't hold one, or the level, for example \"Secret\".",
      shape: "\"none\", or a clearance level",
      covers(facts) {
        const f = statedByKey(facts, "security_clearance") || byKindName(facts, "profile", /clearance/i);
        if (f && f.value !== undefined && f.value !== "") return { value: s(f.value), fact_id: f.id };
        return null;
      },
      derivable(facts) {
        if (facts.some((x) => x.kind === "experience" && /defense|government|federal|\bdod\b/i.test([factName(x), s(x.text), s(x.org)].join(" ")))) return "an employer's sector is on file; holding a clearance does not follow from an employer";
        return null;
      },
      fact: (v) => ({ kind: "profile", name: "Security clearance", title: "Security clearance", value: v }),
    }),
    age_18_plus: F({
      key: "age_18_plus", type: "attestation", factKinds: ["profile", "eligibility"], nameRe: /age 18|18 or older|18\+|over 18/i,
      ask: "The application needs an attestation from you directly: are you 18 years of age or older? It has to be your stated answer — I won't compute it from a date of birth. Reply yes or no.",
      shape: "yes / no",
      covers(facts, profile) {
        const f = statedByKey(facts, "age_18_plus")
          || facts.find((x) => (x.kind === "profile" || x.kind === "eligibility") && /age 18|18 or older|18\+/i.test(factName(x)) && x.value !== undefined)
          || null;
        if (f) { const v = normYesNo(f.value); if (v) return { value: v, fact_id: f.id }; }
        // 171's attestation shape: an explicit tap IS the user's statement.
        const att = profile.attestations && typeof profile.attestations === "object" ? profile.attestations.age_18_plus : null;
        if (att && att.explicit === true) return { value: "Yes", fact_id: "attestations.age_18_plus" };
        return null;
      },
      derivable(facts) {
        if (byKindName(facts, "profile", /date of birth/i)) return "a date of birth is on file; an age computed from it is not an attestation";
        return null;
      },
      fact: (v) => ({ kind: "profile", name: "Age 18+", title: "Age 18+", value: v, attestation: true }),
    }),
  };
  const DEFAULT_FIELD_KEYS = ["sponsorship", "work_authorization", "years_of_experience", "graduation_month", "graduation_year", "education_level", "located_in_us", "country", "start_date", "relocation_willingness", "security_clearance", "age_18_plus"];

  // ---------- field-def normalization (149/171 shapes) ----------
  function normalizeFieldDef(def) {
    if (!def) return null;
    if (typeof def === "string") def = { key: def };
    const key = def.key || def.question_key || def.field_key || def.field_id || def.profile_key;
    if (!key) return null;
    if (def.required === false) return null; // optional fields are never asked about
    const cat = FIELD_CATALOG[key];
    if (cat) return Object.assign({}, cat, { label: def.label || null });
    // Unknown key: a generic text field. Coverage is an explicit stated
    // answer-key fact ONLY — there is no matcher to derive from.
    return {
      key, type: def.type || "text", factKinds: [], nameRe: new RegExp("^$"),
      ask: "The application asks for " + (def.label || key.replace(/_/g, " ")) + ". I don't have your answer stated on file. Reply with your answer.",
      shape: def.shape || "your stated answer",
      covers(facts) { const f = statedByKey(facts, key); return f ? { value: s(f.value), fact_id: f.id } : null; },
      derivable() { return null; },
      fact: (v) => ({ kind: "profile", name: key.replace(/_/g, " "), title: key.replace(/_/g, " "), value: v }),
      generic: true,
    };
  }
  function normalizeFieldDefs(fieldDefs) {
    const defs = (Array.isArray(fieldDefs) && fieldDefs.length ? fieldDefs : DEFAULT_FIELD_KEYS).map(normalizeFieldDef).filter(Boolean);
    const seen = new Set();
    return defs.filter((d) => (seen.has(d.key) ? false : (seen.add(d.key), true)));
  }

  // ---------- coverage ----------
  function assessCoverage(profile, fieldDefs, deps) {
    const { reader, mode } = readerOf(deps);
    const safeProfile = profile && typeof profile === "object" ? profile : {};
    const facts = reader.trustedFacts(safeProfile);
    const covered = [], missing = [];
    for (const field of normalizeFieldDefs(fieldDefs)) {
      const hit = field.covers(facts, safeProfile);
      if (hit) { covered.push({ field_key: field.key, value: hit.value, fact_id: hit.fact_id, tag: "REAL" }); continue; }
      const entry = statedAnswerEntry(safeProfile, field.key);
      if (entry) { covered.push({ field_key: field.key, value: entry.value, fact_id: null, tag: "REAL" }); continue; }
      missing.push({ field_key: field.key, type: field.type, reason: "no_stated_confirmed_fact", derivable_refused: field.derivable(facts, safeProfile) });
    }
    return { covered, missing, reader_mode: mode, parser170: !!Parser170 };
  }

  // ---------- ask queue / session ----------
  function questionIdFor(fieldKey, context) {
    const slug = context && (context.run_id || context.application_id || context.ref);
    return "mfq_" + fieldKey + (slug ? "_" + String(slug).replace(/[^a-z0-9]+/gi, "-") : "");
  }
  function buildQuestion(field, missingEntry, opts) {
    const context = opts.context || null;
    const prefix = context && context.company ? "On the " + context.company + (context.title ? " " + context.title : "") + " application — " : "";
    return {
      question_id: questionIdFor(field.key, context),
      field_key: field.key,
      type: field.type,
      text: prefix + field.ask,
      accepted_shape: field.shape,
      reason: missingEntry.reason,
      derivable_refused: missingEntry.derivable_refused || null,
      status: "open",
      asked_at: null,
      reasks: 0,
    };
  }
  function createSession(profile, fieldDefs, opts) {
    opts = opts || {};
    const assessment = assessCoverage(profile, fieldDefs, opts.deps);
    const defsByKey = new Map(normalizeFieldDefs(fieldDefs).map((d) => [d.key, d]));
    const queue = assessment.missing.map((m) => buildQuestion(defsByKey.get(m.field_key), m, opts));
    if (queue.length) queue[0].asked_at = opts.now || null;
    return {
      kind: "missing_fact_ask_session",
      version: VERSION,
      reader_mode: assessment.reader_mode,
      context: opts.context || null,
      created_at: opts.now || null,
      covered: assessment.covered,
      queue,
      open_question_id: queue.length ? queue[0].question_id : null,
      stored_facts: [],
      complete: queue.length === 0,
      seq: 0,
    };
  }
  function currentQuestion(session) {
    if (!session || !Array.isArray(session.queue)) return null;
    return session.queue.find((q) => q.question_id === session.open_question_id && q.status === "open") || null;
  }

  // ---------- intake ----------
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function intakeReply(session, replyText, opts) {
    opts = opts || {};
    const next = clone(session);
    const open = currentQuestion(next);
    if (!open) return { status: "no_open_question", session: next };
    if (opts.question_id && opts.question_id !== open.question_id) {
      return { status: "stale_question", expected_question_id: open.question_id, session: next };
    }
    const field = FIELD_CATALOG[open.field_key] || normalizeFieldDef({ key: open.field_key, type: open.type });
    const parsed = parseReply(field, replyText);
    if (!parsed.ok) {
      open.reasks += 1;
      return {
        status: "reask",
        question_id: open.question_id,
        field_key: open.field_key,
        reason: parsed.reason,
        text: "I didn't catch that as an answer. " + open.text + " (Accepted: " + open.accepted_shape + ".) Nothing was saved.",
        stored: false,
        session: next,
      };
    }
    next.seq += 1;
    const base = field.fact(parsed.value);
    const fact = Object.assign({}, base, {
      id: typeof opts.idFactory === "function" ? opts.idFactory(open.field_key, next.seq) : "F-ASK-" + open.field_key + "-" + next.seq,
      answer_key: open.field_key,
      text: s(replyText).trim(),
      status: "confirmed",
      needs_confirmation: false,
      source: "owner_reply",
      provenance: {
        source: "owner_reply",
        question_id: open.question_id,
        field_key: open.field_key,
        asked_at: open.asked_at || null,
        answered_at: opts.now || null,
        verbatim: s(replyText),
        parsed_via: parsed.via,
        precision: parsed.precision || undefined,
      },
    });
    open.status = "answered";
    open.answered_value = parsed.value;
    open.answered_at = opts.now || null;
    next.stored_facts.push(fact);
    const remaining = next.queue.filter((q) => q.status === "open" && q.question_id !== open.question_id);
    const nxt = remaining[0] || null;
    if (nxt) { nxt.asked_at = opts.now || null; next.open_question_id = nxt.question_id; }
    else { next.open_question_id = null; next.complete = true; }
    return {
      status: "stored",
      fact,
      field_key: open.field_key,
      value: parsed.value,
      tag: "REAL",
      resume: {
        signal: next.complete ? "all_fields_covered" : "fact_stored",
        field_key: open.field_key,
        question_id: open.question_id,
        context: next.context || null,
        remaining: remaining.length,
        complete: next.complete,
        next_question: nxt,
      },
      session: next,
    };
  }

  // The host-side write: append an intake-produced fact to a profile/
  // bank (the host then persists it through 122 like any stated fact).
  function applyStoredFact(profile, fact) {
    const out = Object.assign({}, profile || {});
    out.facts = (Array.isArray(out.facts) ? out.facts.slice() : []).concat([fact]);
    return out;
  }

  return {
    VERSION,
    FIELD_CATALOG,
    DEFAULT_FIELD_KEYS,
    assessCoverage,
    createSession,
    buildAskQueue: (missing, fieldDefs, opts) => {
      const defsByKey = new Map(normalizeFieldDefs(fieldDefs).map((d) => [d.key, d]));
      return (missing || []).map((m) => buildQuestion(defsByKey.get(m.field_key) || normalizeFieldDef({ key: m.field_key }), m, opts || {}));
    },
    currentQuestion,
    intakeReply,
    applyStoredFact,
    parseReply,
    parseMonthYear,
    _readerOf: readerOf,
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerMissingFactAsk;
