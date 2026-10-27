"use strict";
/* SPLIT-1146 (c) STITCH — the patch supplier for
   tests/db/career_apply_correction_fence_stitched.test.sql.

   The two halves of the correction-fence proof each stopped one seam
   short of the other: the router half (tests/career-submit-split
   -1146.test.cjs, "(c) RECORDED") pins that the correction turn's
   commit patch carries the corrected sponsorship fact, and the DB
   half (tests/db/career_apply_correction_fence.test.sql) pins that
   the authority fence blocks everything stamped before a correction
   — but the DB half HAND-BUILDS its correction patch in the host's
   shape. This driver closes the seam: it runs the (c) correction
   turn through the same composed harness 1146 uses, captures the
   ACTUAL commit object the turn produces (ctx._hostPatch — the very
   object handler-career.ts:815 passes as p_patch to
   career_host_commit), asserts its structure, and writes it as JSON
   for run.sh to feed to the stitched SQL test. Nothing here is
   re-typed: if the router's patch shape drifts, this driver and the
   SQL assertions downstream fail, which is the point.

   Handler order matters and is mirrored exactly: the handler calls
   host.extractSnapshot(ctx) BEFORE reading patch: ctx._hostPatch
   (handler-career.ts:815, object-literal evaluation order), and the
   stated-facts write-back into _hostPatch happens inside
   extractSnapshot (career_host.js). The harness below is 1146's
   makeWorld/say, unchanged: runTurn, then extractSnapshot in say().

   Fail-first, two ways:
   - Specificity control: the SAME account seed with a neutral
     greeting must NOT produce a patch carrying the corrected
     sponsorship fact — the capture is the correction turn's doing,
     not the harness's.
   - Structure: the patch must carry, in its keyed list, the
     sponsorship fact with the corrected value and no trace of the
     old one — the exact record the DB authority trigger compares
     (career_account_authority_mark reads value->'stated_facts').

   Usage: node tests/db/career-stitched-fence-patch.cjs [out.json]
   With an argument, the patch JSON is written to that path; without,
   it is printed last, after the ok lines. Exit 1 on any failure.
   Synthetic fixtures only; nothing submits; no live contact. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..", "..");
const D = (n) => require(path.join(root, "packages/domain", n));
const { CareerHost } = require(path.join(root, "supabase/functions/_shared/career_host.js"));
const Portal = D("149-career-portal-apply.js");

const NOW = Date.parse("2026-10-25T16:46:00.000Z");
const clone = (v) => JSON.parse(JSON.stringify(v));
const ATTEST = { certify_true: { value: true, explicit: true } };

// 1146's fixtures, verbatim: the (c) scenario's master override and
// the account seed its correction turn starts from.
const MASTER_BASE = {
  basics: {
    name: "Alex Testcase", location: "Chicago, IL",
    email: "alex.testcase@example.test", phone: "+1 000 555 0100",
    resumeFile: "alex-testcase-resume.pdf", resumeSha256: "a".repeat(64),
  },
  facts: [
    { kind: "education", text: "B.S. Computer Science + Finance at TEST University, graduating May 2028", org: "TEST University", title: "B.S. Computer Science", end: "2028-05" },
    { kind: "skill", name: "Excel", text: "Skill: Excel", fact_id: "F-012", evidence: ["resume lists Excel"], unproven: false },
  ],
  constraints: { workAuthorization: "US citizen", needsSponsorship: false },
  preferences: { locations: ["Chicago"], starredCompanies: [] },
};
const WA_MASTER = { constraints: { workAuthorization: "F-1 OPT (TEST) — will need sponsorship", needsSponsorship: true } };
const WA_TEXT = "Update my work authorization — I no longer need sponsorship.";
const OLD_VALUE = "needs sponsorship";
const NEW_VALUE = "does not need sponsorship";
const SEED_ACCOUNT = { stated_facts: { facts: [{ kind: "sponsorship", value: OLD_VALUE, said: "I will need sponsorship", at: "2026-10-20T00:00:00.000Z" }], offer: null } };

// 1146's harness, unchanged.
function makeWorld(opts) {
  const o = opts || {};
  const host = CareerHost.createCareerHost({
    CareerAccess: D("120-career-access.js"), CareerOnboarding: D("130-career-onboarding.js"),
    CareerRouter: D("142-career-router.js"), CareerDoorstep: D("141-career-doorstep.js"),
    CareerReply: D("140-career-reply.js"), CareerContainment: D("143-career-containment.js"),
  });
  const master = clone(MASTER_BASE);
  if (o.master) Object.assign(master, clone(o.master));
  const store = { threads: new Map() };
  const log = { records: [] };
  let n = 0;
  const say = (userId, text, extra) => {
    const ex = extra || {};
    n += 1;
    const threadId = `t-${userId}`;
    const snap = ex.snapshot !== undefined ? ex.snapshot : (store.threads.get(threadId) || null);
    const input = { userId, threadId, now: NOW + (ex.nowOffset != null ? ex.nowOffset : n * 60000), accountPersistence: true, snapshot: snap, account: o.account || {}, watchState: {}, postings: ex.postings || [] };
    if (!ex.omitProfile) input.profile = master;
    const ctx = host.createTurnCtx(input);
    ctx.batchDeps = { log, boardFor: (p) => Object.assign({}, Portal.createSandboxBoard({}), { atsFamily: p.atsFamily }), attestations: ATTEST };
    const out = host.runTurn(text, ctx);
    store.threads.set(threadId, host.extractSnapshot(ctx));
    return { out, ctx };
  };
  return { say };
}

let passed = 0;
const ok = (cond, label) => { assert.ok(cond, label); passed += 1; console.log(`ok ${passed} - ${label}`); };
const sponsorshipOf = (patch) => {
  const rec = patch && patch.stated_facts;
  if (!rec) return [];
  return [...(rec.facts || []), ...(rec.keyed || [])].filter((f) => f && f.kind === "sponsorship");
};

function main() {
  // Specificity control: same seed, a turn that corrects nothing.
  const cw = makeWorld({ master: WA_MASTER, account: clone(SEED_ACCOUNT) });
  const greet = cw.say("stitch-control", "Hi", { nowOffset: 0 });
  const controlPatch = greet.ctx._hostPatch || null;
  ok(!sponsorshipOf(controlPatch).some((f) => f.value === NEW_VALUE),
    "control: a neutral turn on the same seed emits no patch carrying the corrected sponsorship fact");

  // The correction turn, exactly as 1146's "(c) RECORDED" runs it.
  const w = makeWorld({ master: WA_MASTER, account: clone(SEED_ACCOUNT) });
  const { out, ctx } = w.say("stitch-correction", WA_TEXT, { nowOffset: 0 });
  ok(out.intent === "intent_sensitive_correction", `the turn is the sensitive correction (got ${out.intent})`);
  const patch = ctx._hostPatch;
  ok(patch && typeof patch === "object" && !Array.isArray(patch), "the turn produced a commit patch object (ctx._hostPatch)");
  const rec = patch.stated_facts;
  ok(rec && Array.isArray(rec.facts) && Array.isArray(rec.keyed),
    "the patch's stated_facts record carries the host's facts/keyed split");
  const sp = sponsorshipOf(patch);
  ok(sp.length === 1 && sp[0].value === NEW_VALUE,
    `the patch carries the corrected sponsorship fact the fence reads (got ${JSON.stringify(sp.map((f) => f.value))})`);
  ok(!sp.some((f) => f.value === OLD_VALUE), "no sponsorship entry in the patch still carries the old value");
  ok(JSON.stringify(rec) !== JSON.stringify(SEED_ACCOUNT.stated_facts),
    "the patch's record differs from the account's seeded record — the change the authority trigger compares");
  const roundTripped = JSON.parse(JSON.stringify(patch));
  assert.deepEqual(roundTripped, patch, "the patch survives JSON serialization unchanged");
  passed += 1; console.log(`ok ${passed} - the patch survives JSON serialization unchanged (it crosses to SQL as JSON)`);

  const json = JSON.stringify(patch);
  const outPath = process.argv[2];
  if (outPath) {
    fs.writeFileSync(outPath, json + "\n");
    console.log(`patch written to ${outPath} (${json.length} bytes, ${passed} checks passed)`);
  } else {
    console.log(json);
  }
}

try { main(); } catch (e) { console.error(`FAIL stitch patch capture: ${e.message}`); process.exit(1); }
