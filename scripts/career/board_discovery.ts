// WO-037 / WO-044: board discovery at scale. Finds employer job boards on the public ATS posting APIs and keeps a slug
// only when its API answered 200 with the provider's expected shape (a 404, a redirect, an HTML page or a timeout is never
// a board). Pure parts first (slug extraction, verdicts, robots, the per-host pacer), then the network runs, all with
// fetch, clock and sleep injected so tests run offline. The CLI is scripts/career/discover-boards.ts; CI runs it
// (.github/workflows/board-discovery.yml) because the build sandbox has no route to these hosts.
//
// The APIs (public, no key, read-only; each provider's own docs unless marked):
//   greenhouse       GET https://boards-api.greenhouse.io/v1/boards/<slug>/jobs           {jobs: [...]}   developers.greenhouse.io/job-board.html
//   lever            GET https://api.lever.co/v0/postings/<slug>?mode=json                 [...]           github.com/lever/postings-api
//   ashby            GET https://api.ashbyhq.com/posting-api/job-board/<slug>              {jobs: [...]}   developers.ashbyhq.com/docs/public-job-posting-api
//   smartrecruiters  GET https://api.smartrecruiters.com/v1/companies/<slug>/postings      {content, totalFound}  developers.smartrecruiters.com/docs/posting-api
//   WO-044 (supabase/functions/_shared/career_ingest_feeds.ts names each endpoint's source and whether it is documented):
//   workable         GET https://apply.workable.com/api/v1/widget/accounts/<slug>          {name, jobs: [...]}
//   recruitee        GET https://<slug>.recruitee.com/api/offers/                          {offers: [...]}
//   bamboohr         GET https://<slug>.bamboohr.com/careers/list                          {meta, result: [...]}
//   teamtailor       GET https://<slug>.teamtailor.com/jobs.rss                            RSS 2.0
//   breezy           GET https://<slug>.breezy.hr/json                                     [...]
//   personio         GET https://<slug>.jobs.personio.de/xml                               <workzag-jobs>
//   workday          POST https://<tenant>.<wdN>.myworkdayjobs.com/wday/cxs/<tenant>/<site>/jobs  {total, jobPostings}
//                    Workday's read-only job SEARCH (the career site's own call; it reads, it changes nothing). The only
//                    POST anywhere in discovery; its body asks for one posting.
//
// Candidate slugs come from sources a reviewer can re-run: the existing directory and WO-017 candidates; Common Crawl,
// through its index server (index.commoncrawl.org, a pywb CDX server) when that server's robots.txt allows it, and
// (WO-044) through the index files themselves on data.commoncrawl.org (cluster.idx, then byte ranges of the cdx shards);
// the sitemaps the boards' hosts advertise in robots.txt; and optionally a ranked domain list (Tranco) as slug guesses.
import { FEEDS, isMoreProvider, workdayParts } from "../../supabase/functions/_shared/career_ingest_feeds.ts";

export type Provider = "greenhouse" | "lever" | "ashby" | "smartrecruiters" | "workable" | "recruitee" | "bamboohr" | "teamtailor" | "breezy" | "personio" | "workday";
export const PROVIDERS: Provider[] = ["greenhouse", "lever", "ashby", "smartrecruiters", "workable", "recruitee", "bamboohr", "teamtailor", "breezy", "personio", "workday"];
// Providers ingest reads (career_ingest.ts INGEST_PROVIDERS): since WO-044, all of them.
export const SUPPORTED = new Set<Provider>(PROVIDERS);
// The slug is the subdomain (one host per company) for these; a path segment for the rest; Workday is "<tenant>.<wdN>/<site>".
export const HOST_SLUG = new Set<Provider>(["recruitee", "bamboohr", "teamtailor", "breezy", "personio"]);
export const USER_AGENT = "UpmoreTrainee-BoardDiscovery/1.0 (+https://github.com/srikanthvishnu90-sketch/upmore-agent; job alerts for job seekers)";

export interface Candidate { provider: Provider; slug: string; source: string; company_hint?: string }
export type Verdict = "live" | "dead" | "unverifiable" | "blocked_by_robots" | "error";
export interface VerdictRow {
  provider: Provider; slug: string; source: string; verdict: Verdict; http: number; postings: number | null;
  board_name: string | null; etag?: boolean; last_modified?: boolean; error?: string;
}

