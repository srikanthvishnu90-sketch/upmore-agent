# Upmore Trading Capabilities — Deep-Dive Dossier

Purpose: every trading capability dug deep — connectors, data, database,
execution, approvals, test plan — so that build → test → complete is
mechanical for each one. A capability is only "complete" when a real
end-to-end run works: connector live, data flowing, job done, receipt kept.

Status legend: SHIPPED (live in prod) · DB-READY (tables live, logic pending)
· SPECCED (design done) · MISSING (not started)

## Capability index

| # | Capability | Status | Blocker |
|---|-----------|--------|---------|
| 1 | Pre-IPO / IPO access | SHIPPED | Fresh IPO calendar feed (manual seeding now) |
| 2 | Copy trading | DB-READY | Leader universe + signal ingestion + execution |
| 3 | Trade via app (user-directed) | SPECCED | Alpaca keys + account + order execution path |
| 4 | Auto-invest | DB-READY | Rules engine + scheduler + Alpaca execution |
| 5 | Portfolio tracking & drift alerts | DB-READY | Broker holdings sync (Alpaca or Plaid) |

---

## 1. Pre-IPO / IPO access — SHIPPED

**User story:** "Get me into the Oura IPO at the offer price."

**What exists:**
- `ipo_offerings` table (global directory: company, ticker, type, provider,
  price range, window dates, status, official URL, verified_at).
- `ipo_requests` table (per-user interest/request tracking).
- Agent guidance in SYSTEM_PROMPT (IPO / PRE-IPO ACCESS section): alert on
  open windows, lay out facts, guide the user to request in the venue's app.
- Grounding validator allowlists IPO prices and official URLs.
- Seeded: Oura (OURA) via Coinbase IPO Access, announced 2026-09-21, $40–44.
- Verified end-to-end with a dry-run turn (agent answered from verified data,
  honest about unconfirmed window, correct tone).

**Access reality (verified 2026-10-08):** Coinbase IPO Access launched
2026-09-21 — eligible US retail customers request IPO shares at the offer
price through the Coinbase app ("Conditional Offer to Buy"). There is NO
broker API for IPO allocation requests. Upmore's capability is therefore:
track → alert → guide; the user taps in the venue's app.

**Connectors:** none (app-only venue). No keys needed.

**Data feeds:** IPO calendar — currently manual seeding. UPGRADE PATH:
Benzinga Private Markets Newsfeed API (launched Aug 2026, REST, covers
private transactions and pre-IPO activity) or manual curation per offering.

**Approval & safety:** requesting shares commits funds — always needs the
user's explicit yes for the exact request (company, max shares, max price).
Honest catches the agent must state: allocations depend on demand (may be
partial/zero); flipping within ~30 days risks a 60-day IPO ban; true
pre-IPO secondary markets usually need accredited-investor status.

**Test plan:** dry-run turn asking "any IPOs I can get into?" → PASSED
(2026-10-08). Next: live turn when a real window opens; verify alert timing.

**Gaps:** (a) automated IPO calendar feed; (b) window-open push alerts;
(c) `ipo_requests` write path from chat ("remind me / track this one").

---

## 2. Copy trading — DB-READY

**User story:** "Copy Nancy Pelosi's portfolio / the best investors on Dub with
$500."

**What exists:**
- `copy_leaders` table (name, source, risk profile, cached performance).
- `copy_follows` table (user → leader, allocation %, max position %, stop-loss %).
- `trade_orders` table (full audit trail, approval-gated).
- **App landscape researched 2026-10-08** (Dub, eToro, Public, Autopilot,
  Composer, ZuluTrade, Collective2 + others):

| App | Mechanics | API for third parties? |
|-----|-----------|------------------------|
| Dub | In-house brokerage; tap Copy on strategy marketplace (politician trackers, hedge-fund trackers, creator portfolios, premium RIA strategies); $100 min, $9.99/mo | **No** |
| eToro | CopyTrader: allocate to a Popular Investor, auto-mirror; $200 min | **YES — the only one** (public API launched Oct 2025: market data, portfolio analytics, social, trade execution, scoped agent tokens) |
| Autopilot | Connects YOUR brokerage (Robinhood/Schwab); auto-executes disclosed trades; $500/portfolio, $100/yr | **No** (works through broker APIs, not its own) |
| Public | Not copy-trading — recurring baskets only | No |
| Composer | No-code rule strategies ("symphonies"); acquired by SoFi ~Oct 2026 | No |
| ZuluTrade | Link broker, follow signal providers (mostly pseudonymous FX quants) | Partial (provider-side) |
| Collective2 | Subscribe to quant strategies, AutoTrade in your brokerage | Publisher-side only |

