# Keys Checklist for Claude Code — RING + UPMORE

Everything below verified 2026-10-11. One rule: raw key VALUES never go in
this doc (it's committed to the repo — a leaked `service_role` key bypasses
all database protections). Every row says exactly where to grab the value;
most are two clicks. The only credential pasted here is the disposable test
JWT at the bottom.

If the `lane-b` environment doesn't exist yet: GitHub repo
`srikanthvishnu90-sketch/ring` → Settings → Environments → New environment →
name it `lane-b` → add each secret below.

## RING — GitHub environment `lane-b`

| Key | Status 2026-10-11 | Fastest way to get the value |
|---|---|---|
| `OPENAI_API_KEY` (backup, + `LLM_PROVIDER=openai`) | PROVIDED by owner 2026-10-11, saved to lane-b (could not be validated from this VM — egress strips real keys; well-formed). `LLM_PROVIDER` picks the provider | Set `LLM_PROVIDER=openai` in lane-b to use it, or `anthropic` for the Anthropic key |
| `GOOGLE_CLIENT_ID`, `GOOGLE_PLACES_API_KEY` | INSTALLED to lane-b 2026-10-11 (client "sporv web" in GCP project "sporve agent"; Places key "Sporv Places API" from project "Sporv", restricted to Places API (New)). CAVEAT: the chosen OAuth client has NO ringsss.vercel.app redirect URIs — only supabase.co callbacks — so it may not serve Ring's web OAuth flow; CC should verify against the actual flow. Session was sporve123@gmail.com; all projects accessible | `GOOGLE_CLIENT_SECRET`: NOT retrievable (console never shows it; client already at max 2 secrets — nothing reset). Options: (a) create a second OAuth client in the project for eval with the right redirect URIs, or (b) coordinated reset + update Vercel. ALSO: Cloud free trial is over — upgrade by Oct 16, 2026 |
| `LINK_TOKEN_KEY` | INSTALLED 2026-10-11: fresh secret saved to GitHub `lane-b` AND Vercel ringsss (Production, Preview, Development). Note: Vercel had three stale per-env values — replaced with one unified value. No redeploy triggered: running production picks it up on the next deploy | None |
| Ring Supabase URL | `https://kjwvqwkuprfhftmfflnu.supabase.co` — verified live | Copy the URL as-is |
| Ring Supabase `SERVICE_KEY` | Fetched and verified working 2026-10-11 (authenticated OK). Value travels via dashboard only, never chat/repo | Supabase dashboard → project `ring` → Settings → API → copy the `service_role` key (not the anon key) |
| `RING_TOKEN_KEY`, `RING_VAULT_KEY` | Values on hand in `~/workspace/ring-vercel-env.txt` (same values as Vercel, all envs) | Copy from that file (600 perms) |
| `LANEB_USER_ID` | Not a secret — any stable user-id string for the eval lane. Not referenced in code (Claude Code's own name for it) | Suggest reusing `RING_OWNER_USER_ID` from `~/workspace/ring-vercel-env.txt` |

### RING test logins (you provide — these need your identity, phone, and cards; they cannot be generated)

- Uber account with a **$25 capped card**
- DoorDash account + Link with a **capped card**
- Netflix, cheapest plan
- Canvas, free course enrollment
- One Google test account (for OAuth / Gmail flows)

Put them in the vault / `lane-b` directly — never paste cards or passwords into chat.

## UPMORE — Supabase project secrets (project `upmore`, ref `mrwngntwmnaqrqhupvlt`)

| Key | Status 2026-10-11 | Action |
|---|---|---|
| `ANTHROPIC_API_KEY` | ROTATED 2026-10-11 (3rd key installed as Supabase secret). **Cannot be validated from this VM**: the network filter strips real-looking API keys from outbound headers (proven 2026-10-11 — dummy keys reach Anthropic and return "invalid key"; real keys arrive with the header stripped). The keys are well-formed and very likely fine | **Owner:** verify from your own Mac: `curl https://api.anthropic.com/v1/models -H "x-api-key: YOUR_KEY" -H "anthropic-version: 2023-06-01"` → HTTP 200 means good |
| Test JWT | GENERATED 2026-10-11 (below) | Use as `Authorization: Bearer <jwt>` against agent-chat |
| `ALPACA_OAUTH_CLIENT_ID` | MISSING — owner decision 2026-10-11: users connect their OWN brokerage via OAuth (no shared account). Implementation prompt: `docs/upmore-brokerage-connect-prompt.md` | **You:** app.alpaca.markets → Connect → register app (e-sign OAuth agreement, add redirect URIs, scopes `account:write trading`) → client ID as Supabase secret. Live trading needs Alpaca Compliance approval; paper works immediately |
| `ALPACA_OAUTH_CLIENT_SECRET` | MISSING | **You:** same as above → Supabase secret |
| `ALPACA_BROKER_KEY_ID` / `ALPACA_BROKER_SECRET` | Fallback path only (partner API for users without a linkable broker) | Only if you pursue the partner route; not needed for OAuth connect |
| Per-user account IDs + tokens | Not secrets — live in `brokerage_accounts` per user; tokens in vault via `vault_key_ref`, never raw in DB | Created at connect time when each user links their broker |

### Not keys, not blockers for you

Per your note: the 2 rails migrations + agent-chat deploy are Claude
Code's own job — it writes them, applies them, and deploys itself. Already
done on the Supabase side: all existing migrations applied, agent-chat v203
ACTIVE (`verify_jwt=true`).

### Fresh test JWT (test user `gauntlet-test@upmore.test`, minted 2026-10-11)

Function URL: `https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/agent-chat`

```
eyJhbGciOiJFUzI1NiIsImtpZCI6ImZkNmFmYTIzLWNhMzMtNGQzMy1iYzEwLTU4NmFkYzEyM2NhMyIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL21yd25nbnR3bW5hcXJxaHVwdmx0LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIyZThjYjMxZC01OWFiLTRiMmMtOTliYi1kNGM1ZGU4NjEzYTMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzkxNzM3NjA2LCJpYXQiOjE3OTE3MzQwMDYsImVtYWlsIjoiZ2F1bnRsZXQtdGVzdEB1cG1vcmUudGVzdCIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWUsInB1cnBvc2UiOiJnYXVudGxldC1ydW5uZXIifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJvdHAiLCJ0aW1lc3RhbXAiOjE3OTE3MzQwMDZ9XSwic2Vzc2lvbl9pZCI6ImZiNzVhNDA3LTUzM2QtNDVlYy1iZDc4LWM0OTA1ZDI4YmIzMyIsImlzX2Fub255bW91cyI6ZmFsc2V9.NmXNY5kqkGtBlArIMLtMJN_hCB_k3anszdjEL36ghvegv0gB3c172x6-AskYzbb1s6r3I72narY-h7gczZzr1Q
```

Verified working 2026-10-11. Test-only credential — safe to hand to Claude
Code, do not reuse for anything real.
