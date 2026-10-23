# Router-fix 1: mock-interview "skip" advance + debrief names a concrete improvement

Branch: `muse/2026-10-22-router-fix1-mock-skip` off trunk `373453f3`.
Surface: the router's prep (127) mock session machine in `packages/domain/142-career-router.js`
(the mock the router eval drives; the WO-025 channel mock in `career_mock.ts` already
handles "skip" and an answer-tied nudge — both defects below are in 142's machine).

## Root-cause note (written before the fix)

### (a) A "skip" strands the candidate unless it is the literal first word in one of six stems

- Where: `handleMockAdvance` in `packages/domain/142-career-router.js` — the mock
  session's only advance gate, reached from dispatch only while a session is pending.
- Exact line (base): the gate is one anchored stem regex —
  `if (!/^(keep going|next question|next one|skip( this| it| that| the question)?|move on|continue)\b/.test(t)) return null;`
- Why it breaks: the instruction must be the FIRST word of the turn and in one of the
  listed stems. Every other grammatical form of the same instruction matches nothing,
  is not a narrative answer and not a debrief ask, so dispatch releases it and it dies
  on the generic fallback ("I didn't catch that…") — no next question is posed and the
  candidate is stranded on the pending question. Measured on base `373453f3` through
  the real CareerHost (production commit semantics):
  - "please skip" → generic fallback, session stuck on the pending question.
  - "can we skip this one?" → generic fallback, session stuck.
  - "pass" → generic fallback in both phases — even though "pass" is the product's own
    skip word: `career_mock.ts`'s `parseMockCommand` maps "pass" to `{kind:"skip"}`,
    and this router's own don't-know branch in `handlePrepAnswer` treats "pass" as a
    pass. The session's vocabulary disagrees with itself.
  - bare "next" → claimed by `career_guidance`, not the mock.
  The bare word "skip" happens to match the stem, which is why narrower guards passed;
  any framed, polited or question form of the same instruction fails.
- Fix: recognize the advance by the instruction's full frame, not one stem — an
  optional politeness lead-in (please / can we / could we / can i / let's / just /
  ok), the advance verb (skip / pass / next / next question / next one / keep going /
  move on / continue), an optional object (this / that / it / the question / this one /
  the probe …), an optional trailing "please". Still whole-turn anchored and still
  session-gated (a live mock with a valid store record or it returns null), so a
  narrative answer that merely contains the word "skip" is never stolen.

### (b) The debrief names a rubric dimension, never an improvement on the answer given

- Where: all three compositions that verdict/close a mock in 142 —
  `handleMockDebrief` (the "how did I do?" debrief), `handlePrepAnswer`'s completion
  branch, and `handleMockAdvance`'s `finish()`.
- Why it breaks: each builds its verdict from `Prep.mockSummary`'s `fix_first` — the
  weakest rubric DIMENSION name — and nothing else from the per-answer record.
  `mockSummary` already carries, per weak answer, `what_didnt[] = { q, scores, fix }`,
  where `fix` is 127's answer-specific feedback recorded when that answer was graded
  (e.g. the missing-result-metric diagnosis, which fires only because THAT answer
  named no metric). `handleMockDebrief` even names the weakest answer's question
  ("The answer that needs work first: …") and then stops — the improvement recorded
  for that very answer is dropped. Measured on base: the debrief reads "Honest
  verdict: your weakest area is specificity — that is the one to drill before the
  real round." plus the question text; no improvement on any answer is ever named,
  in any of the three closing paths.
- Fix: one shared helper derives the single concrete improvement from the session's
  own record — the lowest-scoring recorded answer's first feedback line (127's,
  recorded at answer time) — and all three closing compositions name it, attached to
  that answer's question. Nothing is invented: when the record holds no weak answer,
  no improvement is named and the existing weakest-area line stands alone.

## Fail-first evidence

New guard: `tests/career-router-fix1-mock-skip.test.cjs` — own synthetic candidate
and answers throughout (no eval cases used). Drives the real CareerHost with
production commit semantics, like the wave-1 mock guard.

- Base `373453f3`: **7 fail / 2 pass** — only the two controls pass on base (a
  narrative answer containing "skip" is scored as an answer; a skip form with no
  live mock is not claimed). Every framed skip form and every debrief case fails.
- Branch: **9 pass / 0 fail**.
- Neighboring suites on branch: wave1-mock-session 9/9 · prep-kb-routing 4/4 ·
  prep-completion 6/6 · lane-a-depth 35/35 · f004-mock-goal-handoff 12/12 ·
  quality-routing 11/11 = **77/77**. WO-025 channel mock (deno, untouched code):
  **15/15**.
- Full career sweep on branch (253 `tests/career-*.test.cjs`, browser file
  excluded — Chromium cannot run in this VM sandbox): **2561 pass / 205 fail**.
  All 205 failures sit in 26 apply/cloud/portal/worker files, none in
  prep/mock/router; each of the 26 was re-run on unmodified base `373453f3`
  and produced the **identical fail count** — pre-existing baseline, not a
  regression from this change.

## Adjacent observation (noted, deliberately NOT fixed — out of scope)

In the router mock, after the LAST question's answer a probe is still posed
(`handlePrepAnswer`'s question phase ignores `answerMock`'s done flag).
Answering that final probe throws "mock already complete" inside
`Prep.answerMock`; the dispatch catch silently CLEARS the session and the
candidate gets no debrief. Skip and debrief asks close the session gracefully;
a plain probe answer does not. Filed here for the owning lane.

Cases: "please skip" mid-mock (probe pending) advances and keeps the session open ·
"pass" at Q1 advances · "can we skip this one?" advances · a five-skip run in mixed
forms closes gracefully on the last question with a summary · the mid-mock debrief
("how did I do?") names the concrete improvement recorded for the weakest answer,
attached to its question · the completion close names the same improvement ·
controls: a narrative answer containing "skip" mid-sentence is still scored as an
answer; a skip form with no live mock is not claimed by the mock.

## Files changed

- `packages/domain/142-career-router.js` — the advance matcher + the shared
  debrief-improvement helper and its three call sites.
- `supabase/functions/_shared/router_core.career.js` — rebuilt bundle
  (`python3 scripts/build-router-core.py --career-only`), `--check` verified.
- `tests/career-router-fix1-mock-skip.test.cjs` — new fail-first guard.
- `PR-BODY.md` — this note.

No deploy, no migration, no merge, no flag change, no submit/approval-path edits.
No existing test deleted, skipped or loosened.
