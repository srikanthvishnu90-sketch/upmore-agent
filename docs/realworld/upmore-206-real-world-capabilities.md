# Upmore - Real-World Capability Set

Every capability below is a **real-world action**, not domain logic. The test is never "did the code handle the input" - it is "did the real world change, and can the agent prove it." Each capability is essentially different from the others: different rails, different counterparties, different proof of completion. The reference examples (invest from a message, copy a congressional portfolio, cancel a subscription end to end, find class actions you qualify for and file the claims) are the depth bar. Everything below is written to that bar.

Build protocol per capability: implement, then prove completion against the real system or a faithful sandbox of it. A capability is done only when its **Done when** evidence exists. Anything needing live credentials goes into Requests to Codex in BUILD-STATUS - but the connector path, the exact API surface or authenticated flow, and the completion check must be fully designed and stubbed so wiring it is mechanical.

---


## Know exactly where my money goes

**C1. Show me exactly where my money went**
Say: "Where did my money go in September?"
Done when: every transaction across every linked account and card is categorized at the merchant level - not "shopping" but "Amazon, 4 orders, $212.40" - with garbled descriptors (APL*ITUNES, AMZN MKTP, SQ *) normalized to their real merchants, and the user can drill from category to merchant to the actual charge, with the receipt attached whenever one exists in the inbox. Every number ties back to the real feeds.
Runs on: transaction feeds across all accounts (aggregator), merchant normalization, inbox receipt matching.

**C2. Daily money briefing**
Say: "Nothing - it arrives every morning."
Done when: a push lands at the user's chosen hour with yesterday's spend, any new recurring charge, current balances, bills due in the next 7 days, and anything unusual - every figure verifiable against real feeds, and every line replyable so the user can act on it ("cancel that", "what's this charge?").
Runs on: transaction feeds, balances, bill recurrence detection, scheduled push.

**C3. Safe-to-spend number**
Say: "How much can I actually spend right now?"
Done when: a single dollar figure computed from the real checking balance minus pending transactions, bills due before the next real payday, scheduled transfers, and the user's buffer - and it updates as real transactions post, not once a day.
Runs on: balances, bill calendar, deposit history.

**C4. Cash-flow forecast**
Say: "Am I going to make it to payday?"
Done when: a day-by-day projected balance to the next payday from real recurring inflows and outflows, flagging the exact day it would go negative and by how much, plus the specific fix (delay bill X two days, move $Y from savings) - executable from the message.
Runs on: recurrence detection on real history, scheduled bills, balances.

**C5. Subscription creep watch**
Say: "Flag anything new or more expensive."
Done when: a monthly diff of recurring merchants computed from real transactions: new subscriptions appear, price increases are caught the first cycle they post (Netflix $15.49 to $17.99, flagged with the delta), each with a one-tap path to the cancel capability. A planted price increase in a sandbox feed gets caught and quantified.
Runs on: recurring-charge detection on real feeds, cancel-flow handoff.

**C6. Category behavior tracker**
Say: "How much am I spending on DoorDash, really?"
Done when: real merchant-level totals for the asked category across every card for trailing 30/90 days, trend versus the prior period, per-order average, and optionally a cap with an alert when crossed. The answer is a number from the feeds, not an estimate.
Runs on: transaction feeds, merchant normalization.

**C7. Duplicate and overlapping charge detector**
Say: "Am I paying for anything twice?"
Done when: same-merchant same-amount charges within hours, double subscriptions (two iCloud plans, Spotify both direct and via App Store), and overlapping services are each reported with the exact transactions; the duplicates the user picks are killed through the cancel or dispute flow and verified dead.
Runs on: transaction feeds, cancel/dispute flows.

**C8. Big-purchase radar**
Say: "Warn me before anything big hits."
Done when: every upcoming large outflow (annual renewals, insurance premiums, tuition, rent) is listed with date and amount from real recurrence detection, and anything over the user's threshold is pushed days ahead so it never lands as a surprise.
Runs on: recurrence detection, scheduled push.

**C9. Can I afford this**
Say: "Can I afford a $1,200 couch?"
Done when: the answer is computed from the real safe-to-spend figure, goal impact (which goal slips and by how long), and recent spend trend - citing the user's actual numbers, never generic budgeting advice.
Runs on: safe-to-spend engine, goals state, transaction feeds.

**C10. Fee audit**
Say: "What did banks and cards charge me this year?"
Done when: every bank fee, ATM fee, foreign transaction fee, and service charge across all accounts over the trailing 12 months is pulled from real statements and totaled in dollars, with the fightable ones handed to the fee-reversal capability.
Runs on: transaction feeds, statement data.

**C11. Tip and junk-fee inflation tracker**
Say: "Are delivery fees getting worse?"
Done when: effective tip percentage and service/delivery fee load per merchant tracked over time from real receipt-level data ("your average DoorDash order now carries 31% in fees, up from 24% in March").
Runs on: receipt-level transaction data, merchant normalization.

**C12. Income reconciliation**
Say: "Did my paycheck land?"
Done when: every real deposit is identified and classified (payroll, side income; transfers-in excluded), and a missing or short paycheck is flagged against its trailing average with the exact delta - before the user notices.
Runs on: deposit detection, pattern baselines.

**C13. Shared-expense ledger**
Say: "Track what my roommate owes me."
Done when: a running per-person ledger from real transactions the user tags, with settle-up requests generated on a real P2P rail and tracked until the money actually arrives - the ledger only clears against received payments.
Runs on: transaction feeds, P2P rail, receipt tracking.

**C14. Weekly spending recap**
Say: "Nothing - it lands every Sunday."
Done when: a weekly push: spend versus average by category, top merchants, biggest single charge, and net cash flow - every number from the real feeds, with drill-down by reply.
Runs on: transaction feeds, scheduled push.

**C15. Statement anomaly watch**
Say: "Tell me the second something looks off."
Done when: any charge above learned thresholds, any first-time merchant above the user's limit, and any international charge is pushed in near-real-time with "was this you?" - a no routes straight into the dispute capability with the case already opened.
Runs on: near-real-time transaction feeds, dispute flow.

**C16. Budgets that actually enforce**
Say: "Cap restaurants at $400 a month."
Done when: real merchant-level tracking against each cap across cards AND P2P (cash-equivalent Venmo spend counts too), alerts at 80% and 100%, and a monthly report of caps versus actuals in dollars - not a pie chart that ignores half the spending.
Runs on: transaction feeds including P2P, scheduled reporting.


## Daily briefings, alerts, and reminders

**C17. Daily stock briefing**
Say: "Nothing - it arrives before the open every trading day."
Done when: a morning push covering the user's actual portfolio: overnight movers with the real reason (earnings, analyst action, macro), premarket gaps on his holdings, today's earnings and ex-dividend dates among holdings, and the day's macro calendar - each claim sourced from live market and news data, never filler. "More on NVDA" by reply gets depth.
Runs on: brokerage holdings read, market data, news feeds, scheduled push.

**C18. Price alerts that fire**
Say: "Tell me if NVDA drops below $110. Alert me if Bitcoin crosses $70k."
Done when: the alert is live against real market data, fires once per condition with the actual price and time, offers the trade action in the same message, and the user can list or kill alerts by text.
Runs on: market data, brokerage handoff.

**C19. Portfolio mover explainer**
Say: "Why is my portfolio down today?"
Done when: contribution analysis from real positions and real price moves, naming the actual positions driving the P&L in dollars and the specific news or macro event behind each - not "markets fell today."
Runs on: holdings, market data, news research.

**C20. Earnings alerts for my holdings**
Say: "Warn me before my stocks report."
Done when: before each holding's earnings: date, consensus, and what moved the stock last quarter; after: beat/miss, the guidance line that matters, and the position's real P&L impact in dollars.
Runs on: holdings, earnings calendar, results data.

**C21. Watchlist briefing**
Say: "Watch ASTS and RKLB for me."
Done when: event-driven updates on named tickers: price, the real recent news, and why it moved - verifiable against market data; the user can add or drop names by text.
Runs on: market data, news research.

**C22. Dividend tracker**
Say: "What did my dividends actually pay me?"
Done when: every dividend across holdings: announced amount, ex-date, payment date, and the amount actually received - verified against the account's real cash activity, with a monthly dividend income total.
Runs on: brokerage cash activity, dividend data.

