# Upmore — Agent Capabilities Spec

Sep 27, 2026

Upmore's agent finds, prepares and **completes** money tasks end to end — cancelling, paying, claiming, investing — on licensed partner rails, under limits the user sets. This spec defines every capability, the permission tier it runs at, the rail it runs on, and what it must never do.

The positioning that follows from it: ChatGPT Finances connects accounts for analysis. Upmore connects accounts to **act**. Everything below exists to make that difference real, fast, and safe enough that users hand over the keys.

The single architectural rule: **Upmore never becomes the bank, the broker, or the adviser. It drives the companies that already are.** Money never sits in an Upmore account. Every rail that moves money belongs to a licensed partner.

## The permission model

Autonomy is not one switch. Every capability runs at a tier, and the user controls where the lines sit. This is what lets the agent feel like Muse — it just does things — while being safe enough that people connect their money to it.

### Five tiers

| Tier | Name | What the agent may do | Example |
| --- | --- | --- | --- |
| T0 | See | Read connected data | Balances, transactions, holdings |
| T1 | Prepare | Draft, fill, find, calculate. Nothing leaves Upmore | Writes the dispute, fills the cancel form, finds the claim |
| T2 | Act on approval | Executes after one tap from the user | "Pay ComEd $184.20?" → Approve |
| T3 | Act within limits | Executes autonomously inside rules the user set | Pays any recurring bill under $150 that matches its usual amount |
| T4 | Never | Refused regardless of settings | See the never list |

Every new user starts with every capability at T2. Nothing runs at T3 until the user turns it on for that specific capability. The agent may *suggest* raising a capability to T3 after it has completed the same action correctly three times at T2.

### What the user controls

- **Per-capability tier.** Cancel at T3, investing at T2, for example
- **Per-action dollar cap.** Default $25 for T3; user can raise it
- **Monthly autonomous spend cap.** Total the agent may move without asking in a calendar month. Default $200
- **Match tolerance for bills.** A T3 bill payment only runs if the amount is within 10% of the last three payments. A bill that doubled always drops to T2
- **Quiet hours.** No autonomous actions between 22:00 and 07:00 local
- **Merchant allow and block lists**

### Rules that override every setting

1. **Anything signed under penalty of perjury is always the user's signature.** Settlement claim attestations, unclaimed property claims, tax forms. The agent fills; the user signs
2. **The first time the agent does anything new, it's T2.** New merchant, new payee, new account, new security
3. **Anything unusual drops a tier.** Amount spike, new device, first action after reconnecting a bank, anything the fraud model flags
4. **Irreversible actions need an approval at least once per counterparty.** Wires and trades can't be clawed back; cancellations and card payments mostly can

### The action ledger

Every action — at any tier — writes one immutable record: what, when, which rail, which partner, amount, the evidence that triggered it, the tier it ran at, who approved it, and the outcome. The user sees it as a plain feed in Profile. It is also the audit file a partner, regulator or lawyer will ask for.

### Revoke

One control in Profile: **Stop everything.** It sets every capability to T0, revokes partner tokens, cancels scheduled actions, and confirms in one screen what was stopped. It must work in under five seconds and must never require a confirmation dialogue longer than one tap.

## Capability map

The core capabilities at a glance. **Max tier** is the highest the user can unlock. **Rail** is what actually executes it. **License exposure** is what happens if it's built without the right partner. The full catalog of everything the agent can do follows in the next section.

| Capability | Max tier | Rail | License exposure | Reversible | Phase |
| --- | --- | --- | --- | --- | --- |
| **Money in** | | | | | |
| Unclaimed property search | T3 | State databases | Finder law if charged for | — | 1 |
| Unclaimed property claim | T2, user signs | State claim portal | Finder law; sworn form | No | 1 |
| Duplicate or wrong charge dispute | T3 | Bank or card digital dispute | Low | Yes | 1 |
| Price adjustment request | T3 | Merchant support channel | Low | Yes | 2 |
| Class action settlement claim | T2, user signs | Administrator site | Perjury attestation | No | 2 |
| Travel delay compensation | T3 | Airline claim form | Low | Yes | 3 |
| Security deposit demand | T2 | Email or letter | Unauthorized practice of law if advice | Yes | 2 |
| Bank fee reversal request | T3 | Bank chat or phone | Low | Yes | 1 |
| Earn route setup | T2 | Operator sign-up | Endorsement disclosure | Varies | 2 |
| **Money out** | | | | | |
| Cancel subscription | T3 | Browser session or merchant API | Merchant terms, credential security | Mostly | 1 |
| Pay a bill | T3 | Agent card rails, user's own tokenized card | None if Upmore never holds funds | Partly | 2 |
| Negotiate a bill | T3 | AI voice call or chat | Call-recording consent, bot disclosure | Yes | 3 |
| Buy something | T2 | Agent card rails | Low | Returns | 3 |
| Start a return | T3 | Merchant portal | Low | Yes | 3 |
| **Money managed** | | | | | |
| Budget, track, safe to spend | T0 | Aggregator | Low | — | 1 |
| Deadlines and reminders | T0 | Internal | Low | — | 1 |
| Move money to savings | T3 | Payments partner, user's own accounts | Money transmission if Upmore holds funds | Yes | 2 |
| Extra debt payment | T3 | Agent card rails or bill pay | Low | Partly | 2 |
| Change billing dates | T2 | Merchant settings | Low | Yes | 2 |
| **Money protected** | | | | | |
| Fraud and anomaly alerts | T0 | Internal | Low | — | 1 |
| Freeze a card | T3 | Issuer app or API | Low | Yes | 2 |
| Credit report and score view | T0 | Credit bureau partner | FCRA permissible purpose | — | 3 |
| Insurance reshop | T2 | Quote partner | Insurance licensing if Upmore sells | Yes | 4 |
| W-4 change prepared | T1 | Employer portal, user submits | Low | Yes | 2 |
| Tax filing | T1 | Handoff to e-file partner | IRS e-file authorization | — | 4 |
| **Money grown** | | | | | |
| Company teardown | T0 | Filings, published sources | Adviser status if personalized | — | 1 |
| Portfolio view | T0 | Brokerage aggregator | Low | — | 2 |
| Trade the user chooses | T3 | Brokerage API | Broker-dealer if not partnered | No | 3 |
| Recurring investment the user set | T3 | Brokerage API | Same | No | 3 |
| Agent-managed investing | T3 | Registered adviser | Investment Advisers Act | No | 4 |

