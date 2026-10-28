// REPLY SHAPE (owner, 2026-10-28): the way a Telegram reply is laid out. The agent returns { answer, attachments[], links[] };
// the channel sends the answer, then each attachment as a document message, then each link as its own message (so the
// platform shows its link preview card), in that order.
//
//   answer       ONE short plain paragraph that answers the question. What is published or confirmed is kept apart from what
//                is unknown (the prompt's rule, _shared/agent/prompt.ts SHAPE_RULES; this module only enforces size and form).
//   attachments  detail that does not fit (research, a comparison, a full posting list, a batch of drafts): a .md or .txt
//                file, a named document, never a wall of text. A text over the limit is split into parts, never cut.
//   links        http(s) URLs only, one per message, at most MAX_LINKS; a URL that no tool returned and the person did not
//                give is dropped (D-007: no invented links).
//
// Pure: no I/O, no model, no canned prose. The words are the model's; this code only measures, names and orders them.
// Text the person approves word for word (a card, an email or outreach draft, a reply in parts) is never shaped: the
// caller decides that (career_reply_writer.ts writable()).

export const ANSWER_MAX_CHARS = 700; // one short paragraph
export const FILE_MAX_BYTES = 6144; // "4 KB-ish": one document carries at most this; more is split into parts
export const MAX_FILES = 5; // per reply
export const MAX_LINKS = 5; // per reply, each its own message
export const OVERFLOW_FILE = "full-answer.md"; // the name of a long answer's full text

export interface ShapedFile { filename: string; content: string; mime: string; bytes: number }
export interface ShapedReply { answer: string; attachments: ShapedFile[]; links: string[]; notes: string[] }
export interface RawShape { answer?: unknown; attachments?: unknown; links?: unknown }

const enc = new TextEncoder();
export const byteLength = (s: string) => enc.encode(s).length;
const URL_RX = /https?:\/\/[^\s<>()\]"'`]+/g;
const trimUrl = (u: string) => u.replace(/[.,;:!?]+$/, "");
export const urlsIn = (text: string): string[] => [...new Set((String(text ?? "").match(URL_RX) ?? []).map(trimUrl))];

// A file name a person can read: lowercase words joined by "-", .md or .txt (anything else becomes .md), no path.
export function safeFilename(name: unknown, fallback = "details"): { filename: string; mime: string } {
  const raw = String(name ?? "").split(/[\\/]/).pop() ?? "";
  const m = /\.(md|txt)$/i.exec(raw.trim());
  const ext = m ? m[1].toLowerCase() : "md";
  const stem = (m ? raw.trim().slice(0, -m[0].length) : raw.replace(/\.[A-Za-z0-9]{1,5}$/, ""))
    .toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || fallback;
  return { filename: `${stem}.${ext}`, mime: ext === "txt" ? "text/plain" : "text/markdown" };
}

// Text into pieces of at most `max` bytes: paragraphs travel together while they fit, a longer paragraph is split on
// lines, then words (a single word longer than `max` on code points). Nothing is cut or dropped.
export function packBytes(text: string, max: number): string[] {
  const clean = String(text ?? "").replace(/\r\n/g, "\n").trim();
  if (!clean) return [];
  const pieces: string[] = [];
  const hard = (w: string) => { let b = ""; for (const ch of w) { if (byteLength(b + ch) > max) { pieces.push(b); b = ""; } b += ch; } return b; };
  const out: string[] = [];
  let buf = "";
  const add = (piece: string, sep: string) => {
    if (buf && byteLength(buf) + sep.length + byteLength(piece) <= max) buf += sep + piece;
    else { if (buf) out.push(buf); buf = piece; }
  };
  for (const para of clean.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean)) {
    if (byteLength(para) <= max) { add(para, "\n\n"); continue; }
    for (const line of para.split("\n")) {
      if (byteLength(line) <= max) { add(line, "\n"); continue; }
      let cur = "";
      for (const word of line.split(/\s+/)) {
        if (byteLength(word) > max) { if (cur) { add(cur, "\n"); cur = ""; } pieces.length = 0; const tail = hard(word); for (const p of pieces) add(p, "\n"); add(tail, "\n"); continue; }
        if (cur && byteLength(cur) + 1 + byteLength(word) > max) { add(cur, "\n"); cur = word; } else cur = cur ? `${cur} ${word}` : word;
      }
      if (cur) add(cur, "\n");
    }
  }
  if (buf) out.push(buf);
  return out;
}

