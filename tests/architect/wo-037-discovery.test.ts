// WO-037 acceptance tests (architect-authored): board discovery at scale. A slug counts only when its provider's public
// API answered 200 with the expected JSON shape; robots.txt is read and obeyed per host; requests to one host are paced
// and back off on 429; every request names Upmore with a contact URL; and no fetch code anywhere names a LinkedIn or
// Indeed host. Offline: the network is a fake. Contract: docs/architect/work-orders/WO-037-discovery-at-scale.md
import {
  classify, commonCrawlCandidates, guessesFromDomain, HostPacer, mergeDirectory, parseRobots, robotsFromResponse, slugFromUrl,
  slugsFromCdx, tally, USER_AGENT, verifyCandidates, type Candidate, type Net,
} from "../../scripts/career/board_discovery.ts";

function assert(v: unknown, m = "assertion failed"): asserts v { if (!v) throw new Error(m); }
function eq(a: unknown, b: unknown, m = "") { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) throw new Error(`${m}\n  got:  ${x}\n  want: ${y}`); }

// A fake internet: a map from URL to answer; a virtual clock that sleep advances; every request recorded.
function fakeNet(routes: (url: string) => Response | Promise<Response>) {
  let t = 0;
  const calls: { url: string; at: number; ua: string | null }[] = [];
  const net: Net = {
    now: () => t, sleep: async (ms) => { t += ms; },
    fetch: (async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, at: t, ua: new Headers(init?.headers).get("user-agent") });
      return await routes(url);
    }) as typeof fetch,
  };
  return { net, calls };
}
const json = (v: unknown, status = 200, headers: Record<string, string> = {}) => new Response(JSON.stringify(v), { status, headers: { "content-type": "application/json", ...headers } });
const gone = () => new Response("Not Found", { status: 404 });
const robotsOk = (url: string) => (new URL(url).pathname === "/robots.txt" ? new Response("User-agent: *\nAllow: /\n") : null);

Deno.test("WO-037/D1 only 200 with the provider's own shape is a board: a 404, an HTML 200, a wrong shape and a timeout are not", () => {
  eq(classify("greenhouse", 200, { jobs: [{}, {}], name: "Acme" }), { verdict: "live", postings: 2, name: "Acme" });
  eq(classify("greenhouse", 404, { jobs: [] }).verdict, "dead", "a 404 is never a board, whatever its body");
  eq(classify("lever", 404, []).verdict, "dead");
  eq(classify("ashby", 410, undefined).verdict, "dead");
  eq(classify("greenhouse", 200, undefined).verdict, "error", "a 200 HTML page (body not JSON) is not a board");
  eq(classify("lever", 200, { jobs: [] }).verdict, "error", "Lever answers a list; an object is the wrong shape");
  eq(classify("ashby", 301, { jobs: [] }).verdict, "error", "a redirect is not a board");
  eq(classify("greenhouse", 0, undefined).verdict, "error", "no answer (timeout) is not a verdict either way");
  eq(classify("greenhouse", 500, { jobs: [] }).verdict, "error");
  eq(classify("workable", 200, { jobs: [] }).verdict, "error", "Workable's widget names the account; without a name it is not its shape");
  eq(classify("workable", 200, { name: "Acme", jobs: [{}] }).verdict, "live");
  eq(classify("recruitee", 200, { offers: [{}, {}, {}] }), { verdict: "live", postings: 3, name: null });
  eq(classify("smartrecruiters", 200, { content: [], totalFound: 0 }, true).verdict, "unverifiable", "SmartRecruiters answers 200 for any name: zero proves nothing");
  eq(classify("smartrecruiters", 200, { content: [{}], totalFound: 12 }, true), { verdict: "live", postings: 12, name: null });
  eq(classify("lever", 200, []), { verdict: "live", postings: 0, name: null }, "a real board with no openings today is still a board (its gibberish twin 404s)");
});

