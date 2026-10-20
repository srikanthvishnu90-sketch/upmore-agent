// WO-037: the board discovery run. Gathers candidate slugs from the sources named below, verifies every one against its
// provider's public API (scripts/career/board_discovery.ts: 200 and the expected JSON shape, nothing else), and writes
// one verdict per line plus a summary. With --merge it also adds the verified boards to the directory. Needs the
// internet; CI runs it (.github/workflows/board-discovery.yml), weekly and on demand.
//   deno run -A scripts/career/discover-boards.ts [--sources directory,candidates,commoncrawl,domains] [--crawls 2]
//     [--cc-pages 60] [--domains file.csv] [--domains-limit 5000] [--gap-ms 200] [--max-minutes 300] [--only provider]
//     [--out-dir discovery-out] [--merge]
// Printed lines a CI log or annotation can carry: CALIBRATION, SOURCES, TALLY, VERIFIED.
import {
  type Candidate, commonCrawlCandidates, guessesFromDomain, keyOf, mergeDirectory, type Provider, PROVIDERS, tally, verifyCandidates,
} from "./board_discovery.ts";

const opt = (k: string, d?: string) => { const i = Deno.args.indexOf(k); return i >= 0 ? Deno.args[i + 1] : d; };
const flag = (k: string) => Deno.args.includes(k);
const root = new URL("../../", import.meta.url);
const started = Date.now();
const deadline = started + Number(opt("--max-minutes", "300")) * 60000;
const sources = new Set(String(opt("--sources", "directory,candidates,commoncrawl")).split(","));
const only = opt("--only") as Provider | undefined;
const outDir = opt("--out-dir", "discovery-out")!;
await Deno.mkdir(outDir, { recursive: true });

const dirPath = new URL("packages/career-data/board-directory.json", root);
const directory = JSON.parse(await Deno.readTextFile(dirPath));
const cands: Candidate[] = [];
const counts: Record<string, number> = {};
const add = (c: Candidate) => { if (!PROVIDERS.includes(c.provider)) return; cands.push(c); counts[c.source.split(":")[0]] = (counts[c.source.split(":")[0]] ?? 0) + 1; };

if (sources.has("directory")) for (const b of directory.boards) if (PROVIDERS.includes(b.provider)) add({ provider: b.provider, slug: String(b.board_token), source: "directory" });
if (sources.has("candidates")) {
  const c = JSON.parse(await Deno.readTextFile(new URL("packages/career-data/board-candidates.json", root)));
  for (const x of c.candidates) if (PROVIDERS.includes(x.provider)) add({ provider: x.provider, slug: String(x.token), source: "wo017-candidates", company_hint: x.company_hint });
}
let cc = { pages: 0, errors: 0, crawls: [] as string[] };
if (sources.has("commoncrawl")) {
  // The index gets at most half the run; verification needs the rest.
  const r = await commonCrawlCandidates({ crawls: Number(opt("--crawls", "2")), maxPages: Number(opt("--cc-pages", "60")),
    deadline: started + (deadline - started) / 2, log: (s) => console.log(s) });
  cc = { pages: r.pages, errors: r.errors, crawls: r.crawls };
  for (const c of r.candidates) add(c);
}
if (sources.has("domains") && opt("--domains")) {
  const lines = (await Deno.readTextFile(opt("--domains")!)).split("\n").slice(0, Number(opt("--domains-limit", "5000")));
  for (const l of lines) {
    const domain = l.split(",").pop()!.trim();
    for (const slug of guessesFromDomain(domain)) for (const p of PROVIDERS) add({ provider: p, slug, source: "domains", company_hint: domain });
  }
}
const list = (only ? cands.filter((c) => c.provider === only) : cands);
const unique = new Set(list.map((c) => keyOf(c.provider, c.slug))).size;
console.log(`SOURCES ${JSON.stringify({ ...counts, unique_candidates: unique, commoncrawl: cc })}`);

const out = await Deno.open(`${outDir}/verdicts.jsonl`, { write: true, create: true, truncate: true });
const enc = new TextEncoder();
let n = 0;
const res = await verifyCandidates(list, {
  gapMs: Number(opt("--gap-ms", "200")), workersPerHost: 3, deadline,
  onRow: (r) => { out.writeSync(enc.encode(JSON.stringify(r) + "\n")); if (++n % 1000 === 0) console.log(`progress ${n}/${unique} ${Math.round((Date.now() - started) / 1000)}s`); },
});
out.close();
const t = tally(res.rows);
const summary = { at: new Date().toISOString(), seconds: Math.round((Date.now() - started) / 1000), sources: counts, unique_candidates: unique,
  probed: res.rows.length, unprobed_at_deadline: res.unprobed, calibration: res.calibration, commoncrawl: cc, ...t };
await Deno.writeTextFile(`${outDir}/summary.json`, JSON.stringify(summary, null, 1) + "\n");
console.log(`CALIBRATION ${JSON.stringify(res.calibration)}`);
console.log(`TALLY ${JSON.stringify(t.by)}`);
console.log(`CONDITIONAL ${JSON.stringify(t.conditional)}`);
console.log(`VERIFIED ${t.verified_boards} boards answered 200 with the expected shape (${t.verified_supported} on supported providers, ${t.verified_with_postings} with at least one posting) of ${unique} candidates; ${res.unprobed} not probed before the deadline`);

if (flag("--merge")) {
  const m = mergeDirectory(directory, res.rows, new Date().toISOString().slice(0, 10), { verified_boards: t.verified_boards, unique_candidates: unique, calibration: res.calibration });
  await Deno.writeTextFile(dirPath, JSON.stringify(m.directory, null, 1) + "\n");
  console.log(`MERGED added ${m.added}, refreshed ${m.refreshed}; live supported now ${m.directory.meta.live_supported}`);
}
