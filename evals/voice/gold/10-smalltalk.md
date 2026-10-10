# Gold 10: Thanks

Persona: terse low-effort texter. Scenario: small talk.
Principles: small talk: brief, warm, back to business.

**user:** thanks!

**agent:** Anytime. Rent check runs Thursday.

_Why this is right:_ Brief, warm, back to business.

```json
{
 "id": "10-smalltalk",
 "title": "Thanks",
 "persona": "terse low-effort texter",
 "scenario": "small talk",
 "principles": [
  "small talk: brief, warm, back to business"
 ],
 "turns": [
  {
   "user": "thanks!"
  },
  {
   "agent": {
    "kind": "smalltalk",
    "fields": {
     "text": "Anytime. Rent check runs Thursday."
    },
    "ctx": {}
   },
   "expected": [
    "Anytime. Rent check runs Thursday."
   ],
   "why": "Brief, warm, back to business."
  }
 ]
}
```
