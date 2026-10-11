# Claude Code Prompt: Spec-16 Gauntlet Build (3 Rails + Live Run)

## Already done — do not redo

- **Migrations:** all applied. `ipo_offerings` (3 rows), `copy_leaders` (7),
  `copy_follows`, `auto_invest_rules`, `trade_orders`, `portfolio_snapshots`,
  `ipo_requests` all live in the Upmore Supabase project. Nothing pending.
- **agent-chat:** deployed v203, ACTIVE, `verify_jwt=true`.
- **ANTHROPIC_API_KEY:** confirmed set in Supabase secrets.
- **Function URL:** `https://mrwngntwmnaqrqhupvlt.supabase.co/functions/v1/agent-chat`
- **Test user:** `gauntlet-test@upmore.test`
  (id `2e8cb31d-59ab-4b2c-99bb-d4c5de8613a3`). JWT verified working against
  the live function (auth passes; function responds).
- **Test JWT:** `<PASTE_TEST_JWT_HERE>` — sent with this prompt, used as
  `Authorization: Bearer <jwt>`. Do not commit it to the repo.

Repo: `srikanthvishnu90-sketch/upmore-agent` on GitHub (clone it if you do
not have it). Spec: `docs/instinct-spec-series/16-messaging-native.md`.
Trading capability dossier: `docs/trading-capabilities.md`.

## Your job

Build the three rails that make the gauntlet's card score real, then run the
gauntlet live against the function URL above. Work in this order: Rail 1,
Rail 2, Rail 3, then the gauntlet. Report per rail as a table: what it does,
its tests, what you broke on purpose to prove them.

### RAIL 1 — Saved-recipient table (pay-a-person)

Build the table, the save path, and the resolution layer.

Table `saved_recipients`: `id uuid pk`, `user_id uuid not null`,
`handle text` (e.g. @marcus), `display_name text`, `channel text`
(imessage/sms/whatsapp/in-app), `source text` ('completed_send' or
'confirmed'), `created_at`, `last_used_at`. RLS: owner-only
(`user_id = auth.uid()`), service_role bypass for the bridge.

Rules:
- A recipient saves ONLY after a completed send or an explicitly confirmed
  save. Never from a single mention in conversation.
- Resolution order: exact handle, then full name, then first name.
- Two or more matches: ask "Which Marcus: Marcus L or Marcus T?" and stage
  nothing until answered.
- A saved recipient gets the confirmation card directly. A stranger (no row)
  always goes through the full-confirmation path (identity + amount +
  read-back).
- Look-alikes (one edit away, e.g. @sarah_m vs @sarah-m): named as
  look-alikes in the prompt, never silently resolved.

Deliver: migration file, RLS policy, resolve/save functions, tests for save,
resolve, ambiguity, stranger, and look-alike paths. Apply the migration with
`sb.py` if you have Supabase access; otherwise hand back the SQL file and
say so.

### RAIL 2 — Alpaca paper adapter (buy)

Build the adapter against Alpaca's paper Broker API. Reference
`~/workspace/skills/alpaca/SKILL.md` if present; otherwise: base URL
`https://broker-api.sandbox.alpaca.markets`, HTTP Basic auth with
base64(`API_KEY_ID`:`API_SECRET_KEY`), orders at
`POST /v1/trading/accounts/{account_id}/orders`, all numbers as strings,
every write is async (accepted → filled/canceled — poll and reconcile).

Keys come from env (`ALPACA_BROKER_KEY_ID`, `ALPACA_BROKER_SECRET`), never
hardcoded. If the keys are not in env, build everything against a mock
Alpaca server and say plainly which tests ran on mock vs live paper.

Label PAPER everywhere a user can see it: the card, the receipt, the
portfolio answer, every log line.

Requirements:
- Real quote fetch with source and as-of time on every card.
- Stale quote (over 15 minutes old): ask before pricing, never silently use.
- Buying power read before staging; insufficient funds = no card, plain
  explanation.
- Order placed only after a fresh yes (10-minute card expiry, single-use,
  context-bound — see spec 16).
- Fill read back from the broker record; partial fills reported as partial
  with filled qty.
- Receipt carries: order id, fill price, shares, time, total.
- Market closed: order queued, and the receipt never says "filled" until the
  broker says filled.
- A thrown write is never retried blind: reconcile by client order id and
  report "unknown" until reconciled.
- Keep every existing approval-card and stop-on-change check in the path.

Tests: unit tests on the adapter, integration tests on a mock Alpaca
server, and the full 15-sub-capability buy packet re-run against the
adapter. Never present a mock result as a live result.

### RAIL 3 — Terms reader (one merchant: Netflix)

Build the reader that loads Netflix's current cancellation terms at card
time, snapshots them into the card (raw text + hash + timestamp, stored with
the confirmation record so a later merchant change cannot silently change
what the user approved), and re-reads them at execution for stop-on-change.

- If the terms hash differs between card and execution: STOP, do not
  execute, re-card with the new terms.
- If the page cannot be read: say so plainly and point to Netflix's own
  cancellation page. Never fake a read, never invent terms.
- Tests must include a planted terms-change between card and execution that
  provably stops the flow.

### THEN — the gauntlet

Run `evals/gauntlet/run-live.cjs` (build it if it does not exist) against
the live function URL with the test JWT. Use the 20-text gauntlet from spec
16 plus the L3 adversarial cases (interrupt mid-flow, "yes" 3 hours late,
double "yes", two requests in one text).

Publish both numbers — **understood** (routed correctly) and **carded**
(correct confirmation card) — in `BUILD-STATUS.md` with the raw log,
good or bad. For every text that failed, name the exact stage that failed:
extraction, routing, card, or rail — and fix it. Re-run until understood is
at spec 16's 95% bar.

## Rules for the whole build

- Honest status only. Paper is labeled paper everywhere.
- Never present a mock as live.
- Every money action keeps the approval card; stale yes never fires;
  stop-on-change on every rail.
- Do not commit the test JWT or any API key to the repo.
- If you lack Supabase access for applying migrations or setting secrets,
  hand back the SQL/files and say exactly what needs a human tap.
