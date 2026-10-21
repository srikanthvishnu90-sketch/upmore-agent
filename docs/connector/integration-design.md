# Connector — integration design (Lane B, integration lane)

Status: 2026-10-21. Branch `muse/2026-10-21-connector-v1` @ 9422dd8e.
Owner directive (2026-10-21 12:02 CDT): the connector build splits
into four independent packages on separate branches — consent model,
allowlist gate, match flow, intro composer — each a standalone module.
This note is the integration contract: how those four modules wire
into 142/host, the exact seams, and the guard list that runs against
the assembled flow.

## What already exists (proven, this branch)

A working monolith implementation lives in 142 (the
`handleConnector` family, `142-career-router.js:1336` ff.) behind the
host deps seam, built first so the seams are proven, not theorized:

- Guards: `tests/career-connector.test.cjs` — **14/14 on the build,
  2/14 on base cea914fe** (fail-first; the 2 base passes are the
  regression guards).
- Demo: `scripts/career/connector-demo.cjs` →
  `docs/connector/demo-transcript-2026-10-21.md` (TEST profiles).
- Edge suite on this tree: **767 passed / 0 failed**; agent100 dry
  **103/103**; both router bundles regenerated, `--check` verified ×2.
- Design of record for the flow itself:
  `docs/connector/connector-v1-design.md`.

The split does not redesign the flow. Each package absorbs a named
slice of the monolith; the integration keeps `handleConnector` as
the single claim entry and swaps its internals for module calls.
The guard suite is the contract: it runs against the assembled
host+router and must stay 14/14 at every swap step.

## Package map

| Package module (packages/domain/) | Absorbs from the monolith | Owns |
|---|---|---|
| `career-connector-gate.js` | the allowlist check + stand-down + `connector_not_wired` result | who may enter the flow at all |
| `career-connector-consent.js` | capture parse, profile/consent record read-write, revoke, status read-backs | `connector_profile` + `connector_consent` records |
| `career-connector-match.js` | fit scoring, the verbatim why, the proposal state machine, decisions | proposals (via the pool), `connector_match_*` results |
| `career-connector-intro.js` | intro text composition, the fire, booking acceptance, check-in surfacing | `connector_intro` records (via the pool), `connector_intro` / `connector_booking_accept` results |

No package edits another package's file. Cross-package calls go
through the interfaces below, in 142's claim body — the claim body
is integration-owned (this lane).

## Wiring — exact call sites

1. **Bundler.** `scripts/build-router-core.py` carries the module
   `names` list; the four files are added **before**
   `142-career-router.js` in that list. Both bundles
   (`router_core.js`, `router_core.career.js`) are regenerated in
   the integration commit; both `--check` modes + 
   `tests/router-bundle.test.cjs` (3/3) must stay green.
2. **Module loading.** 142 is an IIFE that req-loads sibling domain
   modules at its head (`142-career-router.js:32`, the `req(p)`
   pattern — the same way it reaches 140/121/etc.). The four
   connector modules load there and are used only inside the
   connector claim. A module that fails to load degrades the claim
   to stand-down (null), never to a throw — same posture as the
   existing optional-module loads.
3. **Host deps seam (already landed).**
   `career_host.js:271-272` reads `deps.connectorPool` /
   `deps.connectorAllowlist` in `createCareerHost`;
   `career_host.js:324-325` attaches them per turn in
   `createTurnCtx` (`ctx.connectorPool`, `ctx.connectorAllowlist`).
   Runtime wiring only — **not** STATE_KEYS, never persisted, no
   snapshot can carry or resurrect them (the boardFor pattern).
4. **Composition root (already landed).**
   `handler-career.ts:209-210`: `CONNECTOR_ALLOWED_USER_IDS`
   (comma-separated account ids, the resolveTestUser env-allowlist
   shape) is parsed and passed to `createCareerHost`. **No pool is
   installed in production this round** — the production pool is
   the connections-registry seam (below); allowlisted accounts get
   the honest `connector_not_wired` reply until it lands.
5. **Dispatch claim site (already landed).** `142-career-router.js:8746`,
   inside `dispatchChat`, immediately **before** the
   people-matching stop call (`:8750`):
   `const connectorTurn = handleConnector(text, c, rawText); if (connectorTurn) return connectorTurn;`
   Placement is load-bearing: after the batch/named-role/single-draft
   claims (the connector never swallows them — guard 14), before
   pmStop (allowlisted users escape the stop; everyone else reaches
   it untouched).

