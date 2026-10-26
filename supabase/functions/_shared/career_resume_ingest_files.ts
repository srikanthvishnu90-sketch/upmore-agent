// FEATURE 16: resume files and long pastes (capability map ON-02, ON-03).
//
// One entry, ingestResumeFile({ bytes, filename, mime, channel, uploadRef, sha256 }), reads the resume file a person
// actually has (PDF, Word .docx, RTF, plain text) into plain text shaped for the resume parse the router already runs
// (module 122's parseResumeText: section headings on their own lines, one entry per line, bullets as "• ..."), plus a
// structure report (sections, entries, confidence) and the upload record the evidence step stamps on each confirmed
// fact (career_router_evidence.ts: the upload's reference and the file's sha256).
//
// It runs on the Supabase edge runtime: pure JS only, no Node globals. PDF text comes from pdf.js 6.1.200 (the
// serverless build unpdf 1.8.1 ships, vendored at ./vendor/pdfjs-serverless-unpdf-1.8.1.mjs, loaded only when a PDF
// arrives); a .docx is unzipped with fflate 0.8.2 (./vendor/fflate-0.8.2.mjs) and its word/document.xml read here; RTF
// and plain text are read here. Nothing is guessed: a photo, a scan with no text layer, a locked PDF, a protected Word
// file, a damaged file and a file over 10 MB each get a plain-words reply and nothing is read from them. No model is
// called (a photo is not read: the reply asks for a PDF or the pasted text).
import { CareerProfile } from "./router_core.career.js";
import { unzipSync } from "./vendor/fflate-0.8.2.mjs";

export const RESUME_FILE_MAX_BYTES = 10 * 1024 * 1024;
// The stored turn input is bounded at 20,000 characters (career_host_commit p_input). The resume text is bounded below
// that, so the file's marker line still fits; anything past it is cut at a line and the reply says so.
export const RESUME_TEXT_MAX = 19_000;
// A plain chat message: what the handler took before this feature (MAX_MESSAGE_LEN). Past it, only a resume is read.
export const PLAIN_MESSAGE_MAX = 4_000;
export const PDF_MAX_PAGES = 8;

export type Format = "pdf" | "docx" | "rtf" | "text";
export interface ResumeFileIn {
  bytes: Uint8Array; filename?: string | null; mime?: string | null; channel?: string | null; uploadRef?: string | null; sha256?: string | null;
}
export interface Section { name: string; heading: string; entries: number }
export interface StructureReport {
  format: Format | "paste"; pages: number | null; pagesRead: number | null; columns: number[] | null;
  sections: Section[]; entries: number; byKind: Record<string, number>;
  // high: two or more sections, one of them experience or education, and three or more entries (what the router's
  // resume step itself requires); medium: some section and entry found; low: none.
  confidence: "high" | "medium" | "low"; resumeShaped: boolean;
  headingsRenamed: { from: string; to: string }[]; chars: number;
  cut: null | { kept: number; total: number; why: string };
}
export interface FileUpload { kind: "file"; ref: string; sha256: string; filename: string; mime: string | null; channel: string | null; bytes: number; format: Format }
export type Refusal = "too_large" | "checksum" | "empty" | "image" | "scanned" | "encrypted_pdf" | "protected_docx" | "legacy_doc" | "corrupt" | "unsupported";
export type IngestResult =
  | { ok: true; text: string; report: StructureReport; upload: FileUpload }
  | { ok: false; refusal: Refusal; reply: string; upload: Omit<FileUpload, "format"> | null };

