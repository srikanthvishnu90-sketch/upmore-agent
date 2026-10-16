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

## Independent review supersedes capability-2 readiness (2026-10-16)

The 3157b65 local regression/mutation passes did not prove semantic evidence or
source-history boundaries. Independent frozen review found ten capability-2
failures and one inherited 130 correction-cache failure. This follow-up adds
performed-work relations, denial/conflict handling, stable legacy IDs, latest
closed-observation suppression, mandatory geography, complete example-domain
checks, and explicit skill/weekly-budget retention in chat. Coverage now includes
mechanical/electrical/teaching/graphic-design work samples. Existing frozen
inputs and expectations are unchanged. H20 remains with Crew A and blocks any
combined-ready claim; no production or end-user quality verification is inferred
from these local tests. The host contract now specifies atomic grounding retention
rather than leaving the result as prose-only metadata.
