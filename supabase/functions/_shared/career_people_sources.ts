// #20 networking (owner, 2026-10-22: "Both"): Trainee reaches out only to real people a source shows, and never makes a
// person up. A contact is SOURCED when one of these holds, and only then may Trainee draft to them or name them as a path:
//   own_export   a row of a file the person sent themselves (their LinkedIn connections export, a list they keep): the
//                file, the row, and when Trainee read it. It is the person's own record of who they know. No URL is kept
//                for it: WO-033 never stores a LinkedIn profile URL, and Trainee never opens one.
//   public_page  a public web page the person pointed Trainee at, read once at a recorded time: its https URL, when it
//                was read, and the page's own words showing that full name with that title, at that firm.
// Never sourced: a list vendor's claim alone (an Apollo row says where someone works; that data goes stale, so the row
// waits until a page shows it), a row read before read times were kept, and anything a model wrote. A model may PROPOSE
// who a page names; code keeps a person only when the page's text carries their name with that title and firm, and an
// email only when the page prints it (an address is never guessed from a pattern like first.last@firm).
// Every source also records what it shows (name, firm, title); a row whose firm or title no longer matches what its source
// shows is not sourced, so a draft can't say "you're an analyst at X" unless a source says so.
// This module reads. It never sends, messages or posts anything, and its page reader refuses LinkedIn and Indeed.
import { type ContactRow, normalizeFirm, sameFirm } from "./career_contacts.ts";

export type SourceKind = "own_export" | "public_page";
export interface PersonSource {
  kind: SourceKind;
  url: string | null; // public_page: the page read (after redirects); own_export: null
  ref: string; // own_export: "file, row N"; public_page: the link the person gave
  retrieved_at: string; // ISO time Trainee read it
  shows: { name: string; firm: string; title: string }; // what the source shows, as read
  quote?: string; // public_page: the page's words around the name
}
export interface NotSourced { name: string; firm: string; why: string }

