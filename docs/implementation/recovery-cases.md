# Recovery cases: local tracking contract

The recovery review now lets an authenticated owner save a candidate, choose a
follow-up date, report that they submitted their own request, close tracking,
and reopen unchanged evidence. These operations never contact a merchant or
certify that a refund happened. `recovered_cents` stays unknown.

Migration19 stores immutable source snapshots, owner-bound cases, retry receipts
and append-only events. Only authenticated owner RPCs can write. Neither a
client approval flag nor a model tool can change financial authority. The typed
`get_recovery_cases` tool reads local state and explains its limitations.

Opening requires exact owned transaction identities and current fact hashes.
The server derives amounts and checks the candidate facts itself. A shared
owner lock prevents concurrent overlapping active cases, including different
duplicate pairs sharing one transaction. Repeated requests preserve the first
receipt. Version checks reject stale edits. Historical retry responses preserve
their original status and evidence but recompute source staleness now; they also
show the current version and whether another edit superseded the receipt.

Changed or removed bank facts block reported submission and reopening. Local
closure remains possible, with copy explaining it is not proof of resolution.
The UI clears owner-private state on identity changes and presents conflicts
without silently claiming the newest edit succeeded.

## Remaining boundaries

- Follow-up dates are stored, not scheduled notifications. Date editing and
  timezone/quiet-hour reminder delivery are not implemented here.
- Corrected evidence needs a new review protocol; immutable snapshots are not
  silently refreshed. Charge-specific verified refund allocation is unfinished.
- Merchant requests, disputes, claims and external completion verification are
  not implemented by these tracking controls.
- The Messages bridge currently uses a service-role reader. These recovery RPCs
  deliberately require authenticated ownership, so that bridge cannot use them.
  A separate leased-turn, active-channel, consent-bound read contract is needed;
  granting broad owner impersonation would bypass this boundary.
- Interface tests use a synthetic DOM. Actual browser/accessibility inspection,
  provider sandbox and production verification remain outstanding.

All files belong to the `srikanthvishnu90-sketch/upmore-agent` checkout. Production
migration ordering and release approval remain separate from local test results.
