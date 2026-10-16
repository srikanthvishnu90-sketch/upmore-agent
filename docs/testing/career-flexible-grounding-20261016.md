# Flexible grounded career conversation — isolated review

Base: gateway boundary review **`2471747fd36118922d9bbbb107b498f788ac7bef`**. Local implementation branch: `codex/career-flexible-grounding-20261016`. Final tested implementation: **`a25b874ba4a065ecb9d722d9a6815c201311ff29`**. No shared release merge or deployment occurred. Muse owns integration, forward migration, original-cap reconciliation and deployment.

This adds original prose, questions and draft revisions beyond the boundary review's closed coaching selector. It does **not** establish actual model or semantic-verifier quality. Every generated response and semantic verdict in these tests is a labelled scripted mock. Paid calls: **zero**. Original shared $5 balance: **still unknown/unreconciled**.

## Runtime contract

[career_model_grounded.ts](../../supabase/functions/_shared/career_model_grounded.ts) implements the new `grounded_v2` strategy behind exact server `CAREER_MODEL_CONTRACT=grounded_v2`, with the existing `CAREER_MODEL_ENABLED=true` generation gate. Legacy v1 selection remains compatible; neither mode was enabled in production. No provider, SDK, model, credential, price table or budget function was changed.

The existing staged entry, deterministic routing, controls, task planning and atomic host commit remain authoritative. The flexible adapter can handle ordinary coaching/interview/reflection/support, draft and choice/explanation responses, plus a **recorded null dispatch with no matched handler**. It does not override contained throws/empty or malformed handler results. That distinction matters for natural follow-ups such as “make that warmer,” which previously never reached the model path.

The model returns `career_grounded_reply/v2` with `blocks` and `claims`. Blocks can contain original `prose`, `draft`, `advice`, `hypothesis` or `question` text; they are not selected from a sentence catalog. Claims carry exact text, a scope (`person`, `posting`, `conversation`) and evidence IDs. Draft prose may paraphrase supported experience. The host labels drafts as unsent, hypotheses as unestablished, and advice separately. Schema, size, reference-scope and claim/block checks reject malformed or extra authority fields. They **do not establish entailment or complete claim coverage**.

### Required semantic-verifier port

The server must supply a trusted implementation through:

```ts
createCareerChatHandler({ semanticVerifier })
```

The default exported handler supplies **no verifier**. An unavailable or incompatible verifier gives an honest deterministic fallback **before generation or budget admission**. HTTP JSON, headers, profiles, postings and generated output cannot install one. Test dependency injection selects the same server factory; it does not add a client-facing configuration channel.

The port identifies its `id`, `revision`, capability `entailment_coverage_authority/v1`, cost policy `local_no_external_calls`, and `verify(request, abortSignal)`. Only reviewed local, non-network implementations are supported by this change. The policy declaration is a trusted server integration requirement, not a sandbox for arbitrary plugin code. Billed/remote verifier calls have no accounting adapter here and are not authorized by the unresolved allowance.

The verifier receives immutable copies of the **whole** candidate and read-only context, their SHA-256 bindings, and explicit requirements to check:

- Entailment of every listed factual claim against eligible current evidence.
- Hidden assertions and presuppositions throughout prose, drafts, empathy, advice, hypotheses and questions.
- Whether advice/hypotheses disguise personal or external factual assertions.
- Whether postings or dialogue are being promoted into personal qualifications.
- Action, memory, approval and completion-authority safety of the entire reply.

Acceptance requires an identity/revision/hash-bound receipt certifying whole-response coverage and authority safety, no unlisted claims, and one matching `entailed` result for every claim/evidence set. Missing, partial, stale, malformed, negative, throwing or timed-out receipts reject generated text. A valid ID, copied schema, exact evidence quote or model self-certificate is never a substitute for this verifier. The two-second verifier deadline aborts cooperatively; generation is not repeated. No production verifier is installed or certified by these mock tests.

### Read-only context and privacy

