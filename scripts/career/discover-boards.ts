// WO-037 / WO-044: the board discovery run. Gathers candidate slugs from the sources named below, verifies every one
// against its provider's public API (scripts/career/board_discovery.ts: 200 and the expected shape, nothing else), and
// writes one verdict per line plus a summary. With --merge it also adds the verified boards to the directory. Needs the
// internet; CI runs it (.github/workflows/board-discovery.yml), weekly and on demand.
//
// Phases (WO-044: CI runs them as separate jobs, one verify job per provider, so the whole candidate set fits inside
// GitHub's 6-hour job limit; `all` runs the three in one process):
//   --phase gather   sources -> <out>/candidates.jsonl, <out>/sources.json                      prints SOURCES, CC, CCDATA, SITEMAP
//   --phase verify   <candidates.jsonl> [--providers a,b] -> <out>/verdicts.jsonl, verify.json     prints SHARD
//   --phase merge    every verdicts.jsonl under --verdicts-dir -> <out>/verdicts.jsonl, summary.json [--merge: the directory]
//                                                                         prints CALIBRATION, TALLY, CONDITIONAL, BY_PROVIDER, VERIFIED, MERGED
//   deno run -A scripts/career/discover-boards.ts [--phase all] [--sources directory,candidates,ccdata,sitemaps,commoncrawl,domains]
//     [--cc-crawls CC-MAIN-2026-39,CC-MAIN-2026-34] [--crawls 2] [--cc-blocks 1500] [--cc-pages 60] [--domains file.csv]
//     [--domains-limit 3000] [--gap-ms 200] [--workers 4] [--max-minutes 300] [--gather-minutes 90] [--providers a,b]
//     [--only provider] [--resume prior-verdicts.jsonl[.gz]] [--out-dir discovery-out] [--merge]
import {
  type Candidate, ccDataCandidates, commonCrawlCandidates, guessesFromDomain, hnCandidates, keyOf, knownDead, mergeDirectory, PROVIDERS, robotsReport,
  SITEMAP_HOSTS, sitemapCandidates, tally, type VerdictRow, verifyCandidates, waybackCandidates, workdaySiteCandidates,
} from "./board_discovery.ts";
import { workdayParts } from "../../supabase/functions/_shared/career_ingest_feeds.ts";

const opt = (k: string, d?: string) => { const i = Deno.args.indexOf(k); return i >= 0 ? Deno.args[i + 1] : d; };
const flag = (k: string) => Deno.args.includes(k);
const root = new URL("../../", import.meta.url);
const started = Date.now();
const phase = opt("--phase", "all")!;
const outDir = opt("--out-dir", "discovery-out")!;
await Deno.mkdir(outDir, { recursive: true });
const dirPath = new URL("packages/career-data/board-directory.json", root);

async function readLines(path: string): Promise<string[]> {
  const bytes = await Deno.readFile(path);
  const text = path.endsWith(".gz") ? await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"))).text() : new TextDecoder().decode(bytes);
  return text.split("\n").filter((l) => l.trim());
}
const writeJsonl = (path: string, rows: unknown[]) => Deno.writeTextFile(path, rows.map((r) => JSON.stringify(r)).join("\n") + (rows.length ? "\n" : ""));

