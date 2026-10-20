# WO-034: the pre-interview brief, the weekly digest, no dropped follow-ups

Branch `wo/034-brief-digest`. Migration `20261021050000_career_brief_digest.sql`.

## Targets (owner, verbatim)
- "Pre-interview brief (interviewer backgrounds, questions that company asked in the last 12 months, 10-point prep plan) within 1 hour of the user forwarding the invite."
- "Weekly digest and on-demand 'where do I stand with JPMorgan?' over text."
- "Zero dropped follow-ups: no response in 2 weeks produces a drafted follow-up; ghosted after interview produces a thank-you + nudge."

## What was built

1. **Invite to brief, in the same run** (`_shared/career_invite.ts`, `career_proactive_run.ts` `runMail`).
   - When the mail run records a new `interview` event (matched to one of the person's applications, as WO-024 requires),
     `extractInvite` reads what the email states from its subject and snippet. It reads company, role, date, time, zone,
     format, and interviewer names with titles. It reads nothing else and guesses nothing:
     - a date with no year resolves only to its next occurrence within 120 days, and only if a stated weekday fits it;
     - 03/04/2027 is not read (it could be either order);
     - a time needs am/pm or a 24-hour form past noon;
     - a zone abbreviation counts only right after a time, so "Stamford, CT" is not a zone;
     - two offered dates or a "between 2 and 4 pm" window are said back as written and never picked;
     - `starts_at` exists only when the date, time and zone are all stated (a DB constraint holds this too).
   - In the same run, right after the status text, the brief is queued as two plain texts: `brief:<message hash>:1` and `:2`.
     - Text 1: the invite's facts; who the person meets; questions the company asked in the last 12 months; question
       patterns from the company record with source labels, or else from the role's bank, labeled "about the role, not
       about <company>".
     - Text 2: the 10-point plan from `brief()` (WO-025).
   - At most one brief per application a week (a reschedule is stored, not re-briefed).
   - The row (`career_interviews`) records `mail_at`, `seen_at`, `brief_at` and `brief_ms`, the time from the email's
     arrival to the brief being queued. The run records `briefs` and `brief_ms_max`.
   - **Interviewers:** the brief says only what the invite says, and always "I only know what the invite says about who
     you're meeting." The rule is written at the top of `career_invite.ts` (`INTERVIEWER_LOOKUP = "never"`):
     - no LinkedIn;
     - no People Data Labs (D-018) or any other people search, even with a key set;
     - no fetch, key or lookup anywhere on the brief path.
   - **Questions asked in the last 12 months:** only questions a record lists one by one, each with its own source and
     its own date inside 365 days. A record's `as_of` is when it was checked, not when a question was asked, so it never
     dates one. No record on file lists questions that way today, so every brief says "none on file".
   - **Pasted invites:** the brain tool `brief_from_invite(text)` (`write_own`, pinned in
     `tests/architect/wo-002-career-tools.test.ts`) gives the same brief from the same extractor.
     - It refuses text that is not in the person's message this turn, so the model cannot brief an invite it wrote.
     - It returns `is_invite: false` for anything that is not an invite.
     - It keeps the interview (`source = chat`, matched to an application only when exactly one is at that employer) for
       its thank-you, its nudge and the digest.
2. **Weekly digest** (`_shared/career_digest.ts`, `runDigest`). It is checked once an hour (the first 5 minutes of each
   hour) and queued for each person whose day it is, once their hour has come (default Sunday 18:00 in their zone).
   - It is keyed `digest:<ISO week>`, so it goes once a week. A digest hour inside quiet hours waits for them to end.
   - It is built only from rows:
     - applications sent this week by source (through Trainee by board, logged by the person, found in mail);
     - confirmations;
     - status changes, from mail and from what the person told Trainee;
     - interviews coming up, each with its application link bare on its own line;
     - drafts waiting to be sent;
     - job alerts sent;
     - one response-rate line with counts ("too few to read much into" under 10).
   - It stays under 1,500 characters; a list that does not fit says "and N more; ask me for the rest."
   - Nothing on file means nothing is sent.
   - `set_weekly_digest` (`write_own`, pinned) turns it off or on and sets the day, hour and zone in chat. It says when
     the hour falls in quiet hours. Settings are kept in `career_digest_prefs`.
3. **Thank-you and nudge after an interview** (`interviewDrafts`, `runInterviewDrafts`).
   - WO-024 had only the 7-day "thank-you and nudge", counted from the invite email. It had no thank-you right after the
     interview. Both are added for interviews with a stated date:
     - the thank-you is due 90 minutes after a stated start, or at the end of the interview day when only the date is
       known, and is drafted only within 24 hours of that;
     - the thank-you and nudge comes 7 quiet days after the interview itself, not the invite, and not if the employer
       wrote since;
     - neither is drafted for a closed application or one at Offer.
   - The mail planner's own nudge steps aside for a dated interview, so there is one nudge, not two.
   - An interview the person reported in chat (a tracker `manual_update` to Interview rounds) now counts as one, so
     "ghosted after interview" covers it too.
   - Drafts are stored once (`career_mail_drafts`; a pasted invite with no application is `invite:<key>`) and offered in
     full by text. Trainee never sends them.
4. **Where do I stand.** `standing()` keeps its WO-024 `text` and adds `history`: each stage with its date and source
   (`Trainee`, `tracker` or `mail`). `where_do_i_stand` returns it, and its description tells the model to say it.

Wiring:
- `career-proactive` runs all of this only with `CAREER_BRIEF_DIGEST=on`, which the owner sets after the migration.
  Briefs from mail also need WO-024's `CAREER_MAIL_TRACKING=on`.
- The chat passes `supabaseInterviewStore` and `supabaseDigestStore` to the tools.
- The migration is in `tests/db/run.sh`: the ledger applies it first in file order, then it is applied twice more, then
  `career_brief_digest.test.sql` runs.
- It is also in the `trainee-go-live.sh` lists (mark: `career_host_commit` mentions `career_interviews`) and in
  `TRAINEE-GO-LIVE.md`.
- Both tables are in the export fixture and `EXPORT_TABLES` (app rebuilt).
- The erase (`career_host_commit`) is 20261020120100's plus two deletes. Test B16 proves it.
- The outbox kind and key lists keep every earlier kind, `mock` (PR #52) included, and add `brief` and `digest`.

## Tests
`tests/architect/wo-034-brief-digest.test.ts` (16 tests) and `tests/db/career_brief_digest.test.sql` (24 checks).

| Test | Holds |
|---|---|
| B1 | the extractor reads stated facts: company, role, date, time, zone, start, format, names and titles; a forwarded invite's own Date: line is ignored |
| B2 | never a guess: no time, a 10:30 with no am/pm, no zone, two dates, a window, a weekday that does not fit, a far date with no year, an ambiguous numeric date, "tomorrow", "CT" in an address, a team or a company as a person |
| B3 | the brief: two plain texts under 1,500, the invite's facts, the interviewer line, the record with sources, the 10-point plan; the role bank labeled as the role's |
| B4 | last-12-months questions: sourced and dated within 365 days only; today's records list none |
| B5 | an invite read by the mail run is briefed in the same run, kept, `brief_ms` recorded, never twice |
| B6 | offline worst case: an invite arriving 1 s after a run is briefed by the next run, 4 min 59 s later |
| B7 | no interviewer lookup: no fetch beyond the person's own mail, even with a PDL key set; no people-search source or key read on the brief path |
| B8 | `brief_from_invite`: refuses text not pasted, refuses a non-invite, the same brief as mail, kept as a chat interview |
| B9 | the thank-you: not during the interview, 90 min after a stated start, not after 24 h; date only: the next morning; none after a rejection |
| B10 | the thank-you and nudge 7 quiet days after the interview, not if the employer wrote; the mail nudge steps aside; a tracker-reported interview counts |
| B11 | the run drafts the thank-you once, offers it in full, sends nothing |
| B12 | the digest from rows only (exact text): this week only, by source, links on their own line; nothing on file means none; overflow offers the rest |
| B13 | the digest once a week at the day and hour, the hourly check, after quiet hours, never when off |
| B14 | `set_weekly_digest`: off, on, day, hour, zone, the quiet-hours note; refuses a non-day, a non-hour, a non-boolean |
| B15 | where do I stand: each stage with its date and source |
| B16 | the erase is 20261020120100's plus two deletes; every outbox kind and key stays |

## Planted defects (each one line, each caught, each reverted)

| # | Defect | Failing test |
|---|---|---|
| D1 | the extractor guesses 09:00 when no time is stated | WO-034/B2 |
| D2 | a date takes a later year that its weekday fits | WO-034/B2 |
| D3 | the brief looks the interviewer up on People Data Labs | WO-034/B7 |
| D4 | the brief waits for a later run | WO-034/B5 |
| D5 | the thank-you is drafted while the interview is still going (no 90-minute wait) | WO-034/B9 |
| D6 | the digest counts every application on file, not this week's | WO-034/B12 |
| D7 | the digest is keyed per hour, not per ISO week | WO-034/B13 |
| D8 | the digest ignores quiet hours | WO-034/B13 |
| D9 | `brief_from_invite` briefs text the person never pasted | WO-034/B8 |
| D10 | where-do-I-stand says every stage came from mail | WO-034/B15 |
| D11 | the mail planner's nudge does not step aside for a dated interview (two nudges) | WO-034/B10 |

## Measured
- VERIFIED (B6, `deno test -A --no-check tests/architect/wo-034-brief-digest.test.ts`): offline, an invite that arrives
  1 s after a run is briefed by the next 5-minute run: 4 min 59 s from arrival to the brief being queued. That is the
  worst case while the person is in that run's mail batch.
- ASSUMED: the mail run reads the least recently read 200 people per run (WO-024 `MAIL_PEOPLE_PER_RUN`), so the worst
  case is ceil(N / 200) x 5 minutes. The 1-hour target holds up to 2,400 people with the mail grant; past that, the batch
  must grow.
- ASSUMED: an invite read during quiet hours is briefed in that run, but the text is delivered when quiet hours end.
- VERIFIED (scratch script over all 33 company records x 5 roles, 165 briefs): longest text 1 is 854 characters, longest
  text 2 is 975. Patterns came from the company record in 150 briefs, from the role bank in 9, and from neither in 6.
- VERIFIED: B5, B6, B12 and B13 hold, over synthetic data only.
- NOT_RUN: how many real invites state a date, time and zone in the subject or snippet.
- NOT_RUN: delivery over the live channel.

## Not built, and why
- **Interviewer backgrounds beyond the invite.** Never automate LinkedIn, and named interviewers are not enriched through
  PDL (privacy line). The brief says what the invite says and no more.
- **Questions from the last 12 months.** No record on file lists dated, sourced questions, so every brief says "none on
  file". The reader is in place for records that add `reported_questions` with `asked_at` and a source.
- **Invite bodies.** Mail tracking reads From, Subject and Gmail's snippet only (WO-024's privacy line), so a date or
  name that appears only further down the email is not read. The brief then says the invite states no date, and the
  pasted invite covers it.
- **An invite for an application Trainee does not know about is not briefed from mail.** WO-024's rule stands: an
  interview email about nothing the person applied to is never texted, because of scams. A pasted invite is briefed.
- **An erase does not clear `career_mail_events` or `career_mail_drafts`.** That is a WO-024 gap and is left to its own
  order. This order's tables are cleared.
- **No deploy, no live migration.** The owner applies the migration through go-live and sets `CAREER_BRIEF_DIGEST=on` on
  career-proactive.