Three capabilities never go past T2 regardless of settings: anything the user signs under oath, anything with a new counterparty, and any first trade in a security.
## Full capability catalog

Everything the best finance agent in the world should be able to do for one person, grouped by the part of their money it touches. The benchmark is a household with a CFO, an accountant, a banker, an insurance broker and a concierge — then asking what an agent can do of all that.

Each row: what the agent does, the highest tier it can reach, and the watch-out that decides how it's built. "User signs" means the agent prepares and the user submits, because the form is sworn or legally the user's own statement.

### Income and pay

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Paycheck check | Compares every paycheck to expected hours, rate and deductions; flags shortfalls | T0 | — |
| Pay stub reader | Explains every line of a pay stub in plain words | T0 | — |
| Withholding tune-up | Works out the right W-4 and shows the effect on the next check | T1, user submits | Year-stamped figures |
| Direct deposit split | Sets a percentage of pay to go straight to savings | T2 | Employer portal |
| Income smoothing | Turns irregular pay into a steady weekly amount from a buffer | T3 | User's own accounts only |
| Early pay finder | Flags accounts that release direct deposits early | T0 | — |
| Raise benchmark | Published pay ranges for the user's role and city | T0 | Sourced ranges only |
| Raise case builder | Drafts the ask with the numbers behind it | T1 | — |
| Wage check | Flags possible unpaid overtime or below-minimum pay against state rules | T0 | Points to the state labor office; not legal advice |
| Final paycheck tracker | Tracks the legal deadline for final pay after leaving a job | T0 | State-specific |
| Unemployment prep | Checks eligibility, gathers documents, reminds weekly certifications | T1, user signs | Sworn |
| Tip and cash income log | Records income that never hits a bank | T0 | — |

### Self-employed and gig

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Income consolidation | One view of Uber, DoorDash, Upwork, Stripe, PayPal and other payouts | T0 | Aggregator coverage |
| Invoicing | Creates and sends invoices | T2 | — |
| Invoice chasing | Follows up at 7, 30 and 60 days late | T3 | Collecting your own money only |
| Expense categorisation | Separates business costs from personal | T0 | — |
| Mileage log | Builds a deductible mileage record from trips | T0 | Location permission |
| Tax set-aside | Moves a set share of each payout to a tax bucket | T3 | User's own accounts |
| Quarterly estimates | Calculates estimated tax and puts the deadlines on the Due tab | T0 | — |
| Estimated tax payment | Pays the IRS through its own payment system | T2 | User's bank, IRS rails |
| 1099 reconciliation | Matches 1099s to payouts received and flags gaps | T0 | — |
| Freelance rate check | Published rate ranges for the work | T0 | — |

### Bills

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Bill calendar | Every bill, its due date and usual amount in one timeline | T0 | — |
| Bill pay | Pays bills from the user's own card or bank | T3 | Partner rails; never holds funds |
| Autopay setup | Turns on autopay at the biller | T2 | Biller portal |
| Due-date alignment | Moves due dates to land after payday | T2 | Biller settings |
| Bill spike explainer | Explains why a bill jumped, from usage and rate history | T0 | — |
| Budget billing | Enrols utilities in level monthly billing | T2 | — |
| Bill negotiation | Calls or chats retention lines for a lower rate | T3 | AI disclosure, all-party recording consent |
| Late fee waiver | Asks the biller to reverse a late fee | T3 | — |
| Payment confirmation | Confirms every payment posted and was applied | T0 | — |
| Double-payment guard | Blocks paying the same bill twice | T3 | — |
| Rent reporting | Reports on-time rent to credit bureaus | T2 | Reporting partner |
| Roommate split | Splits shared bills and sends payment requests | T2 | Request link only; no money held |

### Subscriptions

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Subscription finder | Finds every recurring charge across all accounts | T0 | Annual ones need 13 months of history |
| Cancel | Cancels and confirms no further charge | T3 | Merchant terms, credential vault |
| Pause | Pauses instead of cancelling where offered | T3 | — |
| Downgrade | Moves to a cheaper tier | T3 | — |
| Trial guard | Cancels trials before they convert unless the user says keep | T3 | — |
| Overlap finder | Flags paying for three services that do the same job | T0 | — |
| Rotation | Keeps one streaming service at a time and swaps monthly | T3 | — |
| Annual switch | Switches to annual billing when it's cheaper and used all year | T2 | Only with usage history |
| Discount switch | Moves to student or assistance-program pricing the user qualifies for | T2 | Eligibility proof |
| Family plan merge | Combines separate plans into one shared plan | T2 | Other people's consent |
| Price rise alert | Flags silent price increases | T0 | — |
| Prorated refund | Requests a refund for the unused part of a cancelled plan | T3 | — |
| App-store subscriptions | Deep-links to Apple or Google subscription settings | T1 | Platforms block third-party cancels |

### Shopping

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Price check | Compares a price across retailers before the user buys | T0 | Show cheapest even if unpaid |
| Price watch | Tracks an item and buys when it hits a target price | T2 | New merchant is always T2 |
| Price adjustment | Claims the difference when a price drops inside the window | T3 | Merchant policy |
| Cashback activation | Applies cashback portals and card offers at checkout | T3 | Affiliate disclosure on the card |
| Promo codes | Finds and applies valid codes | T3 | — |
| Reorders | Rebuys routine items on schedule | T3 | Exact repeats only |
| Cheaper equivalent | Finds the same recurring item cheaper or in a better size | T2 | Only identical items |
| Receipt vault | Collects receipts from email and photos | T0 | Email scope rules |
| Returns | Starts returns inside the window and tracks the refund | T3 | — |
| Warranty registration | Registers products and stores warranty terms | T3 | — |
| Card protection claims | Files purchase protection and extended warranty claims through the card | T2 | Documentation |
| Lost package claims | Files claims for late, lost or damaged deliveries | T3 | — |
| Gift card tracker | Tracks balances and spends them before they expire | T0 | — |
| Resell | Lists unused items on marketplaces | T2 | User ships |
| Big purchase check | Runs the purchase against safe-to-spend before buying | T0 | — |

