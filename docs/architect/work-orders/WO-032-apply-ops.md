# WO-032: apply operations: every application provable, the gate counted, apply by email, questions pushed

Status: built (branch `wo/032-apply-ops`) · Depends on: WO-021 (the queue and own worker), WO-022 (cards, the last-word
rule), WO-024 (mail tracking), WO-028 (tailored resumes, PR #49, merged), WO-030 (essay drafts and the fact-lock), ask once
· Migration: `20261021040000_career_apply_ops.sql`

## What it is
1. **The employer's email confirms an application, and nothing else does.** The scheduled mail run matches an employer email
   to one of the person's `career_apply_jobs` rows. It sets `confirmed`, `email_confirmed_at` and `confirmation_mail_hash`,
   and files the email's one evidence line (never a body) as that message's `career_mail_events` row, under `job:<id>`. That makes each application provable: the answers sent (the approved
   payload), and the employer's own confirmation.
2. **The PR #16 gate count.** `select * from career_apply_gate_status();` gives, per portal family, the hand submissions
   (source own_computer or extension) the employer's email confirmed, out of 3. The owner doc says how to read it.
3. **Apply by email.** Postings that say "email your resume to X" are found in ingestion. "apply by email to Acme" shows the
   whole email: to, subject, a body drafted only from confirmed facts through WO-030's fact-lock, and the resume attached
   (WO-028's, tailored to the posting, else the person's own file).
   "yes" sends exactly that email once, from the person's Gmail. It is tracked as an application (source `email`) and
   counted in the D-011 daily limit.
4. **The open questions are pushed.** The scheduled run texts the questions a preparation left open:
   - once per question, at most one such text a day, within quiet hours;
   - at most 5 per text, the rest counted;
   - as the thread's last word, so the numbered answers go to `questionsTurn`.
5. **Measured:** the captured postings' fully-ready rate before and after apply-by-email.

## Contract for WO-039
WO-039 pushed `20261021080000_career_apply_cloud.sql` while this was being built. This migration uses its names, so
whichever of the two applies first, the other changes nothing:
- `source`, with the same check;
- `email_confirmed_at` and `confirmation_mail_hash`, with the same constraint `career_apply_jobs_mail_confirm_check`;
- a claim takes only rows with `source is null`.

The contract:
- **`career_apply_jobs.source`** is one of `own_computer`, `extension`, `cloud` or `email`. It is null while a row waits.
  The claim that starts the drive sets it:
  - `career_apply_claim(p_now, p_limit)`, the service-role worker pool, sets `cloud` (WO-039's own claim does the same);
  - `career_apply_claim_own(p_limit)`, the person's computer, sets `own_computer`;
  - `career_apply_claim_own(p_limit, 'extension')`, new here, sets `extension`;
  - `career_apply_email_reserve_as` sets `email`.
- **A row reaches state `confirmed` only from an employer confirmation email matched to it.** The trigger
  `career_apply_confirmed_by_email` refuses `confirmed` on insert or update unless `email_confirmed_at` and
  `confirmation_mail_hash` are set.
  - The matcher's path is `career_apply_confirm_as(p_user, p_id, p_hash, p_kind, p_evidence, p_mail_at)`. It accepts a
    received email, or a rejection, interview or offer email, which prove receipt too. It sets both columns and files the
    message's `career_mail_events` row under `job:<id>`.
  - WO-039's `career_apply_confirm_by_mail` sets the same two columns together, so the trigger accepts it.
  - A page's "thank you for applying" is evidence, not confirmation. `career_apply_finish` turns a reported `confirmed`
    into `submitted_unconfirmed` with `evidence.page_confirmation = true`.
- **The gate** (`career_apply_gate_status`) counts exactly what WO-039's `career_apply_cloud_open` counts:
  - state `confirmed`, `source` own_computer or extension, `email_confirmed_at` set;
  - the message's `received` event (not flagged) filed under the application.

  A row confirmed by a rejection is confirmed, but it is not a confirmation email for the gate.
- **Rows confirmed before this migration** (a page alone) are left as they were. The gate never counts them, and the
  matcher may still upgrade one with its email.

**Checked against WO-039's branch.** WO-039 has since aligned: `career_apply_record_own` keeps a page-only confirmation
`submitted_unconfirmed`, and its migration leaves the outbox lists alone. Its migration and DB test at `23de03da` were
applied on top of this branch in a throwaway database (the script and log are not committed): every DB test passes,
WO-039's `career_apply_cloud.test.sql` included, with no change on either side. The gate's definitions are identical:
- the family is `career_apply_portal`'s (https only, the host, the four families);
- the count is `state = 'confirmed'`, `source in ('own_computer', 'extension')`, `email_confirmed_at` set, and the
  message's `received` event (not flagged) filed under the application.

**The outbox lists, in file order.** Trunk's `20261021050000_career_brief_digest.sql` (WO-034) comes after this file and
redefined the kind and key lists without `questions`, so in production it would have dropped them, and
`tests/outbox-kinds.test.cjs` failed.
- This migration keeps every kind on trunk: `alert`, `report`, `reply`, `receipt`, `card`, `status`, `followup`, `mock`,
  `brief`, `digest`, plus its own `questions`.
- I added `questions` to that later file's two lists, with a one-line comment. That is the only line of another order's
  migration this branch touches. It is safe while that migration is not yet live; it was not applied anywhere by me.
- `link` (#57) is not on trunk. Adding it here, in an earlier file, would make the later 050000 file "drop" it, so #57's
  own migration must keep `questions` and add `link`.

Two existing DB assertions changed for this contract, and only these two:
- `tests/db/career_apply_jobs.test.sql`, "all six final states persist": a reported `confirmed` now persists as
  `submitted_unconfirmed` with the page's evidence.
- `tests/db/career_apply_own.test.sql`, "A records the employer's answer": the same, and it also checks `source = 'own_computer'`.

No `tests/architect` file was edited.

## How
### 1. Confirmation (`_shared/career_apply_confirm.ts`, `runMail` in `career_proactive_run.ts`)
- **`planConfirmations(mails, queue)`** reads each new message once with WO-024's own `classifyMail`. A message confirms a
  row only when all of these hold:
  - its kind is `received`, `rejection`, `interview` or `offer` (the last three prove receipt too);
  - **`fromEmployer`** (new in `career_mail.ts`, tightened after the architect's review of `3c3d7560`) checks the sender:
    - **An ATS sender** counts only from the ATS's own registrable domain: `greenhouse-mail.io`, never `greenhouse.xyz`
      or `greenhouse.com`. It must name this employer, by its display name or words, or by a tenant address
      ("jpmc@myworkday.com").
    - **Never a scheduling or e-signature sender:** DocuSign, Gem and GoodTime are out of the confirming set.
    - **The employer's own domain.** When the application link is on the employer's own site, the sender's registrable
      domain must equal it (`acme.co.uk`, so `acme.com` is not Acme's). Otherwise the label must be the name exactly or
      a listed alias, on a common corporate TLD. There is no "careers"/"jobs" suffix rule (`stripecareers.com` and
      `stripejobs.net` are the scam pattern), and no other TLD (`stripe.xyz`).
    - **The application link** counts only for its ATS path slug or Workday tenant, never the ATS host's own name.
    - A personal address, a job board or an assessment vendor never confirms, whatever the display name says;
  - the posting title, where both the message and the row have one, shares words (`roleOverlap >= 0.5`);
  - the row was submitted (`claimed_at`, else `created_at`) within the 14 days before the email;
  - the row is `submitted_unconfirmed`, `unknown_outcome`, or a pre-WO-032 `confirmed` without email evidence.
- **One fit:** `career_apply_confirm_as`. The database checks the owner, the window and the once-only again. It sets
  `email_confirmed_at` and `confirmation_mail_hash`, and files the message's `career_mail_events` row (its evidence line)
  under `job:<id>`, writing it if WO-024's looser status match left it unfiled. The same message again returns
  `already`; another email never rewrites a confirmation.
  - A `received` that confirms sends one text, keyed `status:confirmed:<id>`: "Applied to Stripe: confirmed by Stripe's
    email on Oct 20." plus the posting link.
  - The receipt text (`career_apply_receipts.ts`) says the same for a row confirmed by email.
  - A page's "thank you" is said as what it is.
- **Two or more fit:** nothing is confirmed. The ask waits on the account (`career:confirm-ask:<hash>`, written once).
  - `runAsks` texts it once, outside quiet hours, as the thread's last word (intent `career_apply_confirm_which`).
    `career_apply_confirm_ask_push_as` refuses while the thread waits on something else.
  - `confirmWhichTurn` (wired in `handler-career.ts`) takes "2" or "neither" only while that ask is the last word.

### 2. The gate (`career_apply_gate_status()`)
- Service role only. Families: greenhouse, lever, ashby, smartrecruiters, other (as `career_apply_portal`). It counts as WO-039's
  `career_apply_cloud_open` does (see the contract).
- Columns: `confirmed`, `needed` (3), `met` and `awaiting_email`.
- Owner doc: `docs/apply/owner-first-trials.md`, "How close is the gate". Runs of `scripts/apply.ts` alone are not in
  the queue, so the doc tells the owner to record those by hand.

### 3. Apply by email
- **Detection** (`_shared/apply_email.ts`, called by `boardFetchFeed`, stored in `career_postings.apply_email`). It finds a
  sentence that tells applicants to email or send their resume, CV, cover letter or application to an address. On a
  posting with no ATS form, it also accepts a sentence about applying that names an address. It skips sentences about
  accommodations, questions, privacy, scams, agencies or "do not send", and no-reply addresses.
- **The card** (`_shared/career_apply_email.ts`, `emailTurn`). The body comes from WO-030's `draftEssay`, so:
  - only confirmed facts are used;
  - the employer's AI policy is read first, from the posting's own sentences;
  - every name and number must trace to a fact or to the posting (`factLock`);
  - a draft that fails is written again once, then refused;
  - the length is met by rewriting, never by cutting.

  Code adds the greeting, "My resume is attached." and the person's name. The whole email is shown. It waits on the
  account (`career:email-card`, cleared by an erase).
- **The yes.** It counts only while the card is the thread's last word, for a day. In order:
  1. The payload hash is recomputed.
  2. The Gmail grant is checked; without `gmail.send` the reply is NOT_WIRED and nothing is reserved.
  3. The resume file must be the one on the card.
  4. `career_apply_email_reserve_as` takes the yes only for the hash on the card. It applies the daily limit (25, up to
     50), one per posting and one per company per 30 days. It inserts the tracked row as a lease (`driving`, source
     `email`).
  5. `sendMail` (`career_mail_gmail.ts`, the same `careerToken` with the send scope) sends the email.
  6. `career_apply_email_finish_as` records sent (`submitted_unconfirmed`), refused (`not_submitted`) or unknown
     (`unknown_outcome`, never resent).
- **Edits.** "subject: ..." or "body: ..." shows the whole email again with a new hash, and needs a new yes. An edit
  that lands after the yes makes the database refuse (`changed_since_yes`).
- **Which card a yes is for** (architect review):
  - Each card shown has an id. The reply that shows it writes that id into the thread's last word (`meta.email_card`
    with intent `career_apply_email`). A yes counts only when the last word names the card waiting on the account.
  - A new "apply by email to ..." first declines any card still waiting.
  - A preparation that cannot attach a resume answers `no_resume`, starting "NOT_WIRED:". It leaves nothing waiting
    and writes no email intent.
- **A send Gmail refused** (nothing went) is recorded `not_submitted`. The same email is shown again as a new card, and
  a fresh yes sends it under the same tracked application: the reserve reuses that one row, keeps the refused attempt in
  its evidence, and it still counts in the daily limit. An unknown outcome is never sent again.
- **The card warns in one line** when the address is not on the employer's domain ("This address is not on X's domain;
  check it against the posting.").
- **One recipient, no Cc, no Bcc.** Both the MIME builder and the reserve enforce it.
- **The attachment.** PR #49 (WO-028) merged during this order, so the resume is WO-028's, tailored to the posting:
  - `tailorForPosting` builds it from confirmed facts, checks it (truth audit and ATS parse) and stores it privately at
    `career-resumes/<user>/<sha256>.pdf`;
  - if that refuses, the person's own file is attached (`career:resume-file` names an object in the same bucket);
  - neither: NOT_WIRED.

  At the yes, the file on the card is read back by its hash and checked byte for byte. The payload carries
  `resume_sha256` and `resume_tailored`, so WO-028's trigger tags the tracked application tailored or not.
- **Receipts:** the scheduled receipts skip `source = 'email'` rows; the chat already said "Sent".

### 4. Questions pushed (`runQuestions`, `career_apply_questions_push_as`)
- The text comes from the same `questionsText` formatter: at most 5, "N more after these".
- Only open questions with `pushed_at` null are pushed, once the preparation has settled (10 minutes) and outside the
  person's quiet hours.
- The database adds, in one transaction:
  - a texting thread and no STOP;
  - at most one `questions` text a day;
  - a thread not busy (`career_thread_busy`: an open card, a reply in the last 30 minutes, or a prompt as the last word
    in the last 24 hours);
  - every question still open and never pushed;
  - the text carrying every question's wording.
- A label is compared with the text after `career_text_spaces`: the no-break and other Unicode spaces become plain
  spaces, as JavaScript's `\s` does in the formatter. A text that does not carry every question returns false; it
  never raises, which would fail the run every 5 minutes.
- It writes the assistant message with intent `career_apply_questions` and the same `career:questions-shown` record that
  "what do you need from me" writes, so "1 no 2 next month" goes to `questionsTurn`. That is the card push's method.
- The outbox kind list keeps every earlier kind (`alert`, `report`, `reply`, `receipt`, `card`, `status`, `followup`,
  and PR #52's `mock`) and adds `questions`.

## Tests
- `tests/architect/wo-032-apply-ops.test.ts`, 23 tests:
  - C1: a match;
  - C2: a scam "received" from another domain, including every lookalike from the review: `greenhouse.xyz`,
    `greenhouse.com`, `stripecareers.com`, `stripejobs.net`, `stripe.xyz`, `lever.xyz`, `ashbyhq.net`,
    `myworkdayjobs.xyz`, `lever.com`, DocuSign, Gem, GoodTime;
  - C7: what must still confirm: Greenhouse's mail domain naming the employer, stripe.com, an alias, a Workday tenant,
    the employer's own site. `acme.com` is refused when the site is `acme.co.uk`, and an ATS sender naming another
    employer is refused;
  - C3: window misses and a title mismatch;
  - C4: ambiguity: asked once, answered by number;
  - C5: idempotence, plus the receipt text, dated in the person's time zone;
  - C6: a rejection confirms;
  - E1: detection;
  - E2: the fact-lock;
  - E3: no send without the yes;
  - E4: an edit after the yes needs a new yes;
  - E5: the daily limit;
  - E6: NOT_WIRED;
  - E7: one recipient, no Bcc, the Gmail request;
  - E8: the tailored resume is attached, and only a file byte for byte the one on the card goes;
  - E9: a new apply request replaces the card, and a prepare-time NOT_WIRED leaves nothing waiting;
  - E10: the yes is bound to the card id;
  - E11: a refused send is shown again and sent on a fresh yes;
  - E12: the off-domain warning;
  - Q1: once a day, 5 a text, the rest counted;
  - Q2: nothing answered re-asked;
  - Q3: the intent is set, and the numbered answer routes;
  - Q4: quiet hours.
- `tests/db/career_apply_ops.test.sql`, 47 checks. The migration is applied twice in `tests/db/run.sh`. It covers:
  - sources and the trigger;
  - the window and idempotence;
  - the evidence filed in `career_mail_events`;
  - the gate;
  - the reserve: the hash, no BCC, one recipient, an edit, the daily cap, one send;
  - questions pushed once a day as the last word;
  - a refused send tried again on the same row;
  - a no-break-space label pushed;
  - a text missing a question returning false;
  - the ask.

## Planted defects (each one line, each reverted)
| # | Defect | Failing test |
|---|---|---|
| D1 | the sender's domain is not checked (`fromEmployer` → `true`) | WO-032/C2 (and C1) |
| D2 | the window is 140 days | WO-032/C3 |
| D3 | an ambiguous email confirms the first fit (`=== 1` → `>= 1`) | WO-032/C4 |
| D4 | a yes counts without the email card being the last word | WO-032/E3 |
| D5 | an edit keeps the old approval hash | WO-032/E4 |
| D6 | the sent email carries a Bcc | WO-032/E7 |
| D7 | answered questions are pushed again | WO-032/Q2 |
| D8 | an accommodations or agency address counts as an apply address | WO-032/E1 |
| D9 | the questions push ignores quiet hours | WO-032/Q4 |
| D10 | SQL: an emailed application is not counted in the daily limit | career_apply_ops.test.sql "an emailed application counts in the daily limit" |
| D11 | SQL: a page's "thank you" confirms the row (`st := p_state`) | career_apply_jobs.test.sql (the trigger refuses it) |
| D12 | SQL: questions pushed more than once a day | career_apply_ops.test.sql "at most one questions text a day" (fails on the outbox's once-only key) |
| D13 | SQL: the gate counts the cloud's submissions | career_apply_ops.test.sql "Greenhouse: 0 of 3 (the cloud's does not count)" |
| D14 | the ATS host's own name counts as the employer's (`urlSlugs` in `fromEmployer`) | WO-032/C2 |
| D15 | the careers/jobs suffix counts (`sameCompany` on the domain label) | WO-032/C2 |
| D16 | any TLD counts (no `CORPORATE_TLD` check) | WO-032/C2 |
| D17 | DocuSign, Gem and GoodTime confirm | WO-032/C2 |
| D18 | a new apply request leaves the old card waiting | WO-032/E9 |
| D19 | the yes is not bound to the card id | WO-032/E10 |
| D20 | a prepare-time NOT_WIRED stays waiting | WO-032/E6, E9 |
| D21 | a refused send is not shown again for a fresh yes | WO-032/E11 |
| D22 | SQL: a refused send stays a duplicate forever | career_apply_ops.test.sql (`duplicate_job` on the retry) |
| D23 | SQL: labels compared without the no-break space normalized | career_apply_ops.test.sql "a label with a no-break space is pushed" |
| D24 | SQL: a text missing a question raises | career_apply_ops.test.sql (raises instead of returning false) |
| D25 | the confirmation date ignores the person's time zone | WO-032/C5 |
| D26 | no warning when the address is off the employer's domain | WO-032/E12 |

All of D1 to D26 were re-run against the final code; each fails its test. D4 needed one more assertion in E3: a last
word that names the card but is not the email's own intent sends nothing.

## Measured
`deno run --allow-read evals/apply/email-apply-coverage.ts` (VERIFIED, offline, 2026-10-20):
- Captured forms: 199. The repo holds posting text for 16 of them.
- Fully ready before (by form, fill-coverage's synthetic TEST persona): **90/199 (45.2%)**.
- Fully ready after (by form or by email): **90/199 (45.2%)**. Ready only via apply-by-email: **0**.
- Posting texts scanned (`tests/fixtures/forms-ci/*.html` and the public snapshots): 52. Asking for an emailed
  application: 0.
  - Every address in them is for accommodations (SpaceX, Harvey, Oscar, Pariveda, EOS), fraud reports (Anduril,
    Linear), agency partnerships (Jane Street) or a no-reply.
  - The detector rightly skips all of them.

Why it does not move: every captured posting comes from an ATS board (Greenhouse, Lever, Ashby), which has its own form.
Apply-by-email helps postings outside those boards, and ingestion reads none of those yet. The "13% fully ready" in
`docs/product/BUILD-STANDARD-TSENTA.md` is REPORTED; it was taken with a different persona and is not this measure.
The model's draft of the email body is NOT_RUN here (stubbed in tests).

## Not built
- **Uploading the person's own resume file.** The tailored resume (WO-028) covers anyone with confirmed facts and a name
  and email. The fallback file (`career:resume-file`) has no uploader yet, so without a tailored resume the card answers
  NOT_WIRED with the one-line ask.
- **A brain tool or a proactive push for email cards.** The person asks ("apply by email to Acme"). Search results do
  not flag email postings yet.
- **Live sends.** Gmail send was run only against a fake Gmail. The first live send is the owner's, with his career
  grant (`gmail.send` is already in `start_career`).
  - The career build's outreach module (124) stays SEND_DISABLED, as ruled on 2026-10-13. This sends only an application
    the person approved word for word, as this order asks.
- **A questions push for a misfit question reopened after it was pushed.** It is shown on "what do you need from me"
  only, not pushed again.
- **Confirming tracker rows** (applications the person made by hand and told Trainee about). Only `career_apply_jobs`
  rows are confirmed; WO-024 already tracks the tracker's stage from mail.
