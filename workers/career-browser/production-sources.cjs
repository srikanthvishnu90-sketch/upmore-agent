"use strict";
/* production-sources.cjs — the batch executor's production inputs
   (Lane E, Feature Depth Program v2; checklist §2 items 4–5).

   createBatchExecutor refuses to invent its discovery source and
   its per-user profile (BATCH_DISCOVERY_NOT_WIRED /
   BATCH_PROFILE_NOT_WIRED), and until this module nothing supplied
   either: they were "operator wiring, not yet built". This module
   is that wiring, built from the same sources the product itself
   uses — no worker-only fork of any data:

   postingsFor(userId, familyText, count)
     The KB-backed pool, through the SHARED loader
     (supabase/functions/_shared/career_pool.js) — the identical
     mapping the Edge handler passes into createTurnCtx, read here
     through the worker transport. The in-turn pool and the worker
     pool can never disagree about what exists (checklist §8 step
     2). A failed read throws BATCH_DISCOVERY_READ_FAILED: the
     intent finishes blocked with that name rather than preparing a
     run against a silently-empty pool dressed up as "no jobs".
     (The chat turn degrades to its honest-empty reply instead —
     a turn must answer; a worker has a named-stop channel and
     uses it.)

   profileFor(userId)
     The user's pack, resolved from the user's own stored records
     via the existing store reads — the same rows the product's
     persistence layer reads and writes:
       * profileMaster: the 122 master from the freshest
         agent_flow_state snapshot (state.career.stores.profile)
         that carries one, exactly as the chat restores it;
       * profile (module 149's shape): identity fields from that
         master's basics (142's batchPortalProfile rule; the resume
         only when the record carries one with its sha256) PLUS the
         screening answers module 149's deriveAnswers derives from the
         master's CONFIRMED facts, each traced to its fact id (WO-094 —
         until then deriveAnswers had no caller here and the stored
         `answers` block, which nothing writes, was copied verbatim, so
         every prepare stopped UNCOVERED_QUESTION). Nothing is derived
         from an unconfirmed fact, and nothing defaults;
       * attestations: always {} — the approval card is the
         attestation act, per application, bound into that
         application's payload hash (WO-094); a stored standing
         attestation is never read.
     A user with NO stored profile produces the named stop
     BATCH_PROFILE_NOT_FOUND: profileFor throws it, the executor
     finishes the intent blocked with that code, and no profile is
     fabricated to keep the batch moving. (For an approve intent
     the executor's own crash discipline applies — claimed once,
     finished uncertain with the code preserved, never re-driven.)

   Both factories take the worker transport (supabase-transport.cjs)
   — service-role reads on the worker host only. */
const path = require("node:path");

const { CareerPool } = require(path.join(__dirname, "..", "..", "supabase", "functions", "_shared", "career_pool.js"));
const CareerJobs = require(path.join(__dirname, "..", "..", "packages", "domain", "121-career-jobs.js"));
const Portal = require(path.join(__dirname, "..", "..", "packages", "domain", "149-career-portal-apply.js"));

// WO-102: the second judge's submission-quality contract, the extension's own functions (extension/src/apply_core.ts
// trustedManifest, bundled unchanged into extension/lib/trainee-core.js, which extension/build.ts --check keeps fresh).
// Loaded for its functions only; never copied.
require(path.join(__dirname, "..", "..", "extension", "lib", "trainee-core.js"));
const Contract = globalThis.TraineeCore;

const coded = (code, message) => Object.assign(new Error(message || code), { code });
const clone = (v) => JSON.parse(JSON.stringify(v));

// WO-102 (every path): the master's facts and basics as the contract keeps them, by the same positive allowlist as every
// other submission path (trustedManifest): confirmed, the owner's own, a positive provenance ("owner stated ..."), the
// event that confirmed it, not quarantined (D-007: F-027..F-079 and the answer-all delegation), no id reserved for another
// source, not derived from anything excluded. A status "confirmed" label alone is not enough. The basics (name, email,
// phone, location) are kept only when the block itself carries the owner's own confirmation.
function trustedMaster(m, owner) {
  const facts = Array.isArray(m.facts) ? m.facts : [];
  const b = m.basics || {};
  const entry = (f, id, value) => ({
    value: String(value ?? ""), factId: String(id ?? ""), confirmed: f.status === "confirmed" || (f.status === undefined && f.confirmed === true),
    ...(f.needs_confirmation === true || f.status === "draft" ? { confirmed: false } : {}),
    ...(f.user_id ? { user_id: f.user_id } : {}), provenance: f.provenance, confirmation_event_id: f.confirmation_event_id,
    ...(Array.isArray(f.derived_from) ? { derived_from: f.derived_from } : {}),
  });
  const answers = {};
  facts.forEach((f, i) => { if (f && typeof f === "object") answers["fact:" + i] = entry(f, f.id, f.value ?? f.title ?? f.name ?? f.text); });
  answers.basics = entry({ ...b, status: b.status ?? "confirmed" }, b.id || "basics", b.name || b.email || "basics");
  const kept = Contract.trustedManifest({ owner, file: { user_id: owner, answers }, rows: [], resume: null }).answers;
  return { facts: facts.filter((_f, i) => !!kept["fact:" + i]), basics: kept.basics ? b : {} };
}

