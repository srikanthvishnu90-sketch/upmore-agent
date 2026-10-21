# WO-101: connect and disconnect Gmail from the chat, with a link bound to the person

Status: PR open · Depends on: — (WO-100 builds the read side in parallel) · Assignee: Claude · Size cap: about 500 product
lines plus tests; stop and report over 700

## Why
The owner: "it ... doesnt show connectors". The design audit (2026-10-20, sections 3 and 4, proposals B and C) found, and
this order re-verified in code on trunk cfad11e6:

- **No caller of `gmail-oauth` `start_career` exists on any branch.** The career grant (read + draft from the person's own
  Gmail) had a backend and no way in.
- **The only connect link carried nobody.** `_shared/agent/integrations.ts:9-10` built
  `https://upmore-…vercel.app/connect/gmail`, a page of the Upmore finance app. It asks the person to create a new
  email/password account, so a grant would land on whoever signed in there, or on no one: never on the texting account.
- **The router's seam was empty.** `120-career-access.js` reads `ctx.secureLinkFor(source)`; no host filled it, so "connect
  my google" replied with no link.
- **The connect reply claimed what Trainee does not do.** "read and send from your own Gmail and use your Calendar … I will
  run the self-test: one test email to your own inbox". Sending is disabled (SEND_DISABLED, drafts only) and Calendar is
  not a Trainee capability.
- **"disconnect gmail" promised a step nothing ran.** "the host confirms the deletion here once it has run": no host ran it.
- **"connect my linkedin" offered a reusable LinkedIn browser session** ("sign in once in the shown session and the agent
  reuses it"), against the rule that Trainee never automates LinkedIn or Indeed. It even carried the Gmail link when the
  seam was filled.

Root: no order owned "the same person on text and on a web page". The nonce pattern that solves it was scoped to Telegram.

## What changes
1. **A signed, single-use connect link.** Migration `20261023110000_connect_link_nonces.sql`:
   - `connect_link_nonces(nonce_hash, user_id, purpose, created_at, expires_at, used_at)`: the token is stored only as its
     SHA-256, lives 15 minutes, and at most three are live per person and purpose.
   - `connect_link_issue(p_user uuid, p_purpose text, p_now timestamptz) returns text` (the token).
   - `connect_link_consume(p_nonce text, p_purpose text, p_now timestamptz) returns jsonb`: `{user_id}` once, otherwise
     `{error: used|expired|invalid}`. Another purpose is `invalid` and does not burn the token.
   - Service role only; RLS on, nothing granted to anon or authenticated.
   - Why a table of its own and not a purpose column on `channel_link_nonces`: `channel_link_nonce_redeem` burns any row by
     hash, so a connect token would also redeem as a Telegram link, and the parity migration that defines it is replayed.
     The pattern is the same: hash only, short-lived, burned on first use, a cap on live tokens.
   - Purposes today: `connect_google_career`.
   - Added to `trainee-go-live.sh` (MIGRATIONS and MIGRATION_MARK `connect_link_consume`) and `tests/db/run.sh`.
2. **`gmail-oauth` GET `?t=<token>`** (`gmail-oauth/link.ts`, wired in `index.ts`):
   - Consumes the token once, then 302s to Google's career consent. The signed OAuth state names the user the token
     named; no query parameter can name a user. The consent URL is built by one function (`consentUrl`), which the POST
     `start`/`start_career` actions now use too: same parameters as before.
   - No PKCE: `gmail-oauth` is a confidential server-side client (code exchanged with the client secret), and nothing
     here changes that.
   - A bad, expired or used token ends on Trainee's own page and never reaches Google. A missing client ID or state
     secret ends on "not available yet" without burning the token.
   - The career callback ends on Trainee's page ("Gmail is connected to Trainee. You can close this tab and go back to the
     chat."), or on "declined" (Google's `error`, with a state that verifies as career) or "error". The legacy gmail grant
     still redirects to the app exactly as before.
   - Pages: a light grey card #F2F2F4, the wordmark "Trainee" in #9B7BB8, text in plum #4A2F5E, no script, no other
     product's name, `no-store`, `no-referrer`, `DENY` framing.
   - CORS and redirect allowlists: unchanged. The link is a top-level navigation (no CORS), and Google returns to the
     function itself.
3. **The chat mints it for the person of the turn.**
   - `integrations.ts`: `CONNECT_PURPOSE`, `connectLinkUrl(supabaseUrl, token)`, `mintConnectLink(admin, userId,
     supabaseUrl, now?)` (null when nothing could be minted), and `missingIntegration(kind, { link })` to carry a signed
     link in place of the unsigned one.
   - `handler-career.ts` fills `ctx.secureLinkFor`. It mints only when the router's own routing (probed over an empty
     context, `wantsConnectLink`) would give the Gmail connect reply.
