# C-02: review each architect PR on the apply path against the seven safety rules

Status: ready after C-01 · Standing card: repeat for every PR the architect opens that touches `scripts/apply.ts`,
`scripts/career/portal-browser-helper.cjs`, `supabase/functions/_shared/career_apply*.ts`, `workers/career-browser/`
or a `*career_apply*` migration.

## Base
`git fetch origin && git checkout --detach origin/<the PR's branch>`. Do not commit to the architect's branch.

## Steps
1. Read the whole diff. For each rule below, write one line: `PASS`, or `FAIL: <file>:<line> <scenario>`.
   1. Nothing is clicked "submit" unless the person typed exactly `yes` after seeing the exact payload.
   2. One posting is submitted at most once, even after a crash, a re-run, another folder or another machine.
   3. Every answer comes from a confirmed fact that the question actually asks for; nothing is invented or reused for a
      question that means something else; a contact fact never fills a checkbox, radio or select.
   4. The file uploaded is the approved resume, by sha256.
   5. No password, one-time code, API key, full card or ID number is stored, printed, logged or screenshotted.
   6. A verification (captcha) is handed to the person in a visible browser; nothing solves, hides or bypasses it.
   7. A page that leaves the employer's site stops; an unsupported site is named, never silently skipped.
2. Run, as a non-root user, and paste the summary lines: `node --test tests/career-apply-script.test.cjs`,
   `node --test tests/career-apply-forms.test.cjs`, `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`.
3. Try to break one rule with a test of your own in a scratch file (not committed). Paste what you tried and the result.

## Output
A PR review (comment) with the seven lines, the test counts and the break attempt. `FAIL` lines block the merge; the
architect answers each one in the PR.

## Done
The review is posted on the PR with all seven rule lines, the three counts and one break attempt.
