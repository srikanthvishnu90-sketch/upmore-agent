# Flag-seam memo — where CAREER_AGENT_SUBMIT is actually read

**Date:** 2026-10-21 · **Source tree:** `wo/first-real-submission` @ `caabc96c`
(remote head at time of writing; the brief's head was `1683e73b` — the migration
evidence below is byte-identical at both heads, same line numbers).
**Question:** the 50fea733 agent-chat stage carried ZERO references to
`CAREER_AGENT_SUBMIT` / `career_apply_agent_submit_enabled`. Was something
missing from the bundle? **Answer: no. The flag is never read by any edge
function. It is read in exactly one place — inside Postgres — and the only
client that can reach that read is the Chrome extension.**

## The read chain (complete)

1. **The switch itself** is a row in `public.career_cloud_settings`
   (`key = 'CAREER_AGENT_SUBMIT'`, admitted by the check constraint in
   `supabase/migrations/20261024090000_career_apply_agent_submit.sql:14`).
   Anything but the value `'on'` — including no row — is off.
2. **The reader** is the SQL function `career_apply_agent_submit_enabled()`,
   same migration `:16` (body `:18`):
   `select coalesce((select value = 'on' from public.career_cloud_settings where key = 'CAREER_AGENT_SUBMIT'), false)`.
   It is revoked from `public, anon, authenticated` (`:20`) — no client can
   call it directly; it is reachable only from a definer-context function.
3. **Its sole caller** is `career_apply_extension_begin_agent_own(jsonb, text, text)`,
   same migration `:87`, SECURITY DEFINER. The check is at `:92`:
   `if not public.career_apply_agent_submit_enabled() then raise exception 'agent submit is off'; end if;`
   — before it verifies a live, unused, <24h per-batch approval for that
   posting and hash, then delegates to `career_apply_extension_begin_own`.
   Execute is granted to `authenticated` only (`:104`).
4. **The sole client caller of that RPC** in the whole tree is the extension
   service worker: `extension/background.js:851`
   `rpc("career_apply_extension_begin_agent_own", { p_payload, p_approval, p_batch_hash })`,
   inside the agent-consider flow, itself gated by the build-variant flag
   `agentSubmits` (`extension/background.js:648`:
   `if (!(await config()).agentSubmits || !card.batch) return;`).
   The approval side is extension-only too: `extension/background.js:1115`
   calls `career_apply_batch_approve_own` (the panel's one tap) and `:1155`
   calls `career_apply_batch_revoke_own` ("Stop applying").
5. **The client-side switch** is `extension/config.js:18` —
   `agentSubmits: false` in `TRAINEE_DEFAULTS` as committed. The agent flavor
   exists only as a packaging variant: `scripts/extension/package.sh` builds
   `--variant agent` with config rewritten in the package only
   (`agent:personSubmits=false agentSubmits=true`, package.sh `:80`; the
   committed `config.js` is never flipped), released via
   `.github/workflows/release-extension.yml` from a `v<version>-<variant>` tag.

**Negative evidence:** `git grep` over `supabase/functions/` at `caabc96c` for
`CAREER_AGENT_SUBMIT`, `agent_submit_enabled`, `begin_agent_own`,
`batch_approve_own` returns **zero hits** — agent-chat, extension-sync,
telegram-inbound, whatsapp-inbound and every other edge function are all
outside this seam. Outside migrations and tests, `career_cloud_settings` is
mentioned only in docs.

## What the merged deploy must therefore include beyond agent-chat

1. **agent-chat from the merged tree** — required, but for the chat surface
   (the goal-frame/privacy regressions the gate guards), not for the flag.
   Deploying it changes nothing about the submit gate, in either direction.
2. **Nothing database-side.** This migration was already applied to production
   by the 2026-10-21 closure run (file 21 of 21, applied last): the settings
   table, `career_apply_batch_approvals`, and all four functions are live,
   verified post-apply with `career_apply_agent_submit_enabled() = false`
   and the settings table empty.
3. **The extension agent-variant package**, built from the pinned merged
   commit (`scripts/extension/package.sh --variant agent`) and installed by
   the owner. This package is the only artifact in the system that can call
   the seam; without it, `'on'` in the database starts nothing.
4. **Two owner-only actions, which are not deploys:** setting the
   `CAREER_AGENT_SUBMIT` row to `'on'`, and the per-batch approval tap in the
   panel. Nothing in the tree — no build, script, or panel button — sets the
   row.

## Corollary for O5 (chat → approval card → cloud drive)

O5's chat-driven path has **no caller today**: no edge function invokes
`career_apply_extension_begin_agent_own`, and that RPC is extension-shaped
(it begins an application the extension then drives in the user's Chrome).
O5 must build its caller (chat/edge or worker-side) against the existing seam —
the settings row, `career_apply_agent_submit_enabled()`, and the hash-bound
approval record are reusable unchanged. The seam is not the gap; the caller is.
