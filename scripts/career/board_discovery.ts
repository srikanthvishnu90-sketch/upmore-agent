// WO-037: board discovery at scale. Finds employer job boards on the public ATS posting APIs and keeps a slug only when
// its API answered 200 with the provider's expected JSON shape (a 404, a redirect, an HTML page or a timeout is never a
// board). Pure parts first (slug extraction, verdicts, robots, the per-host pacer), then the network runs, all with fetch,
// clock and sleep injected so tests run offline. The CLI is scripts/career/discover-boards.ts; CI runs it
// (.github/workflows/board-discovery.yml) because the build sandbox has no route to these hosts.
//
// The APIs (public, no key, read-only; each provider's own docs unless marked):
//   greenhouse       GET https://boards-api.greenhouse.io/v1/boards/<slug>/jobs           {jobs: [...]}   developers.greenhouse.io/job-board.html
//   lever            GET https://api.lever.co/v0/postings/<slug>?mode=json                 [...]           github.com/lever/postings-api
//   ashby            GET https://api.ashbyhq.com/posting-api/job-board/<slug>              {jobs: [...]}   developers.ashbyhq.com/docs/public-job-posting-api
//   smartrecruiters  GET https://api.smartrecruiters.com/v1/companies/<slug>/postings      {content, totalFound}  developers.smartrecruiters.com/docs/posting-api
//   workable         GET https://apply.workable.com/api/v1/widget/accounts/<slug>          {name, jobs: [...]}  the endpoint behind Workable's
//                    job widget (help.workable.com/hc/en-us/articles/115012801727); Workable publishes no reference for it,
//                    so it is described only by third parties (dev.to/zsevic/integration-with-workable-public-jobs-api-3nk4)
//   recruitee        GET https://<slug>.recruitee.com/api/offers/                          {offers: [...]} Recruitee's Careers Site API
//                    (support.recruitee.com/en/articles/1066282; "does not require authorization")
// Workable and Recruitee boards are recorded as discovered_unsupported: ingest has no normalizer for them yet.
//
// Candidate slugs come from sources a reviewer can re-run: the existing directory and WO-017 candidates, Common Crawl's
// URL index (index.commoncrawl.org, a pywb CDX server: github.com/webrecorder/pywb/blob/main/docs/manual/cdxserver_api.rst),
// and optionally a ranked domain list (for example Tranco, tranco-list.eu) turned into slug guesses.

export type Provider = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "recruitee";
export const PROVIDERS: Provider[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee"];
export const SUPPORTED = new Set<Provider>(["greenhouse", "lever", "ashby", "smartrecruiters"]);
export const USER_AGENT = "UpmoreTrainee-BoardDiscovery/1.0 (+https://github.com/srikanthvishnu90-sketch/upmore-agent; job alerts for job seekers)";

export interface Candidate { provider: Provider; slug: string; source: string; company_hint?: string }
export type Verdict = "live" | "dead" | "unverifiable" | "blocked_by_robots" | "error";
export interface VerdictRow {
  provider: Provider; slug: string; source: string; verdict: Verdict; http: number; postings: number | null;
  board_name: string | null; etag?: boolean; last_modified?: boolean; error?: string;
}

// ------------------------------------------------------------------------------------------------ the APIs
export const API: Record<Provider, { url: (slug: string) => string; rateKey: (slug: string) => string }> = {
  greenhouse: { url: (s) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s)}/jobs`, rateKey: () => "boards-api.greenhouse.io" },
  lever: { url: (s) => `https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json`, rateKey: () => "api.lever.co" },
  ashby: { url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}`, rateKey: () => "api.ashbyhq.com" },
  smartrecruiters: { url: (s) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(s)}/postings?limit=1`, rateKey: () => "api.smartrecruiters.com" },
  workable: { url: (s) => `https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(s)}`, rateKey: () => "apply.workable.com" },
  // One host per company, one platform behind them all: they share one pace.
  recruitee: { url: (s) => `https://${s}.recruitee.com/api/offers/`, rateKey: () => "recruitee.com" },
};