// ------------------------------------------------------------------------------------------------ gather
async function gather(deadline: number) {
  const sources = new Set(String(opt("--sources", "directory,candidates,ccdata,sitemaps")).split(","));
  const directory = JSON.parse(await Deno.readTextFile(dirPath));
  const cands: Candidate[] = [];
  const counts: Record<string, number> = {};
  const add = (c: Candidate) => { if (!PROVIDERS.includes(c.provider)) return; cands.push(c); counts[c.source.split(":")[0]] = (counts[c.source.split(":")[0]] ?? 0) + 1; };
  const extra: Record<string, unknown> = {};
  if (sources.has("directory")) for (const b of directory.boards) {
    if (!PROVIDERS.includes(b.provider)) continue;
    // A Workday entry recorded by tenant (WO-017) names its sites: each site is one board ("<tenant>.<wdN>/<site>").
    if (b.provider === "workday" && b.wd && Array.isArray(b.sites)) { for (const s of b.sites) add({ provider: "workday", slug: `${String(b.board_token).toLowerCase()}.${b.wd}/${s}`, source: "directory" }); continue; }
    add({ provider: b.provider, slug: String(b.board_token), source: "directory" });
  }
  if (sources.has("candidates")) {
    const c = JSON.parse(await Deno.readTextFile(new URL("packages/career-data/board-candidates.json", root)));
    for (const x of c.candidates) if (PROVIDERS.includes(x.provider) && x.provider !== "workday") add({ provider: x.provider, slug: String(x.token), source: "wo017-candidates", company_hint: x.company_hint });
  }
  const log = (s: string) => console.log(s);
  if (sources.has("diagnose")) {
    for (const r of await robotsReport(["index.commoncrawl.org", "data.commoncrawl.org", "web.archive.org", "api.smartrecruiters.com", ...SITEMAP_HOSTS, "apply.workable.com", "acme.bamboohr.com", "nvidia.wd5.myworkdayjobs.com"]))
      console.log(`ROBOTS ${r.host} ${r.status} ${r.text}`);
  }
  if (sources.has("hn")) {
    const r = await hnCandidates({ maxPages: Number(opt("--hn-pages", "40")), deadline, log });
    extra.hn = { requests: r.requests, errors: r.errors, blocked: !!r.blocked, by_query: r.by_query, slugs: r.candidates.length };
    console.log(`HN ${JSON.stringify(extra.hn)}`);
    for (const c of r.candidates) add(c);
  }
  if (sources.has("wayback")) {
    // Resumable (WO-044): an earlier run's resumption keys (packages/career-data/discovery-wayback-state.json on its
    // discovery branch) continue each query where it stopped; this run's keys are written for the next one.
    let resume: Record<string, { key: string | null; done: boolean }> | undefined;
    if (opt("--wb-state")) { try { resume = JSON.parse(await Deno.readTextFile(opt("--wb-state")!)); } catch { resume = undefined; } }
    const r = await waybackCandidates({ maxPages: Number(opt("--wb-pages", "60")), limit: Number(opt("--wb-limit", "5000")), filter: opt("--wb-filter", "roots") !== "none", deadline, log, resume });
    await Deno.writeTextFile(`${outDir}/wayback-state.json`, JSON.stringify(r.resume, null, 1) + "\n");
    extra.wayback_resumed = !!resume;
    extra.wayback = { pages: r.pages, errors: r.errors, blocked: !!r.blocked, by_query: r.by_query, slugs: r.candidates.length };
    console.log(`WAYBACK ${JSON.stringify(extra.wayback)}`);
    for (const c of r.candidates) add(c);
  }
  if (sources.has("ccdata")) {
    const crawls = String(opt("--cc-crawls", "CC-MAIN-2026-39,CC-MAIN-2026-34")).split(",").filter(Boolean);
    const r = await ccDataCandidates({ crawls, latest: Number(opt("--crawls", "2")), maxBlocks: Number(opt("--cc-blocks", "1500")), concurrency: 4, gapMs: 200, deadline, log });
    extra.ccdata = { crawls: r.crawls, blocks_read: r.blocks_read, blocks_skipped: r.blocks_skipped, mb: Math.round(r.bytes / 1e6), errors: r.errors, blocked: !!r.blocked, by_prefix: r.by_prefix, slugs: r.candidates.length };
    console.log(`CCDATA ${JSON.stringify(extra.ccdata)}`);
    for (const c of r.candidates) add(c);
  }
  if (sources.has("sitemaps")) {
    const r = await sitemapCandidates({ deadline, log });
    extra.sitemaps = { files: r.files, errors: r.errors, by_host: r.by_host, slugs: r.candidates.length };
    for (const c of r.candidates) add(c);
  }
  if (sources.has("commoncrawl")) {
    const r = await commonCrawlCandidates({ crawls: Number(opt("--crawls", "2")), maxPages: Number(opt("--cc-pages", "60")), deadline, log });
    extra.commoncrawl = { pages: r.pages, errors: r.errors, crawls: r.crawls, blocked: !!r.blocked };
    for (const c of r.candidates) add(c);
  }
  // Every Workday tenant found so far names its other career sites in its robots.txt.
  if (sources.has("workday-robots")) {
    const tenants = [...new Map(cands.filter((c) => c.provider === "workday").map((c) => workdayParts(c.slug)).filter((w): w is NonNullable<typeof w> => !!w).map((w) => [w.host, { tenant: w.tenant, wd: w.wd }])).values()];
    const r = await workdaySiteCandidates(tenants, { deadline: Math.max(deadline, Date.now() + 20 * 60000) });
    extra.workday_robots = { tenants: tenants.length, hosts_read: r.hosts, errors: r.errors, sites: r.candidates.length };
    console.log(`WORKDAY_ROBOTS ${JSON.stringify(extra.workday_robots)}`);
    for (const c of r.candidates) add(c);
  }
  if (sources.has("domains") && opt("--domains")) {
    const lines = (await Deno.readTextFile(opt("--domains")!)).split("\n").slice(0, Number(opt("--domains-limit", "3000")));
    for (const l of lines) {
      const domain = l.split(",").pop()!.trim();
      for (const slug of guessesFromDomain(domain)) for (const p of PROVIDERS) if (p !== "workday") add({ provider: p, slug, source: "domains", company_hint: domain });
    }
  }
  const unique = new Set(cands.map((c) => keyOf(c.provider, c.slug)));
  const perProvider: Record<string, number> = {};
  for (const k of unique) { const p = k.split(":")[0]; perProvider[p] = (perProvider[p] ?? 0) + 1; }
  const summary = { ...counts, unique_candidates: unique.size, unique_by_provider: perProvider, ...extra, gather_seconds: Math.round((Date.now() - started) / 1000) };
  console.log(`SOURCES ${JSON.stringify(summary)}`);
  return { cands, summary };
}

