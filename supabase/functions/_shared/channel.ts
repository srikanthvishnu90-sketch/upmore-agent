// The texting channel's rules (WO-013a), before any provider: STOP means Trainee sends nothing on its own to that contact
// until START (an answer to a message the person sends is still delivered); every queued message goes out at most once, is retried on a provider's temporary failure, and is never dropped
// silently; a provider's daily contact cap holds (LoopMessage plans: 300 or 1,000 contacts a day). The provider is a
// `Send` function (LoopMessage in WO-013b); the store is memory here and Supabase in 013b.
import { toBubbles } from "./conversation.ts";

export type ChannelCommand = "stop" | "start" | "help";
const COMMANDS: Record<string, ChannelCommand> = {
  stop: "stop", stopall: "stop", unsubscribe: "stop", cancel: "stop", end: "stop", quit: "stop",
  start: "start", unstop: "start", help: "help", info: "help",
};
// The whole message is the command (any case, end punctuation ignored); "stop sending me sales jobs" is a message.
export function channelCommand(text: string): ChannelCommand | null {
  const t = String(text ?? "").trim().toLowerCase().replace(/[.!?\s]+$/g, "");
  return COMMANDS[t] ?? null;
}
export const CHANNEL_REPLIES: Record<ChannelCommand, string> = {
  // After STOP nothing goes out on Trainee's own (alerts, reports, nudges); a message the person starts is still answered.
  stop: "You're unsubscribed. Trainee won't message you on its own again, alerts and reports included; it only answers if you text it. Text START to turn messages back on.",
  start: "You're back on. Text STOP any time and every message stops.",
  help: "Trainee is a job-search agent you text: real postings, alerts, applications you approve, interview practice. Text STOP to stop all messages.",
};

export interface OutboxRow { id: string; userId: string; contact: string; key: string; text: string; deliver_at: number; attempts: number }
export type DeliveryMark = { status: "delivered" | "failed" | "skipped_opt_out"; at: number; error?: string; providerId?: string; retryAt?: number };
export interface ChannelStore {
  due(now: number, limit: number): Promise<OutboxRow[]>; // undelivered, deliver_at <= now, oldest first
  optedOut(contact: string): Promise<boolean>;
  setOptOut(contact: string, out: boolean, at: number): Promise<void>;
  contactsSentOn(day: string): Promise<number>; // distinct contacts sent to on a UTC day
  sentTo(contact: string, day: string): Promise<boolean>;
  mark(id: string, r: DeliveryMark): Promise<void>; // a retry is status "failed" with retryAt set and attempts + 1
}
export type Send = (contact: string, bubbles: string[]) => Promise<{ ok: true; id: string | null } | { ok: false; error: string; retryable: boolean }>;

// The answer to a message the person sent (trainee-inbound queues it as reply:<provider message id>).
export const isReply = (key: string) => String(key ?? "").startsWith("reply:");
export const MAX_ATTEMPTS = 3;
const BACKOFF_MS = [60000, 5 * 60000, 30 * 60000]; // after attempt 1, 2, 3
const utcDay = (t: number) => new Date(t).toISOString().slice(0, 10);

// budgetMs: a run that has used its time stops before the next row (a long card is many bubbles, each paced by the
// provider); what it claimed and did not reach goes back for the next run (the store's release), never half sent.
export async function deliverDue(o: { store: ChannelStore; send: Send; now: number; limit?: number; dailyContactCap?: number; clock?: () => number; budgetMs?: number }) {
  const r = { delivered: 0, failed: 0, retried: 0, skipped_opt_out: 0, capped: 0, deferred: 0 };
  const day = utcDay(o.now), cap = o.dailyContactCap ?? Infinity;
  let contacts = await o.store.contactsSentOn(day);
  for (const m of await o.store.due(o.now, o.limit ?? 100)) {
    if (o.clock && o.budgetMs !== undefined && o.clock() - o.now >= o.budgetMs) { r.deferred++; continue; }
    // STOP holds what Trainee starts (alerts, reports, cards, receipts); the answer to a message the person sent after STOP
    // still goes out, as the STOP reply promises.
    if (!isReply(m.key) && await o.store.optedOut(m.contact)) { await o.store.mark(m.id, { status: "skipped_opt_out", at: o.now }); r.skipped_opt_out++; continue; }
    const known = await o.store.sentTo(m.contact, day);
    if (!known && contacts >= cap) { r.capped++; continue; } // stays queued for tomorrow's allowance
    let res: Awaited<ReturnType<Send>>;
    try { res = await o.send(m.contact, toBubbles(m.text)); }
    catch (e) { res = { ok: false, error: e instanceof Error ? e.message : String(e), retryable: true }; }
    if (res.ok) {
      await o.store.mark(m.id, { status: "delivered", at: o.now, providerId: res.id ?? undefined });
      r.delivered++;
      if (!known) contacts++;
      continue;
    }
    const attempt = m.attempts + 1;
    if (res.retryable && attempt < MAX_ATTEMPTS) { await o.store.mark(m.id, { status: "failed", at: o.now, error: res.error, retryAt: o.now + BACKOFF_MS[attempt - 1] }); r.retried++; }
    else { await o.store.mark(m.id, { status: "failed", at: o.now, error: res.error }); r.failed++; }
  }
  return r;
}

// ------------------------------------------------------------------------------------------------ memory
type MemRow = OutboxRow & { status: "queued" | "delivered" | "failed" | "skipped_opt_out"; retryAt: number | null; sentAt: number | null; error: string | null };
export function memoryChannel(rows: OutboxRow[] = []): ChannelStore & { rows(): MemRow[]; queue(row: OutboxRow): void; optOuts(): string[] } {
  const st: MemRow[] = rows.map((x) => ({ ...x, status: "queued", retryAt: null, sentAt: null, error: null }));
  const optOut = new Map<string, boolean>();
  return {
    async due(now, limit) {
      return st.filter((x) => (x.status === "queued" || (x.status === "failed" && x.retryAt !== null && x.retryAt <= now)) && x.deliver_at <= now)
        .sort((a, b) => a.deliver_at - b.deliver_at).slice(0, limit).map((x) => ({ id: x.id, userId: x.userId, contact: x.contact, key: x.key, text: x.text, deliver_at: x.deliver_at, attempts: x.attempts }));
    },
    async optedOut(c) { return optOut.get(c) === true; },
    async setOptOut(c, out) { optOut.set(c, out); },
    async contactsSentOn(day) { return new Set(st.filter((x) => x.status === "delivered" && x.sentAt !== null && utcDay(x.sentAt) === day).map((x) => x.contact)).size; },
    async sentTo(c, day) { return st.some((x) => x.contact === c && x.status === "delivered" && x.sentAt !== null && utcDay(x.sentAt) === day); },
    async mark(id, m) {
      const x = st.find((y) => y.id === id); if (!x) return;
      x.status = m.status; x.error = m.error ?? null;
      if (m.status === "delivered") x.sentAt = m.at;
      if (m.status === "failed") { x.attempts++; x.retryAt = m.retryAt ?? null; }
    },
    rows() { return st.map((x) => ({ ...x })); },
    queue(row) { st.push({ ...row, status: "queued", retryAt: null, sentAt: null, error: null }); },
    optOuts() { return [...optOut].filter(([, v]) => v).map(([k]) => k); },
  };
}
