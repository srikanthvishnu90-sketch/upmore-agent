# INTENTS: what a person's message is taken to mean (packet added for G4)

`packages/domain/35-agent-intents.js` decides whether a chat message hands the agent a task ("cancel my Netflix for me")
or asks the Guide a question ("how do I cancel Netflix?"), which task it is (stop everything, the log, the limits, the
catalog, the bills list, a payment to review, one of the dispute and request letters, a cancellation and what it
cancels), and whether a message is about the person's own records (`personalFinancialRequest`). In
`supabase/functions/agent-chat/handler.ts` a bills workflow and every personal-records message go to the financial
planner, never to a cached finance fact; `AgentVoice.classify` (`46-voice.js`) reads a match as an action. When in
doubt it returns null: a missed hand-off costs one extra tap, a wrong one hijacks a question.
Check: `node --test tests/depth-INTENTS.test.cjs && node evals/depth/run.cjs INTENTS`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S14 (found here): a request not to do something was read as the request to do it. "please don't cancel my netflix"
  matched the cancellation ("I'll set up cancelling netflix"), "can you not cancel my gym" likewise, and "please don't
  pay my rent" matched the payment workflow, which sends the message to the financial planner as a payment request. A
  negated request is now no task ("please don't forget to pay my rent" still is). D14 drops the negation check.
- S15 (found here): cancelling a payment, a transfer or an order was read as a subscription cancellation: "cancel my
  payment to mike" answered "I'll set up cancelling payment to mike", "please cancel my limit order" likewise. Those
  belong to the flow that staged them; the subscription hand-off now leaves them alone. D15 drops the exception.

Noted, not changed: `explains` (a question with no request word) can never be true while `asks` is, because the
imperative and question words are both anchored at the start and do not overlap; the question check is kept as a
second guard, and S02 proves the start anchor that does the work.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | A task needs a request | a remark about cancelling Netflix is not a hand-off | `S01` in tests/depth-INTENTS.test.cjs | every message is read as a request | proven (also fails S02) |
| S02 | A question stays a question | 'so how do i cancel netflix' is not a hand-off | `S02` in tests/depth-INTENTS.test.cjs | a task verb anywhere in the message reads as an order | proven (also fails S01) |
| S03 | A question that asks for the work | 'is it possible to cancel my gym for me' hands it over | `S03` in tests/depth-INTENTS.test.cjs | a message that starts like a question is never a request, even with 'for me' in it | proven |
| S04 | Stop needs no request | 'turn off everything' stops everything | `S04` in tests/depth-INTENTS.test.cjs | stopping everything needs a request like any task | proven |
| S05 | The log opens on a question | 'what have you done' opens the action log | `S05` in tests/depth-INTENTS.test.cjs | the action log needs a request like any task | proven |
| S06 | Charged after cancelling | 'charged me after i cancelled' is a dispute | `S06` in tests/depth-INTENTS.test.cjs | only the word cancel is read, not cancelled | proven |
| S07 | Charged twice, either way round | 'charged twice' is a duplicate-charge dispute | `S07` in tests/depth-INTENTS.test.cjs | only 'twice' before the charge is read | proven |
| S08 | A late charge is a late fee | 'waive the late charge' is a waiver request | `S08` in tests/depth-INTENTS.test.cjs | only the words 'late fee' are read | proven |
| S09 | The deposit letter | 'my landlord won't give my deposit back' is a deposit demand | `S09` in tests/depth-INTENTS.test.cjs | only the words 'security deposit' are read | proven |
| S10 | Upmore never places the call | the negotiation offer says the person makes the call | `S10` in tests/depth-INTENTS.test.cjs | the offer says the agent will call | proven |
| S11 | What do I owe | 'what do i owe' lists the bills | `S11` in tests/depth-INTENTS.test.cjs | the bills list needs a request like any task | proven |
| S12 | Pay X is a review | 'pay comcast' is the payment workflow | `S12` in tests/depth-INTENTS.test.cjs | only 'pay' followed by rent, bills or loans is read | proven |
| S13 | Earning to pay is not paying | 'earn money to pay rent' is not a payment | `S13` in tests/depth-INTENTS.test.cjs | the earn-to-pay exception is dropped | proven |
| S14 | Don't means don't | 'please don't cancel my netflix' is no task | `S14` in tests/depth-INTENTS.test.cjs | a negated request is read as the request (the bug found building this packet) | proven |
| S15 | A payment is not a subscription | 'cancel my payment to mike' is not a subscription cancellation | `S15` in tests/depth-INTENTS.test.cjs | any cancel is a subscription cancellation (the bug found building this packet) | proven |
| S16 | Never a pronoun as the target | 'cancel it' names nothing | `S16` in tests/depth-INTENTS.test.cjs | it, that and everything are taken as names | proven |
| S17 | How-to is not personal | 'how do i start a budget' is not about the person's records | `S17` in tests/depth-INTENTS.test.cjs | the how-to exception is dropped | proven |
| S18 | My refunds and fees are personal | 'i was charged twice by netflix' reads the person's records | `S18` in tests/depth-INTENTS.test.cjs | refunds, fees, duplicate charges and holds are not personal words | proven |
| S19 | A pasted page is not a hand-off | a 400+ character paste is no task | `S19` in tests/depth-INTENTS.test.cjs | the length cap is 4000 | proven |
<!-- results:end -->