### Travel and points

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Points balances | One view of every airline, hotel and card program | T0 | — |
| Expiring points | Warns before points or miles expire | T0 | — |
| Best redemption | Finds the highest-value use of points for a trip | T0 | — |
| Fare watch and rebook | Rebooks when a fare drops and captures the credit | T3 | Only on refundable or credit-back fares |
| Hotel rebook | Rebooks refundable stays when the price drops | T3 | — |
| Travel credits | Tracks airline credits and their expiry | T0 | — |
| Delay compensation | Files claims for delays and cancellations | T3 | Rules differ by carrier and region |
| Card travel coverage | Explains the rental car, trip delay and baggage cover the user's cards include | T0 | — |
| Foreign fee avoidance | Picks the card with no foreign transaction fee for a trip | T0 | — |
| Trip budget | Plans and tracks spending for a trip | T0 | — |

### Money recovery

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Unclaimed property search | Searches every state lived in plus federal sources, quarterly | T3 | Must stay free |
| Unclaimed property claim | Fills the claim and gathers the documents | T1, user signs | Finder law; sworn |
| Forgotten accounts | Finds old bank, brokerage and retirement accounts | T0 | — |
| Old 401(k) finder | Locates retirement money left at past employers | T0 | — |
| Escheated wages | Recovers unpaid final pay sent to the state | T1, user signs | Sworn |
| Duplicate charge dispute | Disputes double charges through the card or bank | T3 | 60-day window |
| Services not delivered | Disputes charges for things that never arrived or were cancelled | T2 | User's account of events |
| Bank fee reversal | Asks the bank to reverse overdraft and maintenance fees | T3 | — |
| Settlement matching | Finds class actions the user may qualify for from purchase history | T0 | — |
| Settlement claim | Prepares the claim with evidence | T1, user signs | Perjury attestation; never bulk |
| Security deposit | Drafts the demand citing local deposit rules | T2 | Template, not legal advice |
| Medical bill errors | Finds errors and disputes them | T2 | — |
| Insurance claims | Files claims and chases payment | T2, user signs | Statements of fact are the user's |
| HSA and FSA reimbursement | Submits eligible expenses for reimbursement | T2 | Plan rules |
| Employer reimbursements | Chases unpaid expense reports | T3 | — |
| Rebates | Files manufacturer and utility efficiency rebates | T2 | — |
| Recall refunds | Matches purchases to recalls and claims the remedy | T2 | — |
| Missed tax refunds | Flags years where a refund was never claimed | T0 | Three-year deadline |
| Utility deposit return | Recovers deposits held by utilities after moving | T3 | — |
| Store credit and gift cards | Finds and uses balances before they expire | T0 | — |
### Banking and cash

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Fee audit | Totals every bank fee paid in a year | T0 | — |
| Account comparison | Compares the user's accounts with better ones | T0 | Show the best even if unpaid |
| Open an account | Starts the application with details prefilled | T2 | User completes identity checks |
| Safe account switch | Moves direct deposit and every autopay before closing the old account | T2 | Nothing missed |
| Close an account | Closes only after bonus periods and pending items clear | T2 | Early-closure fees |
| Overdraft guard | Moves money in before a charge would overdraw | T3 | User's own accounts |
| Low balance forecast | Warns days ahead of a shortfall | T0 | — |
| Cash buffer | Keeps a minimum balance the user sets | T3 | — |
| Idle cash sweep | Moves spare cash to a higher-yield account | T3 | Licensed payments partner |
| Rate watch | Alerts when the savings rate drops below good alternatives | T0 | — |
| Deposit insurance check | Flags balances above insured limits | T0 | — |
| ATM fee avoidance | Finds in-network ATMs and fee-free withdrawals | T0 | — |
| Account inventory | Keeps a list of every account the user holds | T0 | — |

### Savings and goals

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Goals | Tracks progress from real balances, not self-reports | T0 | — |
| Payday saving | Saves a set amount or share on payday | T3 | Never below buffer |
| Round-ups | Saves spare change from purchases | T3 | — |
| Save the surprise | Saves part of refunds, bonuses and windfalls | T3 | User sets the share |
| Sinking funds | Saves ahead for known annual costs like insurance or holidays | T3 | — |
| Emergency fund target | Sets the target from actual fixed costs | T0 | — |
| Goal pacing | Shows the finish date and what would bring it forward | T0 | Computed, not estimated |
| Treasury and CD explainer | Explains T-bills, CDs and ladders with current rates | T0 | Buying routes through brokerage partner |

### Debt

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Debt inventory | Every balance, rate and minimum in one list | T0 | — |
| Payoff order | Orders debts by interest cost, with the arithmetic shown | T0 | Extra payments |
| Extra payments | Pays extra toward the most expensive debt on rules the user sets | T3 | Never below buffer |
| Minimum safety net | Makes sure every minimum is paid on time | T3 | — |
| Promo expiry | Warns before a 0% period or deferred interest ends | T0 | — |
| Balance transfer math | Works out whether a transfer saves money after the fee | T0 | Never arranges the loan |
| Refinance check | Compares the user's rate to current market rates | T0 | Takes no referral fee; lending brokerage is licensed |
| Rate reduction call | Asks card issuers to lower the APR | T3 | AI disclosure |
| Hardship request | Asks lenders about hardship programs | T2 | Debt relief rules: never charge for this |
| Buy now pay later tracker | Tracks every installment and due date | T0 | — |
| Payday loan exit | Spots payday loans and shows cheaper options like credit union loans | T0 | No referral fees |
| Collection letters | Explains the letter and the user's rights; drafts a validation request | T1 | Template, not legal advice |

