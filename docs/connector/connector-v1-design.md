# CONNECTOR v1 — design note (Lane B, first build round, 2026-10-21)

Branch: `muse/2026-10-21-connector-v1` (base `cea914fe`, the v248 tree).
Spec: `trainee-capability-targets-2026-10-19.md` §CONNECTOR (adopted v2
2026-10-20). Scoping: `lane-b-connector-prep-2026-10-21.md` (verified
inventory). Status: BUILT + guard-tested on this branch. NOT deployed,
no real people, no sends (124's sink stays SEND_DISABLED).

## What v1 is

The full Connector slice behind an allowlist gate, exercised end to
end on test profiles through the real career host: consent capture →
match profile → one match proposed with cited reasoning → double
opt-in → warm intro delivered in-product to both sides → booking
offer + acceptance recorded → 72-hour follow-up marker + check-in
read-back. Revocation actually revokes.

## Architecture — the three seams, all imitations of existing patterns

1. **The gate (composition-root deps, the J8/J10 `boardFor` pattern).**
   `createCareerHost` accepts two new optional deps:
   `connectorAllowlist` (array of account user ids) and
   `connectorPool` (the pool service, below). `createTurnCtx`
   attaches them per turn as `ctx.connectorAllowlist` /
   `ctx.connectorPool`; they are runtime wiring only — never in
   STATE_KEYS, never persisted, never resurrected by a snapshot.
   `handler-career.ts` builds the allowlist from the env var
   `CONNECTOR_ALLOWED_USER_IDS` (comma-separated account ids, the
   `resolveTestUser` env-allowlist shape) and installs NO pool in
   production this round. Router discipline:
   - user not allowlisted → the connector claim returns null before
     any side effect; the existing `people_matching_stop` answers
     byte-identically, exactly as today.
   - allowlisted but no pool installed → connector-family asks get
     one honest reply (intent `connector_not_wired`): the gate is
     open for this account but the matching pool is not wired on
     this surface yet. Nothing is faked.
   - allowlisted + pool → the flow below.

2. **Per-user durable records ride the account stated-facts keyed
   carriage** (the F-017 goal-frame carriage — no new DB table; the
   account record is the store the career stack already commits
   atomically, and the round-2 merge makes the account authoritative
   per identity, so a returning thread can never resurrect a stale
   connector record). Kinds (all non-SQL kinds → the `keyed` list):
   - `connector_profile`, key `self` — the match profile:
     `{name, needs, offers, updatedAt}`. `name` is the display name
     used ONLY at intro time (after both yeses).
   - `connector_consent`, key `pool` — the consent record:
     `{status: "opted_in" | "revoked", at, scope, version}`. Who:
     the account's own user id (the record lives on their account).
     When: the turn clock at the explicit opt-in turn. Scope:
     "matching" — being listed in the pool and proposed matches
     under double opt-in; it is NOT consent to any specific intro
     (that is the per-proposal double yes). Revocable: the revoke
     turn rewrites it to `revoked` with a fresh timestamp and takes
     the profile out of the pool the same turn.
   - `connector_intro`, key = proposal id — the intro artifact on
     EACH side's own record (written by the pool at fire time, see
     below): `{id, otherName, why, intro, at, followUpDueAt,
     booking: "offered" | "accepted"}`.
   Why not a new table: the prep doc (§6) assigns the durable
   cross-user connections registry to the brain lane; v1 must not
   build a parallel store. The keyed carriage is the product's
   existing per-user durable record, and everything v1 needs per
   user fits it.

3. **Proposals live in the pool — single authority, no copies.**
   The round-2 lesson (a state machine duplicated into per-thread
   or per-user caches diverges under interleaving) is applied up
   front: a proposal exists exactly once, in the pool service
   (`ctx.connectorPool`), and both sides' turns read/transition
   that one record. Interface (synchronous, JSON values):
   - `optedInProfiles(exceptUserId)` → `[{userId, profile}]` for
     accounts whose consent is currently `opted_in`.
   - `createProposal(p)`, `proposal(id)`, `updateProposal(id, patch)`
     — the state machine record (below).
   - `openProposalFor(userId)` → the user's non-terminal proposal
     or null (the one-at-a-time lock, checked for BOTH sides before
     a create).
   - `recordIntro(userId, introFact)` — appends the
     `connector_intro` keyed fact to that user's account record
     (the pool is a service over the account store; in production
     this is the registry seam the brain lane owns — see "Left for
     live"). In this round the only implementation is the test/demo
     in-memory pool over the harness account store.
   Identity rule: a turn acts only as `ctx.userId`. A decision is
   accepted only from the side the proposal currently awaits, and
   only for a proposal that names that user id. There is no path
   by which one account decides for another, and no shared/test
   identity anywhere in the flow.

## The state machine

```
profile: (none) --state needs/offers--> draft --"opt me in"--> opted_in
consent: (none) --explicit opt-in turn--> opted_in --revoke--> revoked
         revoked --state needs/offers + opt-in again--> opted_in

proposal (pool, one per pair, one OPEN per user):
  (none) --A asks for a match, fit found--> awaiting_a
  awaiting_a --A yes--> awaiting_b
  awaiting_a --A no--> declined_a (terminal; B never saw anything)
  awaiting_b --B yes--> intro_sent (terminal; intro fires HERE, once)
  awaiting_b --B no--> declined_b (terminal; A learns only "passed")
  any open state --either side revokes consent--> closed_revoked
  intro_sent --either side accepts booking--> intro record booking=accepted
```

Proposal presentation is pull-based in v1: B sees the pending
proposal on B's next connector turn (any connector-family ask, or
"any matches for me?"). Push delivery across channels is the
proactive/scheduler seam (brain lane), out of scope here and stated
as such — v1 never claims B was notified.

