// FEATURE 16: a resume sent as a text-message attachment (MMS / iMessage), read through the same path as a resume file on
// the web (career_resume_ingest_files.ts, reached by agent-chat's `resume_file`). The text provider (LoopMessage) posts the
// message with the address of each attachment; this module is the part that fetches and checks it, before anything is read.
//
// The address is untrusted input from the open internet (anyone can text Trainee), so:
//   - only https, only a host the owner listed (LOOPMESSAGE_MEDIA_HOSTS, exact names; nothing listed: nothing is fetched),
//     no user:password@ in the address, no port, no IP address; nothing else is ever requested;
//   - no redirect is followed to another host (a redirect is followed only within the same listed host, twice at most,
//     each hop checked again), so a listed host cannot point the fetch at an internal address;
//   - the request carries no credentials: no Authorization, no cookie, never the texting provider's key or Trainee's secret;
//   - the size cap is enforced WHILE the body streams: reading stops, and the connection is cancelled, the moment the
//     bytes read pass 10 MB; a Content-Length is only a quick refusal, never the guard;
//   - the type the sender's phone declared AND the file's own first bytes must agree on a supported kind (PDF, Word .docx,
//     RTF, plain text); a picture is told to send a PDF instead; anything that disagrees or is another kind is refused;
//   - a decompression bomb is capped by its OUTPUT: every deflate stream in a .docx (a zip) or a PDF is inflated here in
//     small slices, counted as it is produced, and stopped at 32 MB in all. The sizes a zip declares are never trusted.
// Nothing is read by a model, nothing is stored here, and the address is never logged or kept.
import { Inflate, Unzlib } from "./vendor/fflate-0.8.2.mjs";
import { REPLIES, RESUME_FILE_MAX_BYTES } from "./career_resume_replies.ts";

export const MEDIA_MAX_BYTES = RESUME_FILE_MAX_BYTES;
export const MEDIA_MAX_FILES = 3;
export const UNPACKED_MAX_BYTES = 32 * 1024 * 1024;
export const MEDIA_TIMEOUT_MS = 15_000;
export const MEDIA_MAX_REDIRECTS = 2;
const INFLATE_SLICE = 4096; // input fed at a time, so output past the cap is at most one slice's worth (about 4 MB)

export interface MediaUpload { bytes: Uint8Array; name: string; mime: string; ref: string; sha256: string }
export type MediaKind = "pdf" | "docx" | "rtf" | "text";

// ---- the words ---------------------------------------------------------------------------------------------------------
const PASTE = "or paste the text here";
export const MMS_REPLIES = {
  // The owner has not listed the host the provider serves attachments from: nothing is fetched.
  not_wired: "I can't open attachments in texts yet, so I haven't read that one. Paste your resume as text in this chat and I'll read it now.",
  download: `I couldn't download that attachment just now, so I haven't read it and nothing was saved. Send it again in a minute, ${PASTE}.`,
  blocked: `I couldn't open that attachment: it didn't come from the texting service, so I didn't download it and nothing was saved. Send your resume again as a PDF or Word file, ${PASTE}.`,
  too_large: `That attachment is over 10 MB, so I stopped downloading it and haven't read it. Send a smaller copy (a PDF saved from Word or Google Docs is usually under 1 MB), ${PASTE}.`,
  mismatch: `That attachment says it is one kind of file but isn't, so I haven't opened it and nothing was saved. Send your resume as a PDF or Word (.docx) file, ${PASTE}.`,
  bomb: `That file unpacks to far more than a resume could hold, so I stopped and haven't read it. Save your resume again as a PDF or Word (.docx) file and send that, ${PASTE}.`,
  old_pdf: `That PDF uses an old way of packing its pages that I don't open, so I haven't read it. Open it and save a new copy as a PDF (in most PDF apps: Print, then Save as PDF), ${PASTE}.`,
  many: (n: number) => `That text came with ${n} attachments, and I read up to ${MEDIA_MAX_FILES} at a time, so I haven't opened any of them. Send your resume by itself as a PDF or Word file, ${PASTE}.`,
  several: (n: number) => `That text had ${n} files I can read, and I can't tell which one is your resume, so I haven't read any of them. Send just your resume as a PDF or Word file, ${PASTE}.`,
  unsupported: (what: string) => REPLIES.unsupported(what),
  image: REPLIES.image,
  empty: REPLIES.empty,
  corrupt: (what: string) => REPLIES.corrupt(what),
};

