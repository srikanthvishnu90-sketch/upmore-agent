# agent-chat v203: the live version, kept for rollback

This is the exact source the live project serves today: agent-chat version 204 is a platform version bump of v203,
ezbr_sha256 d4b6f0a95e9e0583b0c670162fe7b5fc0304167899a6a75996d249e1fa065623. It was read with the Supabase connector on
2026-10-11. It is not deployed from here and nothing imports it.

It reads only ANTHROPIC_API_KEY, ANTHROPIC_MODEL, SUPABASE_URL, SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY.
After the Option A migrations it keeps working: they replace only `agent_rl_bump_as` and `record_agent_lesson`, with
the same signatures and return types.

If the rebuilt handler misbehaves after the switch, roll back:
    mkdir -p /tmp/rb/supabase/functions && cp -r scripts/launch/rollback/agent-chat-v203 /tmp/rb/supabase/functions/agent-chat
    rm /tmp/rb/supabase/functions/agent-chat/README.md
    cd /tmp/rb && supabase functions deploy agent-chat --project-ref mrwngntwmnaqrqhupvlt
The migrations stay. They are additive, and v203 runs on top of them.
