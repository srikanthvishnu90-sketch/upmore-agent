# Access Control

**Owner:** Vishnu Srikanth, Founder · **Review:** quarterly self-review (checklist below)

## 1. Current state

- **No employees, no contractors.** The Founder is the entire workforce. `[IN PLACE]`
- **Supabase roles:** `anon` / `authenticated` / `service_role`. All user tables (`profiles`, `agent_threads`, `agent_messages`, `playbook_progress`, `reminders`, `agent_usage`, referral/credit tables) enforce Row-Level Security scoped to `auth.uid()`. `[IN PLACE]`
- **Edge Functions** (`agent-chat`, `plaid`, `simplefin-proxy`, `stripe-*`, `delete-account`, `exec-*`) run with `verify_jwt=true` where user context is required; only server-side code ever holds `service_role`. `[IN PLACE]`
- **Secrets/tokens** (SimpleFIN Access URL, future Plaid access tokens) live in Supabase Vault, readable only by service_role Edge Functions — never by client code, never by RLS queries. `[IN PLACE]`
- **Non-human auth:** service-to-service calls use Supabase JWTs / Vault-referenced secrets / TLS — no shared passwords between systems. `[IN PLACE]`
- **Admin consoles** (Supabase dashboard, Vercel, GitHub, Google): owner-only accounts. MFA status → **TO CONFIRM** (see 04-authentication-standard.md); do not assume.

## 2. Least-privilege rules

1. Client app code never receives `service_role` or any Vault secret. `[IN PLACE]`
2. Each Edge Function gets only the secrets it needs (e.g., `plaid` gets Plaid keys, not Stripe keys). `[PARTIAL]` — audit secret scoping per function `[TO IMPLEMENT]`.
3. Founder uses the least-privileged credential that works (dashboard read-only where available; no standing root/API tokens in shell history or notes). `[PARTIAL]` — move any long-lived tokens into a password manager `[TO IMPLEMENT]`.

## 3. Quarterly access self-review (15 minutes)

- [ ] List every admin account with access to Supabase / Vercel / GitHub / Google / Stripe / Plaid / Anthropic — confirm each is still needed and still his.
- [ ] Confirm no `service_role` or secret values exist in the repo, shell history, notes, or chat logs (grep check).
- [ ] Confirm RLS is enabled on every user-data table (including any added since last review).
- [ ] Confirm Vault entries match currently-connected integrations (no orphaned tokens).
- [ ] Rotate any credential older than 12 months or with any exposure suspicion.

Status: checklist defined `[IN PLACE]`; first quarterly review due 2026-12-27 `[TO IMPLEMENT]` — set calendar reminder.

## 4. If someone joins (contractor/employee) — procedure ready, not yet needed

1. Written scope: systems needed, nothing more. Time-boxed access with an end date.
2. No `service_role`, no Vault admin, no secret values — task-scoped access only.
3. End date hits → revoke everything same day, rotate any shared-adjacent credential, verify in the quarterly review.
4. Status: `[TO IMPLEMENT]` — only if/when hiring happens.
