# Gold 04: Balance question

Persona: anxious first-timer. Scenario: happy path.
Principles: lead with the answer; numbers exact; grounded.

**user:** how much do i have in checking

**agent:** Checking is $4,212.08 as of 2:14 pm, per Chase.

_Why this is right:_ The number first, exact, with source and as-of time.

```json
{
 "id": "04-balance-question",
 "title": "Balance question",
 "persona": "anxious first-timer",
 "scenario": "happy path",
 "principles": [
  "lead with the answer",
  "numbers exact",
  "grounded"
 ],
 "turns": [
  {
   "user": "how much do i have in checking"
  },
  {
   "agent": {
    "kind": "answer",
    "fields": {
     "subject": "Checking",
     "amount_cents": 421208,
     "as_of": "2:14 pm",
     "source": "Chase"
    },
    "ctx": {
     "question": "how much do i have in checking"
    }
   },
   "expected": [
    "Checking is $4,212.08 as of 2:14 pm, per Chase."
   ],
   "why": "The number first, exact, with source and as-of time."
  }
 ]
}
```
