// Local ingest run against the real boards, into memory (WO-006 acceptance): nothing is written anywhere.
//   deno run -A supabase/functions/career-ingest/local.ts [--max 60] [--concurrency 8] [--twice-after 600] [--out postings.json]
// --twice-after N runs the same boards again N seconds later and prints the second run's stats (new > 0 only for
// postings that appeared in between). --out saves the open postings for the simulator (scripts/text.ts --postings).
import { boardFetchFeed, ingestBoards, memoryPostingsDb } from "../_shared/career_ingest.ts";
import boards from "./boards.json" with { type: "json" };

const args = Deno.args, opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const max = Number(opt("--max") || 60), concurrency = Number(opt("--concurrency") || 8), again = Number(opt("--twice-after") || 0), out = opt("--out");
const contact = Deno.env.get("INGEST_CONTACT_EMAIL") || "local test run";
const db = memoryPostingsDb(), feed = boardFetchFeed(fetch, { userAgent: `Trainee job alerts (contact: ${contact})` });
const run = async (label: string) => {
  await db.setCursor(0);
  const t0 = Date.now();
  const s = await ingestBoards({ boards, fetchFeed: feed, db, now: Date.now(), maxBoards: max, concurrency });
  console.log(`${label}: ${s.attempted} boards in ${((Date.now() - t0) / 1000).toFixed(1)}s · ok ${s.boards_ok} · failed ${s.boards_failed} · partial ${s.boards_partial} · new ${s.new} · seen ${s.seen} · reopened ${s.reopened} · closed ${s.closed}`);
  for (const f of s.failures) console.log(`  failed ${f.provider}:${f.board}: ${f.error}`);
  for (const c of s.large_closes) console.log(`  large close ${c.provider}:${c.board}: ${c.closed} of ${c.was_open}`);
};
await run("run 1");
if (again > 0) { console.log(`waiting ${again}s…`); await new Promise((r) => setTimeout(r, again * 1000)); await run("run 2"); }
if (out) { const open = await db.open(); await Deno.writeTextFile(out, JSON.stringify(open)); console.log(`${open.length} open postings written to ${out}`); }
