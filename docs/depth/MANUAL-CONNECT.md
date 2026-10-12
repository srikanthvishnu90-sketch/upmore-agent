# MANUAL-CONNECT: guided manual connect, the read-only lane for platforms with no API (packet added for G4)

Owner addendum 2026-10-11, decision 1 (settled): no password storage, session-only. The person opens a live window on the
platform's own sign-in page, logs in themselves and does their own two-step check; Upmore never sees or keeps a password
or a code, keeps only the encrypted session (auth method LIVE_SESSION / `manual_session`), and uses it to read balances and
holdings, never to write. This packet covers the policy module `packages/domain/78-manual-connect.js`: the consent the
person reads (recorded verbatim), the playbook a platform needs before it is offered, read-only enforcement, session
health, the honest status line and the log scrubber. The live window and the Vault session store are the host's
(`supabase/functions/_shared/manual_connect.ts`, tested in `tests/edge/manual-connect.test.ts` with MOCK browser and DB).
Design: `docs/connector-matrix/guided-manual-connect.md`.
Check: `node --test tests/depth-MANUAL-CONNECT.test.cjs && node evals/depth/run.cjs MANUAL-CONNECT`.

## Bugs this packet found (each test written red first; logged in docs/playbook-drift-2026-10-12.md)

- **S08** A playbook click step "Pay now", "Send money", "Cancel plan", "Add funds", "Accept", "Rebalance" or "Link bank"
  passed validation, although the module says a step that could move money or change anything is refused. The write
  words now include them; "Log in", "Sign in", "Portfolio", "Accounts" and "Statements" still pass.
- **S14** A page that changed twice told the person "I'll tell you when it works again", but a broken session is never
  polled again (`due()` is connected-only) and a recovery says nothing, so the promise was never kept. The message now
  says the numbers won't update until it can be read again.
- **S19, S20** The log scrubber kept a cookie pair inside a header line (`Cookie: sid=...`, `set-cookie: sid=...; Path=/`)
  or a URL (`?token=...`), although the design doc says cookie strings are masked, and kept keys named `credential`,
  `pin`, `mfa`, `2fa`, `pwd`, `pass`, `jwt`, `csrf` or `sid` (the host already refuses `credential` and `pin` in a request).
  Both are masked or dropped now; ordinary keys (`shipping`, `inside`, `signed_in`) and plain errors stay.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | The consent promises no password or code | the consent says Upmore never sees or keeps a password or code | `S01` in tests/depth-MANUAL-CONNECT.test.cjs | the no-password sentence is dropped from the consent | proven |
| S02 | Only an explicit yes | 'yes', 1 or a missing answer is not consent | `S02` in tests/depth-MANUAL-CONNECT.test.cjs | any truthy answer counts as consent | proven |
| S03 | The exact words are recorded | the record's text is the whole consent | `S03` in tests/depth-MANUAL-CONNECT.test.cjs | only the first sentence is recorded | proven |
| S04 | Sign-in on https only | an http login page fails | `S04` in tests/depth-MANUAL-CONNECT.test.cjs | plain http passes the login check | proven |
| S05 | Signed-in and signed-out texts | an empty signed_out_when fails | `S05` in tests/depth-MANUAL-CONNECT.test.cjs | the signed-out check is gone | proven |
| S06 | Reads only balances and positions | a password or account-number read fails | `S06` in tests/depth-MANUAL-CONNECT.test.cjs | any named field can be read | proven |
| S07 | No buy or sell click | Buy and Sell all fail validation | `S07` in tests/depth-MANUAL-CONNECT.test.cjs | buy and sell are missing from the write words | proven |
| S08 | No pay, send or cancel click | Pay now, Send money, Cancel plan fail validation | `S08` in tests/depth-MANUAL-CONNECT.test.cjs | the write words stop at the original list (the gap this packet found) | proven |
| S09 | Verified names its live run | verified with verified_on null fails | `S09` in tests/depth-MANUAL-CONNECT.test.cjs | only a missing verified_on is caught, null passes | proven |
| S10 | Read verbs only | change_setting and delete_account are refused | `S10` in tests/depth-MANUAL-CONNECT.test.cjs | a denylist of order words replaces the allowlist | proven |
| S11 | A good check clears failures | a blip after a good check is still a blip | `S11` in tests/depth-MANUAL-CONNECT.test.cjs | a sign-in does not reset the failure count | proven |
| S12 | Signed out said once | the second signed-out check is silent | `S12` in tests/depth-MANUAL-CONNECT.test.cjs | the sign-out is said on every check | proven |
| S13 | A blip is not broken | one failed load stays connected | `S13` in tests/depth-MANUAL-CONNECT.test.cjs | one failed load is broken | proven (also fails S11) |
| S14 | No unkept promise when broken | the broken message says the numbers won't update, never 'I'll tell you' | `S14` in tests/depth-MANUAL-CONNECT.test.cjs | the message promises a follow-up the health job never makes (the bug this packet found) | proven |
| S15 | Disconnected stays disconnected | a signed-in check on a revoked session changes nothing | `S15` in tests/depth-MANUAL-CONNECT.test.cjs | the revoked check is gone | proven |
| S16 | Only connected is polled | needs_login, broken and revoked are not due | `S16` in tests/depth-MANUAL-CONNECT.test.cjs | every session but a revoked one is polled | proven (also fails S14) |
| S17 | Over a day old is said | 25 hours since the last check says so | `S17` in tests/depth-MANUAL-CONNECT.test.cjs | stale means a week | proven |
| S18 | Secret keys dropped however deep | a password three levels down is gone | `S18` in tests/depth-MANUAL-CONNECT.test.cjs | only top-level keys are checked | proven |
| S19 | Cookie strings masked anywhere | Cookie: sid=..., set-cookie and ?token= are masked | `S19` in tests/depth-MANUAL-CONNECT.test.cjs | a cookie pair is masked only at the start of a string or after ';' (the gap this packet found) | proven |
| S20 | Short secret key names | credential, pin, mfa, 2fa, totp, pwd, jwt, sid are dropped | `S20` in tests/depth-MANUAL-CONNECT.test.cjs | the key list stops at the long names (the gap this packet found) | proven |
<!-- results:end -->
