# Capability 2 reviewed source handoff

Source commit: `48f919d202c469a5d2ad1497a6eaaebc0a006d0f`.
Base: `005aae50cc2d3495c80cc4bb661114f059e66cec` (bundle contribution), descended
from release/career-v223 `afc460ec872f61eb2dcdbbca4d34140fb8b345c0`.
The later evidence commit changes documentation/evidence only. Source digest:
`210da802525ae0a78a351cdaa5acc287dd8beaf3122042583ebc30531a3b9621`.

## Results

| Command group (exact argv in results.json) | Result |
|---|---|
| Grounding + scale | 138/138 tests; 120 resumes from 24 independent archetypes, five extraction/layout/location variants each |
| ESM-only staged entry + bundle/host | 9/9 tests; all 120 confirmed resume profiles through career/full bundles identically; actual staged HTTP path with mocked external services |
| Existing adjacent frozen contracts | 236/236 tests; existing fixtures/tests unchanged |
| Capability 2 targeted planted defects | 15/15 caught by an AssertionError in the owning test; isolated copies only |
| Agent100, dry mode | 103/103 |
| Local release harness | RELEASE OK; 29/29 acceptance test files, 25/25 operating scenarios, safety 115/115 injection + 45/45 traps + 100/100 advice |
| Whitespace | PASS |

All checks are LOCAL and synthetic. There were zero paid model calls, production
writes, Browserbase actions, employer applications or emails. The test's mock
Supabase writes are in-memory state transitions, not database operations.

## Review findings addressed

- Module 144's empty-profile quant comparison invented CS, Python and a built
  project; the preserved baseline reproduction fails the new no-invention
  assertion. The new comparison lists confirmed fact IDs or says unknown.
- Generic paths used CS/Python/project assumptions across profiles; module 154
  now supplies explicitly hypothetical roles, evidence citations, domain work
  samples and tradeoffs across nontechnical/operations/law/finance/CS records.
- Draft/rejected facts, ambiguous IDs, unproven skills and dangling evidence
  references cannot establish demonstrated skill evidence. Missing evidence
  stays distinct from an absent ability.
- Skills gaps preserve supplied required/preferred/unknown levels and quotes;
  recipe gaps are explicitly not employer requirements. Nontechnical samples
  use checklists/memos/review rather than a code repository by default.
- City preferences and relocation limits are explicit. Remote status never
  bypasses employer geography; missing geography fails closed. No local demand
  or salary rankings are invented.
- Current openings require trusted source kind, HTTPS URL, explicit open state,
  host observation time within 24h and matching scope. Filesystem fixtures,
  snapshots, stale rows and unknown sources are excluded with reasons.
- One intermediate regression treated the verb "resume" in "Resume my job
  alerts" as a resume recommendation ask. The read-only intent exclusion now
  preserves watch/alert ownership, and the existing staged watch lifecycle
  regression passes unchanged. The initial failure remains in private evidence.
- Adapter outputs no longer share mutable recipe arrays across users; ingestion
  works on a clone and preserves extra profile fields. No canonical state or
  browser worker implementation is changed by this branch.

This is a self-review with executable counterexamples and targeted mutations;
it is not an independent human review or a live production certification.

## Remaining blockers and limits

1. Handler integration is pending with Muse/Crew A. Existing handler restores
   saved thread profile state but injects neither fresh public posting
   observations nor upload extraction/confirmation. The precise host contract
   is in docs/career/capability2-host-interface.md. Live openings remain
   unverified until that host-owned adapter exists; no fixture fallback is used.
2. `node --test tests/career-clock-source-guard.test.cjs` fails at module load:
   `/home/agent/workspace/your_files/upmore-career-300-scenarios.md` is absent.
   Outcome is known (ENOENT), not a denied or uncertain action. The test and
   frozen scenario expectations were not edited or replaced. See the full log.
3. Deno is absent. The actual staged local graph executes in an ESM-only Node
   VM; real Supabase/auth/provider/Deno deployment is not verified. No deploy
   was attempted, in accordance with Muse's ownership.
4. This is a deterministic English recipe catalog, not an exhaustive occupation
   taxonomy or semantic resume evaluator. Role fit, seniority, licenses,
   personal preferences and employer eligibility remain hypotheses/unknowns.

Complete synthetic resumes, normalized profiles, all 120 outputs, baseline
failure and mutation failure logs are preserved privately at
`/workspace/capability2-private-evidence/`. results.json lists file sizes/hashes
and per-source hashes. These full records are outside the published source
branch. The branch carries source, frozen synthetic inputs, test logs and the
reproducible commands; it contains no production export or personal applicant
record. Muse owns final review, merge and deploy.
