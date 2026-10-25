// SUBMIT-STEER-1130 / SPLIT-1146 (a): the writer for a resume confirmation, with real provenance.
//
// The router (142) confirms a pasted resume when the person says it is theirs ("yes, that's my resume"): every entry goes
// from draft to confirmed, with no provenance and no confirmation event, so the trust contract every application reads
// (trustedProfile, trustedManifest: WO-102) keeps none of them. This stamps the evidence the contract asks for, but only
// for what the person actually confirmed:
//   - a fact the turn confirmed (a draft in the profile the turn started from, confirmed in the one it left), on the
//     router's own confirm of a pasted resume (intent career_resume_ingest, completed);
//   - whose words Trainee showed the person, verbatim, between their upload and their yes (`shown`): a yes to "I read it
//     as 15 facts" confirms no fact's words, so it evidences none;
//   - whose words are in the person's own upload (`upload`: their message, or their file, by reference and hash): a fact
//     minted from a document or a model's claim, not traceable to what they gave, is never evidenced.
// Each stamped fact names a persisted fact_confirmed event (this person, now, their own message's hash, the upload's
// reference and hash, the hash of what was shown) and carries an owner provenance. An event that cannot be recorded stamps
// nothing: the fact reads as needs-review, never as evidenced (the brain's rule, career_tools.ts confirm_profile_fact).
import { type EventStore, recordEvent } from "./agent/timeline.ts";

export const RESUME_CONFIRM_PROVENANCE = "owner confirmed in chat the resume entry shown to them";
const CONFIRMING = new Set(["career_resume_ingest"]);

export interface Shown { text: string; message_ids: string[] }
export interface Upload { kind: "message" | "file"; ref: string; sha256: string; text: string }
export interface EvidenceResult { stamped: number; unshown: number; untraced: number; refused: number }

export async function sha256Hex(s: string) {
  const d = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
}
// Words compared as words: case, spacing, line breaks and dash or quote styles never decide.
export const words = (s: unknown) => String(s ?? "").toLowerCase().replace(/[‐-―−]/g, "-").replace(/[‘’`]/g, "'").replace(/[“”]/g, '"')
  .replace(/[•·▪●◦*]/g, " ").replace(/\s+/g, " ").trim();

// deno-lint-ignore no-explicit-any
export async function evidenceResumeConfirmation(o: {
  userId: string; now: number; message: string; before: any; after: any;
  out: { intent?: string | null; resultStatus?: string | null } | null | undefined;
  shown: Shown | null | undefined; upload: Upload | null | undefined; events: EventStore | null | undefined;
}): Promise<EvidenceResult> {
  const r: EvidenceResult = { stamped: 0, unshown: 0, untraced: 0, refused: 0 };
  if (!o.out || !CONFIRMING.has(String(o.out.intent)) || o.out.resultStatus !== "completed") return r;
  const facts = Array.isArray(o.after?.facts) ? o.after.facts : [];
  // deno-lint-ignore no-explicit-any
  const drafts = new Set((Array.isArray(o.before?.facts) ? o.before.facts : []).filter((f: any) => f && f.needs_confirmation === true).map((f: any) => f.id));
  // deno-lint-ignore no-explicit-any
  const turned = facts.filter((f: any) => f && drafts.has(f.id) && f.status === "confirmed" && f.needs_confirmation === false &&
    !f.confirmation_event_id && !f.provenance && words(f.text));
  if (!turned.length) return r;
  const shown = words(o.shown?.text), given = words(o.upload?.text);
  const at = new Date(o.now).toISOString(), message_sha256 = await sha256Hex(String(o.message ?? ""));
  const shown_sha256 = o.shown ? await sha256Hex(o.shown.text) : null;
  for (const f of turned) {
    const w = words(f.text);
    if (!shown || !shown.includes(w)) { r.unshown++; continue; }
    // The entry's own lines are in what they gave; the words that join them (title, then bullets) need not be.
    const parts = [f.title, ...(Array.isArray(f.bullets) ? f.bullets : []), ...(f.title || f.bullets ? [] : [f.text])].map(words).filter(Boolean);
    if (!o.upload || !given || !parts.length || !parts.every((p) => given.includes(p))) { r.untraced++; continue; }
    const event = crypto.randomUUID();
    const kept = await recordEvent(o.events, {
      user_id: o.userId, at: o.now, kind: "fact_confirmed", subject: f.text, source: "chat",
      detail: { id: f.id, kind: f.kind ?? null, confirmation_event_id: event, message_sha256, shown_sha256, shown_message_ids: o.shown!.message_ids.slice(0, 10),
        upload: { kind: o.upload.kind, ref: o.upload.ref, sha256: o.upload.sha256 }, via: "router: their yes to the resume entries shown to them" },
    });
    if (!kept) { r.refused++; continue; }
    Object.assign(f, {
      provenance: `${RESUME_CONFIRM_PROVENANCE} (${at})`, confirmation_event_id: event, confirmed_at: at,
      source_ref: { upload: o.upload.ref, upload_sha256: o.upload.sha256, shown_sha256 },
    });
    r.stamped++;
  }
  return r;
}

// What the person was shown and what they gave, from their thread's messages (newest first, as read): the assistant's
// replies since their latest message that carries the confirmed entries' words, and that message, as their upload.
// deno-lint-ignore no-explicit-any
export async function resumeConfirmationContext(rows: { id: string | number; role: string; content: string }[], after: any): Promise<{ shown: Shown | null; upload: Upload | null }> {
  // deno-lint-ignore no-explicit-any
  const lines: string[] = (Array.isArray(after?.facts) ? after.facts : []).flatMap((f: any) => [f?.title, ...(Array.isArray(f?.bullets) ? f.bullets : [])]).map(words).filter(Boolean);
  const shownTexts: string[] = [], ids: string[] = [];
  // rows[0] is the person's yes this turn when the host stored it already; it is never the upload.
  for (const m of rows) {
    if (m.role === "assistant") { shownTexts.unshift(String(m.content ?? "")); ids.unshift(String(m.id)); continue; }
    if (m.role !== "user") continue;
    const w = words(m.content);
    if (lines.length && lines.some((l) => w.includes(l))) {
      return { shown: shownTexts.length ? { text: shownTexts.join("\n"), message_ids: ids } : null,
        upload: { kind: "message", ref: `agent_messages:${m.id}`, sha256: await sha256Hex(String(m.content)), text: String(m.content) } };
    }
  }
  return { shown: null, upload: null };
}
