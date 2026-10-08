# Upmore — 200 Test Capabilities

Every capability is phrased as a real user request, Ring-style. Each has a
concrete definition of done: the agent must do the job end-to-end, not just
talk about it. A capability is only "complete" when a real run works —
connector live, data flowing, job done, receipt kept.

Tracks: **A.** Trading execution & portfolio (1–50) · **B.** Copy trading +
pre-IPO/IPO (51–100) · **C.** Subscriptions, bills, settlements, CFO
(101–150) · **D.** Connections, alerts, approvals, earn routes (151–200)

---

## A. Trading execution & portfolio (1–50)

1. "Buy $500 of VOO" — Done: exact order proposed, user approves, order submitted to Alpaca paper, fill reconciled into trade_orders with a receipt.
2. "Sell half my AAPL" — Done: current position quantity fetched, sell order for exactly half placed and filled, remaining half confirmed in holdings.
3. "Buy 10 shares of NVDA but not above $190" — Done: limit buy at $190 placed (day/GTC per user), fill or live open-order status reported with receipt.
4. "Put a stop-loss on my TSLA 8% below the current price" — Done: live quote fetched, stop price computed, stop order placed and confirmed with the trigger price stated back.
5. "Buy SPY if it drops to $640, otherwise do nothing" — Done: conditional order placed at the trigger, and if never triggered the agent shows the untouched order rather than silently dropping it.
6. "Buy $200 of MSFT at the open tomorrow" — Done: market-on-open order queued before the bell, fill reconciled after open with execution price reported.
7. "Sell everything if the S&P 500 drops 5% today" — Done: index level monitored, all positions liquidated only if the trigger hits, otherwise end-of-day report confirms nothing was sold and why.
8. "Cancel all my open orders" — Done: every open order canceled via the broker API, each cancellation confirmed by order ID, zero left open.
9. "Change my NVDA limit order from $190 to $185" — Done: original order canceled and replaced, new order confirmed live, old order verified dead.
10. "What's the status of my AMD order?" — Done: live order state reported (open / partially filled with filled qty / filled with avg price / canceled) straight from the broker.
11. "Buy 1 share of Berkshire Hathaway" — Done: agent flags BRK.A (~$700k) vs BRK.B (~$450), refuses to guess, executes only the confirmed class after the user picks.
12. "Buy $100 of Google" — Done: agent disambiguates GOOGL vs GOOG, explains the one-line difference, buys the confirmed class.
13. "Buy $100 of Square" — Done: agent resolves the Square→Block rename (SQ→XYZ ticker change), confirms the user means Block Inc, then executes.
14. "Sell my entire position in XYZ" — Done: agent checks holdings first, reports no XYZ position exists, places no order, suggests verifying the ticker.
15. "Buy $10,000 of VOO" (with $2,000 buying power) — Done: order blocked before submission, buying power shown, agent offers the max affordable amount instead.
16. "Buy $500 of VOO" (sent twice by accident) — Done: duplicate detected within the idempotency window, one order placed, the second request acknowledged as a dupe with no double-fill.
17. "Buy $500 of VOO" then "actually make it $300" before approving — Done: pending proposal updated to $300, only one order ever submitted, audit trail shows the revision.
18. "Buy that stock I asked about yesterday" — Done: agent resolves the ticker from conversation history, states it back for confirmation, executes only after the user confirms.
19. "Buy the dip on NVDA" — Done: agent defines concrete terms (e.g., 5% drop trigger, dollar amount) and gets explicit confirmation before placing any conditional order.
20. "Sell all my losers" — Done: positions below cost basis listed with dollar losses, user confirms the set, sells execute with per-position receipts.
21. "Buy $1,000 of QQQ with a 5% trailing stop" — Done: bracket order with trailing-stop leg placed, both legs confirmed live with their trigger levels.
22. "If AAPL hits $250, sell half and move the stop up on the rest" — Done: multi-leg conditional set up as supported by the broker, or the agent states plainly which leg can't be automated and sets the closest achievable version.
23. "Buy TSLA only if volume is above average" — Done: agent admits volume-conditional orders aren't supported, offers the nearest honest alternative (price alert + manual approval) instead of faking it.
24. "Buy $200 of AMD right now" (at 9pm CT) — Done: agent notes the market is closed, offers an extended-hours limit order or queues it for the open, executes per the user's choice.
25. "Sell my SPY before the Fed announcement at 2pm" — Done: order placed with the timing constraint, fill confirmed before the event or the miss explained with the order's actual state.
26. "What's my portfolio up today" — Done: holdings synced, today's P&L in dollars and percent with per-position breakdown, snapshot stored.
27. "How am I doing this month vs the S&P 500" — Done: portfolio return vs SPY over the same period computed from snapshots, methodology stated, no cherry-picked dates.
28. "Which of my holdings is dragging me down the most" — Done: positions ranked by dollar contribution to losses, facts only, no advice on what to do about them.
29. "What's my total return since I started" — Done: return computed since the first snapshot with deposits accounted for, not inflated by contributions.
30. "Show me my allocation by sector" — Done: holdings mapped to sectors with percentage weights, biggest overweights named as facts.
31. "Rebalance me back to 80/20 stocks and bonds" — Done: drift computed from the latest snapshot, exact trades (symbol, side, amount) proposed, each approved, fills reconciled.
32. "Fix my drift but don't sell anything at a loss" — Done: rebalance plan built under the no-realized-loss constraint, or the agent shows the conflict and proposes the closest valid plan.
33. "Alert me when any position drifts more than 5% from target" — Done: drift rule stored, evaluated on each sync, alert delivered with the exact breach when triggered.
34. "How much did I earn in dividends this year" — Done: dividend events summed year-to-date from corporate-action data with a per-holding breakdown.
35. "Turn on dividend reinvestment for my VOO" — Done: DRIP preference recorded, and the agent states honestly whether the broker supports it or falls back to cash.
36. "When is my next dividend payment" — Done: upcoming ex-dates and pay dates for current holdings listed from dividend calendar data.
37. "What's my yield on cost for JNJ" — Done: annual dividends divided by actual cost basis computed from trade records.
38. "NVDA did a stock split — did my shares update correctly" — Done: holdings re-synced post-split, share count and cost basis verified against the split ratio, confirmation shown.
39. "One of my holdings got acquired — what happened to my shares" — Done: merger terms explained, cash/stock consideration reflected in holdings, corporate-action receipt recorded.
40. "My ticker changed — is my position okay" — Done: old ticker mapped to new, position confirmed intact with the same cost basis, records updated.
41. "Flag any wash sales in my account" — Done: sells at a loss with repurchase inside 30 days identified from trade history, each flagged with dates.
42. "Show me tax-loss harvesting opportunities" — Done: underwater positions listed with harvestable loss amounts as facts only, wash-sale conflicts noted, no recommendation made.
43. "What did I pay in realized gains this year" — Done: realized gains and losses summed from fills, split short-term vs long-term.
44. "Is VOO or VTI cheaper to hold" — Done: expense ratios, structure, and tracking compared from official fund pages with sources cited, no pick recommended.
45. "Compare QQQ and VUG for me" — Done: side-by-side facts (expense ratio, top-holdings overlap, sector weights) with sources, no recommendation.
46. "What's the P/E of my portfolio" — Done: weighted-average P/E computed from current holdings data, methodology stated.
47. "When does AAPL report earnings" — Done: next earnings date pulled from calendar data, with an offer to set a reminder.
48. "Am I at risk of a pattern day trade violation" — Done: day-trade count checked against the PDT rule, remaining trades reported, explicit warning if close to the limit.
49. "How much idle cash is sitting in my account" — Done: cash balance reported live, sweep and money-market options listed as facts without steering.
50. "What's my buying power right now" — Done: live buying power (and day-trading buying power where applicable) reported straight from the broker.

