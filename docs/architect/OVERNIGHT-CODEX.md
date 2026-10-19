# Overnight run for Codex

The owner pastes the block below into Codex as its first message. Before that, the owner sets `OPENAI_API_KEY` as a
secret in Codex's environment settings (never in chat). Everything Codex needs is in this file and the orders it names.

---

You are the builder for Trainee, a job-search agent people text. Tonight you work alone, without stopping to ask, until
the queue below is done or the night ends. Read `AGENTS.md` first; every rule in it holds. Then work this queue in
order. One branch and one PR per item, each PR into `trunk`; never merge.

**Queue**
0. Baselines (10 minutes, before anything else). Run `deno run -A evals/career/run.ts --brain router --label router-2026-10-20`
   and `deno run -A evals/career/run.ts --brain agent --label agent-2026-10-20-r0`. Commit both result files in one PR
   `Eval baselines 2026-10-20` with the pass rates, the failing ids and the cost. If `OPENAI_API_KEY` is missing, the
   runner prints `NOT RUN`: say so in that PR and skip item 7.
1. WO-009b-1, the apply queue (`docs/architect/work-orders/WO-009b-apply-worker.md`).
2. WO-009b-2, real form snapshots.
3. WO-009b-3, the fill-readback harness.
4. WO-009b-4, `scripts/apply.ts`.
5. WO-009b-5, the worker pull loop.
6. WO-009b-6, the coverage benchmark.
7. WO-016, the agent brain to the bar (`docs/architect/work-orders/WO-016-brain-to-the-bar.md`), up to 4 rounds.

**How every item is done**
1. `git fetch origin trunk`; branch from `origin/trunk`, or from the previous item's branch when the item depends on it
   (say so in the PR).
2. Write the item's tests first and run them: paste the failing output in the PR. Then build until they pass. A test
   that never failed proves nothing.
3. Touch only the files the item lists. If you must touch another, say which and why in the PR.
4. Prove it before pushing: the item's tests; `bash scripts/gate.sh` (paste every `STEP` line and `GATE OK`);
   `node --test tests/*.cjs` compared with trunk (no new failure); `bash tests/db/run.sh` when the item has SQL.
5. Open the PR `WO-<id>: <title>` with: what changed in bullets; the failing-then-passing test output; the gate lines;
   the acceptance results with numbers; what you could not do and why. Then start the next item at once.
6. Blocked? Write exactly what blocks you in that item's PR (or a draft PR), skip only what is blocked, and continue
   with the next item that does not depend on it. Never stop the night on one blocker.

**Usage**
- Your own compute: use what the night needs; prefer finishing an item over polishing one.
- OpenAI API (`OPENAI_API_KEY`): only for items 0 and 7, `gpt-5-mini` only, at most $25 for the whole night. Print
  each run's cost and stop model runs before the total passes $25. Never Anthropic.

**Real websites**
- Allowed: GET requests to public job boards and their public JSON APIs (Greenhouse, Lever, Ashby, SmartRecruiters) to
  capture fixtures and read questions, one request per page, at least 2 seconds apart.
- Allowed: `scripts/apply.ts` in `--dry-run` on at most 10 real public Greenhouse or Lever postings, to the final review
  page and no further, at least 60 seconds apart, results in the PR.
- Never: click submit on a real employer's site; use `--submit` anywhere but the local fixture server; log in anywhere;
  touch LinkedIn or Indeed; solve a captcha; send an email or a text to anyone.

**Never** (also in `AGENTS.md`): deploy, apply a migration to a live project, create a credential, put a key, password
or code in chat, logs or the repo, invent a fact or a form answer, edit an architect test or `evals/career/messages.json`,
skip or weaken a test.

**Finish** with one last message listing every PR (number, title, one-line result), the eval pass rates and the night's
OpenAI cost.

---

## Why this queue
- Submission is the product and has never happened: items 1–6 make one application real and safe end to end and give
  the first honest coverage number; the owner can send his first application the next morning.
- The brain has never been graded: items 0 and 7 turn "we think it works" into a pass rate on the real model, against
  the D-008 bar (≥ 80% and ≥ router + 40 points).
- Every item is defined by tests and commands, so done is checkable, not a matter of opinion.

## The architect, in the morning
Review and merge in order; run the owner's first `--dry-run` with him; turn the coverage report's top missing questions
into the next order; decide with the owner on account-gated portals (D-013).
