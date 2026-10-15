# Production verification protocol — Crew A (adopted 2026-10-15)

Adopted from the owner's top-agent-companies order (2026-10-15 13:06 CDT). These are standing rules for Crew A (Platform & Reliability); Crew B's gates are expected to meet the same bars before a landing is called measured.

## 1. pass^k consistency

- A fix counts as fixed only when its guard AND its affected gate pass **k = 3 consecutive runs**. Every run is recorded (command, build SHA, pass/fail counts); a failure inside the k resets the count and is reported with its mechanism, never silently re-run until green.
- A deploy parity proof (A/B chain) runs **k = 2** (repo artifacts + the actual staged artifacts), as the v222 deploy did.
- A measurement that passes once is reported as "passed 1 of k" — never as passed.

## 2. Failure taxonomy + error analysis before metrics

- Every fallback, refusal, or wrong answer in a live probe is **read as a transcript and classified** into the live failure registry (`~/workspace/your_files/upmore-live-failure-registry.md`, classes LF-01a…LF-07) before any rate is quoted.
- A rate without its per-class breakdown is not a reportable number.

## 3. Production sampling

- Fixed sampled set (v1, frozen): probes (a)–(e) + the 25-conversation E2E live subset (47 turns) + the P-set (P1–P8, 18 turns, verbatim in `~/workspace/crewa-live/pset-run.py`).
- Cadence: the full set on **every deploy**, plus a **weekly recurring pass** owned by Crew A.
- **Headline prod-health number = the fallback rate over the fixed set**, with per-class counts appended to the registry each run.
- Baseline (live v222, 2026-10-15): 22/65 = 33.8% fallback; 26/65 = 40.0% defect turns.

## 4. Canary discipline (every deploy, no exceptions)

1. Stage the artifact; record the staged file list + total bytes (staged-size discipline: the practical ceiling sits between 3,950,107 B accepted and 4,822,785 B rejected — stay near the low end).
2. Prove parity on the staged artifact (export parity + A/B chain, k = 2 per §1).
3. **Stage the rollback at a durable workspace path BEFORE the deploy call** (never /tmp-only — a VM /tmp reset wiped a /tmp rollback once, 2026-10-15).
4. Deploy to the named project only; record the new version + bundle hash.
5. Run the full fixed sampled set live (§3) after the deploy; classify every failure (§2) before reporting.
6. Write `docs/gauntlet/<sha>.md` with SHA + all numbers, and append the reports-log entry.

v222 (0526a53) retro-check against this protocol: staged artifact ✓ · parity k=2 ✓ · rollback staged before the call ✓ with one deviation (initially /tmp; re-staged durably after the reset — the deviation is why step 3 now names the durable path) · live probes after ✓ · gauntlet record ✓.

## 5. Run configuration + the noise floor (A-06)

- Every gauntlet record pins and prints its run configuration: build SHA, host class, concurrency, wall-clock window, clock state (real or faked, at what instant), staged artifact size. A number without its configuration is not evidence.
- Inter-build differences **under 3 points are reported as WITHIN NOISE** unless reproduced in a second run at a different time. A claimed flip cites its reproduction run or is labeled UNCONFIRMED.
- First case: BUG-198 (MI-001) — a clock confound that flipped SC-143 between morning and afternoon runs of the identical build. Any clock-sensitive verdict is run at two faked wall clocks before it is believed.

## 6. Suite split + graduation (A-02)

- Two suites, two bars, printed separately in every gauntlet record (template: `docs/gauntlet/TEMPLATE.md`): **REGRESSION** (everything previously passing; bar ≈100%; any dip = stop) and **CAPABILITY** (defect rows, novel conversations, absent-adjacents; a low rate is reported without shame).
- The split registry is `scripts/career/gauntlet/suites.json`, generated from the assembled gauntlet records: a scenario that passed in the last full run sits in regression; a failed or not-built scenario sits in capability.
- A capability scenario **graduates** to regression only after passing in **two consecutive full runs**.

## 7. pass^3 in the gauntlet record (A-01)

- The gauntlet prints **pass^3 beside pass@1** for the Genuine-Phrasing Gate battery and the live subset (3 runs each, same build). The 300 exam stays pass@1 (breadth). No customer-facing claim is ever made on pass@1 alone.
- The record states its pass^3 floor for the gate battery up front; a build that misses its floor is a hold, whatever pass@1 says.

## 8. Rainbow promotion gate (B-01)

- §4's canary is a formal two-window gate. **Probe window:** the new version serves the gauntlet test user only; probes (a)–(d) + the live subset run; results recorded. **Promotion:** only on the owner's tap, rollback already staged at a durable path; the gauntlet record declares the version the live build. **Post-promotion window:** the sampled set re-runs; the two windows' results are recorded **separately** — drift between windows is reported as drift, never averaged away.

## 9. Staged-size structural test (B-05)

- `tests/career-staged-size.test.cjs` runs in the sweep: it stages the career artifact with `scripts/career/stage-career.cjs` and fails when the staged total exceeds **4,200,000 B** (the practical ceiling sits between 3,950,107 B accepted and 4,822,785 B rejected). A size failure is a CI failure with remediation text — never again a platform HTTP 413 discovered at deploy time.
- Failure messages in Crew A's guards carry remediation text (which rule, which guard, which master issue). A failure must be actionable without a human translator.

## 10. Production sampling, formalized (B-02)

- **Daily light battery** (≤25 turns, inside the per-user rate window): probes (a)–(e) + the P-set. Run by the sampling cron; every failure classified into the live failure registry the same day; any S0/S1 files a master-issue entry in the same cycle.
- **Weekly full pass:** the entire fixed set (65 turns); per-class counts appended to the registry; the fallback-rate trend reported week over week in the reports log.
- **Full set on every deploy** (§4/§8 stands). Sampling jobs: `upmore-prod-sampling-daily` / `upmore-prod-sampling-weekly`; their instructions name this protocol and the registry.

## 11. Garbage collection (B-04)

- Weekly GC pass, same cycle as the weekly sampling: (i) count UNENFORCED forbidden rules — the register's index and detail sections must agree, and a disagreement is itself a finding; (ii) verify the two register copies are byte-identical; (iii) work the mechanical closables (a rule whose guard can be a tree/citation check gets it the same week); (iv) every finding opens a master-issue entry or lands as a small fix commit.
- The GC report is appended to the reports log; the UNENFORCED line moves in one direction only. Pass #1 (2026-10-15): `docs/career/gc-pass-001.md` (MI-045).

## 12. End-state grading + judge calibration (A-04 / A-07)

- State-changing scenarios are graded on end state per `docs/career/end-state-grading-standard.md`; every gauntlet record prints the percentage of state-changing scenarios graded on end state (target 100%).
- Wording figures are quoted only with their judge-agreement line, computed by `scripts/career/judge-calibration.cjs` against the owner's 40 labels (per dimension: grounded / complete / next-step / tone; UNKNOWN is an allowed judge output and counts as suppressed, not agreed). A re-judge whose agreement falls below the last recorded figure is reported as unreliable, not quoted.
