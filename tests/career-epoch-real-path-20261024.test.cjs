"use strict";
/* STORED ACCOUNT EPOCH — REAL-PATH PROOF (coordinator queue item (2),
   2026-10-24).
   =====================================================================
   THE STORE, NAMED: the privacy epoch persists in the table
   career_watch_kv — row key 'career:account', JSONB field
   value -> 'epoch' (a bigint inside the JSONB; there is no separate
   column, and none is needed — the field EXISTS in the current
   schema). Verified in the migration chain at this head:
   - 20261015020000_career_watch_kv.sql: career_host_load returns the
     whole account object ('account', a) — epoch included — beside the
     snapshot and the canonical watchState.
   - latest career_host_commit (20261021050000_career_brief_digest.sql,
     lines 86/123/131-136/147): reads epoch from the same row; on an
     erase patch, epoch := epoch + 1, the account row is rewritten
     {epoch, paused: true, version}, the committed snapshot is stamped
     privacy_epoch := epoch, the watch row is deleted, and the turn
     receipt records the epoch (a stale receipt -> privacy_epoch_changed).

   WHAT THIS TEST EXECUTES (the host's REAL code, no re-implementation):
   createTurnCtx reading account.epoch; the erase turn producing the
   real _hostPatch ({erase: true, ...}) that handler-career forwards
   to career_persistence.commit -> career_host_commit; extractSnapshot
   stamping privacy_epoch = account epoch, +1 on the erase turn — the
   same value the SQL stamps — and carrying it forward unchanged on
   later turns; the resurrection guard consuming account.epoch vs
   snapshot.privacy_epoch on restore.

   WHAT IS FIXTURE-ONLY, stated plainly: the account OBJECT between
   turns is carried by this test, standing in for the career:account
   row that career_host_commit writes and career_host_load reads.
   The SQL functions themselves are NOT executed here — no live
   database exists in this environment and none may be touched;
   their behavior is verified from the migration text at this head
   (cited above), not from a re-implementation.
   Check: node --test tests/career-epoch-real-path-20261024.test.cjs
*/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const A = D("152-career-assign.js");

const NOW = Date.parse("2026-10-24T15:00:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const PROFILE = {
  basics: { name: "Alex Testcase", location: "Chicago, IL" },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};
const host = CareerHost.createCareerHost({
  CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
  CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
  CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
});
const turn = (userId, text, opts) => {
  const ctx = host.createTurnCtx(Object.assign({ userId, threadId: "t-1", accountPersistence: true, postings: [], profile: PROFILE }, opts));
  const out = host.runTurn(text, ctx);
  return { ctx, out, snap: host.extractSnapshot(ctx) };
};

test("epoch round-trip through the REAL patch + extractSnapshot path: carried at 0, bumped to 1 by the erase turn's own patch, read back on restore, never reset", () => {
  const U = "user-epoch-real";
  // The account object exactly as career_host_load returns it (the
  // career:account row's JSONB): version + epoch.
  const account0 = { version: 3, epoch: 0 };

  // Turn 1 — create a watch at epoch 0: the snapshot carries 0.
  const t1 = turn(U, "Watch for investment banking analyst intern roles in Chicago", { now: NOW, snapshot: null, account: clone(account0), watchState: {} });
  assert.equal(t1.out.intent, "career_watch_create", t1.out.reply);
  assert.equal(t1.snap.privacy_epoch, 0, "extractSnapshot carries the account epoch it was given — 0, not an invented value");
  const preEraseSnap = clone(t1.snap);

  // Turn 2 — the erase: the REAL patch the handler forwards to
  // career_host_commit must be the erase patch, and extractSnapshot
  // must stamp the NEW epoch (account epoch + 1) — the same value
  // the SQL commit writes into the row and the snapshot.
  const t2 = turn(U, "Forget my career profile", { now: NOW + 60000, snapshot: preEraseSnap, account: clone(account0), watchState: {} });
  assert.equal(t2.out.intent, "career_profile_erased", t2.out.reply);
  assert.ok(t2.ctx._hostPatch && t2.ctx._hostPatch.erase === true, `the erase turn must produce the real erase patch for career_host_commit, got ${JSON.stringify(t2.ctx._hostPatch)}`);
  assert.equal(t2.snap.privacy_epoch, 1, "the erase turn's snapshot is stamped with the NEW epoch (1) — matching the SQL commit's stamp");

  // The commit's account row, as the SQL writes it (migration text:
  // jsonb_build_object('epoch', epoch, 'paused', true, 'version', ..)).
  // This object is the fixture-carried half of the chain (see header).
  const account1 = { paused: true, version: 4, epoch: 1 };

  // Turn 3 — restore: the STALE pre-erase snapshot beside the
  // post-erase account. The guard consumes account.epoch (real code)
  // against snapshot.privacy_epoch (real code) and the watch stays dead.
  const t3 = turn(U, "What alerts do I have?", { now: NOW + 120000, snapshot: preEraseSnap, account: clone(account1), watchState: {} });
  const wp = ((t3.snap.stores || {}).alertWatchState || {})[A.PROFILE_KEY(U)] || null;
  const active = wp && !(wp.opt_out && wp.opt_out.global) ? (wp.interests || []).length : 0;
  assert.equal(active, 0, "restore reads the stored epoch back: the stale snapshot resurrects nothing");
  assert.equal(t3.snap.privacy_epoch, 1, "the restored turn's snapshot carries the epoch forward at 1 — persisted, never reset");

  // Turn 4 — an ordinary later turn at epoch 1 does NOT bump it:
  // only an erase moves the epoch.
  const t4 = turn(U, "What alerts do I have?", { now: NOW + 180000, snapshot: clone(t3.snap), account: clone(account1), watchState: {} });
  assert.equal(t4.snap.privacy_epoch, 1, "a non-erase turn leaves the stored epoch at 1");
});
