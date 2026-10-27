// PEOPLE FINDING (D-033): the person's own Gmail, read with the career grant's gmail.readonly (career_mail_gmail.ts
// careerTokenFor; the token reader is reused, never changed). Two reads, each on the person's ask:
//
//   correspondents  people at a company the person has written to or heard from. Headers only (format=metadata: From,
//                   To, Cc, Date), never a body. An address counts only when its own domain is the company's name
//                   ("ramp.com" for Ramp), and a role inbox (careers@, noreply@) is never a person. A name is the display
//                   name the mail itself carried, or none: never made from the address.
//   job alerts      postings in the person's own Handshake and Indeed alert emails. Only mail from the senders those sites
//                   publish (Indeed: indeed.com, indeedemail.com, indeedmail.com, per its help page "How to verify emails
//                   from Indeed"; Handshake: joinhandshake.com and its subdomains, per "About Student Emails"), and only
//                   when Gmail's own authentication result passes for that domain (career_mail.ts authenticated). The
//                   body is read (format=full) for these senders alone, held in memory for the run, and only each
//                   posting's title, the words beside it and its link are kept. A link is kept exactly as the email
//                   carried it and only when it points at the same site; nothing is fetched from Indeed or Handshake.
//                   Neither site documents its alert format: a posting is an anchor whose link is a job link on that
//                   site; anything else in the mail is left alone.
import { authenticated } from "./career_mail.ts";
import { ROLE_LOCALS } from "./career_contacts.ts";
import { cleanCell, cleanEmail, companyKey } from "./career_people_import.ts";

const API = "https://gmail.googleapis.com/gmail/v1/users/me";
export type Token = (userId: string) => Promise<string | null>;
export interface GmailRead { fetch: typeof fetch; token: Token }
export type Read<T> = { status: "ok"; items: T[]; read: number } | { status: "NOT_WIRED" } | { status: "ERROR"; detail: string };

const SECOND_LEVEL = new Set(["co", "com", "ac", "org", "net", "gov", "edu"]);
// The registrable domain: "mail.ramp.com" is "ramp.com", "bank.co.uk" is "bank.co.uk".
export function registrable(domain: string): { full: string; label: string } {
  const parts = String(domain ?? "").toLowerCase().replace(/\.$/, "").split(".").filter(Boolean);
  if (parts.length < 2) return { full: parts.join("."), label: parts[0] ?? "" };
  const two = parts.length >= 3 && parts[parts.length - 1].length === 2 && SECOND_LEVEL.has(parts[parts.length - 2]);
  const take = two ? 3 : 2;
  const full = parts.slice(-take).join(".");
  return { full, label: parts[parts.length - take] };
}
// A company's name as a domain label: "Ramp" ramp, "Jane Street" janestreet, "Stripe, Inc." stripe.
export const domainLabelOf = (company: string) => companyKey(company).replace(/[^a-z0-9]/g, "");
const FREEMAIL = new Set(["gmail", "googlemail", "yahoo", "outlook", "hotmail", "live", "icloud", "me", "aol", "proton", "protonmail", "gmx", "mail", "yandex", "zoho"]);

// "Maya Chen" <maya@ramp.com>, Lee <lee@ramp.com>, plain@x.com  (quoted commas kept inside the name)
export function addresses(header: string): { name: string | null; email: string }[] {
  const out: { name: string | null; email: string }[] = [];
  const parts: string[] = [];
  let cur = "", q = false, angle = 0;
  for (const ch of String(header ?? "")) {
    if (ch === '"') q = !q;
    if (!q && ch === "<") angle++;
    if (!q && ch === ">") angle = Math.max(0, angle - 1);
    if (ch === "," && !q && !angle) { parts.push(cur); cur = ""; } else cur += ch;
  }
  parts.push(cur);
  for (const p of parts) {
    const m = /^\s*(?:"?([^"<]*?)"?\s*)?<([^>]+)>\s*$/.exec(p) ?? /^\s*()([^\s<>]+@[^\s<>]+)\s*$/.exec(p);
    if (!m) continue;
    const email = cleanEmail(m[2]);
    if (!email) continue;
    const n = cleanCell(m[1] ?? "", 200).replace(/^'+|'+$/g, "");
    out.push({ name: n && !n.includes("@") && /\p{L}/u.test(n) ? n : null, email });
  }
  return out;
}

async function getJson(d: GmailRead, url: string, token: string): Promise<{ ok: true; body: any } | { ok: false; status: number }> {
  const r = await d.fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) { await r.body?.cancel().catch(() => {}); return { ok: false, status: r.status }; }
  return { ok: true, body: await r.json().catch(() => ({})) };
}
const header = (msg: any, name: string) => (msg?.payload?.headers ?? []).filter((h: any) => String(h?.name ?? "").toLowerCase() === name).map((h: any) => String(h?.value ?? ""));

