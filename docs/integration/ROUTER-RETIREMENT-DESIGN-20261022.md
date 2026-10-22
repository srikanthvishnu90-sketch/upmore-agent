# Router retirement design (2026-10-22)

**Owner:** the architect (from Vishnu's direction at 3:41 PM). **Design only.** Nothing here deletes `packages/domain/142-career-router.js`, flips a flag, deploys or spends. Each of those is the owner's word.

## 1. Facts (read at `consolidate/2026-10-22` @`a93af5a2`)

- `packages/domain/142-career-router.js`: 12,066 lines, 145 `handle*` functions, 29 distinct `career_*` intents.
- The agent brain: 37 tools in `supabase/functions/_shared/agent/career_tools.ts`.
- The switch is `CAREER_BRAIN=agent` (`supabase/functions/agent-chat/career_brain.ts:21`, used at `handler-career.ts:331`). Today the agent falls back to the router on a model error. Live agent-chat v248 runs the router unless the flag is set.
- BUG-173: 62 of 86 genuine turns got the generic fallback (v221 battery). The fix wave took that to 0/84 offline, but the fallback came back live (F-002, F-037, MI-124). **The offline number has not predicted the live one.** So stage 0 measures live.
- Brain baseline: M2 three-way, full-38 = 85.1, clean-30 = 85.6.

## 2. What the agent brain must cover first (coverage matrix)

The intents are listed by how often they appear in the router. "Gap" means there is no agent tool that does the same job with the same guards.

| Router intent(s) | Agent tool today | Status | Must hold before cut-over |
|---|---|---|---|
| `career_guidance` (14) | `career_path_answer` | partial | Answers come only from confirmed facts; never an invented answer (D-007) |
| `career_os_plan`, `career_os_wins_log` (11+) | none (module 129 is router-only) | **gap** | A plan and wins tool on module 129, or an explicit decision to drop it |
| `career_tailor`, `career_tailor_diff` (10+) | tailor tool | partial | The diff view; no fact absent from the confirmed facts |
| `career_batch_apply` (10), batch status | prepare and approve tools | **gap** (F-002, F-037) | Status reports the true run state; the card reaches every surface; a text yes never approves (Option A) |
| `career_discovery` (7) | search tool | partial (F-001) | Links on every role; an honest zero with family counts (F-006) |
| `career_watch_create`, `career_watch_manage` (4+5) | `set_job_alerts` | partial | Create, list, pause and delete |
| `career_packet` (5) | none | **gap** | A packet tool or a decision to drop it |
| `career_resume_ingest` | `read_resume` | covered | Facts staged as unconfirmed until the person confirms |
| `career_essay` | essay draft | partial (career-essay-draft not deployed) | Drafts only; never submitted |
| the other 17 intents | — | not mapped yet | **First task of stage 0:** map each one to a tool, a gap, or "drop, with the owner's OK" |

Order of work: first the gaps that live turns hit most often, measured in stage 0, not from this table's router counts. Today's guess is batch apply and status, then os_plan, then packet.

## 3. What to measure

Per brain, per surface, on live turns (logged, no new spend):
1. **Fallback rate**: the share of genuine turns answered by the generic fallback or the router safety net. Today it is unmeasured live under the agent brain; the last offline figure is 62/86 under the router. **Target: under 2% on at least 200 genuine live turns.**
2. **Eval pass rate** (`evals/career/run.ts --brain agent|router`): not below the 85.1 baseline. A paid run needs the owner's yes.
3. **Standing-rule violations**: an invented fact, a send without a tap, a text yes that approves. **Target: zero.** One violation stops the stage.
4. **Cost per turn and p50 latency**: within an envelope the owner sets before stage 2.
5. **Router-reach**: how many turns under the agent brain still reach 142 through the fallback, by intent. This is the number that says when 142 can be frozen.

## 4. Staged cut-over behind one flag

`CAREER_BRAIN` takes four values. Every change of value is the owner's word.

| Stage | Value | What happens | Exit gate to the next stage |
|---|---|---|---|
| 0 | `router` (today) | Add per-turn logging of brain, intent, tool and fallback. Map the 17 unmapped intents. | Logging live; the matrix has no unmapped row |
| 1 | `shadow` | The router answers. The agent runs the same turn with no side effects and its reply is logged, never shown. **Needs the owner's spend OK** (doubles model calls). | Agent fallback under 5% on 200+ turns; zero rule violations; the eval at or above 85.1 |
| 2 | `agent+router-fallback` at 10% of users (stable hash of the user id), then 100% | The agent answers; the router catches model errors only | Fallback under 2%; zero violations; cost and latency inside the envelope; router-reach falling |
| 3 | `agent-only` | 142 is no longer called. It stays in the repo, frozen: no new intents, fixes only for live incidents | 30 days with router-reach at 0 and no rollback |
| 4 | — | Deletion of 142 and its bundles, in one PR the owner approves | — |

**Rollback at any stage:** set the flag back to the previous value. No deploy is needed if the flag is read at runtime. If it is read at build time, the rollback is redeploying the previous version, v248 = `cea914fe`.

## 5. Out of scope

- Deleting or editing 142 beyond the stage-0 logging.
- Any flag change, deploy or paid eval run without the owner.
- The submit path: `CAREER_AGENT_SUBMIT` and `CAREER_CLOUD_APPLY` stay off throughout.

## 6. Builder work this design creates (to relay)

1. **Codex:** stage-0 turn logging (brain, intent, tool, fallback reason) in `handler-career.ts` and the agent loop, behind no flag, with a fail-first test. Then the 17-intent mapping as a table added to this file.
2. **Codex:** the `shadow` value for `CAREER_BRAIN`: the agent runs with every external effect stubbed, and a test proves no send, submit or write happens in shadow.
3. **Muse:** the gap tools in order (batch status, os_plan, packet), each with fail-first tests, after F-002 and F-037 land on trunk.