**C23. Macro calendar reminders**
Say: "Heads up before the Fed decides."
Done when: Fed meetings, CPI, jobs report: a day-before push with what the release has historically done to the user's actual mix of assets, in plain language.
Runs on: macro calendar, holdings context.

**C24. Money reminders that remember context**
Say: "Remind me the Amex annual fee hits in March."
Done when: any dated money reminder fires with the original context attached and an action where one exists ("want me to get a retention offer first?") - and it survives until dismissed, not just one fire-and-forget ping.
Runs on: scheduled wakes, linked capabilities.

**C25. Rate-watch alerts**
Say: "Tell me when 30-year mortgages drop below 6%."
Done when: monitored against real rate sources, the alert fires with the actual best available offer and the named lender or bank offering it - not a generic headline.
Runs on: rate data sources, scheduled checks.

**C26. IPO and lockup calendar**
Say: "Tell me when anything I care about files to go public."
Done when: filings, pricing dates, and lockup expiries for watchlisted names and holdings, pushed with the real dates and terms.
Runs on: IPO/filing data, watchlist.

**C27. Halt and circuit-breaker alerts**
Say: "Wake me if one of my stocks halts."
Done when: if a held stock halts or the market triggers circuit breakers, an immediate push explains what happened and what it means for the actual position.
Runs on: market data, holdings.

**C28. Bill due-date reminders**
Say: "Never let a bill surprise me."
Done when: every bill detected from real recurrence gets a reminder 3 days ahead with the amount, and a missed-payment risk is flagged with the exact consequence (late fee, APR penalty, service cut).
Runs on: recurrence detection, scheduled push.

**C29. Low-balance early warning**
Say: "Warn me before I overdraft, not after."
Done when: a projected negative balance is caught days ahead from real scheduled outflows, pushed with the exact transfer that prevents it - executable with one tap.
Runs on: balances, cash-flow forecast, transfer rails.

**C30. Unusual-deposit alerts**
Say: "Tell me when big money lands."
Done when: any deposit above the learned pattern (tax refund, bonus, reimbursement) is detected, classified, and routed with a suggested next move ("your $3,240 refund landed - sweep to savings?") that executes on yes.
Runs on: deposit detection, sweep capability.


## News, research, and ideas

**C31. Personalized news digest**
Say: "Send me the news that matters to my money."
Done when: a daily digest of financial and economic news filtered to the user's holdings, watchlist, and stated interests - each item with the source, the link, and the specific "so what" for his money. Zero generic headlines that touch nothing he owns.
Runs on: news feeds, holdings/watchlist context, summarization with source URLs.

**C32. What's been going up and why**
Say: "What stocks have been up for 3 months straight, and why?"
Done when: a real screen over the requested universe and window (e.g. S&P 500 names up each of the last 3 months) with quantified performance AND the actual driver for each - earnings beats, guidance raises, a specific contract or catalyst - cited from real reporting or filings, never vibes. "Buy the top 3" routes into the trading capability with the approval gate.
Runs on: market data screen, fundamentals/news research, brokerage handoff.

**C33. Explain this stock**
Say: "Should I care about ASTS?"
Done when: a brief on what the company actually does, how it makes money, valuation versus real peers, the bull and bear case with actual numbers, the latest quarter, and what would change the answer - every claim sourced.
Runs on: fundamentals data, filings, news research.

**C34. Deep-dive research on request**
Say: "Research whether I should buy more Tesla."
Done when: a structured brief: current fundamentals, recent quarters, the analyst spread, real risks, and an explicit statement of what cannot be known - all claims cited to real sources, delivered as something he can act on.
Runs on: fundamentals, filings, analyst data, news research.

**C35. Analyst action alerts**
Say: "Tell me when analysts change their mind on my stocks."
Done when: upgrades, downgrades, and price-target changes on holdings and watchlist names from real analyst data, pushed with the firm, the change, and the stated reasoning.
Runs on: analyst-rating feeds, holdings/watchlist.

**C36. Insider and congressional trade alerts**
Say: "Tell me when insiders trade my stocks."
Done when: Form 4 filings and congressional disclosures touching his holdings or watchlist, pushed with the actual transaction: who, how much, at what price.
Runs on: SEC filing data, congressional disclosure feeds.

**C37. Earnings call takeaways**
Say: "Give me the 5 lines that matter from Apple's call."
Done when: after any holding reports: the lines that matter from the actual call - guidance, margin, capex, one-offs - with the real numbers, not a reworded press release.
Runs on: earnings transcripts, holdings.

**C38. Sector and theme screens**
Say: "Best AI infrastructure plays under $20B market cap?"
Done when: a real screen returning actual candidates with key metrics and risks for each - every candidate a real, verifiable company, and the screen criteria stated so it can be re-run.
Runs on: market/fundamentals screening data.

**C39. Compare two investments**
Say: "VOO versus VTI - just tell me which."
Done when: a real-data comparison - fees, holdings overlap, performance, tax efficiency - ending in a recommendation with the reasoning expressed in dollars for his actual position size.
Runs on: fund data, performance data.

**C40. Portfolio X-ray**
Say: "What do I actually own underneath all my funds?"
Done when: across all accounts: true allocation after looking through every fund, overlapping positions, total expense-ratio drag in dollars per year, and concentration risks - computed from real holdings and real fund composition data.
Runs on: holdings across accounts, fund holdings data.

**C41. What-if scenarios**
Say: "What if I invest $500 a month for 10 years? What if rates drop 1%?"
Done when: quantified answers with stated assumptions, using his real positions or the actual instrument - ranges with the math shown, never false precision.
Runs on: holdings, market data, projection math.

**C42. Crypto digest**
Say: "What's happening with my coins?"
Done when: a daily or weekly brief on his actual coins: moves, regulatory or on-chain events that matter, and news about the venues he actually uses.
Runs on: crypto market data, news research, holdings.

**C43. Dividend ideas screen**
Say: "Find me solid dividend payers I have never owned."
Done when: a real screen with yield, payout ratio, and 5-year dividend growth per candidate, with yield traps explicitly flagged and why.
Runs on: fundamentals screening, dividend data.

**C44. New-listing and spin-off radar**
Say: "Tell me about upcoming IPOs in sectors I care about."
Done when: upcoming IPOs and spin-offs matching his stated interests, pushed with real dates, terms, and the honest risk picture.
Runs on: IPO calendar data, stated interests.

**C45. Hype risk warnings**
Say: "Warn me if one of my stocks goes parabolic."
Done when: if a held position goes viral or vertical, a push with the actual short interest, options activity, and an honest risk read - before the round trip.
Runs on: market data, options/short-interest data, holdings.


## Invest from a message

**C46. Buy a stock or ETF from a text**
Say: "Buy $500 of VOO."
Done when: a real order is placed at the connected brokerage and either fills (fill price, share count, timestamp reported) or is queued with market-hours context; the position appears in the account. Market closed means a confirmed queued order, never silent nothing. Real money: explicit approval of the exact order before submission, always.
Runs on: brokerage API or authenticated brokerage session, approval gate.

**C47. Sell a position from a text**
Say: "Sell half my Apple."
Done when: current holdings are read from the real account, "half" is resolved against the actual share count, the sell executes after explicit approval, and the fill is confirmed with proceeds reported.
Runs on: brokerage API/session, approval gate.

**C48. Automatic investing**
Say: "Put $200 into VTI every payday."
Done when: a recurring investment rule is live at the brokerage (or an agent-managed schedule executes real orders each cycle), the first execution is confirmed with fill details, and the user can pause it with one message.
Runs on: brokerage recurring orders or scheduled execution, payday detection from deposits.

**C49. Rebalance my portfolio**
Say: "Rebalance me back to 80/20."
Done when: current allocation is computed from real holdings, the exact buys and sells to hit target are proposed in dollar amounts, executed after approval, and post-trade allocation is verified from the account.
Runs on: brokerage API, holdings math, approval gate, wash-sale awareness.

**C50. Harvest tax losses**
Say: "Harvest any tax losses before year end."
Done when: positions with unrealized losses are identified from real cost basis, wash-sale windows are checked against actual trade history, non-substantially-identical replacements are proposed, trades execute after approval, and the harvested loss total is reported for taxes.
Runs on: brokerage API with cost basis, trade history, tax-lot logic.

**C51. Buy Treasuries or build a T-bill ladder**
Say: "Put $10k into T-bills, laddered."
Done when: the ladder structure (maturities, amounts) is proposed from live yields, orders are placed at the brokerage after approval, and the resulting positions with maturity dates are confirmed in the account.
Runs on: brokerage API with fixed income, live yield data.

