# Router before/after eval (2026-10-22): scope, spend ledger, fallback

**Approved:** Vishnu, 21:43 CDT, up to **$5 total** (relayed by the steering agent). This approves the comparison only. It is not a quality waiver, it does not authorize a deploy, and it allows no submissions.

## Scope
- **Set:** the 30 clean held-out items, `evals/career/heldout-live.json` minus `heldout-burned.json` (H019–H026).
- **Configurations compared:** the router code from `cea914fe` (v248) and from `373453f3` (the candidate). Both run under this branch's harness (`run.ts --brain-root`), with the same conversation plumbing and the same two judges (gpt-5-mini and gpt-4.1-mini). An item passes only when both judges pass it.
- **Runs:** 2 per configuration, 4 in total, run in sequence and interleaved: v248-r1, cand-r1, v248-r2, cand-r2.
- **Cost:** router mode makes no brain model calls, so the cost is judge calls only.
- **Prices:** gpt-5-mini $0.25 in / $2.00 out per 1M tokens; gpt-4.1-mini $0.40 in / $1.60 out per 1M tokens (OpenAI model pages, 2026-10-22; they match `model_gateway.ts` PRICES).

## Cap enforcement (`.github/workflows/router-before-after.yml` → `scripts/eval/rba-ledger.sh`)
**As it ran (dce35d8f), the cap was not fail-closed.** The parent's review (plus Codex's on the reserve) found three defects, all reproduced locally:
- the ledger restore and the DONE check sat inside `if git fetch …; then`, so a failed fetch skipped both: spend read as $0 and all 4 runs started;
- each run got the full `--budget-usd 5`;
- the $0.60 reserve was an estimate drawn from observed cost, not a bound: nothing capped one judge call's input, and a failed call (timeout, unreadable response) was charged $0 though the provider may bill it.

A third defect turned up during the fix: on a refused rerun the commit step still force-pushed, replacing the ledger tip with one that had no result files. The run of 02:49 UTC hit none of these, because its fetch succeeded and it was the first run.

**Since 2026-10-23 (branch `arch/eval-cap-remaining`, not the triggering branch):** all ledger logic is in `scripts/eval/rba-ledger.sh`, tested by `tests/eval-rba-ledger.test.cjs` against a real git origin with a fake paid runner. A paid call happens only when every check below passes:
1. `git ls-remote` answers. If the ref exists but the fetch fails, or the fetched commit is not the one ls-remote named, it refuses. If the ref is missing while spend was recorded (`LEDGER_FLOOR_USD`), it refuses.
2. There is no DONE marker and no INFLIGHT marker. An INFLIGHT marker is a run whose spend was never recorded.
3. Every result file has a numeric cost and no unpriced call, and the total is at least the known floor.
4. remaining = `AUTHORIZED_TOTAL_USD` − recorded total (metered cost + failed calls at their whole bound), and the run's **proven worst case** fits in it. The run gets `--run-budget-usd <remaining>`, its own cap, never the full one.
5. The run's INFLIGHT marker, carrying that worst case, is pushed to the ledger before the call (write-ahead, never force).

**The proven worst case** (`evals/career/run.ts`, tested by `tests/eval-spend-bound.test.ts` against the real runner with a mocked provider):
- One call costs at most its request's UTF-8 message bytes × the listed input price, plus its `max_completion_tokens` (reasoning included) × the listed output price. Every token is at least one byte.
- A judge request over 16,384 bytes is never sent; the largest of the 240 sent on 2026-10-23 was 3,311 bytes.
- Per item: gpt-5-mini 16,384 × $0.25/M + 912 × $2.00/M = $0.005920; gpt-4.1-mini 16,384 × $0.40/M + 400 × $1.60/M = $0.007194. Together $0.013114.
- Per run of 30 items: **$0.393420**, against $0.0124–0.0130 observed.
- `--plan-only` prints that figure with no provider call. A run whose worst case exceeds its budget is NOT RUN.
- In flight, each call's bound is reserved before it goes out. It is replaced by the provider-reported cost, or kept whole when the call fails.
- A call billed over its bound stops the run.
- The agent brain has no pre-run bound, so the bounded mode refuses it.
- **Assumption:** the listed prices in `model_gateway.ts` PRICES are right. The bound is only as good as that table.

A run that leaves no priced result file keeps its marker, and every later run refuses. A refusal writes nothing.

**The 21:43 grant is closed:** `AUTHORIZED_TOTAL_USD` = `LEDGER_FLOOR_USD` = $0.050843, so every run refuses even without DONE. A new run needs the owner's new approval, raising that number in a reviewed commit.
- **Provider-side cap:** none from us. A hard limit on the OpenAI project is the owner's to set.

