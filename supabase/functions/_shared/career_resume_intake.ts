// FEATURE 16: the handler's side of resume intake (career_resume_ingest_files.ts reads the file itself).
//
// A turn can carry a resume three ways, and each reaches the router's existing resume step (142 handleResumePasteIngest,
// then "yes, that's my resume" and the evidence step in career_router_evidence.ts) as one text:
//   - a file (`resume_file` on the request: base64 bytes, name, type, the channel's reference and sha256): read by
//     ingestResumeFile; what was read is the turn's stored message, under a "[resume file: name]" line, and the upload
//     (reference, the file's sha256, the sha256 of the stored message) is kept on the thread so the confirmation's
//     fact_confirmed events name the file, not the chat message;
//   - a long paste: a message over 4,000 characters is read when it is a resume (the router's own test: three or more
//     entries, two or more kinds, experience or education among them), up to 19,000 characters; anything past that is
//     cut at a line and the reply says so. A long message that is not a resume is answered in plain words, not read;
//   - a paste a texting channel split into parts (Telegram sends at most 4,096 characters a message; the handler knows
//     only that the turn came on a channel, never which): a resume-looking part of 3,800 to 4,096 characters is held, the parts that follow within 5 minutes are joined to it, and "that's all" reads what was
//     sent. A hold the rest never came for is set aside and the next reply says so.
// Nothing here confirms anything: the router presents the entries as drafts, and only the person's yes confirms them.
import { type FileUpload, ingestResumeFile, PLAIN_MESSAGE_MAX, REPLIES, RESUME_FILE_MAX_BYTES, RESUME_TEXT_MAX, type ResumeFileIn, sha256Hex, shapeResumeText, structureOf } from "./career_resume_ingest_files.ts";

export const INTAKE_STATE_KEY = "resumeIntake";
export const FILE_INTENT = "career_resume_file", PASTE_INTENT = "career_resume_paste";
export const HOLD_WINDOW_MS = 5 * 60_000;
export const SPLIT_MIN = 3_800, SPLIT_MAX = 4_096;
// The longest message the handler stores: the resume bound plus the marker line, under career_host_commit's 20,000.
export const INPUT_MAX = RESUME_TEXT_MAX + 400;
const MARK = (name: string) => `[resume file: ${name.replace(/[\[\]\n\r]/g, " ").slice(0, 120)}]`;

export interface HeldUpload extends FileUpload { message_sha256: string; at: number }
export interface IntakeState { hold?: { at: number; parts: string[] } | null; upload?: HeldUpload | null }
export type FileIntake =
  | { ok: true; text: string; filename: string; upload: FileUpload; report: ReturnType<typeof structureOf>; cut: { kept: number; total: number; why: string } | null }
  | { ok: false; filename: string; reply: string; refusal: string };

const num = (n: number) => n.toLocaleString("en-US");

