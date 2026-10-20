// WO-064: career-answer-draft, the extension panel's "drafted from your facts". The essay card's pattern (WO-049):
//   - the signed-in person's own session only (a service key is refused), POST only, JSON;
//   - their facts are read here, on the server, from their account (supabaseFacts); a fact in the request is ignored;
//   - OpenAI only, through the gateway (essayModelConfig);
//   - at most ANSWER_CAP drafted questions a person in 24 hours, counted on their own timeline (career_events, source
//     answer_card), reserved before the model is called so two Prepares at once never pass it.
// The drafts go back to the panel, which shows each pre-selected; nothing is saved or filled here.
import { type ShortDraft, type ShortQuestion, draftShortAnswers, neverDraft } from "./answer_draft.ts";
import { DAY_MS, jwtRole } from "./career_essay_card.ts";
import type { ModelFn } from "./essay_draft.ts";

export const ANSWER_CAP = 600;
export const MAX_QUESTIONS = 200;

const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
export function readShortRequest(body: unknown): { ok: true; questions: ShortQuestion[] } | { ok: false; message: string } {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, message: "The request holds no questions." };
  const list = (body as Record<string, unknown>).questions;
  if (!Array.isArray(list) || !list.length) return { ok: false, message: "The request holds no questions." };
  if (list.length > MAX_QUESTIONS) return { ok: false, message: `At most ${MAX_QUESTIONS} questions at once.` };
  const out: ShortQuestion[] = [], seen = new Set<string>();
  for (const x of list) {
    if (!x || typeof x !== "object") continue;
    const r = x as Record<string, unknown>;
    const key = str(r.key, 120), label = str(r.label, 600);
    if (!key || !label || seen.has(key)) continue;
    seen.add(key);
    out.push({
      key, label, type: str(r.type, 40) || "text", company: str(r.company, 200), location: str(r.location, 200) || null,
      options: (Array.isArray(r.options) ? r.options : []).slice(0, 200).map((o) => str(o, 300)).filter(Boolean),
      own_words: r.own_words === true,
    });
  }
  return out.length ? { ok: true, questions: out } : { ok: false, message: "The request holds no questions." };
}

export interface AnswerCounter {
  used(userId: string, sinceIso: string): Promise<number>; // questions drafted in the window
  reserve(userId: string, atIso: string, n: number): Promise<string>;
  release(id: string): Promise<void>;
}
export interface AnswerCardDeps {
  facts(userId: string): Promise<unknown[]>;
  model: ModelFn;
  counter: AnswerCounter;
  now(): number;
  cap?: number;
}
export type AnswerReply =
  | { ok: true; drafts: ShortDraft[]; drafted: number; used: number; cap: number; message: string }
  | { ok: false; why: "invalid" | "model"; message: string };

export async function answerCardDrafts(userId: string, body: unknown, deps: AnswerCardDeps): Promise<AnswerReply> {
  const cap = deps.cap ?? ANSWER_CAP;
  const r = readShortRequest(body);
  if (!r.ok) return { ok: false, why: "invalid", message: r.message };
  const since = new Date(deps.now() - DAY_MS).toISOString();
  let used: number;
  try { used = await deps.counter.used(userId, since); }
  catch { return { ok: false, why: "model", message: "Trainee couldn't draft answers right now. Answer them in the panel as before." }; }
  // Never-drafted questions cost nothing; the rest are drafted while there is room, the remainder said plainly.
  const room = Math.max(0, cap - used);
  const draftable = r.questions.filter((q) => !neverDraft(q.label));
  const go = new Set(draftable.slice(0, room).map((q) => q.key));
  const capped = new Set(draftable.slice(room).map((q) => q.key));
  let drafts: ShortDraft[] = [];
  const send = r.questions.filter((q) => !capped.has(q.key));
  if (go.size) {
    let reserved: string | null = null;
    try { reserved = await deps.counter.reserve(userId, new Date(deps.now()).toISOString(), go.size); }
    catch { return { ok: false, why: "model", message: "Trainee couldn't draft answers right now. Answer them in the panel as before." }; }
    drafts = await draftShortAnswers(send, { model: deps.model, facts: () => deps.facts(userId), now: deps.now() });
    if (drafts.every((d) => !d.ok && d.why === "model")) await deps.counter.release(reserved).catch(() => {});
  } else {
    drafts = send.map((q) => ({ key: q.key, ok: false, why: "never" as const }));
  }
  const byKey = new Map(drafts.map((d) => [d.key, d]));
  const all: ShortDraft[] = r.questions.map((q) => capped.has(q.key) ? { key: q.key, ok: false, why: "cap" } : byKey.get(q.key)!);
  const n = all.filter((d) => d.ok).length;
  const message = [
    n ? `Trainee drafted ${n} of ${all.length} from your confirmed facts. Check each one; nothing is saved until you press Save answers.` : "Trainee couldn't draft any of these from your confirmed facts, so they're yours to answer.",
    capped.size ? `${capped.size} more weren't drafted: Trainee drafts at most ${cap} answers a day.` : "",
  ].filter(Boolean).join(" ");
  return { ok: true, drafts: all, drafted: n, used: used + go.size, cap, message };
}

export const COUNTER_SOURCE = "answer_card";
export function supabaseAnswerCounter(admin: any): AnswerCounter {
  return {
    async used(userId, sinceIso) {
      const r = await admin.from("career_events").select("detail").eq("user_id", userId).eq("kind", "note").eq("source", COUNTER_SOURCE).gte("at", sinceIso).limit(1000);
      if (r.error) throw new Error(`count drafts: ${r.error.message}`);
      return (r.data ?? []).reduce((n: number, row: any) => n + (Number(row?.detail?.questions) || 0), 0);
    },
    async reserve(userId, atIso, n) {
      const r = await admin.from("career_events").insert({
        user_id: userId, at: atIso, kind: "note", source: COUNTER_SOURCE, subject: "answers drafted",
        detail: { what: "short answers drafted in the extension panel from confirmed facts", questions: n },
      }).select("id").single();
      if (r.error) throw new Error(`count these drafts: ${r.error.message}`);
      return String(r.data.id);
    },
    async release(id) {
      await admin.from("career_events").delete().eq("id", Number(id)).eq("source", COUNTER_SOURCE);
    },
  };
}

export interface AnswerHandlerDeps {
  cors: Record<string, string>;
  user(token: string): Promise<{ id: string } | null>;
  card(userId: string): AnswerCardDeps;
  done?(userId: string): Promise<void>;
}
export async function handleAnswerDraft(req: Request, d: AnswerHandlerDeps): Promise<Response> {
  const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { ...d.cors, "content-type": "application/json" } });
  if (req.method === "OPTIONS") return new Response("ok", { headers: d.cors });
  if (req.method !== "POST") return json(405, { ok: false, why: "invalid", message: "POST only." });
  const m = (req.headers.get("authorization") ?? "").match(/^Bearer\s+(.+)$/i);
  if (!m) return json(401, { ok: false, why: "invalid", message: "Sign in to Upmore first." });
  if (jwtRole(m[1]) !== "authenticated") return json(403, { ok: false, why: "invalid", message: "Only a person's own sign-in can ask for drafts." });
  const user = await d.user(m[1]).catch(() => null);
  if (!user?.id) return json(401, { ok: false, why: "invalid", message: "Sign in to Upmore first." });
  const body = await req.json().catch(() => null);
  const reply = await answerCardDrafts(user.id, body, d.card(user.id));
  if (d.done) await d.done(user.id).catch(() => {});
  return json(reply.ok || reply.why !== "invalid" ? 200 : 400, reply);
}