[career_model_context_v2.sql](../../supabase/sql/proposals/career_model_context_v2.sql) is an **unapplied source proposal**, with no tables, account configuration or allowance seeded. Its three functions are security-invoker and executable only by the backend service role. Native PostgreSQL verifies denied anon/authenticated execution. Reads use the existing owner lock and current owner/thread/revision/account-version/epoch fence; no model or verifier call holds the SQL transaction.

The bounded context includes current owner-scoped sourced facts, active/corrected/disputed status, value-free withdrawal markers, current request, goals/pending asks, recent dialogue, an advisory draft/revision, and separately identified untrusted postings including **`jd_text`**. Corrected education values omit contradictory stale graduation/year mirrors without rewriting the profile or modifying module 130. Sources name the committed profile/conversation path or corrected source; they remain user-reported, not independently verified credentials.

Recent dialogue comes only from host-stamped **committed current-epoch receipts**. Legacy raw chat/audit rows are not imported. Dialogue, drafts, goals and requests are not canonical personal evidence. Posting IDs can support only posting-scoped claims; they cannot prove the person has the requested skills, or that a supplied opening is live.

Host-stamped correction/withdrawal/pause/erase barriers cut older dialogue and drafts across owned threads. Missing owner account-version stamps also form conservative barriers, covering intervening legacy or generation-disabled turns. The gap remains detectable after later v2 replies. Undated legacy goals/drafts are omitted across a barrier. Full erase retains the existing epoch authority. Historical records remain historical; revoked old generated replies cannot re-enter through the replay shortcut: they return 409 without another inference. Current control replies and ordinary exact replay remain free.

Generated drafts are ordinary advisory response metadata with host-assigned revision/ID, committed atomically with the response. They are not profile facts, approvals, action requests or execution receipts. The model and verifier receive no database client, tool executor, credential configuration or memory-write API. Existing deterministic domain writes and all actual action authority remain with the host. No module-130 correction implementation was duplicated.

## Tests and retained failures

[Expectations](../../tests/fixtures/career-flexible-grounding/freeze.json) and the 15-observable [depth packet](../depth/CAREER-FLEXIBLE-GROUNDING.md) were committed at `d0c52297` before implementation. Twelve [held-out examples](../../tests/fixtures/career-flexible-grounding/heldouts.json) were frozen/hash-checked before execution. Their accept/reject decisions are **scripted semantic oracles**, including unsupported degrees/metrics, advice/hypothesis/question laundering, posting-to-person inference and completion claims; they do not measure real entailment.

| Check | Result | Recorded source |
| --- | --- | --- |
| Flexible contracts, including 12 held-outs | **52/52** | `a25b874b` |
| Native PostgreSQL flexible entry/context/real cash + monthly RPCs | **14/14** | `a25b874b` |
| Fifteen intentional local defects | **15/15 killed** | `a25b874b` |
| Existing gateway/independent boundary/privacy source contracts | **71/71** | `804c95ec` |
| Existing cash/uncertainty/monthly native SQL contracts | **29/29** | `804c95ec` |
| Scoped conversation/router/worker/application/staging regressions | **250/250** | `804c95ec` |
| Independent research source + SQL | **12/12 + 17/17** | `804c95ec` |
| Total selected passing cases (duplicates excluded) | **445/445** | Sources above |
| Original frozen deep conversations | **543/543 checks, 83 turns** | `804c95ec` |
| Frozen held-out deep conversations | **426/426 checks, 82 turns** | `804c95ec` |
| Full inherited R2A/R3 gauntlet | **26/27, same C37 failure** | `804c95ec` |
| Shared TypeScript adapter/transitive imports | **PASS** | `a25b874b` |
| Both bundle freshness checks | **PASS; bundles unchanged** | `804c95ec` |
| Final staging | **15 files, 3,962,435 raw bytes (final header-comment correction)** | `a25b874b` |

