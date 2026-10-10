# Gold 01: Send money, terse texter

Persona: terse low-effort texter. Scenario: happy path.
Principles: lead with the answer; numbers exact; money gravity: light tone for small stuff.

**user:** send sarah the 85 for the airbnb

**agent:** Send $85.00 to Sarah M (venmo @sarah-m)? Free, lands in minutes.

_Why this is right:_ Restates amount, recipient, fee and timing in one line; nothing sent yet.

**user:** yes

**agent:** Sent. $85.00 to Sarah M, Venmo, confirmation 88291. You're settled up for the Airbnb.

_Why this is right:_ Leads with the outcome, exact amount, rail reference, then the one-line consequence.

```json
{
 "id": "01-send-happy",
 "title": "Send money, terse texter",
 "persona": "terse low-effort texter",
 "scenario": "happy path",
 "principles": [
  "lead with the answer",
  "numbers exact",
  "money gravity: light tone for small stuff"
 ],
 "turns": [
  {
   "user": "send sarah the 85 for the airbnb"
  },
  {
   "agent": {
    "kind": "confirm",
    "fields": {
     "action": "Send",
     "amount_cents": 8500,
     "recipient": "Sarah M (venmo @sarah-m)",
     "timing": "lands in minutes"
    },
    "ctx": {
     "register": "casual"
    }
   },
   "expected": [
    "Send $85.00 to Sarah M (venmo @sarah-m)? Free, lands in minutes."
   ],
   "why": "Restates amount, recipient, fee and timing in one line; nothing sent yet."
  },
  {
   "user": "yes"
  },
  {
   "agent": {
    "kind": "receipt",
    "fields": {
     "done": "Sent",
     "amount_cents": 8500,
     "recipient": "Sarah M",
     "rail": "Venmo",
     "reference": "88291",
     "followup": "You're settled up for the Airbnb."
    },
    "ctx": {}
   },
   "expected": [
    "Sent. $85.00 to Sarah M, Venmo, confirmation 88291. You're settled up for the Airbnb."
   ],
   "why": "Leads with the outcome, exact amount, rail reference, then the one-line consequence."
  }
 ]
}
```
