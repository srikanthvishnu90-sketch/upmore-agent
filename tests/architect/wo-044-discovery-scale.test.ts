// WO-044 acceptance tests (architect-authored): discovery toward 50,000 boards. More candidate supply (Common Crawl's
// index files, the boards' own sitemaps), seven more providers, and throughput (a host that once said 429 recovers; a
// transient error is retried; the useful sources go before the guesses), with every WO-037 rule kept: a board counts
// only on 200 with its provider's shape, robots.txt first on every host, one pace per platform, Upmore named in every
// request, and the one POST is Workday's read-only search. Offline: the network is a fake; every fixture is hand-written
// from the providers' documented (or, where marked, observed-by-third-parties) public shapes, not recorded.
// Contract: docs/architect/work-orders/WO-044-discovery-scale.md
import {
  boardRoot, BlockSelector, ccDataCandidates, classify, commonCrawlCandidates, gibberishFor, HostPacer, keyOf, knownDead, laterCrawlNames,
  locsOf, mergeDirectory, parseClusterLine, parseRobots, planBlocks, probeRequest, PROVIDERS, selectBlocks, sitemapCandidates, slugFromUrl,
  sourceRank, splitResumeKey, SUPPORTED, surtToUrl, tally, urlOfCdxLine, urlsInHtml, USER_AGENT, verifyCandidates, waybackCandidates, waybackRootPattern,
  hnCandidates, workdaySiteCandidates, workdaySitesInRobots, type Candidate, type Net, type VerdictRow,
} from "../../scripts/career/board_discovery.ts";
import { INGEST_PROVIDERS } from "../../supabase/functions/_shared/career_ingest.ts";
import { FIX } from "./wo-044-fixtures.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

function fakeNet(routes: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  let t = 0;
  const calls: { url: string; at: number; ua: string | null; method: string; body: string | null; range: string | null }[] = [];
  const net: Net = {
    now: () => t, sleep: async (ms) => { t += ms; },
    fetch: (async (input: string | URL, init?: RequestInit) => {
      const url = String(input), h = new Headers(init?.headers);
      calls.push({ url, at: t, ua: h.get("user-agent"), method: init?.method ?? "GET", body: (init?.body as string) ?? null, range: h.get("range") });
      return await routes(url, init);
    }) as typeof fetch,
  };
  return { net, calls, advance: (ms: number) => { t += ms; } };
}
const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });
const xml = (s: string) => new Response(s, { status: 200, headers: { "content-type": "application/xml" } });
const gone = () => new Response("Not Found", { status: 404 });
const isRobots = (url: string) => new URL(url).pathname === "/robots.txt";
async function gzip(s: string): Promise<Uint8Array> {
  return new Uint8Array(await new Response(new Blob([new TextEncoder().encode(s)]).stream().pipeThrough(new CompressionStream("gzip"))).arrayBuffer());
}


Deno.test("WO-044/S1 slugs for the new providers come from their own URL shapes, never their own pages", () => {
  eq(slugFromUrl("https://acme.bamboohr.com/careers/42"), { provider: "bamboohr", slug: "acme" });
  eq(slugFromUrl("https://Acme-Group.teamtailor.com/jobs/31-x"), { provider: "teamtailor", slug: "acme-group" }, "a host label is case-free");
  eq(slugFromUrl("https://acme.breezy.hr/p/abc-support"), { provider: "breezy", slug: "acme" });
  eq(slugFromUrl("https://acme.jobs.personio.de/job/1234567"), { provider: "personio", slug: "acme" });
  eq(slugFromUrl("https://acme.jobs.personio.com/"), { provider: "personio", slug: "acme" });
  eq(slugFromUrl("https://nvidia.wd5.myworkdayjobs.com/NVIDIAExternalCareerSite/job/US-CA/Engineer_JR1"), { provider: "workday", slug: "nvidia.wd5/NVIDIAExternalCareerSite" });
  eq(slugFromUrl("https://nvidia.wd5.myworkdayjobs.com/en-US/NVIDIAExternalCareerSite"), { provider: "workday", slug: "nvidia.wd5/NVIDIAExternalCareerSite" }, "a locale is not the site");
  eq(slugFromUrl("https://acme.wd1.myworkdayjobs.com/wday/cxs/acme/External/jobs"), null, "Workday's own API path is not a site");
  eq(slugFromUrl("https://acme.wd1.myworkdayjobs.com/en-US"), null);
  for (const own of ["https://www.bamboohr.com/pricing", "https://app.teamtailor.com/", "https://app.breezy.hr/signin", "https://help.bamboohr.com/x", "https://www.myworkdayjobs.com/"])
    eq(slugFromUrl(own), null, `${own} is the provider's own site`);
  assert(SUPPORTED.size === PROVIDERS.length, "every provider discovery verifies is one ingest reads");
  eq([...PROVIDERS].sort(), [...INGEST_PROVIDERS].sort(), "discovery and ingest name the same providers");
});

