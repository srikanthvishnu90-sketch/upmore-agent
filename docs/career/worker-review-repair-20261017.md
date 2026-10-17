# Worker review repair — source contribution

Base: `2ac4bd3a7983e64a0eb4853831f4c625010c8238`. Shared release remains
`f67db048599db308f2691a7be7feada841143da5`. STRUCTURAL_ONLY; source and isolated
synthetic PostgreSQL, with no genuine browser, employer, hosting or paid outcome.

| Confirmed review gap | Repair and regression |
| --- | --- |
| Missing `lastCapture` API prevented receipt preservation | Module 150 exposes `captureReceiptEvidence(expectedId, target)`. It binds the immutable private submit capture, copies its original PNG, refuses a different ID or missing frame, and never captures a later page. The service test uses the actual 150 adapter through a trusted mocked command transport, not a getter stand-in. Missing frames remain BLOCKED. |
| One-result budget exited at review | The runner counts terminal application lifecycles, stays scoped to one task through review/approval/unknown/reconciliation, and stops on bounded idle, uncertainty, errors, transitions or total runtime. Restart preserves its existing active task; multiple active checkpoints require handoff. |
| Parser read `received` as an ID | An explicit ID/number/no/# label and reference token containing a digit are required. The actual adapter extracts `LOCAL-ABC123` from the reported text, and refuses a second submit. Success prose alone supplies no reference ID. |
| Detached child inherited backend environment | A named benign environment allowlist excludes backend keys, proxy variables and Node injection settings. The child remains attached, handles termination, detects parent death and has a hard 15-minute lifetime. Harmless real Node subprocess tests cover filtering, SIGTERM, TTL and abrupt parent death. Chromium is not launched by these tests. |
| Idle review retained private data after erase | Every poll audits the active task plus ten rotating local checkpoints against the existing account epoch. Revocation removes spec/review/result/asks/authority and private evidence, preserving a minimal unknown-submit tombstone. It never resets an uncertain task to queued. |
| Direct submit/CAPTCHA PNGs bypassed limits | All helper capture paths use one bounded viewport-buffer writer, private 0700 directories and 0600 exclusive files. Limits: 10 MiB/frame, 16 files and 64 MiB/task; configured root: 128 files/128 MiB. Frames expire after 15 minutes. Descriptors carry `expiresAt`; polling marks expiry, and a referenced local janitor continues after graceful runner completion while RPC/browser resources close. Explicit shutdown purges immediately. Quota/capture failures are visible; they cannot authorize another submit. |
| Claim committed before local checkpoint | A persisted private worker UUID plus deterministic owner/intent/task request identity selects new service-only owned-claim/readback/pending RPCs. Lost acknowledgements are read back before any retry. Claimed work without admitted effects can be rediscovered by the same worker after death. Expired claims require an observed generation CAS, rotate the lease, and fence stale reserve/consume/finish calls. Any admitted effect prevents checkpoint-free recovery; unknown submits stay fenced. |

`supabase/sql/proposals/career_owned_claim_recovery_v1.sql` is an unapplied
forward proposal following the existing task and public-research schemas. It
uses the existing owner advisory lock, account/version/epoch and effect ledger.
It does not introduce another account authority or alter existing client access.
The new owned lease lasts at most five minutes and never extends intent expiry.
Only the proposed operator configuration enables its durable worker identity;
legacy injected adapters retain their original API until explicitly integrated.

Epoch cleanup occurs after the current bounded command, then at the next poll
for the active pilot. Other checkpoints are visited in at most
`ceil(checkpoint_count / 10)` polls, plus bounded authority-call time. Authority
read failure blocks dispatch and cannot falsely certify an epoch. Abrupt host
death cannot run a janitor; the owner still needs the approved private-disk
retention/destruction arrangement. A restart audits existing checkpoints.

Fail-first evidence: the original parser returns `received`; the original runner
exits at review; idle review remains private after epoch change. Four focused
tests fail against the pre-repair source. Five capture-policy regressions also
fail against the exact original source. Five recovery cases fail before the
new proposal is installed in isolated PostgreSQL. The initial adapter test
attempt without the new transport seam only demonstrated the missing browser
binary, so it is excluded from the defect evidence. No screenshot is invented.
Final commands, counts and hashes are recorded in the accompanying test run.

## Remaining Greenhouse/runtime blockers

The real employer adapter remains disabled by the existing loopback guard.
This repair is not the missing native Greenhouse form/upload/receipt adapter,
confirmed applicant-memory/artifact binding, an approved image build or a live
application. Public form/network capture was denied by the executor proxy
(`Tunnel connection failed: 403 Forbidden`); no bypass was attempted. Existing
recorded field metadata is not a current HTML/HAR capture. Synthetic form and
network fixtures must never be presented as current employer observations.

The normal Chromium attempt recorded separately in this workspace failed on
the executor's incorrectly owned SUID sandbox helper; no sandbox setting was
changed. Browser dependencies and source packaging do not resolve that host
failure. The connected Vercel project `upmore` was found read-only, but the
`GET /v2/sandboxes` list for project `prj_ilcOTTXLkUoAI1XpkZ981ozYaWKn`, team
`team_mn5D4XBK4MgqL0KgNlzvzfky`, was **denied with 403**. The presence of an
existing compatible worker is therefore unknown. No Vercel CLI was available;
the denied operation was not retried using another identity or credential.

The smallest hosting unblock is approved read access to that already connected
project/team, followed by an already-owned compatible unprivileged Linux
worker. Any resource, existing credential/artifact binding and Muse deployment
still requires the separately specified owner authorization. Browser allocation
and spend remain **$0**, employer applications and new screenshots **zero**.

## Verified source packet

Source commit `2ea6d6ca50780c0e07b2b4db20237f2449a78380`: **272 tests pass**,
including **65 real isolated PostgreSQL contracts**, with no skips in the
recorded suites. The four frozen assertions retain SHA-256
`bb64691e4539c696554c043be6648c53c4983c3abc98fa0a11778d3c48949b90`.
The deterministic source archive contains 23 files, SHA-256
`dc73eb1c5b9e2e5a7bd2d440cf6529e9252b9b482c794606afb0e03d04131ef0`.
It contains neither a runnable browser image nor operator secrets/configuration.
Commands, passing test names, log hashes, source digests and preserved fail-first
logs are in `docs/testing/runs/career-worker-review-repair-20261017/results.json`.
Shared release and the previous review branch were checked read-only and left
unchanged. No merge or deployment was performed.