// ---- the host list and the address -------------------------------------------------------------------------------------
// LOOPMESSAGE_MEDIA_HOSTS: exact host names, comma or space separated. An entry that is not a plain DNS name with at least
// two labels (an IP address, "localhost", a wildcard, a port, a path) is dropped, so a typo fails closed.
export function mediaHosts(raw: string | undefined | null): string[] {
  return String(raw ?? "").split(/[\s,]+/).map((h) => h.trim().toLowerCase().replace(/\.$/, "")).filter((h) =>
    /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(h) && !/^\d+(\.\d+)*$/.test(h));
}
export type UrlVerdict = { ok: true; url: URL } | { ok: false; why: "invalid" | "scheme" | "userinfo" | "port" | "host" };
export function checkMediaUrl(raw: unknown, hosts: string[]): UrlVerdict {
  if (typeof raw !== "string" || !raw || raw.length > 2048 || /[\u0000- \u007f]/.test(raw)) return { ok: false, why: "invalid" };
  let url: URL;
  try { url = new URL(raw); } catch { return { ok: false, why: "invalid" }; }
  if (url.protocol !== "https:") return { ok: false, why: "scheme" };
  if (url.username || url.password) return { ok: false, why: "userinfo" };
  if (url.port) return { ok: false, why: "port" };
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (!hosts.includes(host)) return { ok: false, why: "host" };
  return { ok: true, url };
}

// ---- the fetch ---------------------------------------------------------------------------------------------------------
export type FetchFail = "blocked" | "redirect" | "http" | "network" | "timeout" | "too_large" | "empty";
export type Fetched = { ok: true; bytes: Uint8Array; type: string } | { ok: false; why: FetchFail };
// headers: extra request headers, for a provider that needs its own token on its own host (WhatsApp); they are sent on every hop,
// and every hop stays on the one listed host, so they never reach another.
export async function fetchMedia(rawUrl: unknown, o: { hosts: string[]; fetch?: typeof fetch; maxBytes?: number; timeoutMs?: number; maxRedirects?: number; headers?: Record<string, string> }): Promise<Fetched> {
  const f = o.fetch ?? fetch, max = o.maxBytes ?? MEDIA_MAX_BYTES, hops = o.maxRedirects ?? MEDIA_MAX_REDIRECTS;
  const first = checkMediaUrl(rawUrl, o.hosts);
  if (!first.ok) return { ok: false, why: "blocked" };
  const signal = AbortSignal.timeout(o.timeoutMs ?? MEDIA_TIMEOUT_MS);
  let url = first.url;
  try {
    for (let hop = 0; ; hop++) {
      // No credentials of any kind, and a redirect is never followed by the runtime: each one is checked here.
      const res = await f(url.href, { method: "GET", redirect: "manual", credentials: "omit", headers: { accept: "application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, application/rtf, text/plain, */*;q=0.1", ...(o.headers ?? {}) }, signal });
      if (res.status >= 300 && res.status < 400) {
        await res.body?.cancel().catch(() => {});
        const to = res.headers.get("location");
        if (hop >= hops || !to) return { ok: false, why: "redirect" };
        let next: URL;
        try { next = new URL(to, url); } catch { return { ok: false, why: "redirect" }; }
        const v = checkMediaUrl(next.href, o.hosts);
        if (!v.ok || v.url.hostname.toLowerCase() !== first.url.hostname.toLowerCase()) return { ok: false, why: "redirect" };
        url = v.url;
        continue;
      }
      if (!res.ok) { await res.body?.cancel().catch(() => {}); return { ok: false, why: "http" }; }
      if (!res.body) return { ok: false, why: "empty" };
      const declared = Number(res.headers.get("content-length"));
      if (Number.isFinite(declared) && declared > max) { await res.body.cancel().catch(() => {}); return { ok: false, why: "too_large" }; }
      // The guard: count as the body arrives, and stop reading the moment the cap is passed. The chunk that crosses the cap
      // is dropped, never kept.
      const reader = res.body.getReader(), chunks: Uint8Array[] = [];
      let total = 0;
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (!value?.length) continue;
        if (total + value.length > max) { await reader.cancel().catch(() => {}); return { ok: false, why: "too_large" }; }
        total += value.length;
        chunks.push(value);
      }
      if (!total) return { ok: false, why: "empty" };
      const bytes = new Uint8Array(total);
      let at = 0;
      for (const c of chunks) { bytes.set(c, at); at += c.length; }
      return { ok: true, bytes, type: (res.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase() };
    }
  } catch (e) {
    const name = (e as { name?: string })?.name;
    return { ok: false, why: name === "TimeoutError" || name === "AbortError" ? "timeout" : "network" };
  }
}