## Contracts every package honors

- **Gate semantics.** Non-allowlisted (or no allowlist installed):
  the claim returns null and writes nothing — the stop answers
  byte-identically. Allowlisted but no pool: exactly one result,
  `connector_not_wired`, no records. The gate decides before any
  consent/match/intro code runs.
- **State carriage.** Per-user records ride the account
  stated-facts **keyed carriage** — no new DB table this round:
  `connector_profile` key `self` `{name, needs, offers, updatedAt}`;
  `connector_consent` key `pool` `{status: opted_in|revoked, at,
  scope, version}`; `connector_intro` key = proposalId `{id,
  otherName, why, intro, at, followUpDueAt, booking}`. Values are
  JSON strings; readers must tolerate unknown fields (records
  outlive module versions). Consent/match code reads and writes
  **the turn's working set only** (`statedFactsOf(ctx)`); the host
  commits. Only the intro package writes outside the turn's own
  account, and only through the pool (next bullet).
- **The pool is the single authority for proposals.** No proposal
  state ever rides the keyed carriage or a thread mirror (the F-017
  round-2 lesson: two copies of one fact WILL diverge and a pure
  read will write the stale one back). Interface (the test/demo
  in-memory implementation is the reference):
  `getProfile(userId)`, `optedInProfiles(exceptUserId)`,
  `openProposalFor(userId)`, `createProposal({aId, bId, state,
  createdAt})`, `updateProposal(id, patch)`, `proposal(id)`,
  `proposalsFor(userId)`, `recordIntro(userId, fact)`,
  `setIntroBooking(proposalId, booking)`. Modules receive
  `(ctx, pool)` per call; no module touches a store directly.
- **Identity rule.** A turn acts only as `ctx.userId`. A decision
  is accepted only from the side the proposal currently awaits.
  Pre-intro, no text addressed to one side names or describes the
  other beyond the need/offer summary — including status replies:
  a proposal still `awaiting_a` is **invisible** to the proposed
  side (its existence is the asker's to reveal by saying yes).
- **Text contracts.** Routing shapes match the detypo'd copy (every
  claim does); the **capture parses `rawText`** — records keep the
  user's original words (CB-0441 doctrine; detypo provably rewrote
  "intros"→"intro" on this build before the fix). Every fact passed
  to `compose()` is **one sentence with its payload in it** —
  module 140 compresses each fact to its first sentence and caps
  the fact block at 6 sentences. The intro text is the artifact:
  it is delivered hand-built in the firing reply and appended whole
  on read-back, never as a compose fact.
- **Fit and why.** A proposal requires token-overlap fit ≥ 2 across
  the two directed pairs (my needs × their offers, my offers ×
  their needs). Every why clause quotes a profile field **verbatim**
  and exists only when its overlap is real — no fact, no clause.
- **Fire discipline.** The one fire point is the state transition
  `awaiting_b` + the awaited side's yes, executed in the pool
  (`updateProposal` → `intro_sent`) with `recordIntro` to **both**
  accounts in the same turn. `followUpDueAt − at` is exactly 72h.
  Booking starts `"offered"`; acceptance flips both records via
  `setIntroBooking`. **No calendar artifact is ever created or
  claimed** — real booking waits on the user's in-product Google
  connect; the intro text and replies say so.
- **Clobber rule.** The firing turn writes nothing to its own
  stated-facts working set, so the host's turn-end patch cannot
  overwrite the pool's `recordIntro` write to the firing account.
  Any future change that adds a firing-turn record write must
  re-prove guards 7+9 (both-records + exactly-once) in the same
  commit.

## Assembly order

1. Packages land standalone, each with its own unit tests, on their
   own branches. Nothing in 142/host changes in those landings.
2. Integration (this lane, this branch): bundler list + 142
   req-loads + the claim body delegates gate → consent → match →
   intro in that order; monolith internals are deleted only as
   their module call replaces them, one package per commit.
3. After each package swap: guard suite 14/14, bundles regenerated
   + `--check` ×2, node sweep failing-set unchanged vs the cea914fe
   baseline, edge suite unchanged-or-better, agent100 103/103.
4. The demo script is re-run against the assembled flow; the
   transcript is regenerated and diffed — the intro text must be
   byte-identical to the monolith's.