Deno.test("WO-044/S2 only 200 with the provider's own shape is a board, for every new provider", () => {
  eq(classify("bamboohr", 200, FIX.bamboohr), { verdict: "live", postings: 1, name: null });
  eq(classify("bamboohr", 200, { result: [] }).verdict, "error", "BambooHR's list carries meta; a bare list is not its shape");
  eq(classify("breezy", 200, FIX.breezy).verdict, "live");
  eq(classify("breezy", 200, [{ title: "x" }]).verdict, "error", "Breezy positions carry id and name");
  eq(classify("breezy", 200, []), { verdict: "live", postings: 0, name: null }, "an empty board is a board (its gibberish twin decides whether zero proves anything)");
  eq(classify("breezy", 200, [], true).verdict, "unverifiable");
  eq(classify("workday", 200, FIX.workday), { verdict: "live", postings: 1, name: null });
  eq(classify("workday", 200, { jobPostings: [] }).verdict, "error", "Workday's search answers a total");
  eq(classify("workday", 422, undefined).verdict, "error");
  eq(classify("personio", 200, undefined).verdict, "error", "an HTML 200 (not the XML feed) is not a board");
});

Deno.test("WO-044/S3 the XML feeds are read as XML; HTML at the same address is not a board", async () => {
  const { net } = fakeNet((url) => {
    if (isRobots(url)) return gone();
    if (url.includes("zzqx")) return gone();
    if (url === "https://acme.teamtailor.com/jobs.rss") return xml(FIX.teamtailor as string);
    if (url === "https://acme.jobs.personio.de/xml") return xml(FIX.personio as string);
    if (url === "https://htmlco.jobs.personio.de/xml") return new Response("<!doctype html><html><body>Jobs</body></html>", { status: 200 });
    if (url === "https://empty.teamtailor.com/jobs.rss") return xml(`<?xml version="1.0"?><rss version="2.0"><channel><title>Empty</title></channel></rss>`);
    return gone();
  });
  const r = await verifyCandidates([
    { provider: "teamtailor", slug: "acme", source: "ccdata" }, { provider: "teamtailor", slug: "empty", source: "ccdata" },
    { provider: "personio", slug: "acme", source: "ccdata" }, { provider: "personio", slug: "htmlco", source: "ccdata" },
  ], { net });
  const v = Object.fromEntries(r.rows.map((x) => [`${x.provider}:${x.slug}`, [x.verdict, x.postings]]).sort((a, b) => b[0] < a[0] ? 1 : -1));
  eq(v, { "personio:acme": ["live", 1], "personio:htmlco": ["error", null], "teamtailor:acme": ["live", 1], "teamtailor:empty": ["live", 0] });
});

Deno.test("WO-044/S4 every probe is a GET but Workday's, which is its read-only search: a POST asking for one posting", async () => {
  const { net, calls } = fakeNet((url, init) => {
    if (isRobots(url)) return new Response("User-agent: *\nAllow: /\n");
    if (url.includes("zzqx")) return gone();
    if (url.endsWith("/wday/cxs/acme/External/jobs") && init?.method === "POST") return json(FIX.workday);
    if (url.includes("bamboohr.com/careers/list")) return json(FIX.bamboohr);
    return gone();
  });
  const r = await verifyCandidates([{ provider: "workday", slug: "acme.wd1/External", source: "ccdata" }, { provider: "bamboohr", slug: "acme", source: "ccdata" }], { net });
  eq(r.rows.map((x) => `${x.provider}:${x.verdict}`).sort(), ["bamboohr:live", "workday:live"]);
  const posts = calls.filter((c) => c.method !== "GET");
  assert(posts.length >= 1 && posts.every((c) => c.method === "POST" && /^https:\/\/[a-z0-9-]+\.wd\d+\.myworkdayjobs\.com\/wday\/cxs\/[^/]+\/[^/]+\/jobs$/.test(c.url)), `only Workday's search is a POST: ${JSON.stringify(posts.map((c) => c.url))}`);
  for (const p of posts) eq(JSON.parse(p.body!), { appliedFacets: {}, limit: 1, offset: 0, searchText: "" }, "the body only asks for one posting");
  eq(r.calibration.workday.verdict, "dead", "Workday is calibrated with a made-up site on a real tenant");
  eq(gibberishFor("workday", "acme.wd1/External"), "acme.wd1/zzqx-not-a-board-7f3k");
  eq(probeRequest("greenhouse", "acme").method, "GET");
  assert(calls.every((c) => c.ua === USER_AGENT), "every request names Upmore");
  const robotsFirst = (host: string) => calls.findIndex((c) => new URL(c.url).host === host);
  for (const h of new Set(calls.map((c) => new URL(c.url).host))) assert(calls[robotsFirst(h)].url.endsWith("/robots.txt"), `${h}: robots.txt first`);
});

