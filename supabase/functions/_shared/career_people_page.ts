// PEOPLE FINDING (D-033): a public page the person sends (a company's team or about page, or someone's own site), read
// once on their ask. Trainee has no web search (none is wired in the product: checked 2026-10-26), so it never looks a
// page up itself; it reads only the link it was given.
//
// What counts as a person: a schema.org Person the page itself publishes (JSON-LD: name, jobTitle, worksFor, alumniOf,
// email), and an address the page publishes as a mailto: link, named only when the link's own words are a name. Page
// prose is never mined for names, and no address is ever made up: an email is only one the page wrote.
// Never LinkedIn, Indeed or Handshake (owner rule: never automate them), never a private or local address, never a
// non-HTTPS page, never a page the site's robots.txt disallows; at most 3 redirects, each checked again; 2 MB, 8 s.
import { cleanCell, cleanEmail } from "./career_people_import.ts";
import { registrable } from "./career_people_gmail.ts";

export const PAGE_MAX_BYTES = 2_000_000, PAGE_TIMEOUT_MS = 8_000, MAX_REDIRECTS = 3, MAX_PEOPLE = 200;
export const UA = "TraineeBot/1.0 (reads one page a person sent; no crawling)";
const BLOCKED = ["linkedin.com", "lnkd.in", "indeed.com", "indeedemail.com", "indeedmail.com", "joinhandshake.com"];

export type PageWhy = "bad_url" | "not_https" | "blocked_site" | "private_host" | "robots" | "too_large" | "not_html" | "http" | "timeout" | "network" | "redirects";
export interface PagePerson { name: string | null; title: string; company: string; school: string; email: string | null; how: "schema.org Person" | "mailto link" }
export type PageRead = { ok: true; url: string; people: PagePerson[]; org: string | null } | { ok: false; why: PageWhy; detail?: string };

// A host Trainee may fetch: a public DNS name with a dot, never an IP literal, never localhost or an internal suffix.
export function checkUrl(raw: string): { ok: true; url: URL } | { ok: false; why: PageWhy } {
  let u: URL;
  try { u = new URL(String(raw ?? "").trim()); } catch { return { ok: false, why: "bad_url" }; }
  if (u.protocol !== "https:") return { ok: false, why: "not_https" };
  if (u.username || u.password || (u.port && u.port !== "443")) return { ok: false, why: "bad_url" };
  const h = u.hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED.includes(registrable(h).full)) return { ok: false, why: "blocked_site" };
  if (!h.includes(".") || /^\[|^[\d.]+$|^0x|:/.test(h) || /(^|\.)(localhost|local|internal|intranet|lan|home|corp|test|example|invalid|arpa)$/.test(h)) return { ok: false, why: "private_host" };
  return { ok: true, url: u };
}

async function timed(f: typeof fetch, url: string, init: RequestInit): Promise<Response> {
  const ac = new AbortController();
  const t = setTimeout(() => ac.abort(), PAGE_TIMEOUT_MS);
  try { return await f(url, { ...init, signal: ac.signal }); } finally { clearTimeout(t); }
}
async function capped(r: Response, max: number): Promise<string | null> {
  const reader = r.body?.getReader();
  if (!reader) return "";
  const parts: Uint8Array[] = [];
  let n = 0;
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    n += value.length;
    if (n > max) { await reader.cancel().catch(() => {}); return null; }
    parts.push(value);
  }
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) { out.set(p, o); o += p.length; }
  return new TextDecoder().decode(out);
}

// robots.txt, the group for "*" (or this agent): a Disallow prefix that matches the path refuses the read; an Allow that
// matches it longer wins. No robots.txt (or an unreadable one) is no rule.
export function robotsAllows(txt: string, path: string): boolean {
  let applies = false, inGroup = false, best = { len: -1, allow: true };
  for (const raw of String(txt ?? "").split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    const m = /^([A-Za-z-]+)\s*:\s*(.*)$/.exec(line);
    if (!m) continue;
    const k = m[1].toLowerCase(), v = m[2].trim();
    if (k === "user-agent") { if (!inGroup) applies = false; inGroup = true; if (v === "*" || /traineebot/i.test(v)) applies = true; continue; }
    inGroup = false;
    if (!applies || (k !== "disallow" && k !== "allow") || !v) continue;
    const rx = new RegExp("^" + v.replace(/[.+?^${}()|[\]\\]/g, "\\$&").replace(/\*/g, ".*").replace(/\\\$$/, "$"));
    if (rx.test(path) && v.length > best.len) best = { len: v.length, allow: k === "allow" };
  }
  return best.allow;
}