// ------------------------------------------------------------------------------------------------ correspondents
export interface Correspondent { name: string | null; email: string; domain: string; last_seen_at: string; message_hash: string }
export async function correspondentsAt(d: GmailRead, userId: string, company: string, o: { maxMessages?: number } = {}): Promise<Read<Correspondent>> {
  const label = domainLabelOf(company);
  if (label.length < 2 || FREEMAIL.has(label)) return { status: "ok", items: [], read: 0 };
  const token = await d.token(userId).catch(() => null);
  if (!token) return { status: "NOT_WIRED" };
  try {
    const me = await getJson(d, `${API}/profile`, token);
    const mine = me.ok ? cleanEmail(me.body?.emailAddress) : null;
    const q = `{from:${label} to:${label} cc:${label}} -in:chats -in:spam -in:trash`;
    const list = await getJson(d, `${API}/messages?q=${encodeURIComponent(q)}&maxResults=${o.maxMessages ?? 25}`, token);
    if (!list.ok) return { status: "ERROR", detail: `list messages: HTTP ${list.status}` };
    const ids: string[] = (list.body?.messages ?? []).map((m: any) => String(m?.id ?? "")).filter(Boolean).slice(0, o.maxMessages ?? 25);
    const by = new Map<string, Correspondent>();
    let read = 0;
    for (const id of ids) {
      const g = await getJson(d, `${API}/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Cc&metadataHeaders=Date&fields=id,internalDate,payload/headers`, token);
      if (!g.ok) { if (g.status === 404) continue; return { status: "ERROR", detail: `read a message: HTTP ${g.status}` }; }
      read++;
      const at = new Date(Number(g.body?.internalDate) || Date.parse(header(g.body, "date")[0] ?? "") || 0).toISOString();
      const hash = await sha(`gmail:${userId}:${id}`);
      for (const a of [...header(g.body, "from"), ...header(g.body, "to"), ...header(g.body, "cc")].flatMap(addresses)) {
        const [local, domain] = a.email.split("@");
        if (a.email === mine || registrable(domain).label !== label) continue;
        if (ROLE_LOCALS.has(local) || ROLE_LOCALS.has(local.replace(/[._+-]/g, "")) || /^(no-?reply|do-?not-?reply|notifications?|mailer|bounce)/.test(local)) continue;
        const x = by.get(a.email);
        if (!x || x.last_seen_at < at) by.set(a.email, { name: a.name ?? x?.name ?? null, email: a.email, domain: registrable(domain).full, last_seen_at: at, message_hash: hash });
        else if (!x.name && a.name) x.name = a.name;
      }
    }
    return { status: "ok", items: [...by.values()].sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at)), read };
  } catch (e) {
    return { status: "ERROR", detail: e instanceof Error ? e.message : String(e) };
  }
}
async function sha(s: string) {
  return [...new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)))].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Has this address written to the person since a time (the intro's reply check): one list call, headers never read.
export async function heardFrom(d: GmailRead, userId: string, email: string, sinceMs: number): Promise<"yes" | "no" | "NOT_WIRED" | "ERROR"> {
  const e = cleanEmail(email);
  if (!e) return "no";
  const token = await d.token(userId).catch(() => null);
  if (!token) return "NOT_WIRED";
  const g = await getJson(d, `${API}/messages?q=${encodeURIComponent(`from:${e} after:${Math.floor(sinceMs / 1000)}`)}&maxResults=1`, token).catch(() => ({ ok: false as const, status: 0 }));
  if (!g.ok) return "ERROR";
  return (g.body?.messages ?? []).length ? "yes" : "no";
}

// ------------------------------------------------------------------------------------------------ job alerts
export type JobSite = "handshake" | "indeed";
const SITE: Record<JobSite, string[]> = { indeed: ["indeed.com", "indeedemail.com", "indeedmail.com"], handshake: ["joinhandshake.com"] };
export const siteOfDomain = (domain: string): JobSite | null => {
  const r = registrable(domain).full;
  return (Object.keys(SITE) as JobSite[]).find((s) => SITE[s].includes(r)) ?? null;
};
// A job link on the site: Indeed's posting and click paths, Handshake's job pages. Never anything else on the site.
const JOB_PATH: Record<JobSite, RegExp> = {
  indeed: /^\/(?:rc\/clk|pagead\/clk|viewjob|jobs?\b|m\/viewjob)|[?&]jk=[0-9a-f]{8,}/i,
  handshake: /^\/(?:stu\/)?(?:jobs|job-search|postings)\/\d+/i,
};
const NOT_A_TITLE = /^(?:view|see|apply|show|browse|manage|update|edit|unsubscribe|email preferences|privacy|terms|help|sign in|log in|download|get the app|more jobs|all jobs|search|settings|indeed|handshake|here|click here|learn more|save|dismiss)\b/i;
export interface JobEmail { source: JobSite; title: string; detail: string; url: string; message_hash: string; received_at: string }

const decodeEntities = (s: string) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&nbsp;/g, " ")
  .replace(/&#(\d{1,6});/g, (_, n) => { const c = Number(n); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; })
  .replace(/&#x([0-9a-f]{1,6});/gi, (_, h) => { const c = parseInt(h, 16); return c > 0 && c < 0x110000 ? String.fromCodePoint(c) : ""; });
// The words of some HTML, one entry per line or block (cleaned each), markup and scripts gone.
const linesOf = (html: string) => decodeEntities(html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/?(p|div|tr|td|li|h\d|table|tbody)\b[^>]*>/gi, "\n").replace(/<[^>]*>/g, " "))
  .split("\n").map((l) => cleanCell(l, 300)).filter(Boolean);
const textOf = (html: string) => linesOf(html).join(" ").slice(0, 2000);

// The postings in one alert email's HTML. Pure: the caller has already checked who sent it.
export function postingsIn(site: JobSite, html: string): { title: string; detail: string; url: string }[] {
  const out: { title: string; detail: string; url: string }[] = [];
  const seen = new Set<string>();
  const re = /<a\b[^>]*?\bhref\s*=\s*("([^"]*)"|'([^']*)')[^>]*>([\s\S]{0,600}?)<\/a>/gi;
  const src = html.slice(0, 600_000);
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) && out.length < 50) {
    const href = decodeEntities((m[2] ?? m[3] ?? "").trim());
    let u: URL;
    try { u = new URL(href); } catch { continue; }
    if (u.protocol !== "https:" || u.username || u.password || siteOfDomain(u.hostname) !== site || !JOB_PATH[site].test(u.pathname + u.search)) continue;
    const title = textOf(m[4]).trim();
    if (title.length < 2 || title.length > 200 || !/\p{L}/u.test(title) || NOT_A_TITLE.test(title) || /https?:\/\//i.test(title)) continue;
    // The words right after the link, up to the next link: the company and place, as the email wrote them.
    const after = src.slice(re.lastIndex, re.lastIndex + 1500);
    const stop = after.search(/<a\b/i);
    const detail = linesOf(stop >= 0 ? after.slice(0, stop) : after).slice(0, 2).join(" · ").slice(0, 300);
    const url = u.toString().slice(0, 2048);
    if (seen.has(url)) continue;
    seen.add(url);
    out.push({ title, detail, url });
  }
  return out;
}
const b64url = (s: string) => {
  try { return new TextDecoder().decode(Uint8Array.from(atob(String(s).replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0))); } catch { return ""; }
};
function htmlOf(payload: any, depth = 0): string {
  if (!payload || depth > 6) return "";
  if (String(payload.mimeType ?? "").toLowerCase() === "text/html" && payload.body?.data) return b64url(payload.body.data).slice(0, 600_000);
  for (const p of Array.isArray(payload.parts) ? payload.parts : []) { const h = htmlOf(p, depth + 1); if (h) return h; }
  return "";
}