Deno.test("WO-044/S5 a host that said 429 recovers its pace (run 39345730265 stalled Workable at 60 s for good)", async () => {
  const p = new HostPacer({ gapMs: 200, now: () => 0, sleep: async () => {} });
  p.backoff("h", null); p.backoff("h", null); p.backoff("h", 30);
  assert(p.gapFor("h") >= 30000, "Retry-After honored");
  for (let i = 0; i < 200; i++) p.relax("h");
  eq(p.gapFor("h"), 200, "answers that are not 429 ease the gap back to its floor");
  p.setFloor("slow", 2000);
  p.backoff("slow", null);
  for (let i = 0; i < 200; i++) p.relax("slow");
  eq(p.gapFor("slow"), 2000, "never below a robots Crawl-delay");
  // End to end: 300 slugs, the first five answers are 429. Every slug is still probed inside a 20-minute budget.
  let n = 0;
  const { net, calls } = fakeNet((url) => {
    if (isRobots(url)) return gone();
    if (url.includes("zzqx")) return gone();
    return ++n <= 5 ? new Response("slow", { status: 429 }) : json({ name: "X", jobs: [] });
  });
  const cands: Candidate[] = Array.from({ length: 300 }, (_, i) => ({ provider: "workable", slug: `co${i}`, source: "ccdata" }));
  // One worker: the fake clock moves only when a caller sleeps, so gaps are measurable one request at a time.
  const r = await verifyCandidates(cands, { net, deadline: 20 * 60000, workersPerHost: 1 });
  eq(r.unprobed, 0, "nothing left unprobed");
  const api = calls.filter((c) => !isRobots(c.url));
  const gaps = api.slice(1).map((c, i) => c.at - api[i].at);
  assert(gaps.every((g) => g >= 200), `one request per 200 ms at most: min gap ${Math.min(...gaps)}`);
  // A host that says "come back in an hour" near the deadline: nobody waits past the deadline for it.
  const late = fakeNet((url) => (isRobots(url) || url.includes("zzqx") ? gone() : new Response("later", { status: 429, headers: { "retry-after": "3600" } })));
  const lr = await verifyCandidates(Array.from({ length: 20 }, (_, i) => ({ provider: "workable" as const, slug: `w${i}`, source: "ccdata" })), { net: late.net, deadline: 60000, workersPerHost: 1 });
  assert(late.net.now() <= 60000 + 15000, `stopped at the deadline, not after the back-off (clock ${late.net.now()})`);
  assert(lr.unprobed > 0 && lr.rows.length + lr.unprobed === 20, "the rest are counted as not probed");
});

Deno.test("WO-044/S6 a transient error gets one more probe at the end; robots that cannot be read stop the probe", async () => {
  let tries = 0;
  const { net, calls } = fakeNet((url) => {
    if (url === "https://down.recruitee.com/robots.txt") throw new TypeError("dns error");
    if (isRobots(url)) return gone();
    if (url.includes("zzqx")) return gone();
    if (url.includes("/boards/flaky/")) return ++tries === 1 ? new Response("oops", { status: 502 }) : json({ jobs: [{}] });
    return gone();
  });
  const r = await verifyCandidates([{ provider: "greenhouse", slug: "flaky", source: "ccdata" }, { provider: "recruitee", slug: "down", source: "ccdata" }], { net, retryErrors: true });
  const by = Object.fromEntries(r.rows.map((x) => [x.slug, x]));
  eq(by.flaky.verdict, "live", "the 502 was retried once and the second answer counts");
  eq(r.retried, 1);
  eq([by.down.verdict, by.down.error], ["error", "robots.txt unreachable (no request made)"]);
  assert(!calls.some((c) => c.url.startsWith("https://down.recruitee.com/api")), "no API request to a host whose robots.txt could not be read");
});

