// FEATURE 16: the handler's resume intake decisions (career_resume_intake.ts) and the channel seam (channel_inbound.ts):
// a split paste is held, joined and set aside on time; a long message is read only as a resume; the confirmation names
// the file only for the exact message it was read into; and a channel passes the whole text and the downloaded file on.
// Run: deno test -A --no-check tests/architect/resume-intake-unit.test.ts
import assertNode from "node:assert/strict";
import { afterRouter, fileUploadFor, HOLD_WINDOW_MS, intakeRawMessage, resumeFileIntake, resumeIntakeTurn, type IntakeState } from "../../supabase/functions/_shared/career_resume_intake.ts";
import { RESUME_TEXT_MAX } from "../../supabase/functions/_shared/career_resume_ingest_files.ts";
import { runInbound } from "../../supabase/functions/_shared/channel_inbound.ts";

const eq = (a: unknown, b: unknown, m?: string) => assertNode.deepStrictEqual(a, b, m);
const assert = (v: unknown, m?: string) => assertNode.ok(v, m);
const PASTE = await Deno.readTextFile(new URL("../fixtures/resume-files/long-paste.txt", import.meta.url));
const cutAt = PASTE.lastIndexOf("\n", 4096), P1 = PASTE.slice(0, cutAt), P2 = PASTE.slice(cutAt + 1);
const T0 = Date.UTC(2026, 9, 26, 15);
const turn = (message: string, state: IntakeState | null, o: { now?: number; channel?: string | null } = {}) =>
  resumeIntakeTurn({ file: null, message, userContent: message, pasteCut: null, channel: o.channel === undefined ? "telegram" : o.channel, state, now: o.now ?? T0 });

Deno.test("a split part is held only on a channel, only in the split range, only when it reads like a resume's start", async () => {
  const h = await turn(P1, null);
  eq([h?.kind, h?.kind === "answer" && h.status, h?.state?.hold?.parts], ["answer", "holding", [P1]]);
  // On the web nothing splits: the same 4,038 characters are a long message now, read only as a whole resume, and this
  // start of one (Experience only) is not: refused in plain words, never held.
  const web = await turn(P1, null, { channel: null });
  eq([web?.kind, web?.kind === "answer" && web.status], ["answer", "too_long"]);
  eq(await turn("Paragraph about the move.\n".repeat(150).slice(0, 3900), null), null, "split-sized but not a resume: not held, and (under 4,000) an ordinary message");
  eq(await turn("find me data analyst jobs in Chicago", null), null, "a short message is not intake's");
});

Deno.test("the next part within 5 minutes is joined; another part keeps holding; 'that's all' reads what was held; late parts are set aside and said", async () => {
  const held: IntakeState = { hold: { at: T0, parts: [P1] } };
  const j = await turn(P2, held, { now: T0 + 60_000 });
  assert(j?.kind === "route" && j.source === "joined", JSON.stringify(j).slice(0, 200));
  if (j?.kind !== "route") return;
  eq(j.userContent, `[2 messages joined]\n${P1}\n${P2}`);
  eq(j.state?.hold, null, "the hold is consumed");
  // A second split-sized part keeps holding, with both parts.
  const p2a = P2.slice(0, P2.lastIndexOf("\n", 3900));
  const more = await turn(p2a, held, { now: T0 + 1000 });
  eq([more?.kind, more?.kind === "answer" && more.status, more?.state?.hold?.parts?.length], ["answer", "holding", 2]);
  assert(more?.kind === "answer" && more.reply.startsWith("Got part 2 ("), more?.kind === "answer" ? more.reply : "");
  // Past the window: set aside, and the reply says so before whatever the new message gets.
  const late = await turn("find me data analyst jobs in Chicago", held, { now: T0 + HOLD_WINDOW_MS + 1 });
  assert(late?.kind === "route" && late.note && late.note.startsWith(`The ${P1.length.toLocaleString("en-US")}-character message you sent earlier looked like the first part of a resume, but the rest didn't arrive within 5 minutes`), JSON.stringify(late));
  eq(late?.state?.hold, null);
  eq((late as any).message, "find me data analyst jobs in Chicago", "the new message itself goes on unchanged");
});

Deno.test("a line Telegram broke mid-sentence joins with a space, not a new entry", async () => {
  const a = "Experience\nClerk, Bean Co\nAnalyst, Acme\n- Built the weekly report for the regional", b = "director and the finance team\nEducation\nB.A. History, Riverbend College";
  const j = await turn(b, { hold: { at: T0, parts: [a] } }, { now: T0 + 1000 });
  assert(j?.kind === "route");
  if (j?.kind !== "route") return;
  assert(j.message.includes("• Built the weekly report for the regional director and the finance team"), j.message);
});

