# Connector v1 — demo transcript (TEST profiles only)

Synthetic people (Ana/Ben), in-memory pool, product chat path (career host + router). No real users, no sends, no production surface.

### ANA (TEST) — thread ta

> Opt me into matching — my name is Ana. I need intros to alumni working in investment banking, and I can offer interview prep and resume reviews.

**Trainee** [connector_consent_record]

You're opted in — your consent is on your record.
Recorded at 2026-10-21T14:01:00.000Z: you consented to be listed in the matching pool and to be proposed matches under double opt-in. That consent covers matching only — every specific intro still needs your explicit yes, and 'opt me out' revokes it at any time. Your match profile, in your words: you need intros to alumni working in investment banking; you offer interview prep and resume reviews.
Only that need/offer summary is ever shown inside the pool — your name is revealed only inside an intro you both said yes to. Say 'find me a match' when you're ready for your first proposal.

### ANA (TEST) — thread ta

> Yes — opt me in.

**Trainee** [connector_consent_record]

You're opted in — your consent is on your record.
Recorded at 2026-10-21T14:02:00.000Z: you consented to be listed in the matching pool and to be proposed matches under double opt-in. That consent covers matching only — every specific intro still needs your explicit yes, and 'opt me out' revokes it at any time. Your match profile, in your words: you need intros to alumni working in investment banking; you offer interview prep and resume reviews.
Only that need/offer summary is ever shown inside the pool — your name is revealed only inside an intro you both said yes to. Say 'find me a match' when you're ready for your first proposal.

### BEN (TEST) — thread tb

> My name is Ben. I need interview prep for banking superdays, and I can offer alumni perspective from inside investment banking.

**Trainee** [connector_profile_record]

Your match profile is on record.
In your words: you need interview prep for banking superdays; you offer alumni perspective from inside investment banking. You are NOT opted in — this statement records the profile only, and joining the pool is a separate, explicit act. Say 'opt me in' to join the matching pool.

### BEN (TEST) — thread tb

> Yes — opt me in.

**Trainee** [connector_consent_record]

You're opted in — your consent is on your record.
Recorded at 2026-10-21T14:04:00.000Z: you consented to be listed in the matching pool and to be proposed matches under double opt-in. That consent covers matching only — every specific intro still needs your explicit yes, and 'opt me out' revokes it at any time. Your match profile, in your words: you need interview prep for banking superdays; you offer alumni perspective from inside investment banking.
Only that need/offer summary is ever shown inside the pool — your name is revealed only inside an intro you both said yes to. Say 'find me a match' when you're ready for your first proposal.

### ANA (TEST) — thread ta

> find me a match

**Trainee** [connector_match_proposal]

One match to consider — no names until you both say yes.
Their side, in their own words: they need interview prep for banking superdays; they offer alumni perspective from inside investment banking. They offer alumni perspective from inside investment banking — that matches what you said you need: intros to alumni working in investment banking They are looking for interview prep for banking superdays — that matches what you offer: interview prep and resume reviews Nothing about you has been shared — not your name, not any detail. Say 'yes to the match' to agree to this intro, or 'pass on the match' to decline it.

### ANA (TEST) — thread ta

> yes to the match

**Trainee** [connector_match_decision]

Recorded — you've said yes to this specific intro.
The intro does NOT fire on one yes — the other side will see the same identity-free proposal on their next turn here, and only if they also say yes does the introduction land on both your records at once, with both names in it. Nothing for you to do until they answer; ask me 'what's my match status?' any time.

_State check: intro records on either account after ONE yes: 0 (must be 0)._

### BEN (TEST) — thread tb

> any matches for me?

**Trainee** [connector_match_proposal]

One match to consider — no names until you both say yes.
Their side, in their own words: they need intros to alumni working in investment banking; they offer interview prep and resume reviews. They offer interview prep and resume reviews — that matches what you said you need: interview prep for banking superdays They are looking for intros to alumni working in investment banking — that matches what you offer: alumni perspective from inside investment banking Nothing about you has been shared — not your name, not any detail. Say 'yes to the match' to agree to this intro, or 'pass on the match' to decline it.

### BEN (TEST) — thread tb

> yes — introduce us

**Trainee** [connector_intro]

You're introduced — this exact text is now on both your records:
Introducing Ana and Ben.
Ana: you said you need intros to alumni working in investment banking; you offer interview prep and resume reviews.
Ben: you said you need interview prep for banking superdays; you offer alumni perspective from inside investment banking.
Why this match: Ben offers alumni perspective from inside investment banking — matching what Ana needs: intros to alumni working in investment banking; Ben is looking for interview prep for banking superdays — matching what Ana offers: interview prep and resume reviews.
A concrete first step: a 30-minute call this week. Ana, send Ben two times that suit you; Ben, pick the one that works.
Booking: once you've settled on a time, either of you can say "book the call" and I'll record the booking on both records — the calendar placement itself completes when Google is connected in the product. I'll check in with both of you at the 72-hour mark.
Next step — settle on a time between you; either of you can say "book the call" and I'll record the acceptance on both records, and I'll check in with both of you at the 72-hour mark (2026-10-24T14:08:00.000Z). Tell me what you'd like to do next.

