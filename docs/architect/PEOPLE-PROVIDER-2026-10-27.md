# People provider (D-MN-3), 2026-10-27

Finding people at scale through a paid people/email data provider, into the same `career_people` store as the person's
own sources (LinkedIn export, Gmail, pages they send: `career_people.ts`). Both adapters are built (owner, 2026-10-27
~20:40: "build adapters for BOTH Hunter and Apollo"); the owner picks one when buying a plan.

Code: `supabase/functions/_shared/career_people_provider.ts`. Schema: `supabase/migrations/20261027210000_career_people_provider.sql`.
Tests: `tests/architect/people-provider-unit.test.ts` (adapters, HTTP faked), `tests/architect/flow-people-provider.test.ts`
(real Postgres), `tests/db/career_people_provider_scale.py` (1M rows, 55,000 lookups, 20 concurrent workers; in `tests/db/run.sh`).

## Owner steps

1. **Choose the provider and plan.** Hunter (Domain Search finds the addresses a company's domain publishes; each comes
   with Hunter's own verification) or Apollo (People Search by title/seniority/location is free; enrichment by Apollo id
   costs credits and returns Apollo's `email_status`). Plans and credits: see `docs/career/contact-vendors.md` (prices there
   are ASSUMED until the invoice).
2. **Set two function secrets on the Supabase project** (Dashboard, Edge Functions, Secrets; never in chat, the repo or a test):
   - `CAREER_PEOPLE_PROVIDER` = `hunter` or `apollo`
   - `HUNTER_API_KEY` (Hunter) or `APOLLO_API_KEY` (Apollo). For Apollo the key needs access to
     `api/v1/mixed_people/api_search` and `api/v1/people/bulk_match` (or a master key).
   - Optional: `CAREER_PEOPLE_PROVIDER_CACHE_DAYS` (default 30): how long one company's lookup is reused for everyone.
3. **Apply the migration** with go-live (it is in `MIGRATIONS` with its `MIGRATION_MARK`).
4. **Watch spend**: `select * from public.career_provider_spend(now() - interval '30 days')` (service role): per provider
   and day, the lookups that called the provider, HTTP calls, results, the credits the provider reported (Apollo's
   `credits_consumed`; Hunter's responses report none: null, count Hunter's credits from `http_calls` and its dashboard),
   cache hits (free) and refusals.

Without step 2 nothing is called: the reply says plainly that finding new people through the service isn't connected
yet, answers from the person's own contacts, and never makes up a name or an address.

## Interfaces

```ts
// one adapter interface, two implementations
interface PeopleProvider { name: "hunter" | "apollo"; supportsSchool: false; findPeople(q: FindQuery): Promise<FindResult> }
interface FindQuery { company?: string | null; domain?: string | null; titles?: string[]; seniority?: string[]; location?: string | null; limit?: number | null }
type FindResult = { status: "ok"; people: ProviderPerson[]; company: string; http_calls: number; credits: number | null; note: string | null }
  | { status: "rate_limited"; retry_after_s: number; http_calls: number; detail: string }
  | { status: "out_of_credits"; http_calls: number; detail: string }
  | { status: "not_wired"; reason: string; http_calls: number }
  | { status: "error"; detail: string; http_calls: number };
interface ProviderPerson { provider; provider_id; name; email: string | null; email_status; email_confidence: number | null; sendable: boolean;
  company; company_key; position; location; source_ref; source_url: string | null; profile_text: string | null }

providerConfig(env): ProviderConfig               // CAREER_PEOPLE_PROVIDER + the key from its own secret name
makeProvider(config, fetch): PeopleProvider | null // null without a key: NOT_WIRED, no call
notWiredReply(config): string                     // the plain sentence
hunterProvider({ fetch, apiKey }), apolloProvider({ fetch, apiKey })

// for the chat lane (drafting comes later, from these candidates)
parseTargetAsk(message): TargetAsk | null
  // "people at every company I applied to", "engineering managers at every company I've applied to",
  // "engineering managers at Stripe", "recruiters or talent partners at Ramp", "alumni of DePaul at Stripe"
findTargets(userId, ask, { store, config, provider, now }): Promise<TargetsResult>
  // { status: ok | NOT_WIRED | waiting | refused | none | no_companies, reply, companies, waiting,
  //   candidates: { id, name, title, company, email, sendable, source, reason }[] }
  // reason, e.g. "Senior Engineering Manager at Stripe; matches "engineering manager"; found by Hunter on 2026-10-27,
  //   email not verified (accept_all): not used for sending."
runLookups({ store, provider, batch, leaseSeconds, userId? })  // a worker pass: claim, run concurrently, complete/fail
supabaseProviderStore(admin)                                  // the RPCs below
```

