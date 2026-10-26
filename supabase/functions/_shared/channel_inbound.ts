import { CARD_NEEDS_REPLY_STATUS, needsReplyTextFor } from "./career_apply_cards.ts";
// Texts coming in, on any channel (WO-038; first written for LoopMessage in WO-013b-2, whose order it keeps): the
// message id claimed per provider (a retried webhook never runs a second turn), the person found by the contact (or its
// alias), the time of their message recorded (it opens WhatsApp's window and makes this their most recent channel; held
// messages go back in the queue), STOP/START/HELP answered before any account exists, linking a second channel, who may
// sign up, then the turn through agent-chat as that person. The brain never learns the channel: the reply rides the
// outbox bound to the channel the message came in on, and the adapter renders it.
//
// Linking never trusts message text alone:
// - Telegram: "/start <nonce>" binds the chat only when the nonce was issued to a signed-in account (the app's Connect
//   Telegram, or "connect telegram" texted on a channel already linked), unused, under 10 minutes old; stored hashed.
// - Same phone on another channel (WhatsApp and iMessage): nothing is merged. The channel already linked is asked, and only
//   a yes from it links the new one.
import { channelCommand, CHANNEL_REPLIES } from "./channel.ts";
import { fitOutbox as fitReply, normalizeContact, OUTBOX_CHARS } from "./conversation.ts";
import { type Channel, CHANNEL_NAME, channelOf, type ChannelAdapter, type InboundMessage, type InboundUpload, packMessages, type Provider, type StatusEvent } from "./channel_adapters.ts";
// FEATURE 16: the most text one channel message carries to the turn (WhatsApp's own limit); the turn cuts a resume past
// its bound and says so.
export const CHANNEL_TEXT_MAX = 65_536;
import { telegramDeepLink } from "./telegram.ts";

export const SIGNUP_CLOSED_REPLY = "Trainee is invite-only right now, so I can't set you up yet. Nothing about you was saved except that you texted.";
export const CHAT_DOWN_REPLY = "I couldn't answer that just now. Try again in a minute.";
// The owner's wording for the question on the channel already linked (WO-038).
export const linkAskText = (newChannel: Channel) => `Someone texted Trainee on ${CHANNEL_NAME[newChannel]} from your number. Reply yes to link it.`;
export const linkPendingReply = (linkedOn: Channel) => `This number already has a Trainee account on ${CHANNEL_NAME[linkedOn]}. Reply yes there and this chat is linked to it.`;
export const linkedReply = (newChannel: Channel) => `Done: ${CHANNEL_NAME[newChannel]} is linked to your Trainee account. Trainee answers on whichever one you text.`;
export const LINKED_HERE_REPLY = "This chat is linked to your Trainee account now. Text here any time.";
export const connectTelegramReply = (link: string) => `Open this link where you use Telegram and tap Start. It works once, for the next 10 minutes.\n${link}`;
export const TELEGRAM_NOT_WIRED_REPLY = "Telegram isn't set up on Trainee's side yet, so there's no link to send.";
export const ALREADY_TELEGRAM_REPLY = "This chat is already on Telegram, so there's nothing to connect.";
export const TELEGRAM_LINKED_REPLY = "Telegram is linked to your Trainee account. Text here any time; Trainee answers on whichever channel you text.";
export const TELEGRAM_LINK_INVALID_REPLY = "That link has expired or was already used. Text \"connect telegram\" to Trainee where you already use it for a new one.";
export const TELEGRAM_LINKED_ELSEWHERE_REPLY = "This Telegram account is already linked to a different Trainee account, so nothing changed.";
export const FILE_NOT_READ_REPLY = "I can't open files sent here yet, so I haven't read that one. Paste your resume as text in this chat and I'll read it now.";
export const LINK_NONCE_MS = 10 * 60000;
export const LINK_ASK_MS = 60 * 60000; // a yes counts for an hour after the question

