// Feature 6 (2026-10-25): merge a discovery run's verified boards into the board directory, then the ingest list is
// rebuilt from it (deno run -A scripts/build-ingest-boards.ts). Only a row whose verdict is "live" joins: the run fetched
// the board's public postings feed and it answered 200 with the provider's expected shape (board_discovery.ts classify,
// after one gibberish-token calibration probe per provider). Dead, robots-blocked, unverifiable and errored rows add
// nothing; an ATS vendor's own board is skipped; existing entries are never removed (board_discovery.ts mergeDirectory).
// The directory's meta.f06_merge records, per ATS, how many boards are live and how many of those had postings, and every
// row that did not join, by reason.
//   deno run -A scripts/career/merge-discovery-verdicts.ts <discovery-verdicts.jsonl.gz> --run <id> --date <YYYY-MM-DD>
import { keyOf, mergeDirectory, type VerdictRow } from "./board_discovery.ts";

const args = Deno.args, opt = (n: string) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined; };
const file = args[0], run = opt("--run") || "", date = opt("--date") || new Date().toISOString().slice(0, 10);
if (!file || !run) { console.error("usage: merge-discovery-verdicts.ts <verdicts.jsonl.gz> --run <id> --date <YYYY-MM-DD>"); Deno.exit(2); }
const dirUrl = new URL("../../packages/career-data/board-directory.json", import.meta.url);

async function readRows(path: string): Promise<VerdictRow[]> {
  const bytes = await Deno.readFile(path);
  const text = path.endsWith(".gz")
    ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text()
    : new TextDecoder().decode(bytes);
  return text.split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

export function mergeReport(before: { boards: any[] }, after: { boards: any[] }, rows: VerdictRow[]) {
  const had = new Set(before.boards.map((b) => keyOf(b.provider, b.board_token)));
  const live = after.boards.filter((b) => b.status === "live");
  const per: Record<string, { live: number; with_postings: number; added: number }> = {};
  for (const b of live) {
    const p = (per[b.provider] ??= { live: 0, with_postings: 0, added: 0 });
    p.live++; if ((b.postings_seen ?? 0) > 0) p.with_postings++; if (!had.has(keyOf(b.provider, b.board_token))) p.added++;
  }
  const dropped: Record<string, number> = {};
  const inAfter = new Set(after.boards.map((b) => keyOf(b.provider, b.board_token)));
  for (const r of rows) {
    if (r.verdict === "live" && inAfter.has(keyOf(r.provider, r.slug))) continue;
    const why = r.verdict === "live" ? "ATS vendor's own board" : `verdict ${r.verdict}`;
    dropped[why] = (dropped[why] ?? 0) + 1;
  }
  return { live: live.length, by_ats: Object.fromEntries(Object.entries(per).sort((a, b) => b[1].live - a[1].live)), rows: rows.length, dropped };
}

if (import.meta.main) {
  const before = JSON.parse(await Deno.readTextFile(dirUrl));
  const rows = await readRows(file);
  const m = mergeDirectory(before, rows, date, { run });
  const report = mergeReport(before, m.directory, rows);
  m.directory.meta.f06_merge = { run, date, rule: "verdict live (200 with the provider's feed shape) in the run; existing entries kept", ...report };
  await Deno.writeTextFile(dirUrl, JSON.stringify(m.directory, null, 1) + "\n");
  console.log(`run ${run}: ${rows.length} verdict rows; added ${m.added}, refreshed ${m.refreshed}; live now ${report.live}`);
  for (const [p, c] of Object.entries(report.by_ats)) console.log(`  ${p}: ${c.live} live (${c.with_postings} with postings; ${c.added} added)`);
  for (const [why, n] of Object.entries(report.dropped)) console.log(`  not joined, ${why}: ${n}`);
}
