# Connector booking (module 160) — integration note, 2026-10-21

Package: intro booking without Google. Branch `muse/2026-10-21-intro-booking`.
Files: `packages/domain/160-career-connector-booking.js`,
`tests/career-connector-booking.test.cjs` — **25/25 guards pass**
(fail-first: suite committed red @ `eb64eba9`, module absent).
Golden `.ics` sha256 `ea5e392437ed61db114d316b77dec3c5d13673920029551f6dcf3209111ab27b`.

## Why

The intro composer (159) emits booking as `offered_not_booked` with
`requires: "google_connect"` — honest, because the in-product Google
connect has never been tapped and no calendar event can be created.
But the owner's definition is that **a match counts only when both
sides opt in AND a call is booked**. An offer can never satisfy that.
Module 160 removes the dependency: booking is redefined as an
in-product time agreement (below), so `booked=true` is reachable today,
with no Google account, no calendar API, and no install.

## booked=true, as implemented

- One side proposes **1–3 slots**; a slot is a wall-clock time
  (`YYYY-MM-DDTHH:MM`) in an **explicit IANA timezone**, converted to an
  absolute instant at proposal time (Intl; conversions grounded against
  `date -d` in BOOK-012/013/014b — CDT −5, CST −6, IST +5:30).
- Each side **confirms or declines independently**, exactly once per
  round; the first response stands.
- **Booked ⟺ both sides confirmed the SAME slot.** If both accept
  several, the first common slot **in proposal order** wins (BOOK-002).
  Mismatched confirmations can never book (BOOK-003).
- A decline of all slots returns the booking to propose; **max 2
  rounds**, then the terminal state is `unbooked` with reason
  `rounds_exhausted` — named, never silently dropped (BOOK-006).
- Each round **expires** (default TTL 72h, caller-tunable); answers
  after expiry, or naming a superseded round's slot ids, are **no-ops**
  (BOOK-007/008). Slot ids are round-scoped (`r1s1`, `r2s1`) so
  staleness is detectable.
- The **artifact** is the booked record — `{status:"booked", slotId,
  startUtc, endUtc, timezone, localStart, aConfirmedAt, bConfirmedAt,
  bookedAt, calendar_event_created:false, artifact:"ics_file"}` —
  plus a **byte-stable `.ics`** (DTSTAMP = the booked-at instant, so a
  record always renders identical bytes; BOOK-015/016). The `.ics`
  carries UTC times and **first names only**: no location, no meeting
  link, no organizer, no surnames, no emails. A link is never invented
  and no placeholder claims one exists.

## How this feeds the owner's match count

The countable chain is: consent to matching (157) → double opt-in on
the specific match (158's `both_yes` / `intro_unlocked`) → intro fired
(159) → **booking reaches state `booked` (160)**. Only then does the
match count. Concretely for the integration lane:

- Module 160 emits exactly one `booking_booked` event per booking
  (drained via `drainEvents()`; exactly-once holds across
  snapshot/restore, BOOK-019).
- That event is the trigger to write the booked record onto **both**
  intro records through the pool's `setIntroBooking(proposalId,
  booking)` — the carriage the integration design already specifies
  (`connector_intro` key = proposalId, field `booking`).
- A "completed introduction" metric reads: intro record exists **and**
  `booking.status == "booked"`. Intermediate states (proposed,
  both-yes, awaiting confirmations, needs new times) are reported as
  themselves, never rounded up to booked.

## Carriage and wiring (integration lane)

- Factory shape matches 158: `createConnectorBooking(deps,
  snapshotJson?)`, `deps = { now, nextId }`; records are plain JSON.
- Per the integration design, proposal/booking state is **pool
  authority**, never the per-user keyed carriage (the F-017 lesson).
  `snapshot()` / restore is the persistence seam for the pool's
  implementation; the machine itself holds no store.
- Events for the host: `booking_booked`, `booking_needs_new_times`,
  `booking_unbooked`, `booking_expired`. Reminders and any user-facing
  text are the host's job, driven off these — the module sends nothing.
- 159's static booking payload (`offered_not_booked` /
  `requires:"google_connect"`) is superseded at integration: the
  composer's offer text stays, but the payload's status should be
  driven by 160's record once an intro exists. Not done in this
  package (159 is another lane's file).

## How Google connect later swaps the artifact — states unchanged

When a user connects Google in-product, a host-side step (not this
module) reads bookings in state `booked` with
`calendar_event_created:false`, creates the native calendar event from
the same absolute instants (`startUtc`/`endUtc` are already stored),
and writes back `calendar_event_created:true` plus the provider event
id onto the booked record. No state transition, no re-confirmation, no
change to what counted or when. The `.ics` remains the artifact for
anyone who has not connected, and `booked=true` never depended on the
upgrade.

## Known edges, stated plainly

- **DST gap times** (a wall time that does not exist, e.g. 02:30 on
  spring-forward day) resolve deterministically to the post-transition
  offset by the converter's second pass; fall-back ambiguous times
  resolve to one instant deterministically. A host should read back
  the rendered `localStart` before proposing — it is on every slot.
- Slot times are minute-precision; durations 1–480 min (default 20,
  matching the composer's "20-minute call").
- Like modules 156–159, module 160 is **not yet classified** in
  `docs/depth/MUTATION-COVERAGE.md`; registering it is the integration
  lane's step, same as its siblings. A full-repo sweep will flag the
  classification until then; this package's own suite is green and its
  diff is new files only.

## Owner asks

None for this package. Deploy and integration remain on the owner's
word, as already standing.
