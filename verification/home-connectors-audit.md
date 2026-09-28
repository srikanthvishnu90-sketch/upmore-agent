# Upmore Home Page, Connectors & Widgets Audit
**Date:** 2026-09-27  
**Auditor:** Subagent (harsh mode)  
**Standard:** "Very very very simple" + "truly works brilliantly" + competitive parity

---

## Executive Summary

The home page has **10 distinct sections/widgets**, which is too many for "very very very simple." The Connect Bank flow is **broken** — the button opens an empty sheet with unpopulated placeholders. There is **no user-facing SimpleFIN setup flow** at all. The 8 CFO tools are the strongest asset (genuine competitive edge), but they're buried below 4 other sections. Privacy posture is solid. Competitive parity is real on 7/11 dimensions, but 4 gaps remain.

**Critical fixes needed:** 3  
**High-priority simplicity fixes:** 5  
**Competitive gaps:** 4

---

## 1. HOME PAGE SIMPLICITY AUDIT

### Section-by-section (in display order)

| # | Section | Simplicity (1-5) | Issues |
|---|---------|-------------------|--------|
| 1 | Header (brand + avatar) | 5/5 | Clean. No issues. |
| 2 | Greeting + tagline + "Customize home" | 3/5 | "Your money queue — biggest score first" is jargon. "Biggest score" of what? User doesn't know. "Customize home" button adds cognitive load before value is established. |
| 3 | Track strip (free cash / days to payday / left to spend) | 4/5 | Good concept, but hidden by default. Three metrics at once is borderline. "Left to spend / day" is useful. |
| 4 | Safe to Spend (total, daily pace, buffer) | 3/5 | **Overlaps with Track strip.** Both show "safe to spend" concepts. User sees two different "safe" numbers — confusing. Buffer "Change" button is good. |
| 5 | Budget report button | 4/5 | Clear purpose. Good description. |
| 6 | Investments button | 4/5 | Clear. "Read-only X-ray" is honest. |
| 7 | Net worth button | 4/5 | Clear. Standard. |
| 8 | Connect bank card | 2/5 | **BROKEN.** Button opens empty sheet. "Takes 30 seconds" is false — there's no flow. "Read-only" is good. |
| 9 | "Find money you're owed" + Unclaimed money | 4/5 | Clear. Good. |
| 10 | "Your money, like a CFO sees it" (8 tools) | 3/5 | **Too many tools at once.** 8 cards is overwhelming. "Like a CFO sees it" is jargon for non-finance users. The tools themselves are excellent, but the presentation is a wall. |

### Simplicity Verdict: 3.2/5 average

**The home page is NOT "very very very simple."** It's a dashboard with 10 sections. A new user sees:
- A greeting they don't understand ("biggest score first")
- A customize button they don't need yet
- Two overlapping "safe to spend" widgets
- Three separate finance buttons (Budget, Investments, Net worth)
- A broken Connect Bank card
- An unclaimed money section
- Eight CFO tools

**That's 15+ interactive elements on first load.** For "very very very simple," the home page should show **3 things max** on first load: (1) Connect bank OR your money status, (2) One clear next action, (3) The CFO tools (collapsed or prioritized).

### Specific Simplicity Fixes

1. **Merge Track strip + Safe to Spend.** They show overlapping concepts. One widget: "You can safely spend $X today ($Y/day until payday)." Kill the duplication.

2. **Remove "Customize home" from first view.** Bury it in settings. New users don't customize before they understand.

3. **Fix the tagline.** "Your money queue — biggest score first" → "Here's what to do with your money today." Plain English.

4. **Prioritize CFO tools, don't list all 8.** Show top 3 by dollar impact, with "See all 8" expander. The current wall of 8 is intimidating.

5. **Fix or remove Connect Bank.** Currently broken (see Connectors section). Either implement the flow or remove the card until it's ready.

---

## 2. CONNECTORS INVENTORY

### 2.1 SimpleFIN (Bank Transactions)

**What it connects to:** User's bank accounts (checking, savings, credit cards) via SimpleFIN Bridge protocol.

**What data it pulls:**
- Account balances
- Transaction history (merchant, amount, date, pending status)
- **Does NOT pull:** Holdings/investments (SimpleFIN limitation), bank login credentials (never sees them)

**Connection flow:** **DOES NOT EXIST.**

The "Connect bank" button (`#connectBankBtn`) does this:
```javascript
$("connectBankBtn").onclick = () => {
  show("guide");
  $("connectSheet").hidden = false;
};
```