export interface Person { userId: string; threadId: string | null; contact?: string }
export type Redeemed = { ok: true; userId: string; threadId: string | null } | { ok: false; why: "invalid" | "linked_elsewhere" };
export interface InboundStore {
  claimMessage(id: string, at: number, provider?: Provider): Promise<boolean>; // false: this provider's message id was handled before
  person(contact: string): Promise<Person | null>; // a linked account, if any (by contact key or recorded alias)
  refusedBefore(contact: string, at: number): Promise<boolean>; // records the refusal; true when this contact was refused already
  createPerson(contact: string, at: number, phone?: string | null): Promise<Person>;
  setThread(contact: string, threadId: string, userId?: string): Promise<void>; // one thread per person, every channel
  setOptOut(contact: string, out: boolean, at: number): Promise<void>;
  enqueueReply(userId: string, key: string, text: string, at: number, channel?: Channel, part?: { of: string; n: number }, cardId?: string | null): Promise<boolean>;
  // WO-038 (optional, so a store written for WO-013 still runs the LoopMessage path unchanged):
  sawInbound?(contact: string, at: number, o: { alias?: string | null; phone?: string | null }): Promise<void>;
  linkCandidate?(phone: string, except: Channel): Promise<{ userId: string; contact: string } | null>;
  askToLink?(a: { userId: string; contact: string; phone: string; askedOn: string; at: number; text: string }): Promise<string | null>; // the outbox key, or null: asked already
  confirmLink?(a: { userId: string; askedOn: string; at: number; notice: string }): Promise<{ contact: string; key: string | null } | null>;
  issueLinkNonce?(userId: string, at: number): Promise<string>;
  redeemLinkNonce?(nonce: string, contact: string, at: number): Promise<Redeemed>;
  reholdSent?(providerMessageId: string, at: number, error: string): Promise<number>; // a sent message that failed for the window
}
export interface CoreDeps {
  env: { get(k: string): string | undefined };
  now: () => number;
  store: InboundStore;
  reply: (contact: string, bubbles: string[]) => Promise<{ ok: boolean }>; // straight out on the inbound channel: no account, no outbox row
  render: (text: string) => string[];
  // parts (optional): a reply longer than one message's worth (an outreach batch of drafts, a long card), each part at most
  // OUTBOX_CHARS; when given with two or more, they are what the person reads, in order, and `reply` is not sent.
  // replyToMessageId (optional): the provider's id of the message the person replied to (SERIAL-1462). cardId (optional,
  // in the answer): the card this reply shows, so the outbox row that carries it is recorded against the card.
  // file (FEATURE 16): a file the adapter downloaded, read by the turn as a resume. The channel is never sent (WO-038).
  chat: (a: { userId: string; threadId: string | null; message: string; turnKey: string; replyToMessageId?: string | null; file?: InboundUpload | null }) => Promise<{ status: number; reply: string; threadId: string | null; parts?: string[]; cardId?: string | null; resultStatus?: string | null }>;
  deliver: (a: { userId: string; key: string; now: number }) => Promise<void>; // a head start on the every-minute run
}
type Out = { status: number; body: Record<string, unknown> };
const ok = (body: Record<string, unknown>): Out => ({ status: 200, body: { ok: true, ...body } });

