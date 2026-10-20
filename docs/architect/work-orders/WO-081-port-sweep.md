# WO-081: the port sweep (every port verdict, carried out)

## Why
On 2026-10-20 the owner wrote: "Leftovers — all yes. Port main's site with the re-versioned migrations (the second
half of WO-071). Every other port verdict: port it — retire only what is already in trunk or truly dead, and record
the reason."

Trunk is the only line (D-026). This order takes every branch that `docs/architect/PORT-VERDICTS.md` lists (WO-1)
and brings it to one of two ends:
- **Ported:** on its own branch from trunk, with its tests passing.
- **Retired:** with the reason written down. Either it is already in trunk (the commit is named) or it is truly dead
  (why is stated).

Rules for every port:
- No archive file is edited (D-006). Branches' BUILD-STATUS lines, evidence logs and gauntlet records stay behind.
- Generated bundles are never taken from a branch; they are regenerated on trunk's sources.
- Nothing is ported that breaks a standing rule: no Anthropic API, no LinkedIn or Indeed automation, no captcha
  solving, no send that skips approval, no real personal data.

## The migration decision (main's site, the second half of WO-071)
**`main`'s `20261019020000_site_capture.sql` is treated as live and keeps its version and bytes.** Its sha256 is
pinned in `tests/architect/wo-081-site-port.test.ts`.

**Trunk's `20261019020000_channel_delivery.sql` moves to `20261019020001_channel_delivery.sql`.** The file is only
renamed; its content is unchanged.

Why the rename is safe:
1. **Supabase skips a duplicate version.** It records an applied migration by the digits before the first `_`. If
   production holds 20261019020000, a version-based push skips any trunk file with that number.
2. **Renaming the live file would cut its link to the live ledger.**
   - Renaming the never-deployed file breaks nothing.
   - Trunk has not gone to production: WO-062 is waiting on the owner's word.
   - The deployed line (v2-candidate, 4b4e7981) has no `channel_delivery`.
3. **The new version keeps the dependency order.** 20261019020001 is the next free version.
   - It comes after `20261019010001_career_alerts`, which creates the outbox it alters.
   - It comes before `20261019030000_channel_inbound`, which redefines its claim.
   - WO-060 used the same `…0001` scheme.
4. **The go-live script decides by live-schema marks, not versions.**
   - `scripts/launch/trainee-go-live.sh` lists `20261019020000_site_capture.sql`. Its mark checks for both tables and
     the `careers-resumes` bucket. That mark is true on production, so go-live skips the file there.
   - `20261019020001_channel_delivery.sql` keeps its mark (`career_outbox_contacts_on`).
   - The upmore ledger is keyed by filename. A ledger row under the old name cannot trigger a replay: the mark decides.
   - These checks pass: `tests/trainee-go-live.test.cjs` (every file from 20261019 on is listed, in order) and
     WO-060/2 (no shared version).
5. **It is still safe after the owner's deploy word on ea365d5a** (646fb96f).
   - ea365d5a carries channel delivery under the old name, so that deploy applies it with psql. The upmore ledger then
     records `20261019020000_channel_delivery.sql`.
   - After this rename, the next go-live finds the file's mark (`career_outbox_contacts_on`) and skips
     `20261019020001`. Nothing is replayed.
   - The site capture is skipped by its own mark.
   - Neither step writes Supabase's own version table. That is why `db push` stays forbidden.

## Verdicts and outcomes

