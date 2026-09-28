# Upmore Compliance Spec — Critical Analysis (2026-09-27)

Source: the founder-supplied "Upmore Compliance Specification (as of September 27, 2026)".
This file is analysis, not legal advice. Tier-0 items need licensed Illinois counsel before launch.

## What the spec gets right (verified against the actual product)

- **Finder law is the #1 risk.** Correctly identified as Tier 0. The Illinois statute's plain text covers "assisting" for "a fee... paid by the owner" with no software exemption. Upmore's unclaimed-money routes + a future $10/mo subscription is exactly the fact pattern.
- **Read-only architecture neutralizes money-transmission.** Confirmed: Upmore never holds, pools, or moves funds; referral credits are non-transferable, non-withdrawable, subscription-only. No MSB registration needed under the current design.
- **Referral is already compliant.** Uses `navigator.share` (native share sheet — Upmore never sends invites itself), pre-filled text includes the disclosure ("I get $10 credit"), credits are non-cash. Matches §11's requirements.
- **Dispute/claim drafting is already UPL-safe.** Guide refuses to file disputes for the user ("a dispute is your statement, so you have to be the one who signs and sends it"). User taps final Submit on the "Do it for me" agent. Matches §8.5.
- **No contests, no SMS, no Gmail OAuth, no biometrics, no credit-data APIs.** Large sections of the spec (TCPA, CASA, BIPA, FCRA, class-action bulk filing) are N/A to the current product. Good — less surface.

## Where the spec overreaches or doesn't match this product

- Written against a bigger feature set than exists (CLAIM/DUE/TRACK tabs, Gmail receipt scanning, class-action filing). Those sections apply to planned features, not today's app.
- **"Do not launch brokerage linking" (TL;DR) vs. §7.3's own nuance.** §7.3 permits facts-only display with a hard AI block on buy/sell/hold/should and position-specific commentary. The TL;DR is the conservative read; the section text gives the compliant path. Decision below.
- **1099 reporting (§11).** Assumes cash payouts. Upmore's credits are non-cashable subscription credits — economically a discount, not income. The W-9/1099 regime matters only if credits ever become cashable. Noted, not urgent.
- **"AI CFO" framing.** The product does NOT call the AI "CFO" — the AI is "Guide"; "CFO tools" is a feature-section label for calculators. The spec's "holding out" concern is about the AI advising, not a section header. Still worth renaming (cheap).

## Gaps the spec found that are REAL and must be fixed before "testing ready"

1. **No 18+ age gate.** Welcome screen is just Terms/Privacy links. Spec: 18+ gating is "legally necessary, not optional" (contract capacity, arbitration enforceability, aggregator terms). BUILD: neutral DOB gate, no default year.
2. **No pre-connection consent screen.** Needed for Plaid Q10 (founder currently answered "No" — honest but weak; a real consent screen lets it become "Yes") and §1033-style authorization. BUILD.
3. **No AI disclosure in Guide.** Spec §15: label "Guide is an AI" on first use + chat header. VERIFY/BUILD.
4. **Privacy policy is in-app only.** Apple requires a public URL; Plaid Q9 wants a link. BUILD: public /privacy page, sync in-app sheet to it.
5. **Terms are a paragraph.** Spec §17.3 requires full clickwrap (eligibility, arbitration, liability cap, AI disclaimers). DRAFT (counsel review pre-launch).
6. **Guide credit content is directive.** Deterministic paths answer "improve credit" queries with directives ("pay down high-utilization cards first"). CROA-adjacent. FIX: reframe as pure education (how scoring works), no personalized directives, never a marketed feature.
7. **Guide + own holdings is the securities tripwire.** Founder rule today: "balanced pros/cons, don't sway." Spec's analysis: even balanced answers using the user's cost basis = individualized advice. The founder's rule is INSUFFICIENT for holdings-linked chat. FIX: hard block — Guide never discusses the user's own holdings, period. General company explainers stay impersonal and identical for all users.
8. **"CFO tools" label.** Rename to neutral ("Money tools") in-product. Cheap insurance against "holding out."