Deno.test("WO-044/S7 the sources that find boards go first; slug guesses go last and are what a deadline cuts", async () => {
  assert(sourceRank("directory") < sourceRank("ccdata:CC-MAIN-2026-39") && sourceRank("ccdata:x") < sourceRank("domains") && sourceRank("sitemaps:x") < sourceRank("domains"));
  const { net } = fakeNet((url) => (isRobots(url) || url.includes("zzqx") ? gone() : json({ jobs: [] })));
  const cands: Candidate[] = [
    ...Array.from({ length: 50 }, (_, i) => ({ provider: "ashby" as const, slug: `guess${i}`, source: "domains" })),
    ...Array.from({ length: 50 }, (_, i) => ({ provider: "ashby" as const, slug: `real${i}`, source: "ccdata:CC-MAIN-2026-39" })),
  ];
  // 60 probes' worth of time (one per 200 ms, 1 worker, the robots read and calibration first).
  const r = await verifyCandidates(cands, { net, deadline: 62 * 200, workersPerHost: 1 });
  assert(r.rows.filter((x) => x.source.startsWith("ccdata")).length === 50, "every Common Crawl slug was probed");
  assert(r.unprobed > 0 && r.rows.filter((x) => x.source === "domains").length < 50, "the guesses took the cut");
});

Deno.test("WO-044/S8 the index server: no path its robots.txt disallows is requested, collinfo.json included", async () => {
  const { net, calls } = fakeNet((url) => (isRobots(url) ? new Response("User-agent: *\nDisallow: /\n") : json([{ id: "CC-MAIN-2026-39" }])));
  const r = await commonCrawlCandidates({ net, crawls: 1 });
  eq([r.candidates.length, r.blocked], [0, true]);
  eq(calls.map((c) => new URL(c.url).pathname), ["/robots.txt"], "collinfo.json was not read (WO-037 read it before checking)");
});

Deno.test("WO-044/S9 Common Crawl's index files: SURT keys, board roots, cluster.idx lines and the blocks worth reading", () => {
  eq(surtToUrl("com,ashbyhq,jobs)/ramp/1?x=1"), "https://jobs.ashbyhq.com/ramp/1?x=1");
  eq(surtToUrl("com,recruitee,acme:443)/o/x"), "https://acme.recruitee.com/o/x");
  eq(surtToUrl("garbage"), null);
  eq(boardRoot("io,greenhouse,boards)/acme/jobs/1"), "io,greenhouse,boards)/acme/");
  eq(boardRoot("io,greenhouse,boards)/acme"), null, "no delimiter after the slug: its block may run into acme-corp");
  eq(boardRoot("com,recruitee,acme)/o/x"), "com,recruitee,acme)");
  eq(boardRoot("com,myworkdayjobs,wd5,nvidia)/en-us/site/job/x"), "com,myworkdayjobs,wd5,nvidia)/en-us/site/");
  eq(boardRoot("io,greenhouse,boards)/embed/job_board?for=x"), null, "the provider's own page names no board root");
  eq(parseClusterLine("co,lever,jobs)/acme/1 20260915000000\tcdx-00042.gz\t1234\t567\t89"), { key: "co,lever,jobs)/acme/1", file: "cdx-00042.gz", offset: 1234, length: 567 });
  eq(parseClusterLine("co,lever,jobs)/acme/1 2026\tnot-a-shard\t1\t2\t3"), null);
  const L = (k: string, off: number) => `${k} 20260915000000\tcdx-00001.gz\t${off}\t100\t${off}`;
  const lines = [L("co,kitchen)/", 0), L("co,lever,jobs)/aa/1", 100), L("co,lever,jobs)/aa/9", 200), L("co,lever,jobs)/bb/1", 300), L("co,lever,jobs)/zz/1", 400), L("co,lever,jobsx)/", 500),
    L("com,a)/", 600), L("com,c)/", 700)];
  const sel = selectBlocks(lines, ["co,lever,jobs)/", "com,b,"]);
  eq(sel.get("co,lever,jobs)/")!.map((b) => b.offset), [0, 100, 200, 300, 400, 500], "the block before, every block inside, the block after");
  eq(sel.get("com,b,")!.map((b) => b.offset), [600, 700], "a prefix with no block starting inside it: the one block that holds it, and its end");
  const plan = planBlocks(sel.get("co,lever,jobs)/")!, 100);
  eq(plan.read.map((b) => b.offset), [0, 200, 300, 400], "the block from aa/1 to aa/9 holds only aa and is not read");
  eq(plan.skipped, 1);
  eq(planBlocks(sel.get("co,lever,jobs)/")!, 2).read.length, 2, "thinned evenly to the cap");
  const s = new BlockSelector(["com,b,"]);
  for (const l of lines) s.push(l);
  eq(s.out.get("com,b,")!.length, 2, "the streaming selector agrees");
  eq(urlOfCdxLine('co,lever,jobs)/acme/1 20260915000000 {"url": "https://jobs.lever.co/Acme/1", "status": "200"}'), "https://jobs.lever.co/Acme/1", "the URL keeps its case");
  eq(laterCrawlNames(["CC-MAIN-2026-39", "CC-MAIN-2026-34"], Date.UTC(2026, 9, 20)), ["CC-MAIN-2026-42", "CC-MAIN-2026-41", "CC-MAIN-2026-40"]);
});

