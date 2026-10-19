# Overnight run for Codex (architect, 2026-10-19)

Paste the block below into Codex as its first message. It works through the queue alone; nothing in it needs the owner
until morning, and nothing in it deploys, spends money or contacts a real employer.

---

Read `AGENTS.md`, then `docs/architect/work-orders/WO-009b-apply-worker.md`. Tonight you build WO-009b, sub-orders
009b-1 through 009b-6, in that order, one branch and one PR each (`wo/009b-1-apply-queue`, `wo/009b-2-form-fixtures`, …),
each branched from the previous sub-order's branch when it depends on it, and each PR based on `trunk`.

For each sub-order:
1. Sync: `git fetch origin trunk`; branch from `origin/trunk` (or the previous sub-order's branch).
2. Build exactly what the sub-order says, touching only its Files.
3. Prove it: run the sub-order's tests, then `bash scripts/gate.sh` (paste every `STEP` line and `GATE OK`), then
   `node --test tests/*.cjs` and compare its failures with trunk's (no new failure is allowed).
4. Open the PR `WO-009b-<n>: <title>` with what changed, the gate output, the acceptance results, and anything you could not do.
5. Go straight to the next sub-order. Do not wait for review; do not merge.

If a sub-order is blocked (a fixture can't be fetched, a seam in 149/150 doesn't allow what's asked), write the blocker in
that PR, skip only what is blocked, and continue with the next sub-order that doesn't depend on it.

Never, tonight or ever: click submit on a real employer's site; deploy or apply a migration to a live project; use or
create a credential; solve a captcha; touch LinkedIn or Indeed; invent a fact or a form answer; edit an architect test;
skip or weaken a test.

By morning the owner should be able to run, on his own machine:
`deno run -A scripts/apply.ts --url <a Greenhouse posting he chose> --facts <his confirmed facts> --resume <his pdf>`
see every field it would send, and, only if he types `yes` with `--submit`, send his first real application.

---

## Why this order and not another
- Submission is the product. Alerts, chat and texting exist (WO-002 … WO-013); nothing has ever been submitted.
- 009b-1 → 009b-5 make one application real and safe end to end; 009b-6 gives the first honest numbers to compete on
  (what share of real postings we can answer, how long it takes), measured instead of claimed.
- Each step is testable offline against real form snapshots, so a builder can finish it overnight with no live access.

## What the architect does in the morning
Review and merge in order; run the owner's first `--dry-run` with him; turn the coverage report's top missing questions
into the next order (ask-once facts); decide with the owner whether to pursue account-gated portals (see DECISIONS, D-013).
