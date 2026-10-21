# Connector assembly — deploy checklist (owner-gated)

For the deploy of branch `muse/2026-10-21-connector-assembly`
(the four connector packages on one tree; assembly record:
`docs/connector/assembly-2026-10-21.md`). **Nothing here runs
without the owner's explicit go on the exact commit.** No step in
this checklist flips `CAREER_AGENT_SUBMIT` or touches the apply
chain — the connector gate is a separate switch, and the email
sink stays SEND_DISABLED throughout.

## What this deploy changes for a live user

- With the env vars unset (the state this checklist deploys
  FIRST): **nothing.** The gate module's `decide` returns
  `disabled` for every user; dispatch never enters the connector
  claim; people-matching keeps v248's honest stop byte-identical.
- After the owner sets the env vars (step 5): accounts on
  `CONNECTOR_ALLOWLIST` get the connector flow's honest
  `connector_not_wired` reply on people-matching asks (no
  production pool is installed yet — the connections-registry seam
  is a separate follow-up), and everyone else is unchanged. The
  full flow (capture → match → intro) goes live only when the
  production pool lands; this deploy wires the gate so that day
  needs no router change.

## Steps

1. **Owner go on the exact SHA.** Record the assembly branch head
   being deployed (full SHA) in the deploy report before anything
   runs. A moved head = a new go.
2. **Stage — never the raw tree.** From a clean worktree at the
   pinned SHA:
   `node ~/workspace/prune-lane/stage-graph.cjs <worktree> agent-chat/index-career.ts <stageDir> all-js`
3. **Stage diff + gate re-checks on the stage** (all must pass
   before deploy):
   - Diff the stage against the v248 stage
     (`~/workspace/stage-cea914fe`): changed files limited to the
     connector surface (router bundle, career_host, handler) —
     anything else stops the deploy.
   - `CORRECTION_STORE` occurrences in the staged bundle: **0**
     (F-014 stays fixed); `correctionKey`: **0**.
   - `career_goal_record` present in the staged bundle (F-017
     stays fixed).
   - `CareerConnectorGate` present in the staged career bundle,
     and `connectorGate` present in the staged `career_host.js`.
4. **Deploy the stage** via the /tmp copy of sb.py with entrypoint
   `agent-chat/index.ts` (`SUPABASE_REF=mrwngntwmnaqrqhupvlt`;
   sb.py at `~/workspace/skills/supabase/bin`). Do NOT use stock
   `sb.py deploy` on the raw repo tree (HTTP 413 + wrong
   entrypoint).
5. **Env vars (owner-side, after the code is live).**
   `sb.py secrets-set CONNECTOR_ENABLED=true CONNECTOR_ALLOWLIST=<owner-user-id>`
   on the upmore project — start with the owner's own id ONLY.
   `secrets-set` prints a spurious JSON error even on success;
   verify with `sb.py secrets-list | grep CONNECTOR` (names only,
   never values in any log or report). Until this step runs, the
   deployed gate is inert by construction.
6. **Provenance.** Re-download the deployed agent-chat body;
   bundle sha256 must equal the staged bundle's sha256; record
   the new agent-chat version + ezbr sha alongside the pinned
   commit SHA.
7. **Live re-checks** (all on the live function, in order):
   - Functions list: new agent-chat version ACTIVE.
   - Battery S4/S5 quick pass + the goal-memory probe, verbatim
     (F-017 behavior unchanged).
   - `career_cloud_settings` still EMPTY and
     `career_apply_agent_submit_enabled()` /
     `career_apply_cloud_enabled()` still false (this deploy does
     not touch the apply chain).
   - Connector posture, gate vars still unset: a people-matching
     ask on the test account returns `people_matching_stop`,
     byte-identical to v248.
   - After step 5: the owner's account asking "find me a mentor"
     returns `connector_not_wired` (expected live behavior until
     the production pool lands); a non-listed account still
     returns the unchanged stop.
8. **Rollback (staged, not executed).** Redeploy the preserved
   v248 stage (`~/workspace/stage-cea914fe`) via the same sb.py
   route, and unset `CONNECTOR_ENABLED` / `CONNECTOR_ALLOWLIST`.
   Rollback is complete when the functions list shows the v248
   build ACTIVE and the step-7 battery/goal probes pass.

## Explicitly not in this deploy

- No production pool (no proposals, matches, or intros can occur
  in production from this deploy — there is no store behind the
  flow yet, by design).
- No sends of any kind; module 124's sink stays SEND_DISABLED.
- No `CONNECTOR_ENABLED=true` for any id beyond the owner's until
  the pool lands and the owner names the first cohort.
