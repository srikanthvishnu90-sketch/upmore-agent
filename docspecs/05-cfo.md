# Doc 5: CFO — the seven money-health features

Owner directive 2026-09-25 11:00 CDT (Vishnu). Ranked by dollars. These are
the features that make Upmore "your AI money agent" instead of another
offer list.

## Hard constraints (final, not debatable)

1. **"Execute" never moves money.** Assembled cart, pre-filled order, one
   tap by the user. Everything up to the payment. The moment Upmore moves
   money it is money transmission, licensed state by state — company-ending.
   No auto-transfer, no auto-pay, no auto-invest. Ever.
2. **No affiliate steering.** If Upmore earns commission on anything it
   shows, the card shows the cheapest option even when it pays Upmore
   nothing, and the card discloses the relationship. A savings app that
   quietly steers is exactly what users are right to distrust.

These apply to every feature below and to all future features.

## 1. Debt sequencing (biggest dollar item)

The CFO's core job for an indebted person is capital allocation: which
balance to attack first.

- User enters debts: balance, APR, minimum payment, name. Optional: 0%
  promo expiry date.
- App computes, never asserts: per-debt interest cost per month
  (`balance × APR / 12`), avalanche order (highest APR first), total
  interest and payoff date under avalanche vs minimums-only.
- Snowball (lowest balance first) shown as an option with its exact
  interest cost vs avalanche — the user's psychology call, priced honestly.
- 0% promo windows: warning when a promo expires within 90 days, with the
  revert APR and the interest cliff.
- Refinance vs pay down: the decision rule, not a recommendation. Compare
  effective rates after fees; flag term-extension traps (lower payment,
  more total interest).
- Never recommend a specific card, loan, or balance-transfer product.
  Educational math only. No affiliate links in this feature, period.

## 2. Idle cash

Money sitting in checking at near-zero while savings pay real rates.
Free money for doing nothing.

- From live bank data (read-only) or manual entry: checking balance,
  average balance, and what it earns (≈0%).
- Shows current high-yield savings APYs as data (sourced, dated), the
  yearly interest on the user's idle balance at each, and the gap.
- **Never moves the money.** The action is: pre-filled application link
  or "here's what to open" — user taps, user applies, user transfers.
- Rate table obeys the no-steering rule: best rate first regardless of
  commission; any affiliate relationship disclosed on the card.
- Emergency fund sizing shown (3–6 months of essentials) so the user
  doesn't move money they need liquid.

## 3. Tax positioning, NOT tax filing

Forward-looking. The W-4 alone is the fastest cash-flow change available
to anyone employed.

- **W-4 accuracy:** explain under/over-withholding in plain terms; link
  the IRS Tax Withholding Estimator; list the trigger events for filing a
  new W-4 (new job, marriage/divorce, second job, new gig income, new
  dependent). Frame a big refund as an interest-free loan to the IRS.
- **Credits left on the table:** eligibility checklist for EITC, Child Tax
  Credit, Saver's Credit, education credits — with 2026 amounts and income
  gates, verified yearly. "Check if you qualify," never "you qualify."
- **Quarterly estimates for gig work:** who must pay, 2026 due dates,
  safe-harbor rules, underpayment penalty. A simple calculator:
  gig profit × marginal rate → per-quarter estimate.
- **HSA / retirement timing:** 2026 contribution limits, HDHP requirement
  for HSA, the triple-tax-advantage mechanics. "Contribution room left
  this year," not advice to contribute.
- Every screen: "General information, not tax advice. Your situation may
  differ — a CPA or the IRS estimator settles it." Upmore never files,
  never signs, never submits anything to the IRS.

## 4. Insurance adequacy

The opposite of "reshop for cheaper": are you actually covered?
Underinsurance is a far bigger risk than overpaying. No consumer app
touches this because there is no commission in telling someone they're fine.

- Coverage-gap questionnaire: life (DIME method + income multiple),
  disability (employer LTD gaps), renters/homeowners, auto liability
  vs state minimums, health max-out-of-pocket exposure, umbrella.
- Every check has a "you're fine" outcome. The app must be willing to
  say coverage is adequate — that is the point.
- No insurance sales, no quotes, no affiliate links, no carrier
  recommendations. Educational gaps only. If a gap is found, the action
  is "talk to an independent agent" — never a specific product.

## 5. Runway

"If your income stopped today, you have N weeks." Pure arithmetic from
data the app already has. The question people lie awake about; no app
answers it.