## Integrated guard list (adversary-first)

PROVEN = running green against the monolith build
(`tests/career-connector.test.cjs`, base 2/14 → build 14/14); the
same file runs against the assembled flow. SPECIFIED = written for
the assembly step, before any package swap is called done.

1. **[PROVEN] Gate — outsider.** Non-allowlisted user, pool
   installed: people-matching asks get the honest stop
   byte-identical; zero connector records anywhere.
2. **[PROVEN] Gate — unwired.** Allowlisted, no pool:
   `connector_not_wired`; no records; no invented person or match.
3. **[PROVEN] Consent is an act, not a side effect.** Needs/offers
   alone record a profile, write NO consent, and the profile is
   never pool-listed.
4. **[PROVEN] Opt-in durability.** Explicit opt-in commits a
   consent record with timestamp; it reads back in a FRESH thread
   (account carriage, not thread cache).
5. **[PROVEN] Revoke is real.** Revoke flips the record, unlists
   the profile, and the read-back says revoked — in product words.
6. **[PROVEN] No consent, no proposal.** A match ask against a
   profile-only (never opted-in) counterpart proposes nothing and
   creates zero proposals.
7. **[PROVEN] The full flow.** Proposal identity-free both ways;
   why cites both sides' facts verbatim; A's yes alone fires
   NOTHING (zero intro records); B is surfaced the proposal only
   after A's yes; B's yes fires the intro exactly once onto BOTH
   records; `followUpDueAt − at == 72h`; booking starts "offered".
8. **[PROVEN] One open proposal at a time** — for the asker and
   the proposed side alike; repeat asks surface state, never a
   second proposal.
9. **[PROVEN] Exactly-once under adversarial repetition.**
   Interleaved threads: A completes the flow, then says "yes to
   the match" again from her OLD thread and B from a FRESH thread —
   both surface the recorded intro, neither re-fires (intro count
   stays 1 per account).
10. **[PROVEN] Decline.** Ends the proposal, reveals nothing (the
    asker never learns who), frees both sides, writes no intro.
11. **[PROVEN] Mid-proposal revoke.** Revoking with a proposal
    open closes it (`closed_revoked`); the other side's pending
    yes can never fire an intro afterward.
12. **[PROVEN] Booking honesty.** Acceptance records on BOTH
    records; the reply names the Google-connect seam and never
    claims a created calendar event or sent invite.
13. **[PROVEN] Check-in read-back.** The intro check-in reads the
    user's own record: counterpart name, booking state, and the
    72h follow-up state.
14. **[PROVEN] Claim discipline.** For allowlisted users too, the
    connector never swallows other families (goal frame, job
    discovery, the contact-handout stop keep their owners).
15. **[SPECIFIED] Double-yes race.** Turns interleaved so B's yes
    is processed while the proposal is still `awaiting_a`: it is
    NOT accepted early (B has not been proposed to yet); after A's
    yes lands, B's yes fires — total intro count exactly 1.
16. **[SPECIFIED] Stale proposal after revoke + re-opt-in.** A
    proposal closed by revoke stays closed across the user's
    re-opt-in; a yes aimed at it fires nothing; a fresh match ask
    mints a NEW proposal id.
17. **[SPECIFIED] Cross-user isolation.** No turn by A reads,
    names, or mutates B's records (pool reads scoped by
    `ctx.userId`); B's status before any intro contains none of
    A's name, needs, or offers.
18. **[SPECIFIED] Gate flip mid-flow.** An account removed from
    the allowlist with a proposal open: the claim stands down
    (the stop answers), no decision from that account is accepted,
    and the proposal's other side is unaffected.
19. **[SPECIFIED] Record forward-compat.** A consent/profile/intro
    record written by the monolith (or an older package version,
    including unknown extra fields) is read correctly by the
    assembled modules — the swap never strands a live record.

## What remains for LIVE (unchanged by the split)

- Deploy: owner's word on the exact commit, staged checklist
  (stage-graph recipe, never the raw tree), provenance, live
  re-check incl. battery scenarios.
- The production pool implementation over the account store / 
  connections registry — brain-lane seam; until it lands,
  production serves `connector_not_wired` to allowlisted accounts
  and the unchanged stop to everyone else.
- Two real consenting people (the first real intro needs both).
- Google connect in-product for true calendar booking.
- The email sink stays SEND_DISABLED; the connector sends nothing.
