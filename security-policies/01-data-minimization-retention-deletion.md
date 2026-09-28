# Data Minimization, Retention & Deletion

**Owner:** Vishnu Srikanth, Founder · **Review:** annually
**Design philosophy:** Upmore is architected to *never hold* people's sensitive information. Bank credentials are never seen or stored (OAuth-style flows only). Financial data is processed transiently. Secrets live only in the Vault. This document is the inventory that proves it.

## 1. Data inventory

| Data | Where it lives | Why | Retention | Deletion |
|---|---|---|---|---|
| Name, email, onboarding answers (`profiles`) | Supabase Postgres, RLS user-scoped | Account + personalization | While account active | `delete-account` Edge Function `[IN PLACE]` |
| Chat threads/messages (`agent_threads`, `agent_messages`) | Supabase Postgres, RLS user-scoped | Conversation continuity | While account active | `delete-account` `[IN PLACE]` |
| Playbook progress, reminders, saved items (`playbook_progress`, `reminders`, saved routes) | Supabase Postgres, RLS user-scoped | Product features | While account active | `delete-account` `[IN PLACE]` |
| AI usage counters (`agent_usage`) | Supabase Postgres | Quota enforcement (900 calls/mo hard cap) | While account active; raw rows aged out after 90 days | Manual purge `[PARTIAL]` — automated 90-day purge `[TO IMPLEMENT]` |
| SimpleFIN Access URL | Supabase Vault (service_role only) | Read-only bank connection | Until user disconnects | Deleted on disconnect `[IN PLACE]`; also removed by `delete-account` |
| Plaid access tokens (post-approval) | Supabase Vault (service_role only) | Read-only investments connection | Until user disconnects | Deleted on disconnect `[TO IMPLEMENT]` — Plaid not yet approved |
| Holdings / transactions from Plaid/SimpleFIN | **Not persisted** — processed transiently inside the Edge Function per request | Display only | Seconds (in-memory per request) | N/A by design `[IN PLACE]` for SimpleFIN; `[TO IMPLEMENT]` to verify for Plaid at integration |
| Bank usernames/passwords | **Never collected, never seen** | — | N/A | N/A `[IN PLACE]` |
| Card/payment details | **Not collected** (Stripe holds them when live; Upmore will store only customer/subscription IDs) | — | N/A | N/A `[IN PLACE]`; Stripe fields `[TO IMPLEMENT]` on go-live |
| API secrets (Anthropic, Plaid, Stripe, Supabase service_role) | Edge Function env / Supabase Vault | Backend operation | Until rotated | Rotation procedure in 07-secure-development.md `[IN PLACE]` |
| Support correspondence | Founder inbox | User requests | 1 year, then delete | Manual `[PARTIAL]` — calendar reminder `[TO IMPLEMENT]` |

## 2. Minimization rules (binding)

1. No new personal-data field ships without a written justification: what, why, where, retention. `[IN PLACE]` — enforced in self-review.
2. Financial data is never written to Postgres. Aggregations shown in-app are computed per request. `[IN PLACE]` (SimpleFIN path); `[TO IMPLEMENT]` verify for Plaid before launch.
3. Logs never contain PII, tokens, or secrets. `[IN PLACE]` — checked in code self-review.
4. Analytics: no third-party trackers, no ads, no advertising IDs. `[IN PLACE]`

## 3. Deletion procedure (user request)

1. User emails vishnusrikanth8@gmail.com (or uses in-app request) asking for export or deletion.
2. Founder verifies the requester owns the account (reply from the account email). `[IN PLACE]`
3. **Export:** run read-only queries scoped to `auth.uid()`, deliver as JSON within 30 days. `[PARTIAL]` — manual today; scripted export `[TO IMPLEMENT]`.
4. **Deletion:** invoke the `delete-account` Edge Function, then verify: profile row gone, threads/messages gone, Vault entries for that user gone, no orphaned rows in `agent_usage`. `[IN PLACE]`
5. Confirm completion to the user by email. Target: 30 days max, typically same week. `[IN PLACE]`
6. Third-party processors: Anthropic API inputs are transient per-request (see 08); SimpleFIN/Plaid connections are revoked at disconnect so nothing lingers provider-side. `[IN PLACE]` for SimpleFIN; `[TO IMPLEMENT]` verify Plaid token revocation at integration.

## 4. Retention enforcement

- Annual review: founder runs a query checking for data older than its retention window and purges it. `[TO IMPLEMENT]` — first review due 2027-09-27; calendar reminder to be set.
- The 90-day `agent_usage` purge and support-inbox purge are the two known gaps; both are on the `[TO IMPLEMENT]` checklist.
