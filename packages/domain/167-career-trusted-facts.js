/* Career trusted-fact reader (D-007 fix, owner ruling 2026-10-21).
   THE single read path every drafter uses for profile facts.

   ROOT CAUSE this module exists to kill: the quarantine state on a 122
   fact (needs_confirmation:true / status:"draft" — resume-ingested
   facts arrive quarantined and are cleared only by confirmFact()) was
   enforced by each drafter hand-rolling its own filter, and the filters
   disagreed: 122's confirmedFacts checks only needs_confirmation,
   149's local predicate checks status AND the flag, 123's audit checks
   per-fact at one site, and 132 checked NOTHING — a quarantined fact's
   text flipped its drafted sponsorship answer and its employer guard
   blocked applications on unconfirmed employers. Any new drafter
   started from raw profile.facts and inherited the bypass.

   CONTRACT: given a profile (or a fact-bank object of the same shape),
   this reader returns ONLY facts cleared for drafting. Quarantined
   facts are unreachable through its API BY CONSTRUCTION: there is no
   option, flag, or second export that includes them. Callers that need
   to SEE quarantined facts (the profile's own UI, the audit that names
   a violation, the coverage census) read the store directly — they are
   not drafters, and this module is not their path.

   A fact is QUARANTINED when any hold signal is present:
     - needs_confirmation === true (122's ingest quarantine)
     - status is "draft" | "quarantined" | "held" | "suppressed"
     - quarantined === true (an explicit hold flag, if a writer sets one)
   Everything else is cleared — the same default 122's normalizeFact
   stamps ("confirmed") when no hold signal exists.

   Deterministic, pure, no I/O, no model calls. UMD like its siblings. */
const CareerTrustedFacts = (() => {
  "use strict";

  const QUARANTINE_STATUSES = new Set(["draft", "quarantined", "held", "suppressed"]);

  function isQuarantined(fact) {
    if (!fact || typeof fact !== "object") return true;
    if (fact.needs_confirmation === true) return true;
    if (fact.quarantined === true) return true;
    if (typeof fact.status === "string" && QUARANTINE_STATUSES.has(fact.status)) return true;
    return false;
  }
  function isTrusted(fact) { return !isQuarantined(fact); }

  // The drafting pool. `filter` is an exact-match field filter (the shape
  // 122's listFacts takes) applied AFTER the quarantine cut.
  function trustedFacts(profile, filter) {
    const all = profile && Array.isArray(profile.facts) ? profile.facts : [];
    const cleared = all.filter(isTrusted);
    if (!filter) return cleared;
    return cleared.filter((f) => Object.entries(filter).every(([k, v]) => f[k] === v));
  }

  // A drop-in view of the profile whose facts array holds only cleared
  // facts — for drafters that pass the profile onward (e.g. to 122's
  // skillEvidence) and must not hand the raw store down the chain.
  function trustedProfile(profile) {
    if (!profile || typeof profile !== "object") return profile;
    return Object.assign({}, profile, { facts: trustedFacts(profile) });
  }

  // By-id read for drafters: a quarantined fact reads as absent.
  function trustedFactById(profile, id) {
    return trustedFacts(profile).find((f) => f.id === id) || null;
  }

  // Outreach's fact universe is a contact record's personalization_facts,
  // whose trust signals are sourcing, not confirmation: a fact is usable
  // only when it carries a source_url, and a referral claim only when it
  // is verified. Same accounting 124's draftFor kept inline (unsourced
  // facts silently unreachable; unverified referrals named in `dropped`)
  // — now the one shared implementation, so tiering and drafting can
  // never again read different pools.
  function trustedContactFacts(candidate) {
    const raw = candidate && Array.isArray(candidate.personalization_facts) ? candidate.personalization_facts : [];
    const usable = [], dropped = [];
    for (const f of raw) {
      if (!f || !f.fact || !f.source_url) continue;
      if (f.kind === "referral" && f.verified !== true) { dropped.push({ fact: f.fact, reason: "unverified_referral_claim" }); continue; }
      usable.push(f);
    }
    return { usable, dropped };
  }

  return { isQuarantined, isTrusted, trustedFacts, trustedProfile, trustedFactById, trustedContactFacts, QUARANTINE_STATUSES: [...QUARANTINE_STATUSES] };
})();

if (typeof module !== "undefined" && module.exports) module.exports = CareerTrustedFacts;