Deno.test("WO-044/S10 Common Crawl's index files end to end: robots first, a HEAD for newer crawls, ranges only, a 200 never read", async () => {
  const blockA = await gzip([
    'co,lever,jobs)/alpha/1 20260915000000 {"url": "https://jobs.lever.co/alpha/1"}',
    'co,lever,jobs)/alpha/2 20260915000000 {"url": "https://jobs.lever.co/alpha/2"}',
    'co,lever,jobs)/betaco/1 20260915000000 {"url": "https://jobs.lever.co/BetaCo/1"}',
    'co,lever,jobs)/gamma 20260915000000 {"url": "https://jobs.lever.co/gamma"}',
  ].join("\n") + "\n");
  const blockB = await gzip('com,recruitee,delta)/o/x 20260915000000 {"url": "https://delta.recruitee.com/o/x"}\n');
  const emptyBlock = await gzip("");
  const idx = [
    `co,kitchen)/ 20260915000000\tcdx-00001.gz\t0\t10\t1`,
    `co,lever,jobs)/alpha/1 20260915000000\tcdx-00001.gz\t1000\t${blockA.length}\t2`,
    `co,lever,jobs)/zulu/1 20260915000000\tcdx-00001.gz\t5000\t10\t3`,
    `co,lever,jobsx)/ 20260915000000\tcdx-00001.gz\t6000\t10\t4`,
    `com,recruitee,delta)/o/x 20260915000000\tcdx-00002.gz\t0\t${blockB.length}\t5`,
    `com,recruitee,omega)/ 20260915000000\tcdx-00002.gz\t9000\t10\t6`,
    `com,s)/ 20260915000000\tcdx-00002.gz\t9500\t10\t7`,
  ].join("\n") + "\n";
  const { net, calls } = fakeNet((url, init) => {
    const u = new URL(url), range = new Headers(init?.headers).get("range");
    if (u.pathname === "/robots.txt") return gone();
    if (init?.method === "HEAD") return new Response(null, { status: u.pathname.includes("2026-40") ? 200 : 404 });
    if (u.pathname.endsWith("/cluster.idx")) return new Response(idx);
    if (!range) return new Response("whole shard", { status: 200 });
    const [a] = range.replace("bytes=", "").split("-").map(Number);
    if (u.pathname.endsWith("cdx-00001.gz") && a === 1000) return new Response(blockA, { status: 206 });
    if (u.pathname.endsWith("cdx-00002.gz") && a === 0) return new Response(blockB, { status: 206 });
    if (a === 5000) return new Response("whole shard", { status: 200 }); // a server that ignores Range
    return new Response(emptyBlock, { status: 206 });
  });
  const r = await ccDataCandidates({ net, crawls: ["CC-MAIN-2026-39"], latest: 1, now: Date.UTC(2026, 9, 1), prefixes: [{ provider: "lever", surt: "co,lever,jobs)/" }, { provider: "recruitee", surt: "com,recruitee," }] });
  eq(r.crawls, ["CC-MAIN-2026-40"], "a newer crawl found with a HEAD is read first");
  eq(r.candidates.map((c) => `${c.provider}:${c.slug}`).sort(), ["lever:BetaCo", "lever:alpha", "lever:gamma", "lever:zulu", "recruitee:delta", "recruitee:omega"], "BetaCo keeps the case of the captured URL");
  eq(calls[0].url, "https://data.commoncrawl.org/robots.txt", "robots.txt first");
  const shards = calls.filter((c) => /cdx-\d+\.gz$/.test(c.url));
  assert(shards.length > 0 && shards.every((c) => c.range && /^bytes=\d+-\d+$/.test(c.range!)), "every shard request is a byte range");
  assert(r.errors >= 1, "the 200 (whole shard) was counted an error, not read");
  assert(calls.every((c) => c.ua === USER_AGENT && (c.method === "GET" || c.method === "HEAD")), "GET and HEAD only, Upmore named");
  const disallow = fakeNet((url) => (isRobots(url) ? new Response("User-agent: *\nDisallow: /cc-index/\n") : new Response(idx)));
  const blocked = await ccDataCandidates({ net: disallow.net, crawls: ["CC-MAIN-2026-39"] });
  eq([blocked.blocked, disallow.calls.length], [true, 1], "a robots.txt that disallows the index files stops the source after one request");
});

