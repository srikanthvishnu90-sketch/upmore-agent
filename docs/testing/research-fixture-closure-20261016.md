# Research fixture and SQL race closure — 2026-10-16

Tested product source: **`1b41322988df51f9704aabb593c95e79517f847a`**, on `codex/research-conversation-review-20261016`. Fixture-only commit: `07095988`. Base review: `da9e9245bcb355ee2994464743dd265ff032dfab`. Shared release remains `f67db048599db308f2691a7be7feada841143da5`; Muse owns merge/deploy. No paid/model call, production write, browser/security bypass or module-130 implementation occurred. **All 15 live browser outcomes remain NOT_RUN; model response quality remains unverified.**

Both original red author cases are now green with their assertions unchanged. Their invalid fixture data masked an additional real product bug in the review's publication-recovery change; that bug was independently reproduced and fixed, rather than weakening equality expectations. Both previously blocked SQL lock-race tests now execute and pass over a real local PostgreSQL wire connection.

## What each red case meant

| Original author case | Demonstrably invalid fixture data | Result after correcting only producer data | Product correction |
| --- | --- | --- | --- |
| `research preflight returns correlated untrusted evidence…` in [source test](../../tests/career-public-research.test.cjs#L52) | Ten bytes `89504e470d0a1a0a0000` have no IHDR/IDAT/IEND or image pixels; MIME type missing; capture time fixed at 00:00 and navigation time absent | All 12 original source tests pass; no product change needed for this case | Strict PNG/MIME/freshness/correlation checks remain intact |
| `actual Upmore text command → atomic outbox…` in [PostgreSQL test](../../tests/career-public-research-postgres.test.cjs#L27) | Same ten-byte pseudo-image, fixed capture time and missing navigation time | Capture succeeds, then the original deep equality assertion fails: central revision 6 versus worker revision 8 | Confirmed publication receipt is retained separately from mutable local checkpoint revisions, and returned unchanged on worker get/replay and chat status |

The revision mismatch was introduced by this review's earlier publication-recovery bookkeeping; it was not evidence that the malformed fixture should be accepted. [Corrected fixture / before-product-fix run](runs/research-conversation-review-20261016/fixture-corrected-pg-before/test.log) and [independent exact-receipt failure](runs/research-conversation-review-20261016/receipt-independent-before/test.log) retain the evidence. The latter also contains two separately triaged database-recovery infrastructure failures, described below.

[Original author test copies and freeze](runs/research-fixture-closure-20261016/freeze.json) remain archived byte-for-byte alongside all original red logs. [Assertion preservation](runs/research-fixture-closure-20261016/assertion-preservation.json) verifies every assertion-bearing source line is unchanged. The producer now uses an explicit synthetic 2×2 RGBA protocol image, a fixed clock injected into the unit worker, and current capture/navigation times for the real PostgreSQL test. [Independent Pillow decoding](runs/research-fixture-closure-20261016/independent-png-decoder.json) verifies exact pixels; [old fixture decoder failure](runs/research-fixture-closure-20261016/original-fixture-decoder-failure.json) confirms rejection. These are synthetic protocol fixtures, never evidence of a live screenshot.

[Six independent producer tests](../../tests/research-fixture-contract.test.cjs) accept valid fixture data and separately reject the old header-only image, missing MIME, stale capture, future capture and missing navigation time. [Exact-receipt regression](../../tests/research-conversation-independent-postgres.test.cjs#L24) requires worker return, replay, get and actual chat status to equal the central receipt. [Erasure regression](../../tests/research-conversation-independent-postgres.test.cjs#L25) checks the new confirmed-receipt copy, pending publication, result and spec are cleared after epoch erasure. No production validator, expected outcome or success assertion was relaxed.

## Verification on 1b413229

| Check | Result |
| --- | --- |
| Original author source suite, assertion bodies unchanged | 12/12 pass |
| Original author staged-entry + real PostgreSQL suite | 7/7 pass |
| Independent research source probes | 12/12 pass |
| Independent staged-entry + real PostgreSQL probes | 17/17 pass |
| Independent producer fault tests | 6/6 pass |
| Existing authority PostgreSQL suite, unchanged | 21/21 pass, including both concurrent lock races |
| Scoped conversation/routing/worker/application/staging regressions | 244/244 pass |
| Both bundle freshness checks | Pass; no domain/generator changes |

That is **319 scoped tests passing, no skips**. [Run index](runs/research-fixture-closure-20261016/results.json) records exact source, commands, counts and hashes; failed runs remain retained. The earlier 969 checks over 165 conversation turns remain evidence at their original source, and are not counted as new runs here. Synthetic auth/browser/network tests and local SQL do not establish actual model quality, production Supabase behavior or live browser outcomes.

## Restored SQL wire prerequisites

The original race tests require `pg`, `CAREER_TEST_PORT`, and a local connection held open while the Docker psql claim waits on the same owner advisory lock. The network-none fixture previously had no wire path, so those cases had not executed. Installed pinned `pg@8.13.3` into a task-only `/tmp` directory with an explicit writable cache; [package lock](runs/research-fixture-closure-20261016/pg-package-lock.json) is retained. The first npm attempt failed solely because its default cache directory was unavailable; both setup logs remain.

[Test-only transport](../../scripts/career/research-review/local-pg-wire.cjs) listens only on `127.0.0.1`, chooses a free port, verifies Docker network mode `none`, and forwards binary PostgreSQL bytes with `docker exec` and Perl `IO::Select` to the container's own `127.0.0.1:5432`. It publishes no Docker port and changes no network, auth, TLS or browser security setting. [Wire health](runs/research-fixture-closure-20261016/wire-health-v2.json) confirms both server/client addresses are loopback. The original authority test source is byte-identical to da9e9245.

[Final authority log](runs/research-fixture-closure-20261016/task-authority-wire-v2.log) records the concurrent STOP and erase tests passing: each proves the claim waits on the existing owner lock, then rejects after the control transaction commits. All 21 tests pass. [Command/environment](runs/research-fixture-closure-20261016/authority-wire-run.json) records the actual port and database. There are no remaining wire-port NOT_RUN cases.

The first transport prototype used PID-based reader cleanup; PostgreSQL logged backend signal termination/recovery during connection close. That attempt yielded 15/21 authority passes and six infrastructure failures, and interrupted two independent probe setup/authority calls. [Triage](runs/research-fixture-closure-20261016/wire-infrastructure-triage.json), original logs and database logs remain; those failures are not attributed to product behavior. Replaced it with signal-free EOF/shutdown forwarding, then reran the affected suites successfully. The loopback listener and review-owned network-none container were removed after dumps and logs were captured.

To reproduce: run the existing conversation-recovery setup, install the pinned local `pg` dependency with a writable task cache, and start `node scripts/career/research-review/local-pg-wire.cjs upmore-career-integration-pg-recovery <new-ready-file>`. Read the selected port from that JSON. Use fresh local test databases with the four schema/proposal files listed in `scripts/career/research-review/run.cjs`; run the unchanged authority suite with explicit `CAREER_TEST_CONTAINER`, `CAREER_TEST_DATABASE`, `CAREER_TEST_PORT` and the dependency directory in `NODE_PATH`. Only this disposable fixture is authorized; no remote database or production credentials are involved.

## The six earlier defects, in plain language

| Defect and resulting behavior | Exact source | Independent regression |
| --- | --- | --- |
| A twice-encoded `/apply` path slipped past the action filter; remaining encoded escapes are now refused | [URL policy line 10](../../supabase/functions/_shared/career_research_policy.js#L10) | [I04 line 4](../../tests/research-conversation-independent-source.test.cjs#L4) |
| Old or future capture data was accepted as a fresh read; capture/navigation times now have to match the admitted read window | [Worker lines 143–152](../../workers/career-browser/service.cjs#L143) | [I14 line 8](../../tests/research-conversation-independent-source.test.cjs#L8) |
| A PNG header was accepted as a screenshot; bounded chunks, CRCs, decoded scanlines and MIME must now be valid | [PNG validator](../../workers/career-browser/research-png.cjs#L5), [worker line 149](../../workers/career-browser/service.cjs#L149) | [I16 line 10](../../tests/research-conversation-independent-source.test.cjs#L10), [producer faults](../../tests/research-fixture-contract.test.cjs#L5) |
| Chat status returned edited saved artifacts; hashes and identities must now agree with the immutable request and completed read receipt | [Persistence validation line 10](../../supabase/functions/_shared/career_persistence.js#L10), [SQL envelope](../../supabase/sql/proposals/career_public_research_v1.sql#L46) | [I17 line 16](../../tests/research-conversation-independent-postgres.test.cjs#L16), [rehashed forgery line 22](../../tests/research-conversation-independent-postgres.test.cjs#L22) |
| A locally captured result got stuck after central save failure; the same payload is now retried without reopening the page. This follow-up also keeps the returned receipt identical after confirmation | [Research recovery line 137](../../workers/career-browser/service.cjs#L137), [finish line 267](../../workers/career-browser/service.cjs#L267), [receipt return line 78](../../workers/career-browser/service.cjs#L78) | [I22 line 20](../../tests/research-conversation-independent-postgres.test.cjs#L20), [lost acknowledgement line 23](../../tests/research-conversation-independent-postgres.test.cjs#L23), [exact receipt line 24](../../tests/research-conversation-independent-postgres.test.cjs#L24) |
| Compressed special IPv6 addresses such as `2001::1` evaded the address guard; compressed zero words now remain inside the rejected range | [Address parser line 15](../../workers/career-browser/research-network.cjs#L15) | [I10 supplementary line 17](../../tests/research-conversation-independent-source.test.cjs#L17) |

## Module-130 owner fix availability and remaining limits

[Read-only branch-tree audit](runs/research-fixture-closure-20261016/privacy-availability.json) checked all **132 published heads**. The known owner branch `fix/crew-a` is `925ebdc49ea9a52ee6b4a5d5a9fde1099fc92575`; its module-130 blob is `d68fc09c8aefffdf2059166fba6b593760f1d6ee`, identical to the shared release and this review. Other module-130 blobs occur only in older historical branch versions (latest differing head dated 2026-10-13). A [final remote refresh](runs/research-fixture-closure-20261016/privacy-final-refresh.json) found no changed heads. **No new published module-130 privacy repair was found.** This does not establish whether its owner has unpublished work. No repair was implemented, cherry-picked or merged here; the separate privacy blocker remains unresolved.

Browser acceptance and model quality remain unverified. The earlier normal-sandbox launch failed before navigation; no browser launch or bypass was attempted in this closure. The source-only research SQL proposal still requires Muse's forward-migration scaffolding/review and deployment. This scoped green result does not authorize release merge/deploy or waive the separate privacy and live-verification gates.
