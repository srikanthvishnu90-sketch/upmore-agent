# State-Aware Compliance Matrix (2026-09-27)

**Principle:** Upmore captures the user's US state at onboarding (`profiles.state`) and applies the
strictest applicable rule everywhere it can. Where the law is state-run infrastructure (unclaimed
property offices), the app routes the user to their own state's office. This document is the map;
the implementation checklist at the bottom goes into the app in the compliance pass.

## 1. What is normalized to the strictest standard (no per-state branching)

| Area | Standard applied to everyone | Why |
|---|---|---|
| Privacy rights | Access, correct, export (JSON), delete — for all users, any state | Exceeds every state comprehensive privacy law; no threshold tracking needed |
| Data sale/sharing | None, ever | MO, TX, CA "sale"/"sharing" rules moot |
| Auto-renewal | California-grade nationwide (clear disclosure, express consent, email acknowledgment, online cancel ≤2 taps, trial-ending notice, annual reminder) | When Stripe goes live; satisfies all 35 state ARLs at once |
| Age | 18+ nationwide, neutral DOB gate | Contract capacity + arbitration enforceability in all states |
| AI disclosure | "Guide is an AI" on first use + chat header, all users | CA bot disclosure, UT AI Policy Act, CO transparency |
| Marketing claims | Substantiation file for every number, no fake UGC, creator disclosures | FTC §5 + all state UDAPs |

## 2. What varies per state (app behavior branches on `profiles.state`)

### 2a. Unclaimed property — the finder-law zone (spec §8.4)

Upmore never charges for unclaimed-property search (free + unbundled, per founder decision D3),
so finder licensing is avoided by design. What varies is WHERE the user claims:

- **Illinois (strictest):** show the statutory-style notice — "This money is held by the Illinois
  State Treasurer and you can claim it yourself for free." — with a direct link to I-Cash
  (illinoistreasurer.gov/I-Cash). 24-month waiting period and 10% fee cap apply to finders;
  Upmore is not a finder because it takes no fee.
- **All other states:** notice names the user's state ("...held by the [State] unclaimed property
  office...") and links the user's state office via the NAUPA directory; universal fallback is
  MissingMoney.com (official multi-state search, NAUPA-backed).
- **States with notable finder regimes** (only relevant if Upmore ever charged — documented so the
  rule is known): CA (10% cap, strict contract timing), FL (registration + caps), TX (fee limits +
  waiting period), NY / PA / OH (caps + waiting periods). Current posture: no fee → not a finder
  in any of them.

### 2b. State privacy specifics worth knowing (all exceeded by the universal standard)

- **CA (CCPA/CPRA):** GLBA data-level exemption only — marketing/analytics data fully covered.
  Upmore collects no ad/analytics data; rights granted universally anyway.
- **MD (MODPA):** strictest minimization ("reasonably necessary and proportionate"). The data
  inventory (01) already justifies every field per feature — keep that discipline on new fields.
- **TX/NE:** no numeric threshold; small-business exemption likely applies, but the sensitive-data
  sale ban applies to everyone — moot, nothing is sold.
- **IL (PIPA):** breach notice "most expedient time," AG notice at 500+ IL residents — in the
  incident response plan (06).

### 2c. Referral program

"Void where prohibited" in program terms. No state currently prohibits Upmore-style
non-cashable subscription credits; insurance/real-estate referral restrictions don't apply.

## 3. Implementation checklist (compliance pass, post-sweep)

- [ ] `STATE_RULES` config: per-state unclaimed office name + claim URL (IL deep link verified;
      others via NAUPA directory/MissingMoney fallback — never invent a state URL)
- [ ] Unclaimed-money UI reads `profiles.state`; IL users get the statutory notice + I-Cash link;
      others get "[State] unclaimed property office" notice + routed link
- [ ] Finder-avoidance invariants enforced in code review: unclaimed search never behind paywall,
      never gated on subscription, no fee or revenue share on recovered amounts
- [ ] Privacy-rights flows (export/delete) available to all states identically — no geo-branching
- [ ] Subscription flow (Stripe, later): CA-grade ARL nationwide — no state branching needed
- [ ] New data fields: check against MD minimization standard before shipping (01 §2 rule 1)
