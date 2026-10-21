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

## Queue fix and completion boundary

The Messages-only queue fix is `2327c36c` plus `acb0b883`, integrated as `90c18df6` and `82907077`. It preserves the canonical consumer and adds durable approval/job metadata plus an exact queue guard. The migration file's SHA-256 is `c72c99c7e359f7fb96c2fc19033ab980e805613f95ef00c8897382f783df60bd`; its SQL test file is `a3a9fc5aacb1ad1b22ab59d71458e2af77d37aafcb14a9ac624fac1d61390c98`. The committed SQL suite passes **128/128** on a clean PostgreSQL 16 schema, up from 47 nonce checks before the boundary work. Unknown payload/field keys have their own failing-before cases.

Independent QA reran its frozen source on the final `acb0b883` migration: **19/19 mutation checks, 6/6 deletion/lifecycle checks and 4/4 same-entry renewal checks pass (29/29)**. Each rejected mutation leaves no job and keeps the original permission unused; the original exact payload then starts once. [The reviewed verdict](evidence/messages-card-20261021/lane-b-guard-final-qa.json) records the source/function hashes and limits. The adjacent files retain all thirteen referenced probe sources, before/after results and assertions; their SHA-256 values were independently recomputed during integration. The canonical consumer's queried function hash remains `9451e0f70e0859c587c6a0ed82192986c1153467a996b8687a4c00be3bb238ae`.

The first full CI found one missing integration: the deployment runner did not list the new migration. Its existing ordering test caught that omission (2,384 passed, 1 failed, 24 skipped in that test stage). Fix `2089712d`, integrated as `51110b61`, adds only the missing sorted migration and its matching schema marker. The unchanged focused go-live suite improves **13/14 to 14/14**, and the final renderer/Messages/chat/export/go-live group passes **61/61** locally. Full final-source CI and the thirteen-case integrated browser suite must pass separately; the QA JSON was written before those jobs.

The actual deployed TEST-profile sequence remains **NOT_RUN** in this environment. Claude must return the landing evidence described in the companion document. No production deployment is claimed.

## Cost ledger

This branch, local SQL, QA and browser CI: **$0 new provider spend**. Earlier comparison known cost: mini **$2.258950** + higher **$6.244150** = **$8.503100**; **$0.070743** remains held for one unresolved call. Final comparison cost is **UNRECONCILED**. No paid run or remaining-63-case finish was launched here.
