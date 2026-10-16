# Conversation repair review — 2026-10-16

The reproduced conversation paths now pass the unchanged original oracle and the additional synthetic held-outs. **This is a source-only review, not permission to merge or deploy. The separate module-130 privacy/cross-account defect remains release-blocking.** No production mutation, paid call, external send, application or browser execution occurred.

**Tested source:** `1b312e7ed9e5c83b2dadc2de5f1813b9ad2f3db0`, branch `codex/conversation-fixes-20261016`. Base: `f67db048599db308f2691a7be7feada841143da5`. Later commits on this branch add this report and evidence only.

## Before and after

| Actual staged-entry / real local PostgreSQL suite | Before | Final source |
| --- | --- | --- |
| Original frozen 12 conversations, 83 turns, 543 checks | 414 passed / **129 failed** on `f67db048` | **543 passed / 0 failed** |
| New frozen 16 held-outs, 82 turns, 426 checks | 353 passed / **73 failed** on `f67db048`; all 16 conversations had failures | **426 passed / 0 failed** |

The final source also passes **289 / 289 selected regressions**, with no skips, and catches **15 / 15 planted source defects**. The legacy release harness returns `RELEASE OK` on the exact source commit; it is not a conversational-model quality verdict and does not waive the privacy blocker. Its deterministic judge explicitly reports that the LLM judge was not run.

