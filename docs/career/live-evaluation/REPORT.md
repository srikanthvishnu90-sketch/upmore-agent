# Initial independent evaluator admission handoff

Latest: [native 200a source interoperability and verified production metadata](NATIVE-200A.md).

Earlier followup: [campaign identity, exact-source budget controls and native transport binding](FOLLOWUP.md). That followup supersedes this initial handoff for the newly located original thread, A's entry contract and current controlled test counts. The initial evidence below is preserved.

Review branch: `codex/evaluator-live-admission-20261017`, based on B's
`aca3fe703689047e10cb3431c41c6819b5f55f99`. This branch changes evaluator code,
tests and evidence only. A-owned runtime, module 130, generated bundles and the
shared release are unchanged. No `.agents/skills` exist in this checkout or
`/workspace/.agents`.

**New verified spend $0; provider requests 0; new provider liabilities $0.**
Old actual spend and liabilities remain unknown; the entire old **$5** stays
unavailable. This task may admit at most **$1**, leaving **$1 unused** within the
owner's authorized **$7 total**. Synthetic test reservations are excluded from
real spend and liabilities.

| Evidence class | Result |
| --- | --- |
| Controlled zero-cost | 28 tests pass; injected harness transcript, unknown-stop record and local artifact readback retained |
| Live model through Upmore | NOT_RUN; prerequisites below remain missing |
| Production | NOT_RUN; no deployment or production mutation |

## Delivered evaluator code

[`admission.py`](../../../scripts/career/live-evaluation/admission.py) provides a
single fixed operational allocation/path with a constant **1,000,000 microUSD**
ceiling. No operational caller can pass a new path, cap or campaign. Installation
is exclusive, records a separately fsynced tombstone, and never resets a ledger.
Opening/status/reservation uses SQLite `mode=rw`; a missing ledger cannot be
silently initialized. Missing/corrupt state denies access. Synthetic tests use
the internal store on disposable paths; they do not install a real allocation.

Each admission consumes the complete fixed invocation bound for **generation,
checker and other paying liabilities** before dispatch. SQL transactions and a
database constraint preserve the sum under concurrent processes. A recorded
final receipt never refills the allocation. Unknown, timed-out, crashed or
partially receipted dispatches retain their entire bound and globally stop new
admission. Duplicate request IDs, model/host/binding changes, incomplete usage,
and excessive per-leg costs fail closed. No automatic retry or paid judge is
included.

[`harness.py`](../../../scripts/career/live-evaluation/harness.py) sends the exact
natural user message with `thread_id`. It does not create `career_journey`
commands or direct model prompts. The adapter source bytes are pinned before
reservation; full request/response observations are fsynced into a transcript.
A typed-route receipt is rejected, with the full bound retained. Local artifact
readback requires actual UTF-8 bytes and an exact SHA256; owned storage provenance
must still come from Upmore.

[`review.py`](../../../scripts/career/live-evaluation/review.py) computes burden
from human-coded actual conversations. Question classifications require exact
assistant quotes and a reason; redundant-detail claims cite an earlier user
fact. It preserves consumed turns for failures and requires artifact/readback
and mandatory-perturbation evidence before counting completion. Unrun metrics
are null. This is not a paid or keyword-based quality judge.

This gate is **not installed or verified on a configured paying transport**.
The attestation validator checks evidence shape; it cannot prove the truth of
external worker, secret-binding, source or pricing claims. The parent/original
executor must verify them. The gate assumes one preserved filesystem and trusted
code/adapter operators; deleting both state and tombstone, restoring older host
snapshots, copying state onto another host or bypassing the harness are outside
its enforcement boundary. It is not a provider account spending cap. Do not
claim the controlled proof establishes any of those operational facts.

## Fresh private natural-language packet

The previously referenced private packet was absent in this executor. A new
packet contains **12 conversations, 96 mandatory planned user turns**, independent
of A's builder context. It covers remembered facts, corrections, replacement
resumes, repeated interruptions, account/thread continuity, owner isolation,
withdrawal, target changes, technical transfer, artifact revision and actual task
completion. Exact prompts, synthetic facts and oracles stay outside Git:

`/workspace/scratch/upmore-evaluator-private/fresh12-evaluator-20261017/`

Evaluator ZIP:
`/workspace/scratch/upmore-evaluator-private/fresh12-evaluator-20261017.zip`