---

## B. Copy trading + pre-IPO/IPO (51–100)

51. "Copy Pelosi's trades with $500" — Done: copy_follows row created (Pelosi Tracker, $500 allocation, default caps), user confirms the follow terms.
52. "Follow Buffett's 13F portfolio but cap any single position at 10%" — Done: follow created with max_position_pct=10, agent restates the cap back before confirming.
53. "Put $200 on the Burry tracker with a 15% stop-loss" — Done: follow created with stop_loss_pct=15, stop-loss semantics confirmed in chat.
54. "Pause my Pelosi follow" — Done: follow status set to paused, no new mirror orders proposed while paused, existing positions untouched.
55. "Resume the Pelosi follow" — Done: follow reactivated, agent summarizes any leader trades missed during the pause and asks before catching up.
56. "Stop copying Tuberville and sell everything it bought me" — Done: follow removed, unwind orders proposed for each mirrored position, each approval-gated, audit trail complete.
57. "Stop copying Ackman but keep what I already bought" — Done: follow removed with positions retained, agent confirms holdings list stays intact.
58. "How is my Pelosi tracker doing vs the Buffett one?" — Done: side-by-side performance from perf_cache with dates, both leaders' return figures stated plainly.
59. "Which of my leaders is doing best this quarter?" — Done: ranked list of followed leaders by cached performance, with as-of dates.
60. "Show me everything I'm copying right now" — Done: full list of active follows with allocation, caps, stop-loss, and current value each.
61. "Pelosi bought NVDA — mirror it for me" — Done: agent states the filing date and lag ("disclosed X, filed Y, ~N weeks old"), proposes exact mirror order, waits for approval.
62. "Is this Pelosi trade fresh or stale?" — Done: agent answers with the exact filing date and age in weeks, never implying real-time edge.
63. "Berkshire's 13F just dropped — what changed?" — Done: agent diffs new top-15 vs previous, lists added/dropped/increased positions with filing date.
64. "Copy the new Berkshire 13F top 15" — Done: follow created or rebalanced proposal listing all 15 positions with weights, approval-gated per order.
65. "Buffett sold half his Apple — do the same for my mirror" — Done: agent verifies against the 13F filing, states the lag, proposes the proportional sell, approval-gated.
66. "Crenshaw and Tuberville both bought the same stock — what do I do?" — Done: agent flags the overlap, shows both filings with dates, proposes ONE combined mirror order (no double-buy), approval-gated.
67. "Pelosi bought X but Buffett sold X — who do I follow?" — Done: agent surfaces the conflict with both filings and dates, states it takes no side, asks which leader's signal to act on.
68. "Only mirror Pelosi's buys over $1M" — Done: filter stored on the follow (min notional), smaller disclosed trades skipped and logged as skipped with reason.
69. "Don't mirror any of Burry's sells, only buys" — Done: direction filter on the follow, sells logged as skipped, buys proposed normally.
70. "What's the total I'm risking across all my copy follows?" — Done: summed allocation across active follows with per-leader breakdown.
71. "Move $300 from my Ackman follow to my Buffett follow" — Done: Ackman allocation reduced, Buffett allocation increased, both rows updated, agent confirms new split.
72. "Set a 20% trailing stop on my whole Pelosi sleeve" — Done: stop-loss updated on the follow, agent explains trigger mechanics in plain words.
73. "Add a new leader: track AOC's disclosures" — Done: user-supplied leader added to copy_leaders as manual/disclosure source, follow created only after user confirms terms.
74. "Add Cathie Wood's ARK as a leader" — Done: agent explains ARK publishes daily holdings (fresher than 13F), adds leader with source noted, follow created on confirmation.
75. "Remove the Powell tracker, I don't want it" — Done: leader unfollowed; agent confirms whether mirrored positions stay or unwind before acting.
76. "Why did you buy this stock for me last month?" — Done: agent traces the mirrored position back to the exact leader, filing, and approved trade_orders row.
77. "Show me every trade you mirrored from Pelosi" — Done: full history from trade_orders filtered by leader, with dates, amounts, and fill status.
78. "How stale is the data behind my 13F leaders right now?" — Done: agent reports days-since-filing per 13F leader and states plainly the data is 6–10 weeks old.
79. "Alert me the day a new Pelosi disclosure drops" — Done: alert preference stored, agent explains it fires on filing publication not trade date.
80. "Get me into the Oura IPO" — Done: agent shows price range $40–44, venue (Coinbase IPO Access), window status, and exact steps in the Coinbase app; ipo_requests row created.
81. "Request 10 Oura shares at the IPO price" — Done: agent lays out max cost, allocation uncertainty, and flipping-ban risk; user confirms exact terms; request tracked in ipo_requests.
82. "Remind me when the Oura IPO window opens" — Done: watch registered on the offering, agent confirms what the alert will say and when.
83. "What happens if I flip Oura shares on day one?" — Done: agent states the ~30-day flipping risk and ~60-day IPO ban plainly before any request proceeds.
84. "Am I guaranteed Oura shares if I request?" — Done: agent says no — allocations are subject to demand and may be partial or zero, never implying certainty.
85. "Any other IPOs I can get into right now?" — Done: agent lists offerings with status=open from ipo_offerings with verified facts only, or says none honestly.
86. "When is the Anthropic IPO?" — Done: agent answers from verified data (targeting late-2026, unconfirmed), states no shares exist yet, no date invented.
87. "Can I buy OpenAI stock before the IPO?" — Done: agent says no public shares exist, warns unauthorized SPV/tokenized transfers are voided by the company, offers the wait-for-IPO path.
88. "Someone's selling me OpenAI pre-IPO tokens — legit?" — Done: agent flags it as invalid per OpenAI's voided-transfer policy and advises against it.
89. "Give me pre-IPO AI exposure I can buy today" — Done: agent presents DXYZ with the full caveat math (NAV premium, volatility, ~2.5% fees) before any buy discussion.
90. "Is DXYZ actually worth its price?" — Done: agent shows the premium-to-NAV math with current figures and states plainly what the premium costs the buyer.
91. "Buy $100 of DXYZ as my pre-IPO AI sleeve" — Done: treated as a normal user-directed stock order — exact terms proposed, approval-gated, paper first.
92. "Track OpenAI's IPO for me and alert me at S-1" — Done: watch registered on the OpenAI ipo_offerings row, agent confirms trigger (public S-1 filing).
93. "What's the difference between Oura's IPO and buying DXYZ?" — Done: agent contrasts directly (real shares at offer price vs fund with premium/fees) in plain words.
94. "Put $150/month into whatever Pelosi buys" — Done: agent explains copy follows don't take recurring amounts — creates the follow with $150 initial allocation and states the difference.
95. "Cap my total copy-trading risk at $1,000 across all leaders" — Done: portfolio-level cap stored and enforced — new follows or allocations that breach it are blocked with an explanation.
96. "My Pelosi follow hit its stop-loss — what happened?" — Done: agent shows which position triggered, the loss amount, and whether the sleeve paused or continues per settings.
97. "Compare copying Pelosi vs just buying the S&P 500" — Done: agent compares cached tracker performance vs SPY over the same period with dates, no cherry-picking.
98. "Which leader has the freshest data right now?" — Done: agent ranks followed leaders by days-since-last-signal and names the freshest source.
99. "Unfollow everyone and give me a final report" — Done: all follows removed (positions handled per prior choice), closing statement with per-leader P&L delivered.
100. "If Anthropic IPOs tomorrow, walk me through exactly what I'd do" — Done: agent gives the full dry-run sequence (alert, facts, Coinbase app steps, request terms, allocation and flipping risks) without inventing a window.

