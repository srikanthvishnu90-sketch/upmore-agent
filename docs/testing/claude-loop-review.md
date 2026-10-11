# Review of the new standalone agent-loop and voice modules

Observed locally October10,2026. These modules are not bundled by
`scripts/build-financial-core.py` or wired to the application's restricted
financial executor. Do not enable financial execution through them until these
boundaries are fixed and exercised. This review does not replace the earlier
`claude-review.txt` or claim its findings are all resolved.

`packages/domain/43-agent-loop.js`:

- The gate checks a top-level amount while execution receives `item.params`.
  The reviewed amount must be the exact amount submitted.
- An absent envelope maximum can pass comparison with `undefined`. Missing
  authority limits must reject rather than imply unlimited authority.
- Confirmation executes stored mutable objects without repeating expiry,
  revocation, ownership, freshness and material-term checks at submission.
- In-memory arrays provide no transactional cross-worker single-use guard.
- Failed verification after submission can say “Nothing was changed”, although
  an upstream effect may already exist. Unknown outcomes require reconciliation.

`packages/domain/46-voice.js`:

- A phrase such as “yes, but use the other account” can be treated as approval
  before the account correction invalidates the proposal.
- An absent fee can render as “Free”; unknown fees must remain unknown.
- Completion copy can use `done` without verified provider outcome state.
- Repeated successful confirmations do not themselves create standing authority.

Coordinate ownership before changing these shared collaborator files. Tests of
these standalone modules are not evidence for live payments or Messages delivery.