// ------------------------------------------------------------------------------------------------ verify
async function verify(cands: Candidate[], deadline: number) {
  const providers = opt("--providers") ? new Set(opt("--providers")!.split(",")) : opt("--only") ? new Set([opt("--only")!]) : null;
  let list = providers ? cands.filter((c) => providers.has(c.provider)) : cands;
  let skippedDead = 0;
  if (opt("--resume")) {
    try {
      const dead = knownDead((await readLines(opt("--resume")!)).map((l) => JSON.parse(l)));
      const before = list.length;
      list = list.filter((c) => !dead.has(keyOf(c.provider, c.slug)));
      skippedDead = before - list.length;
    } catch (e) { console.log(`RESUME unreadable (${(e as Error).message}): every candidate is probed`); }
  }
  const unique = new Set(list.map((c) => keyOf(c.provider, c.slug))).size;
  const partial = await Deno.open(`${outDir}/verdicts.partial.jsonl`, { write: true, create: true, truncate: true });
  const enc = new TextEncoder();
  let n = 0;
  const res = await verifyCandidates(list, {
    gapMs: Number(opt("--gap-ms", "200")), workersPerHost: Number(opt("--workers", "4")), deadline, retryErrors: true,
    onRow: (r) => { partial.writeSync(enc.encode(JSON.stringify(r) + "\n")); if (++n % 1000 === 0) console.log(`progress ${n}/${unique} ${Math.round((Date.now() - started) / 1000)}s`); },
  });
  partial.close();
  await writeJsonl(`${outDir}/verdicts.jsonl`, res.rows);
  const shard = { providers: providers ? [...providers] : "all", candidates: unique, probed: res.rows.length, unprobed_at_deadline: res.unprobed, retried: res.retried ?? 0,
    skipped_known_dead: skippedDead, calibration: res.calibration, seconds: Math.round((Date.now() - started) / 1000), live: res.rows.filter((r) => r.verdict === "live").length };
  await Deno.writeTextFile(`${outDir}/verify.json`, JSON.stringify(shard, null, 1) + "\n");
  console.log(`SHARD ${JSON.stringify(shard)}`);
  return { rows: res.rows, shard };
}