Deno.test("WO-037/D2 the verify run: calibration first, robots read, one GET per slug, only verified rows become directory entries", async () => {
  const { net, calls } = fakeNet((url) => {
    const r = robotsOk(url); if (r) return r;
    if (url.includes("zzqx")) return url.includes("smartrecruiters") ? json({ content: [], totalFound: 0 }) : gone();
    if (url.includes("/boards/acme/")) return json({ jobs: [{}, {}], name: "Acme Inc" }, 200, { etag: '"v1"' });
    if (url.includes("/boards/ghost/")) return gone();
    if (url.includes("/boards/htmlco/")) return new Response("<html>careers</html>", { status: 200 });
    if (url.includes("/postings/beta")) return json([{}]);
    if (url.includes("/companies/BigCo/")) return json({ content: [{}], totalFound: 40 });
    if (url.includes("/companies/Nobody/")) return json({ content: [], totalFound: 0 });
    return new Response("busy", { status: 500 });
  });
  const cands: Candidate[] = [
    { provider: "greenhouse", slug: "acme", source: "commoncrawl" }, { provider: "greenhouse", slug: "ghost", source: "commoncrawl" },
    { provider: "greenhouse", slug: "htmlco", source: "domains" }, { provider: "greenhouse", slug: "ACME", source: "directory" },
    { provider: "lever", slug: "beta", source: "directory" }, { provider: "smartrecruiters", slug: "BigCo", source: "commoncrawl" },
    { provider: "smartrecruiters", slug: "Nobody", source: "domains" },
  ];
  const r = await verifyCandidates(cands, { net });
  const v = Object.fromEntries(r.rows.map((x) => [`${x.provider}:${x.slug}`, x.verdict]).sort());
  eq(v, { "greenhouse:acme": "live", "greenhouse:ghost": "dead", "greenhouse:htmlco": "error", "lever:beta": "live", "smartrecruiters:BigCo": "live", "smartrecruiters:Nobody": "unverifiable" });
  eq(r.calibration.greenhouse, { http: 404, verdict: "dead" }, "the gibberish probe ran and was recorded");
  eq(r.calibration.smartrecruiters.verdict, "live");
  eq(r.rows.length, 6, "a slug seen twice (any case) is probed once");
  assert(calls.every((c) => c.ua === USER_AGENT), "every request names Upmore");
  assert(/Upmore/.test(USER_AGENT) && /https:\/\//.test(USER_AGENT), "with a contact URL");
  const robots = calls.filter((c) => c.url.endsWith("/robots.txt")).map((c) => new URL(c.url).host).sort();
  eq(robots, ["api.lever.co", "api.smartrecruiters.com", "boards-api.greenhouse.io"], "robots.txt read once per host, before any API call there");
  for (const h of robots) {
    const first = calls.findIndex((c) => new URL(c.url).host === h);
    assert(calls[first].url.endsWith("/robots.txt"), `${h}: robots first`);
  }
  eq(tally(r.rows).verified_boards, 3);
  eq(tally(r.rows).conditional.greenhouse, { live: 1, etag: 1, last_modified: 0 }, "which providers answer with validators is recorded");
  const dir = { meta: {}, boards: [{ company: "Beta", provider: "lever", board_token: "beta", status: "live", postings_seen: 3, last_verified: "2026-10-01", source: "x" }] };
  const m = mergeDirectory(dir, r.rows, "2026-10-20");
  eq(m.directory.boards.map((b: any) => `${b.provider}:${b.board_token}:${b.status}`).sort(),
    ["greenhouse:acme:live", "lever:beta:live", "smartrecruiters:BigCo:live"], "dead, error and unverifiable add nothing");
  eq(m.directory.boards.find((b: any) => b.board_token === "beta")!.last_verified, "2026-10-20", "an existing board verified again is refreshed, not duplicated");
});

Deno.test("WO-037/D3 robots.txt is obeyed: a disallowed API path is never fetched; a 5xx robots file means wait, not go", async () => {
  const { net, calls } = fakeNet((url) => {
    if (url === "https://api.lever.co/robots.txt") return new Response("User-agent: *\nDisallow: /v0/postings/\n");
    if (url === "https://api.ashbyhq.com/robots.txt") return new Response("down", { status: 503 });
    if (url.endsWith("/robots.txt")) return gone();
    return url.includes("zzqx") ? gone() : json([{}]);
  });
  const r = await verifyCandidates([{ provider: "lever", slug: "beta", source: "x" }, { provider: "ashby", slug: "gamma", source: "x" }], { net });
  eq(r.rows.map((x) => x.verdict).sort(), ["blocked_by_robots", "blocked_by_robots"]);
  assert(!calls.some((c) => c.url.includes("/v0/postings/") || c.url.includes("/posting-api/")), "nothing behind a Disallow was requested");
  const rb = parseRobots("User-agent: *\nDisallow: /\nAllow: /v1/boards/\n\nUser-agent: UpmoreTrainee\nDisallow: /private$\n");
  assert(rb.allowed("/private/x") && !rb.allowed("/private"), "our own group wins over *, and $ anchors");
  const star = parseRobots("User-agent: *\nDisallow: /\nAllow: /v1/boards/\n");
  assert(star.allowed("/v1/boards/a/jobs") && !star.allowed("/v2"), "the longest match wins");
  assert(robotsFromResponse(404, "").allowed("/anything"), "no robots file: no rules");
  assert(!robotsFromResponse(500, "").allowed("/anything"), "a robots file that cannot be read: disallow for now");
  eq(parseRobots("User-agent: *\nCrawl-delay: 2\n").crawlDelayS, 2);
});

Deno.test("WO-037/D4 one host is paced: no two requests closer than the gap, and a 429 slows that host down", async () => {
  // Five callers at the same instant: each is told to wait until its own slot, 200 ms after the one before.
  const t = 0, starts: number[] = [];
  const p = new HostPacer({ gapMs: 200, now: () => t, sleep: async (ms) => { starts.push(t + ms); } });
  await Promise.all(Array.from({ length: 5 }, () => p.wait("h")));
  eq(starts.sort((a, b) => a - b), [200, 400, 600, 800], "the first goes now, then one every 200 ms");
  p.backoff("h", 5);
  assert(p.gapFor("h") >= 5000, "Retry-After of 5 s is honored");
  eq(p.gapFor("other"), 200, "another host keeps its own pace");
  const seen: number[] = [];
  let n = 0;
  const { net } = fakeNet((url) => {
    if (url.endsWith("/robots.txt")) return gone();
    if (url.includes("zzqx")) return gone();
    seen.push(Date.now());
    return ++n === 1 ? new Response("slow down", { status: 429, headers: { "retry-after": "3" } }) : json({ jobs: [] });
  });
  const r = await verifyCandidates([{ provider: "greenhouse", slug: "acme", source: "x" }], { net });
  eq(r.rows[0].verdict, "live", "retried once after the 429, then verified");
});

Deno.test("WO-037/D5 candidate slugs from public URLs: the provider's path segment or subdomain, never its own pages", () => {
  eq(slugFromUrl("https://boards.greenhouse.io/stripe/jobs/123"), { provider: "greenhouse", slug: "stripe" });
  eq(slugFromUrl("https://job-boards.greenhouse.io/embed/job_board?for=figma&b=x"), { provider: "greenhouse", slug: "figma" });
  eq(slugFromUrl("https://jobs.lever.co/plaid/abc-def"), { provider: "lever", slug: "plaid" });
  eq(slugFromUrl("https://jobs.ashbyhq.com/ramp?utm=1"), { provider: "ashby", slug: "ramp" });
  eq(slugFromUrl("https://jobs.smartrecruiters.com/BoschGroup/7443"), { provider: "smartrecruiters", slug: "BoschGroup" });
  eq(slugFromUrl("https://apply.workable.com/acme-co/j/ABC/"), { provider: "workable", slug: "acme-co" });
  eq(slugFromUrl("https://acme.recruitee.com/o/engineer"), { provider: "recruitee", slug: "acme" });
  eq(slugFromUrl("https://boards.greenhouse.io/embed/job_app?token=1"), null, "the provider's own page is not a board");
  eq(slugFromUrl("https://www.workable.com/pricing"), null);
  eq(slugFromUrl("https://www.recruitee.com/"), null);
  eq(slugsFromCdx('{"url": "https://jobs.lever.co/beta/1"}\n{"url":"https://jobs.lever.co/beta/2"}\nnot json https://jobs.ashbyhq.com/gamma x\n').map((s) => s.slug), ["beta", "beta", "gamma"]);
  eq(guessesFromDomain("www.acme-corp.com"), ["acme-corp", "acmecorp"]);
  eq(guessesFromDomain("google.com"), ["google"]);
});

Deno.test("WO-037/D6 Common Crawl: the index is asked politely (robots, one at a time, paced) and its URLs become candidates", async () => {
  const { net, calls } = fakeNet((url) => {
    const u = new URL(url);
    if (u.pathname === "/robots.txt") return new Response("User-agent: *\nDisallow:\n");
    if (u.pathname === "/collinfo.json") return json([{ id: "CC-MAIN-2026-40" }, { id: "CC-MAIN-2026-33" }, { id: "CC-MAIN-2026-26" }]);
    if (u.searchParams.get("showNumPages")) return json({ pages: 3 });
    return new Response('{"url":"https://boards.greenhouse.io/acme/jobs/1"}\n{"url":"https://jobs.lever.co/beta/x"}\n');
  });
  const r = await commonCrawlCandidates({ net, crawls: 2, maxPages: 2, gapMs: 1000, queries: [{ provider: "greenhouse", url: "boards.greenhouse.io/*" }] });
  eq(r.crawls, ["CC-MAIN-2026-40", "CC-MAIN-2026-33"], "the latest crawls first");
  eq(r.pages, 4, "pages capped per query per crawl");
  eq(r.candidates.map((c) => `${c.provider}:${c.slug}`).sort(), ["greenhouse:acme", "lever:beta"]);
  const index = calls.filter((c) => new URL(c.url).host === "index.commoncrawl.org");
  for (let i = 1; i < index.length; i++) assert(index[i].at - index[i - 1].at >= 1000, "one request per second at most to the shared index");
});

// The fetch code of Trainee: everything that reads jobs, boards or postings, in every language, plus the CI workflows.
// The archive's router bundles are generated from packages/domain (scanned here) and carry citation links only.
const HOSTS = /(^|[^a-z0-9.-])([a-z0-9-]+\.)*(linkedin\.com|lnkd\.in|indeed\.com|indeed\.jobs)\b/i;
async function* walk(dir: string): AsyncGenerator<string> {
  for await (const e of Deno.readDir(dir)) {
    const p = `${dir}/${e.name}`;
    if (e.isDirectory && !["node_modules", ".git", "fixtures", "gauntlet"].includes(e.name)) yield* walk(p);
    else if (e.isFile && /\.(ts|js|cjs|mjs|py|yml|yaml|sh)$/.test(e.name)) yield p;
  }
}
Deno.test("WO-037/D7 no LinkedIn or Indeed host in any fetch code", async () => {
  const root = new URL("../../", import.meta.url).pathname;
  const bad: string[] = [];
  let scanned = 0;
  for (const d of ["scripts/career", "supabase/functions/_shared", "supabase/functions/career-ingest", "supabase/functions/career-proactive", "evals/career", "packages/domain", ".github/workflows"]) {
    for await (const f of walk(root + d)) {
      if (/router_core(\.career)?\.js$/.test(f)) continue;
      const text = await Deno.readTextFile(f);
      if (!/\bfetch\s*\(|fetchFn\s*\(|\bcurl\b|urlopen|https?\.get\(|\brequest\(|page\.goto\(/.test(text)) continue;
      scanned++;
      text.split("\n").forEach((l, i) => { if (HOSTS.test(l)) bad.push(`${f.slice(root.length)}:${i + 1}: ${l.trim().slice(0, 120)}`); });
    }
  }
  assert(scanned >= 20, `scanned ${scanned} fetch files`);
  eq(bad, [], "a LinkedIn or Indeed host appears in fetch code");
  assert(HOSTS.test("https://www.linkedin.com/jobs/view/1") && HOSTS.test("fetch('https://indeed.com/')") && !HOSTS.test("https://boards.greenhouse.io/x"), "the scan sees what it looks for");
});
