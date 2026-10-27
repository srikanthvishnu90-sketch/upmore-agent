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
//
// ⚠️ MERGE PLACEHOLDER — NOT A DECISION (merge prep, 2026-10-27). This file currently COMBINES two card models that
// are a genuine design collision, and the pick between them is the ARCHITECT'S, still open:
//   (a) trunk/#195's model — a multi-application card (up to 8) with a surface-aware footer:
//       cardFor(pending, surface), FOOT(count, surface), "Reply \"yes\"…" / "Tap Approve…" wording;
//   (b) #218's model — ONE application per card answered by a 4-digit code: CODE_SLOT, TOKEN_SLOT, inspectBase(),
//       Card.approve_code / Card.inspect_token, CardStore.answerCode, "YES <code>".
// The merge simulation kept (a)'s rendering and took in (b)'s additive exports ONLY so the tree compiles and both
// sides' code survives. That combination chooses NOTHING: when the architect picks, the losing side's call sites
// and tests (wo-022-cards, flow-apply-many, the channel approvals) must be reconciled to the pick. Do not read
// anything in this file as approval of either model, and do not "finish" one model on the strength of this tree.
import { type EventStore, recordEvent } from "./agent/timeline.ts";

export interface Prepared {
  id: string;
  company: string;
  card_lines: string[];
  url?: string | null; // the posting, so the ask names where it goes
  created_at?: string;
  resume_sha256?: string | null; // the payload's resume hash, when the store reads it (OWNER RULE 2026-10-26)
}
export interface Card {
  id: string;
  items: { n: number; prepared_id: string; payload_hash: string }[];
  shown_at: string;
  // 20261026235017: the card's approval code, drawn by the database when the card is opened ("YES 4821"), and the token
  // of its inspect links (trainee-inspect).
  approve_code?: string | null;
  inspect_token?: string | null;
}
// The answer by code (career_apply_card_answer_code_as): the database finds the card by the code, for this person only.
export type CodeAnswer =
  | { status: "answered"; card_id: string; results: CardResult[] }
  | { status: "no_card" | "locked" | "outdated" | "answered_before" | "stale" | "expired" | "changed" }
  | { status: "wrong_code"; misses?: number }
  | { status: "not_on_card"; count: number };
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
  // channel (2026-10-26, E-15): where the reply came from. A texting channel's reply id is the provider's id of the text
  // that carried the card, never an agent_messages id: a Telegram message_id is a small number that can equal one.
  cardOfMessage?(threadId: string, messageId: string | number, userId: string, channel?: string | null): Promise<string | null>;
  // 20261026235017: "YES <code>" answers the card that carries the code. except: numbers left out; decline: "NO <code>".
  answerCode?(userId: string, code: string, except: number[], decline: boolean): Promise<CodeAnswer>;
}

export type CardReply =
  | { kind: "show" }
  | { kind: "yes"; except: number[]; code?: string }
  | { kind: "no"; code?: string }
  | { kind: "change"; n: number };