"People at every company I applied to" reads the firms on `career_apply_jobs` (not failed/not submitted) and the account's
tracker (`career_watch_kv` `career:account` → `memory.tracker.rows[].company`). Alumni: neither provider's people search
filters by school, so alumni come only from the schools on the person's own contacts; the reply says so.

## Rules the code enforces (each has a test that breaks it)

- **Sendable only when the provider verified it**: Hunter `valid` (Domain Search's `verification.status`, else the Email
  Verifier's `data.status`), Apollo `verified`. Everything else (Hunter `accept_all`, `unknown`, a 202 still checking;
  Apollo `unverified`, `likely_to_engage`, `unavailable`) is stored and shown, never sendable. A database check holds it too
  (`career_people_sendable_verified`). No address is ever built from a name and a pattern (Hunter's `data.pattern` is never read).
- **Dedupe** against everything the person has (`career_provider_deliver`): same address (any source) → already known;
  same name at the same firm with an address → already known; same name without an address and the provider found one
  → kept and linked (`same_as`), shown as one person; the same provider person again → refreshed in place.
- **Provider text is someone else's**: cleaned like a CSV cell; a formula or a field that reads as an instruction is
  dropped (a name that does drops the person); nothing here writes the person's profile or memory. A profile link
  (LinkedIn included) is kept in `profile_text` as text only, never a `source_url`, never fetched.
- **No volume limit of Trainee's own** (owner, 2026-10-27 19:55). The only brake is the provider refusing: Hunter 403 (rate
  limit) / 429 (monthly credits used up), Apollo 429 (per minute/hour/day window) / a credits error. The refusal blocks that
  provider for every instance (`career_provider_state.blocked_until`), the job waits in the queue without spending an
  attempt, and the reply says plainly what happened and when it resumes. Page sizes (Hunter 100, Apollo 100, Apollo
  enrichment 10) are the providers' own maximums per response, not limits.
- **Shared cache**: one lookup per (provider, normalized query) for everyone within the window; per-person visibility:
  the shared tables hold no user id and are service-role only; a person sees provider people only through their own
  `career_people` copies.
- **Erase**: "forget my contacts" includes provider rows (`career_people.ts` forget-all sources); "forget everything" (the
  account epoch) deletes them, the person's waits and their user id on the ledger (`career_provider_on_erase`);
  `career_provider_forget(user)` for the provider rows alone.

## Scale

Queue: `career_provider_jobs`, one active job per (provider, query) however many people wait (`career_provider_waiters`),
claimed with `FOR UPDATE SKIP LOCKED` leases (`career_provider_claim`), expired leases reclaimed (`career_provider_reclaim`),
completion only by the lease holder (exactly once). Fairness: each person's lookups get rising virtual ranks starting at
the queue's lowest, so a person with 5,000 queued doesn't starve one with 1. Every hot read is indexed and bounded
(candidates are read in keyset pages). Measured numbers: see the PR and `tests/db/career_people_provider_scale.py` output.

## Provider docs read (2026-10-27)

hunter.io and docs.apollo.io reference pages were not reachable from this session (egress allowlist), so the shapes
below are from Apollo's own docs pages that were reachable and from integration pages that quote Hunter's API reference.
Confirm against https://hunter.io/api-documentation/v2 and https://docs.apollo.io when the key is set.

