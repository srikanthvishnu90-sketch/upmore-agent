# Upmore Methods 2: Money Owed, Idle Cash, Investing and Side Income

October 11, 2026

## How to read each method card

Each method is one card Upmore can build as a feature. Within a section, methods run from the most money for the time spent to the least. Methods 1 covers bonuses, bets and creative plays.

- **What it is:** the method in one sentence.
- **Real example:** a named, current offer with real numbers and the month it was checked.
- **Payout, effort, odds, how often:** what it pays, how long it takes, what can go wrong, and how often it repeats.
- **How Upmore runs it:** how the agent spots it, what it asks the user to approve, and how it tracks it to payout.
- **What Upmore needs:** the data, partner or licence required.
- **Tag:** [Read] looks and reports, [Ask] acts after one approval, [Rule] repeats an approved action, [Flag] is regulated.

Offers change weekly. Every number was checked in October 2026, and Upmore must re-check the live terms before showing one to a user.

## Money owed to you

Companies, airlines and courts owe people money, and most is lost because nobody files a short claim or checks the refund.

### Credit report settlement with a mailed notice (creative)

**What it is:** Credit bureau settlements send class members a notice with a claim number, and some pay a bonus only if you file.

**Real example:** In Brooks v. Trans Union ($8.31 million), about 21,000 people get $100 automatically. Filing by October 30, 2026 may add about $1,000 (reported). Checked October 2026.

- **Payout:** $100 to about $1,100 per person (reported)
- **Effort:** 10 minutes, one time
- **Odds and risk:** High if you got a notice; no notice usually means you are not in the class.
- **How often:** Once per settlement, a few times a year

**How Upmore runs it:**

1. Scans email for settlement notices with a claim number and PIN, from administrators or credit bureau case names.
2. Shows the notice, the deadline and the extra money for filing, then asks the user to confirm each eligibility fact.
3. Pre-fills the online form, the user signs, and Upmore watches bank and PayPal for the payment.

**What Upmore needs:** Email read access, a settlement database feed, deposit tracking.

**Tag:** [Read] [Flag]

