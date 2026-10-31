// The only way any adapter fetches a web page: default deny. A fetch happens only if
//   1. the host is on the allowlist (a site whose terms a human reviewed; the review is dated and expires after 365 days),
//   2. the host is not on the hard blocklist (LinkedIn, Indeed, Handshake, Glassdoor, ZipRecruiter: never, even if listed),
//   3. the URL is https and the path is inside the rule's allowed prefixes,
//   4. robots.txt for that host was read and allows our user agent for that path (unreadable robots = deny),
//   5. the per-host delay (rule, or robots Crawl-delay if longer) has passed.
// It never logs in, never sends cookies, never follows a redirect off the host, and treats a login wall as a stop.
// The network is a seam (Fetcher): tests pass fixtures; nothing here calls fetch() on its own.
import { isBlockedHost } from "./types.ts";

export interface SiteRule {
  host: string;                 // exact host, e.g. "www.sec.gov"
  org_name: string;             // the organization the pages belong to (firm / university / conference)
  terms_url: string;            // the page a human read
  terms_reviewed_on: string;    // YYYY-MM-DD
  terms_reviewed_by: string;    // a name or role
  terms_summary: string;        // what the terms allow, one sentence
  license_note: string;         // goes on every contact taken from this site
  path_prefixes?: string[];     // default: any path robots allows
  min_delay_ms?: number;        // default 2000
}
export interface FetchResult { status: number; url: string; text: string }
export type Fetcher = (url: string, init: { headers: Record<string, string> }) => Promise<FetchResult>;
export type GateDeny = "not_allowlisted" | "blocked_site" | "not_https" | "path_not_allowed" | "terms_review_expired" | "robots_disallow" | "robots_unavailable"
  | "login_wall" | "redirect_off_site" | "http_error" | "fetch_error" | "bad_user_agent";
export type GateResult = { ok: true; text: string; final_url: string; retrieved_at: string; rule: SiteRule } | { ok: false; reason: GateDeny; detail?: string };