## The chat surface (allowlisted users; all shapes first-person)

- **Onboard/capture**: "opt me in — I need X, and I can offer Y"
  (also "I need … / I offer …" clauses in any connector-family
  turn) records the profile as a draft and reads it back; nothing
  is opted in until the explicit opt-in turn: "opt me in" /
  "yes, opt me in" / "join the matching pool". A bare statement of
  needs/offers NEVER opts anyone in (BUG-169 assertion discipline:
  capture is explicit, consent is a separate explicit act).
  Display name: the 122 profile's basics name when present, else a
  stated "my name is X" in the capture turn, else the flow asks.
- **Match ask**: "find me a match" / "propose my first match" /
  "match me" (the stop's own families). Requires opted_in. Fit:
  deterministic token overlap between my needs ↔ their offers and
  my offers ↔ their needs, stopword-filtered; a proposal requires
  at least one cited overlap — below the bar, the honest reply is
  "no fit in the pool yet", never a forced match. One open proposal
  per user: while one is open, a match ask returns its status.
- **Proposal (to A, and later to B)**: identity-free. It carries
  only the other side's need/offer summary and the why, and every
  why clause quotes a profile fact VERBATIM ("They offer: <their
  offers>. That matches what you said you need: <your needs>.").
  No name, no contact, no firm is revealed to either side before
  both yeses. NOTE: the spec's worked example names the match in
  the proposal ("meet Priya, 2024 alum at JPM"); v1 deliberately
  follows the stricter reading — the lane brief's guard ("B never
  sees A's identity before B's yes") and the spec's own consent
  rule ("nothing about either person is revealed without
  consent") — applied symmetrically to both sides. Names land at
  the intro, for both sides at once.
- **Decisions**: claimed only when a proposal awaits THIS user:
  yes-shapes ("yes", "yes to the match", "introduce us", "accept")
  and no-shapes ("no", "pass", "no thanks"). A yes from A records
  A's opt-in to THIS intro and moves the proposal to awaiting_b —
  the intro does NOT fire on one yes. A yes from B fires it.
- **The intro**: composed at the both-yes turn from both profiles:
  both names, the why for both sides (each side's cited facts), a
  concrete first step, and the booking offer. It is delivered to B
  (present) in that turn's reply, and written to BOTH sides'
  records; A reads the identical intro text from their own record
  on their next connector turn ("your intro is ready"). Exactly
  once: the fire is the `awaiting_b → intro_sent` transition;
  any later yes (either side, any thread, stale or fresh) sees a
  terminal state and cannot re-fire.
- **Booking**: the intro offers to book a call. Either side's
  "book it" / "yes, book the call" on a later turn records
  `booking: "accepted"` on both intro records and replies
  honestly: the booking completes when the user has connected
  Google in-product (the calendar scopes exist; the connect has
  never been tapped); until then the accepted offer and the intro
  are on record and the two are connected to arrange the time.
  NO calendar artifact is created or claimed in v1.
- **Follow-up**: the intro record carries `followUpDueAt` =
  intro time + 72h. "Check in on my intro" / "did my intro
  happen" answers from the user's own intro record: the intro,
  the booking state, and whether the 72-hour follow-up is due or
  still pending. (Proactive firing at 72h is the scheduler seam —
  brain lane; v1 records the marker and answers honestly.)
- **Revoke**: "opt me out" / "revoke my consent" / "stop matching
  me" rewrites consent to revoked, closes any open proposal
  involving the user (`closed_revoked`), and reads back the new
  state. A revoked user is never listed, proposed, or intro'd;
  re-joining requires a fresh explicit opt-in.

## Guards (tests/career-connector.test.cjs, fail-first vs base)

Non-allowlisted → stop byte-identical · allowlisted without pool →
not-wired honesty · statement without opt-in records no consent ·
opt-in records, reads back, survives a fresh thread · revoke
revokes (record, pool listing, open proposal closed) · no proposal
to a non-opted-in profile · B sees no A identity before B's yes
(and A none of B's) · one open proposal at a time for both sides ·
A's single yes never fires the intro · exactly-once intro under
repeated/stale yeses across interleaved threads · the intro record
+ 72h marker exist on both sides · booking acceptance recorded,
no calendar claim · a revoked side's pending proposal can never
fire.

## Left for live (deploy round, owner's rules)

- The production pool implementation over the account store (the
  brain-lane connections-registry seam, prep §6) + the 72h
  proactive scheduler firing. Until the pool is wired, production
  stays at the honest stop for everyone and `connector_not_wired`
  for allowlisted accounts — by design, not by accident.
- The owner's deploy word (staged checklist), the two real
  consenting people, and the in-product Google connect tap for a
  true calendar booking.
- A registry capability entry for the Connector (registry.json has
  none today; it is created through the registry build, not by
  hand) and mentor/recruiter verification + block/report (spec
  abuse mitigations) before any pool beyond the first cohort.
