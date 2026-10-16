# Inherited C37 inspection — no product or test changes

Source inspected and reproduced: **a25b874ba4a065ecb9d722d9a6815c201311ff29**.

## Finding

The R2A C37 guard has **two stale expectations**, rather than a reproduced queue-halt routing defect in the local staged path. Its first failure pins the outer handler to 141, but the later router safety layer intentionally handles the stop turn through 142 and calls **141.haltQueue**. The same typed halt result and reply are preserved. The old literal `Nothing was sent` assertion is also obsolete and is masked by the first failure; the current zero-send wording is `Nothing went out from this queue at all, and nothing irreversible exists`.

## Minimal reproduction

```sh
node --test --test-name-pattern=C37 tests/career-gauntlet-r2a.test.cjs tests/career-gauntlet-r3.test.cjs
node /workspace/upmore-recovery-artifacts/20261016/c37-inspection/reproduce.cjs /workspace/upmore-flexible-final-verification
```

The unchanged original guards produce **one pass and one failure**: R2A fails its handler identity assertion, while R3's queue-halting/persistence/late-event behavior passes. The standalone probe runs the actual pilot dispatch order 120 → 130 → 142 → 141 with the original R2A and R3 synthetic queue fixtures, then a mixed sent/in-flight/pending fixture. Each has **7/7 behavior checks**, including a direct comparison with 141.haltQueue, native file readback, correct counts and duplicate/out-of-order event refusal. No source or test assertion was patched.

Original R2A fixture result:

- Outer handler: `142-career-router.handleChat`.
- Intent/status: `queue_halt` / `completed`.
- Three pending items halted; global pause and halt persisted.
- Typed result and reply match a direct 141.haltQueue invocation.
- Both historical checks (`handler === 141`, literal `Nothing was sent`) are false, while `halted_count === 3` is true.

The mixed fixture accounts for one previously delivered item, one unconfirmed in-flight item, and one newly halted pending item. It does not claim the prior delivery never happened or that an uncertain effect was undone.

## Expected behavior before any repair

An explicit first-person stop must immediately set the global pause, halt all pending/queued outreach, persist the halt, report verified counts and existing/in-flight outcomes truthfully, and reject duplicate or late events that try to revive halted items. Handler-file ownership and one exact English sentence are not the user-facing halt contract. Router 142 delegating the write to 141 satisfies that behavior in this reproduction.

If Muse authorizes a test-only repair, keep these behavioral assertions and revise the stale ownership/copy expectation to match the documented delegation and truthful zero-send meaning. Do **not** reroute the product back to 141 solely to satisfy this old assertion. No change is made by this inspection, and the original red test remains red until reviewed. This finding does not establish any hosted browser, email or model outcome.

## Source evidence

- `tests/career-gauntlet-r2a.test.cjs:300–307`: old handler and literal-copy assertions, introduced at 3192affe3 on 2026-10-13.
- `scripts/career/gauntlet/pilot-lib.cjs:239–240`: router 142 executes before doorstep 141.
- `packages/domain/142-career-router.js:5970–5973`, called at 6083: explicit comment that 141 owns the write and its typed result is returned verbatim; introduced at be86307a8 on 2026-10-15.
- `packages/domain/141-career-doorstep.js:822–830`: intentional counted-reply/copy change at 155b73b98 on 2026-10-14, after the guard's copy assertion.

All effects were confined to disposable synthetic queue files. No provider calls, paid tests, actual sends, credentials changes, deployment or GitHub publication occurred.
