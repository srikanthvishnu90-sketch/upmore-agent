# Deploy checklist — career access layer (ACC slice, ACCS-001/002)

**Owner-run only.** Nothing in this file has been run against production by the build worker: the
gmail-oauth function is not deployed and no user grant exists yet. Statuses: code **built** (tests below),
live grant **blocked** on the owner running this checklist.

**Channel: iMessage FIRST** (owner ruling, 2026-10-12). The connected-accounts / re-auth surfaces in
`packages/domain/120-career-access.js` are consumed through the messaging chat first; all texts are short
plain text and channel-agnostic, so the app chat shows the same words. **Sending identity:** the user's own
Gmail via the career OAuth grant below is THE send rail — there is no other send path to configure.

## What ships

| Piece | State |
| --- | --- |
| `supabase/functions/gmail-oauth/index.ts` + `career.ts` (same folder) | extended: `start_career`, purpose-routed callback, per-source `status`, per-source `disconnect`; legacy `start`/`status`/`disconnect` shapes preserved |
| `packages/domain/120-career-access.js` | pure domain module (connected accounts, health planner, portal records, handoffs, audit, chat handlers) |
| DB migration | **none needed.** The career row uses provider `google_career`, so `vault_name = oauth_google_career_<uid>` satisfies the namespace guard in `20261012060000_oauth_vault_cascade.sql` and its delete trigger cleans the vault entry up by the same derivation |
| Secrets | **none new.** `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_STATE_SECRET` already exist in the project (names verified previously; values are never printed by any step below) |
| Google Cloud | **one owner check:** the existing OAuth client's consent screen / scope list must allow `gmail.send`, `calendar.freebusy`, `calendar.events` in addition to `gmail.readonly`. If the client is still in Google "testing" mode with a scope allowlist, add the three scopes and the test user there first, or the career consent fails with an unverified-scope error. Redirect URI is unchanged (`<SUPABASE_URL>/functions/v1/gmail-oauth`) |

## Pre-flight (safe, read-only)

```bash
cd ~/workspace/upmore-career   # or the merged checkout containing branch career/acc
node --test tests/career-access.test.cjs
~/.deno/bin/deno test -A --no-check tests/edge/gmail-oauth-career.test.ts
python3 ~/workspace/skills/supabase/bin/sb.py functions          # confirm gmail-oauth state before deploy
python3 ~/workspace/skills/supabase/bin/sb.py secrets-list         # names only: GOOGLE_OAUTH_CLIENT_ID,
                                                                 # GOOGLE_OAUTH_CLIENT_SECRET, OAUTH_STATE_SECRET present
```

## Deploy (owner)

`sb.py` is at `~/workspace/skills/supabase/bin/sb.py`; its default project ref is the Upmore project
(`mrwngntwmnaqrqhupvlt`). Set `SUPABASE_REF` explicitly if that ever changes — never deploy this to another
project by accident.

```bash
python3 ~/workspace/skills/supabase/bin/sb.py deploy gmail-oauth supabase/functions/gmail-oauth
python3 ~/workspace/skills/supabase/bin/sb.py functions   # verify gmail-oauth now listed / version bumped
```

Why this directory works with stock `sb.py`: it walks the given directory and uploads every file in it, so
`index.ts` + `career.ts` ship together, `career.ts` is imported as `./career.ts`, and the stock
`entrypoint_path: "index.ts"` is correct for this function.

> **sb.py deploy quirk (known, from TOOLS.md 2026-10-12):** stock `sb.py deploy` hardcodes
> `entrypoint_path: "index.ts"`, so it **cannot** deploy a function whose entrypoint is reached as
> `<slug>/index.ts` from the `supabase/functions` root — the bundler then fails on `../_shared/...` imports
> ("Module not found _shared/..."). Workaround used 2026-10-12 for that case: make a `/tmp` COPY of sb.py,
> change that one field to `<slug>/index.ts`, and deploy with the copy passing `supabase/functions` as the
> directory (the installed sb.py stays unmodified). You do **not** need the workaround for gmail-oauth as
> long as you deploy its own directory as above; you **would** need it if you ever fold gmail-oauth into a
> whole-functions-tree deploy.

Keep JWT verification ON (the default): every JSON action requires the user's JWT; the GET callback is
unauthenticated by design and trusts only the HMAC-signed, 10-minute state.

## T1 Auth fast-test — acceptance script (owner, after deploy)

Appendix B test T1: *connect Gmail+Calendar, send self-test email, create test event. Pass: both done
without any password in logs.* Run it with the owner's own account first. If a synthetic persona is wanted
instead, the test-persona fixture is being committed to `pivot/career` at
`packages/career-data/fixtures/test-persona.json` (cherry-pick it into the test setup; it was not yet on
`pivot/career` when this slice was built, so nothing here depends on it).

1. **Connect (career grant).** In the app (or iMessage chat once the router wiring lands): "connect my
   Google". Under the hood: `POST /functions/v1/gmail-oauth {action:"start_career"}` with the user's JWT →
   open the returned Google consent URL → approve all four scopes
   (Gmail read, Gmail send, Calendar free/busy, Calendar events) → landing is `…/#you?career=connected`.
2. **Verify the records (names/metadata only, no token values):**
   ```bash
   python3 ~/workspace/skills/supabase/bin/sb.py query "select provider, email, scopes, connected_at from public.user_oauth_connections order by provider"
   ```
   Expect a `google_career` row whose scopes list all four career scopes (a `gmail` row, if present, is the
   older read-only grant and stays untouched).
   `POST {action:"status"}` with the user's JWT should return `gmail.scope_set:"career"`,
   `gmail.can_send:true`, `calendar.connected:true`, `granted_scopes` with all four, `connected_email` set.
3. **Self-test send.** Using the career grant's access token server-side (the agent's normal Gmail path),
   send one email **to the connected address itself**, subject `Upmore T1 self-test`, body naming the time.
   Pass: it arrives in that same inbox; the send rail is the user's own Gmail (owner ruling).
4. **Test calendar event.** Create one event `Upmore T1 test event` ~30 minutes in the future on the
   primary calendar via the same grant, then read free/busy back over that window. Pass: the event exists
   and free/busy shows the window busy. Delete the test event after.
5. **No-password check.** Search the function logs for the test window: no password, no token value, no
   auth code may appear (the function logs only error messages; the edge test pins this for redirects/logs).
6. **Disconnect drill (per source).** `POST {action:"disconnect", source:"calendar"}` → expect
   `removed_providers:["google_career"]` plus the note that Gmail send went with the grant; the `gmail`
   read-only row (if any) remains. Then repeat step 1 to reconnect for real use.
   `source:"gmail"` removes only the legacy read-only grant; `source:"all"` removes both.

**T1 result recording:** paste the step 2 query output (metadata only), the self-test message id, and the
test event id into the evidence ledger per AGENTS.md. Until that exists, ACCS-001 stays **built**, not
proven live.

## What is NOT in this deploy

- Router/agent-chat wiring for the chat handlers (coordinator integrates later — see the ACC build report
  for the exact call contract).
- LinkedIn/Handshake cloud-browser sign-in (ACCS-004): plan + user text exist in the domain module; the
  live browser session rail is a separate, owner-gated step. No LinkedIn scraping, ever.
- Any migration push, secret change, or production data change.
