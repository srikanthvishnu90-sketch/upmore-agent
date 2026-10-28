// WO-022 W2 + W3: the card of prepared applications and the one text that answers it. Code decides what was approved;
// the model never does. D-031 (SERIAL-1440): one direct text yes within 10 minutes approves exactly the batch the card
// shows, once, by the hashes it carries; it never sends. SERIAL-1451: the yes answers the card this thread showed (its id
// in the reply's meta) and no other; the 10-minute window is also the database's (20261025170000). SERIAL-1461: a yes
// approves only when the channel's reply-to id is the message that carried the card; with no reply id, or a reply to any
// other message, nothing is approved and the person is told to reply directly to the card or tap. Every word of a card comes from the engine's own card lines (what the dry run read back from the
// form); every word of an answer from the queue's own results.
//
// Declining is "no", never "stop": over SMS, STOP is the carrier's opt-out keyword, and trainee-inbound treats it as the
// channel command that silences every text before a turn runs.
//
// WO-027: each answered line is written to the account's timeline (approved, or the reason it was not sent). A timeline
// that cannot be written never changes the answer.
import { type EventStore, recordEvent } from "./agent/timeline.ts";

export interface Prepared {
  id: string;
  company: string;
  card_lines: string[];
  created_at?: string;
  resume_sha256?: string | null; // the payload's resume hash, when the store reads it (OWNER RULE 2026-10-26)
}
export interface Card {
  id: string;
  items: { n: number; prepared_id: string; payload_hash: string }[];
  shown_at: string;
}
export interface CardResult {
  n: number;
  company: string;
  result: string;
}
export interface CardStore {
  pending(userId: string): Promise<Prepared[]>; // ready, or shown on a card that closed: oldest first
  open(userId: string, ids: string[]): Promise<Card>;
  latestOpen(userId: string): Promise<Card | null>;
  answer(userId: string, cardId: string, approve: number[]): Promise<CardResult[]>;
  lastAssistantIntent(threadId: string): Promise<string | null>;
  // SERIAL-1451: the card this thread's last reply showed (its id in that message's meta), or null. A yes answers that
  // card and no other: a newer card shown in another thread closes it, and the yes then approves nothing.
  lastShownCard(threadId: string): Promise<string | null>;
  // SERIAL-1460 (2): the card the given message of this thread showed (meta.card_id), or null when that message is not a
  // card. Read only when the channel passes the id of the message a yes replies to.
  cardOfMessage?(threadId: string, messageId: string | number, userId: string): Promise<string | null>;
}

export type CardReply =
  | { kind: "show" }
  | { kind: "yes"; except: number[] }
  | { kind: "no" }
  | { kind: "change"; n: number };

export const CARD_INTENT = "career_apply_card";
export const MAX_PER_CARD = 8;
export const YES_WINDOW_MS = 10 * 60_000; // D-031: a text yes counts only this long after the card was shown
export const CARD_CHAR_BUDGET = 1600; // one card with two or more applications stays under this
export const CARD_HARD_LIMIT = 4000; // one application alone may go up to the outbox's limit, never cut

