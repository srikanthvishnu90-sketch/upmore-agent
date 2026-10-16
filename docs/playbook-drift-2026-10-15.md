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

## Owned browser worker continuation

The prior module-150 helper explicitly launched Chromium with its sandbox
disabled, accepted insecure TLS, and suspended destination checks during the
submit landing. Those paths were unsuitable for the owner's restriction.
The helper now requires Chromium sandboxing, uses normal TLS, and keeps the
destination gate in place. Controlled tasks also restrict origin/frame,
mutation method and exact destination, and stop redirects before following.

Module 149 treated a first observed form and a successful tool call as enough
to prepare a review. It now checks actual answers, repeats observation for
conditional fields/pages, and requires an observed final review. Module 150
binds actions to observation versions and real element handles, and reads back
the uploaded File's byte hash. These changes are engine/protocol tested; real
Chromium verification is blocked by the executor's sandbox configuration.

The career chat now has an optional explicit task protocol to a separate
durable worker; Muse's CareerHost storage and Crew A alerts remain unchanged.
There is no connected production worker or new resource. Full interface,
limitations and exact runtime blocker: `docs/career/owned-browser-worker.md`.

## Atomic task / account authority integration

Independent staged probes found that the optional HTTP worker bridge could
run before the memory turn committed, bypass the host pause, ignore changed
request bindings on replay, and omit structured evidence from saved replies.
The bridge now plans only an immutable task intent, committed with the
existing memory transaction through a new forward migration proposal.
A separate worker uses the same account row/version/epoch/pause and lock for
claims and one-use operation tokens. No parallel account authority was added.
STOP/erase revoke pending work; uncertain effects keep no-retry fences.

The old host test expected the deep domain's `paused_hold`, although the
memory repair already returned host-level `career_paused`. The persisted
pause response also lacked a typed result status. It now returns `blocked`;
the regression test checks that status, host control ownership and null action.
The frozen independent probes remain unchanged. Full protocol, active-copy
erasure limits, local PostgreSQL evidence and the unchanged Chromium blocker
are documented in `docs/career/owned-browser-worker.md`.
## Capability 2 evidence grounding

Module 144's header promised every factual claim traced to confirmed facts,
but quant comparison unconditionally said the user had an in-progress CS
degree, Python and a built project. Its generic plan assumed existing project
and Python work even for law/nontechnical/empty profiles; data-science and
interest-change replies also assumed Python/SQL or an age of 32. These claims
are removed or replaced by confirmed fact citations and explicit unknowns.
The new 154 adapter supplies evidence-labeled role hypotheses across the
technical and nontechnical catalog, and requirement-specific skill gaps.

The bundle contribution fixed module reachability; it did not connect current
job observations or upload confirmation to the handler. The new host contract
in docs/career/capability2-host-interface.md records that distinction. Local
fixtures never qualify as current openings in this recommendation path.

The optional broader clock guard cannot start in a clean workspace because
it reads `$HOME/workspace/your_files/upmore-career-300-scenarios.md` at module
load (tests/career-clock-source-guard.test.cjs:42). That external artifact is
absent here. Its frozen expectations and source were left unchanged; the
failure is preserved in the verification evidence, rather than manufacturing
a substitute scenario document or relabeling the check as passed.
