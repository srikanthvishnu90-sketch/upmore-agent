// FEATURE 17 (2026-10-26): after the person answers the questions a hosted preparation asked (the questions turn,
// career_apply_questions.ts), their queued postings are prepared again at once, through the same door the apply turn
// kicks (career_apply_from_chat.ts kickPrepare, CAREER_PREPARE_AHEAD_URL), and the reply says so instead of "the next
// time you prepare applications on your computer", which is not true for a person with only a phone. Only when every
// open question is answered (a preparation still waiting on one would only stop on it again), and only for postings in
// their own queue (the door takes nothing else). Nothing is approved, queued or sent here.
import { kickPrepare, prepareConfigured } from "./career_apply_from_chat.ts";

const ON_COMPUTER = /(They go on the forms|It goes on the form) the next time you prepare applications on your computer\./;

// deno-lint-ignore no-explicit-any
export async function prepareAfterAnswers(asked: { reply: string; status?: string } | null, o: { admin: any; userId: string; env: { get(k: string): string | undefined }; fetch: typeof fetch }): Promise<"started" | "failed" | "off" | "skipped"> {
  if (!asked || asked.status !== "answered" || !ON_COMPUTER.test(asked.reply)) return "skipped";
  if (!prepareConfigured(o.env)) return "off";
  const open = await o.admin.rpc("career_apply_questions_open_as", { p_user: o.userId, p_limit: 1 });
  if (open.error) return "skipped";
  if ((open.data ?? []).length) {
    // More are waiting: the application is prepared again here once those are answered, not "on your computer".
    asked.reply = asked.reply.replace(ON_COMPUTER, "Once the rest are answered, I'll prepare your application again here.");
    return "skipped";
  }
  const w = await o.admin.from("career_apply_wanted").select("posting_key").eq("user_id", o.userId).eq("state", "waiting").limit(25);
  const ids = w.error ? [] : (w.data ?? []).map((r: { posting_key: string }) => String(r.posting_key));
  if (!ids.length) return "skipped";
  const k = await kickPrepare({ env: o.env, fetch: o.fetch, userId: o.userId, jobIds: ids });
  if (k === "off") return "off";
  asked.reply = asked.reply.replace(ON_COMPUTER, k === "started"
    ? "I'm preparing your application again now with these answers; the card with every exact answer comes here when it's ready."
    : "Preparing it again hasn't started yet; it waits in your queue.");
  return k;
}
