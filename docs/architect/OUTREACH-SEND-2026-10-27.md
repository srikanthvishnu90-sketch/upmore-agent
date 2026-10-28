# The sending rail: approved emails leave from the person's own Gmail (lane M1, 2026-10-27)

Owner decisions: D-MN-1 (Trainee sends from the person's own Gmail after approval), D-MN-2 (one yes approves exactly the
emails shown, each bound to its hash), APL-12 (applications that go by email use the same rail), NO LIMITS (19:55 CDT:
no volume limit of Trainee's own; only an outside refusal slows anything), SCALE (19:52 CDT), and the removal of the
cross-person "3 per address per 30 days" rule (20:40 CDT).

## What it does

One queue (`career_send_queue`, migration `20261027200000_career_send_queue.sql`) for every email the person approved:
`kind` = `outreach` (N2's drafts), `application` (APL-12) or `general` (any other email they approve). Code:
`supabase/functions/_shared/career_send_rail.ts`; the sender function: `supabase/functions/career-send/`.

- **Exactly once.** The idempotency key is `kind:source_id:approval_hash`, unique. A claimed email that may have reached
  Gmail (a 5xx, a network error, a worker that died) is checked against the person's Sent mail (gmail.readonly) before
  any second try. Outcomes are recorded in batches of up to 10; an email sent but not yet recorded when a worker dies is
  found the same way, so batching never sends twice.
- **Hash-bound.** At queueing, the payload is re-hashed (the same SHA-256 as `career_outreach.ts payloadHash`) and must
  equal the approval hash. For outreach the claim re-reads the draft under its row lock (`approved`, `approved_hash =
  hash = approval_hash`) and the worker re-hashes the stored draft before sending. A draft changed after approval is
  refused (the draft goes back to `shown` for a fresh approval); a draft the person took back is cancelled.
- **One recipient, nothing hidden.** One plain lowercase address (no display name, list or separator); only To, Subject,
  MIME-Version, Content-Type and Content-Transfer-Encoding headers; the body is base64; any CR, LF or control character in
  the subject is refused, never cleaned; an item carrying `cc` or `bcc` is refused. The table checks the same.
- **No volume limit of Trainee's own.** No daily number, no spacing, no per-recipient number across people. The only
  brake is Gmail: a 429, or a 403 with a rate/quota reason, puts that account in `backoff` until Gmail's Retry-After
  (or the time in its message, or a doubling wait from one minute); the person gets one plain line on their home
  channel (`career_outbox` kind `status`); every other account keeps sending; nothing is lost or doubled.
- **Auth.** A 401, a 403 without a rate reason, or no grant that may send: the account stops (`needs_reconnect`), the
  person is told once ("Say "connect gmail" to reconnect..."), and the emails wait. A reconnect (the connection row
  replaced or updated) resumes them.
- **Replies, opt-out, bounces** (gmail.readonly, `runReplyCheck`). A bounce (mailer-daemon / delivery failure in the
  thread) puts the address on `career_send_bad_addresses` (a hash, no person): never emailed again by anyone, and
  anything still queued to it is cancelled. "stop", "unsubscribe", "not interested", "remove me" and similar from the
  recipient put them on `career_outreach_dnc` forever (kept through an erase) and cancel anything queued to them. Any
  other reply cancels the follow-up to that email. An out-of-office is not a reply.
- **Never twice for outreach**, except one approved follow-up (`follow_up_of`) to a sent email that got no reply.
- **Disconnect** (the `google_career` connection row deleted, by any path): everything still queued is cancelled and the
  account is `disconnected`. **Erase**: `career_erase_person` deletes the queue and the account row (found from the
  catalog); the opt-out and bad-address lists stay.

## Scale

`career_send_claim` takes whole sender accounts `FOR UPDATE SKIP LOCKED`, oldest turn first (round robin: a heavy
sender cannot starve anyone), leases the account and up to `per_account` of its due emails, and the completion only lands
for the lease that holds the row. Lapsed leases are reclaimed by the next claim. One account is sent from by one worker at
a time; many workers run side by side. `accounts` and `per_account` size one call; the worker claims again until nothing
is due, so neither limits volume.

Load test (`tests/load/send-rail-load.test.ts`, CI job `load (send rail)`): see the PR for the measured numbers.

## Interface for the chat lane (M3)

```ts
// N2's approval hand-off (already wired in agent-chat/handler-career.ts as outreachTurn's onApproved, with the rail on):
queueApprovedOutreach(d: { rpc, drafts(userId, ids) }, userId, items: { draftId: string; approvalHash: string }[])
  : Promise<{ sourceId: string; status: "queued" | "already_queued" | "refused"; reason?: string; id?: string }[]>
// Any kind (applications by email, general emails): the exact payload the person saw, hashed with mailHash.
queueApproved(d: { rpc }, userId, items: { kind: "outreach" | "application" | "general"; sourceId: string;
  approvalHash: string; to: string; subject: string; text: string; followUpOf?: string | null }[]): Promise<QueueResult[]>
// "where are my emails": counts, Gmail's own pause if any, and a plain sentence (`line`) to say.
outreachSendStatus(d: { rpc }, userId): Promise<{ counts, waiting, sent, nextAt, account, line: string }>
// "stop sending" / "cancel those emails": takes back what is still queued (all, or those drafts). Returns how many.
cancelQueued(d: { rpc }, userId, sourceIds?: string[]): Promise<number>
```

`rpc` is the service client's `admin.rpc`. Refusal reasons: `changed`, `not_approved`, `not_found`, `opted_out`,
`bad_address`, `already_emailed`, `follow_up_refused`, `replied`, `not_connected`, `cc_bcc_not_approved`,
`unsafe_header`, `not_wired` (Outlook), `invalid`.

## Owner steps

1. **Google verification.** gmail.send is a sensitive scope. PR #196 keeps it out of the first submission and lets the
   owner add it with `GOOGLE_APPROVED_EXTRA_SCOPES=https://www.googleapis.com/auth/gmail.send` once Google approves it;
   no code change is needed for the rail. The submission's justification for gmail.send: "sends emails the user
   approved, each shown word for word, from their own Gmail; one recipient per message; nothing without approval".
   gmail.readonly (already in the submission) is used to check Sent before a retry and to read replies and bounces.
2. **Migration.** `20261027200000_career_send_queue.sql` is in go-live's list with its mark.
3. **Deploy.** go-live deploys `career-send` (no JWT; it checks `CAREER_PROACTIVE_SECRET`).
4. **Schedule.** `scripts/launch/schedule-career-proactive.sql` (run by go-live's step 5) adds `trainee-career-send`:
   every minute, `CAREER_SEND_WORKERS` (default 4, at most 64) instances. More instances only add throughput.
5. **Turn it on** (off by default, the repo's pattern for anything that sends): `CAREER_SEND_RAIL=on`. Leave the older
   outreach send run (`CAREER_OUTREACH_SEND`, inside career-proactive) off: it carries the daily caps and spacing the
   owner removed, and the two must not both send.
6. Optional sizing (not limits): `CAREER_SEND_CLAIM_ACCOUNTS` (default 20), `CAREER_SEND_CLAIM_PER_ACCOUNT` (default 25).

Health: `select state, count(*) from career_send_queue group by 1;` and `select state, count(*) from career_send_accounts
group by 1;`. A real send needs the owner's live Google grant; no test sends real email.

## Not in this lane

Outlook sending (`provider = 'outlook'` is in the schema; the sender is not wired and refuses `not_wired`); the chat
words for status and cancel (M3); the approval batch text (N2).
