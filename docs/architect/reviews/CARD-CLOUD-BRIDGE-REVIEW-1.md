# Review 1: Codex's card-tap → cloud-job bridge design (posted 2026-10-21 18:26 CDT)

Reviewer: architect. Against: pin `wo/first-real-submission` @ `01401cb4` and the gate
(`docs/architect/reviews/CARD-CLOUD-BRIDGE-GATE.md`, items numbered there).

**Source limit, stated plainly:** the design is in Codex's thread, not in the repository; the architect's session cannot
read that thread. This review is of the design as the owner relayed it (its enumerated boundary cases). Every item below
marked "not shown" may be in the full text: Codex answers it by item number, in the repository (a design file on its
branch), and the gate is re-run on that file. Nothing is passed on a summary.

## Verdict: CONDITIONAL

- **Allowed now:** writing the fail-first tests (gate E14–E17), against 01401cb4, with their failing output recorded.
  Tests change no behaviour.
- **Not yet allowed:** the migration and the worker/edge code, until C9, C10, D11, D12 and A2 below are answered in the
  repository and the architect writes PASS.

## Covered by the design (as relayed)

| Design case | Gate item | Note for the tests |
|---|---|---|
| unknown keys fail | C7 | list the closed key set; one test per key class (top level, field level) |
| foreign ownership fails | B4 | card of another person, thread of another person, job of another person |
| route confusion fails | C9 (part) | must include: an **unbound** cloud-claimable job (old texted card, direct `career_apply_enqueue`) is refused at the cloud claim, and an extension card job is still never cloud-claimed |
| deletion, binding stripping preserve the boundary | B5 | delete the message, the thread, the card row; null `agent_batch_hash`; each leaves the job bound or unrunnable |
| expiry, revocation, TEST disablement | C8, C10 | at claim and at the worker's pre-submit re-check; terminal finish still recordable |
| same-entry renewal preserves the boundary | B5 | a later identical card never extends an earlier job's deadline |
| wrong/stale leases, competing claimers cannot execute twice | (beyond gate) | good; include two claimers in one test transaction and a stale lease on finish and ask |
| authority changes during browser prep block sending | (beyond gate) | name the re-check point (worker before `--submit`, or engine's `factsStillGiven`) and test opt-out, pause, epoch bump, fact withdrawal mid-drive |
| receipt retries never rerun the engine | (beyond gate) | good; test a finish retried after a lost response |

## Not shown (answer by item number before code)

1. **A1 — producer / engine input: NOT COVERED. Owner decision applied: the architect builds it** (assignment 3). The
   bridge consumes it; it does not re-implement it. Interface, on branch `arch/engine-input` (being built now):
   `workers/career-cloud/engine_input.ts` →
   `engineInput({ owner, profile, rows }) → { facts, manifest: { hash, version, kept, excluded, conflicts } }` (pure) and
   `readEngineInput(source, owner)` (reads the stored chat profile and the person's answered `career_apply_questions`
   rows, service-side). `facts` is exactly the file `scripts/apply.ts --facts` reads; every fact still passes the one
   `trustedManifest`. The design states who calls it (the cloud prepare), on which machine, and that a `needs_answers`
   result goes to `career_apply_cloud_ask`-equivalent question rows, not a card.
2. **A2 — payload identity.** The queued `payload` is the card item's payload, canonical-equal, and `payload_hash =
   approval_hash = sha256(career_apply_canonical(payload))`; no second serialization between card and queue.
3. **C6** — the extension branch of `guard_queue` unchanged byte for byte (show the diff).
4. **C9** — the cloud claim refuses a job with no card binding; `career_apply_cloud_refusal` / `claim_at` re-created from
   **20261024120000's body** (live), not 20261021080000's, or the owner's waiver is silently dropped. Diff against it.
5. **C10** — the card is TEST-only and its handoff forbids enrolling the owner's ordinary account; the first real send is
   on that account. Name the rule that replaces TEST-only for one account (service-role row with expiry, like the
   waiver), and leave writing it to the owner.
6. **D11** — one additive migration after 20261024120000, depending on 20261021220430 (not live; the live apply is two
   files in order); idempotent (applied twice in `tests/db/run.sh`); ledger insert; grants (tap RPC `authenticated`, producer
   `service_role`, private tables none, `public, anon` revoked).
7. **D12** — rollback restores 20261024120000's refusal/claim bodies (md5 checked in a test) and drops only what it added.
8. **D13 / F18–19** — no caps, switches or waiver-table changes; files listed; size caps.

## What the owner should know

The relayed design is strong on the boundary cases. On this summary, nothing covered how a cloud-only person's
confirmed facts and texted answers become the engine's input, so that piece is the architect's (A1 above). Two items
are the owner's: C10 (which rule lets his ordinary account use the card) and, later, the live apply of both migrations.
