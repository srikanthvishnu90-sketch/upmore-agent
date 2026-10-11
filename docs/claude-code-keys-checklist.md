# Keys Checklist for Claude Code — RING + UPMORE

Full keys list, both projects. Status verified 2026-10-11 unless noted.
RULE: real key VALUES never go in this doc or the repo — they go directly
into GitHub env `lane-b` (RING) or Supabase project secrets (UPMORE).
The only credential pasted below is the disposable test JWT.

## RING — GitHub environment `lane-b`

All names verified as real code requirements in the ring repo (grep counts).
Contents of the `lane-b` environment could not be verified from here (no
GitHub secrets API scope) — confirm each one is set there.

| Key | Status | Action |
|---|---|---|
| `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` + `LLM_PROVIDER` | Ring runs on the OpenAI key (sporve123@gmail.com account, ~$24.98 credit, installed in Vercel ringsss) | Confirm present in `lane-b`; set `LLM_PROVIDER` to match |
| `BROWSERBASE_API_KEY` + `BROWSERBASE_PROJECT_ID` | Installed 2026-09-28 | Confirm present in `lane-b` |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_PLACES_API_KEY` | Required by code | Confirm in `lane-b`. WARNING: Ring Google OAuth refresh credential leaked 2026-09-30 — rotation still open. Rotate before launch |
| `LINK_TOKEN_KEY` (Stripe Link) | Required by code | Confirm in `lane-b` |
| Ring Supabase URL + `SERVICE_KEY` | URL: `https://kjwvqwkuprfhftmfflnu.supabase.co` | Service key lives in the Supabase dashboard (project `ring`) — copy into `lane-b`, never into chat or repo |
| `RING_TOKEN_KEY`, `RING_VAULT_KEY` | Required by code; both values are in the local file `~/workspace/ring-vercel-env.txt` (600 perms, Oct 8) — copy from there, never from chat | Confirm in `lane-b` |
| `LANEB_USER_ID` | Not referenced in code — environment-level value | You provide; set in `lane-b` |

### RING test logins (you provide — cannot be generated)

- Uber account with a **$25 capped card**
- DoorDash account + Link with a **capped card**
- Netflix, cheapest plan
- Canvas, free course enrollment
- One Google test account (for OAuth / Gmail flows)

Claude Code needs these to run the live rails. Never paste cards or
passwords into chat — put them in the vault / `lane-b` directly.

## UPMORE — Supabase project secrets (project `upmore`, ref `mrwngntwmnaqrqhupvlt`)

| Key | Status | Action |
|---|---|---|
| `ANTHROPIC_API_KEY` | CONFIRMED SET (verified 2026-10-11 via secrets-list) | None |
| Test JWT | GENERATED 2026-10-11 (below) | Use as `Authorization: Bearer <jwt>` against agent-chat |
| `ALPACA_BROKER_KEY_ID` | MISSING | **You:** sign up at Alpaca, generate PAPER keys, add as Supabase secret |
| `ALPACA_BROKER_SECRET` | MISSING | **You:** same as above |
| Alpaca paper account ID | MISSING | **You:** from the Alpaca paper dashboard |
| `ALPACA_PAPER_USER_ID` | MISSING — optional for launch, paper only | You provide when ready |

### Not keys, not blockers for you

Per your note: the 2 rails migrations + agent-chat deploy are Claude
Code's own job — it writes them, applies them, and deploys itself. Already
done on the Supabase side: all existing migrations applied, agent-chat v203
ACTIVE (`verify_jwt=true`).

### Fresh test JWT (test user `gauntlet-test@upmore.test`)

Function URL: `https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/agent-chat`

```
eyJhbGciOiJFUzI1NiIsImtpZCI6ImZkNmFmYTIzLWNhMzMtNGQzMy1iYzEwLTU4NmFkYzEyM2NhMyIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJodHRwczovL21yd25nbnR3bW5hcXJxaHVwdmx0LnN1cGFiYXNlLmNvL2F1dGgvdjEiLCJzdWIiOiIyZThjYjMxZC01OWFiLTRiMmMtOTliYi1kNGM1ZGU4NjEzYTMiLCJhdWQiOiJhdXRoZW50aWNhdGVkIiwiZXhwIjoxNzkxNzM3NTcxLCJpYXQiOjE3OTE3MzM5NzEsImVtYWlsIjoiZ2F1bnRsZXQtdGVzdEB1cG1vcmUudGVzdCIsInBob25lIjoiIiwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiZW1haWwiLCJwcm92aWRlcnMiOlsiZW1haWwiXX0sInVzZXJfbWV0YWRhdGEiOnsiZW1haWxfdmVyaWZpZWQiOnRydWUsInB1cnBvc2UiOiJnYXVudGxldC1ydW5uZXIifSwicm9sZSI6ImF1dGhlbnRpY2F0ZWQiLCJhYWwiOiJhYWwxIiwiYW1yIjpbeyJtZXRob2QiOiJwYXNzd29yZCIsInRpbWVzdGFtcCI6MTc5MTczMzk3MX1dLCJzZXNzaW9uX2lkIjoiZGU3MDZiYzEtMWEyNC00Mjg1LThhMzMtZDI5YmFkZDQxNGUzIiwiaXNfYW5vbnltb3VzIjpmYWxzZX0.SJrYMvTgQPSDg3EQxDxVRDl0OuZOaJbkQVN_YvKopZ65-wzMTdRzAfLQg_AVSs__ywHkE-l1WoCKJIawpWTSlw
```

Verified working 2026-10-11. Test-only credential — safe to hand to Claude
Code, do not reuse for anything real.