// TRAINEE_ALLOWED_CONTACTS lists phones and emails as before, and "telegram:<chat id>" or "whatsapp:<id>"; a WhatsApp
// sender whose number is listed is allowed too.
export function signupAllows(env: CoreDeps["env"], contact: string, phone?: string | null): boolean {
  if ((env.get("TRAINEE_SIGNUP") || "closed") === "open") return true;
  const list = (env.get("TRAINEE_ALLOWED_CONTACTS") || "").split(",").map((c) => c.trim()).filter(Boolean);
  return list.some((c) => {
    const p = /^(telegram|tg):\s*(.+)$/i.exec(c), w = /^(whatsapp|wa):\s*(.+)$/i.exec(c);
    if (p) return `tg:${p[2]}` === contact;
    if (w) return `wa:${w[2]}` === contact;
    try { const n = normalizeContact(c); return n === contact || (!!phone && n === phone); } catch { return false; }
  });
}
// The parts contract (WO-038, for WO-033's outreach batch and long cards): agent-chat may answer with `parts`, each at
// most OUTBOX_CHARS. Each becomes its own outbox row and is never cut: a part over the limit is split on purpose (lines
// kept together), never truncated. Fewer than two usable parts: null, and the single reply goes as before. At most
// MAX_PARTS rows; past that the rest is joined into the last row and cut with the cut note, said, never silent.
export const MAX_PARTS = 30;
export function replyParts(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const parts = raw.filter((p): p is string => typeof p === "string").map((p) => p.trim()).filter(Boolean)
    .flatMap((p) => (p.length <= OUTBOX_CHARS ? [p] : packMessages(p, OUTBOX_CHARS)));
  if (parts.length < 2) return null;
  if (parts.length <= MAX_PARTS) return parts;
  return [...parts.slice(0, MAX_PARTS - 1), fitReply(parts.slice(MAX_PARTS - 1).join("\n\n"))];
}
// A provider id becomes a chat turn key the chat accepts (letters, digits, - and _), so agent-chat's own replay guard sees
// a retry of the same message as the same turn.
export async function turnKeyFor(messageId: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(messageId)));
  return "lm_" + Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}
// LoopMessage keeps its keys (reply:<id>); the other providers' ids are namespaced, so a Telegram update id and a
// LoopMessage id that happen to be equal never collide in one person's outbox.
const scoped = (m: InboundMessage) => (m.provider === "loopmessage" ? m.messageId : `${m.provider === "telegram" ? "tg" : "wa"}:${m.messageId}`);
const YES = /^yes[.!]*$/i, CONNECT_TELEGRAM = /^connect telegram[.!]*$/i;

