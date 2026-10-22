# Submission-completion notification — contract (owner commission 2026-10-21, item #4)

## The gap

An application submission could complete with the employer's own
confirmation and the applicant heard nothing from the product: no
point in the submission path emitted a completion notification. The
Gusto submission flow approved 2026-10-19 is the standing evidence —
the drive machinery ran, and no completion notification existed to
fire.

## What was built (module 149 only, branch feat/submission-completion-notify)

`buildCompletionNotification(evt)` and `emitCompletionNotification(deps, evt)`
in `packages/domain/149-career-portal-apply.js`, hooked at every point
where a submission becomes employer-confirmed:

1. `submitDoorstep` — the board's `accepted` outcome at the click;
2. `reconcile` — the board read-back confirming a timed-out submit
   landed (new optional `ctx` argument; existing callers unchanged);
3. `resolveUnknownOutcomes` — a record resolved to submitted by an
   employer-side read or an inbox confirmation.

`runApply` forwards `inp.notifyDeliver` into the submit context, so
the chat doorstep path and any direct `submitDoorstep` caller can
supply the sink through the existing seams.

## Invariants (all guarded by tests/career-submit-completion-notify.test.cjs)

- ONLY an employer-confirmed submission notifies. Any other status —
  unknown_outcome, captcha handoff, prepared, blocked — emits
  nothing. An unknown outcome is never worded as submitted.
- A "submitted" claim with no employer confirmation attached (no
  confirmation ID and no confirmation text) never notifies
  (`no_employer_confirmation`) — the BUG-208 lesson.
- The notification carries employer name, role, and the confirmation
  reference/text exactly as the employer returned them. Fields the
  path does not know stay null; nothing is invented.
- Exactly once per application: dedupe rides the submissions ledger
  the submit path already writes. A
  `submission_completion_notification` marker is appended ONLY after
  the sink accepts delivery; replays through any other completion
  path find the marker and stay silent. A sink that throws marks
  nothing — a later path with a healthy sink still delivers, once.
- The submit itself can never be broken by notification: unwired
  sink = honest no-op (`notify_not_wired`); throwing sink =
  `deliver_failed`, submission state untouched.

## Wiring status — read before claiming delivery

Repo-only. Module 149 owns no channel and sends nothing. Delivery
goes to the injected sink (`ctx.notifyDeliver` /
`inp.notifyDeliver`); NO production caller wires a sink yet — the
chat host / batch worker composition must pass a `deliver` function
backed by the product's outbox at deploy time (owner's tap). Until
that wiring ships, live completions still emit into the void
(no-op), exactly as before this branch — this branch is the
mechanism + guards, not a live notification.

Tests wire a disposable in-memory sink only. No real send, no real
submission, no deploy. `CAREER_AGENT_SUBMIT` is left untouched: no
code in this commit reads or writes it (the name appears only in
prose — this doc, the ledger row, the claim line — stating exactly
that).

## Acceptance evidence

- Fail-first (final test file vs unmodified 149 @ 75bc4cd2):
  `node --test tests/career-submit-completion-notify.test.cjs` →
  5 fail / 2 pass (the 2 passes are the negative cases).
- Fixed tree: same command → 7/7 pass.
- Neighbor suites: portal apply / submit-path / caps / collision /
  payload-binding / answer-map / unknown-outcome resolver /
  doorstep-safety / router-bundle / bundle-reachability → 75/77,
  the 2 fails (fact-bank coverage forcing tests) identical on the
  pristine base. Submit-integrity + batch-delegation +
  loop-acceptance → all green except 9 Chromium-tier fails,
  identical on the pristine base (environment class).
- Bundle: `python3 scripts/build-router-core.py` regenerated
  `supabase/functions/_shared/router_core.js`; the diff is confined
  to the 149 section (+95/−3).

## Rollback

Revert the single commit. The only persisted artifact the feature
adds is the additive ledger marker record
(`kind: "submission_completion_notification"`), which no existing
reader depends on; leaving markers in a persisted ledger after a
revert is harmless. No migration, no schema change, no flag.
