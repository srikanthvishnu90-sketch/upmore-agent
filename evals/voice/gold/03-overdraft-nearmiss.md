# Gold 03: Overdraft near-miss, proactive

Persona: anxious first-timer. Scenario: proactive within budget.
Principles: proactive without nagging; never moralize.

**agent:** Checking hits about $40 after tomorrow's bills. Want me to move $300.00 from savings?

_Why this is right:_ One message, the action offered, no lecture; the reason is recorded for the budget.

```json
{
 "id": "03-overdraft-nearmiss",
 "title": "Overdraft near-miss, proactive",
 "persona": "anxious first-timer",
 "scenario": "proactive within budget",
 "principles": [
  "proactive without nagging",
  "never moralize"
 ],
 "turns": [
  {
   "agent": {
    "kind": "proactive",
    "fields": {
     "finding": "Checking hits about $40 after tomorrow's bills.",
     "offer": "Want me to move $300.00 from savings?",
     "reason": "overdraft likely within 24 hours"
    },
    "ctx": {}
   },
   "expected": [
    "Checking hits about $40 after tomorrow's bills. Want me to move $300.00 from savings?"
   ],
   "why": "One message, the action offered, no lecture; the reason is recorded for the budget."
  }
 ]
}
```