interface RobotsRule { allow: boolean; pat: string }
export interface Robots { rules: RobotsRule[]; crawlDelayS: number }
export function parseRobots(text: string, token: string): Robots {
  const groups: Array<{ agents: string[]; rules: RobotsRule[]; delay: number }> = [];
  let cur: { agents: string[]; rules: RobotsRule[]; delay: number } | null = null, lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, "").trim(); const i = line.indexOf(":"); if (i < 0) continue;
    const k = line.slice(0, i).trim().toLowerCase(), v = line.slice(i + 1).trim();
    if (k === "user-agent") { if (!cur || !lastWasAgent) { cur = { agents: [], rules: [], delay: 0 }; groups.push(cur); } cur.agents.push(v.toLowerCase()); lastWasAgent = true; continue; }
    lastWasAgent = false; if (!cur) continue;
    if (k === "allow" || k === "disallow") { if (v !== "" || k === "allow") cur.rules.push({ allow: k === "allow", pat: v }); }
    else if (k === "crawl-delay") { const n = Number(v); if (Number.isFinite(n) && n >= 0) cur.delay = n; }
  }
  const t = token.toLowerCase();
  const specific = groups.filter((g) => g.agents.some((a) => a !== "*" && t.includes(a)));
  const chosen = specific.length ? specific : groups.filter((g) => g.agents.includes("*"));
  return { rules: chosen.flatMap((g) => g.rules), crawlDelayS: Math.max(0, ...chosen.map((g) => g.delay)) };
}
function patMatch(pat: string, path: string): boolean {
  if (pat === "") return false;
  const end = pat.endsWith("$"); const body = end ? pat.slice(0, -1) : pat;
  const re = new RegExp("^" + body.split("*").map((s) => s.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + (end ? "$" : ""));
  return re.test(path);
}
export function robotsAllows(r: Robots, pathAndQuery: string): boolean {
  let best: RobotsRule | null = null;
  for (const rule of r.rules) if (patMatch(rule.pat, pathAndQuery)) {
    if (!best || rule.pat.length > best.pat.length || (rule.pat.length === best.pat.length && rule.allow && !best.allow)) best = rule;
  }
  return best ? best.allow : true;
}

const LOGIN_PATH = /\/(login|log-in|signin|sign-in|sso|auth|authenticate|account\/login|uas\/login)(\/|$|\?)/i;
const LOGIN_BODY = /<input[^>]+type=["']password["']/i;

export class WebGate {
  private robots = new Map<string, Robots | "unavailable">();
  private last = new Map<string, number>();
  constructor(private o: {
    allowlist: SiteRule[]; fetcher: Fetcher; userAgent: string; robotsToken?: string;
    now?: () => Date; sleep?: (ms: number) => Promise<void>; maxAgeDays?: number;
  }) {}
  private now() { return (this.o.now ?? (() => new Date()))(); }
  private sleep(ms: number) { return (this.o.sleep ?? ((m: number) => new Promise<void>((r) => setTimeout(r, m))))(ms); }
  ruleFor(host: string): SiteRule | undefined { return this.o.allowlist.find((r) => r.host.toLowerCase() === host.toLowerCase()); }

  // Pre-flight with no network: allowlist, blocklist, scheme, path, review age.
  precheck(url: string): { ok: true; u: URL; rule: SiteRule } | { ok: false; reason: GateDeny; detail?: string } {
    let u: URL; try { u = new URL(url); } catch { return { ok: false, reason: "not_https", detail: "unparseable" }; }
    if (isBlockedHost(u.hostname)) return { ok: false, reason: "blocked_site" };
    if (u.protocol !== "https:") return { ok: false, reason: "not_https" };
    const rule = this.ruleFor(u.hostname);
    if (!rule || isBlockedHost(rule.host)) return { ok: false, reason: rule ? "blocked_site" : "not_allowlisted" };
    const rev = Date.parse(rule.terms_reviewed_on);
    const maxAge = (this.o.maxAgeDays ?? 365) * 86400000;
    if (!rule.terms_url || !rule.terms_reviewed_by || Number.isNaN(rev) || this.now().getTime() - rev > maxAge || rev > this.now().getTime() + 86400000) return { ok: false, reason: "terms_review_expired" };
    if (rule.path_prefixes?.length && !rule.path_prefixes.some((p) => u.pathname.startsWith(p))) return { ok: false, reason: "path_not_allowed" };
    if (!this.o.userAgent || this.o.userAgent.length < 10) return { ok: false, reason: "bad_user_agent" };
    return { ok: true, u, rule };
  }
  private async pace(host: string, rule: SiteRule, crawlDelayS: number) {
    const gap = Math.max(rule.min_delay_ms ?? 2000, crawlDelayS * 1000);
    const prev = this.last.get(host);
    if (prev != null) { const wait = prev + gap - this.now().getTime(); if (wait > 0) await this.sleep(wait); }
    this.last.set(host, this.now().getTime());
  }
  private async getRobots(u: URL, rule: SiteRule): Promise<Robots | "unavailable"> {
    const cached = this.robots.get(u.host); if (cached) return cached;
    let out: Robots | "unavailable";
    try {
      await this.pace(u.host, rule, 0);
      const r = await this.o.fetcher(`https://${u.host}/robots.txt`, { headers: { "User-Agent": this.o.userAgent, Accept: "text/plain" } });
      const sameHost = (() => { try { return new URL(r.url).host === u.host; } catch { return false; } })();
      if (r.status === 200 && sameHost) out = parseRobots(r.text, this.o.robotsToken ?? this.o.userAgent.split(/[\s/]/)[0]);
      else if (r.status === 404 || r.status === 410) out = { rules: [], crawlDelayS: 0 };
      else out = "unavailable"; // 401/403/429/5xx/redirect elsewhere: cannot tell, so do not crawl
    } catch { out = "unavailable"; }
    this.robots.set(u.host, out); return out;
  }
  async fetchText(url: string): Promise<GateResult> {
    const pre = this.precheck(url); if (!pre.ok) return pre;
    const { u, rule } = pre;
    const rb = await this.getRobots(u, rule);
    if (rb === "unavailable") return { ok: false, reason: "robots_unavailable" };
    if (!robotsAllows(rb, u.pathname + u.search)) return { ok: false, reason: "robots_disallow" };
    await this.pace(u.host, rule, rb.crawlDelayS);
    let r: FetchResult;
    try { r = await this.o.fetcher(u.toString(), { headers: { "User-Agent": this.o.userAgent, Accept: "text/html,application/xhtml+xml,application/json,application/xml;q=0.9" } }); }
    catch (e) { return { ok: false, reason: "fetch_error", detail: String((e as Error)?.message ?? e).slice(0, 120) }; }
    let fu: URL; try { fu = new URL(r.url || url); } catch { fu = u; }
    if (fu.host !== u.host) return { ok: false, reason: "redirect_off_site", detail: fu.host };
    if (r.status === 401 || r.status === 403 || LOGIN_PATH.test(fu.pathname + fu.search) && !LOGIN_PATH.test(u.pathname)) return { ok: false, reason: "login_wall", detail: String(r.status) };
    if (r.status < 200 || r.status >= 300) return { ok: false, reason: "http_error", detail: String(r.status) };
    if (LOGIN_BODY.test(r.text)) return { ok: false, reason: "login_wall", detail: "password field" };
    return { ok: true, text: r.text, final_url: fu.toString(), retrieved_at: this.now().toISOString(), rule };
  }
}