// The shape each API answers for a real board. Anything else, at any status, is not a board.
export function shapeOf(provider: Provider, data: unknown): { postings: number; name: string | null } | null {
  const d = data as any;
  switch (provider) {
    case "greenhouse": case "ashby":
      return d && typeof d === "object" && Array.isArray(d.jobs) ? { postings: d.jobs.length, name: typeof d.name === "string" ? d.name : null } : null;
    case "lever":
      return Array.isArray(d) ? { postings: d.length, name: null } : null;
    case "smartrecruiters":
      return d && Array.isArray(d.content) && Number.isFinite(Number(d.totalFound)) ? { postings: Number(d.totalFound), name: null } : null;
    case "workable":
      return d && Array.isArray(d.jobs) && typeof d.name === "string" ? { postings: d.jobs.length, name: d.name } : null;
    case "recruitee":
      return d && Array.isArray(d.offers) ? { postings: d.offers.length, name: null } : null;
  }
}

// One answer -> one verdict. `gibberishLive`: this provider answered a made-up slug with a board shape (SmartRecruiters
// does: 200 and zero postings for any name), so for it zero postings proves nothing.
export function classify(provider: Provider, status: number, data: unknown, gibberishLive = false): { verdict: Verdict; postings: number | null; name: string | null } {
  if (status === 404 || status === 410) return { verdict: "dead", postings: null, name: null };
  if (status !== 200) return { verdict: "error", postings: null, name: null };
  const s = shapeOf(provider, data);
  if (!s) return { verdict: "error", postings: null, name: null };
  if (gibberishLive && s.postings === 0) return { verdict: "unverifiable", postings: 0, name: s.name };
  return { verdict: "live", postings: s.postings, name: s.name };
}

// ------------------------------------------------------------------------------------------------ slugs from URLs
// Words that sit where a slug would but name a page of the provider's own site.
const NOT_A_SLUG = new Set(["embed", "v1", "v0", "api", "www", "app", "apply", "jobs", "careers", "help", "support", "blog", "status",
  "docs", "login", "signin", "signup", "static", "assets", "cdn", "resources", "workable", "recruitee", "about", "privacy", "terms",
  "robots.txt", "sitemap.xml", "favicon.ico", "oauth", "admin", "developers", "marketplace", "partners", "pricing", "demo", "mail"]);
