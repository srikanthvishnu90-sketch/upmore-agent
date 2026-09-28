# Product Boundaries & Regulatory Avoidance

**Owner:** Vishnu Srikanth, Founder · **Review:** annually and before any new product line
**Purpose:** Upmore's product rules are compliance controls. Each boundary below exists to keep the company out of a specific licensing regime or liability category. Violating one is treated as a security incident (see 06).

## Boundary 1 — Banking and investments are READ-ONLY. Upmore never moves money.

**The rule:** Upmore never buys, sells, transfers, invests, withdraws, or moves user money. No exceptions, no "just this once" flows.

**Why it exists:** Moving money on users' behalf triggers **state money-transmitter licensing** — 50 separate state regimes, surety bonds, examinations, and Bank Secrecy Act obligations. It is the single biggest legal minefield in fintech. Staying read-only keeps Upmore entirely out of it.

**How it's enforced:**
- Product: connectors (SimpleFIN, Plaid Investments) are read-only products only. "Execute" in the app means an assembled cart, a pre-filled order, or step-by-step guidance — the user performs every final tap in the merchant's own flow. `[IN PLACE]`
- Code: no payment-rail, transfer, trading, or disbursement APIs are integrated or credentialed. Any PR introducing money-movement capability is rejected in self-review. `[IN PLACE]`
- Copy: the app never promises to "pay," "transfer," "invest," or "move" anything for the user. `[IN PLACE]`

## Boundary 2 — Investment information is balanced and non-directional. The user decides.

**The rule:** Upmore may present investment information and recommendations, always framed as balanced pros and cons. Every recommendation shows both sides; Upmore never steers, sways, or pushes the user toward one option. The user makes the final decision. No directives ("you should buy X"), and Upmore never holds itself out as an "investment adviser" / "investment advisor" — the title is the regulatory trigger.

**Why it's worded this way:** Personalized, directional investment advice for compensation is what triggers registration under the **Investment Advisers Act of 1940** (state/federal RIA regimes) — registration, fiduciary duties, examinations. Balanced, non-directional information with pros and cons, where the user decides, sits on the education side of that line. The Founder's decision is to operate on the information side: real recommendations, both sides shown, zero steering.

**Where the line is (stated plainly):** the more personalized and directional a recommendation becomes, the closer it gets to regulated advice. If Upmore ever wants to tell a specific user "you should buy X," that requires RIA registration first. Until then: balanced pros/cons, user decides.

**How it's enforced:**
- Product: Investments X-ray and CFO tools present options with pros and cons side by side; no directional push in copy or prompts. `[IN PLACE]` as design principle; formalize in copy review `[PARTIAL]`.
- Language guardrail: "investment adviser"/"investment advisor" never appear in user-facing surfaces. Positioning stays "the best app at finding you money and showing your money like a CFO." `[IN PLACE]`
- Code/prompt review: agent-chat prompts and route copy are scanned for directional verbs ("you should buy/sell/hold") — banned-phrase checklist `[TO IMPLEMENT]`.

## Boundary 3 — No guaranteed earnings or payouts.

**The rule:** No screen, notification, or message promises a user they will earn, save, or receive a specific amount of money. Projections are labeled as estimates with their assumptions.

**Why it exists:** Guaranteed-return claims invite **FTC Section 5 deception liability** and state UDAP claims, and destroy trust when the guarantee fails.

**How it's enforced:**
- Product: the earn catalog shows verified floors and labeled estimates (e.g., per-person-totals report marks the $5k–$12k first-year figure an *estimate*); the Guide anchors money plans on guaranteed floors, never probable ceilings. `[IN PLACE]`
- Code: no template may contain "guaranteed," "risk-free," or dollar promises without a named source. `[IN PLACE]` via copy review.

## Boundary 4 — No contests, sweepstakes, or lotteries. Ever.

**The rule:** No winner-take-all prize competitions, no drawings, no chance-based payouts in the catalog or product.

**Why it exists:** Chance-based promotions trigger **state sweepstakes/lottery registration, bonding, and disclosure regimes** (plus the lottery exclusion already in catalog policy).

**How it's enforced:** catalog ingestion rejects contest mechanics at the source; standing owner rule documented in repo policy. `[IN PLACE]`

## Boundary 5 — Estimates never masquerade as calculations.

**The rule:** Every number is either traced to source rows/inputs/assumptions or explicitly labeled an estimate. Estimates never wear the clothes of calculations.

**Why it exists:** Same deception-liability family as Boundary 3, and it's the core of user trust: "lead with the answer, then accounting."

**How it's enforced:**
- Product: CFO tools show inputs and assumptions alongside outputs; catalog totals separate verified floors from estimates. `[IN PLACE]`
- Engineering: transaction-pipeline traceability checks (each figure traceable to source rows) are part of QA. `[PARTIAL]` — full pipeline audit `[TO IMPLEMENT]` in the current picture-perfect pass.

## Boundary 6 — No credit-card recommendations; no affiliate steering.

**The rule:** Upmore never recommends credit cards, and when options exist, the cheapest option for the user is shown even when Upmore earns nothing — with any compensation disclosed on the card.

**Why it exists:** Keeps clear of **CARD Act / credit-marketing liability** and affiliate-disclosure (FTC Endorsement Guides) exposure; removes the incentive to steer.

**How it's enforced:** catalog policy + card UI disclosure standard. `[IN PLACE]`

## Boundary 7 — Tax and insurance guidance is information, not licensed advice.

**The rule:** Tax positioning is forward-looking information (W-4 accuracy, credits left on the table, quarterly-estimate awareness) — Upmore does not file taxes and does not act as a tax preparer. Insurance adequacy is educational, not brokerage.

**Why it exists:** Avoids **IRS Circular 230 preparer obligations** and state insurance-producer licensing.

**How it's enforced:** in-app copy frames these tools as informational with "talk to a licensed professional for your situation" guidance. `[IN PLACE]`

## Change control

Adding any feature that touches money movement, personalized advice, guarantees, chance, credit, or licensed professions requires a written regulatory check by the Founder *before* build. The default answer is no. `[IN PLACE]` as procedure.
