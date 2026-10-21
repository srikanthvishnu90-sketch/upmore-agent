# TEST Messages approval verification

Scope: invented local actors and fixtures; no real employer action, production access or provider calls. The integration base is `41939ceb59ef87f3e870ccd6a761913c5e3f0de4`. Landing instructions are in [MESSAGES-APPROVAL-CARD-TEST.md](MESSAGES-APPROVAL-CARD-TEST.md).

## Evidence retained before the server mutation fix

| Check | Before | After | Evidence |
| --- | --- | --- | --- |
| Actual Messages history/live wiring and authenticated own-RPC adapter | 0/4 | 4/4 | `tests/career-approval-messages-integration.test.cjs` |
| Sandboxed Chromium, original eleven tap/disclosure mechanisms | 6/11 | 11/11 | Baseline run [39685046200](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39685046200), fixed `d65dcdeb` run [39685204887](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39685204887) |
| Updated real browser suite, including attachment-only refusal | — | 12/12 | `c007a70a` run [39686229262](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39686229262) |
| Renderer, Messages, existing chat and export checks together | — | 47/47 | `c007a70a`, Node tests listed in the landing instructions |
| Actual PostgreSQL nonce/mint/consumer/replay/expiry and resume identity checks | — | 47/47 | SQL source from `38121fdf`, integrated as `661dfc2d`; clean-database run [39686229247](https://github.com/srikanthvishnu90-sketch/upmore-agent/actions/runs/39686229247), database job |

Independent QA then reproduced a separate server defect: after a legitimate new-card tap, the existing consumer accepted a changed answer value, resume fingerprint, URL or company. It compared field names and fact IDs while trusting a caller's freshly recomputed payload hash. The frozen actual-consumer matrix scored **3/19**: each of the four mutations consumed approval and created a job, while the unchanged positive worked. This is a failing baseline, not a passing render-path claim.

The positive fixture's file detail was corrected to the actual DOM reader's `SHA:size:MIME` representation before freezing that matrix. The four mutated values were preserved. Tests execute inside local synthetic transactions and roll back; they never submit a form.

## Completion boundary

The final branch must also pass the frozen mutation matrix, keep a rejected mutation from consuming its approval or leaving a queue job, and accept the original exact payload once. Message deletion, TEST disablement, expiry and queued-job binding require separate checks. A renderer-only pass cannot establish this boundary.

The actual deployed TEST-profile sequence remains **NOT_RUN** in this environment. Claude must return the landing evidence described in the companion document. No production deployment is claimed.

## Cost ledger

This branch, local SQL, QA and browser CI: **$0 new provider spend**. Earlier comparison known cost: mini **$2.258950** + higher **$6.244150** = **$8.503100**; **$0.070743** remains held for one unresolved call. Final comparison cost is **UNRECONCILED**. No paid run or remaining-63-case finish was launched here.
