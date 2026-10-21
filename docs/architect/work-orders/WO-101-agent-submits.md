# WO-101: the agent submits (batch approved up front, a receipt after each, a kill switch)

Status: built on wo/first-real-submission, all flags OFF (results below) · Flags: OFF (`agentSubmits` in extension/config.js; the owner's server
kill switch CAREER_AGENT_SUBMIT, anything but 'on' is off) · Owner: real submissions to real employers each need his
per-action word; nothing here fires one.

## Why
The owner (his words): "in retrospect the problem is that the agent should be submitting them. Not me, nobody should
manually do it. It's your personal career agent." The end state is agent-submits: the agent fills AND presses Submit.
Person-submits mode (built earlier, flag `personSubmits`, OFF) is not the target design.

Kept around it (coordinator's ruling, not the owner's words): the person approves which jobs (the batch) up front; a
receipt after each submission; a kill switch.

## The rule this must keep, and how
CLAUDE.md, rules that never move: "external effects (send, submit, message) need the user's approval of the exact
payload". Approving a list of job names would not meet it. So the batch approval is of the exact answers:
1. Prepare: each posting in the batch is read ahead in a hidden tab (the existing `surveyOne` reader) and planned from
   the person's confirmed facts and saved answers, exactly as the fill will plan it. A posting with any required question
   still open, any answer the planner cannot give, a verification, an identity field or an upload it does not have is
   NOT in the batch: it goes to the person's questions first (ask, never guess).
2. Approve: the person sees, per posting, every answer exactly as it will be sent, and approves the batch in one tap.
   The approval is stored per posting as the planned answers and their hash (label, value, source per field).
3. Send: when the queue reaches a posting, the extension fills it and builds the card as today. Code approves that card
   itself ONLY when the card's answers equal the batch-approved answers for that posting field by field, nothing is
   open, nothing was set by the page, and no verification shows. Then the existing send path runs unchanged (the
   unchanged-form check next to the click, the screenshot, the recorded start, the site's own Submit). Any difference:
   that posting stops and waits for the person (its card shows what differs); the batch goes on with the next.
Open for the owner to confirm: that a batch approval of exact answers meets the rule, as above. One case in particular,
found by the browser run: a field whose options exist only on the employer's page (a place search such as Lever's
"Current location", a dropdown widget such as Ashby's state list) cannot be read ahead without typing into the page.
The batch shows the person's answer ("Chicago, IL") marked "Trainee picks the employer's own entry for this from their
list"; at the send, the planner's answer must still be the approved one and the page value must be Trainee's own pick
(WO-042's chooser, which never picks what the planner would not), and the proof records the exact entry sent ("Chicago,
Illinois, United States"). If the owner reads the rule as the exact text, these postings instead wait for the person.

## The kill switch
- The owner's: CAREER_AGENT_SUBMIT in career_cloud_settings (the cloud kill switch's table); anything but 'on' is off.
  The start of an agent-approved application (career_apply_extension_begin_own with an agent approval) refuses while it
  is off, so no agent submit can start, whatever the extension does.
- The person's: "Stop applying" in the panel stops the queue at once, clears the batch approval, and refuses any agent
  start on this computer until they approve a batch again.

## The receipt after each submission
After each agent submission the person gets one line: the company, the role, the posting link, what the employer
answered (confirmed with an id, sent and waiting for their email, or not sent and why), and where the proof is. The
existing record (career_apply_finish_own) drives the receipt texts (WO-021, career_apply_receipts.ts); the panel lists
them too, newest first.

## Acceptance tests (written first, fail before the build)
- A1 batch planning is pure and deterministic: the same posting and facts give the same planned answers and hash.
- A2 a posting with an open required question, an identity field or a verification is left out of the batch, with why.
- A3 auto-approval only on an exact match: any field whose value, label or source differs, any extra or missing field,
  any "set by the page" answer, blocks it; an exact match approves it.
- A4 real Chromium, captured forms, flag on: a batch of two approved postings is submitted by the agent, one each, with
  no tap per card; a planted change after approval stops that posting and the next one still goes.
- A5 the person's "Stop applying" stops the queue before the next submit; nothing more is sent.
- A6 the owner's kill switch off: the start of an agent-approved application is refused (DB test).
- A7 flag off (shipped): nothing changes (the existing extension suite 54/54).
- A8 a receipt line per finished agent submission, with the posting link.

## Results (2026-10-21, local; nothing reached a real employer)
- A1-A3, A8 (tests/architect/wo-101-agent-submits.test.ts): 8/8, written first. VERIFIED.
- A6 (tests/db/career_apply_agent_submit.test.sql, migration 20261024090000, NOT applied anywhere): 25/25; full DB suite
  green on a local Postgres 16. VERIFIED.
- A2, A4, A5, A6, A8 in a real Chromium against the captured forms (tests/career-extension-agent-submits.test.cjs): 5/5.
  Prepare: 2 of 6 captures answered whole by the TEST persona, 4 left out with their exact open questions. A batch of 3
  approved in one tap: 2 Ashby postings sent by the agent (confirmed on the page), the Lever one changed after approval
  waits ('"Anything else we should know?" is new'), a receipt each. Stop applying: nothing more sent, approvals withdrawn.
  The owner's switch off: refused, nothing sent. VERIFIED.
- A7 flag off (shipped): extension suite 54/54, person-submits 4/4, architect 722/722. VERIFIED.
- The migration is listed in scripts/launch/trainee-go-live.sh (the repo's rule: every Trainee migration is), so it is
  applied only when the owner next runs go-live; applied, it is inert (no CAREER_AGENT_SUBMIT row reads as off).
- The full local gate: every step this container can run is green except the desktop apply engine's browser tests,
  which refuse to run without a browser sandbox (BROWSER_SANDBOX_REQUIRED; root here cannot give one) and fail the same
  67 on the commit before this work. CI's runner has the sandbox: NOT_RUN here.
- Real submissions: 0. Turning on agentSubmits or CAREER_AGENT_SUBMIT, and any real submission, is the owner's word.

## Out of scope
Turning any flag on; a real submission; the cloud worker; Workday; the 47 invented facts (D-007); mail confirmation.
