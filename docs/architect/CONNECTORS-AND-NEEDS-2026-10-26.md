# Connectors and needs (2026-10-26)

What Trainee asks for, in what order, and how Gmail is connected from any chat (Telegram, web, SMS). Code:
`supabase/functions/_shared/career_needs.ts` (the order, pure), `_shared/career_connectors.ts` (the chat side),
`_shared/career_connect_flow.ts` + `supabase/functions/career-connect/` (the link and Google's callback), migration
`20261026160000_career_connect_needs.sql`, and the FEATURE NEEDS blocks in `agent-chat/handler-career.ts`.

## 1. The order of needs

Trainee needs one thing at a time, and only when a goal needs it. An apply reply that can't go on names exactly one
next need. Nothing the person already gave is asked again.

| # | Need | Asked when | Source checked first |
|---|------|------------|----------------------|
| 1 | Resume | Any apply ask with no confirmed resume. Nothing is queued and the posting isn't fetched (the apply gate). With the server prepare configured, the apply turn's own `no_resume` reply asks for it. | Confirmed resume entries in this thread, else the profile the server prepares from (`career_apply_profile_for`). |
| 1b | Resume confirmation | The resume was read but the person hasn't said it's theirs. | Same. |
| 2 | Name, email (every form); phone (only when the form asks it) | Only when none of these has it. | The profile's basics, then the person's own words in chat (`contact_draft.ts`), then the contact lines of the resume they confirmed (`resumeContact`). |
| 3 | Work authorization, sponsorship | Only when a form asks and the person hasn't said. | Their words (`eligibility_draft.ts`), the profile's constraints, the router's stated facts. |
| 4 | The form's other open questions | Open questions on file for that employer; the first one is named. | `career_apply_questions` (through the situation). |
| 5 | Gmail read, for an employer's emailed code | An application in flight is `needs_user` / `email_code`. Never a blocker: the person can type the code on the page. Offered once per person (`career_needs_asked`); after that, the reply says to type the code on the page. | The `google_career` grant's scopes. |
| 6 | Gmail read, for reply tracking (F8) | The person asks to check their email and no grant exists. | Same. |
| 7 | Gmail send, for outreach (F10) or an approved email | The person approves a send and no send scope exists. | Same. |

Gmail is never a step of applying. When F8 or an outreach or follow-up send finds no grant, its unsigned app link
(`/connect/gmail` on the finance app, which carried nobody) is replaced by a signed link for exactly that feature's
scope.

## 2. Connectors

### Gmail (the only connector today)

A grant is one `user_oauth_connections` row (provider `google_career`) and one Supabase Vault entry
(`oauth_google_career_<uid>`, the encrypted tokens). It is the same grant `gmail-oauth start_career` writes, so the
email-code reader (WO-096), mail tracking (F8) and sending (WO-032/033) all use it unchanged.

| Scope | Asked for | Why | What the person is told |
|-------|-----------|-----|-------------------------|
| `gmail.readonly` | "connect gmail"; the emailed-code offer; reply tracking | To read the code an application form emails (WO-096) and employers' replies (F8). | Google's permission is read access to your mail; Trainee only looks at mail from employers and application systems. |
| `gmail.send` | "connect gmail"; a send that needs it | To send a follow-up, outreach or application email the person approved word for word. | Only a message you approve word for word, from your own Gmail. |
| `openid`, `email` | Always | To say which address was connected ("Gmail connected: you@gmail.com"). | Your email address. |

Calendar is not requested. "connect gmail to read" asks for read only, and "connect gmail to send" asks for send only.

### The flow

1. "connect gmail" in any channel (or Trainee's offer) mints a link: `<SUPABASE_URL>/functions/v1/career-connect?t=<32
   chars>`. The link is bound to the person, the channel the turn came on (from the `channel_contacts` row for that
   thread; web for a signed-in session) and the thread. It is stored only as a SHA-256 hash, lasts 15 minutes and works
   once, and at most three are live per person.
2. A GET of the link only peeks, because Telegram, iMessage and WhatsApp fetch links for previews. The page names the
   account the Gmail will join (masked: `p•••@example.com`) and the exact permissions, and has one "Continue to Google"
   button (a form POST).
3. The POST uses the token once and redirects with 303 to Google's consent page with only the link's scopes
   (`access_type=offline`, `prompt=consent`, `include_granted_scopes=true`). The state is HMAC-signed for this link and
   expires after 15 minutes.
4. Google's callback: the state is verified and the link finished once. The code is exchanged at Google's token
   endpoint. Tokens go to the Vault, and the row stores the scopes Google says were granted. The person is told in the
   same channel: a `career_outbox` status row for Telegram, iMessage or WhatsApp (sent at once when the adapters are
   configured, and written into the thread on delivery), or an assistant message in the web thread. The text is built
   from the granted scopes: "Gmail connected: x. I can now ... You didn't allow sending, so I won't do that."
5. "disconnect gmail" revokes each Google grant at `oauth2.googleapis.com/revoke`, deletes the vault entries and rows,
   and burns live links. The reply says whether Google confirmed the revoke.
6. "what can you see?" answers from the records: the grant and its permissions, what is read with it, the resume
   status, applications on record, and what Trainee can't see.

Trainee never asks for a password or a code in chat. The page has no script, `no-store`, `X-Frame-Options: DENY`, and
a CSP that only allows the form to post to itself or Google.

## 3. Owner actions

### Google Cloud (the OAuth client gmail-oauth already uses: `GOOGLE_OAUTH_CLIENT_ID`)

1. **APIs & Services → Credentials → the OAuth 2.0 Client → Authorized redirect URIs**: add
   `https://<project-ref>.supabase.co/functions/v1/career-connect`. Keep the existing `/functions/v1/gmail-oauth`.
2. **OAuth consent screen → Data access (scopes)**: make sure `.../auth/gmail.readonly`, `.../auth/gmail.send`,
   `openid` and `.../auth/userinfo.email` are listed.
3. **Publishing status**: `gmail.readonly` is a *restricted* scope and `gmail.send` is *sensitive*. While the app is in
   **Testing**:
   - only the **test users** you add (at most 100) can connect;
   - Google shows an "unverified app" warning;
   - refresh tokens expire after **7 days**, so a tester has to reconnect weekly.

   Public use requires Google's verification. For restricted Gmail scopes that includes a security assessment (CASA) by
   an approved assessor, which costs money and takes weeks. Until then, Gmail connect is for the test users you add.
4. Add your own Google account as a test user before you test from Telegram.

### Supabase

1. Apply migration `20261026160000_career_connect_needs.sql`. It is listed in `scripts/launch/trainee-go-live.sh`
   (mark: `career_connect_link_finish` + `career_needs_asked`).
2. Deploy `career-connect` with `--no-verify-jwt`. It is public by necessity: the token and the signed state are the
   authentication. `supabase functions deploy career-connect --no-verify-jwt`. It is not in the go-live deploy list in
   this PR.
3. Redeploy `agent-chat` (the career entry) so the FEATURE NEEDS blocks are live.
4. Secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `OAUTH_STATE_SECRET` already exist for
   gmail-oauth and are reused. `CAREER_CONNECT_URL` is optional; the default is `<SUPABASE_URL>/functions/v1/career-connect`.
   For the instant Telegram confirmation, `TELEGRAM_BOT_TOKEN` must be set on `career-connect` too. Without it, the
   message waits for the scheduled delivery.

### The live check (after deploy, the owner on Telegram)

1. Text "connect gmail". Open the link, tap Continue, and allow. Telegram should say "Gmail connected: <your address>".
2. Query:
   ```sql
   -- the grant: one row, yours, with the scopes Google granted, tokens only in the vault
   select provider, email, scopes, connected_at, vault_name from public.user_oauth_connections where user_id = '<your uid>';
   select name, created_at from vault.secrets where name = 'oauth_google_career_<your uid>';
   -- the link: used once, finished connected, bound to your Telegram channel
   select channel, scopes, opened_at, finished_at, outcome from public.career_connect_links where user_id = '<your uid>' order by created_at desc limit 3;
   -- the confirmation in the same channel
   select channel, status, delivered_at, text from public.career_outbox where user_id = '<your uid>' and key like 'status:connect:%';
   ```
3. One real read: text "check my email now" with `CAREER_MAIL_TRACKING=on` on agent-chat, then:
   ```sql
   select count(*), max(updated_at) from public.career_mail_cursors where user_id = '<your uid>';  -- the cursor moved
   select kind, company, mail_at from public.career_mail_events where user_id = '<your uid>' order by mail_at desc limit 5;  -- only if employer mail arrived
   ```
   Or call `career-email-code` for an application that is waiting on a code (WO-096). Its response status `found`
   proves a read with your token.
4. Text "disconnect gmail". The two `user_oauth_connections` / `vault.secrets` queries should return no rows, and
   myaccount.google.com/permissions should no longer list the app.

## 4. Not done

- Prepare-ahead (`workers/career-browser/prepare-ahead.ts:181-188`) still asks name and email for the tailored resume
  when the profile has no evidenced basics, even when the confirmed resume shows them. The router's ingest doesn't show
  the contact header as an entry, so its confirmation doesn't evidence basics. The chat no longer asks, but "what do
  you need from me" can, after a prepare run. The fix belongs to the evidence step (`career_router_evidence.ts`): show
  the header as an entry.
- With no resume, an apply ask isn't remembered. The reply says to ask again after confirming.
- `career-connect` is not in the go-live deploy list.
- No connector other than Gmail. LinkedIn and Indeed are never automated (owner rule).