### Student loans

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Loan inventory | Every federal and private loan, servicer, rate and status | T0 | — |
| Plan comparison | Shows the monthly cost under each repayment plan | T0 | Current plan rules only |
| Recertification deadlines | Tracks income-driven plan recertification dates | T0 | — |
| Recertification prep | Prepares the recertification with income documents | T1, user signs | Sworn |
| Forgiveness tracking | Tracks qualifying payments and employment for forgiveness programs | T0 | — |
| Grace period alerts | Warns before the first payment is due after graduation | T0 | — |
| Servicer error check | Flags misapplied payments | T0 | — |

Student loan help must always be free. Charging for enrolment in federal repayment or forgiveness programs is exactly the model regulators have shut down repeatedly.

### Credit

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Report and score | Shows the report and score through a bureau partner | T0 | User's permission is the legal basis |
| Score explainer | Explains what is moving the score | T0 | No promises of improvement |
| Utilisation timing | Pays down a card before its statement closes to lower the reported balance | T3 | — |
| New account alerts | Flags new accounts and hard inquiries | T0 | — |
| Freeze walkthrough | Guides the user through freezing credit at each bureau | T1 | Bureaus require the user |
| Error spotting | Points out likely errors and links the free bureau dispute | T0 | No disputing for the user: credit repair law |
| Limit increase request | Requests a higher limit on an existing card | T2 | May cause a hard pull; warn first |

### Investing

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Company teardown | Price, revenue, the ratio worked out, both cases, what to check | T0 | Same output for everyone |
| Watchlist | Tracks companies the user names, with price and news alerts | T0 | — |
| Earnings calendar | Flags upcoming earnings for held and watched companies | T0 | — |
| Earnings digest | Summarises what a company reported, with the numbers | T0 | Sourced and dated |
| Portfolio view | All brokerage and retirement accounts together | T0 | Read-only aggregator |
| Allocation facts | Shows how concentrated the portfolio is, as figures | T0 | Facts, no verdicts |
| Fee audit | Shows fund fees in dollars per year | T0 | — |
| Cash drag | Flags cash sitting uninvested in a brokerage account | T0 | — |
| Dividend tracker | Tracks dividends paid and upcoming | T0 | — |
| Trade execution | Buys or sells what the user names | T3 | Brokerage partner; first trade in a security is T2 |
| Recurring investing | Invests a set amount on a schedule the user chose | T3 | Brokerage partner |
| Rebalance to targets | Rebalances to percentages the user set | T3 | If the agent sets the targets, it's advice |
| Filings view | Shows institutional and insider filings with their age in days | T0 | Always state staleness |
| Tax-loss harvesting | Sells losers to offset gains and buys similar holdings | T3 | Requires a registered adviser |
| Managed portfolios | The agent chooses and manages the investments | T3 | Requires a registered adviser |

### Retirement

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Employer match check | Flags free match money the user isn't collecting | T0 | — |
| Contribution change | Prepares the change in the employer plan | T1, user submits | Employer portal |
| Contribution limits | Tracks contributions against the current year's limits | T0 | Year-stamped, computed |
| Roth or traditional explainer | Shows the tradeoff with the user's own numbers | T0 | Explanation, not a pick |
| Old plan finder | Finds retirement plans at past employers | T0 | — |
| Rollover | Moves an old plan into an IRA or new plan | T2 | Custodian paperwork; user signs |
| Retirement projection | Projects balances under stated assumptions | T0 | Assumptions shown |
| Beneficiary check | Flags accounts with no beneficiary named | T0 | — |
| Equity compensation | Tracks vesting of stock grants and purchase plans | T0 | — |

### Tax

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Refund or owe forecast | Estimates the year-end result all year | T0 | Labelled as an estimate |
| Credit finder | Flags credits the user may qualify for: education, earned income, saver's, state credits | T0 | Explains; the preparer decides |
| Deduction finder | Flags deductions worth checking, with the user's numbers | T0 | Same |
| Document collection | Gathers W-2s, 1099s, 1098-T, 1098-E and similar | T0 | — |
| Donation log | Records charitable giving with receipts | T0 | — |
| HSA tracking | Tracks contributions and explains the tax treatment | T0 | Year-stamped limits |
| Filing handoff | Sends the tax package to an authorised e-file partner or free VITA site | T1 | Upmore never prepares or signs |
| Refund tracker | Tracks federal and state refunds until they land | T0 | — |
| Notice explainer | Explains an IRS or state letter and the deadline to respond | T0 | Points to a professional |
| Payment plan prep | Prepares an IRS payment plan request | T1, user submits | — |
| Amendment flag | Flags past returns that may have missed money | T0 | Three-year window |
| Property tax appeal | Builds the comparables and prepares the appeal | T1, user files | County deadlines |

### Insurance

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Policy inventory | Every policy, premium, deductible and renewal date | T0 | — |
| Coverage explainer | Explains what a policy covers, from the document | T0 | — |
| Gap finder | Flags being underinsured or doubly insured | T0 | Explanation, not a sale |
| Card coverage map | Shows rental car, phone and purchase cover the user's cards already include | T0 | — |
| Renewal alerts | Warns 30 days before renewal | T0 | — |
| Reshop | Gets quotes through a licensed partner | T2 | Upmore never sells insurance itself |
| Claims | Files and chases claims | T2, user signs | — |
| Open enrolment compare | Compares health plans on the user's real usage | T0 | — |

### Health costs

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Bill and EOB matching | Matches each medical bill to the insurer's explanation of benefits | T0 | Health data consent |
| Billing error dispute | Disputes overcharges and duplicate line items | T2 | — |
| Surprise bill check | Flags out-of-network bills that federal surprise-billing rules may cover | T1 | Prepares; not legal advice |
| Financial assistance | Prepares hospital charity care applications | T1, user signs | Sworn income statements |
| Payment plans | Negotiates interest-free payment plans | T3 | — |
| HSA and FSA deadlines | Warns before use-it-or-lose-it deadlines | T0 | — |
| Prescription prices | Compares pharmacy and discount-card prices | T0 | — |

