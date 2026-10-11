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

Build the three rails as GENERAL platform layers — not one-off features.
Each rail serves every capability in its class, proven on one case first
but built to cover all. Work in this order: Rail 1, Rail 2, Rail 3, then the
gauntlet. Report per rail as a table: what it does, its tests, what you
broke on purpose to prove them.

### RAIL 1 — Recipient memory + resolution (ALL person-to-person money flows)

This is not a pay-a-person feature. It is the general layer every
capability that moves money to a person calls: pay, send, request, split
bills, rent, repay. Build once, use everywhere.

Table `saved_recipients`: `id uuid pk`, `user_id uuid not null`,
`handle text` (e.g. @marcus), `display_name text`, `channel text`
(imessage/sms/whatsapp/in-app), `source text` ('completed_send' or
'confirmed'), `created_at`, `last_used_at`. RLS: owner-only
(`user_id = auth.uid()`), service_role bypass for the bridge.

Rules (apply to every flow that names a person):
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

Deliver: migration file, RLS policy, `resolve()`/`save()` functions wired
into the money-flow path (not a standalone demo), tests proving at least two
different flows (e.g. pay AND split) resolve through the same layer. If you
lack Supabase access to apply the migration, hand back the SQL and say so.

### RAIL 2 — Alpaca LIVE adapter (ALL order types)

LIVE trading, real money — owner's explicit decision. This is the general
execution adapter behind every trading capability: market, limit, stop, and
trailing-stop orders, buys AND sells, fractional shares, modify/cancel.
Every capability in `docs/trading-capabilities.md` and
`docs/upmore-200-capabilities.md` that trades goes through this adapter.

Base `https://broker-api.alpaca.markets`, HTTP Basic auth with
base64(`API_KEY_ID`:`API_SECRET_KEY`), orders at
`POST /v1/trading/accounts/{account_id}/orders`, all numbers as strings,
every write async (accepted → filled/canceled — poll and reconcile, never
assume). Reference `~/workspace/skills/alpaca/SKILL.md` if present.

Keys from env (`ALPACA_BROKER_KEY_ID`, `ALPACA_BROKER_SECRET` — LIVE keys),
never hardcoded. Label LIVE everywhere a user can see it: the card, the
receipt, the portfolio answer, every log line.

Safety rules (non-negotiable — real dollars):
- Test trades capped at $5 per order until the owner raises the cap in
  writing. No exceptions during the build/test phase.
- Every order approval-gated: fresh yes, 10-min card expiry, single-use,
  context-bound per spec 16. Stale yes never fires.
- Idempotency key on every order; a thrown write is never retried blind —
  reconcile by client order id, report "unknown" until reconciled.

Requirements (apply to every order type, both sides):
- Real quote fetch with source and as-of time on every card.
- Stale quote (over 15 min) asks before pricing, never silently used.
- Buying power (or position size for sells) read before staging;
  insufficient funds/shares = no card, plain explanation.
- Order placed only after a fresh yes (10-min card expiry, single-use,
  context-bound per spec 16).
- Fill read back from the broker record; partial fills reported as partial
  with filled qty.
- Receipt carries: order id, side, fill price, shares, time, total.
- Market closed: order queued, and the receipt never says "filled" until the
  broker says filled.
- A thrown write is never retried blind: reconcile by client order id,
  report "unknown" until reconciled.
- Keep every existing approval-card and stop-on-change check in the path.

Tests: unit on the adapter, integration on a mock Alpaca server for
shape/safety logic, then the full order-type matrix (buy/sell ×
market/limit/stop) re-run against LIVE with the $5 test cap — not paper.
Never present a mock result as live.

### RAIL 3 — Merchant-terms reader (ANY merchant; Netflix proves it)

General interface, not a Netflix feature: `read_terms(merchant)` returns
`{text, hash, fetched_at}`; the card snapshots all three into the
confirmation record (so a later merchant change cannot silently change what
was approved); execution re-reads and a hash mismatch STOPS the flow with a
re-card. Unreadable page: say so plainly, link the merchant's own page,
never fabricate terms.

Merchant config is data, not code: name, terms URL, parse hints per
merchant. Netflix is the first proving ground, but tests must also cover a
second merchant with a different page structure (to prove the reader is
general) plus a planted terms-change between card and execution that
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

- Honest status only. LIVE is labeled live everywhere — no one mistakes a
  real-money result for a test.
- Never present a mock as live.
- Every money action keeps the approval card; stale yes never fires;
  stop-on-change on every rail.
- Do not commit the test JWT or any API key to the repo.
- If you lack Supabase access for applying migrations or setting secrets,
  hand back the SQL/files and say exactly what needs a human tap.
