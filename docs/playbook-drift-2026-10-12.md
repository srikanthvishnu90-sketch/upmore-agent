# Docs that disagreed with the code (2026-10-12)

Owner rule (2026-10-11): a session that finds docs-vs-code drift fixes the doc in the same commit and logs it here.
Found while building monthly rent as a standing flow (real-world C110, spec 16 item S16-15). Each line: what the doc
said, what is true, and the source.

| Doc | Said | True now | Source |
| --- | --- | --- | --- |
| `docs/gauntlet/live-2026-10-12.md` | S16-15 "pay my rent" says plainly it isn't built; "Not built yet: S16-15 as a standing monthly rent flow" | The standing rent flow is built: no rent on file asks who, how much and which day; rent on file gets that month's card, whose yes stages it for the person to send | `packages/domain/81-standing-rent.js`, `tests/standing-rent.test.cjs` |
| `docs/launch/launch-and-beta.md` (blockers table, beta checklist, "not built" table) | Rent (C110) is not built; "pay my rent" goes to the bill review, which pays nothing | Built as a standing flow, staged for the person to send on their yes each month; needs the `20261012020000_standing_payments.sql` migration applied by the owner | same, `supabase/migrations/20261012020000_standing_payments.sql` |
| `docs/capability-list/map.cjs` item 74 (and the generated README) | "rent payment execution is not built (C110); 'pay rent' reaches the bill review, which pays nothing" | Rent is a standing flow staged for the person to send; Upmore never pays rent itself (no portal, ACH or check rail) | same |
| `evals/scenarios/verdicts.cjs` D01-D04, D12, D13 (and `docs/scenarios/README.md`) | "rent and bill pay end to end (C110) is not built; 'pay rent' reaches the bill workflow" | D01, D02, D03 LIMITED (handoff, every month asks); D04 BUILT (restated change card); D12 asks for one account; D13 is a shortfall question, not a rent command | `evals/scenarios/results/sim.json`, `tests/standing-rent.test.cjs` |
| `evals/gauntlet/replays/live-failures.json` S16-15 triage | not_built: "the standing rent flow (real-world C110), which is not built" | precondition: the flow is built; the live test user has no rent on file, so the reply is the setup question | `tests/edge/live-replays.test.ts` |
| `docs/instinct-spec-series/BUILD-STATUS.md` (v3 replays row) | "S16-15 rent flow C110 not built" | Built; replay triaged precondition (no rent on file for the test user); new section "Monthly rent as a standing flow" | this commit |
| `supabase/functions/agent-chat/_shared/direct_answers.ts` header | "A standing rent payment is not built (Phase 3), said plainly" | The direct answer is removed; the flow router answers | this commit |