### The brief's branches
| Branch | Verdict | Outcome | PR or reason |
|---|---|---|---|
| `main` (site, `site-signup`, `site-careers`, `site_capture`) | PORT, with re-versioning | **ported** | #101. Byte-identical to main @ 8e940754. New tests: 6 architect tests and 17 DB checks. main's two finance commits stay behind (gauntlet records are archive; finance is shelved) |
| `wo/site-preview-repair-20261020` (PR #52) | PORT via main | **covered by #101** | An older copy of main's `site/`. Close #52 once #101 merges |
| `integration/v2-candidate` | ported earlier | in trunk | a53face5 (#89, WO-060) |
| `fix/v242-live-gaps` | ported earlier | in trunk | 1cc0f451 (#92, WO-070) |
| `codex/correction-authority-privacy-20261016` | PORT | **retired: in trunk** | 11036192 (#90, WO-067): the fix and its guard. #110 adds the guard to the gate. The opt-in `correction-authority-postgres` test is not ported: it needs a hand-built Postgres database and the `pg` package, and it skips in the gate and in CI |
| `work/extension-on-trunk`, the Lane C spike | RETIRE | **retired: in trunk** | Trunk's `extension/` (0d9863f0, WO-031) covers Greenhouse, Lever, Ashby and Workday, with live fills of 17 real pages. The spike covers Greenhouse only |
| `work/extension-on-trunk`, saved-answers sync (f8b2520c) | RETIRE | **retired: in trunk** | A second backend for the spike. Trunk's own functions do the same work (`career_apply_answers_own`, `career_apply_extension_begin_own`, `career_apply_finish_own`; 0d9863f0 and ac170873). Its migration also collides by version with `20261020010000_career_apply_own_worker.sql` |

### The PORT list
| Branch | Outcome | PR | Tests |
|---|---|---|---|
| `work/mi121-pasted-email` (includes `work/mi114-injection`) | **ported** | #111 | `career-prompt-injection` 33/33. On trunk's modules it fails 16/33 |
| `codex/resume-correction-supersession-20261016` (567389b8 and its tests) | **ported** | #110 | 31/31. On trunk's 130 they fail 30/31. The Postgres-container variant is not ported (it cannot run in the gate or in CI) |
| `wo/009b-3-acceptance` (PR #28, C-01) | **ported** | #115 | `career-apply-forms` 28/28. On trunk's 150 it fails 10/28. Close #28 once #115 merges |
| `wo/c03-live-assist-guard` | **ported** | #104 | `career-live-assist-guard` 126/126 (D-015's 60 refuse and 60 allow) |
| `codex/capability2-review-fixes-20261016` | **ported** | #113 | 211 capability2 tests (210 pass, 1 skipped). On trunk the boundaries suite fails 50/69. The frozen runner passes 22/22: H20, the branch's open blocker, was closed by WO-067 |
| `work/depth-154-155`, the WRITING half | **ported** | #104 | 28/28 planted defects proven. The BATCH half targets 155 and is dead (D-014) |

### Ports found by re-checking the retire list
The owner's rule is to retire only what is in trunk or dead. The WO-1 audit had marked these RETIRE-SUPERSEDED on the
grounds that they sat on the "old 149/150 stack". On trunk, though:
- module 150 and `scripts/career/portal-browser-helper.cjs` are the engine `scripts/apply.ts` drives (D-014);
- 149 and 121 are in the live router bundle.

So these are live code, and they are ported.

| Branch | Outcome | PR | Tests |
|---|---|---|---|
| `work/mi098-constellation` | **ported** | #116 | Constellation suites 10/10 |
| `work/mi099-tally` | **ported** | #116 | Tally suites |
| `work/mi100-formassembly` | **ported** | #116 | FormAssembly suites |
| `work/mi101-google-forms` | **ported** | #116 | Google Forms suites |
| `work/mi102-neo-bubble` | **ported** | #116 | Neo suites |
| `work/mi103-thiel` | **ported** | #116 | Thiel suites. The account wall stops before any read or fill, and no credential is ever handled |
| `work/mi104-bespoke-sites` | **ported** | #116 | 8VC and Kleiner Perkins suites |
| `work/mi118-telemetry` | **ported** | #116 | `career-portal-telemetry`. The family, portal, forms, batch and telemetry suites together pass 218/218 |
| `work/mi106-repost-stale` | **ported** | #119 | `career-mi106-repost-stale` |

### Retired: already in trunk
| Branch | In trunk as |
|---|---|
| `work/mi108-duplicate-check` | cad4c25c (`depth-e(MI-108)`): trunk's 149 `collisionCheck` stops `ALREADY_APPLIED_BY_USER` against tracker rows and the person's own statements, at the doorstep and at the click. The WO-1 "gap" note was wrong |
| `work/mi117-alert-fatigue` | 9de6d869, merged in fe31076c (Depth Lane D, MI-117 `planDeliveries`). The live alert path also caps alerts and keeps quiet hours: `career_alerts.ts`, f36b806e (#9, WO-007) |
| `work/mi107-polling-efficiency` | d9d0583a (WO-037, #68): conditional requests in `career_ingest.ts` |
| `work/mi034-board-tranche2`, `work/mi034-egress-2` | 0bafa39c (#7, WO-006) and a5f678f2 (#13, WO-017): `board-directory.json`. The missing lines are boards WO-006 dropped on purpose |
| `wo/001-green-gate` | 62f7efd7 (#4) |
| `finish/apply-readiness` | The challenge detector in `scripts/career/page-functions.cjs` (0d9863f0, 3c718e32), and `render-form.cjs` waits for networkidle (04dd8a9b) |
| `wo/009b-2-form-snapshots`, `wo/009b-3-fill-readback`, `wo/009b-3-rendered-readback`, `wo/009b-5-worker-pull`, `wo/009b-6-coverage`, `wo/009b-apply-worker` | The 009b line as trunk built it: 21efb6c3 (#16, WO-009b-2), 638f9104 (#23, the engine), d3ef3b73 (#25, 17 real forms), 343c9815 (#67, WO-039 cloud worker), and `evals/apply/fill-coverage.ts`. The readback harness became #115 |
| `codex/upmore-messaging-native-20261010` | Delivery and the agent loop: 315b77ee, cad2a29a, 55261040 (#10–#12, WO-013) and a0b97571 (#2, WO-002). The rest is finance (see below) |
| The codex stack (15 branches): `codex/forward-upgrade-preflight-20261018`, `mass-applications-20261017`, `native-browser-integration-20261017`, `native-recovery-20261017`, `career-critical-repairs-20261016`, `evaluator-live-admission-20261017`, `spec-b-interview-depth-20261016`, `career-flexible-grounding-20261016`, `model-gateway-boundary-review-20261016`, `career-model-gateway-20261016`, `browser-native-recovery-20261017`, `privacy-research-conversation-integration-20261016`, `research-conversation-review-20261016`, `greenhouse-vertical-slice-20261017`, `greenhouse-submit-handoff-20261017` | Never deployed, and frozen by D-001. Trunk rebuilt each feature: apply (58a6b057 #6, 3c75d715, 0d9863f0, 5c63c9dc), the gateway (f3d386f1), interviews (c2958189 WO-025, 4b488632 WO-035), batch approval (58cc8553 #26, 3818cd1e #34). Its two salvageable fixes are #90 and #110 |
| `codex/conversation-fixes-20261016`, `codex/public-research-browser-20261016` | Ancestors of the same stack. The agent brain replaces the router repairs (D-008; WO-016, WO-019) |

### Retired: dead
| Branch | Why it is dead |
|---|---|
| `work/mi111-credit-ledger` | Module 156 (`runPaidLookup`) has no caller, on its branch or on trunk. Trunk's paid Hunter path is `career_contacts.ts` (rate-limited, cached per address per month), not the router. **Gap, recorded for a follow-up order:** a per-user Hunter credit ceiling |
| `work/mi023-tailoring-residual` | The guard's premise was reversed by the owner's MI-023 ruling (50ae5de8, on trunk), which counts `skills[]` as attested. It fails 1/3 on trunk by design |
| `fix/bug-240-batch-seam` | A 142 claim for module 155 batch apply. 155 retires (D-014); WO-021 and WO-022 replace it |
| `finish/answer-bindings`, `fix/portal-driver-r3`, `codex/apply-stack-integration-20261018` | **Break a standing rule.** They consume the agent-invented "confirmed" facts F-027..F-079, which D-007 orders deleted. Porting them would put invented answers into applications |
| `codex/upmore-production-integration-20261010`, `audit/memory-capability-20261013`, `claude/k12-settlements`, `claude/k13-vault`, `claude/k8-portals`, `release/career-build-20261015-v1` | The finance product, shelved. The product is Trainee (D-004, D-005), and WO-011 deletes the finance code |
| `codex/conversation-recovery-eval-20261016`, `codex/career-worker-integration-fix-20261015`, `career/gauntlet-deepdive`, `fix/crew-a` | Archive (D-006): one eval run's evidence, docs, gauntlet records, and a pass over the frozen forbidden-rules register. None has product code |

## Stacking and order
- **#116 is stacked on #115.** Both change module 150's question binding, so merge #115 first. GitHub retargets #116
  to trunk when #115's branch goes.
- Every other PR is independent and branches from trunk.
- **`scripts/gate.sh` will conflict on merge.** #104, #110 and #113 each add files to the gate's shared list at the
  same point. Merge one; for each of the others, keep every line from both sides.
- **The router bundles need no hand work.** Merging them textually gives the same bytes as regenerating them: in the
  local integration below, the regeneration after every merge changed nothing.
- **Trunk moved while this order ran.** It gained dc8e5802 (the writing-pattern scrub), then #103, #105, #106 and #109
  (6f92997b). #104, #110 and #113 have trunk merged in, for the gate list. Every branch merges cleanly into 6f92997b.

## The ports together (local integration, not pushed)
All eight branches were merged into trunk 6f92997b, in the order #101, #104, #110, #111, #113, #115, #116, #119, and
every gate was run on the result (VERIFIED):

| Gate | Result |
|---|---|
| Architect suite | **638 passed, 0 failed** |
| Edge list | **135 passed** |
| Shared tests added by this order | 129 pass, 1 skipped (the H20 loop case), 0 fail |
| Both bundle checks, `extension/build.ts --check`, `trainee-go-live` | green (`trainee-go-live` 14/14) |
| DB suite (local Postgres 16) | passed |
| Node lists | 61 not-ok: the trunk baseline's 60, plus one load timeout (below) |

**The load timeout.** In the full run, `009b-3 real forms preserve the architect's prepared, unknown and runtime stop
contracts` (#115) failed once:
- One Ashby form hit the engine's 60-second command limit (`DRIVER_TIMEOUT`). The test takes about 150 seconds even
  on its own.
- It passed in #115's own full run, in #116's full run, and alone on the integration branch (28/28).
- It is load-sensitive, not a wrong answer. If CI shows it, raise that test's command limit; do not change the
  contract.

## Gates (every PR)
Each PR ran:
- the architect suite;
- the edge list;
- the node lists, compared with the trunk baseline of 60 known sandbox and network failures;
- the bundle checks (`--check` and `--career-only --check`);
- `extension/build.ts --check`;
- `tests/trainee-go-live.test.cjs`.

#101 also ran the DB suite locally (Postgres 16, as an unprivileged user). CI runs the DB suite on every PR.

Every PR had **0 new failures** against the baseline. Each PR body carries its numbers.

## Not done, and why
- **Pointing the site's host at trunk.** The host still deploys from `main`; that is the owner's call. main is also
  still moving: 8e940754 is from today, so later commits on main need another port.
- **Closing PRs #28 and #52.** This order does not merge or close. Close each once its replacement merges.
- **The Postgres-container tests** (`correction-authority-postgres`, `resume-supersession-postgres`). They need a
  hand-built database, so they cannot run in the gate or in CI.
- **A comment in `20261021070000_channel_parity.sql`** still names "20261019020000". It is left alone so that no
  migration's bytes change beyond the rename.

## Out of scope
- Deploying anything.
- Rewriting history to purge the real-draft blobs (see dc8e5802).
- The 456 branches the WO-1 audit did not list.