// ------------------------------------------------------------------------------------------------ the APIs
// rateKey: the pace one platform gets. One host per company on the subdomain providers, one platform behind them all:
// they share one pace.
export const API: Record<Provider, { url: (slug: string) => string; rateKey: (slug: string) => string }> = {
  greenhouse: { url: (s) => `https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(s)}/jobs`, rateKey: () => "boards-api.greenhouse.io" },
  lever: { url: (s) => `https://api.lever.co/v0/postings/${encodeURIComponent(s)}?mode=json`, rateKey: () => "api.lever.co" },
  ashby: { url: (s) => `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(s)}`, rateKey: () => "api.ashbyhq.com" },
  smartrecruiters: { url: (s) => `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(s)}/postings?limit=1`, rateKey: () => "api.smartrecruiters.com" },
  workable: { url: (s) => FEEDS.workable.request(s, 0, true).url, rateKey: () => "apply.workable.com" },
  recruitee: { url: (s) => FEEDS.recruitee.request(s, 0, true).url, rateKey: () => "recruitee.com" },
  bamboohr: { url: (s) => FEEDS.bamboohr.request(s, 0, true).url, rateKey: () => "bamboohr.com" },
  teamtailor: { url: (s) => FEEDS.teamtailor.request(s, 0, true).url, rateKey: () => "teamtailor.com" },
  breezy: { url: (s) => FEEDS.breezy.request(s, 0, true).url, rateKey: () => "breezy.hr" },
  personio: { url: (s) => FEEDS.personio.request(s, 0, true).url, rateKey: () => "jobs.personio.de" },
  workday: { url: (s) => FEEDS.workday.request(s, 0, true).url, rateKey: () => "myworkdayjobs.com" },
};
// The one request a probe makes. Everything is a GET but Workday's search (POST, read-only, asks for one posting).
export function probeRequest(provider: Provider, slug: string): { url: string; method: "GET" | "POST"; body?: string; accept: string } {
  if (isMoreProvider(provider)) { const r = FEEDS[provider].request(slug, 0, true); return { url: r.url, method: r.method, body: r.body, accept: r.accept }; }
  return { url: API[provider].url(slug), method: "GET", accept: "application/json" };
}
export function parseBody(provider: Provider, text: string): unknown {
  if (isMoreProvider(provider)) return FEEDS[provider].parse(text);
  try { return JSON.parse(text); } catch { return undefined; }
}

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
    default:
      return FEEDS[provider].shape(d);
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
// Words that sit where a slug would but name a page (or a subdomain) of the provider's own site.
const NOT_A_SLUG = new Set(["embed", "v1", "v0", "api", "www", "app", "apply", "jobs", "careers", "help", "support", "blog", "status",
  "docs", "login", "signin", "signup", "static", "assets", "cdn", "resources", "workable", "recruitee", "about", "privacy", "terms",
  "robots.txt", "sitemap.xml", "favicon.ico", "oauth", "admin", "developers", "marketplace", "partners", "pricing", "demo", "mail",
  // WO-044: the subdomain providers' own hosts and the Workday paths that are not a site
  "career", "partner", "scripts", "images", "img", "media", "developer", "attachments", "go", "info", "events", "community",
  "academy", "learn", "security", "trust", "wday", "bamboohr", "teamtailor", "breezy", "personio", "myworkdayjobs", "sitemap",
  "en", "de", "fr", "es", "nl", "sv", "it", "pt", "da", "fi", "no", "pl", "cs"]);
