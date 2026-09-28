# Doc 2: Cancel — stored from Vishnu's paste, 2026-09-24 22:05 CDT. Full text below.

Upmore — Cancel: Feature Spec
Sep 24, 2026
Cancel is the feature users come for and the one most likely to make Upmore look dishonest, because Upmore cannot actually cancel anything. Every product in this space implies otherwise. This spec is built around being the one that doesn't.
This document assumes the shared architecture in Upmore — Feature Specs: one transactions pipeline, one ranked queue on Home, three tabs, deterministic code finds and the model explains.

## What Upmore can and cannot do
Detect every recurring charge: Yes — pure algorithm over transactions.
Rank by likely waste: Yes — algorithm plus one user confirmation.
Supply the exact working cancel path: Yes — maintained library, decays without upkeep.
Draft the cancellation message: Yes — genuine model work.
Warn what retention will offer: Yes — stored per merchant.
Block the charge at card level: Partly — virtual card or issuer stop-payment — does not end the contract.
Press cancel inside the merchant's account: No — requires the user's credentials; merchant terms prohibit it, and silent failure creates liability.
Confirm it actually died: Yes — watch the next expected billing date.

The row that matters is the last one. Most tools declare victory when the user clicks cancel. Upmore does not mark a subscription cancelled until the next billing date passes with no charge. That single rule is the difference between a tool people trust and one they quietly stop believing.

## The recurrence detector
Deterministic. No model involvement. An LLM will invent subscriptions that do not exist, and a phantom subscription is worse than a missed one.

Algorithm:
1. Normalise merchant strings — strip payment-processor prefixes (SQ *, PAYPAL *, TST*); strip store numbers, dates, trailing reference digits; lowercase, collapse whitespace; map known aliases to a canonical merchant id.
2. Group transactions by canonical merchant.
3. Within each group, cluster by amount — same cluster if within 5% or $1, whichever is larger (covers tax changes and small price rises).
4. For each cluster, compute gaps between consecutive dates.
5. Classify the interval: weekly gap 6..8 days; biweekly 13..15; monthly 28..31; quarterly 88..92; annual 360..370.
6. Emit a subscription when at least 2 occurrences, and at least 75% of gaps fall in one interval band.
7. Confidence: 0.6 two occurrences; 0.8 three; 0.95 four or more with consistent amount.

Known failure modes:
- Annual subscriptions missed — needs 13+ months of history. Say so plainly; flag as a known gap for new users.
- Variable-amount subscriptions — usage-based billing, utilities. Widen the amount tolerance to 25% and lower confidence to 0.5.
- Merchant name changes — processor or rebrand. Alias table, maintained manually.
- Family plans — one charge, several users. Cannot detect; user must tell you.
- Split billing — one service across two cards. Cross-account grouping by canonical merchant.
- False positive from regular purchases — same coffee shop, same amount, every Monday. Require amount consistency plus a merchant category that plausibly bills recurring. Telling a user to cancel their commute coffee is the kind of error that gets screenshotted.

## The cancel-path library
This is the actual asset. Merchants deliberately change cancellation flows to break automation and to raise friction, so a path map decays without maintenance and cannot be scraped once and forgotten. A library that is current is worth more than a catalog that is large.

