# Guided manual connect: the read-only lane for platforms with no API

Status: **BUILT (policy, playbooks, live window, session store, health job, app UI, tests); NOT VERIFIED.** Everything
below runs against a MOCK browser and a MOCK database in tests; nothing is deployed, the migration is not applied live,
no Browserbase keys are set (so every window step answers 503 NOT_WIRED), and no platform has been connected with a real
account. Owner addendum, 2026-10-11.

## Where it lives

| Piece | File | Check |
| --- | --- | --- |
| Policy (consent, read-only, health, status line, scrubber) | `packages/domain/78-manual-connect.js` | `node --test tests/manual-connect.test.cjs` |
| Table, RLS, Vault functions (service_role only), Vault cleanup on delete | `supabase/migrations/20261012010000_manual_connections.sql` | `bash tests/db/run.sh` (`tests/db/manual_connections.test.sql`) |
| HTTP: `status`, `consent`, `start`, `check`, `read`, `disconnect` (JWT on) | `supabase/functions/manual-connect/index.ts`, `supabase/functions/_shared/manual_connect.ts` | `deno test -A tests/edge/manual-connect.test.ts` |
| The live window (Browserbase keepAlive session, live view, CDP for page text and the session) | `supabase/functions/_shared/manual_browser.ts` | same (STUBBED fetch for the API calls) |
| Health job (hourly, each session every 6 hours; signed out or broken said once) | `runManualHealth`, run by `supabase/functions/agent-proactive` | same |
| App (Investments: consent, "Open the sign-in window", "I'm signed in", status line) | `src/upmore-app-template.html` (`refreshManualConnect`) | `node --test tests/manual-connect-ui.test.cjs` |

The session is the browser's cookies for the platform's own domain plus that origin's local storage, saved as one Vault
secret named `manual_<user id>_<platform id>`; the table holds only that name. A request that carries a password, a code
or a login field is refused before anything else (`no_passwords`). Every answer for a platform says
"unverified playbook" until a live run verifies it.

## The decision this rests on

Decision 1, settled by the owner: **no password storage, session-only.** "Passwords never sit in chat or in a
database; the person logs in themselves through a live browser window, completes their own 2FA, and only the encrypted
session persists." Upmore never asks for, sees, types or keeps a password or a one-time code on this lane, or any other
(see `tests/no-password-storage.test.cjs`).

## Where it applies

Only the rows in `packages/connectors/platforms.json` whose route is `browser_assisted`: no third-party API, no
SnapTrade, no Plaid coverage (20 of 101 today, `docs/connector-matrix/README.md`). It is the last resort in the owner's
order (native API, then SnapTrade, then Plaid, then this), and it is **read-only**: balances, holdings and their as-of
date. It never places an order, moves money or changes a setting, so a platform reached this way is always "track
only", and auto-invest never runs through it.

## The flow

1. **Consent.** Before anything opens, the person reads exactly what happens (`ManualConnect.consentText`): they log
   in themselves on the platform's own page and do their own two-step check; Upmore keeps only the encrypted session and
   reads balances and holdings; read-only; the platform's terms may not allow automated access, and if it asks Upmore to
   stop, it stops; one message turns it off. The exact words and their version are stored with the yes
   (`consentRecord`); no yes, nothing opens.
2. **The live window.** Upmore opens the platform's own sign-in page in a remote browser and hands the window to the
   person (Browserbase live view; the cancel agent already runs Browserbase sessions with keepAlive). The person types
   their own login, and any code, CAPTCHA or device check is theirs to complete in that window. Upmore types nothing.
3. **Signed in.** The playbook's `signed_in_when` texts tell Upmore the person is in. The window closes; the session
   (cookies and storage) is encrypted into Vault under the person's id and the platform, never into a table, a log or a
   message.
4. **Reading.** On each read, Upmore restores the session in a fresh browser, opens the playbook's reading pages, and
   reads the numbers next to the playbook's labels. Every number is shown with its source ("Fundrise, manual session")
   and its as-of time, as every money statement is.
5. **Health.** The session is checked every 6 hours (`HEALTH_EVERY_MS`). Signed in: last checked moves. Signed out:
   the person hears it once, with the link to log in again. A page that did not load once is a blip; twice is "the page
   changed", said once (`onCheck`).
6. **Status.** Everywhere the connection appears, one honest line (`statusLine`):
   "Fundrise: connected (manual session), last checked 3:05 PM", "signed out - log in again", "can't be read right now
   (the page changed)", or "not connected". Older than a day says the numbers may be out of date.
7. **Off.** "disconnect Fundrise" deletes the Vault session at once and the status reads "disconnected".

## What never happens

- No password, code, cookie, token or session in any log or message: every log entry on this lane goes through
  `ManualConnect.scrub`, which drops keys that name a secret and masks values that look like one (JWTs, bearer headers,
  cookie strings, long hex or base64), however deeply nested; `leaks()` is the check.
- No writes: `allow()` passes only `health`, `read_balances` and `read_positions`; a playbook step whose words could
  change something (buy, sell, invest, transfer, submit, save...) fails validation.
- No guessing: a playbook is `verified: false` until a live run with a real account confirms its pages and labels and
  records `verified_on`; until then the platform is offered as a try, never a promise.

## Playbooks

`packages/connectors/manual-playbooks.json` holds the template and the first three, each validated by
`ManualConnect.validatePlaybook` in `tests/manual-connect.test.cjs`:

| Platform | Why this lane | What its first live run must confirm |
| --- | --- | --- |
| Cash App Investing | No investing API (Cash App's developer API is open banking for regulated firms); no aggregator found for its brokerage holdings | sign-in page, signed-in texts, where the portfolio value and stock positions sit |
| Fundrise | Fundrise Connect originates new investments for partners; it does not read an existing account | sign-in, account value and fund list, and the as-of date of each NAV |
| Yieldstreet (Willow Wealth) | No API or aggregator found; renamed Willow Wealth in late 2025 | whether sign-in moved to a new domain, the portfolio and investment list |

Template fields: `platform_id` (a row in the matrix), `display_name`, `login_url` (the platform's own https page),
`steps` (clicks to reach sign-in; never anything that changes something), `signed_in_when`, `signed_out_when`, `reads`
(`balance`, `position`, `as_of`, each with its page and the labels it reads next to), `two_step` (what the person will
see), `verified`, `verified_on`, `unverified_fields`, `notes`, `sources`.

## Acceptance still owed (owner-gated)

The addendum's acceptance is one platform end to end with no credentials anywhere in logs. The code for it is built
(above); what this container cannot provide is owner-gated: the migration pushed live, `manual-connect` and
`agent-proactive` deployed (`scripts/launch/go-live.sh` deploys both), `BROWSERBASE_API_KEY` and
`BROWSERBASE_PROJECT_ID` set as function secrets, and a real account on one of the three platforms. Two things only a
live run can confirm: that Browserbase's live view lets the person type into the window (it is interactive by default),
and that restoring the saved cookies keeps the platform signed in. When they exist, the run is: consent, live login by the
owner, one read with its as-of time, a health check, a forced sign-out showing the signed-out line once, "disconnect",
and a scan of that run's logs with `ManualConnect.leaks()` returning false for every entry. The playbook then gets
`verified: true` and `verified_on`.
