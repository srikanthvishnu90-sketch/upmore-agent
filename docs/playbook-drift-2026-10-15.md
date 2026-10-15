# Career bundle reachability repair (source only)

Base: release/career-v223 at afc460ec872f61eb2dcdbbca4d34140fb8b345c0.

The guidance entry regression and alerts host tests exercised Node domain
imports, while staging uses index-career.ts -> handler-career.ts ->
router_core.career.js. The generator omitted 144, 151 and 152. Without
CommonJS require, guidance used a generic template and watch creation
fell through. The new staged-entry regression reproduced these failures
before the fix, then passed after adding the modules and exports. Module
144 precedes 142's eager binding; 151 precedes 152; 142 resolves 152 lazily.

Module 150 requires Node filesystem/process APIs and remains outside Edge.
Domain reachability supplies neither a browser worker nor a scheduled
delivery channel. The host now reports both as NOT_WIRED and watch replies
avoid claiming the next tick or delivery. No worker is started by this patch.

The alerts wiring note said threads were views onto one shared profile and
that STATE_KEYS gave cross-thread durability. The actual handler loads
agent_flow_state by thread ID. The note now distinguishes snapshot reload
within a conversation from the pending shared-store/scheduler bridge.
Muse's existing snapshot whitelist and Supabase adapter are preserved.

Verification uses synthetic data and in-memory Supabase/serve stand-ins,
executes the staged entry's local import graph in an ESM-only VM with no
require or network, and exercises 151 -> 152 seed/new/repeat processing.
It checks guidance, watch save/list/pause/resume/remove, explicit missing
workers, and absence of phantom reminders or submissions. This is local
verification; Deno is unavailable in this environment. No deployment,
database mutation, employer submission, email or paid API call was made.
