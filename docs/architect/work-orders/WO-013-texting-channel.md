# WO-013: The texting channel: delivery, STOP, LoopMessage

Status: 013a ready · 013b drafting · Depends on: WO-004, WO-007 · Assignee: Claude (was Muse; D-012) · Size cap: ~600 lines each, excluding the architect tests

## Why
Everything is built and tested through the conversation interface and the simulator (D-009); this order puts it on a real
phone. Two things decide whether a texting product is allowed to exist at scale, before any feature: a person who texts
STOP never hears from it again (carrier rules, LoopMessage's terms, and plain decency), and nothing is ever sent twice or
silently dropped. 013a builds those, provider-free and fully testable; 013b plugs LoopMessage in.

## 013a: delivery and opt-out (no provider)
### Files
- `supabase/functions/_shared/channel.ts` (new): `channelCommand`, `CHANNEL_REPLIES`, `deliverDue`, `memoryChannel`
- `supabase/functions/_shared/conversation.ts`: `handleInbound` answers channel commands before the brain
- `scripts/text.ts`: STOP/START/HELP go through the same path; delivery goes through `deliverDue`
- `tests/architect/pending/wo-013a-channel.test.ts` → `tests/architect/` (do not edit)

### Interfaces (exact)
```ts
export type ChannelCommand = "stop" | "start" | "help";
export function channelCommand(text: string): ChannelCommand | null; // the whole message, any case, end punctuation ignored
export const CHANNEL_REPLIES: Record<ChannelCommand, string>;
export interface OutboxRow { id: string; userId: string; contact: string; key: string; text: string; deliver_at: number; attempts: number }
export interface ChannelStore {
  due(now: number, limit: number): Promise<OutboxRow[]>;           // undelivered, deliver_at <= now, oldest first
  optedOut(contact: string): Promise<boolean>;
  setOptOut(contact: string, out: boolean, at: number): Promise<void>;
  contactsSentOn(day: string): Promise<number>;                     // distinct contacts sent to on a UTC day
  sentTo(contact: string, day: string): Promise<boolean>;
  mark(id: string, r: { status: "delivered" | "failed" | "skipped_opt_out"; at: number; error?: string; providerId?: string; retryAt?: number }): Promise<void>;
}
export type Send = (contact: string, bubbles: string[]) => Promise<{ ok: true; id: string | null } | { ok: false; error: string; retryable: boolean }>;
export function deliverDue(o: { store: ChannelStore; send: Send; now: number; limit?: number; dailyContactCap?: number }): Promise<{
  delivered: number; failed: number; retried: number; skipped_opt_out: number; capped: number }>;
```
### Rules pinned by the tests
- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT (alone, any case) opt the contact out: one confirmation, then nothing
  more is sent to them, proactive or not, until START or UNSTOP. HELP and INFO answer what Trainee is and how to stop.
  None of these reach the brain. A sentence that merely contains "stop" ("stop sending me sales jobs") is a normal message.
- An opted-out contact's queued messages are marked `skipped_opt_out`, never sent later.
- Each due row goes out at most once: `delivered` rows are never sent again; a retryable failure is retried with backoff
  (1, 5, 30 minutes) up to 3 attempts, then `failed`; a non-retryable failure is `failed` at once.
- The daily contact cap (LoopMessage plans: 300 or 1,000 contacts a day) holds: a row for a new contact past the cap
  stays queued (`capped`), never dropped; contacts already messaged today are not counted again.
- A message's text goes out as `toBubbles(text)`.

## 013b: LoopMessage (drafting)
- `trainee-inbound` function: secret-gated webhook (LoopMessage cannot send custom auth headers: `?secret=` or
  `x-trainee-secret`, 32+ characters); inbound text deduplicated by the provider's message id; runs `handleInbound` with a
  Supabase-backed `ConversationStore` (one person per contact, created by their first text) and the agent brain; replies
  through `Send`. Replaces the owner-only test bridge `imessage-inbound` and its hard-coded phone number.
- `trainee-deliver` function: every minute, `deliverDue` over `career_outbox`.
- `Send` for LoopMessage: `POST https://a.loopmessage.com/api/v1/message/send/`, raw key in `Authorization`, body
  `{ contact, text }`, one request per bubble, 250 ms apart (the shape the owner's test bridge used live, 2026-10-08..11).
  **Before go-live, verify every field against docs.loopmessage.com (unreachable from the build environment).**
- NOT_WIRED (503, says which setting is missing) without `LOOPMESSAGE_API_KEY` and the webhook secret. The owner creates
  the LoopMessage account, sets the secrets and points the webhook; nothing here does.

## Out of scope
SMS/RCS (WO-014), Apple Messages for Business, attachments beyond text (013b reads text only and says so).