export async function readPage(f: typeof fetch, raw: string): Promise<PageRead> {
  const c = checkUrl(raw);
  if (!c.ok) return { ok: false, why: c.why };
  let url = c.url;
  try {
    const rob = await timed(f, `${url.origin}/robots.txt`, { headers: { "user-agent": UA }, redirect: "manual" }).catch(() => null);
    if (rob && rob.ok) { const txt = await capped(rob, 200_000); if (txt !== null && !robotsAllows(txt, url.pathname + url.search)) return { ok: false, why: "robots" }; }
    else await rob?.body?.cancel().catch(() => {});
    for (let hop = 0; ; hop++) {
      const r = await timed(f, url.toString(), { headers: { "user-agent": UA, accept: "text/html" }, redirect: "manual" });
      if (r.status >= 300 && r.status < 400 && r.headers.get("location")) {
        await r.body?.cancel().catch(() => {});
        if (hop >= MAX_REDIRECTS) return { ok: false, why: "redirects" };
        const next = checkUrl(new URL(r.headers.get("location")!, url).toString());
        if (!next.ok) return { ok: false, why: next.why };
        url = next.url;
        continue;
      }
      if (!r.ok) { await r.body?.cancel().catch(() => {}); return { ok: false, why: "http", detail: `HTTP ${r.status}` }; }
      if (!/text\/html|application\/xhtml/i.test(r.headers.get("content-type") ?? "")) { await r.body?.cancel().catch(() => {}); return { ok: false, why: "not_html" }; }
      if (Number(r.headers.get("content-length") ?? 0) > PAGE_MAX_BYTES) { await r.body?.cancel().catch(() => {}); return { ok: false, why: "too_large" }; }
      const html = await capped(r, PAGE_MAX_BYTES);
      if (html === null) return { ok: false, why: "too_large" };
      const { people, org } = peopleOnPage(html);
      return { ok: true, url: url.toString(), people, org };
    }
  } catch (e) {
    return { ok: false, why: (e as Error)?.name === "AbortError" ? "timeout" : "network", detail: e instanceof Error ? e.message : String(e) };
  }
}

const str = (v: unknown, max: number): string => {
  if (typeof v === "string") return cleanCell(v, max);
  if (v && typeof v === "object" && typeof (v as any).name === "string") return cleanCell((v as any).name, max);
  if (Array.isArray(v)) return str(v[0], max);
  return "";
};
const isType = (o: any, t: string) => { const x = o?.["@type"]; return Array.isArray(x) ? x.includes(t) : x === t; };
const NAME_LIKE = /^\p{Lu}[\p{L}'’.-]+(?:\s+\p{Lu}[\p{L}'’.-]*){1,3}$/u;

// Pure: the people a page publishes about itself. Exported for the tests.
export function peopleOnPage(html: string): { people: PagePerson[]; org: string | null } {
  const people: PagePerson[] = [];
  let org: string | null = null;
  const seen = new Set<string>();
  const add = (p: PagePerson) => {
    const k = `${(p.name ?? "").toLowerCase()}|${p.email ?? ""}`;
    if (seen.has(k) || people.length >= MAX_PEOPLE) return;
    seen.add(k); people.push(p);
  };
  const walk = (o: any, depth: number) => {
    if (!o || typeof o !== "object" || depth > 6) return;
    if (Array.isArray(o)) { o.slice(0, 500).forEach((x) => walk(x, depth + 1)); return; }
    if (isType(o, "Organization") && !org) org = str(o.name, 200) || null;
    if (isType(o, "Person")) {
      const name = str(o.name, 200);
      if (name && /\p{L}/u.test(name) && !/https?:|@/.test(name)) {
        const email = cleanEmail(String(o.email ?? "").replace(/^mailto:/i, ""));
        add({ name, title: str(o.jobTitle, 300), company: str(o.worksFor, 200), school: str(o.alumniOf, 200), email, how: "schema.org Person" });
      }
    }
    for (const [k, v] of Object.entries(o)) if (k !== "@context" && typeof v === "object") walk(v, depth + 1);
  };
  for (const m of html.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim()), 0); } catch { /* not JSON: nothing taken from it */ }
  }
  for (const m of html.matchAll(/<a\b[^>]*?\bhref\s*=\s*["']mailto:([^"'?]+)[^"']*["'][^>]*>([\s\S]{0,300}?)<\/a>/gi)) {
    const email = cleanEmail(decodeURIComponent(m[1]).trim());
    if (!email) continue;
    const words = cleanCell(m[2].replace(/<[^>]*>/g, " "), 200);
    const name = NAME_LIKE.test(words) ? words : null;
    if ([...people].some((p) => p.email === email)) continue;
    add({ name, title: "", company: "", school: "", email, how: "mailto link" });
  }
  return { people, org };
}
