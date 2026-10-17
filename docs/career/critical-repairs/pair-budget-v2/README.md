# Paired budget proposal

SOURCE-ONLY proposal: `supabase/sql/proposals/career_model_pair_budget_v2.sql`.
It seeds no policy, campaign, real allowance, model enablement or credential.
Muse owns migration review and deployment. The original shared $5 remains
UNKNOWN/unreconciled; no paid call was made.

Frozen native test source `2583a2e1` precedes the proposal implementation.
The pre-commit prototype first passed 19/27 checks; eight actual readback/refund
failures exposed missing backend monthly RLS policies. That exact proposal is
retained as `first-proposal.sql.txt` (SHA-256
`2ddac07b3594adb64a20d76ee5274ae01fb0fd5fc23dfc5cb6a7271309f87c97`).
RLS and the client owner policy remain enabled. The repair adds service-only
reads and deletion only of unused reserved monthly slots; it grants no client
access and does not give the fixture role BYPASSRLS. The prepared proposal then
passed 27/27 in a fresh marked/labeled network-none PostgreSQL 16 fixture.
The run's Git HEAD was `2583a2e1` plus the uncommitted proposal: that is not
represented as a runtime contained in that commit. A clean-source aggregate
rerun follows the proposal commit. Both fixtures were removed.

The four service-only invoker RPCs atomically hold both global bounds and both
legacy monthly slots, preserve stable parent/leg keys, check exact payload and
checker envelopes, and recheck the shared unknown/overdue-started stop at both
dispatches. Known receipts settle both ledgers once with authoritative monthly
readback. Invalid usage retains the full bound; only never-dispatched legs
refund. Status reads change no account or task version. Publication is distinct
from accounting settlement. No transaction is held during a provider request.

These tests use synthetic receipts, not actual provider usage. Handler wiring,
semantic assessment, context-v3 continuity and real provider quality are not
established by these SQL checks. No production change occurred.
