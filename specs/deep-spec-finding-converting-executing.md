# STACK — Finding, Converting, Executing: Deep Spec

_Received from Vishnu 2026-09-22. NOTE: the message was truncated mid-section at §1.3 — the rest of the spec (converting, executing, and anything after §1.3) has NOT been received yet._

## 0. The unit of the product: a "set piece"

A set piece is one bounded, repeatable way to get money, where every requirement
is written down somewhere and the steps fit on a checklist.

Five kinds, and the product treats them completely differently:

| Kind | Definition | Example | Cash at the end? |
| --- | --- | --- | --- |
| A. Owed | Money already yours, held by someone else | Unclaimed property, duplicate charge, recall refund | Yes, if it exists |
| B. Fixed reward | Provider's terms state a reward for stated actions | Bank bonus, referral, cashback welcome offer | Yes |
| C. Fixed rate, gated | Rate is published, but the platform selects you | Prolific study, user test, mock jury | Yes, if selected |
| D. Convertible value | Reward arrives as something that is not spendable cash | Free stock, points, gift card, site credit, promo trading credit | Only after a conversion step |
| E. Variable | No fixed payout | UGC, data-selling apps, freelancing | Unknown |

Kind D is the one everyone else ignores and the one your example lives in.
Every kind D reward needs a second engine: conversion research.

---

## 1. THE FINDER — how set pieces are discovered

### 1.1 Source layer (what is watched, continuously)

**Owed-money sources**
- All 50 state unclaimed property systems + multi-state search
- Treasury (savings bonds), PBGC (lost pensions), FDIC/NCUA (failed institutions)
- Settlement administrators' own claim sites; court dockets for newly certified classes
- Recall databases: CPSC, NHTSA, FDA, manufacturer recall centres
- Carrier and airline policy pages for delay/disruption remedies
- Utility, landlord and escrow deposit rules by state
- The user's own records (receipts, orders, statements) via opt-in scopes

**Offer sources**
- Provider terms pages for hundreds of banks, credit unions, brokerages, neobanks
- Affiliate and partner network feeds (as a lead, never as proof)
- Regulator filings and public disclosures where promotions must be registered
- App store listings and changelogs for new consumer apps with launch rewards
- Research, testing and panel marketplaces: open study boards and published rates
- Employer, campus, union and insurer benefit portals (user-supplied)
- Local and regional programs: credit unions, utilities, municipal rebates

**Signal sources (leads, not offers)**
- Competitor aggregator output (tells you what is already commoditised)
- User-submitted teardowns: anything a user pastes in becomes a candidate
- Licensed data and official APIs for demand scanning; never prohibited scraping

### 1.2 Intake pipeline (candidate → publishable set piece)

1. **Ingest** — raw page, feed item or user submission, with a stored snapshot.
2. **Entity resolution** — bind to a provider legal entity, not a brand name.
   Two apps named the same thing are two records.
3. **Clause extraction** — pull structured fields out of the terms:
   qualifying action, minimum amount, day windows, posting date, fee and waiver,
   earliest safe close date, one-per-person rules, excluded states, clawback text.
4. **Classification** — assign kind A–E and the certainty badge. If a payout is
   described with words like "may", "up to", "at our discretion", it is E, never B.
5. **Risk screen** — reject on: user funds at risk, credit inquiry not disclosed,
   fee-to-earn, deposit-to-work, irreversible personal-data licensing, gambling.
6. **Economics model** — compute the net-value and effort numbers (§1.3).
7. **Pilot** — run with a small internal cohort. No route publishes on theory.
8. **Graduate** — publish with checked-on date, source link and stats slots.
9. **Watch** — terms diffing on a schedule; any material change retires the version.

### 1.3 Scoring every candidate

Each set piece carries these computed numbers, and the ordering engine uses them:

```latex
Net = Reward - Unavoidable\ fees - Extra\ spending - Tax\ set\ aside - Cost\ of\ locked\ cash
```

_[SPEC TRUNCATED HERE — remainder not received]_
