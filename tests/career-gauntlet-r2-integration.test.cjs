// Coordinator integration tests (repair round 2): Lane A (142) records user
// intents in router shapes — doorstepState.invalidation {active, reason},
// .role_closed {closed}, .prior_application {disclosed} — while Lane B's
// execution guards (141) were written against recorder shapes. The bridge
// (routerInvalidation in 141) must make A's shapes arm B's guards, so a
// submit is refused at the SEAM even when state arrives only in A's shapes.
// Idiom mirrors tests/career-gauntlet-r2b.test.cjs.
"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const crypto = require("node:crypto");
const root = path.resolve(__dirname, "..");
const GAUNTLET = path.join(root, "packages/career-data/fixtures/gauntlet");

const Access = require(path.join(root, "packages/domain/120-career-access.js"));
const Onboarding = require(path.join(root, "packages/domain/130-career-onboarding.js"));
const Profile = require(path.join(root, "packages/domain/122-career-profile.js"));
const Router = require(path.join(root, "packages/domain/142-career-router.js"));
const Doorstep = require(path.join(root, "packages/domain/141-career-doorstep.js"));

function chatPath(text, ctx) {
  let r = Access.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "120" }, r);
  r = Onboarding.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "130" }, r);
  r = Router.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "142" }, r);
  r = Doorstep.handleChat(text, ctx || {});
  if (r) return Object.assign({ handler: "141" }, r);
  return null;
}
const sha256 = (s) => crypto.createHash("sha256").update(s).digest("hex");
const loadProfile = (dir) => Profile.profileFromData(JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles", dir, "profile.json"), "utf8")));
const tmpSink = (name) => fs.mkdtempSync(path.join(os.tmpdir(), "r2int-" + name + "-"));
const sinkCount = (dir) => fs.existsSync(dir) ? fs.readdirSync(dir).filter((f) => f.endsWith(".json")).length : 0;

function doorstepCtx(sinkDir) {
  const profile = loadProfile("p1-early-career-swe");
  const resumeContent = fs.readFileSync(path.join(GAUNTLET, "profiles/p1-early-career-swe/resume.txt"), "utf8");
  const ctx = {
    profile, formSpecName: "greenhouse-like.json", sinkDir,
    resumeArtifact: { name: "resume.txt", content: resumeContent, sha256: sha256(resumeContent) },
    doorstepState: {},
  };
  const r = chatPath("fill this out so i can review it", ctx);
  assert.ok(r && r.doorstep && r.doorstep.state === "REVIEW", "fill reaches REVIEW");
  return ctx;
}
function guardCode(ctx) {
  const g = Doorstep.checkSubmitGuards(ctx, ctx.doorstepState);
  return g ? g.code : null;
}
// Exactly the shapes Lane A's handlers write (from its 142 diff):
const A_CLOSED = (st) => { st.invalidation = { active: true, reason: "role_closed", at: "2026-10-13" }; st.role_closed = { closed: true, at: "2026-10-13", instruction: "that role closed" }; };
const A_PRIOR = (st) => { st.invalidation = { active: true, reason: "prior_application", at: "2026-10-13" }; st.prior_application = { disclosed: true, channel: "employer site", at: "2026-10-13", instruction: "i already applied manually" }; };
const A_CANCEL = (st) => { st.invalidation = { active: true, reason: "cancelled_by_user", at: "2026-10-13" }; st.submission = Object.assign(st.submission || {}, { status: "cancelled" }); };
const A_CORRECTED = (st) => { st.invalidation = { active: true, reason: "facts_corrected", at: "2026-10-13" }; };

test("bridge: router-shape role closure arms the job_closed guard; submit writes nothing", () => {
  const sinkDir = tmpSink("closed");
  const ctx = doorstepCtx(sinkDir);
  A_CLOSED(ctx.doorstepState);
  assert.equal(guardCode(ctx), "job_closed");
  chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "no sink write on a closed role");
});

test("bridge: router-shape prior-application disclosure arms the duplicate guard; submit writes nothing", () => {
  const sinkDir = tmpSink("prior");
  const ctx = doorstepCtx(sinkDir);
  A_PRIOR(ctx.doorstepState);
  assert.equal(guardCode(ctx), "duplicate_application");
  chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "no duplicate sink write");
});

test("bridge: router-shape cancel arms the approval_cancelled guard; submit writes nothing", () => {
  const sinkDir = tmpSink("cancel");
  const ctx = doorstepCtx(sinkDir);
  A_CANCEL(ctx.doorstepState);
  assert.equal(guardCode(ctx), "approval_cancelled");
  chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "no sink write after a cancel");
});

test("bridge: router-shape fact-correction invalidation arms the approval_invalidated guard", () => {
  const sinkDir = tmpSink("inv");
  const ctx = doorstepCtx(sinkDir);
  A_CORRECTED(ctx.doorstepState);
  assert.equal(guardCode(ctx), "approval_invalidated");
  chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 0, "no sink write on an invalidated packet");
});

test("bridge control: no invalidation state — the same submit still executes exactly once", () => {
  const sinkDir = tmpSink("ok");
  const ctx = doorstepCtx(sinkDir);
  assert.equal(guardCode(ctx), null);
  chatPath("approve and submit", ctx);
  assert.equal(sinkCount(sinkDir), 1, "the unblocked path is unchanged");
});