export async function sha256Hex(b: Uint8Array | string) {
  const data = typeof b === "string" ? new TextEncoder().encode(b) : new Uint8Array(b);
  const d = await crypto.subtle.digest("SHA-256", data as Uint8Array<ArrayBuffer>);
  return [...new Uint8Array(d)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// ---- the replies: exact, plain, and never a claim that anything was read -------------------------------------------
const PASTE = "or paste the text here";
export const REPLIES = {
  too_large: (mb: string) => `That file is ${mb} MB, and I read resume files up to 10 MB, so I haven't read it. Send a smaller copy (a PDF saved from Word or Google Docs is usually under 1 MB), ${PASTE}.`,
  checksum: "That file didn't arrive whole (it doesn't match the checksum it was sent with), so I haven't read it. Send it again.",
  empty: `That file is empty, so there was nothing to read. Send the resume file again, ${PASTE}.`,
  image: `That's a picture, and I don't read text out of pictures, so I haven't read it. Send your resume as a PDF or Word file, ${PASTE}.`,
  scanned: `That PDF has no text in it: it's a scan or a picture of the page, and I don't read text out of pictures, so I haven't read it. Send the PDF saved from Word or Google Docs, ${PASTE}.`,
  encrypted_pdf: `That PDF is locked with a password, so I can't open it. Send a copy without the password (in most PDF apps: Print, then Save as PDF), ${PASTE}. Please don't send me the password.`,
  protected_docx: `That Word file is protected with a password, so I can't open it. Save a copy without the password and send that, ${PASTE}. Please don't send me the password.`,
  legacy_doc: `That's an older Word file (.doc), which I can't read. Save it as .docx or PDF and send it again, ${PASTE}.`,
  corrupt: (what: string) => `I couldn't open that ${what}: it looks damaged or incomplete, so I haven't read it. Save or export it again and send it, ${PASTE}.`,
  unsupported: (what: string) => `I can't read ${what} files. I read PDF, Word (.docx), RTF and plain-text files, so send it as one of those, ${PASTE}.`,
};

// ---- format sniffing: the bytes decide, the name and type only break ties ------------------------------------------
const startsWith = (b: Uint8Array, sig: number[], at = 0) => sig.every((x, i) => b[at + i] === x);
const extOf = (name: string) => (name.toLowerCase().match(/\.([a-z0-9]{1,8})$/) || [null, ""])[1];
type Sniffed = Format | "image" | "cfb" | "zip_other" | "unknown";
function sniff(b: Uint8Array, filename: string, mime: string): Sniffed {
  const ext = extOf(filename);
  if (startsWith(b, [0x25, 0x50, 0x44, 0x46, 0x2d])) return "pdf"; // %PDF-
  // A PDF may carry a few junk bytes before its header (PDF 32000 7.5.2 tolerates up to 1024).
  if (b.length > 5 && new TextDecoder("latin1").decode(b.subarray(0, 1024)).includes("%PDF-")) return "pdf";
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04]) || startsWith(b, [0x50, 0x4b, 0x05, 0x06])) return ext === "docx" || /wordprocessingml/.test(mime) || !ext ? "docx" : "zip_other";
  if (startsWith(b, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "cfb"; // OLE2: a .doc, or a password-protected .docx
  if (startsWith(b, [0xff, 0xd8, 0xff]) || startsWith(b, [0x89, 0x50, 0x4e, 0x47]) || startsWith(b, [0x47, 0x49, 0x46, 0x38]) ||
    (startsWith(b, [0x52, 0x49, 0x46, 0x46]) && startsWith(b, [0x57, 0x45, 0x42, 0x50], 8)) || /^(heic|heif|avif)$/.test(ext) ||
    (b.length > 12 && startsWith(b, [0x66, 0x74, 0x79, 0x70], 4))) return "image"; // JPEG, PNG, GIF, WebP, HEIC/AVIF (ftyp)
  if (startsWith(b, [0x7b, 0x5c, 0x72, 0x74, 0x66])) return "rtf"; // {\rtf
  if (mime.startsWith("image/")) return "image";
  if (["pages", "odt", "xlsx", "pptx", "key", "numbers", "zip"].includes(ext)) return "unknown";
  return "text";
}
function cfbIsEncryptedOoxml(b: Uint8Array) {
  // A password-protected .docx is an OLE2 container holding the streams EncryptionInfo and EncryptedPackage, whose
  // directory names are UTF-16LE.
  const want = [..."EncryptedPackage"].flatMap((c) => [c.charCodeAt(0), 0]);
  outer: for (let i = 0; i + want.length <= b.length; i++) {
    for (let j = 0; j < want.length; j++) if (b[i + j] !== want[j]) continue outer;
    return true;
  }
  return false;
}

// ---- the entry --------------------------------------------------------------------------------------------------------
export async function ingestResumeFile(f: ResumeFileIn): Promise<IngestResult> {
  const bytes = f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(0);
  const filename = String(f.filename ?? "").slice(0, 200) || "resume";
  const mime = String(f.mime ?? "").toLowerCase().slice(0, 120);
  const channel = f.channel ? String(f.channel).slice(0, 40) : null;
  const sha = await sha256Hex(bytes);
  const ref = f.uploadRef && /^[\w.:/@+=-]{1,300}$/.test(String(f.uploadRef)) ? String(f.uploadRef) : `${channel || "chat"}-upload:sha256:${sha}`;
  const base = { kind: "file" as const, ref, sha256: sha, filename, mime: mime || null, channel, bytes: bytes.length };
  const refuse = (refusal: Refusal, reply: string): IngestResult => ({ ok: false, refusal, reply, upload: base });
  if (bytes.length > RESUME_FILE_MAX_BYTES) return refuse("too_large", REPLIES.too_large((bytes.length / (1024 * 1024)).toFixed(1)));
  if (f.sha256 != null && String(f.sha256).toLowerCase() !== sha) return refuse("checksum", REPLIES.checksum);
  if (!bytes.length) return refuse("empty", REPLIES.empty);
  const kind = sniff(bytes, filename, mime);
  let raw: { text: string; pages?: number; pagesRead?: number; columns?: number[] };
  let format: Format;
  try {
    if (kind === "image") return refuse("image", REPLIES.image);
    if (kind === "cfb") return cfbIsEncryptedOoxml(bytes) ? refuse("protected_docx", REPLIES.protected_docx) : refuse("legacy_doc", REPLIES.legacy_doc);
    if (kind === "zip_other" || kind === "unknown") return refuse("unsupported", REPLIES.unsupported(extOf(filename) ? `.${extOf(filename)}` : "these"));
    if (kind === "pdf") {
      format = "pdf";
      const r = await pdfText(bytes);
      if (r.refusal) return refuse(r.refusal, r.refusal === "encrypted_pdf" ? REPLIES.encrypted_pdf : r.refusal === "scanned" ? REPLIES.scanned : REPLIES.corrupt("PDF"));
      raw = r;
    } else if (kind === "docx") {
      format = "docx";
      const r = docxText(bytes);
      if (r === null) return refuse("corrupt", REPLIES.corrupt("Word file"));
      raw = { text: r };
    } else if (kind === "rtf") {
      format = "rtf";
      raw = { text: rtfText(bytes) };
    } else {
      format = "text";
      const t = decodeText(bytes);
      if (t === null) return refuse("unsupported", REPLIES.unsupported(extOf(filename) ? `.${extOf(filename)}` : "these"));
      raw = { text: t };
    }
  } catch (e) {
    console.error("resume file: extraction failed", (e as Error)?.message ?? e);
    return refuse("corrupt", REPLIES.corrupt(kind === "pdf" ? "PDF" : kind === "docx" ? "Word file" : "file"));
  }
  if (!raw.text.trim()) return refuse(format === "pdf" ? "scanned" : "empty", format === "pdf" ? REPLIES.scanned : REPLIES.empty);
  const shaped = shapeResumeText(raw.text, format, { pages: raw.pages ?? null, pagesRead: raw.pagesRead ?? null, columns: raw.columns ?? null });
  return { ok: true, text: shaped.text, report: shaped.report, upload: { ...base, format } };
}

// ---- plain text ---------------------------------------------------------------------------------------------------------
function decodeText(b: Uint8Array): string | null {
  let t: string;
  if (startsWith(b, [0xff, 0xfe])) t = new TextDecoder("utf-16le").decode(b.subarray(2));
  else if (startsWith(b, [0xfe, 0xff])) t = new TextDecoder("utf-16be").decode(b.subarray(2));
  else {
    try { t = new TextDecoder("utf-8", { fatal: true }).decode(b); }
    catch { t = new TextDecoder("windows-1252").decode(b); }
  }
  t = t.replace(/^\uFEFF/, "");
  // Binary handed over as text: NULs or a high share of control characters.
  let bad = 0;
  for (const ch of t.slice(0, 20000)) { const c = ch.charCodeAt(0); if (c === 0 || (c < 32 && !"\n\r\t\f".includes(ch)) || ch === "�") bad++; }
  if (t.length && bad / Math.min(t.length, 20000) > 0.02) return null;
  return t;
}

// ---- RTF --------------------------------------------------------------------------------------------------------------
const RTF_SKIP = new Set(["fonttbl", "colortbl", "stylesheet", "info", "pict", "object", "header", "headerl", "headerr", "headerf", "footer", "footerl", "footerr", "footerf",
  "listtable", "listoverridetable", "rsidtbl", "xmlnstbl", "mmathPr", "generator", "themedata", "colorschememapping", "datastore", "latentstyles", "pgdsctbl", "filetbl",
  "revtbl", "fldinst", "bkmkstart", "bkmkend", "pn", "pntxta", "pntxtb", "shp", "shpinst", "nonshppict", "background", "userprops", "docvar", "wgrffmtfilter", "ftnsep", "ftnsepc", "aftnsep", "aftnsepc"]);
export function rtfText(b: Uint8Array): string {
  const src = new TextDecoder("latin1").decode(b);
  const cp1252 = new TextDecoder("windows-1252");
  const out: string[] = [];
  const stack: { skip: boolean; uc: number }[] = [];
  let skip = false, uc = 1, pendingSkip = 0, starDest = false;
  const emit = (s: string) => { if (!skip) out.push(s); };
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    if (ch === "{") { stack.push({ skip, uc }); starDest = false; continue; }
    if (ch === "}") { const s = stack.pop(); if (s) { skip = s.skip; uc = s.uc; } continue; }
    if (ch === "\r" || ch === "\n") continue;
    if (ch !== "\\") { if (pendingSkip > 0) { pendingSkip--; continue; } emit(ch); continue; }
    const nx = src[i + 1];
    if (nx === "\\" || nx === "{" || nx === "}") { i++; if (pendingSkip > 0) { pendingSkip--; continue; } emit(nx); continue; }
    if (nx === "*") { i++; starDest = true; skip = true; continue; }
    if (nx === "'") {
      const hex = src.slice(i + 2, i + 4); i += 3;
      if (pendingSkip > 0) { pendingSkip--; continue; }
      emit(cp1252.decode(new Uint8Array([parseInt(hex, 16) || 0x3f]))); continue;
    }
    if (nx === "~") { i++; emit(" "); continue; }
    if (nx === "-" ) { i++; continue; } // optional hyphen
    if (nx === "_") { i++; emit("-"); continue; }
    const m = /^([a-zA-Z]{1,32})(-?\d{1,10})? ?/.exec(src.slice(i + 1, i + 50));
    if (!m) { i++; continue; }
    i += m[0].length;
    const word = m[1], arg = m[2] != null ? Number(m[2]) : null;
    if (RTF_SKIP.has(word)) { skip = true; continue; }
    if (starDest) { starDest = false; }
    switch (word) {
      case "par": case "line": case "sect": case "page": case "row": emit("\n"); break;
      case "cell": case "nestcell": emit("\n"); break;
      case "tab": emit(" "); break;
      case "bullet": emit("•"); break;
      case "emdash": emit("—"); break;
      case "endash": emit("–"); break;
      case "lquote": emit("‘"); break;
      case "rquote": emit("’"); break;
      case "ldblquote": emit("“"); break;
      case "rdblquote": emit("”"); break;
      case "uc": uc = arg ?? 1; break;
      case "u": { let c = arg ?? 63; if (c < 0) c += 65536; emit(String.fromCharCode(c)); pendingSkip = uc; break; }
      default: break;
    }
  }
  return out.join("");
}

