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
| `OPENAI_API_KEY` (+ `LLM_PROVIDER=openai`) | Ring runs on the OpenAI key (sporve123@gmail.com account, ~$24.98 credit, in Vercel). Value not retrievable by me | platform.openai.com → API keys (account sporve123@gmail.com) → copy existing or create new. `LLM_PROVIDER` is not a secret — just set it to `openai` |
| `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` | Same Browserbase account whose keys are already in Upmore's Supabase secrets (installed 2026-09-28). Values not retrievable from Supabase | Browserbase dashboard → API keys → copy both |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_API_KEY` | Required by code. The Cloud project lives under **srikanthvishnu90@gmail.com** (vishnusrikanth8@gmail.com has zero Cloud projects — don't create new ones there) | Google Cloud Console (srikanthvishnu90@gmail.com) → APIs & Services → Credentials → copy. WARNING: Ring Google OAuth refresh credential leaked 2026-09-30 — rotation still open, rotate before launch |
| `LINK_TOKEN_KEY` | Set NOWHERE (not in Vercel, not in env file, code throws without it). Safe to generate fresh — nothing depends on a previous value | Run `openssl rand -hex 32`, paste the output |
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
| `ANTHROPIC_API_KEY` | CONFIRMED SET (via secrets-list; values aren't retrievable via API) | None — already there |
| Test JWT | GENERATED 2026-10-11 (below) | Use as `Authorization: Bearer <jwt>` against agent-chat |
| `ALPACA_BROKER_KEY_ID` | MISSING | **You:** alpaca.markets → paper account → generate PAPER keys → add as Supabase secret |
| `ALPACA_BROKER_SECRET` | MISSING | **You:** same as above |
| Alpaca paper account ID | MISSING | **You:** from the Alpaca paper dashboard |
| `ALPACA_PAPER_USER_ID` | MISSING — optional for launch, paper only | You provide when ready |

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