export const CARD_INTENT = "career_apply_card";
export const MAX_PER_CARD = 1; // one approval ask per message (spec section 7.1); the database still takes up to 8 (the app)
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
  // The card's code (one approval model on every channel): "YES 4821", "yes, 4821", "Yes4821", "approve 4821", "4821 yes",
  // "yes code 4821", each optionally "but not 2". A yes word is always needed: a bare number is never an approval.
  // 3 to 8 digits are read as a try at the code (a mistyped code is told so and counted); the card's code is 4.
  const leave = `(?:[ ,;-]*(?:but )?(?:not|except|skip|without|minus) (?:numbers? |#)?${nums})?`;
  const split = (x?: string) => (x ? [...new Set(x.split(/\s*(?:,|and|&)\s*/).map(Number))] : []);
  const yesWord = "(?:yes|yep|yeah|y|ok|okay|approve|approved|send|confirm)(?: it| them| all| please)?";
  const a = t.match(new RegExp(`^${yesWord}[ ,:;.!#-]*(?:code[ :#]*)?#?(\\d{3,8})${leave}$`));
  if (a) return { kind: "yes", except: split(a[2]), code: a[1] };
  const b = t.match(new RegExp(`^(?:code[ :#]*)?#?(\\d{3,8})[ ,:;.!-]*${yesWord}${leave}$`));
  if (b) return { kind: "yes", except: split(b[2]), code: b[1] };
  const d = t.match(/^(?:no|nope|decline|skip)[ ,:;.!#-]*(?:code[ :#]*)?#?(\d{3,8})$/);
  if (d) return { kind: "no", code: d[1] };
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

// One approval ask per message, never bundled (the owner's iMessage experience spec, section 7.1, 2026-10-26; it replaces
// D-031's batch card on texting channels): one application per card, and the card says what will happen, to whom,
// that it cannot be taken back and that Trainee does not charge for it, links to inspect the exact answers and the exact resume file (pages
// whose content hashes to the card's hash: trainee-inspect), and the exact reply expected, "YES <code>", the code bound
// to this card and through it to the payload's hash (20261026235017). Every line of the application is shown verbatim.
const one = (p: Prepared) => {
  const [head, ...rest] = p.card_lines.map((l) => String(l).replace(/\s+/g, " ").trim()).filter(Boolean);
  return [head ?? p.company, ...rest.map((l) => `   ${l}`)].join("\n");
};
const hostOf = (u: unknown) => { try { return /^https?:\/\//.test(String(u)) ? new URL(String(u)).host : ""; } catch { return ""; } };
const company = (p: Prepared) => String(p.company ?? "").replace(/\s+/g, " ").trim().slice(0, 80) || "the employer";
// The slots the database fills once the card exists (the chat's "show" below; the scheduled push in
// career_apply_card_push_for): the card's code, and the token of its inspect links.
export const CODE_SLOT = "[[APPROVE-CODE]]";
export const TOKEN_SLOT = "[[INSPECT-TOKEN]]";
// The inspect page's address: the trainee-inspect function of this project (SUPABASE_URL is set in every edge function).
export function inspectBase(): string | null {
  // deno-lint-ignore no-explicit-any
  const url = String((globalThis as any).Deno?.env?.get?.("SUPABASE_URL") ?? "").replace(/\/+$/, "");
  return /^https?:\/\/\S+$/.test(url) ? `${url}/functions/v1/trainee-inspect` : null;
}
const HEAD = (count: number) =>
  `${count === 1 ? "1 application is" : `${count} applications are`} ready. Every answer below goes exactly as shown.`;
// Where the card is read: in a texting channel the answer is a reply; in the web app (launch readiness B7, 2026-10-26)
// the card carries the buttons, and a typed yes there approves nothing (it carries no reply id), so it says to tap.
export type CardSurface = "text" | "web";
const FOOT = (count: number, surface: CardSurface = "text") =>
  surface === "web"
    ? count === 1
      ? `Tap Approve on the card to send it exactly as shown, or Decline.`
      : `Tap Approve all ${count} to send them exactly as shown, Approve only this one to send just one, or Decline.`
    : count === 1
    ? `Reply "yes" to send it, or "no".`
    : `Reply "yes" to send all ${count}, "yes but not 2" to leave some out, or "no".`;

// How many of the pending applications fit one card: at most 8, under 1,600 characters with two or more, and the first
// always (alone up to 4,000; an answer is never cut).
export function cardFor(pending: Prepared[], surface: CardSurface = "text"): { take: Prepared[]; text: string } | { tooLong: Prepared } | null {
  if (!pending.length) return null;
  const take: Prepared[] = [];
  for (const p of pending.slice(0, MAX_PER_CARD)) {
    const next = [...take, p];
    const text = render(next, surface);
    if (take.length && text.length > CARD_CHAR_BUDGET) break;
    take.push(p);
  }
  const text = render(take, surface);
  if (text.length > CARD_HARD_LIMIT) return { tooLong: take[0] };
  return { take, text };
}
function render(list: Prepared[], surface: CardSurface = "text") {
  return [HEAD(list.length), ...list.map((p, i) => one(p, i + 1)), FOOT(list.length, surface)].join("\n\n");
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
// SERIAL-1461 / 1480, and one approval model on every channel (2026-10-26, E-3 / E-5): what a bare yes is told, naming
// only what exists where it was typed. Everywhere: the card's code ("YES 4821"). The app: also a reply to the card
// message, or its Approve tap. Telegram and WhatsApp: also the Approve button sent under the card (Telegram's inline
// keyboard, WhatsApp's reply buttons) and a direct reply to the card (both platforms give the replied-to id). iMessage
// (LoopMessage): only the code; it has no buttons, and its reply thread id is documented but not verified live here.
export const NEEDS_REPLY = `Nothing was approved. To approve, send YES and the 4-digit code at the end of the card (like YES 1234), reply directly to the card message (press and hold it, then Reply) and send "yes", or tap Approve in the app.`;
export const NEEDS_REPLY_CHANNEL = `Nothing was approved. To approve, tap Approve under the card, send YES and the 4-digit code at the end of the card (like YES 1234), or reply directly to the card message (press and hold it, then Reply) and send "yes".`;
export const NEEDS_TAP_IMESSAGE = `Nothing was approved. To approve, send YES and the 4-digit code at the end of the card (like YES 1234).`;
export const NEEDS_CODE_IMESSAGE = NEEDS_TAP_IMESSAGE;
export const CARD_NEEDS_REPLY_STATUS = "needs_reply";
// The channel's wording for a needs_reply answer: what that channel actually has.
export function needsReplyTextFor(channel: string | null | undefined): string {
  return channel === "telegram" || channel === "whatsapp" ? NEEDS_REPLY_CHANNEL : channel === "imessage" ? NEEDS_CODE_IMESSAGE : NEEDS_REPLY;
}
// The answers to "YES <code>" (career_apply_card_answer_code_as), each naming what happened, never more.
export const CODE_WRONG = `That code doesn't match your card, so nothing was approved. Send YES and the 4-digit code at the end of your latest card.`;
export const CODE_LOCKED = `That card had too many wrong codes, so it can't be approved by text now; nothing was sent. Say "show my applications" for a new card with a new code.`;
export const CODE_NO_CARD = `There's no card waiting for an answer, so nothing was approved. Say "show my applications" to see what's ready.`;
export const CODE_STALE = `That card was shown more than 10 minutes ago, so its code no longer approves it; nothing was sent. Say "show my applications" for a fresh card.`;
export const CODE_CHANGED = `That card changed after it was shown, so nothing was approved. Say "show my applications" for the current one.`;
export async function cardTurn(
  o: {
    message: string; userId: string; threadId: string; now: number; store: CardStore; events?: EventStore | null; replyTo?: string | number | null; surface?: CardSurface;
    // E-15: the texting channel the reply id comes from (telegram, whatsapp, imessage); absent: the app (agent_messages ids).
    replyChannel?: string | null;
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
    const c = cardFor((await o.store.pending(o.userId)).filter(sendsResume), o.surface ?? "text");
    if (!c) {
      return {
        reply: 'Nothing is ready for you to approve yet. Send me a job link with "apply me to" and I\'ll prepare it and send its card here; "where are my applications" says what is being prepared.',
        status: "empty",
      };
    }
    if ("tooLong" in c) {
      return {
        reply:
          `The application to ${c.tooLong.company} is too long to show in one message, so it can't be approved here. Nothing was sent.`,
        status: "too_long",
      };
    }
    const opened = await o.store.open(o.userId, c.take.map((p) => p.id));
    return { reply: withCode(c.text, opened.approve_code, opened.inspect_token), status: "shown", card_id: opened.id };
  }
  // One approval model on every channel: a typed code names its card, so it needs no reply id and no "last word". The
  // database decides everything (this person's card, open, in its window, every payload as shown); this only words it.
  if ((r.kind === "yes" || r.kind === "no") && r.code !== undefined && o.store.answerCode) {
    const a = await o.store.answerCode(o.userId, r.code, r.kind === "yes" ? r.except : [], r.kind === "no");
    switch (a.status) {
      case "answered": {
        for (const x of a.results) {
          await recordEvent(o.events, {
            user_id: o.userId, at: o.now, kind: x.result === "queued" ? "application_approved" : "status_change", subject: x.company,
            detail: { card: a.card_id, n: x.n, result: x.result, via: "code" }, source: "card",
          });
        }
        return { reply: answerText(a.results), status: "answered", card_id: a.card_id };
      }
      case "wrong_code": return { reply: CODE_WRONG, status: "wrong_code" };
      case "locked": return { reply: CODE_LOCKED, status: "code_locked" };
      // A yes and a number while no card waits: said plainly for a 4-digit code (a code try); any other number is not
      // about a card, so the turn goes on as before.
      case "no_card": return r.code.length === 4 ? { reply: CODE_NO_CARD, status: "no_card" } : null;
      case "outdated": return { reply: CARD_OUTDATED, status: "card_outdated" };
      case "answered_before": return { reply: "That card was already answered. Nothing more was sent.", status: "answered_before" };
      case "stale": return { reply: CODE_STALE, status: "stale_card" };
      case "expired": return { reply: `That card is more than a day old, so nothing was sent. Say "show my applications" to see them again.`, status: "expired" };
      case "changed": return { reply: CODE_CHANGED, status: "changed" };
      case "not_on_card": return { reply: `This card has ${a.count === 1 ? "only number 1" : `numbers 1 to ${a.count}`}; nothing was sent.`, status: "not_on_card" };
    }
    return null;
  }
  // Which card the answer is about (SERIAL-1461). An approval counts only when the text carries the channel's reply-to
  // id and that id is the message that carried the card: an explicit reply to any other or older message refuses, and
  // a yes with no reply id approves nothing and says how (reply directly to the card, or tap). A decline or a change
  // needs no reply id: it counts while the card is this thread's last word, and sends nothing either way.
  const hasReply = o.replyTo !== undefined && o.replyTo !== null && String(o.replyTo) !== "";
  const repliedCard = hasReply && o.store.cardOfMessage ? await o.store.cardOfMessage(o.threadId, o.replyTo!, o.userId, o.replyChannel ?? null) : null;
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
    const code = typeof (card as Card).approve_code === "string" && /^[0-9]{4}$/.test((card as Card).approve_code!) ? (card as Card).approve_code : null;
    return {
      reply:
        `Application ${r.n} was not sent. To change an answer, change it where you keep your details and prepare it again; it comes back on a new card.${
          code && numbers.length > 1 ? ` To send the others, reply "YES ${code} but not ${r.n}".` : ""}`,
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
      reply: `That card was shown more than 10 minutes ago, so a text yes can't approve it; nothing was sent. Say "show my applications" for a fresh card.`,
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
        await admin.from("career_apply_prepared").select("id,company,url,card_lines,created_at,resume_sha256:payload->>resume_sha256").eq("user_id", userId)
          .in("state", ["ready", "shown"]).order("created_at", { ascending: true }).limit(30),
        "read prepared applications",
      ) ?? [];
    },
    async open(userId, ids) {
      return must(await admin.rpc("career_apply_card_open_as", { p_user: userId, p_ids: ids }), "open a card");
    },
    async latestOpen(userId) {
      const rows = must(
        await admin.from("career_apply_cards").select("id,items,shown_at,approve_code").eq("user_id", userId).eq("state", "open")
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
    async answerCode(userId, code, except, decline) {
      const r = must(
        await admin.rpc("career_apply_card_answer_code_as", { p_user: userId, p_code: code, p_except: except, p_decline: decline }),
        "answer the card by its code",
      );
      if (!r || typeof r.status !== "string") throw new Error("answer the card by its code: no status");
      return r as CodeAnswer;
    },
    async cardOfMessage(threadId, messageId, userId, channel) {
      // The app replies to its own message ids (agent_messages.id, this thread); a texting channel replies to the
      // provider's id of the message that went out, which the outbox recorded when it delivered the card's text
      // (career_outbox.provider_id / provider_ids, the row's card_id or its 'card:<id>' key). SERIAL-1462.
      // E-15: a texting channel's id is read only against that channel's own delivered texts: a Telegram message_id is a
      // small number, and read as an agent_messages id it could name the card although the person replied to another text.
      const id = String(messageId).slice(0, 200);
      const ch = channel === "telegram" || channel === "whatsapp" || channel === "imessage" ? channel : null;
      if (!ch && /^[0-9]{1,18}$/.test(id)) {
        const rows = must(
          await admin.from("agent_messages").select("meta").eq("thread_id", threadId).eq("role", "assistant").eq("id", Number(id)).limit(1),
          "read the replied-to message",
        );
        const m = rows?.[0]?.meta;
        if (m?.intent === CARD_INTENT && typeof m?.card_id === "string") return m.card_id;
      }
      let q = admin.from("career_outbox").select("key,card_id,provider_id,provider_ids").eq("user_id", userId).eq("status", "delivered")
        .or(`provider_id.eq.${JSON.stringify(id)},provider_ids.cs.{${JSON.stringify(id)}}`);
      if (ch === "telegram") q = q.like("contact", "tg:%");
      else if (ch === "whatsapp") q = q.like("contact", "wa:%");
      else if (ch === "imessage") q = q.not("contact", "like", "tg:%").not("contact", "like", "wa:%");
      const sent = must(await q.limit(2), "read the replied-to text");
      const row = Array.isArray(sent) ? sent[0] : null;
      if (!row) return null;
      if (typeof row.card_id === "string" && row.card_id) return row.card_id;
      return typeof row.key === "string" && row.key.startsWith("card:") ? row.key.slice(5) : null;
    },
  };
}
