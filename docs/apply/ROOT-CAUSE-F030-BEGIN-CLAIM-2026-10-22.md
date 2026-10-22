# Root cause — MUSE-F-030: a chat begin is born claimed by the wrong driver, so the cloud claim can never take it

Read from the migration sources on `origin/wo/first-real-submission` @ `4dc32fd4`
(the live project carries these bodies md5-identical; nothing here was applied
anywhere by this note or the fix that follows it).

## The three predicates, exactly as written

**The begin side (what a chat/agent begin produces).**
`career_apply_extension_begin_agent_own` (20261024100000) runs the kill switch,
the live-approval select and the six WO-102 contract checks, then delegates to
`career_apply_extension_begin_own`. That function (latest definition
20261021120000, line 12) refuses any payload whose `source` is not the literal
`'extension'` (`'invalid extension application'`), enqueues the row — and then
(line 19) immediately claims it for the beginner:

```
update career_apply_jobs set state = 'driving', source = 'extension',
  attempts = 1, claimed_at = clock_timestamp(), lease_token = gen_random_uuid()
```

A begun row is therefore born `driving` / `extension` / attempts 1, with a lease
issued to the beginner. For the extension that is correct: the beginner is the
driver, in the person's own browser. Module 176 (the chat caller) has no other
door to call, so it hardcodes `source: "extension"` in the payload it builds
(`packages/domain/176-career-agent-begin.js`, `buildBeginPayload`) — and its
payload carries neither of the two keys the cloud path requires (below).

**The claim side (what the cloud worker may take).**
`career_apply_cloud_claim_at` (20261021080000) picks candidates only where
`state = 'queued' and attempts = 0 and source is null and
approval_hash = payload_hash`, for a person with a live opt-in, on a family
whose gate is open. `career_apply_cloud_refusal` repeats the same four
predicates and adds the payload's own shape: `payload->>'engine_approval'` must
be 64 hex (`'not_approved'`) and `payload->>'destination'` must match
`^https://` (`'person_submits'`) — the shape `workers/career-browser/
approve-first.ts` `prepare()` puts in every payload it enqueues (destination =
the engine's resolved apply URL, engine_approval = the engine run's
approval_hash).

A chat-begun row fails **every** candidate predicate at once — state, attempts,
source — and its payload fails both shape checks. The disagreement is total,
not a near miss. Worse, the row is stranded, not merely unclaimed: a `driving`
row nobody drives is swept to `unknown_outcome` after 15 minutes
(`career_apply_claim_own`'s sweep for non-cloud sources), so the person's
approval is burned as "unknown" by a drive that never happened.

**The gate side (what counts as a hand submission).**
`career_apply_cloud_open` (20261021080000) opens a family at ≥3 rows with
`state = 'confirmed' and source in ('own_computer', 'extension')` and the
employer's email confirmation on record, from a listed gate tester. This
predicate is **correct** — it counts what the source column says. The begin's
stamp is what lies: a chat-begun row is an agent submission wearing the
`extension` label, so had it ever been driven and confirmed, it would have
inflated the hand tally the gate's whole design (D-022) depends on.

**Why the repair cannot be a relabel.** `career_apply_jobs_fixed` (trigger,
20261021080000): a source is set once, by a claim, from `queued` — an update
that changes a set source, or sets one on a row that already went, raises
`source_fixed`. Any fix that flips a begun row to `cloud` after the fact is
refused by the database itself, on purpose.

## Fix shape chosen — (a) a sibling door, not a widened claim, not a bridge

Candidate (b), widening the claim predicate to also take agent-begun rows
(`agent_batch_hash` set, source `'extension'`, state `'driving'`), is refused
by the evidence: the claim's strictness is the safety property — the cloud
takes only rows nobody else is driving, whose provenance is still unwritten.
Taking a begun row needs the source relabel the trigger forbids, and the
beginner's outstanding lease would dangle over a second driver.

Candidate (c), a bridge step that converts a begun row into a queued one after
the begin, has the same defect one step later: the begun row must be mutated
back through `driving` (or deleted and re-enqueued, unbinding the approval
from the row it approved). The only delete in `begin_own` exists for the
extension's own stop-before-the-click debris; a bridge generalises it into a
provenance hole.

Candidate (a) — the one built in migration `20261024140000`:

1. The contract checks move, **verbatim**, into one internal helper,
   `career_apply_agent_contract_approval(p_payload, p_batch_hash)`, returning
   the live approval row (kill switch → approval select `for update` → checks
   1–6, in the database's order, with the database's messages). It is granted
   to no one; only the two security-definer begins call it (the same pattern
   as 20261024110000's `career_apply_questions_put_for`).
   `career_apply_extension_begin_agent_own` is redefined over the helper with
   its tail byte-identical (delegate to `begin_own`, mark the approval used,
   stamp `agent_batch_hash`) — the extension door's behaviour is unchanged by
   construction.
2. A new door, `career_apply_cloud_begin_agent_own(p_payload, p_approval,
   p_batch_hash)`, granted to `authenticated` exactly as the agent begin is:
   the same helper, then the door's own checks — the payload's `source` is
   `'cloud'` (the door label, symmetric with `begin_own`'s `'extension'`),
   `destination` matches `^https://` and `engine_approval` is 64 hex (the
   exact shapes `career_apply_cloud_refusal` will demand at claim time, so an
   unclaimable row can never be created silently) — then the **same** enqueue
   `begin_own` performs (`career_apply_enqueue` under the payload-hash check,
   at the person's daily limit), the approval marked used, `agent_batch_hash`
   stamped, and `{id, payload_hash}` returned with **no lease**: nothing is
   claimed. The row waits `queued` / `source is null` / attempts 0 for
   `career_apply_cloud_claim_at`, which stamps it `'cloud'` — once, by the
   claim, from queued, as the trigger requires.
3. One deliberate difference from `begin_own`: no delete of a prior stopped
   row. The cloud door has no stop-before-the-click debris; a second begin for
   the same posting refuses with `duplicate_job` from the enqueue, and because
   the refusal precedes the used-marking inside one transaction, the approval
   stays live.

Under this shape both existing doors stay honest:

- A **genuine extension begin** is unchanged in every observable way: payload
  `source = 'extension'`, row born `driving`/`extension` with the beginner's
  lease, never a cloud candidate (state, attempts and source all exclude it).
  It is never cloud-claimable, by design: the cloud must not take a row a
  person's browser is already driving.
- A **hand submission** (`career_apply_record_own`, or `career_apply_claim_own`
  stamping a queued row `own_computer`) is untouched, and the gate keeps
  counting only its two true sources — a chat/cloud submission now enters the
  books as `cloud` at claim time and can never enter the hand tally.
- The **gate function itself needs no change**: its predicate was never the
  defect; the stamp was.

Module 176's half: `buildBeginPayload` gains the cloud door — with
`door: "cloud"` the payload's `source` is `'cloud'` and it carries the
preparing engine's `destination` and `engine_approval` (from the approved
entry, the same values `approve-first` puts in its payloads); `runBegin`
calls `career_apply_cloud_begin_agent_own` for that door and mirrors the
door's three refusals locally with the database's own messages. The default
door stays `'extension'`, byte-identical to before.

Renumber note (2026-10-22 rebase onto arch/pin-landing-candidate-bridge @ 348c2d4a): this migration was
20261024120000 as first written; the target line already carries the cloud gate waiver at 20261024120000
and the card-cloud bridge at 20261024130000, so the file is renumbered 20261024140000 and applies after both.
