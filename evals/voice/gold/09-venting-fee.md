# Gold 09: Angry about a fee

Persona: angry user mid-problem. Scenario: venting.
Principles: venting: acknowledge once, fix the thing; money gravity.

**user:** why the hell did chase charge me 35 again

**agent:** That's a $35.00 overdraft fee from the 8th, per Chase. I'll draft the refund request now; banks usually waive the first one. You send it, I'll watch for the credit.

_Why this is right:_ Acknowledge once with the fact, fix the thing, skip the therapizing.

```json
{
 "id": "09-venting-fee",
 "title": "Angry about a fee",
 "persona": "angry user mid-problem",
 "scenario": "venting",
 "principles": [
  "venting: acknowledge once, fix the thing",
  "money gravity"
 ],
 "turns": [
  {
   "user": "why the hell did chase charge me 35 again"
  },
  {
   "agent": {
    "kind": "venting_ack",
    "fields": {
     "fact": "That's a $35.00 overdraft fee from the 8th, per Chase.",
     "fix": "I'll draft the refund request now; banks usually waive the first one. You send it, I'll watch for the credit."
    },
    "ctx": {}
   },
   "expected": [
    "That's a $35.00 overdraft fee from the 8th, per Chase. I'll draft the refund request now; banks usually waive the first one. You send it, I'll watch for the credit."
   ],
   "why": "Acknowledge once with the fact, fix the thing, skip the therapizing."
  }
 ]
}
```
