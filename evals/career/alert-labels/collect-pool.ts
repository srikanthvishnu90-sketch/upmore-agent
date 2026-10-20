// WO-037: gather the real postings the 200-role labeled set is drawn from. Reads every live board in the directory with
// the product's own feed reader (boardFetchFeed, the code ingest runs) and keeps, per persona and stratum, a bounded
// sample of the postings that fall there (label_set.ts stratumOf), descriptions clipped to 3,000 characters so the pool
// stays a few MB. Then builds the 200 rows (buildRows) and writes them. Needs the internet; CI runs it
// (.github/workflows/board-discovery.yml, job label-pool).
//   deno run -A evals/career/alert-labels/collect-pool.ts [--max-boards n] [--out-dir dir]
import { boardFetchFeed, directoryBoards } from "../../../supabase/functions/_shared/career_ingest.ts";
import { buildRows, fnv, type Persona, type PoolPosting, prefsOf, STRATA, stratumOf } from "./label_set.ts";

const opt = (k: string, d?: string) => { const i = Deno.args.indexOf(k); return i >= 0 ? Deno.args[i + 1] : d; };
const here = new URL("./", import.meta.url);
const personas: Persona[] = JSON.parse(await Deno.readTextFile(new URL("personas.json", here))).personas;
const dir = JSON.parse(await Deno.readTextFile(new URL("../../../packages/career-data/board-directory.json", import.meta.url)));
const boards = directoryBoards(dir).slice(0, Number(opt("--max-boards", "100000")));
const outDir = opt("--out-dir", "label-pool-out")!;
await Deno.mkdir(outDir, { recursive: true });
const fetchFeed = boardFetchFeed(fetch, { userAgent: "UpmoreTrainee-LabelSet/1.0 (+https://github.com/srikanthvishnu90-sketch/upmore-agent; job alerts)", timeoutMs: 20000 });
const prefs = new Map(personas.map((p) => [p.id, prefsOf(p)]));
const KEEP = 60; // per persona and stratum, by a stable hash, before the final pick
const buckets = new Map<string, PoolPosting[]>();
let read = 0, failed = 0, postings = 0, next = 0;
await Promise.all(Array.from({ length: 8 }, async () => {
  while (next < boards.length) {
    const b = boards[next++];
    let list;
    try { const r = await fetchFeed(b); list = Array.isArray(r) ? r : r.postings; read++; } catch { failed++; continue; }
    for (const f of list) {
      postings++;
      const x: PoolPosting = { job_id: f.job_id, provider: b.provider, board: b.board, company: f.company, title: f.title, location: f.location || "",
        url: f.url, posted_at: f.posted_at ?? null, description: String(f.description || "").slice(0, 3000), department: f.department || "" };
      for (const p of personas) {
        const s = stratumOf(x, p, prefs.get(p.id)!);
        if (!s) continue;
        const k = `${p.id}|${s}`, l = buckets.get(k) ?? [];
        l.push(x);
        if (l.length > KEEP * 2) { l.sort((a, c) => fnv(p.id + a.job_id) - fnv(p.id + c.job_id)); l.length = KEEP; }
        buckets.set(k, l);
      }
    }
  }
}));
const pool = new Map<string, PoolPosting>();
for (const l of buckets.values()) for (const x of l) pool.set(x.job_id, x);
const rows = buildRows([...pool.values()], personas);
const strata = Object.fromEntries(personas.map((p) => [p.id, Object.fromEntries(STRATA.map((s) => [s, rows.filter((r) => r.persona === p.id && r.stratum === s).length]))]));
const at = new Date().toISOString();
await Deno.writeTextFile(`${outDir}/candidates.json`, JSON.stringify({
  note: "WO-037 labeled-set candidates: real postings read by the product's feed reader (boardFetchFeed) from the live directory, each paired with one persona (personas.json), stratified by near miss (label_set.ts). Descriptions clipped to 3,000 characters. 'gate' is what the alert gate (matchPosting) says; it is NOT a label.",
  collected_at: at, boards_read: read, boards_failed: failed, postings_seen: postings, rows: rows.length, strata, rows_data: rows,
}, null, 1) + "\n");
console.log(`POOL boards ${read} read, ${failed} failed, ${postings} postings, ${pool.size} kept; ROWS ${rows.length}`);
for (const p of personas) console.log(`STRATA ${p.id} ${JSON.stringify(strata[p.id])}`);
