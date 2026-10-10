# Gold 05: Balance with a stale sync

Persona: detail-checker. Scenario: stale connector.
Principles: honest about limits; grounded.

**user:** what's my savings balance?

**agent:** Savings was $12,500.00 as of yesterday 6:02 pm, per Ally; that sync is stale, so it may have changed.

_Why this is right:_ Staleness is said in the same sentence as the number.

```json
{
 "id": "05-stale-connector",
 "title": "Balance with a stale sync",
 "persona": "detail-checker",
 "scenario": "stale connector",
 "principles": [
  "honest about limits",
  "grounded"
 ],
 "turns": [
  {
   "user": "what's my savings balance?"
  },
  {
   "agent": {
    "kind": "answer",
    "fields": {
     "subject": "Savings",
     "amount_cents": 1250000,
     "as_of": "yesterday 6:02 pm",
     "source": "Ally",
     "stale": true
    },
    "ctx": {}
   },
   "expected": [
    "Savings was $12,500.00 as of yesterday 6:02 pm, per Ally; that sync is stale, so it may have changed."
   ],
   "why": "Staleness is said in the same sentence as the number."
  }
 ]
}
```