## Decisions only the founder can make

**D1. Brokerage linking (Plaid Investments): ship or defer?**
- Spec's conservative line: launch without it.
- Compliant middle path (spec §7.3): ship facts-only X-ray (holdings, arithmetic allocation, fee drag) + hard AI block on any commentary about the user's positions + counsel memo pre-launch.
- Note: Plaid production approval is already submitted for Investments. Deferring the feature doesn't require withdrawing approval.
- RECOMMENDATION: ship the middle path — facts-only, hard block, memo before launch. Deferring kills the X-ray differentiator the founder built for "nobody should win."

**D2. Branding.**
- Rename in-product "CFO tools" → "Money tools" (5-minute change, recommend yes).
- "Your money, like a CFO sees it" framing: recommend softening in-product; the "best app at showing your money like a CFO" marketing claim can stay as a view-description, flagged for counsel review.

**D3. Unclaimed property: commit to free + unbundled.**
- Spec option 1: unclaimed search free for everyone (subscriber or not), never paywalled, with the notice "This money is held by the Illinois Treasurer and you can claim it yourself for free," linking I-Cash/MissingMoney.
- Currently no paywall exists, so compliant today — but the $10 subscription must NEVER gate this feature.
- RECOMMENDATION: adopt option 1 now; get the Illinois counsel opinion ($2.5–5k) pre-launch. No finder license needed under this option.

**D4. Entity.**
- Apple requires a legal entity for finance apps (Guideline 5.1.1(ix)) + D-U-N-S (1–3 weeks). Illinois LLC ($150) vs Delaware C-corp. Pre-LAUNCH gate, not pre-testing. Decide before App Store submission.

**D5. Legal spend timing.**
- Spec budget $8k–25k pre-launch: finder opinion, securities memo (if brokerage ships), terms/privacy review, trademark clearance. Founder decides when; none of it gates "testing ready."

## Verified MFA state (2026-09-27, read-only check)

- Google (vish@sporv.ai): 2-Step Verification OFF (passkeys exist, 2SV itself off).
- GitHub (srikanthvishnu90-sketch): 2FA NOT enabled.
- Plaid dashboard: 2FA ON (SMS).
- Supabase / Vercel: not signed in — could not verify.
- Consequence: Plaid Q5's honest answer today is "No." Founder must enable 2SV/2FA (5-minute taps) before answering otherwise.

## "Testing ready" gate — ALL must be true before the founder connects accounts

Testing-ready = safe for real account connections + 100-agent end-to-end test. NOT launch-ready.

- [ ] Functionality sweep complete; all critical/high fixed and verified (coordinator running)
- [ ] D1–D3 decided (brokerage, branding, unclaimed-free)
- [ ] Age gate (18+, neutral DOB) live in prod
- [ ] Pre-connection consent screen live (bank + brokerage)
- [ ] AI disclosure in Guide live
- [ ] Public privacy policy page live; in-app sheet synced
- [ ] Full ToS clickwrap live (counsel review deferred to pre-launch)
- [ ] Guide hardening live: hard block on own-holdings discussion; no buy/sell/hold/should; credit content education-only; tax hypotheticals only
- [ ] "CFO tools" renamed (per D2)
- [ ] Unclaimed-money free notice live
- [ ] Google 2SV + GitHub 2FA enabled (founder taps)
- [ ] Plaid approved; production keys installed; link-token verified
- [ ] Plaid questionnaire submitted (founder tap)

## Pre-launch (after testing, before App Store) — NOT gating "testing ready"

Entity + D-U-N-S + Apple org enrollment; finder counsel opinion; securities memo (if brokerage ships); terms/privacy counsel review; trademark clearance; insurance; Stripe live (founder ordering: last, with domain); ARL-grade subscription flow with Stripe.
