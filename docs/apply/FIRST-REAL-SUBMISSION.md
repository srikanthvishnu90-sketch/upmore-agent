# First real submission: status log (plan v2, owner's mission, 2026-10-21)

Mission (owner, verbatim summary): make real job applications happen for real people, end to end. The first real
submission must have (1) proper design: a tailored resume as good as a top candidate's own; (2) proper links: the real
posting link and real proof after (the employer's confirmation email or a receipt the user can see); (3) proper
questioning via the model: every question the application needs is asked of the user before anything submits; never
guess; zero wrong answers.

Order: first real submission (hand-assisted if needed) -> 3 per portal (Greenhouse, Lever, Ashby) proven by
confirmation email -> first real 60-in-30 assisted session -> extension-first apply path -> only then autonomous ->
side features (non-slop tailored resumes in real submissions; job alerts that reach a real user within minutes) ->
real cost per submitted application from the first one.

Binding rules: real artifacts only (posting links, confirmation emails), never harness counts; every claim labeled
VERIFIED or NOT_RUN; no paid runs, no deploys, no merges of #129/#137/#140, no submission automation, and no sends to
real people without the owner's explicit word. Blocked means said same day, with options.

## What the repo does today (read from trunk 9deee4e2; each line VERIFIED by reading the code, nothing run)
- The extension (extension/) runs on Greenhouse, Lever, Ashby and Workday pages, reads the form, plans answers from the
  person's answered questions plus an imported confirmed-facts file, fills them, and shows a card with every answer.
- WHO CLICKS SUBMIT: the extension does, after the person's one tap on "Approve and submit" (extension/content.js:540,
  after re-checking the form is unchanged, checking for a captcha, and taking a screenshot). Docs that say the person
  presses Submit (WO-042-sixty-in-thirty.md:6, BUILD-STANDARD-TSENTA.md:535) do not match the code.
- Unknown answers are never guessed: a required field the planner cannot answer from the person's facts becomes a
  question (career_apply.ts:781-786). Work authorization, sponsorship, salary, relocation have explicit rules; EEO and
  disability forms are never filled by the planner.
- The extension does not read the chat profile's facts, has no tailored-resume step (it attaches the file the person
  picks), and keeps its proof (screenshot, hashes, confirmation text) in the browser.
- Confirmation by the employer's email (career_apply_confirm.ts) is built but OFF (CAREER_MAIL_TRACKING); receipts text
  exists (career_apply_receipts.ts).
- Real confirmed submissions to date: 0. The only real attempt (Gusto, Greenhouse) stopped at Greenhouse's emailed
  security code (WO-096).
- Bot checks, in a server browser: invisible reCAPTCHA Enterprise on Greenhouse 38/38, invisible hCaptcha on Lever 29/29,
  reCAPTCHA on Ashby (gate census 2026-10-20). In the person's own browser these are theirs to clear.
- The 60-in-30 "12 wrong answers" were run 0 (shape mismatches: "2 weeks" in a date field, "No" as a referrer's name,
  "Chicago, IL" for a state ...), fixed by fitsField and new map rules; the latest simulated session is 60/60 with 0
  wrong (VERIFIED-S, simulated) and live fills on 17 real pages scored 100% precision, never sent.

## Plan for the first real submission (proposed; each step needs what it names)
1. The person: the real first user, named by the owner. Their facts come from them, in chat, never written into the repo.
2. The posting: one real, open posting on Lever, Ashby or Greenhouse that fits their goal (not Workday first). Link
   checked live before anything else.
3. Every question, before they start: read the posting's application form (the extension's reader on the live page, or
   the board's public posting API where it lists the questions) and put EVERY question to them in chat: identity and
   contact, work authorization, sponsorship, salary, relocation, start date, each custom question, and the voluntary
   self-ID questions (theirs to answer or decline). Nothing is filled from a guess.
4. The resume: tailored to the posting from their confirmed facts (career_tailor: truth audit, ATS parse check, PDF),
   read by them before use; they attach that file.
5. The send: in their own Chrome, through the extension. Proposed for the first runs: a person-submits mode (the
   extension fills and shows the card; the person reads the filled page and presses the employer's own Submit), so no
   click is automated until the owner says so. Built behind a flag, gate-tested locally.
6. The proof: the employer's confirmation email, which they forward or show; the extension's screenshot and the posting
   link go in the status log (no private data in the repo: company, role, link, date, and "confirmation received" only).
7. Cost: from this first one, every model call and minute counted.

## OPEN questions for the owner (NONE answered; nothing below is decided)
- Who the first real user is, and their yes to apply to a named posting.
- Person-submits mode for the first runs (recommended), or the extension's click after one tap.
- The 47 agent-invented facts in the owner's fact bank (D-007) are deleted before his facts are used (his data: his word).
- Mail confirmation stays OFF for now: proof is the email the person forwards; turning CAREER_MAIL_TRACKING on is a
  deploy/env change and his call.

## Status (newest first)
- 2026-10-21: person-submits mode built, OFF by default (extension/config.js personSubmits: false). With it on, the
  extension fills, shows the card and runs every check up to the click (approved hash, unchanged form, no verification
  showing, screenshot, the start recorded so the daily cap holds), then presses nothing; the person presses the site's
  own Submit, and that trusted press is checked against the approved card first. A changed form or a verification at the
  press stops it; no press in 20 minutes, or leaving the page, closes the start as not sent. Real Chromium against the
  captured forms (tests/career-extension-person-submits.test.cjs, a copy of the extension with the flag on): 4/4 pass,
  0/4 without the change (VERIFIED, local; nothing reached a real employer). The auto-click path is unchanged and not
  enabled or shipped by this work. Full regression suites: running (NOT_RUN until they finish). Real submissions: 0.
- 2026-10-21: lane opened on wo/first-real-submission from trunk 9deee4e2. Mapping the real apply path in the repo
  (extension, form planner, answer bank, approval cards, receipts, confirmation-email detection) before any change.
  Real submissions made: 0 (VERIFIED: no evidence of one in the repo or from the owner).
- 2026-10-21: map done (read-only, cited above). Plan and the owner's decisions written. Next, free and local: the
  person-submits mode behind a flag with gate tests; a form-question reader report for a chosen posting.
