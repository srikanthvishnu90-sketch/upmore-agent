# WO-083: a correction replaces what it corrects

## Why: found by prompting Trainee (live task battery, T13)
The person said where they live, then corrected themselves: "sorry, I meant Denver". The agent did two wrong things:
- it kept the wrong city next to the new one;
- it saved the correction sentence itself as a fact.

The prompt already said "a correction replaces what it corrects", but nothing in code held it, and there was no tool
that could replace a fact. `add_profile_fact` could only add.

Owner (2026-10-20): "When a person corrects themselves ('sorry, I meant Denver'), the corrected value replaces the old
one. The wrong value is removed, never kept next to the new one, and the correction sentence itself is never saved as a
fact. Bug law: ledger entry + a fail-first guard that stays in the suite."

## Defect entry (D-006: the bug ledger is frozen, so the entry lives here)
| Field | Entry |
|---|---|
| Found | Live task battery, T13 (agent brain) |
| Symptom | Two location facts on file (the wrong one and the right one); "sorry, I meant Denver" saved as a fact |
| Root cause | No replace path for a fact; no code check that a fact's text is not a correction; the prompt line alone was not enforced |
| Fix | `factRefusal` refuses a correction sentence; `add_profile_fact` refuses a correction of a fact already on file and names it; new `correct_profile_fact` replaces it in place |
| Guard | `tests/architect/wo-083-corrections.test.ts`, 7 tests. Tests 1–5 and 7 failed first; test 6 is a no-regression check |
| Status | Fixed on `wo/083-corrections`; the next battery run's T13 measures it live |

## What changed
**`career_tools.ts`**
- **`CORRECTING`.** The person's message says they are correcting: "I meant", "my bad", "scratch that", "typo",
  "sorry, it's …", "no, I'm …", "not X, but …".
- **`factRefusal`.** A fact whose own words are an apology or an "I meant" is refused: "not saved: that is a
  correction, not a fact".
- **`add_profile_fact`.** When the message is a correction and a fact on the same topic is already on file from an
  earlier turn, it refuses. The refusal names `correct_profile_fact` and each fact it could correct, so the old value is
  never kept beside the new one.
  - The profile files location, goal and other unknown kinds as "other". So the kind the model asked for is kept on the
    fact as `topic`, and the match uses it.
  - A first fact said with a correction word is still saved, because there is nothing to replace.
- **New `correct_profile_fact({id, text})`, write_own.** It refuses:
  - without a correction in this turn's message;
  - for words the person never said;
  - for the correction sentence itself;
  - for an unknown id.

  Otherwise it replaces the fact's text in place, keeping the same id, so the old value is gone. The fact goes back to
  draft (`needs_confirmation`), because any earlier yes was to the old words (D-007). The change is recorded on the
  timeline as a note naming the replaced text.

**`prompt.ts`.** The correction line now names the tool, and says never to save the correction sentence and never to
keep the old value.

**`tests/architect/wo-002-career-tools.test.ts`.** The tool set includes `correct_profile_fact` (write_own).

## Out of scope
- Standing instructions (`remember_instruction`): corrections there already go through `forget_instruction`.
- Facts saved before this change carry no `topic`. A correction of an old location or goal fact is matched as "other",
  so the refusal may list more than one candidate.

## Evidence
- `wo-083-corrections`: 7/7. Before the fix, 6 of 7 failed; test 6 passed both times.
- Architect suite: 636 passed, 0 failed.
- Edge suite: 135 passed.
- Router bundle and extension bundle checks are fresh.
- To measure: the next battery run's T13 (VERIFIED-LIVE only from that run).
