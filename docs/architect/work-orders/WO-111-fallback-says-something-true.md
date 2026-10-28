# WO-111: the fallback never says nothing, and never contradicts the record

Status: ready · Depends on: none · Size cap: ~300 lines · Assignee: any

## Why
Brutal eval, router path (`evals/career/results/task-context-brutal.router-2026-10-28.json`): 137 of 383 checks fail, 0 of 30 scenarios clean. The
same four causes account for the worst replies:
1. **Catch-all** (`packages/domain/142-career-router.js:2898`, bundle `router_core.career.js:14887`): "I did not catch what to do with that one. Here is
   what I can do: ..." answers "how many years of ICU experience do I have?" (T17), "cancel my job alert" (T05), "apply to the Stripe one" after a
   search (T04.2), "send the Plaid email to Jordan" (T09), "what should I put for the salary one?" (T12.2). A static menu is canned filler by rule.
   `140-career-reply.js:129` (`unmatched`) is the second one ("I'm Trainee, a career agent ... what should we work on first?", T23).
2. **"Relocating" for the person's own city** (`142-career-router.js:345`, `locationCaveat`; bundle `:13131`): reads only `profile.basics.location` and
   `profile.preferences.locations`, never a confirmed `location` fact or the saved alert's places. "Houston, TX, outside the places on your profile,
   so it means relocating" for a nurse who lives in Houston (T15.1); the same for Chicago (T02.1).
3. **Search ignores standing instructions** (the discovery reasons at `142-career-router.js` near `locationCaveat`/the fit reasons; bundle `:13110-13130`):
   a remote-only person with an $85,000 floor is shown the on-site Austin role and the $58,000 role (T22.1).
4. **Out-of-room company file**: a pay question answers from an unrelated posting ("Software Engineer - C++ ... $153,000-$376,000" for a Figma data
   analyst, seen in an earlier run), `142-career-router.js:5897`.
Also: "show me the message to Dana" / "send the Plaid email" miss the outreach parser (`career_outreach.ts:327`, which accepts only "show ... drafts|emails|outreach"
and numbered sends); a draft waiting for approval is invisible to a yes in a new thread (T10).

## What
- The router is the model-down fallback (D-008). When a turn is not classified and the model is available, it goes to the brain; when the model is down,
  one plain sentence that names what failed, no menu.
- `locationCaveat` and discovery read confirmed location facts, the alert's places and `remote_only`/salary-floor standing instructions; a role that breaks one
  is dropped or flagged in the person's own terms ("This one is on site in Austin, and you said remote only.").
- Outreach: any "show/send the <company> email" resolves to the waiting draft, shows the exact payload, and sends only on a yes to that hash (existing
  rules; no new send path).
- No new hard-coded reply prose beyond one honest fallback line (AGENTS.md rule).

## Files
`packages/domain/142-career-router.js`, `packages/domain/140-career-reply.js`, `supabase/functions/_shared/career_outreach.ts`, rebuilt bundle (`python3 scripts/build-router-core.py --career-only`; the bundle is already stale on trunk, so rebuild in its own commit).

## Acceptance
Brutal T02, T04, T05, T09, T10, T12, T15, T17, T22, T23, T24 no longer hit a hard check and `--brain router` raises effects, params, context by 1.5 points or
more; `deno test` architect suite green; the reference-transcript test (`tests/architect/task-context-brutal.test.ts`) unchanged.

## Out of scope
Making the router "smart". Anything the brain does.