const SLUG_OK = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,99}$/;
const LABEL_OK = /^[a-z0-9][a-z0-9-]{0,62}$/i;
const SUB = (domain: string) => new RegExp(`^https?:\\/\\/([a-z0-9][a-z0-9-]*)\\.${domain.replace(/\./g, "\\.")}(?::\\d+)?(?:[/?#]|$)`, "i");
const PATTERNS: [Provider, RegExp][] = [
  ["greenhouse", /^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/embed\/job_board(?:\/js)?\?(?:.*&)?for=([^&#/]+)/i],
  ["greenhouse", /^https?:\/\/(?:boards|job-boards)(?:\.eu)?\.greenhouse\.io\/([^/?#]+)/i],
  ["lever", /^https?:\/\/jobs\.lever\.co\/([^/?#]+)/i],
  ["ashby", /^https?:\/\/jobs\.ashbyhq\.com\/([^/?#]+)/i],
  ["smartrecruiters", /^https?:\/\/(?:jobs|careers)\.smartrecruiters\.com\/([^/?#]+)/i],
  ["workable", /^https?:\/\/apply\.workable\.com\/([^/?#]+)/i],
  ["workable", SUB("workable.com")],
  ["recruitee", SUB("recruitee.com")],
  ["bamboohr", SUB("bamboohr.com")],
  ["teamtailor", SUB("teamtailor.com")],
  ["breezy", SUB("breezy.hr")],
  ["personio", SUB("jobs.personio.de")],
  ["personio", SUB("jobs.personio.com")],
];
// A Workday career site: https://<tenant>.<wdN>.myworkdayjobs.com/[<locale>/]<site>/...
const WORKDAY = /^https?:\/\/([a-z0-9][a-z0-9-]*)\.(wd\d{1,3})\.myworkdayjobs\.com(?::\d+)?\/(?:([a-z]{2}(?:-[a-z]{2})?)\/)?([^/?#]+)/i;
export function slugFromUrl(url: string): { provider: Provider; slug: string } | null {
  const u = String(url || "").trim();
  const w = WORKDAY.exec(u);
  if (w) {
    let site: string;
    try { site = decodeURIComponent(w[4]); } catch { return null; }
    if (!SLUG_OK.test(site) || NOT_A_SLUG.has(site.toLowerCase()) || NOT_A_SLUG.has(w[1].toLowerCase()) || /^[a-z]{2}(-[a-z]{2})?$/i.test(site)) return null;
    const slug = `${w[1].toLowerCase()}.${w[2].toLowerCase()}/${site}`;
    return workdayParts(slug) ? { provider: "workday", slug } : null;
  }
  for (const [provider, re] of PATTERNS) {
    const m = re.exec(u);
    if (!m) continue;
    let slug: string;
    try { slug = decodeURIComponent(m[1]); } catch { return null; }
    slug = slug.replace(/\.$/, "");
    if (!SLUG_OK.test(slug) || NOT_A_SLUG.has(slug.toLowerCase())) return null;
    if (HOST_SLUG.has(provider)) { if (!LABEL_OK.test(slug)) return null; slug = slug.toLowerCase(); }
    return { provider, slug };
  }
  return null;
}
export const keyOf = (provider: string, slug: string) => `${provider}:${String(slug).toLowerCase()}`;

// A domain list row ("stripe.com") -> slug guesses on every provider. Low yield (run 39345730265: 356 live of 14,987
// guesses, 2.4%), so it is a capped, optional source, probed last.
export function guessesFromDomain(domain: string): string[] {
  const host = String(domain || "").toLowerCase().trim().replace(/^www\./, "");
  const label = host.split(".")[0] || "";
  if (!/^[a-z0-9][a-z0-9-]{1,40}$/.test(label) || NOT_A_SLUG.has(label)) return [];
  return [...new Set([label, label.replace(/-/g, "")])];
}

// ------------------------------------------------------------------------------------------------ robots.txt (RFC 9309)
// Groups for our product token or "*"; the longest matching Allow/Disallow wins, Allow on a tie. A 4xx robots file means
// no rules; a 5xx or unreachable one means "disallow everything" for now (RFC 9309 section 2.3.1.4). `sitemaps`: the
// file's Sitemap lines (they belong to no group).
export interface Robots { allowed(path: string): boolean; crawlDelayS: number | null; sitemaps?: string[]; unreachable?: boolean }
export function parseRobots(text: string, agentToken = "upmoretrainee"): Robots {
  type Group = { agents: string[]; rules: { allow: boolean; path: string }[]; delay: number | null };
  const groups: Group[] = [], sitemaps: string[] = [];
  let cur: Group | null = null, lastWasAgent = false;
  for (const raw of String(text || "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "sitemap") { if (/^https?:\/\//i.test(v)) sitemaps.push(v); continue; }
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
    crawlDelayS: delay, sitemaps,
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
export const DISALLOW_ALL: Robots = { allowed: () => false, crawlDelayS: null, sitemaps: [] };
export const ALLOW_ALL: Robots = { allowed: () => true, crawlDelayS: null, sitemaps: [] };
const UNREACHABLE: Robots = { allowed: () => false, crawlDelayS: null, sitemaps: [], unreachable: true };
export function robotsFromResponse(status: number, text: string): Robots {
  if (status >= 200 && status < 300) return parseRobots(text);
  if (status >= 400 && status < 500) return ALLOW_ALL;
  return DISALLOW_ALL;
}

// ------------------------------------------------------------------------------------------------ the per-host pacer
// At most one request start per `gapMs` per host (a robots Crawl-delay raises that floor), and a 429/503 doubles the
// host's gap (honoring Retry-After when it says more). WO-044: every answer that is not a 429/503 eases the gap back 5%
// toward its floor (run 39345730265 left Workable at a 60 s gap for good after a few 429s: 2,596 slugs never probed).
// Clock and sleep are injected: tests run a day in milliseconds.
export class HostPacer {
  private next = new Map<string, number>();
  private gap = new Map<string, number>();
  private floor = new Map<string, number>();
  constructor(private o: { gapMs: number; now: () => number; sleep: (ms: number) => Promise<void>; maxGapMs?: number }) {}
  private base(host: string) { return Math.max(this.o.gapMs, this.floor.get(host) ?? 0); }
  gapFor(host: string) { return this.gap.get(host) ?? this.base(host); }
  setFloor(host: string, ms: number) { if (ms > (this.floor.get(host) ?? 0)) this.floor.set(host, ms); if (ms > this.gapFor(host)) this.gap.set(host, ms); }
  async wait(host: string) {
    const now = this.o.now(), at = Math.max(now, this.next.get(host) ?? 0);
    this.next.set(host, at + this.gapFor(host)); // reserve the slot before sleeping, so concurrent callers queue
    if (at > now) await this.o.sleep(at - now);
  }
  backoff(host: string, retryAfterS: number | null) {
    const doubled = Math.min(this.o.maxGapMs ?? 60000, this.gapFor(host) * 2);
    this.gap.set(host, Math.max(doubled, retryAfterS ? Math.min(retryAfterS * 1000, 600000) : 0));
    this.next.set(host, this.o.now() + this.gapFor(host));
  }
  relax(host: string) {
    const g = this.gap.get(host);
    if (g === undefined) return;
    const eased = Math.max(this.base(host), Math.floor(g * 0.95));
    if (eased <= this.base(host)) this.gap.delete(host); else this.gap.set(host, eased);
  }
}

// ------------------------------------------------------------------------------------------------ verification
export interface Net { fetch: typeof fetch; now: () => number; sleep: (ms: number) => Promise<void> }
const realNet: Net = { fetch: (...a) => fetch(...a), now: Date.now, sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };

async function getJson(net: Net, url: string, timeoutMs: number, provider?: Provider, rq?: { method: "GET" | "POST"; body?: string; accept: string }): Promise<{ status: number; data: unknown; headers: Headers | null; error?: string }> {
  try {
    const headers: Record<string, string> = { "user-agent": USER_AGENT, accept: rq?.accept ?? "application/json" };
    if (rq?.body) headers["content-type"] = "application/json";
    const res = await net.fetch(url, { method: rq?.method ?? "GET", headers, body: rq?.body, redirect: "manual", signal: AbortSignal.timeout(timeoutMs) });
    const text = res.status === 200 ? await res.text() : (await res.body?.cancel().catch(() => {}), "");
    let data: unknown = undefined;
    if (text) data = provider ? parseBody(provider, text) : (() => { try { return JSON.parse(text); } catch { return undefined; } })();
    return { status: res.status, data, headers: res.headers };
  } catch (e) {
    return { status: 0, data: undefined, headers: null, error: String(e instanceof Error ? e.message : e).slice(0, 160) };
  }
}

export interface VerifyOptions {
  net?: Net; gapMs?: number; workersPerHost?: number; timeoutMs?: number; deadline?: number;
  onRow?: (r: VerifyRow) => void; robots?: (host: string) => Promise<Robots>;
  retryErrors?: boolean; // WO-044: after the first pass, probe once more every row that ended on a 429/5xx/timeout
}
export type VerifyRow = VerdictRow;
export interface VerifyResult { rows: VerdictRow[]; calibration: Record<string, { http: number; verdict: Verdict }>; unprobed: number; retried?: number }

const GIBBERISH = "zzqx-not-a-board-7f3k";
// The made-up board a provider is calibrated with. Workday's tokens carry a tenant, so its gibberish is a made-up site on
// the first real tenant in the list (a made-up tenant has no host at all).
export function gibberishFor(provider: Provider, sample?: string): string {
  if (provider !== "workday") return GIBBERISH;
  const w = sample ? workdayParts(sample) : null;
  return w ? `${w.tenant}.${w.wd}/${GIBBERISH}` : `${GIBBERISH}.wd1/${GIBBERISH}`;
}
// Sources in the order a run spends its time on them: the ones that find real boards first, slug guesses last.
const SOURCE_RANK: Record<string, number> = { directory: 0, ccdata: 1, commoncrawl: 1, sitemaps: 2, "wo017-candidates": 3, domains: 9 };
export const sourceRank = (source: string) => SOURCE_RANK[String(source).split(":")[0]] ?? 5;

// Every candidate gets one request, paced per platform, after its host's robots.txt is read and its provider's gibberish
// slug calibrated. A row is "live" only from classify(): 200 and the expected shape. Retries: one, after a 429/503
// backoff; and (retryErrors) one more pass over what ended on a transient error, while time is left.
export async function verifyCandidates(cands: Candidate[], o: VerifyOptions = {}): Promise<VerifyResult> {
  const net = o.net ?? realNet, timeoutMs = o.timeoutMs ?? 15000;
  const pacer = new HostPacer({ gapMs: o.gapMs ?? 200, now: net.now, sleep: net.sleep });
  const robotsCache = new Map<string, Promise<Robots>>();
  const robotsFor = (url: string, rk: string) => {
    const host = new URL(url).host;
    if (!robotsCache.has(host)) {
      robotsCache.set(host, o.robots ? o.robots(host) : (async () => {
        await pacer.wait(rk);
        try {
          const r = await net.fetch(`https://${host}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(timeoutMs) });
          return robotsFromResponse(r.status, r.status === 200 ? await r.text() : (await r.body?.cancel().catch(() => {}), ""));
        } catch { return UNREACHABLE; } // RFC 9309: unreachable means disallow; the row says why
      })());
    }
    return robotsCache.get(host)!;
  };
  const rows: VerdictRow[] = [], calibration: VerifyResult["calibration"] = {};
  const seen = new Set<string>();
  const byKey = new Map<string, Candidate[]>();
  // The first occurrence of a slug (any case) is the one probed; then the better sources go first.
  const unique = cands.filter((c) => { const k = keyOf(c.provider, c.slug); if (seen.has(k)) return false; seen.add(k); return true; });
  const ordered = unique.map((c, i) => ({ c, i })).sort((a, b) => sourceRank(a.c.source) - sourceRank(b.c.source) || a.i - b.i).map((x) => x.c);
  for (const c of ordered) {
    const rk = API[c.provider].rateKey(c.slug);
    byKey.set(rk, [...(byKey.get(rk) ?? []), c]);
  }
  let unprobed = 0;
  async function probe(c: Candidate, gibberishLive: boolean): Promise<VerdictRow> {
    let rq: ReturnType<typeof probeRequest>;
    try { rq = probeRequest(c.provider, c.slug); } catch (e) { return { ...base(c), verdict: "error", http: 0, postings: null, board_name: null, error: String((e as Error).message).slice(0, 160) }; }
    const rk = API[c.provider].rateKey(c.slug);
    const robots = await robotsFor(rq.url, rk);
    if (robots.crawlDelayS) pacer.setFloor(rk, robots.crawlDelayS * 1000);
    if (robots.unreachable) return { ...base(c), verdict: "error", http: 0, postings: null, board_name: null, error: "robots.txt unreachable (no request made)" };
    const u = new URL(rq.url);
    if (!robots.allowed(u.pathname + u.search)) return { ...base(c), verdict: "blocked_by_robots", http: 0, postings: null, board_name: null };
    await pacer.wait(rk);
    let r = await getJson(net, rq.url, timeoutMs, c.provider, rq);
    if (r.status === 429 || r.status === 503) {
      const ra = Number(r.headers?.get("retry-after"));
      pacer.backoff(rk, Number.isFinite(ra) ? ra : null);
      await pacer.wait(rk);
      r = await getJson(net, rq.url, timeoutMs, c.provider, rq);
    }
    if (r.status !== 429 && r.status !== 503) pacer.relax(rk);
    const v = classify(c.provider, r.status, r.data, gibberishLive);
    return { ...base(c), verdict: v.verdict, http: r.status, postings: v.postings, board_name: v.name,
      ...(r.status === 200 ? { etag: !!r.headers?.get("etag"), last_modified: !!r.headers?.get("last-modified") } : {}),
      ...(r.error ? { error: r.error } : {}) };
  }
  const base = (c: Candidate) => ({ provider: c.provider, slug: c.slug, source: c.source });
  const gibLive: Record<string, boolean> = {};
  const transient = (r: VerdictRow) => r.verdict === "error" && (r.http === 0 || r.http === 429 || r.http >= 500) && !/robots/.test(r.error ?? "");
  async function pass(lists: Candidate[][], first: boolean) {
    await Promise.all(lists.map(async (list) => {
      if (!list.length) return;
      const provider = list[0].provider;
      if (first && !calibration[provider]) {
        const cal = await probe({ provider, slug: gibberishFor(provider, list[0].slug), source: "calibration" }, false);
        calibration[provider] = { http: cal.http, verdict: cal.verdict };
        gibLive[provider] = cal.verdict === "live";
      }
      let next = 0;
      await Promise.all(Array.from({ length: Math.max(1, o.workersPerHost ?? 2) }, async () => {
        while (next < list.length) {
          if (o.deadline && net.now() >= o.deadline) { if (first) unprobed += list.length - next; next = list.length; return; }
          const c = list[next++];
          const row = await probe(c, gibLive[provider] ?? false);
          if (first) { rows.push(row); o.onRow?.(row); } else retriedRows.set(keyOf(c.provider, c.slug), row);
        }
      }));
    }));
  }
  const retriedRows = new Map<string, VerdictRow>();
  await pass([...byKey.values()], true);
  let retried = 0;
  if (o.retryErrors) {
    const again = new Map<string, Candidate[]>();
    for (const r of rows) if (transient(r)) { const rk = API[r.provider].rateKey(r.slug); again.set(rk, [...(again.get(rk) ?? []), { provider: r.provider, slug: r.slug, source: r.source }]); }
    await pass([...again.values()], false);
    for (let i = 0; i < rows.length; i++) {
      const n = retriedRows.get(keyOf(rows[i].provider, rows[i].slug));
      if (n) { rows[i] = n; retried++; o.onRow?.(n); }
    }
  }
  return { rows, calibration, unprobed, retried };
}

// Resuming: the slugs an earlier run's verdicts found dead (404/410) need no new probe. Everything else is probed again,
// so a board counts as verified only from this run's own answer.
export function knownDead(prior: VerdictRow[]): Set<string> {
  return new Set(prior.filter((r) => r.verdict === "dead").map((r) => keyOf(r.provider, r.slug)));
}

// ------------------------------------------------------------------------------------------------ Common Crawl, index server
// The URL index lists every captured URL under a prefix; a slug is the path segment (or subdomain) the provider uses.
// One request at a time to index.commoncrawl.org, paced (its server is shared and slow); pages capped per query. Its
// robots.txt is read first and obeyed for every path, collinfo.json included (WO-044: WO-037 read collinfo.json before
// checking; in run 39345730265 the server's robots.txt disallowed every query, so this source found nothing).
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
export async function commonCrawlCandidates(o: { net?: Net; crawls?: number; maxPages?: number; gapMs?: number; deadline?: number; log?: (s: string) => void; queries?: typeof CC_QUERIES }): Promise<{ candidates: Candidate[]; pages: number; errors: number; crawls: string[]; blocked?: boolean }> {
  const net = o.net ?? realNet, log = o.log ?? (() => {});
  const pacer = new HostPacer({ gapMs: o.gapMs ?? 1500, now: net.now, sleep: net.sleep });
  const host = "index.commoncrawl.org";
  await pacer.wait(host);
  const robots = await (async () => { try { const r = await net.fetch(`https://${host}/robots.txt`, { headers: { "user-agent": USER_AGENT } }); return robotsFromResponse(r.status, r.status === 200 ? await r.text() : ""); } catch { return DISALLOW_ALL; } })();
  if (!robots.allowed("/collinfo.json")) { log(`CC ${host} robots.txt disallows /collinfo.json: index server not used`); return { candidates: [], pages: 0, errors: 0, crawls: [], blocked: true }; }
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

// ------------------------------------------------------------------------------------------------ Common Crawl, the index files
// WO-044. The same URL index, read from its files on data.commoncrawl.org (Common Crawl's documented HTTPS download
// endpoint; commoncrawl.org/get-started) instead of the index server. Each crawl's index is ~300 gzipped shards
// (cdx-00000.gz ...) of SURT-sorted lines, cut into blocks of 3,000 lines, each block its own gzip member; cluster.idx
// lists every block's first key, shard, offset and length. So: stream cluster.idx once, keep the blocks under each
// provider's SURT prefix, and read only those blocks with HTTP Range requests (GET, a byte range). A block whose first
// key and the next block's first key share one board's root (".../acme/") holds nothing but that board and is not read.
export const CC_DATA_PREFIXES: { provider: Provider; surt: string }[] = [
  { provider: "greenhouse", surt: "io,greenhouse,boards)/" },
  { provider: "greenhouse", surt: "io,greenhouse,job-boards)/" },
  { provider: "lever", surt: "co,lever,jobs)/" },
  { provider: "ashby", surt: "com,ashbyhq,jobs)/" },
  { provider: "workable", surt: "com,workable,apply)/" },
  { provider: "recruitee", surt: "com,recruitee," },
  { provider: "bamboohr", surt: "com,bamboohr," },
  { provider: "teamtailor", surt: "com,teamtailor," },
  { provider: "breezy", surt: "hr,breezy," },
  { provider: "personio", surt: "de,personio,jobs," },
  { provider: "personio", surt: "com,personio,jobs," },
  { provider: "workday", surt: "com,myworkdayjobs," },
  // SmartRecruiters is left out: api.smartrecruiters.com's robots.txt disallowed every probe in run 39345730265.
];
// "com,ashbyhq,jobs)/ramp/x?y" -> "https://jobs.ashbyhq.com/ramp/x?y". SURT keys are lower-cased.
export function surtToUrl(key: string): string | null {
  const i = String(key || "").indexOf(")");
  if (i <= 0) return null;
  const host = key.slice(0, i).replace(/:\d+$/, "").split(",").filter(Boolean).reverse().join(".");
  if (!/^[a-z0-9.-]+$/i.test(host)) return null;
  return `https://${host}${key.slice(i + 1) || "/"}`;
}
// The part of a key that names one board: "com,recruitee,acme)" or "io,greenhouse,boards)/acme/" or, for Workday,
// "com,myworkdayjobs,wd5,nvidia)/[en-us/]site/". null when the key names no board.
export function boardRoot(key: string): string | null {
  const url = surtToUrl(key);
  const s = url ? slugFromUrl(url) : null;
  if (!s) return null;
  const close = key.indexOf(")");
  if (HOST_SLUG.has(s.provider) || (s.provider === "workable" && !/^com,workable,apply\)/.test(key))) return key.slice(0, close + 1);
  const rest = key.slice(close + 1);
  const m = s.provider === "workday" ? /^\/(?:[a-z]{2}(?:-[a-z]{2})?\/)?[^/?#]+\//.exec(rest) : /^\/[^/?#]+\//.exec(rest);
  return m ? key.slice(0, close + 1) + m[0] : null;
}
export interface ClusterBlock { key: string; file: string; offset: number; length: number }
export function parseClusterLine(line: string): ClusterBlock | null {
  const f = String(line || "").split("\t");
  if (f.length < 4) return null;
  const key = f[0].split(" ")[0], offset = Number(f[2]), length = Number(f[3]);
  if (!key || !/^cdx-\d+\.gz$/.test(f[1]) || !Number.isFinite(offset) || !Number.isFinite(length) || length <= 0) return null;
  return { key, file: f[1], offset, length };
}
// One streaming pass over cluster.idx lines -> for each prefix, the blocks that can hold its keys: the block before the
// first block starting inside it (that block may run into the prefix), every block starting inside it, and the first
// block after (the end bound). A prefix with no block starting inside it (all its keys sit in one block) gets that one
// block and its end bound. Lines are sorted (cluster.idx is), so each prefix is one contiguous run.
export class BlockSelector {
  readonly out: Map<string, ClusterBlock[]>;
  private done = new Set<string>();
  private prev: ClusterBlock | null = null;
  constructor(private prefixes: string[]) { this.out = new Map(prefixes.map((p) => [p, []])); }
  push(line: string) {
    const b = parseClusterLine(line);
    if (!b) return;
    for (const p of this.prefixes) {
      if (this.done.has(p)) continue;
      const list = this.out.get(p)!;
      if (b.key.startsWith(p)) { if (!list.length && this.prev) list.push(this.prev); list.push(b); }
      else if (b.key > p) { if (!list.length && this.prev) list.push(this.prev); if (list.length) list.push(b); this.done.add(p); }
    }
    this.prev = b;
  }
}
export function selectBlocks(lines: Iterable<string>, prefixes: string[]): Map<string, ClusterBlock[]> {
  const s = new BlockSelector(prefixes);
  for (const line of lines) s.push(line);
  return s.out;
}
// The blocks worth reading: every block not wholly inside one board, evenly thinned to `cap`. Slugs from every block's
// first key come free. The last block is the end bound only (unless it is the only one).
export function planBlocks(blocks: ClusterBlock[], cap: number): { read: ClusterBlock[]; skipped: number; free: string[] } {
  const free: string[] = [], read: ClusterBlock[] = [];
  const n = blocks.length > 1 ? blocks.length - 1 : blocks.length;
  let skipped = 0;
  for (let i = 0; i < n; i++) {
    const b = blocks[i], next = blocks[i + 1];
    free.push(b.key);
    const root = boardRoot(b.key);
    if (root && next && next.key.startsWith(root)) { skipped++; continue; }
    read.push(b);
  }
  if (blocks.length > 1) free.push(blocks[blocks.length - 1].key);
  if (read.length <= cap) return { read, skipped, free };
  const thin = Array.from({ length: cap }, (_, i) => read[Math.floor((i * read.length) / cap)]);
  return { read: thin, skipped: skipped + read.length - cap, free };
}
// A cdx line ("<surt> <timestamp> {json}") -> its URL, the JSON's own (case kept) or else rebuilt from the key.
const CDX_URL = /"url":\s*"([^"]+)"/;
export function urlOfCdxLine(line: string): string | null {
  const m = CDX_URL.exec(line);
  if (m) return m[1].replace(/\\\//g, "/");
  return surtToUrl(line.split(" ")[0]);
}
async function* textLines(body: ReadableStream<Uint8Array>): AsyncGenerator<string> {
  let buf = "";
  for await (const chunk of body.pipeThrough(new TextDecoderStream())) {
    buf += chunk;
    let i;
    while ((i = buf.indexOf("\n")) >= 0) { yield buf.slice(0, i); buf = buf.slice(i + 1); }
  }
  if (buf) yield buf;
}
// The weekly crawl names after the newest known one, up to `now` (CC-MAIN-YYYY-WW), newest first.
export function laterCrawlNames(known: string[], now: number): string[] {
  const m = known.map((c) => /^CC-MAIN-(\d{4})-(\d{2})$/.exec(c)).filter(Boolean).map((x) => [Number(x![1]), Number(x![2])] as [number, number]).sort((a, b) => b[0] - a[0] || b[1] - a[1])[0];
  if (!m) return [];
  const d = new Date(now), y = d.getUTCFullYear();
  const jan1 = Date.UTC(y, 0, 1), week = Math.min(53, Math.floor((now - jan1) / (7 * 86400000)) + 1);
  const out: string[] = [];
  for (let yy = m[0], ww = m[1] + 1; yy < y || (yy === y && ww <= week); ww++) {
    if (ww > 53) { yy++; ww = 0; continue; }
    out.push(`CC-MAIN-${yy}-${String(ww).padStart(2, "0")}`);
  }
  return out.reverse();
}
export async function ccDataCandidates(o: {
  net?: Net; crawls: string[]; latest?: number; prefixes?: typeof CC_DATA_PREFIXES; maxBlocks?: number; gapMs?: number; concurrency?: number;
  deadline?: number; log?: (s: string) => void; now?: number;
}): Promise<{ candidates: Candidate[]; crawls: string[]; blocks_read: number; blocks_skipped: number; bytes: number; errors: number; by_prefix: Record<string, { blocks: number; read: number; slugs: number }>; blocked?: boolean }> {
  const net = o.net ?? realNet, log = o.log ?? (() => {});
  const host = "data.commoncrawl.org", base = `https://${host}`;
  const pacer = new HostPacer({ gapMs: o.gapMs ?? 250, now: net.now, sleep: net.sleep });
  const prefixes = o.prefixes ?? CC_DATA_PREFIXES;
  const empty = { candidates: [] as Candidate[], crawls: [] as string[], blocks_read: 0, blocks_skipped: 0, bytes: 0, errors: 0, by_prefix: {} as Record<string, { blocks: number; read: number; slugs: number }> };
  await pacer.wait(host);
  const robots = await (async () => { try { const r = await net.fetch(`${base}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) }); return robotsFromResponse(r.status, r.status === 200 ? await r.text() : (await r.body?.cancel().catch(() => {}), "")); } catch { return DISALLOW_ALL; } })();
  const idxPath = (c: string) => `/cc-index/collections/${c}/indexes/cluster.idx`;
  if (!robots.allowed(idxPath(o.crawls[0] ?? "CC-MAIN-2026-39"))) { log(`CCDATA ${host} robots.txt disallows the index files`); return { ...empty, blocked: true }; }
  // The crawls: newer weekly names that exist (a HEAD each), then the given ones; the latest `latest` of them.
  const names: string[] = [];
  for (const c of laterCrawlNames(o.crawls, o.now ?? net.now())) {
    if (!robots.allowed(idxPath(c))) continue;
    await pacer.wait(host);
    try { const r = await net.fetch(`${base}${idxPath(c)}`, { method: "HEAD", headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) }); if (r.status === 200) names.push(c); await r.body?.cancel().catch(() => {}); } catch { /* not there */ }
  }
  const crawls = [...names, ...o.crawls].slice(0, o.latest ?? 2);
  const found = new Map<string, Candidate>();
  const by: Record<string, { blocks: number; read: number; slugs: number }> = {};
  let read = 0, skipped = 0, bytes = 0, errors = 0;
  const add = (url: string | null, crawl: string, p: string) => {
    const s = url ? slugFromUrl(url) : null;
    if (!s) return;
    const k = keyOf(s.provider, s.slug);
    if (!found.has(k)) { found.set(k, { ...s, source: `ccdata:${crawl}` }); by[p].slugs++; }
  };
  // 1. Every crawl's cluster.idx, streamed once: the blocks under each prefix, and the slugs their first keys name.
  const surts = prefixes.map((p) => p.surt);
  const queues = new Map<string, { b: ClusterBlock; p: string; crawl: string }[]>(surts.map((s) => [s, []]));
  for (const crawl of crawls) {
    if (o.deadline && net.now() >= o.deadline) break;
    await pacer.wait(host);
    let res: Response | null = null;
    try { res = await net.fetch(`${base}${idxPath(crawl)}`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(900000) }); } catch (e) { log(`CCDATA ${crawl} cluster.idx: ${(e as Error).message}`); }
    if (!res || res.status !== 200 || !res.body) { errors++; await res?.body?.cancel().catch(() => {}); log(`CCDATA ${crawl} cluster.idx HTTP ${res?.status ?? 0}`); continue; }
    const selector = new BlockSelector(surts);
    let n = 0;
    try { for await (const line of textLines(res.body)) { selector.push(line); n++; } } catch (e) { errors++; log(`CCDATA ${crawl} cluster.idx cut at line ${n}: ${(e as Error).message}`); }
    const sel = selector.out;
    log(`CCDATA ${crawl} cluster.idx: ${n} lines, ${[...sel.values()].reduce((a, l) => a + l.length, 0)} blocks under the prefixes`);
    for (const p of prefixes) {
      by[p.surt] ??= { blocks: 0, read: 0, slugs: 0 };
      const blocks = sel.get(p.surt) ?? [];
      const plan = planBlocks(blocks, o.maxBlocks ?? 1500);
      by[p.surt].blocks += blocks.length;
      skipped += plan.skipped;
      for (const k of plan.free) add(surtToUrl(k), crawl, p.surt);
      for (const b of plan.read) if (robots.allowed(`/cc-index/collections/${crawl}/indexes/${b.file}`)) queues.get(p.surt)!.push({ b, p: p.surt, crawl });
      log(`CCDATA ${crawl} ${p.surt}: ${blocks.length} blocks, reading ${plan.read.length}, ${plan.skipped} inside one board`);
    }
  }
  // 2. The blocks, round-robin across prefixes: a deadline thins every provider alike instead of dropping the last ones.
  const jobs: { b: ClusterBlock; p: string; crawl: string }[] = [];
  for (let i = 0, more = true; more; i++) { more = false; for (const q of queues.values()) if (i < q.length) { jobs.push(q[i]); more = true; } }
  let next = 0;
  await Promise.all(Array.from({ length: Math.max(1, o.concurrency ?? 3) }, async () => {
    while (next < jobs.length) {
      if (o.deadline && net.now() >= o.deadline) { log(`CCDATA deadline: ${jobs.length - next} blocks not read`); next = jobs.length; return; }
      const { b, p, crawl } = jobs[next++];
      await pacer.wait(host);
      let r: Response | null = null;
      try {
        r = await net.fetch(`${base}/cc-index/collections/${crawl}/indexes/${b.file}`, { headers: { "user-agent": USER_AGENT, range: `bytes=${b.offset}-${b.offset + b.length - 1}` }, signal: AbortSignal.timeout(120000) });
      } catch { r = null; }
      // Only a 206 is a block: a 200 would be the whole shard (gigabytes), so it is dropped unread.
      if (!r || r.status !== 206 || !r.body) {
        errors++;
        if (r && (r.status === 429 || r.status === 503)) pacer.backoff(host, Number(r.headers.get("retry-after")) || null);
        await r?.body?.cancel().catch(() => {});
        continue;
      }
      pacer.relax(host);
      try {
        const gz = new Uint8Array(await r.arrayBuffer());
        bytes += gz.length;
        const text = await new Response(new Blob([gz]).stream().pipeThrough(new DecompressionStream("gzip"))).text();
        let root: string | null = null;
        for (const line of text.split("\n")) {
          if (!line || (root && line.startsWith(root))) continue; // the same board as the line before
          add(urlOfCdxLine(line), crawl, p);
          root = boardRoot(line.slice(0, line.indexOf(" ")));
        }
        read++; by[p].read++;
      } catch { errors++; }
    }
  }));
  return { candidates: [...found.values()], crawls, blocks_read: read, blocks_skipped: skipped, bytes, errors, by_prefix: by };
}

// ------------------------------------------------------------------------------------------------ sitemaps
// WO-044. The boards' own hosts: their robots.txt names their sitemaps (or /sitemap.xml is tried when it names none and
// robots allows it). A sitemap index is followed to its sitemaps; every <loc> is a candidate URL. Paced, robots obeyed,
// capped in files per host.
export const SITEMAP_HOSTS = ["boards.greenhouse.io", "job-boards.greenhouse.io", "jobs.lever.co", "jobs.ashbyhq.com", "apply.workable.com"];
export function locsOf(xml: string): { index: boolean; locs: string[] } {
  const index = /<sitemapindex[\s>]/i.test(xml);
  const locs = [...String(xml || "").matchAll(/<loc>\s*(?:<!\[CDATA\[)?\s*([^<\]]+?)\s*(?:\]\]>)?\s*<\/loc>/gi)].map((m) => m[1].replace(/&amp;/g, "&"));
  return { index, locs };
}
export async function sitemapCandidates(o: { net?: Net; hosts?: string[]; maxFiles?: number; gapMs?: number; deadline?: number; log?: (s: string) => void }): Promise<{ candidates: Candidate[]; files: number; errors: number; by_host: Record<string, { sitemaps: number; files: number; slugs: number }> }> {
  const net = o.net ?? realNet, log = o.log ?? (() => {});
  const pacer = new HostPacer({ gapMs: o.gapMs ?? 1000, now: net.now, sleep: net.sleep });
  const found = new Map<string, Candidate>();
  const by: Record<string, { sitemaps: number; files: number; slugs: number }> = {};
  let files = 0, errors = 0;
  const robotsCache = new Map<string, Robots>();
  async function robotsOf(host: string) {
    if (!robotsCache.has(host)) {
      await pacer.wait(host);
      let rb: Robots;
      try { const r = await net.fetch(`https://${host}/robots.txt`, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(30000) }); rb = robotsFromResponse(r.status, r.status === 200 ? await r.text() : (await r.body?.cancel().catch(() => {}), "")); } catch { rb = DISALLOW_ALL; }
      robotsCache.set(host, rb);
    }
    return robotsCache.get(host)!;
  }
  for (const host of o.hosts ?? SITEMAP_HOSTS) {
    by[host] = { sitemaps: 0, files: 0, slugs: 0 };
    const rb = await robotsOf(host);
    const queue = [...(rb.sitemaps ?? [])];
    if (!queue.length && rb.allowed("/sitemap.xml")) queue.push(`https://${host}/sitemap.xml`);
    by[host].sitemaps = queue.length;
    const seenFiles = new Set<string>();
    while (queue.length && by[host].files < (o.maxFiles ?? 200)) {
      if (o.deadline && net.now() >= o.deadline) break;
      const url = queue.shift()!;
      if (seenFiles.has(url)) continue;
      seenFiles.add(url);
      let u: URL;
      try { u = new URL(url); } catch { continue; }
      const frb = await robotsOf(u.host);
      if (!frb.allowed(u.pathname + u.search)) { log(`SITEMAP ${url} blocked by robots`); continue; }
      await pacer.wait(u.host);
      let r: Response | null = null;
      try { r = await net.fetch(url, { headers: { "user-agent": USER_AGENT }, signal: AbortSignal.timeout(60000) }); } catch { r = null; }
      if (!r || r.status !== 200 || !r.body) { errors++; await r?.body?.cancel().catch(() => {}); continue; }
      let text: string;
      try {
        const gz = /\.gz($|\?)/.test(u.pathname) || /gzip/.test(r.headers.get("content-type") ?? "");
        text = gz ? await new Response(r.body.pipeThrough(new DecompressionStream("gzip"))).text() : await r.text();
      } catch { errors++; continue; }
      files++; by[host].files++;
      const { index, locs } = locsOf(text);
      if (index) { queue.push(...locs); continue; }
      for (const l of locs) {
        const s = slugFromUrl(l);
        if (!s) continue;
        const k = keyOf(s.provider, s.slug);
        if (!found.has(k)) { found.set(k, { ...s, source: `sitemaps:${host}` }); by[host].slugs++; }
      }
    }
    log(`SITEMAP ${host}: ${by[host].sitemaps} advertised, ${by[host].files} files read, ${by[host].slugs} slugs`);
  }
  return { candidates: [...found.values()], files, errors, by_host: by };
}

// ------------------------------------------------------------------------------------------------ the directory
// Verified boards join the directory as "live" (watched: since WO-044 ingest reads every provider here). Existing
// entries are never removed; an existing entry verified again gets its date and count refreshed (a discovered_unsupported
// entry on a provider ingest now reads becomes live). Dead, unverifiable, robots-blocked and errored rows add nothing.
// ATS vendors' own boards are skipped.
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
      boards[at].postings_seen = r.postings ?? 0; boards[at].last_verified = today; refreshed++;
      if (SUPPORTED.has(r.provider)) boards[at].status = "live";
      continue;
    }
    index.set(k, boards.length);
    boards.push({ company: r.board_name || (r.provider === "workday" ? r.slug.split(".")[0] : r.slug), provider: r.provider, board_token: r.slug,
      status: SUPPORTED.has(r.provider) ? "live" : "discovered_unsupported", postings_seen: r.postings ?? 0, last_verified: today, source: `${r.source.startsWith("ccdata") || r.source.startsWith("sitemaps") ? "wo044" : "wo037"}-${r.source.split(":")[0]}` });
    added++;
  }
  const live = boards.filter((b) => b.status === "live").length;
  return { directory: { meta: { ...directory.meta, live_supported: live, wo037: { date: today, added, refreshed, ...summary } }, boards }, added, refreshed };
}

export function tally(rows: VerdictRow[]) {
  const t: Record<string, number> = {};
  for (const r of rows) t[`${r.provider}:${r.verdict}`] = (t[`${r.provider}:${r.verdict}`] ?? 0) + 1;
  const live = rows.filter((r) => r.verdict === "live");
  const per = (f: (r: VerdictRow) => string) => { const o: Record<string, number> = {}; for (const r of live) o[f(r)] = (o[f(r)] ?? 0) + 1; return o; };
  const probedBy: Record<string, number> = {};
  for (const r of rows) { const s = r.source.split(":")[0]; probedBy[s] = (probedBy[s] ?? 0) + 1; }
  return { by: t, verified_boards: live.length, verified_supported: live.filter((r) => SUPPORTED.has(r.provider)).length,
    verified_with_postings: live.filter((r) => (r.postings ?? 0) > 0).length,
    verified_by_provider: per((r) => r.provider), verified_by_source: per((r) => r.source.split(":")[0]), probed_by_source: probedBy,
    conditional: Object.fromEntries(PROVIDERS.map((p) => { const l = live.filter((r) => r.provider === p); return [p, { live: l.length, etag: l.filter((r) => r.etag).length, last_modified: l.filter((r) => r.last_modified).length }]; })) };
}
