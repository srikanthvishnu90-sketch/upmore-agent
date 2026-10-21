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
       * profile (module 149's shape): derived from that master by
         the same rule the in-turn path uses (142's
         batchPortalProfile: identity fields only, the resume only
         when the record carries one with its sha256) PLUS the
         answers the stored record itself carries, verbatim — a
         fully-onboarded user's confirmed screening answers are
         profile data and ride along; nothing is derived from
         anything the user did not store;
       * attestations: the stored record's own attestations,
         verbatim, or {} — no stored source invents one, and a
         required attestation then stops that application named
         inside 149, exactly as in-turn today.
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

const coded = (code, message) => Object.assign(new Error(message || code), { code });
const clone = (v) => JSON.parse(JSON.stringify(v));

// The 149-shaped profile from the 122 master — 142's
// batchPortalProfile derivation (identity only; the resume only
// with its sha256), plus the stored record's own answers verbatim.
// 142's function is not exported, so the rule is mirrored here with
// its source named; the answers addition is the one deliberate
// extension, and it carries only what the record already holds.
function portalProfileFromMaster(master) {
  const b = (master && master.basics) || {};
  const p = {
    name: b.name || b.full_name || (master && master.name) || null,
    email: b.email || (master && master.email) || null,
    phone: b.phone || null,
    location: b.location || null,
    answers: master && master.answers && typeof master.answers === "object" ? clone(master.answers) : {},
  };
  const r = (master && master.resume) || b.resume || null;
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
  const loader = CareerPool.createKbPoolLoader({
    readRows: (spec) => transport.readRows(spec),
    jobs,
    limit: d.poolLimit,
    // LINK LIVENESS (MUSE-F-003): same discipline as the Edge
    // handler — the shared loader probes the served window and
    // excludes only CONFIRMED-dead postings (404/410); a host may
    // inject its own probeUrl (tests stub it — no live network).
    probeUrl: typeof d.probeUrl === "function" ? d.probeUrl : CareerPool.createFetchProbe(),
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
    return {
      profile: portalProfileFromMaster(master),
      profileMaster: master,
      attestations: master.attestations && typeof master.attestations === "object" ? clone(master.attestations) : {},
    };
  }

  return { postingsFor, profileFor };
}

module.exports = { createProductionSources, portalProfileFromMaster };