// ------------------------------------------------------------------------------------------------ merge
async function merge(rows: VerdictRow[], shards: any[], sources: unknown) {
  // One row per slug: the last one written wins (a retried row replaces its first answer).
  const byKey = new Map<string, VerdictRow>();
  for (const r of rows) byKey.set(keyOf(r.provider, r.slug), r);
  const all = [...byKey.values()];
  await writeJsonl(`${outDir}/verdicts.jsonl`, all);
  const t = tally(all);
  const calibration = Object.assign({}, ...shards.map((s) => s.calibration ?? {}));
  const unprobed = shards.reduce((a, s) => a + (s.unprobed_at_deadline ?? 0), 0);
  const candidates = shards.reduce((a, s) => a + (s.candidates ?? 0), 0);
  const skipped = shards.reduce((a, s) => a + (s.skipped_known_dead ?? 0), 0);
  const summary = { at: new Date().toISOString(), sources, shards: shards.map((s) => ({ providers: s.providers, candidates: s.candidates, probed: s.probed, unprobed: s.unprobed_at_deadline, live: s.live, seconds: s.seconds, retried: s.retried })),
    unique_candidates: candidates, probed: all.length, unprobed_at_deadline: unprobed, skipped_known_dead: skipped, calibration, ...t };
  await Deno.writeTextFile(`${outDir}/summary.json`, JSON.stringify(summary, null, 1) + "\n");
  console.log(`CALIBRATION ${JSON.stringify(calibration)}`);
  console.log(`TALLY ${JSON.stringify(t.by)}`);
  console.log(`CONDITIONAL ${JSON.stringify(t.conditional)}`);
  console.log(`BY_PROVIDER ${JSON.stringify(t.verified_by_provider)}`);
  console.log(`BY_SOURCE ${JSON.stringify({ verified: t.verified_by_source, probed: t.probed_by_source })}`);
  console.log(`VERIFIED ${t.verified_boards} boards answered 200 with the expected shape (${t.verified_supported} on providers ingest reads, ${t.verified_with_postings} with at least one posting) of ${candidates} candidates; ${unprobed} not probed before the deadline${skipped ? `; ${skipped} skipped as dead in the resumed run` : ""}`);
  if (flag("--merge")) {
    const directory = JSON.parse(await Deno.readTextFile(dirPath));
    const m = mergeDirectory(directory, all, new Date().toISOString().slice(0, 10), { verified_boards: t.verified_boards, unique_candidates: candidates, calibration });
    await Deno.writeTextFile(dirPath, JSON.stringify(m.directory, null, 1) + "\n");
    console.log(`MERGED added ${m.added}, refreshed ${m.refreshed}; live now ${m.directory.meta.live_supported}`);
  }
}

// ------------------------------------------------------------------------------------------------ the phases
const minutes = (k: string, d: string) => Number(opt(k, d)) * 60000;
if (phase === "gather") {
  const { cands, summary } = await gather(started + minutes("--max-minutes", "90"));
  await writeJsonl(`${outDir}/candidates.jsonl`, cands);
  await Deno.writeTextFile(`${outDir}/sources.json`, JSON.stringify(summary, null, 1) + "\n");
} else if (phase === "verify") {
  const cands = (await readLines(opt("--candidates", `${outDir}/candidates.jsonl`)!)).map((l) => JSON.parse(l) as Candidate);
  await verify(cands, started + minutes("--max-minutes", "270"));
} else if (phase === "merge") {
  const dir = opt("--verdicts-dir", outDir)!;
  const rows: VerdictRow[] = [], shards: any[] = [];
  let sources: unknown = null;
  for await (const f of walk(dir)) {
    const name = f.split("/").pop()!;
    if (name === "verify.json") shards.push(JSON.parse(await Deno.readTextFile(f)));
    else if (name === "sources.json") sources = JSON.parse(await Deno.readTextFile(f));
    else if (name === "verdicts.jsonl" && !f.startsWith(`${outDir}/verdicts.jsonl`)) for (const l of await readLines(f)) rows.push(JSON.parse(l));
  }
  // A shard cut off before it wrote verdicts.jsonl still left its rows in verdicts.partial.jsonl.
  for await (const f of walk(dir)) {
    if (!f.endsWith("/verdicts.partial.jsonl")) continue;
    const sib = f.replace(/verdicts\.partial\.jsonl$/, "verdicts.jsonl");
    try { await Deno.stat(sib); } catch { for (const l of await readLines(f)) rows.push(JSON.parse(l)); console.log(`PARTIAL ${f} used (its shard did not finish)`); }
  }
  await merge(rows, shards, sources);
} else {
  const deadline = started + minutes("--max-minutes", "300");
  const { cands, summary } = await gather(started + (deadline - started) / 3);
  const v = await verify(cands, deadline);
  await merge(v.rows, [v.shard], summary);
}

async function* walk(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory) yield* walk(p); else if (e.isFile) yield p;
  }
}
