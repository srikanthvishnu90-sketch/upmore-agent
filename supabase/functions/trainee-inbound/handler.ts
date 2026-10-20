// Texts coming in (WO-013b-2), as a function of its inputs so it is testable without a database, a provider or a model.
// LoopMessage posts every inbound text here. Order matters: the secret, then the message id claimed (a retried webhook
// never runs a second turn), then STOP/START/HELP (answered and recorded before any account exists), then who may sign
// up (the owner's call; closed by default), then the turn through agent-chat as that person, whose reply goes out through
// the outbox so the daily contact cap and the at-most-once rule cover it.
import { equalSecret } from "../_shared/message_service.ts";
import { channelCommand, CHANNEL_REPLIES, type Send } from "../_shared/channel.ts";
import { fitOutbox, normalizeContact, toBubbles } from "../_shared/conversation.ts";
import { parseLoopInbound } from "../_shared/loopmessage.ts";

export const SIGNUP_CLOSED_REPLY = "Trainee is invite-only right now, so I can't set you up yet. Nothing about you was saved except that you texted.";
export const CHAT_DOWN_REPLY = "I couldn't answer that just now. Try again in a minute.";
export interface Person { userId: string; threadId: string | null }
export interface InboundStore {
  claimMessage(id: string, at: number): Promise<boolean>; // false: this message id was handled before
  person(contact: string): Promise<Person | null>; // a linked account, if any
  refusedBefore(contact: string, at: number): Promise<boolean>; // records the refusal; true when this contact was refused already
  createPerson(contact: string, at: number): Promise<Person>;
  setThread(contact: string, threadId: string): Promise<void>;
  setOptOut(contact: string, out: boolean, at: number): Promise<void>;
  enqueueReply(userId: string, key: string, text: string, at: number): Promise<boolean>;
}
export interface InboundDeps {
  env: { get(k: string): string | undefined };
  now: () => number;
  store: () => InboundStore;
  send: (apiKey: string) => Send; // channel commands and the signup refusal go straight out: no account, no outbox row
  chat: (a: { userId: string; threadId: string | null; message: string; turnKey: string }) => Promise<{ status: number; reply: string; threadId: string | null }>;
  deliverReply: (a: { userId: string; key: string; apiKey: string; now: number }) => Promise<void>;
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

export function signupAllows(env: InboundDeps["env"], contact: string): boolean {
  if ((env.get("TRAINEE_SIGNUP") || "closed") === "open") return true;
  const list = (env.get("TRAINEE_ALLOWED_CONTACTS") || "").split(",").map((c) => c.trim()).filter(Boolean);
  return list.some((c) => { try { return normalizeContact(c) === contact; } catch { return false; } });
}
// A provider id becomes a chat turn key the chat accepts (letters, digits, - and _), so agent-chat's own replay guard sees
// a retry of the same message as the same turn.
export async function turnKeyFor(messageId: string): Promise<string> {
  const h = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(messageId)));
  return "lm_" + Array.from(h.slice(0, 16), (b) => b.toString(16).padStart(2, "0")).join("");
}

export async function handleInbound(req: Request, d: InboundDeps): Promise<Response> {
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);
  const secret = d.env.get("TRAINEE_INBOUND_SECRET") || "";
  if (secret.length < 32) return json({ error: "not configured: TRAINEE_INBOUND_SECRET must be set, 32 characters or more" }, 503);
  const got = new URL(req.url).searchParams.get("secret") || req.headers.get("x-trainee-secret") || "";
  if (!equalSecret(got, secret)) return json({ error: "forbidden" }, 403);
  const apiKey = d.env.get("LOOPMESSAGE_API_KEY") || "";
  if (!apiKey) return json({ error: "NOT_WIRED: LOOPMESSAGE_API_KEY is not set; no turn was run" }, 503);

  const msg = parseLoopInbound(await req.json().catch(() => null));
  if (msg.kind === "ignored") return json({ ok: true, ignored: msg.why });
  if (!msg.messageId) return json({ ok: true, ignored: "no message id, so a retry could not be told apart; nothing was run" });
  let contact: string;
  try { contact = normalizeContact(msg.sender); } catch { return json({ ok: true, ignored: "not a phone number or address" }); }
  const now = d.now(), store = d.store();
  if (!(await store.claimMessage(msg.messageId, now))) return json({ ok: true, ignored: "duplicate webhook" });

  const send = d.send(apiKey);
  // The message id is claimed, so a failure past this point is never retried by the provider: say so to the person once
  // (best effort) rather than leave them with silence.
  try {
    const command = channelCommand(msg.text);
    if (command) {
      if (command !== "help") await store.setOptOut(contact, command === "stop", now);
      const r = await send(contact, toBubbles(CHANNEL_REPLIES[command]));
      return json({ ok: true, command, sent: r.ok });
    }
    let person = await store.person(contact);
    if (!person) {
      if (!signupAllows(d.env, contact)) {
        if (await store.refusedBefore(contact, now)) return json({ ok: true, ignored: "signup closed (already told)" });
        const r = await send(contact, toBubbles(SIGNUP_CLOSED_REPLY));
        return json({ ok: true, refused: "signup closed", sent: r.ok });
      }
      person = await store.createPerson(contact, now);
    }
    let reply: string;
    try {
      const out = await d.chat({ userId: person.userId, threadId: person.threadId, message: msg.text.slice(0, 4000), turnKey: await turnKeyFor(msg.messageId) });
      reply = out.reply.trim() || CHAT_DOWN_REPLY;
      if (out.threadId && out.threadId !== person.threadId) await store.setThread(contact, out.threadId);
    } catch (e) {
      console.error("trainee-inbound: chat failed:", e instanceof Error ? e.message : String(e));
      reply = CHAT_DOWN_REPLY;
    }
    const key = `reply:${msg.messageId}`;
    await store.enqueueReply(person.userId, key, fitOutbox(reply), now);
    // The reply is queued; sending it now is a head start on the every-minute run, never a second path. A failure here may
    // come after the provider took it, so it must not reach the catch below (which would also say "couldn't answer").
    try { await d.deliverReply({ userId: person.userId, key, apiKey, now }); }
    catch (e) { console.error("trainee-inbound: immediate send failed (the outbox has it):", e instanceof Error ? e.message : String(e)); }
    return json({ ok: true, replied: true });
  } catch (e) {
    console.error("trainee-inbound failed:", e instanceof Error ? e.message : String(e));
    try { await send(contact, toBubbles(CHAT_DOWN_REPLY)); } catch { /* already logged */ }
    return json({ ok: false, error: "internal" }, 500);
  }
}