// One attachment, named and sized: whole when it fits, else numbered parts ("company-research-1-of-2.md").
export function fileParts(filename: unknown, content: unknown): ShapedFile[] {
  const { filename: name, mime } = safeFilename(filename);
  const parts = packBytes(String(content ?? "").replace(/<!--[\s\S]*?-->/g, ""), FILE_MAX_BYTES);
  const dot = name.lastIndexOf("."), stem = name.slice(0, dot), ext = name.slice(dot);
  return parts.map((p, i) => ({ filename: parts.length === 1 ? name : `${stem}-${i + 1}-of-${parts.length}${ext}`, content: p, mime, bytes: byteLength(p) }));
}

const sentences = (s: string) => s.split(/(?<=[.!?])\s+/).map((x) => x.trim()).filter(Boolean);

// A long answer: the head (its first paragraph, else its first sentences, up to ANSWER_MAX_CHARS) stays the reply; the whole
// text goes in a file. Never a wall of text; never a loss.
export function splitLongAnswer(answer: string): { head: string; file: string } | null {
  const text = answer.trim();
  if (text.length <= ANSWER_MAX_CHARS) return null;
  const first = text.split(/\n\s*\n/)[0].trim();
  let head = first.length <= ANSWER_MAX_CHARS ? first : "";
  if (!head) {
    for (const s of sentences(first)) { if ((head ? head.length + 1 : 0) + s.length > ANSWER_MAX_CHARS) break; head = head ? `${head} ${s}` : s; }
  }
  if (!head) { // the first sentence alone is too long: cut at a word, the file has all of it
    const w = first.slice(0, ANSWER_MAX_CHARS).replace(/\s+\S*$/, "").trim();
    head = `${w}…`;
  }
  return { head, file: text };
}