### Housing

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Rent tracking | Tracks rent paid and upcoming | T0 | — |
| Lease renewal | Warns before renewal and prepares the negotiation with local rents | T1 | — |
| Moving checklist | Transfers utilities and updates the address on every account | T2 | Each account is its own action |
| Utility setup | Starts and stops service on move dates | T2 | — |
| Renters insurance check | Flags having none and explains the cost | T0 | No sale |
| Deposit recovery | Tracks the return deadline and drafts the demand | T2 | Template, not legal advice |
| Apartment affordability | Shows what rent fits the user's real income and fixed costs | T0 | — |
| Home-buying readiness | Explains down payment, closing costs and what lenders look at | T0 | No lender referrals for fees |

### Transport

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Car cost view | Payment, insurance, gas, parking and maintenance in one number | T0 | — |
| Registration renewal | Warns and prepares the renewal | T1 | — |
| Ticket and toll disputes | Prepares disputes for wrong tickets and tolls | T1, user submits | — |
| Transit pass check | Compares a monthly pass with pay-per-ride on real usage | T0 | — |
| Commuter benefits | Checks whether the employer offers pre-tax transit or parking | T0 | — |
| Car insurance reshop | Reshops at renewal through a licensed partner | T2 | — |
| Car loan check | Compares the user's auto loan rate with current rates | T0 | No referral fees |

### Students

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| FAFSA | Tracks deadlines and gathers the documents | T1, user submits | Sworn |
| Aid disbursement | Tracks when aid and refunds hit the student account | T0 | — |
| Tuition refunds | Claims refunds for dropped courses inside the deadline | T2 | School policy |
| Meal plan balance | Warns before unused dining dollars expire | T0 | — |
| Scholarship deadlines | Tracks scholarships the user is applying to | T0 | — |
| Education credits | Uses the 1098-T to flag education tax credits | T0 | Preparer decides |
| Textbook resale | Lists used books at the end of term | T2 | — |
| Student pricing | Moves services to student discounts | T2 | Enrolment proof |

### Benefits and assistance

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Benefits screen | Checks eligibility for food, energy, phone and health assistance programs | T0 | — |
| Application prep | Prefills applications from the user's records | T1, user signs | Sworn |
| Employer perks audit | Finds unused stipends, tuition help, wellness and commuter benefits | T0 | — |
| Dependent care accounts | Explains pre-tax childcare accounts and deadlines | T0 | — |
| Utility assistance | Applies for bill assistance and payment programs | T1, user signs | — |

### Protection and security

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Fraud alerts | Flags unusual charges and card-testing patterns | T0 | — |
| Card freeze | Freezes a card when fraud is likely | T3 | Reversible |
| Scam check | Checks whether a bill, text or email asking for money is real | T0 | — |
| Breach response | Walks through freezes and resets after a data breach | T1 | — |
| New login alerts | Flags new devices on connected accounts | T0 | Where partners expose it |
| Replacement card | Updates every merchant with the new card number after a replacement | T2 | Each merchant is its own action |

### Household and shared money

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Shared expenses | Tracks shared costs with roommates or a partner | T0 | Each person's own consent |
| Split and request | Splits a cost and sends a payment request | T2 | Request link only |
| IOU tracker | Tracks who owes whom | T0 | — |
| Shared goals | Tracks a goal two people save toward | T0 | Both must opt in |
| Couple view | A joint picture that each person chooses to share into | T0 | No one sees what isn't shared |

### Life events

Playbooks the agent runs end to end when something big happens. Each is a checklist of the capabilities above, sequenced.

| Event | What the agent handles |
| --- | --- |
| New job | W-4, benefits enrolment, retirement match, direct deposit split, old plan rollover |
| Job loss | Runway, unemployment prep, health cover options, pausing subscriptions, hardship requests |
| Moving | Utility transfers, address updates, deposit recovery, renters insurance |
| Graduating | Loan grace period, repayment plan choice, first real budget, employer benefits |
| Moving in with someone | Shared expenses, shared goals, lease and bill setup |
| Raise or bonus | Tax effect, saving the difference, updating goals |
| Losing a card or wallet | Freezes, replacement, updating every merchant |

### Planning and reporting

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Safe to spend | Money free until payday, as a total and per day | T0 | Computed from rows |
| Monthly close | In, out, what changed, what's coming — in ninety seconds | T0 | — |
| Net worth | Everything owned minus everything owed, over time | T0 | — |
| Cash flow forecast | Balance projected 90 days ahead | T0 | Assumptions shown |
| Runway | How long the user could last on current cash | T0 | — |
| Affordability | Whether a purchase fits, and when it would | T0 | — |
| Scenarios | What changes if the user cancels, moves or earns something | T0 | Every figure from a function |
| Big purchase plan | A savings plan and date for a car, deposit or trip | T0 | — |
| Year in money | Annual review of where money went and what Upmore recovered | T0 | Confirmed amounts only |
| Spending patterns | Explains patterns with the numbers behind them | T0 | No judgement |

### Documents and admin

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Document vault | Statements, tax forms, policies, leases, warranties in one place | T0 | Encrypted |
| Receipt capture | Saves receipts from email or photos | T0 | — |
| Proof of income | Produces a statement of income for a landlord or lender | T1 | User shares it |
| Account inventory | A list of every financial account, for the user or a trusted person | T0 | — |
| Full export | Everything Upmore holds, downloadable | T0 | — |

### Earning

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Bank bonuses | Matches verified bonuses the user qualifies for and tracks requirements | T2 | Terms verified and dated |
| Paid studies and testing | Surfaces studies the user is eligible for | T0 | Honest screeners only |
| Cashback | Tracks and redeems cashback across cards and portals | T3 | — |
| Sell what you own | Lists items the user no longer needs | T2 | — |
| Referral earnings | Tracks Upmore referral rewards and tax reporting | T0 | Tax forms at threshold |