## The records after both yeses

Ana's intro record:

```json
{
  "id": "prop-1",
  "otherName": "Ben",
  "why": "Ben offers alumni perspective from inside investment banking — matching what Ana needs: intros to alumni working in investment banking; Ben is looking for interview prep for banking superdays — matching what Ana offers: interview prep and resume reviews",
  "intro": "Introducing Ana and Ben.\nAna: you said you need intros to alumni working in investment banking; you offer interview prep and resume reviews.\nBen: you said you need interview prep for banking superdays; you offer alumni perspective from inside investment banking.\nWhy this match: Ben offers alumni perspective from inside investment banking — matching what Ana needs: intros to alumni working in investment banking; Ben is looking for interview prep for banking superdays — matching what Ana offers: interview prep and resume reviews.\nA concrete first step: a 30-minute call this week. Ana, send Ben two times that suit you; Ben, pick the one that works.\nBooking: once you've settled on a time, either of you can say \"book the call\" and I'll record the booking on both records — the calendar placement itself completes when Google is connected in the product. I'll check in with both of you at the 72-hour mark.",
  "at": "2026-10-21T14:08:00.000Z",
  "followUpDueAt": "2026-10-24T14:08:00.000Z",
  "booking": "offered"
}
```

Ben's intro record (same intro text; the 72h marker on both):

```json
{
  "id": "prop-1",
  "otherName": "Ana",
  "why": "Ben offers alumni perspective from inside investment banking — matching what Ana needs: intros to alumni working in investment banking; Ben is looking for interview prep for banking superdays — matching what Ana offers: interview prep and resume reviews",
  "intro": "Introducing Ana and Ben.\nAna: you said you need intros to alumni working in investment banking; you offer interview prep and resume reviews.\nBen: you said you need interview prep for banking superdays; you offer alumni perspective from inside investment banking.\nWhy this match: Ben offers alumni perspective from inside investment banking — matching what Ana needs: intros to alumni working in investment banking; Ben is looking for interview prep for banking superdays — matching what Ana offers: interview prep and resume reviews.\nA concrete first step: a 30-minute call this week. Ana, send Ben two times that suit you; Ben, pick the one that works.\nBooking: once you've settled on a time, either of you can say \"book the call\" and I'll record the booking on both records — the calendar placement itself completes when Google is connected in the product. I'll check in with both of you at the 72-hour mark.",
  "at": "2026-10-21T14:08:00.000Z",
  "followUpDueAt": "2026-10-24T14:08:00.000Z",
  "booking": "offered"
}
```

### ANA (TEST) — thread ta

> book the call

**Trainee** [connector_booking_accept]

Booking recorded — the acceptance is on both records.
Both intro records now say booking: accepted — the offer was made in the intro and you've taken it up. The calendar placement itself completes when Google is connected in the product — that connect is what gives me calendar access. Until then no calendar entry exists and no invite has gone out: you and Ben have the intro itself to settle the time, and the moment the connect lands I can place it for real.
Agree the time in the intro thread; the 72-hour check-in still lands either way. Tell me what you'd like to do next.

Booking state on Ben's record after Ana's "book the call": **accepted** (acceptance recorded on both records; no calendar artifact created or claimed — Google connect is the seam).

### ANA (TEST) — thread ta

> check in on my intro

**Trainee** [connector_status]

Your matching status: opted in.
Your match profile, in your words: you need intros to alumni working in investment banking; you offer interview prep and resume reviews. Your intro with Ben happened at 2026-10-21T14:08:00.000Z. Booking on that intro: offered — say 'book the call' once you've settled on a time.
The 72-hour follow-up check-in on this intro is set for 2026-10-24T14:08:00.000Z. Say 'find me a match' for a proposal, or 'opt me out' to leave the pool.
The intro itself, word for word as it landed:
Introducing Ana and Ben.
Ana: you said you need intros to alumni working in investment banking; you offer interview prep and resume reviews.
Ben: you said you need interview prep for banking superdays; you offer alumni perspective from inside investment banking.
Why this match: Ben offers alumni perspective from inside investment banking — matching what Ana needs: intros to alumni working in investment banking; Ben is looking for interview prep for banking superdays — matching what Ana offers: interview prep and resume reviews.
A concrete first step: a 30-minute call this week. Ana, send Ben two times that suit you; Ben, pick the one that works.
Booking: once you've settled on a time, either of you can say "book the call" and I'll record the booking on both records — the calendar placement itself completes when Google is connected in the product. I'll check in with both of you at the 72-hour mark. Tell me what you'd like to do next.