Deno.test("a long paste: read as a resume up to 19,000 characters, cut at a line with the cut said; anything else refused in plain words", async () => {
  const r = await turn(PASTE, null, { channel: null });
  assert(r?.kind === "route" && r.source === "paste" && r.note === null, JSON.stringify(r).slice(0, 300));
  const long = `${PASTE}\nProjects\n${Array.from({ length: 400 }, (_, i) => `Study ${i}\n- Mapped ${i} pick faces for the site`).join("\n")}`;
  const cut = intakeRawMessage(long, null);
  assert(cut.cut && cut.cut.total === long.length && (cut.raw as string).length === cut.cut.kept && cut.cut.kept <= RESUME_TEXT_MAX);
  const c = await resumeIntakeTurn({ file: null, message: cut.raw as string, userContent: cut.raw as string, pasteCut: cut.cut, channel: null, state: null, now: T0 });
  assert(c?.kind === "route" && /^Your resume was [\d,]+ characters, and I read the first [\d,]+ \(up to "/.test(c.note ?? ""), JSON.stringify(c?.kind === "route" && c.note));
});

Deno.test("the file a resume was read from binds the yes only for that exact stored message", () => {
  const upload = { kind: "file" as const, ref: "tg-file:AgAD1", sha256: "f".repeat(64), filename: "cv.pdf", mime: "application/pdf", channel: "telegram", bytes: 10, format: "pdf" as const, message_sha256: "a".repeat(64), at: T0 };
  const seen = { kind: "message" as const, ref: "agent_messages:9", sha256: "a".repeat(64), text: "x" };
  eq(fileUploadFor(seen, { upload }), { kind: "file", ref: "tg-file:AgAD1", sha256: "f".repeat(64), text: "x" });
  eq(fileUploadFor({ ...seen, sha256: "b".repeat(64) }, { upload }), { ...seen, sha256: "b".repeat(64) }, "a different message stays its own upload");
  eq(fileUploadFor(seen, null), seen);
  eq(fileUploadFor(null, { upload }), null);
  // After the router: kept while presented, consumed by the yes, cleared by a fresh paste and by an erase.
  eq(afterRouter(null, { intent: "career_resume_ingest", resultStatus: "completed", reply: "" }, { upload }, false, null).state, { upload: null });
  eq(afterRouter(null, { intent: "career_resume_ingest", resultStatus: "awaiting_user", reply: "" }, { upload }, false, null).state, { upload: null });
  eq(afterRouter(null, { intent: "career_tailor", resultStatus: "completed", reply: "" }, { upload }, false, null).state, { upload }, "an unrelated turn leaves it");
  eq(afterRouter({ kind: "route", message: "", userContent: "", note: null, upload, state: { upload }, source: "file" }, { intent: "career_resume_ingest", resultStatus: "already_on_record", reply: "That resume is already on your record." }, null, false, "cv.pdf"),
    { state: { upload: null }, reply: null }, "the same file again: the router's own reply stands");
  eq(afterRouter(null, { intent: "career_profile_erased", resultStatus: "complete", reply: "" }, { upload }, true, null).state, undefined);
  // A file the router did not present as a resume: said, and nothing kept.
  const routed = { kind: "route" as const, message: "", userContent: "", note: null, upload, state: { upload }, source: "file" as const };
  eq(afterRouter(routed, { intent: "career_fallback", resultStatus: "completed", reply: "?" }, null, false, "cv.pdf"),
    { state: { upload: null }, reply: "I read cv.pdf, but I couldn't put it on your record as a resume, so nothing from it was saved. Paste the text here and I'll read it." });
});

Deno.test("resume_file on the request: a file over 10 MB is refused from its encoded size, before decoding; bad base64 is a damaged file", async () => {
  // Not even valid base64: refused as too large without being decoded (decoded, it would be a damaged file).
  const big = await resumeFileIntake({ resume_file: { data: "%".repeat(Math.ceil((10 * 1024 * 1024 + 1024) / 3) * 4), name: "big.pdf" } }, "web");
  eq([big?.ok, big && !big.ok && big.refusal], [false, "too_large"]);
  const bad = await resumeFileIntake({ resume_file: { data: "%%%not base64%%%", name: "x.pdf" } }, "web");
  eq([bad?.ok, bad && !bad.ok && bad.refusal], [false, "corrupt"]);
  eq(await resumeFileIntake({}, "web"), null);
  eq(intakeRawMessage("", bad).raw, "[resume file: x.pdf] (not read)");
});

// The channel seam: the whole text and the downloaded file reach the turn.
function core() {
  const chats: any[] = [], replies: any[] = [];
  const person = { userId: "u-1", threadId: "t-1", contact: "tg:42" };
  const store: any = {
    claimMessage: async () => true, person: async () => person, setOptOut: async () => {}, refusedBefore: async () => false,
    createPerson: async () => person, setThread: async () => {}, enqueueReply: async () => true,
  };
  const d: any = { env: { get: () => undefined }, now: () => T0, store, reply: async (c: string, b: string[]) => { replies.push(b); return { ok: true }; }, render: (t: string) => [t],
    chat: async (a: any) => { chats.push(a); return { status: 200, reply: "ok", threadId: "t-1" }; }, deliver: async () => {} };
  return { d, chats, replies };
}
const tgMsg = (o: Record<string, unknown>) => ({ provider: "telegram", channel: "telegram", messageId: String(Math.random()), kind: "text", contact: "tg:42", address: "42", text: "", ...o }) as any;
Deno.test("channel seam: the whole text goes to the turn (no silent 4,000 cut); a downloaded file is the turn's file; the channel is never sent", async () => {
  const { d, chats } = core();
  const long = "x".repeat(9000);
  await runInbound(tgMsg({ text: long }), d);
  eq(chats[0].message.length, 9000);
  eq(Object.keys(chats[0]).sort(), ["message", "threadId", "turnKey", "userId"], "the channel is never sent (WO-038)");
  const upload = { bytes: new Uint8Array([1, 2, 3]), name: "cv.pdf", mime: "application/pdf", ref: "tg-file:AgAD1" };
  await runInbound(tgMsg({ kind: "seen", file: true, upload }), d);
  eq([chats.length, chats[1].file, chats[1].message], [2, upload, ""], "a file with no caption is a turn, carrying the file");
  // A file the adapter could not download is still told what to do, and no turn runs.
  const c2 = core();
  await runInbound(tgMsg({ kind: "seen", file: true }), c2.d);
  eq([c2.chats.length, c2.replies.length], [0, 1]);
});