// ---- DOCX: word/document.xml, paragraphs in order, list paragraphs as bullets, table cells in reading order ------------
const XML_ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
const unxml = (s: string) => s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : Number(e.slice(1))) : (XML_ENT[e] ?? m));
const DOCX_PART_MAX = 30 * 1024 * 1024; // the unzipped document.xml; a zip bomb's declared size past this is refused
export function docxText(b: Uint8Array): string | null {
  let parts: Record<string, Uint8Array>;
  try {
    parts = unzipSync(b, { filter: (f: { name: string; originalSize: number }) => (f.name === "word/document.xml" || f.name === "word/numbering.xml" || f.name === "word/styles.xml") && f.originalSize <= DOCX_PART_MAX });
  } catch { return null; }
  const doc = parts["word/document.xml"];
  if (!doc) return null;
  const xml = new TextDecoder("utf-8").decode(doc);
  if (!/<\/w:document>\s*$/.test(xml)) return null; // cut short: a truncated or lying archive
  // Bullet styles: the document's own list styles (List Bullet, List Paragraph, ...) by id.
  const listStyles = new Set<string>(["ListBullet", "ListParagraph", "ListNumber"]);
  const styles = parts["word/styles.xml"] ? new TextDecoder().decode(parts["word/styles.xml"]) : "";
  for (const m of styles.matchAll(/<w:style\b[^>]*w:styleId="([^"]+)"[^>]*>([\s\S]*?)<\/w:style>/g)) {
    if (/<w:name w:val="(?:List (?:Bullet|Number|Paragraph)[^"]*)"/.test(m[2]) || /<w:numPr>/.test(m[2])) listStyles.add(m[1]);
  }
  const lines: string[] = [];
  // Paragraphs nest (a text box's paragraphs sit inside the paragraph that anchors it): a stack, each emitted at its end.
  const stack: { text: string[]; bullet: boolean }[] = [];
  let fallback = 0, inInstr = false, inDel = 0, textOpen = false;
  const re = /<(\/?)([a-zA-Z]+:[a-zA-Z]+)([^>]*?)(\/?)>|([^<]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    if (m[5] != null) {
      if (fallback || inDel || inInstr) continue;
      const top = stack[stack.length - 1];
      if (top && textOpen) top.text.push(unxml(m[5]));
      continue;
    }
    const close = m[1] === "/", tag = m[2], attrs = m[3], selfClose = m[4] === "/";
    if (tag === "mc:Fallback") { fallback += close ? -1 : selfClose ? 0 : 1; continue; }
    if (fallback) continue;
    if (tag === "w:del") { inDel += close ? -1 : selfClose ? 0 : 1; continue; }
    if (tag === "w:instrText") { inInstr = !close && !selfClose; continue; }
    if (tag === "w:p") {
      if (selfClose) { lines.push(""); continue; }
      if (!close) { stack.push({ text: [], bullet: false }); continue; }
      const p = stack.pop();
      if (p) { const t = p.text.join("").replace(/[ \t]+/g, " ").trim(); lines.push(t ? (p.bullet ? `• ${t}` : t) : ""); }
      continue;
    }
    const top = stack[stack.length - 1];
    if (!top) continue;
    if (tag === "w:t") { textOpen = !close && !selfClose; continue; }
    if (close) continue;
    if (tag === "w:numPr") top.bullet = true;
    else if (tag === "w:pStyle") { const v = /w:val="([^"]+)"/.exec(attrs); if (v && listStyles.has(v[1])) top.bullet = true; }
    else if (tag === "w:tab" || tag === "w:ptab") top.text.push(" ");
    else if (tag === "w:br" || tag === "w:cr") top.text.push("\n");
    else if (tag === "w:noBreakHyphen") top.text.push("-");
    else if (tag === "w:sym") { const c = /w:char="([0-9A-Fa-f]{2,4})"/.exec(attrs); if (c) top.text.push(String.fromCharCode(parseInt(c[1], 16))); }
  }
  return lines.join("\n");
}

