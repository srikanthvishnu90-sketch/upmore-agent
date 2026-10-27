// extension_sync.js — the saved-answers sync core for the Trainee
// assisted-apply extension (SAVED-ANSWERS SYNC lane, 2026-10-20).
//
// Two jobs, both scoped to the CALLER and nobody else:
//   1. GET  .../saved-answers      — serve the signed-in user THEIR saved
//      answers: module 149's deriveAnswers over their own confirmed 122
//      profile (the stored master in their freshest agent_flow_state
//      snapshot), composed exactly the way the product composes it for
//      its own apply paths. The derivation contract is the boundary:
//      only confirmed facts and the user's own recorded saved answers
//      produce entries; nothing is invented, and no other user's record
//      is reachable — the read is keyed by the VERIFIED user id from
//      the caller's JWT, and no request field can name another user.
//   2. POST .../application-proofs — record a submission the USER made
//      (the extension fills; the user clicks Submit — §6.3, this module
//      adds no submit path anywhere). The report is recorded as an
//      employer-record-class tracker entry (module 126's row shape,
//      stage Confirmed, a "confirmation" event sourced employer_record)
//      ONLY when the confirmation excerpt the report carries re-parses,
//      under module 150's extractConfirmation rules, to the confirmation
//      it claims. A bare claim with no parsing excerpt is refused by
//      construction — the record carries what the employer's page
//      showed, never what a client merely asserted.
//
// All I/O is injected (verifyToken / readFlowRows / findReportBy
// Confirmation / insertReport / now), so the node guard suite drives
// this exact code with test doubles for the network services, and the
// Deno wrapper (supabase/functions/extension-sync/index.ts) wires the
// real Supabase calls. The domain modules are injected too (the wrapper
// passes the generated bundle: scripts/build-extension-sync.py); the
// composition below never re-derives answers itself — module 149 does.
//
// Terminology (owner, 2026-10-20): these are the user's SAVED ANSWERS.
// The word for the fixture-era "bank" survives only in storage keys the
// spike already shipped (chrome.storage.local 'traineeBank'), never in
// copy or in this module's contract.