const plain = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9@.]+/g, " ").replace(/(?<![a-z0-9])\.|\.(?![a-z0-9])/g, " ").replace(/\s+/g, " ").trim();
const words = (s: unknown) => String(s ?? "").toLowerCase().replace(/[’']/g, "").replace(/&/g, " and ").replace(/[^a-z0-9]+/g, " ").trim();
const hasWords = (hay: string, needle: string) => { const n = words(needle); return !!n && ` ${words(hay)} `.includes(` ${n} `); };
const iso = (t: unknown) => { const n = Date.parse(String(t ?? "")); return Number.isFinite(n) ? new Date(n).toISOString() : null; };
export const dayOf = (t: string) => t.slice(0, 10);

// ------------------------------------------------------------------------------------------------ links
// LinkedIn and Indeed are never read, by any link (never automate them). Only https, a public host name, the default port,
// no user or password in the link. A raw IP, localhost or an internal name is refused: the reader reads the public web only.
const NEVER = /(^|\.)(linkedin\.[a-z.]+|lnkd\.in|indeed\.[a-z.]+)$/i;
export function pageRefusal(link: string): string | null {
  let u: URL;
  try { u = new URL(String(link ?? "").trim()); } catch { return "that isn't a web link"; }
  const host = u.hostname.toLowerCase().replace(/\.$/, "");
  if (NEVER.test(host)) return "Trainee never opens LinkedIn or Indeed pages";
  if (u.protocol !== "https:") return "only https links are read";
  if (u.username || u.password) return "a link with a user name or password in it is never read";
  if (u.port && u.port !== "443") return "only the standard web port is read";
  if (/^[\d.]+$/.test(host) || host.includes(":") || host.startsWith("[")) return "a raw address is never read, only a public site name";
  if (!host.includes(".") || /(^|\.)(localhost|local|internal|intranet|lan|home|corp)$/.test(host)) return "only public sites are read";
  return null;
}

// ------------------------------------------------------------------------------------------------ reading a page
export type Page = { status: "ok"; url: string; text: string; retrieved_at: string } | { status: "refused" | "error" | "NOT_WIRED"; why: string };
export type PageReader = (link: string) => Promise<Page>;
export const PAGE_NOT_WIRED: PageReader = async () => ({ status: "NOT_WIRED", why: "reading web pages isn't switched on here" });

// The words a person reads on a page: scripts, styles and tags out, entities decoded, blocks on their own lines.
export function pageText(html: string): string {
  const named: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };
  return String(html ?? "")
    .replace(/<(script|style|noscript|template|svg)\b[\s\S]*?<\/\1\s*>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<\/?(p|div|li|ul|ol|tr|td|th|h[1-6]|br|section|article|header|footer|figure|figcaption|dt|dd|table)\b[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : named[e.toLowerCase()] ?? m)
    .replace(/[ \t\r\f\v ]+/g, " ").replace(/ *\n[\n ]*/g, "\n").trim();
}

// One GET of one public page the person named: no cookies, no form, no login, every redirect re-checked against the same
// rules. Bounded so one huge page can't exhaust the function (PAGE_MAX_BYTES, PAGE_TIMEOUT_MS, PAGE_REDIRECTS).
export const PAGE_MAX_BYTES = 2_000_000, PAGE_TIMEOUT_MS = 10_000, PAGE_REDIRECTS = 3;
export function httpPageReader(o: { fetch: typeof fetch; now: () => number }): PageReader {
  return async (link) => {
    let at = String(link ?? "").trim();
    for (let hop = 0; hop <= PAGE_REDIRECTS; hop++) {
      const no = pageRefusal(at);
      if (no) return { status: "refused", why: no };
      const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), PAGE_TIMEOUT_MS);
      try {
        const r = await o.fetch(at, { method: "GET", redirect: "manual", credentials: "omit", signal: ctl.signal, headers: { accept: "text/html,text/plain;q=0.9", "user-agent": "Trainee page reader (one page a person asked for)" } } as RequestInit);
        if (r.status >= 300 && r.status < 400) {
          const next = r.headers.get("location");
          await r.body?.cancel().catch(() => {});
          if (!next) return { status: "error", why: `the page answered ${r.status} with nowhere to go` };
          at = new URL(next, at).toString();
          continue;
        }
        if (r.status !== 200) { await r.body?.cancel().catch(() => {}); return { status: "error", why: `the page answered ${r.status}` }; }
        const type = r.headers.get("content-type") ?? "";
        if (!/text\/html|text\/plain|application\/xhtml/i.test(type)) { await r.body?.cancel().catch(() => {}); return { status: "error", why: "that link isn't a web page" }; }
        const reader = r.body?.getReader();
        const parts: Uint8Array[] = [];
        let size = 0;
        while (reader) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > PAGE_MAX_BYTES) { await reader.cancel().catch(() => {}); return { status: "error", why: "the page is too large to read" }; }
          parts.push(value);
        }
        const bytes = new Uint8Array(size);
        let k = 0;
        for (const p of parts) { bytes.set(p, k); k += p.byteLength; }
        const raw = new TextDecoder().decode(bytes);
        return { status: "ok", url: at, text: /html/i.test(type) ? pageText(raw) : raw, retrieved_at: new Date(o.now()).toISOString() };
      } catch (e) {
        return { status: "error", why: ctl.signal.aborted ? "the page took too long to answer" : `the page couldn't be read (${(e instanceof Error ? e.message : String(e)).slice(0, 120)})` };
      } finally { clearTimeout(timer); }
    }
    return { status: "error", why: "the link redirected too many times" };
  };
}

