# Fresh-profile ownership review handoff

This review-only branch uses product source base `ebd80005af8c1d38c2669f57ea45c0b1a743b62c` and the unchanged pending QA gate from `339c6ac1db7704868067adf281c4817a2b7d58cf`. Canonical `supabase/functions/_shared/agent/career_tools.ts` is byte-identical to that source base. The proposed patch is included for its source owner to review and has not been applied.

`writer.patch` changes only the fresh-profile initializer in `profileOf`: `createProfile({ user_id: c.userId })`. It carries the authenticated context owner when creating a profile. The existing nullish assignment retains an existing profile and its owner. This proposal addresses the missing fresh-profile owner; the distinct legal-name boundary belongs to a separate fix.

The patch SHA-256 is `70602200e40c120ba325fc490e389546c2a2d93fa68325bb8de4f164f4abf5fa`.

## Recorded baseline

The pending gate at `tests/architect/pending/typed-writer-owner-legal-name.test.ts` has **3 PASS / 2 FAIL** on the source base. `baseline.log` preserves the existing local run. The failures are the missing fresh-profile owner and the separate full-name-to-legal-name assertion. The three passing controls preserve actual source events, refuse guessed first/last names, and refuse a foreign profile owner.

`typed-writer-boundaries.jsonl` preserves six recorded synthetic observations, byte-for-byte. With a fresh profile, the actual writer persisted two confirmation events but no profile owner, so Full name and Email stayed questions. With an explicitly owned seed, both fields filled from their actual source events. Legal name was also filled from Full name in that seeded control, recording the separate legal-name issue. All identities and events in this evidence are invented local fixtures.

## Portable repro

Use a Deno executable with the project dependencies already cached. The pending gate uses repository-relative imports; no path from the recording machine is required. The original test remains pending and byte-identical to commit `339c6ac1db7704868067adf281c4817a2b7d58cf`.

```sh
export DENO=deno
bash review/fresh-profile-owner/run-tests.sh all
# Recorded baseline: 3 PASS / 2 FAIL; a nonzero exit is expected.
bash review/fresh-profile-owner/run-tests.sh owner
# The isolated fresh-profile ownership case fails on this baseline.
git apply --check review/fresh-profile-owner/writer.patch
```

The runner denies network and executes only local synthetic tests. For source-owner evaluation in a disposable checkout, apply `writer.patch` and rerun the owner case. This package records no after-patch result and no live or full-CI result. `verification.json` records exact source and artifact identities. The existing correction handoff is maintained on its separate branch and is not changed here.