It opens the Guide tab and shows `#connectSheet`, which contains:
```html
<div id="connGmail"></div>   <!-- NEVER POPULATED -->
<div id="connPlaid"></div>   <!-- NEVER POPULATED -->
```

**These divs appear exactly once in the entire 9,667-line template — the div definitions. No JavaScript ever fills them.** The Connect sheet is an empty shell.

**There is no SimpleFIN setup flow.** No UI for:
- Entering a SimpleFIN setup token
- Selecting a bank
- Authenticating via SimpleFIN Bridge
- Storing the access URL

The memory notes Vishnu connected via a one-time `simplefin-claim` Edge Function, but **there is no user-facing path for any other user to connect.**

**Does it work?** The *data fetching* works (if a connection exists in the Vault, `simplefin-proxy` pulls transactions). But **user onboarding is impossible** — there's no way for a new user to establish the connection.

**Simplicity:** N/A (doesn't exist)  
**Reliability:** Data sync works for existing connections. Staleness detection exists.  
**Safety:** Read-only, credentials never touch Upmore servers. Good.

**Verdict:** 🔴 **CRITICAL — No connection flow exists. The button is a dead end.**

### 2.2 Plaid (Investments)

**What it connects to:** Brokerage and investment accounts via Plaid Investments API.

**What data it pulls:**
- Holdings (positions, securities, quantities)
- Account balances
- **Does NOT pull:** Ability to trade (read-only by design)

**Connection flow:** **FULLY IMPLEMENTED.**
1. User taps "Connect" in Investments screen
2. App calls `plaid` edge function for `link_token`
3. Plaid Link SDK loads (`cdn.plaid.com`)
4. Plaid Link UI opens (bank selection, OAuth)
5. On success, `public_token` exchanged for `access_token` (stored vaulted)
6. Holdings fetched and cached locally

**Does it work?** Code is complete and correct. **BUT:** Requires Vishnu's live Plaid keys (`PLAID_CLIENT_ID` + `PLAID_SECRET`) in Supabase secrets. Per memory (2026-09-26), these are **not installed** — Plaid production approval is pending. The flow will fail until keys are installed.

**Simplicity:** 4/5 — Standard Plaid Link flow, familiar to users.  
**Reliability:** Depends on Plaid API + keys. Code handles errors gracefully.  
**Safety:** Read-only, tokens vaulted, JWT-verified. Good.

**Verdict:** 🟡 **Code complete, blocked on Plaid production keys (Vishnu's action).**

### 2.3 Gmail (Implied)

**What it connects to:** Nothing. The `#connGmail` div is empty and never populated.

**Verdict:** 🔴 **Placeholder only. No implementation.**

### Connector Summary

| Connector | Purpose | Flow Exists? | Works? | Blocker |
|-----------|---------|--------------|--------|---------|
| SimpleFIN | Bank transactions | ❌ No | Data sync yes, onboarding no | No user-facing setup flow |
| Plaid | Investment holdings | ✅ Yes | ❌ Blocked | Needs live API keys (Vishnu) |
| Gmail | Unknown | ❌ No | ❌ No | Empty placeholder |

**Only 1 of 3 connectors has a working flow, and it's blocked on external keys.**

---

## 3. WIDGET COMPETITIVE COMPARISON

### 3.1 Debt Payoff Plan

**Upmore:** Avalanche/snowball simulator with APR, minimums, 0% promo handling, refinance comparison. Priced to the dollar. Manual entry.

**Competitors:**
- **Monarch:** Debt payoff calculator with snowball/avalanche, timeline, extra payment simulator. [Source: monarch.com/calculators/debt-payoff-calculator]
- **YNAB:** Loan planner built into budget, burndown chart, real-time "what if" with extra payments. Fused with account data. [Source: ynab.com/features/debt-management]
- **Rocket Money:** Debt paydown (Premium only). Basic.
- **Credit Karma:** Debt payoff calculator, score simulator showing impact of paydown.
- **Empower:** Debt paydown tool showing balances and monthly progress.

**Verdict:** ✅ **PARITY+.** Upmore's 0% promo cliff warning and refinance-vs-paydown comparison are unique. YNAB's integration with live budget is smoother (1-click vs manual entry), but Upmore's math is more detailed.

### 3.2 Idle Cash Check

**Upmore:** Calculates cost of excess checking balance per year, suggests high-yield alternatives.

**Competitors:**
- **Monarch:** No dedicated idle cash tool.
- **YNAB:** No.
- **Rocket Money:** Smart Savings (auto-transfer to FDIC account) — different approach (automation vs analysis).
- **Credit Karma:** High-yield savings account (via MVB Bank) — product, not analysis.
- **Empower:** No.

**Verdict:** ✅ **EDGE.** No competitor has a dedicated "what your idle cash costs you" calculator. This is unique to Upmore.

### 3.3 Tax Positioning

**Upmore:** Forward-looking: W-4 accuracy, credits left on table, quarterly estimates for gig work, HSA/retirement timing. 2026 IRS figures. NOT filing.

**Competitors:**
- **Monarch:** No tax planning.
- **YNAB:** No.
- **Rocket Money:** No.
- **Credit Karma:** **Free tax filing** (via Cash App Taxes). Actual filing, not just planning. [Source: creditkarma.com]
- **Empower:** Tax optimization for advisory clients ($1M+). Not self-serve.

**Verdict:** ⚠️ **PARTIAL.** Upmore's forward-looking positioning is unique, but Credit Karma offers **actual free filing** which is more valuable to most users. Upmore doesn't file. For "nobody should win," Upmore needs to either (a) integrate filing, or (b) make the positioning so good it obviates filing help. Currently (b) is not achieved.

### 3.4 Coverage Check (Insurance)

**Upmore:** Assesses if user has adequate coverage, tells them if they're fine.

**Competitors:**
- **Monarch:** No.
- **YNAB:** No.
- **Rocket Money:** No.
- **Credit Karma:** Insurance marketplace (recommendations, not adequacy analysis).
- **Empower:** Insurance guidance for advisory clients.

**Verdict:** ✅ **EDGE.** No competitor has a dedicated insurance adequacy checker. Unique.

### 3.5 Runway

**Upmore:** "If income stopped today: how many weeks you have." Emergency fund calculator.

**Competitors:**
- **Monarch:** No dedicated runway tool (net worth + budgeting covers it indirectly).
- **YNAB:** "Age of money" metric — similar concept (how long money sits before spent).
- **Rocket Money:** No.
- **Credit Karma:** No.
- **Empower:** Retirement planner (long-term, not short-term runway).

**Verdict:** ✅ **EDGE.** Explicit "weeks of survival" framing is unique and more urgent than YNAB's "age of money."

### 3.6 Monthly Close

**Upmore:** 90-second monthly review: in, out, changed, coming.

**Competitors:**
- **Monarch:** Monthly reports, spending trends, cash flow. More detailed.
- **YNAB:** Monthly rollover, detailed reports.
- **Rocket Money:** Spending insights with trends.
- **Credit Karma:** Basic spending tracking.
- **Empower:** Cash flow center with month-over-month comparison.

**Verdict:** ✅ **PARITY.** Upmore's 90-second framing is simpler, but Monarch/YNAB have deeper reports. The simplicity is the edge here.

### 3.7 Income Side

**Upmore:** What role pays, freelance rates, late invoices.

**Competitors:** None have a dedicated income-side tool. This is part of Upmore's "earn" engine.

**Verdict:** ✅ **EDGE.** Unique. Tied to Upmore's core differentiator (finding money).

### 3.8 Credit Factors

**Upmore:** Five factors lenders use, utilization math.

**Competitors:**
- **Monarch:** Credit score tracking (added 2026). Basic.
- **YNAB:** No.
- **Rocket Money:** FICO Score 2 from Experian (Premium). Full report.
- **Credit Karma:** **VantageScore 3.0** from TransUnion + Equifax, weekly updates, score simulator, credit monitoring, dark web scans. **Most comprehensive free offering.** [Source: creditkarma.com]
- **Empower:** No.

**Verdict:** 🔴 **GAP.** Credit Karma dominates with free scores, simulator, and monitoring. Upmore's "five factors" is educational but doesn't provide an actual score. For parity, Upmore needs to either (a) show a real score (via integration), or (b) make the educational content so actionable it compensates. Currently neither.

### Competitive Summary Table

| Widget | Monarch | YNAB | Rocket Money | Credit Karma | Empower | Upmore | Verdict |
|--------|---------|------|--------------|--------------|---------|--------|---------|
| Debt payoff | ✅ Calc | ✅ Planner | ⚠️ Basic | ✅ Calc | ✅ Tool | ✅ Detailed | **PARITY+** |
| Idle cash | ❌ | ❌ | ⚠️ Auto-save | ❌ | ❌ | ✅ Calculator | **EDGE** |
| Tax positioning | ❌ | ❌ | ❌ | ✅ **Filing** | ⚠️ Advisory | ✅ Planning | **GAP** (no filing) |
| Insurance check | ❌ | ❌ | ❌ | ⚠️ Marketplace | ⚠️ Advisory | ✅ Adequacy | **EDGE** |
| Runway | ❌ | ⚠️ Age of $ | ❌ | ❌ | ❌ | ✅ Weeks | **EDGE** |
| Monthly close | ✅ Reports | ✅ Reports | ✅ Insights | ⚠️ Basic | ✅ Cash flow | ✅ 90-sec | **PARITY** |
| Income side | ❌ | ❌ | ❌ | ❌ | ❌ | ✅ Unique | **EDGE** |
| Credit factors | ⚠️ Basic | ❌ | ✅ FICO | ✅ **Vantage** | ❌ | ⚠️ Educational | **GAP** (no score) |

**Score: 4 EDGE, 2 PARITY+, 1 PARITY, 2 GAP**

The 2 gaps (Tax filing, Credit score) are significant. Credit Karma offers both for free.

---

## 4. OUTPUT QUALITY ASSESSMENT

### 4.1 After Connecting Bank (SimpleFIN)

**What user sees:** Track strip (free cash, days to payday, daily spend), Safe to Spend, transaction list with categorization.

**Quality:** The *output* is good — if the user could connect. The transaction categorization has a TODO ("proper categorization"), so categories may be inaccurate. The payday detection and free cash calculation are sophisticated (variable income handling, pending exclusion).

**Brilliance:** 3/5. The math is solid, but the categorization TODO means outputs may be wrong. And the user can't connect in the first place.

### 4.2 After Connecting Investments (Plaid)

**What user sees:** Holdings X-ray: allocation by bucket, concentration flags (≥25%), fee drag in $/year, idle cash nudge, cost basis + gains.

**Quality:** Comprehensive. The fee drag calculator with known-fund table is excellent. Concentration flags are actionable.

**Brilliance:** 4/5. Would be 5/5 if Plaid keys were installed and it worked live. Currently blocked.

### 4.3 CFO Tools Output

**Debt:** Excellent. Avalanche vs snowball priced to dollar, promo cliff warnings, refinance comparison. **Brilliant.**

**Idle cash:** Good. Clear dollar cost per year. Actionable.

**Tax:** Good forward-looking advice, but no filing. **Incomplete vs Credit Karma.**

**Insurance:** Basic. Tells you if you're fine, but depth unclear.

**Runway:** Excellent framing. "X weeks" is visceral and actionable. **Brilliant.**

**Monthly close:** Good 90-second concept. Execution depends on data quality.

**Income:** Tied to earn engine. Good.

**Credit:** Educational, but no actual score. **Incomplete vs Credit Karma.**

---

## 5. PRIVACY & COMPLIANCE AUDIT

### Data Collection

**What Upmore collects (per privacy policy):**
- Name, email (from auth)
- Onboarding answers (state, hours, paycheck status, cash)
- Plan progress, saved items, subscriptions entered manually
- Guide chat messages (sent to Anthropic Claude)
- Payout proof submitted

**What Upmore does NOT collect:**
- Bank logins (SimpleFIN: credentials go to bank, never Upmore)
- Payment details
- Location tracking
- Contacts
- Ad IDs

**Verdict:** ✅ **COMPLIANT.** Minimal collection, clear disclosure, no sale of data, no third-party trackers. The privacy policy (updated 2026-09-26) is plain-English and honest.

### Sensitive Data Handling

- **Bank data:** Read-only via SimpleFIN. Access URL stored in Supabase Vault (not in app code). ✅
- **Investment data:** Plaid tokens vaulted. ✅
- **Chat messages:** Sent to Anthropic for processing. Disclosed in privacy policy. Not used for training (per policy). ✅
- **Local storage:** CFO tool inputs stored in `localStorage` (device-only, not synced). This is fine — it's user-entered data staying on device. ✅

### Apple App Store Compliance (if native app planned)

Current app is web-based (Vercel). If wrapping for App Store:
- **Data collection disclosure:** Must declare in App Privacy labels. Current collection (name, email, financial info) must be disclosed. ✅ Doable.
- **No problematic permissions:** No location, contacts, or tracking requested. ✅
- **Financial data:** Apple requires clear disclosure for financial apps. Privacy policy covers this. ✅
- **No in-app purchase issues:** No IAP currently. If added, must use StoreKit. ⚠️ Future consideration.

**Verdict:** ✅ **No violations. Clean for Apple.**

### Illegal Activity

- No facilitation of fraud, tax evasion, or illegal behavior. The agent refuses these (verified 117/117). ✅
- No unlicensed financial advice (investments are "analysis only," no buy/sell recommendations). ✅
- No money transmission (read-only, user executes). ✅

**Verdict:** ✅ **Clean.**

---

## 6. SPECIFIC FIXES NEEDED

### Critical (Breaks functionality)

1. **Implement SimpleFIN connection flow.** The "Connect bank" button is a dead end. Build:
   - UI for entering SimpleFIN setup token OR
   - SimpleFIN Bridge integration (user selects bank, authenticates)
   - Store access URL in Vault via edge function
   - Without this, the core value prop ("see your money") is unreachable for new users.

2. **Populate or remove Connect sheet placeholders.** `#connGmail` and `#connPlaid` are empty divs. Either implement the connector UI or remove them. An empty sheet is worse than no sheet.

3. **Install Plaid live keys OR hide Investments connect.** The Plaid flow is code-complete but blocked. Until Vishnu installs keys, the "Connect" button in Investments will fail. Either get keys or show "Coming soon" honestly.

### High Priority (Simplicity)

4. **Merge Track strip + Safe to Spend.** Two widgets showing "safe" money is confusing. One widget, one number.

5. **Reduce home page to 3 sections on first load.** Current: 10 sections. Target: (1) Money status OR Connect, (2) Top 3 CFO tools, (3) One clear CTA. Move the rest behind "See more."

6. **Fix tagline jargon.** "Your money queue — biggest score first" → "What to do with your money today."

7. **Remove "Customize home" from first view.** Move to settings.

8. **Cap CFO tools at 3 visible.** Show top 3 by impact, "See all 8" expander. The wall of 8 is overwhelming.

### Competitive (Parity)

9. **Tax: Add filing OR deepen positioning.** Credit Karma offers free filing. Upmore's planning is good but doesn't replace filing. Consider integrating with a filing partner or making the positioning so specific (e.g., "you're leaving $X on the table, here's the exact form") that it compensates.

10. **Credit: Show a real score OR remove.** Educational "five factors" without a score feels incomplete vs Credit Karma's free VantageScore. Options: (a) integrate with a score provider, (b) partner with Credit Karma (link out), or (c) make the utilization calculator so good users don't miss the score. Currently (c) is not achieved.

### Polish

11. **Fix hardcoded `hasLiveBank = false`.** Line 7289: `const hasLiveBank = false; // TODO: true when Plaid/SimpleFIN connected`. This should check actual connection status.

12. **Implement transaction categorization.** Line 7117: `category: "Other", // TODO: proper categorization`. All transactions categorize as "Other" until this is fixed. The output quality depends on it.

---

## 7. FINAL SCORES

| Dimension | Score | Notes |
|-----------|-------|-------|
| Home simplicity | 3.2/5 | Too many sections, jargon, broken connect |
| Connector functionality | 2/5 | 1/3 works (blocked), 2/3 don't exist |
| Output brilliance | 3.5/5 | CFO tools brilliant, bank output good, credit/tax incomplete |
| Competitive parity | 7/11 | 4 edge, 3 parity, 2 gaps, 2 incomplete |
| Privacy compliance | 5/5 | Clean, minimal, honest |
| Apple compliance | 5/5 | No issues for web; ready for native |

**Overall: The CFO tools are genuinely brilliant and unique. The home page is not "very very very simple." The connectors are the weakest link — the core bank connection flow doesn't exist for new users.**

---

## Appendix: Home Page Widget Inventory

1. Header (brand, avatar)
2. Greeting ("Good evening, Friend")
3. Tagline ("Your money queue — biggest score first")
4. Customize home button
5. Track strip (free cash, days to payday, daily spend) [hidden]
6. Safe to Spend (total, pace, buffer) [hidden]
7. Budget report button
8. Investments button
9. Net worth button
10. Connect bank card [hidden, broken]
11. Find money you're owed (Unclaimed money)
12. CFO section header ("Your money, like a CFO sees it")
13. CFO tool: Debt payoff plan
14. CFO tool: Idle cash check
15. CFO tool: Tax positioning
16. CFO tool: Coverage check
17. CFO tool: Runway
18. CFO tool: Monthly close
19. CFO tool: Income side
20. CFO tool: Credit factors

**20 elements. For "very very very simple," target is 5.**