const SLUG_OK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const PATTERNS: [Provider, RegExp][] = [
  ["greenhouse", /^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\?(?:.*&)?for=([^&#/]+)/i],
  ["greenhouse", /^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/i],
  ["lever", /^https?:\/\/jobs\.lever\.co\/([^/?#]+)/i],
  ["ashby", /^https?:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/i],
  ["smartrecruiters", /^https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([^/?#]+)/i],
  ["workable", /^https?:\/\/apply\.workable\.com\/([^/?#]+)/i],
  ["workable", /^https?:\/\/([a-z0-9][a-z0-9-]*)\.workable\.com(?:[/?#:]|$)/i],
  ["recruitee", /^https?:\/\/([a-z0-9][a-z0-9-]*)\.recruitee\.com(?:[/?#:]|$)/i],
];
export function slugFromUrl(url: string): { provider: Provider; slug: string } | null {
  for (const [provider, re] of PATTERNS) {
    const m = re.exec(String(url || "").trim());
    if (!m) continue;
    let slug: string;
    try { slug = decodeURIComponent(m[1]); } catch { return null; }
    slug = slug.replace(/\.$/, "");
    if (!SLUG_OK.test(slug) || NOT_A_SLUG.has(slug.toLowerCase())) return null;
    return { provider, slug };
  }
  return null;
}
export const keyOf = (provider: string, slug: string) => `${provider}:${String(slug).toLowerCase()}`;

// A domain list row ("stripe.com") -> slug guesses on every provider. Low yield (WO-017 measured ~2 live per 100 probes),
// so it is a capped, optional source.
export function guessesFromDomain(domain: string): string[] {
  const host = String(domain || "").toLowerCase().trim().replace(/^www\./, "");
  const label = host.split(".")[0] || "";
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(label) || NOT_A_SLUG.has(label)) return [];
  return [...new Set([label, label.replace(/-/g, "")])];
}

// ------------------------------------------------------------------------------------------------ robots.txt (RFC 9309)
// Groups for our product token or "*"; the longest matching Allow/Disallow wins, Allow on a tie. A 4xx robots file means
// no rules; a 5xx or unreachable one means "disallow everything" for now (RFC 9309 section 2.3.1.4).
export interface Robots { allowed(path: string): boolean; crawlDelayS: number | null }
export function parseRobots(text: string, agentToken = "upmoretrainee"): Robots {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[]; delay: number | null };
  const groups: Group[] = [];
  let cur: Group | null = null, lastWasAgent = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") {
      if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: null }; groups.push(cur); }
      cur.agents.push(v.toLowerCase());
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!cur) continue;
    if ((k === "allow" || k === "disallow") && v) cur.rules.push({ allow: k === "allow", path: v }); // an empty Disallow allows all
    else if (k === "crawl-delay") { const n = Number(v); if (Number.isFinite(n) && n >= 0) cur.delay = n; }
  }
  const mine = groups.filter((g) => g.agents.some((a) => a !== "*" && agentToken.startsWith(a)));
  const use = mine.length ? mine : groups.filter((g) => g.agents.includes("*"));
  const rules = use.flatMap((g) => g.rules);
  const delay = use.map((g) => g.delay).find((d) => d !== null) ?? null;
  // "*" matches any run of characters; a trailing "$" anchors the end.
  const toRe = (p: string) => {
    const end = p.endsWith("$"), body = end ? p.slice(0, -1) : p;
    return new RegExp("^" + body.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*") + (end ? "$" : ""));
  };
  return {
    crawlDelayS: delay,
    allowed(path: string) {
      let best: { allow: boolean; len: number } | null = null;
      for (const r of rules) {
        if (!toRe(r.path).test(path)) continue;
        const len = r.path.length;
        if (!best || len > best.len || (len === best.len && r.allow)) best = { allow: r.allow, len };
      }
      return best ? best.allow : true;
    },
  };
}
export const DISALLOW_ALL: Robots = { allowed: () => false, crawlDelayS: null };
export const ALLOW_ALL: Robots = { allowed: () => true, crawlDelayS: null };
export function robotsFromResponse(status: number, text: string): Robots {
  if (status >= 200 && status < 300) return parseRobots(text);
  if (status >= 400 && status < 500) return ALLOW_ALL;
  return DISALLOW_ALL;
}

// ------------------------------------------------------------------------------------------------ the per-host pacer
// At most one request start per `gapMs` per host (a robots Crawl-delay raises it), and a 429/503 doubles the host's gap
// (honoring Retry-After when it says more). Clock and sleep are injected: tests run a day in milliseconds.
export class HostPacer {
  private next = new Map<string, number>();
  private gap = new Map<string, number>();
  constructor(private o: { gapMs: number; now: () => number; sleep: (ms: number) => Promise<void>; maxGapMs?: number }) {}
  gapFor(host: string) { return this.gap.get(host) ?? this.o.gapMs; }
  setFloor(host: string, ms: number) { if (ms > this.gapFor(host)) this.gap.set(host, ms); }
  async wait(host: string) {
    const now = this.o.now(), at = Math.max(now, this.next.get(host) ?? 0);
    this.next.set(host, at + this.gapFor(host)); // reserve the slot before sleeping, so concurrent callers queue
    if (at > now) await this.o.sleep(at - now);
  }
  backoff(host: string, retryAfterS: number | null) {
    const doubled = Math.min(this.o.maxGapMs ?? 60000, this.gapFor(host) * 2);
    this.gap.set(host, Math.max(doubled, retryAfterS ? retryAfterS * 1000 : 0));
    this.next.set(host, this.o.now() + this.gapFor(host));
  }
}

// ------------------------------------------------------------------------------------------------ verification
export interface Net { fetch: typeof fetch; now: () => number; sleep: (ms: number) => Promise<void> }
const realNet: Net = { fetch: (...a) => fetch(...a), now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

async function getJson(net: Net, url: string, timeoutMs: number): Promise<{ status: number; data: unknown; headers: Headers | null; error?: string }> {
  try {
    const res = await net.fetch(url, { headers: { "user-agent": USER_AGENT, accept: "application/json" }, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const text = res.status === 200 ? await res.text() : (await res.body?.cancel().catch(() => {}), "");
    let data: unknown = undefined;
    if (text) { try { data = JSON.parse(text); } catch { data = undefined; } }
    return { status: res.status, data, headers: res.headers };
  } catch (e) {
    return { status: 0, data: undefined, headers: null, error: String(e instanceof Error ? e.message : e).slice(0, 160) };
  }
}

export interface VerifyOptions {
  net?: Net; gapMs?: number; workersPerHost?: number; timeoutMs?: number; deadline?: number;
  onRow?: (r: VerifyRow) => void; robots?: (host: string) => Promise<Robots>;
}
export type VerifyRow = VerdictRow;
export interface VerifyResult { rows: VerdictRow[]; calibration: Record<string, { http: number; verdict: Verdict }>; unprobed: number }

const GIBBERISH = "zzqx-not-a-board-7f3k";

// Every candidate gets one GET, paced per host, after the host's robots.txt is read and its gibberish slug calibrated.
// A row is "live" only from classify(): 200 and the expected shape. Retries: one, after a 429/503 backoff.
export async function verifyCandidates(cands: Candidate[], o: VerifyOptions = {}): Promise<VerifyResult> {
  const net = o.net ?? realNet, timeoutMs = o.timeoutMs ?? 15000;
  const pacer = new HostPacer({ gapMs: o.gapMs ?? 200, now: net.now, sleep: net.sleep });
  const robotsCache = new Map<string, Promise<Robots>>();
  const robotsFor = (url: string) => {
    const host = new URL(url).host;
    if (!robotsCache.has(host)) {
      robotsCache.set(host, o.robots ? o.robots(host) : (async () => {
        await pacer.wait(host.endsWith(".recruitee.com") ? "recruitee.com" : host);
        try {
          const r = await net.fetch(`https://${host}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
          return robotsFromResponse(r.status, r.status === 200 ? await r.text() : (await r.body?.cancel().catch(() => {}), ""));
        } catch { return DISALLOW_ALL; }
      })());
    }
    return robotsCache.get(host)!;
  };
  const rows: VerdictRow[] = [], calibration: VerifyResult["calibration"] = {};
  const seen = new Set<string>();
  const byKey = new Map<string, Candidate[]>();
  for (const c of cands) {
    const k = keyOf(c.provider, c.slug);
    if (seen.has(k)) continue;
    seen.add(k);
    const rk = API[c.provider].rateKey(c.slug);
    byKey.set(rk, [...(byKey.get(rk) ?? []), c]);
  }
  let unprobed = 0;
  async function probe(c: Candidate, gibberishLive: boolean): Promise<VerdictRow> {
    const url = API[c.provider].url(c.slug), rk = API[c.provider].rateKey(c.slug);
    const robots = await robotsFor(url);
    if (robots.crawlDelayS) pacer.setFloor(rk, robots.crawlDelayS * 1000);
    const u = new URL(url);
    if (!robots.allowed(u.pathname + u.search)) return { ...base(c), verdict: "blocked_by_robots", http: 0, postings: null, board_name: null };
    await pacer.wait(rk);
    let r = await getJson(net, url, timeoutMs);
    if (r.status === 429 || r.status === 503) {
      const ra = Number(r.headers?.get("retry-after"));
      pacer.backoff(rk, Number.isFinite(ra) ? ra : null);
      await pacer.wait(rk);
      r = await getJson(net, url, timeoutMs);
    }
    const v = classify(c.provider, r.status, r.data, gibberishLive);
    return { ...base(c), verdict: v.verdict, http: r.status, postings: v.postings, board_name: v.name,
      ...(r.status === 200 ? { etag: !!r.headers?.get("etag"), last_modified: !!r.headers?.get("last-modified") } : {}),
      ...(r.error ? { error: r.error } : {}) };
  }
  const base = (c: Candidate) => ({ provider: c.provider, slug: c.slug, source: c.source });
  await Promise.all([...byKey.entries()].map(async ([, list]) => {
    const provider = list[0].provider;
    let gibberishLive = false;
    if (!calibration[provider]) {
      const cal = await probe({ provider, slug: GIBBERISH, source: "calibration" }, false);
      calibration[provider] = { http: cal.http, verdict: cal.verdict };
      gibberishLive = cal.verdict === "live";
    }
    let next = 0;
    await Promise.all(Array.from({ length: Math.max(1, o.workersPerHost ?? 2) }, async () => {
      while (next < list.length) {
        if (o.deadline && net.now() >= o.deadline) { unprobed += list.length - next; next = list.length; return; }
        const row = await probe(list[next++], gibberishLive);
        rows.push(row);
        o.onRow?.(row);
      }
    }));
  }));
  return { rows, calibration, unprobed };
}

// ------------------------------------------------------------------------------------------------ Common Crawl
// The URL index lists every captured URL under a prefix; a slug is the path segment (or subdomain) the provider uses.
// One request at a time to index.commoncrawl.org, paced (its server is shared and slow); pages capped per query.
export const CC_QUERIES: { provider: Provider; url: string; matchType?: "prefix" | "domain" }[] = [
  { provider: "greenhouse", url: "boards.greenhouse.io/*" },
  { provider: "greenhouse", url: "job-boards.greenhouse.io/*" },
  { provider: "lever", url: "jobs.lever.co/*" },
  { provider: "ashby", url: "jobs.ashbyhq.com/*" },
  { provider: "smartrecruiters", url: "jobs.smartrecruiters.com/*" },
  { provider: "smartrecruiters", url: "careers.smartrecruiters.com/*" },
  { provider: "workable", url: "apply.workable.com/*" },
  { provider: "recruitee", url: "recruitee.com", matchType: "domain" },
];
export function slugsFromCdx(text: string): { provider: Provider; slug: string }[] {
  const out: { provider: Provider; slug: string }[] = [];
  for (const line of String(text || "").split("\n")) {
    if (!line.trim()) continue;
    let url = "";
    try { url = JSON.parse(line).url; } catch { url = line.split(" ").find((x) => /^https?:\/\//.test(x)) || ""; }
    const s = slugFromUrl(url);
    if (s) out.push(s);
  }
  return out;
}
export async function commonCrawlCandidates(o: { net?: Net; crawls?: number; maxPages?: number; gapMs?: number; deadline?: number; log?: (s: string) => void; queries?: typeof CC_QUERIES }): Promise<{ candidates: Candidate[]; pages: number; errors: number; crawls: string[] }> {
  const net = o.net ?? realNet, log = o.log ?? (() => {});
  const pacer = new HostPacer({ gapMs: o.gapMs ?? 1500, now: net.now, sleep: net.sleep });
  const host = "index.commoncrawl.org";
  await pacer.wait(host);
  const robots = await (async () => { try { const r = await net.fetch(`https://${host}/robots.txt`, { headers: { "user-agent": USER_AGENT } }); return robotsFromResponse(r.status, r.status === 200 ? await r.text() : ""); } catch { return DISALLOW_ALL; } })();
  await pacer.wait(host);
  const info = await getJson(net, `https://${host}/collinfo.json`, 60000);
  const crawls = Array.isArray(info.data) ? (info.data as any[]).map((c) => String(c.id)).filter((id) => /^CC-MAIN-/.test(id)).slice(0, o.crawls ?? 2) : [];
  const found = new Map<string, Candidate>();
  let pages = 0, errors = 0;
  for (const crawl of crawls) {
    for (const q of o.queries ?? CC_QUERIES) {
      const base = `/${crawl}-index?url=${encodeURIComponent(q.url)}${q.matchType ? `&matchType=${q.matchType}` : ""}&output=json&fl=url`;
      if (!robots.allowed(base)) { log(`CC ${crawl} ${q.url} blocked by robots`); continue; }
      await pacer.wait(host);
      const np = await getJson(net, `https://${host}${base}&showNumPages=true`, 120000);
      const total = Number((np.data as any)?.pages ?? 0);
      const take = Math.min(total, o.maxPages ?? 50);
      log(`CC ${crawl} ${q.url}: ${total} pages, reading ${take}`);
      for (let p = 0; p < take; p++) {
        if (o.deadline && net.now() >= o.deadline) { log("CC deadline reached"); return { candidates: [...found.values()], pages, errors, crawls }; }
        await pacer.wait(host);
        let r: Response | null = null;
        try { r = await net.fetch(`https://${host}${base}&page=${p}`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(180000) }); } catch { r = null; }
        if (!r || r.status !== 200) {
          errors++;
          if (r && (r.status === 429 || r.status === 503)) pacer.backoff(host, Number(r.headers.get("retry-after")) || null);
          await r?.body?.cancel().catch(() => {});
          continue;
        }
        pages++;
        for (const s of slugsFromCdx(await r.text())) {
          const k = keyOf(s.provider, s.slug);
          if (!found.has(k)) found.set(k, { ...s, source: `commoncrawl:${crawl}` });
        }
      }
    }
  }
  return { candidates: [...found.values()], pages, errors, crawls };
}

// ------------------------------------------------------------------------------------------------ the directory
// Verified boards join the directory: supported providers as "live" (watched), Workable and Recruitee as
// "discovered_unsupported". Existing entries are never removed; an existing entry verified again gets its date and count
// refreshed. Dead, unverifiable, robots-blocked and errored rows add nothing. ATS vendors' own boards are skipped.
const VENDOR = new Set(["greenhouse:greenhouse", "lever:leverdemo", "ashby:ashby", "smartrecruiters:smartrecruiters", "workable:workable", "recruitee:recruitee"]);
export function mergeDirectory(directory: { meta?: any; boards: any[] }, rows: VerdictRow[], today: string, summary: Record<string, unknown> = {}) {
  const index = new Map(directory.boards.map((b, i) => [keyOf(b.provider, b.board_token), i]));
  const boards = directory.boards.map((b) => ({ ...b }));
  let added = 0, refreshed = 0;
  for (const r of rows) {
    if (r.verdict !== "live") continue;
    const k = keyOf(r.provider, r.slug);
    if (VENDOR.has(k)) continue;
    const at = index.get(k);
    if (at !== undefined) {
      if (boards[at].status === "live" || !SUPPORTED.has(r.provider)) { boards[at].postings_seen = r.postings ?? 0; boards[at].last_verified = today; refreshed++; }
      continue;
    }
    index.set(k, boards.length);
    boards.push({ company: r.board_name || r.slug, provider: r.provider, board_token: r.slug,
      status: SUPPORTED.has(r.provider) ? "live" : "discovered_unsupported", postings_seen: r.postings ?? 0, last_verified: today, source: `wo037-${r.source.split(":")[0]}` });
    added++;
  }
  const live = boards.filter((b) => b.status === "live").length;
  return { directory: { meta: { ...directory.meta, live_supported: live, wo037: { date: today, added, refreshed, ...summary } }, boards }, added, refreshed };
}

export function tally(rows: VerdictRow[]) {
  const t: Record<string, number> = {};
  for (const r of rows) t[`${r.provider}:${r.verdict}`] = (t[`${r.provider}:${r.verdict}`] ?? 0) + 1;
  const live = rows.filter((r) => r.verdict === "live");
  return { by: t, verified_boards: live.length, verified_supported: live.filter((r) => SUPPORTED.has(r.provider)).length,
    verified_with_postings: live.filter((r) => (r.postings ?? 0) > 0).length,
    conditional: Object.fromEntries(PROVIDERS.map((p) => { const l = live.filter((r) => r.provider === p); return [p, { live: l.length, etag: l.filter((r) => r.etag).length, last_modified: l.filter((r) => r.last_modified).length }]; })) };
}