// ---- PDF: pdf.js text items, columns found by their gutter, lines rebuilt, wrapped bullets joined -----------------------
type Item = { s: string; x: number; y: number; w: number; size: number };
type Line = { x: number; y: number; size: number; text: string };
// deno-lint-ignore no-explicit-any
let pdfjsMod: Promise<any> | null = null;
async function pdfText(bytes: Uint8Array): Promise<{ text: string; pages: number; pagesRead: number; columns: number[]; refusal?: Refusal }> {
  pdfjsMod ??= import("./vendor/pdfjs-serverless-unpdf-1.8.1.mjs");
  const pdfjs = await pdfjsMod;
  // pdf.js takes the buffer it is given; a copy keeps the caller's bytes (hashed above) intact.
  const task = pdfjs.getDocument({ data: bytes.slice(), isEvalSupported: false, disableFontFace: true, useSystemFonts: false, useWorkerFetch: false, stopAtErrors: false, verbosity: 0 });
  // deno-lint-ignore no-explicit-any
  let doc: any;
  try { doc = await task.promise; }
  catch (e) {
    const name = (e as { name?: string })?.name;
    await task.destroy().catch(() => {});
    if (name === "PasswordException") return { text: "", pages: 0, pagesRead: 0, columns: [], refusal: "encrypted_pdf" };
    return { text: "", pages: 0, pagesRead: 0, columns: [], refusal: "corrupt" };
  }
  try {
    const pages = doc.numPages as number, pagesRead = Math.min(pages, PDF_MAX_PAGES);
    const out: string[] = [], columns: number[] = [];
    for (let n = 1; n <= pagesRead; n++) {
      const page = await doc.getPage(n);
      const vp = page.getViewport({ scale: 1 });
      const tc = await page.getTextContent();
      const items: Item[] = [];
      for (const it of tc.items as { str?: string; transform?: number[]; width?: number; height?: number }[]) {
        if (typeof it.str !== "string" || !it.transform) continue;
        const [a, b, , d, e, f] = it.transform;
        if (Math.abs(b) > Math.abs(a) + 0.01) continue; // rotated text (a margin label), not body text
        if (!it.str.trim()) continue;
        items.push({ s: it.str, x: e, y: f, w: it.width ?? 0, size: Math.abs(d) || it.height || 10 });
      }
      // The name and contact block sits above the first section heading, often across both columns: it is read first,
      // as its own lines, and the columns are found in what is below it.
      const headY = Math.max(-Infinity, ...items.filter((i) => headingOf(i.s)).map((i) => i.y));
      const header = Number.isFinite(headY) ? items.filter((i) => i.y > headY + 0.5 * i.size) : [];
      const body = header.length ? items.filter((i) => !header.includes(i)) : items;
      const { blocks, cols } = splitColumns(body, vp.width);
      columns.push(cols);
      for (const block of [header, ...blocks]) if (block.length) out.push(linesToText(toLines(block)));
      page.cleanup();
    }
    const text = out.join("\n");
    if (text.replace(/\s+/g, "").length < 40) return { text: "", pages, pagesRead, columns, refusal: "scanned" };
    return { text, pages, pagesRead, columns };
  } finally {
    await task.destroy().catch(() => {});
  }
}
// One gutter at most: an x where no item crosses, with three or more lines of text on each side, and only items above
// both columns (the name and contact block) crossing it. Reading order: what crosses (the header), the left column, the
// right column.
export function splitColumns(items: Item[], width: number): { blocks: Item[][]; cols: number } {
  if (items.length < 6) return { blocks: [items], cols: 1 };
  let best: { x: number; gap: number } | null = null;
  const lineCount = (xs: Item[]) => new Set(xs.map((i) => Math.round(i.y))).size;
  for (let x = width * 0.2; x <= width * 0.8; x += 2) {
    const cross = items.filter((i) => i.x < x && i.x + i.w > x);
    const left = items.filter((i) => i.x + i.w <= x), right = items.filter((i) => i.x >= x);
    if (lineCount(left) < 3 || lineCount(right) < 3) continue;
    const top = Math.min(Math.max(...left.map((i) => i.y)), Math.max(...right.map((i) => i.y)));
    if (cross.some((i) => i.y <= top + 1)) continue;
    // The gap: the free band around x (nearest right edge on the left, nearest left edge on the right).
    const gl = Math.max(...left.map((i) => i.x + i.w)), gr = Math.min(...right.map((i) => i.x));
    const gap = gr - gl;
    if (gap < 8) continue;
    if (!best || gap > best.gap) best = { x: (gl + gr) / 2, gap };
  }
  if (!best) return { blocks: [items], cols: 1 };
  const x = best.x;
  const head = items.filter((i) => i.x < x && i.x + i.w > x), left = items.filter((i) => i.x + i.w <= x), right = items.filter((i) => i.x >= x);
  return { blocks: [head, left, right].filter((b) => b.length), cols: 2 };
}
function toLines(items: Item[]): Line[] {
  const sorted = items.slice().sort((a, b) => b.y - a.y || a.x - b.x);
  const rows: Item[][] = [];
  for (const it of sorted) {
    const row = rows[rows.length - 1];
    if (row && Math.abs(row[0].y - it.y) <= Math.max(2, 0.45 * Math.min(row[0].size, it.size))) row.push(it);
    else rows.push([it]);
  }
  return rows.map((row) => {
    row.sort((a, b) => a.x - b.x);
    let text = "", end = -Infinity;
    for (const it of row) {
      const gap = it.x - end;
      if (text && gap > 0.15 * it.size && !/\s$/.test(text) && !/^\s/.test(it.s)) text += " ";
      text += it.s;
      end = it.x + it.w;
    }
    return { x: row[0].x, y: row[0].y, size: Math.max(...row.map((i) => i.size)), text: text.replace(/\s+/g, " ").trim() };
  });
}
const BULLET_RE = /^\s*(?:[•●▪◦■□➢►▸‣⁃∙○◆◇✓✔–—*\-·]|[\uF0B7\uF0A7\uF076\uF0D8\uF0FC\uF0A8\uF06E\uF0A4])\s*/;
function linesToText(lines: Line[]): string {
  const out: { text: string; bulletX: number | null; textX: number; y: number; size: number }[] = [];
  for (const l of lines) {
    const isBullet = BULLET_RE.test(l.text) && l.text.replace(BULLET_RE, "").length > 0;
    const prev = out[out.length - 1];
    // A wrapped bullet: the line after a bullet, indented past the bullet glyph, close below it, not a heading or bullet.
    if (!isBullet && prev && prev.bulletX !== null && l.x > prev.bulletX + 1.5 && prev.y - l.y <= 1.9 * Math.max(prev.size, l.size) && !headingOf(l.text)) {
      prev.text += ` ${l.text}`; prev.y = l.y; continue;
    }
    out.push({ text: l.text, bulletX: isBullet ? l.x : null, textX: l.x, y: l.y, size: l.size });
  }
  return out.map((o) => o.text).join("\n");
}

