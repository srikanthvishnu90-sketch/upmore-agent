# Public read-only research route — source contribution

**Independent composition review:** `codex/research-conversation-review-20261016` composes this source with conversation fixes, reproduces six evidence/recovery/network gaps and hardens the research-only path. See [current independent report](../../testing/research-conversation-review-20261016.md). The verification below remains historical at its named source. The unchanged positive screenshot fixtures are rejected by the stricter validation; this composition is not an all-green or live-verified release.

Base: combined release `f67db048599db308f2691a7be7feada841143da5`.
Branch: `codex/public-research-browser-20261016`. Muse owns merge/deploy.
No production migration, public worker configuration or live task execution
was performed. Muse's approval payload-hash forwarding is preserved.

## Confirmed product gap

At the base, the actual career chat entry accepted prepare/status/approve/
reconcile only. Preparation required an existing posting/resume artifact, and
the worker admitted only registered loopback application portals. There was no
public research action through the chat → durable intent → owned worker path.
The independent evaluation at `0519b0ffd33a67c06e00fda047321231cdd8667c`
correctly treated that path as unsupported.

## Conversation and API

An existing authenticated user can send ordinary chat text:

```
Research https://www.janestreet.com/join-jane-street/interviewing/ — Read the official interview guidance.
```

The equivalent optional request is:

```json
{"career_task":{"action":"research","eventId":"research-1","url":"https://www.janestreet.com/join-jane-street/interviewing/","question":"Read the official interview guidance."}}
```

The entry returns a queued immutable intent reference. It starts no network or
browser operation. After the separate worker runs, send `Research status
<intent_id>` (or the returned task ID), or use the typed `research_status` action.
The dedicated `research_status` observation reads evidence without committing
another conversation/account turn, so polling cannot stale or revoke a queued
research intent. Existing application `status` semantics are unchanged.
The response includes saved source evidence, a short explicitly untrusted
excerpt, source URL/time, task/intent correlation and canonical artifact hash.
Keep `turn_key` stable for retries. Changed question/URL under that key conflicts;
an old event cannot be made fresh by changing the key.

No applicant profile, posting, resume or equipment resolver is needed for
research. Research never calls the applicant equipment resolver. The shared
host control-only gate still handles STOP/erase/pause, while research questions
never enter onboarding/profile intake or career-action dispatch. Account STOP,
privacy epoch, owner checks and version fences still apply. The worker requires
the existing trusted authority adapter and an explicit operator-owned
`researchOrigins` list. It is empty by default. No production origin was enabled.

## Bounded capability

The existing owned Chromium/helper/IPC is reused through module 150's
`createResearchBoard`. Its sole data command is `read_public_page`; it exposes
no arbitrary selector, script, click, fill, login, form, arm or submit tool.
One explicit URL is read per intent. Additional source links require another
explicit user request. Public reading cannot enter the application pipeline.

The URL must be canonical HTTPS on a public DNS name, standard port, without
credentials or fragment, sensitive action paths or unapproved query keys. The
worker separately requires an exact registered origin. Every admitted fetch
resolves all addresses, rejects private/special/mixed answers and pins a
validated address for its TLS connection. No identity, cookies, applicant data,
user JWT or upstream page headers are forwarded. TLS verification and Chromium
sandbox settings are unchanged. HTTP redirects are refused before following.

The fresh research context has page scripts disabled, downloads disabled and
service workers blocked. Only the explicit main-document GET is fulfilled;
subresources, frames, further navigations and non-GET operations are refused.
No gate is clicked. Password/CAPTCHA/consent/paywall indications stop at a typed
handoff; many dynamic pages will yield insufficient evidence. This deliberately
limited route does not promise full rendering or automatic research synthesis.

Page title, text, headings and same-origin links are source data marked
untrusted. They never choose tools, destinations, approvals or user facts.
The question is also data, never a page-evaluation script. Fixed DOM extraction
returns a bounded source capture, navigation log, timestamp, source byte hash,
screenshot bytes/hash and session/task/intent references. The worker checks
correlation and evidence hashes before saving. Hashes use sorted-key JSON for
the artifact, so PostgreSQL JSONB key ordering does not break readback checks.

`evidence_ready` means a source was captured. `objectiveStatus: requires_review`
means the research question has not been verified or marked answered. A browser
failure yields a blocker and no fabricated artifact. A screenshot or a successful
fixture is never an accepted research outcome. The manifest requires a separate
source-grounded answer and review for each of its 15 real objectives.

## Forward SQL proposal and integration blocker

`supabase/sql/proposals/career_public_research_v1.sql` extends the existing task
commit's immutable fields with `research` and admits only `read_public_page` for
that action. Other task kinds cannot use this new effect. Existing account row,
locks, grants, RLS, memory functions and control triggers are retained. Atomicity
and revocation are tested against real isolated PostgreSQL, not emulated SQL.

Supabase CLI 2.121.0 cannot scaffold here: it attempts `mkdir
/home/agent/.supabase` on the read-only filesystem. The pinned 2.81.0 fallback
fails in its package postinstall. No home directory, global configuration or
access restriction was changed. Muse must create the migration with a working
supported `supabase migration new career_public_research_v1`, copy this reviewed
SQL into it, and rerun the database contracts before applying it. The historical
migrations are untouched. This proposal was applied only to synthetic local
`career_test_*` databases, never production.

## Acceptance status

`acceptance-15.json` preserves the independent evaluation's B01–B15 public URLs
and concrete objectives: ten current role/program sources, three official
interview guides, GitLab's remote-work handbook and Python's CSV documentation.
It contains commands, typed inputs, source provenance, evidence requirements,
follow-up procedure and explicit acceptance criteria. All 15 remain **NOT_RUN**;
gates, redirects, incomplete listings and unsupported dynamic pages must retain
their real blocked/insufficient states. Fixtures are preflight only.

Normal Chromium remains unsupported in this executor: the SUID helper is owned
by `nobody` (mode 4755), matching the previously recorded sandbox failure. It was
not retried or bypassed. No Browserbase, browser download, proxy/TLS override,
security-setting change, paid call, application, email, account, purchase, merge
or deployment was performed. Native Deno is unavailable; staged tests execute
the real local ESM import graph with only remote service transport injected.

## Recorded verification

At source commit `d5374e68a1e28a090a07f9e05bd62a4954c8b739`, 228 scoped
tests pass: 18 staged/frozen/durability, 152 domain/worker/bundle, 30 real
PostgreSQL memory/alerts, 21 real PostgreSQL task authority and 7 real PostgreSQL
research-entry contracts. The frozen four-test source hash is unchanged.
The 58 SQL tests use real isolated PostgreSQL; browser/network fixtures remain
explicitly MOCK preflight. Bundle freshness, helper syntax and whitespace checks
pass. Exact commands, source/proposal/manifest digests, test names and log hashes
are in `docs/testing/runs/career-public-research-20261016/results.json`.
The isolated test container and wire listener were removed after verification.
