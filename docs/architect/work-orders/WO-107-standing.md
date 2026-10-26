# WO-107: one read model on the live path (F3): status, inbox, due follow-ups

## Why
DIAGNOSIS-2026-10-25 §2.4, §2.5, §2.11 and fix order F3. Four records of a person's applications never saw each
other: `career_apply_jobs` (what Trainee sent and how it ended), `career_mail_events` (what the employer's mail said,
read by the mail run), the tracker in every thread (what the person told Trainee) and `career_mail_drafts`
(follow-ups the mail run drafted, never sent). On the live path the router answered "where do I stand" from one
thread's tracker alone; nothing from the inbox reached chat; no follow-up was ever offered in chat. The code-first
status turn (SPLIT-1146) read the queue only.

## What
One read model, built by code every time one of three asks is typed, before the router or any brain
(`supabase/functions/_shared/career_standing.ts`; the handler slot sits before the queue-only status turn, which stays
as its fallback, and before the brain):
- **status** ("where are my applications", "did my application to X go through", "where do I stand with X"): the
  queue's own wording first, byte for byte (`career_apply_status.ts` is unchanged and still reads
  `career_apply_jobs` only), then the other records' lines, each named: "You told Trainee: applied on …; stage …",
  "X's email: interview invitation on … (stage: …)", "Also on your tracker (what you told Trainee): …", "Employer
  email on record (last 30 days): …".
- **inbox** ("who emailed me", "any news from X", "did X get back to me"): the mail events only, newest first, with
  how far the mail was read ("read through Oct 25", or "Trainee has not read your mail yet …"). Nothing is read from
  the inbox here; the mail run reads, this reads its record.
- **follow-ups** ("what follow-ups are due", "who should I follow up with"): the drafted rows, then what the mail run's
  own rule (`followUps`: 14 quiet days after applying, 7 after an interview step) says is due over the merged
  applications and not drafted yet; the text is shown so it is ready to send. Nothing is drafted, saved or sent.
A record that cannot be read is named ("Your mail events could not be read just now.") and never guessed; with the
mail record unread no follow-up is called due. A tracker row the mail run's merge reads as the queue's own application
still lends it what the person reported (an interview, a rejection), so a reply they told Trainee about is a reply.

## Found on the way (fixed here)
The commit (`career_host_commit`) saves the thread's career state as `state -> career -> {v, scope, revision, stores}`,
so the tracker rows live at `state->career->stores->trackStore->rows` (the prepare-ahead SQL reads the profile from the
same shape). The situation model (WO-100), the mail run's application read (WO-024) and the brief store (WO-034)
selected `state->career->trackStore->rows`, a path that never exists: in production none of them ever saw a tracker
row. Found when the flow test's tracker line was missing at the real handler; all four readers now name the saved path,
pinned to the SQL in `tests/architect/tracker-path.test.ts`. Observed, not changed (the router's): "I applied to X for
the Y role on October 9" is logged with today's date and the role as "Y Role".

## Interfaces
`standingAsk(message) → {kind: "status", company} | {kind: "inbox", company} | {kind: "followups"} | null`;
`standingFrom(rows, now) → Standing`; `supabaseStanding(admin) → ReadStanding`; `standingTurn({message, userId, now,
read}) → {reply, status, intent} | null`. Intents: `career_apply_status` (unchanged), `career_inbox`,
`career_followups_due`.

## Acceptance tests
`tests/architect/wo-107-standing.test.ts` (written first in `pending/`, red until the module and the handler slot
existed): the asks and what is never claimed; the queue wording byte for byte with the other records after it; each
record missing, named; inbox newest first and the read cursor; follow-ups drafted and due, nothing sent; the handler
order. `tests/architect/flow-standing.test.ts`: the same at the real handler on real Postgres, the tracker from the
person's own text, a revoked table named not guessed, another person seeing none of it.

## Demo (owner)
On a scratch database with the four tables seeded, text "where are my applications", "did my application to Globex
go through", "who emailed me", "any news from Globex", "what follow-ups are due" and read each record's line under its
own name; revoke `career_mail_events` from the service role and see the mail lines replaced by "could not be read".

## Out of scope
Routing an offered follow-up draft into the outreach card path (the diagnosis's second half of §2.4's smallest fix);
the brain's `where_do_i_stand` tool (the brain is pinned off; it keeps its own merge and the situation block); the
mail run's own `followUps` over `mergeApps` (it still drafts a follow-up for a queue application whose tracker row
reports an interview: the model here counts that report, the run does not; a follow-up order). Deploy is the owner's.

## Size cap
One module (≤ 200 lines), one handler slot, two tests.
