# Capability 2 host handoff (source only, 2026-10-15)

This branch builds on release/career-v223 `afc460ec872f61eb2dcdbbca4d34140fb8b345c0`
and bundle contribution `005aae50cc2d3495c80cc4bb661114f059e66cec`.
Muse owns integration, final merge and deployment. No shared branch is changed.

## What is implemented

Module 154 is a pure recommendation/source-validation adapter, included before
144 in both generated bundles. Module 144's generic path and skill-gap plans use
it. A nine-line dispatch seam in 142 serves read-only resume/role, skill-gap,
location and current-opening requests after state ownership and pause gates.
Alert management and application/email actions retain their existing owners.

Only confirmed uniquely identified facts are cited. Legacy facts with absent
status and no confirmation flag remain accepted for compatibility with existing
curated profiles; `draft`, `rejected` and ambiguous IDs are excluded. A skill
list alone is self-report. Evidence requires confirmed work/project/credential
text or a resolvable supporting fact, never a dangling evidence string. Missing
evidence is not a finding that the person lacks the skill. Role suggestions are
hypotheses with inspectable work samples and tradeoffs; they establish neither
seniority, licensing, academic completion nor eligibility. Recipe tasks are
explicitly different from a specific employer's requirements.

The deterministic English recipe catalog covers operations, administration,
support, sales, communications, legal support, compliance, finance/accounting,
business operations, software, analytics and healthcare administration. It is
not a market dataset, an exhaustive occupation taxonomy, a career fit score or
an automatic eligibility screen. Interest, seniority, compensation and regulated
credentials need separate confirmation. No demand, salary, immigration, legal
qualification or city ranking is invented.

## Required inputs from the host

Use `CareerHost.createTurnCtx({ userId, threadId, now, snapshot, profile, postings })`.
The existing host supports these options, but `handler-career.ts` currently calls
it with the snapshot and clock only. The saved snapshot can restore a profile;
there is no fresh profile/posting/upload injection wired in that handler.

- `profile`: authenticated user's canonical master profile (122 shape), with
  stable `id` or `fact_id`, confirmation flags/status and original fact source.
  Do not treat a client-submitted profile as an already confirmed profile.
- `now`: finite epoch milliseconds from the host clock. The adapter performs
  no clock reads; a missing clock makes freshness unknown.
- `profile.preferences.locations`: normalized exact work locations, not inferred
  from residence. `constraints.remoteOnly` and `constraints.relocation` are
  explicit user constraints. Location matching is deliberately exact after
  case/whitespace normalization; normalize aliases upstream. Remote rows still
  need verified hiring geography. Residence is used as a scope only when the
  user has explicitly disallowed relocation and supplied no work preferences.
- `postings`: trusted, normalized observations from a host-owned public read
  adapter. Each row needs `id`, `title`, optional `company`, `location` or string
  `locations[]`, `mode`, and the provenance envelope below. Optional `paid:true`
  is required for a paid-only search. Free-text compensation is not parsed.

```js
{
  id: "employer-requisition-id",
  title: "Operations coordinator",
  company: "Employer",
  location: "Chicago, IL",
  mode: "onsite",              // remote only when employer explicitly says so
  paid: true,                 // only when verified; omission remains unknown
  status: "open",             // explicit observation, never inferred from a URL
  source_kind: "live_public",
  source_url: "https://employer.example/careers/requisition",
  observed_at: "2026-10-15T11:00:00Z",
  requirements: [
    { skill: "Excel", level: "required", text: "Exact employer wording" },
    { skill: "SQL", level: "preferred", text: "Exact employer wording" }
  ]
}
```

`freshness(row, now)` accepts flat envelope fields or nested
`source:{kind,url,observed_at}`. It requires HTTPS, explicit open state and an
observation no more than 24 hours old, with no future timestamps. Fixture flags,
fixture/snapshot source kinds/paths and example/test URLs always fail closed.
`openingRecommendations` supplies exclusion reasons, role fact IDs, requirement
comparisons, URL and observation time. A fresh observation establishes only
what the source showed at that time; eligibility remains unknown and openings
can close later. Structured requirements must preserve exact wording and
required/preferred/unknown level; the adapter does not infer these from token
presence in a description. Missing provenance or an empty pool returns
`no_verified_matching_openings`, explicitly spoken as unverified. There is no
filesystem job-corpus fallback in this recommendation path.

## Resume extraction and confirmation seam

`CareerRecommendations.ingestResume(ctx, input)` calls the existing plain-text
122 ingest on a clone, preserves extra profile fields, and returns draft facts,
confirmation requirements and draft-safe recommendations. It never confirms
facts or saves state. It returns typed ingest failures for PDF/DOCX/binary or
empty content, using 122's existing contract. A host extraction service may
supply extracted text with provenance; extraction does not make it confirmed.
The host must show the extracted facts for user confirmation, merge only the
confirmed facts with canonical correction precedence, and inject the resulting
profile on later turns. No handler/storage migration is included here.

## Ownership and remaining integration work

Crew A owns canonical profile/memory and atomic state/alert persistence. The
browser task owns execution. This branch changes none of career_host.js,
handler-career.ts, migrations, alerts state, browser execution or credentials.
Muse must connect authenticated profile lookup/confirmation and trusted public
posting observations to the host interface above before live recommendations
can be claimed. A request body containing jobs is not a trusted source adapter.

The local ESM-only staged HTTP test uses the real entry, handler, bundle and
host, with only serve and Supabase replaced by in-memory stand-ins. It proves
saved-profile restoration and empty-pool honesty, not a real database, upload
service, public-source fetch, Deno deployment or end-user live flow. Direct host
tests separately prove fresh observations and skill gaps. No paid model call,
Browserbase, employer application, email or production write was performed.
