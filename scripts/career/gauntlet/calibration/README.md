# Calibration set (04 Part 2) — status

The calibration set is **120 human-labeled replies**: 80 labeled here +
the owner's 40.

## The 80 (in this folder)

`calibration-80.jsonl` — one JSON object per reply:
`{id, source, scenario_id, family, persona, ask, reply, label, reason, labeled_by}`.

- 40 from run-1 "Before" outputs and 40 from the current grand re-run
  replies, both in `~/workspace/your_files/upmore-career-300-rerun-results.md`.
- Labels assigned by the M2 grader lane per the 02 rubrics (PASS/FAIL +
  a one-line reason each). These are agent-assigned labels, stated as such
  in every row's `labeled_by` field — they are not the owner's labels.
- Breakdown: **31 PASS / 49 FAIL** (run-1 half: 31 PASS / 9 FAIL; current
  grand re-run half: 0 PASS / 40 FAIL — that half is the canned-shortlist /
  dead-end-fallback run, and its replies honestly earn FAIL under the pack;
  the class balance for calibration comes from the combined 120).

## The owner's 40 (dependency — read this)

`~/workspace/your_files/review/judge-calibration-owner-40.md` holds 40
verbatim replies (same pools, spanning PASS / FAIL / borderline) with
**blank** label fields for the owner. His labels were NOT invented or
pre-filled. **The judge's ≥90% PASS/FAIL agreement gate (04 Part 2) can
only be measured once his 40 land** — until then the gate is UNMEASURED,
not passed, and no judge score counts toward a Gate-1 verdict.

Measure it with:

```
node scripts/career/gauntlet/judge-runner.cjs agreement \
  --labels <all-120-labels.jsonl> --judgements <judge-output.jsonl>
```

## Judge real-vs-stub

Real: prompt assembly (no expected answer is ever sent), JSON-only
validation, verbatim-quote enforcement, temperature-0 config, 2 re-runs
then BLOCKED, and the agreement calculator above. Stubbed: the model call
itself, behind `modelFn` / `JUDGE_MODEL_ENDPOINT` in `judge-runner.cjs` —
no different-lineage endpoint is configured in this environment, so judge
attempts resolve BLOCKED rather than fabricating scores.
