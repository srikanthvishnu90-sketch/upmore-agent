# WO-013: The texting channel: delivery, STOP, LoopMessage

Status: done (PRs #10, #11, #12, 2026-10-19) · Depends on: WO-004, WO-007 · Assignee: Claude (was Muse; D-012) · Size cap: ~600 lines each, excluding the architect tests

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

## 013b: LoopMessage, in two PRs
Never verified against LoopMessage's own documentation (docs.loopmessage.com does not resolve from the build environment).
The request shape is the one the owner's test bridge `imessage-inbound` used live, 2026-10-08..11: `POST
https://a.loopmessage.com/api/v1/message/send/`, the raw key in `Authorization`, body `{ contact, text }`. **Before go-live,
the owner checks every field, the webhook's payload, and which statuses LoopMessage retries.**

### 013b-1: delivery (ready)
- Migration: `career_outbox` gains `status` (`queued | sending | delivered | failed | skipped_opt_out`), `attempts`,
  `retry_at`, `claimed_at`, `contact` (copied at claim time: the number it actually went to), `provider_id`, `error`;
  `delivered_at` is the send time. New `channel_contacts` (contact primary key, `user_id` unique and nullable: a STOP from a
  number with no account is still kept; cascade on account deletion), owner-readable, in the data export. New
  `channel_delivery_runs` (every run, failed or not). Service-role RPCs: `career_outbox_claim(now, limit)` claims due rows
  `FOR UPDATE SKIP LOCKED` (two overlapping runs never send the same row), `career_outbox_contacts_on(day)`.
- `_shared/channel_store.ts`: `supabaseChannelStore(admin)`, the `ChannelStore` of 013a over those tables, plus
  `release()` (rows a run claimed but did not finish, such as capped ones, go back unchanged) and `sweep(now)` (a row left
  `sending` by a run that died is `failed` with "outcome unknown", never resent: at most once beats twice).
- `_shared/loopmessage.ts`: `loopSend({ apiKey, fetch })` is a `Send`: one request per bubble, 250 ms apart. Network
  errors, 429 and 5xx are retryable; other 4xx are not; a failure after the first bubble went out is not retryable
  (a retry would resend the first bubbles) and says how many went.
- `trainee-deliver` function: POST with `x-trainee-deliver-secret` (32+ characters); 503 NOT_WIRED naming the missing
  setting without `LOOPMESSAGE_API_KEY`; daily contact cap `LOOPMESSAGE_DAILY_CONTACTS` (default 300, the smaller plan);
  20 rows a run; schedule every minute in `scripts/launch/schedule-trainee-deliver.sql` (the owner runs it).
- Rows of a person with no texting contact stay queued and are never claimed.

### 013b-2: inbound (drafting)
- `trainee-inbound`: secret-gated webhook (`?secret=` or `x-trainee-secret`, 32+ characters; LoopMessage cannot send custom
  auth headers); ignores delivery callbacks and non-text; dedupes by the provider's message id (a table with the id as
  primary key, claimed before any work: a retried webhook never runs a second turn); STOP/START/HELP answered and recorded
  before any account exists.
- Who may sign up is the owner's call: `TRAINEE_SIGNUP` = `closed` (default: only contacts already linked, plus
  `TRAINEE_ALLOWED_CONTACTS`, a comma list) or `open`. A contact refused by it gets one fixed reply and no account; no
  model call is made for them.
- A new allowed contact gets an account (auth user with no password, linked in `channel_contacts`) and one thread
  (`channel_contacts.thread_id`). The turn runs through `agent-chat` as that person over the existing service-role path
  (`as_user_id`), so history, erase, STOP-at-the-host, persistence and the 60-turns-an-hour limit are the chat's own.
- The reply is queued in `career_outbox` as `reply:<message id>` and delivered at once through `deliverDue` on that row, so
  the daily contact cap and the at-most-once rule cover replies; a failed send is retried by `trainee-deliver`.
- Retires `imessage-inbound` and its hard-coded phone number (the function and the bridge comment in `handler-career.ts`
  stop calling the path "test only").

## Out of scope
SMS/RCS (WO-014), Apple Messages for Business, attachments beyond text (013b reads text only and says so).