| What | Source |
|---|---|
| Hunter Domain Search: `GET https://api.hunter.io/v2/domain-search`, `domain` or `company`, `limit` (≤100), `offset`, `type`, `seniority` (junior, senior, executive), `department`, `required_field`, `verification_status`, `job_titles`; `data.emails[]{value, type, confidence, sources[]{domain, uri, extracted_on, last_seen_on, still_on_page}, first_name, last_name, position, seniority, department, linkedin, twitter, phone_number, verification{date, status}}`, `meta{results, limit, offset, params}`; 15 req/s, 500/min | https://www.withone.ai/knowledge/hunter (Hunter domain search), https://learn.microsoft.com/en-us/connectors/hunterip/, https://deepline.com/docs/providers/hunter/hunter-domain-search.md |
| Hunter auth: `api_key` query parameter | https://docs.runalloy.com/connectors/Hunter.md; Hunter's own MCP client (https://glama.ai/mcp/servers/@hunter-io/hunter-mcp) |
| Hunter Email Verifier: `GET /v2/email-verifier?email=`, `data.{status, result, score, regexp, gibberish, disposable, webmail, mx_records, smtp_server, smtp_check, accept_all, block, sources}`; statuses valid, invalid, accept_all, disposable, unknown (webmail too); 202 while running; 10 req/s, 300/min; unknown costs no credit | https://learn.microsoft.com/en-us/connectors/hunterip/, https://help.hunter.io/en/articles/12639509-email-verifier-faqs |
| Hunter errors: 403 = per-second/per-minute rate limit; 429 = monthly usage (credits) used up | https://apis.io/rate-limits/hunter/hunter-rate-limits/ |
| Apollo People API Search: `POST https://api.apollo.io/api/v1/mixed_people/api_search`, header `x-api-key`; `person_titles[]`, `person_locations[]`, `organization_locations[]`, `per_page` 1–100, `page`; response `total_entries`, `people[]{id, first_name, last_name_obfuscated, title, has_email, has_direct_phone, organization}`; no emails; 0 credits; 50,000-record ceiling | https://docs.apollo.io/docs/find-people-using-filters, https://www.cleanlist.ai/blog/2026-10-15-apollo-api-guide |
| Apollo seniorities: owner, founder, c_suite, partner, vp, head, director, manager, senior, entry, intern; domain filter `q_organization_domains_list[]` | https://docs.getcargo.ai/integration/apolloio.md (labels); parameter names per Apollo's search reference (not directly reachable: confirm) |
| Apollo People Enrichment: `POST /api/v1/people/match` (`id`, names, `domain`, `reveal_personal_emails`); person `{id, name, title, email, email_status, linkedin_url, organization{name, primary_domain}, city, state, country, ...}`; 1 credit per email/demographic match; 429 with `error_details.context.window` | https://docs.apollo.io/reference/people-enrichment.md |
| Apollo Bulk People Enrichment: `POST /api/v1/people/bulk_match`, `details[]` up to 10; `matches[]` (null when unmatched), `credits_consumed`, `unique_enriched_records`, `missing_records` | https://docs.apollo.io/docs/bulk-people-enrichment |
| Apollo email statuses: Verified, Unverified, Update required, Unavailable, User managed, Catch-all (API: `verified`, `unverified`, `likely_to_engage`, `unavailable`) | https://knowledge.apollo.io/hc/en-us/articles/4423314404621, https://docs.getcargo.ai/integration/apolloio.md |

## Not done here (Requests)

- The chat lane calls `parseTargetAsk` / `findTargets` from the people turn (N1's `career_people.ts`), and a scheduled
  drain calls `runLookups` for other people's queued lookups (career-proactive). Neither is wired in this PR.
- `kindOf` in `career_people.ts` maps every non-Gmail, non-page row to `own_export`; a provider row should carry its own
  source kind (for the certifier's recipientSourced) when drafting starts from these candidates.
