# Gold 11: Fraud alert

Persona: power user. Scenario: safety preempts everything.
Principles: money gravity: straight tone when it matters; safety first.

**agent:** A $900.00 charge at TECHNOVA LTD posted to your Chase card at 3:12 am; you have never used that merchant. Chase has not flagged it yet. / Reply LOCK to lock the card now, or OK if it was you.

_Why this is right:_ First line says the thing; straight tone; one concrete action.

```json
{
 "id": "11-fraud-alert",
 "title": "Fraud alert",
 "persona": "power user",
 "scenario": "safety preempts everything",
 "principles": [
  "money gravity: straight tone when it matters",
  "safety first"
 ],
 "turns": [
  {
   "agent": {
    "kind": "alert",
    "fields": {
     "first_line": "A $900.00 charge at TECHNOVA LTD posted to your Chase card at 3:12 am; you have never used that merchant.",
     "detail": "Chase has not flagged it yet.",
     "action": "Reply LOCK to lock the card now, or OK if it was you."
    },
    "ctx": {
     "severity": "high"
    }
   },
   "expected": [
    "A $900.00 charge at TECHNOVA LTD posted to your Chase card at 3:12 am; you have never used that merchant. Chase has not flagged it yet.",
    "Reply LOCK to lock the card now, or OK if it was you."
   ],
   "why": "First line says the thing; straight tone; one concrete action."
  }
 ]
}
```