// ---------- eligibility contract (GENERATED) ----------
// Byte-identical copy of the contract body in
// packages/domain/156-career-eligibility.js (the source of truth — edit
// there, never here), inlined because this file is loaded with a
// no-imports linker by its node guard suite. The ES-module copy for
// importers is _shared/eligibility_facts.js. composeSavedAnswers
// applies this contract as a pass over the preserved base composition
// (see the eligibility contract pass there).
const CareerEligibility = (() => {
  // ---------- the sentence reader (port of G2 eligibility_draft.ts) ----------
  const MENTIONS = {
    sponsorship: /sponsor/,
    work_authorization: /\b(?:authori[sz]ed|eligible|permitted) to work\b|\bwork authori[sz]ation\b|\bauthori[sz]ation to work\b/,
  };
  // Words that make a statement conditional or uncertain: it is not an answer.
  const HEDGE = /\b(?:if|might|may|maybe|perhaps|probably|possibly|unsure|not sure|depends|depending|whether|could|think|guess|hope|unless)\b/;
  const US = /\b(?:us|u s|usa|united states(?: of america)?|america)\b/;

  // Contractions spelled out, so the patterns read one way: "don't" → "do not", "I'm" → "i am", "I'll" → "i will".
  function normal(s) {
    return ` ${String(s).toLowerCase().replace(/[’`]/g, "'")} `
      .replace(/\bcan't\b/g, "can not").replace(/\bwon'?t\b/g, "will not").replace(/\b(do|does|did|would|should|is|am|are)n'?t\b/g, "$1 not")
      .replace(/\bdont\b/g, "do not").replace(/\bi'?m\b/g, "i am").replace(/\bi'll\b/g, "i will").replace(/\bi'd\b/g, "i would")
      .replace(/[^a-z0-9?'\s-]/g, " ").replace(/\s+/g, " ");
  }
  // A message's sentences, each with whether it was asked as a question ("U.S." is a name, not the end of one).
  function sentences(text) {
    return String(text ?? "").replace(/\b[Uu]\.\s?[Ss]\.(?:\s?[Aa]\.)?/g, "US").split(/(?<=[.!?;\n])/).map((raw) => ({ s: normal(raw), asked: /\?\s*$/.test(raw.trim()) }))
      .filter((x) => x.s.trim());
  }

  // Only these words may sit between "need" and "sponsor" ("I need a visa sponsor"; never "I need to know about sponsorship").
  const FILL = "(?:(?:a|an|the|any|visa|employment|work|h-1b|h1b|employer|company|future|new|immigration) )*";
  const SP_NO = new RegExp(`\\b(?:i|and)(?: do| will| would| shall)? (?:not|never|no longer)(?: (?:currently|ever|now|presently|yet))? (?:need|require)s? ${FILL}sponsor`);
  const SP_YES = new RegExp(`\\b(?:i|and)(?: will| do| would| shall| currently| also| still)? (?:need|require)s? ${FILL}sponsor`);
  const WA_NO = /\bi am not (?:(?:legally|currently) )*(?:authori[sz]ed|eligible|permitted) to work\b|\bi do not have (?:(?:valid|any|us) )*(?:work authori[sz]ation|authori[sz]ation to work)\b/;
  const WA_YES = /\bi am (?:(?:legally|currently|fully|also|now|already) )*(?:authori[sz]ed|eligible|permitted) to work\b|\bi have (?:(?:valid|full|current|us) )*(?:work authori[sz]ation|authori[sz]ation to work)\b/;

  // One sentence's answer for one fact: a value, "unclear" (it is about the fact but is not an answer), or null.
  function sentenceValue(fact, x) {
    if (!MENTIONS[fact].test(x.s)) return null;
    if (x.asked || HEDGE.test(x.s)) return "unclear";
    if (fact === "sponsorship") {
      if (SP_NO.test(x.s)) return "No";
      if (SP_YES.test(x.s) && !/\b(?:not|never|no longer)\b/.test(x.s)) return "Yes";
      return "unclear";
    }
    const no = WA_NO.test(x.s), yes = !no && WA_YES.test(x.s);
    if (!no && !yes) return "unclear";
    // Only the US: any other place named after "to work in" is another country's question.
    const where = /\bto work (?:\w+ ){0,4}?in (?:the )?([a-z][a-z ]{1,30})/.exec(x.s);
    if (where && !US.test(` ${where[1]} `)) return "unclear";
    return no ? "No" : "Yes";
  }

  // One message's answer for one fact: a single clear value, or "unclear", or null when it does not mention the fact.
  function statedValue(fact, text) {
    const vals = sentences(text).map((x) => sentenceValue(fact, x)).filter((v) => v !== null);
    if (!vals.length) return null;
    return new Set(vals).size === 1 ? vals[0] : "unclear";
  }

  // ---------- the typed facts ----------
  // The router's own fallback clauses (142 writeSensitiveCorrection): text
  // the product wrote, never the person's words. Stored verbatim in
  // constraints.workAuthorization when a correction carried no clause.
  const ROUTER_FALLBACK_TEXTS = Object.freeze(["No longer needs sponsorship", "Will need sponsorship in the future"]);

  const WA_VALUES = ["authorized", "not_authorized"];
  const SP_VALUES = ["needs", "not_needed"];
  const unknownFact = () => ({ value: "unknown", confirmed: false, provenance: null });
  const emptyEligibility = () => ({ version: 1, work_authorization_us: unknownFact(), sponsorship: unknownFact() });

  // A typed fact, validated: a value outside the enum, or "confirmed"
  // without the person's own words in a person_statement provenance, fails
  // closed to unknown (proposal §2 rule 2). An unconfirmed fact keeps its
  // value and provenance: it may surface as a draft, never as an answer.
  function validFact(raw, values) {
    if (!raw || typeof raw !== "object") return unknownFact();
    if (!values.includes(raw.value)) return unknownFact();
    const prov = raw.provenance && typeof raw.provenance === "object" ? raw.provenance : null;
    if (raw.confirmed === true) {
      if (!prov || prov.kind !== "person_statement" || typeof prov.text !== "string" || !prov.text.trim()) return unknownFact();
      return { value: raw.value, confirmed: true, provenance: prov };
    }
    return { value: raw.value, confirmed: false, provenance: prov };
  }

  // The typed record on a constraints object, validated. A record of the
  // wrong version fails closed whole: neither fact answers.
  function normalizeTyped(record) {
    if (!record || typeof record !== "object" || record.version !== 1) return emptyEligibility();
    return {
      version: 1,
      work_authorization_us: validFact(record.work_authorization_us, WA_VALUES),
      sponsorship: validFact(record.sponsorship, SP_VALUES),
    };
  }

  // Stored legacy values -> typed facts, never confirmed (proposal §5).
  // The stored text sits in constraints.workAuthorization; the flag is
  // constraints.needsSponsorship. Each fact is read from the text by the
  // sentence reader, for that fact alone; the flag speaks only to
  // sponsorship. If the text and the flag disagree on sponsorship,
  // sponsorship is unknown.
  function classifyLegacy(input) {
    const src = input && typeof input === "object" ? input : {};
    const text = typeof src.workAuthorization === "string" && src.workAuthorization.trim() ? src.workAuthorization : null;
    const flag = typeof src.needsSponsorship === "boolean" ? src.needsSponsorship : null;
    const out = emptyEligibility();
    if (text && ROUTER_FALLBACK_TEXTS.includes(text.trim())) {
      // The router's own text: marked as such, never shown as the person's
      // words. Its sponsorship polarity is taken from the flag, kept as an
      // unconfirmed value with no words.
      out.work_authorization_us = { value: "unknown", confirmed: false, provenance: { kind: "legacy", field: "workAuthorization", writer: "router_fallback", text: null } };
      out.sponsorship = {
        value: flag === null ? "unknown" : flag ? "needs" : "not_needed",
        confirmed: false,
        provenance: { kind: "legacy", field: "needsSponsorship", writer: "router_fallback", text: null },
      };
      return out;
    }
    if (text) {
      const wa = statedValue("work_authorization", text);
      if (wa === "Yes" || wa === "No") {
        out.work_authorization_us = {
          value: wa === "Yes" ? "authorized" : "not_authorized",
          confirmed: false,
          provenance: { kind: "legacy", field: "workAuthorization", writer: "unattributed", text },
        };
      } else {
        out.work_authorization_us = { value: "unknown", confirmed: false, provenance: { kind: "legacy", field: "workAuthorization", writer: "unattributed", text } };
      }
    }
    const fromText = text ? statedValue("sponsorship", text) : null;
    const textValue = fromText === "Yes" ? "needs" : fromText === "No" ? "not_needed" : null;
    const flagValue = flag === null ? null : flag ? "needs" : "not_needed";
    if (textValue && flagValue && textValue !== flagValue) {
      out.sponsorship = { value: "unknown", confirmed: false, provenance: { kind: "legacy", field: "stated_fact", writer: "unattributed", text } };
    } else if (textValue) {
      out.sponsorship = { value: textValue, confirmed: false, provenance: { kind: "legacy", field: "stated_fact", writer: "unattributed", text } };
    } else if (flagValue) {
      out.sponsorship = { value: flagValue, confirmed: false, provenance: { kind: "legacy", field: "needsSponsorship", writer: "unattributed", text: null } };
    } else if (text) {
      out.sponsorship = { value: "unknown", confirmed: false, provenance: { kind: "legacy", field: "stated_fact", writer: "unattributed", text } };
    }
    return out;
  }

  // The eligibility record for a profile's constraints: the typed record
  // when one is stored (validated), else the legacy fields read at read
  // time — nothing stored needs rewriting (proposal §5).
  function eligibilityOf(constraints) {
    const c = constraints && typeof constraints === "object" ? constraints : {};
    if (c.eligibility && typeof c.eligibility === "object") return normalizeTyped(c.eligibility);
    if (c.work_authorization_us && typeof c.work_authorization_us === "object") return normalizeTyped(c);
    return classifyLegacy(c);
  }

  const FACT_KEY = { work_authorization: "work_authorization_us", work_authorization_us: "work_authorization_us", sponsorship: "sponsorship" };
  const YES_NO = {
    work_authorization_us: { authorized: "Yes", not_authorized: "No" },
    sponsorship: { needs: "Yes", not_needed: "No" },
  };

  // The draft an unconfirmed fact is offered as: the G2 shape, carrying the
  // stored words. A fact with no words (a bare flag, the router's fallback
  // text) has no draft — there is nothing of the person's to offer back.
  function draftOf(which, fact) {
    const prov = fact && fact.provenance && typeof fact.provenance === "object" ? fact.provenance : null;
    if (!fact || fact.value === "unknown" || !prov || typeof prov.text !== "string" || !prov.text) return null;
    const value = YES_NO[FACT_KEY[which]][fact.value];
    if (!value) return null;
    return { fact: which, value, text: prov.text, at: typeof prov.at === "string" ? prov.at : null };
  }

  // answerFor(eligibility, "work_authorization" | "sponsorship"):
  // { value: "Yes" | "No" } when that fact is confirmed — each fact from
  // its own record, never from the other — else { ask: true, draft },
  // where draft is the unconfirmed value in the person's words, or null.
  function answerFor(eligibility, which) {
    const key = FACT_KEY[which];
    if (!key) return { ask: true, draft: null };
    const e = eligibility && typeof eligibility === "object" && eligibility.version === 1 ? eligibility : emptyEligibility();
    const fact = e[key] && typeof e[key] === "object" ? e[key] : unknownFact();
    if (fact.confirmed === true && YES_NO[key][fact.value]) return { value: YES_NO[key][fact.value] };
    return { ask: true, draft: draftOf(which, fact) };
  }

  // A fact confirmed from the person's own statement: what the writers
  // (onboarding, corrections) store when the person has just answered.
  // Returns null when the statement does not clearly answer the fact —
  // a question, a hedge, another country, the other fact's statement.
  function fromStatement(fact, text, opts) {
    const key = FACT_KEY[fact];
    if (!key || typeof text !== "string" || !text) return null;
    const v = statedValue(key === "work_authorization_us" ? "work_authorization" : "sponsorship", text);
    if (v !== "Yes" && v !== "No") return null;
    const value = key === "work_authorization_us" ? (v === "Yes" ? "authorized" : "not_authorized") : (v === "Yes" ? "needs" : "not_needed");
    const o = opts && typeof opts === "object" ? opts : {};
    return {
      value,
      confirmed: true,
      provenance: { kind: "person_statement", text, at: typeof o.at === "string" ? o.at : null, via: typeof o.via === "string" ? o.via : "chat" },
    };
  }

  return { statedValue, classifyLegacy, eligibilityOf, answerFor, fromStatement, ROUTER_FALLBACK_TEXTS };
})();

const ExtensionSync = (() => {
  const clone = (v) => JSON.parse(JSON.stringify(v));
  const coded = (code, message) => Object.assign(new Error(message || code), { code });

  // ---------- confirmation parsing (port of module 150 extractConfirmation, BUG-208) ----------
  // Identical rules to the extension's fill-engine port: an ID counts
  // only in a labeled confirmation context with a digit-bearing token;
  // unambiguous employer success wording counts on its own.
  function extractConfirmation(text, opts) {
    const t = String(text || "");
    if (opts && opts.formStillOpen) return { confirmationId: null, successText: false, formStillOpen: true };
    const idMatch = t.match(/(?:application|confirmation|reference|submission|tracking)\s*(?:(?:id|number|no\.?)\s*[:#]|#)\s*([A-Z0-9][A-Z0-9-]{4,})\b/i);
    const confirmationId = idMatch && /\d/.test(idMatch[1]) ? idMatch[1] : null;
    const successText = /(application (has been |was )?(submitted|received)|thank you for applying|we(?:'ve| have) received your application|successfully submitted|application is complete|your application was sent)/i.test(t);
    return { confirmationId, successText };
  }

  // ---------- master selection (mirrors workers/career-browser/production-sources.cjs readStoredMaster) ----------
  // Rows arrive freshest-first (the wrapper orders by updated_at desc,
  // limit 25 — the same read the batch worker performs). The first
  // snapshot whose career stores carry a profile master wins.
  function masterFromFlowRows(rows) {
    for (const row of rows || []) {
      const stores = row && row.state && row.state.career ? row.state.career.stores : null;
      const profile = stores ? stores.profile : null;
      if (profile && typeof profile === "object" && (profile.basics || profile.facts)) return profile;
    }
    return null;
  }

  // ---------- saved-answer seam (module 132 savedAnswerFor semantics) ----------
  // Module 132 derives the sensitive saved answers from the profile's
  // constraints/defaults for the chat product's confirmation prompts.
  // The extension's boards carry Yes/No widgets for these questions, so
  // the seam emits the widget token; prose that does not resolve to a
  // token travels verbatim, where the engine's option matching fails
  // closed to needs-user — a wrong fill is impossible either way.
  // Branch A adds one guard after this seam (see composeSavedAnswers):
  // a token the seam derived from a sponsorship statement is withheld
  // there, because that text is not an authorization answer. The seam
  // itself is unchanged.
  function workAuthorizationToken(text) {
    const t = String(text || "").trim();
    if (/^yes\b/i.test(t)) return "Yes";
    if (/^no\b/i.test(t)) return "No";
    if (/not authorized|not eligible to work|no work authorization/i.test(t)) return "No";
    if (/citizen|permanent resident|green card|lawful permanent|authorized to work|eligible to work|employment authorization|work permit/i.test(t)) return "Yes";
    return t;
  }

  // A deterministic content tag: changes iff the served answers change
  // (the sync freshness rule in DESIGN.md §2). A change tag, not a
  // security hash.
  function savedAnswersVersionOf(profile, answers) {
    const canon = (v) => Array.isArray(v) ? v.map(canon) : (v && typeof v === "object" ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v);
    const s = JSON.stringify(canon({ profile, answers }));
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
    return "sa-" + h.toString(16).padStart(8, "0");
  }

  // composeSavedAnswers(master, now, portalApply) -> the served map.
  // Layers, in order (later wins on a key conflict):
  //   1. the master's stored answers with confirmed === true, verbatim
  //      (production-sources.cjs carries them the same way for the
  //      batch worker — the record the product already holds);
  //   2. module 149 deriveAnswers over the master (fresh derivation
  //      from confirmed facts, each entry carrying its factId trace);
  //   3. the module 132 saved-answer seam for keys still unanswered
  //      (sponsorship / work authorization from constraints, pronouns
  //      from defaults) — preserved exactly as the base composition;
  //   4. the eligibility contract pass (module 156), which only ever
  //      adds or withholds on the two sensitive keys: a confirmed
  //      typed eligibility fact serves its own key, and a
  //      work-authorization entry the seam just derived from a
  //      sponsorship statement is withheld (a sponsorship sentence is
  //      not an authorization answer). Every other entry is the base
  //      composition, untouched.
  // Identity fields ride the profile: basics verbatim (no derivation),
  // then deriveAnswers' profileFields (country, date of birth, state,
  // time zone, preferred name, the education block), then the resume as
  // { filename, sha256 } metadata only (portalProfileFromMaster's rule).
  function composeSavedAnswers(master, now, portalApply) {
    if (!master || typeof master !== "object") throw coded("PROFILE_NOT_FOUND", "composeSavedAnswers: no stored profile master");
    if (!portalApply || typeof portalApply.deriveAnswers !== "function") throw coded("EXTENSION_SYNC_NOT_WIRED", "composeSavedAnswers: module 149 (deriveAnswers) was not injected");
    const nowMs = typeof now === "number" ? now : Date.parse(now);
    const b = (master.basics && typeof master.basics === "object") ? master.basics : {};
    const links = (b.links && typeof b.links === "object") ? b.links : {};
    const profile = {};
    const setP = (k, v) => { if (v !== undefined && v !== null && String(v) !== "") profile[k] = v; };
    setP("name", b.name || b.full_name || master.name);
    setP("email", b.email || master.email);
    setP("phone", b.phone);
    setP("location", b.location);
    setP("linkedin", links.linkedin || b.linkedin);
    setP("github", links.github || b.github);
    setP("website", links.portfolio || links.website || b.website);
    setP("current_company", b.current_company || b.currentCompany);
    const derived = portalApply.deriveAnswers(master, nowMs) || { answers: {}, profileFields: {}, traces: {} };
    for (const [k, v] of Object.entries(derived.profileFields || {})) setP(k, v);
    const r = master.resume || b.resume || null;
    if (r && r.sha256) profile.resume = { filename: r.filename || "resume.pdf", sha256: r.sha256 };

    const answers = {};
    const traces = {};
    const stored = (master.answers && typeof master.answers === "object") ? master.answers : {};
    for (const [k, a] of Object.entries(stored)) {
      if (a && a.confirmed === true && a.value !== undefined && a.value !== null && String(a.value) !== "") {
        answers[k] = clone(a);
        if (a.factId) traces[k] = { factId: a.factId, how: "stored saved answer on the profile record" };
      }
    }
    // Pre-seam presence of the two sensitive keys, for the eligibility
    // contract pass below: it may only withhold an entry the seam itself
    // added, never one the stored answers or the derivation produced.
    const storedEligibilityAnswers = {};
    for (const key of ["work_authorization", "sponsorship"]) if (answers[key]) storedEligibilityAnswers[key] = true;
    for (const [k, a] of Object.entries(derived.answers || {})) answers[k] = clone(a);
    for (const [k, t] of Object.entries(derived.traces || {})) traces[k] = clone(t);
    const derivedEligibilityKeys = new Set(["work_authorization", "sponsorship"].filter((key) => derived.answers && derived.answers[key]));

    const c = (master.constraints && typeof master.constraints === "object") ? master.constraints : {};
    const dfl = (master.defaults && typeof master.defaults === "object") ? master.defaults : {};
    const seam = (key, value, factId, how) => {
      if (answers[key] || value === undefined || value === null || String(value) === "") return;
      answers[key] = { value, confirmed: true, factId };
      traces[key] = { factId, how };
    };
    if (typeof c.needsSponsorship === "boolean") {
      seam("sponsorship", c.needsSponsorship ? "Yes" : "No", "profile.constraints.needsSponsorship",
        "saved sponsorship answer from the profile constraints (module 132 savedAnswerFor rule)");
    }
    if (typeof c.workAuthorization === "string" && c.workAuthorization.trim()) {
      seam("work_authorization", workAuthorizationToken(c.workAuthorization), "profile.constraints.workAuthorization",
        "saved work-authorization answer from the profile constraints (module 132 savedAnswerFor rule)");
    }
    // Eligibility contract pass (ELIGIBILITY-SEPARATION-PROPOSAL.md,
    // Branch A) — extending, never reshaping: every entry the layers
    // above produced stands exactly as the base composition produced
    // it, with two contract rules on the sensitive keys.
    // (a) A confirmed typed eligibility fact (constraints.eligibility,
    // read by the generated 156 contract above) serves its own key.
    // That data shape is new in Branch A — the base composition never
    // read it — so serving it alters no existing entry.
    // (b) A work-authorization entry the seam just derived from a
    // stored text that speaks about sponsorship is withheld: for such
    // profiles the text in that field is a sponsorship statement (the
    // router's fallback texts — "No longer needs sponsorship" — are
    // the pinned case, tokenized by the seam to a served "No"), and a
    // sponsorship sentence is not an authorization answer. Entries the
    // stored answers or the derivation produced are never withheld.
    const elig = CareerEligibility.eligibilityOf(c);
    for (const [key, factId] of [
      ["work_authorization", "profile.constraints.eligibility.work_authorization_us"],
      ["sponsorship", "profile.constraints.eligibility.sponsorship"],
    ]) {
      const a = CareerEligibility.answerFor(elig, key);
      if (a && a.value) {
        answers[key] = { value: a.value, confirmed: true, factId };
        traces[key] = { factId, how: "confirmed typed eligibility fact (module 156 answerFor), served from its own fact" };
      }
    }
    const seamAddedWorkAuthorization = answers.work_authorization && !storedEligibilityAnswers.work_authorization && !derivedEligibilityKeys.has("work_authorization");
    if (seamAddedWorkAuthorization
        && !CareerEligibility.answerFor(elig, "work_authorization").value
        && typeof c.workAuthorization === "string" && /\bsponsor/i.test(c.workAuthorization)) {
      delete answers.work_authorization;
      delete traces.work_authorization;
    }
    if (typeof dfl.pronouns === "string" && dfl.pronouns.trim()) {
      seam("pronouns", dfl.pronouns, "profile.defaults.pronouns", "recorded pronouns default on the profile");
    }
    // located_in_us: deriveAnswers derives it only from a country
    // fact. The 122 master carries the residence in basics.location —
    // the same field deriveAnswers itself reads for state_of_residence
    // and time_zone — so when that residence's tail is a US state (or
    // the derived country already says United States), the residence
    // the record carries answers the question. Narrow by construction:
    // a tail that is not a US state yields nothing.
    if (!answers.located_in_us) {
      const hometown = (master.facts || []).find((f) => f.kind === "profile" && /hometown/i.test(f.name || f.title || "") && f.status === "confirmed" && f.needs_confirmation !== true);
      const residence = (hometown && hometown.value) || b.location || "";
      const tail = String(residence).split(",").pop().trim().replace(/\s*\(.*?\)\s*$/, "");
      const US_STATES = "AL AK AZ AR CA CO CT DE FL GA HI ID IL IN IA KS KY LA ME MD MA MI MN MS MO MT NE NV NH NJ NM NY NC ND OH OK OR PA RI SC SD TN TX UT VT VA WA WV WI WY DC";
      const US_STATE_NAMES = ["Alabama", "Alaska", "Arizona", "Arkansas", "California", "Colorado", "Connecticut", "Delaware", "Florida", "Georgia", "Hawaii", "Idaho", "Illinois", "Indiana", "Iowa", "Kansas", "Kentucky", "Louisiana", "Maine", "Maryland", "Massachusetts", "Michigan", "Minnesota", "Mississippi", "Missouri", "Montana", "Nebraska", "Nevada", "New Hampshire", "New Jersey", "New Mexico", "New York", "North Carolina", "North Dakota", "Ohio", "Oklahoma", "Oregon", "Pennsylvania", "Rhode Island", "South Carolina", "South Dakota", "Tennessee", "Texas", "Utah", "Vermont", "Virginia", "Washington", "West Virginia", "Wisconsin", "Wyoming", "District of Columbia"];
      const isUs = (/^[A-Za-z]{2}$/.test(tail) && US_STATES.split(" ").includes(tail.toUpperCase())) || US_STATE_NAMES.some((n) => n.toLowerCase() === tail.toLowerCase());
      if (isUs || /^united states$/i.test(String(profile.country || ""))) {
        seam("located_in_us", "Yes", hometown ? hometown.id : "basics.location",
          "the residence the record carries is in a US state (the same source module 149 reads for state_of_residence)");
      }
    }

    const map = { profile, answers, traces };
    if (typeof dfl.demographicPreference === "string" && /decline/i.test(dfl.demographicPreference)) map.eeoPolicy = "decline";
    map.persona = profile.name || null; // display only — the popup shows the owner their own name
    map.source = "saved-answers";
    map.derivedAt = new Date(Number.isFinite(nowMs) ? nowMs : Date.now()).toISOString();
    map.savedAnswersVersion = savedAnswersVersionOf(profile, answers);
    return map;
  }

  // ---------- submission report validation ----------
  // The report is accepted only when the confirmation excerpt it
  // carries re-parses, under the rules above, to the confirmation it
  // claims. Everything else about the report is bounded plain data.
  function validateSubmissionReport(body, opts) {
    const now = (opts && typeof opts.now === "number") ? opts.now : Date.now();
    const refuse = (code, message) => ({ ok: false, code, message });
    if (!body || typeof body !== "object" || Array.isArray(body)) return refuse("REPORT_INVALID", "the report is not an object");
    const str = (v, max) => (typeof v === "string" && v.trim() && v.length <= max) ? v.trim() : null;
    const employer = str(body.employer, 200);
    const role = str(body.role, 200);
    if (!employer || !role) return refuse("REPORT_INVALID", "the report must name the employer and the role it is proof for");
    const posting = (body.posting && typeof body.posting === "object") ? body.posting : {};
    const postingUrl = str(posting.url, 1000);
    if (!postingUrl) return refuse("REPORT_INVALID", "the report must carry the posting URL it is proof for");
    let parsed;
    try { parsed = new URL(postingUrl); } catch { return refuse("REPORT_INVALID", "the posting URL does not parse"); }
    const localDemo = (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") && parsed.protocol === "http:";
    if (parsed.protocol !== "https:" && !localDemo) return refuse("REPORT_INVALID", "the posting URL must be https (the local demo host excepted)");
    const conf = (body.confirmation && typeof body.confirmation === "object") ? body.confirmation : {};
    if (conf.formStillOpen === true) return refuse("FORM_STILL_OPEN", "the page still held an open application form — module 150's rule: that page is an unsubmitted form, never a confirmation");
    const text = typeof conf.confirmationText === "string" ? conf.confirmationText.replace(/\s+/g, " ").trim().slice(0, 800) : "";
    if (!text) return refuse("CONFIRMATION_NOT_SHOWN", "the report carries no confirmation text from the employer's page — a confirmation is recorded only from what the page showed");
    const ex = extractConfirmation(text, {});
    let confirmationId = null;
    if (conf.confirmationId !== undefined && conf.confirmationId !== null && conf.confirmationId !== "") {
      if (typeof conf.confirmationId !== "string" || !ex.confirmationId || ex.confirmationId !== conf.confirmationId.trim()) {
        return refuse("CONFIRMATION_NOT_SHOWN", "the claimed confirmation id does not appear in a labeled confirmation context in the page text the report carries");
      }
      confirmationId = ex.confirmationId;
    } else if (ex.confirmationId) {
      confirmationId = ex.confirmationId; // the excerpt's own parsed id wins over an absent claim
    }
    if (!confirmationId && !ex.successText) {
      return refuse("CONFIRMATION_NOT_SHOWN", "the page text the report carries shows neither a confirmation id nor the employer's success wording");
    }
    let answersSubmitted = null;
    if (body.answersSubmitted && typeof body.answersSubmitted === "object" && !Array.isArray(body.answersSubmitted)) {
      const entries = Object.entries(body.answersSubmitted).slice(0, 50);
      answersSubmitted = {};
      for (const [k, v] of entries) answersSubmitted[String(k).slice(0, 120)] = String(v).slice(0, 500);
    }
    let observedAt = null;
    const obsMs = Date.parse(body.observedAt || "");
    if (Number.isFinite(obsMs) && obsMs <= now + 24 * 3600 * 1000 && obsMs >= now - 30 * 24 * 3600 * 1000) observedAt = new Date(obsMs).toISOString();
    return {
      ok: true,
      report: {
        employer, role, postingUrl, postingKey: str(posting.key, 200),
        confirmationId, confirmationText: text, successText: !!ex.successText,
        answersSubmitted, observedAt,
      },
    };
  }

  // The tracker record: module 126's own row builder, stage Confirmed,
  // with the confirmation as an employer-record event (126's responded()
  // reads events of type "confirmation"). Built server-side from the
  // validated report — never from raw client fields.
  function buildTrackerRecord(report, now, track) {
    if (!track || typeof track.addApplication !== "function" || typeof track.createMemoryStore !== "function") {
      throw coded("EXTENSION_SYNC_NOT_WIRED", "buildTrackerRecord: module 126 (CareerTrack) was not injected");
    }
    const store = track.createMemoryStore();
    const at = report.observedAt || new Date(now).toISOString();
    const row = track.addApplication(store, {
      company: report.employer, role: report.role, url: report.postingUrl,
      applied_at: at, stage: "Confirmed", event_source: "employer_record",
    }, { now });
    row.events.push({
      type: "confirmation", at: new Date(now).toISOString(), source: "employer_record",
      detail: report.confirmationId
        ? `employer confirmation ${report.confirmationId} — captured by the Trainee extension from the employer's confirmation page after the user's own submit`
        : "employer success wording captured by the Trainee extension from the employer's confirmation page after the user's own submit (the page showed no confirmation id)",
      evidence: report.postingUrl, stage_after: "Confirmed",
    });
    row.confirmation_id = report.confirmationId || null;
    row.origin = "extension";
    return row;
  }

  // ---------- the service ----------
  function createExtensionSyncService(deps) {
    const d = deps || {};
    for (const k of ["portalApply", "track", "verifyToken", "readFlowRows", "findReportByConfirmation", "insertReport", "mayAct"]) {
      if (!d[k]) throw coded("EXTENSION_SYNC_NOT_WIRED", `createExtensionSyncService: dependency '${k}' was not wired — the sync refuses rather than inventing a path`);
    }
    const now = () => (typeof d.now === "function" ? d.now() : Date.now());

    async function authenticate(jwt) {
      if (!jwt) return null;
      const user = await d.verifyToken(jwt);
      return (user && user.id) ? user : null;
    }

    // Launch readiness B7: a person the database has not let in (trainee_may_act) reads nothing and records nothing.
    // mayAct is required (above); an error or a thrown call answers no.
    const NOT_ADMITTED = { status: 403, body: { code: "NOT_ADMITTED", message: "This Trainee account isn't let in yet, so the extension has nothing to do for it. Nothing was saved." } };
    async function mayAct(userId) {
      try { return (await d.mayAct(userId)) === true; } catch (_) { return false; }
    }

    async function getSavedAnswers(jwt) {
      const user = await authenticate(jwt);
      if (!user) return { status: 401, body: { code: "UNAUTHENTICATED", message: "sign in to the extension with your Trainee account first" } };
      if (!(await mayAct(user.id))) return NOT_ADMITTED;
      const rows = await d.readFlowRows(user.id);
      const master = masterFromFlowRows(rows);
      if (!master) return { status: 404, body: { code: "PROFILE_NOT_FOUND", message: "no saved answers yet — Trainee builds them from your profile in chat first; there is nothing to sync until then" } };
      const map = composeSavedAnswers(master, now(), d.portalApply);
      return { status: 200, body: { savedAnswers: map, user: { id: user.id, email: user.email || null } } };
    }

    async function postSubmissionReport(jwt, body) {
      const user = await authenticate(jwt);
      if (!user) return { status: 401, body: { code: "UNAUTHENTICATED", message: "sign in to the extension with your Trainee account first" } };
      if (!(await mayAct(user.id))) return NOT_ADMITTED;
      const v = validateSubmissionReport(body, { now: now() });
      if (!v.ok) return { status: 400, body: { code: v.code, message: v.message } };
      const report = v.report;
      if (report.confirmationId) {
        const existing = await d.findReportByConfirmation(user.id, report.confirmationId);
        if (existing) return { status: 200, body: { receipt: { id: existing.id, recordedAt: existing.reported_at || existing.recordedAt || null }, duplicate: true } };
      }
      const trackerRecord = buildTrackerRecord(report, now(), d.track);
      const inserted = await d.insertReport({
        user_id: user.id,
        employer: report.employer,
        role: report.role,
        posting_url: report.postingUrl,
        posting_key: report.postingKey,
        confirmation_id: report.confirmationId,
        confirmation_text: report.confirmationText,
        success_text: report.successText,
        answers_submitted: report.answersSubmitted,
        observed_at: report.observedAt,
        source: "extension",
        record_class: "employer_confirmation",
        tracker_record: trackerRecord,
      });
      return { status: 200, body: { receipt: { id: inserted.id, recordedAt: inserted.reported_at || inserted.recordedAt || new Date(now()).toISOString() }, duplicate: false } };
    }

    return { getSavedAnswers, postSubmissionReport };
  }

  // ---------- HTTP surface (fetch-shaped; the Deno wrapper serves it) ----------
  const CORS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "authorization, apikey, content-type",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  };
  function json(status, body) {
    return new Response(JSON.stringify(body), { status, headers: { ...CORS, "Content-Type": "application/json" } });
  }
  function bearerOf(req) {
    const auth = req.headers.get("Authorization") || req.headers.get("authorization") || "";
    const m = auth.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : null;
  }
  async function handleRequest(req, service) {
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
    const path = new URL(req.url).pathname;
    try {
      if (req.method === "GET" && path.endsWith("/saved-answers")) {
        const r = await service.getSavedAnswers(bearerOf(req));
        return json(r.status, r.body);
      }
      if (req.method === "POST" && path.endsWith("/application-proofs")) {
        let body = null;
        try { body = await req.json(); } catch { return json(400, { code: "REPORT_INVALID", message: "the report body is not JSON" }); }
        const r = await service.postSubmissionReport(bearerOf(req), body);
        return json(r.status, r.body);
      }
      return json(404, { code: "NOT_FOUND", message: "extension-sync serves GET /saved-answers and POST /application-proofs" });
    } catch (e) {
      return json(500, { code: (e && e.code) || "EXTENSION_SYNC_ERROR", message: String((e && e.message) || e) });
    }
  }

  return { extractConfirmation, masterFromFlowRows, workAuthorizationToken, savedAnswersVersionOf, composeSavedAnswers, validateSubmissionReport, buildTrackerRecord, createExtensionSyncService, handleRequest };
})();

export { ExtensionSync };
