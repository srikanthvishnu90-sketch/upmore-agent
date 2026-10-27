# Connectors and needs (2026-10-26)

What Trainee asks a person for, in what order, what it says it can do, how it treats a secret typed into the chat, and
how Gmail is connected from any chat (Telegram, web, SMS).

This branch is stacked on Google verification (#196, `feat/google-verification-20261026`). Its modules are the one
source for Google scopes (`_shared/google_scopes.ts`) and for "disconnect gmail" (`_shared/google_disconnect.ts`).

Code:
- `_shared/career_needs.ts`: the order of needs (pure).
- `_shared/career_connectors.ts`: the chat side.
- `_shared/connectors/`: the `Connector` interface (`types.ts`), Google (`google.ts`, built on #196's modules), the
  grant store (`grant_store.ts`) and the registry (`index.ts`).
- `_shared/career_connect_flow.ts` and `supabase/functions/career-connect/`: the link and the OAuth callback.
- `_shared/identity_redact.ts`: keys and tokens added to what the chat input removes.
- Migration `20261026160000_career_connect_needs.sql`.
- The FEATURE NEEDS blocks in `agent-chat/handler-career.ts`.

## 1. What a new person can ask, and what is true after each answer

| They say (any wording tested) | Trainee answers | The records after |
|---|---|---|
| "what can you do?", "how can you help" | Each capability and the one thing it needs from them now: find jobs, apply, tailor, mock interviews, offers, job alerts, track replies, send approved emails. Built from their records (`situation.capabilities`) and the deployment's switches; a switched-off feature is said to be off. The "never" rules (LinkedIn/Indeed automation, captchas, secrets in chat) close the list. | Unchanged. |
| "what do you need from me?", "what else do you need", "what should I send you" | The one thing applying needs (the resume, or confirming it), or that nothing is needed, plus anything already waiting on them. Gmail is mentioned only as optional, for replies. Never "nothing is waiting" while the resume is missing. | Unchanged. |
| A password, API key, token or code | The chat input removes it before anything stores it or a model sees it. The reply gives the safe path for what it was about: Google (connect on Google's page), LinkedIn/Indeed (never needed), an employer's site (sign in there), a code (type it on the page), any other key (revoke it). | `career_needs_asked` gets `secret_refused:<about>` once. No `agent_messages` row holds the value. |
| "apply me to <link>" with no resume | With `CAREER_NEEDS_RESUME_FIRST=on`: "I haven't put that posting on your apply list yet. Next I need one thing: your resume..." With it off (FEATURE 1's design): the want is queued, and the reply's one need is the resume. | Flag on: no `career_apply_wanted` row, and the posting is not read. Flag off: one row. |
| "connect gmail" | A one-time link with what is read, in Google verification's own words (`consentNotice`). On Telegram, the browser note and a URL button. | One `career_connect_links` row: hash only, this channel, this thread, `openid email gmail.readonly`. |
| "connect gmail to send" | Sending is deferred: "Sending from your Gmail isn't available in Trainee yet: Google hasn't approved it." No link is made. | No link. |
| "disconnect gmail", "stop reading my email" | #196's disconnect: revoke at Google, delete tokens, rows and mail rows, read back. The reply says only what the read-back shows. | No grant row, no vault entry, every live link burned (trigger). |
| "what can you see?" | The grant and what it reads, the resume status, the applications on record, what Trainee can't see. | Unchanged. |

## 2. The order of needs

Trainee needs one thing at a time, and only when a goal needs it. An apply reply that can't go on names exactly one
next need. Nothing the person already gave is asked again.

| # | Need | Asked when | Checked first |
|---|------|------------|---------------|
| 1 | Resume | Any apply ask with no confirmed resume. | Confirmed entries in this thread, else the profile the server prepares from (`career_apply_profile_for`). |
| 1b | Confirm the resume | The resume was read but the person hasn't said it's theirs. | Same. |
| 2 | Name, email (every form); phone (only when a form asks) | None of the three sources has it. | The profile's basics, the person's own words (`contact_draft.ts`), the contact lines of the resume they confirmed (`resumeContact`). |
| 3 | Work authorization, sponsorship | A form asks, and the person hasn't said. | Their words (`eligibility_draft.ts`), the profile's constraints, the router's stated facts. |
| 4 | The form's other open questions | Open questions on file for that employer; the first one is named. | `career_apply_questions`, through the situation. |
| 5 | Gmail read, after an employer emailed a code | An application is `needs_user` / `email_code`. Offered once per person (`career_needs_asked`, an atomic mark), never a blocker. The reply says to type the code on the page, and that Gmail lets Trainee read the *next* ones. | The `google_career` grant's scopes. |
| 6 | Gmail read, for reply tracking (F8) | "check my email now" with no grant. | Same. |
| 7 | Gmail send | Deferred: the feature replies (F8 follow-up send, WO-032 email card, F10 outreach) say it isn't available yet. They become the send-only link once the owner adds `gmail.send` to `GOOGLE_APPROVED_EXTRA_SCOPES`. | `google_scopes.ts requestableScopes`. |

Only the resume holds an apply ask. Every other need is said after the ask is queued. Gmail is never a step of
applying.

## 3. Connectors

### The interface (Outlook later)

A `Connector` supplies:
- its scopes and `requestable(asked, env)`, the scopes that may be asked now;
- the words the person reads (`notice`);
- the consent URL and the code exchange;
- `disconnect`, the provider's one implementation.

The chat, the link (`career_connect_links.connector`) and the callback depend only on that. Microsoft (Outlook, via
Graph) is one more entry in `connectors/index.ts` and in the links table's connector check. It is not built.

### Gmail scopes: Google verification's list (`google_scopes.ts`), nowhere else

| Scope | Asked | Why |
|-------|-------|-----|
| `openid`, `email` | Always | To name the connected address. |
| `https://www.googleapis.com/auth/gmail.readonly` (restricted) | "connect gmail"; the emailed-code offer; reply tracking | WO-096 code reader (a code used once, never stored); F8 status tracking (metadata and snippet). |
| `https://www.googleapis.com/auth/gmail.send` (sensitive) | **Deferred**: never, until the owner names it in `GOOGLE_APPROVED_EXTRA_SCOPES` | Sending a message the person approved word for word. |

The links table's check allows those four. `tests/architect/career-needs-unit.test.ts` keeps it equal to
`connectors/google.ts allScopes()`, and the flow test asserts that the consent URL's scope is exactly
`openid email https://www.googleapis.com/auth/gmail.readonly`.

### Credentials
- Tokens live only in the person's own Supabase Vault entry, which is encrypted by the Vault. The connection row
  holds the entry's name, the address and the granted scopes.
- In the connect flow, `connectors/grant_store.ts` is the only code that decrypts a token, and only to keep a refresh
  token Google didn't resend. Disconnect is #196's.
- No function in the flow returns a token, and nothing reaches a model or a reply.
- A password, key, token or labeled code typed into the chat is removed by `identity_redact.ts` before storage or any
  model (this PR adds keys and tokens).
- Emailed codes are used once and never stored (WO-096, unchanged).

### The flow (which function serves what, after go-live)

`career-connect` serves the link and **is the OAuth redirect URI**. It is public (`verify_jwt = false`, deployed by
go-live with `--no-verify-jwt`). `gmail-oauth` (the finance app's) is not part of this flow and is not deployed by
go-live.

1. A link is minted for the person, channel, thread, connector, purpose and approved scopes. It is stored as a SHA-256
   hash, lasts 15 minutes, works once, and at most three are live.
2. **Telegram**: Google refuses OAuth in in-app browsers.
   - The reply says to open the link in the phone's browser.
   - `meta.link_button = { text: "Connect Gmail", url }` is for the Telegram adapter's inline-keyboard URL button
     (never `web_app`). The adapter is the Telegram agent's; the link also stands alone on the last line.
3. A GET of the link only peeks, because previews fetch links. The page shows whose account it joins (masked) and
   `consentNotice`'s reads, never and undo lines.
4. The POST uses the token once and redirects with 303 to Google's consent page with `requestableScopes` of the link's
   scopes, re-checked at that moment. The state is HMAC-signed for this link and lasts 15 minutes.
5. The callback:
   - finishes the link once and exchanges the code;
   - stores the grant with the scopes Google granted;
   - tells the person in the same channel, through a `career_outbox` status row (Telegram, iMessage, WhatsApp) or the
     web thread.

   The text says what was allowed and, for the purpose it was asked for, how to carry on (e.g. 'Text "check my email
   now"'). A decline or a failed exchange is told too.

## 4. Owner actions (the launch is on hold: nothing here is done until the owner resumes it)
- **Google Cloud**: add the redirect URI `https://<project-ref>.supabase.co/functions/v1/career-connect`. Scopes and
  verification are #196's (`docs/launch/GOOGLE-VERIFICATION-2026-10-26.md`). While Testing:
  - at most 100 test users, who see an "unverified app" warning;
  - refresh tokens expire after 7 days.
- **Supabase**: go-live applies `20261026160000_career_connect_needs.sql` and deploys `career-connect`
  (`--no-verify-jwt`) and `career-email-code` (JWT on; without it no emailed code is read). Secrets are already set
  for gmail-oauth: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `OAUTH_STATE_SECRET`. Optional:
  `CAREER_NEEDS_RESUME_FIRST=on`.
- **Live check**, once launched: "connect gmail" on Telegram, then:
  ```sql
  select provider, email, scopes, vault_name from public.user_oauth_connections where user_id = '<uid>';   -- openid email gmail.readonly
  select name from vault.secrets where name = 'oauth_google_career_<uid>';
  select channel, purpose, scopes, opened_at, finished_at, outcome from public.career_connect_links where user_id = '<uid>' order by created_at desc limit 3;
  select channel, status, delivered_at, text from public.career_outbox where user_id = '<uid>' and key like 'status:connect:%';
  ```
  One real read: "check my email now" with `CAREER_MAIL_TRACKING=on`, then
  `select read_through, updated_at from public.career_mail_cursors where user_id = '<uid>';`. Then "disconnect gmail":
  the first two queries return nothing.

## 5. Not done
- Prepare-ahead (`workers/career-browser/prepare-ahead.ts:181-188`) can still ask name and email for the tailored resume
  after a prepare run, because the resume's contact header isn't evidenced as basics. The fix belongs to the evidence
  step (`career_router_evidence.ts`).
- With the gate on, an apply ask held for the resume isn't remembered. The reply says to ask again.
- F8 and WO-032 replies begin with "NOT_WIRED:". Their tests (`flow-f08-inbox-followups.test.ts:155,195`) pin that
  text, so it stays.
- The redaction note says "Upmore" (`identity_redact.ts redactionNote`); its tests pin that wording.
- The Telegram URL button is rendered by the Telegram adapter (another agent's).
- Microsoft/Outlook: the interface only.
