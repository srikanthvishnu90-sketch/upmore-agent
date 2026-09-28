# Encryption Standard

**Owner:** Vishnu Srikanth, Founder · **Review:** annually

## 1. Data in transit — TLS 1.2 or better everywhere `[IN PLACE]`

- App ↔ Supabase (Postgres, Auth, Edge Functions, Vault): HTTPS/TLS via Supabase platform defaults.
- App hosting: Vercel, HTTPS only, HSTS enabled.
- Edge Functions → Anthropic / SimpleFIN / Plaid / Stripe APIs: HTTPS only; no plaintext fallbacks anywhere in code.
- Rule: any new integration must be HTTPS-only; HTTP URLs are rejected in code review. `[IN PLACE]`

## 2. Data at rest — AES-256 platform encryption `[IN PLACE]`

- Supabase Postgres: encrypted at rest by the platform (AES-256). Covers all user tables.
- Supabase Vault: secrets and connector tokens (SimpleFIN Access URL; Plaid access tokens post-approval) are encrypted at rest with dedicated key management, accessible only to service_role. `[IN PLACE]`
- No application-level encryption needed on top — we rely on platform primitives and never roll custom crypto. (Rule: never invent cryptographic schemes.)

## 3. Key/secret management

- Secrets live in exactly two places: Supabase Vault (connector tokens) and Edge Function environment secrets (API keys). Nowhere else — not the repo, not chat, not docs. `[IN PLACE]`
- Rotation: on any suspected exposure, rotate immediately per the incident procedure in 06-incident-response.md (this has happened before — see §4). Scheduled rotation for high-value keys every 12 months. `[PARTIAL]` — calendar reminder `[TO IMPLEMENT]`.

## 4. Known past exposures (addressed in procedure)

- An Anthropic API key and a Vercel token were each pasted in chat in the past. Both were treated as exposed: rotation required and assumed completed. The standing rule going forward: **any secret that appears outside Vault/env is burned on sight** — rotate first, investigate second. `[IN PLACE]` as procedure.