### How the agent communicates

| Capability | What the agent does | Max tier | Watch-out |
| --- | --- | --- | --- |
| Phone calls | Calls companies, waits on hold, negotiates, reports back | T3 | Discloses it's an AI; no recording without all-party consent |
| Support chats | Handles merchant and bank chat support | T3 | — |
| Emails and letters | Drafts and sends from the user's own address | T2 | Sent in the user's name, so T2 by default |
| Form filling | Completes online forms | T3 | Never the attestation box |
| Follow-ups | Keeps chasing until the task is resolved | T3 | — |
| Multi-step errands | "Move all my autopays to the new bank" as one task | T2 | Each step logged |
| Scheduling | Books callbacks and appointments with providers | T3 | — |

### Count

The catalog above lists about 260 capabilities across 28 areas. Around a third run on read access alone; about half need an action rail; a small number need a licensed partner or registration. The build order that follows ships them in the order that earns trust fastest, not in catalog order.
## Money in

The fastest wins and the best marketing. Every item here returns money that is already the user's, which is why it is the lead feature and why it must stay free where the law requires it.

### Unclaimed property

- **Search:** every state the user has lived in, plus federal sources, on signup and again every quarter. Runs at T3 by default because it only reads
- **Claim:** the agent fills the state claim form, gathers the documents it needs (ID, proof of old address from past bills or leases the user uploads), and hands over a ready form. **The user submits and signs**, because claim forms are sworn
- **Must stay free and outside the paywall.** Illinois now licenses anyone "assisting" recovery for a fee paid by the owner, and a subscription is a fee. The claim flow shows "You can claim this yourself for free" on every screen
- **Tracks to payout.** Nothing counts in the ledger until the state pays

### Disputes and wrong charges

- **Detects:** duplicate charges, charges after a cancellation, amounts that don't match a receipt, merchants the user doesn't recognise
- **Acts:** files the dispute through the bank's or card issuer's own digital dispute flow, inside the user's authorised session, with the evidence attached
- **Deadline-aware:** card billing disputes and bank transfer errors both have 60-day windows from the statement. The agent files by day 45 at the latest
- **At T3** only for clear duplicates under the user's cap. Anything that needs the user's account of events stays T2

### Refunds, price adjustments and fee reversals

- **Price drops:** watches items bought at merchants with price-adjustment policies and requests the difference inside the window
- **Bank fees:** requests reversal of overdraft and maintenance fees by chat or phone. Banks routinely waive the first one
- **Travel compensation:** files airline claims for qualifying delays and cancellations from booking and flight data
- **Returns:** starts the return in the merchant portal and tracks the refund landing

### Settlements

- **Matches** purchase history against open class action settlements and shows the user why they may qualify
- **Prepares** the claim with every factual element pre-filled from their own records
- **Never** ticks the attestation, never picks a payout tier without documentary support, never submits in bulk. Courts have rejected mass third-party claim filers; the user files their own

### Security deposits

- Drafts a demand letter citing the deposit rules for the user's city and state, which the user reviews and sends
- Frames it as a template the user controls, never as legal advice, and includes a line pointing to legal aid

### Earn routes

- Surfaces verified routes the user actually qualifies for (bank bonuses, paid studies) with the terms and the verification date
- Sets up the account through the operator's own sign-up at T2; tracks requirements like direct deposit deadlines on the Due tab
- Discloses any affiliate relationship on the card itself

## Money out

### Cancel subscriptions

The first fully autonomous capability, because no money moves and no license is needed.

- **How it executes, in order of preference:** a merchant cancellation API where one exists; otherwise a browser session inside the user's own authorised login; otherwise a drafted email, letter or phone script the user sends
- **Credentials** live in an encrypted vault, are used only for the action the user approved, and are never visible to the model or in logs
- **Retention offers:** the agent declines them by default and reports what was offered. The user can set "accept discounts over 40%" as a rule
- **Confirmation:** a cancellation is only marked done when the next billing date passes with no charge. If a charge appears, the agent disputes it automatically
- **Cannot do:** app-store subscriptions (Apple and Google only allow cancellation inside their own settings — the agent deep-links there), and merchants that only cancel in person or by certified mail (the agent writes the letter)

### Pay bills

