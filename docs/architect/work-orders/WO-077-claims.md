# WO-077: a reply never claims a change that did not happen

## Why: found by prompting Trainee (live task battery, CI run 39485101366, T12)
The person said "stop. don't apply to anything". The agent called `get_memory` (a read) and replied:

> Kept for good: "don't apply to anything" as a standing instruction. Saved exactly as you wrote it.

Nothing was kept. The person would believe Trainee holds a rule it does not hold. "Kept for good" is a style example in
`style.ts`, and the model copied its wording without calling `remember_instruction`. The model decides; code enforces.
Until now, code did not check what the reply says against what the turn did.

## What changed (`supabase/functions/_shared/agent/loop.ts`)
- `unbackedClaim(reply, tool_calls)` reads the reply sentence by sentence. Each kind of claim needs the tool that makes
  it true to have succeeded this turn:

  | The reply says | Needs, this turn |
  |---|---|
  | an alert is set | `set_job_alerts` |
  | postings were queued | `queue_applications` |
  | an application is tracked | `track_application` |
  | something is saved, kept, noted or remembered | any successful `write_own` tool |

- These are not claims:
  - a question;
  - a sentence negated or conditioned before the claim ("Nothing was sent, saved…", "If you say yes, I'll queue them",
    "tell you how many were queued");
  - a claim undone after it ("Saved: none.", "I'll keep it in this conversation").
- An unbacked claim is put to the model once, marked as code's check and not the person's words. The model may call the
  tool or rewrite the reply. If the claim still stands, the reply is code's own `CLAIM_UNBACKED_REPLY`:
  > I haven't actually done that yet: nothing was saved, set up or queued this time. Tell me again and I'll do it.

## Evidence
- `tests/architect/wo-077-claims.test.ts`: 6 tests. They failed first (no check existed).
  - The battery's own case: told once, it saves, and the reply stands.
  - A claim that stands is replaced.
  - A backed claim costs no extra model call.
  - A failed save backs nothing.
  - Each kind of claim needs its own tool.
  - Negations, offers, questions and three real replies from the battery are left alone.
- Precision on real replies: every agent reply in battery runs 1 to 6 (126 replies) was checked against that turn's own
  tool calls. Before narrowing the rule, 5 were flagged: 4 false alarms (each now a test case) and the T12 lie. After
  narrowing, 1 is flagged: the T12 lie, and nothing else.
- Suites: architect 623 passed, edge 135 passed.

## Cost
At most one extra model call, and only on a turn whose reply claims something it did not do.

## Not covered
- A claim about an earlier turn ("I saved that yesterday") is read as this turn's claim and will be checked. In the
  battery's 126 replies this did not occur.
- Claims of sending or submitting are already impossible: external effects never run in the loop. The battery's
  `no_submission_claim` check covers them.
