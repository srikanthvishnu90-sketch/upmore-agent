# Mail tracking (WO-024)

Owner target: "95%+ of application status changes (replies, rejections, interviews) detected from the user's email within
1 hour, auto-tracked, including applications the user made by hand. Weekly digest and on-demand 'where do I stand with
JPMorgan?' over text. Zero dropped follow-ups: no response in 2 weeks produces a drafted follow-up; ghosted after
interview produces a thank-you and nudge."

Every claim below is labeled: **VERIFIED** (a test or command in this repo shows it, offline), **ASSUMED** (a design
choice or outside fact not checked here), **NOT_RUN** (needs live mail, a deploy or the owner).

## Result in one paragraph

On mail it was never tuned on, the classifier is well below the target: **precision 88.6%, recall 75.6%** on the 50-email
held-out split (VERIFIED, synthetic). On the 234 emails it was tuned on it scores 100% / 99.4% (VERIFIED, but that only
shows it fits the emails it was tuned on). The live number on real inboxes is **NOT_RUN**. Phrase rules alone will not reach
95% recall: they miss phrasings nobody wrote down ("move in a different direction", "would like to talk with you"). The
plumbing works end to end on fakes (VERIFIED): it reads mail, records each message once, sends one text per real change,
drafts follow-ups, never sends email, and answers "where do I stand". The gap is classification recall.

## WO-040 update (2026-10-20)

WO-040 (`docs/architect/work-orders/WO-040-mail-accuracy.md`) took the holdout to **100.0% (40/40) precision, 97.6% (40/41)
recall**. That number is optimistic: its misses were read for their causes. On mail in new wordings, scored once, the rules
do far worse (VERIFIED, synthetic):

- blind40: **83.3% (10/12) / 33.3% (10/30)**;
- the reviewer's fresh20: **83.3% (10/12) / 50.0% (10/20)**.

The target is not met on unseen wording. WO-040 also added:

- guards: an offer, or anything the model decided, moves a stage only from the employer's own authenticated mail
  (WO-032's `fromEmployer`); calendar notices, auto-replies, sales reps and shop "regrets" are never a status;
- an optional OpenAI second pass (`CAREER_MAIL_MODEL=on`, off by default), which needs a Limited Use disclosure and consent
  first.

The numbers below are WO-024's, kept as they were measured.

## What was built

| Piece | File | Status |
|---|---|---|
| Classifier, matcher, planner, follow-ups, `standing()` (pure) | `supabase/functions/_shared/career_mail.ts` | VERIFIED by `tests/architect/wo-024-mail.test.ts` M1-M7, M15 |
| Gmail reader: metadata only, since a time, oldest first, rate-limit aware, NOT_WIRED without the grant; career token refresh | `supabase/functions/_shared/career_mail_gmail.ts` | VERIFIED with a fake fetch (M11-M14) |
| Store: events, drafts, cursor; applications from `career_apply_jobs` and every thread's tracker | `supabase/functions/_shared/career_mail_store.ts` | memory store VERIFIED; Supabase store type-checked only, NOT_RUN against a database through PostgREST |
| Scheduled run `runMail` (one text per real change, follow-ups offered by text) | `supabase/functions/_shared/career_proactive_run.ts`, `career-proactive/handler.ts` | VERIFIED through `handleProactive` with fakes (M8-M11) |
| Production wiring, off until `CAREER_MAIL_TRACKING=on` | `supabase/functions/career-proactive/index.ts` | type-checked with the two remote imports stubbed; NOT_RUN live |
| Tables `career_mail_events`, `career_mail_drafts`, `career_mail_cursors`; outbox kinds `status`, `followup`; run counters | `supabase/migrations/20261020100000_career_mail_tracking.sql` | VERIFIED by `tests/db/career_mail_tracking.test.sql` (20 checks) in `bash tests/db/run.sh` |
| Export: both readable tables are in Export data | `tests/fixtures/export-tables.json`, `src/upmore-app-template.html` (+ rebuilt app) | VERIFIED by `tests/export-coverage.test.cjs` and `export_coverage.test.sql` |
| Brain tool `where_do_i_stand` (read) | `supabase/functions/_shared/agent/career_tools.ts`, wired in `agent-chat/career_brain.ts`, `handler-career.ts` | VERIFIED (M15; `tests/architect/wo-002-career-tools.test.ts` updated for the new tool) |
| Labeled synthetic set and eval | `evals/career/mail-labels.json` (284 emails), `evals/career/mail-eval.ts` | VERIFIED |

## How it decides

- **Kinds**: received, rejection, interview, assessment, offer, recruiter_reply, other. Only the first six are "status".
  "other" is never recorded and never moves a stage (VERIFIED, M2 and the `kind` check in the table).
- **Never by guess**: each kind needs an employer's phrase, not a lone word ("offer" alone is a sale, "interview" alone is
  a newsletter). Mail matching scam patterns (Telegram, WhatsApp, a check for equipment, bank details, SSN) or look-alike
  domains (`brand-careers.net`) is "other". Job boards count only for "your application was sent to X". Personal
  addresses (gmail.com and similar) never count, except a rejection (VERIFIED on the eval set).
- **Employer**: from the ATS sender's display name (Greenhouse, Lever, Ashby, Workday, SmartRecruiters, iCIMS, Taleo,
  SuccessFactors, Jobvite, Workable, BambooHR, Avature, and others), from the words of assessment vendors (HackerRank,
  CodeSignal, Codility, HireVue, SHL...), or from the sender's own domain. Employer named right: 208/208 on correctly
  classified status mail across all splits (VERIFIED, synthetic).