// ---- before the turn's text is read: the file, and a message too long to store -------------------------------------
// body.resume_file: { data: base64, name?, mime?, ref?, sha256? }. A file over 10 MB is refused from its encoded length,
// before it is decoded.
export async function resumeFileIntake(body: Record<string, unknown>, channel: string | null): Promise<FileIntake | null> {
  const f = body?.resume_file as Record<string, unknown> | undefined;
  if (!f || typeof f !== "object") return null;
  const filename = typeof f.name === "string" && f.name.trim() ? f.name.trim().slice(0, 120) : "resume";
  if (typeof f.data !== "string" || !f.data) return { ok: false, filename, reply: REPLIES.empty, refusal: "empty" };
  const b64 = f.data.replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  const approx = Math.floor((b64.length * 3) / 4);
  if (approx > RESUME_FILE_MAX_BYTES + 3) return { ok: false, filename, reply: REPLIES.too_large((approx / (1024 * 1024)).toFixed(1)), refusal: "too_large" };
  let bytes: Uint8Array;
  try { bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0)); }
  catch { return { ok: false, filename, reply: REPLIES.corrupt("file"), refusal: "corrupt" }; }
  const file: ResumeFileIn = { bytes, filename, mime: typeof f.mime === "string" ? f.mime : null, channel, uploadRef: typeof f.ref === "string" ? f.ref : null, sha256: typeof f.sha256 === "string" ? f.sha256 : null };
  const r = await ingestResumeFile(file);
  if (!r.ok) return { ok: false, filename, reply: r.reply, refusal: r.refusal };
  return { ok: true, text: r.text, filename, upload: r.upload, report: r.report, cut: r.report.cut };
}
// The text chatInput reads (its redaction and code rules apply to a file's text like any message), and a paste past the
// stored bound, cut at a line.
export function intakeRawMessage(raw: unknown, file: FileIntake | null): { raw: unknown; cut: { kept: number; total: number } | null } {
  if (file?.ok) return { raw: `${MARK(file.filename)}\n${file.text}`, cut: null };
  if (file && !file.ok) return { raw: `${MARK(file.filename)} (not read)${typeof raw === "string" && raw.trim() ? `\n${raw.trim().slice(0, 2000)}` : ""}`, cut: null };
  if (typeof raw !== "string" || raw.length <= RESUME_TEXT_MAX) return { raw, cut: null };
  const at = raw.lastIndexOf("\n", RESUME_TEXT_MAX);
  const kept = at > RESUME_TEXT_MAX * 0.8 ? at : RESUME_TEXT_MAX;
  return { raw: raw.slice(0, kept), cut: { kept, total: raw.length } };
}

// ---- the turn ------------------------------------------------------------------------------------------------------------
export type IntakeDecision =
  // Answered here: the router does not run. The state is the thread's resumeIntake after this turn.
  | { kind: "answer"; reply: string; intent: string; status: string; state: IntakeState | null }
  // The router reads `message` (its resume step); the stored message is `userContent`; `note` goes before the reply.
  | { kind: "route"; message: string; userContent: string; note: string | null; upload: HeldUpload | null; state: IntakeState | null; source: "file" | "paste" | "joined" };

