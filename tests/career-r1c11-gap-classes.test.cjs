/* R1 C11 (Crew B Cycle 2, W3) — gap CLASSES in module 123's typed result.
   Crew A handover defect: for GJ-T03 the posting's Go requirement is
   PREFERRED-not-required and the profile lacks Go, but 123's gap read
   returned EMPTY — so the tailor turn's spoken line (142, another worker's
   file) fell into its "No skill gap: every skill the posting names is
   evidenced on your profile" branch while the artifact half was honest.
   Root cause pinned here: parseJD dropped the ambiguous skill "Go" from
   the nice-to-have zone entirely (its BUG-057 tech-context window saw no
   tech word near the token), so computeGaps never saw a preferred gap.
   This guard pins the 123 half: required gaps and preferred gaps are
   distinguished in the typed result and BOTH are returned. "No gaps at
   all" may be reported only when neither class has an entry.
   TEST fixtures only (the gauntlet corpus posting + TEST profile). */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const Tailor = require(path.join(ROOT, "packages/domain/123-career-tailor.js"));
const Profile = require(path.join(ROOT, "packages/domain/122-career-profile.js"));
const Router = require(path.join(ROOT, "packages/domain/142-career-router.js"));

const GAUNTLET = path.join(ROOT, "packages/career-data/fixtures/gauntlet");
const corpus = JSON.parse(fs.readFileSync(path.join(GAUNTLET, "jobs/scored-corpus.json"), "utf8"));
const posting = corpus.postings.find((p) => p.id === "GJ-T03");
assert.ok(posting, "GJ-T03 must exist in the scored corpus");
const profileData = JSON.parse(fs.readFileSync(path.join(GAUNTLET, "profiles/p1-early-career-swe/profile.json"), "utf8"));
const profile = Profile.profileFromData(profileData);
// The exact JD text the router builds for this posting (142's own builder,
// read-only use here) — Requirements: Python; SQL. Nice to have: Go.
const jdText = Router.jdTextForPosting(posting);

test("R1 C11 (123): GJ-T03 parses Go as a PREFERRED skill, never as required", () => {
  const jd = Tailor.parseJD(jdText);
  assert.ok(jd.mustHaveSkills.includes("Python"), `Python is required: ${jd.mustHaveSkills}`);
  assert.ok(jd.mustHaveSkills.includes("SQL"), `SQL is required: ${jd.mustHaveSkills}`);
  assert.ok(!jd.mustHaveSkills.includes("Go"), "Go is preferred-not-required; it must not be promoted to required");
  assert.ok(jd.niceToHaveSkills.includes("Go"), `Go must survive parseJD in the preferred zone: nice=[${jd.niceToHaveSkills}]`);
});

test("R1 C11 (123): the typed tailor result names Go as a PREFERRED gap — gaps are not empty", () => {
  const r = Tailor.tailorResume(profile, jdText, { company: posting.company, jobId: "GJ-T03" });
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.ok(Array.isArray(r.gaps) && r.gaps.length >= 1, "gaps must NOT be empty when a preferred skill is unevidenced — empty is what made the spoken line lie");
  const go = r.gaps.find((g) => g.requirement === "Go");
  assert.ok(go, `Go must be a named gap: ${JSON.stringify(r.gaps)}`);
  assert.equal(go.gapClass, "preferred", `Go's gap class must be "preferred", got ${JSON.stringify(go)}`);
  assert.equal(go.tier, "nice-to-have", "existing tier field stays nice-to-have for back-compat");
  assert.ok(!r.gaps.some((g) => g.gapClass === "required"), `no required gap exists for GJ-T03 (Python/SQL are evidenced): ${JSON.stringify(r.gaps)}`);
  // Buckets on the typed result — the spoken line's data source.
  assert.ok(Array.isArray(r.preferredGaps), "typed result carries preferredGaps");
  assert.ok(r.preferredGaps.some((g) => g.requirement === "Go"), "preferredGaps names Go");
  assert.ok(Array.isArray(r.requiredGaps), "typed result carries requiredGaps");
  assert.equal(r.requiredGaps.filter((g) => g.kind === "skill").length, 0, "requiredGaps holds no skill gap for GJ-T03");
  // And the version snapshot + document model carry the same classes.
  assert.ok(r.version.preferredGaps && r.version.preferredGaps.some((g) => g.requirement === "Go"), "version snapshot carries the preferred gap");
  assert.ok(r.resume.preferredGaps && r.resume.preferredGaps.some((g) => g.requirement === "Go"), "document model carries the preferred gap");
  // The resume body still claims neither Go nor anything unevidenced.
  const body = r.resume.lines.map((l) => l.text).join("\n");
  assert.ok(!Tailor.skillsInText(body).includes("Go"), "Go is a gap, never a claim on the page");
});

test("R1 C11 (123): a missing REQUIRED skill is classed required, distinct from preferred", () => {
  const r = Tailor.tailorResume(profile, "Backend Engineer (TEST posting)\nRequirements: Python, Rust.\nNice to have: Go.\nYou will build services.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  const rust = r.gaps.find((g) => g.requirement === "Rust");
  assert.ok(rust, `Rust must be a named gap: ${JSON.stringify(r.gaps)}`);
  assert.equal(rust.gapClass, "required");
  const go = r.gaps.find((g) => g.requirement === "Go");
  assert.ok(go && go.gapClass === "preferred", `Go stays preferred in the same result: ${JSON.stringify(r.gaps)}`);
  assert.ok(r.requiredGaps.some((g) => g.requirement === "Rust"), "requiredGaps names Rust");
  assert.ok(r.preferredGaps.some((g) => g.requirement === "Go"), "preferredGaps names Go");
});

test("R1 C11 (123): truly no gaps — only a fully-covered posting returns empty gaps (the only case 'No skill gap' may be spoken)", () => {
  const r = Tailor.tailorResume(profile, "Backend Engineer (TEST posting)\nRequirements: Python, SQL.\nYou will build services.", {});
  assert.equal(r.ok, true, JSON.stringify(r.violations || []));
  assert.deepEqual(r.gaps, [], `fully-covered posting must return zero gaps of either class: ${JSON.stringify(r.gaps)}`);
  assert.deepEqual(r.requiredGaps, []);
  assert.deepEqual(r.preferredGaps, []);
});
