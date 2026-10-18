# Quota diagnosis source index — no capacity result

Pinned checkout4ba9351; runtime remains unchanged. Source values are configuration, not measured throughput or sustainable capacity. Reviewer operational user/window/request observations stay private.

| Path | Relevant source |
| --- | --- |
| supabase/functions/agent-chat/handler-career.ts:119 | RATE_LIMIT=60; RPC selection118; false→429/fixed Retry-After3600 at124–128 |
| supabase/functions/agent-chat/handler-career.ts:64 | JSON parsing precedes quota; message/turn validation132–144, owner-thread resolution148 and replay210 follow quota |
| supabase/functions/agent-chat/handler.ts:206 | Full handler's corresponding quota/429 path |
| supabase/migrations/20260923_000001_agent_rate_limits.sql | Original table/fixed-window limiter |
| supabase/migrations/20260923_000006_rate_limiter_hardening.sql:13 | auth.uid-bound agent_rl_bump; caller cannot burn another owner's quota |
| supabase/migrations/20261008_000002_agent_rl_bump_as.sql:13 | Service-only explicit-owner variant |
| supabase/migrations/20261010090000_chat_bridge_rate.sql:4 | Later bridge replacement, clamped counter and limit bound |
| tests/db/chat_bridge_rate.test.sql | Identity, grant, limit, denial and new-window guards |
| scripts/career/stage-career.cjs:18 | Career entry staged as index.ts; repository index.ts imports handler.ts. Verify deployed profile |

Handler-career blob:b9220a991a507c0a51d171536dbbd5fcdb540d2d. Reviewer reports pinned/current identity; deployed-source retrieval unavailable. Live v228 availability alone does not prove bytes. Vercel runtime logs denied403; no bypass.

Deferred after merge/ownership: authoritative remaining Retry-After; cheap validation before work allowance; protected free completed replay with separate abuse guard; fair work-class accounting; sanitized quota-source telemetry. Preserve owner/privacy/context protections and unknown/no-retry semantics. Do not remove all limits or change live config. Every fix needs a ledger entry and permanent fail-first test.

Measured capacity: **NOT_RUN**. No hosted load authorized in this source phase. Suggested later staging1→2→4 users/up to10 synthetic internal read-only turns per stage remains a proposal requiring budget/traffic/latency-stop authorization and cumulative-quota accounting. No employer activity or model spend is implied.