## Spend ledger
| When (UTC) | What | Cost | Running total of $5 |
|---|---|---|---|
| 02:49:22–02:51:47 | v248-r1 (cea914fe) 14/30 | $0.012409 | $0.012409 |
| | cand-r1 (373453f3) 16/30 | $0.013032 | $0.025441 |
| | v248-r2 (cea914fe) 15/30 (1 judge error, counted as a fail) | $0.012546 | $0.037987 |
| | cand-r2 (373453f3) 15/30 | $0.012856 | **$0.050843** |

Job run 39891633497 completed 02:51:51 UTC; DONE marker set; no further paid run exists or is queued.

**Cap review (2026-10-23), corrected:** I first wrote that the worst case was bounded at $5 because `run.ts` counts restored result files. That held only when the fetch succeeded. With a failed fetch nothing was restored, so a rerun was not bounded by real spend. The enforcement section above is the fix.

## Fallback executor (if the architect's session stops mid-run)
- **The job runs in GitHub Actions, not in this session.** A stopped session does not stop it; the results and `REPORT.txt` land on `ci/router-before-after`.
- **Do not push to `eval/router-before-after`.** That push is what triggers a paid run. On dce35d8f the DONE refusal could be skipped by a failed fetch; the fixed workflow lives on `arch/eval-cap-remaining` and refuses because the grant is closed.
- **Codex can take over:**
  - read `REPORT.txt` and `evals/career/results/rba-*.json` on `ci/router-before-after`;
  - fill in the ledger above;
  - report the per-configuration scores and the per-run costs.
  - Any new run needs fresh owner approval: the cap is spent once.
- **Manual equivalent, for a human only after a new approval:**
  1. `git worktree add /tmp/v248 cea914fe && git worktree add /tmp/cand 373453f3`
  2. Then for each run: `OPENAI_API_KEY=… EVAL_JUDGE_MODEL=gpt-5-mini EVAL_JUDGE_MODEL_2=gpt-4.1-mini deno run -A evals/career/run.ts --brain router --set heldout --exclude-file evals/career/heldout-burned.json --brain-root /tmp/<v248|cand> --brain-commit <sha> --run-budget-usd <authorized total minus everything recorded> --label rba-<run>`

## Result and failure causes (2026-10-23, architect)
**Scores:** v248 (cea914fe) 14/30 and 15/30; candidate (373453f3) 16/30 and 15/30, all both-pass. **Spend:** $0.050843 of the $5 approval. **Release held** (parent, 2026-10-23): the 95% bar is unchanged and nothing deploys.

**The router is deterministic: each configuration gave the same reply text in both of its runs.** Comparing reply text:
- 23 of 30 items give the same text in v248 and the candidate.
- 7 changed (H003, H005, H008, H009, H010, H011, H012). Only two of those changed the outcome: H012 (batch status, F-002) went from fail/fail to pass/pass, and H003 went from 1/2 to 2/2.
- **Judges flipped on identical text.** H004: the same reply failed 0/2 under v248 and passed 2/2 under the candidate. H006 and H029 also flipped. Part of the measured gap is judge noise, not router behaviour.

**Causes of the candidate's failures (run 1, 14 failing):**

| Cause | Items | Share |
|---|---|---|
| The generic fallback "I didn't catch that…" (no route; the phrase is banned) | H001, H006, H013, H014, H027, H031, H034, H035, H036 | 9 |
| Mock interview flow: a skip reads as ending the mock; the debrief gives no concrete improvement on the actual answer | H010, H011 | 2 |
| Record capture: a company stated in an earlier turn is not on the record; the watch needs a profile, with an end-state mismatch | H037, H007 | 2 |
| Acknowledgement too minimal (the judges split) | H002 | 1 |

In all, 12 of 30 final candidate replies are the generic fallback. 2 of those still passed, because the phrase isn't banned on those items.

**Fixes:**
- **Architect:**
  - Route the fallback families to the modules that already exist:
    - greeting and self-introduction (130);
    - off-topic refusal;
    - "nothing goes without my yes" (safety answer);
    - application status / none attempted (126);
    - interview prep plan (127);
    - submission field walkthrough;
    - resume on file;
    - career change paths (134);
    - field + location search (121);
    - onboarding needs (130).
  - Replace the fallback text: an introduction plus one question, and never the banned phrase.
  - Measurement: pin judge sampling where the API allows it, otherwise score each item k-of-n, before the next paid claim.
- **Muse:**
  - 127 mock interview: a skip moves to the next question and the mock stays open; the debrief names one concrete improvement on the answer given.
  - The record keeps a company stated in an earlier turn (H037).
  - The watch-needs-profile end state (H007).

**Eval-set integrity:** the clean-30 cases were read and used to diagnose these failures, so they are now contaminated for measurement. **The next quality claim needs a fresh held-out set** that the builders have not seen. Re-running these 30 proves nothing. Spend: the rest of the $5 is not a grant. Any further paid run needs the remaining-cap fix (this branch) verified, and a fresh approval.
