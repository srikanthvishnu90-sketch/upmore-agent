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
