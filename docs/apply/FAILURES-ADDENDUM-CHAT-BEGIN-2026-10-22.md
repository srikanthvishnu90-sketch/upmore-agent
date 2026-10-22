# FAILURES addendum — chat begin-caller lane (2026-10-22, night plan chunk 40%)

Branch `muse/2026-10-22-chat-begin-caller`. To be folded into
FAILURES.md proper by the coordinator (FAILURES.md lives on
`muse/2026-10-20-failures-backlog`; this branch's base does not carry
it). Numbering continues the MUSE-F series used by the apply lanes.

## MUSE-F-030 (proposed) — OPEN: a chat/cloud begin is mis-stamped `extension`, and no DB claim ever takes a begun row

Found by the chunk-40% map (docs/career/chat-begin-caller-2026-10-22.md,
links 6-7), read-only, from the migration sources on
`origin/wo/first-real-submission`:

- `career_apply_extension_begin_own` (latest definition, migration
  20261021120000, line 12) refuses any payload whose `source` is not
  the literal `'extension'`, and (line 19) stamps the job row
  `source = 'extension'`. Any begin through
  `career_apply_extension_begin_agent_own` — including a begin the
  CHAT path makes on behalf of the cloud worker — is therefore
  recorded as an extension application by construction.
- The family gate counts hand submissions per portal from
  email-confirmed rows with source `own_computer` or `extension`
  (migration 20261021075000). A cloud-driven application begun from
  chat would, once email-confirmed, count toward the gate's HAND
  tally — provenance the gate's whole design depends on, corrupted
  by a label.
- Compounding: `career_apply_cloud_claim_at` (migration
  20261021080000) claims only `state = 'queued' AND source IS NULL
  AND approval_hash = payload_hash` rows. A begun row is `driving` /
  `extension` (pre-claimed by begin_own for its beginner-driver), so
  the DB cloud claim never takes it: in production today there is no
  DB path from a begun row to a cloud drive. (The TEST-world executor
  drives from the stored batch record, not from this row.)

Fix shape (its own round; needs a migration, which is the owner's
word): a begin variant for the agent path that takes an explicit
driver source (`cloud`) and leaves the row claimable by the cloud
claim — or a cloud claim branch for agent-begun rows — plus the gate
tally reading only true hand sources. NOT built here: chunk 40% is
repo-only under the owner's 2026-10-22 00:06 ruling, and a migration
is a live apply.

## The missing chat begin-caller — FIXED (built, NOT deployed)

The failure this chunk owns: `career_apply_extension_begin_agent_own`
had no chat-side caller; a Messages-card approval (module 175)
dead-ended — the DB approval row was never written by chat code and
no product path could turn a tap into a begin. Fixed on this branch
by module 176 (`packages/domain/176-career-agent-begin.js`) + the
default-OFF wiring (bundle reachability, the host's `agentBegin`
composition dep, the router approval turn's `batchDelegate
{phase:"begin"}` marker). Proof: `tests/career-agent-begin.test.cjs`
25/25 (payload builder + the six contract checks mirrored with
negative controls, flag-OFF zero-RPC refusal, verbatim DB refusals,
the stubbed happy path) and `tests/career-agent-begin-wiring.test.cjs`
3/3. FIXED means built + test-proven on the branch; per the standing
rule it becomes FIXED-live only on a fresh real run after the owner's
deploy word — the deploy unit is named in the build note (§2).
