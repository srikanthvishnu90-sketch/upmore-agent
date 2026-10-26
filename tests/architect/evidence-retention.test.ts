// G6: the evidence's retention and cleanup (scripts/career/evidence-retention.ts), and where it may never be.
//   - an evidence directory older than the period is removed; a newer one is kept; a listing removes nothing
//   - what is not plainly an engine's evidence directory is never removed: a link (and what it points to), a directory
//     that is not private, one holding another file, one with another name
//   - the names the engine gives its evidence directories are the ones the cleanup knows
//   - the evidence is never in the repository, and no CI workflow uploads it
import assertNode from "node:assert/strict";
import { PROPOSED_RETENTION_DAYS, pruneEvidence } from "../../scripts/career/evidence-retention.ts";

const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepEqual(a, b, m);
const ROOT = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");
const DAY = 86_400_000, NOW = Date.now(), OLD = new Date(NOW - 120 * DAY), NEW = new Date(NOW - 2 * DAY);
const exists = (p: string) => { try { Deno.lstatSync(p); return true; } catch { return false; } };

// An evidence directory as the engine leaves it: 0700, the record and its pictures 0600, all last written at `at`.
function evidenceDir(root: string, name: string, at: Date, o: { mode?: number; extra?: string } = {}) {
  const dir = `${root}/${name}`;
  Deno.mkdirSync(dir, { mode: 0o700 });
  for (const f of ["evidence.json", "proof-1-before-click.png", "proof-2-after-submit.png", ...(o.extra ? [o.extra] : [])]) {
    Deno.writeTextFileSync(`${dir}/${f}`, "{}", { mode: 0o600 });
    Deno.utimeSync(`${dir}/${f}`, at, at);
  }
  Deno.chmodSync(dir, o.mode ?? 0o700);
  Deno.utimeSync(dir, at, at);
  return dir;
}

Deno.test("retention: an evidence directory older than the period is removed, a newer one is kept, a listing removes nothing", () => {
  const root = Deno.makeTempDirSync({ prefix: "retention-" });
  try {
    const old = evidenceDir(root, "trainee-evidence-0a1b2c3d4e5f6071", OLD);
    const own = evidenceDir(root, "evidence-O9Fww1", OLD);
    const cloud = evidenceDir(root, "3f1c2b9e-1d2a-4c5b-8e7f-0a1b2c3d4e5f", OLD);
    const recent = evidenceDir(root, "trainee-evidence-ffeeddccbbaa9988", NEW);
    const olderThanMs = PROPOSED_RETENTION_DAYS * DAY;
    const listed = pruneEvidence({ roots: [root], olderThanMs, now: NOW, dryRun: true });
    eq(listed.removed.sort(), [old, own, cloud].sort(), "the listing names the three older than the period");
    assert([old, own, cloud, recent].every(exists), "a listing removes nothing");
    const r = pruneEvidence({ roots: [root], olderThanMs, now: NOW });
    eq(r.removed.sort(), [old, own, cloud].sort());
    eq(r.kept, [recent]);
    assert(![old, own, cloud].some(exists) && exists(recent), "the old ones are gone, the recent one is kept");
    // One file written recently keeps the whole directory: its age is its newest file's.
    const touched = evidenceDir(root, "trainee-evidence-1111111111111111", OLD);
    Deno.utimeSync(`${touched}/evidence.json`, NEW, NEW);
    eq(pruneEvidence({ roots: [root], olderThanMs, now: NOW }).kept.sort(), [recent, touched].sort());
    assert(exists(touched));
    assertNode.throws(() => pruneEvidence({ roots: [root], olderThanMs: 0, now: NOW }), /RETENTION_PERIOD_REQUIRED/);
  } finally {
    Deno.removeSync(root, { recursive: true });
  }
});

Deno.test("retention: what is not plainly an engine's evidence directory is never removed", () => {
  const root = Deno.makeTempDirSync({ prefix: "retention-" }), outside = Deno.makeTempDirSync({ prefix: "retention-outside-" });
  try {
    const target = evidenceDir(outside, "trainee-evidence-2222222222222222", OLD);
    Deno.symlinkSync(target, `${root}/trainee-evidence-3333333333333333`);
    const open = evidenceDir(root, "trainee-evidence-4444444444444444", OLD, { mode: 0o755 });
    const foreign = evidenceDir(root, "trainee-evidence-5555555555555555", OLD, { extra: "notes.txt" });
    const other = evidenceDir(root, "photos", OLD);
    const r = pruneEvidence({ roots: [root], olderThanMs: PROPOSED_RETENTION_DAYS * DAY, now: NOW });
    eq(r.removed, [], JSON.stringify(r));
    eq(Object.fromEntries(r.skipped.map((s) => [s.path.split("/").at(-1), s.why])), {
      "trainee-evidence-3333333333333333": "a link",
      "trainee-evidence-4444444444444444": "not private",
      "trainee-evidence-5555555555555555": "holds notes.txt, not evidence",
    });
    assert(exists(target) && exists(`${target}/evidence.json`), "a link's target is never followed or removed");
    assert(exists(open) && exists(foreign) && exists(other), "nothing else is removed");
  } finally {
    Deno.removeSync(root, { recursive: true });
    Deno.removeSync(outside, { recursive: true });
  }
});

Deno.test("retention: the names the engine gives its evidence directories are the ones the cleanup knows", () => {
  const apply = Deno.readTextFileSync(`${ROOT}/scripts/apply.ts`);
  const local = Deno.readTextFileSync(`${ROOT}/workers/career-browser/approve-first.ts`);
  const cloud = Deno.readTextFileSync(`${ROOT}/workers/career-cloud/worker.ts`);
  assert(apply.includes('fs.mkdtempSync(path.join(stateDir, "evidence-"))'), "scripts/apply.ts names its own evidence-*");
  assert(local.includes('Deno.makeTempDir({ prefix: "trainee-evidence-" })'), "approve-first names its trainee-evidence-*");
  assert(cloud.includes("`${o.evidenceRoot}/${crypto.randomUUID()}`"), "the cloud worker names a uuid");
  assert(/finally \{\s*await Deno\.remove\(dir, \{ recursive: true \}\)/.test(cloud), "the cloud worker removes it after each run");
});

Deno.test("retention: the evidence is never in the repository, and no CI workflow uploads it", async () => {
  const out = await new Deno.Command("git", { args: ["ls-files"], cwd: ROOT, stdout: "piped" }).output();
  assert(out.success, "git ls-files ran");
  const tracked = new TextDecoder().decode(out.stdout).split("\n");
  assert(tracked.includes("scripts/apply.ts"), "the listing is the repository's");
  eq(tracked.filter((f) => /(^|\/)(trainee-evidence-|evidence-[A-Za-z0-9]{6}\/)|proof-\d+-[a-z-]+\.png$|(after-submit|before-review|after-code)\.png$/.test(f)), [],
    "no evidence directory or proof picture is tracked");
  for (const e of Deno.readDirSync(`${ROOT}/.github/workflows`)) {
    const y = Deno.readTextFileSync(`${ROOT}/.github/workflows/${e.name}`);
    for (const m of y.matchAll(/upload-artifact@[^\n]*\n((?:\s+.*\n?){0,8})/g)) {
      assert(!/evidence-|evidence\.json|proof-|\.png|engine-state|\.local\/state\/upmore/.test(m[1]), `${e.name} uploads evidence: ${m[1]}`);
    }
  }
});
