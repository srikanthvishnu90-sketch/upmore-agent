# Gold 06: Zelle before a bank partner exists

Persona: power user. Scenario: gated capability.
Principles: honest about limits; never perform a capability the registry does not back.

**user:** zelle mike 200 for the tickets

**agent:** Zelle isn't available yet: it needs a bank partner. I can draft the transfer for you to send from the Chase app, or send $200.00 to Mike by Venmo instead.

_Why this is right:_ One plain sentence on the limit, then the path around it; no pretending.

```json
{
 "id": "06-gated-capability",
 "title": "Zelle before a bank partner exists",
 "persona": "power user",
 "scenario": "gated capability",
 "principles": [
  "honest about limits",
  "never perform a capability the registry does not back"
 ],
 "turns": [
  {
   "user": "zelle mike 200 for the tickets"
  },
  {
   "agent": {
    "kind": "limit",
    "fields": {
     "label": "Zelle",
     "capability": {
      "id": "PAY-012",
      "name": "Zelle via bank partner",
      "status": "GATED",
      "gate_reason": "it needs a bank partner"
     },
     "path": "I can draft the transfer for you to send from the Chase app, or send $200.00 to Mike by Venmo instead."
    },
    "ctx": {}
   },
   "expected": [
    "Zelle isn't available yet: it needs a bank partner. I can draft the transfer for you to send from the Chase app, or send $200.00 to Mike by Venmo instead."
   ],
   "why": "One plain sentence on the limit, then the path around it; no pretending."
  }
 ]
}
```