- `runway_weeks = liquid_cash / weekly_burn`, where weekly_burn is
  trailing-90-day essential spend / 13. Essentials exclude transfers,
  flagged errors, and user-marked discretionary.
- Shown as a single sentence with the inputs visible: "$X liquid ÷
  $Y/week burn = N weeks." Every number tappable to its source.
- Updates as bank data refreshes. Silence (no bank data) → the card
  says what it needs, not a guess.

## 6. Monthly close

CFOs close the books. People never do. One screen, once a month,
ninety seconds: what came in, what went out, what changed, what's
coming. The habit that makes everything else stick — the retention
mechanic.

- Auto-generated on the 1st: total in, total out, net, vs trailing
  3-month average, top 3 movers by category, upcoming bills/deadlines
  this month.
- One-tap acknowledge ("Reviewed") — logged, never nagged. No streaks,
  no shame, no "you're behind."
- Missed months are just listed, not punished.

## 7. Income side

A CFO works revenue, not just costs.

- **Role benchmarks:** BLS Occupational Employment data (citable,
  free) for the user's role + metro. Percentile framing: "the median
  for X in Chicago is $Y." No scraped self-reported data presented
  as fact.
- **Raise timing:** the annual-cycle reality, promotion-vs-merit
  distinction, the job-switch premium (stated as market data, not
  a suggestion to quit).
- **Freelance rates:** market-rate framing, the salary-to-hourly
  conversion, common underpricing mistakes. Calculator, not advice.
- **Late invoices:** aging list the user enters; follow-up cadence
  guidance; late-fee clause language. Upmore never contacts anyone
  on the user's behalf.

## Cross-cutting rules

- Code computes; model explains. Every dollar figure shows its inputs.
- Never let estimates masquerade as calculations.
- Read-only bank access forever. Nothing here moves money (constraint 1).
- No affiliate steering anywhere (constraint 2). Disclose on the card.
- No guilt, streaks, badges, nags, shame, or comparisons.
- Tax and insurance content: general educational information only,
  with professional-consult disclaimers. Never tax advice, never
  insurance advice, never "you should buy X."

## Implementation status (2026-09-25, evening CDT)

All seven features implemented in `src/upmore-app-template.html` as the
"SPEC 05 CFO" module, rendered on Home under "Your money, like a CFO sees
it" with a shared `cfoDetail` screen. User-entered data persists in
localStorage (`cfo_*` keys). Research reports backing the figures:

- `research/tax-positioning-2026.md` (IRS-verified 2026 figures)
- `research/debt-and-idle-cash-2026.md` (simulated payoff math, Sept 2026 rates)
- `research/insurance-and-income-2026.md` (adequacy framework, BLS benchmarks)

Delivered per feature:

1. Debt: add/remove debts, per-debt monthly interest, avalanche order,
   avalanche vs snowball vs minimums-only interest and months (simulated,
   not estimated), 0%-promo 90-day warning. No product recommendations.
2. Idle cash: checking balance (from bank data or manual), editable HYSA
   APY (default 4.2%, as-of Sept 25 2026), yearly gap math, emergency-fund
   buffer note, no-move-money rule stated.
3. Tax: W-4 guidance + IRS estimator link, EITC/CTC/Saver's/education/
   dependent-care credit cards with 2026 figures, quarterly-estimate
   calculator with SE-tax math, standard deduction 2026, HSA/401(k)/IRA
   2026 limits. Never files anything.
4. Insurance: adequacy quiz (life/disability/renters/auto) with explicit
   "you're fine" outcomes. No products, no commissions.
5. Runway: liquid balances ÷ trailing-90-day weekly burn from Track data.
6. Monthly close: in/out/net this month, vs 3-month average, top movers,
   mark-as-reviewed. No streaks/shame.
7. Income: BLS May-2024 median pay table (labeled), freelance rate
   calculator, invoice tracker with overdue flags.

## Debt math verification (2026-09-25)

The payoff simulator was independently verified: the app's algorithm was
re-implemented in Python and both produce identical results on a two-debt
test case ($8,000 @ 24% min $200 + $3,000 @ 12% min $90, $200/mo extra):
avalanche $2,907 / 29 mo, snowball $3,443 / 30 mo, minimums-only $7,831 /
65 mo. During verification a real bug was found and fixed: the original
simulation applied payments BEFORE accruing that month's interest,
understating total interest by ~$300 on the test case. The fixed order is
interest-first (standard amortization), then minimums, then extra in
strategy order. Playwright DOM smoke test: 22/22 checks pass, zero console
errors (local file:// run; managed browser cannot reach localhost).