Deno.test("WO-044/S11 sitemaps: robots names them, an index leads to its files, a gzipped file is read, robots obeyed", async () => {
  const child = await gzip(`<?xml version="1.0"?><urlset><url><loc>https://jobs.ashbyhq.com/ramp/123</loc></url><url><loc>https://jobs.ashbyhq.com/Notion</loc></url><url><loc>https://jobs.ashbyhq.com/api/x</loc></url></urlset>`);
  const { net, calls } = fakeNet((url) => {
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow: /private\nSitemap: https://jobs.ashbyhq.com/sitemap-index.xml\n");
    if (u.pathname === "/sitemap-index.xml") return xml(`<sitemapindex><sitemap><loc>https://jobs.ashbyhq.com/s1.xml.gz</loc></sitemap><sitemap><loc>https://jobs.ashbyhq.com/private/s2.xml</loc></sitemap></sitemapindex>`);
    if (u.pathname === "/s1.xml.gz") return new Response(child, { status: 200 });
    return gone();
  });
  const r = await sitemapCandidates({ net, hosts: ["jobs.ashbyhq.com"] });
  eq(r.candidates.map((c) => c.slug).sort(), ["Notion", "ramp"]);
  assert(!calls.some((c) => c.url.includes("/private/")), "a disallowed sitemap is not read");
  eq(locsOf("<urlset><url><loc><![CDATA[https://a.b/c?x=1&amp;y=2]]></loc></url></urlset>").locs, ["https://a.b/c?x=1&y=2"]);
  assert(parseRobots("Sitemap: https://x.y/s.xml\nUser-agent: *\nDisallow: /\n").sitemaps!.length === 1);
});

Deno.test("WO-044/S12 merging: every verified board is watched; a recorded-but-unread board becomes live once verified; tallies by provider and source", () => {
  const row = (provider: VerdictRow["provider"], slug: string, verdict: VerdictRow["verdict"], source = "ccdata:CC-MAIN-2026-39", postings = 3): VerdictRow =>
    ({ provider, slug, source, verdict, http: verdict === "live" ? 200 : 404, postings: verdict === "live" ? postings : null, board_name: null });
  const dir = { meta: {}, boards: [{ company: "Acme", provider: "workable", board_token: "acme", status: "discovered_unsupported", postings_seen: 1, last_verified: "2026-10-01", source: "wo037-domains" }] };
  const rows = [row("workable", "acme", "live"), row("teamtailor", "beta", "live"), row("workday", "gamma.wd3/External", "live", "directory", 0), row("bamboohr", "nope", "dead")];
  const m = mergeDirectory(dir, rows, "2026-10-20");
  eq(m.directory.boards.map((b: any) => `${b.provider}:${b.board_token}:${b.status}:${b.company}`),
    ["workable:acme:live:Acme", "teamtailor:beta:live:beta", "workday:gamma.wd3/External:live:gamma"]);
  eq([m.added, m.refreshed], [2, 1]);
  const t = tally(rows);
  eq(t.verified_by_provider, { workable: 1, teamtailor: 1, workday: 1 });
  eq(t.verified_by_source, { ccdata: 2, directory: 1 });
  eq(t.verified_with_postings, 2);
  eq([...knownDead(rows)], [keyOf("bamboohr", "nope")], "resuming skips only what was dead");
});