- **Matching** (`candidates`, `matchApplication`): by employer name, sender domain, or the board slug in the
  application's link. When two applications at one employer can't be told apart by role, nothing matches and nothing moves
  (VERIFIED, M5). A status email from an employer with no application on file starts a tracked application `mail:<employer>`.
  That is how applications made by hand are tracked (VERIFIED, M9).
- **Stages move forward only**: Submitted < Recruiter screen < OA/assessment < Interview rounds < Final < Offer. A rejection
  after an offer, or any news on a closed application, is **flagged and texted, never applied** (VERIFIED, M6).
- **Follow-ups**: no reply 14 days after applying gets a drafted follow-up. An interview step followed by 7 quiet days gets a
  thank-you and nudge. Each cites the application and its date, is drafted once per application (unique key), and is
  offered by text with the draft shown in full ("it is not sent"). Nothing is ever sent by email: every Gmail call in the
  tests is a GET, no send, draft or insert endpoint is touched, and no outbox kind sends mail (VERIFIED, M7, M10, SQL test).
  Applications older than 30 days get no draft, so connecting an old inbox doesn't produce a burst (ASSUMED threshold).
  "Interview then 7 days" counts from the interview email's date, because the interview's own date is not in the mail
  (ASSUMED).
- **Texts** are written by code, never the model. Each is one or two short lines with the email's subject. They are queued
  once per message (`status:<hash>`) and held until the person's quiet hours end (VERIFIED for once-only; quiet-hours
  deferral is in code, not separately tested).
- **Privacy**: only From, Subject, Date and Gmail's snippet are fetched (`format=metadata`); no body. Stored: kind,
  employer, role, stage, one evidence line of 300 characters or fewer, the SHA-256 of `gmail:<user>:<message id>`, and the
  mail date. The raw id never leaves the reader. A long number (an emailed code, an ID) is masked in evidence and refused by
  the table (VERIFIED, M3, M8, M12, SQL test).

## Within one hour

The scheduled run is every 5 minutes (existing `career-proactive` schedule, ASSUMED unchanged). Each run reads up to 200
people, least recently read first, 5 at a time, each up to 100 new messages, with 10 minutes of overlap (deduplicated by
message hash). So everyone is read within the hour up to about 2,400 people with the career grant (ASSUMED arithmetic;
Gmail latency, Edge time limits and quota at that size are NOT_RUN). A rate limit gets one polite retry, then the read
stops and the cursor moves only past what was read (VERIFIED, M13). Gmail's `after:<epoch seconds>` search is used for the
time window (ASSUMED: widely used, not formally documented).

## The eval (synthetic; live is NOT_RUN)

`deno run --allow-read evals/career/mail-eval.ts` (add `--json` or `--check`; `--check` guards the tuned splits against
a regression). All emails were written by hand for this order and are marked synthetic. No real person's mail is used.

| Split | Emails | Use | Status precision | Status recall |
|---|---|---|---|---|
| tune | 182 | labels written first; first run before any tuning: 100.0% / 97.8%, employer names 92.4%; then rules fitted to it | 100.0% (135/135) | 100.0% (135/135) |
| tune2 | 52 | written as a held-out set after round one; scored once at **97.0% / 74.4%**; then used for round two | 100.0% (42/42) | 97.7% (42/43) |
| **holdout** | **50** | written after round two, **never used to change a rule** | **88.6% (31/35)** | **75.6% (31/41)** |

Held-out per kind (precision / recall): received 100/100, rejection 100/67, interview 86/67, assessment 100/67, offer
80/80, recruiter_reply 60/75. The four wrong status calls were a rejection read as a recruiter reply, an interview read as
a recruiter reply, a one-way HireVue video read as an interview, and a scam ("You are hired! ... pay via Zelle") read as an
offer. Of the ten held-out status emails not read correctly, three got the wrong kind (above) and seven were missed
outright on phrasings the rules don't have.

Target: precision 97% or more, recall 95% or more. **Not met on the held-out split** (VERIFIED, synthetic). Two rounds of
held-out scoring (74.4% recall, then 75.6%) show the same thing: each round of new phrasings loses about a quarter of
recall.

## What it would take to reach the target (ASSUMED, not built)

1. A model second pass, OpenAI only (`CAREER_MODEL`, gpt-5-mini per D-002), on mail the rules call "other" when it comes
   from an ATS, an assessment vendor or an employer domain. It would need the same never-by-guess contract: kind plus the
   quoted phrase, checked in code against the snippet. That is one model call per such message; cost not measured.
2. A live labeled sample: the person's own consented mail, labeled once, to measure the real number. NOT_RUN.
3. The recruiter-reply and scam edges, which are the precision losses above.

## Not built in this order

- **Weekly digest**: not built (no build step asked for it). `standing()` and the events table hold what it would read.
- **Tracker write-back**: stages from mail live in `career_mail_events`, folded in by `foldEvents`. The thread's own
  `trackStore` is not rewritten, so the scheduled run never races a chat turn. `list_applications` still shows only the
  tracker; `where_do_i_stand` shows both.
- **Confirmation upgrade** of `career_apply_jobs.state` (submitted_unconfirmed to confirmed) stays with WO-015.
- **Replying to a follow-up text** ("send it"): the draft is shown; sending stays the person's own act, from their own mail.

## Live steps (owner)

Apply `20261020100000_career_mail_tracking.sql`, deploy `career-proactive` and `agent-chat`, set
`CAREER_MAIL_TRACKING=on`. Needs `GOOGLE_OAUTH_CLIENT_ID` and `GOOGLE_OAUTH_CLIENT_SECRET`, already used by `gmail-oauth`.
Optional (WO-040): `CAREER_MAIL_MODEL=on` on career-proactive, with `OPENAI_API_KEY` set, turns on the second pass. Without
the key the run reports `mail_model: NOT_WIRED` and the rules alone decide. All NOT_RUN here.