The final change after compatibility checkpoint `804c95ec` affects only the v2 education-evidence projection and its new regression. The v1/default-off execution files, original budget/privacy implementation and existing oracles are unchanged. A final handler-header comment corrects the old “ZERO finance code” claim to no financial routes/full domain bundle; it changes no executed logic. Native Deno is absent; the shared TypeScript check and staged VM are not a deployed Deno/authentication/RLS certification.

Native new SQL tests use real local persistence, read projection, global cash guard and unchanged monthly reserve/record functions. They cover cross-owner/thread rejection, current-context fences, owner-wide barriers, unstamped gaps, fresh draft revisions, free replay, selective forgetting, rollback, erase **during verification**, monthly denial and invalid receipt accounting. Authentication, provider responses and semantic decisions remain synthetic. All databases are disposable/network-none; the owned fixture and temporary mutation worktrees/stages were removed after evidence capture. No production query or mutation occurred.

Failed evidence is preserved:

- `first-contracts.log`: **43/45**, natural follow-up and revision blocked by null dispatch; repaired only for that recorded boundary. This first implementation was uncommitted; its exact runtime hash was not captured, and no exact-source baseline claim is made. Raw event/reply transcripts remain retained.
- `replay-before-fix.log`: cached generated reply returned 200 after forgetting; now 409 without a second inference.
- `unstamped-gap-before-fix.log`: generation-disabled forgetting did not revoke old replay; read-only version-gap barriers close it.
- `stale-education-before-fix.log`: contradictory old mirrors remained active beside a correction; now omitted/disputed.
- Full legacy C37 remains red: actual `142-career-router.handleChat`, expected `141-career-doorstep.handleChat`, matching the inherited base. No oracle was weakened.

[Results](runs/career-flexible-grounding-20261016/results.json), [manifest](runs/career-flexible-grounding-20261016/manifest.json), raw transcripts, scripted generation/verifier events, SQL dumps, negative controls and mutation logs are retained. New suites reproduce with an already-prepared disposable network-none fixture:

```sh
node scripts/career/flexible-grounding/run.cjs <new-label> contracts
node scripts/career/flexible-grounding/run.cjs <different-label> postgres
node scripts/career/flexible-grounding/mutations.cjs <another-new-label>
```

No evidence directory is overwritten. The mutation runner uses a separate temporary detached worktree and restores/removes it. The normal sandbox, security settings, private writing fixtures, browser workers and production resources are untouched.

## Muse handoff and live prerequisites

The implementation is reviewable; the conversational goal is **not live-proven**. The legacy v1 selector remains for compatibility. To use v2, Muse must review/apply the context proposal as an appropriate forward migration, preserve the existing budget/privacy repairs, integrate an independently evaluated **real local semantic verifier** into the server entry, then select the v2 contract and generation gate. Enabling flags with the default no-verifier entry intentionally returns fallback. Schema/reference tests and mocked semantic receipts must not be represented as verifier accuracy.

Before any actual inference, recover and reconcile the **same original shared $5** ledger, including earlier/unknown/reserved spend and other workers; verify the approved existing model/price/account access and supported authorization. No new allowance, credentials, paid probe or real budget row was created here. The shared cash proposal's global uncertainty stop and raw usage validation are byte-identical to `2471747f`.

All **15 genuine browser tasks remain NOT_RUN**, with the existing acceptance manifest unchanged. Prior normal-sandbox launch failed before navigation; a supported preconfigured owned runtime remains required. No Browserbase or security bypass was attempted. Hosted authentication, production migrations/deployment, native Deno, actual model quality and actual semantic-verifier quality remain unverified. Overall release is **NOT_READY**, including inherited C37 and Muse integration/deploy review.

The Git CLI's existing token became invalid during handoff; it was not changed. The already-connected GitHub app successfully reads the base repository and is the authorized publication fallback. Git-object publication uses a single review commit parented by 2471747f with the exact final local tree; the bundled local history preserves all tested commit IDs and freeze ordering. Publication results, including commit/tree mapping, are recorded separately; local tested source IDs above remain the evidence identifiers.
