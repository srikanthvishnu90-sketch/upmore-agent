# MI-111 — Per-user paid-data credit ledger (module 156)

Master list MI-111 (harness memo G6), Crew B data layer, Tier 2 — engine
under harness. Lands BEFORE the first paid source is connected, never
after: no Hunter/aggregator key exists yet, and this module is the gate
every future paid call must pass through. No real paid-source calls are
made by this build; the lookup itself is always an injected function.

## The defect it closes

Paid lookups (Hunter, aggregators, any future paid source) would draw on
ONE shared credit pool across all users with no per-user ledger, no daily
ceiling, and no fail-closed behavior. One user — or one runaway loop —
could silently drain the pool for everyone, and nobody could answer
"what did we spend today, per user, per source".

## Design (packages/domain/156-career-paid-data.js, `CareerPaidData`)

All money is integer **millicredits** (1 credit = 1000). Hunter
verification costs 0.5 credits (Spec 1, observed rules [S2]); float
credit arithmetic would drift, so no float ever touches a cost.

**Source catalog** (`SOURCE_CATALOG`) — unit costs from Spec 1's observed
vendor rules, labeled as observed list rules, not embedded-use quotes:
hunter `email_finder` 1cr per found result · `email_verifier` 0.5cr ·
`domain_search` 1cr per email; apollo `people_search` 0cr ·
`enrichment` variable 1–9cr (requires a caller quote inside the range);
pdl `person_search` 1cr per returned record; aggregator `api_credit`
1cr. A source/kind with no catalogued cost is **unpriced spend** and is
refused (`UNKNOWN_PAID_SOURCE`) — the lookup never runs.

**The seam** — `runPaidLookup({store, userId, source, kind, units,
quoted_cost_milli?, purpose?, now}, lookupFn)` is the only sanctioned
way to make a paid call, following Spec 1 §327 ("reserve credits
transactionally before a paid request; reconcile actual usage after
results"):

1. Quote from the catalog; unknown/unquotable → typed refusal, no call.
2. Check the user's day: settled + reserved + this cost must fit the
   daily ceiling (default 50 credits, per-user overridable via
   `setDailyCeiling`). Over → `{code: "BUDGET_REACHED"}` with the honest
   line "Your daily data budget reached its limit for today…" — the
   lookup NEVER runs and nothing is debited. Fail-closed, always.
3. Reserve: a `reserved` ledger entry is persisted BEFORE the call, so
   concurrent in-flight lookups count against the same ceiling.
4. Run the injected lookup. On throw, the reservation is `released`
   (charged 0, kept on the ledger as an audit row) and the call returns
   `{code: "LOOKUP_FAILED"}` — an unproven vendor charge is never booked.
5. Settle: the entry becomes `settled` at the reconciled cost — if the
   lookup reports `billable_units` (e.g. Hunter charges per FOUND
   result), the settled cost is unit cost × billable units, which may be
   less than reserved (0 found = 0 charged). If a vendor ever charges
   MORE than reserved, the entry settles at the truth and is flagged
   `over_ceiling: true` — reconciled honestly, never hidden.

Zero-cost lookups settle at 0, are recorded on the ledger, and are never
budget-blocked (they cannot drain the pool).

**Records** (injected {get,set} store, 121's KV contract):
- `career:paid-data-ledger:<user_id>` — append-only entries
  {entry_id, user_id, ts, day (UTC), source, kind, units,
  unit_cost_milli, cost_milli, status: reserved|settled|released,
  purpose}. A malformed stored ledger throws rather than reading as
  empty — a corrupted ledger must never reset a user's spend to zero.
- `career:paid-data-config:<user_id>` — {daily_ceiling_milli}.
- `career:paid-data-pool:<day>` — pool index updated on every settle:
  {day, total_milli, lookups, by_source, by_user}, so pool-level spend is
  reportable per day (`poolReport`) without scanning every user.

**Reports** — `dailySpend` (per user/day: total, lookups, by_source),
`budgetStatus` (ceiling, settled, reserved, remaining, at_ceiling),
`poolReport` (per day: total, lookups, by_source, by_user),
`ledgerEntries` (the raw audit rows). Grading is on these end states,
never on reply text.

## Guard

`tests/career-mi111-credit-ledger.test.cjs` (9 tests, LED-1…LED-8 +
catalog/defaults): debit-with-source-and-unit-cost; ceiling refusal with
the lookup spy at 0 calls and nothing debited; unknown source/kind
fail-closed; reserve-before-call binding a concurrent lookup +
reconcile-to-billable + release-on-failure; pool report per day by
source and user; per-user/per-day isolation; fractional exactness
(10 × 0.5cr = exactly 5000 milli) + in-range quote enforcement;
zero-cost search recorded and never blocked. Written fail-first: the
suite was red (module absent) before the build.

## Scope / standing law

New module 156 + bundle registration only. No host wiring yet — there is
no paid caller to wire until a vendor is owner-approved, connected and
funded (still an owner input); when one lands, its calls route through
`runPaidLookup` or they do not run. No deploy, no sends, no purchases,
no real paid-source calls. The 50-credit default ceiling is a Crew B
policy default, stated as such, not an owner-decided number.