- **Rail:** agent payment networks. Visa Intelligent Commerce and Mastercard Agent Pay let an agent pay with the user's own tokenized card under spend controls. Upmore never holds the money
- **Bank-account bills** (rent, utilities that don't take cards) run through the user's own bank bill pay or a licensed payments partner, never through an Upmore account
- **T3 rules:** only recurring payees the user has paid before, only within the match tolerance, only under the cap, and never earlier than three days before the due date so the user can still stop it
- **Pre-flight check every time:** balance after payment must stay above the user's buffer. If it wouldn't, the agent holds and asks

### Negotiate bills

- The agent calls or chats with retention departments for internet, phone and insurance, armed with competitor prices and the user's history
- **Legal requirements on calls:** disclose that it's an AI at the start of the call; never record without all-party consent (Illinois is an all-party consent state); stop immediately if asked for a human the user must authorise
- Accepts an offer only within rules the user set (for example "accept any reduction over $10/month with no new contract"). Anything that adds a contract term is T2
- The saving counts in the ledger only when the first lower bill posts

### Buy things

- User asks for something ("reorder my contact lenses," "cheapest flight to Newark on the 20th"); the agent finds it, shows the price and total, and buys on approval
- T2 always for new merchants and anything over the cap. T3 only for exact reorders the user has marked recurring
- Shows the cheapest option even when it pays Upmore nothing, and discloses any affiliate relationship

### Returns

- Starts returns inside the merchant's window, prints or emails the label, and tracks the refund
- Reminds the user to drop it off; refund counts as Received only when it lands

## Money managed and protected

### Budget, track, safe to spend

- Built from transactions with zero data entry: income cadence detected, bills classified as fixed, variable or flexible
- **Safe to spend** = balance minus fixed bills due before next payday minus buffer. Shown as a total and a daily figure
- Every number is computed by code and traceable to rows. The model explains numbers; it never produces them

### Deadlines and reminders

- Fifteen deadline sources: bills, trials converting, annual renewals, promo rates ending, return windows, dispute windows, settlement deadlines, bank bonus requirements, early-closure fee windows, insurance renewals, contract renewals, enrolment windows, warranties, gift card expiry
- Every reminder carries its evidence and a **Do this for me** button that hands the task straight to the agent
- Push notifications capped at one a day and three a week, only for things that expire

### Move money to savings

- Sweeps spare cash from checking to the user's own savings or high-yield account on rules the user sets ("anything over $500 on payday")
- Runs through the user's own banks via a licensed payments partner. **Upmore never holds the money in between**, which is what keeps it out of money-transmitter licensing
- Never sweeps if safe-to-spend would drop below the buffer

### Debt

- Orders debts by interest cost and shows the arithmetic
- Makes extra payments on the user's rules ("put anything left on the 28th toward the Discover card")
- Flags promotional 0% periods ending and balance transfer deadlines on the Due tab

### Fraud and security

- Flags unusual charges, new merchants, card-testing patterns and subscription creep
- **Freezes a card** through the issuer's app or API at T3 when fraud is likely — freezing is reversible and the cost of a false freeze is small
- After a data breach, walks the user through credit freezes and account resets

### Credit

- Shows the credit report and score through a credit bureau partner, with the user's permission as the legal basis for pulling it
- Explains what's on the report
- **Does not** dispute credit report items, promise score improvements, or charge for anything credit-related. That is credit repair, and the federal law on it makes subscription fees refundable

### Insurance

- Reads uploaded policies and explains what is and isn't covered — including telling a user they're underinsured
- Reshops renewals through a licensed quote partner. Upmore never sells or recommends a specific policy itself

### Tax

- Explains how provisions work using the user's own numbers as a worked example, and flags credits they may be missing
- Prepares a W-4 change and shows the effect on the next paycheck; the user submits it in their employer's portal
- Hands filing to an authorised e-file partner. Upmore never prepares or signs a return

## Money grown

Investing has three layers with three very different legal weights. They ship in order, and the third does not ship until the second is proven.

### Layer 1: understand (ships first, no partner)

- **Teardowns** of any company the user names: what you'd pay, against what, the ratio worked out step by step, what has to be true, what would break it, what to check next — every figure sourced and dated
- **Both sides always.** A request for the bull case still closes with the bear case, and the reverse
- **Identical for everyone.** The same company gets the same teardown regardless of who asks. This is what keeps it publishing rather than personalised advice
- **Portfolio view** of accounts the user links: holdings, allocation, fees, dividends. Facts only

### Layer 2: execute what the user decides (brokerage partner)

- **Rail:** a brokerage API from a licensed broker-dealer, such as Alpaca. The partner is the broker of record, holds the account and handles custody; Upmore is the app on top
- **What the agent does:** "buy $50 of VOO," "sell half my Tesla," "put $25 into an S&P fund every payday." The user names the security and the amount; the agent executes
- **Tiers:** the first trade in any security is T2. Recurring investments the user set up run at T3 inside their cap
- **Pre-flight:** never invests money needed for bills before payday. Never trades if safe-to-spend would drop below the buffer
- **Account opening** runs the partner's identity checks; Upmore collects what the partner needs and passes it through

### Layer 3: the agent decides (registered adviser)

- **What it is:** "invest $500 for me" — the agent chooses what to buy, how much, and when to rebalance
- **What it requires:** that is discretionary investment advice, which requires a registered investment adviser. Either Upmore registers (Illinois state registration below $100M under management) or partners with a registered adviser that runs managed portfolios
- **Scope at launch:** a small set of diversified model portfolios matched to a short suitability questionnaire — not stock picking
- **Duties that come with it:** a fiduciary obligation to the user, suitability, disclosure documents, record-keeping, and a compliance owner

### What investing never does

- Pick individual stocks for the user
- Invest money flagged as needed for bills, or invest for any user with negative safe-to-spend or recent overdrafts
- Offer options, margin, leverage, crypto trading or prediction markets
- Show a "top picks" or "what others are buying" list
- Pay creators to talk about specific securities
- Ship Layer 3 before a securities lawyer has signed off

## How the agent executes

### Execution methods, in order of preference

| Method | Used for | Why this order |
| --- | --- | --- |
| Partner API | Payments, trades, card freezes, account data | Fastest, most reliable, clearest liability |
| Merchant API | Cancellations and changes where offered | Official, rarely breaks |
| Browser session | Cancellations, claims, disputes, returns without an API | Works everywhere, breaks when sites change |
| Voice call | Negotiations, bank fee reversals, phone-only cancels | Needed where there is no other channel |
| Drafted message | Letters, emails, anything the user must send | Fallback that always works |

The browser path never bypasses a CAPTCHA, bot wall or rate limit. Circumventing those now carries separate copyright-law exposure. If a site blocks automation, the agent falls back to the next method and tells the user.

### The proactive loop

This is what makes Upmore an agent rather than a chatbot, and it is the thing ChatGPT does not do.

1. **Nightly:** deterministic monitors scan every connected account — new subscriptions, price rises, trials converting, duplicate charges, low balance ahead, claim matches, deadline windows
2. **Findings** become cards on Home and reminders on the Due tab, each with its evidence
3. **T3 items** the user has pre-approved run automatically and appear in the action ledger
4. **Everything else** waits on a **Do this for me** tap, which sends it to the Agent chat
5. **Morning:** one summary line on Home — what the agent did overnight and what needs the user

### The chat

- Two threads: **Agent** (hand off tasks) and **Ask** (questions)
- The agent shows its work live as a checklist, then either completes the action or hands the user one card with one button
- Every figure in any answer comes from a function call and shows where it came from

### Memory

- Remembers stated facts ("my rent is split with a roommate"), corrections, rules the user set, and preferences
- Never stores guesses about the user's habits or psychology
- User can view and delete every memory in Profile

### Failure handling

| Failure | What the agent does |
| --- | --- |
| Site changed, action failed | Retries once, then falls back to the next method and tells the user plainly |
| Partner rejected the action | Shows the reason; never retries a declined payment on its own |
| Action succeeded but outcome didn't happen | Cancellation charged anyway, refund never arrived: reopens the task and escalates |
| Unsure what the user meant | Asks one question rather than guessing |
| Anything it can't do | Says so and gives the user the exact steps |

The rule behind all of these: **a failed action the user knows about is recoverable. A failed action the user thinks succeeded is how trust dies.**

## Partners and licensing

### Partner stack

| Need | Partner type | Examples | What they require from Upmore |
| --- | --- | --- | --- |
| Account data | Aggregator | Plaid, MX | Security review, privacy policy, user consent flow |
| Agent card payments | Card network agent program | Visa Intelligent Commerce, Mastercard Agent Pay | Integration, spend controls, authentication |
| Bank transfers | Licensed payments partner | Plaid Transfer or a bank partner | Diligence, fraud controls, no funds held by Upmore |
| Trades | Broker-dealer API | Alpaca, DriveWealth, Apex | Company entity, identity checks, compliance contact |
| Managed investing | Registered adviser | Own registration or adviser partner | Fiduciary program, disclosures, compliance owner |
| Credit report | Credit bureau | Experian | Permissible purpose, security review |
| Tax filing | Authorised e-file partner | Preparer or filing platform | Handoff agreement |
| Brokerage viewing | Brokerage aggregator | SnapTrade, Plaid Investments | Read-only scopes |

### What Upmore itself must become or have

- A registered company (Delaware C-corp recommended) with a D-U-N-S number — Apple requires a legal entity for finance apps
- A written information security program, encryption, MFA everywhere, and an incident response plan
- Identity verification and fraud screening before any money-moving capability turns on, using the partners' tools
- SOC 2 within the first year — payment and brokerage partners will ask
- A securities lawyer engaged **before** Layer 2 investing ships, and a registered adviser (own or partner) **before** Layer 3
- Errors and omissions plus cyber insurance, confirming the policy covers agent actions
- A named person responsible for compliance, even if that is the founder at first

### The permanent never list

These stay at T4 no matter what a user sets or asks for.

1. **Hold user money** in an Upmore account, even briefly
2. **Sign anything under oath** on the user's behalf
3. **Lend money,** advance paychecks, or offer credit of any kind
4. **Credit repair:** disputing credit report items or promising score improvements
5. **Gambling, prediction markets, sports betting** or anything with a stake on an outcome
6. **Crypto trading, options, margin or leverage**
7. **Pick individual stocks** for a user
8. **Charge for unclaimed property recovery**
9. **Bypass a site's bot protection,** CAPTCHAs or rate limits
10. **Record a call** without every party's consent
11. **Act for anyone under 18,** or for anyone other than the account holder
12. **Sell or share user data,** or use it to train models
13. **Invent a number.** Every figure comes from a computation over real rows

## Build order

| Days | Ship | Why in this order |
| --- | --- | --- |
| 1–10 | Permission tiers, action ledger, Stop everything | Nothing else is safe to build without them |
| 11–20 | Aggregator connection, budget, track, deadlines | The data every action depends on |
| 21–35 | Agent cancels subscriptions, with confirmation watch | Fully autonomous, zero licensing, the first "wow" |
| 36–45 | Disputes and fee reversals | Returns cash fast, low risk |
| 46–55 | Unclaimed property search and claim prep (free) | Biggest single amounts, best marketing |
| 56–75 | Bill pay on agent card rails | First money movement, on a partner's rails |
| 76–90 | Savings sweeps and extra debt payments | Same rails, higher trust needed |
| 91–120 | Brokerage partner, trades the user chooses | After a securities lawyer reviews it |
| 121+ | Negotiation calls, buying, returns, credit view, insurance reshop | Each after the one before is reliable |
| Later | Agent-managed investing | Only with a registered adviser in place |

## The 10x test

ChatGPT Finances is the benchmark: it connects accounts through Plaid and is available to Plus users, so it's what users will compare Upmore to. Run the same accounts through both and write the 10x threshold down **before** testing.

| Measure | How | 10x looks like |
| --- | --- | --- |
| Tasks actually completed | Hand off 10 real tasks: cancel, dispute, claim, pay | Upmore finishes most; ChatGPT finishes none, because it doesn't act |
| Time from problem to done | Stopwatch, including the user's own steps | Minutes versus the manual baseline |
| Accuracy | 100 questions with known answers on seeded accounts | Roughly 1 wrong versus 10 wrong |
| Money recovered | Confirmed dollars per user in 30 days | Measurable versus near zero |
| Deadlines caught | Seeded deadlines over 30 days | None missed |
| Harm | Wrong payments, wrong cancellations, wrong trades | Zero. One is a stop-ship |

A real 10x shows up in 10 to 20 people. If it takes a thousand users to see the difference, it isn't 10x.

## Honest limits

- **OpenAI will add actions.** The doing layer is open today because ChatGPT is read-only for analysis. That window is real and will not stay open forever. Speed on the first three capabilities matters more than breadth
- **Partners can say no.** Brokerage and payment partners vet founders. A solo, pre-revenue company can be rejected; start with the most startup-friendly partner and have the entity, security program and compliance contact ready before applying
- **Browser automation breaks.** Merchants change their sites. Budget for permanent maintenance of the cancellation paths
- **Autonomy multiplies mistakes.** An agent that pays the wrong bill loses more trust than a hundred correct payments earn. The tiers exist so autonomy is earned, not assumed
- **Every capability here adds cost per user.** Measure model and partner cost per user before pricing, or the subscription loses money on the most active users
- **Regulation is moving.** Several rules this spec relies on are in litigation or being rewritten. Recheck the compliance spec before each phase ships