ZIP SHA256:
`18788d7d46bd115c8e60f022c85f4eb643ab9bb6b7c376705f98ce7a6b5529d9`.
The [public manifest](evidence/private-manifest.json) contains coverage labels,
counts and hashes only. All twelve actual-transcript files are empty and
`NOT_RUN`. Do not forward the private prompts/oracles to A before source freeze.
This is evaluator-authored material, not pristine third-party gold.

The private protocol counts necessary and unnecessary questions, reused known
facts, extra user-detail turns, all actual user turns through mandatory stressors,
and turns to verified artifact completion. It does not reward promises to save
files or convert unanswered questions into zero burden. All live counts remain
**null/unmeasured**.

## Exact operational blockers

1. **Earlier workers:** the published historical audit at
   `357f9fba11e2b428925fa7a224b1ebc7d01e85c9` names four process slots,
   `worker-1` through `worker-4`, plus optional continuation workers. It does not
   record the campaign's ChatGPT thread IDs. The launch manifest and original
   ledger are absent. Personal Context returned unavailable. **Exact earlier
   thread IDs are still missing**, and the parent's clarification is pending.
   The known parent request thread is `01a1365c-87f9-7510-8c18-e9c2b8a520cd`;
   it is not evidence of a campaign worker's identity or terminal state. The
   parent must locate the original campaign/executor and attest that every pilot,
   worker, grader, retry and continuation is terminal or fenced inside the old
   held $5. Local process-name inspection cannot establish a global fence.
2. **Existing invocation:** no opaque configured Upmore invocation identity,
   read-only readiness proof, or secure binding attestation was supplied. Known
   historical configuration-path absence is only metadata, not proof that access
   is absent elsewhere. No credential file/value or environment was read, and
   no credential or ongoing access configuration was created.
3. **Native text bridge:** both reviewed `346a48ce` and observed A head
   `0907f0337c35016fbee912956d15155cc0b658b4` retain the same handler,
   grounded-reply and typed interview-entry bytes. Raw text requires the
   server-injected `local_no_external_calls` semantic verifier; the paired
   interview route is selected by typed `career_journey`. A owns the genuine
   native text bridge. This evaluator will not fabricate that bridge in its
   harness or change A's runtime.
4. **Whole-invocation bound/ledger binding:** the existing secure invocation must
   be pinned to reviewed source/host/model/configuration and a verified complete
   upper bound covering every generation/checker/other dispatch. The fixed $1
   store must be bound to that exact invocation before live admission. No such
   verified binding exists here yet. Controlled proof alone is insufficient.

These are **missing prerequisites, with no paying action attempted and no
approval denial**. Once resolved, install the fixed allocation once, run only
the first complete private conversation through actual Upmore, reconcile every
receipt and inspect the saved artifact, then expand within the same $1 ceiling.
Do not ask for another $7 or wait for exact old charges if the original workers
are proved fenced within the held $5.

## Supporting evidence and commands

Exact tested source commit: `ac4d042813de3ccfb60d01ceb56a7a4ac9a9d1b0`.
[Recorded checks](../../testing/runs/independent-live-evaluation-20261017/results.json)
contain the source digest, 28 test names and raw log hashes; both checks are
appended to `docs/testing/evidence-ledger.json`. That original publication changed only evidence/documentation; subsequent
evaluator transport changes and their new exact-source checks are tracked in
the followup.

- [Read-only preflight](evidence/preflight.json): source hashes, known-path
  metadata, local PID/name scope, allocation and missing proofs.
- [Current controlled transcript](evidence/final-control/controlled-transcript.jsonl)
  and [summary](evidence/final-control/controlled-summary.json): injected seam
  only; actual Upmore handler, live model and production are NOT_RUN.
- [Controlled artifact](evidence/final-control/controlled-artifact.txt): 80 actual
  UTF-8 bytes; SHA256
  `d219ff3b859f997614d90d567c87000d1b04f17f2d0bee43edc6efb8b0ff3f70`.
  This was created by the test, not Upmore. Initial control evidence remains
  preserved separately at the evidence root.
- `python3 -m unittest discover -s tests/live-evaluation -v`: **28/28 PASS**.
  Includes repeated install/new cap/new campaign denial, missing/deleted/partial
  state, multiprocess concurrency, unknown restart, full-bound retention,
  duplicate provider charges, adapter change, raw-text preservation and burden
  evidence requirements.
- `python3 scripts/career/live-evaluation/preflight.py`: no provider calls,
  credential reads, ledger initialization or mutable readiness probe.

No application runtime tests were needed because no application runtime changed.
No deploy, merge to a shared release, email, employer submission, Browserbase or
security bypass occurred.