**C52. Copy-trade real investors, trade by trade**
Say: "Copy Nancy Pelosi's trades. Follow this manager on dub."
Done when: the chosen source's disclosed trades (congressional disclosures, 13F filings, or a copy-trading platform's feed) are ingested, matching orders sized to the user's risk cap are proposed per trade, and each executes only after approval - with live P&L of the copy strategy reported against the source.
Runs on: disclosure feeds / copy-trading platform, brokerage API, per-trade approval gate.

**C53. Clone Nancy Pelosi's disclosed portfolio**
Say: "Copy Nancy Pelosi's whole stock portfolio."
Done when: the actual disclosed holdings are pulled from congressional disclosure records, a replication plan sized to his dollar amount is proposed (including what cannot be replicated - options, private assets), executed after approval, and then kept in sync: each new disclosure produces a drift report and a re-sync proposal. Live performance is tracked against the disclosures.
Runs on: congressional disclosure records, brokerage API, approval gate, drift monitoring.

**C54. Mirror a fund's 13F**
Say: "Mirror Berkshire's portfolio."
Done when: the latest real 13F is parsed, a top-N replication plan with dollar amounts is proposed and executed after approval, and each quarterly filing produces a delta report (added, trimmed, exited) with a re-sync proposal.
Runs on: SEC 13F filings, brokerage API, approval gate.