// The 149-shaped profile from the 122 master (WO-094, loop input).
// Identity: 142's batchPortalProfile rule (identity fields from the
// stored basics; the resume only with its sha256) — 142's function is
// not exported, so the rule is mirrored here with its source named. A
// basics block marked unconfirmed contributes no identity field.
// Answers: DERIVED by module 149's deriveAnswers from the person's
// CONFIRMED facts only (status "confirmed", never needs_confirmation),
// each traced to its fact id; an absent or unconfirmed fact derives
// nothing and the question stays an ask. The stored `answers` block is
// NOT copied (it carries no fact trace — the old verbatim copy was how
// a stored note or answer could ride without a confirmed fact), and a
// cover note comes only from a note drafted onto this application's
// payload (155 coverNoteFor), never from the master.
function portalProfileFromMaster(master, now, owner) {
  const m = master || {};
  // WO-102: only what the contract keeps reaches the profile (trustedMaster); no standing defaults (no fact behind them).
  const t = trustedMaster(m, owner);
  const b = t.basics;
  const basicsConfirmed = Object.keys(b).length > 0;
  const id = (v) => (basicsConfirmed && v ? v : null);
  const p = {
    name: id(b.name || b.full_name || m.name),
    email: id(b.email || m.email),
    phone: id(b.phone),
    location: id(b.location),
    answers: {},
  };
  // MUSE-F-007: the saved answers (application_answer / application_text) through the same contract, each only for its
  // exact question.
  const derived = Portal.deriveAnswers({ basics: b, facts: t.facts, defaults: {} }, now != null ? now : Date.now(), { contract: Contract, owner });
  p.answers = clone(derived.answers);
  if (derived.savedAnswers.length) p.savedAnswers = clone(derived.savedAnswers);
  for (const [k, v] of Object.entries(derived.profileFields)) if (p[k] == null) p[k] = clone(v);
  const r = m.resume || b.resume || null;
  if (r && r.sha256) p.resume = { filename: r.filename || "resume.pdf", sha256: r.sha256 };
  return p;
}

function createProductionSources(deps) {
  const d = deps || {};
  const transport = d.transport;
  if (!transport || typeof transport.readRows !== "function") {
    throw coded("BATCH_SOURCES_NOT_WIRED", "createProductionSources: a worker transport with readRows is required — the sources never invent a data path");
  }
  const jobs = d.jobs || CareerJobs;
  const nowOf = typeof d.now === "function" ? d.now : () => Date.now();
  const loader = CareerPool.createKbPoolLoader({
    probeUrl: typeof d.probeUrl === "function" ? d.probeUrl : CareerPool.createFetchProbe({ fetchImpl: d.fetchImpl }),
    readRows: (spec) => transport.readRows(spec),
    jobs,
    limit: d.poolLimit,
  });

  async function postingsFor(/* userId, familyText, count */) {
    // The pool is a shared snapshot source (not per-user state);
    // family/count selection is module 155's own screening, exactly
    // as the in-turn pool is consumed whole by 142.
    const pool = await loader.loadPool();
    if (pool.error) throw coded("BATCH_DISCOVERY_READ_FAILED", "the KB pool read failed on the worker — the batch stops named rather than preparing against an invented or silently-empty pool");
    return pool.postings;
  }

  async function readStoredMaster(userId) {
    const rows = await transport.readRows({
      table: "agent_flow_state",
      select: "state,updated_at",
      filters: { user_id: { eq: userId } },
      order: { column: "updated_at", ascending: false },
      limit: 25,
    });
    for (const row of rows || []) {
      const stores = row && row.state && row.state.career ? row.state.career.stores : null;
      const profile = stores ? stores.profile : null;
      if (profile && typeof profile === "object" && (profile.basics || profile.facts)) return profile;
    }
    return null;
  }

  async function profileFor(userId) {
    const master = await readStoredMaster(userId);
    if (!master) throw coded("BATCH_PROFILE_NOT_FOUND", "no stored career profile for this user — the chat has not produced one; the batch stops named and nothing is fabricated");
    // No standing attestation (WO-094): a stored `attestations` block is
    // never read — the approval card is the attestation act, per
    // application, bound into that application's payload hash.
    return {
      profile: portalProfileFromMaster(master, nowOf(), userId),
      profileMaster: master,
      attestations: {},
    };
  }

  return { postingsFor, profileFor };
}

module.exports = { createProductionSources, portalProfileFromMaster };