4. **The connect reply claims only what is true today:** Trainee reads the job mail in the person's own Gmail and drafts
   replies for them to approve, and nothing goes out from their Gmail. It carries the link. No self-test is planned (the
   payload's `self_test` is gone). With no link it says so and shows none.
5. **Disconnect on a yes** (`_shared/career_connect.ts`, run in `handler-career.ts` before any brain, like the cloud
   opt-in):
   - "disconnect gmail" (also google, email) asks: "Disconnect Gmail? Trainee will stop reading your job mail and can't
     draft from it. Reply yes to disconnect." Nothing connected: it says so, and asks nothing.
   - Only an explicit "yes" on the next turn revokes, while the question is the thread's last word and at most 10 minutes
     old. "ok", "sure", a yes after another turn, or a late yes revoke nothing.
   - The revoke, for this user only (`disconnectPlan(userId, "google_career")`):
     - Google's revoke endpoint, with the refresh token from the person's vault entry;
     - `oauth_vault_delete` of that entry;
     - delete of that `user_oauth_connections` row by `user_id`.
   - The reply says what was removed, and says so when Google did not confirm the revoke
     (myaccount.google.com/permissions).
6. **LinkedIn, Indeed and Handshake.** "connect my linkedin" (also indeed, handshake, "sign in once … reuse that
   session") answers: Trainee never signs in to LinkedIn or Indeed for you and never automates either site, so there is
   nothing to connect. Importing a LinkedIn data export file isn't available yet: no channel hands the file to the
   router's `profile_export` (no host fills its fields), so the export path's own reply no longer offers an upload either.
   No link is asked for.
7. **The simulator runs the same:** `scripts/text.ts` (router brain) runs the disconnect turn first, gives the connect
   reply a simulated link, and adds `/connected gmail` to stand in for Google's page.

## Files
`supabase/migrations/20261023110000_connect_link_nonces.sql` (new) · `supabase/functions/gmail-oauth/link.ts` (new),
`index.ts` · `supabase/functions/_shared/career_connect.ts` (new) · `supabase/functions/_shared/agent/integrations.ts` ·
`supabase/functions/agent-chat/handler-career.ts` (the two connect lines after the cloud turn, one branch) ·
`packages/domain/120-career-access.js` + both bundles (`router_core.js`, `router_core.career.js`) · `scripts/text.ts` ·
`scripts/launch/trainee-go-live.sh` · `tests/db/run.sh`, `tests/db/connect_link_nonces.test.sql` (new) ·
`tests/architect/wo-101-connect.test.ts` (new) · `tests/career-captcha-seam.test.cjs` (its SC-286 pin asserted the
self-test plan rides the payload; it now asserts none does).

Not touched, WO-100's: `_shared/career_capabilities.ts`, `readConnections`, `ctx.statusRecords`, `readPipeline`.

## Tests (written first; trunk cfad11e6 then this branch)
- `tests/architect/wo-101-connect.test.ts`, 12 tests:
  - link: 1 user from the token, 2 refusals, 3 pages, 4 the function's routes;
  - mint: 5;
  - router: 6 the connect reply never says "send", "test email" or "Calendar", 7 no link, 8 LinkedIn/Indeed/Handshake;
  - disconnect: 9 no revoke without yes, 10 an unrelated turn or a late yes, 11 only this person's grant;
  - wiring: 12.
  - Trunk: 0 passed, 12 failed, each for its defect: the modules are missing; the trunk reply promises send, Calendar and
    a self-test; LinkedIn offers a session and even carries the Gmail link.
  - Branch: 12 passed.
- `tests/db/connect_link_nonces.test.sql`, 19 checks:
  - minted for A, consumed once and naming A; a second consume `used`; expired `expired`; another purpose `invalid`
    (not burned, not redeemable as a Telegram link);
  - three live at most; authenticated and anon can neither read, mint nor consume; an account's deletion leaves none.
  - Trunk: fails at its first statement (`connect_link_issue` does not exist).
  - Branch: 19 ok, and the suite ends with "db tests passed".

## Demo (the owner can run it)
`deno run -A scripts/text.ts --brain router --fresh`, then type: `connect my gmail`, `/connected gmail`,
`disconnect gmail`, `yes`, `connect my linkedin`. The link in the simulator is simulated (a made-up host and a token
nothing consumes).

## What the owner does (nothing here deploys)
- **Google Cloud, the OAuth client named by `GOOGLE_OAUTH_CLIENT_ID`:** the authorized redirect URI must be exactly
  `<SUPABASE_URL>/functions/v1/gmail-oauth`, where `<SUPABASE_URL>` is the project's `SUPABASE_URL`. That is the value
  `redirectUri()` sends, the same one the existing Gmail connect uses, so no new URI is needed if that one is registered.
- **The consent screen:** the four career scopes (`gmail.readonly`, `gmail.send`, `calendar.freebusy`,
  `calendar.events`) must be on it. Gmail scopes are restricted: until Google verifies the app, only listed test users can
  grant them. The consent screen shows that client's app name; today that is the existing client's name, not "Trainee".
  - Decision: rename it or create a Trainee client.
  - Decision: narrow the link's scopes to `gmail.readonly` while sending stays off. Today the consent screen asks for
    send and Calendar, which the reply no longer mentions.
- **Function secrets** (already used by `gmail-oauth`): `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`,
  `OAUTH_STATE_SECRET`.
- **Deploy:**
  - apply the migration (`trainee-go-live.sh` lists it);
  - deploy `agent-chat`;
  - deploy `gmail-oauth` with `--no-verify-jwt` (its GET routes carry no JWT; it is not in `trainee-go-live.sh`).

## Out of scope
- The read side ("what's connected", `statusRecords`, WO-100).
- A Trainee connections page (proposal D).
- A link for the agent brain path: `CAREER_BRAIN=agent` is off; the brain has no connect tool.
- Signed links in the outreach `connectAsk` and the agent tools' `missingIntegration("email")`: they keep the unsigned
  link until a caller passes `{ link }`.
- The router's LinkedIn/calendar/"everything" disconnect wording.
- Moving Telegram onto the new table.
