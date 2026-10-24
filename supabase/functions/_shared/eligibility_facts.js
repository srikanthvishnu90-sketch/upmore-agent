// GENERATED from packages/domain/156-career-eligibility.js (the source of
// truth) — do not edit here. The body below is byte-identical to the
// contract body in 156 and to the generated section of extension_sync.js.
// Proposal: docs/architect/ELIGIBILITY-SEPARATION-PROPOSAL.md (Branch A).
// Work authorization and sponsorship as two typed facts: neither derived
// from the other, only a confirmed fact answers, legacy stored values are
// drafts in the person's own words, never answers.
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

export { CareerEligibility };
export const EligibilityFacts = CareerEligibility;
