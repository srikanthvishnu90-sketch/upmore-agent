# Playbook drift — 2026-10-16

## Module 130 correction persistence

The old module comment claimed corrections should also live in an identity-keyed
process store, and the C03/SH03 harness restart setup discarded the saved profile
then depended on that store. This confused a stale source import with committed
profile persistence and allowed one user's correction to enter another user's
profile, even after a rolled-back save.

Source of truth: the existing `handler-career.ts` and `career_persistence.js`
commit the corrected profile JSON and reply atomically through
`career_host_commit`. New staged HTTP tests against real local PostgreSQL prove
that path, including SQL rollback, exact replay, revision races and erase epochs.
Module 130 now keeps no global correction authority; compatibility APIs are inert.
C03/SH03 restart setups round-trip saved profile JSON and explicitly label that
simulation. Historical reports of correction-store replay are evidence of the
old behavior, not a supported current persistence contract.

See `docs/career/correction-authority-privacy-20261016.md` and the failed baseline
and final logs under `docs/testing/runs/correction-authority-privacy-20261016/`.
No new persistence infrastructure or production migration is part of this fix.
