# Connectors and needs (2026-10-26)

What Trainee asks for, in what order, and how Gmail is connected from any chat (Telegram, web, SMS). Code:
- `supabase/functions/_shared/career_needs.ts`: the order of needs (pure).
- `_shared/career_connectors.ts`: the chat side.
- `_shared/connectors/`: the connector interface and its parts:
  - `types.ts`: the interface;
  - `google.ts`: **the one list of Google scopes**;
  - `grant_store.ts`: the only code in this flow that touches tokens;
  - `index.ts`: the registry.
- `_shared/career_connect_flow.ts` and `supabase/functions/career-connect/`: the link and the OAuth callback.
- Migration `20261026160000_career_connect_needs.sql`.
- The FEATURE NEEDS blocks in `agent-chat/handler-career.ts`.

## 1. The order of needs

Trainee needs one thing at a time, and only when a goal needs it. An apply reply that can't go on names exactly one
next need. Nothing the person already gave is asked again.

| # | Need | Asked when | Checked first |
|---|------|------------|---------------|
| 1 | Resume | Any apply ask with no confirmed resume. With `CAREER_NEEDS_RESUME_FIRST=on`, nothing is queued and the posting isn't read (the apply gate). With the flag off, FEATURE 1's design stands: the want is queued, and the reply's one need is the resume. With the server prepare configured, the apply turn's own `no_resume` reply asks for it and queues nothing. | Confirmed entries in this thread, else the profile the server prepares from (`career_apply_profile_for`). |
| 1b | Confirm the resume | The resume was read but the person hasn't said it's theirs. | Same. |
| 2 | Name, email (every form); phone (only when a form asks) | Only when none of the three sources has it. | The profile's basics, the person's own words in chat (`contact_draft.ts`), the contact lines of the resume they confirmed (`resumeContact`). |
| 3 | Work authorization, sponsorship | Only when a form asks and the person hasn't said. | Their words (`eligibility_draft.ts`), the profile's constraints, the router's stated facts. |
| 4 | The form's other open questions | Open questions on file for that employer; the first one is named. | `career_apply_questions`, through the situation. |
| 5 | Gmail read, after an employer emailed a code | An application is `needs_user` / `email_code`. Offered once per person (`career_needs_asked`), never a blocker. The reply says to type the code on the application page, and that connecting Gmail lets Trainee read such codes on the *next* applications. Connecting does not finish the stopped one. | The `google_career` grant's scopes. |
| 6 | Gmail read, for reply tracking (F8) | "check my email now" with no grant. | Same. |
| 7 | Gmail send, for an approved send (F8 follow-up, WO-032 email, F10 outreach) | The person approves a send and no send scope exists. | Same. |

Only the resume holds an apply ask. Every other need is said after the ask is queued. Gmail is never a step of
applying. When F8 or an outreach or follow-up send finds no grant, its unsigned app link (`/connect/gmail` on the
finance app, which carried no person) is replaced by a signed link for exactly that feature's scope and purpose.

## 2. Connectors

### The interface (Outlook later)

`connectors/types.ts` defines `Connector`. Each connector supplies:
- its scopes for the two capabilities (`read`, `send`) and its identity scopes;
- the plain words for each capability;
- its consent URL, code exchange and revoke;
- the provider and vault name its grant is stored under;
- the env names of its OAuth client.

The chat, the link (`career_connect_links.connector`) and the callback depend only on that interface. Microsoft
(Outlook, through Microsoft Graph) plugs in as one more entry in `connectors/index.ts`, plus `'microsoft'` in the
links table's connector check. It is not built.

### Gmail scopes (the audit list: `connectors/google.ts`, nowhere else)