const DONE = /^\s*(that'?s all|that is all|that'?s it|that was all|that'?s everything|done|all done|the end|end)[.! ]*$/i;
const lastLine = (t: string) => { const l = t.trimEnd().split("\n").pop() || ""; return l.length > 60 ? `${l.slice(0, 57)}...` : l; };
function cutNote(c: { kept: number; total: number } | null, text: string) {
  return c ? `Your resume was ${num(c.total)} characters, and I read the first ${num(c.kept)} (up to "${lastLine(text)}"); the rest was not read.` : null;
}
// Two parts of one split message: a line broken mid-sentence joins with a space, a part that ends a line with a newline.
function joinParts(parts: string[]) {
  return parts.reduce((acc, p) => {
    if (!acc) return p;
    const end = acc.trimEnd(), start = p.replace(/^\s+/, "");
    const midLine = /[A-Za-z0-9,;(]$/.test(end) && /^[a-z0-9(]/.test(start);
    return `${end}${midLine ? " " : "\n"}${start}`;
  }, "");
}
const holdReply = (n: number, parts: number) => parts === 1
  ? `That looks like the first part of a long message (long messages can arrive in parts of up to 4,096 characters; this part is ${num(n)}). Send the rest and I'll read the parts together as one resume. If that was all of it, say "that's all".`
  : `Got part ${parts} (${num(n)} characters). Send the rest, or say "that's all" and I'll read the ${parts} parts together.`;
const expiredNote = (n: number) => `The ${num(n)}-character message you sent earlier looked like the first part of a resume, but the rest didn't arrive within 5 minutes, so I set it aside without reading it. Send it again with the rest if you want me to read it.`;
const notResumeReply = (n: number) => `That message is ${num(n)} characters. I read messages up to ${num(PLAIN_MESSAGE_MAX)} characters, or a resume up to ${num(RESUME_TEXT_MAX)}, and this one doesn't look like a resume (I found no Experience or Education section with entries under it), so I haven't read it. Send it in shorter messages.`;
const fileNotResumeReply = (name: string, chars: number) => `I read ${name} (${num(chars)} characters), but it doesn't look like a resume: I found no Experience or Education section with entries under it, so nothing from it was saved. If it is your resume, paste the text here and I'll read it.`;

export async function resumeIntakeTurn(o: {
  file: FileIntake | null; message: string; userContent: string; pasteCut: { kept: number; total: number } | null;
  channel: string | null; state: IntakeState | null | undefined; now: number;
}): Promise<IntakeDecision | null> {
  const state: IntakeState = { ...(o.state ?? {}) };
  // A file: refused in plain words, or routed as the resume it is.
  if (o.file) {
    if (!o.file.ok) return { kind: "answer", reply: o.file.reply, intent: FILE_INTENT, status: `refused_${o.file.refusal}`, state: o.state ?? null };
    // The text read is the stored message after its first (marker) line; redaction ran on all of it.
    const nl = o.message.indexOf("\n");
    const text = nl >= 0 ? o.message.slice(nl + 1) : "";
    const report = structureOf(text, o.file.upload.format);
    if (!report.resumeShaped) return { kind: "answer", reply: fileNotResumeReply(o.file.filename, text.length), intent: FILE_INTENT, status: "not_a_resume", state: o.state ?? null };
    const upload: HeldUpload = { ...o.file.upload, message_sha256: await sha256Hex(o.userContent), at: o.now };
    const r = o.file.report;
    const note = o.file.cut && o.file.cut.kept < o.file.cut.total ? cutNote(o.file.cut, text)
      : r.pages && r.pagesRead && r.pagesRead < r.pages ? `I read the first ${r.pagesRead} of its ${r.pages} pages; the rest was not read.` : null;
    return { kind: "route", message: `Here is my resume:\n${text}`, userContent: o.userContent, note, upload, state: { ...state, hold: null, upload }, source: "file" };
  }
  const msg = o.message;
  let note: string | null = null;
  // A held first part: join, keep holding, or set aside when the rest never came.
  if (state.hold && state.hold.parts?.length) {
    const held = state.hold;
    if (o.now - held.at <= HOLD_WINDOW_MS) {
      const isPart = msg.length >= SPLIT_MIN && msg.length <= SPLIT_MAX && !!o.channel;
      const parts = DONE.test(msg) ? held.parts : [...held.parts, msg];
      const joined = joinParts(parts);
      if (isPart && !DONE.test(msg) && joined.length <= RESUME_TEXT_MAX) {
        return { kind: "answer", reply: holdReply(msg.length, parts.length), intent: PASTE_INTENT, status: "holding", state: { ...state, hold: { at: o.now, parts } } };
      }
      let text = joined, cut: { kept: number; total: number } | null = null;
      if (text.length > RESUME_TEXT_MAX) { const at = text.lastIndexOf("\n", RESUME_TEXT_MAX); const kept = at > RESUME_TEXT_MAX * 0.8 ? at : RESUME_TEXT_MAX; cut = { kept, total: text.length }; text = text.slice(0, kept); }
      const shaped = shapeResumeText(text, "paste");
      const next = { ...state, hold: null, upload: null };
      if (!shaped.report.resumeShaped) {
        const what = parts.length === 1 ? `I read the part you sent (${num(text.length)} characters), but on its own it doesn't read as a resume` : `I put the ${parts.length} parts together (${num(text.length)} characters), but they don't read as a resume`;
        return { kind: "answer", reply: `${what}: I need entries under at least two sections, Experience or Education among them, and found ${shaped.report.sections.map((x) => `${x.name} (${x.entries})`).join(", ") || "no sections"}. Nothing was saved. Paste the whole resume and I'll read it.`, intent: PASTE_INTENT, status: "not_a_resume", state: next };
      }
      // The joined text is this turn's stored message, so the confirmation finds the entries in what the person sent.
      return { kind: "route", message: shaped.text, userContent: `[${parts.length} messages joined]\n${text}`, note: cutNote(cut, text), upload: null, state: next, source: "joined" };
    }
    note = expiredNote(held.parts.join("").length);
    state.hold = null;
  }
  // A part a channel split off the start of a long resume.
  if (!!o.channel && msg.length >= SPLIT_MIN && msg.length <= SPLIT_MAX && !DONE.test(msg)) {
    const s = structureOf(shapeResumeText(msg, "paste").text, "paste");
    if (s.sections.length >= 1 && s.entries >= 1) {
      return { kind: "answer", reply: (note ? `${note}\n\n` : "") + holdReply(msg.length, 1), intent: PASTE_INTENT, status: "holding", state: { ...state, hold: { at: o.now, parts: [msg] }, upload: null } };
    }
  }
  if (msg.length > PLAIN_MESSAGE_MAX || o.pasteCut) {
    const shaped = shapeResumeText(msg, "paste");
    if (!shaped.report.resumeShaped) return { kind: "answer", reply: (note ? `${note}\n\n` : "") + notResumeReply(o.pasteCut?.total ?? msg.length), intent: PASTE_INTENT, status: "too_long", state };
    const cn = cutNote(o.pasteCut, msg);
    return { kind: "route", message: shaped.text, userContent: o.userContent, note: [note, cn].filter(Boolean).join(" ") || null, upload: null, state: { ...state, upload: null }, source: "paste" };
  }
  if (note) return { kind: "route", message: msg, userContent: o.userContent, note, upload: null, state, source: "paste" };
  return null;
}

// ---- around the router: the upload kept for the confirmation, and the confirmation's upload -------------------------
// After the router: a presented file keeps its upload on the thread (until the yes, a new paste, or an erase). A routed
// file the router did not present as a resume is said so: nothing was saved from it.
// deno-lint-ignore no-explicit-any
export function afterRouter(d: IntakeDecision | null, out: { intent?: string | null; resultStatus?: string | null; reply: string }, prior: IntakeState | null | undefined, erased: boolean, filename: string | null): { state: IntakeState | null | undefined; reply: string | null } {
  if (erased) return { state: undefined, reply: null };
  const presented = out.intent === "career_resume_ingest" && out.resultStatus === "awaiting_user";
  const confirmed = out.intent === "career_resume_ingest" && out.resultStatus === "completed";
  // The same resume again: every entry is confirmed already (the router says so); nothing waits for a yes.
  const known = out.intent === "career_resume_ingest" && out.resultStatus === "already_on_record";
  if (d?.kind === "route") {
    if (presented) return { state: d.state, reply: null };
    if (known) return { state: { ...(d.state ?? {}), upload: null }, reply: null };
    if (d.source === "file") return { state: { ...(d.state ?? {}), upload: null }, reply: `I read ${filename ?? "the file"}, but I couldn't put it on your record as a resume, so nothing from it was saved. Paste the text here and I'll read it.` };
    return { state: d.state, reply: null };
  }
  if (presented) return { state: { ...(prior ?? {}), upload: null }, reply: null }; // a fresh paste: the file upload no longer binds
  if (confirmed && prior?.upload) return { state: { ...prior, upload: null }, reply: null };
  return { state: prior, reply: null };
}
// The confirmation's upload: the stored message the entries were found in, named as the file it was read from when the
// thread's kept upload is that exact message (its sha256). Otherwise the message stands as the upload.
export function fileUploadFor<U extends { kind: "message" | "file"; ref: string; sha256: string; text: string }>(seen: U | null, prior: IntakeState | null | undefined): U | { kind: "file"; ref: string; sha256: string; text: string } | null {
  const u = prior?.upload;
  if (!seen || !u || seen.kind !== "message" || seen.sha256 !== u.message_sha256) return seen;
  return { kind: "file" as const, ref: u.ref, sha256: u.sha256, text: seen.text };
}

// An intake answer is saved like any turn: the stored message, the reply and the thread's state, in the host's one commit.
// deno-lint-ignore no-explicit-any
export function commitIntakeAnswer(persistence: { commit(a: any): Promise<any> }, a: Record<string, unknown>) {
  return persistence.commit({ ...a, taskIntent: null, batchIntent: null });
}