// ------------------------------------------------------------------------------------------------ who a page shows
export interface Candidate { name: string; title: string; firm: string; email?: string | null }
export type Extractor = (o: { url: string; text: string; firm: string | null }) => Promise<Candidate[]>;
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const NEAR = 250;
// The page's host is the firm's own site: "goldmansachs.com" for Goldman Sachs, "jpmorganchase.com" for JPMorgan.
function hostIsFirm(url: string, firm: string): boolean {
  const compact = words(normalizeFirm(firm)).replace(/ /g, "");
  if (compact.length < 3) return false;
  try { return new URL(url).hostname.toLowerCase().replace(/[^a-z0-9]/g, "").includes(compact); } catch { return false; }
}
function namesFirm(text: string, firm: string): boolean {
  if (hasWords(text, firm) || hasWords(text, normalizeFirm(firm))) return true;
  const w = String(text).split(/[\s,;()/|]+/).filter(Boolean);
  for (let i = 0; i < w.length; i++) for (let k = 1; k <= 4 && i + k <= w.length; k++) if (sameFirm(w.slice(i, i + k).join(" "), firm)) return true;
  return false;
}
// One candidate against the page as read. Kept only when the page's text has the full name (two words at least) with the
// title near it, and the firm near it too, or anywhere on the firm's own site. The email is kept only if the page prints it.
export function verifyOnPage(c: Candidate, page: { url: string; text: string; retrieved_at: string }): { ok: true; row: Omit<ContactRow, "file" | "row">; source: PersonSource } | { ok: false; why: string } {
  const name = String(c?.name ?? "").replace(/\s+/g, " ").trim(), title = String(c?.title ?? "").replace(/\s+/g, " ").trim(), firm = String(c?.firm ?? "").replace(/\s+/g, " ").trim();
  if (words(name).split(" ").length < 2) return { ok: false, why: "no full name to check" };
  if (!title) return { ok: false, why: "no title to check" };
  if (!firm) return { ok: false, why: "no firm to check" };
  const text = String(page.text ?? "").replace(/[ \t ]+/g, " ");
  const rx = new RegExp(`(?<![\\p{L}\\p{N}])${name.split(" ").map(esc).join("[\\s\\u00a0]+")}(?![\\p{L}\\p{N}])`, "giu");
  const hits = [...text.matchAll(rx)];
  if (!hits.length) return { ok: false, why: "the page doesn't name them" };
  const own = hostIsFirm(page.url, firm) && namesFirm(text, firm);
  for (const m of hits) {
    const at = m.index ?? 0, near = text.slice(Math.max(0, at - NEAR), at + m[0].length + NEAR);
    if (!hasWords(near, title)) continue;
    if (!own && !namesFirm(near, firm)) continue;
    const email = c.email && String(c.email).includes("@") && text.toLowerCase().includes(String(c.email).trim().toLowerCase()) ? String(c.email).trim().toLowerCase() : null;
    const quote = text.slice(Math.max(0, at - 120), at + m[0].length + 120).replace(/\s+/g, " ").trim();
    const shows = { name, firm: normalizeFirm(firm), title };
    return {
      ok: true,
      row: { name, email, firm: shows.firm, firm_raw: firm, company: shows.firm, title, school: "", connected_on: null },
      source: { kind: "public_page", url: page.url, ref: page.url, retrieved_at: page.retrieved_at, shows, quote },
    };
  }
  return { ok: false, why: hits.length && hits.some((m) => hasWords(text.slice(Math.max(0, (m.index ?? 0) - NEAR), (m.index ?? 0) + m[0].length + NEAR), title)) ? `the page doesn't show them at ${firm}` : `the page doesn't show them as ${title}` };
}

// A page the person named, read once; the extractor's names checked one by one against what was read.
export const EXTRACT_CHARS = 120_000; // what the extractor is shown of one page (its cost), never what is checked
export async function sourcePeopleFromPage(o: { link: string; read: PageReader; extract: Extractor | null; firm?: string | null }): Promise<
  { status: "ok"; url: string; retrieved_at: string; kept: (Omit<ContactRow, "file" | "row"> & { source: PersonSource })[]; not_sourced: NotSourced[] } | { status: "refused" | "error" | "NOT_WIRED"; why: string }> {
  const no = pageRefusal(o.link);
  if (no) return { status: "refused", why: no };
  if (!o.extract) return { status: "NOT_WIRED", why: "reading people from a page isn't switched on here" };
  const page = await o.read(o.link);
  if (page.status !== "ok") return page;
  let found: Candidate[];
  try { found = await o.extract({ url: page.url, text: page.text.slice(0, EXTRACT_CHARS), firm: o.firm ?? null }); } catch (e) { return { status: "error", why: `couldn't read who the page names (${(e instanceof Error ? e.message : String(e)).slice(0, 120)})` }; }
  const kept: (Omit<ContactRow, "file" | "row"> & { source: PersonSource })[] = [], not_sourced: NotSourced[] = [];
  for (const c of Array.isArray(found) ? found : []) {
    if (o.firm && c?.firm && !sameFirm(c.firm, o.firm)) continue;
    const v = verifyOnPage(c, page);
    if (!v.ok) { not_sourced.push({ name: String(c?.name ?? "").slice(0, 80) || "(no name)", firm: String(c?.firm ?? "").slice(0, 80), why: v.why }); continue; }
    if (kept.some((k) => words(k.name) === words(v.row.name) && sameFirm(k.firm, v.row.firm))) continue;
    kept.push({ ...v.row, source: v.source });
  }
  return { status: "ok", url: page.url, retrieved_at: page.retrieved_at, kept, not_sourced };
}