**Key insight:** Dub and Autopilot's headline strategies are built from FREE
public disclosures (STOCK Act filings, 13F) — fully replicable without any
app. eToro is the only app with a genuine developer API.

**Verified copyable names (seeded into `copy_leaders` 2026-10-08):**
- Nancy Pelosi (congressional disclosure tracker — Dub + Autopilot)
- Jerome Powell (Fed Chair tracker — Dub)
- Dan Crenshaw, Tommy Tuberville (congressional trackers — Autopilot)
- Warren Buffett / Berkshire Hathaway (13F top holdings — Autopilot, Dub)
- Bill Ackman / Pershing Square (13F — Dub)
- Michael Burry / Scion Asset Management (13F — Autopilot)

**Non-app signal sources (free, official):**
- SEC 13F (EDGAR): any manager >$100M — 45-day lag, quarterly, longs only
- STOCK Act PTRs: every member of Congress — ≤45-day lag, dollar ranges only
- SEC Form 4: corporate insiders — 2 business days, fastest legal signal
- 13D/13G: activist stake-building
- Aggregators with APIs: Quiver Quant, Unusual Whales (paid tiers, optional)

**Ranked integration order:** 1) 13F direct ingestion (free, covers Buffett/
Ackman/Burry) → 2) congressional disclosures (the viral Pelosi use case) →
3) eToro public API (leader discovery + alt execution rail) → 4) Form 4
insiders (fastest signal) → 5) Alpaca execution (already planned).

**Honesty notes the agent must keep:** 13F/PTR data is 6–10 weeks stale —
position as "follow their strategy" (long-horizon holders), never real-time
edge; trackers are built from disclosures, not the person's live trades.

**Pre-IPO names (OpenAI, Anthropic, Oura) — wired 2026-10-08:**
- Oura: real IPO via Coinbase IPO Access ($40–44, announced 2026-09-21) —
  in `ipo_offerings`, agent guides the request flow.
- OpenAI / Anthropic: NO retail pre-IPO path exists — both companies voided
  unauthorized SPV/tokenized transfers (OpenAI May 2026, Anthropic Feb 2026).
  OpenAI filed a confidential S-1 (June 2026, reportedly eyeing 2027);
  Anthropic targets late-2026 (unconfirmed). Both tracked in `ipo_offerings`
  as announced; agent watches for their IPO windows.
- Public proxy TODAY: DXYZ (Destiny Tech100) — publicly traded fund holding
  OpenAI, Anthropic, Stripe; buyable via any brokerage (so via Alpaca too).
  Caveats the agent states plainly: 150%+ NAV premium at times, extreme
  volatility, ~2.5% fees.
- Copy-trading angle: a leader sleeve can hold DXYZ for pre-IPO AI exposure;
  direct OpenAI/Anthropic shares unlock only at their IPOs.

**Connectors:** TBD by research — likely Alpaca (execution) + signal source
per leader (app API if public, else 13F filings / disclosures).

**Data feeds:** leader trade signals — the core unsolved piece. Options:
(a) platform APIs (if public), (b) 13F filings (45-day lag, quarterly),
(c) STOCK Act disclosures for politicians (up to 45-day lag),
(d) curated manual leaders.

**Approval & safety:** every mirrored trade is a `trade_orders` row requiring
an `exec_approvals` row — one approval per trade — until the autonomous
framework is authorized. Risk controls on every follow: allocation cap, max
position %, stop-loss %.

**Test plan:** (1) seed one leader + one follow (paper account); (2) ingest a
real leader trade signal; (3) agent proposes the mirror trade with exact
terms; (4) user approves; (5) order submitted to Alpaca paper; (6) fill
reconciled into `trade_orders`. Complete = steps 1–6 with receipts.