export async function runInbound(msg: InboundMessage, d: CoreDeps): Promise<Out> {
  const now = d.now(), store = d.store;
  if (!(await store.claimMessage(msg.messageId, now, msg.provider))) return ok({ ignored: "duplicate webhook" });
  let contact = msg.contact;
  // The message id is claimed, so a failure past this point is never retried by the provider: say so to the person once
  // (best effort) rather than leave them with silence.
  try {
    let person = await store.person(contact);
    for (const alias of msg.aliases ?? []) { if (person) break; person = await store.person(alias); }
    if (person?.contact) contact = person.contact;
    if (store.sawInbound) await store.sawInbound(contact, now, { alias: msg.alias ?? null, phone: msg.phone ?? null });
    if (msg.kind === "blocked") { await store.setOptOut(contact, true, now); return ok({ command: "stop", blocked: true }); }
    if (msg.kind === "seen") {
      // WO-106 (live 2026-10-21: a resume sent as a file got no answer at all): a file or photo from a known person is told
      // what to do instead; a sticker or reaction is still left alone.
      // FEATURE 16: a file the adapter downloaded goes to the turn (below), which reads it; one it could not is answered here.
      if (msg.file && person && !msg.upload) {
        const r = await d.reply(contact, d.render(FILE_NOT_READ_REPLY));
        return ok({ ignored: "a file (not read yet); told to paste the text", sent: r.ok });
      }
      if (!(msg.upload && person)) return ok({ ignored: "no text (attachments are not read yet)" });
    }

    if (msg.startPayload && store.redeemLinkNonce) {
      const r = await store.redeemLinkNonce(msg.startPayload, contact, now);
      const text = r.ok ? TELEGRAM_LINKED_REPLY : r.why === "linked_elsewhere" ? TELEGRAM_LINKED_ELSEWHERE_REPLY : TELEGRAM_LINK_INVALID_REPLY;
      const s = await d.reply(contact, d.render(text));
      return ok({ link: r.ok ? "linked" : r.why, sent: s.ok });
    }
    const command = msg.command ?? channelCommand(msg.text, msg.channel);
    // Telegram's Start from a chat Trainee has never seen is the person's first message, not a START: it goes through
    // sign-up like any first text.
    const firstStart = command === "start" && !!msg.command && !person;
    // WO-106 (live 2026-10-21): on a chat channel a known person's HELP (or /help) and Telegram's /start are also a turn for
    // the brain, which knows their goal and what is in flight, so the reply ends in their next step; /start's "you're back
    // on" line goes first. STOP, the word START (a re-subscribe after STOP) and every command on SMS keep their fixed reply.
    const toBrain = !!msg.channel && !!person && (command === "help" || (command === "start" && !!msg.command));
    if (command && !firstStart) {
      if (command !== "help") await store.setOptOut(contact, command === "stop", now);
      if (!toBrain) {
        const r = await d.reply(contact, d.render(CHANNEL_REPLIES[command]));
        return ok({ command, sent: r.ok });
      }
    }

    if (!person) {
      // The same number already has Trainee on another channel: ask there, never merge on our own.
      if (msg.phone && store.linkCandidate && store.askToLink) {
        const found = await store.linkCandidate(msg.phone, msg.channel);
        if (found) {
          const key = await store.askToLink({ userId: found.userId, contact, phone: msg.phone, askedOn: found.contact, at: now, text: linkAskText(msg.channel) });
          if (!key) return ok({ ignored: "link asked already" });
          try { await d.deliver({ userId: found.userId, key, now }); } catch (e) { console.error("inbound: the link question waits in the outbox:", e instanceof Error ? e.message : String(e)); }
          const r = await d.reply(contact, d.render(linkPendingReply(channelOf(found.contact))));
          return ok({ link: "asked", sent: r.ok });
        }
      }
      if (!signupAllows(d.env, contact, msg.phone)) {
        if (await store.refusedBefore(contact, now)) return ok({ ignored: "signup closed (already told)" });
        const r = await d.reply(contact, d.render(SIGNUP_CLOSED_REPLY));
        return ok({ refused: "signup closed", sent: r.ok });
      }
      person = await store.createPerson(contact, now, msg.phone ?? null);
      if (store.sawInbound) await store.sawInbound(contact, now, { alias: msg.alias ?? null, phone: msg.phone ?? null });
      // A first Start is the person's first message: the brain welcomes them with what to send first (WO-106).
    }

    const key = `reply:${scoped(msg)}`;
    let cardId: string | null = null; // the card the turn's reply shows, recorded on the outbox row (SERIAL-1462)
    const answer = async (text: string, extra: Record<string, unknown>) => {
      await store.enqueueReply(person!.userId, key, text, now, msg.channel, undefined, cardId);
      try { await d.deliver({ userId: person!.userId, key, now }); }
      catch (e) { console.error("inbound: immediate send failed (the outbox has it):", e instanceof Error ? e.message : String(e)); }
      return ok(extra);
    };
    // A yes to "Reply yes to link it", within the hour, on the channel that was asked.
    if (YES.test(msg.text.trim()) && store.confirmLink) {
      const linked = await store.confirmLink({ userId: person.userId, askedOn: contact, at: now, notice: LINKED_HERE_REPLY });
      if (linked) {
        if (linked.key) { try { await d.deliver({ userId: person.userId, key: linked.key, now }); } catch { /* the outbox has it */ } }
        return await answer(linkedReply(channelOf(linked.contact)), { linked: channelOf(linked.contact) });
      }
    }
    if (CONNECT_TELEGRAM.test(msg.text.trim()) && store.issueLinkNonce) {
      const bot = (d.env.get("TELEGRAM_BOT_USERNAME") || "").trim();
      const text = msg.channel === "telegram" ? ALREADY_TELEGRAM_REPLY
        : bot && d.env.get("TELEGRAM_BOT_TOKEN") ? connectTelegramReply(telegramDeepLink(bot, await store.issueLinkNonce(person.userId, now)))
        : TELEGRAM_NOT_WIRED_REPLY;
      return await answer(text, { connect: "telegram" });
    }

    let reply: string, parts: string[] | null = null;
    try {
      const turnKey = await turnKeyFor(msg.provider === "loopmessage" ? msg.messageId : `${msg.provider}:${msg.messageId}`);
      // Telegram's /start and /help come as a command with no text; the brain reads them as the command itself.
      const said = msg.text || (command ? `/${command}` : "");
      // The brain gets the person, the thread, the words and a turn key, and the reply-to id only when the platform gave one.
      // FEATURE 16: the whole text goes to the turn (it was cut at 4,000 characters here, silently); the turn reads a long
      // resume and says what it cut, and answers any other long message in plain words.
      const out = await d.chat({ userId: person.userId, threadId: person.threadId, message: said.slice(0, CHANNEL_TEXT_MAX), turnKey, ...(msg.replyToMessageId ? { replyToMessageId: msg.replyToMessageId } : {}),
        ...(msg.upload ? { file: msg.upload } : {}) });
      reply = out.reply.trim() || CHAT_DOWN_REPLY;
      // SERIAL-1480: a card's yes with no usable reply id is told how in this channel's own terms: where this
      // integration has a verified reply-id path (Telegram, WhatsApp Cloud) "reply directly to the card, or tap"; on
      // iMessage, where it has none, only "tap the card".
      if (out.resultStatus === CARD_NEEDS_REPLY_STATUS) reply = needsReplyTextFor(msg.channel);
      parts = replyParts(out.parts);
      cardId = typeof out.cardId === "string" && out.cardId ? out.cardId : null;
      if (toBrain && command === "start") {
        reply = `${CHANNEL_REPLIES.start}\n\n${reply}`;
        if (parts) parts = [`${CHANNEL_REPLIES.start}\n\n${parts[0]}`, ...parts.slice(1)];
      }
      if (out.threadId && out.threadId !== person.threadId) await store.setThread(contact, out.threadId, person.userId);
    } catch (e) {
      console.error("inbound: chat failed:", e instanceof Error ? e.message : String(e));
      reply = CHAT_DOWN_REPLY;
    }
    // The reply is queued; sending it now is a head start on the every-minute run, never a second path. A failure there may
    // come after the provider took it, so it must not reach the catch below (which would also say "couldn't answer").
    // A reply in parts is one row per part (reply:<id>:<n>), each whole, sent in order.
    const rows = parts ? parts.map((text, i) => ({ key: `${key}:${i + 1}`, text, part: { of: key, n: i + 1 } })) : [{ key, text: fitReply(reply), part: undefined }];
    for (const r of rows) await store.enqueueReply(person.userId, r.key, r.text, now, msg.channel, r.part, cardId);
    try { for (const r of rows) await d.deliver({ userId: person.userId, key: r.key, now }); }
    catch (e) { console.error("inbound: immediate send failed (the outbox has it):", e instanceof Error ? e.message : String(e)); }
    return ok({ replied: true, ...(parts ? { parts: parts.length } : {}) });
  } catch (e) {
    console.error("inbound failed:", e instanceof Error ? e.message : String(e));
    try { await d.reply(contact, d.render(CHAT_DOWN_REPLY)); } catch { /* already logged */ }
    return { status: 500, body: { ok: false, error: "internal" } };
  }
}

// A webhook of a provider that may carry several messages and status callbacks (WhatsApp) or one update (Telegram). The
// provider gets 200 once its messages are claimed and run, so it does not retry what was handled; a failure inside one
// message was already said to that person.
export async function handleChannelWebhook(req: Request, adapter: ChannelAdapter, d: CoreDeps): Promise<Response> {
  const parsed = await adapter.parseInbound(req);
  if ("response" in parsed) return parsed.response;
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  let reheld = 0;
  for (const s of parsed.statuses ?? [] as StatusEvent[]) {
    if (s.hold && d.store.reholdSent) reheld += await d.store.reholdSent(s.providerMessageId, d.now(), s.error);
    else if (!s.hold) console.error(`${adapter.provider}: a sent message failed after it was accepted: ${s.error}`);
  }
  if (!parsed.messages.length) return json({ ok: true, ...(reheld ? { reheld } : {}), ignored: (parsed.ignored ?? [])[0] ?? "nothing to read" });
  const results: Record<string, unknown>[] = [];
  for (const m of parsed.messages) {
    const r = await runInbound(m, d);
    results.push(r.body);
  }
  return json({ ok: true, ...(reheld ? { reheld } : {}), results });
}