---

## C. Subscriptions, bills, settlements, CFO (101–150)

101. "Cancel my Netflix" — Done: agent identifies the exact plan and billing channel, walks through the real cancellation steps with the official link, and confirms only what the user confirms — never claims it cancelled something itself.
102. "Find every subscription I'm paying for" — Done: full audit listing each subscription with amount, billing cycle, next renewal date, and total monthly/annualized spend.
103. "I started a free trial yesterday — am I going to get charged?" — Done: agent finds the trial end date, states the exact charge date and amount, and offers to set a reminder two days before it converts.
104. "Am I paying for two subscriptions that do the same thing?" — Done: flags overlapping services (e.g., two music streamers), shows combined cost, and recommends which to keep with the math.
105. "Should I switch Adobe from monthly to annual billing?" — Done: annual-vs-monthly math with the user's real plan price, break-even month, and the catch (annual paid monthly still locks you in).
106. "My gym membership went up and nobody told me" — Done: shows old vs new price, when the increase hit, and lays out options — accept, downgrade, negotiate, or guided cancel.
107. "Split my Spotify family plan with my roommates" — Done: per-person cost math, who pays the account holder, and a reminder setup so the split actually gets collected each month.
108. "I haven't been to the gym in 4 months" — Done: waste calculation (months × fee = $X burned), plus pause-vs-cancel-vs-downgrade options with the real savings of each.
109. "Pause my subscription instead of canceling it" — Done: states whether that merchant actually offers pausing, how long, what happens to billing, and the exact steps — no invented pause buttons.
110. "Which subscriptions renew this week?" — Done: list of renewals in the next 7 days with amounts and a one-line action per item (keep / review / cancel).
111. "I think Hulu charged me twice" — Done: pulls the two charges, confirms whether they're duplicates or different billing events, and gives the dispute path if it's a real double-charge.
112. "Get my internet bill lowered" — Done: delivers a ready-to-use negotiation script (account details to have on hand, competitor prices to cite, retention-department path) — the user makes the call, the agent preps it.
113. "My subscription is billed through Apple, not the app — how do I cancel?" — Done: routes correctly to iPhone Settings > Apple ID > Subscriptions path instead of the merchant's website, with exact taps.
114. "Downgrade instead of cancel — is it worth it?" — Done: side-by-side of current vs downgraded plan (price, lost features, annual savings) so the decision is a number, not a vibe.
115. "You have $16 due Friday — want me to pay it?" — Done: proactive reminder names the biller, exact amount, and due date, then waits for explicit approval — nothing moves on a suggestion alone.
116. "What bills are due this week?" — Done: dated list of every bill due in 7 days with amounts and running total, flagged by priority.
117. "Three bills hit the same day and I don't have enough in checking" — Done: ranks them by shutoff risk, late fees, and credit impact, proposes a payment order, and warns plainly about the shortfall before anything is approved.
118. "Will paying this overdraw my account?" — Done: checks the bill amount against the known balance, says yes/no with the projected remaining balance, and refuses to propose the payment if it overdrafts.
119. "My electric bill doubled — is that normal?" — Done: compares to the last 3 bills, flags rate change vs usage spike vs estimated reading, and tells the user which one it is.
120. "Set up autopay for my utilities" — Done: per-bill confirmation of amount type (fixed vs variable), payment source, and first debit date — set up one bill at a time with the user's explicit yes each time.
121. "I missed my credit card payment by two days" — Done: states the late fee, whether the grace period still protects interest, and gives a call script to request a first-time fee waiver.
122. "I'm short this month — which bill do I pay first?" — Done: ordered list by consequence (housing, utilities shutoff, credit reporting, fees), never by balance size alone.
123. "My landlord charged a late fee but I paid on time" — Done: assembles the payment timestamp evidence and a dispute message the user can send — the agent doesn't contact the landlord.
124. "Is my water bill estimated or an actual reading?" — Done: identifies estimated vs actual from the bill, and if estimated, tells the user how to submit a real reading to correct it.
125. "Compare my electric bill to the same month last year" — Done: year-over-year kWh and dollar comparison with the variance explained (rate vs usage).
126. "Can I pay rent with my credit card for the points?" — Done: convenience-fee math vs rewards value with the user's real numbers — shows when it wins and when it's a loss.
127. "Am I eligible for the pork price-fixing settlement?" — Done: asks the one targeted question needed (purchase window and state), matches against the settlement's class definition, and states eligibility as likely/not-likely — never guaranteed.
128. "I lived in Illinois in 2022 and used the Neutrogena Skin360 app" — Done: matches the Illinois BIPA criteria (residency + app use in the class period), explains what proof the claim needs, and links the official claim page.
129. "I got a data breach notice from FinWise Bank" — Done: confirms the breach matches the settlement in the directory, lists what the class covers, and lays out the filing options with the official URL.
130. "The deadline already passed — can I still file?" — Done: checks the actual deadline, says plainly if it's closed, and explains late-claim reality (usually rejected) instead of offering false hope.
131. "I don't have receipts for the pork I bought" — Done: states whether the settlement allows attestation without proof, what the attestation cap is, and warns that signing under penalty of perjury means telling the truth.
132. "How much will I actually get from the Apple Siri settlement?" — Done: gives the per-device cap, explains pro-rata dilution if claims exceed the fund, and refuses to promise a dollar figure.
133. "I was near the SPS Technologies fire — does that count?" — Done: matches the user's situation against the class geography and exposure criteria, asks the one clarifying question if ambiguous, and links the official notice.
134. "I got a red-light camera ticket in Suffolk County" — Done: checks ticket date against the class period, explains which fees are covered, and what documentation the claim requires.
135. "I watched TED videos while logged into Facebook" — Done: matches against the TED Video Privacy criteria (Facebook account + video views in the period), explains the VPPA basis in plain terms, and links the claim page.
136. "Just file the claim for me" — Done: declines to file, explains why (it's a legal attestation under penalty of perjury), and instead walks the user to the official form with each field explained.
137. "I already filed a claim — when do I get paid?" — Done: states the honest timeline (final approval, appeals, administration — typically months), and what triggers would change it.
138. "Do I need proof or can I just say I bought it?" — Done: states the settlement's exact proof rule, the attestation limit if one exists, and the perjury warning for sworn statements.
139. "I have $4,000 across three cards — avalanche or snowball?" — Done: runs both with the user's real balances, APRs, and minimums — total interest and payoff month for each — and recommends the cheaper one with the numbers shown.
140. "I have $8,000 sitting in checking doing nothing" — Done: proposes a sweep (emergency fund top-up first, then the remainder to the highest-yield account), with exact dollar amounts — and waits for approval before anything moves.
141. "Am I on track for my emergency fund?" — Done: target vs actual with the gap in dollars and months, based on the user's real monthly expenses.
142. "Is my renter's insurance actually enough?" — Done: coverage vs the user's belongings estimate and liability exposure, flags specific gaps (e.g., no replacement-cost rider), with the policy numbers cited.
143. "If I lost my income tomorrow, how long do I last?" — Done: runway in months from liquid cash divided by real monthly burn — one number, no padding.
144. "Close out September for me" — Done: monthly close reconciling income vs spending by category, flagging the three biggest variances vs August.
145. "I'm getting a raise — where should the extra money go?" — Done: allocates the after-tax raise across debt, emergency fund, and investing in priority order with the dollar split.
146. "Should I do Roth or traditional contributions next year?" — Done: forward-looking comparison using the user's current bracket vs expected retirement bracket — educational framing, no personalized tax advice.
147. "I have a $2,000 medical bill — payment plan or lump sum?" — Done: compares the provider's plan terms (interest, duration) against lump-sum discount offers, with the total cost of each.
148. "My car insurance renews next month — should I shop it?" — Done: benchmarks the current premium against comparable quotes the user can get, with the exact coverage lines to match so it's apples to apples.
149. "Am I saving enough for taxes as a 1099 worker?" — Done: estimates quarterly liability from year-to-date income, compares to what's been set aside, and states the shortfall or surplus in dollars.
150. "Give me the full money picture this month" — Done: one summary — income, spending by category, subscription total, bills paid and upcoming, debt balances with payoff trajectory, cash position, and the single biggest leak to fix.

---

## D. Connections, alerts, approvals, earn routes (151–200)

151. "Connect my Chase checking account" — Done: Chase checking appears under accounts with a live balance, syncing transactions, and a visible last-synced time.
152. "My bank connection expired — reconnect it" — Done: re-auth completes, syncing resumes, and no transactions are duplicated in history.
153. "Why is my balance from yesterday?" — Done: agent spots the stale sync, forces a refresh, and reports the fresh balance with the new timestamp.
154. "Show me every account I have in one place" — Done: one view lists Chase (SimpleFIN) and all Plaid accounts with balances, institution, and account type.
155. "I see the same $48.20 charge twice" — Done: agent proves whether it's a true duplicate or an auth-hold plus posted pair, with both entries shown.
156. "Disconnect my old Wells Fargo account" — Done: account stops syncing, agent states exactly what history is kept vs deleted, and other accounts are unaffected.
157. "Call my Chase checking my spending account" — Done: nickname saved and used in every future summary and alert instead of the raw account name.
158. "My bank connection keeps failing" — Done: agent diagnoses credential vs institution-outage cause, gives the exact fix, and confirms a clean sync.
159. "Connect my brokerage account too" — Done: brokerage appears with holdings and cash, clearly separated from bank cash balances.
160. "Only sync my checking, not my savings" — Done: savings excluded from sync and summaries while checking continues uninterrupted.
161. "My bank app says $2,000 but you show $1,800" — Done: agent reconciles pending vs posted line by line and accounts for the full gap.
162. "Add my second Chase login" — Done: second login's accounts appear alongside the first, labeled so the two logins are distinguishable.
163. "My paycheck hasn't shown up yet" — Done: agent checks pending items and the usual pay pattern, then says exactly when to expect it or what's off.
164. "Alert me if VOO drops 5%" — Done: rule created; a real 5% drop fires exactly one alert naming the price, the threshold, and the time.
165. "Tell me when my checking drops below $500" — Done: alert arms once and fires a single notification on the crossing, not on every later sync.
166. "Warn me about any charge over $200" — Done: a $200+ posted charge triggers an alert with merchant, amount, and account named.
167. "Don't send me alerts after 10pm" — Done: quiet hours saved; an 11pm trigger queues and delivers at 7am with the original timestamp noted.
168. "You pinged me 4 times about the same dip" — Done: agent dedups the trigger so one event equals one alert, verified on the next price move.
169. "Stop treating every alert like an emergency" — Done: urgency tiers applied (info/warning/urgent) and the next alerts arrive with correct severity.
170. "You said my balance was low but also that a deposit landed" — Done: agent resolves the ordering conflict, retracts the stale alert, and reports the true current state.
171. "Snooze my spending alerts for the weekend" — Done: alerts pause Friday through Sunday, auto-resume Monday, and the pause is in the audit log.
172. "Let me know the second my paycheck lands" — Done: the deposit is caught on the next sync and notified with amount, source, and account.
173. "Tell me if I'm ever charged a fee" — Done: a fee transaction fires an alert identifying the fee type, amount, and account.
174. "Send me a money briefing every morning at 7" — Done: the digest arrives at 7am with balances, overnight activity, and anything needing attention.
175. "That alert arrived 3 hours late" — Done: agent traces the delay to sync cadence or delivery, states the fix, and the next alert lands on time.
176. "Stop alerting me about coffee shops" — Done: merchant filter applied; coffee purchases stop triggering while all other alerts keep working.
177. "Alert me if my balance drops 20% in a week" — Done: velocity rule created; a qualifying drop fires one alert with before/after numbers.
178. "Yes, do it" — Done: the one pending approval executes, a receipt is recorded, and no pendings remain.
179. "No, cancel that" — Done: the pending action is rejected, nothing executes, and the rejection is logged with a timestamp.
180. "Did that approval expire?" — Done: agent shows the approval's expiry, what happened to the action, and offers a fresh approval.
181. "What did you do last Tuesday?" — Done: agent returns that day's full action log with a receipt for each entry.
182. "Show me everything you've done this month" — Done: month action log delivered grouped by day, every entry with status and receipt.
183. "Is this email from my bank real?" — Done: agent checks sender, headers, and links, gives a real-or-phish verdict with reasons, never asking for credentials.
184. "I got a text about my account — is it a scam?" — Done: agent triages the message, verdicts it, and gives the exact safe next step.
185. "Approve the first one, not the second" — Done: only the chosen pending action executes; the other stays pending, both logged.
186. "Don't do that twice" — Done: idempotency check proves single execution; the audit trail shows exactly one run.
187. "Revoke everything pending right now" — Done: all pending approvals cancelled at once, confirmed with a count and a kill-switch log entry.
188. "Why do you need my approval for this?" — Done: agent states the exact risk (money movement, irreversibility) in one plain sentence.
189. "1" — replying to an approval prompt over iMessage — Done: the numbered text reply approves the matching action, a receipt bubble follows, and the audit trail records the channel.
190. "What's the fastest way to make $100?" — Done: top catalog route returned with exact steps, payout, realistic time, and link.
191. "Combine the 3 fastest $100 routes into one plan" — Done: stacked plan with order, total time, total payout, and no conflicting requirements.
192. "Is this $500/day offer I found legit?" — Done: offer checked against the catalog and scam signals; verdict delivered with evidence.
193. "Track my progress on the bank bonus" — Done: requirement checklist shows done vs remaining steps with the expected payout date.
194. "The route promised $200 but I got $150" — Done: agent compares route terms to the actual payout, names the gap cause, and states the recourse.
195. "Find me something I can do tonight" — Done: routes filtered to start-now and under 3 hours, each with honest payout.
196. "I finished the Chase bonus — what's next?" — Done: completion recorded and the next best route recommended based on remaining eligibility.
197. "Use my gig earnings to fund my auto-invest rule" — Done: earnings totalled from transactions, amount proposed, and nothing moves until the user approves.
198. "Am I spending more than I earn this month?" — Done: income vs spending computed across all connected accounts with the net number and trend.
199. "How much did I spend on food this month vs last month?" — Done: category totals for both months delivered with the difference and top merchants.
200. "Sweep my spare cash to savings whenever my checking tops $2,000" — Done: auto-transfer rule created with the threshold, each sweep approval-gated, audit trail records every run.
