# WO-101: the agent submits (batch approved up front, a receipt after each, a kill switch)

Status: in build on wo/first-real-submission · Flags: OFF (`agentSubmits` in extension/config.js; the owner's server
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
Open for the owner to confirm: that a batch approval of exact answers meets the rule, as above.

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

## Out of scope
Turning any flag on; a real submission; the cloud worker; Workday; the 47 invented facts (D-007); mail confirmation.