// The forms a person answers a card with. Anything else is not an answer and goes to the brain as any other text.
export function parseCardReply(text: string): CardReply | null {
  const t = String(text ?? "").toLowerCase().replace(/[.!?]+$/, "").replace(/\s+/g, " ").trim();
  if (
    /^(show|see|send|list)( me)? (my )?(prepared |ready )?applications$|^applications ready$|^what'?s ready( to send)?$/
      .test(t)
  ) {
    return { kind: "show" };
  }
  const nums = "(\\d+(?:\\s*(?:,|and|&)\\s*\\d+)*)";
  const except = new RegExp(
    `^(?:yes|yep|yeah|approve)[ ,-]*(?:but )?(?:not|except|skip|without|minus) (?:numbers? |#)?${nums}$`,
  );
  const m = t.match(except);
  if (m) return { kind: "yes", except: [...new Set(m[1].split(/\s*(?:,|and|&)\s*/).map(Number))] };
  if (/^(yes|yep|yeah|y|approve|approve all|yes please|yes send them|send them|send all)$/.test(t)) {
    return { kind: "yes", except: [] };
  }
  if (/^(no|nope|n|none|no thanks|send none|skip all|don'?t send( them| any)?)$/.test(t)) return { kind: "no" };
  const c = t.match(/^change (?:number |#)?(\d+)\b/);
  if (c) return { kind: "change", n: Number(c[1]) };
  return null;
}

const one = (p: Prepared, n: number) => {
  const [head, ...rest] = p.card_lines.map((l) => String(l).replace(/\s+/g, " ").trim()).filter(Boolean);
  return [`${n}. ${head ?? p.company}`, ...rest.map((l) => `   ${l}`)].join("\n");
};
const HEAD = (count: number) =>
  `${count === 1 ? "1 application is" : `${count} applications are`} ready. Every answer below goes exactly as shown.`;
const FOOT = (count: number) =>
  count === 1
    ? `Reply "yes" to send it, or "no".`
    : `Reply "yes" to send all ${count}, "yes but not 2" to leave some out, or "no".`;

// How many of the pending applications fit one card: at most 8, under 1,600 characters with two or more, and the first
// always (alone up to 4,000; an answer is never cut).
export function cardFor(pending: Prepared[]): { take: Prepared[]; text: string } | { tooLong: Prepared } | null {
  if (!pending.length) return null;
  const take: Prepared[] = [];
  for (const p of pending.slice(0, MAX_PER_CARD)) {
    const next = [...take, p];
    const text = render(next);
    if (take.length && text.length > CARD_CHAR_BUDGET) break;
    take.push(p);
  }
  const text = render(take);
  if (text.length > CARD_HARD_LIMIT) return { tooLong: take[0] };
  return { take, text };
}
function render(list: Prepared[]) {
  return [HEAD(list.length), ...list.map((p, i) => one(p, i + 1)), FOOT(list.length)].join("\n\n");
}

const RESULT: Record<string, string> = {
  queued: "approved; it is sent next, from your computer or, if you turned it on, the cloud",
  declined: "not sent",
  daily_cap: "not sent: today's daily limit is already used",
  company_cooldown: "not sent: you applied to them in the last 30 days",
  duplicate: "not sent: you already applied to this posting",
  stale: "not sent: your details changed after it was prepared; prepare it again",
  no_resume: "not sent: there is no confirmed resume on file to send with it",
  changed: "not sent: it changed after the card was shown",
  pace_unreadable: "not sent: your saved daily pace could not be read; say \"set my daily pace to N\" or \"no daily pace\"",
  refused: "not sent: the queue refused it",
};
export function answerText(results: CardResult[]): string {
  const queued = results.filter((r) => r.result === "queued").length;
  const lines = results.map((r) =>
    `${r.n}. ${String(r.company).replace(/\s+/g, " ").slice(0, 80)}: ${RESULT[r.result] ?? RESULT.refused}`
  );
  const head = queued
    ? `${queued} approved exactly as shown. Nothing has gone to an employer yet.`
    : "Nothing was approved. Nothing went to an employer.";
  return [head, ...lines].join("\n");
}

// OWNER RULE (2026-10-26): a card shows only applications that send a resume (the payload binds its sha256), and none
// at all while the person has no confirmed resume.
export const CARD_NO_RESUME = `I have no confirmed resume on file, so there is no application to show or approve. Send me your resume first: attach it as a PDF or Word file, or paste it here, then say it's yours.`;
export const CARD_RESUME_UNREAD = `I couldn't check your resume on file just now, so no card was shown and nothing was approved. Say "show my applications" again in a minute.`;
// Fail closed: a prepared application whose resume hash was not read (or is not a sha256) is never on a card.
export const sendsResume = (p: Prepared) => /^[a-f0-9]{64}$/.test(String(p.resume_sha256 ?? ""));
// One turn, before any brain. Returns null when the text is not about a card, so the turn goes on as before.
export const CARD_OUTDATED = `That card is out of date: a newer card was shown since, so nothing was approved. Say "show my applications" for the current one.`;
// SERIAL-1461 / 1480: what a yes with no usable reply id is told, by where it was typed. The app: it can reply to the card
// message or tap Approve. A channel with a verified reply-id path (Telegram, WhatsApp Cloud): reply directly to the card,
// or tap. iMessage, where this integration has no verified reply-id path: tap the card; it is never told to reply.
export const NEEDS_REPLY = `Nothing was approved. To approve, reply directly to the card message (press and hold it, then Reply) and send "yes", or tap Approve in the app.`;
export const NEEDS_REPLY_CHANNEL = `Nothing was approved. To approve, reply directly to the card message (press and hold it, then Reply) and send "yes", or tap Approve on the card.`;
export const NEEDS_TAP_IMESSAGE = `Nothing was approved. To approve, tap the card to approve exactly what it shows.`;
export const CARD_NEEDS_REPLY_STATUS = "needs_reply";
// The channel's wording for a needs_reply answer: by whether this integration has a verified reply-id path there.
export function needsReplyTextFor(channel: string | null | undefined): string {
  return channel === "telegram" || channel === "whatsapp" ? NEEDS_REPLY_CHANNEL : channel === "imessage" ? NEEDS_TAP_IMESSAGE : NEEDS_REPLY;
}
export async function cardTurn(
  o: {
    message: string; userId: string; threadId: string; now: number; store: CardStore; events?: EventStore | null; replyTo?: string | number | null;
    // OWNER RULE (2026-10-26, "never submit applications without a real resume"): whether the person has a confirmed
    // resume on file (career_resume_on_file). false: no card is shown and none is opened; absent: not asked.
    resumeReady?: () => Promise<boolean | null>;
  },
): Promise<{ reply: string; status: string; card_id?: string } | null> {
  const r = parseCardReply(o.message);
  if (!r) return null;
  if (r.kind === "show") {
    // Fail closed (review of PR #194): only a confirmed "yes, on file" shows a card; "no" asks for the resume, and a check
    // that could not be made shows nothing and says so.
    if (o.resumeReady) {
      const ready = await o.resumeReady().catch(() => null);
      if (ready === false) return { reply: CARD_NO_RESUME, status: "no_resume" };
      if (ready !== true) return { reply: CARD_RESUME_UNREAD, status: "resume_unreadable" };
    }
    const c = cardFor((await o.store.pending(o.userId)).filter(sendsResume));
    if (!c) {
      return {
        reply: 'Nothing is ready for you to approve yet. Send me a job link with "apply me to" and I\'ll prepare it and send its card here; "where are my applications" says what is being prepared.',
        status: "empty",
      };
    }
    if ("tooLong" in c) {
      return {
        reply:
          `The application to ${c.tooLong.company} is too long to show in a text. Open it in the app to approve it.`,
        status: "too_long",
      };
    }
    const opened = await o.store.open(o.userId, c.take.map((p) => p.id));
    return { reply: c.text, status: "shown", card_id: opened.id };
  }
  // Which card the answer is about (SERIAL-1461). An approval counts only when the text carries the channel's reply-to
  // id and that id is the message that carried the card: an explicit reply to any other or older message refuses, and
  // a yes with no reply id approves nothing and says how (reply directly to the card, or tap). A decline or a change
  // needs no reply id: it counts while the card is this thread's last word, and sends nothing either way.
  const hasReply = o.replyTo !== undefined && o.replyTo !== null && String(o.replyTo) !== "";
  const repliedCard = hasReply && o.store.cardOfMessage ? await o.store.cardOfMessage(o.threadId, o.replyTo!, o.userId) : null;
  const lastWordIsCard = (await o.store.lastAssistantIntent(o.threadId)) === CARD_INTENT;
  const card = await o.store.latestOpen(o.userId);
  if (!card) return null;
  const wantsApproval = r.kind === "yes";
  let shownId: string | null;
  if (hasReply) {
    // A reply to a message that is not a card: for a yes, refused and explained (the card stands); for the rest, not the card's.
    if (!repliedCard) return wantsApproval ? { reply: NEEDS_REPLY, status: "needs_reply" } : null;
    shownId = repliedCard;
  } else {
    if (!lastWordIsCard) return null;
    if (wantsApproval) return { reply: NEEDS_REPLY, status: "needs_reply" };
    shownId = await o.store.lastShownCard(o.threadId);
  }
  // SERIAL-1451: and only for the card this thread showed. Opening a card closes older ones, so a card shown in another
  // thread since makes this thread's card out of date: nothing is approved or declined on it.
  if (!shownId || shownId !== card.id) return { reply: CARD_OUTDATED, status: "card_outdated" };
  const numbers = card.items.map((i) => i.n);
  if (r.kind === "change") {
    return {
      reply:
        `Application ${r.n} was not sent. To change an answer, change it where you keep your details and prepare it again; it comes back on a new card. To send the others, tap Approve on each one in the app.`,
      status: "change",
    };
  }
  const leaveOut = r.kind === "no" ? numbers : r.except;
  const unknown = leaveOut.filter((n) => !numbers.includes(n));
  if (unknown.length) {
    return {
      reply: `This card has ${numbers.length === 1 ? "only number 1" : `numbers 1 to ${numbers.length}`}; there is no ${
        unknown.join(", ")
      }. Nothing was sent.`,
      status: "not_on_card",
    };
  }
  // D-031 (the owner, 2026-10-22 5:09 PM: one yes handles a batch of submissions): a direct yes to this card, within
  // 10 minutes of its showing, approves exactly the applications it names, each by the payload hash the card carries
  // (career_apply_card_answer_own: an item that changed since is refused by name; the card is single-use). The yes
  // approves and never sends: the person's own worker claims and finishes. A later yes approves nothing. A "no" declines
  // at any time: declining sends nothing.
  const approve = numbers.filter((n) => !leaveOut.includes(n));
  if (approve.length && Date.parse(card.shown_at) < o.now - YES_WINDOW_MS) {
    return {
      reply: `That card was shown more than 10 minutes ago, so a text yes can't approve it; nothing was sent. Say "show my applications" for a fresh card, or tap Approve in the app.`,
      status: "stale_card",
    };
  }
  try {
    const results = await o.store.answer(o.userId, card.id, approve);
    for (const r of results) {
      await recordEvent(o.events, {
        user_id: o.userId,
        at: o.now,
        kind: r.result === "queued" ? "application_approved" : "status_change",
        subject: r.company,
        detail: { card: card.id, n: r.n, result: r.result },
        source: "card",
      });
    }
    return { reply: answerText(results), status: "answered" };
  } catch (e: any) {
    const msg = String(e?.message ?? e);
    if (/card_expired/.test(msg)) {
      return {
        reply: `That card is more than a day old, so nothing was sent. Say "show my applications" to see them again.`,
        status: "expired",
      };
    }
    if (/card_answered/.test(msg)) {
      return { reply: "That card was already answered. Nothing more was sent.", status: "answered_before" };
    }
    throw e;
  }
}

// The store over the edge function's service client: every call names the person (the _as functions), and every read is
// scoped to them.
export function supabaseCardStore(admin: any): CardStore {
  const must = (r: any, what: string) => {
    if (r.error) throw new Error(`${what}: ${r.error.message}`);
    return r.data;
  };
  return {
    async pending(userId) {
      return must(
        await admin.from("career_apply_prepared").select("id,company,card_lines,created_at,resume_sha256:payload->>resume_sha256").eq("user_id", userId)
          .in("state", ["ready", "shown"]).order("created_at", { ascending: true }).limit(30),
        "read prepared applications",
      ) ?? [];
    },
    async open(userId, ids) {
      return must(await admin.rpc("career_apply_card_open_as", { p_user: userId, p_ids: ids }), "open a card");
    },
    async latestOpen(userId) {
      const rows = must(
        await admin.from("career_apply_cards").select("id,items,shown_at").eq("user_id", userId).eq("state", "open")
          .order("shown_at", { ascending: false }).limit(1),
        "read the open card",
      );
      return rows?.[0] ?? null;
    },
    async answer(userId, cardId, approve) {
      return must(
        await admin.rpc("career_apply_card_answer_as", { p_user: userId, p_card: cardId, p_approve: approve }),
        "answer the card",
      );
    },
    async lastAssistantIntent(threadId) {
      const rows = must(
        await admin.from("agent_messages").select("meta").eq("thread_id", threadId).eq("role", "assistant")
          .order("id", { ascending: false }).limit(1),
        "read the last reply",
      );
      return rows?.[0]?.meta?.intent ?? null;
    },
    async lastShownCard(threadId) {
      // The chat's "show" and the scheduled push (career_apply_card_push_for) both write the card's id as meta.card_id.
      const rows = must(
        await admin.from("agent_messages").select("meta").eq("thread_id", threadId).eq("role", "assistant")
          .order("id", { ascending: false }).limit(1),
        "read the last reply",
      );
      const m = rows?.[0]?.meta;
      return m?.intent === CARD_INTENT && typeof m?.card_id === "string" ? m.card_id : null;
    },
    async cardOfMessage(threadId, messageId, userId) {
      // The app replies to its own message ids (agent_messages.id, this thread); a texting channel replies to the
      // provider's id of the message that went out, which the outbox recorded when it delivered the card's text
      // (career_outbox.provider_id / provider_ids, the row's card_id or its 'card:<id>' key). SERIAL-1462.
      const id = String(messageId).slice(0, 200);
      if (/^[0-9]{1,18}$/.test(id)) {
        const rows = must(
          await admin.from("agent_messages").select("meta").eq("thread_id", threadId).eq("role", "assistant").eq("id", Number(id)).limit(1),
          "read the replied-to message",
        );
        const m = rows?.[0]?.meta;
        if (m?.intent === CARD_INTENT && typeof m?.card_id === "string") return m.card_id;
      }
      const sent = must(
        await admin.from("career_outbox").select("key,card_id,provider_id,provider_ids").eq("user_id", userId).eq("status", "delivered")
          .or(`provider_id.eq.${JSON.stringify(id)},provider_ids.cs.{${JSON.stringify(id)}}`).limit(2),
        "read the replied-to text",
      );
      const row = Array.isArray(sent) ? sent[0] : null;
      if (!row) return null;
      if (typeof row.card_id === "string" && row.card_id) return row.card_id;
      return typeof row.key === "string" && row.key.startsWith("card:") ? row.key.slice(5) : null;
    },
  };
}
