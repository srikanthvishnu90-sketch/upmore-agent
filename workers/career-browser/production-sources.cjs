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

   profileFor(userId, ctx)
     The user's pack, resolved from the user's own stored records
     via the existing store reads — the same rows the product's
     persistence layer reads and writes:
       * profileMaster: the 122 master of record — the freshest
         agent_flow_state snapshot (state.career.stores.profile)
         carrying a REAL profile. A stated-facts BRIDGE profile
         (profile._fromStatedFacts) is a per-turn conversational
         scaffold the host re-derives every turn; it is never the
         profile of record, and on a busy account its snapshots
         crowd the freshest rows — the scan therefore prefers a
         non-bridge profile and falls back to the bridge only when
         no real profile exists anywhere in the window (the
         pre-writer behavior, kept as the floor).
       * profile (module 149's shape) + attestations: DERIVED from
         that master by module 149's own composition
         (portalInputsFromBank — the LOOP-INPUT writer): identity
         verbatim from basics, stored confirmed answers verbatim,
         answers derived from the confirmed fact bank
         (deriveAnswers) and the constraints/defaults seam, the
         resume only when the record carries one with its sha256.
         Attestations pass through only when the record itself
         carries the user's explicit act; certify_true is derived
         ONLY from ctx's approval act (an approve intent's run id +
         card hash), never at prepare and never from facts.
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
const CareerPortal = require(path.join(__dirname, "..", "..", "packages", "domain", "149-career-portal-apply.js"));

const coded = (code, message) => Object.assign(new Error(message || code), { code });
const clone = (v) => JSON.parse(JSON.stringify(v));

// Kept for shape compatibility with earlier callers/tests: the
// identity-only projection of the master. The executor's pack no
// longer comes from here — profileFor derives the full portal
// inputs through module 149's portalInputsFromBank (the writer).
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
      limit: 150,
    });
    // The profile of record wins over the stated-facts bridge (see
    // the header): scan the window in freshness order for a real
    // profile carrying data, then any real profile, and only then
    // fall back to the freshest profile of any kind (the pre-writer
    // rule) so a bridge-only account reads exactly as before.
    let firstAny = null;
    let firstReal = null;
    for (const row of rows || []) {
      const stores = row && row.state && row.state.career ? row.state.career.stores : null;
      const profile = stores ? stores.profile : null;
      if (!profile || typeof profile !== "object") continue;
      if (!firstAny) firstAny = profile;
      if (profile._fromStatedFacts) continue;
      if (!firstReal) firstReal = profile;
      if (profile.basics || profile.facts) return profile;
    }
    return firstReal || ((firstAny && (firstAny.basics || firstAny.facts)) ? firstAny : null);
  }

  async function profileFor(userId, ctx) {
    const master = await readStoredMaster(userId);
    if (!master) throw coded("BATCH_PROFILE_NOT_FOUND", "no stored career profile for this user — the chat has not produced one; the batch stops named and nothing is fabricated");
    // The writer (LOOP-INPUT): module 149's composition derives the
    // executor's profile + attestations from the stored bank. The
    // approval act rides ONLY an approve drain's context — the
    // executor passes the intent's run id + the card hash it
    // verified; prepare contexts carry no act and derive no
    // attestation, ever.
    const c = ctx || {};
    const approvalAct = c.action === "approve" && c.runId
      ? { runId: c.runId, cardSha256: c.cardSha256 || null }
      : null;
    const inputs = CareerPortal.portalInputsFromBank(master, { now: Date.now(), approvalAct });
    if (!inputs.profile) throw coded("BATCH_PROFILE_NOT_FOUND", "the stored career profile carries no derivable portal inputs — the batch stops named and nothing is fabricated");
    return {
      profile: inputs.profile,
      profileMaster: master,
      attestations: inputs.attestations,
      traces: inputs.traces,
    };
  }

  return { postingsFor, profileFor };
}

module.exports = { createProductionSources, portalProfileFromMaster };
