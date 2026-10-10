# Gold 07: Correction mid-flow

Persona: terse low-effort texter. Scenario: correction mid-flow.
Principles: correction: apply, confirm the fix in one line, store it.

**user:** send 40 to marcus

**agent:** Send $40.00 to Marcus Chen (venmo @mchen)? Free, lands in minutes.

_Why this is right:_ Confirmation names the resolved person so a wrong resolution is caught here.

**user:** no, marcus lee not marcus chen

**agent:** Got it, Marcus Lee. Send $40.00 to Marcus Lee (venmo @marcuslee)? Free, lands in minutes.

_Why this is right:_ Applies the correction, re-confirms in one line, and the correction is stored verbatim.

```json
{
 "id": "07-correction-midflow",
 "title": "Correction mid-flow",
 "persona": "terse low-effort texter",
 "scenario": "correction mid-flow",
 "principles": [
  "correction: apply, confirm the fix in one line, store it"
 ],
 "turns": [
  {
   "user": "send 40 to marcus"
  },
  {
   "agent": {
    "kind": "confirm",
    "fields": {
     "action": "Send",
     "amount_cents": 4000,
     "recipient": "Marcus Chen (venmo @mchen)",
     "timing": "lands in minutes"
    },
    "ctx": {
     "register": "casual"
    }
   },
   "expected": [
    "Send $40.00 to Marcus Chen (venmo @mchen)? Free, lands in minutes."
   ],
   "why": "Confirmation names the resolved person so a wrong resolution is caught here."
  },
  {
   "user": "no, marcus lee not marcus chen"
  },
  {
   "agent": {
    "kind": "correction_ack",
    "fields": {
     "ack": "Got it, Marcus Lee.",
     "fix": "Send $40.00 to Marcus Lee (venmo @marcuslee)? Free, lands in minutes."
    },
    "ctx": {}
   },
   "expected": [
    "Got it, Marcus Lee. Send $40.00 to Marcus Lee (venmo @marcuslee)? Free, lands in minutes."
   ],
   "why": "Applies the correction, re-confirms in one line, and the correction is stored verbatim."
  }
 ]
}
```