// The shape of one reply. `allowedLinks`: the URLs the turn may show (those a tool returned or the person typed); null: the
// caller vouches for every link (the code-written replies). A link that is not allowed is dropped from links and answer.
export function shapeReply(raw: RawShape, o: { allowedLinks?: Iterable<string> | null } = {}): ShapedReply {
  const notes: string[] = [];
  const allowed = o.allowedLinks ? new Set([...o.allowedLinks].map(trimUrl)) : null;
  let answer = String(raw.answer ?? "").replace(/<!--[\s\S]*?-->/g, "").trim();

  // Links: whatever the model put in `links`, then every URL left in the answer; each once, http(s) only, in order.
  const wanted = [...(Array.isArray(raw.links) ? raw.links.map((l) => trimUrl(String(l ?? "").trim())) : []), ...urlsIn(answer)];
  const links: string[] = [];
  for (const u of wanted) {
    if (!/^https?:\/\/[^\s/]+\.[^\s/]+/i.test(u)) { notes.push(`link dropped (not a web address): ${u.slice(0, 80)}`); continue; }
    if (allowed && !allowed.has(u)) { notes.push(`link dropped (no tool returned it): ${u.slice(0, 120)}`); continue; }
    if (links.includes(u)) continue;
    if (links.length >= MAX_LINKS) { notes.push(`link dropped (over ${MAX_LINKS}): ${u.slice(0, 120)}`); continue; }
    links.push(u);
  }
  // Take every URL out of the answer text: a line that was only a link goes, a link inside a sentence leaves the sentence.
  answer = answer.split("\n").map((line) => {
    const bare = line.replace(URL_RX, "").replace(/[\s:()\-–—•*]+/g, "");
    return URL_RX.test(line) && !bare ? "" : line.replace(URL_RX, "").replace(/\s*\(\s*\)/g, "").replace(/[ \t]{2,}/g, " ").replace(/\s+([.,;:!?])/g, "$1").trimEnd();
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();

  // Attachments: sanitized, sized, at most MAX_FILES.
  const files: ShapedFile[] = [];
  const add = (fs: ShapedFile[]) => {
    for (const f of fs) {
      if (files.length >= MAX_FILES) { notes.push(`file dropped (over ${MAX_FILES}): ${f.filename}`); continue; }
      let name = f.filename;
      for (let n = 2; files.some((x) => x.filename === name); n++) name = f.filename.replace(/(\.[a-z]+)$/, `-${n}$1`);
      files.push({ ...f, filename: name });
    }
  };
  for (const a of Array.isArray(raw.attachments) ? raw.attachments : []) {
    const r = a && typeof a === "object" ? a as Record<string, unknown> : {};
    const parts = fileParts(r.filename, r.content);
    if (!parts.length) { notes.push("file dropped (empty)"); continue; }
    add(parts);
  }
  // A long answer becomes a file, with its short head as the reply.
  const long = splitLongAnswer(answer);
  if (long) { answer = long.head; add(fileParts(OVERFLOW_FILE, long.file)); notes.push("long answer moved to a file"); }
  return { answer, attachments: files, links, notes };
}

// ---------------------------------------------------------------------------------------------------------------------
// Order of sends: the answer, each attachment, each link. `io` is the channel's own sender (the tests' fake transport too).

export type SendStep = { kind: "answer"; text: string } | { kind: "document"; file: ShapedFile } | { kind: "link"; url: string };
export function planSends(s: ShapedReply, o: { includeAnswer?: boolean } = {}): SendStep[] {
  return [
    ...(o.includeAnswer !== false && s.answer ? [{ kind: "answer" as const, text: s.answer }] : []),
    ...s.attachments.map((file) => ({ kind: "document" as const, file })),
    ...s.links.map((url) => ({ kind: "link" as const, url })),
  ];
}
export interface ShapeIO {
  text?: (text: string) => Promise<{ ok: boolean }>;
  document: (f: { filename: string; mime: string; bytes: Uint8Array }) => Promise<{ ok: boolean }>;
  link: (url: string) => Promise<{ ok: boolean }>;
}
// Runs the plan in order, one message each. A step that fails does not stop the next; the counts say what went.
export async function deliverShaped(s: ShapedReply, io: ShapeIO, o: { includeAnswer?: boolean } = {}): Promise<{ sent: number; failed: number; files: number; links: number }> {
  let sent = 0, failed = 0, files = 0, links = 0;
  for (const step of planSends(s, o)) {
    const r = await (step.kind === "answer" ? (io.text ? io.text(step.text) : Promise.resolve({ ok: false }))
      : step.kind === "document" ? io.document({ filename: step.file.filename, mime: step.file.mime, bytes: enc.encode(step.file.content) })
      : io.link(step.url)).catch(() => ({ ok: false }));
    if (r.ok) { sent++; if (step.kind === "document") files++; if (step.kind === "link") links++; } else failed++;
  }
  return { sent, failed, files, links };
}

// The turn's decision (agent-chat): shape only a Telegram turn, only with CAREER_REPLY_WRITER on, only a turn whose words are
// not an exact payload the person approves. Anything else is returned untouched and carries no shape.
export function shapeForTurn(o: { on: boolean; channel: string; writable: boolean; reply: string; attachments?: unknown; allowedLinks?: Iterable<string> | null }):
  { reply: string; shape: { attachments: { filename: string; content: string }[]; links: string[] } | null; notes: string[] } {
  if (!o.on || o.channel !== "telegram" || !o.writable) return { reply: o.reply, shape: null, notes: [] };
  const s = shapeReply({ answer: o.reply, attachments: o.attachments }, { allowedLinks: o.allowedLinks });
  if (!s.answer && !s.attachments.length) return { reply: o.reply, shape: null, notes: s.notes }; // nothing left to say: today's reply stands
  return { reply: s.answer || o.reply, shape: s.attachments.length || s.links.length ? { attachments: s.attachments.map((f) => ({ filename: f.filename, content: f.content })), links: s.links } : null, notes: s.notes };
}