// ---- the kind: the declared type and the first bytes must agree -------------------------------------------------------
const at = (b: Uint8Array, sig: number[], off = 0) => b.length >= off + sig.length && sig.every((x, i) => b[off + i] === x);
type Magic = "pdf" | "zip" | "rtf" | "image" | "cfb" | "other";
function magicOf(b: Uint8Array): Magic {
  if (at(b, [0x25, 0x50, 0x44, 0x46, 0x2d]) || (b.length > 5 && new TextDecoder("latin1").decode(b.subarray(0, 1024)).includes("%PDF-"))) return "pdf";
  if (at(b, [0x50, 0x4b, 0x03, 0x04]) || at(b, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (at(b, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return "rtf";
  if (at(b, [0xff, 0xd8, 0xff]) || at(b, [0x89, 0x50, 0x4e, 0x47]) || at(b, [0x47, 0x49, 0x46, 0x38]) || at(b, [0x42, 0x4d]) || at(b, [0x49, 0x49, 0x2a, 0x00]) || at(b, [0x4d, 0x4d, 0x00, 0x2a]) ||
    (at(b, [0x52, 0x49, 0x46, 0x46]) && at(b, [0x57, 0x45, 0x42, 0x50], 8)) ||
    (b.length > 12 && at(b, [0x66, 0x74, 0x79, 0x70], 4) && /^(heic|heix|hevc|hevx|mif1|msf1|avif|avis)$/.test(new TextDecoder("latin1").decode(b.subarray(8, 12))))) return "image"; // JPEG PNG GIF BMP TIFF WebP HEIC/AVIF (an mp4 or mov also has "ftyp", with another brand: not a picture)
  if (at(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "cfb";
  return "other";
}
type Declared = "pdf" | "docx" | "rtf" | "text" | "image" | "generic" | "other";
const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
function declaredOf(ct: string): Declared {
  if (ct === "application/pdf" || ct === "application/x-pdf") return "pdf";
  if (ct === DOCX_MIME) return "docx";
  if (/^(application|text)\/(x-)?rtf$/.test(ct) || ct === "text/richtext") return "rtf";
  if (ct === "text/plain") return "text";
  if (ct.startsWith("image/")) return "image";
  if (ct === "" || ct === "application/octet-stream" || ct === "binary/octet-stream" || ct === "application/zip" || ct === "application/x-zip-compressed") return "generic";
  return "other";
}
const labelOf = (ct: string) => ct.startsWith("video/") ? "video" : ct.startsWith("audio/") ? "audio" : ct === "text/vcard" || ct === "text/x-vcard" ? "contact card" : ct === "text/html" ? "web page" : "these";

export type Refusal = "image" | "mismatch" | "unsupported" | "empty" | "bomb" | "corrupt" | "old_pdf";
export type Verdict = { ok: true; kind: MediaKind; mime: string; ext: string } | { ok: false; refusal: Refusal; reply: string };
const no = (refusal: Refusal, reply: string): Verdict => ({ ok: false, refusal, reply });
const KIND: Record<MediaKind, { mime: string; ext: string }> = {
  pdf: { mime: "application/pdf", ext: "pdf" }, docx: { mime: DOCX_MIME, ext: "docx" }, rtf: { mime: "application/rtf", ext: "rtf" }, text: { mime: "text/plain", ext: "txt" },
};
export function kindOf(bytes: Uint8Array, declaredType: string): Verdict {
  const ct = String(declaredType ?? "").split(";")[0].trim().toLowerCase();
  if (!bytes.length) return no("empty", MMS_REPLIES.empty);
  const magic = magicOf(bytes), decl = declaredOf(ct);
  if (magic === "image") return no("image", MMS_REPLIES.image);
  if (decl === "image") return no("mismatch", MMS_REPLIES.mismatch); // said picture, is not one
  if (decl === "other") return no("unsupported", MMS_REPLIES.unsupported(labelOf(ct)));
  if (magic === "cfb") return no("unsupported", REPLIES.legacy_doc);
  let kind: MediaKind | null = null;
  if (magic === "pdf") kind = "pdf";
  else if (magic === "rtf") kind = "rtf";
  else if (magic === "zip") kind = zipHasWordDocument(bytes) ? "docx" : null;
  else if (decl === "text") kind = looksLikeText(bytes) ? "text" : null;
  // The declared type must name the same kind the bytes show. An octet-stream or zip label names none, so the bytes decide.
  if (!kind) return decl === "text" || decl === "pdf" || decl === "docx" || decl === "rtf" ? no("mismatch", MMS_REPLIES.mismatch) : no("unsupported", MMS_REPLIES.unsupported(magic === "zip" ? ".zip" : "these"));
  if ((decl === "pdf" || decl === "docx" || decl === "rtf" || decl === "text") && decl !== kind) return no("mismatch", MMS_REPLIES.mismatch);
  if (decl === "generic" && ct === "application/zip" && kind !== "docx") return no("mismatch", MMS_REPLIES.mismatch);
  return { ok: true, kind, ...KIND[kind] };
}
function looksLikeText(b: Uint8Array): boolean {
  if (at(b, [0xff, 0xfe]) || at(b, [0xfe, 0xff])) return true; // UTF-16 with a byte-order mark
  const n = Math.min(b.length, 65536);
  for (let i = 0; i < n; i++) if (b[i] === 0) return false;
  return true;
}

// ---- zip (the .docx): the central directory, read here, never trusted for sizes ---------------------------------------
interface ZipEntry { name: string; method: number; csize: number; usize: number; off: number; flags: number }
function zipEntries(b: Uint8Array): ZipEntry[] | null {
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  let eocd = -1;
  for (let i = b.length - 22; i >= Math.max(0, b.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  if (eocd < 0) return null;
  const count = dv.getUint16(eocd + 10, true), cdSize = dv.getUint32(eocd + 12, true), cdOff = dv.getUint32(eocd + 16, true);
  if (count === 0xffff || cdSize === 0xffffffff || cdOff === 0xffffffff || count > 2000 || cdOff + cdSize > b.length) return null; // zip64 or absurd: not a resume
  const out: ZipEntry[] = [];
  let p = cdOff;
  for (let i = 0; i < count; i++) {
    if (p + 46 > b.length || dv.getUint32(p, true) !== 0x02014b50) return null;
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), usize = dv.getUint32(p + 24, true);
    const nl = dv.getUint16(p + 28, true), el = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), off = dv.getUint32(p + 42, true);
    if (csize === 0xffffffff || usize === 0xffffffff || off === 0xffffffff || p + 46 + nl > b.length) return null;
    out.push({ name: new TextDecoder("latin1").decode(b.subarray(p + 46, p + 46 + nl)), method, csize, usize, off, flags });
    p += 46 + nl + el + cl;
  }
  return out;
}
function zipHasWordDocument(b: Uint8Array): boolean {
  try { return !!zipEntries(b)?.some((e) => e.name === "word/document.xml"); } catch { return false; }
}

// ---- the bomb guard: count what inflating really produces, stop at the budget ---------------------------------------
// Returns the bytes produced, or "over" once they pass `budget`. A stream that is not valid deflate yields "bad" (the reader
// that follows refuses it as damaged; it is not a bomb).
export function inflatedSize(data: Uint8Array, zlibWrapped: boolean, budget: number): number | "over" | "bad" {
  let out = 0, over = false;
  const sink = (chunk: Uint8Array) => { out += chunk.length; if (out > budget) over = true; };
  try {
    const s = zlibWrapped ? new Unzlib(sink) : new Inflate(sink);
    for (let i = 0; i < data.length && !over; i += INFLATE_SLICE) s.push(data.subarray(i, Math.min(i + INFLATE_SLICE, data.length)), i + INFLATE_SLICE >= data.length);
  } catch { return over ? "over" : "bad"; }
  return over ? "over" : out;
}
// A .docx: every entry's real unpacked size, summed against the budget. A size the zip declares that is not the size
// produced is a lie (a bomb hiding behind a small header), and refused.
export function docxGuard(b: Uint8Array, budget = UNPACKED_MAX_BYTES): Verdict | null {
  const entries = zipEntries(b);
  if (!entries) return no("corrupt", MMS_REPLIES.corrupt("Word file"));
  let left = budget;
  for (const e of entries) {
    const start = localDataStart(b, e);
    if (start === null || start + e.csize > b.length) return no("corrupt", MMS_REPLIES.corrupt("Word file"));
    const data = b.subarray(start, start + e.csize);
    let size: number | "over" | "bad";
    if (e.method === 0) size = e.csize;
    else if (e.method === 8) size = inflatedSize(data, false, left);
    else return no("corrupt", MMS_REPLIES.corrupt("Word file"));
    if (size === "over") return no("bomb", MMS_REPLIES.bomb);
    if (size === "bad" || size !== e.usize) return e.flags & 1 ? null : no("bomb", MMS_REPLIES.bomb); // an encrypted entry is the reader's to refuse
    left -= size;
    if (left < 0) return no("bomb", MMS_REPLIES.bomb);
  }
  return null;
}
function localDataStart(b: Uint8Array, e: ZipEntry): number | null {
  if (e.off + 30 > b.length) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  if (dv.getUint32(e.off, true) !== 0x04034b50) return null;
  return e.off + 30 + dv.getUint16(e.off + 26, true) + dv.getUint16(e.off + 28, true);
}
// ASCII85 (a PDF stream filter): decoded here so the Flate stream under it can be counted. Stops, returning null, past `budget`.
function ascii85(data: Uint8Array, budget: number): Uint8Array | null {
  const out = new Uint8Array(Math.min(budget, Math.ceil(data.length * 4 / 5) + 4 * 1024));
  let n = 0, group = 0, count = 0;
  const put = (v: number, bytes: number) => { for (let i = 0; i < bytes; i++) { if (n >= out.length) return false; out[n++] = (v >>> (24 - 8 * i)) & 255; } return true; };
  for (let i = 0; i < data.length; i++) {
    const c = data[i];
    if (c === 0x7e) break; // ~>
    if (c <= 0x20) continue;
    if (c === 0x7a && count === 0) { if (!put(0, 4)) return null; continue; } // z: four zero bytes
    if (c < 0x21 || c > 0x75) continue;
    group = group * 85 + (c - 0x21); count++;
    if (count === 5) { if (!put(group >>> 0, 4)) return null; group = 0; count = 0; }
  }
  if (count > 1) { for (let k = count; k < 5; k++) group = group * 85 + 84; if (!put(group >>> 0, count - 1)) return null; }
  return out.subarray(0, n);
}
function asciiHex(data: Uint8Array): Uint8Array {
  const out = new Uint8Array(Math.ceil(data.length / 2));
  let n = 0, hi = -1;
  for (const c of data) {
    if (c === 0x3e) break; // >
    const v = c >= 0x30 && c <= 0x39 ? c - 0x30 : c >= 0x41 && c <= 0x46 ? c - 0x37 : c >= 0x61 && c <= 0x66 ? c - 0x57 : -1;
    if (v < 0) continue;
    if (hi < 0) hi = v; else { out[n++] = (hi << 4) | v; hi = -1; }
  }
  return out.subarray(0, n);
}
// A PDF: every stream's filter chain is followed (ASCII85 and hex are undone, Flate is inflated against the budget). A stream
// packed with LZW or run-length, which expand without a bound, is not opened. Image filters are not text and are left alone.
export function pdfGuard(b: Uint8Array, budget = UNPACKED_MAX_BYTES): Verdict | null {
  const s = new TextDecoder("latin1").decode(b);
  let left = budget;
  const re = /(?<!end)stream\r?\n/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) {
    const from = m.index + m[0].length;
    const head = s.slice(Math.max(0, m.index - 2048), m.index);
    const dict = head.slice(Math.max(0, head.lastIndexOf("obj")));
    const f = /\/Filter\s*(\[[^\]]*\]|\/[A-Za-z0-9#]+)/.exec(dict);
    if (!f) continue;
    if (f[1].includes("#")) return no("old_pdf", MMS_REPLIES.old_pdf); // a filter name hidden behind #-escapes
    let data: Uint8Array | null = null;
    const end = s.indexOf("endstream", from);
    for (const name of (f[1].match(/\/[A-Za-z0-9]+/g) ?? []).map((x) => x.slice(1))) {
      data ??= b.subarray(from, end < 0 ? b.length : end);
      if (name === "LZWDecode" || name === "LZW" || name === "RunLengthDecode" || name === "RL") return no("old_pdf", MMS_REPLIES.old_pdf);
      if (name === "ASCII85Decode" || name === "A85") { data = ascii85(data, left); if (!data) return no("bomb", MMS_REPLIES.bomb); }
      else if (name === "ASCIIHexDecode" || name === "AHx") data = asciiHex(data);
      else if (name === "FlateDecode" || name === "Fl") {
        const size = inflatedSize(data, true, left);
        if (size === "over") return no("bomb", MMS_REPLIES.bomb);
        if (size !== "bad") left -= size;
        break; // what Flate produced is not carried further
      } else break; // an image filter (DCT, JPX, CCITT, JBIG2) or Crypt: not text, not expanded here
    }
    if (left < 0) return no("bomb", MMS_REPLIES.bomb);
  }
  return null;
}

// ---- one message's attachments -> the upload the turn reads ------------------------------------------------------------
const hex = (b: ArrayBuffer) => [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
export async function sha256Of(bytes: Uint8Array): Promise<string> { return hex(await crypto.subtle.digest("SHA-256", bytes as BufferSource)); }
const nameFrom = (url: string, ext: string) => {
  try {
    const base = decodeURIComponent(new URL(url).pathname.split("/").pop() || "").replace(/[^\w .()-]/g, "").trim().slice(0, 80);
    if (base && new RegExp(`\\.${ext}$`, "i").test(base)) return base;
  } catch { /* the default name */ }
  return `resume.${ext}`;
};
// The downloaded bytes: the declared type and the first bytes agree on a supported kind, and nothing inflates past the cap.
export function checkBytes(bytes: Uint8Array, declaredType: string): Verdict {
  const v = kindOf(bytes, declaredType);
  if (!v.ok) return v;
  return (v.kind === "docx" ? docxGuard(bytes) : v.kind === "pdf" ? pdfGuard(bytes) : null) ?? v;
}
export const safeName = (name: string | null | undefined, ext: string) => {
  const base = String(name ?? "").replace(/[^\w .()-]/g, "").trim().slice(0, 80);
  return base && new RegExp(`\\.${ext}$`, "i").test(base) ? base : `resume.${ext}`;
};
export const fetchFailReply = (why: FetchFail) => why === "blocked" || why === "redirect" ? MMS_REPLIES.blocked : why === "too_large" ? MMS_REPLIES.too_large : why === "empty" ? MMS_REPLIES.empty : MMS_REPLIES.download;
export type MediaResult = { ok: true; upload: MediaUpload } | { ok: false; reply: string; why: string };
export async function readSmsAttachments(urls: unknown[], o: { hosts: string[]; fetch?: typeof fetch; maxBytes?: number; timeoutMs?: number }): Promise<MediaResult> {
  const list = urls.filter((u) => typeof u === "string" && u);
  if (!list.length) return { ok: false, reply: MMS_REPLIES.not_wired, why: "no_address" };
  if (!o.hosts.length) return { ok: false, reply: MMS_REPLIES.not_wired, why: "not_wired" };
  if (list.length > MEDIA_MAX_FILES) return { ok: false, reply: MMS_REPLIES.many(list.length), why: "many" };
  const good: { bytes: Uint8Array; verdict: Extract<Verdict, { ok: true }>; url: string }[] = [];
  let firstRefusal: { reply: string; why: string } | null = null;
  for (const url of list as string[]) {
    const got = await fetchMedia(url, { hosts: o.hosts, fetch: o.fetch, maxBytes: o.maxBytes, timeoutMs: o.timeoutMs });
    if (!got.ok) {
      return { ok: false, reply: fetchFailReply(got.why), why: got.why };
    }
    const v = checkBytes(got.bytes, got.type);
    if (v.ok) good.push({ bytes: got.bytes, verdict: v, url });
    else firstRefusal ??= { reply: v.reply, why: v.refusal };
  }
  if (good.length > 1) return { ok: false, reply: MMS_REPLIES.several(good.length), why: "several" };
  if (!good.length) return { ok: false, reply: firstRefusal!.reply, why: firstRefusal!.why };
  const { bytes, verdict, url } = good[0], sha = await sha256Of(bytes);
  return { ok: true, upload: { bytes, name: nameFrom(url, verdict.ext), mime: verdict.mime, ref: `mms-file:sha256:${sha}`, sha256: sha } };
}