Deno.test("WO-044/S13 the merge phase: shards' verdicts become one summary with the VERIFIED line, and nothing is invented", async () => {
  const dir = await Deno.makeTempDir();
  const out = await Deno.makeTempDir();
  const w = (p: string, s: string) => Deno.mkdir(p.replace(/\/[^/]+$/, ""), { recursive: true }).then(() => Deno.writeTextFile(p, s));
  const r = (provider: string, slug: string, verdict: string) => JSON.stringify({ provider, slug, source: "ccdata:x", verdict, http: verdict === "live" ? 200 : 404, postings: verdict === "live" ? 2 : null, board_name: null });
  await w(`${dir}/verdicts-lever/lever/verdicts.jsonl`, [r("lever", "a", "live"), r("lever", "b", "dead")].join("\n") + "\n");
  await w(`${dir}/verdicts-lever/lever/verify.json`, JSON.stringify({ providers: ["lever"], candidates: 3, probed: 2, unprobed_at_deadline: 1, calibration: { lever: { http: 404, verdict: "dead" } }, live: 1 }));
  // A shard cut off before it finished: only its partial file.
  await w(`${dir}/verdicts-workday/workday/verdicts.partial.jsonl`, [r("workday", "t.wd1/S", "live")].join("\n") + "\n");
  await w(`${dir}/gather/sources.json`, JSON.stringify({ unique_candidates: 4 }));
  const cmd = new Deno.Command(Deno.execPath(), { args: ["run", "-A", "--no-check", new URL("../../scripts/career/discover-boards.ts", import.meta.url).pathname, "--phase", "merge", "--verdicts-dir", dir, "--out-dir", out], stdout: "piped", stderr: "piped" });
  const res = await cmd.output();
  const text = new TextDecoder().decode(res.stdout);
  assert(res.success, new TextDecoder().decode(res.stderr));
  assert(/^VERIFIED 2 boards answered 200 with the expected shape/m.test(text), text);
  assert(/^PARTIAL /m.test(text), "a partial shard is named");
  const summary = JSON.parse(await Deno.readTextFile(`${out}/summary.json`));
  eq([summary.verified_boards, summary.unprobed_at_deadline, summary.verified_by_provider], [2, 1, { lever: 1, workday: 1 }]);
});

Deno.test("WO-044/S14 the Wayback Machine: robots first, a board-page filter, paged by the server's resumption key, round-robin", async () => {
  const pages: Record<string, string[]> = {
    "jobs.lever.co/": ["http://jobs.lever.co:80/acme\nhttps://jobs.lever.co/Beta?lever-source=x\n\nKEY1", "https://jobs.lever.co/gamma/\n"],
    "teamtailor.com": ["https://delta.teamtailor.com/\nhttps://www.teamtailor.com/en\n"],
  };
  const { net, calls } = fakeNet((url) => {
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return gone();
    const q = u.searchParams.get("url")!, key = u.searchParams.get("resumeKey");
    return new Response(pages[q][key ? 1 : 0]);
  });
  const r = await waybackCandidates({ net, queries: [{ provider: "lever", url: "jobs.lever.co/", matchType: "prefix" }, { provider: "teamtailor", url: "teamtailor.com", matchType: "domain" }], gapMs: 2000 });
  eq(r.candidates.map((c) => `${c.provider}:${c.slug}`).sort(), ["lever:Beta", "lever:acme", "lever:gamma", "teamtailor:delta"]);
  eq(calls[0].url, "https://web.archive.org/robots.txt");
  const cdx = calls.slice(1).map((c) => new URL(c.url));
  eq(cdx.map((u) => [u.searchParams.get("url"), u.searchParams.get("resumeKey")]), [["jobs.lever.co/", null], ["teamtailor.com", null], ["jobs.lever.co/", "KEY1"]], "page 1 of every query before page 2 of any");
  for (const u of cdx) {
    eq([u.searchParams.get("collapse"), u.searchParams.get("showResumeKey"), u.searchParams.get("fl")], ["urlkey", "true", "original"]);
    assert(/^original:/.test(u.searchParams.get("filter")!), "a board-page filter");
  }
  for (let i = 2; i < calls.length; i++) assert(calls[i].at - calls[i - 1].at >= 2000, "one request per 2 s");
  const lever = new RegExp(`^${waybackRootPattern({ provider: "lever", url: "jobs.lever.co/", matchType: "prefix" })}$`);
  assert(lever.test("https://jobs.lever.co/acme") && lever.test("http://jobs.lever.co:80/acme/") && !lever.test("https://jobs.lever.co/acme/123-uuid"), "one path segment");
  assert(!lever.test("https://jobs.lever.co/acme?lever-source=x"), "no query-string variants (they filled the pages)");
  const wd = new RegExp(`^${waybackRootPattern({ provider: "workday", url: "myworkdayjobs.com", matchType: "domain" })}$`);
  assert(wd.test("https://acme.wd5.myworkdayjobs.com/en-US/External") && !wd.test("https://acme.wd5.myworkdayjobs.com/External/job/x"));
  eq(splitResumeKey("a\nb\n\nKEY\n"), { lines: ["a", "b"], resumeKey: "KEY" });
  eq(splitResumeKey("a\nb\n"), { lines: ["a", "b"], resumeKey: null });
  const disallowed = fakeNet((url) => (isRobots(url) ? new Response("User-agent: *\nDisallow: /cdx/\n") : new Response("x")));
  const b = await waybackCandidates({ net: disallowed.net, queries: [{ provider: "lever", url: "jobs.lever.co/", matchType: "prefix" }] });
  eq([b.blocked, disallowed.calls.length], [true, 1], "a disallowing robots.txt stops it after one request");
  eq(r.resume, { "jobs.lever.co/": { key: "KEY1", done: true, limit: 5000 }, "teamtailor.com": { key: null, done: true, limit: 5000 } }, "both read to their last page");
  // A query that times out asks for half as many lines a page next time (a heavy query: mostly postings).
  let tries = 0;
  const slow = fakeNet((url) => (isRobots(url) ? gone() : ++tries <= 2 ? new Response("busy", { status: 503 }) : new Response("https://jobs.lever.co/eta\n")));
  const s = await waybackCandidates({ net: slow.net, maxPages: 5, queries: [{ provider: "lever", url: "jobs.lever.co/", matchType: "prefix" }] });
  eq(slow.calls.filter((c) => !isRobots(c.url)).map((c) => new URL(c.url).searchParams.get("limit")), ["5000", "2500", "1250"]);
  eq(s.candidates.map((x) => x.slug), ["eta"]);
  // Resuming: a query cut off last run continues from its key; one finished last run starts over.
  const again = fakeNet((url) => (isRobots(url) ? gone() : new Response(new URL(url).searchParams.get("resumeKey") === "K7" ? "https://jobs.lever.co/zeta\n\nK8" : "https://jobs.lever.co/acme\n")));
  const c = await waybackCandidates({ net: again.net, maxPages: 1, queries: [{ provider: "lever", url: "jobs.lever.co/", matchType: "prefix" }], resume: { "jobs.lever.co/": { key: "K7", done: false } } });
  eq([c.candidates.map((x) => x.slug), c.resume], [["zeta"], { "jobs.lever.co/": { key: "K8", done: false, limit: 5000 } }], "continued from K7; K8 kept for the next run");
});