Schema: merchant_id (canonical, matches the detector's normaliser); method enum (web, app, phone, chat, email, mail); direct_url (deepest URL that still works when pasted cold); steps array (one action each, imperative, with what the user should see); auth_required bool; retention_offers array (what they will offer, and what each is actually worth); hidden_traps array (downgrade-instead-of-cancel, pause defaults, survey walls); cancels_immediately bool (or runs to period end); refund_policy string (pro-rata, none, or partial); notice_period_days int; phone_number string (with the menu path to a human); hours string (with timezone); avg_minutes int (observed, not estimated); last_verified_at timestamp (the field that makes the rest trustworthy); verified_by enum (user_outcome, agent_check, manual); success_rate float (from real user outcomes); observed_n int.

How paths stay current — three sources, in order of trustworthiness:
1. User outcomes. Every completed cancellation asks two questions: did the steps match, and how long did it take. A mismatch flags the path for review immediately. This is the only source that reflects what actually happens.
2. Agent check. A scheduled job loads direct_url, confirms it still resolves and still contains the expected elements, and flags on change. Cheap, catches dead links, cannot detect a flow that moved rather than broke.
3. Manual. Someone walks it. Expensive, authoritative, reserved for the top merchants by user count.
A path unverified for 90 days is shown with its age stated. A path with three consecutive mismatch reports is pulled and replaced with the merchant's generic support link plus an honest note that the specific steps are unknown right now.

Seeding the library: don't try to cover everything. Rank merchants by how often they appear across the user base and build downward. The first 50 merchants will cover the large majority of detected subscriptions, because consumer subscription spend is extremely concentrated. The repo already contains a cancel_paths.ts shared module. That is the right home; it needs the schema above rather than a flat list, and it needs last_verified_at before any path is shown as authoritative.

Why this is defensible: a competitor can copy a subscription list in a week. They cannot copy success_rate and avg_minutes computed from real cancellations, because those require users doing the thing. The library compounds with use and rots without it, which is the definition of a moat that a small team can actually hold.

## The cancel flow

### Ranking: which subscription surfaces first
Detection finds everything. The queue shows the ones worth acting on. Score: waste_score = annual_cost x (1 - usage_signal) x renewal_urgency x confidence.

usage_signal is the hard part, because Upmore cannot see usage. Three imperfect proxies, in order:
1. The user says so. A one-tap "do you still use this?" on the card. Most reliable, costs a tap.
2. Related spending. A gym membership alongside no other fitness spend is weak evidence; treat it as a prompt to ask, never as a conclusion.
3. Age without interaction. Subscribed over a year ago and never mentioned. Weakest signal.
Never infer non-usage and present it as fact. "You haven't used this" when the user used it yesterday destroys trust permanently. The honest form is always a question.

### The cancel card — seven elements, fixed:
1. Merchant and what it is
2. Amount and interval, exactly as charged
3. Annual cost, labelled as a twelve-month projection, never as a saving
4. Next billing date, with days remaining
5. Method badge — web, app, phone — so the user knows what they're in for
6. Observed time, e.g. "about 4 minutes, from 61 people"
7. What they'll try — the retention offers, stated before the user starts

Element 7 is the differentiator. Nobody warns you in advance. Knowing that the merchant will offer 50% for three months, and that this is worth $22 against an annual cost of $180, converts a moment of pressure into a decision the user already made.

### Retention handling
When a retention offer is known, the card shows it with the arithmetic done: "They'll offer you 3 months at half price. That's $22 saved now, then $180 a year again. Cancelling saves $180. Your call, but decide it here rather than in their chat window."
If the user accepts a retention offer, that is a Reduced ledger entry, not Avoided, and the new amount gets its own renewal reminder. Downgrades are tracked the same way. The point is that accepting an offer is a legitimate outcome, not a failure — it just has to be counted honestly.

### Traps, named up front
- Pause instead of cancel (default-selected pause option): "Pausing is not cancelling. It restarts automatically."
- Downgrade path (cheaper tier presented as the only alternative): "You can still cancel outright — keep looking for the link."
- Survey wall (mandatory exit survey): "There's a survey. Any answer works."
- Phone-only (no web cancellation): "This one needs a call. Here's the number and the menu path."
- Notice period (30 days' notice required): "You'll be billed once more. Cancel now anyway."
- Reactivation offer (email days later): "They'll email you an offer. Ignore it unless you want it."

### The message drafter
This is where the model belongs. For email, chat and phone methods it produces the actual words — short, firm, no justification offered, because justification invites negotiation. For phone, it produces a script with the expected objections and a one-line answer to each. The user sends it. Always. Upmore never sends on the user's behalf, never uses stored credentials, and never fills in a merchant's form through an automated session.

### The confirmation rule — the most important paragraph in the document.
A subscription passes through four states, and only one of them counts:
- active: detected and billing — ledger: nothing
- cancel_started: user opened the path — ledger: nothing
- cancel_claimed: user reports they completed it — ledger: nothing
- cancel_confirmed: next expected billing date passed with no charge — ledger: Avoided

cancel_claimed writes nothing to the ledger. Not a provisional figure, not a pending total, nothing. The app says so explicitly: "Nice. I'll watch for the charge on the 14th. If nothing shows up, I'll count it then."

On the expected date plus a 2-day grace, the detector re-runs. No charge, it confirms and the ledger records Avoided. A charge appears, the card returns to the top of the queue with an honest message: "They charged you $14.99 on the 14th anyway. That happens — usually the cancellation didn't go through, or it was queued for period end. Want to check?"

Every competitor counts the claim. Counting only the confirmation makes your headline number smaller than theirs, permanently. That is the cost of the positioning, and it is the positioning.

### Edge cases
- Free trials: a $0 charge from a merchant with no prior history, followed by nothing, is a trial. The card appears before the first real charge, not after: "Your Paramount+ trial ends Oct 1. If you keep it, that's $7.99/mo from then." Reminder fires at trial end minus 3 days and again at minus 1. A trial caught before conversion is the single cheapest win in the app, and it is pure prevention — it produces no Avoided entry, because nothing was ever charged. It gets its own ledger label: Prevented.
- Annual subscriptions: detector needs 13+ months of history. Three mitigations: (1) say it plainly at setup: "I can see monthly charges straight away. Annual ones take a year of history unless you add them." (2) Let the user add one manually in two fields. (3) Flag large one-off charges from known subscription merchants as possibly annual and ask. Annual renewals get a 30-day advance warning, not a 3-day one.
- App-store billing: subscription billed through Apple or Google cannot be cancelled at the merchant at all — only in the platform's subscription settings. Detection sees "APPLE.COM/BILL" with no indication of which service. Handling: recognise the platform prefix, tell the user the charge is bundled, deep-link them to the platform's subscription list, and ask them to tell you which service it was so the mapping improves.
- Shared and family accounts: one charge, several users. Upmore cannot detect this and must not assume. If the user marks a subscription as shared, it stays in Track but leaves the cancel queue entirely.
- Contracts with notice periods and termination fees: three fields drive this — notice_period_days, early-termination fee, contract end date. The card does the arithmetic before the user acts: "Cancelling now costs a $120 early-termination fee. You have 4 months left at $45, so $180. Cancelling still saves $60 — but only just." And when it doesn't: "Cancelling now costs more than riding it out. Your contract ends March 14 — I'll remind you on February 14 so you can cancel before it auto-renews." The second case is the one that builds trust, because the app is telling the user not to do the thing it exists to do.
- Insurance and utilities: never surface these for cancellation. Cancelling insurance is not saving money, it is assuming risk, and cancelling a utility is not an option. These merchants are routed to the Reduce path — reshop or renegotiate — and are excluded from the cancel queue by merchant category.
- Subscriptions that are already cancelled: a detected subscription whose last charge is more than two intervals old is dormant, not active. It stays out of the queue and out of the monthly total. Showing a user a subscription they killed six months ago makes the whole detector look unreliable.
- Card-level blocking: a virtual card pause or an issuer stop-payment blocks the charge without ending the contract. This is sometimes the only option, and it is dangerous: the user still owes the money, and the merchant can send the balance to collections. If offered at all, it carries an unavoidable warning, and it never produces an Avoided ledger entry — a blocked charge is a deferred debt, not a saving.

### Ledger integration
Cancel writes to three buckets and one label. Nothing else.
- Subscription cancelled -> Avoided — counted when next expected billing date passes with no charge
- Retention discount accepted -> Reduced — counted when first lower charge posts
- Refund obtained on cancellation -> Received — counted when credit appears in transactions
- Trial killed before converting -> Prevented — counted when trial end date passes with no charge (separate label on purpose; nothing was charged so nothing was avoided in the strict sense)

Monthly display shows the monthly figure with the annual projection clearly labelled as a projection. Never the reverse. Leading with $180 when $15 happened is the lie every competitor tells.

Reversals subtract. A subscription that reappears removes its Avoided entry and the card returns to the queue.

## Hard nevers
1. Never cancel, or claim to cancel, on the user's behalf
2. Never use stored merchant credentials, ever, under any framing
3. Never count a cancellation before the billing date passes
4. Never state that a user does not use something — ask
5. Never show a cancel card for insurance or utilities
6. Never show a cancel card for a subscription marked shared
7. Never recommend cancelling when the termination fee exceeds the remaining cost
8. Never lead with an annualised figure
9. Never count a card-level block as a saving
10. Never hide a retention offer to make cancelling look easier

## Build order
Days 1-4: Merchant normaliser and alias table — everything downstream depends on clean merchant strings.
Days 5-9: Recurrence detector, deterministic — the core algorithm; also powers Track and Budget.
Days 10-12: Subscription state machine, four states — built before the ledger so nothing can be miscounted.
Days 13-16: Cancel card and the queue entry — the user can now see what to act on.
Days 17-22: Cancel-path library, top 50 merchants — the asset; seeded by user frequency.
Days 23-26: Confirmation watcher on billing dates — the rule that makes the ledger honest.
Days 27-30: Message drafter — model work, on top of what code already found.
Days 31-35: Retention offers and trap warnings — the real differentiator.
Days 36-40: Trial detection and the Prevented label — highest value per line of code, but needs the state machine first.
Days 41+: Contract arithmetic, app-store handling, shared accounts — edge cases, in order of user frequency.
Note that the cancel-path library comes after the card. Ship with generic merchant support links and an honest "I don't have the exact steps for this one yet," then fill the library from real usage.

## Honest limits
Upmore cannot cancel anything. Every competitor implies they can. Being straightforward about this is a marketing disadvantage and a trust advantage, and the trade is worth making only if the rest of the product is honest too.
Cancel does not retain users. Someone cancels three subscriptions in week one and then has nothing to cancel. Rocket Money expanded into bills, budgeting and net worth for exactly this reason. Cancel is an acquisition feature; the claim and deadline sides are what bring people back.
Detection needs history. A user who connects an account with 30 days of data sees a fraction of their subscriptions. Say so at setup rather than letting them conclude the app is bad at its job.
The path library decays. Merchants change flows deliberately. Budget for permanent maintenance, not a one-time build, and treat last_verified_at as a first-class product surface rather than an internal field.
The honest number is smaller. Counting only confirmed cancellations means Upmore's headline will always trail competitors who count clicks. That gap is the product.
