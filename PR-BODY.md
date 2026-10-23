# Router-eval fix 3 of 3 — the job-watch profile gate must leave the record in the state the reply states

Branch: `muse/2026-10-22-router-fix3-jobwatch-state` · Base: `373453f3` (trunk)

## Root-cause note (written before the fix)

**The exact mismatch.** A user in a fresh thread asks for a job watch. The
reply (142's profile gate) says: *"I can set that watch up — I need your
profile on file first. A watch matches new postings against your confirmed
facts and interests; with no profile there is nothing honest to match
against… Tell me about yourself first — school, class year, the work you
have done — and then say the watch again."* The record at that same moment
can hold a complete module-152 watch profile for that user — a standing
interest list plus its own `scoring_profile` (the match basis) — which the
product's own read-back then lists ("You are watching 1 role"), and the
host's scheduler keeps polling. The reply states there is no profile basis
on file and that no watch can stand; the record states the opposite, and
the requested watch is refused even though the record itself carries
everything creation needs.

**The exact lines.** `packages/domain/142-career-router.js`,
`handleWatchCreate` (the gate at the head of the function):

```js
const profile = ctx && ctx.profile;
if (!profile) { …profile-needed reply… }
```

The gate tests only `ctx.profile` — the 122 master profile. The two
records have different scopes and lifetimes, and the gate conflates them:

- The 122 master profile rides the **per-thread** snapshot
  (`career_host.js` STATE_KEYS includes `"profile"`; `handler-career.ts`
  passes no profile opt, so a fresh thread starts with none).
- The 152 watch record is **per-user** (`career:watch-profile:<user_id>`,
  loaded into the turn separately as `watchState` in
  `career_host.js` `createTurnCtx`), and creation itself already treats
  that record as the standing basis: further down the same function,
  `if (!wp.scoring_profile) wp.scoring_profile = scoringProfile(profile)`
  — the master profile is consulted only to seed a **brand-new** record
  or a record missing its scoring basis.

So whenever a thread carries no master profile while the user's watch
record stands (the normal case for any returning user in a new thread),
the gate fires on the wrong record: the reply misstates the record's
state and refuses a write the record supports.

**Which side is wrong, and the fix.** The reply/behavior side is wrong;
the record is right and is not touched destructively. The gate's own
rationale — "nothing honest to match against" — is true only when
**neither** basis exists. The fix narrows the gate to exactly that case:
it fires only when there is no master profile **and** no standing watch
record carrying a `scoring_profile`. When a standing record with its
scoring basis exists, creation proceeds against the record exactly as it
does today for a profiled user (upsert + validated save; the record's own
scoring basis is kept, never overwritten). When neither basis exists,
the gate reply stands word-for-word and — as today — writes nothing.
The gate's record read goes through the existing read view
(`loadWatchProfileSync` → `watchStoreOf(ctx, false)`), which never
materializes state, and the record stays keyed per user
(`A.PROFILE_KEY(watchUserId(ctx))`) — multi-tenant by construction, no
user ids or fixture literals in the product path.

Reproduction (base `373453f3`, host seam, synthetic user): fresh thread,
no master profile, standing watch record (Data Analyst, Chicago, with
scoring basis) loaded as the user's watch state → ask "Watch for
software engineering intern roles in New York" → gate reply above;
record still holds only the old interest; immediate read-back in the
same thread: "You are watching 1 role. Watching: Data Analyst —
Chicago + remote." — the reply and the record contradict each other.

## Fail-first tests

`tests/career-router-fix3-watch-gate.test.cjs` — own synthetic users and
roles only; no held-out eval cases used as fixtures. Driven through the
`career_host` seam (120 → 130 → 142 → 141), the product's own
composition. Cases:

1. **Standing record, no master profile (the defect):** a second watch
   ask is served — intent `career_watch_create`, status `prepared`, no
   profile-needed text — and the record read-back holds both interests.
2. **Read-back consistency:** after case 1's flow, "What am I
   watching?" names both roles from the record.
3. **Control — gate preserved, no basis at all:** no master profile and
   no standing record → the profile-needed reply, `awaiting_user`, and
   no watch state is materialized anywhere in the snapshot.
4. **Control — gate preserved, record without a scoring basis:** a
   standing record whose `scoring_profile` is absent and no master
   profile → gate reply; the record is left byte-identical (no interest
   added, none removed).
5. **Control — positive path unchanged:** master profile on file, no
   standing record → the watch is created and recorded exactly as the
   reply states.

Counts (base vs branch) are recorded below after the runs.

## Files changed

- `packages/domain/142-career-router.js` — `handleWatchCreate` gate
  scope (the fix).
- `supabase/functions/_shared/router_core.js`,
  `supabase/functions/_shared/router_core.career.js` — regenerated
  bundles (`scripts/build-router-core.py`), the form 142 ships in.
- `tests/career-router-fix3-watch-gate.test.cjs` — new fail-first suite.

## Results (measured, this worktree, base `373453f3` vs this branch)

| Check | Base | This branch |
|---|---|---|
| New guard: `node --test tests/career-router-fix3-watch-gate.test.cjs` | **3 pass / 2 fail** — the two defect cases fail on the gate reply verbatim ("I can set that watch up — I need your profile on file first.", `awaiting_user`, second interest never recorded); the three controls pass | **5 pass / 0 fail** |
| `tests/career-alert-intents.test.cjs` | 8 pass / 0 fail | 8 pass / 0 fail |
| `tests/career-p8-watch-phrasing.test.cjs` | 4 pass / 0 fail | 4 pass / 0 fail |
| `tests/career-alerts-host-wiring.test.cjs` | 14 pass / 0 fail | 14 pass / 0 fail |
| `tests/career-v240-live-gaps.test.cjs` | 11 pass / 0 fail | 11 pass / 0 fail |
| `tests/career-lane-a-depth.test.cjs` | (not re-run on base this lane) | 35 pass / 0 fail |
| `tests/career-bundle-reachability.test.cjs` | (not re-run on base this lane) | 1 pass / 0 fail |
| `tests/career-worker-wiring.test.cjs` | (not re-run on base this lane) | 8 pass / 0 fail |
| `tests/career-assign.test.cjs` | (not re-run on base this lane) | 16 pass / 0 fail |
| `tests/career-http-host.test.cjs` | (not re-run on base this lane) | 6 pass / 0 fail |
| Bundles | — | rebuilt both modes; `build-router-core.py --check` and `--career-only --check` both "Router bundle verified" |
| Shipped-bundle drive | gate reply (domain probe, base) | the defect scenario driven against `router_core.career.js` directly: intent `career_watch_create`, status `prepared`, record holds both interests |

Neighboring suites total on this branch: **103 pass / 0 fail** across the
nine suites above; every suite also run on base returned identical
counts. No existing test was deleted, skipped, or loosened.

Full node sweep (`node --test tests/*.cjs`): **not run to completion in
this lane** — on this VM the sweep stalls in the sandbox-broken
browser suites (log frozen mid-run under contention with a sibling
lane's sweep); the gate's own sweep on the PR is the place for that
number. The suites that touch the changed code — watch create/manage,
alerts host wiring, the host seam, the bundle — are all run and counted
above, base vs branch.