| Scope | Google class | Asked for | Why |
|-------|--------------|-----------|-----|
| `https://www.googleapis.com/auth/gmail.readonly` | Restricted | "connect gmail"; the emailed-code offer; reply tracking | F8 reads From, Subject, Date and the snippet of new mail to classify employers' replies. During an application the person approved, the WO-096 code reader reads only mail from that application system and uses the code once, never stored. |
| `https://www.googleapis.com/auth/gmail.send` | Sensitive | "connect gmail"; a send that needs it | Only a message the person approved word for word. |
| `openid`, `email` | Non-sensitive | Always | To say which address was connected. |

Nothing else is requested: no Calendar, no Drive, no contacts. The database check on `career_connect_links.scopes`
mirrors this list, and `tests/architect/career-needs-unit.test.ts` fails if the two differ. "connect gmail to read"
asks for read only, and "connect gmail to send" asks for send only.

The older `gmail-oauth` function (the finance app's, `start_career`) also lists Calendar scopes. It is not part of this
flow and is not deployed by go-live.

### Credentials

- Tokens live only in the person's own Supabase Vault entry (`oauth_google_career_<uid>`), which is encrypted by the
  Vault. The connection row holds only the entry's name, the address and the granted scopes.
- In the connect flow, only `connectors/grant_store.ts` decrypts a token, and only to keep a refresh token or to
  revoke. No function in the flow returns a token, and nothing reaches a model or a reply.
- The existing readers of this grant are unchanged and not part of this PR: F8 mail tracking and WO-032/033 sending
  (`career_mail_gmail.ts careerTokenFor`), and the code reader (`career-email-code`).
- Emailed codes are used once and never stored (WO-096, unchanged).
- Disconnect revokes at Google, deletes the vault entry and the row, and burns live links.

### The flow (which function serves what, after go-live)

`career-connect` serves the link and **is the OAuth redirect URI**. It is public (`verify_jwt = false` in
`supabase/config.toml`, deployed by go-live with `--no-verify-jwt`).

1. "connect gmail", or Trainee's offer, mints a link: `<SUPABASE_URL>/functions/v1/career-connect?t=<32 chars>`.
   - The link is bound to the person, the channel (from the `channel_contacts` row for this thread; web for a
     signed-in session), the thread, the connector and the purpose.
   - It is stored only as a SHA-256 hash, lasts 15 minutes, works once, and at most three are live per person.
2. **Telegram.** Google refuses OAuth inside in-app browsers (`disallowed_useragent`), and Telegram opens links in
   its own browser.
   - The reply says: "Open it in your phone's browser (Safari or Chrome): Google doesn't allow signing in inside
     Telegram's own browser. If it opens inside Telegram, use that page's menu to open it in your browser."
   - The reply's `meta.link_button = { text: "Connect Gmail", url }` is for the Telegram adapter to render as an
     inline-keyboard **URL** button (`{ text, url }`, never `web_app`).
   - The adapter is the Telegram agent's. Until it renders the button, the link stands alone on the reply's last line.
3. A GET of the link only peeks, because previews fetch links. The page names the account the Gmail joins (masked)
   and the exact permissions, and has one "Continue to Google" button (a form POST).
4. The POST uses the token once and redirects with 303 to Google's consent page with only the link's scopes
   (`access_type=offline`, `prompt=consent`, `include_granted_scopes=true`). The state is HMAC-signed for this link
   and expires after 15 minutes.
5. Google's callback:
   - the state is verified and the link finished once;
   - the code is exchanged, and the grant stored with the scopes Google says were granted;
   - **the chat carries on in the same channel**: a `career_outbox` status row for Telegram, iMessage or WhatsApp
     (sent at once by `career-connect` when the channel adapters' secrets are set, otherwise by `trainee-deliver`'s
     schedule; written into the thread on delivery), or an assistant message in the web thread.

   The text is built from the granted scopes ("You didn't allow sending, so I won't do that") and the purpose, said
   only when what it needs was granted:

   | Purpose | Added line |
   |---------|-----------|
   | Reply tracking | Text "check my email now" and I'll look for employers' replies. |
   | Approved send | Go back to the message you were sending and approve it again. |
   | Outreach | Go back to the drafts you were sending and approve them again. |
   | Emailed code | On your next applications, I'll read the code an application system emails you. |

   A decline or a failed exchange is told in the same channel, and nothing changes.
6. "disconnect gmail": revoked at Google, the vault entry and row deleted, live links burned. The reply says
   whether Google confirmed the revoke. A failure partway says "it may still be connected".
7. "what can you see?" answers from the records only.

## 3. Owner actions

### Google Cloud (the OAuth client in `GOOGLE_OAUTH_CLIENT_ID`)
1. **Authorized redirect URIs**: add `https://<project-ref>.supabase.co/functions/v1/career-connect`.
2. **Data access (scopes)**: exactly the four in the table above. The verification request should list the same four
   (`connectors/google.ts`).
3. **While Testing**:
   - only the test users you add (at most 100) can connect;
   - they see an "unverified app" warning;
   - refresh tokens of an External app in Testing expire after 7 days, so testers reconnect weekly.

   Public use needs Google's verification. `gmail.readonly` is restricted, which adds the annual CASA security
   assessment.
4. Add your own Google account as a test user before testing from Telegram.

### Supabase
1. Run go-live (`scripts/launch/trainee-go-live.sh`). It now:
   - applies `20261026160000_career_connect_needs.sql`;
   - deploys `career-connect` (`--no-verify-jwt`);
   - deploys `career-email-code` (JWT on), without which no emailed code is ever read;
   - redeploys `agent-chat`.

   Done by hand instead: `supabase db` for the migration, then `supabase functions deploy career-connect
   --no-verify-jwt`, `supabase functions deploy career-email-code` and agent-chat.
2. Secrets: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` and `OAUTH_STATE_SECRET` (already used by
   gmail-oauth). `TELEGRAM_BOT_TOKEN` is already set for Telegram; Supabase secrets are project-wide, so
   `career-connect` can send the confirmation at once.
3. Optional: `CAREER_NEEDS_RESUME_FIRST=on` for "no queue row before the resume" when the server prepare is not
   configured.

### The live check (after deploy, the owner on Telegram)
1. Text "connect gmail". Open the link in the browser, tap Continue, and allow. Telegram should say "Gmail connected:
   <your address>. You allowed me to ...".
2. Query:
   ```sql
   select provider, email, scopes, connected_at, vault_name from public.user_oauth_connections where user_id = '<uid>';   -- one row, the four scopes
   select name, created_at from vault.secrets where name = 'oauth_google_career_<uid>';                                   -- the encrypted tokens
   select channel, connector, purpose, scopes, opened_at, finished_at, outcome from public.career_connect_links
     where user_id = '<uid>' order by created_at desc limit 3;                                                            -- telegram, used once, connected
   select channel, status, delivered_at, text from public.career_outbox where user_id = '<uid>' and key like 'status:connect:%';  -- the confirmation, delivered
   ```
3. One real read, with `CAREER_MAIL_TRACKING=on` on agent-chat: text "check my email now", then
   ```sql
   select read_through, updated_at from public.career_mail_cursors where user_id = '<uid>';   -- the cursor moved: Gmail was read with your token
   ```
4. Text "disconnect gmail". The first two queries should return no rows, and myaccount.google.com/permissions
   should no longer list the app.

## 4. Not done, and what overlaps
- Prepare-ahead (`workers/career-browser/prepare-ahead.ts:181-188`) can still ask name and email for the tailored
  resume after a prepare run. The router's ingest doesn't evidence the contact header as basics, so the evidence step
  (`career_router_evidence.ts`) owns the fix.
- With the gate on, an apply ask held for the resume isn't remembered. The reply says to ask again.
- The Telegram URL button is rendered by the Telegram agent's adapter from `meta.link_button`. Their branch also
  carries a resume rule (`20261026210016_career_resume_required.sql`), and whichever lands second should check the
  two against each other.
- Microsoft/Outlook: the interface only.