**C55. Get me into pre-IPO offerings**
Say: "Alert me the second a pre-IPO offering opens and walk me through it."
Done when: IPO Access-style offerings are monitored, the user is alerted inside the offering window, and the agent walks them through the in-app request - the request exists in the provider app and allocation status is tracked to settlement. No API exists for allocation; done means the human step is guided and verified, not faked.
Runs on: offering-window monitoring, provider app (user's tap), allocation tracking.

**C56. Trade from a message with guardrails**
Say: "Buy $200 of Bitcoin. Buy that stock that just dipped."
Done when: ambiguous tickers are resolved against real instruments before any order ("did you mean VOO, Vanguard S&P 500 ETF?"), the exact order with estimated total is approved, it executes at the connected venue, and the fill plus new position are reported. Crypto routes to the crypto venue; equities to the brokerage.
Runs on: market data for resolution, brokerage + crypto venue APIs, approval gate.

**C57. Limit orders with expiry**
Say: "Buy 10 NVDA if it dips to $105, cancel by Friday."
Done when: a resting limit order exists at the real brokerage with the expiry set, the order ID is confirmed, and fill or expiry is reported - killable by text at any point.
Runs on: brokerage order API, scheduled expiry.

**C58. Stop-loss protection**
Say: "Put a stop 15% below on my TSLA."
Done when: the stop order is live at the brokerage with the real parameters confirmed, after the gap risk and trigger mechanics are disclosed in plain language.
Runs on: brokerage order API, disclosure gate.

**C59. Buy-the-dip ladder**
Say: "Deploy $2k into VOO, $500 every 5% drop."
Done when: a ladder of real limit orders is placed and confirmed at the computed levels, each fill is reported as it happens, and unfilled rungs are cancelable by text.
Runs on: brokerage order API, price monitoring.

**C60. DCA into crypto**
Say: "Buy $50 of Bitcoin every Sunday."
Done when: recurring real buys execute on the connected venue, each fill is confirmed with price and amount, and the whole schedule pauses on one message.
Runs on: crypto venue recurring orders or scheduled execution.

**C61. Options income on my shares**
Say: "Sell covered calls on my 200 shares of Apple."
Done when: the exact contract (strike, expiry, premium) is proposed from real quotes with assignment risk explained in dollars, executed after explicit approval, the fill is confirmed, and the position is tracked to expiry or assignment with the outcome reported.
Runs on: options-capable brokerage API, real quotes, approval gate.

**C62. Fractional investing**
Say: "Put $25 into Amazon."
Done when: a fractional order fills at the real brokerage and the position shows the exact fraction and value - no rounding away of his money.
Runs on: brokerage fractional-order support.

**C63. Dividend reinvestment control**
Say: "Reinvest all my dividends."
Done when: DRIP settings are changed at each real account and verified in the account settings, and the first reinvested dividend is confirmed in the transaction history.
Runs on: brokerage account settings, verification reads.

**C64. IRA contribution before the deadline**
Say: "Put $3k in my Roth IRA before the deadline."
Done when: the contribution executes at the real custodian tagged to the correct tax year, the remaining annual limit is tracked against his actual contributions across custodians, and confirmation plus the deadline math are reported.
Runs on: custodian contribution flow, limit tracking.

**C65. Old 401(k) rollover**
Say: "Roll my old Fidelity 401(k) into an IRA."
Done when: the old account is located, a direct rollover is initiated with the real custodians (no accidental taxable distribution), the transfer is tracked until funds land, and the money gets invested per instruction - not left sitting in cash for a year.
Runs on: custodian rollover flows, transfer tracking, reinvestment check.

**C66. 401(k) contribution change**
Say: "Bump my 401(k) to 10%."
Done when: the deferral change is made in the real payroll or benefits portal, verified on the next actual pay stub showing the new percentage, with the employer match capture confirmed in dollars.
Runs on: payroll/benefits portal, pay stub verification.

**C67. ESPP enrollment**
Say: "Sign me up for my company's stock purchase plan."
Done when: enrollment is completed in the real plan at the chosen percentage, the discount mechanics are reported in dollars, and the first purchase is confirmed.
Runs on: equity/benefits portal, purchase confirmation.

**C68. RSU sell plan**
Say: "Sell my RSUs as they vest, keep 25%."
Done when: a standing instruction executes on real vest events, each sale is confirmed with proceeds, and the tax-withholding shortfall is flagged with the real numbers before April surprises him.
Runs on: equity platform, vest event monitoring, brokerage execution.

**C69. 529 contributions**
Say: "Put $200 a month into my daughter's 529."
Done when: recurring real contributions run to the actual plan, each confirmation is captured, and the state tax benefit is noted in dollars where applicable.
Runs on: 529 plan contribution flow, scheduled execution.

**C70. Exit on a schedule**
Say: "Sell 10% of my Palantir every month."
Done when: scheduled real sales execute and are confirmed each cycle, with the remaining position reported - cancelable by text.
Runs on: scheduled brokerage execution.

**C71. Portfolio guardrails**
Say: "Never let one stock pass 20% of my portfolio."
Done when: continuous monitoring of real holdings detects a breach, and a rebalancing plan is proposed in dollars and executed after approval.
Runs on: holdings monitoring, brokerage execution, approval gate.

**C72. Make my cash earn**
Say: "What should my emergency fund be earning? Fix it."
Done when: a real comparison of T-bills, CDs, HYSAs, and money market funds using his actual tax situation, then execution of the chosen route with the new yield confirmed in dollars per year.
Runs on: yield data, brokerage/bank rails.


## Kill wasteful spending

**C73. Cancel a subscription end to end**
Say: "Cancel my Netflix."
Done when: the subscription shows cancelled inside the provider's own account or a cancellation confirmation email/reference exists; the next billing date is gone; any eligible refund was requested. Not done when a draft email exists.
Runs on: authenticated browser session on the provider or its cancellation API/email flow, plus inbox access to catch the confirmation.

**C74. Find every recurring charge and kill the ones I pick**
Say: "What am I paying for every month? Cancel the ones I don't use."
Done when: a complete recurring-charge inventory from real transaction history across every linked account and card (annual charges resurfacing included); each picked cancellation is verified dead per the cancel capability; total monthly savings reported in dollars.
Runs on: bank/card transaction feeds, then per-provider cancellation flows.

**C75. Stop a free trial before it converts**
Say: "I signed up for a Fubo trial last week - don't let it bill me."
Done when: the trial is cancelled or a payment block is in place before the conversion date; proof is the provider showing no upcoming charge or the trial-ended state.
Runs on: trial detection from receipts/inbox, calendar wake, provider cancellation flow.

**C76. Negotiate a bill down**
Say: "My internet bill went up again. Get it back down."
Done when: the provider's account shows a new lower recurring rate or a retention credit, confirmed by the provider (chat transcript, email, or plan page), with the effective date and dollar delta reported.
Runs on: provider support chat/phone flow via authenticated session, account verification.

**C77. Dispute a charge and get the money back**
Say: "There's an $84 charge from some vendor I don't recognize. Fight it."
Done when: a dispute is filed through the bank's real dispute flow, the case number is recorded, provisional credit is tracked, and the final resolution is reported - escalated to chargeback if round one is denied.
Runs on: bank dispute portal, transaction feed, follow-up monitoring.

**C78. Get a refund I'm owed**
Say: "Amazon charged me for a return I sent back. Get my refund."
Done when: the refund case is opened through the merchant's real support flow and the money is confirmed back on the original payment method, with amount and date verified in the transaction feed.
Runs on: merchant support flows, order history, transaction feed verification.

**C79. Reverse a bank fee**
Say: "Chase hit me with a $34 overdraft fee. Get it back."
Done when: the fee is identified on the real statement, a reversal is requested through the bank's real support channel (with the account history that helps), and the credit is confirmed on the account.
Runs on: statement data, bank support channel, credit verification.

**C80. Cancel a gym membership**
Say: "Cancel my gym. They make it impossible."
Done when: the gym's actual contract terms are pulled, the required exit path is executed (certified mail, in-person form, portal - whatever the contract demands), written confirmation exists, and the next draft is verified not taken.
Runs on: contract terms, the gym's real cancellation channel, transaction monitoring.

**C81. Purge app-store subscriptions**
Say: "What am I paying Apple and Google for? Cut the dead ones."
Done when: every App Store and Play billed subscription is enumerated from the real accounts, the ones the user picks are cancelled in the store and verified ended, and refunds are requested where eligible.
Runs on: Apple/Google account subscription pages, verification reads.

**C82. Fight a surprise medical bill**
Say: "The ER sent me a $2,300 bill. This can't be right."
Done when: an itemized bill is requested from the real provider, charges are checked for errors and upcoding, negotiation or a financial-assistance application is filed through the provider's real channel, and the final reduced balance is confirmed in writing.
Runs on: provider billing office flow, itemized bill analysis, written confirmation.

**C83. Shop and switch car insurance**
Say: "My premium went up 30%. Fix it."
Done when: real quotes for identical coverage are pulled from actual insurers, the best is switched to (new policy bound, old policy cancelled), the pro-rated refund is verified, and no coverage gap exists between policies.
Runs on: insurer quote flows, policy binding, cancellation confirmation.

**C84. Claim outage credits**
Say: "My internet was down all weekend. Get me a credit."
Done when: the outage is documented from real outage data and support records, a credit is claimed from the provider, and the amount is confirmed on the next real bill.
Runs on: provider support channel, bill verification.

**C85. Cancel before annual renewal**
Say: "Don't let my domain tools renew for another year."
Done when: annual renewals are detected ahead of the charge, the user's decision is collected, and cancellation is executed and verified before the renewal date - with refund pursuit if the charge beat the cancellation.
Runs on: recurrence detection, provider cancellation flow, transaction monitoring.

**C86. Warranty claim on a broken product**
Say: "My headphones died and they're under warranty."
Done when: the real warranty terms are confirmed from the receipt, a claim is filed through the manufacturer's actual channel, and the RMA, replacement, or refund is confirmed.
Runs on: receipt lookup, manufacturer claim flow, RMA tracking.

**C87. Price-match at purchase**
Say: "This TV is $100 cheaper at Best Buy - get me the match."
Done when: the retailer's real price-match policy is invoked through its support channel with the live competitor listing, and the adjusted price is confirmed on the order or as a credit.
Runs on: retailer support flow, live price evidence.

**C88. Fight hotel and rental-car junk fees**
Say: "They charged a $45/day resort fee I never agreed to."
Done when: the fee is contested under the real booking terms or card benefit, and removal or refund is confirmed in the folio or on the card.
Runs on: booking records, merchant dispute flow, card benefit terms.

**C89. Cancel a storage unit or service contract**
Say: "Get me out of the storage unit contract."
Done when: the contract's exit clause and notice period are found in the actual agreement, the required notice is delivered through the real channel, final charges are verified to stop, and any deposit comes back.
Runs on: contract terms, vendor notice flow, transaction verification.


## Make money that's already mine

**C90. Find class actions I qualify for and file the claims**
Say: "Find any class action settlements I qualify for and claim them."
Done when: eligibility is matched against real evidence (purchase receipts in inbox, location history, account records, product ownership), claims are submitted on the real settlement administrator sites, each claim has a confirmation number, and payouts are tracked until the check or deposit lands.
Runs on: settlement administrator databases, inbox receipt search, claim-form automation, payout tracking.

**C91. Recover unclaimed property in my name**
Say: "Check if any state is holding money for me."
Done when: every relevant state unclaimed-property database is searched under the user's name and prior addresses, found property is claimed through the state's real claim flow, and the claim ID and expected payout timeline are recorded.
Runs on: state escheatment portals, identity verification, claim monitoring.

**C92. Claim flight compensation**
Say: "My flight to London was 5 hours late. Get me the EU261 money."
Done when: eligibility is determined from the actual flight record, the claim is filed with the airline (or regulator where applicable), the claim reference exists, and the payout is tracked to completion - including escalating when the airline stonewalls.
Runs on: flight history from receipts, airline compensation portals, claim tracking.

**C93. Collect price-drop refunds**
Say: "Watch my recent purchases. If the price drops, get me the difference."
Done when: purchases are detected from receipts, current prices are re-checked against the real retailer, eligible price-adjustment or card price-protection claims are filed through the real channel, and refunded dollars are verified in the transaction feed.
Runs on: inbox receipts, retailer price monitoring, retailer/card claim flows.

**C94. Cash in on a product recall**
Say: "Anything I own been recalled?"
Done when: owned products (from receipts and connected accounts) are matched against live CPSC/FDA/NHTSA recall databases, and for each hit the real remedy is claimed - refund, repair, or replacement - with confirmation from the manufacturer or agency.
Runs on: recall databases, receipt/product matching, manufacturer claim flows.

**C95. Maximize credit card rewards**
Say: "Am I using the right card for everything?"
Done when: real spending per category is analyzed, the optimal card per category is identified from his actual wallet, rotating-category activations are completed and verified on each issuer site, and the annual dollar delta is reported.
Runs on: transaction feeds, issuer benefit pages, authenticated issuer sessions.

**C96. Bank account signup bonuses**
Say: "Any banks paying me to open an account?"
Done when: real current offers are matched to his actual direct-deposit pattern, the account is opened, every bonus requirement is tracked against real activity, and the bonus is verified when it posts.
Runs on: offer research, account opening flow, deposit/activity tracking.

**C97. Brokerage transfer bonuses**
Say: "Who's paying to move my portfolio?"
Done when: real transfer offers are compared on his actual holdings, the ACAT transfer executes, and the bonus is verified in the receiving account - including tracking the clawback-holding period.
Runs on: brokerage transfer rails (ACATS), bonus terms, account verification.

**C98. Cash-back portal routing**
Say: "I'm about to buy a $900 laptop - route it for cash back."
Done when: the planned purchase goes through the real best-paying portal or card offer, the tracked cash back is confirmed to actual payout, and the dollar difference versus buying direct is reported.
Runs on: cash-back portals, card offer activation, payout tracking.

**C99. Credit card retention offers**
Say: "My Amex annual fee hits next month. See what they'll offer."
Done when: the issuer's retention channel is contacted before cancellation, any offered credit or points are confirmed on the account, and the fee-versus-benefit math in dollars decides whether to keep or kill the card.
Runs on: issuer retention channel, account verification.

**C100. Referral bonuses chased**
Say: "Track down my pending referral bonuses."
Done when: his actual referral links and pending bonuses across services are enumerated, requirements verified, and missing payouts chased through each company's real support until they post.
Runs on: referral program terms, support flows, account verification.

**C101. Find forgotten 401(k)s and old accounts**
Say: "I had a 401(k) at my first job. Find it."
Done when: prior employers' plans and the National Registry are searched, real balances are located and verified with the plan administrator, and recovery routes into the rollover capability.
Runs on: registry searches, plan administrator contact, rollover handoff.

**C102. Redeem old savings bonds**
Say: "My grandma gave me savings bonds. What are they worth?"
Done when: paper and electronic bonds are checked against real TreasuryDirect records, matured bonds are redeemed into his actual bank account, and the interest (and its tax treatment) is reported in dollars.
Runs on: TreasuryDirect, bank deposit verification.

**C103. File my FSA claims**
Say: "Submit my FSA expenses before I lose the money."
Done when: eligible expenses are found in real transactions and receipts, claims are submitted to the actual FSA administrator, reimbursements are verified, and the use-it-or-lose-it deadline gets a countdown with a spend-down plan.
Runs on: transaction/receipt matching, FSA administrator portal.

**C104. Claim HSA reimbursements**
Say: "I've been paying medical bills out of pocket for years. Reimburse me."
Done when: accumulated qualified receipts are matched from the inbox and transaction history, the reimbursement executes from the real HSA custodian, and the total recovered is reported in dollars.
Runs on: receipt matching, HSA custodian withdrawal flow.

**C105. Rescue expiring points and miles**
Say: "Are any of my points about to expire?"
Done when: balances and expiry dates across real loyalty accounts are tracked, at-risk balances are kept alive with qualifying activity or redeemed before death, and the dollar value saved is reported.
Runs on: loyalty account monitoring, activity/redemption flows.

**C106. Redeem points for max value**
Say: "Use my points for the Japan flights - get me the best deal."
Done when: the real transfer-partner options are priced for the actual trip against the cash fare and cash-out value, the best route executes after approval, and the cents-per-point achieved is reported.
Runs on: transfer partner award search, booking execution, approval gate.

**C107. Consolidate gift cards**
Say: "I have a drawer of gift cards. Deal with them."
Done when: real balances are read from each card, usable ones are consolidated into a spend plan, and unwanted ones are sold through a real exchange with the payout verified.
Runs on: card balance checks, gift-card exchange rails.

**C108. Employer benefits audit**
Say: "Am I leaving money on the table at work?"
Done when: 401(k) match capture, ESPP, legal benefits, gym and commuter stipends, and FSA/HSA options are each checked against the real benefits portal and pay stubs, unclaimed benefits are enrolled, and the dollars captured per year are reported.
Runs on: benefits portal, pay stub analysis, enrollment flows.

**C109. File rebates I'm owed**
Say: "File the rebate for those tires I bought."
Done when: mail-in and online rebates for real purchases are filed with the required proof through the actual rebate channel and tracked until the check or credit arrives.
Runs on: receipt evidence, rebate submission channels, payout tracking.


## Pay rent and household bills

**C110. Pay my rent**
Say: "Pay my rent. Make sure it's never late."
Done when: rent is paid through the actual channel the landlord or property manager uses (portal, Zelle to the verified landlord handle, or check), on or before the due date, with the confirmation captured; the recurring schedule is verified month after month, and a rent receipt is filed every time.
Runs on: property portal or P2P rail, landlord identity verification, receipt capture.

**C111. Split rent with roommates**
Say: "Collect everyone's share and pay the rent."
Done when: each person's share is computed, requests go out on a real P2P rail, received amounts are tracked against the ledger, the full rent reaches the landlord on time, and whoever is short knows exactly what they owe.
Runs on: P2P requests, payment tracking, rent payment rail.

**C112. Negotiate my rent renewal**
Say: "My lease renewal came in $150 higher. Push back."
Done when: real comparable rents for the building and neighborhood are pulled, a counter is delivered through the actual leasing channel with the evidence, and the final signed rent is confirmed - savings reported in dollars per year.
Runs on: rental comps, leasing portal/email channel, lease confirmation.

**C113. Utilities on autopay, but with a pre-charge review**
Say: "Put my utilities on autopay but warn me before big drafts."
Done when: each utility is enrolled in the provider's real autopay, every upcoming draft is pushed 3 days ahead with the amount, spikes versus the seasonal norm are flagged BEFORE the money moves, and a dispute path fires on the user's word.
Runs on: utility portals, draft monitoring, dispute flows.

**C114. Internet and TV plan optimization**
Say: "Get my internet bill to the cheapest plan that fits how I actually use it."
Done when: the current plan and real usage are compared against the provider's actual current offers, the downgrade or switch is executed in the account, and the new monthly price is confirmed on a real bill.
Runs on: provider account, plan data, bill verification.

**C115. Switch cell carriers**
Say: "Move me to a cheaper phone plan without losing my number."
Done when: the cheapest real plan for his actual usage (from real bill data) is selected, the number port is initiated and verified complete on the new carrier, the old plan is confirmed closed, and final bills are checked for junk charges.
Runs on: carrier port process, plan comparison, final bill audit.

**C116. Extra mortgage principal payments**
Say: "Put $500 extra toward principal every month."
Done when: the recurring extra payment runs through the servicer's real payment flow designated to principal - verified applied to principal, not escrow or next month's payment - and the amortization savings are reported in dollars and years.
Runs on: mortgage servicer portal, application-of-payment verification.

**C117. Remove PMI**
Say: "Get PMI off my mortgage."
Done when: real LTV is computed from the actual balance plus current value evidence, the removal request is filed under the servicer's actual policy, and the PMI line is verified gone from the statement.
Runs on: servicer policy and portal, statement verification.

**C118. Handle escrow changes**
Say: "My escrow jumped $200 a month. Why?"
Done when: the escrow analysis is obtained and explained in dollars (tax increase versus insurance increase), any shortage payment is executed or the refund confirmed, and errors are disputed with the servicer in writing.
Runs on: servicer escrow analysis, payment flow, written dispute.

**C119. Appeal my property tax assessment**
Say: "My assessment jumped 20%. Appeal it."
Done when: real comparable assessments are pulled from county records, the appeal is filed through the actual county process before its hard deadline, and the outcome is tracked with the dollar savings per year.
Runs on: county assessor records, appeal filing channel.

**C120. File my homestead exemption**
Say: "Am I getting the homestead exemption? File it if not."
Done when: eligibility is checked against the real county rules, the exemption is filed with the actual county assessor, it is verified on the property record, and annual savings are reported in dollars.
Runs on: county assessor filing flow, property record verification.

**C121. Dispute a water or leak bill**
Say: "My water bill tripled. Fight it."
Done when: abnormal usage is documented from real meter/billing data, a leak adjustment or dispute is filed under the utility's actual policy, and the credit is confirmed on the account.
Runs on: utility billing data, adjustment claim flow.

**C122. Recover my security deposit**
Say: "My landlord is ghosting me on the deposit."
Done when: move-out condition is documented, a demand goes out under the state's real statutory timeline, the deposit or itemized deduction accounting is received and checked, and the escalation path (small claims paperwork, ready to file) is prepared if stonewalled.
Runs on: state landlord-tenant statute, demand delivery, small-claims prep.

**C123. Report my rent to the credit bureaus**
Say: "Make my rent count toward my credit."
Done when: enrollment with a real rent-reporting service is completed, past rent is back-reported where possible, and rent payments are verified appearing on the actual credit report.
Runs on: rent-reporting service, credit report verification.

**C124. HOA dues and violations handled**
Say: "Stay on top of my HOA."
Done when: dues autopay is verified active, violation notices are surfaced from the portal or mail with the cure deadline, and responses are filed through the HOA's real channel before fines accrue.
Runs on: HOA portal/mail monitoring, response flow.

**C125. Cut my energy bill**
Say: "Why is my electric bill so high? Fix the top causes."
Done when: real usage data from the utility is analyzed, the top savings actions are ranked in dollars per year for his actual consumption pattern, and executable ones (rate-plan switch, budget billing) are completed and verified on the next bill.
Runs on: utility usage data, rate plan flows, bill verification.


## Move and optimize money

**C126. Move idle cash to the highest yield**
Say: "My checking has $30k doing nothing. Fix it."
Done when: idle cash is identified from real balances, the best available yield across his actual accounts (or a proposed new one) is selected, the transfer executes, and the new balance plus APY delta in dollars per year is verified in both accounts.
Runs on: bank balances via aggregator, ACH transfer rails or bank session.

**C127. Pay my credit card from the right account**
Say: "Pay off my Chase card."
Done when: the statement balance is read from the real account, the funding account is confirmed, payment is submitted through the issuer's real payment flow, and the payment posts - verified by the updated balance and a confirmation number.
Runs on: issuer payment flow, transaction feed verification.

**C128. Pay a person back**
Say: "Pay Marcus the $60 I owe him for dinner."
Done when: the recipient is resolved to a real payment identity, the payment goes over a real rail (Zelle, Venmo, debit push - whichever his accounts support), and delivery is confirmed - not staged, delivered.
Runs on: P2P rail access through his bank or wallet, recipient resolution, confirmation tracking.

**C129. Deposit a check from a photo**
Say: "Deposit this check - I just texted you the photo."
Done when: check details are extracted and read back for confirmation, the mobile deposit is submitted through the bank's real deposit channel or a guided in-app flow, and the deposit appears as pending or posted in the account.
Runs on: bank mobile-deposit flow, image handling, balance verification.

**C130. Sweep savings automatically**
Say: "Every time my paycheck hits, move 10% to savings."
Done when: paycheck deposits are detected from real history, the sweep rule is live, the first real transfer is verified in both accounts, and the rule pauses on one message.
Runs on: deposit detection, transfer rails, scheduled execution.

**C131. Wire money for a big purchase**
Say: "Wire $25k to the title company for closing."
Done when: wire details are collected through a secure channel (never chat for full account numbers), the wire is submitted through the bank's real wire flow after explicit approval of the exact amount and recipient, and the bank confirmation plus Fed reference number are reported.
Runs on: bank wire portal, secure detail collection, approval gate.

**C132. Build a CD ladder**
Say: "Lock $15k into CDs, laddered."
Done when: real CDs are opened at the chosen terms, the maturity calendar is maintained, and at each maturity the roll-or-move decision is collected and executed with the new rate confirmed.
Runs on: bank CD products, maturity scheduling.

**C133. Open and fund a high-yield savings account**
Say: "Open me a real HYSA and move my savings."
Done when: the account is opened (with guided steps where identity verification needs him), funded by a verified transfer, and the APY confirmed on the account - with the annual dollar gain versus the old account reported.
Runs on: bank account opening flow, transfer verification.

**C134. Send money internationally**
Say: "Send 500 euros to my cousin in Madrid."
Done when: real quotes are compared across rails (Wise-style services versus bank wire) with the actual exchange rate and fees, the best route executes after approval of the exact delivered amount, and delivery is confirmed with the recipient.
Runs on: international transfer rails, rate comparison, delivery confirmation.

**C135. Collect money owed to me**
Say: "Get everyone who owes me to pay up."
Done when: payment requests go out on real rails, polite escalating reminders follow on a schedule, received funds are reconciled against the ledger, and only actual receipts close a debt.
Runs on: P2P requests, reminder scheduling, receipt reconciliation.

**C136. Donate with the match**
Say: "Give $100 to the food bank - and get my employer match."
Done when: the donation executes to the real organization, the receipt lands in the tax folder, and the employer match is submitted through the actual matching portal - verified so the dollars double.
Runs on: donation rails, receipt capture, employer matching portal.

**C137. Kids' allowance automation**
Say: "Send my son $20 every Friday."
Done when: recurring real transfers run to the kid account or card with the controls he sets, and pause or amount changes take one message - each transfer verified.
Runs on: scheduled transfers, kid account/card rails.

**C138. Emergency fund autopilot**
Say: "Build me a 6-month emergency fund."
Done when: the target is computed from his real monthly expenses, monthly transfers execute and are verified, progress is reported in months-of-expenses, and the fund lives in the right vehicle (yield, liquid) per the cash capability.
Runs on: expense analysis, scheduled transfers, yield placement.


## Protect me

**C139. Freeze my credit at all three bureaus**
Say: "Freeze my credit. There was a breach at my doctor's office."
Done when: a freeze is placed and confirmed at Equifax, Experian, AND TransUnion through each bureau's real flow, with each confirmation (and PIN where issued) stored securely. Temporary unfreeze works the same way on request.
Runs on: three separate bureau portals, identity verification, secure PIN storage.

**C140. Dispute an error on my credit report**
Say: "There's a collections account on my report that isn't mine."
Done when: the real report is pulled, the error is documented, a dispute with evidence is filed with the reporting bureau(s) through their real channels, and the 30-day investigation is tracked to a verified correction or escalation.
Runs on: credit report access, bureau dispute portals, deadline tracking.

**C141. Catch fraud the moment it happens**
Say: "Tell me immediately if anything weird hits my accounts."
Done when: every transaction across linked accounts is monitored in near-real-time, suspicious charges are flagged with merchant and amount, "not me" triggers the real dispute flow and a card lock, and the lock is verified active at the issuer.
Runs on: transaction feeds, issuer card controls, dispute flow.

**C142. Lock down after a breach**
Say: "My email was in the Ticketmaster breach. Handle it."
Done when: exposure is checked against real breach data, affected accounts are enumerated from the credential store, passwords are rotated on the real sites (verified by successful re-login), and card replacements are ordered through issuers where payment data was exposed - confirmed by the issuer.
Runs on: breach databases, credential inventory, authenticated site sessions, issuer replacement flows.

**C143. File an auto insurance claim**
Say: "Someone rear-ended me. Start my claim."
Done when: the claim is opened with the real insurer, the claim number recorded, evidence (photos, police report) uploaded, and status tracked with every adjuster request surfaced to the user.
Runs on: insurer claims portal, evidence upload, status monitoring.

**C144. File a home or renters insurance claim**
Say: "My laptop was stolen from my apartment. Claim it."
Done when: the claim is filed under the real policy with a stolen/damaged property inventory assembled from his actual purchase receipts, the deductible math is shown in dollars, and the payout is tracked to deposit.
Runs on: insurer claims flow, receipt-based inventory, payout tracking.

**C145. Lost-wallet protocol**
Say: "I lost my wallet. Lock everything down."
Done when: every real card is locked across issuers within minutes, replacements are ordered with confirmed delivery, recurring charges are migrated to the new card numbers (verified at each merchant), and ID replacement steps are queued.
Runs on: issuer card controls, replacement flows, recurring-charge migration.

**C146. Scam triage**
Say: "Is this text from my bank real?"
Done when: the message is analyzed against real sender data and known scam patterns, links are checked, and the verdict comes with reasoning; if money already moved, the real recovery flow starts immediately - because minutes matter with fraud departments.
Runs on: sender analysis, scam pattern data, bank fraud channels.

**C147. Remove me from data brokers**
Say: "Get my info off those people-search sites."
Done when: his details are found on real data broker and people-search sites, opt-outs are executed per broker through each one's actual process, removal is verified by re-checking, and re-listings are caught on a recurring sweep.
Runs on: broker opt-out flows, verification sweeps.

**C148. Travel insurance claim**
Say: "My trip got cancelled - claim the insurance."
Done when: the real policy terms are applied to the actual disruption, the claim is filed with documentation through the insurer's channel, and the payout is tracked to deposit.
Runs on: policy documents, insurer claims flow.

**C149. Purchase protection claim**
Say: "My new phone shattered and I bought it on my card."
Done when: the real card benefit terms are checked, the claim is filed with the required documentation, and the reimbursement is verified on the card.
Runs on: card benefit terms, claims flow.

**C150. SIM-swap and account-takeover hardening**
Say: "Lock my number and my key accounts down."
Done when: the carrier port-lock or account PIN is set with the real carrier (verified active), email and financial accounts move to app or hardware-key 2FA, and each change is verified by re-login.
Runs on: carrier account security, per-site 2FA settings.

**C151. Identity theft report and recovery**
Say: "Someone opened a card in my name. Fix my identity."
Done when: the FTC IdentityTheft.gov report is filed with the real affidavit, bureau fraud alerts are set, fraudulent accounts are disputed with each issuer, and every removal is verified on the credit reports.
Runs on: FTC reporting flow, bureau alert channels, issuer disputes, report monitoring.

**C152. Virtual cards for risky merchants**
Say: "Give me a burner card for this sketchy site."
Done when: a merchant-locked or single-use number is issued through the real card feature or privacy-card service, the spending limit is set, and the card is killable instantly - verified dead after a kill.
Runs on: issuer virtual card feature or privacy-card service.

**C153. Secure document vault**
Say: "Keep my passport, SSN card, and policies somewhere safe I can pull from."
Done when: identity and policy documents are collected into secure storage with retrieval on demand, and they are never sent over text - access is gated and logged.
Runs on: secure storage, access gating.


## Taxes and paperwork

**C154. Estimate and pay my quarterly taxes**
Say: "Handle my Q3 estimated payment."
Done when: the estimate is computed from real income data, the exact payment is approved, submission goes through IRS Direct Pay (and the state equivalent), and the confirmation number plus posted payment are verified.
Runs on: income data, IRS Direct Pay, state payment portals.

**C155. Build my tax document folder**
Say: "Round up everything my CPA needs."
Done when: every W-2 and 1099 (brokerages, banks, employers) is retrieved from the real source portals, named and organized in one folder, gaps are explicitly listed with where to get each, and the folder is delivered to the CPA.
Runs on: payroll/brokerage/bank portals, document retrieval, drive organization.

**C156. Track deductible expenses as they happen**
Say: "Log that lunch as a business meal."
Done when: the real transaction is matched, categorized with the stated business purpose, stored with the receipt, and the running deductible total exports clean at tax time.
Runs on: transaction feeds, receipt matching, export.

**C157. Mileage log from my actual driving**
Say: "Build my business mileage log."
Done when: drives are classified business or personal from real location history with his confirmation, an IRS-compliant log exports with dates, distances, and purposes, and the deduction is reported in dollars.
Runs on: location history, classification review, log export.

**C158. Charitable receipt roundup**
Say: "Get my donation receipts ready for taxes."
Done when: every real donation is found across transactions and inbox, receipts are collected into the tax folder, and a year-end summary with the deductible total goes to the CPA.
Runs on: transaction/receipt search, document collection.

**C159. Fix my W-4 withholding**
Say: "My refund was $4k - that's an interest-free loan. Fix it."
Done when: the withholding gap is computed from real pay stubs versus actual liability, a corrected W-4 is submitted through the payroll portal, and the change is verified on the next stub - with the monthly paycheck delta in dollars.
Runs on: pay stub analysis, payroll portal.

**C160. Respond to an IRS notice**
Say: "The IRS sent me a letter. What do I do?"
Done when: the notice is explained in plain English, the response is drafted and filed through the real channel before the deadline, and the case is tracked until closed - with escalation to a human professional flagged where the stakes demand it.
Runs on: notice interpretation, IRS response channels, case tracking.

**C161. Set up an IRS payment plan**
Say: "I owe back taxes. Set up a payment plan."
Done when: the installment agreement is applied for through the real IRS flow, the terms are confirmed in dollars and months, and the first payment is verified.
Runs on: IRS payment plan application, payment verification.

**C162. Track my refunds**
Say: "Where's my refund?"
Done when: federal and state refund status is pulled from the real Where's My Refund systems, changes are pushed, and the deposit is detected in his account when it lands.
Runs on: IRS/state refund status systems, deposit detection.

**C163. Crypto tax export**
Say: "Get my crypto taxes sorted."
Done when: every crypto transaction across his venues is exported with cost basis into the format his tax software or CPA uses, missing data is listed honestly, and the gain/loss summary is verified against the 1099s the venues actually issued.
Runs on: exchange exports, cost-basis computation, reconciliation.

**C164. Pay my property tax**
Say: "Pay my property tax before the deadline."
Done when: the bill is pulled from the real county portal, the payment executes before the deadline, and the receipt is captured to the document vault.
Runs on: county tax portal, payment verification.

**C165. Reconcile my 1099 income**
Say: "Make sure my 1099s match what I actually got paid."
Done when: collected 1099s are matched against real deposits, missing or wrong 1099s are flagged with the payer to contact, and the corrected income total is ready for filing.
Runs on: 1099 collection, deposit matching.

**C166. File my FBAR**
Say: "I have a foreign account - handle the reporting."
Done when: if foreign accounts cross the threshold, the FBAR is filed through the real BSA e-filing system before the deadline and the confirmation is stored - with the penalty exposure of skipping it made clear.
Runs on: BSA e-filing, foreign account inventory.


## Debt and big goals

**C167. Run my debt payoff plan**
Say: "I have three cards with balances. Get me out of debt."
Done when: real balances and APRs are pulled from all accounts, the payoff order (avalanche or snowball) is computed, extra payments execute through each issuer's real payment flow as funds allow, and progress is reported in dollars of interest saved against the do-nothing path.
Runs on: account aggregation, issuer payment flows, scheduling.

**C168. Negotiate a lower APR**
Say: "Call my card issuer and get my rate down."
Done when: the retention or hardship negotiation runs through the issuer's real support channel, any new rate or settlement is confirmed in writing, and the tradeoffs (credit impact of settlements) are approved by the user before accepting.
Runs on: issuer support channels, approval gate for concessions.

**C169. Save for a goal with real money movement**
Say: "I want $8k for a Japan trip by next June."
Done when: a goal account or bucket holds real transferred dollars on a schedule sized to the deadline, each transfer is verified, off-track warnings fire early enough to adjust, and the final balance is verified at completion.
Runs on: transfer rails, scheduling, balance verification.

**C170. Execute a balance transfer**
Say: "Move my $6k balance to a 0% card."
Done when: real 0% offers are compared on his actual credit profile, the transfer executes, the old balance is verified at zero, and a payoff schedule is set that retires the debt before the promo expires - with the fee math shown.
Runs on: balance transfer offers, issuer transfer flow, payoff scheduling.

**C171. Optimize my student loans**
Say: "Am I on the right repayment plan? Fix it if not."
Done when: the autopay discount is enrolled (verified on the statement), repayment plans are compared with real math on his actual income, any switch executes through the servicer, and the interest saved is reported in dollars.
Runs on: loan servicer portal, plan comparison math, statement verification.

**C172. Track public service loan forgiveness**
Say: "Keep my PSLF on track."
Done when: qualifying payments are counted from real servicer data, employer certification forms are submitted on schedule through the actual process, and the countdown to forgiveness is maintained with gaps flagged.
Runs on: servicer data, PSLF certification flow.

**C173. Negotiate medical debt**
Say: "This hospital bill is going to collections. Handle it."
Done when: the debt is negotiated to an interest-free plan or a settlement in writing through the provider's real billing channel, payments are scheduled and verified, and charity-care eligibility is checked first.
Runs on: provider billing channel, written agreement, payment verification.

**C174. Untangle my BNPL plans**
Say: "What do I owe across Afterpay, Klarna, all of it?"
Done when: every BNPL plan is enumerated from real accounts and inbox, a payoff order is set by cost and risk, each payoff is verified closed, and stacking into trouble is flagged before it happens.
Runs on: BNPL account/email discovery, payoff execution.

**C175. Pay off my car loan**
Say: "Pay off my car."
Done when: the real payoff quote with per-diem is pulled from the lender, the payment executes, and the lien release is tracked until the title is clear.
Runs on: lender payoff quote flow, lien/title tracking.

**C176. Down-payment fund**
Say: "I want to buy a house in 3 years. Build the fund."
Done when: the target and monthly schedule are computed from real prices in his target area, the fund grows in the right vehicle for the timeline (yield, not stocks for under 3 years), and progress reports in months-to-go.
Runs on: price research, scheduled transfers, yield placement.

**C177. Big-purchase plan**
Say: "I want a $40k car in 18 months. Make it happen."
Done when: the savings schedule plus true-cost math (insurance, tax, fees from real quotes) is built, financing options are compared on real rates near the date, and the purchase executes with the total out-the-door number verified.
Runs on: scheduled savings, real quotes, financing comparison.


## Family and shared money

**C178. Partner money sync**
Say: "Give me and my partner one view of the household money."
Done when: a shared household view tracks agreed categories with the visibility each person actually approved (his private accounts stay private), and a monthly 'how are we doing' lands with real numbers.
Runs on: consent-scoped account sharing, category tracking, scheduled report.

**C179. Kid's first account and card**
Say: "Set up my kid with an account and teach them money."
Done when: a real kid account or card is opened with the controls he sets, allowance automation runs (per the allowance capability), spend alerts arrive, and his savings-match rules execute.
Runs on: kid account/card provider, controls, scheduled transfers.

**C180. Watch an elderly parent's money**
Say: "Watch my mom's accounts for scams."
Done when: with the parent's real authorized access, scam-pattern charges and unusual wires are flagged fast, and large moves require dual approval - set up through the bank's actual view-only or joint-access channels.
Runs on: authorized account access, anomaly detection, bank access controls.

**C181. Family subscription cost-sharing**
Say: "Everyone on my Netflix should chip in."
Done when: family members on shared plans are enumerated, cost-share requests go out on real P2P rails, and receipts are tracked month to month.
Runs on: plan member audit, P2P requests, receipt tracking.

**C182. Coordinate the college fund**
Say: "Grandparents want to contribute to the 529."
Done when: contributions from relatives are routed properly into the real plan with gift-tax awareness, each is confirmed, and the balance and projections are shared with the family in dollars.
Runs on: 529 plan gifting channels, contribution confirmation.

**C183. Pet insurance claim**
Say: "The vet bill was $1,800 - claim it."
Done when: the claim is filed with the real insurer against the actual policy and vet invoice, and the reimbursement is tracked to deposit.
Runs on: pet insurer claims flow, invoice documentation.

**C184. Dependent care FSA**
Say: "Set up and use my dependent care FSA."
Done when: enrollment completes at open enrollment through the real benefits portal, claims are filed with actual provider receipts, and reimbursements are verified - with the annual tax saving in dollars.
Runs on: benefits portal, claims flow, receipt matching.

**C185. Estate basics audit**
Say: "Make sure my family is protected if something happens to me."
Done when: wills, beneficiaries, and transfer-on-death designations are audited across every real account, each gap is listed with exactly where to fix it, and items needing an attorney are referred - never fake legal documents.
Runs on: account beneficiary audits, checklist tracking.


## Cars and travel money

**C186. Lease buyout decision and execution**
Say: "My lease is ending - should I buy it out? Do it if it makes sense."
Done when: the real buyout quote from the lessor is compared against actual market value, financing is arranged at a real rate if he proceeds, and title transfer is tracked to completion.
Runs on: lessor buyout quote, market value data, financing flow.

**C187. Pay or contest tickets**
Say: "I got a parking ticket - deal with it."
Done when: tickets are detected from mail or email, a contest is filed through the real channel where genuine grounds exist, otherwise payment executes through the official portal before penalties double - receipt captured.
Runs on: ticket detection, official payment/contest portals.

**C188. Toll account management**
Say: "Keep my toll account from screwing me."
Done when: the toll account balance and autopay refill are verified, misread or duplicate tolls are disputed with the actual agency, and violation-risk invoices are caught before they escalate.
Runs on: toll agency portal, dispute flow.

**C189. Registration renewal**
Say: "Renew my car registration before it expires."
Done when: the renewal completes through the real DMV portal before expiry, the confirmation is captured, and the new tags are tracked to delivery.
Runs on: DMV portal, renewal verification.

**C190. Flight price tracking and rebook**
Say: "Watch my booked flights - rebook me if the price drops."
Done when: booked trips are monitored against real fares; when the same flight drops, the rebook executes per the airline's actual policy and the credit or refund is confirmed in dollars.
Runs on: fare monitoring, airline rebook flow, credit verification.

**C191. Hotel rate watch**
Say: "Re-shop my hotel bookings for better rates."
Done when: existing refundable bookings are re-shopped against live rates, a cheaper identical rate is rebooked, the old reservation is cancelled and verified, and savings are reported in dollars.
Runs on: rate monitoring, rebooking flow, cancellation verification.

**C192. Airline credit ledger**
Say: "Never let a flight credit expire again."
Done when: every voucher and credit from cancellations is tracked with its real expiry date, redemption is surfaced when he books relevant travel, and balances are verified used or preserved.
Runs on: credit tracking from receipts/accounts, expiry monitoring.

**C193. Foreign transaction fee audit**
Say: "Am I getting fleeced abroad?"
Done when: real international charges are audited for foreign transaction fees and bad conversion (dynamic currency conversion flagged per charge), the right card is steered for the next trip, and misapplied fees are disputed.
Runs on: transaction audit, card benefit terms, dispute flow.

**C194. Trip currency strategy**
Say: "I'm going to Japan - cash, card, or ATM? Set me up."
Done when: a real rate comparison for his destination across cash exchange, card spend, and ATM withdrawal is produced, the chosen setup executes (travel notice set, card ordered, ATM plan), and the fee savings versus his last trip are reported in dollars.
Runs on: exchange rate data, card travel notices, fee math.


## Admin of a financial life

**C195. Update beneficiaries everywhere**
Say: "Add my wife as beneficiary on all my accounts."
Done when: every real account (banks, brokerages, retirement, insurance) is enumerated, the beneficiary update completes in each institution's real flow, and each is verified saved - with a checklist showing every account and its confirmed state.
Runs on: institution portals, account inventory, verification reads.

**C196. Change my direct deposit**
Say: "Split my paycheck - $500 a month to the new savings account."
Done when: the payroll provider's real direct-deposit flow is updated and verified in the payroll account, and the first real paycheck is watched to confirm the split actually happened.
Runs on: payroll portal, deposit monitoring.

**C197. Switch banks without breaking anything**
Say: "Move me from Wells Fargo to the new account I opened."
Done when: every recurring debit and credit on the old account is identified from real history, each moves to the new account with confirmation from each biller, the old account is drained and closed with the bank's closure confirmation, and nothing bounces during the transition.
Runs on: transaction history, biller account flows, bank closure flow, monitoring.

**C198. Renew expiring financial documents**
Say: "My license expires next month and my brokerage needs it."
Done when: the renewal completes through the DMV's real online flow where eligible (appointment booked where not), the receipt exists, and downstream verifications depending on it are unblocked and re-run.
Runs on: DMV portal, calendar tracking, downstream re-verification.

**C199. Close a dormant account safely**
Say: "Close that old Capital One card I never use."
Done when: the credit-utilization impact is computed and disclosed first, closure executes through the issuer's real flow after approval, the account shows closed at the issuer, and the credit report reflects it on the next pull.
Runs on: issuer closure flow, credit impact math, report monitoring.

**C200. Change of address everywhere**
Say: "I moved. Update my address at every financial institution."
Done when: every bank, brokerage, insurer, payroll, and subscription account is updated with confirmation from each, USPS forwarding is set and verified, and straggler mail is traced to whoever still has the old address.
Runs on: institution portals, USPS forwarding, mail monitoring.

**C201. Annual money checkup**
Say: "Once a year, re-underwrite my entire financial life."
Done when: every account, fee, rate, policy, and subscription is reviewed in one report with the dollars at stake per item, and the approved actions execute - the yearly delta in dollars is the scorecard.
Runs on: full account inventory, rate/fee research, execution handoffs.

**C202. Open enrollment picks**
Say: "Pick my benefits for next year."
Done when: real plan documents are compared against his actual usage and medications, elections are submitted in the real benefits portal, confirmation is captured, and the savings versus the default plan are reported in dollars.
Runs on: benefits portal, plan documents, usage analysis.

**C203. Organize my financial documents**
Say: "Get every statement, policy, deed, and title into one place."
Done when: documents are retrieved from the real portals into one organized vault, gaps are listed with where each lives, and anything the CPA, lender, or insurer asks for later is findable in seconds.
Runs on: portal document retrieval, organized storage.

**C204. Employer equity paper chase**
Say: "Keep my equity grants from becoming tax disasters."
Done when: grant documents and vest schedules are tracked from the real equity platform, hard deadlines (83(b)'s 30-day clock) fire loud early warnings, and each filing step is confirmed done.
Runs on: equity platform, deadline tracking, filing verification.

**C205. Freeze my kid's credit**
Say: "Freeze my child's credit before someone abuses it."
Done when: a minor credit freeze is executed with each bureau under their actual minor-freeze process, and every confirmation is stored - checked again at age milestones.
Runs on: bureau minor-freeze processes, confirmation storage.

**C206. Notarization and medallion runs**
Say: "This transfer form needs a medallion stamp - handle it."
Done when: which financial documents need notarization or a medallion signature guarantee is identified, the appointment is booked at a real provider, and a complete checklist (documents, ID, forms) is prepared so one visit finishes it.
Runs on: provider booking, document requirements research.

---

## The bar, restated

Notice that no two capabilities above share a counterparty, a rail, or a proof of completion. Cancelling Netflix (provider account state), filing a class action claim (settlement administrator confirmation number), freezing credit (three separate bureau confirmations), buying VOO (brokerage fill), cloning a congressional portfolio (disclosure records plus drift monitoring), paying rent (landlord portal or P2P delivery confirmation), and claiming EU261 (airline claim reference) are seven different integrations, seven different verification surfaces, seven different failure modes. That is the standard. If two capabilities could be tested with the same mock, one of them is too shallow.

For each capability, Claude Code must deliver: the connector path (exact APIs, authenticated flows, or portal automation), the completion check (what evidence in the real world proves done), the failure modes (what does the user see when the rail fails), and the approval gate (exactly which steps can never run without an explicit yes). Real-money and irreversible steps always gate. Everything reports back in dollars and confirmations, never in "task completed."