**Source:** [$8.31M Trans Union Settlement Resolves Lawsuit Over Bankruptcy Remarks on Credit Accounts](https://www.classaction.org/news/8.31m-trans-union-settlement-resolves-lawsuit-over-bankruptcy-remarks-on-credit-accounts)

### FTC automatic refund watch (creative)

**What it is:** The FTC sends refunds by check, PayPal or Venmo, and some expire if not accepted in time.

**Real example:** Amazon owes some Prime members up to $200 each from a $1.5 billion fund. Payments run through April 2027 and expire after 60 days. Checked October 2026.

- **Payout:** Up to $200 per eligible Amazon customer
- **Effort:** 2 minutes to accept a payment
- **Odds and risk:** Low effort; the main risk is a payment expiring or a fake refund email.
- **How often:** Per FTC case, several new cases each month

**How Upmore runs it:**

1. Matches the user's past charges, like Prime fees, against the FTC refund list, and watches email for PayPal or Venmo payment notices.
2. Shows the payment, its expiry date and a check that the sender is real, then asks to accept it.
3. Accepts or reminds the user to deposit the check, then confirms the money landed.

**What Upmore needs:** Email and bank read access, the FTC refund list, a PayPal or Venmo link.

**Tag:** [Read]

**Source:** [Amazon Refunds](https://www.ftc.gov/enforcement/refunds/amazon-refunds)

### Cancelled or big-change flight refund

**What it is:** US airlines must refund cash for a cancelled or badly changed flight if you decline the new option.

**Real example:** Under DOT rules, a change over 3 hours domestic or 6 hours international counts. Card refunds are due in 7 business days (checked October 2026).

- **Payout:** The full unused ticket price, including taxes and fees, per trip
- **Effort:** 5 to 15 minutes per trip
- **Odds and risk:** Strong legal right; airlines may push vouchers, so the user must decline them.
- **How often:** Per event

**How Upmore runs it:**

1. Reads airline emails for cancellations or schedule changes and compares old and new times.
2. Tells the user they qualify and asks to request cash instead of a voucher.
3. Sends the request, then checks the card for the refund within 7 business days and drafts a DOT complaint if late.

**What Upmore needs:** Email and card read access, airline contact templates, the DOT complaint form.

**Tag:** [Rule]

**Source:** [Final Rule Requiring Automatic Refunds of Airline Tickets and Ancillary Service Fees](https://www.transportation.gov/briefing-room/biden-harris-administration-announces-final-rule-requiring-automatic-refunds-airline)

### Mortgage escrow surplus check (creative)

**What it is:** When your escrow account holds too much, the servicer must send back any surplus of $50 or more.

**Real example:** Rule 12 CFR 1024.17 requires the refund within 30 days of the yearly analysis. The cushion is capped at one sixth of yearly bills. Checked October 2026.

- **Payout:** $50 or more per year, depending on the home
- **Effort:** 10 minutes per year
- **Odds and risk:** Common after tax or insurance drops; servicers sometimes apply it to payments instead.
- **How often:** Yearly

**How Upmore runs it:**

1. Reads the escrow analysis email and checks for a surplus or a cushion above one sixth.
2. Shows the math and asks to request a check or a lower monthly payment.
3. Sends a written request to the servicer and watches for the deposit within 30 days.

**What Upmore needs:** Email and bank read access, mortgage statements.

**Tag:** [Rule]

**Source:** [12 CFR 1024.17 Escrow accounts](https://www.ecfr.gov/current/title-12/chapter-X/part-1024/subpart-B/section-1024.17)

### Data breach settlement claims

**What it is:** If a company leaked your data, you can often claim flat cash without any receipts.

**Real example:** Lands' End pays an estimated $60 or up to $5,000 for losses by October 22, 2026; Equinox pays $100 by October 23, 2026 (reported, checked October 2026).

- **Payout:** $60 to $100 flat per person, up to $5,000 with documented losses (reported)
- **Effort:** 10 minutes per claim
- **Odds and risk:** Flat payments often shrink if many people file; false loss claims are perjury.
- **How often:** Per breach, many each year

**How Upmore runs it:**

1. Finds "notice of data breach" letters in email and matches them to open settlements.
2. Shows the deadline and both payout options, and asks the user to confirm they got the notice.
3. Files the flat cash claim with the user's signature and tracks the payment.

**What Upmore needs:** Email read access, a settlement database, deposit tracking.

**Tag:** [Read] [Flag]

**Source:** [10 class action settlements you can claim in October 2026](https://topclassactions.com/lawsuit-settlements/lawsuit-news/10-class-action-settlements-you-can-claim-in-october-2026/)

### Home buyer commission settlement

**What it is:** Home buyers who paid real estate commissions can claim from the national realtor settlements.

**Real example:** The NAR settlement of over $120 million pays buyers based on commissions paid. Claims are due October 27, 2026 (reported). Checked October 2026.

- **Payout:** Varies by commission paid (reported)
- **Effort:** 20 to 30 minutes, one time
- **Odds and risk:** Payout size is unknown; you must have bought on an MLS listing in the date window.
- **How often:** Once per home purchase

**How Upmore runs it:**

1. Spots a home purchase from closing documents, mortgage emails or a large down payment.
2. Shows the deadline and asks the user to confirm the purchase date and commission paid.
3. Pre-fills the claim from the closing statement and tracks the payout.

**What Upmore needs:** Email and bank read access, closing documents.

**Tag:** [Ask] [Flag]

**Source:** [10 class action settlements you can claim in October 2026](https://topclassactions.com/lawsuit-settlements/lawsuit-news/10-class-action-settlements-you-can-claim-in-october-2026/)

### Unwanted calls and texts settlements (creative)

**What it is:** Companies that sent robocalls or spam texts often settle, and the payment is per person or per call.

**Real example:** Concora Credit unwanted calls pays $250 to $650 by October 19, 2026; BuyAlerts texts pays $42.16 by February 16, 2027 (reported, checked October 2026).

- **Payout:** About $42 to $650 per person (reported)
- **Effort:** 10 minutes per claim
- **Odds and risk:** You must have received the calls or texts; your phone number decides eligibility.
- **How often:** Per settlement

**How Upmore runs it:**

1. Matches the user's phone number and texts against class definitions and notice emails.
2. Shows the claim and asks the user to confirm they got the calls or texts.
3. Files with the user's signature and tracks the payment.

**What Upmore needs:** Email access, user phone number, settlement database.

**Tag:** [Ask] [Flag]

**Source:** [Open Class Action Settlements](https://www.classaction.org/settlements)

### Product settlements with no receipt needed

**What it is:** Some product settlements pay a set amount per item without proof of purchase.

**Real example:** Apple's $250 million Siri settlement pays $25 to $95 per iPhone 15 Pro or iPhone 16. Buy dates are June 10, 2024 to March 29, 2025. Claim by December 21, 2026 (reported). Checked October 2026.

- **Payout:** $25 to $95 per device (reported)
- **Effort:** 10 minutes per claim
- **Odds and risk:** Payout drops as more people file; claiming items you did not buy is perjury.
- **How often:** Per settlement

**How Upmore runs it:**

1. Finds matching purchases in card data or order emails, like Apple receipts.
2. Shows each matching item and asks the user to confirm they bought it.
3. Fills the form with serial numbers from receipts, the user signs, and Upmore tracks the payment.

**What Upmore needs:** Card and email read access, a settlement database.

**Tag:** [Read] [Flag]

**Source:** [Claim Your Share of Apple's $250 Million Siri Settlement](https://tidbits.com/2026/09/24/claim-your-share-of-apples-250-million-siri-settlement/)

### Delayed checked bag fee refund (creative)

**What it is:** Airlines must refund the checked bag fee if your bag arrives very late and you filed a report.

**Real example:** DOT rules set the limit at 12 hours for domestic flights and 15 to 30 hours for international flights (checked October 2026).

- **Payout:** The bag fee paid, per bag
- **Effort:** 10 minutes per trip
- **Odds and risk:** Fails if no mishandled bag report was filed at the airport.
- **How often:** Per event

**How Upmore runs it:**

1. Reads delayed bag emails and report numbers, and finds the bag fee on the card.
2. Shows the delay time and the fee, and asks to request the refund.
3. Sends the request with the report number and checks the card for the credit.

**What Upmore needs:** Email and card read access.

**Tag:** [Rule]

**Source:** [Final Rule Requiring Automatic Refunds of Airline Tickets and Ancillary Service Fees](https://www.transportation.gov/briefing-room/biden-harris-administration-announces-final-rule-requiring-automatic-refunds-airline)

### ATM surcharge settlement (creative)

**What it is:** Anyone who paid a fee at an independent ATM can claim a share of a Visa and Mastercard settlement.

**Real example:** The $167.5 million non-bank ATM settlement covers fees from October 24, 2007 to August 14, 2026. Claims are due February 10, 2027 (reported). Checked October 2026.

- **Payout:** Varies, split among valid claims (reported)
- **Effort:** 10 minutes, one time
- **Odds and risk:** Almost everyone who used a store or bar ATM qualifies; the share per person is unknown.
- **How often:** Once per person

**How Upmore runs it:**

1. Finds ATM fee lines in bank and card history.
2. Shows the count of fees found and asks the user to confirm they were not reimbursed.
3. Files the claim, the user signs, and Upmore tracks the payout.

**What Upmore needs:** Bank read access, settlement website.

**Tag:** [Read] [Flag]

**Source:** [$167.5M Non-Bank ATM Surcharge Settlement](https://www.classaction.org/news/167.5m-non-bank-atm-surcharge-settlement-resolves-class-action-lawsuit-against-visa-mastercard)

### Paid airline extras you did not get (creative)

**What it is:** Airlines must refund fees for extras they did not provide, like Wi-Fi or a paid seat.

**Real example:** DOT rules name Wi-Fi, seat selection and inflight entertainment, and refunds go back to the original payment method (checked October 2026).

- **Payout:** The fee paid, per item
- **Effort:** 5 minutes per item
- **Odds and risk:** Low money, but the right is clear when the service failed.
- **How often:** Per event

**How Upmore runs it:**

1. Matches paid extras on the card with trip changes, downgrades or Wi-Fi failures the user reports.
2. Asks the user to confirm the extra was not delivered.
3. Sends the refund request and watches for the card credit.

**What Upmore needs:** Card and email read access.

**Tag:** [Ask]

**Source:** [Final Rule Requiring Automatic Refunds of Airline Tickets and Ancillary Service Fees](https://www.transportation.gov/briefing-room/biden-harris-administration-announces-final-rule-requiring-automatic-refunds-airline)

## Unclaimed and forgotten money

Billions sit with states, agencies and old employers in people's names, and a free search and short claim usually get it back.

### State auto-return check watch (creative)

**What it is:** Some states mail unclaimed money to owners automatically, with no claim, after matching state records.

**Real example:** Illinois Money Match sends a letter naming the amount and source. It then mails a check for simple single-owner cash claims. Checked October 2026.

- **Payout:** Whatever the state holds, per account
- **Effort:** 2 minutes to spot and deposit the check
- **Odds and risk:** Only for simple claims; scammers copy these letters, so the sender must be verified.
- **How often:** Per match, rare

**How Upmore runs it:**

1. Reads email and scanned mail for state treasurer letters and confirms the sender is official.
2. Shows the amount and asks the user to deposit or watch for the check.
3. Tracks the deposit and flags any check not cashed before it expires.

**What Upmore needs:** Email access, mail scan upload, bank read access.

**Tag:** [Read]

**Source:** [Money Match](https://www.illinoistreasurer.gov/?p=310)

### State unclaimed property search

**What it is:** States hold old bank accounts, refunds, deposits and uncashed checks until the owner claims them for free.

**Real example:** In 2025 Illinois returned nearly $294 million to almost 545,000 people, an average of $539 per claim (checked October 2026).

- **Payout:** Average $539 per claim in Illinois
- **Effort:** 15 to 30 minutes per claim, one time
- **Odds and risk:** About 1 in 7 people have some; claims need ID and proof of old addresses.
- **How often:** Check yearly, since new property arrives every year

**How Upmore runs it:**

1. Searches every state the user lived in, using name and past addresses from account and email history.
2. Shows each match with the holder name and amount, and asks the user to confirm it is theirs.
3. Pre-fills the state claim, the user signs and uploads ID, and Upmore tracks the check or deposit.

**What Upmore needs:** Address history, state search access or MissingMoney.com, a document upload flow. Taking a cut needs a finder licence in Illinois, capped at 10 percent.

**Tag:** [Read] [Flag]

**Source:** [Treasurer Frerichs Unclaimed Property Day 2026](https://www.illinoistreasurer.gov/wp-content/uploads/2026/01/Treasurer-Frerichs-Unclaimed-Property-Day-2026.pdf)

### Credit balance on a closed card (creative)

**What it is:** If you overpaid or got a refund after closing a card, the issuer must send back credit balances over $1.

**Real example:** Rule 12 CFR 1026.11 requires a refund within 7 business days of a written request. After 6 months, issuers must try to refund it. Checked October 2026.

- **Payout:** The balance owed, any amount over $1, per card
- **Effort:** 5 minutes per card
- **Odds and risk:** Low risk; old balances may already be sent to the state as unclaimed property.
- **How often:** Per event

**How Upmore runs it:**

1. Finds negative balances on card statements, especially after returns or closed accounts.
2. Shows the balance and asks to send a written refund request.
3. Sends the request and checks the bank for the deposit within 7 business days.

**What Upmore needs:** Card statement read access, a letter or secure message template.

**Tag:** [Rule]

**Source:** [12 CFR 1026.11 Treatment of credit balances](https://www.ecfr.gov/current/title-12/chapter-X/part-1026/subpart-B/section-1026.11)

### Reissued uncashed settlement payments (creative)

**What it is:** When people miss a refund check, some programs resend it by Zelle or another method.

**Real example:** In 2026 the FTC's AT&T round sends Zelle payments to former customers. These people never cashed a check or accepted PayPal. Checked October 2026.

- **Payout:** The original refund amount, per person
- **Effort:** 2 minutes
- **Odds and risk:** Real but rare; fake refund messages are common, so the agent must verify the source.
- **How often:** Per program

**How Upmore runs it:**

1. Watches for Zelle or PayPal deposits with settlement notes, and old uncashed settlement checks in email.
2. Shows the payment and its source, and asks the user to accept it.
3. Confirms the deposit and marks the claim closed.

**What Upmore needs:** Bank and email read access, the FTC refund list.

**Tag:** [Read]

**Source:** [AT&T Data Throttling Refunds](https://www.ftc.gov/enforcement/refunds/att-data-throttling-refunds)

### Lost 401(k) and pension search

**What it is:** A free Labor Department database lists private employer and union plans tied to your Social Security number.

**Real example:** DOL Retirement Savings Lost and Found needs an ID-proofed Login.gov account and lists plan administrators to contact (checked October 2026).

- **Payout:** Whatever is left in the old plan, per plan
- **Effort:** 1 to 2 hours, one time
- **Odds and risk:** A listing only proves you were in the plan; the money may already be paid out.
- **How often:** Once, then after each job change

**How Upmore runs it:**

1. Builds a job history from W-2s, payroll deposits and old employer emails.
2. Asks the user to search the database through their own Login.gov account.
3. Drafts letters to each plan administrator and tracks replies and rollovers.

**What Upmore needs:** Payroll history, the user's own Login.gov session, letter templates. Rollovers move money and need care.

**Tag:** [Ask] [Flag]

**Source:** [Retirement Savings Lost and Found](https://lostandfound.dol.gov/)

### Old savings bonds through state unclaimed property (creative)

**What it is:** Matured US savings bonds stop earning interest, and their records now go to state unclaimed property programs.

**Real example:** About 80 million matured bonds worth about $29.7 billion are unclaimed. Treasury Hunt shut down on September 30, 2025 (reported, July 2026). Checked October 2026.

- **Payout:** Bond face value plus earned interest, per bond (reported)
- **Effort:** 30 to 60 minutes, one time
- **Odds and risk:** Most likely for people given bonds as kids; proof of ownership can be hard.
- **How often:** Once per person

**How Upmore runs it:**

1. Asks if the user or family got paper bonds, and searches state records via MissingMoney.com.
2. Shows any match and asks the user to start the claim.
3. Guides the claim with the state and tracks the payment.

**What Upmore needs:** MissingMoney.com or state search access, user answers.

**Tag:** [Ask]

**Source:** [The US Treasury is holding approximately $29.7 billion in matured US Savings bonds](https://www.fox29.com/news/us-treasury-holding-billions-uncashed-matured-us-savings-bonds)

### FHA mortgage insurance refund (creative)

**What it is:** Some FHA borrowers who paid an upfront premium can get part of it back after paying off the loan early.

**Real example:** HUD refunds use Form HUD-27050-B; loans endorsed on or after December 8, 2004 qualify only through an FHA refinance within three years (checked October 2026).

- **Payout:** Part of the upfront premium, per loan
- **Effort:** 30 to 60 minutes, one time
- **Odds and risk:** Narrow rules; tracers may contact you, and HUD says report suspicious ones.
- **How often:** Once per FHA loan

**How Upmore runs it:**

1. Finds FHA loans, case numbers and payoff dates in mortgage emails and statements.
2. Checks the date rules and asks the user to apply.
3. Fills HUD-27050-B, the user signs and notarizes if over $2,000, and Upmore follows up after 120 days.

**What Upmore needs:** Mortgage documents, ID upload, HUD case number.

**Tag:** [Read] [Flag]

**Source:** [FHA Homeowners Fact Sheet on Refunds](https://www.hud.gov/hud-partners/housing-fha-fact-sheet)

### Refund for a tax year you never filed

**What it is:** If you had tax withheld but skipped filing, you have about three years to file and get the refund.

**Real example:** For 2022, about 1.3 million people left about $1.2 billion unclaimed. The median was $686, and the deadline was April 15, 2026 (reported). Checked October 2026.

- **Payout:** Median $686 per year missed (reported)
- **Effort:** 1 to 3 hours per year
- **Odds and risk:** The 2022 window closed, so 2023 is next. Refunds can be held or used for debts like child support.
- **How often:** Per missed year

**How Upmore runs it:**

1. Spots withheld pay from payroll deposits or W-2 emails with no filed return in that year.
2. Shows the likely refund and the deadline, and asks to prepare the return.
3. Pulls a wage transcript, prepares the return for the user to sign and file, and tracks the refund.

**What Upmore needs:** Payroll data, IRS transcript access, a tax filing partner.

**Tag:** [Read] [Flag]

**Source:** [IRS Owes 1.3 Million Americans About $686 Each](https://www.cpapracticeadvisor.com/2026/03/23/irs-owes-1-3-million-americans-about-686-each-deadline-to-claim-is-near/180074/)

### Amended return for missed credits

**What it is:** If you overpaid tax, you can file Form 1040-X to get the extra back.

**Real example:** The IRS allows 3 years after filing or 2 years after paying, whichever is later. Form 1040-X can be e-filed. Checked October 2026.

- **Payout:** The overpaid amount, per return
- **Effort:** 1 to 3 hours per return
- **Odds and risk:** Errors can trigger IRS letters; a tax pro should review.
- **How often:** Per tax year

**How Upmore runs it:**

1. Compares spending, like tuition or childcare, with credits claimed on past returns.
2. Shows likely missed credits and asks to prepare an amended return.
3. Prepares 1040-X for the user to sign and file, then tracks it with Where's My Amended Return.

**What Upmore needs:** Past returns, bank data, a tax filing partner.

**Tag:** [Ask] [Flag]

**Source:** [File an amended return](https://www.irs.gov/filing/file-an-amended-return)

### Failed bank deposits (creative)

**What it is:** Money left at a failed bank goes through the FDIC and then to the state if nobody claims it.

**Real example:** The FDIC says federal law sends unclaimed failed-bank deposits to the state after 18 months (checked October 2026).

- **Payout:** The old account balance, per account
- **Effort:** 30 minutes, one time
- **Odds and risk:** Rare; anyone asking for an upfront fee is a red flag.
- **How often:** Once per failed bank

**How Upmore runs it:**

1. Matches old bank names in email and statements against FDIC failed bank lists.
2. Shows the match and asks to search FDIC and state records.
3. Starts the claim and tracks it to payment.

**What Upmore needs:** Email and statement history, FDIC and state search access.

**Tag:** [Read]

**Source:** [FDIC Consumer News](https://www.fdic.gov/resources/consumers/consumer-news/2020-12.html)

### Leftover FSA money before it expires (creative)

**What it is:** Health FSA money can be lost at year end, so leftover funds should be spent or claimed in time.

**Real example:** For 2025 the health FSA limit was $3,300, and plans that allow carryover can roll up to $660 (checked October 2026).

- **Payout:** The leftover balance, up to the full yearly amount
- **Effort:** 15 to 30 minutes per year
- **Odds and risk:** Rules differ by employer plan; missed claim deadlines lose the money.
- **How often:** Yearly

**How Upmore runs it:**

1. Reads FSA balance emails and finds medical costs paid by card that were never claimed.
2. Shows the balance, the deadline and the unclaimed receipts, and asks to submit them.
3. Submits claims through the FSA portal and tracks the reimbursement.

**What Upmore needs:** Email and card access, FSA administrator login or upload.

**Tag:** [Read] [Flag]

**Source:** [Publication 969](https://www.irs.gov/publications/p969)

## Making idle cash earn more

Cash sitting in checking or a low-rate sweep can earn about 4% today with little effort, but rates change and only bank deposits carry FDIC cover.

### Fix the brokerage cash sweep (creative)

**What it is:** Move uninvested brokerage cash out of a low default sweep into a higher-paying cash option.

**Real example:** Schwab's default sweep paid about 0.45% (reported, July 31, 2026), while Public paid 3.30% APY (page modified July 22, 2026). On $10,000 that gap is about $285 a year.

- **Payout:** $100 to $600 a year per $10,000 of idle brokerage cash
- **Effort:** 10 minutes one-time
- **Odds and risk:** Low risk. Sweep rates can drop at any time. Money market funds used as sweeps are not FDIC insured.
- **How often:** Once per account, then check yearly

**How Upmore runs it:**

1. Reads cash balances and the sweep vehicle in each linked brokerage, then compares the yield to current options.
2. Shows the yearly dollar gap and the best option, with its insurance status, and asks to switch.
3. Moves the cash or changes the sweep setting, then logs monthly interest to confirm the higher rate.

**What Upmore needs:** Brokerage APIs for Robinhood, Public and others, a rate feed, and broker-dealer or RIA partner review.

**Tag:** [Ask] [Flag]

**Source:** [Investormint: Vanguard vs. Schwab vs. Fidelity HYSA 2026](https://investormint.com/product-strategy/vanguard-vs-schwab-vs-fidelity-hysa-2026)

### Sweep extra checking into high-yield savings on a rule

**What it is:** Keep enough in checking for upcoming bills and move the rest to a high-yield savings account automatically.

**Real example:** Peak Bank paid 4.27% APY on October 6, 2026, versus a 0.65% national average. Moving $10,000 earns about $362 more a year.

- **Payout:** $150 to $1,000 a year per $10,000 moved
- **Effort:** 20 minutes one-time setup
- **Odds and risk:** Very low risk if the bank is FDIC insured. The main risk is overdraft if the buffer is set too low.
- **How often:** Weekly or monthly rule

**How Upmore runs it:**

1. Reads checking balances and recurring bills, then finds the amount above 30 to 45 days of bills.
2. Proposes a rule with a buffer amount and a target account, and asks the user to approve it.
3. Runs the transfer on each payday, pulls money back before big bills, and reports interest earned monthly.

**What Upmore needs:** Bank aggregation API, ACH transfer rails, and a high-yield savings partner or link.

**Tag:** [Rule] [Flag]

**Source:** [Bankrate: Best high-yield savings accounts](https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/)

### Buy I bonds before the rate resets (creative)

**What it is:** Buy inflation-linked US savings bonds before a new six-month rate takes effect.

**Real example:** I bonds issued May 1 to October 31, 2026 pay 4.26% composite with a 0.90% fixed rate. A $10,000 buy earns about $213 in the first six months.

- **Payout:** $100 to $450 a year per $10,000, depending on future inflation
- **Effort:** 30 minutes one-time to open TreasuryDirect and buy
- **Odds and risk:** No loss of principal. Money is locked for 12 months. Selling before 5 years costs the last 3 months of interest.
- **How often:** Yearly, up to $10,000 per person (reported)

**How Upmore runs it:**

1. Reads savings balances and flags cash not needed for at least 12 months, near each May 1 and November 1 reset.
2. Shows the current rate, the lock-up, and the penalty, and asks if the user wants to buy.
3. Guides the user through TreasuryDirect, then tracks the bond value and the 5-year penalty-free date.

**What Upmore needs:** Calendar of Treasury rate dates, savings balances, and a manual guide since TreasuryDirect has no public API.

**Tag:** [Ask]

**Source:** [I bonds interest rates](https://savingsbonds.gov/savings-bonds/i-bonds/i-bonds-interest-rates/)

### Watch for promo rates ending (creative)

**What it is:** Track teaser savings rates and minimum rules, then move money when a promo ends.

**Real example:** CIT Bank showed 4.25% APY on October 6, 2026, but that includes a six-month promo on a 3.75% base. The top yield needs a $5,000 balance.

- **Payout:** $50 to $200 a year per $20,000 kept at a top rate
- **Effort:** 15 minutes per switch
- **Odds and risk:** Low risk. Switching too often can mean missed rules, like Happen Bank's $250 monthly deposit need.
- **How often:** Every 6 to 12 months

**How Upmore runs it:**

1. Reads interest payments each month and calculates the real rate the user earns.
2. Alerts when the real rate falls below a top rate by a set gap and asks to move.
3. Moves money after approval and keeps a list of each bank's promo end date and rules.

**What Upmore needs:** Bank aggregation API, a bank rate feed, and transfer rails.

**Tag:** [Ask] [Flag]

**Source:** [Bankrate: Best high-yield savings accounts](https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/)

### Use Treasury bills to skip state tax (creative)

**What it is:** Hold short-term cash in T-bills, whose interest is exempt from state and local income tax.

**Real example:** The 26-week bill yielded 4.33% on October 9, 2026. Illustration: $20,000 earns about $866 a year, saving about $43 at an assumed 5% state rate.

- **Payout:** $20 to $300 a year per $20,000, higher in high-tax states
- **Effort:** 20 minutes one-time, then auto-roll
- **Odds and risk:** Very low credit risk. Selling before maturity can mean a small loss if rates rise. Not FDIC insured.
- **How often:** Every 4 to 52 weeks as bills mature

**How Upmore runs it:**

1. Reads the user's state of residence and cash balances, then compares after-tax savings yield to T-bill yield.
2. Shows the after-tax gap in dollars and asks to buy a bill of a chosen length.
3. Places the bill order at the brokerage, sets auto-roll, and logs each maturity.

**What Upmore needs:** Brokerage API with Treasury trading, Treasury yield feed, user state of residence.

**Tag:** [Ask] [Flag]

**Source:** [Daily Treasury Bill Rates](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_bill_rates&field_tdr_date_value_month=202610)

### Park a tax refund or bonus until it is needed (creative)

**What it is:** Put a one-time windfall in high-yield savings until the planned spend date.

**Real example:** EverBank paid 4.20% APY on October 11, 2026. A $3,000 bonus parked for 4 months earns about $42.

- **Payout:** $10 to $150 per windfall
- **Effort:** 5 minutes per event
- **Odds and risk:** Very low risk. Rates can fall during the hold.
- **How often:** Per event, often yearly

**How Upmore runs it:**

1. Spots large one-time deposits labeled IRS, bonus, or payroll that exceed the usual paycheck.
2. Asks what the money is for and when, then proposes parking it until then.
3. Moves it to savings, sets a return date, and moves it back before the spend.

**What Upmore needs:** Bank aggregation API, transaction labels, and transfer rails.

**Tag:** [Ask] [Flag]

**Source:** [Bankrate: Best high-yield savings accounts](https://www.bankrate.com/banking/savings/best-high-yield-interests-savings-accounts/)

### Ladder T-bills or CDs to known bills (creative)

**What it is:** Buy T-bills or CDs that mature just before known large expenses like tuition or insurance.

**Real example:** A $6,000 tuition bill due in six months fits the 26-week bill at 4.33% on October 9, 2026. That earns about $130.

- **Payout:** $50 to $500 per planned expense
- **Effort:** 30 minutes per ladder setup
- **Odds and risk:** Low risk. Early CD withdrawals cost interest. Selling bills early can lose a little if rates rise.
- **How often:** Per expense, often yearly

**How Upmore runs it:**

1. Reads yearly recurring charges such as tuition, car insurance, or property tax from transaction history.
2. Shows each bill's date and a matching bill or CD, and asks to set aside the money.
3. Buys the bills or CDs, then routes maturing cash to checking before each due date.

**What Upmore needs:** Transaction history, brokerage API with Treasury trading, CD partner or rate feed.

**Tag:** [Ask] [Flag]

**Source:** [Daily Treasury Bill Rates](https://home.treasury.gov/resource-center/data-chart-center/interest-rates/TextView?type=daily_treasury_bill_rates&field_tdr_date_value_month=202610)

### Lock a rate with a CD

**What it is:** Put cash you will not need for a set time into a certificate of deposit at a fixed rate.

**Real example:** Barclays paid 4.75% APY on a 2-year CD with no minimum on October 11, 2026. Its early withdrawal penalty is 90 days of interest.

- **Payout:** $300 to $500 a year per $10,000
- **Effort:** 20 minutes one-time
- **Odds and risk:** Low risk if FDIC insured. Breaking early costs interest. Rates may rise after you lock.
- **How often:** Per term, 6 months to 5 years

**How Upmore runs it:**

1. Reads savings that have sat unused for 6 months or more and checks for no planned spend.
2. Shows top CD rates by term with the penalty in dollars, and asks for approval.
3. Opens or funds the CD through a partner and reminds the user before maturity.

**What Upmore needs:** Bank aggregation API, CD marketplace partner, rate feed.

**Tag:** [Ask] [Flag]

**Source:** [Bankrate: CD rates](https://www.bankrate.com/banking/cds/cd-rates/)

### Pick a money market fund or savings on purpose

**What it is:** Choose between a money market fund and a savings account based on yield, fees, tax, and insurance.

**Real example:** Fidelity SPAXX had about a 3.30% seven-day yield (reported, July 31, 2026) and a 0.42% expense ratio. It is not FDIC insured, unlike Peak Bank's 4.27% savings.

- **Payout:** $50 to $300 a year per $10,000 from picking the better option
- **Effort:** 15 minutes one-time
- **Odds and risk:** Money market funds can lose value, though rarely. Savings rates can drop anytime.
- **How often:** Yearly review

**How Upmore runs it:**

1. Reads the fund held as cash and its yield and fees, plus the user's savings rates.
2. Shows the after-fee and after-state-tax yields side by side and asks which to keep.
3. Moves cash after approval and tracks yield monthly.

**What Upmore needs:** Brokerage API, fund yield data, bank rate feed, and RIA review for fund picks.

**Tag:** [Ask] [Flag]

**Source:** [247 Wall St: Fidelity Government Money Market Fund (SPAXX)](https://247wallst.com/investing/2026/08/24/fidelity-government-money-market-fund-spaxx-what-investors-should-know/)

### Keep large balances under the FDIC limit (creative)

**What it is:** Spread cash so no bank holds more than $250,000 per depositor per ownership category.

**Real example:** Public's cash account spreads money across 20 partner banks for up to $5 million combined FDIC cover (page modified July 22, 2026).

- **Payout:** No extra yield. It protects up to the full balance above $250,000.
- **Effort:** 30 minutes one-time
- **Odds and risk:** Bank failures are rare, but uninsured money can be lost or delayed.
- **How often:** Check monthly as balances change

**How Upmore runs it:**

1. Adds up balances per bank and per ownership category from linked accounts.
2. Alerts when any bank goes over $250,000 and suggests a split, then asks to move.
3. Moves the excess to another bank or a multi-bank sweep and keeps watching.

**What Upmore needs:** Bank aggregation API, account ownership data, multi-bank sweep partner.

**Tag:** [Rule] [Flag]

**Source:** [FDIC: Understanding Deposit Insurance](https://www.fdic.gov/resources/deposit-insurance/understanding-deposit-insurance)

### Park 0% balance transfer cash in savings (creative)

**What it is:** Move a card balance to a 0% card and keep the cash you would have paid in savings until the promo ends.

**Real example:** Citi Diamond Preferred offered 0% for 21 months with a 3% fee (Credit Karma, October 1, 2026). A $5,000 transfer costs $150 and may earn about $370 at 4.27%.

- **Payout:** $0 to $250 per $5,000, after fees
- **Effort:** 2 hours one-time plus monthly payments
- **Odds and risk:** High risk of mistakes. One late payment or a lost promo can bring APRs up to 27.49%. A 5% fee wipes out most gain.
- **How often:** Rarely, once per card offer

**How Upmore runs it:**

1. Reads existing card balances and credit details, and only flags this if the user already carries a balance.
2. Shows the fee, the payoff date, the true net gain, and the risks, and asks for approval.
3. Sets autopay for minimums, parks the cash, and pays the card in full before the promo ends.

**What Upmore needs:** Card and bank aggregation API, credit card partner, autopay controls, lending compliance review.

**Tag:** [Ask] [Flag]

**Source:** [Credit Karma: Best balance transfer credit cards](https://www.creditkarma.com/credit-cards/i/best-balance-transfer-credit-cards)

### Earn stablecoin rewards on crypto cash

**What it is:** Hold the USDC stablecoin on an exchange that pays rewards on the balance.

**Real example:** Coinbase advertised 3.75% APY on USDC for Coinbase One members, with plans from $4.99 a month (page checked October 11, 2026).

- **Payout:** $50 to $200 a year per $5,000, after the membership fee
- **Effort:** 30 minutes one-time
- **Odds and risk:** Not FDIC insured. The coin could lose its peg, or the exchange could fail or change terms.
- **How often:** Ongoing, check monthly

**How Upmore runs it:**

1. Reads idle USDC or cash balances in a linked Coinbase account.
2. Shows the reward, the membership cost, and the lack of FDIC cover, and asks for approval.
3. Converts or opts into rewards after approval and logs reward payouts each month.

**What Upmore needs:** Coinbase API, crypto risk disclosures, and legal review for crypto features.

**Tag:** [Ask] [Flag]

**Source:** [Coinbase: USDC](https://www.coinbase.com/usdc)

## Investing plays

Tax-advantaged accounts, employer and broker matches, and tax timing add the most money for the least effort, but every investment can lose money.

### Capture the full 401(k) match

**What it is:** Contribute at least enough to your workplace 401(k) to get every dollar of employer match.

**Real example:** Betterment's example uses a $120,000 salary with a dollar-for-dollar match on the first 4% of pay. That match is worth $4,800 a year (page checked October 2026).

- **Payout:** $500 to $10,000 a year, depending on salary and match formula
- **Effort:** 15 minutes one-time
- **Odds and risk:** The match is near certain if you stay past any vesting date. The invested money can lose value.
- **How often:** Yearly check

**How Upmore runs it:**

1. Reads paystubs or payroll deposits to find the deferral rate and compares it to the plan's match formula.
2. Shows the unclaimed match in dollars and asks the user to raise the deferral rate.
3. Guides the change in the payroll portal and checks the next paystubs for the match.

**What Upmore needs:** Payroll or paystub data, 401(k) provider link, and plan match formula from the user.

**Tag:** [Ask] [Flag]

**Source:** [Betterment: True-Ups](https://www.betterment.com/work/resources/true-ups)

### Get a broker match on an IRA rollover (creative)

**What it is:** Move an old 401(k) or IRA to a broker that pays a bonus on transferred assets.

**Real example:** Robinhood pays a 1% match on IRA transfers and 401(k) rollovers with no cap (FAQ checked October 11, 2026). A $50,000 rollover earns $500.

- **Payout:** $100 to $1,000 per $10,000 to $100,000 moved
- **Effort:** 1 to 2 hours one-time
- **Odds and risk:** Low market risk if held in the same funds. Moving out within 5 years can trigger a fee that claws back the match.
- **How often:** Per old account, once

**How Upmore runs it:**

1. Reads linked retirement accounts and finds old employer plans with no new contributions.
2. Shows the bonus, the 5-year hold rule, and fund fees, and asks to start the rollover.
3. Starts the transfer, tracks it to completion, and records the 5-year date.

**What Upmore needs:** Retirement account data, Robinhood or Public IRA partner, rollover paperwork flow.

**Tag:** [Ask] [Flag]

**Source:** [Robinhood: IRA match FAQ](https://robinhood.com/us/en/support/articles/ira-match-faq/)

### Check for a missed 401(k) true-up (creative)

**What it is:** Confirm your employer paid the full match if you hit the 401(k) limit before year end.

**Real example:** Betterment shows a $120,000 earner deferring 25% hits the $24,500 limit by pay period 20. The match paid is $4,000, so $800 is owed as a true-up.

- **Payout:** $200 to $2,000 per year of front-loading
- **Effort:** 30 minutes yearly
- **Odds and risk:** Only some plans pay true-ups. If yours does not, front-loading loses match.
- **How often:** Yearly, after plan year end

**How Upmore runs it:**

1. Reads payroll deferrals and projects the date the user will hit $24,500.
2. Warns before the limit is reached and asks to spread contributions or confirm the plan pays true-ups.
3. Adjusts the deferral rate after approval and checks for a true-up deposit early next year.

**What Upmore needs:** Payroll data, 401(k) account link, and plan document details.

**Tag:** [Ask] [Flag]

**Source:** [Betterment: True-Ups](https://www.betterment.com/work/resources/true-ups)

### Harvest gains in the 0% tax bracket (creative)

**What it is:** Sell and rebuy winning investments while your income is low enough for 0% long-term gains tax.

**Real example:** For 2026 the 0% rate applies up to $49,450 single or $98,900 joint (reported, Kiplinger, March 9, 2026). A single filer at $40,000 has $9,450 of room.

- **Payout:** $500 to $3,000 of future tax avoided per year, if gains would later be taxed at 15% (assumed)
- **Effort:** 1 hour yearly
- **Odds and risk:** Going over the limit makes some gains taxable. Market prices can move during the sell and rebuy.
- **How often:** Yearly, usually in November or December

**How Upmore runs it:**

1. Estimates taxable income from paychecks and reads long-term gains on taxable lots.
2. Shows how many dollars of gain fit under the 0% line and asks to sell and rebuy.
3. Places the trades, records the new higher cost basis, and saves a tax note.

**What Upmore needs:** Brokerage API with lot data, income data, tax engine, and RIA and tax review.

**Tag:** [Ask] [Flag]

**Source:** [Kiplinger: IRS Updates Capital Gains Tax Thresholds for 2026](https://kiplinger.com/taxes/irs-updates-capital-gains-tax-thresholds)

### Harvest tax losses

**What it is:** Sell an investment that is down to lower your tax bill, then buy something similar but not identical.

**Real example:** The IRS lets you deduct up to $3,000 of net capital loss a year and carry the rest forward (page updated September 24, 2026). At an assumed 22% rate, that saves $660.

- **Payout:** $100 to $1,000 a year in tax saved, plus losses carried forward
- **Effort:** 30 minutes per harvest
- **Odds and risk:** A wash sale cancels the deduction. The new holding may perform differently.
- **How often:** When markets drop, often yearly

**How Upmore runs it:**

1. Reads taxable lots across all linked brokerages and finds ones with losses.
2. Shows the tax saved and a non-identical replacement, and asks to sell and swap.
3. Places both trades, blocks rebuys for 31 days, and logs the loss for tax time.

**What Upmore needs:** Brokerage APIs with lot data, tax engine, RIA partner.

**Tag:** [Ask] [Flag]

**Source:** [IRS Topic 409: Capital gains and losses](https://www.irs.gov/taxtopics/tc409)

### Claim a broker IRA contribution match (creative)

**What it is:** Make your yearly IRA contribution at a broker that adds a bonus on each deposit.

**Real example:** Robinhood matches 1% of IRA contributions, or 3% with Gold at $5 a month. On the $7,500 limit for 2026 that is $75 or $225.

- **Payout:** $75 to $225 a year, minus any membership fee
- **Effort:** 20 minutes yearly
- **Odds and risk:** Withdrawing within 5 years can claw back the match. Canceling Gold within a year removes the extra 2%.
- **How often:** Yearly

**How Upmore runs it:**

1. Reads where the user makes IRA deposits and checks whether any match is earned.
2. Shows the match, the hold rules, and the fee, and asks to send contributions there.
3. Sets up the contribution after approval and tracks match credits and the 5-year date.

**What Upmore needs:** Brokerage IRA APIs, bank transfer rails, broker promo data.

**Tag:** [Ask] [Flag]

**Source:** [Robinhood: IRA match FAQ](https://robinhood.com/us/en/support/articles/ira-match-faq/)

### Invest the HSA instead of leaving it in cash (creative)

**What it is:** Treat a health savings account as a long-term account by investing the balance and paying small bills from cash.

**Real example:** For 2026 you can add $4,400 self-only or $8,750 family. Contributions are deductible, growth is tax free, and medical withdrawals are tax free.

- **Payout:** $500 to $2,000 a year in tax saved, plus untaxed growth
- **Effort:** 1 hour one-time, then yearly
- **Odds and risk:** Investments can lose value. Non-medical withdrawals before 65 face a 20% extra tax.
- **How often:** Yearly contribution, ongoing investing

**How Upmore runs it:**

1. Reads HSA balances and finds cash above a set medical buffer, and spots HDHP premiums in paystubs.
2. Shows the tax saved and suggests investing the extra, and asks for approval.
3. Moves cash to the HSA investment option and saves medical receipts for later tax-free payback.

**What Upmore needs:** HSA provider link, paystub data, receipt storage, and RIA review.

**Tag:** [Ask] [Flag]

**Source:** [IRS Rev. Proc. 2025-19](https://www.irs.gov/pub/irs-drop/rp-25-19.pdf)

### Fund a Roth IRA before the deadline

**What it is:** Put money in a Roth IRA for the tax year, where growth can later come out tax free.

**Real example:** The 2026 IRA limit is $7,500, or $8,600 at 50 and over. Roth eligibility phases out from $153,000 to $168,000 for single filers.

- **Payout:** Up to $7,500 a year sheltered from future tax on growth
- **Effort:** 20 minutes yearly
- **Odds and risk:** Investments can lose value. Contributing too much or over the income limit triggers a 6% yearly tax.
- **How often:** Yearly, before the tax filing deadline

**How Upmore runs it:**

1. Reads IRA contributions year to date and estimates income from paychecks.
2. Shows the room left and the deadline, and asks to set a monthly or lump-sum deposit.
3. Moves money after approval and stops deposits at the limit.

**What Upmore needs:** Brokerage IRA API, income data, bank transfer rails.

**Tag:** [Rule] [Flag]

**Source:** [IRS: Retirement topics IRA contribution limits](https://www.irs.gov/retirement-plans/plan-participant-employee/retirement-topics-ira-contribution-limits)

### Guard against wash sales across apps (creative)

**What it is:** Warn before any buy that would cancel a recent tax loss, across all linked brokerages.

**Real example:** A wash sale happens if you buy the same or substantially identical security, or an option on it, within 30 days before or after a loss sale.

- **Payout:** Protects $100 to $1,000 of tax savings per harvested loss
- **Effort:** None after setup
- **Odds and risk:** Common mistake when users hold the same stock in two apps or have auto-invest on.
- **How often:** Per loss sale

**How Upmore runs it:**

1. Reads all loss sales and scheduled buys across Robinhood, Public, Coinbase and other links.
2. Flags any buy of the same security within the 61-day window and asks to pause it.
3. Pauses dividend reinvestment or recurring buys after approval and resumes on day 31.

**What Upmore needs:** Brokerage APIs with trade history and recurring buy controls.

**Tag:** [Rule] [Flag]

**Source:** [Investor.gov: Wash Sales](https://www.investor.gov/introduction-investing/investing-basics/glossary/wash-sales)

### Sell covered calls on shares you own

**What it is:** Sell someone the right to buy 100 of your shares at a set price, and keep the payment.

**Real example:** Illustration, not a live quote: own 100 shares at $50 and sell a $55 call for $1. You keep $100, but give up gains above $55.

- **Payout:** $20 to $200 per 100 shares per month, varies by stock
- **Effort:** 15 minutes per trade
- **Odds and risk:** Shares can still fall. If the stock jumps, your shares are sold at the strike and you miss the gain.
- **How often:** Monthly or per expiry

**How Upmore runs it:**

1. Reads positions with 100 or more shares in a linked brokerage with options approval.
2. Shows the premium, the strike, and the chance of shares being called away, and asks for approval.
3. Places the order, tracks to expiry, and reports premium kept or shares sold.

**What Upmore needs:** Brokerage options API, options data feed, options approval on the user account, RIA review.

**Tag:** [Ask] [Flag]

**Source:** [E*TRADE: Understand the risk of cash-secured puts](https://US.eTrade.com/knowledge/library/options/cash-secured-puts-risk)

### Sell cash-secured puts on stocks you want

**What it is:** Get paid to agree to buy a stock at a lower price, with the cash set aside.

**Real example:** E*TRADE shows a $28 put sold for $2. Max profit is $200, and max loss is $2,600 if the stock goes to zero (article dated February 28, 2019).

- **Payout:** $20 to $200 per contract per month
- **Effort:** 15 minutes per trade
- **Odds and risk:** If the stock drops below the strike, you must buy it and can lose a lot.
- **How often:** Monthly or per expiry

**How Upmore runs it:**

1. Reads idle cash and the user's watchlist, and checks for options approval.
2. Shows the premium, the buy price, and the worst-case loss, and asks for approval.
3. Places the put, keeps the cash reserved, and tracks to expiry or assignment.

**What Upmore needs:** Brokerage options API, options data feed, RIA partner.

**Tag:** [Ask] [Flag]

**Source:** [E*TRADE: Understand the risk of cash-secured puts](https://US.eTrade.com/knowledge/library/options/cash-secured-puts-risk)

### Follow big funds through 13F filings (creative)

**What it is:** Track what large investment managers held at quarter end, knowing the data is weeks old.

**Real example:** Q3 2026 13F filings are due November 16, 2026, 45 days after quarter end. They exclude short positions and written options.

- **Payout:** Unknown, may be zero or negative
- **Effort:** 10 minutes per quarter to review
- **Odds and risk:** Data can be up to 135 days old. Funds may have already sold. Not a buy signal.
- **How often:** Quarterly

**How Upmore runs it:**

1. Pulls new 13F filings from SEC EDGAR for managers the user picks.
2. Shows changes next to the user's holdings with the filing delay stated, and asks if they want to act.
3. Places any approved trade and tracks its return against an index.

**What Upmore needs:** SEC EDGAR data feed, brokerage API, RIA review.

**Tag:** [Read] [Flag]

**Source:** [SEC: Frequently Asked Questions About Form 13F](https://www.sec.gov/rules-regulations/staff-guidance/division-investment-management-frequently-asked-questions/frequently-asked-questions-about-form-13f)

### Track congressional stock trades (creative)

**What it is:** Watch public trade reports filed by members of Congress, which can lag the trade by weeks.

**Real example:** Members must file a Periodic Transaction Report within 45 days of a trade (reported, Disclosed Capitol, checked October 11, 2026).

- **Payout:** Unknown, may be zero or negative
- **Effort:** 10 minutes per week to review
- **Odds and risk:** Trades are up to 45 days old and reported in value ranges. Copying is guesswork.
- **How often:** Weekly feed

**How Upmore runs it:**

1. Pulls new House and Senate trade reports from public disclosure sites.
2. Shows trades in the user's holdings or watchlist with the delay stated, and asks if they want to act.
3. Places any approved trade and tracks its result against an index.

**What Upmore needs:** House and Senate disclosure data feed, brokerage API, RIA review.

**Tag:** [Read] [Flag]

**Source:** [Disclosed Capitol: 45-day window](https://www.disclosedcapitol.com/glossary/45-day-window)

## Side income and selling

The best side income per hour comes from paid research interviews and selling things you already own, while receipt and cash-back apps pay little but run almost on autopilot.

### Paid expert interviews (creative)

**What it is:** Companies pay you to join a short video interview or focus group about your job or habits.

**Real example:** Respondent lists a $75 average payout for a 45-minute session, with no participant fees (checked October 2026).

- **Payout:** $50 to $250 per session, and $400 or more for senior business roles
- **Effort:** 5 to 10 minutes per screener, then 30 to 60 minutes per session
- **Odds and risk:** Most screeners do not lead to an invite. Low risk, since payment is sent after the session is verified.
- **How often:** Per study, a few times a year for most people

**How Upmore runs it:**

1. It reads the user's job title from email signatures and finds open calendar blocks of 60 minutes or more.
2. It shows matching studies with pay, length and time slot, and asks to submit the screener.
3. After approval it books the slot, adds it to the calendar, and watches for the Tremendous payout email about 48 hours later.

**What Upmore needs:** Calendar and email read access, a Respondent account the user creates, and a payout tracker for Tremendous emails.

**Tag:** [Ask] [Flag]

**Source:** [Respondent participants](https://www.respondent.io/participants)

### Sell old phones and gadgets

**What it is:** You mail an unused phone or tablet to a buyback site or sell it to another person on a resale site.

**Real example:** Swappa charges the seller 3% of the sale price plus payment processing (checked October 2026). Gazelle reportedly paid $79 for an iPhone 8 within 24 hours of inspection (DollarSprout, updated December 2024). Decluttr has closed its website.

- **Payout:** Reported $79 for one older iPhone; newer devices vary by model and condition
- **Effort:** 30 to 60 minutes one time, including wiping and packing
- **Odds and risk:** Buyback sites can lower the offer after inspection. Gazelle reportedly gives 15 days to accept or reject a revised offer.
- **How often:** Once per device

**How Upmore runs it:**

1. It finds past phone, tablet and laptop receipts in email and spots devices that a newer purchase replaced.
2. It shows the device, a Swappa listing price and a buyback quote, and asks which route to use.
3. After approval it drafts the listing or requests the shipping label, reminds the user before the 30-day offer ends, and tracks the payout.

**What Upmore needs:** Email receipt parsing, links to Swappa and Gazelle, and a reminder on the offer deadline.

**Tag:** [Ask] [Flag]

**Source:** [Swappa fees](https://swappa.com/fees)

### Paid research studies (creative)

**What it is:** Researchers pay you for surveys, interviews, diary studies or focus groups about products you use.

**Real example:** User Interviews reportedly averages $60 per study, with online studies from $20 to over $1,500 (Niche Pursuits, February 2024).

- **Payout:** $20 to $300 per study, reported, with a $60 average
- **Effort:** 5 minutes per screener, then 30 to 60 minutes per study
- **Odds and risk:** Invites are not guaranteed. One reviewer reported no invites after 10 to 15 screeners.
- **How often:** Per study, irregular

**How Upmore runs it:**

1. It reads the user's apps, subscriptions and purchases from receipts to match study topics.
2. It shows a study with pay and time, and asks to fill the screener from the user's profile.
3. After approval it submits answers the user confirmed, books the session, and tracks the PayPal or gift card payout.

**What Upmore needs:** Email and calendar access, a User Interviews account, and a stored profile the user has approved.

**Tag:** [Ask] [Flag]

**Source:** [User Interviews review, Niche Pursuits (reported)](https://www.nichepursuits.com/?p=130988)

### Sell textbooks back

**What it is:** You compare buyback offers for used textbooks and ship them for free to the highest bidder.

**Real example:** BookScouter compares offers from more than 30 vendors, with free shipping and same-day payment often on receipt (checked October 2026).

- **Payout:** Varies by ISBN; the site shows sample high-value titles near $44, $84 and $192
- **Effort:** 15 to 30 minutes one time per batch
- **Odds and risk:** Older editions may get no offer. Prices drop after the semester ends.
- **How often:** Each semester

**How Upmore runs it:**

1. It finds textbook purchases in receipts and the term end date in the calendar.
2. It shows each book's best offer and asks to sell before prices drop.
3. After approval it opens the vendor checkout, saves the label, and tracks payment once the book arrives.

**What Upmore needs:** Receipt parsing for ISBNs, the BookScouter site, and calendar access for term dates.

**Tag:** [Ask]

**Source:** [BookScouter](https://bookscouter.com/)

### AI training tasks (creative)

**What it is:** You rate, write or check answers that help train AI models, from home and on your schedule.

**Real example:** DataAnnotation lists $25 to $50 per hour for generalists and $40 to $150 or more for coders (checked October 2026).

- **Payout:** $25 to $150 per hour, depending on skill
- **Effort:** A one-time assessment, then hours you choose
- **Odds and risk:** Not everyone passes the entry test. Work volume can rise and fall without notice.
- **How often:** Weekly or whenever work is available

**How Upmore runs it:**

1. It reads the user's skills from their resume or email and spots free evening hours.
2. It suggests the right track and asks to start the assessment.
3. After approval it blocks work time on the calendar, logs hours, and matches each payout to logged time.

**What Upmore needs:** Calendar access, a user-created DataAnnotation account, and an hours log.

**Tag:** [Ask] [Flag]

**Source:** [DataAnnotation](https://www.dataannotation.tech/)

### Dog walking and pet sitting

**What it is:** You walk, board or check on neighbors' pets through a booking app.

**Real example:** Rover reportedly takes a 20% fee, and walks reportedly pay $15 to $25 per 30 minutes (Gridwise, April 2025). Rover's own page lists up to $25,000 in vet care cover (checked October 2026).

- **Payout:** $15 to $25 per 30-minute walk and $35 to $75 per night of boarding, reported, before the 20% fee
- **Effort:** 30 minutes per walk, recurring
- **Odds and risk:** A pet can be hurt or lost. Bad reviews early can slow bookings.
- **How often:** Weekly or per booking

**How Upmore runs it:**

1. It finds pet supply purchases in receipts and free weekday blocks in the calendar.
2. It suggests a profile, rates and hours, and asks to publish them.
3. After approval it adds bookings to the calendar and tracks payouts, which are ready two days after each service.

**What Upmore needs:** Calendar and receipts access, a Rover account, and payout tracking.

**Tag:** [Ask] [Flag]

**Source:** [Rover become a sitter](https://www.rover.com/become-a-sitter/)

### Website and app testing (creative)

**What it is:** You talk out loud while using a website or app, and the company pays for your recording.

**Real example:** UserTesting reportedly pays about $10 per 15 to 20 minute test, and $20 or more for live calls (Self Made Success, August 2026).

- **Payout:** About $10 per standard test and $20 or more per live call, reported
- **Effort:** 15 to 20 minutes per test
- **Odds and risk:** Tests fill fast and some get rejected. Pay arrives about 14 days later.
- **How often:** A few times a week, if available

**How Upmore runs it:**

1. It spots short calendar gaps when the user is at a computer.
2. It sends a nudge to check open tests and asks to turn on alerts.
3. After approval it logs each finished test and matches the PayPal payout about 14 days later.

**What Upmore needs:** Calendar access, a UserTesting account, and PayPal email parsing.

**Tag:** [Ask] [Flag]

**Source:** [UserTesting review, Self Made Success (reported)](https://selfmadesuccess.com/?p=13351)

### Sell household items with an AI listing

**What it is:** You sell unused furniture, decor or gear locally, using a listing the agent writes from your photos.

**Real example:** eBay charges 13.6% plus $0.40 per order over $10 for most categories (checked October 2026). Facebook Marketplace local pickup reportedly has no selling fee (Vendoo).

- **Payout:** Depends on the item; local sales keep the full price
- **Effort:** 10 to 20 minutes per item, plus a meetup
- **Odds and risk:** Scam buyers and no-shows are common. Meet in public and take cash or app payment first.
- **How often:** Per item

**How Upmore runs it:**

1. It finds large past purchases in receipts that are old or replaced, like a second monitor.
2. It drafts a title, description and price from the photo and asks the user to approve.
3. After approval it posts or copies the listing, schedules the pickup in the calendar, and logs the sale.

**What Upmore needs:** Receipts, photo upload, an eBay or Facebook account, and a sales log for taxes.

**Tag:** [Ask] [Flag]

**Source:** [eBay selling fees](https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822)

### Fill free hours with local shifts

**What it is:** You pick up short paid shifts at restaurants, warehouses or events that fit your open hours.

**Real example:** Instawork says the average across US markets is over $20 per hour, and up to $30 (checked October 2026).

- **Payout:** $20 to $30 per hour
- **Effort:** A one-time profile and background check, then shifts of a few hours
- **Odds and risk:** Shifts can be cancelled. Low ratings limit future shifts.
- **How often:** Weekly, as you choose

**How Upmore runs it:**

1. It finds open four-hour blocks in the calendar, often on weekends.
2. It shows nearby shifts with pay and travel time, and asks to book one.
3. After approval it adds the shift and travel to the calendar and tracks instant pay where eligible.

**What Upmore needs:** Calendar and location, an Instawork account, and payout tracking.

**Tag:** [Ask] [Flag]

**Source:** [Instawork worker](https://www.instawork.com/worker)

### Sell clothes on resale apps

**What it is:** You list clothes and shoes you no longer wear on a resale app, and the buyer pays shipping.

**Real example:** Poshmark reportedly charges $2.95 on sales under $15 and 20% on sales of $15 or more (Vendoo, updated February 2026).

- **Payout:** You keep 80% on items of $15 or more, reported
- **Effort:** 5 to 10 minutes per item, plus shipping
- **Odds and risk:** Many items never sell. Cheap items lose most of their price to the flat fee.
- **How often:** Per item, seasonal

**How Upmore runs it:**

1. It finds clothing orders in email receipts that are over a year old or were returned items kept.
2. It suggests items worth $15 or more and drafts listings for approval.
3. After approval it posts listings, reminds the user to ship, and logs each sale.

**What Upmore needs:** Receipt parsing, photos, and a Poshmark account.

**Tag:** [Ask]

**Source:** [Poshmark fees, Vendoo (reported)](https://blog.vendoo.co/everything-you-need-to-know-about-poshmark-selling-fees)

### Mystery shopping (creative)

**What it is:** A company pays you to visit a store or restaurant and report on the service.

**Real example:** BestMark reportedly pays $10 to $25 per shop or reimburses purchases (SideHusl, last updated March 2023).

- **Payout:** $10 to $25 per shop, reported, sometimes with a free meal
- **Effort:** 30 to 90 minutes per shop, including the report
- **Odds and risk:** Fake "mystery shopper" checks are a common scam. Never pay to join or cash a check for someone.
- **How often:** Per shop

**How Upmore runs it:**

1. It notices errands already on the calendar near stores that post shops.
2. It shows a shop that fits the route and asks to accept it.
3. After approval it adds the visit and report deadline to the calendar and tracks the payment.

**What Upmore needs:** Calendar and location, a shopper account, and scam filters on email.

**Tag:** [Ask]

**Source:** [Mystery shop companies, SideHusl (reported)](https://sidehusl.com/mystery-shop/)

### Academic online studies (creative)

**What it is:** University researchers pay you for short online surveys and tasks.

**Real example:** Prolific sets a minimum of $8 per hour and recommends $12 per hour, with cash-out at $6 (checked October 2026).

- **Payout:** $8 to $12 per hour, often in short studies
- **Effort:** 5 to 30 minutes per study
- **Odds and risk:** Studies fill fast. Failing attention checks can mean no pay.
- **How often:** Many times a week, if available

**How Upmore runs it:**

1. It spots idle moments, like a commute on the calendar.
2. It asks the user to turn on study alerts.
3. After approval it logs earnings and reminds the user to cash out to PayPal above $6.

**What Upmore needs:** A Prolific account and PayPal email parsing.

**Tag:** [Ask] [Flag]

**Source:** [Prolific payment principles](https://researcher-help.prolific.com/en/articles/445230-prolific-s-payment-principles)

### Flip clearance finds

**What it is:** You buy clearance items cheaply and resell them online for more.

**Real example:** eBay takes 13.6% plus $0.40 per order over $10 in most categories (checked October 2026). No reliable earnings data was found.

- **Payout:** Unknown; profit is the sale price minus cost and about 14% in fees
- **Effort:** Several hours per week, recurring
- **Odds and risk:** High. Items can sit unsold and you lose the money you spent.
- **How often:** Weekly

**How Upmore runs it:**

1. It notices clearance buys in card data and checks recent eBay sold prices.
2. It shows the profit after fees and asks before any new purchase.
3. After approval it drafts the listing and tracks cost, sale and fees for each item.

**What Upmore needs:** Card transactions, an eBay account, and a profit ledger.

**Tag:** [Ask] [Flag]

**Source:** [eBay selling fees](https://www.ebay.com/help/selling/fees-credits-invoices/selling-fees?id=4822)

### Mock jury panels (creative)

**What it is:** Lawyers pay you to read a case online and give your verdict before a real trial.

**Real example:** eJury reportedly pays $5 to $10 per case via PayPal (SideHusl, updated April 2025).

- **Payout:** $5 to $10 per case, reported
- **Effort:** 30 to 60 minutes per case
- **Odds and risk:** Invites are rare, about every six months per reader reports.
- **How often:** A few times a year

**How Upmore runs it:**

1. It checks the user is a US adult and asks to sign up once.
2. It flags each invite email and asks to accept it.
3. After approval it adds the deadline to the calendar and tracks the PayPal payment.

**What Upmore needs:** Email access and an eJury account.

**Tag:** [Ask]

**Source:** [eJury review, SideHusl (reported)](https://sidehusl.com/ejury/)

### Cash back on groceries

**What it is:** You unlock offers before shopping and get cash back when you upload a receipt or link a store account.

**Real example:** Ibotta reportedly pays casual users $2 to $20 a month and active users $20 to $100 or more, with a $20 cashout minimum and a $5 referral bonus (DollarSprout, updated December 2024).

- **Payout:** $2 to $100 per month, reported
- **Effort:** 5 to 10 minutes per shopping trip
- **Odds and risk:** Low risk. Offers expire, and small balances take a while to reach $20.
- **How often:** Monthly

**How Upmore runs it:**

1. It reads grocery card transactions and the user's usual brands.
2. It shows offers that match the next trip and asks to unlock them.
3. After approval it reminds the user to submit the receipt and tracks the balance to the $20 cashout.

**What Upmore needs:** Card and receipt data, and an Ibotta account.

**Tag:** [Rule]

**Source:** [Ibotta review, DollarSprout (reported)](https://dollarsprout.com/ibotta-review/)

### Scan receipts for points

**What it is:** You scan any shopping receipt to earn points you trade for gift cards.

**Real example:** Fetch reportedly values 1,000 points at $1, with a 3,000 point minimum and a 2,000 point referral bonus for both people (The College Investor, February 2025).

- **Payout:** A few dollars per month, based on $1 per 1,000 points
- **Effort:** Under a minute per receipt, recurring
- **Odds and risk:** Very low. Earnings are small.
- **How often:** Per receipt

**How Upmore runs it:**

1. It spots e-receipts in email from stores Fetch accepts.
2. It asks once to link the email so receipts are sent on their own.
3. After approval it tracks points and alerts the user at 3,000 points to redeem.

**What Upmore needs:** Email receipt access and a Fetch account.

**Tag:** [Rule]

**Source:** [Fetch review, The College Investor (reported)](https://thecollegeinvestor.com/33560/fetch-rewards-review/)

## Renting out what you already own

Space you rarely use, like a garage, driveway or car exterior, earns the most for the least effort, while renting a car or room pays more but takes steady work and insurance care.

### Car wrap ads (creative)

**What it is:** A company wraps your car in an ad and pays you each month while you drive as usual.

**Real example:** Carvertise pays a $100 base per month, and most drivers make $450 to $1,500 monthly (checked October 2026).

- **Payout:** $100 to $1,500 per month
- **Effort:** A few hours one time for the install and removal
- **Odds and risk:** Campaigns depend on your city and miles driven. Cars must be 2015 or newer with no major dents.
- **How often:** Per campaign, monthly pay

**How Upmore runs it:**

1. It reads gas and toll spending and calendar trips to estimate weekly miles.
2. It shows the driver rules and pay range and asks to apply.
3. After approval it books the install on the calendar and tracks monthly payouts.

**What Upmore needs:** Card transactions, calendar access, and a Carvertise application.

**Tag:** [Ask] [Flag]

**Source:** [Carvertise drivers](https://www.carvertise.com/drivers)

### Rent garage or shed storage

**What it is:** You rent empty garage, shed or basement space to a neighbor who needs storage.

**Real example:** Neighbor lists for free and takes 4.9% plus $0.30 from payouts, with a $1M host guarantee (checked October 2026). Garages reportedly earn $100 to $600 a month and sheds $50 to $200 (FinanceBuzz, April 2024).

- **Payout:** $50 to $600 per month, reported
- **Effort:** About an hour to list, then rare check-ins
- **Odds and risk:** Renters may store banned items. Check your lease or HOA rules first.
- **How often:** Monthly

**How Upmore runs it:**

1. It notices a paid self-storage bill ending or a home with a garage on its records.
2. It shows an estimate and a draft listing and asks to publish it.
3. After approval it posts the listing, schedules move-in, and tracks monthly payouts.

**What Upmore needs:** Card data, home details, and a Neighbor account.

**Tag:** [Ask] [Flag]

**Source:** [Neighbor host](https://www.neighbor.com/host)

### Rent your driveway or parking spot

**What it is:** You rent a parking space or driveway to a commuter or neighbor by the month.

**Real example:** Neighbor reportedly cites driveways at $50 to $150 and parking spaces at $50 to $300 a month, and an $85 listing nets $80.54 (FinanceBuzz, April 2024).

- **Payout:** $50 to $300 per month, reported
- **Effort:** About 30 minutes to list, then little upkeep
- **Odds and risk:** Low. Some cities, HOAs or leases ban renting parking.
- **How often:** Monthly

**How Upmore runs it:**

1. It sees the user's car parked at home on most workdays, or no car at all.
2. It shows an estimate for the block and asks to list the space.
3. After approval it posts the listing and tracks the monthly payout after fees.

**What Upmore needs:** Calendar and location patterns, and a Neighbor account.

**Tag:** [Ask] [Flag]

**Source:** [Neighbor review, FinanceBuzz (reported)](https://financebuzz.com/neighbor-review)

### Rent your home for under 15 days a year (creative)

**What it is:** You rent your home while you travel, for no more than 14 days in the year.

**Real example:** The IRS says that if you rent a home you live in for fewer than 15 days, you do not report that rental income (checked October 2026).

- **Payout:** Your nightly rate times up to 14 nights, minus the platform fee
- **Effort:** Several hours per stay for cleaning and handoff
- **Odds and risk:** Guest damage and city rules. Many cities require registration even for short stays.
- **How often:** Yearly, up to 14 days

**How Upmore runs it:**

1. It finds trips on the calendar that overlap big local events.
2. It shows the 14-day limit, local rules to check, and a price, and asks to list those dates.
3. After approval it counts rental days and stops new bookings before day 15.

**What Upmore needs:** Calendar access, an Airbnb account, and a day counter.

**Tag:** [Rule] [Flag]

**Source:** [IRS Topic 415](https://www.irs.gov/taxtopics/tc415)

### Rent your home for photo and film shoots (creative)

**What it is:** Film crews and photographers rent your home or yard for a day of shooting.

**Real example:** Giggster takes a 19% commission, and renters must carry production insurance (checked October 2026).

- **Payout:** Your daily rate minus 19%; you set the rate
- **Effort:** A few hours per shoot to prepare and be present
- **Odds and risk:** Bookings are rare for plain homes. Crews can cause wear.
- **How often:** Per event

**How Upmore runs it:**

1. It notices a home with a distinctive look from user photos or past interest.
2. It drafts a listing with suggested day rates and asks to publish it.
3. After approval it adds shoots to the calendar and tracks the payout within 7 days of the shoot.

**What Upmore needs:** Photos, calendar access, and a Giggster account.

**Tag:** [Ask] [Flag]

**Source:** [Giggster commission](https://help.giggster.com/en/articles/2832062-how-much-commission-does-giggster-take)

### Rent your space for meetings and events (creative)

**What it is:** People rent your living room, studio or backyard by the hour for meetings, parties or shoots.

**Real example:** Peerspace takes a 20% host fee and includes up to $1M liability and up to $25,000 damage cover per booking (checked October 2026).

- **Payout:** Your hourly rate minus 20%
- **Effort:** 1 to 2 hours per booking for setup and cleanup
- **Odds and risk:** Noise and neighbor complaints. Leases often forbid commercial use.
- **How often:** Per event

**How Upmore runs it:**

1. It finds weekends with no plans on the calendar.
2. It drafts the listing and house rules and asks to publish.
3. After approval it blocks booked hours and tracks each payout.

**What Upmore needs:** Calendar access, photos, and a Peerspace account.

**Tag:** [Ask] [Flag]

**Source:** [Peerspace host](https://www.peerspace.com/host)

### Rent your pool by the hour (creative)

**What it is:** Families book your backyard pool for a few hours at a time.

**Real example:** Swimply says most hosts earn about $45 per hour and take home about $1,000 a month, after a 15% to 20% fee (checked October 2026).

- **Payout:** $25 to $100 per hour, and about $1,000 per month for most hosts
- **Effort:** 30 to 60 minutes per booking for checks and cleanup
- **Odds and risk:** Injury liability is real. Swimply covers up to $1M liability and $10,000 damage.
- **How often:** Per booking, mostly summer

**How Upmore runs it:**

1. It sees pool supply or pool service charges in card data.
2. It shows an earnings estimate, safety steps and an insurance check, and asks to list.
3. After approval it posts open hours from the calendar and tracks payouts.

**What Upmore needs:** Card data, calendar access, and a Swimply account.

**Tag:** [Ask] [Flag]

**Source:** [Swimply host earnings](https://swimply.com/hostblog/post/how-much-can-you-make-renting-out-your-pool-by-the-hour)

### Rent your yard as a private dog park (creative)

**What it is:** Dog owners book your fenced yard by the hour so their dog can run alone.

**Real example:** Sniffspot says hosts can earn up to $3,000 a month, with $1M liability cover and $5,000 damage protection (checked October 2026).

- **Payout:** Up to $3,000 per month for top hosts; most earn less
- **Effort:** Under an hour a week for yard checks
- **Odds and risk:** Dog waste and fence damage. Bookings need a fully fenced yard.
- **How often:** Per booking, paid monthly

**How Upmore runs it:**

1. It notices a house with a yard and dog-related spending nearby.
2. It drafts a listing and price and asks to publish.
3. After approval it posts free hours and tracks the monthly direct deposit.

**What Upmore needs:** Home details, calendar access, and a Sniffspot account.

**Tag:** [Ask] [Flag]

**Source:** [Sniffspot host](https://www.sniffspot.com/host)

### Rent out your car

**What it is:** You rent your car to travelers through an app on days you do not drive.

**Real example:** Turo lets US hosts keep 70%, 80% or 90% of the trip price, with $250, $1,500 or $2,750 damage responsibility (checked October 2026).

- **Payout:** 70% to 90% of each trip price
- **Effort:** 30 to 60 minutes per trip for cleaning and handoff
- **Odds and risk:** Damage and wear are likely over time. Personal auto policies may not cover sharing, so check first.
- **How often:** Per trip

**How Upmore runs it:**

1. It sees the car parked most days from calendar and location, like a remote work week.
2. It compares the three plans against the user's savings and asks which to pick.
3. After approval it blocks driving days, lists open days, and tracks each payout.

**What Upmore needs:** Calendar and location, insurance policy details, and a Turo account.

**Tag:** [Ask] [Flag]

**Source:** [Turo earnings plans for US hosts](https://help.turo.com/en_us/earnings-plans-in-brief-us-hosts-ryy_U4gE9.md)

### Rent land for camping (creative)

**What it is:** Campers pay to pitch a tent or park a van on your land.

**Real example:** Hipcamp lists for free and charges private landowners a 15% commission, with up to $1M in protection (checked October 2026).

- **Payout:** Your nightly rate minus 15%
- **Effort:** A few hours to set up, then an hour per stay
- **Odds and risk:** Fire risk and county zoning rules. Only fits users with spare land.
- **How often:** Per night, seasonal

**How Upmore runs it:**

1. It reads property tax bills to spot land or acreage.
2. It shows zoning checks and a price and asks to list.
3. After approval it posts open nights and tracks payouts.

**What Upmore needs:** Property records, calendar access, and a Hipcamp account.

**Tag:** [Ask] [Flag]

**Source:** [Hipcamp listing cost and commission](https://support.hipcamp.com/hc/en-us/articles/360024823412-How-much-does-it-cost-to-list)

### Rent a spare room

**What it is:** You host guests in an extra bedroom for short stays.

**Real example:** Airbnb's single-fee plan takes about 15.5% from most host payouts (checked October 2026).

- **Payout:** Your nightly rate minus about 15.5%
- **Effort:** 1 to 2 hours per stay for cleaning, messages and check-in
- **Odds and risk:** Guest damage, lease bans and city registration rules. Income past 14 days a year is taxable.
- **How often:** Per night

**How Upmore runs it:**

1. It sees an empty room, such as a roommate's lease ending in email.
2. It shows local rules to check, a price and the fee, and asks to list.
3. After approval it syncs bookings to the calendar and logs income for taxes.

**What Upmore needs:** Calendar and email access, an Airbnb account, and a tax ledger.

**Tag:** [Ask] [Flag]

**Source:** [Airbnb service fees](https://www.airbnb.com/help/article/1857)