Deno.test("WO-044/S15 Hacker News search: comment links become candidates, paged back in time, robots first", async () => {
  const hit = (t: number, html: string) => ({ created_at_i: t, comment_text: html, objectID: String(t) });
  const { net, calls } = fakeNet((url) => {
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return gone();
    const before = Number(/created_at_i<(\d+)/.exec(u.searchParams.get("numericFilters")!)![1]);
    if (before > 2000) return json({ hits: [hit(2000, `Apply: <a href="https:&#x2F;&#x2F;jobs.lever.co&#x2F;acme">here</a>`), ...Array.from({ length: 999 }, (_, i) => hit(3000 + i, "no link"))] });
    return json({ hits: [hit(1500, "see https://boards.greenhouse.io/beta/jobs/1, or https://acme.wd1.myworkdayjobs.com/en-US/External.")] });
  });
  const r = await hnCandidates({ net, queries: ["jobs.lever.co"], now: 10_000_000 });
  eq(r.candidates.map((c) => `${c.provider}:${c.slug}`).sort(), ["greenhouse:beta", "lever:acme", "workday:acme.wd1/External"]);
  eq(calls.filter((c) => !isRobots(c.url)).length, 2, "a full page leads to the next one back in time; a short page ends it");
  eq(urlsInHtml("x https:&#x2F;&#x2F;apply.workable.com&#x2F;acme&#x2F;, y"), ["https://apply.workable.com/acme/"]);
});

Deno.test("WO-044/S16 Workday: a tenant's robots.txt names its other career sites; only allowed sites count", async () => {
  eq(workdaySitesInRobots("Sitemap: https://x/siteMap.xml\nUser-agent: *\nAllow: /NVIDIAExternalCareerSite/\nAllow: /en-US/\nAllow: /wday/\nDisallow: /NVIDIAResearch/\nAllow: /Interns\n"), ["NVIDIAExternalCareerSite", "Interns"]);
  const { net, calls } = fakeNet((url) => (url === "https://nvidia.wd5.myworkdayjobs.com/robots.txt" ? new Response("User-agent: *\nAllow: /NVIDIAExternalCareerSite/\nAllow: /Interns/\n") : gone()));
  const r = await workdaySiteCandidates([{ tenant: "nvidia", wd: "wd5" }, { tenant: "nvidia", wd: "wd5" }, { tenant: "acme", wd: "wd1" }], { net });
  eq(r.candidates.map((c) => c.slug).sort(), ["nvidia.wd5/Interns", "nvidia.wd5/NVIDIAExternalCareerSite"]);
  eq(calls.length, 2, "one robots read per tenant host");
  assert(calls.every((c) => c.ua === USER_AGENT && c.method === "GET"));
});