// The extractor over the model: it lists who the page names; code checks every one of them (verifyOnPage).
export function modelExtractor(model: (payload: any) => Promise<any>): Extractor {
  return async ({ url, text, firm }) => {
    const res = await model({
      system: [
        "You list the people a web page names, with each one's job title and employer exactly as the page writes them.",
        "Only people the page itself names. Never add anyone, never complete a name, never guess a title, employer or email.",
        "An email only if the page prints that exact address next to them; otherwise leave it out.",
        'Answer with JSON only: {"people":[{"name":"","title":"","firm":"","email":""}]}',
      ].join("\n"),
      messages: [{ role: "user", content: `PAGE: ${url}\nEMPLOYER THE PERSON ASKED ABOUT: ${firm || "(any)"}\n\nPAGE TEXT:\n${text}` }],
      max_tokens: 4000,
    });
    const out = (Array.isArray(res?.content) ? res.content : []).filter((b: any) => b?.type === "text").map((b: any) => String(b.text ?? "")).join("");
    const json = /\{[\s\S]*\}/.exec(out)?.[0];
    const people = json ? JSON.parse(json).people : [];
    return Array.isArray(people) ? people.filter((p: any) => p && typeof p === "object").map((p: any) => ({ name: String(p.name ?? ""), title: String(p.title ?? ""), firm: String(p.firm ?? ""), email: p.email ? String(p.email) : null })) : [];
  };
}

// ------------------------------------------------------------------------------------------------ the guard
// Why a row is not sourced, or null when it is. A row's firm and title must still be what its source shows.
export function notSourcedWhy(r: ContactRow & { source?: PersonSource | null }): string | null {
  const s = r.source;
  if (!s || typeof s !== "object") return r.vendor ? `only ${r.vendor === "apollo" ? "Apollo's" : "a vendor's"} list says where they work; no page I've read shows it` : "no source on record (read before Trainee kept when a list was read; send the file again)";
  if (!iso(s.retrieved_at)) return "no date for when the source was read";
  if (s.kind === "own_export") { if (!s.ref || s.url !== null) return "the source isn't your own file"; }
  else if (s.kind === "public_page") {
    if (!s.url || pageRefusal(s.url)) return "the source page isn't a public https page";
    if (!s.quote || !hasWords(s.quote, s.shows?.name ?? "")) return "the page's own words for them weren't kept";
  } else return "unknown source";
  if (!s.shows || words(s.shows.name) !== words(r.name)) return "the source shows a different name";
  if (!sameFirm(s.shows.firm, r.firm) && words(s.shows.firm) !== words(r.firm)) return `the source shows them at ${s.shows.firm || "no firm"}, not ${r.firm || "no firm"}`;
  if (words(s.shows.title) !== words(r.title)) return `the source shows them as ${s.shows.title || "no title"}, not ${r.title || "no title"}`;
  return null;
}
export function requireSourced<T extends ContactRow>(rows: T[]): { kept: T[]; not_sourced: NotSourced[] } {
  const kept: T[] = [], not_sourced: NotSourced[] = [];
  for (const r of rows) { const why = notSourcedWhy(r); if (why) not_sourced.push({ name: r.name, firm: r.firm, why }); else kept.push(r); }
  return { kept, not_sourced };
}
// What a source looks like on a recipient and in a draft.
export function sourceLine(s: PersonSource): string {
  return s.kind === "public_page" ? `Source: ${s.url} (read ${dayOf(s.retrieved_at)})` : `From your list: ${s.ref} (read ${dayOf(s.retrieved_at)})`;
}
// The output's plain account of who could not be sourced, grouped by why: every count, a few names each.
export function notSourcedText(list: NotSourced[]): string {
  if (!list.length) return "";
  const by = new Map<string, NotSourced[]>();
  for (const x of list) by.set(x.why, [...(by.get(x.why) ?? []), x]);
  const parts = [...by.entries()].map(([why, xs]) => `${xs.length} because ${why} (${xs.slice(0, 5).map((x) => x.name).join(", ")}${xs.length > 5 ? `, and ${xs.length - 5} more` : ""})`);
  return `Not sourced, so left out: ${parts.join("; ")}. I only reach out to people a source shows; nothing was sent.`;
}
// Corroborate rows already on the person's lists (same name, same firm) with a page's source, else add the page's people.
export function mergeSourced(rows: ContactRow[], found: (Omit<ContactRow, "file" | "row"> & { source: PersonSource })[], file: string): { rows: ContactRow[]; corroborated: number; added: ContactRow[] } {
  const out = rows.map((r) => ({ ...r })), added: ContactRow[] = [];
  const base = Math.max(0, ...rows.filter((r) => r.file === file).map((r) => r.row));
  let corroborated = 0;
  for (const f of found) {
    const i = out.findIndex((r) => words(r.name) === words(f.name) && sameFirm(r.firm, f.firm));
    if (i >= 0) { out[i] = { ...out[i], title: f.title, source: f.source } as ContactRow; corroborated++; continue; }
    const next = { ...f, file, row: base + added.length + 1 } as ContactRow;
    added.push(next);
    out.push(next);
  }
  return { rows: out, corroborated, added };
}
