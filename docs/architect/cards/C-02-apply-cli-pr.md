# C-02: the apply command and the queue as one reviewable PR into trunk

Status: ready after C-01 · Work orders: WO-009b-1 + WO-009b-4 · Branch: `wo/009b-4-apply-cli` (yours, at 3c75d715,
already contains 009b-1).

The owner's first real application runs `scripts/apply.ts` from trunk. It is not on trunk yet, so nothing can happen.
This card puts it there in a form the architect can review line by line. No behaviour change in this card.

## Base
```
git checkout wo/009b-4-apply-cli
git fetch origin && git merge origin/trunk
```
If the merge conflicts in `scripts/gate.sh`: take trunk's file, then re-add your test files to the same lists they were
in on your branch. Nothing else.

## Files (only these)
`scripts/apply.ts`, `workers/career-browser/pull.cjs` if present on this branch, `tests/career-apply-script.test.cjs`,
`scripts/gate.sh` (conflict only).

## Steps
1. Format `scripts/apply.ts`: `deno fmt --line-width 120 scripts/apply.ts`. Check that the diff of that commit is
   whitespace and line breaks only: `git diff --stat` then `git diff -w --ignore-blank-lines | head` must be empty.
   Commit it alone: `WO-009b-4 C-02: format apply.ts for review (no behaviour change)`.
2. Run the proofs below on the formatted file.
3. Open the PR (below). Do not merge it.

## Proof (paste the summary lines)
```
node --test tests/career-apply-script.test.cjs
deno test -A --no-check tests/edge/career-apply-store.test.ts
deno test -A --no-check --ignore=tests/architect/pending tests/architect/
bash tests/db/run.sh            # as a non-root user with Postgres on PATH; paste the career_apply_jobs lines
```

## Commit and PR
- PR into `trunk`, title: `WO-009b-1 + 009b-4: apply queue and the terminal apply command (dry run by default)`
- Body: what the command does in 5 bullets, the proofs verbatim, and one line per known limit (for example "modern
  Greenhouse React selects: <what the command does>").

## Done
The PR is open against trunk, CI is green on it, and the formatting commit changes no behaviour (empty `git diff -w`).
