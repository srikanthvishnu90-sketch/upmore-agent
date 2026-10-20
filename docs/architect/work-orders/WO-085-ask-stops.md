# WO-085: when the next move is the person's, code stops the tools

## Why: found by the live task battery (T09, run 8)
WO-079 made `tailor_resume`'s refusal name the drafts and the one question to ask, and say "Do not call another tool
this turn". The model still called `get_profile` and `add_profile_fact`, ran out of steps, and the person read "I
couldn't finish that in one go". A sentence in a refusal is advice; nothing held it.

## What changed
- **`loop.ts`.** `export class AskPerson extends Error`. When a tool throws it:
  - the model reads its message like any refusal;
  - the loop sends the next model call with `tool_choice: { type: "none" }` (the gateway maps it to OpenAI's
    `"none"`);
  - so the model must answer in words, and the turn ends on its question, not on max steps.

  The words stay the model's: no canned reply prose.
- **`career_tools.ts`.** `tailor_resume`'s no-confirmed-facts refusal (both the drafts-on-file and the nothing-on-file
  branches) throws `AskPerson`. Every other refusal is unchanged: the model may still try again with tools.

## Evidence
- `tests/architect/wo-085-ask-stops.test.ts`: 3 tests, all failing first (`AskPerson` did not exist). Test 1 uses a
  stubborn model that keeps reaching for tools unless the call forbids them, as the live model did. The turn ends
  `final` on the model's question; the call after the refusal carries `tool_choice: none`; `get_profile` is never
  called.
- `wo-079-tailor-ask` 2/2 and `wo-002-agent-loop`: unchanged and green.
- Architect suite: 632 passed, 0 failed.
- Edge suite: 135 passed.
- The router bundle is verified.
- To measure: T09 on the next battery run (VERIFIED-LIVE only from that run).

## Out of scope
Other refusals that mean "ask the person" (the confirmation refusal) can adopt `AskPerson` one at a time, each with a
battery case that shows the need.