export async function readJobAlerts(d: GmailRead, userId: string, o: { days?: number; maxMessages?: number } = {}): Promise<Read<JobEmail> & { refused?: number }> {
  const token = await d.token(userId).catch(() => null);
  if (!token) return { status: "NOT_WIRED" };
  try {
    const q = `from:(${[...SITE.indeed, ...SITE.handshake].join(" OR ")}) newer_than:${o.days ?? 30}d -in:spam -in:trash`;
    const list = await getJson(d, `${API}/messages?q=${encodeURIComponent(q)}&maxResults=${o.maxMessages ?? 20}`, token);
    if (!list.ok) return { status: "ERROR", detail: `list messages: HTTP ${list.status}` };
    const ids: string[] = (list.body?.messages ?? []).map((m: any) => String(m?.id ?? "")).filter(Boolean).slice(0, o.maxMessages ?? 20);
    const items: JobEmail[] = [];
    let read = 0, refused = 0;
    for (const id of ids) {
      const g = await getJson(d, `${API}/messages/${encodeURIComponent(id)}?format=full`, token);
      if (!g.ok) { if (g.status === 404) continue; return { status: "ERROR", detail: `read a message: HTTP ${g.status}` }; }
      read++;
      const from = addresses(header(g.body, "from")[0] ?? "")[0];
      const site = from ? siteOfDomain(from.email.split("@")[1]) : null;
      if (!from || !site || !authenticated(header(g.body, "authentication-results"), from.email.split("@")[1])) { refused++; continue; }
      const at = new Date(Number(g.body?.internalDate) || Date.parse(header(g.body, "date")[0] ?? "") || Date.now()).toISOString();
      const hash = await sha(`gmail:${userId}:${id}`);
      for (const p of postingsIn(site, htmlOf(g.body?.payload))) items.push({ source: site, ...p, message_hash: hash, received_at: at });
    }
    return { status: "ok", items, read, refused };
  } catch (e) {
    return { status: "ERROR", detail: e instanceof Error ? e.message : String(e) };
  }
}