**Gaps / decisions needed:** (a) WHO to copy — leader universe (Vishnu's
call, research will recommend); (b) signal ingestion per leader;
(c) Alpaca execution path (shared with capability 3).

---

## 3. Trade via app (user-directed) — SPECCED

**User story:** "Buy $50 of VOO."

**What exists:**
- Alpaca skill (`~/workspace/skills/alpaca/SKILL.md`): Upmore's path is the
  **Broker API** (`broker-api.sandbox.alpaca.markets` paper /
  `broker-api.alpaca.markets` live), HTTP Basic auth, orders at
  `POST /v1/trading/accounts/{account_id}/orders`. Numbers as strings;
  every write async (accepted → filled/canceled).
- `brokerage_accounts` table (provider, paper flag, vault key ref — keys
  NEVER in the DB).
- `trade_orders` table (audit trail).

**Connectors:** Alpaca Broker API — keys NOT yet installed (need
`ALPACA_BROKER_KEY_ID` / `ALPACA_BROKER_SECRET` as Supabase secrets),
no brokerage sub-account opened yet. Paper first; live only after Vishnu's
explicit approval AND Alpaca partnership gates.

**Data feeds:** Alpaca market data (`data.alpaca.markets`) for quotes.

**Approval & safety:** one approval per order, exact terms (symbol, side,
qty, order type). Paper default. Never market-open surprises: limit orders
preferred for user-directed trades.

**Test plan:** (1) install paper keys; (2) open paper sub-account;
(3) user says "buy $50 of VOO" → agent proposes exact order;
(4) user approves; (5) order submitted; (6) fill reconciled. Complete =
real paper fill with receipt.

**Gaps:** (a) Alpaca keys; (b) sub-account opening flow; (c) order execution
edge function / agent tool; (d) fill reconciliation job.

---

## 4. Auto-invest — DB-READY

**User story:** "Invest $200 every month into my 80/20 portfolio and rebalance
when it drifts."

**What exists:**
- `auto_invest_rules` table (rule types: recurring_buy, rebalance,
  drift_trigger; allocations JSONB; amount; frequency; drift threshold;
  cash reserve).
- `portfolio_snapshots` table (holdings, cash, equity per account).
- `trade_orders` table (each generated order approval-gated).

**Connectors:** Alpaca (execution + holdings sync). Same keys as capability 3.

**Data feeds:** portfolio holdings (Alpaca positions API or Plaid
`plaid_holdings_cache` — exists); market prices for drift math.

**Approval & safety:** rules are standing instructions, but EVERY generated
order still needs per-order approval until the autonomous framework is
authorized. Kill switch: pausing the rule stops everything.

**Test plan:** (1) create a recurring_buy rule (paper, $10); (2) scheduler
evaluates → proposes order; (3) user approves; (4) fill reconciled;
(5) drift_trigger test: snapshot drift > threshold → rebalance proposed.
Complete = one full scheduled cycle with receipts.

**Gaps:** (a) rules-evaluation scheduler (cron); (b) drift-math job;
(c) Alpaca execution (shared with 3).

---

## 5. Portfolio tracking & drift alerts — DB-READY

**User story:** "How did my investments do today? Am I off target?"

**What exists:** `portfolio_snapshots`, `finance_snapshots`,
`plaid_holdings_cache` tables.

**Connectors:** Alpaca positions API or Plaid holdings (Plaid production
access pending — application submitted 2026-09-27).

**Test plan:** sync holdings → snapshot → drift computed → alert delivered.

**Gaps:** holdings sync job; snapshot cadence; alert copy.

---

## Build order (proposed)

1. Capability 3 (trade via app) — unlocks execution for 2 and 4.
2. Capability 5 (portfolio tracking) — unlocks drift math for 4.
3. Capability 4 (auto-invest) — needs 3 + 5.
4. Capability 2 (copy trading) — needs 3 + leader universe decision.
5. Capability 1 expansions (IPO calendar feed, window alerts).

## Decisions needed from Vishnu

- [ ] Copy trading: whose trades do we copy? (research will recommend top 3–5)
- [ ] Alpaca: approve installing paper API keys to start building execution
- [ ] Autonomous-trading framework: NOT authorized — every order stays
      approval-gated until he explicitly authorizes it
