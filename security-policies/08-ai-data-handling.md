# AI Data Handling (agent-chat → Anthropic)

**Owner:** Vishnu Srikanth, Founder · **Review:** annually and on any model/provider change

## 1. The data flow `[IN PLACE]`

User message → `agent-chat` Edge Function (JWT-verified, Supabase project `mrwngntwmnaqrqhupvlt`) → Anthropic API (`claude-haiku-4-5-20251001`) → response stored in `agent_threads`/`agent_messages` (RLS user-scoped).

**What reaches the model per request:**
- The user's recent messages (history trimmed to the last **15** messages for context).
- Static route-card context (prompt-cached; no user data).
- Only the financial context needed to answer (e.g., a figure the user typed or a connected-account summary) — never bank credentials, never Vault secrets, never other users' data.

**What never reaches the model:** passwords, bank logins, API keys, Vault contents, service_role, any other user's rows (RLS enforced before context assembly).

## 2. Cost/latency guards that are also privacy guards

- Output capped at **400 tokens**; ~60% of messages served by deterministic paths with no model call at all. `[IN PLACE]`
- Hard quota: **900 model calls/user/month**, fail-closed with an upgrade message. `[IN PLACE]`
- Usage logged to `agent_usage` for quota enforcement (see retention in 01). `[IN PLACE]`

## 3. Training & retention

- Anthropic API inputs are processed to generate the response and are **not used for model training** under Anthropic's commercial API terms. **TO CONFIRM:** pin the current DPA/terms URL in this file at the annual review.
- Conversation threads persist in Postgres while the account is active and are deleted by the `delete-account` function on request (see 01). `[IN PLACE]`
- No conversation content is used for eval, fine-tuning, or any secondary purpose without explicit user opt-in. `[IN PLACE]` as policy.

## 4. Prompt-injection posture

- User messages are untrusted input: the agent has no tools that move money, send messages, or change external state without the user's explicit per-action approval. A prompt-injected instruction cannot escalate beyond what the Edge Function is coded to do. `[IN PLACE]` by architecture.
- Adversarial/refusal evals (50 refusal + 50 adversarial cases) pass; re-run on every prompt or model change per the standing eval standard. `[IN PLACE]`