// ---- shaping: one text shape for every source -------------------------------------------------------------------------
// Heading words people use, mapped to the section names module 122 reads.
const HEADINGS: [RegExp, string][] = [
  [/^(?:professional |relevant |work |industry |career |employment )?(?:experience|history|employment)(?: history)?$/, "Experience"],
  [/^(?:education|academic background|education (?:&|and) training|academics)$/, "Education"],
  [/^(?:technical |core |key |relevant )?skills(?: (?:&|and) (?:tools|technologies|interests|abilities))?$|^(?:technologies|tools|technical proficiencies)$/, "Skills"],
  [/^(?:selected |personal |academic |key )?projects$/, "Projects"],
  [/^(?:licenses (?:&|and) )?certifications?(?: (?:&|and) licenses)?$|^certificates$/, "Certifications"],
  [/^(?:honors (?:&|and) )?awards(?: (?:&|and) honors)?$|^honors$/, "Awards"],
  [/^leadership(?: experience| (?:&|and) activities)?$|^activities$/, "Leadership"],
];
export function headingOf(line: string): string | null {
  let t = line.trim().replace(/[:：]$/, "").trim();
  if (!t || t.length > 48) return null;
  // Letter-spaced headings ("E X P E R I E N C E").
  if (/^(?:[A-Za-z] ){3,}[A-Za-z]$/.test(t)) t = t.replace(/ /g, "");
  const low = t.toLowerCase().replace(/\s+/g, " ");
  for (const [re, name] of HEADINGS) if (re.test(low)) return name;
  return null;
}
const LIGATURES: Record<string, string> = { "\uFB00": "ff", "\uFB01": "fi", "\uFB02": "fl", "\uFB03": "ffi", "\uFB04": "ffl", "\uFB05": "st", "\uFB06": "st" };
export function shapeResumeText(input: string, format: Format | "paste", meta: { pages?: number | null; pagesRead?: number | null; columns?: number[] | null } = {}): { text: string; report: StructureReport } {
  const renamed: { from: string; to: string }[] = [];
  let t = String(input ?? "").replace(/\r\n?/g, "\n").replace(/[\uFB00-\uFB06]/g, (c) => LIGATURES[c] ?? c)
    .replace(/[\u00A0\u2007\u202F\u2009]/g, " ").replace(/[\u00AD\u200B-\u200D\u2060\uFEFF]/g, "").replace(/\f/g, "\n");
  const lines: string[] = [];
  let section: string | null = null;
  for (const raw0 of t.split("\n")) {
    let line = raw0.replace(/[ \t]+/g, " ").trim();
    if (!line) { if (lines.length && lines[lines.length - 1] !== "") lines.push(""); continue; }
    const h = headingOf(line);
    if (h) {
      if (line.replace(/:$/, "") !== h) renamed.push({ from: line, to: h });
      lines.push(h); section = h; continue;
    }
    if (BULLET_RE.test(line) && line.replace(BULLET_RE, "").trim()) line = `• ${line.replace(BULLET_RE, "").trim()}`;
    // In a skills section, a middle dot separates skills the way a comma does.
    if (section === "Skills") line = line.replace(/\s+[·∙]\s+/g, ", ");
    lines.push(line);
  }
  t = lines.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  let cut: StructureReport["cut"] = null;
  if (t.length > RESUME_TEXT_MAX) {
    const at = t.lastIndexOf("\n", RESUME_TEXT_MAX);
    const kept = at > RESUME_TEXT_MAX * 0.8 ? at : RESUME_TEXT_MAX;
    cut = { kept, total: t.length, why: `longer than the ${RESUME_TEXT_MAX.toLocaleString("en-US")} characters I read from one resume` };
    t = t.slice(0, kept).trimEnd();
  }
  if (meta.pages && meta.pagesRead && meta.pagesRead < meta.pages && !cut) cut = { kept: t.length, total: t.length, why: `only the first ${meta.pagesRead} of its ${meta.pages} pages are read` };
  return { text: t, report: structureOf(t, format, { ...meta, renamed, cut }) };
}
export function structureOf(text: string, format: Format | "paste", o: { pages?: number | null; pagesRead?: number | null; columns?: number[] | null; renamed?: { from: string; to: string }[]; cut?: StructureReport["cut"] } = {}): StructureReport {
  // deno-lint-ignore no-explicit-any
  let drafts: any[] = [];
  try { drafts = (CareerProfile as any).parseResumeText(text) || []; } catch { drafts = []; }
  const byKind: Record<string, number> = {};
  for (const d of drafts) if (d && d.kind) byKind[d.kind] = (byKind[d.kind] || 0) + 1;
  const sections: Section[] = [];
  const KIND: Record<string, string> = { Experience: "experience", Education: "education", Skills: "skill", Projects: "project", Certifications: "certification", Awards: "award", Leadership: "leadership" };
  for (const line of text.split("\n")) {
    const h = headingOf(line);
    if (h && !sections.some((s) => s.name === h)) sections.push({ name: h, heading: line, entries: byKind[KIND[h]] || 0 });
  }
  const kinds = new Set(Object.keys(byKind));
  const resumeShaped = drafts.length >= 3 && kinds.size >= 2 && (kinds.has("experience") || kinds.has("education"));
  const confidence = resumeShaped && sections.length >= 2 ? "high" : drafts.length ? "medium" : "low";
  return { format, pages: o.pages ?? null, pagesRead: o.pagesRead ?? null, columns: o.columns ?? null, sections, entries: drafts.length, byKind, confidence, resumeShaped,
    headingsRenamed: o.renamed ?? [], chars: text.length, cut: o.cut ?? null };
}
