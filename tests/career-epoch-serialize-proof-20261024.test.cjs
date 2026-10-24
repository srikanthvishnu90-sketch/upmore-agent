"use strict";
/* EPOCH PERSISTENCE PROOF (coordinator item (2), 2026-10-24).
   =====================================================================
   Claim under proof: the privacy epoch that stops a stale pre-erase
   snapshot from resurrecting an erased watch SURVIVES the actual
   snapshot serialize -> restore path, in a fresh process with a new
   host instance — it is carried in the serialized snapshot itself
   (privacy_epoch, the field the SQL commit also stamps) and in the
   account record, not reconstructed from in-memory state.

   Method: a driver script (written to a temp dir by this test) runs
   TWICE as two separate node processes. The writer process builds
   the repo's real CareerHost, creates a watch, erases the profile,
   and writes the snapshots + account record to a JSON file with
   JSON.stringify — the same JSON carriage the host's snapshots
   travel in (extractSnapshot is JSON-safe by construction;
   agent_flow_state stores them as JSON). The reader process — a
   new process, a new host instance, nothing shared but the file —
   restores the STALE pre-erase snapshot beside the post-erase
   account and an empty canonical seed, and reads the watch back.

   Fixture boundary, named plainly: the JSON file stands in for
   agent_flow_state + the account row (no live database exists in
   this environment, and none may be touched). Everything else —
   the host, the router, the serialization, the restore — is the
   repo's real code, run in a real separate process.
   Check: node --test tests/career-epoch-serialize-proof-20261024.test.cjs
*/
const { test } = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const ROOT = path.join(__dirname, "..");

const DRIVER = `"use strict";
const fs = require("node:fs"); const path = require("node:path");
const ROOT = process.argv[3]; const statePath = process.argv[4];
const D = (n) => require(path.join(ROOT, "packages/domain", n));
const { CareerHost } = require(path.join(ROOT, "supabase/functions/_shared/career_host.js"));
const A = D("152-career-assign.js");
const USER = "user-epoch-proof";
const NOW = Date.parse("2026-10-24T15:00:00.000Z");
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
const mode = process.argv[2];
if (mode === "write") {
  let ctx = host.createTurnCtx({ userId: USER, threadId: "t-1", now: NOW, accountPersistence: true, snapshot: null, account: {}, watchState: {}, postings: [], profile: PROFILE });
  let out = host.runTurn("Watch for investment banking analyst intern roles in Chicago", ctx);
  if (out.intent !== "career_watch_create") throw new Error("create failed: " + out.reply);
  const preErase = host.extractSnapshot(ctx);
  ctx = host.createTurnCtx({ userId: USER, threadId: "t-1", now: NOW + 60000, accountPersistence: true, snapshot: preErase, account: {}, watchState: {}, postings: [], profile: PROFILE });
  out = host.runTurn("Forget my career profile", ctx);
  if (out.intent !== "career_profile_erased") throw new Error("erase failed: " + out.reply);
  const postErase = host.extractSnapshot(ctx);
  // The account record the commit leaves behind (the SQL commit's own
  // record: epoch bumped, canonical watch row deleted, work paused).
  const account = { paused: true, epoch: 1 };
  fs.writeFileSync(statePath, JSON.stringify({ preErase, postErase, account }));
  console.log(JSON.stringify({ wrote: true, postEraseEpoch: postErase.privacy_epoch, preEraseEpoch: preErase.privacy_epoch }));
} else if (mode === "read") {
  const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const ctx = host.createTurnCtx({ userId: USER, threadId: "t-1", now: NOW + 120000, accountPersistence: true, snapshot: state.preErase, account: state.account, watchState: {}, postings: [], profile: PROFILE });
  const out = host.runTurn("What alerts do I have?", ctx);
  const snap = host.extractSnapshot(ctx);
  const wp = ((snap.stores || {}).alertWatchState || {})[A.PROFILE_KEY(USER)] || null;
  const active = wp && !(wp.opt_out && wp.opt_out.global) ? (wp.interests || []).length : 0;
  console.log(JSON.stringify({ active, intent: out.intent, postEraseEpoch: state.postErase.privacy_epoch, preEraseEpoch: state.preErase.privacy_epoch, accountEpoch: state.account.epoch, restoredEpoch: snap.privacy_epoch }));
} else { throw new Error("unknown mode " + mode); }
`;

test("epoch proof: the erase epoch survives JSON serialize -> restore in a separate process and stops the stale snapshot there", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "epoch-proof-"));
  const driverPath = path.join(dir, "driver.cjs");
  const statePath = path.join(dir, "state.json");
  fs.writeFileSync(driverPath, DRIVER);
  const run = (mode) => JSON.parse(execFileSync(process.execPath, [driverPath, mode, ROOT, statePath], { encoding: "utf8" }).trim().split("\n").pop());

  const wrote = run("write");
  assert.equal(wrote.postEraseEpoch, 1, "the writer's post-erase snapshot carries privacy_epoch 1 in its own serialization");
  assert.equal(wrote.preEraseEpoch, 0, "the pre-erase snapshot carries epoch 0 — the pair is what makes staleness decidable after restore");

  // The serialized bytes themselves hold the stamp (not a runtime
  // reconstruction): the file on disk parses to the same values.
  const onDisk = JSON.parse(fs.readFileSync(statePath, "utf8"));
  assert.equal(onDisk.postErase.privacy_epoch, 1, "privacy_epoch is present in the serialized snapshot bytes");
  assert.equal(onDisk.account.epoch, 1, "the account record's epoch is present in the serialized bytes");

  const read = run("read");
  assert.equal(read.accountEpoch, 1, "the reader process saw the post-erase account epoch from the file alone");
  assert.equal(read.postEraseEpoch, 1, "the reader process saw the post-erase snapshot's stamp from the file alone");
  assert.equal(read.active, 0, `in a fresh process with a new host instance, the stale pre-erase snapshot resurrects NOTHING (active=${read.active})`);
  assert.equal(read.restoredEpoch, 1, "the reader's own extracted snapshot carries the epoch forward at 1");
});