The prior original-baseline run and all its failed transcripts remain unchanged in [review 0519b0ff](https://github.com/srikanthvishnu90-sketch/upmore-agent/tree/0519b0ffd33a67c06e00fda047321231cdd8667c/docs/testing/runs/conversation-recovery-20261016/release-current-first). The [machine summary](runs/conversation-fixes-20261016/summary.json) links every follow-up run. **742 turns** were retained across the new baseline, intermediate attempts and final SQL-backed runs; intermediate failures were not overwritten.

## Release identity and scope

The shared release was inspected before editing and remained at `f67db048599db308f2691a7be7feada841143da5` at publication. Its measured code ancestor is `780377560eee92879250f3db2bfa7125d8eb05d1`. It already incorporates the earlier bundle, durability, owned worker, worker integration and initial capability-2 contributions. This branch preserves Muse's action-only pause fix, routing exclusions, worker approval `payloadSha256` forwarding, account authority and task-intent fencing. Worker files and module 130 are unchanged.

`49b7872c822cbf26107c3d49727c9f5ed2acbc9f` is **not an ancestor** of the base. Its later recommendation/evidence/query fixes were inspected, not blindly merged or ported. The recommendation and writing modules remain unchanged from the base. The legacy `fact_id` tailoring-boundary repair here is narrow and independent of those recommendation changes. Muse still owns integration of the separate reviews and final merge/deployment. No live version was independently probed; the combine record's statement that v222 remained live is not promoted to a new verification claim. [Identity/ancestry record](runs/conversation-fixes-20261016/source-identity.json).

`AGENTS.md` and relevant BUILD-STATUS ownership/rules were read. No `.agents/skills` files exist in these worktrees. The explicit continuation claim in BUILD-STATUS scopes the edits. Personal writing-corpus fixtures and blinded-pair examples were not copied into the tests, transcripts or evidence; all new prompts, profiles, names and achievements are synthetic.

## What changed

- **Canonical active location.** The existing host correction now reconciles profile preference, thread facts, the shallow-runner mirror and active plan. A primary single-value fact cannot be unioned with an obsolete mirror value. The plan requires review, and stale unapproved draft/list references are invalidated; approved task bindings and saved watch locations are not silently retargeted. Account-loaded preferences update the active projection without overriding an explicit current-thread withdrawal.
- **Truthful forgetting scope.** A target-city request can withdraw that field from the current thread's active facts/plan and stop using it in subsequent replies. It explicitly refuses to claim deletion from account records, previous messages, caches or backups. Unknown deletion targets return unsupported, never success. Existing full-profile erasure controls retain their original authority and limitations. This does not fix the separately owned module-130 privacy cache.
- **Conversation state.** A pure bounded workbench stores user-reported schedules, work interests, role constraints, project evidence, pending comparison/coaching work and draft requests in the owned snapshot. Explanatory detours do not discard the pending task. New statements are distinguished from hypothetical, quoted, third-party and instruction-shaped text. Hypothetical contents do not become personal facts or active resume evidence. A relative phrase such as “using what I enjoy” cannot replace an earlier actual interest.
- **Useful mentoring and coaching.** Reflection asks one question at a time, remembers time and paid-work constraints and offers a small next move. Interview feedback refers to the actual answer, identifies a missing result or validation issue and carries later supplied outcomes into the delivered answer without inventing numbers, leadership or revenue. Feedback is qualitative, not an asserted validated interview score.
- **Truthful resume delivery.** Pasted-posting tailoring reaches the existing tailoring engine, while named-role/full-resume/PDF requests keep their existing route. Stable legacy `fact_id` values are adapted on a copy; conflicting or duplicate identities refuse tailoring. Master fact IDs and proof status are not rewritten. A coursework bullet is delivered from the person's stated project. The actual tailored text is exposed and persisted, with unknown employer/title metadata labeled rather than rendered as `undefined`. Reply closers remain outside the artifact body.
- **Complete drafts.** Explicit extension dates survive a detour and a warmer/shorter revision. The existing negotiation generator receives the requested deadline. Draft bodies bypass the sentence-summary path that previously removed the request and sign-off. The owned snapshot retains the text and source quotes; generation does not approve or send it. Unconfirmed dates remain placeholders rather than employer promises.
- **Honest limits.** Browser/upload/send status questions answer from the handler's actual capabilities. “At zero cost” no longer becomes a supposed employer named “zero.” Unknown postings and unavailable integrations are not described as verified outcomes. Remote/paid/part-time/seniority/sponsorship constraints exclude missing or incompatible evidence rather than treating unknown as fit.

## Reviewed transcript examples

These are synthetic examples from the final actual-entry run; the complete inputs, replies, state and SQL traces are linked below.

- After “my preferred location is Denver,” a later next move uses **Cedar Harbor in Denver**, together with the previously stated Tuesday availability. Boston does not reappear as the current city. [C02](runs/conversation-recovery-20261016/fixes-human-reviewed/C02.json).
- The selective-forgetting reply says: “I cannot selectively erase that city from saved account records, earlier chats or backups.” It then states the exact active-thread withdrawal it performed. The next city query is unknown for that active thread, and education/firm remain. This is **not account-wide erasure success**. [C05](runs/conversation-recovery-20261016/fixes-human-reviewed/C05.json).
- The resume retains proven Python/coursework evidence, names Kubernetes as a preferred gap, adds no ML leadership, and includes the actual rendered text. The later requested bullet uses the actual class project, not the intervening editing command. [C06](runs/conversation-recovery-20261016/fixes-human-reviewed/C06.json).
- Coaching retains the learner's CSV delimiter narrative, **500 rows** and **two hours**, all supplied by the learner. It asks about validation rather than inventing an outcome or a score. [C08](runs/conversation-recovery-20261016/fixes-human-reviewed/C08.json).
- The extension email includes its subject, greeting, the request **“extend my decision deadline to Monday,”** and sign-off. The shorter revision preserves the request. A status question confirms that no email or acceptance was sent. [C09](runs/conversation-recovery-20261016/fixes-human-reviewed/C09.json).
- The comparison follow-up still uses the earlier preference for **explaining patterns more than building interfaces**; it does not replace that preference with the later request to return to the topic. [C11](runs/conversation-recovery-20261016/fixes-human-reviewed/C11.json).

The new workbench is bounded rule-based behavior, not a general conversational model. Passing regex checks alone was insufficient: the `47c69750` checkpoint passed them, but transcript review found the metadata, artifact-footer and preference issues above. Those findings were fixed and re-tested on the final source. No claim of universal natural-language coverage or human-equivalent quality is made.

## Evidence and execution

[Original frozen oracle](../../tests/fixtures/conversation-recovery/frozen-cases.json) and [freeze](../../tests/fixtures/conversation-recovery/freeze.json) are byte-identical to the published recovery review. Original SHA-256: `c2a7b53320b6f60c4a4f09b69524d1ca5c1ace67866af3d2e0eeb8bc147ac74c`. No expected outcome was relaxed.

The [16 held-out conversations](../../tests/fixtures/conversation-fixes/heldouts.json) and [their freeze](../../tests/fixtures/conversation-fixes/freeze.json) were authored before product changes. They vary companies, cities, multiword locations, education, role constraints, project narratives, dates and metrics. Their baseline was run against the unchanged release. Semantic predicates inspect actual retained facts, date/body delivery, unknown fields and unsupported-erasure honesty, in addition to per-turn transport/no-effect checks. [Depth packet and mutation contract](../depth/CONVERSATION-REPAIR.md).

| Run | Evidence |
| --- | --- |
| Release held-out baseline, real SQL | [82-turn transcript](runs/conversation-recovery-20261016/heldouts-before/transcripts.jsonl) |
| First changed-source run: 4 original failures | [83-turn transcript](runs/conversation-recovery-20261016/fixes-first/transcripts.jsonl) |
| `d112fe5c`: 2 remaining original failures | [83-turn transcript](runs/conversation-recovery-20261016/fixes-final/transcripts.jsonl) |
| `47c69750`: all original checks pass; later human-review findings retained | [83-turn transcript](runs/conversation-recovery-20261016/fixes-reviewed/transcripts.jsonl) |
| Final `1b312e7e`: original suite | [83-turn transcript](runs/conversation-recovery-20261016/fixes-human-reviewed/transcripts.jsonl), [metadata](runs/conversation-recovery-20261016/fixes-human-reviewed/metadata.json) |
| Final `1b312e7e`: held-out suite | [82-turn transcript](runs/conversation-recovery-20261016/heldouts-human-reviewed/transcripts.jsonl), [metadata](runs/conversation-recovery-20261016/heldouts-human-reviewed/metadata.json) |
| Final regression selection | [289-test log](runs/conversation-fixes-20261016/final-confirmation-regressions.log) |
| Planted defects | [15/15 result](runs/conversation-fixes-20261016/mutations.json), [log](runs/conversation-fixes-20261016/human-review-mutations.log) |
| Legacy release harness | [log](runs/conversation-fixes-20261016/human-reviewed-release-harness.log) |

Each run directory also contains per-conversation JSON, including every turn, full HTTP response, handler log, request key, transport arguments, before/after durable snapshots and message rows. Final database dumps preserve each run's last scenario; earlier states remain in the transcripts. The earliest changed-source iterations used an uncommitted working tree, so their metadata's commit denotes then-HEAD and `sourceFiles` hashes pin their evaluated bytes. The final runs use committed source `1b312e7e`, and those file hashes match that commit. No product source changed during those runs.

Execution uses the actual deployment staging graph: career index → handler → generated career bundle → real local PostgreSQL 16. Only synthetic authentication, local service transport and a permissive local rate limiter are injected. PostgreSQL runs in a disposable Docker container with `--network none` and no published ports. It is not the production schema, JWT gateway or real-account data. C12 still proves atomic save-failure rollback, same-key retry/replay and changed-key conflict; these inherited authority protections were preserved.

The VM denies external fetches and exposes only synthetic environment values. **742 retained actual-entry turns, zero external fetch attempts, zero model calls and zero paid calls. Actual model response quality is NOT_EVALUATED.** Neither provider-disabled regressions nor the legacy deterministic judge establish it.

## Portability and intermediate failures

All intermediate failures remain under the evidence folders. Two new bullet-route regressions caught by the wider suite were fixed by preserving the existing full-tailoring route. A missing home-directory scenario file initially prevented the clock guard from running; its loader now uses the checked-in canonical ask registry and requires the relevant IDs. Existing assertion bodies are byte-identical from `function turn` onward. The [drift record](../playbook-drift-2026-10-16.md) explains this narrow loader change. No private uploaded scenario file was copied.

The first disposable PostgreSQL startup attempt encountered the image's temporary-server readiness race before role creation. Its failed setup log is retained. The setup check now waits for the final loopback TCP listener; the known failed role operation was checked and completed on the task's own isolated container. No external account or credential was created or changed.

One intermediate regression run was intentionally retained after it found a stale generated bundle; rebuilding both bundle variants restored the check. Final bundle freshness, source whitespace, freeze/hash and retained-evidence checks pass. Verbatim failed test logs may contain their original whitespace; those bytes are retained rather than prettified.

## Public browser route and remaining blockers

[Missing public read-only browser route and minimum integration contract](../career/public-readonly-browser-contract-20261016.md) is a separate design deliverable. It specifies authenticated committed research intents, existing account/version/epoch authority, a sandbox-capable owned Chromium/CDP worker, bounded public GET/HEAD, redirect/private-address controls, untrusted-source isolation, stop states and the causal request/browser/source/artifact/readback chain. It implements no route, changes no allowlist and uses no Browserbase or bypass.

The 15 distinct public tasks from the earlier review remain **0 completed / 15 NOT_RUN**. The installed normal-sandbox Chromium failed before opening a page because its SUID helper is not correctly owned; no new launch or security change was attempted in this continuation. The Edge research route is also unimplemented. Fixture and SQL preflight do not count as genuine browser outcomes.

Module 130, its cross-account/privacy cache and epoch repair remain separately owned and **release-blocking**, regardless of broad test totals. Later capability-2 review fixes are still a separate integration decision for Muse. No production deployment, current live-model quality, public browser outcome or full historical/account-wide selective deletion was verified here.

## Reproduction

On this review branch, create the disposable local fixture with `node scripts/career/conversation-recovery/setup.cjs`. Use fresh output labels (the runner refuses existing evidence/database names):

```sh
node --experimental-vm-modules scripts/career/conversation-recovery/run.cjs /path/to/review-source new-original-label
node --experimental-vm-modules scripts/career/conversation-recovery/run.cjs /path/to/review-source new-heldout-label heldouts
node --test tests/career-conversation-heldouts.test.cjs tests/career-conversation-mechanisms.test.cjs tests/career-tailor-fact-id-boundary.test.cjs
node evals/conversation-fixes/mutations.cjs
python3 scripts/build-router-core.py --check
python3 scripts/build-router-core.py --career-only --check
```

`summary.json` is the canonical before/after index for this packet; the inherited older summary helper is for the earlier recovery packet. The task exports its local dumps and removes only its own fixture container after verification. Muse can inspect or cherry-pick this isolated review; the shared release is untouched.
