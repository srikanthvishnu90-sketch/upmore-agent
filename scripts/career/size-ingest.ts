// WO-037: size the 6-hour refresh. Measures, on this machine, the CPU one board costs the ingest function (parse the
// feed JSON, normalize it with the product's own reader, serialize the rows it would write), then applies
// career_shards.ts sizeIngest to the directory's size and to 50,000 boards against the Supabase Edge Function limits
// (supabase.com/docs/guides/functions/limits: 2 s CPU per request, 150 s wall clock free / 400 s paid).
//   deno run -A scripts/career/size-ingest.ts
import { boardFetchFeed } from "../../supabase/functions/_shared/career_ingest.ts";
import { lanesNeeded, sizeIngest } from "../../supabase/functions/_shared/career_shards.ts";

const root = new URL("../../", import.meta.url);
const dir = JSON.parse(await Deno.readTextFile(new URL("packages/career-data/board-directory.json", root)));
const live = dir.boards.filter((b: any) => b.status === "live");
const counts = live.map((b: any) => Number(b.postings_seen) || 0).sort((a: number, b: number) => a - b);
const mean = counts.reduce((a: number, b: number) => a + b, 0) / counts.length, median = counts[Math.floor(counts.length / 2)];
// Real descriptions (the labeled set's, up to 3,000 characters) padded to a Greenhouse-sized body (~6,000 characters
// of HTML per job with content=true: ASSUMED from the WO-017 storage measure, 564 M characters over 173 k postings).
const rows = JSON.parse(await Deno.readTextFile(new URL("evals/career/alert-labels/candidates.json", root))).rows_data;
const html = (i: number) => `<p>${rows[i % rows.length].posting.description}</p>`.repeat(2).slice(0, 6000);
function feed(n: number) {
  return JSON.stringify({ jobs: Array.from({ length: n }, (_, i) => ({ id: 1000 + i, title: rows[i % rows.length].posting.title, absolute_url: `https://job-boards.greenhouse.io/x/jobs/${1000 + i}`,
    location: { name: rows[i % rows.length].posting.location }, updated_at: "2026-10-19T00:00:00Z", first_published: "2026-10-18T00:00:00Z", content: html(i), departments: [{ name: "Engineering" }] })) });
}
async function cpuMs(n: number, reps = 20): Promise<number> {
  const body = feed(n);
  const read = boardFetchFeed((async () => new Response(body, { status: 200 })) as unknown as typeof fetch);
  await read({ company: "X", provider: "greenhouse", board: "x" }); // warm up
  const t0 = performance.now();
  for (let i = 0; i < reps; i++) { const r = await read({ company: "X", provider: "greenhouse", board: "x" }); JSON.stringify(Array.isArray(r) ? r : r.postings); }
  return (performance.now() - t0) / reps;
}
const at = { 10: await cpuMs(10), [median]: await cpuMs(Math.max(1, median)), 100: await cpuMs(100), [Math.round(mean)]: await cpuMs(Math.round(mean)) };
console.log(`MEASURED directory: ${live.length} live boards, postings per board mean ${mean.toFixed(0)}, median ${median}`);
console.log(`MEASURED cpu ms per board (parse + normalize + serialize), by postings on the board: ${JSON.stringify(Object.fromEntries(Object.entries(at).map(([k, v]) => [k, +v.toFixed(2)])))}`);
const cpuMean = at[Math.round(mean)];
for (const boards of [live.length, 50000]) {
  for (const share of [0, 0.7]) {
    const base = { boards, intervalMs: 5 * 60000, concurrency: 8, avgLatencyMs: 600, cpuMsPerBoard: cpuMean, notModifiedShare: share, cpuMsNotModified: 0.3, wallLimitS: 150, cpuLimitMs: 2000, deadlineS: 100 };
    const lanes = lanesNeeded(base);
    console.log(`SIZE ${boards} boards, ${share * 100}% answered 304: lanes needed ${lanes}; at that many: ${JSON.stringify(sizeIngest({ ...base, lanes: lanes ?? 64 }))}`);
  }
}
