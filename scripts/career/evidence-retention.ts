// G6: how long an application's evidence is kept on the machine that ran it, and how it is removed.
//
// The evidence directory of a run holds the person's answers (evidence.json) and pictures of the filled page, private
// (0700 directory, 0600 files). The cloud worker removes it when the run ends (workers/career-cloud/worker.ts); a run
// on the person's own computer leaves it where the engine wrote it. This removes the ones older than the retention
// period, and only directories that are plainly an evidence directory: the engine's name, owned by this user, private,
// not a link, holding nothing but the evidence's own files. Anything else is left and named.
//
// PROPOSED_RETENTION_DAYS is a proposal; the owner sets the period. Nothing runs this on a schedule: the person (or the
// owner, once the period is set) runs it. Without --delete it only lists what it would remove.
//
//   deno run -A scripts/career/evidence-retention.ts [--days 90] [--root DIR ...] [--delete]
import * as path from "node:path";
import * as os from "node:os";

export const PROPOSED_RETENTION_DAYS = 90;

// The names the engine gives an evidence directory: scripts/apply.ts (evidence-*, under its state directory), the
// person's own runner (trainee-evidence-*, approve-first.ts), the cloud worker (a uuid, removed after each run).
const DIR_NAME = /^(evidence-[A-Za-z0-9_]+|trainee-evidence-[A-Za-z0-9_]+|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;
// The files a run writes there: the record, its pictures, the record's write in progress.
const FILE_NAME = /^(evidence\.json|[a-z0-9-]+\.png|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.tmp)$/;

export type Pruned = { removed: string[]; kept: string[]; skipped: { path: string; why: string }[] };

// Where the engine keeps evidence by default on this machine.
export function evidenceRoots(): string[] {
  const home = Deno.env.get("HOME") || os.homedir();
  return [os.tmpdir(), path.join(home, ".local", "state", "upmore", "apply"), path.join(home, "trainee-evidence")];
}

export function pruneEvidence(o: { roots: string[]; olderThanMs: number; now: number; dryRun?: boolean }): Pruned {
  if (!(o.olderThanMs > 0)) throw Error("RETENTION_PERIOD_REQUIRED");
  const out: Pruned = { removed: [], kept: [], skipped: [] };
  const uid = Deno.uid();
  for (const root of o.roots) {
    let entries: Deno.DirEntry[];
    try {
      entries = [...Deno.readDirSync(root)];
    } catch {
      continue; // no such root on this machine
    }
    for (const e of entries) {
      if (!DIR_NAME.test(e.name)) continue;
      const dir = path.join(root, e.name), st = Deno.lstatSync(dir);
      if (st.isSymlink) { out.skipped.push({ path: dir, why: "a link" }); continue; }
      if (!st.isDirectory) continue;
      if (uid !== null && st.uid !== uid) { out.skipped.push({ path: dir, why: "another user's" }); continue; }
      if ((st.mode ?? 0) & 0o077) { out.skipped.push({ path: dir, why: "not private" }); continue; }
      let newest = st.mtime?.getTime() ?? 0, foreign = "";
      for (const f of Deno.readDirSync(dir)) {
        const fst = Deno.lstatSync(path.join(dir, f.name));
        if (!fst.isFile || !FILE_NAME.test(f.name)) { foreign = f.name; break; }
        newest = Math.max(newest, fst.mtime?.getTime() ?? 0);
      }
      if (foreign) { out.skipped.push({ path: dir, why: `holds ${foreign}, not evidence` }); continue; }
      if (o.now - newest <= o.olderThanMs) { out.kept.push(dir); continue; }
      if (!o.dryRun) Deno.removeSync(dir, { recursive: true });
      out.removed.push(dir);
    }
  }
  return out;
}

if (import.meta.main) {
  const args = Deno.args, roots: string[] = [];
  let days = PROPOSED_RETENTION_DAYS, del = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--days") days = Number(args[++i]);
    else if (args[i] === "--root") roots.push(args[++i]);
    else if (args[i] === "--delete") del = true;
    else { console.error(`unknown argument ${args[i]}`); Deno.exit(2); }
  }
  if (!(days > 0)) { console.error("--days must be a positive number"); Deno.exit(2); }
  const r = pruneEvidence({ roots: roots.length ? roots : evidenceRoots(), olderThanMs: days * 86_400_000, now: Date.now(), dryRun: !del });
  for (const p of r.removed) console.log(`${del ? "removed" : "would remove"} ${p}`);
  for (const s of r.skipped) console.log(`left ${s.path}: ${s.why}`);
  console.log(`${r.removed.length} ${del ? "removed" : "older than " + days + " days (run with --delete to remove)"}, ${r.kept.length} kept, ${r.skipped.length} left`);
}
