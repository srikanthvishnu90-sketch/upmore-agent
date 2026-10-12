# Upmore Feature Teardown 2: Budgeting and Money Management

October 11, 2026

## How to read this

This is every feature five budgeting and money apps offer, one row per feature, so Upmore can build each one as its own spec. The investing apps are in Teardown 1.

Every bullet below explains one column of the feature tables.

- **Feature** is the app's own name for it where it has one.
- **What it does** is what the user sees and gets, with limits and numbers.
- **Plan** is the tier the feature sits in: free, or the paid tier and its price.
- **Upmore** is the permission tag the feature would carry in Upmore's capability list: [Read] looks and reports, [Ask] acts after one approval, [Rule] repeats an action the user approved in advance, [Flag] is regulated and needs a licensed partner or a lawyer first.

A feature is listed only if the app's own site, help center, app listing or filings confirm it. Anything taken from a review instead is marked "reported".

## Rocket Money

Rocket Money (formerly Truebill, owned by Rocket Companies) is a US app that tracks subscriptions, spending and budgets, and pays people and an AI agent to cancel subscriptions and negotiate bills. It has a free tier, Premium at a price you choose ($7 to $14 a month on its pricing page, 7-day trial) and Premium+ at $15 a month plus tax. Partners are Plaid and Akoya for bank data, nbkc bank (Member FDIC) for savings, Experian for credit and Anthropic for its Rowan agent; it runs on iOS, Android and a Premium-only web app.

### Onboarding and account linking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Account Linking | Links US bank accounts and credit cards through Plaid, or Akoya for Fidelity, on mobile or web. | Free | [Read] |
| Add Account | Adds a missing sub-account under a bank that is already linked. | Free | [Read] |
| Apple Card sync | Syncs Apple Card through Plaid on iOS 17.4 or later, replacing old monthly CSV uploads. | Not stated | [Read] |
| Investment and loan account linking | Brings brokerage, retirement, college savings, crypto wallet and loan balances into the app. | Free to link, shown in Net Worth on Premium | [Read] |
| Connection status | Shows each link as Healthy, Temporary, Delayed or Needs connection, with a Reconnect button. | Free | [Read] |
| Real-time sync | Updates linked accounts in real time and lets you sync on demand. | Premium, $7 to $14 a month | [Read] |
| Credit card details | Shows APR, credit utilization and available balance for each linked card. | Free | [Read] |
| Unlink account | Removes a linked institution at any time, which revokes Rocket Money's access. | Free | [Ask] |
| Demo Mode | Scrambles your data so you can show the app to someone else, on mobile only. | Not stated | [Read] |

### Subscriptions and recurring bills

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Subscription detection | Finds subscriptions and bills automatically from linked bank and card transactions. | Free | [Read] |
| Recurring tab, Upcoming | Shows a calendar of charges due in the next two weeks. | Free | [Read] |
| Recurring tab, All | Lists every detected subscription and bill in one place. | Free | [Read] |
| Inactive list | Lists recurring items with no detected payment in the past month. | Free | [Read] |
| Add a Bill or Subscription | Lets you add a recurring item by hand and link past transactions to it, on mobile only. | Not stated | [Read] |
| View Instructions | Shows step-by-step instructions to cancel a subscription yourself. | Free | [Read] |
| Third-party billing guides | Explains how to cancel items billed through Apple, Google Play, Amazon, Roku or PayPal. | Free | [Read] |
| Payday View | Shows bills due before your next payday and a safe to spend amount, on mobile only. | Free | [Read] |
| Is Paycheck toggle | Marks a deposit as payroll so paydays are predicted correctly. | Not stated | [Read] |
| Upcoming paychecks | Shows expected paychecks up to one week ahead on Dashboard and two weeks on Recurring. | Not stated | [Read] |
| Credit card payment preferences | Sets the expected payment amount and date for each card to improve predictions. | Not stated | [Read] |

### Cancellation concierge

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Subscription Cancellation Assistant | A Rocket Money agent cancels the subscription for you, usually in 2 to 10 business days. | Premium, $7 to $14 a month | [Ask] |
| Cancel This For Me form | You tap Cancel on a subscription and fill in a short form to start the request. | Premium, $7 to $14 a month | [Ask] |
| More information request | Emails you a link to add details when the provider needs proof you own the account. | Premium, $7 to $14 a month | [Ask] |
| Cancellation status | Shows pending and completed cancellations in the Recurring tab and by email. | Premium, $7 to $14 a month | [Read] |
| Refund attempt | The team tries to get a refund from the provider when possible. | Premium, $7 to $14 a month | [Ask] |
| Charged after cancellation follow-up | Support contacts the provider again if you are billed after a confirmed cancellation. | Premium, $7 to $14 a month | [Ask] |
| Stop a cancellation request | You ask chat support to halt a request in progress, with no guarantee. | Premium, $7 to $14 a month | [Ask] |
| Unsupported provider fallback | Hides the Cancel button and shows self-cancel instructions when Rocket Money cannot cancel. | Free | [Read] |

### Bill negotiation

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Bill Negotiation (Lower Bills) | Human negotiators call your cable, internet, phone, home security or satellite radio provider for a lower rate. | Fee of 35% to 60% of first-year savings until 1 Nov 2026, then Premium+ only | [Ask] |
| Provider connection | You give your provider login or a photo of a recent bill, plus account details and preferences. | Same as Bill Negotiation | [Ask] |
| Choose your fee | You pick the success fee percentage, from 35% to 60% of first-year savings. | Fee of 35% to 60% of first-year savings | [Ask] |
| Authorization charge | Places a temporary $1 hold on your card at signup, released in 3 to 5 business days. | $1 hold, not a fee | [Ask] |
| Negotiation Success email | Emails the new rate, savings and fee, then charges the card after 48 hours. | Fee of 35% to 60% of first-year savings | [Ask] |
| Fee payment plan | Splits the success fee into weekly, bi-weekly or monthly payments for up to 12 months. | Fee of 35% to 60% of first-year savings | [Rule] |
| Negotiation status | Shows progress updates and a notice when a negotiation is complete. | Same as Bill Negotiation | [Read] |
| No-fee Bill Negotiation | Premium+ members submit negotiations with no success fee, one at a time. | Premium+, $15 a month | [Ask] |
| Automatic renegotiation (TrueProtect) | Renegotiated bills again on a schedule; this ends on 1 Nov 2026. | Discontinued 1 Nov 2026 | [Rule] |
| Car insurance rate comparison | Connects your current policy and shows other rate options, per one marketing page only. | Not stated | [Read] [Flag] |
| Overdraft and late fee refund script | Gives a script to read to your bank to ask for a fee refund, on mobile only. | Not stated | [Read] |

### Spending and transactions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Spending tab | Shows spending by category in a pie chart for the month. | Free | [Read] |
| Income vs spend charts | Shows bar charts comparing income and spending. | Free | [Read] |
| Frequent spend and largest purchases | Shows where you spend most often and your biggest purchases. | Free | [Read] |
| Monthly spending reports | Sends or shows a monthly report with category breakdowns. | Free | [Read] |
| Smart recommendations | Shows suggestions for improving your spending. | Free | [Read] |
| Transactions log | Lists all transactions across linked accounts with unlimited history. | Free | [Read] |
| Transaction search | Searches transactions by search bar on mobile; web search and edit need Premium. | Free on mobile, Premium on web | [Read] |
| Default categorization | Sorts transactions into predefined categories automatically. | Free | [Read] |
| Category Review | Shows your ten latest transactions as cards; swipe right to confirm or left to recategorize. | Free | [Read] |
| Edit transaction | Lets you change a transaction's category or name. | Free | [Read] |
| Ignore transaction | Excludes a transaction or a split from your budget. | Not stated | [Read] |
| Custom categories | Creates unlimited categories with name, icon, color and group (Expenses, Earnings or Ignored). | Premium, $7 to $14 a month | [Read] |
| Custom tags | Creates colored tags and applies them to transactions, on mobile only. | Premium, $7 to $14 a month | [Read] |
| Transaction notes | Adds a note to a transaction. | Premium, $7 to $14 a month | [Read] |
| Split transactions | Splits a transaction by fixed amounts, equal shares or percentages, on mobile only. | Premium, $7 to $14 a month | [Read] |
| Transaction rules | Matches on name or amount, then recategorizes, renames, tags, ignores or assigns to a bill. | Premium, $7 to $14 a month | [Rule] |
| Manual transactions | Adds a cash spend or income entry with name, date, amount and category, on mobile only. | Premium, $7 to $14 a month | [Read] |
| CSV export | Emails a download link for a filtered CSV of transactions that opens on desktop. | Premium, $7 to $14 a month | [Read] |
| Tax Deductible tag | Marks transactions as tax deductible and exports them as a list. | Free; custom tax categories need Premium | [Read] [Flag] |
| Reimbursements category | Keeps repaid expenses and the repayment out of spend and income totals. | Not stated | [Read] |
| Income tracking | Lists income transactions and lets you correct the monthly income figure. | Free | [Read] |
| Watchlist | Pins chosen categories, merchants and tags to the Dashboard without a full budget. | Premium, $7 to $14 a month | [Read] |

### Budgets and habits

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Budget setup | Estimates monthly income, suggests bills and suggests category budgets from past average spend. | Free | [Read] |
| Category budgets | Sets a monthly limit per category; free plan allows about three. | Free, up to 3 | [Read] |
| Unlimited category budgets | Removes the cap on the number of category budgets. | Premium, $7 to $14 a month | [Read] |
| Projected Savings | Shows what you would save this month if you stay within budget. | Free | [Read] |
| Amount Left After Bills | Shows income minus the bills you chose to include. | Free | [Read] |
| Debt paydown | Named as a Premium feature on the pricing page with no further detail. | Premium, $7 to $14 a month | [Read] |
| Challenges | Runs one habit challenge at a time, such as opening the app 3 times in 10 days. | Not stated | [Read] |
| Badges | Awards shareable badges in your Profile for completed challenges. | Not stated | [Read] |
| Learning Hub | Offers videos, quizzes, articles and stories about money topics. | Free | [Read] |

### Alerts and notifications

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Notification preferences | Toggles Alerts, Tips and Updates separately for push and email. | Free | [Read] |
| Low balance alert | Alerts when checking falls below a threshold you set; the default is $200. | Free | [Read] |
| Upcoming charge alerts | Notifies you about bills and subscriptions that are about to charge. | Free | [Read] |
| Unusual charge alerts | Notifies you about unusual charges on linked accounts. | Not stated | [Read] |
| Bank fee notification | Flags an overdraft or late fee and offers a Request a refund script. | Not stated | [Read] |
| Credit change alerts | Sends alerts when something on your credit report changes your score. | Premium, $7 to $14 a month | [Read] [Flag] |
| Challenge reminders | Sends reminders to keep an active challenge on track. | Not stated | [Read] |

### Net worth

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Net Worth | Shows assets minus debts with Summary, Assets and Debt screens on mobile and web. | Premium, $7 to $14 a month | [Read] |
| Assets with loans | Tracks homes and vehicles alongside their mortgages and car loans. | Premium, $7 to $14 a month | [Read] |
| Manually added assets | Adds unlinked assets such as cash, gold, jewelry, collectibles, instruments or a boat. | Premium, $7 to $14 a month | [Read] |
| Include home in Net Worth | Toggle that hides or shows your home value and mortgage in totals and charts. | Premium, $7 to $14 a month | [Read] |
| Use equity values in charts | Toggle that shows only equity for homes and vehicles instead of full value and loan. | Premium, $7 to $14 a month | [Read] |

### Credit

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Credit Score | Shows your Experian FICO Score 2 after you verify with an SSN or ITIN. | Free | [Read] [Flag] |
| Full credit report | Shows your complete Experian credit report and history. | Premium, $7 to $14 a month | [Read] [Flag] |
| Credit report monitoring | Watches your report and flags important changes. | Premium, $7 to $14 a month | [Read] [Flag] |
| Score factor breakdown | Explains how payment history, card utilization and account age affect your score. | Not stated | [Read] [Flag] |

### Financial Goals and savings

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Financial Goals | Moves money from checking into a no-interest custodial account at nbkc bank for each goal. | Premium, $7 to $14 a month | [Rule] [Flag] |
| Smart Savings | Transfers varying amounts every few days based on your balance, at Comfy, Moderate or Aggressive level. | Premium, $7 to $14 a month | [Rule] [Flag] |
| Custom Savings | Reaches a monthly amount you set through small, frequent transfers. | Premium, $7 to $14 a month | [Rule] [Flag] |
| Multiple goals | Lets you run several goals, each tied to one checking account. | Premium, $7 to $14 a month | [Rule] [Flag] |
| Add Money | Makes a manual deposit of up to $250, capped at $1,500 a day across goals. | Premium, $7 to $14 a month | [Ask] [Flag] |
| Withdraw | Sends up to $5,000 a day back to the original checking account in 1 to 2 business days. | Premium, $7 to $14 a month | [Ask] [Flag] |
| Balance Protection | Skips deposits when checking is below a minimum you set, with a $200 floor. | Premium, $7 to $14 a month | [Rule] [Flag] |
| Pause Goal | Stops automatic transfers until you resume; goals also pause when the target is reached. | Premium, $7 to $14 a month | [Ask] [Flag] |
| Close goal | Withdraws the full balance and closes the goal. | Premium, $7 to $14 a month | [Ask] [Flag] |
| High-Yield Savings Account | Lets Premium+ members apply for a variable-rate savings account that earns interest only while subscribed. | Premium+, $15 a month | [Ask] [Flag] |

### Rowan AI agent

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Rowan text thread | An AI agent you text over RCS, with no separate app; only the primary user can use it. | Premium+, $15 a month | [Read] |
| Money questions | Answers questions about your own spending, savings and budgets. | Premium+, $15 a month | [Read] |
| Weekly spend reports | Texts a short weekly recap of money in, money out and goal progress. | Premium+, $15 a month | [Read] |
| Proactive alerts | Texts you about forgotten subscriptions, price increases and unexpected upcoming bills. | Premium+, $15 a month | [Read] |
| Transaction edits by text | Recategorizes, tags, adds notes to or ignores transactions when you ask. | Premium+, $15 a month | [Read] |
| Budget building by text | Builds a budget from scratch, adjusts it and reports what is left to spend. | Premium+, $15 a month | [Read] |
| Custom alerts | Sets reminders such as a text when a category budget reaches an amount you name. | Premium+, $15 a month | [Rule] |
| Cancel subscriptions by text | Flags duplicate or unused subscriptions and starts a cancellation after you confirm. | Premium+, $15 a month | [Ask] |
| Negotiate bills by text | Starts a no-fee bill negotiation when you say you are ready. | Premium+, $15 a month | [Ask] |
| Trial tracking | Uses connected Gmail to spot new free trials and reminds you before they charge. | Premium+, $15 a month | [Read] |
| Refund requests | Contacts companies for you about refunds, such as late deliveries or bad service. | Premium+, $15 a month | [Ask] |
| Savings rule | Creates a rule such as rounding up purchases into savings, shown as a marketing example. | Premium+, $15 a month | [Rule] [Flag] |
| Debt guidance | Discusses your debts and suggests repayment plans. | Premium+, $15 a month | [Read] |
| Support handoff | Gathers details and sends a message to human support for you. | Premium+, $15 a month | [Ask] |
| App navigation help | Points you to the right screen for budgets, bills, goals, linking or settings. | Premium+, $15 a month | [Read] |
| Approval every time | Asks you to confirm before any action that touches money. | Premium+, $15 a month | [Read] |

### Sharing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Account Sharing | Shares your whole account with one partner who gets their own login and MFA. | Premium, $7 to $14 a month | [Ask] |
| Partner invite | Sends an email invite using the partner's full name and email address. | Premium, $7 to $14 a month | [Ask] |
| Secondary member limits | The partner sees all accounts but cannot use Credit Score, Rowan or receive exports. | Premium, $7 to $14 a month | [Read] |
| Remove partner access | Lets the primary member remove the partner from the account. | Premium, $7 to $14 a month | [Ask] |

### Platforms, security and support

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Mobile apps | Runs on iPhone (iOS 16.4 or later) and Android in English, for US users only. | Free | [Read] |
| Rocket Money for desktop | Gives full web access; free users can only edit profile, links and notifications. | Premium, $7 to $14 a month | [Read] |
| Customizable dashboard | Lets you arrange the Dashboard sections by priority. | Premium, $7 to $14 a month | [Read] |
| Safe to Spend widget | iOS home screen widget showing what you can spend without overdrafting. | Premium, $7 to $14 a month | [Read] |
| Upcoming Bills widget | iOS widget listing bills, payments and paydays in the next week. | Premium, $7 to $14 a month | [Read] |
| Recent Transactions widget | iOS widget showing recent money in and out. | Premium, $7 to $14 a month | [Read] |
| Spending widget | iOS widget showing monthly spending in total or for one budgeted category. | Premium, $7 to $14 a month | [Read] |
| Dark mode | Switches the app to a dark theme. | Free | [Read] |
| Multi-Factor Authentication | Adds a login code by text, phone call or authenticator app, rechecked about every 45 days. | Free | [Read] |
| Biometric login | Uses the device's face or fingerprint check to open the app. | Free | [Read] |
| Delete account | Deletes your Rocket Money account and all associated data. | Free | [Ask] |
| In-app chat support | Chat with support Monday to Friday, 9am to 8pm EST; there is no phone line. | Free | [Read] |
| Email support | Email support@rocketmoney.com, or cancellations@rocketmoney.com for cancellation issues. | Free | [Read] |
| Feature requests board | Lets you submit and upvote feature requests on a public Canny board. | Free | [Read] |
| Free Premium for Rocket Mortgage clients | Gives Premium at no cost while Rocket Mortgage services your original loan. | Free with eligible Rocket Mortgage loan | [Read] |
| Rocket product offers | Shows offers for Rocket mortgages and loans inside the app (reported by a third-party review). | Not stated | [Read] [Flag] |

### Business model and partners

- Revenue comes from Premium subscriptions at a price the user picks, stated as $7 to $14 a month, and Premium+ at $15 a month.
- Bill negotiation earns a success fee of 35% to 60% of first-year savings until 1 November 2026. After that it is a no-fee Premium+ benefit.
- Plaid supplies bank data, with Akoya used for Fidelity. Hosting is on AWS and Google Cloud.
- nbkc bank, Member FDIC, holds Financial Goals money in a custodial account and provides the High-Yield Savings Account. ModernFI runs the deposit network.
- Experian supplies credit scores and reports using the FICO Score 2 model. Rowan is built on Anthropic models.
- Rocket Money, Inc. is a subsidiary of Rocket Companies (NYSE: RKT), alongside Rocket Mortgage and Rocket Loans, and it cross-promotes them.

### What users say is missing or broken

- Charges continue after cancelling Premium, and some users get locked out before they can cancel (Trustpilot, September 2026).
- Bill negotiation fees surprise people, and some say plans were changed or savings never appeared (ConsumerAffairs 2025, ComplaintsBoard).
- There is no phone support and it is hard to reach a human (Trustpilot summary, ComplaintsBoard, Rocket Money's own contact page confirms no phone).
- Recurring bill dates drift because the app repeats every 30 days, and irregular paydays cannot be added (App Store review, 2023, dated).
- Many edits are mobile only and the web app is paywalled, while cancellation cannot handle Apple, Google Play, Amazon, Roku or PayPal billing (Rocket Money help center).

### Sources

- [Rocket Money homepage](https://www.rocketmoney.com/)
- [How much does Rocket Money cost? (pricing page)](https://www.rocketmoney.com/learn/personal-finance/how-much-does-rocket-money-cost)
- [Rowan product page](https://www.rocketmoney.com/rowan)
- [What is Rowan (blog)](https://www.rocketmoney.com/learn/personal-finance/what-is-rowan)
- [Premium+ and Rowan disclosures](https://www.rocketmoney.com/rowan-disclosures)
- [Terms of Service](https://www.rocketmoney.com/terms)
- [Security](https://www.rocketmoney.com/security)
- [Company updates](https://www.rocketmoney.com/company-updates)
- [Manage Subscriptions feature page](https://www.rocketmoney.com/feature/manage-subscriptions)
- [Bill Negotiation feature page](https://www.rocketmoney.com/feature/lower-your-bills)
- [Financial Goals feature page](https://www.rocketmoney.com/feature/autopilot-savings)
- [Credit Scores feature page](https://www.rocketmoney.com/feature/credit-score)
- [Spending Insights feature page](https://www.rocketmoney.com/feature/spending-insights)
- [Help Center home](https://help.rocketmoney.com/en/)
- [How much does Rocket Money cost? (help)](https://help.rocketmoney.com/en/articles/2217739-how-much-does-truebill-cost)
- [Why is Rocket Money charging me?](https://help.rocketmoney.com/en/articles/2667173-why-is-rocket-money-charging-me)
- [How to get the most out of Rocket Money](https://help.rocketmoney.com/en/articles/1940551-how-to-get-the-most-out-of-rocket-money)
- [Premium Membership features](https://help.rocketmoney.com/en/articles/2677184-premium-membership-features)
- [Managing my Premium Membership](https://help.rocketmoney.com/en/articles/9095189-managing-my-premium-membership)
- [Introduction to Premium+](https://help.rocketmoney.com/en/articles/16802386-introduction-to-premium)
- [Upgrading to Premium+](https://help.rocketmoney.com/en/articles/16802468-upgrading-to-premium)
- [What is Rowan?](https://help.rocketmoney.com/en/articles/16760933-what-is-rowan)
- [What can I ask Rowan?](https://help.rocketmoney.com/en/articles/16760832-what-can-i-ask-rowan)
- [Accessing my free Premium Membership from my Rocket Mortgage](https://help.rocketmoney.com/en/articles/6396483-accessing-my-free-premium-membership-from-my-rocket-mortgage)
- [Connecting bank accounts and credit cards](https://help.rocketmoney.com/en/articles/934328-connecting-bank-accounts-and-credit-cards)
- [Is Rocket Money secure?](https://help.rocketmoney.com/en/articles/934647-is-rocket-money-secure)
- [Does Rocket Money support international banks?](https://help.rocketmoney.com/en/articles/79778-does-rocket-money-support-international-banks)
- [How to add a missing account](https://help.rocketmoney.com/en/articles/9186454-how-to-add-a-missing-account)
- [Your account connection status](https://help.rocketmoney.com/en/articles/4918001-your-account-connection-status)
- [Important changes to Apple Card integration](https://help.rocketmoney.com/en/articles/11504643-important-changes-to-apple-card-integration)
- [Managing your bills and subscriptions](https://help.rocketmoney.com/en/articles/2185531-managing-your-bills-and-subscriptions)
- [How do I cancel a subscription on Rocket Money?](https://help.rocketmoney.com/en/articles/934402-how-do-i-cancel-a-subscription-on-rocket-money)
- [How long does it take Rocket Money to cancel a subscription?](https://help.rocketmoney.com/en/articles/934410-how-long-does-it-take-rocket-money-to-cancel-a-subscription)
- [Why can't Rocket Money cancel this?](https://help.rocketmoney.com/en/articles/13908897-why-can-t-rocket-money-cancel-this)
- [Subscription cancellation FAQs](https://help.rocketmoney.com/en/articles/4649463-subscription-cancellation-faqs)
- [Bill Negotiations is moving to Premium+](https://help.rocketmoney.com/en/articles/17141357-bill-negotiations-is-moving-to-premium)
- [How to submit a Bill Negotiation](https://help.rocketmoney.com/en/articles/9744564-how-to-submit-a-bill-negotiation)
- [Bill Negotiation savings process](https://help.rocketmoney.com/en/articles/9744501-bill-negotiation-savings-process)
- [Bill Negotiation charge explained](https://help.rocketmoney.com/en/articles/9744474-bill-negotiation-charge-explained)
- [Authorization charge in Rocket Money](https://help.rocketmoney.com/en/articles/9744581-authorization-charge-in-rocket-money)
- [Overdraft and late fee refund requests](https://help.rocketmoney.com/en/articles/1315299-overdraft-late-fee-refund-requests)
- [Creating a Budget](https://help.rocketmoney.com/en/articles/2649810-creating-a-budget)
- [Track the spending that matters most with a Watchlist](https://help.rocketmoney.com/en/articles/13704685-track-the-spending-that-matters-most-with-a-watchlist)
- [Build better money habits with Challenges](https://help.rocketmoney.com/en/articles/14443051-build-better-money-habits-with-challenges)
- [Discover the Learning Hub](https://help.rocketmoney.com/en/articles/13778435-discover-the-learning-hub)
- [How to customize a low balance alert](https://help.rocketmoney.com/en/articles/8418019-how-to-customize-a-low-balance-alert)
- [Enabling Payday View](https://help.rocketmoney.com/en/articles/6235627-enabling-payday-view)
- [Updating your notification settings](https://help.rocketmoney.com/en/articles/934668-updating-your-notification-settings)
- [Searching my transactions](https://help.rocketmoney.com/en/articles/10770688-searching-my-transactions)
- [Transaction Category Review](https://help.rocketmoney.com/en/articles/13778317-transaction-category-review)
- [Editing and creating transaction categories](https://help.rocketmoney.com/en/articles/3332081-editing-and-creating-transaction-categories)
- [Create and apply tags for transactions](https://help.rocketmoney.com/en/articles/12461821-create-and-apply-tags-for-transactions)
- [Creating transaction rules](https://help.rocketmoney.com/en/articles/10328100-creating-transaction-rules)
- [How to split transactions](https://help.rocketmoney.com/en/articles/4363893-how-to-split-transactions)
- [Adding transactions manually](https://help.rocketmoney.com/en/articles/4402227-adding-transactions-manually)
- [Exporting transactions](https://help.rocketmoney.com/en/articles/10296106-exporting-transactions)
- [Tax deductible transactions](https://help.rocketmoney.com/en/articles/4839084-tax-deductible-transactions)
- [Tracking your income](https://help.rocketmoney.com/en/articles/4335689-tracking-your-income)
- [Working with reimbursements and shared bills](https://help.rocketmoney.com/en/articles/3584529-working-with-reimbursements-shared-bills)
- [Customize your card payment preferences](https://help.rocketmoney.com/en/articles/14326165-customize-your-card-payment-preferences)
- [Financial Goals overview](https://help.rocketmoney.com/en/articles/2620940-financial-goals-overview)
- [Your new home for savings: Financial Goals](https://help.rocketmoney.com/en/articles/10446041-your-new-home-for-savings-financial-goals)
- [Creating a Financial Goal](https://help.rocketmoney.com/en/articles/2621011-creating-a-financial-goal)
- [Depositing funds into your Financial Goal](https://help.rocketmoney.com/en/articles/2621105-depositing-funds-into-your-financial-goal)
- [Withdrawing funds from your Financial Goals](https://help.rocketmoney.com/en/articles/2621078-withdrawing-funds-from-your-financial-goals)
- [Setting a minimum account balance for deposits](https://help.rocketmoney.com/en/articles/10770898-setting-a-minimum-account-balance-for-deposits-into-my-financial-goal-plan)
- [How to pause a Financial Goal](https://help.rocketmoney.com/en/articles/17062536-how-to-pause-a-financial-goal)
- [How is net worth calculated?](https://help.rocketmoney.com/en/articles/5350243-how-is-net-worth-calculated)
- [What is included in my assets?](https://help.rocketmoney.com/en/articles/9184603-what-is-included-in-my-assets)
- [Include home(s) in Net Worth](https://help.rocketmoney.com/en/articles/9184671-include-home-s-in-net-worth)
- [Use equity values in Net Worth charts](https://help.rocketmoney.com/en/articles/9184654-use-equity-values-in-net-worth-charts)
- [Track my credit score with Rocket Money](https://help.rocketmoney.com/en/articles/10770925-track-my-credit-score-with-rocket-money)
- [Account Sharing in Rocket Money](https://help.rocketmoney.com/en/articles/4562634-account-sharing-in-rocket-money)
- [How to invite a partner to your Rocket Money account](https://help.rocketmoney.com/en/articles/9184519-how-to-invite-a-partner-to-your-rocket-money-account)
- [Rocket Money for desktop](https://help.rocketmoney.com/en/articles/12166750-rocket-money-for-desktop)
- [Rocket Money widgets](https://help.rocketmoney.com/en/articles/9217610-rocket-money-widgets)
- [Using demo mode in Rocket Money](https://help.rocketmoney.com/en/articles/6865640-using-demo-mode-in-rocket-money)
- [Multi-Factor Authentication (MFA)](https://help.rocketmoney.com/en/articles/9184541-multi-factor-authentication-mfa)
- [Contacting Rocket Money](https://help.rocketmoney.com/en/articles/2684134-contacting-rocket-money)
- [Managing your Rocket Money account (collection)](https://help.rocketmoney.com/en/collections/110553-managing-your-rocket-money-account)
- [Rocket Money on the Apple App Store](https://apps.apple.com/us/app/rocket-money-bills-budgets/id1130616675)
- [Rocket Money on Google Play](https://play.google.com/store/apps/details?id=com.truebill&hl=en_US)
- [FinTech Global: Rocket Money launches AI agent](https://fintech.global/2026/09/03/rocket-money-launches-ai-agent-to-manage-finances/)
- [Coverager: Rocket Money launches AI financial assistant Rowan](https://coverager.com/rocket-money-launches-ai-financial-assistant-rowan/)
- [Wall Street Survivor: Premium vs Premium+](https://www.wallstreetsurvivor.com/?p=33171)
- [HowTheMarketWorks: Is Rocket Money Legit?](https://www.howthemarketworks.com/?p=19307)
- [Trustpilot: Rocket Money reviews](https://www.trustpilot.com/review/rocketmoney.com)
- [ConsumerAffairs: Rocket Money reviews](https://www.consumeraffairs.com/finance/truebill.html)
- [ComplaintsBoard: Rocket Money](https://www.complaintsboard.com/rocket-money-b133631)
- [BBB profile: Rocket Money](https://www.bbb.org/us/md/silver-spring/profile/financial-services/rocket-money-inc-0241-236032125)


## Monarch

Monarch is a paid money app for households in the United States and Canada, covering budgets, net worth, investments and planning. Core costs $14.99 a month or $99.99 a year and Plus costs $199 a year, with a 7-day trial and no free tier. It runs on web, iOS and Android, and names Plaid, Mastercard Data Connect, MX, Spinwheel, Zillow, VinAudit, Morningstar and Trust & Will as partners.

### Onboarding and account linking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Free trial | New members can try the app free for 7 days before billing starts. | Core, $14.99/mo or $99.99/yr | [Read] |
| Sign-in options | Members sign in with email and password, Continue with Google, or Continue with Apple. | Core, $14.99/mo or $99.99/yr | [Read] |
| Add account | Search for an institution by name or website, log in, then choose which accounts to add. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Data providers | Institutions connect through one of three aggregators: Plaid, Mastercard Data Connect (formerly Finicity) or MX. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Default provider choice | Monarch suggests the provider with the strongest past connection record for that institution. | Core, $14.99/mo or $99.99/yr | [Read] |
| Choosing Your Data Provider | Members can pick a different provider instead of the suggested one when connecting. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Switch provider | On web, Settings then Institutions swaps a connection to another provider and keeps transaction and balance history. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Provider recommendations | A banner on the Accounts page may suggest a better provider, starting with a small number of institutions. | Core, $14.99/mo or $99.99/yr | [Read] |
| Institution connection status | Each Institution page shows the connection status and any recommended provider. | Core, $14.99/mo or $99.99/yr | [Read] |
| Connection Status Dashboard | A public page shows connection health for each United States and Canadian institution by provider, updated once a day. | Free, public page | [Read] |
| Update login settings | Settings then Institutions lets a member re-verify a login and pick up new or unsynced accounts. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Refresh accounts | A refresh button pulls new data and a pop-up stays visible until the refresh finishes. | Core, $14.99/mo or $99.99/yr | [Read] |
| Refresh details | Show Details lists each account's progress, the number of transactions updated and any sync failure reason. | Core, $14.99/mo or $99.99/yr | [Read] |
| Apple Card, Cash, and Savings sync | The iPhone app syncs Apple Card, Apple Cash and Apple Savings in the background, with one Apple login at a time. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Apple import range | During Apple setup the member chooses how far back to import transactions. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Zillow home value sync | A home account follows the Zillow Zestimate and updates weekly on Mondays, for United States members only. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Convert property to Zillow | A manually tracked property can switch on Sync value from Zillow, and this cannot be reversed. | Core, $14.99/mo or $99.99/yr | [Ask] |
| VinAudit vehicle value sync | A vehicle added by VIN gets an estimated market value updated monthly, for United States vehicles only. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Manual accounts | Members add accounts by hand for cash, vehicles, valuables, loans and other assets, then update the balance themselves. | Core, $14.99/mo or $99.99/yr | [Read] |
| Coinbase connection | A Coinbase account connects directly and its crypto counts in net worth (2021 post, not re-checked). | Core, $14.99/mo or $99.99/yr | [Ask] |
| Crypto exchange connections | Binance, Kraken and Gemini were added as connections, along with Cash App (2022 post, not re-checked). | Core, $14.99/mo or $99.99/yr | [Ask] |
| Connecting to Spinwheel | One soft pull of the Equifax credit report through Spinwheel finds credit cards and loans, for United States members. | Core, $14.99/mo or $99.99/yr | [Ask] [Flag] |
| Request an institution | A short form on the Add account screen lets members ask for a new institution (2023 post). | Core, $14.99/mo or $99.99/yr | [Ask] |
| Import transactions from CSV | On web, a CSV with Account, Amount and Date columns imports transactions into one or several accounts. | Core, $14.99/mo or $99.99/yr | [Ask] |
| CSV optional columns | The importer also reads Category, Tags, Notes and Transaction ID columns and ignores other columns. | Core, $14.99/mo or $99.99/yr | [Read] |
| CSV category and tag mapping | During import the member maps categories, tags and account names to new or existing ones. | Core, $14.99/mo or $99.99/yr | [Ask] |
| CSV overlap options | The member picks Prioritize CSV, Prioritize Monarch, Import all, or Use transaction IDs to handle overlapping data. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Mint import | A Mint CSV flow maps all categories and tags and can favour Mint data over synced data (2023 post). | Core, $14.99/mo or $99.99/yr | [Ask] |
| Balance history import | A CSV with date and balance columns fills in balance history for one synced or manual account. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Edit balance history | On web, the account Edit button changes balance history for connected accounts without a CSV (2024 post). | Core, $14.99/mo or $99.99/yr | [Read] |
| Transfer data tool | On web, transactions, balances, rules, recurring items and goals move from an old account to a new synced account. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Transfer backup | The transfer flow offers a backup download before the final step, because there is no undo. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Delete connection, keep history | Settings then Institutions can delete a connection while keeping its past transactions (2025 post). | Core, $14.99/mo or $99.99/yr | [Ask] |
| Getting started guide | A dashboard card walks new members through setup steps. | Core, $14.99/mo or $99.99/yr | [Read] |

### Transactions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Transactions list | One list shows transactions from all accounts on web and mobile. | Core, $14.99/mo or $99.99/yr | [Read] |
| Transaction search | Members search transactions by keyword, category, merchant, amount or tag, including text in notes. | Core, $14.99/mo or $99.99/yr | [Read] |
| Transaction filters | A filter menu narrows the list, including Split, Hidden Only, Needs review by, untagged and goal filters. | Core, $14.99/mo or $99.99/yr | [Read] |
| Clear filters | A Clear button resets all filters on Transactions and Reports. | Core, $14.99/mo or $99.99/yr | [Read] |
| Auto-categorisation | AI assigns a category to each new transaction, learns from corrections, and cannot be switched off. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Merchant name cleanup | Raw statement text is turned into a readable merchant name with a logo. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Original statement | The original bank statement text stays available and can be used in rules and review cards. | Core, $14.99/mo or $99.99/yr | [Read] |
| Edit transaction | A member can change the merchant name, category, date, notes and tags of one transaction. | Core, $14.99/mo or $99.99/yr | [Read] |
| Edit multiple | Bulk edit changes merchant, category, date, notes, tags, hide state, review status, owner or goal on many transactions. | Core, $14.99/mo or $99.99/yr | [Read] |
| Bulk delete | Edit multiple can delete many selected transactions at once. | Core, $14.99/mo or $99.99/yr | [Read] |
| Shift+click selection | On web, shift-click selects a range of transactions for bulk editing. | Core, $14.99/mo or $99.99/yr | [Read] |
| Column visibility | On web, members hide or show columns in the transactions table. | Core, $14.99/mo or $99.99/yr | [Read] |
| Quick actions | On web, right-click or the dots menu adds tags to a row without opening the drawer. | Core, $14.99/mo or $99.99/yr | [Read] |
| Create manual transaction | Members add a transaction by hand from the Transactions tab or an account page. | Core, $14.99/mo or $99.99/yr | [Read] |
| Duplicate transaction | The three-dot menu copies a transaction to create a new manual one. | Core, $14.99/mo or $99.99/yr | [Read] |
| Delete transaction | A single transaction can be deleted from its details panel. | Core, $14.99/mo or $99.99/yr | [Read] |
| Split transaction | One transaction is divided into two or more parts, each with its own category. | Core, $14.99/mo or $99.99/yr | [Read] |
| Unsplit | On web, Unsplit removes all parts of a split, or the trash icon removes one part. | Core, $14.99/mo or $99.99/yr | [Read] |
| Transaction Rules | Rules match on merchant, original statement, amount, category, account or owner and then change transactions automatically. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Rule actions | A rule can set category, tags, review status, owner or goal link, hide the transaction, or split it. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Multi-value rule conditions | One rule can match several categories, accounts or merchants at once. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Smart Split | A rule splits matching transactions by fixed dollar amounts or by percentages. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Apply rule to existing transactions | A new rule can run on past matching transactions or only on new ones. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Create rule from transaction | The transaction menu opens a new rule with the merchant and amount already filled in. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Rules on pending transactions | Rules run on pending transactions whether or not manual pending edits are allowed. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Tags | Members create coloured tags in Settings and put several tags on one transaction. | Core, $14.99/mo or $99.99/yr | [Read] |
| Default tags | The app ships with Tax, Reimburse, Split, Business and Subscription tags, plus one tag per household member. | Core, $14.99/mo or $99.99/yr | [Read] |
| Notes | Free-text notes save automatically on a transaction and can be searched later. | Core, $14.99/mo or $99.99/yr | [Read] |
| Attachments | Each transaction holds up to 3 images, and PDF files can be added on web only. | Core, $14.99/mo or $99.99/yr | [Read] |
| Hide transaction | Hiding removes a transaction from the list, cash flow, reports and budget, but not from balances or net worth. | Core, $14.99/mo or $99.99/yr | [Read] |
| Needs Review | A flag marks a transaction for review by anyone, yourself or a named household member. | Core, $14.99/mo or $99.99/yr | [Read] |
| Mark as reviewed | A checkmark on web or a button on mobile clears the review flag. | Core, $14.99/mo or $99.99/yr | [Read] |
| Review preferences | Two settings flag all new transactions, or only uncategorised ones, as Needs Review. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Swipe to Review | On mobile, review cards are swiped right to mark reviewed or left to skip, showing the last 60 days. | Core, $14.99/mo or $99.99/yr | [Read] |
| Review card editing | A review card lets the member change category, add tags and notes, and split the transaction. | Core, $14.99/mo or $99.99/yr | [Read] |
| Allow edits to pending transactions | An optional setting lets members edit pending transactions, and edits carry over when they post. | Core, $14.99/mo or $99.99/yr | [Read] |
| Pending to posted matching | Monarch matches a pending transaction to its posted version so category, tags, notes and review status persist. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Activity log | An Activity section shows a transaction's history from arrival through every edit, on web and mobile. | Core, $14.99/mo or $99.99/yr | [Read] |
| Custom merchant logos | Members upload an image or logo for a merchant, in JPG or JPEG format. | Core, $14.99/mo or $99.99/yr | [Read] |
| Merge merchants | Merchant settings can merge one merchant that appears under several names. | Core, $14.99/mo or $99.99/yr | [Read] |
| Default categories | About 60 system categories come built in, and unused ones can be deactivated and reactivated later. | Core, $14.99/mo or $99.99/yr | [Read] |
| Custom categories | Members create their own categories with an icon on web or an emoji on mobile. | Core, $14.99/mo or $99.99/yr | [Read] |
| Custom groups | Members create category groups under Income, Expenses or Transfers and drag categories into them. | Core, $14.99/mo or $99.99/yr | [Read] |
| Reorder categories | Dragging categories and groups in Settings changes their order on web and mobile. | Core, $14.99/mo or $99.99/yr | [Read] |
| Transfers category | Transfers and credit card payments sit in transfer categories that are left out of budgets and cash flow. | Core, $14.99/mo or $99.99/yr | [Read] |

### Receipts and retail sync

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Receipt Scanning | On mobile, a photo of a receipt is read and matched to a transaction. | Core, $14.99/mo or $99.99/yr | [Read] |
| Receipt upload | On web, one or many receipt files are uploaded in the Receipts tab under Transactions. | Core, $14.99/mo or $99.99/yr | [Read] |
| Share to Monarch | On mobile, images shared from the photo gallery are imported as receipts. | Core, $14.99/mo or $99.99/yr | [Read] |
| Receipt review screen | Before saving, the member checks merchant, amount, date, subtotal, tax, tip and line items. | Core, $14.99/mo or $99.99/yr | [Read] |
| Forward a Receipt | Emailed receipts forwarded to receipts@my.monarch.com are imported within a few minutes. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Verified sender emails | Account and household emails are pre-verified, and other addresses need a six-digit code that expires in 24 hours. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Receipt email limits | Forwarded attachments can be JPG, PNG, WEBP, HEIC, HEIF or PDF, up to 10MB each and 30MB per email. | Core, $14.99/mo or $99.99/yr | [Read] |
| Receipt matching | A receipt matches a posted transaction on amount, merchant name and a date window of a few days. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Receipt auto-split | A matched receipt can split one charge into several categorised transactions, and this can be turned off. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Receipt notes | Monarch adds notes about the items bought and attaches the receipt image to the transaction. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Receipt Import tag | Transactions matched to a receipt get a Receipt Import tag. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Waiting for match | An unmatched receipt keeps looking for a transaction, or the member uses Find match or Add transaction. | Core, $14.99/mo or $99.99/yr | [Read] |
| Retail Sync Extension | A desktop Chrome extension reads Amazon and Target orders from United States personal accounts. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Retail order matching | Orders match transactions by merchant, amount and date, then get split, recategorised and given item notes. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Retail Sync tag | Matched transactions get a Retail Sync system tag. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Retail auto-sync | The extension can sync every 24 hours while the member is signed in to Monarch and the retailer. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Sync older orders | First setup imports three months of orders, and older orders can be backfilled to 2018. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Retail sync settings | Members choose whether the extension adds notes, splits and categorises, or both. | Core, $14.99/mo or $99.99/yr | [Read] |
| Retail Sync tab | On web, a tab lists orders by retailer and status, with Find match, Create transaction and Unlink. | Core, $14.99/mo or $99.99/yr | [Read] |

### Budgeting

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Flex Budgeting | The default method tracks one flexible spending number and treats other costs as set in advance. | Core, $14.99/mo or $99.99/yr | [Read] |
| Fixed, Non-monthly and Flexible buckets | Under Flex Budgeting each category is placed in a Fixed, Non-monthly or Flexible bucket. | Core, $14.99/mo or $99.99/yr | [Read] |
| Flex number | Monarch works out the flexible amount as income minus fixed costs, non-monthly costs and goals. | Core, $14.99/mo or $99.99/yr | [Read] |
| Weekly flex view | A weekly view shows a weekly flex number for regular check-ins. | Core, $14.99/mo or $99.99/yr | [Read] |
| Flex colour indicators | Spending shows green under 50 percent, yellow from 50 to 99 percent, and red at 100 percent or more. | Core, $14.99/mo or $99.99/yr | [Read] |
| Unallocated flexible budget | A line shows any gap after money is moved between fixed, non-monthly and flexible budgets. | Core, $14.99/mo or $99.99/yr | [Read] |
| Category Budgeting | The traditional method gives every expense category its own monthly budget. | Core, $14.99/mo or $99.99/yr | [Read] |
| Switch budgeting method | Budget settings switch between Flex Budgeting and Category Budgeting at any time. | Core, $14.99/mo or $99.99/yr | [Read] |
| Group Budgeting | A group such as Food and Dining gets one budget instead of a budget per category. | Core, $14.99/mo or $99.99/yr | [Read] |
| Rollover Budgets | Unspent or overspent amounts in an expense category carry into the next month. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Rollover starting balance | A rollover budget can be given a starting balance (2023 post). | Core, $14.99/mo or $99.99/yr | [Read] |
| Auto-filled budget | The first budget fills each category with the average of the last six months of spending. | Core, $14.99/mo or $99.99/yr | [Read] |
| Recalculate default budgets | A budget setting re-runs the six-month average and overwrites current amounts. | Core, $14.99/mo or $99.99/yr | [Read] |
| Clear all budget values | A budget setting sets every past and future budget amount to zero. | Core, $14.99/mo or $99.99/yr | [Read] |
| Budget Walkthrough | A step-by-step review restarts budget setup without clearing existing data. | Core, $14.99/mo or $99.99/yr | [Read] |
| Left to budget | The budget shows planned income minus planned expenses. | Core, $14.99/mo or $99.99/yr | [Read] |
| Planned, Actual and Remaining | Web shows three columns per category, and mobile shows Planned and Remaining with Actual on tap. | Core, $14.99/mo or $99.99/yr | [Read] |
| Category history | Tapping a budget amount shows six months of history and can apply a past month or the average. | Core, $14.99/mo or $99.99/yr | [Read] |
| Budget progress bars | Each budget category has a bar showing whether spending is over or under. | Core, $14.99/mo or $99.99/yr | [Read] |
| Apply changes to future months | A budget edit can apply to all later months, and the default is set in Budget settings. | Core, $14.99/mo or $99.99/yr | [Read] |
| Exclude category from budget | A toggle hides a category from the budget while its transactions still count in cash flow. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goals in budget | The budget shows how much is set aside for goals each month beside income and expenses. | Core, $14.99/mo or $99.99/yr | [Read] |
| Household budget | A household shares one budget, and it cannot be split by owner. | Core, $14.99/mo or $99.99/yr | [Read] |

### Cash flow and reports

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Cash Flow | A Cash Flow screen tracks income, expenses and savings, leaves out transfers, and has an Owners filter. | Core, $14.99/mo or $99.99/yr | [Read] |
| Reports | Spending and Income tabs build custom charts from categories, groups, accounts, tags and more. | Core, $14.99/mo or $99.99/yr | [Read] |
| Sankey diagram | A flow chart shows how income moves into spending categories. | Core, $14.99/mo or $99.99/yr | [Read] |
| Treemap view | Spending and Income tabs can show each category as a block sized by its dollar amount. | Core, $14.99/mo or $99.99/yr | [Read] |
| Bar charts | Bar charts show spending over time with an average line and dynamic axis scaling. | Core, $14.99/mo or $99.99/yr | [Read] |
| Donut chart | A donut chart breaks spending into categories. | Core, $14.99/mo or $99.99/yr | [Read] |
| Report filters | Reports filter by category, group, account, account type, tag, goal and owner. | Core, $14.99/mo or $99.99/yr | [Read] |
| Group by owner | Spending and Income tabs can group results by household owner. | Core, $14.99/mo or $99.99/yr | [Read] |
| Relative date ranges | Reports use ranges such as This month, Last year or Last 2 quarters that update each time. | Core, $14.99/mo or $99.99/yr | [Read] |
| Saved Reports | A favourite report is saved once and opens later with fresh data. | Core, $14.99/mo or $99.99/yr | [Read] |
| Report drill-down | Clicking a category or merchant opens a detail page that keeps filters and offers Edit multiple, Sort and Columns. | Core, $14.99/mo or $99.99/yr | [Read] |
| Share or download chart | A chart can be shared or downloaded with dollar amounts hidden (2024 post). | Core, $14.99/mo or $99.99/yr | [Ask] |
| Mobile Reports | All web reports are on mobile, with All Time as the default range. | Core, $14.99/mo or $99.99/yr | [Read] |
| Monthly review | A mobile dashboard card walks through 11 views of cash flow, budget progress, top categories and net worth. | Core, $14.99/mo or $99.99/yr | [Read] |

### Recurring bills and subscriptions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Recurring detection | Monarch scans transactions for bills, subscriptions and recurring income such as paychecks. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Approve new recurring items | Newly detected recurring items must be approved or edited before they appear. | Core, $14.99/mo or $99.99/yr | [Read] |
| Add recurring manually | A recurring item can be created from one transaction or from scratch (2022 post). | Core, $14.99/mo or $99.99/yr | [Read] |
| Recurring calendar view | A monthly calendar plots upcoming bills and marks paid ones with a green checkmark. | Core, $14.99/mo or $99.99/yr | [Read] |
| Recurring list view | A list shows all recurring merchants and can be grouped by frequency, category, account or amount. | Core, $14.99/mo or $99.99/yr | [Read] |
| Bill Sync | Credit cards and loans show the latest statement balance, minimum payment due and due date on the Recurring page. | Core, $14.99/mo or $99.99/yr | [Read] [Flag] |
| Bill Sync paid status | A synced bill is marked paid automatically once the statement balance is paid in full. | Core, $14.99/mo or $99.99/yr | [Rule] [Flag] |
| Bill Sync refresh | Statement balances from Spinwheel sync daily, for United States members only. | Core, $14.99/mo or $99.99/yr | [Rule] [Flag] |
| Manage your synced accounts | Members choose which found credit accounts to track and can disconnect Spinwheel to delete synced data. | Core, $14.99/mo or $99.99/yr | [Ask] [Flag] |

### Goals

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Save Up Goals | A savings goal has a target amount, a target date and a planned monthly contribution. | Core, $14.99/mo or $99.99/yr | [Read] |
| Pay Down Goals | Each debt account gets a projected payoff timeline and interest tracking. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goal status | Each goal is labelled On track, Ahead or At risk, and updates when the plan changes. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goal account linking | One account can fund many goals, and one goal can draw from many accounts. | Core, $14.99/mo or $99.99/yr | [Read] |
| Asset accounts in goals | Any asset account can count toward a goal, including crypto, vehicles, real estate and company equity. | Core, $14.99/mo or $99.99/yr | [Read] |
| Auto-update goal balance | A goal balance can follow its linked account balance automatically, if the member turns this on. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Spending from goals | Spending, including on a credit card, can be tracked against a goal. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goal spending rule | Each goal sets whether spending lowers progress or is left out of progress. | Core, $14.99/mo or $99.99/yr | [Read] |
| Transaction linking | A transaction can be linked to a goal and then shows a target icon. | Core, $14.99/mo or $99.99/yr | [Read] |
| Bulk linking | Several selected transactions can be linked to a goal at once. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goal rules | A transaction rule links matching transactions to a goal across accounts. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Growth Rates in Save Up Goals | Save Up projections include expected growth for brokerage and high-yield savings accounts. | Core, $14.99/mo or $99.99/yr | [Read] |
| Debt payoff calculator | The Pay Down page compares avalanche and snowball methods and extra monthly payments. | Core, $14.99/mo or $99.99/yr | [Read] |
| Save plan to budget | A chosen pay down plan and its planned payments can be saved to the budget. | Core, $14.99/mo or $99.99/yr | [Read] |
| Reconciliation history | A log lists past goal reconciliations and lets the member undo a wrong one. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goal detail page | Each goal shows contributions over time, spending against it and a completion forecast. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goals filter | Goals work as a filter on transactions and reports. | Core, $14.99/mo or $99.99/yr | [Read] |
| Archive goal | Archiving a goal removes it from future budgets. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goal image | Each goal can carry a custom image. | Core, $14.99/mo or $99.99/yr | [Read] |
| Goals migration | Members on the old Goals version are guided through steps to move to the new one. | Core, $14.99/mo or $99.99/yr | [Ask] |

### Net worth and accounts

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Net worth chart | A chart tracks net worth over time across all assets and debts. | Core, $14.99/mo or $99.99/yr | [Read] |
| Net worth account type filter | The chart filters by account type such as Cash, Investments, Loans and Credit Cards. | Core, $14.99/mo or $99.99/yr | [Read] |
| Daily change on chart | Touching the mobile chart shows the change for that day, and a slider sets the date range. | Core, $14.99/mo or $99.99/yr | [Read] |
| Accounts page | Accounts are grouped by type with balances, percentage change and small trend lines. | Core, $14.99/mo or $99.99/yr | [Read] |
| Accounts summary | A summary card shows each group's share of net worth and a year-to-date view. | Core, $14.99/mo or $99.99/yr | [Read] |
| Account filters | On web, the Accounts page filters by several account types, single accounts and owners at once. | Core, $14.99/mo or $99.99/yr | [Read] |
| Account sorting | On web, a Sort menu orders accounts by amount, high to low or low to high, within each group. | Core, $14.99/mo or $99.99/yr | [Read] |
| Custom account order | On web, accounts are dragged into a custom order that the mobile app follows. | Core, $14.99/mo or $99.99/yr | [Read] |
| Account Notes | A Notes field on each account stores context such as its purpose or payoff plan. | Core, $14.99/mo or $99.99/yr | [Read] |
| Custom account logo | Members upload their own image or logo for an account. | Core, $14.99/mo or $99.99/yr | [Read] |
| Tracking Credit Utilization | Each credit card shows a utilisation bar with balance, limit and remaining credit, and the limit can be edited. | Core, $14.99/mo or $99.99/yr | [Read] |
| Exclude account balance | A toggle leaves an account's balance out of net worth. | Core, $14.99/mo or $99.99/yr | [Read] |
| Hide account | A hidden account leaves the main view but stays visible in Institution Settings. | Core, $14.99/mo or $99.99/yr | [Read] |
| Close account | Closing an account keeps its history and sets its balance to zero. | Core, $14.99/mo or $99.99/yr | [Read] |
| Invert balance | The account detail page flips the sign of a balance that a provider sends wrongly. | Core, $14.99/mo or $99.99/yr | [Read] |
| Account history range | Account detail pages show history back to the year 2000. | Core, $14.99/mo or $99.99/yr | [Read] |

### Investments

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Investments page | One view combines stocks, mutual funds, ETFs, 401(k) accounts, crypto and other holdings. | Core, $14.99/mo or $99.99/yr | [Read] |
| Holdings | Each holding shows the quantity owned, current market price and original cost. | Core, $14.99/mo or $99.99/yr | [Read] |
| Top movers | The Investments view highlights the holdings that moved most. | Core, $14.99/mo or $99.99/yr | [Read] |
| Allocation | The Investments view shows how the portfolio is spread across investment types. | Core, $14.99/mo or $99.99/yr | [Read] |
| Benchmark comparison | Portfolio performance can be compared with the S&P 500, US Stocks or US Bonds. | Core, $14.99/mo or $99.99/yr | [Read] |
| Price refresh | Stocks, ETFs and crypto prices refresh every 5 minutes during market hours (2025 post). | Core, $14.99/mo or $99.99/yr | [Rule] |
| Manual Investment Holdings | Members add a holding by name or ticker with a quantity, and its value follows market prices. | Core, $14.99/mo or $99.99/yr | [Read] |
| Track balances manually | An investment account without tickers can be tracked as one total balance. | Core, $14.99/mo or $99.99/yr | [Read] |
| Changing the Security Type | A misclassified holding can be given the correct security type. | Core, $14.99/mo or $99.99/yr | [Read] |
| Investment Transactions | An Early Access beta setting syncs investment account transactions into budgets and cash flow. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Equity Tracking | A Company equity account tracks RSU, ISO, NSO and RSA grants for private or public companies. | Core, $14.99/mo or $99.99/yr | [Read] |
| Import grant from documents | A PDF, PNG or JPG grant agreement is uploaded and its details are filled in automatically. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Vesting schedule | Terms such as 4 years, quarterly, 1 year cliff create vesting events automatically. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Vesting chart | A bar chart splits equity over time into Vested, Exercised and Unvested. | Core, $14.99/mo or $99.99/yr | [Read] |
| Equity valuation method | The member picks 409a, Preferred price or Custom price and can update the share price. | Core, $14.99/mo or $99.99/yr | [Read] |
| Link equity to brokerage | Linking an equity account to a connected brokerage avoids counting the same shares twice. | Core, $14.99/mo or $99.99/yr | [Read] |
| Gains & Losses | Holdings show gains and losses against original cost, with optional tax lot details. | Plus, $199/yr | [Read] [Flag] |
| Fund Analysis | Morningstar data breaks funds into 11 broad asset classes to show diversification. | Plus, $199/yr | [Read] [Flag] |
| Portfolio treemap | On web, holdings across all accounts appear as blocks by asset class and sector, sized by position. | Plus, $199/yr | [Read] |
| Classification override | A member can change how a holding is classified in the allocation view. | Plus, $199/yr | [Read] |

### Forecasting

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Forecasting | On web, a chart projects net worth and cash flow year by year to the end of the plan. | Plus, $199/yr | [Read] [Flag] |
| Forecast setup | Six setup steps confirm members, birth dates, accounts, take-home income and retirement age. | Plus, $199/yr | [Read] |
| Baseline from real data | Income and expenses start as the average of the last 12 full months and can be edited. | Plus, $199/yr | [Read] |
| Edit assumptions | Members change inflation, life expectancy and growth rates, with defaults of 3 percent inflation and age 90. | Plus, $199/yr | [Read] |
| Today's dollars or future dollars | A dropdown shows the forecast in today's dollars or in future dollars. | Plus, $199/yr | [Read] |
| Account growth rates | Each account type has a default growth rate, and rates can change over the plan's timeline. | Plus, $199/yr | [Read] [Flag] |
| Paycheck contributions | Members enter 401(k), 403(b) and HSA paycheck contributions and employer match by hand. | Plus, $199/yr | [Read] |
| Retirement event | A default event at age 65 ends income and adjusts expenses, and all values can be changed. | Plus, $199/yr | [Read] [Flag] |
| Social Security event | Each member gets a default benefit of $2,000 a month from age 65, editable from age 62. | Plus, $199/yr | [Read] [Flag] |
| Buy a home event | A home purchase is modelled with price, down payment, loan term, rate, PMI, tax, insurance and upkeep. | Plus, $199/yr | [Read] |
| Have a kid event | A child adds default costs of $18,000 a year for 13 years plus $4,500 upfront. | Plus, $199/yr | [Read] |
| Career break event | A break sets start and end years, an income cut and a living expense level. | Plus, $199/yr | [Read] |
| New job event | A job change sets the owner, start year, yearly take-home pay and signing bonus. | Plus, $199/yr | [Read] |
| Other income and Other expense events | Custom one-time or recurring events, including windfalls, take custom intervals and icons. | Plus, $199/yr | [Read] |
| Scenarios | Members save any number of named what-if versions, each with its own events, icon and colour. | Plus, $199/yr | [Read] |
| Compare scenarios | Two scenarios appear on one chart with the difference shown for each headline number. | Plus, $199/yr | [Read] |
| Stats bar | Four numbers update live: end of year net worth, net worth at retirement, retirement age and final net worth. | Plus, $199/yr | [Read] |
| Withdrawal order | Shortfalls draw from accounts in an editable order, starting with extra savings and cash. | Plus, $199/yr | [Read] [Flag] |
| Withdrawal timing | Each account can be set to Anytime, a Starting year, or Never for withdrawals. | Plus, $199/yr | [Read] [Flag] |
| Early withdrawal penalties | Withdrawals before age 59.5 take a default 10 percent penalty, or 20 percent for HSAs before 65. | Plus, $199/yr | [Read] [Flag] |
| Tax assumptions | Default rates are 15 percent on capital gains and 20 percent on tax-deferred withdrawals. | Plus, $199/yr | [Read] [Flag] |
| Mixed 401(k) forecasting | Pretax and Roth parts of one account are forecast separately. | Plus, $199/yr | [Read] [Flag] |
| Extra savings splits | Surplus income can be sent to chosen accounts by percentage or fixed amount. | Plus, $199/yr | [Read] |
| Forecast tables | Accounts, Cash Flow and Events tabs show yearly figures, and each row opens its calculation. | Plus, $199/yr | [Read] |

### Business Tracking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Business Tracking | Members create separate businesses and assign accounts and transactions to each one. | Plus, $199/yr | [Read] |
| Business filter | Each business has its own filter across accounts, transactions and reports. | Plus, $199/yr | [Read] |
| P&L reporting | A built-in profit and loss report runs by month, quarter or year. | Plus, $199/yr | [Read] |
| Schedule C tax prep doc | A Schedule C style summary can be exported for tax preparation. | Plus, $199/yr | [Ask] [Flag] |
| Business Tax Prep periods | Reports and CSV or PDF exports use IRS estimated-tax periods. | Plus, $199/yr | [Read] [Flag] |
| Business tracking widget | A dashboard widget and business reports show business results. | Plus, $199/yr | [Read] |
| Business Tracking on mobile | Since July 2026, businesses can be set up and managed in the mobile app. | Plus, $199/yr | [Read] |

### Estate planning

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Estate Planning with Trust & Will | After the trial, Plus members claim one free Couples will worth $299 on the Trust & Will site. | Plus, $199/yr | [Ask] |
| Trust credit | The same $299 can go toward a Trust & Will trust plan instead. | Plus, $199/yr | [Ask] |

### AI features

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| AI Assistant | A chat answers plain-language questions about the member's own spending, budget, debts and net worth. | Core, $14.99/mo or $99.99/yr | [Read] [Flag] |
| Assistant product help | The assistant also explains how to use Monarch features, such as building a report. | Core, $14.99/mo or $99.99/yr | [Read] |
| AI Insights | A sparkle icon on the Dashboard, Accounts and Transactions pages explains what changed and why. | Core, $14.99/mo or $99.99/yr | [Read] |
| Weekly Recap | A dashboard card sums up the week's spending, income, savings, recurring charges and net worth. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Weekly Recap email | The same weekly summary is sent by email. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Explain this transaction | An AI action describes what a selected transaction is. | Core, $14.99/mo or $99.99/yr | [Read] |
| Household details | Optional details such as ZIP code, dependents, income and employment make AI answers more relevant. | Core, $14.99/mo or $99.99/yr | [Read] |
| AI feedback buttons | Thumbs up and thumbs down buttons rate chats and insights. | Core, $14.99/mo or $99.99/yr | [Read] |
| Hide AI features | A setting under Preferences hides the assistant and other optional AI features. | Core, $14.99/mo or $99.99/yr | [Read] |
| Monarch MCP Connector | A connector for outside AI tools is paused since late June 2026 over a data provider question. | Not stated | [Read] |

### Collaboration

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Invite household members | The owner invites people by email at no extra cost, and each gets their own login. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Household roles | The Admin manages members and billing, and Members see and manage all accounts, transactions and budgets. | Core, $14.99/mo or $99.99/yr | [Read] |
| Shared Views | Accounts and transactions are labelled mine, theirs or shared. | Core, $14.99/mo or $99.99/yr | [Read] |
| Owner filters | Filters switch accounts, transactions, net worth, reports and cash flow between personal, partner and household views. | Core, $14.99/mo or $99.99/yr | [Read] |
| Edit Owners | Owners are set per account, and transactions inherit that owner unless changed. | Core, $14.99/mo or $99.99/yr | [Read] |
| Owner rules | Rules assign owners automatically and can split a transaction between owners. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Show owner on transactions | A display setting adds the owner to the transactions page. | Core, $14.99/mo or $99.99/yr | [Read] |
| Profile colours | Each member's custom avatar colour appears wherever an owner is shown. | Core, $14.99/mo or $99.99/yr | [Read] |
| Assign for review | A transaction is assigned to a household member, who is notified and sees it on the dashboard. | Core, $14.99/mo or $99.99/yr | [Read] |
| Remove member | The owner or the member can remove a member, which also removes accounts added under that login. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Give access to a financial professional | A member grants an adviser view and edit access by email for one year, and can revoke it. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Sponsored access | A professional pays for the client's subscription by code and gets full access to the household. | Paid by adviser, $14.99 per client per month | [Ask] |
| Professionals portal | Advisers invite clients, view each client's household, and manage sponsorships in a separate portal. | Paid by adviser, $14.99 per client per month | [Read] |
| Temporary access | A tax accountant or other professional gets access for up to 7 days (2023 post). | Core, $14.99/mo or $99.99/yr | [Ask] |
| Grant support access | A setting on web and mobile lets Monarch support view the account. | Core, $14.99/mo or $99.99/yr | [Ask] |

### Notifications and digests

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Notification settings | One page lists every alert type with push, email and in-app toggles, including all on or off per channel. | Core, $14.99/mo or $99.99/yr | [Read] |
| Upcoming recurring reminder | A push or email arrives 3 days before a recurring transaction is expected (2022 post). | Core, $14.99/mo or $99.99/yr | [Rule] |
| Bill due date alert | An alert is sent when a synced credit card or loan due date is near. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Credit score change alert | An alert is sent when the credit score moves by more than 20 points. | Core, $14.99/mo or $99.99/yr | [Rule] [Flag] |
| Flex spending threshold alert | An alert can fire at a spending level such as 50 percent of the flexible budget. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Needs review notification | A member is notified when a transaction is assigned to them for review. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Receipt notifications | Alerts report a receipt import, a receipt match and a receipt import error. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Connection issue messages | Clear messages with step-by-step fixes appear in the app and by email when a connection breaks. | Core, $14.99/mo or $99.99/yr | [Rule] |
| Notification badge | The badge count matches the number of unread notifications. | Core, $14.99/mo or $99.99/yr | [Read] |
| Price change notice | Monarch gives at least 30 days notice before any price change. | Core, $14.99/mo or $99.99/yr | [Read] |

### Dashboard and navigation

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Customize dashboard | Cards are dragged to reorder or removed, and web and mobile keep separate layouts. | Core, $14.99/mo or $99.99/yr | [Read] |
| Budget widget | A dashboard card shows budget progress, including Fixed, Flexible and Non-monthly under Flex Budgeting. | Core, $14.99/mo or $99.99/yr | [Read] |
| Net worth widget | A dashboard card shows net worth. | Core, $14.99/mo or $99.99/yr | [Read] |
| Investments widget | A dashboard card shows investment performance. | Core, $14.99/mo or $99.99/yr | [Read] |
| Savings goals widget | A dashboard card shows goal progress. | Core, $14.99/mo or $99.99/yr | [Read] |
| Credit score widget | A dashboard card shows the latest score and last synced date for each member. | Core, $14.99/mo or $99.99/yr | [Read] [Flag] |
| Spending trend widget | A card compares this month with the 12-month average, or year to date with last year. | Core, $14.99/mo or $99.99/yr | [Read] |
| Transactions widget | A dashboard card lists recent transactions. | Core, $14.99/mo or $99.99/yr | [Read] |
| Recurring Transactions widget | A dashboard card shows upcoming recurring items. | Core, $14.99/mo or $99.99/yr | [Read] |
| CommandK search bar | On web, Cmd+K or Ctrl+K searches categories, merchants, accounts, goals and saved reports and runs actions. | Core, $14.99/mo or $99.99/yr | [Read] |
| Keyboard shortcuts | The search bar shows a full list of keyboard shortcuts. | Core, $14.99/mo or $99.99/yr | [Read] |
| Appearance | Light, dark or system mode is chosen separately on web and mobile and persists after sign-out. | Core, $14.99/mo or $99.99/yr | [Read] |
| Edit Navigation | On mobile, members choose which items sit in the bottom bar and sidebar, and their order. | Core, $14.99/mo or $99.99/yr | [Read] |
| Demo Mode | On mobile, all balances, transactions and charts are masked so the app can be shown to others. | Core, $14.99/mo or $99.99/yr | [Read] |

### Mobile home screen widgets

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Budget widget (home screen) | A ring shows the percent of a chosen budget used, and dollar amounts can be hidden. | Core, $14.99/mo or $99.99/yr | [Read] |
| Transactions widget (home screen) | A list shows Needs review, Most recent or Uncategorized transactions, with 3 or 8 rows on iOS. | Core, $14.99/mo or $99.99/yr | [Read] |
| Investments widget (home screen) | The widget shows portfolio change today and over 30 days, with a benchmark in the larger size. | Core, $14.99/mo or $99.99/yr | [Read] |
| Receipt Scanning widget | A home screen widget opens the receipt scanner directly. | Core, $14.99/mo or $99.99/yr | [Read] |
| App icon shortcut | Long-pressing the app icon, or an iOS shortcut, starts a receipt scan. | Core, $14.99/mo or $99.99/yr | [Read] |

### Credit score

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Credit score tracking | A VantageScore 3.0 based on Equifax data is shown, for United States members only. | Core, $14.99/mo or $99.99/yr | [Read] [Flag] |
| Monthly score update | The score updates once a month on the connection date and cannot be refreshed by hand. | Core, $14.99/mo or $99.99/yr | [Rule] [Flag] |
| Score history chart | After three months of data, a graph shows the score over time. | Core, $14.99/mo or $99.99/yr | [Read] [Flag] |
| Household scores | Each member connects their own score, and all household members can see every score. | Core, $14.99/mo or $99.99/yr | [Read] [Flag] |
| Pause tracking | A member can pause score tracking to remove the number. | Core, $14.99/mo or $99.99/yr | [Ask] [Flag] |

### Data export

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Download transactions (one account) | The account Edit menu downloads that account's transactions as a CSV. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Download Transactions (all accounts) | Settings then Data downloads all transactions as a CSV, including hidden ones. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Filtered downloads | A transaction download matches the filters of the current view. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Download balance history | The account Edit menu downloads that account's balance history as a CSV. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Download CSV of balances | The Accounts summary box downloads balances for all accounts as a CSV. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Export after cancelling | Full transaction and balance history can still be downloaded after a subscription or trial ends. | Free after cancelling | [Ask] |
| CSV re-import by ID | An exported CSV can be edited and re-imported to update existing transactions by transaction ID. | Core, $14.99/mo or $99.99/yr | [Ask] |

### Platforms and countries

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Web app | The full product runs in a browser at app.monarch.com. | Core, $14.99/mo or $99.99/yr | [Read] |
| iPhone app | An iOS app covers the main screens, and is required for Apple Card sync. | Core, $14.99/mo or $99.99/yr | [Read] |
| iPad app | The iPad layout fits the larger screen and uses a sidebar instead of a bottom bar. | Core, $14.99/mo or $99.99/yr | [Read] |
| Android app | An Android app is on Google Play with 500K+ downloads and a 4.8 rating. | Core, $14.99/mo or $99.99/yr | [Read] |
| Canada | The app is available in Canada, billed in US dollars, without Zillow, VinAudit, Bill Sync or credit scores. | Core, $14.99/mo or $99.99/yr | [Read] |
| Currency display | All amounts show a dollar sign with no conversion, so only USD or CAD accounts are advised. | Core, $14.99/mo or $99.99/yr | [Read] |

### Security and privacy

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Read-only access | Monarch has read-only permissions and cannot move money in or out of accounts. | Core, $14.99/mo or $99.99/yr | [Read] |
| No stored credentials | Bank usernames and passwords go to the data providers and are not stored by Monarch. | Core, $14.99/mo or $99.99/yr | [Read] |
| Encryption | All data is encrypted at rest and in transit. | Core, $14.99/mo or $99.99/yr | [Read] |
| Multi-Factor Authentication | Members turn on an authenticator app code for login, in Settings then Security on web. | Core, $14.99/mo or $99.99/yr | [Read] |
| Recovery codes | Recovery codes can be downloaded, printed or copied for use when a code cannot be received. | Core, $14.99/mo or $99.99/yr | [Read] |
| One-time passcode | A code sent by email is required when logging in from an unrecognised device or browser. | Core, $14.99/mo or $99.99/yr | [Read] |
| Password breach warning | The app warns when a password appears in a known breach. | Core, $14.99/mo or $99.99/yr | [Read] |
| SOC 2 Type 2 | Independent auditors have certified Monarch's security controls. | Core, $14.99/mo or $99.99/yr | [Read] |
| No ads | The app shows no ads and no third-party financial product promotions. | Core, $14.99/mo or $99.99/yr | [Read] |
| AI data limits | AI models get only the minimum data needed and never names, emails, logins or full account numbers. | Core, $14.99/mo or $99.99/yr | [Read] |
| Delete account | Members can delete their account and request deletion of their data. | Core, $14.99/mo or $99.99/yr | [Ask] |

### Billing and support

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Core monthly plan | Core costs $14.99 a month and covers the whole household. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Core annual plan | Core costs $99.99 a year. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Monarch Plus | Plus costs $199 a year with no monthly option listed, and has its own 7-day trial. | Plus, $199/yr | [Ask] |
| WELCOME promo code | New members get 30 percent off the first year of annual Core when billed directly. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Switch billing period | Members switch between monthly and annual at any time, with unused time credited. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Upgrade or downgrade | Core members upgrade to Plus at any time, and Plus members drop to Core at period end. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Money-back guarantee | Directly billed members can request a refund for the remaining time on a subscription. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Gift Monarch | A member buys a one-year Core gift code for $50, with no expiry date. | $50 per gift | [Ask] |
| Referral Rewards | Referrers earn gift cards up to $480 a year, and invitees get 50 percent off the first Core year. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Switch from App Store to Direct Billing | Members billed by Apple or Google can move to direct billing with Monarch. | Core, $14.99/mo or $99.99/yr | [Ask] |
| Help Center | Help articles are grouped by getting started, accounts, billing, feature guides and professionals. | Free, public page | [Read] |
| Contact support | Members open a ticket from Help and Support or email support@monarch.com. | Core, $14.99/mo or $99.99/yr | [Ask] |
| System Health | A public status page reports incidents. | Free, public page | [Read] |
| Product roadmap | Members vote on planned features on a public roadmap board. | Core, $14.99/mo or $99.99/yr | [Ask] |

### Business model and partners

- Monarch earns money only from subscriptions: Core at $14.99 a month or $99.99 a year, and Plus at $199 a year.
- It also bills financial professionals $14.99 a month for each sponsored client, and sells $50 gift subscriptions.
- It says it shows no ads and does not promote third-party financial products.
- Bank data comes from Plaid, Mastercard Data Connect (formerly Finicity) and MX, and credit data from Spinwheel using Equifax.
- Other named partners are Zillow, VinAudit, Morningstar, Trust & Will, Stripe for payments, and OpenAI, Anthropic and Google for AI models.
- Its terms say Monarch Money, Inc. is not a bank, consumer reporting agency, creditor, investment adviser or broker.

### What users say is missing or broken

- Connections break or sync wrong data, including Fidelity and Canadian banks (Trustpilot and Google Play reviews, 2026).
- Duplicate transactions and wrongly categorised spending are common complaints (Trustpilot reviews, September 2026).
- Forecasting sits behind the $199 Plus tier, which many members expected in Core (r/MonarchMoney threads, 2026).
- The budget cannot be saved, downloaded or printed, and support has no phone line (Trustpilot reviews, 2026).
- Savings sub-buckets do not sync and investment tracking is called thinner than rivals (NerdWallet review, January 2026).

### Sources

- [Monarch Pricing](https://monarch.com/pricing)
- [What's New](https://monarch.com/whats-new)
- [What's New, page 2](https://monarch.com/whats-new?p=2)
- [What's New, page 3](https://www.monarch.com/whats-new?p=3)
- [Easier Bank Connections, a Faster AI Assistant, and more](https://www.monarch.com/blog/september-product-update)
- [Monarch hits $100M in ARR and welcomes the team behind HMBradley](https://www.monarch.com/blog/welcoming-MBI)
- [New Reports, Early Retirement Forecasting, and more](https://www.monarch.com/blog/august-product-update)
- [Email Forwarding, Side-by-Side Forecasting, and more](https://www.monarch.com/blog/july-product-update)
- [Goals, reimagined](https://www.monarch.com/blog/goals)
- [Mobile Reports, Smarter Forecasting, and New Goals Features](https://www.monarch.com/blog/june-product-update)
- [Introducing Monarch Plus](https://www.monarch.com/blog/monarch-plus)
- [Introducing Forecasting](https://www.monarch.com/blog/forecasting)
- [Introducing our Winter Release](https://www.monarch.com/blog/winter-release)
- [Shared Views](https://www.monarch.com/blog/shared-views)
- [The Monarch Extension, now supporting Target](https://www.monarch.com/blog/monarch-extension-for-target)
- [Credit Score Tracking in Monarch](https://www.monarch.com/blog/credit-score-tracking)
- [Your Amazon orders, perfectly categorized](https://www.monarch.com/blog/monarch-extension-and-more)
- [Your favorite reports, now one click away](https://www.monarch.com/blog/saved-reports-and-more)
- [Introducing Bill Sync](https://www.monarch.com/blog/introducing-bill-sync)
- [iPad support, Budget enhancements and more](https://www.monarch.com/blog/ipad-support-budget-enhancements-and-more)
- [Review faster than ever, and split transactions automatically](https://www.monarch.com/blog/review-on-the-go-and-smart-split)
- [New Net Worth Chart, Investment Transactions and more](https://www.monarch.com/blog/new-net-worth-chart-investment-transactions-and-more)
- [Reports, Canada, Improved Syncing](https://www.monarch.com/blog/reports-canada-improved-syncing)
- [Group-level budgeting](https://www.monarch.com/blog/group-level-budgeting)
- [Track recurring bills and subscriptions](https://www.monarch.com/blog/track-recurring-bills-and-subscriptions)
- [Rollovers and referral rewards](https://www.monarch.com/blog/rollovers-and-referral-rewards)
- [Coinbase, organizing accounts, rules](https://www.monarch.com/blog/coinbase-organizing-accounts-rules)
- [Flex budgeting: simplify your spending with just one number](https://www.monarch.com/blog/flex-budgeting-simplify-your-spending-with-just-one-number)
- [Monarch features: Tracking](https://www.monarch.com/features/tracking)
- [Monarch features: Planning](https://www.monarch.com/features/planning)
- [Monarch in Canada](https://www.monarch.com/canada)
- [Terms of Use](https://www.monarch.com/terms)
- [Privacy and Security (site page)](https://www.monarch.com/security)
- [Help Center home](https://help.monarch.com/hc/en-us)
- [Monarch Plus Tier](https://help.monarch.com/hc/en-us/articles/48349699981972-Monarch-Plus-Tier)
- [Understanding Data Providers and Connections](https://help.monarch.com/hc/en-us/articles/33707613533972-Understanding-Data-Providers-and-Connections)
- [Guide to Connecting Your Accounts](https://help.monarch.com/hc/en-us/articles/360048393352)
- [Syncing Your Apple Card, Cash, and Savings](https://help.monarch.com/hc/en-us/articles/24178098173076-Syncing-Your-Apple-Card-Cash-and-Savings)
- [Tracking your property, vehicles, and valuables](https://help.monarch.com/hc/en-us/articles/4404739126548-Tracking-your-property-vehicles-and-valuables)
- [Equity Tracking](https://help.monarch.com/hc/en-us/articles/44216543664788-Equity-Tracking)
- [Connecting to Spinwheel](https://help.monarch.com/hc/en-us/articles/29446751546516-Connecting-to-Spinwheel)
- [Checking the Connection Status](https://help.monarch.com/hc/en-us/articles/13227606293908-Checking-the-Connection-Status)
- [Transfer Balance and/or Transaction History to Another Account](https://help.monarch.com/hc/en-us/articles/14329385694484-Transfer-Balance-and-or-Transaction-History-to-Another-Account)
- [Importing Balances and Transactions Manually](https://help.monarch.com/hc/en-us/articles/41843105489300-Importing-Balances-and-Transactions-Manually)
- [Importing Transactions Manually](https://help.monarch.com/hc/en-us/articles/4409682789908-Importing-Transactions-Manually)
- [Manual Accounts](https://help.monarch.com/hc/en-us/articles/360058187072-Manual-Accounts)
- [Pricing (help article)](https://help.monarch.com/hc/en-us/articles/9136169422996-Pricing)
- [Updating Your Subscription](https://help.monarch.com/hc/en-us/articles/44815447567636-Updating-Your-Subscription)
- [Monarch's Money-back Guarantee](https://help.monarch.com/hc/en-us/articles/30368325619732-Monarch-s-Money-back-Guarantee)
- [Monarch Gift Subscriptions](https://help.monarch.com/hc/en-us/articles/43279081618836-Monarch-Gift-Subscriptions)
- [Referral Rewards](https://help.monarch.com/hc/en-us/articles/360058914191-Referral-Rewards)
- [About Monarch's AI Features](https://help.monarch.com/hc/en-us/articles/16116906962452-About-Monarch-s-AI-Features)
- [AI in Monarch](https://help.monarch.com/hc/en-us/articles/37526856682260-AI-in-Monarch)
- [Monarch MCP Connector](https://help.monarch.com/hc/en-us/articles/50207234679956-Monarch-MCP-Connector)
- [Creating Your Budget in Monarch](https://help.monarch.com/hc/en-us/articles/360048883631-Creating-Your-Budget-in-Monarch)
- [Creating Custom Categories and Groups](https://help.monarch.com/hc/en-us/articles/360048883771-Creating-Custom-Categories-and-Groups)
- [Monarch for Couples and Households](https://help.monarch.com/hc/en-us/articles/20926382202004-Monarch-for-Couples-and-Households)
- [Shared Views in Monarch](https://help.monarch.com/hc/en-us/articles/42228648365076-Shared-Views-in-Monarch)
- [Add Members to an Existing Account](https://help.monarch.com/hc/en-us/articles/360048393452-Add-Members-to-an-Existing-Account)
- [Professionals Program](https://help.monarch.com/hc/en-us/articles/11251085750292-Professionals-Program)
- [Working with a Financial Professional in Monarch](https://help.monarch.com/hc/en-us/articles/50397064205588-Working-with-a-Financial-Professional-in-Monarch)
- [Reviewing Transactions](https://help.monarch.com/hc/en-us/articles/5528707082516-Reviewing-Transactions)
- [Editing Transactions](https://help.monarch.com/hc/en-us/articles/360048393532-Editing-Transactions)
- [Splitting Transactions](https://help.monarch.com/hc/en-us/articles/360050178492-Splitting-Transactions)
- [Organizing Transactions with Tags](https://help.monarch.com/hc/en-us/articles/4409690120596-Organizing-Transactions-with-Tags)
- [Adding Notes and Attachments to a Transaction](https://help.monarch.com/hc/en-us/articles/360056422791-Adding-Notes-and-Attachments-to-a-Transaction)
- [Hiding or Unhiding Transactions](https://help.monarch.com/hc/en-us/articles/4405041904916-Hiding-or-Unhiding-Transactions)
- [Tips & Tricks for Using Monarch](https://help.monarch.com/hc/en-us/articles/28953573066260-Tips-Tricks-for-Using-Monarch)
- [Importing Receipts into Monarch](https://help.monarch.com/hc/en-us/articles/44244210547860-Importing-Receipts-into-Monarch)
- [Using the Retail Sync Extension](https://help.monarch.com/hc/en-us/articles/36463599367188-Using-the-Retail-Sync-Extension)
- [Downloading Transaction or Account History](https://help.monarch.com/hc/en-us/articles/15526600975764-Downloading-Transaction-or-Account-History)
- [Customizing Your Dashboard](https://help.monarch.com/hc/en-us/articles/360058127551-Customizing-Your-Dashboard)
- [Using Mobile Widgets](https://help.monarch.com/hc/en-us/articles/8611706513684-Using-Mobile-Widgets)
- [Monthly Progress Report](https://help.monarch.com/hc/en-us/articles/4402543752468-Monthly-Progress-Report)
- [Demo Mode](https://help.monarch.com/hc/en-us/articles/46153716425876-Demo-Mode)
- [Forecasting in Monarch](https://help.monarch.com/hc/en-us/articles/48344305092244-Forecasting-in-Monarch)
- [Estate Planning with Trust & Will](https://help.monarch.com/hc/en-us/articles/48258894293652-Estate-Planning-with-Trust-Will)
- [Manual Investment Holdings](https://help.monarch.com/hc/en-us/articles/10032888165140-Manual-Investment-Holdings)
- [Turning on Investment Transactions](https://help.monarch.com/hc/en-us/articles/22373197208212-Turning-on-Investment-Transactions)
- [Fund Classification Definitions](https://help.monarch.com/hc/en-us/articles/48401988544404-Fund-Classification-Definitions)
- [Viewing Your Credit Score](https://help.monarch.com/hc/en-us/articles/38550304735508-Viewing-Your-Credit-Score)
- [Privacy and Security (help article)](https://help.monarch.com/hc/en-us/articles/360048393572-Privacy-and-Security)
- [Multi-Factor Authentication](https://help.monarch.com/hc/en-us/articles/360054392152-Multi-Factor-Authentication)
- [Login Issues & Security](https://help.monarch.com/hc/en-us/articles/35673146932628-Login-Issues-Security)
- [International Accounts and Currency](https://help.monarch.com/hc/en-us/articles/360048393552-International-Accounts-and-Currency)
- [Monarch Domain change](https://help.monarch.com/hc/en-us/articles/41676405763860-Monarch-Domain-change)
- [Monarch: Budget & Track Money on Google Play](https://play.google.com/store/apps/details?id=com.monarchmoney.mobile)
- [NerdWallet: Monarch Money app review](https://www.nerdwallet.com/finance/learn/monarch-money-app-review)
- [Trustpilot: Monarch reviews](https://ie.trustpilot.com/review/www.monarchmoney.com)
- [r/MonarchMoney snapshot: Unpopular Opinion: Y'all are overreacting](https://reddit.sentinel-team.org/posts/1srpil9/snapshots/2026-04-21T16%3A40%3A59.04893Z)
- [r/MonarchMoney snapshot: Don't like the new additional paywall?](https://reddit.sentinel-team.org/posts/1srjp1j/snapshots/2026-04-21T16%3A40%3A59.04893Z)
- [Finny: Monarch Core vs Plus 2026 (third party)](https://getfinny.app/blog/monarch-money-core-vs-plus-2026)


## Copilot Money

Copilot Money is a design-led personal finance tracker for people in the United States who use Apple devices or a desktop browser. It costs $13 per month or $95 per year after a 1-month free trial, with no free tier and no Android app. Its disclosed partners are Plaid, Mastercard, MX, Akoya, Apple, Capital One, Coinbase, Public, Zillow, RentCast, Stripe and Google Cloud.

### Onboarding and account linking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Test drive | You can try the app with sample data before you connect any account. | Subscription, $13/mo or $95/yr | [Read] |
| Bank account linking in onboarding | You must link at least one bank account, and history usually imports within minutes. | Subscription, $13/mo or $95/yr | [Ask] |
| Historical transaction import | Most institutions supply one to two years of past transactions when you connect. | Subscription, $13/mo or $95/yr | [Read] |
| Suggested categories and first budget | Onboarding suggests spending categories and builds a first budget from your past spending. | Subscription, $13/mo or $95/yr | [Ask] |
| Income identification | Onboarding finds income transactions in the imported history. | Subscription, $13/mo or $95/yr | [Read] |
| Recurring detection in onboarding | Onboarding detects likely recurring payments and asks you to review them. | Subscription, $13/mo or $95/yr | [Read] |
| Plaid connections | Most banks, cards, loans and brokerages connect through Plaid Link. | Subscription, $13/mo or $95/yr | [Ask] |
| Not on Plaid? Try other ways to connect | A fallback search finds institutions on Mastercard, MX or Akoya by name or login URL. | Subscription, $13/mo or $95/yr | [Ask] |
| Unified institution search on web | On web, results from all data aggregators appear together in one search. | Subscription, $13/mo or $95/yr | [Ask] |
| Capital One direct integration | Capital One connects by OAuth, with posted transactions only and three months of history. | Subscription, $13/mo or $95/yr | [Ask] |
| Fidelity through Akoya | Fidelity data arrives once a day, one day behind, with posted transactions only. | Subscription, $13/mo or $95/yr | [Read] |
| Apple Card, Apple Cash and Savings | These Apple accounts sync through FinanceKit and must be set up on an iPhone with iOS 17.4 or later. | Subscription, $13/mo or $95/yr | [Ask] |
| Apple Card merge | Setup offers to merge a manual Apple Card with the new connected Apple Card. | Subscription, $13/mo or $95/yr | [Ask] |
| Coinbase direct integration | Coinbase crypto holdings connect through a direct integration on iPhone, iPad and Mac. | Subscription, $13/mo or $95/yr | [Ask] |
| Public direct integration | Public brokerage accounts connect directly with close to real-time portfolio updates. | Subscription, $13/mo or $95/yr | [Ask] |
| Crypto exchange integrations | Binance.US, Bitstamp, FTX US, Gemini and Kraken connect with read API keys. | Subscription, $13/mo or $95/yr | [Ask] |
| Track a crypto address | You add a Bitcoin or Ethereum address by QR scan or paste for automatic tracking. | Subscription, $13/mo or $95/yr | [Ask] |
| Bitcoin xPub key | You enter an extended public key to track Bitcoin in hardware or app wallets. | Subscription, $13/mo or $95/yr | [Ask] |
| ADD TOKEN | You search for and add extra tokens held at an Ethereum address. | Subscription, $13/mo or $95/yr | [Ask] |
| Venmo (Copilot Labs) | A unique forwarding email address imports Venmo receipt emails as transactions in real time. | Subscription, $13/mo or $95/yr | [Rule] |
| Venmo note categorisation | Adding #copilot plus a category name or emoji to a Venmo note sets its category. | Subscription, $13/mo or $95/yr | [Rule] |
| Venmo transfer handling | Bank-side transfers to and from Venmo are marked as Internal Transfers automatically. | Subscription, $13/mo or $95/yr | [Rule] |
| Multiple Venmo accounts | You can connect several Venmo accounts, each with its own forwarding setup. | Subscription, $13/mo or $95/yr | [Ask] |
| Amazon (Copilot Labs) | Linking Amazon imports itemised order history and matches orders to bank transactions. | Subscription, $13/mo or $95/yr | [Rule] |
| Amazon automatic matching | An order matches a transaction when amounts are equal and dates fall within 2 days. | Subscription, $13/mo or $95/yr | [Rule] |
| Assign to a Transaction | You manually match an unmatched Amazon order to a recent Amazon transaction. | Subscription, $13/mo or $95/yr | [Ask] |
| Amazon re-verification | The Amazon link must be re-verified every few weeks, with alerts shown in To Review. | Subscription, $13/mo or $95/yr | [Ask] |
| Manual accounts | You create manual credit card, depository, investment, loan, real estate or cash accounts. | Subscription, $13/mo or $95/yr | [Ask] |
| Mint Transactions Import | You can import historic Mint transactions on iOS and Mac (dated changelog entry). | Subscription, $13/mo or $95/yr | [Ask] |
| Restart the onboarding | A setting repeats the setup steps without rescanning for duplicates or recurrings. | Subscription, $13/mo or $95/yr | [Ask] |

### Accounts and net worth

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Accounts tab | All accounts appear grouped by type with a combined balance for each group. | Subscription, $13/mo or $95/yr | [Read] |
| Net Worth graph | A chart shows net worth over a chosen timeframe, with exact values on hold or hover. | Subscription, $13/mo or $95/yr | [Read] |
| ALL timeframe | Mac, iPad and web add an ALL timeframe that shows full balance history. | Subscription, $13/mo or $95/yr | [Read] |
| Assets and debt view | A chart setting shows net worth as one line or as separate asset and debt lines. | Subscription, $13/mo or $95/yr | [Read] |
| Exclude account from Net Worth chart | You can leave individual accounts out of the net worth chart total. | Subscription, $13/mo or $95/yr | [Ask] |
| Connections Needing Attention | A section lists connections that stopped syncing or found new accounts, with a Reverify button. | Subscription, $13/mo or $95/yr | [Ask] |
| Manage your connections | Settings lists every linked institution so you can view, fix or add connections. | Subscription, $13/mo or $95/yr | [Ask] |
| Reverify credentials | You re-enter bank credentials for a connection from the account menu. | Subscription, $13/mo or $95/yr | [Ask] |
| Additional credential sets | You can add a second connection to the same institution for a different login. | Subscription, $13/mo or $95/yr | [Ask] |
| Credit Utilization | Each card shows a utilization dot: green to 33%, yellow to orange to 90%, red above. | Subscription, $13/mo or $95/yr | [Read] |
| Card limit entry | You can type a credit limit by hand when the institution does not send it. | Subscription, $13/mo or $95/yr | [Ask] |
| Account detail view | Opening an account shows its balance chart, change, last update time and transactions or holdings. | Subscription, $13/mo or $95/yr | [Read] |
| Rename account | You tap the account name to edit it and save. | Subscription, $13/mo or $95/yr | [Ask] |
| Hide account | Hiding moves an account to Hidden Accounts while it keeps updating and counting in net worth. | Subscription, $13/mo or $95/yr | [Ask] |
| Mark as Closed | Closing disconnects the account from the institution, keeps its history and cannot be reversed. | Subscription, $13/mo or $95/yr | [Ask] |
| Delete account | Deleting permanently removes the account and all its balance history. | Subscription, $13/mo or $95/yr | [Ask] |
| Manual balance edit | You can edit only today's balance on a manual account. | Subscription, $13/mo or $95/yr | [Ask] |
| Automatic cash account | Copilot creates a manual cash account after onboarding in the Other section. | Subscription, $13/mo or $95/yr | [Rule] |
| Manual refresh | Pull down on iOS, or use the refresh icon or Command R on Mac, to request new data. | Subscription, $13/mo or $95/yr | [Ask] |
| Account merge by support | Support can merge duplicate or reissued card accounts so history is kept. | Subscription, $13/mo or $95/yr | [Ask] |
| Account type change by support | Support can switch a Fidelity account from Investment to Depository to show its transactions. | Subscription, $13/mo or $95/yr | [Ask] |

### Real estate and other assets

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Real Estate accounts with Zillow | You paste a Zillow URL and the Zestimate updates monthly with past values imported. | Subscription, $13/mo or $95/yr | [Rule] |
| Real Estate accounts with RentCast | You enter address and home details, then pick a low, mid or high estimate. | Subscription, $13/mo or $95/yr | [Ask] |
| Manual real estate account | You enter a property value yourself and update it as often as you like. | Subscription, $13/mo or $95/yr | [Ask] |
| Purchase details | You record the purchase price and purchase date for each property. | Subscription, $13/mo or $95/yr | [Ask] |
| Mortgage linking | You link an existing or new mortgage account to a property at any time. | Subscription, $13/mo or $95/yr | [Ask] |
| Home Equity | Home equity shows as property value minus mortgage balance and counts in investment allocation. | Subscription, $13/mo or $95/yr | [Read] |
| Cars and other physical assets | There is no auto valuation, so you track cars or jewellery in a manual cash account. | Subscription, $13/mo or $95/yr | [Ask] |

### Transactions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Transactions tab | One list shows all transactions for review, editing, filtering and export. | Subscription, $13/mo or $95/yr | [Read] |
| Search | A search field finds transactions by word, merchant name or tag name. | Subscription, $13/mo or $95/yr | [Read] |
| Transaction filters | You can combine filters such as Account, Category, Date, Recurring, Review Status, Tag and Type. | Subscription, $13/mo or $95/yr | [Read] |
| Sorting on web | On web you can sort results by date or by amount. | Subscription, $13/mo or $95/yr | [Read] |
| Transaction Summary | Searching or filtering shows running totals for spending, income and net on iOS and web. | Subscription, $13/mo or $95/yr | [Read] |
| Multi-Select Transaction Summary | On iOS, selecting specific transactions shows their running total in the summary card. | Subscription, $13/mo or $95/yr | [Read] |
| Copilot Intelligence for Spending | A per-user machine learning model predicts categories after you review 30 transactions. | Subscription, $13/mo or $95/yr | [Rule] |
| Intelligence badge | A badge marks categories that the model applied with high confidence. | Subscription, $13/mo or $95/yr | [Read] |
| Top two guesses | When a prediction is wrong, the model's top two guesses lead the category list. | Subscription, $13/mo or $95/yr | [Read] |
| Mark as reviewed | You dismiss new transactions from the review inbox once they look right. | Subscription, $13/mo or $95/yr | [Ask] |
| Unreviewed indicator | A light blue marker flags unreviewed transactions in every transaction list. | Subscription, $13/mo or $95/yr | [Read] |
| Quick category edit | On Mac, iPad and web you can change a category without opening the transaction. | Subscription, $13/mo or $95/yr | [Ask] |
| Transaction detail edit | You can edit a transaction's name, date, amount, category and type. | Subscription, $13/mo or $95/yr | [Ask] |
| Original transaction info | An info icon shows the original name and details sent by the institution. | Subscription, $13/mo or $95/yr | [Read] |
| Similar Transactions | Mac and iPad show transactions with the same name and their monthly spending total. | Subscription, $13/mo or $95/yr | [Read] |
| Transaction Types | Each transaction is Regular, Income or Internal Transfer, and only Regular ones take categories. | Subscription, $13/mo or $95/yr | [Read] |
| Change transaction type | You can mark a transaction as Regular, Income or Internal Transfer from its menu. | Subscription, $13/mo or $95/yr | [Ask] |
| Type indicators | The list marks Income with I, Internal Transfer with T and Recurring with R. | Subscription, $13/mo or $95/yr | [Read] |
| Internal transfer detection | Transfers between your accounts are captured automatically and kept out of spending. | Subscription, $13/mo or $95/yr | [Rule] |
| Exact Match name rule | A rule recategorises every past and future transaction with the same exact name. | Subscription, $13/mo or $95/yr | [Rule] |
| Partial Match name rule | A rule recategorises transactions whose names contain a chosen part of the name. | Subscription, $13/mo or $95/yr | [Rule] |
| Bank Category rule | A rule recategorises all transactions that carry the same bank-assigned label. | Subscription, $13/mo or $95/yr | [Rule] |
| Type rule | Changing a transaction type can also create an exact or partial name rule. | Subscription, $13/mo or $95/yr | [Rule] |
| Rule preview | Before a rule is created, you see the list of transactions it will change. | Subscription, $13/mo or $95/yr | [Read] |
| Rule replacement | A new rule for the same name overwrites the old rule and recategorises history. | Subscription, $13/mo or $95/yr | [Rule] |
| Tags | You attach one or more tags to any transaction, separate from its category. | Subscription, $13/mo or $95/yr | [Ask] |
| Tag Management | Settings lists all tags alphabetically so you can create and edit them. | Subscription, $13/mo or $95/yr | [Ask] |
| Tag filter totals | Filtering by one or more tags shows monthly totals for those transactions. | Subscription, $13/mo or $95/yr | [Read] |
| Notes | Transactions carry a notes field that is included in data exports. | Subscription, $13/mo or $95/yr | [Ask] |
| Bulk Editing | Multi-select mode changes category, review status, transaction type or tags on many transactions at once. | Subscription, $13/mo or $95/yr | [Ask] |
| Select All and Unselect All | The Bulk Edit bar menu selects or clears every transaction in the list. | Subscription, $13/mo or $95/yr | [Ask] |
| Keyboard shortcuts | Mac, iPad keyboards and web use arrows, X, R, C and F to select, review, categorise and filter. | Subscription, $13/mo or $95/yr | [Ask] |
| Manual transactions | You add a Regular, Income or Transfer transaction by hand to any account. | Subscription, $13/mo or $95/yr | [Ask] |
| Manual Internal Transfer | You record the incoming side of a payment on a manual card or loan account. | Subscription, $13/mo or $95/yr | [Ask] |
| Split equally on web | The web split flow divides a transaction evenly into 2, 3, 4 or 5 parts. | Subscription, $13/mo or $95/yr | [Ask] |
| Custom split on web | You set each split by dollar amount or percentage, and totals must match to save. | Subscription, $13/mo or $95/yr | [Ask] |
| Spread across months on web | A shortcut spreads one transaction across 3, 6 or 12 months. | Subscription, $13/mo or $95/yr | [Ask] |
| Split on iPhone, Mac and iPad | The classic split divides a total across categories and lets you date each part. | Subscription, $13/mo or $95/yr | [Ask] |
| Restore split | Removing the child transactions in Edit split restores the original transaction. | Subscription, $13/mo or $95/yr | [Ask] |
| Transaction dot colors | Blue means needs review, gray means a tip is included, red means splits do not add up. | Subscription, $13/mo or $95/yr | [Read] |
| Exclude | Choosing Exclude as the category keeps a transaction out of all spending totals. | Subscription, $13/mo or $95/yr | [Ask] |
| Excluded filter | You can filter the Transactions tab to show only excluded transactions. | Subscription, $13/mo or $95/yr | [Read] |
| Refund handling | A refund in the same category and month as the purchase lowers that category's spending. | Subscription, $13/mo or $95/yr | [Ask] |
| Mark as recurring from a transaction | A Recurring button on a transaction links it to a new or existing recurring. | Subscription, $13/mo or $95/yr | [Ask] |
| Add to goal from a transaction | A Goal option on a transaction links it to a new or existing savings goal. | Subscription, $13/mo or $95/yr | [Ask] |
| Foreign currency amounts | Only USD is supported, so you edit foreign amounts to a converted USD value yourself. | Subscription, $13/mo or $95/yr | [Ask] |

### Categories and budgets

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Categories tab | A chart compares this month's spending with your total budget, with categories listed by spend. | Subscription, $13/mo or $95/yr | [Read] |
| Category bar colors | Bars are green when on pace, yellow to orange when trending over, and red when over. | Subscription, $13/mo or $95/yr | [Read] |
| Outlined bars | Unfilled bar sections show expected spending from recurrings that have not been paid. | Subscription, $13/mo or $95/yr | [Read] |
| Category detail view | Tapping a category opens its chart, budget line, transactions and key metrics. | Subscription, $13/mo or $95/yr | [Read] |
| Key Metrics | Each category shows total spent per year and average monthly spend over complete months. | Subscription, $13/mo or $95/yr | [Read] |
| Yearly and Monthly Metrics | Tapping the main chart shows yearly totals and monthly averages, including past periods. | Subscription, $13/mo or $95/yr | [Read] |
| Default categories | Onboarding supplies a default category set that includes an Other category. | Subscription, $13/mo or $95/yr | [Read] |
| New category | You add a premade category or create your own with a name, color and emoji. | Subscription, $13/mo or $95/yr | [Ask] |
| Genmojis | You generate a custom Genmoji for a category or recurring on iPhone 15 Pro or later. | Subscription, $13/mo or $95/yr | [Ask] |
| Rename category | You tap a category's name to rename it. | Subscription, $13/mo or $95/yr | [Ask] |
| Delete category | Deleting a category moves its transactions to Other. | Subscription, $13/mo or $95/yr | [Ask] |
| Other category | A catch-all category holds uncategorised transactions and can be renamed but not deleted. | Subscription, $13/mo or $95/yr | [Read] |
| Excluded category | A category type toggle keeps a whole category out of spending totals. | Subscription, $13/mo or $95/yr | [Ask] |
| Groups of Categories | You place categories in a named group that shows a combined group budget. | Subscription, $13/mo or $95/yr | [Ask] |
| Unassigned Budget | A group can hold extra budget that any of its categories can use. | Subscription, $13/mo or $95/yr | [Ask] |
| Ungroup these categories | You can remove one category from a group or dissolve the whole group. | Subscription, $13/mo or $95/yr | [Ask] |
| Same budget for all months | One budget amount applies to every past and future month for a category. | Subscription, $13/mo or $95/yr | [Ask] |
| Different budgets for different months | You set a separate budget for any single past or future month. | Subscription, $13/mo or $95/yr | [Ask] |
| Future budget chart | The category chart shows 12 future months and includes expected recurrings. | Subscription, $13/mo or $95/yr | [Read] |
| Budget propagation | Changing one month updates later months unless a later month already has its own budget. | Subscription, $13/mo or $95/yr | [Rule] |
| Rollovers | Unspent or overspent amounts in a category carry into the next month and accumulate. | Subscription, $13/mo or $95/yr | [Rule] |
| First month with a Rollover | You choose the month from which rollovers start to apply. | Subscription, $13/mo or $95/yr | [Ask] |
| Disabled categories | You can switch rollovers off for chosen categories while others keep rolling. | Subscription, $13/mo or $95/yr | [Ask] |
| Rebalance Budgets | Copilot proposes new category budgets from actual spending within your existing total. | Subscription, $13/mo or $95/yr | [Ask] |
| Rebalance scope | A toggle applies a rebalance to only this month or from now on. | Subscription, $13/mo or $95/yr | [Ask] |
| Optional Budgeting | You can turn budgeting off, and charts then compare spending with last month. | Subscription, $13/mo or $95/yr | [Ask] |
| Expected this month | Mac, iPad and web show an expanded list of upcoming recurrings on the Categories tab. | Subscription, $13/mo or $95/yr | [Read] |
| Condensed category view on web | Web shows spent, budget and remaining amounts per category for the current month. | Subscription, $13/mo or $95/yr | [Read] |
| Matching chart colors on Mac | Since September 2026 the Mac Categories tab uses matching colors across bars and charts. | Subscription, $13/mo or $95/yr | [Read] |

### Recurrings and subscriptions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Recurrings tab | The tab lists this month's paid and unpaid recurrings, less frequent future ones and archived ones. | Subscription, $13/mo or $95/yr | [Read] |
| List and grid view | On iPhone you switch each section between a list and a grid of blocks. | Subscription, $13/mo or $95/yr | [Read] |
| Create from Recurrings tab | You search for a past transaction and Copilot estimates the frequency to confirm. | Subscription, $13/mo or $95/yr | [Ask] |
| Create from a transaction | You tap Recurring on a transaction and choose Start a new one. | Subscription, $13/mo or $95/yr | [Ask] |
| Frequency | A recurring can be weekly, bi-weekly, monthly, yearly or another non-monthly schedule. | Subscription, $13/mo or $95/yr | [Ask] |
| Name filter | A recurring matches transactions whose names contain the text you set. | Subscription, $13/mo or $95/yr | [Rule] |
| Amount range filter | A recurring matches only transactions within a dollar range, such as $9 to $10. | Subscription, $13/mo or $95/yr | [Rule] |
| Date filter | A recurring expects payment around one day, a range of days or any day. | Subscription, $13/mo or $95/yr | [Rule] |
| Automatic matching | New transactions that pass a recurring's filters link to it automatically. | Subscription, $13/mo or $95/yr | [Rule] |
| Recurring Filter Changes prompt | After a filter edit you choose to apply it to future payments only or past ones too. | Subscription, $13/mo or $95/yr | [Ask] |
| Edit Transactions | You add or remove individual transactions from a recurring. | Subscription, $13/mo or $95/yr | [Ask] |
| Recurring name display | Linked transactions show the recurring's name in place of the bank name. | Subscription, $13/mo or $95/yr | [Read] |
| Next expected payment | Each recurring shows when the next payment is expected. | Subscription, $13/mo or $95/yr | [Read] |
| Expected spend | Recurrings count toward the month's spending from the first day, before they post. | Subscription, $13/mo or $95/yr | [Rule] |
| Pause | Pausing removes an unpaid recurring from expected spend until the next payment arrives. | Subscription, $13/mo or $95/yr | [Ask] |
| Archive | Archiving removes a recurring from expected spend for good but keeps its history. | Subscription, $13/mo or $95/yr | [Ask] |
| Activate | You return a paused or archived recurring to active status. | Subscription, $13/mo or $95/yr | [Ask] |
| Delete recurring | Deleting erases the recurring's history but leaves its transactions untouched. | Subscription, $13/mo or $95/yr | [Ask] |
| Recurring emoji, name and category | You can edit the emoji, name and category of any recurring. | Subscription, $13/mo or $95/yr | [Ask] |
| YTD totals | Mac, iPad and web show year-to-date totals for recurring charges. | Subscription, $13/mo or $95/yr | [Read] |
| Key Metric and Last Account Used | Mac and iPad show a key metric and the last paying account for each recurring. | Subscription, $13/mo or $95/yr | [Read] |
| Shared Recurring Expenses | A full payment recurring and a negative reimbursement recurring in one category show your real share. | Subscription, $13/mo or $95/yr | [Ask] |
| Multiple Recurrings for the Same Merchant | You create separate recurrings for one merchant and tell them apart by amount or date. | Subscription, $13/mo or $95/yr | [Ask] |

### Dashboard

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Dashboard graph | A month-to-date chart plots actual spending against an ideal pace line, excluding recurrings. | Subscription, $13/mo or $95/yr | [Read] |
| Free to Spend | A headline number shows how much you can still spend within this month's budget. | Subscription, $13/mo or $95/yr | [Read] |
| Dashboard line colors | The line is green under pace, light or dark orange over pace, and red over budget. | Subscription, $13/mo or $95/yr | [Read] |
| To Review | A card lists imported transactions you have not yet marked as reviewed. | Subscription, $13/mo or $95/yr | [Read] |
| To Review limit on Mac | The Mac card shows up to 25 transactions at a time (dated changelog entry). | Subscription, $13/mo or $95/yr | [Read] |
| Budgets card | A card shows trending categories ranked by share of budget used, with amounts left. | Subscription, $13/mo or $95/yr | [Read] |
| Upcoming | A scrolling row shows expected upcoming recurring payments. | Subscription, $13/mo or $95/yr | [Read] |
| Net This Month | A card compares income and spending month to date against the previous month to date. | Subscription, $13/mo or $95/yr | [Read] |
| Free Months card | A card shows your referral code and progress toward earning free months. | Subscription, $13/mo or $95/yr | [Read] |
| App sections | On iPhone you reorder the tabs around the Dashboard in Appearance settings. | Subscription, $13/mo or $95/yr | [Ask] |
| Global search | Mac and iPad search across transactions, accounts, categories, recurrings and holdings. | Subscription, $13/mo or $95/yr | [Read] |

### Cash flow

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Cash Flow tab | The tab summarises income, spending and net income over a chosen period. | Subscription, $13/mo or $95/yr | [Read] |
| Net Income card | A bar chart shows income minus spending for each period. | Subscription, $13/mo or $95/yr | [Read] |
| Spending card | A stacked bar chart shows spending with one segment per category. | Subscription, $13/mo or $95/yr | [Read] |
| Income card | A chart shows all income transactions for the period. | Subscription, $13/mo or $95/yr | [Read] |
| Date ranges | You choose year to date, month to date, last 12 months, last 3 months or last 4 weeks. | Subscription, $13/mo or $95/yr | [Read] |
| Comparisons | A dotted line compares the range with the preceding range of the same length. | Subscription, $13/mo or $95/yr | [Read] |
| Hide comparison data | A setting removes the comparison line from the charts. | Subscription, $13/mo or $95/yr | [Ask] |
| Show excluded spend | A toggle adds excluded transactions to total spending here and in Net This Month. | Subscription, $13/mo or $95/yr | [Ask] |
| View More | Each card opens key metrics and a category or transaction breakdown. | Subscription, $13/mo or $95/yr | [Read] |
| Excluded Transactions section | The spending breakdown for a month lists excluded categories and transactions. | Subscription, $13/mo or $95/yr | [Read] |

### Investments

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Investments tab | All investment accounts and holdings appear in one place. | Subscription, $13/mo or $95/yr | [Read] |
| Returns and Balances toggle | The main chart switches between estimated returns and account balances. | Subscription, $13/mo or $95/yr | [Read] |
| Live Balance Estimates | Near real-time market prices estimate today's balance, shown as a dashed line and never stored. | Subscription, $13/mo or $95/yr | [Read] |
| Per-account live estimate toggle | You can turn the live estimate on or off for each investment account. | Subscription, $13/mo or $95/yr | [Ask] |
| Benchmark | You compare performance with one of ten benchmarks, including S&P 500 ETF, QQQ, Bitcoin and Ethereum. | Subscription, $13/mo or $95/yr | [Read] |
| Account selection | Turning an account off removes it from the chart, allocation and holdings sections. | Subscription, $13/mo or $95/yr | [Ask] |
| Performance | Estimated return excludes deposits and withdrawals, similar to a time-weighted return. | Subscription, $13/mo or $95/yr | [Read] |
| Your Top Movers | A list shows the securities moving most, ranked by price change or your equity change. | Subscription, $13/mo or $95/yr | [Read] |
| Accounts list | Each account shows return, balance change or balance for the chosen timeframe. | Subscription, $13/mo or $95/yr | [Read] |
| Allocation | Holdings are broken down by type, such as Cash, Equity, ETF, Fixed Income and Mutual Fund. | Subscription, $13/mo or $95/yr | [Read] |
| Per-account allocation | Mac and iPad show allocation for each individual investment account. | Subscription, $13/mo or $95/yr | [Read] |
| Holdings | A list shows every security with last price, your equity, quantity and equity allocation. | Subscription, $13/mo or $95/yr | [Read] |
| Last Price | Security prices are delayed about 15 minutes in trading hours, and crypto updates all day. | Subscription, $13/mo or $95/yr | [Read] |
| Security display options | You show last price, equity or quantity, with change by percentage or amount. | Subscription, $13/mo or $95/yr | [Ask] |
| Average cost and total return | A security shows average cost and total return when the institution provides them. | Subscription, $13/mo or $95/yr | [Read] |
| Consolidated positions | The same security held in several accounts is shown as one position. | Subscription, $13/mo or $95/yr | [Read] |
| Daily holdings update | Most investment accounts update once a day, the morning after market close. | Subscription, $13/mo or $95/yr | [Rule] |
| Intra-day refresh | Plaid-connected brokerages can refresh during market hours, except Vanguard and TIAA. | Subscription, $13/mo or $95/yr | [Ask] |
| Track holdings manually | You enter securities or crypto with quantities, including fractional shares, for auto-priced tracking. | Subscription, $13/mo or $95/yr | [Ask] |
| LOG A MOVEMENT | You record a buy, sell, transfer in or transfer out on a manual holdings account. | Subscription, $13/mo or $95/yr | [Ask] |
| TRACK HOLDINGS migration | You convert a manual balance account into a manual holdings account. | Subscription, $13/mo or $95/yr | [Ask] |
| Position close-out | Since September 2026, selling a full position closes it out completely. | Subscription, $13/mo or $95/yr | [Rule] |

### Goals and savings

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Goals tab | A chart compares the amount saved this month with what your goals need. | Subscription, $13/mo or $95/yr | [Read] |
| This month and All time | A chart setting switches between this month's saving and totals across all goals. | Subscription, $13/mo or $95/yr | [Ask] |
| Add a goal | You pick a recommended goal or create a custom one with a name and emoji. | Subscription, $13/mo or $95/yr | [Ask] |
| Target amount | Each goal has a target amount to save. | Subscription, $13/mo or $95/yr | [Ask] |
| Use existing savings | You allocate part of an account balance to a goal by slider or typed amount. | Subscription, $13/mo or $95/yr | [Ask] |
| Always use the entire balance | A toggle ties a goal to an account's full balance so changes update it automatically. | Subscription, $13/mo or $95/yr | [Rule] |
| Target date tracking | A goal with a target month shows the amount you must save each month. | Subscription, $13/mo or $95/yr | [Read] |
| Monthly contribution tracking | A goal with a monthly amount shows how long it will take to reach the target. | Subscription, $13/mo or $95/yr | [Read] |
| Progress bar colors | Green means the goal is on track, and yellow means it is slightly behind. | Subscription, $13/mo or $95/yr | [Read] |
| Edit allocations | You change how much of each depository account is assigned to a goal. | Subscription, $13/mo or $95/yr | [Ask] |
| Add transactions to a goal | You link transactions to a goal to raise or lower the amount saved. | Subscription, $13/mo or $95/yr | [Ask] |
| Internal transfer side | For a transfer you choose the incoming side to add savings or outgoing to reduce. | Subscription, $13/mo or $95/yr | [Ask] |
| Ready to Spend | A goal that reaches its target moves to a Ready to Spend section automatically. | Subscription, $13/mo or $95/yr | [Rule] |
| Reactivate when funds dip | A setting returns a completed goal to Active when its balance falls below target. | Subscription, $13/mo or $95/yr | [Rule] |
| Update Budgets on Spend | When on, goal-funded purchases are excluded from category spend and shown as a blue bar. | Subscription, $13/mo or $95/yr | [Rule] |
| Complete a goal early | Completing early sets the target to the amount already saved. | Subscription, $13/mo or $95/yr | [Ask] |
| Archive goal | Archiving freezes a goal's history, frees its balances and cannot be undone. | Subscription, $13/mo or $95/yr | [Ask] |
| Delete goal | Deleting removes the goal and unlinks its balances and transactions. | Subscription, $13/mo or $95/yr | [Ask] |
| Allocated balance display | Account balances show goal-allocated portions greyed out with the goal named. | Subscription, $13/mo or $95/yr | [Read] |

### AI assistant and natural language

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Money Assistant (beta) | A proactive assistant watches your finances and surfaces items before you ask. | Not stated (beta, waitlist) | [Read] |
| Daily briefings | The assistant reports unusual charges, budgets running hot and notable spending patterns. | Not stated (beta, waitlist) | [Read] |
| Conversational interface | You ask follow-up questions in chat, and the assistant answers from your own data. | Not stated (beta, waitlist) | [Read] |
| Charts in conversations | The assistant can show charts inside a conversation. | Not stated (beta, waitlist) | [Read] |
| Context-aware launcher | Starting a chat includes context about the screen you are viewing. | Not stated (beta, waitlist) | [Read] |
| Proactive suggestions | Suggestions such as category or budget changes can be dismissed, approved or explored. | Not stated (beta, waitlist) | [Ask] |
| Recategorization suggestions | The assistant proposes category fixes to keep transaction data clean. | Not stated (beta, waitlist) | [Ask] |
| Refund matching | The assistant proposes matching refunds to their original purchases. | Not stated (beta, waitlist) | [Ask] |
| Tagging suggestions | The assistant proposes tags for transactions. | Not stated (beta, waitlist) | [Ask] |
| Category gap analysis | The assistant suggests new categories that you can adopt in one tap. | Not stated (beta, waitlist) | [Ask] |
| Idle cash guidance | The assistant suggests how to put idle cash to work across connected accounts. | Not stated (beta, waitlist) | [Read] [Flag] |
| Assistant edits with approval | It can create, update and delete categories, budgets, transactions, recurrings and rules after your approval. | Not stated (beta, waitlist) | [Ask] |
| Name rules by assistant | You can ask the assistant to view, create and delete transaction name rules. | Not stated (beta, waitlist) | [Ask] |
| Contextual nudges | Short prompts from the assistant appear throughout the app. | Not stated (beta, waitlist) | [Read] |
| Preferred tone | The assistant explains each suggestion in plain language and in your preferred tone. | Not stated (beta, waitlist) | [Ask] |
| Assistant settings | Settings let you fine-tune which assistant features are on. | Not stated (beta, waitlist) | [Ask] |
| MCP (beta) | A read-only connector lets outside AI tools query your Copilot data. | Not stated (beta, waitlist) | [Read] |
| MCP data scope | The connector exposes accounts, categories, transactions, monthly spend and income, recurrings and tags. | Not stated (beta, waitlist) | [Read] |
| MCP tested clients | Copilot says it tested the connector with Claude, ChatGPT and Codex CLI. | Not stated (beta, waitlist) | [Read] |

### Reports, charts and data export

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Month in Review | A slide report covering spending, income and investments appears around each month end. | Subscription, $13/mo or $95/yr | [Read] |
| Year in Review | A yearly slide report appears around the end of each year. | Subscription, $13/mo or $95/yr | [Read] |
| Share a slide | You can share any review slide with a contact or on social media. | Subscription, $13/mo or $95/yr | [Ask] |
| Past reviews | Since October 2026 you can open past reviews from the Transactions filters. | Subscription, $13/mo or $95/yr | [Read] |
| Year in Review app icon | Users with over one year of membership unlock a special app icon in the review. | Subscription, $13/mo or $95/yr | [Ask] |
| Export your transactions | On iOS, Settings exports all transactions to a CSV file you can save or share. | Subscription, $13/mo or $95/yr | [Ask] |
| Filtered export | Mac, iPad and web export only the filtered or searched transactions. | Subscription, $13/mo or $95/yr | [Ask] |
| Export fields | The CSV holds date, name, amount, status, category, parent category, excluded flag, type, account, mask, notes and recurring. | Subscription, $13/mo or $95/yr | [Read] |

### Notifications

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Notifications toggle | A master setting turns alerts on, and you then choose each alert type. | Subscription, $13/mo or $95/yr | [Ask] |
| Low balance alert | You are alerted when a checking or savings balance falls below $100. | Subscription, $13/mo or $95/yr | [Read] |
| Credit Utilization alert | You are alerted when a card's utilization passes 30%, 60% or 90%. | Subscription, $13/mo or $95/yr | [Read] |
| Big Expense Alert | You are alerted to a non-recurring purchase over $500. | Subscription, $13/mo or $95/yr | [Read] |
| Spending update | A Monday summary compares last week's spending with the week before. | Subscription, $13/mo or $95/yr | [Read] |
| Budgets updates | You are alerted when you exceed a category's budget. | Subscription, $13/mo or $95/yr | [Read] |
| Income update | You are alerted to income transactions of $10 or more. | Subscription, $13/mo or $95/yr | [Read] |
| Recurring paid alert | You are alerted when one of your recurring payments is paid. | Subscription, $13/mo or $95/yr | [Read] |
| Bank Fee Alert | You are alerted when a transaction is categorised as a bank fee. | Subscription, $13/mo or $95/yr | [Read] |
| Uncategorized transfer alert | You are alerted when an Other transaction looks like a transfer according to Plaid. | Subscription, $13/mo or $95/yr | [Read] |
| Venmo transaction alert | You are alerted when a new Venmo transaction is detected. | Subscription, $13/mo or $95/yr | [Read] |

### Widgets and Apple integrations

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Daily Spending widget | Shows how your spending compares with your budget. | Subscription, $13/mo or $95/yr | [Read] |
| Spending Category widget | Shows spending and budget for one category. | Subscription, $13/mo or $95/yr | [Read] |
| Budgets widget | Shows four budgets at a time. | Subscription, $13/mo or $95/yr | [Read] |
| Net Worth widget | Tracks net worth across all accounts. | Subscription, $13/mo or $95/yr | [Read] |
| Credit Card widget | Tracks a card's balance and utilization rate. | Subscription, $13/mo or $95/yr | [Read] |
| Account widget | Tracks one account's balance and net change. | Subscription, $13/mo or $95/yr | [Read] |
| Recent Transactions widget | Shows your most recent transactions. | Subscription, $13/mo or $95/yr | [Read] |
| Transactions To Review widget | Lets you mark transactions as reviewed with a tap from the home screen. | Subscription, $13/mo or $95/yr | [Ask] |
| Mac widgets | Widgets are also available on Mac (dated changelog entry). | Subscription, $13/mo or $95/yr | [Read] |
| App icon | On iPhone and iPad you can switch the app icon to another design. | Subscription, $13/mo or $95/yr | [Ask] |
| Dark mode | Dark mode can be on, off or follow the system setting. | Subscription, $13/mo or $95/yr | [Ask] |
| Liquid Glass design | The apps added support for Apple's Liquid Glass design in December 2025. | Subscription, $13/mo or $95/yr | [Read] |
| Apple Vision compatibility | The App Store lists the app as compatible with visionOS 1.0 or later. | Subscription, $13/mo or $95/yr | [Read] |
| Apple Watch and Siri shortcuts (reported) | The Penny Hoarder reports these, but no Copilot page I opened confirms them. | Not stated | [Read] |

### Platforms and accessibility

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| iPhone app | The native iPhone app needs iOS 17.0 or later according to the App Store. | Subscription, $13/mo or $95/yr | [Read] |
| iPad app | The native iPad app supports Split View, Slide Over and keyboard shortcuts. | Subscription, $13/mo or $95/yr | [Read] |
| Mac app | The native Mac app has Command key shortcuts for search, refresh, settings and each tab. | Subscription, $13/mo or $95/yr | [Read] |
| Web app | A browser app at app.copilot.money launched in December 2025 and is tuned for desktop. | Subscription, $13/mo or $95/yr | [Read] |
| Web feature gaps | Web lacks Goals, Cash Flow, demo mode, name rule creation, rebalancing, reviews and Labs setup. | Subscription, $13/mo or $95/yr | [Read] |
| Multi-device use | One subscription covers all platforms, and devices can be used at the same time. | Subscription, $13/mo or $95/yr | [Read] |
| Accessible colors | A setting adjusts chart colors for red-green color vision deficiencies. | Subscription, $13/mo or $95/yr | [Ask] |
| Display transactions with + and - | A setting shows outgoing amounts with a minus sign and incoming with a plus. | Subscription, $13/mo or $95/yr | [Ask] |
| Any-language text entry | The Mac app accepts UTF-8 text, so names can use any language or emoji. | Subscription, $13/mo or $95/yr | [Read] |

### Sharing with a partner

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Magic Link sharing | You forward your sign-in email so a partner or adviser can log in to your account. | Subscription, $13/mo or $95/yr | [Ask] |
| Password for shared login | Sign in with Apple users set a password in Settings to log in on a partner's device. | Subscription, $13/mo or $95/yr | [Ask] |
| Joint account clean-up | When both partners link a joint account, you delete one duplicate copy. | Subscription, $13/mo or $95/yr | [Ask] |

### Security and privacy

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Continue with Email | A one-time magic link sent by email signs you in without a password. | Subscription, $13/mo or $95/yr | [Ask] |
| Sign in with Apple | You can sign in with your Apple ID, including Apple's hide-my-email option. | Subscription, $13/mo or $95/yr | [Ask] |
| Two-factor Authentication | 2FA works through authenticator apps such as Authy, Google Authenticator or Cisco Duo. | Subscription, $13/mo or $95/yr | [Ask] |
| Global Sign-out | Version 7.2.1 in March 2026 added sign-out across devices. | Subscription, $13/mo or $95/yr | [Ask] |
| Require Face ID | A setting requires Face ID to open the app. | Subscription, $13/mo or $95/yr | [Ask] |
| Mac security prompt | The Mac app can require the Mac password or Touch ID to open. | Subscription, $13/mo or $95/yr | [Ask] |
| Encryption | Copilot states data is encrypted at rest with 256-bit encryption and in transit with TLS. | Subscription, $13/mo or $95/yr | [Read] |
| No stored bank credentials | Copilot states it never sees or stores bank or OAuth login credentials. | Subscription, $13/mo or $95/yr | [Read] |
| Enter demo mode | A setting opens a sample version so you can show the app without real data. | Subscription, $13/mo or $95/yr | [Read] |
| Clear the local cache | An advanced setting clears stored app data and reloads it from your account. | Subscription, $13/mo or $95/yr | [Ask] |
| Delete your Copilot account | Deleting disconnects banks and removes data from all systems within 60 days. | Subscription, $13/mo or $95/yr | [Ask] |
| Log out of Copilot | A setting logs you out of your account. | Subscription, $13/mo or $95/yr | [Ask] |

### Subscription, referrals and support

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Monthly plan | The monthly subscription costs $13 per month. | $13/mo | [Ask] |
| Yearly plan | The yearly subscription costs $95 per year, which equals $7.92 per month. | $95/yr | [Ask] |
| 1-month free trial | New users get one free month, which renews into a paid plan automatically. | Free for 1 month | [Ask] |
| Enter Referral | A referral code entered at the trial step gives a new user an extended free trial. | Free, length not stated | [Ask] |
| Gift code | A gift code entered at the trial step starts a gifted period of use. | Free, length not stated | [Ask] |
| Gift months of services | You can buy a gift code for someone else in the App Store version. | Not stated | [Ask] |
| Share Copilot and get free months | Sharing your referral link earns free months once enough people join. | Free, number not stated | [Ask] |
| Manage your subscription | You change plan, payment method or cancel through the App Store or Stripe. | Subscription, $13/mo or $95/yr | [Ask] |
| Restore subscription | A setting attaches a previously paid subscription to the current account. | Subscription, $13/mo or $95/yr | [Ask] |
| Refund for direct purchases | Direct purchases are refunded if cancelled within one month and requested within five days. | Subscription, $13/mo or $95/yr | [Ask] |
| Legacy pricing | Unbroken subscriptions that began before price changes can keep their older price. | Not stated | [Read] |
| In-app chat | You message Copilot's human support team from inside the app. | Subscription, $13/mo or $95/yr | [Ask] |
| Email support | You can email support@copilot.money for help. | Subscription, $13/mo or $95/yr | [Ask] |
| Help Center | A public help site holds articles for each tab and feature. | Free | [Read] |
| YouTube tutorials | Copilot publishes video tutorials on its YouTube channel. | Free | [Read] |
| Copilot for Employees | A website form lets employers ask about offering Copilot to their staff. | Not stated | [Ask] |
| Country Leaderboard | Non-US visitors can vote for their country and subscribe for launch updates. | Free | [Ask] |

### Business model and partners

- Copilot earns money only from subscriptions, at $13 per month or $95 per year.
- It states it shows no ads in the app and does not sell users' financial data.
- Subscriptions are billed through the Apple App Store, or through Stripe for web and direct Mac downloads.
- Bank data comes from Plaid first, with Mastercard (formerly Finicity), MX and Akoya as extra aggregators.
- Direct integrations cover Apple (FinanceKit), Capital One, Coinbase and Public, plus Venmo and Amazon under Copilot Labs.
- Property values come from Zillow or RentCast, and the service is hosted on Google Cloud.

### What users say is missing or broken

- There is no Android app, and Copilot staff reply 'No news on Android yet' on its feedback board.
- Shared budgets for couples are missing, with about 7.1k votes on feedback.copilot.money. Sharing means giving full account access.
- Non-monthly budgets (8.1k votes), credit card due dates (6.3k), credit score (6.0k) and income categories (5.4k) are top requests there.
- App Store reviews cite sync faults, such as American Express transactions on wrong dates (November 2025) and missing filtered export on iPhone (June 2026).
- The Penny Hoarder (May 2026) lists no free tier, no zero-based budgeting tools and a more limited web app.

### Sources

- [Copilot Money home page](https://copilot.money/)
- [Copilot Money pricing](https://copilot.money/pricing)
- [Copilot Money FAQ](https://www.copilot.money/faq)
- [Copilot Money Dispatch (What's new)](https://www.copilot.money/dispatch)
- [Beta: Introducing Your Money Assistant](https://www.copilot.money/dispatch/beta-introducing-your-money-assistant)
- [Copilot changelog (older entries)](https://changelog.copilot.money/)
- [Privacy and Security](https://www.copilot.money/privacy-and-security)
- [Privacy Policy](https://copilot.money/privacy-policy/)
- [Terms of Service](https://www.copilot.money/terms-of-service)
- [Download](https://www.copilot.money/download)
- [App Store listing: Copilot: Track & Budget Money](https://apps.apple.com/us/app/copilot-track-budget-money/id1447330651)
- [Help Center home](https://help.copilot.money/)
- [Adding and Managing Connected Accounts](https://help.copilot.money/en/articles/5593601-adding-and-managing-connected-accounts)
- [How Do You Get My Financial Data?](https://help.copilot.money/en/articles/10768078-how-do-you-get-my-financial-data)
- [Accounts Tab Overview](https://help.copilot.money/en/articles/6213732-accounts-tab-overview)
- [Accounts FAQ](https://help.copilot.money/en/articles/10261860-accounts-faq)
- [Creating Manual Accounts](https://help.copilot.money/en/articles/4537532-creating-manual-accounts)
- [Understanding Manual Accounts](https://help.copilot.money/en/articles/10682991-understanding-manual-accounts)
- [Credit Utilization](https://help.copilot.money/en/articles/10310069-credit-utilization)
- [Hiding and Closing Accounts](https://help.copilot.money/en/articles/5031610-hiding-and-closing-accounts)
- [Real Estate Accounts](https://help.copilot.money/en/articles/8047816-real-estate-accounts)
- [Tracking Your Car and Other Physical Assets](https://help.copilot.money/en/articles/10760871-tracking-your-car-and-other-physical-assets)
- [Apple Card, Apple Cash, and Savings](https://help.copilot.money/en/articles/9038131-apple-card-apple-cash-and-savings)
- [Capital One](https://help.copilot.money/en/articles/9829056-capital-one)
- [Coinbase](https://help.copilot.money/en/articles/14303356-coinbase)
- [Fidelity](https://help.copilot.money/en/articles/9828928-fidelity)
- [Discover to Capital One Migration](https://help.copilot.money/en/articles/15507186-discover-to-capital-one-migration)
- [Crypto Support with Copilot](https://help.copilot.money/en/articles/6162313-crypto-support-with-copilot)
- [Adding Cryptocurrency Addresses](https://help.copilot.money/en/articles/5961560-adding-cryptocurrency-addresses)
- [Handling Joint Bank Accounts](https://help.copilot.money/en/articles/9834242-handling-joint-bank-accounts)
- [Troubleshooting Account Duplicates](https://help.copilot.money/en/articles/8663179-troubleshooting-account-duplicates)
- [Improving Connections Performance](https://help.copilot.money/en/articles/9899887-improving-connections-performance)
- [Transactions Tab Overview](https://help.copilot.money/en/articles/9554412-transactions-tab-overview)
- [Transactions FAQ](https://help.copilot.money/en/articles/10761907-transactions-faq)
- [Bank Category Rules](https://help.copilot.money/en/articles/13978302-bank-category-rules)
- [Bulk Editing Transactions](https://help.copilot.money/en/articles/7668990-bulk-editing-transactions)
- [Creating Manual Internal Transfer Payments](https://help.copilot.money/en/articles/4235839-creating-manual-internal-transfer-payments)
- [Creating Manual Transactions](https://help.copilot.money/en/articles/4038706-creating-manual-transactions)
- [Creating Name Rules](https://help.copilot.money/en/articles/3971270-creating-name-rules)
- [Credit Card Payment Transactions](https://help.copilot.money/en/articles/10671434-credit-card-payment-transactions)
- [Excluding Transactions](https://help.copilot.money/en/articles/9718801-excluding-transactions)
- [Exporting Your Transaction Data](https://help.copilot.money/en/articles/5944414-exporting-your-transaction-data)
- [Refund and Reimbursement Transactions](https://help.copilot.money/en/articles/5325170-refund-and-reimbursement-transactions)
- [Splitting Transactions](https://help.copilot.money/en/articles/5325255-splitting-transactions)
- [Transaction Types](https://help.copilot.money/en/articles/3971267-transaction-types)
- [Copilot Intelligence for Spending](https://help.copilot.money/en/articles/8182433-copilot-intelligence-for-spending)
- [Historical Transaction Data](https://help.copilot.money/en/articles/5542003-historical-transaction-data)
- [International Currency](https://help.copilot.money/en/articles/10715424-international-currency)
- [Month and Year in Review](https://help.copilot.money/en/articles/10310024-month-and-year-in-review)
- [Recurring Transaction Name](https://help.copilot.money/en/articles/10671662-recurring-transaction-name)
- [Transaction Dot Color Guide](https://help.copilot.money/en/articles/9834380-transaction-dot-color-guide)
- [Tags](https://help.copilot.money/en/articles/9554342-tags)
- [Categories Tab Overview](https://help.copilot.money/en/articles/9504513-categories-tab-overview)
- [Categories FAQ](https://help.copilot.money/en/articles/10216528-categories-faq)
- [Budget Rollovers](https://help.copilot.money/en/articles/3790828-budget-rollovers)
- [Editing Budgets by Month](https://help.copilot.money/en/articles/6206293-editing-budgets-by-month)
- [Genmojis in Copilot](https://help.copilot.money/en/articles/10269668-genmojis-in-copilot)
- [Groups of Categories](https://help.copilot.money/en/articles/3767655-groups-of-categories)
- [Optional Budgeting](https://help.copilot.money/en/articles/6282850-optional-budgeting)
- [Rebalancing Your Budget](https://help.copilot.money/en/articles/6206302-rebalancing-your-budget)
- [Separating Business and Personal Spending](https://help.copilot.money/en/articles/10760959-separating-business-and-personal-spending)
- [Category Tips & Tricks](https://help.copilot.money/en/articles/10684301-category-tips-tricks)
- [Other Category](https://help.copilot.money/en/articles/9829368-other-category)
- [Understanding Key Metrics for Spending](https://help.copilot.money/en/articles/6918427-understanding-key-metrics-for-spending)
- [Recurrings Tab Overview](https://help.copilot.money/en/articles/9778259-recurrings-tab-overview)
- [Recurrings FAQ](https://help.copilot.money/en/articles/10244751-recurrings-faq)
- [Creating Recurrings](https://help.copilot.money/en/articles/3760068-creating-recurrings)
- [Editing Recurrings](https://help.copilot.money/en/articles/3783837-editing-recurrings)
- [Optimizing Recurrings](https://help.copilot.money/en/articles/3783499-optimizing-recurrings)
- [Pausing and Archiving Recurrings](https://help.copilot.money/en/articles/3983286-pausing-and-archiving-recurrings)
- [Shared Recurring Expenses](https://help.copilot.money/en/articles/5324776-shared-recurring-expenses)
- [Multiple Recurrings for the Same Merchant](https://help.copilot.money/en/articles/5327632-multiple-recurrings-for-the-same-merchant)
- [Cash Flow Tab Overview](https://help.copilot.money/en/articles/9682232-cash-flow-tab-overview)
- [Dashboard Tab Overview](https://help.copilot.money/en/articles/6045480-dashboard-tab-overview)
- [Dashboard FAQ](https://help.copilot.money/en/articles/10238054-dashboard-faq)
- [Dashboard Line Colors](https://help.copilot.money/en/articles/10309907-dashboard-line-colors)
- [Income vs. Budget](https://help.copilot.money/en/articles/5542019-income-vs-budget)
- [Savings Goal Tab Overview](https://help.copilot.money/en/articles/11470324-savings-goal-tab-overview)
- [Savings with Copilot Money](https://help.copilot.money/en/articles/11471870-savings-with-copilot-money)
- [Goals FAQ](https://help.copilot.money/en/articles/11139571-goals-faq)
- [Creating New Goals](https://help.copilot.money/en/articles/11100462-creating-new-goals)
- [Spending from Savings Goals](https://help.copilot.money/en/articles/11100511-spending-from-savings-goals)
- [Updating Goal Progress](https://help.copilot.money/en/articles/11100474-updating-goal-progress)
- [Archiving Goals](https://help.copilot.money/en/articles/11100497-archiving-goals)
- [Investments Tab Overview](https://help.copilot.money/en/articles/5377645-investments-tab-overview)
- [Tracking Holdings with Manual Accounts](https://help.copilot.money/en/articles/6097003-tracking-holdings-with-manual-accounts)
- [Migrating Investments Accounts](https://help.copilot.money/en/articles/6096952-migrating-investments-accounts)
- [Calculating Investment Performance](https://help.copilot.money/en/articles/5497919-calculating-investment-performance)
- [Investment Account Limitations](https://help.copilot.money/en/articles/10262766-investment-account-limitations)
- [Live Balance Estimates](https://help.copilot.money/en/articles/5497913-live-balance-estimates)
- [Copilot Money for iPad](https://help.copilot.money/en/articles/10003978-copilot-money-for-ipad)
- [Copilot Money for macOS](https://help.copilot.money/en/articles/6778561-copilot-money-for-macos)
- [Copilot Money for Web](https://help.copilot.money/en/articles/11780342-copilot-money-for-web)
- [Web FAQ](https://help.copilot.money/en/articles/13157382-web-faq)
- [Mac FAQ](https://help.copilot.money/en/articles/11011483-mac-faq)
- [Notifications](https://help.copilot.money/en/articles/10671399-notifications)
- [Settings Overview](https://help.copilot.money/en/articles/11062072-settings-overview)
- [Sharing Your Account with a Partner](https://help.copilot.money/en/articles/4523792-sharing-your-account-with-a-partner)
- [Privacy and Security (help article)](https://help.copilot.money/en/articles/9981768-privacy-and-security)
- [Using 2FA with Copilot Money](https://help.copilot.money/en/articles/13264550-using-2fa-with-copilot-money)
- [Logging into Copilot](https://help.copilot.money/en/articles/9829510-logging-into-copilot)
- [Account Management FAQ](https://help.copilot.money/en/articles/10684135-account-management-faq)
- [Deleting Your Copilot Account](https://help.copilot.money/en/articles/9548442-deleting-your-copilot-account)
- [Managing Your Copilot Subscription](https://help.copilot.money/en/articles/6860727-managing-your-copilot-subscription)
- [Entering Referral or Gift Codes](https://help.copilot.money/en/articles/9434215-entering-referral-or-gift-codes)
- [Amazon Integration](https://help.copilot.money/en/articles/5569639-amazon-integration)
- [Venmo Integration FAQ](https://help.copilot.money/en/articles/3971255-venmo-integration-faq)
- [Disabling Venmo Forwarding](https://help.copilot.money/en/articles/5274223-disabling-venmo-forwarding)
- [Adding Widgets](https://help.copilot.money/en/articles/9834331-adding-widgets)
- [Improving Widget Performance](https://help.copilot.money/en/articles/4968599-improving-widget-performance)
- [Display Settings for Vision](https://help.copilot.money/en/articles/9828946-display-settings-for-vision)
- [Quick Start Guide](https://help.copilot.money/en/articles/11157550-quick-start-guide)
- [Copilot feedback board: Feature requests](https://feedback.copilot.money/feature-requests)
- [Copilot feedback board: Copilot Android app](https://feedback.copilot.money/feature-requests/p/copilot-android-app)
- [The Penny Hoarder: Copilot Money Review 2026](https://www.thepennyhoarder.com/budgeting/budgeting-copilot-money-review/)


## YNAB

YNAB is a paid zero-based budgeting app for people and households who want to give every dollar a job before they spend it. It has one plan at $14.99 a month or $109 a year, with a 34-day free trial and a free year for college students. Its bank data partners are Plaid and MX, plus Apple Wallet, and it runs on web, iPhone, iPad, Android and Apple Watch.

### The method and plan behaviour

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Ready to Assign | Shows money not yet given to a category. It turns negative when you assign more than you have. | Paid, $14.99 a month or $109 a year | [Read] |
| Assigning money | You type an amount into a category's Assigned field to set that money aside. | Paid, $14.99 a month or $109 a year | [Ask] |
| Assigning in future months | You can assign leftover money to later months to get a month ahead. | Paid, $14.99 a month or $109 a year | [Ask] |
| Fix This and Assigned Too Much alerts | Warns when Ready to Assign is negative in this month or a future month. | Paid, $14.99 a month or $109 a year | [Read] |
| Move Money | Moves an amount from one category to another, or back to Ready to Assign. | Paid, $14.99 a month or $109 a year | [Ask] |
| Cover Overspending | Lets you pick one or more source categories to cover an overspent category. | Paid, $14.99 a month or $109 a year | [Ask] |
| Cover overspending with future funds | On iOS and web, a toggle lets you cover overspending from money assigned to future months. | Paid, $14.99 a month or $109 a year | [Ask] |
| Cash overspending (red) | Shows red. Any uncovered amount is taken from next month's Ready to Assign. | Paid, $14.99 a month or $109 a year | [Rule] |
| Credit overspending (yellow) | Shows yellow with a warning icon. Uncovered amounts become card debt on the payment category. | Paid, $14.99 a month or $109 a year | [Rule] |
| Month rollover | Positive category balances carry over and the Assigned column resets to zero each month. | Paid, $14.99 a month or $109 a year | [Rule] |
| Credit Card Payment category | Created automatically for each credit card account. It holds the money set aside to pay that card. | Paid, $14.99 a month or $109 a year | [Rule] |
| Funded Spending | A card purchase moves that amount from the spending category to the card's payment category. | Paid, $14.99 a month or $109 a year | [Rule] |
| Available for Payment | Shows the most you can pay toward a card from money already set aside. | Paid, $14.99 a month or $109 a year | [Read] |
| Credit Card Interest category | Built-in category that keeps interest out of your spending plan and reports. Launched October 7, 2026. | Paid, $14.99 a month or $109 a year | [Rule] |
| Interest Charges view | The Credit Card Payment category shows interest transactions and this month's interest cost. | Paid, $14.99 a month or $109 a year | [Read] |
| Auto-Assign: Underfunded | Assigns what targets, upcoming scheduled transactions and overspending still need. | Paid, $14.99 a month or $109 a year | [Ask] |
| Auto-Assign: Assigned Last Month | Assigns the same amount as last month. | Paid, $14.99 a month or $109 a year | [Ask] |
| Auto-Assign: Spent Last Month | Assigns what you spent in the category last month. | Paid, $14.99 a month or $109 a year | [Ask] |
| Auto-Assign: Average Assigned | Assigns the rolling average of past assignments, covering up to 12 months. | Paid, $14.99 a month or $109 a year | [Ask] |
| Auto-Assign: Average Spent | Assigns the rolling average of past spending, covering up to 12 months. | Paid, $14.99 a month or $109 a year | [Ask] |
| Auto-Assign: Reduce Overfunding | Returns money above what targets and scheduled transactions need to Ready to Assign. | Paid, $14.99 a month or $109 a year | [Ask] |
| Auto-Assign: Reset Available Amount | Web only. Moves Available money back to Ready to Assign. | Paid, $14.99 a month or $109 a year | [Ask] |
| Auto-Assign: Reset Assigned Amount | Web only. Sets the Assigned column to zero for selected categories or the whole plan. | Paid, $14.99 a month or $109 a year | [Ask] |
| Auto-Assign preview | Shows the proposed amounts before you confirm. | Paid, $14.99 a month or $109 a year | [Read] |
| Plan Reset | iOS tool that returns all unspent money to Ready to Assign so you can reassign it. Launched September 16, 2026. | Paid, $14.99 a month or $109 a year | [Ask] |
| Recent Moves | Lists assignments and money moves from the last 34 days, with All, Moved and Assigned filters. | Paid, $14.99 a month or $109 a year | [Read] |
| Category money moves history | Shows moves for one category in current, future and up to three past months. | Paid, $14.99 a month or $109 a year | [Read] |
| Undo and Redo | Reverses or repeats recent assignments and money moves. On web it ends when you refresh or log out. | Paid, $14.99 a month or $109 a year | [Ask] |
| Age of Money | Estimates how long your money sat before being spent, using your last ten cash outflows. | Paid, $14.99 a month or $109 a year | [Read] |
| Cost to Be Me | Totals this month's targets and compares the total with your expected income. | Paid, $14.99 a month or $109 a year | [Read] |
| Expected income | You enter your expected monthly income once and it carries forward each month. | Paid, $14.99 a month or $109 a year | [Ask] |
| Next Month's Targets preview | Shows next month's target total when it is higher than this month's. | Paid, $14.99 a month or $109 a year | [Read] |
| Assigned in Future Months | Shows how much is assigned to each future month and how close next month is to fully funded. | Paid, $14.99 a month or $109 a year | [Read] |
| In-field calculator | Amount fields accept plus, minus, multiply and divide. | Paid, $14.99 a month or $109 a year | [Ask] |

### Onboarding and plan setup

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| New user intro | A short intro explains the method with an example. Launched May 27, 2025. | Paid, $14.99 a month or $109 a year | [Read] |
| Setup checklist | Mobile checklist with three shortcuts: personalize plan, add accounts and fund categories. | Paid, $14.99 a month or $109 a year | [Read] |
| Overdraft onboarding | Onboarding was updated for users who start in overdraft. Dated April 2026. | Paid, $14.99 a month or $109 a year | [Read] |
| New Plan | Creates a separate blank plan with its own categories, accounts and settings. | Paid, $14.99 a month or $109 a year | [Ask] |
| Multiple plans and Open Plan | You can create unlimited plans and switch between them. | Paid, $14.99 a month or $109 a year | [Ask] |
| Plan Name | You can rename a plan. Names over about 30 characters are cut off on the Home tab. | Paid, $14.99 a month or $109 a year | [Ask] |
| Currency | Each plan uses one currency picked from a list. There is no multi-currency plan. | Paid, $14.99 a month or $109 a year | [Ask] |
| Currency Placement | Sets where the currency symbol shows, or hides it. | Paid, $14.99 a month or $109 a year | [Ask] |
| Number Format | Sets how numbers are written, picked from a list. | Paid, $14.99 a month or $109 a year | [Ask] |
| Date Format | Sets how dates are written, picked from a list. | Paid, $14.99 a month or $109 a year | [Ask] |
| Make a Fresh Start | Makes a new plan that keeps categories, targets, payees and scheduled transactions, and archives the old plan. | Paid, $14.99 a month or $109 a year | [Ask] |
| Restore archived plan | You restore an archived plan by removing the Archived stamp from its name. | Paid, $14.99 a month or $109 a year | [Ask] |
| Delete Plan | Deletes the current plan after a confirmation prompt. | Paid, $14.99 a month or $109 a year | [Ask] |
| Category Templates | Ready-made sets of categories you can import into a plan or use to start one. | Paid, $14.99 a month or $109 a year | [Ask] |

### Accounts and account linking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Direct Import | Imports cleared transactions and balances from linked banks through MX or Plaid, usually within 24 to 72 hours. | Paid, $14.99 a month or $109 a year | [Rule] |
| OAuth bank login | Some banks let you sign in at the bank itself, so the provider never gets your credentials. | Paid, $14.99 a month or $109 a year | [Ask] |
| Link Account and Unlink Account | Links an existing account to a bank connection, or stops imports without deleting history. | Paid, $14.99 a month or $109 a year | [Ask] |
| Manage Bank Connections | Lists each connection, shows whether it uses Plaid or MX, and lets you remove it. | Paid, $14.99 a month or $109 a year | [Ask] |
| Reset bank connection | A Reset button repairs a broken connection and can switch it to a better connector. Launched December 2025. | Paid, $14.99 a month or $109 a year | [Ask] |
| Bank reauthorization prompts | The Home tab and account badges tell you when a bank needs you to sign in again. | Paid, $14.99 a month or $109 a year | [Read] |
| Duplicate bank account detection | Warns when you add a bank account that is already in the plan. Dated July 2025. | Paid, $14.99 a month or $109 a year | [Read] |
| Apple Wallet connection | Imports Apple Card, Apple Cash and Savings with Apple Card through one iPhone. US only, about 30 days of history. | Paid, $14.99 a month or $109 a year | [Rule] |
| Apple Wallet authorized bank connections | Imports third-party bank accounts through Apple Wallet. UK only, so not available in the US. | Paid, $14.99 a month or $109 a year | [Rule] |
| File-Based Import | You drag a CSV, QFX, OFX or QIF bank file into the web app, or use Split View on iPad. | Paid, $14.99 a month or $109 a year | [Ask] |
| CSV column mapping | Matches file columns to Date, Payee, Memo, Outflow and Inflow, and remembers the setup per account. | Paid, $14.99 a month or $109 a year | [Ask] |
| File import options | Options include No header row, Swap Inflow and Outflow, Import Memos, and Swap Payee and Memo. | Paid, $14.99 a month or $109 a year | [Ask] |
| Pending transactions | Shows bank pending items in a collapsible section. They do not affect the plan until entered or cleared. | Paid, $14.99 a month or $109 a year | [Read] |
| Enter Now | Moves a pending or scheduled transaction into the register early. | Paid, $14.99 a month or $109 a year | [Ask] |
| Unlinked accounts | You can add an account with no bank link and enter its transactions by hand. | Paid, $14.99 a month or $109 a year | [Ask] |
| Cash accounts | Checking, Savings and Cash accounts count toward the plan. Cash cannot be linked. | Paid, $14.99 a month or $109 a year | [Ask] |
| Credit accounts | Credit Card and Line of Credit accounts count toward the plan. | Paid, $14.99 a month or $109 a year | [Ask] |
| Loan accounts | Mortgage, Auto Loan, Student Loan, Personal Loan, Medical Debt and Other Debt track balances outside the plan. | Paid, $14.99 a month or $109 a year | [Ask] |
| Tracking accounts | Asset and Liability accounts track balances for net worth only. | Paid, $14.99 a month or $109 a year | [Ask] |
| Starting Balance | Linking or adding an account creates a Starting Balance transaction for that day. | Paid, $14.99 a month or $109 a year | [Rule] |
| Starred Accounts | Starred accounts show in their own section at the top of the Accounts list. | Paid, $14.99 a month or $109 a year | [Ask] |
| Account grouping | Cash accounts and credit accounts are grouped separately in the Accounts area. | Paid, $14.99 a month or $109 a year | [Read] |
| Close Account | Closes an account. Adjust Balance and Close zeroes any remaining balance first. | Paid, $14.99 a month or $109 a year | [Ask] |

### Transactions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Add Transaction | A button on the Home, Plan, Spending and account screens opens a new transaction. | Paid, $14.99 a month or $109 a year | [Ask] |
| Transaction types | On mobile you choose Spending, Inflow, Credit Card Payment or Transfer. | Paid, $14.99 a month or $109 a year | [Ask] |
| Add transaction from a category | Long-press a category on the Plan tab to add a transaction for it. | Paid, $14.99 a month or $109 a year | [Ask] |
| Transfers | A transfer records money moving between two of your accounts. | Paid, $14.99 a month or $109 a year | [Ask] |
| Record Payment | Records a credit card payment and fills in the amount on web. | Paid, $14.99 a month or $109 a year | [Ask] |
| Photos on transactions | You can attach a photo up to 15 MB to a transaction. Launched April 20, 2026. | Paid, $14.99 a month or $109 a year | [Ask] |
| Memos | Each transaction has a free-text memo that is searchable. Web can edit memos in bulk. | Paid, $14.99 a month or $109 a year | [Ask] |
| Flags | Colour flags can be given custom names and used in search. | Paid, $14.99 a month or $109 a year | [Ask] |
| Split transactions | One transaction can be split across several categories, each with its own payee and memo. | Paid, $14.99 a month or $109 a year | [Ask] |
| Split remainder helper | YNAB offers to spread any unassigned remainder across the splits. | Paid, $14.99 a month or $109 a year | [Ask] |
| Transfer inside a split | A split line can be a transfer, for example cash back at a store. | Paid, $14.99 a month or $109 a year | [Ask] |
| Scheduled transactions | Repeats a transaction on one of 12 schedules, from Daily to Every other year. | Paid, $14.99 a month or $109 a year | [Rule] |
| Edit scheduled transactions | You can change or delete one occurrence or all future ones. | Paid, $14.99 a month or $109 a year | [Ask] |
| Upcoming transactions | Category details show upcoming scheduled amounts and what will be left after them. | Paid, $14.99 a month or $109 a year | [Read] |
| List Mode approval | You select imported transactions, categorize them and tap Approve. | Paid, $14.99 a month or $109 a year | [Ask] |
| Card Mode | iOS shows imports as cards. Swipe right to approve and left to skip. Launched September 2026. | Paid, $14.99 a month or $109 a year | [Ask] |
| Reject Transaction | Removes an unapproved import. A rejected transaction will not import again. | Paid, $14.99 a month or $109 a year | [Ask] |
| Automatic matching | An entered transaction matches an import when amounts are equal and dates are within 10 days. | Paid, $14.99 a month or $109 a year | [Rule] |
| Auto-approval of matches | Matched transactions are approved automatically. Dated September 2026. | Paid, $14.99 a month or $109 a year | [Rule] |
| Match and Unmatch | You can match two transactions in one account by hand, or undo a match. | Paid, $14.99 a month or $109 a year | [Ask] |
| Match details | Shows both sides of a matched transaction. | Paid, $14.99 a month or $109 a year | [Read] |
| Approve transfers once | Approving one side of a transfer approves the other side too. Launched April 29, 2026. | Paid, $14.99 a month or $109 a year | [Rule] |
| Credit card payment matching | Card payments link to the checking side by amount, without a payee rule. Launched August 13, 2026. | Paid, $14.99 a month or $109 a year | [Rule] |
| Inflows default to Ready to Assign | Imported inflows to checking, savings or cash accounts default to Ready to Assign. | Paid, $14.99 a month or $109 a year | [Rule] |
| Auto-categorization | Imports get the payee's usual category. The default changes only when 2 of the last 3 agree. | Paid, $14.99 a month or $109 a year | [Rule] |
| Payee cleanup | Messy bank payee names are cleaned up before they show in the register. | Paid, $14.99 a month or $109 a year | [Rule] |
| Renaming rules | IS and CONTAINS rules rename imported payees. CONTAINS rules are made in the web app. | Paid, $14.99 a month or $109 a year | [Rule] |
| Manage Payees | Web screen to rename, combine, delete and hide payees and manage their rules. | Paid, $14.99 a month or $109 a year | [Ask] |
| Payee default category | On web you can set a payee's default category by hand. | Paid, $14.99 a month or $109 a year | [Ask] |
| Hidden Payees | Hidden payees stop showing as suggestions. Launched September 22, 2026 on web. | Paid, $14.99 a month or $109 a year | [Ask] |
| Geo Payees | Mobile suggests payees saved within about 500 meters, with category and account filled in. | Paid, $14.99 a month or $109 a year | [Read] |
| Big box order links | Imports from stores like Amazon, Target, Walmart and Costco show a link to your order history. | Paid, $14.99 a month or $109 a year | [Read] |
| Bank Import Details | Shows the payee as it appeared on your statement. | Paid, $14.99 a month or $109 a year | [Read] |
| Cleared status | Each transaction is uncleared, cleared or reconciled, and you can toggle cleared. | Paid, $14.99 a month or $109 a year | [Ask] |
| Reconcile | You confirm the bank's cleared balance and YNAB locks the cleared transactions. | Paid, $14.99 a month or $109 a year | [Ask] |
| Reconciliation Balance Adjustment | If balances differ, YNAB creates an adjustment transaction for the difference. | Paid, $14.99 a month or $109 a year | [Ask] |
| Search | Search by payee, category, memo, amount, flag, date and status, with suggestions. | Paid, $14.99 a month or $109 a year | [Read] |
| Matched and photo filters | Filter by Matched on all platforms, and by Has Photo on mobile. | Paid, $14.99 a month or $109 a year | [Read] |
| Column sorting | On web, click a column header to sort the register. | Paid, $14.99 a month or $109 a year | [Read] |
| View options | Web can hide reconciled items, show Running Balance and limit the date range. | Paid, $14.99 a month or $109 a year | [Read] |
| Selected total | Shows the sum of the transactions you have selected. | Paid, $14.99 a month or $109 a year | [Read] |
| Bulk actions | Select many transactions to categorize, flag, clear, approve, reject, move, duplicate or delete. | Paid, $14.99 a month or $109 a year | [Ask] |
| Swipe actions | On Android you can swipe a transaction to approve or delete it. | Paid, $14.99 a month or $109 a year | [Ask] |

### Categories and category groups

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Category groups | You can add, rename, reorder, hide and delete groups of categories. | Paid, $14.99 a month or $109 a year | [Ask] |
| Categories | You can add, rename, reorder, hide and delete categories. Categories cannot be nested. | Paid, $14.99 a month or $109 a year | [Ask] |
| Hidden Categories | Hidden categories sit in a list at the bottom of the plan and can be unhidden. | Paid, $14.99 a month or $109 a year | [Ask] |
| Delete with reassignment | Deleting a category with transactions makes you pick a replacement category. | Paid, $14.99 a month or $109 a year | [Ask] |
| Pinned Categories | Mobile Home tab shows categories you pin, with their available money. | Paid, $14.99 a month or $109 a year | [Ask] |
| Focused View: Underfunded | Shows only categories that still need money. | Paid, $14.99 a month or $109 a year | [Read] |
| Focused View: Overfunded | Shows only categories with more assigned than their target needs. | Paid, $14.99 a month or $109 a year | [Read] |
| Focused View: Snoozed | Shows only categories snoozed this month. | Paid, $14.99 a month or $109 a year | [Read] |
| Focused View: Money Available | Shows only categories with money available. | Paid, $14.99 a month or $109 a year | [Read] |
| Focused View: Overspent | Web only. Shows overspent categories and appears only when there are some. | Paid, $14.99 a month or $109 a year | [Read] |
| Custom Focused Views | You can save up to 12 named views of chosen categories, shared by everyone on the plan. | Paid, $14.99 a month or $109 a year | [Ask] |
| Progress Bars | Bars on the Plan screen show each category's progress toward its target. | Paid, $14.99 a month or $109 a year | [Read] |

### Targets

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Weekly target | Asks for a weekly amount, multiplied by how many times that weekday falls in the month. | Paid, $14.99 a month or $109 a year | [Rule] |
| Monthly target | Asks for an amount each calendar month. | Paid, $14.99 a month or $109 a year | [Rule] |
| Yearly target | Asks for a yearly amount by a date, spread across the months before it. | Paid, $14.99 a month or $109 a year | [Rule] |
| Custom target | Asks for an amount by a Due on date. Repeat can be turned off for one-time costs. | Paid, $14.99 a month or $109 a year | [Rule] |
| Set aside another | Asks for the full amount every period, even if money is left over. | Paid, $14.99 a month or $109 a year | [Rule] |
| Refill up to | Asks only for what was spent, up to the target amount. | Paid, $14.99 a month or $109 a year | [Rule] |
| Fill up to | Custom option that counts money already in the category and asks only for the rest. | Paid, $14.99 a month or $109 a year | [Rule] |
| Have a balance of | Custom option that asks you to reach a balance. The date is optional and it does not repeat. | Paid, $14.99 a month or $109 a year | [Rule] |
| Pay Specific Amount Each Month | Credit card target that asks for a fixed amount toward the card each month. | Paid, $14.99 a month or $109 a year | [Rule] |
| Pay off Balance by Date | Credit card target that works out the monthly amount to clear the balance by a date. | Paid, $14.99 a month or $109 a year | [Rule] |
| Monthly Debt Payment | Loan target based on a monthly payment, using the loan's interest rate. | Paid, $14.99 a month or $109 a year | [Rule] |
| Snooze target | Stops a target asking for money for the current month only. Card targets cannot be snoozed. | Paid, $14.99 a month or $109 a year | [Ask] |
| Target progress chart | A donut chart in category details shows progress and whether you are on track. | Paid, $14.99 a month or $109 a year | [Read] |
| Underfunded alert | A category's Available amount shows yellow when its target or upcoming bills need more. | Paid, $14.99 a month or $109 a year | [Read] |
| Current Goal | One target category can be set as your Current Goal and shown on the mobile Home tab. | Paid, $14.99 a month or $109 a year | [Ask] |
| Biweekly targets | Not offered. YNAB documents a weekly or monthly workaround. | Not stated | [Read] |

### Loan planner and debt payoff

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Loan account setup | You enter balance owed, interest rate and monthly payment. Mortgages can include escrow. | Paid, $14.99 a month or $109 a year | [Ask] |
| Estimated loan interest | YNAB estimates each month's interest and applies it to the loan balance. | Paid, $14.99 a month or $109 a year | [Rule] |
| Edit interest and escrow | Web only. You can correct interest or escrow amounts for current and past months. | Paid, $14.99 a month or $109 a year | [Ask] |
| Paired category | Pairs a loan with one category that funds its payments. | Paid, $14.99 a month or $109 a year | [Ask] |
| Add Payment | Records a loan payment. Interest and fees are covered first, then principal. | Paid, $14.99 a month or $109 a year | [Ask] |
| Loan payoff simulator | Web tool shows time and interest saved from extra monthly or one-time payments, or a target payoff date. | Paid, $14.99 a month or $109 a year | [Read] |
| Loan payoff progress chart | Charts past balances and the current payoff path over time. | Paid, $14.99 a month or $109 a year | [Read] |
| Share Your Progress for loans | Web exports a loan paydown image, with an option to hide amounts. | Paid, $14.99 a month or $109 a year | [Ask] |
| Loan paid-off celebration | Web shows a shareable celebration when a loan is paid off. Dated September 2026. | Paid, $14.99 a month or $109 a year | [Read] |
| Credit card overspending warning | Mobile warns when card spending is not covered by the category. | Paid, $14.99 a month or $109 a year | [Read] |

### Reports and export

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Net Worth | Line and bar chart of assets against debts by month, with date and account filters. | Paid, $14.99 a month or $109 a year | [Read] |
| Spending Breakdown | Ranks categories by share of spending, with date and category filters and drill-down. | Paid, $14.99 a month or $109 a year | [Read] |
| Spending Trends | Web bar chart of spending over time by category group, with drill-down to transactions. | Paid, $14.99 a month or $109 a year | [Read] |
| Income v Expense | Web table of income by payee and expenses by category, with monthly, average and total columns. | Paid, $14.99 a month or $109 a year | [Read] |
| Income vs. Spending | Mobile bar chart of the last six months of income and spending. It cannot be filtered. | Paid, $14.99 a month or $109 a year | [Read] |
| Age of Money chart | Line chart of Age of Money. Web shows 6 months, 1 year or 2 years. | Paid, $14.99 a month or $109 a year | [Read] |
| Month summary | Mobile Home tab shows Total Targets, Assigned, Underfunded and Spent for the month. | Paid, $14.99 a month or $109 a year | [Read] |
| Share Your Progress for net worth | Exports a net worth image with amounts hidden if you choose. Web has four formats. | Paid, $14.99 a month or $109 a year | [Ask] |
| Export reports | Web exports Spending Breakdown, Spending Trends, Net Worth and Income v Expense as CSV or TSV. | Paid, $14.99 a month or $109 a year | [Ask] |
| Export Plan | Web exports the whole plan and all transactions as two files. Targets and notes are left out. | Paid, $14.99 a month or $109 a year | [Ask] |
| Export selected transactions | Web exports the transactions you have selected in a register. | Paid, $14.99 a month or $109 a year | [Ask] |
| Download photo | You can download a transaction photo one at a time. | Paid, $14.99 a month or $109 a year | [Ask] |

### YNAB Together and sharing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| YNAB Together | One subscription covers up to six people: a group manager and up to five members. | Paid, $14.99 a month or $109 a year | [Ask] |
| Group manager | Pays, invites and removes members, and can see every plan in the group. | Paid, $14.99 a month or $109 a year | [Ask] |
| Member invitations | Invites go by email, expire after 14 days and can be resent or cancelled. | Paid, $14.99 a month or $109 a year | [Ask] |
| Plan sharing | A plan owner can share a plan with other members, who can then edit it. | Paid, $14.99 a month or $109 a year | [Ask] |
| Plan ownership transfer | A plan owner can hand ownership to another member. | Paid, $14.99 a month or $109 a year | [Ask] |
| Member avatars in Recent Moves | Web shows who made each move and can filter by member. Launched February 25, 2026. | Paid, $14.99 a month or $109 a year | [Read] |
| Per-member bank connections | Each member sees and manages only the bank connections they created. | Paid, $14.99 a month or $109 a year | [Read] |
| Leaving a group | A member who leaves keeps their own plans and starts a free trial. | Paid, $14.99 a month or $109 a year | [Ask] |
| Hide Amounts | A toggle masks all amounts so you can show your plan. On web since June 2026. | Paid, $14.99 a month or $109 a year | [Ask] |
| Share and Earn referral | You and a referred friend each get a free month. No limit on referrals. | Paid, $14.99 a month or $109 a year | [Ask] |
| Extended referral trial | Friends who join by referral link get a six-week trial. Launched September 25, 2026. | Free | [Read] |
| Referral QR code | Mobile shows a QR code friends can scan to use your referral link. | Paid, $14.99 a month or $109 a year | [Read] |
| Gift subscriptions | You can buy a 3-month or 1-year gift. The 3-month gift was $34.99 in November 2025. | 3-month gift $34.99 (dated). 1-year price not stated | [Ask] |
| Scheduled and themed gifts | Gifts can be scheduled up to three months ahead. Themed gifts send at once. | Not stated | [Ask] |
| Gift giver reward | A subscriber gets three free months when a new user redeems their gift. | Paid, $14.99 a month or $109 a year | [Read] |

### AI and automation

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| YNAB ChatGPT App | Runs inside ChatGPT and surfaces YNAB articles and videos. It cannot see your plan. | Free | [Read] |
| ChatGPT debt payoff calculator | You type balances, rates and a monthly payment, and it estimates the payoff time. | Free | [Read] |
| Support chatbot | The help widget starts with a chatbot before passing you to a person. | Paid, $14.99 a month or $109 a year | [Read] |
| In-app AI assistant | Not found on any YNAB page opened for this research. | Not stated | [Read] |

### API and integrations

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Personal Access Tokens | An account owner creates a token for their own use. Tokens do not expire. | Paid, $14.99 a month or $109 a year | [Ask] |
| OAuth applications | Third-party apps get two-hour tokens through OAuth, with an optional read-only scope. | Paid, $14.99 a month or $109 a year | [Ask] |
| API read access | Reads plans, accounts, categories, months, payees, transactions, scheduled transactions and money movements. | Paid, $14.99 a month or $109 a year | [Read] |
| API write access | Creates or updates transactions, scheduled transactions, categories, groups, targets, payees and accounts. | Paid, $14.99 a month or $109 a year | [Ask] |
| Delta requests | Returns only what changed since a saved server knowledge number. | Paid, $14.99 a month or $109 a year | [Read] |
| Rate limit | Each access token is limited to 200 requests per hour. | Paid, $14.99 a month or $109 a year | [Read] |
| Restricted Mode | A new OAuth app can issue only 25 tokens until YNAB reviews it. | Paid, $14.99 a month or $109 a year | [Read] |
| Client libraries | Official JavaScript, Ruby and Python libraries are provided. | Free | [Read] |
| Works with YNAB | A directory of reviewed third-party apps built on the API. | Not stated | [Read] |
| Zapier for YNAB | Official integration that connects YNAB to other apps for automations. | Not stated | [Rule] |
| API Starter Kit | Official GitHub project for starting an app on the API. | Free | [Read] |

### Platforms

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Web app | Runs in a browser at app.ynab.com. There is no downloadable desktop app. | Paid, $14.99 a month or $109 a year | [Read] |
| Install as browser app | Chrome and Safari can install the web app as a shortcut-style app. | Paid, $14.99 a month or $109 a year | [Ask] |
| iPhone app | Needs iOS 18.0 or later. | Paid, $14.99 a month or $109 a year | [Read] |
| iPad app | Needs iPadOS 18.0 or later. | Paid, $14.99 a month or $109 a year | [Read] |
| Android app | Gets updates on Android 11 or newer. | Paid, $14.99 a month or $109 a year | [Read] |
| Apple Watch app | The App Store lists watchOS 9.0 or later. Watch features were not confirmed. | Paid, $14.99 a month or $109 a year | [Read] |
| Real-time sync | Changes sync across devices and people. The features page says it also works offline. | Paid, $14.99 a month or $109 a year | [Rule] |
| iOS category widgets | Small, medium and large widgets show 1, 3 or 7 chosen categories. | Paid, $14.99 a month or $109 a year | [Read] |
| Android category widgets | A small widget shows one category and a large one shows a scrollable list. | Paid, $14.99 a month or $109 a year | [Read] |
| Add Transaction widget | iPhone widget or Android shortcut that opens a new transaction. | Paid, $14.99 a month or $109 a year | [Ask] |
| iOS Shortcuts | Five actions: Add New Transaction, Find Category, Open Category Details, Open Plan and Show Category Balance. | Paid, $14.99 a month or $109 a year | [Ask] |
| Siri | Siri can add a transaction, open your plan and read a category balance. Balances need iOS 26. | Paid, $14.99 a month or $109 a year | [Read] |
| Spotlight search | On iOS 26 you can search a category from Spotlight and see its balance. | Paid, $14.99 a month or $109 a year | [Read] |
| Lock Screen and Control Center shortcut | On iOS 18 or later you can add an Add Transaction control. | Paid, $14.99 a month or $109 a year | [Ask] |
| Themes | Light, dark or match the system theme. | Paid, $14.99 a month or $109 a year | [Ask] |
| Resizable layout | Web lets you collapse or resize sidebars and resize register columns. | Paid, $14.99 a month or $109 a year | [Ask] |
| Keyboard shortcuts | Web has shortcuts for approving, categorizing, splitting, flagging, reconciling and more. | Paid, $14.99 a month or $109 a year | [Ask] |
| Accessibility | Supports VoiceOver, TalkBack, JAWS, larger text and a Differentiate Without Color option. | Paid, $14.99 a month or $109 a year | [Read] |
| Beta programs | Betas run through TestFlight on iOS and Google Play on Android. | Paid, $14.99 a month or $109 a year | [Ask] |
| Alexa skill | Not found on any YNAB page opened for this research. | Not stated | [Read] |

### Notifications

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| App notifications | Phone alerts for new transactions, items to approve, income received and cash overspending. | Paid, $14.99 a month or $109 a year | [Rule] |
| Support reply notifications | A phone alert tells you when Support has replied. | Paid, $14.99 a month or $109 a year | [Rule] |
| Badge notifications | Dots and blue banners inside the app flag imports, approvals, overspending and bank updates. | Paid, $14.99 a month or $109 a year | [Read] |
| New transactions banner | A banner shows how many imported transactions need review. | Paid, $14.99 a month or $109 a year | [Read] |
| Overspent categories banner | A mobile banner shows how many categories are overspent. | Paid, $14.99 a month or $109 a year | [Read] |
| Trial ending email | YNAB emails a reminder one week before the trial ends. | Free | [Rule] |
| Renewal receipt email | YNAB emails a receipt each time the subscription renews. | Paid, $14.99 a month or $109 a year | [Rule] |
| Pending transaction alerts | Not offered. YNAB sends no notification for pending transactions. | Not stated | [Read] |

### Security and privacy

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Two-Step Verification | Adds a six-digit code from an authenticator app at login. SMS is not mentioned. | Paid, $14.99 a month or $109 a year | [Ask] |
| Emergency backup code | A backup code saved at setup gets you back in if you lose your authenticator. | Paid, $14.99 a month or $109 a year | [Read] |
| Face ID, Touch ID and App Lock | Mobile can require biometrics or a passcode after a five-minute grace period. | Paid, $14.99 a month or $109 a year | [Ask] |
| Sign in with Google or Apple | You can link one Google and one Apple account for password-free login. | Paid, $14.99 a month or $109 a year | [Ask] |
| Encrypted bank data | Communication between you, the provider and the bank is encrypted in transit and at rest. | Paid, $14.99 a month or $109 a year | [Read] |
| Support Access | You can give Support read-only access to a snapshot of your plan. It turns off after 60 days. | Paid, $14.99 a month or $109 a year | [Ask] |
| Ad-free app | The app shows no ads or third-party product offers. | Paid, $14.99 a month or $109 a year | [Read] |
| No sale of financial data | The privacy policy says YNAB does not sell your financial data. | Paid, $14.99 a month or $109 a year | [Read] |

### Support and learning

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| In-app messaging | A help widget in the web and mobile apps opens a conversation with Support. | Paid, $14.99 a month or $109 a year | [Ask] |
| Email support | You can email help@ynab.com. Replies usually come within one day, Monday to Friday. | Paid, $14.99 a month or $109 a year | [Ask] |
| For You | Suggests YNAB guides, videos, blog posts and podcasts inside the app. | Paid, $14.99 a month or $109 a year | [Read] |
| Help center | Public articles, interactive guides and quick videos at support.ynab.com. | Free | [Read] |
| Live events | The App Store listing mentions live events and a user community. Details were not confirmed. | Not stated | [Read] |
| Financial advice | Not confirmed. The help article on advice could not be opened. | Not stated | [Read] |

### Pricing and trial

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Free trial | 34 days with no card when you sign up at ynab.com. App store listings say 30 days. | Free | [Read] |
| Monthly subscription | Full access, billed monthly. | $14.99 a month | [Read] |
| Annual subscription | Full access, billed yearly. Equal to $9.08 a month. | $109 a year | [Read] |
| College program | College students get 365 days free with proof of enrollment, once only. | Free for 365 days | [Read] |
| Billing channels | You can subscribe direct, through the Apple App Store or through Google Play. | Paid, $14.99 a month or $109 a year | [Ask] |
| Cancel subscription | Access continues to the end of the paid period after you cancel. | Paid, $14.99 a month or $109 a year | [Ask] |

### Business model and partners

- YNAB earns money from subscriptions only. There is one tier, at $14.99 a month or $109 a year.
- The app is ad-free and shows no third-party product offers.
- Bank data comes from Plaid and MX. YNAB picks whichever works best for each bank.
- Apple Wallet supplies Apple Card, Apple Cash and Savings data in the US.
- The privacy policy also names Google Analytics and says YNAB runs targeted ads to find new users.
- Growth tools are referrals, gift subscriptions, a free college year and a merchandise shop opened in September 2026.

### What users say is missing or broken

- Frequent interface changes make the app feel cluttered. Said in an App Store review, November 2025.
- A recent update made text smaller and added taps. Said in a Google Play review, August 2026.
- Bank connections fail or time out, and PayPal does not work well. Said in a Google Play review, September 2026.
- It has a steeper learning curve and needs more upkeep than similar apps. Said in a Google Play review, September 2026.
- YNAB's own help pages confirm gaps: no biweekly targets, no plan copy, no multi-currency plan and no revert to a past date.

### Sources

- [YNAB Pricing](https://www.ynab.com/pricing)
- [YNAB Features](https://www.ynab.com/features)
- [YNAB Release Notes](https://www.ynab.com/release-notes)
- [YNAB What's New](https://www.ynab.com/whats-new)
- [YNAB What's New, page 2](https://www.ynab.com/whats-new?339368af_page=2)
- [YNAB What's New, page 3](https://www.ynab.com/whats-new?339368af_page=3)
- [YNAB What's New, page 4](https://www.ynab.com/whats-new?339368af_page=4)
- [Our App Lineup](https://www.ynab.com/our-app-lineup)
- [Goal tracking](https://www.ynab.com/features/goal-tracking)
- [Subscription sharing](https://www.ynab.com/features/subscription-sharing)
- [Debt management](https://www.ynab.com/features/debt-management)
- [YNAB Privacy Policy](https://www.ynab.com/privacy-policy)
- [YNAB API documentation](https://api.ynab.com/)
- [YNAB on the App Store](https://apps.apple.com/us/app/ynab/id1010865877)
- [YNAB on Google Play](https://play.google.com/store/apps/details?id=com.youneedabudget.evergreen.app&hl=en_US&gl=US)
- [Help center index (llms.txt)](https://support.ynab.com/llms.txt)
- [Updates to YNAB](https://support.ynab.com/en_us/updates-to-ynab-S1f4aRLeC.md)
- [Understanding Target Types in YNAB](https://support.ynab.com/en_us/getting-started-with-targets-ryAEP08xC.md)
- [How to Use Targets](https://support.ynab.com/en_us/how-to-use-targets-rk5kkI9ks.md)
- [Snooze a Target](https://support.ynab.com/en_us/snooze-a-target-HyS4E5rZT.md)
- [Targets for Categories Paired with Accounts](https://support.ynab.com/en_us/paired-targets-BJJI8rdC5.md)
- [Auto-Assign](https://support.ynab.com/en_us/auto-assign-a-guide-r1gBNbBJo.md)
- [Assigning Your Money](https://support.ynab.com/en_us/assigning-your-money-a-guide-SypgkrNJi.md)
- [Moving Money in Your Plan](https://support.ynab.com/en_us/moving-money-in-your-plan-ryyCKbBJi.md)
- [Handling Overspending in YNAB](https://support.ynab.com/en_us/overspending-in-ynab-a-guide-ryWoxEyi.md)
- [When the Month Rolls Over](https://support.ynab.com/en_us/when-the-month-rolls-over-a-guide-rkyyd6qC9.md)
- [Handling Credit Cards in YNAB](https://support.ynab.com/en_us/handling-credit-cards-overview-ry7cNub1s.md)
- [Credit Card Payments](https://support.ynab.com/en_us/credit-card-payments-a-guide-r1_506Q1j.md)
- [Credit Card Interest](https://support.ynab.com/en_us/credit-card-interest-S1ovly_sMg.md)
- [Loan Accounts](https://support.ynab.com/en_us/loan-accounts-a-guide-HkNSkPHJi.md)
- [Plan Resets and Fresh Starts in YNAB](https://support.ynab.com/en_us/plan-resets-and-fresh-starts-HkXYR_c0q.md)
- [How to Fix Mistakes with Undo and Redo](https://support.ynab.com/en_us/how-to-fix-mistakes-with-undo-and-redo-HJzO5CfA9.md)
- [Age of Money](https://support.ynab.com/en_us/age-of-money-H1ZS84W1s.md)
- [Plan and Adjust with Edit Plan and Cost to Be Me](https://support.ynab.com/en_us/plan-and-adjust-with-edit-plan-and-cost-to-be-me-ByR7vpqPyx.md)
- [The Inspector](https://support.ynab.com/en_us/the-inspector-an-overview-ryylY7OCq.md)
- [At Home in YNAB](https://support.ynab.com/en_us/spotlight-BkdHBZUokg.md)
- [Spaces in (and out of) the Mobile App](https://support.ynab.com/en_us/spaces-in-the-mobile-app-S1iIZQoqgg.md)
- [Focused Views](https://support.ynab.com/en_us/focused-views-a-guide-BksnNYqLh.md)
- [Adding, Removing, and Customizing Categories](https://support.ynab.com/en_us/adding-removing-and-customizing-categories-a-guide-HJFO5j909.md)
- [Category Templates](https://support.ynab.com/en_us/category-templates-HknjS_RA.md)
- [Creating a New Plan](https://support.ynab.com/en_us/creating-a-new-plan-Hyl4uc5Cq.md)
- [How to Adjust Your Plan Settings](https://support.ynab.com/en_us/how-to-adjust-your-plan-settings-SyFt35cAq.md)
- [Using Multiple Currencies in YNAB](https://support.ynab.com/en_us/using-multiple-currencies-in-ynab-a-guide-SyBF6PHno.md)
- [Linked Accounts in YNAB](https://support.ynab.com/en_us/linked-accounts-in-ynab-B1991f2Cc.md)
- [How Direct Import Works](https://support.ynab.com/en_us/how-direct-import-works-H1IGYLgnxl.md)
- [Is my bank connection using Plaid or MX as a Direct Import provider?](https://support.ynab.com/en_us/which-direct-import-provider-SkcusCQeWe.md)
- [Apple Wallet Connections in YNAB](https://support.ynab.com/en_us/apple-connections-rkShEfrUh.md)
- [Apple Wallet in YNAB: Authorized Bank Connections](https://support.ynab.com/en_us/apple-third-party-H1gE_0CRyg.md)
- [File-Based Import](https://support.ynab.com/en_us/file-based-import-a-guide-Bkj4Sszyo.md)
- [Pending Transactions](https://support.ynab.com/en_us/pending-transactions-an-overview-Bk0WoOcA5.md)
- [Account Types](https://support.ynab.com/en_us/account-types-an-overview-BkmGM0qCq.md)
- [How to Add Transactions in YNAB](https://support.ynab.com/en_us/how-to-add-transactions-in-ynab-HyDwA_byi.md)
- [Scheduled Transactions](https://support.ynab.com/en_us/scheduled-transactions-a-guide-BygrAIFA9.md)
- [Approving and Matching Transactions](https://support.ynab.com/en_us/approving-and-matching-transactions-a-guide-ByYNZaQ1i.md)
- [Searching, Sorting, and Filtering Transactions](https://support.ynab.com/en_us/searching-transactions-a-guide-r1gxyQryj.md)
- [Reconciling Accounts](https://support.ynab.com/en_us/reconciling-accounts-a-guide-BJFE3fHys.md)
- [Split Transactions](https://support.ynab.com/en_us/split-transactions-a-guide-SJLEKwY0q.md)
- [Flags](https://support.ynab.com/en_us/flags-a-guide-Skh8Xb4kj.md)
- [How to Rename Payees](https://support.ynab.com/en_us/how-to-rename-payees-BkotNUSyo.md)
- [How to Add, Edit, and Delete Payees](https://support.ynab.com/en_us/how-to-add-edit-and-delete-payees-rkxMu4Skj.md)
- [Geo Payees on Mobile](https://support.ynab.com/en_us/geo-payees-on-mobile-a-guide-SJTbcVks.md)
- [Use Photos and Memos to Add Context to Transactions](https://support.ynab.com/en_us/add-context-to-transactions-HyCpTR4bg.md)
- [Reflect in YNAB](https://support.ynab.com/en_us/reflect-in-ynab-B1GJsrWkj.md)
- [Spending Breakdown](https://support.ynab.com/en_us/spending-breakdown-H1H7YxmD0.md)
- [Spending Trends](https://support.ynab.com/en_us/spending-trends-H1inlhzAc.md)
- [Income vs. Spending and Income v Expense](https://support.ynab.com/en_us/income-v-expense-Byu1BYWRq.md)
- [Net Worth](https://support.ynab.com/en_us/net-worth-BkwQO5WA5.md)
- [How to Export Plan Data](https://support.ynab.com/en_us/how-to-export-plan-data-Sy_CouWA9.md)
- [How to Export Reflection Data](https://support.ynab.com/en_us/how-to-export-reflection-data-Bykou09.md)
- [YNAB Together](https://support.ynab.com/en_us/ynab-together-B1nS78Cki.md)
- [Referral Program](https://support.ynab.com/en_us/referral-program-an-overview-BJWpA9Rc.md)
- [How to Purchase YNAB as a Gift](https://support.ynab.com/en_us/gift-ynab-rJnOtBxRq.md)
- [YNAB's ChatGPT App](https://support.ynab.com/en_us/ynab-and-chatgpt-H1QI25JRZe.md)
- [The YNAB API](https://support.ynab.com/en_us/the-ynab-api-an-overview-BJMgQ3zAq.md)
- [The YNAB App](https://support.ynab.com/en_us/the-ynab-app-SyP94gTjkx.md)
- [YNAB Widget for Mobile](https://support.ynab.com/en_us/ynab-widget-for-mobile-a-guide-HJPEEQYR9.md)
- [Shortcuts on iOS](https://support.ynab.com/en_us/shortcuts-on-ios-a-guide-Bk_lHa5Aq.md)
- [Using Siri and Spotlight with YNAB](https://support.ynab.com/en_us/using-siri-and-spotlight-with-ynab-B1Me9dj5ge.md)
- [Changing the Appearance of Your Plan](https://support.ynab.com/en_us/changing-the-appearance-of-your-plan-BJzo3HlRc.md)
- [Keyboard Shortcuts](https://support.ynab.com/en_us/keyboard-shortcuts-Skw9Xp9A9.md)
- [Accessibility Tools and Features](https://support.ynab.com/en_us/accessibility-tools-and-features-an-overview-HkmxC7W1j.md)
- [Managing Notifications](https://support.ynab.com/en_us/managing-notifications-a-guide-HySdCwtCc.md)
- [How to Protect Your Account With Two-Step Verification](https://support.ynab.com/en_us/how-to-protect-your-account-with-two-step-verification-rkKHuLlRc.md)
- [How to Enable and Disable Touch ID, Face ID, and App Lock](https://support.ynab.com/en_us/how-to-enable-and-disable-touch-id-face-id-and-app-lock-SyjrFNtR5.md)
- [How to Sign In with Google or Apple](https://support.ynab.com/en_us/how-to-sign-in-with-google-or-apple-BkE7jElRq.md)
- [Support Access](https://support.ynab.com/en_us/support-access-an-overview-ry2JI2C3j.md)
- [How to Get Help in YNAB](https://support.ynab.com/en_us/how-to-get-help-SygqcvtC5.md)
- [Your YNAB Trial](https://support.ynab.com/en_us/your-ynab-trial-ry87vWAc.md)
- [How to Manage Your Subscription](https://support.ynab.com/en_us/how-to-manage-your-subscription-BJXBVDb0q.md)
- [How to Request a Refund](https://support.ynab.com/en_us/requesting-a-refund-SyNvz1I5.md)
- [How to Join YNAB's College Program](https://support.ynab.com/en_us/how-to-join-ynabs-college-program-rkDd5VlC5.md)
- [Why are some features missing in the app?](https://support.ynab.com/en_us/missing-features-H19srFG_le.md)
- [Personalize YNAB](https://support.ynab.com/en_us/personalize-ynab-HyYKEbAWbe.md)
- [The Wish Farm](https://support.ynab.com/en_us/the-wish-farm-an-overview-SJfWnOLRj.md)


## Cleo

Cleo is a chat-based AI money app for US adults living paycheck to paycheck, on iOS and Android. It is free to use, with paid plans at $5.99 Plus, $8.99 Pro and $14.99 Builder a month. Partners are Plaid for bank data, Thread Bank for deposits, WebBank for the card and Atomic for investing.

### Onboarding and bank linking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Bank linking with Plaid | You log in to your bank through Plaid so Cleo can read your transactions. | Free | [Read] |
| Add account | You can link more than one bank from Spend, using "Add account" or "Connect another bank". | Free | [Read] |
| Hide account | A switch under each account hides its data without deleting it. | Free | [Read] |
| Delete linked account | Swiping left on an account removes it and its data from Cleo. | Free | [Read] |
| Joint account linking | A joint account can be linked, but Cleo cannot split its transactions between people. | Free | [Read] |
| Unsupported account types | Business accounts, non-US banks and non-bank money sources cannot be connected. | Free | [Read] |

### AI chat

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Ask Cleo | A 24/7 chat where you ask about your money and get answers from your own bank data. | Free | [Read] |
| Spending questions | You can ask things like how much you spent on takeout last month. | Free | [Read] |
| Affordability answers | Cleo answers "can I afford this" using your balance and upcoming bills. Reported by press on Cleo 3.0. | Not stated | [Read] |
| Roast Me | Cleo mocks your bad spending habits in a blunt, funny tone. Cleo says 1.4 million users were roasted. | Not stated | [Read] |
| Hype | Cleo praises your good money moves. Cleo says 841,000 users were hyped. | Not stated | [Read] |
| Voice | You hold a real-time, two-way spoken conversation with Cleo. Added in Cleo 3.0, July 2025. | Pro, $8.99 a month | [Read] |
| Memory | Cleo remembers your goals and past chats to tailor later advice. | Pro, $8.99 a month | [Read] |
| Advanced reasoning | Cleo 3.0 uses a reasoning model to work through harder money decisions step by step. Reported by press. | Not stated | [Read] |
| Deposit by chat | Typing "deposit $X" moves that amount from your bank into Cleo Savings. | Free | [Ask] [Flag] |
| Withdraw by chat | Typing "withdraw $X" moves that amount from Cleo Savings back to your bank. | Free | [Ask] [Flag] |
| Repay by chat | You can ask Cleo to repay a cash advance early. | Free | [Ask] [Flag] |
| Extend repayment by chat | Saying "extend repayment" checks if your advance due date can move back. | Free | [Ask] [Flag] |
| Goal setting by chat | You set an Autopilot goal in chat and Cleo asks follow-up questions. | Autopilot waitlist | [Read] |
| Human handoff | Typing "Human" or asking for help gives you a link to the support team. | Free | [Read] |

### Autopilot

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Autopilot waitlist | US users join by tapping Plan. Launched 5 February 2026 to select users. | Not stated | [Read] |
| Insights | Cleo studies years of transactions to model your income, recurring costs and spending patterns. | Autopilot waitlist | [Read] |
| Roadmap | You get a 3 to 6 month plan in milestones. At launch the only goal is positive cashflow. | Autopilot waitlist | [Read] |
| Daily Plan | A daily view shows recent activity, a safe-to-spend amount and steps to get back on track. | Autopilot waitlist | [Read] |
| Daily spending figure | Cleo works out what you can safely spend each day. It updates when bills, pay or spending change. | Autopilot waitlist | [Read] |
| Action: move money into savings | Cleo suggests a savings transfer tied to your goal and makes it once you agree. | Autopilot waitlist | [Ask] [Flag] |
| Action: overdraft cover | Cleo suggests a cash advance when it predicts an overdraft, and you approve it. | Autopilot waitlist | [Ask] [Flag] |
| Action: merchant spending limits | You can set a spending limit at, or block, a specific merchant. | Autopilot waitlist | [Rule] |
| Planned actions | Bill negotiation, cheaper insurance and emergency fund goals are announced for 2026 but not live. | Not live | [Ask] [Flag] |

### Budgeting and spending insights

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Plan | One monthly view that merges the old Budget and Progress screens. Changed in September 2026. | Free | [Read] |
| Left to Spend | Shows what you can still spend this month after counting income and bills, past and upcoming. | Free | [Read] |
| Goal impact | Shows how a one-off purchase changes your monthly spending and your goal progress. | Free | [Read] |
| Spend | A feed of transactions across your linked accounts and your Cleo Card. | Free | [Read] |
| Bills due | Lists upcoming bills at the top of the budget view. | Free | [Read] |
| Add a bill | You pick a past transaction and mark it as a bill. You can edit or delete it later. | Free | [Read] |
| Recurring bill detection | Cleo finds recurring bills by merchant and amount. | Free | [Read] |
| Essential spending | Groups bill transactions under an essential spending heading. | Free | [Read] |
| Change category | You tap a transaction and pick a new category, for this one or the whole merchant. | Free | [Read] |
| Excluded | Marking a transaction "Excluded" removes it from your budget numbers. | Free | [Read] |
| Recurring payment switch | A toggle marks any transaction as recurring. | Free | [Read] |
| Subscription detection | Cleo flags forgotten subscriptions and repeat charges. Reported in UK relaunch coverage. | Not stated | [Read] |
| Debt Reset | A dashboard in Spend shows all eligible debts and total balances. Mortgages and student loans are excluded. | Plus, $5.99 a month | [Read] |
| Paydown plan | Suggests which debts to pay first. Cleo does not make the payments. | Plus, $5.99 a month | [Read] |
| Debt-free date | Projects the date your eligible debts end. It refreshes about every 30 days. | Plus, $5.99 a month | [Read] |
| Monthly interest estimate | Estimates what your debt costs each month from lender rates and minimum payments. | Plus, $5.99 a month | [Read] |

### Cash advance

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Cash advance | You get $20 to $250, or $20 to $100 the first time, with no interest or credit check. | Plus, $5.99 a month | [Ask] [Flag] |
| Builder cash advance | Limits rise to $150 to $500. The $500 level needs $750 a month in direct deposits. | Builder, $14.99 a month | [Ask] [Flag] |
| Advance without a subscription | Non-subscribers can ask for an advance by emailing team@meetcleo.com. | Free | [Ask] [Flag] |
| Request tab | Shows the amount you qualify for. It was called Borrow before. | Plus, $5.99 a month | [Read] [Flag] |
| Daily disbursement cap | Cleo pays out at most $170 a day, so larger advances arrive in parts. | Plus, $5.99 a month | [Read] [Flag] |
| Standard delivery | The advance reaches your bank in 3 to 4 days. | Free | [Ask] [Flag] |
| Express delivery | The advance arrives the same day. The fee is paid at repayment. | $4.49 to $14.99 per advance | [Ask] [Flag] |
| Repayment date choice | You pick a repayment date 3 to 14 days after the advance. | Plus, $5.99 a month | [Ask] [Flag] |
| Automatic repayment | Cleo debits your linked card or bank account on the repayment date. | Plus, $5.99 a month | [Rule] [Flag] |
| Repay now | A button in Request repays the full balance early. | Plus, $5.99 a month | [Ask] [Flag] |
| Extend repayment | You may be able to push the due date back by up to 7 days. | Plus, $5.99 a month | [Ask] [Flag] |
| Partial Repayments | If you opt in, a failed full debit is retried in smaller amounts over later days. | Plus, $5.99 a month | [Rule] [Flag] |
| Cool-off period | You must wait 24 hours and fully repay before requesting another advance. | Plus, $5.99 a month | [Read] [Flag] |
| Cash advance history | A screen lists your past advances. | Plus, $5.99 a month | [Read] [Flag] |
| Card boosts | New Cleo Card holders earn up to 3 advance boosts for set tasks within 30 days. | Builder, $14.99 a month | [Ask] [Flag] |
| Referral boosts | You and a friend each get an advance boost when they subscribe. The limit is 5 referrals. | Plus, $5.99 a month | [Ask] [Flag] |
| Direct deposit advance tiers | Monthly direct deposits of $250, $500 or $750 unlock higher advance ranges. | Builder, $14.99 a month | [Read] [Flag] |
| State limits | Paid plans and advances are not offered in Connecticut or Maine. | Not stated | [Read] [Flag] |

### Pay Later

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Pay Later | You get up to $500 to spend at eligible merchants and repay with no interest. | Not stated | [Ask] [Flag] |
| One-time virtual card | Each purchase gets a new virtual card in Spend. It expires after 72 hours if unused. | Not stated | [Ask] [Flag] |
| Minimum purchase | A Pay Later purchase must be at least $35. | Not stated | [Read] [Flag] |
| Transaction fee | Each Pay Later loan carries a fee. | 5% of the loan, capped at $7.50 | [Read] [Flag] |
| Four payments | The balance is split into 4 equal payments. The first is held when the card is made. | Not stated | [Rule] [Flag] |
| Payday autopay | With autopay on, later installments are collected on your paydays. | Not stated | [Rule] [Flag] |
| Early repayment | You can repay a Pay Later loan in full early. | Not stated | [Ask] [Flag] |
| Late fee | A late fee applies if a payment is still unpaid after 48 hours. | $7 per late payment | [Read] [Flag] |
| Merchant restrictions | Pay Later is blocked for gambling, fuel, hotels, car rental, tuition and international purchases. | Not stated | [Read] [Flag] |
| Collections | A loan 30 days overdue may go to InDebted. New loans are paused until it is settled. | Not stated | [Read] [Flag] |

### Credit builder card and credit score

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Cleo Card | A secured credit card from WebBank. Your spending limit equals your security deposit. | Builder, $14.99 a month | [Ask] [Flag] |
| Security deposit | You fund the card with as little as $1. No credit score or history is needed. | Builder, $14.99 a month | [Ask] [Flag] |
| Instant transfer | Adds cash to the card deposit from a linked debit card at no fee. | Builder, $14.99 a month | [Ask] [Flag] |
| Carefree credit building | Pays your card statement in full from your security deposit each month. | Builder, $14.99 a month | [Rule] [Flag] |
| Credit bureau reporting | Reports balance and payment status monthly to Experian, Equifax and TransUnion. Utilization is not reported. | Builder, $14.99 a month | [Rule] [Flag] |
| Virtual card | Card details show in Spend behind a passcode, usable before the plastic card arrives. | Builder, $14.99 a month | [Read] [Flag] |
| Mobile wallet | The card can be added to Apple Wallet or Google Wallet. | Builder, $14.99 a month | [Ask] [Flag] |
| Physical card | A contactless card arrives in about 2 weeks and is activated by QR code. | Builder, $14.99 a month | [Ask] [Flag] |
| Freeze card | A button in Spend blocks and unblocks all card transactions. | Builder, $14.99 a month | [Ask] [Flag] |
| Replace card | You order a new card in Spend. It takes 1 to 4 weeks to arrive. | Builder, $14.99 a month | [Ask] [Flag] |
| Close card | Closing the card returns your deposit to your bank, usually within a week. | Builder, $14.99 a month | [Ask] [Flag] |
| ATM card cash advance | You can withdraw up to $500 a day against your deposit at an ATM. | $2.50 per withdrawal plus ATM fee | [Ask] [Flag] |
| Automatic transfers | Monthly or bi-weekly card top-ups with a 5-day notice. Closed to new setups. | Builder, $14.99 a month | [Rule] [Flag] |
| Card use limits | The card cannot be used for crypto, gambling, business buys or Cleo's own fees. | Builder, $14.99 a month | [Read] [Flag] |
| Personalized Credit Score | Shows your credit score in Request, with an Equifax report explaining the reasons. | Plus, $5.99 a month | [Read] [Flag] |
| Score simulator | Explains what your score means for interest rates, mortgages and similar products. | Plus, $5.99 a month | [Read] [Flag] |
| Credit score coaching | Gives next steps to improve your credit score. | Pro, $8.99 a month | [Read] [Flag] |
| Credit history | Shows your credit history over time. | Builder, $14.99 a month | [Read] [Flag] |

### Direct deposit and early pay

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Direct deposit | Sends all, a percentage or a fixed amount of your paycheck to a Thread Bank account. | Builder, $14.99 a month | [Rule] [Flag] |
| Payroll sign-in setup | You sign in to your payroll provider inside the app to set it up. | Builder, $14.99 a month | [Ask] [Flag] |
| Early pay | Your paycheck can arrive up to 2 days early and lands on your card deposit. | Builder, $14.99 a month | [Rule] [Flag] |
| Manage direct deposits | You can change the amount sent at any time. Only your employer can cancel it. | Builder, $14.99 a month | [Ask] [Flag] |
| First deposit estimate | The Spend tab shows when Cleo expects your first direct deposit. | Builder, $14.99 a month | [Read] [Flag] |

### Savings

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Cleo Savings | A savings account at Thread Bank with no fees. It is open to every user. | Free | [Ask] [Flag] |
| Savings APY | Paid plans earn about 2.75% APY. Two help pages show 2.78% and 2.95% instead. | Pro, $8.99 a month | [Rule] [Flag] |
| Monthly interest payout | Interest is worked out on your month-end balance and paid in the first week. | Free | [Rule] [Flag] |
| Deposit | You tap Deposit in Save, enter an amount and confirm the source bank. | Free | [Ask] [Flag] |
| Withdraw | You move savings back to your bank, up to $1,000 a day. | Free | [Ask] [Flag] |
| Statements | You can view all savings activity and download monthly PDF statements. | Free | [Read] [Flag] |
| Savings goals | You commit to a target and date, and Cleo tracks your progress. Pages disagree on the tier. | Pro, $8.99 a month | [Read] [Flag] |
| Roundups | Rounds each purchase up to the next dollar and saves the difference. | Free | [Rule] [Flag] |
| Smart Save | Saves a weekly amount that Cleo sets from your spending, smaller when cash is tight. | Free | [Rule] [Flag] |
| Swear Jar | Saves a fixed amount each time you spend at merchants you pick. | Free | [Rule] [Flag] |
| Set and Forget | Moves a fixed amount you choose into Savings every week. | Free | [Rule] [Flag] |
| Payday Saver | Saves part of each paycheck on payday. It skips the transfer if the money is missing. | Free | [Rule] [Flag] |
| Challenges | Savings challenges target your problem spending. The exact mechanics are not stated. | Builder, $14.99 a month | [Read] |
| Regular check-ins | Cleo sends accountability reminders about your saving. | Builder, $14.99 a month | [Read] |
| Debt Save | Named on the home page under "Say yes to saving more". Details are not stated. | Not stated | [Read] |
| Old Cleo Wallet | The earlier wallet is retired. Users can only move money out. | Discontinued | [Ask] [Flag] |

### Investing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Smart Investing | A managed portfolio of ETFs run by Atomic Invest. You do not pick investments. | Free, with a 0.99% yearly fee | [Rule] [Flag] |
| Advisory fee by plan | The yearly fee falls to 0.75% on Plus, 0.45% on Pro and 0.25% on Builder. | 0.25% to 0.99% a year | [Read] [Flag] |
| Risk questionnaire | You answer goal and risk questions and get a Cautious, Balanced or Ambitious portfolio. | Free | [Ask] [Flag] |
| Account opening | You apply in Wealth with your SSN and job details. You must be a US citizen. | Free | [Ask] [Flag] |
| Switch portfolio | You can change portfolio in Wealth. It takes a few business days. | Free | [Ask] [Flag] |
| Automatic rebalancing | Atomic buys and sells to bring your mix back to target. | Free | [Rule] [Flag] |
| Add money | You deposit from your bank. It usually arrives the same day. | Free | [Ask] [Flag] |
| Withdraw from investing | You sell part or all and withdraw. New deposits are held for 5 business days. | Free | [Ask] [Flag] |
| Activity | A section lists your investing deposits, withdrawals and trades. | Free | [Read] [Flag] |
| Tax documents | A 1099 for the prior tax year appears in the app. | Free | [Read] [Flag] |
| Close investing account | Closing the account sells all holdings. | Free | [Ask] [Flag] |
| SIPC protection | Atomic Brokerage holds assets with SIPC cover up to $500,000. | Free | [Read] [Flag] |

### Games and rewards

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Money IQ | A weekly 5-question quiz on finance trivia and your own spending, 15 seconds per question. | Free | [Read] |
| Money IQ tokens | Correct answers and finishing earn tokens. Each token is one entry in the weekly draw. | Free | [Read] |
| Money IQ prizes | A recent week offered one $4,000 prize and twenty $25 prizes as prepaid Visa cards. | Free | [Read] |
| Score sharing | Sharing your Money IQ score earns 10 extra entries. | Free | [Read] |
| Survey sweepstakes | Cleo runs occasional prize draws for users who answer surveys or give feedback. | Free | [Read] |

### Notifications

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Balance change alerts | Push messages tell you when your balance changes. | Free | [Read] |
| Offer messages | Push messages tell you about offers from Cleo. | Free | [Read] |
| Prize draw alerts | Push messages tell you when you can enter a cash prize draw. | Free | [Read] |
| Missed bill prompt | Cleo asks whether a transaction is a bill, or whether an expected bill was missed. | Free | [Read] |
| Advance arrival alert | You get a notification when your cash advance lands. | Plus, $5.99 a month | [Read] |
| Early pay alert | A notification or Spend banner tells you when you qualify for early pay. | Builder, $14.99 a month | [Read] |
| Payday Saver heads-up | Cleo warns you the day before a Payday Saver transfer. | Free | [Read] |
| Automatic transfer notice | You get a notice 5 days before each automatic card top-up. | Builder, $14.99 a month | [Read] |
| Failed payment notice | Cleo tells you when a subscription payment fails and retries it. | Plus, $5.99 a month | [Read] |
| Notification center | A bell icon in Spend and Ask Cleo keeps service messages, even with push off. | Free | [Read] |

### Security and support

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| No stored bank logins | Cleo says it never stores bank details and can only view transactions. | Free | [Read] |
| Encryption | Transaction history is encrypted and stripped of personal details. | Free | [Read] |
| Card passcode | A passcode is needed to view Cleo Card details. | Builder, $14.99 a month | [Read] |
| Deposit insurance | Card deposits are FDIC insured up to $250,000 through WebBank. | Builder, $14.99 a month | [Read] [Flag] |
| Delete account | You can delete your Cleo account. | Free | [Ask] |
| Personal data request | You can request a copy of your personal data. | Free | [Ask] |
| Email support | You can email team@meetcleo.com. One page says replies take up to 7 days. | Free | [Read] |
| In-app live chat | The home page says in-app live chat replies arrive within a few hours. | Free | [Read] |
| Priority support | Builder subscribers get priority support. | Builder, $14.99 a month | [Read] |
| In-app FAQs | Help articles are available inside the app. | Free | [Read] |
| Feature feedback form | A form lets you request features Cleo lacks. | Free | [Read] |

### Plans and billing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Plus | Adds cash advances up to $250, credit score insights and Debt Reset. | $5.99 a month or $44.99 a year | [Ask] |
| Pro | Adds voice, memory, credit coaching and a higher savings rate on top of Plus. | $8.99 a month | [Ask] |
| Builder | Adds the Cleo Card, early pay, advances up to $500 and priority support. | $14.99 a month | [Ask] |
| Unsubscribe | You cancel under profile, then Subscriptions, and get a confirmation email. | Free | [Ask] |
| Subscription refund | You get a refund if you cancel within 1 month and never requested an advance. | Free | [Ask] |
| Refer a friend | Your referral link sits under the profile icon in Ask Cleo. | Plus, $5.99 a month | [Read] |

### Business model and partners

- Cleo earns from monthly subscriptions at $5.99, $8.99 and $14.99, plus express advance fees of $4.49 to $14.99.
- It also earns Pay Later fees, a $2.50 ATM fee and up to 1.15% of invested assets paid by Atomic.
- Plaid links bank accounts. Thread Bank holds direct deposits and savings. WebBank issues the Cleo Card.
- The card reports to Experian, Equifax and TransUnion. Equifax supplies the score report. InDebted handles Pay Later collections.
- In March 2025 Cleo agreed to pay the FTC $17 million over advance amount, speed and cancellation claims. The order requires honest advance terms, clear consent and simple cancellation.
- On 8 October 2026 the FTC began sending more than $15.8 million to 2,124,796 customers. Cleo relaunched in the UK in 2026 with chat, budget, Pro and Early Income.

### What users say is missing or broken

- Advances shrink without warning, such as $300 falling to $30, said on Trustpilot in October 2026.
- Users must subscribe before seeing their advance amount, said in about a quarter of low-star store reviews studied by Unstar.
- Express fees stack on small or split advances on top of the subscription, said in Google Play reviews.
- Charges continue after cancelling and support feels like "all bots", said on Trustpilot in September 2026.
- No reminders, app lock, peer payments, tax help or shared budgets, said on Cleo's own "What can't Cleo do?" page and FinCompareLab.

### Sources

- [Cleo home](https://web.meetcleo.com/)
- [Plans and pricing](https://web.meetcleo.com/pricing)
- [Autopilot product page](https://web.meetcleo.com/autopilot)
- [Cleo Card product page](https://web.meetcleo.com/card)
- [About Cleo](https://web.meetcleo.com/company)
- [Introducing Autopilot blog](https://web.meetcleo.com/blog/introducing-autopilot)
- [Money IQ terms](https://web.meetcleo.com/page/money-iq)
- [Cleo Help Center](https://web.meetcleo.com/faqs/en/)
- [What is Autopilot?](https://web.meetcleo.com/faqs/en/articles/13727802-what-is-autopilot)
- [What do I get with a Cleo Plus subscription?](https://web.meetcleo.com/faqs/en/articles/11864428-what-do-i-get-with-a-cleo-plus-subscription)
- [What is Cleo Pro?](https://web.meetcleo.com/faqs/en/articles/11870304-what-is-cleo-pro)
- [What is Cleo Builder?](https://web.meetcleo.com/faqs/en/articles/11865770-what-is-cleo-builder)
- [Does Cleo offer annual subscription options?](https://web.meetcleo.com/faqs/en/articles/11864260-does-cleo-offer-annual-subscription-options)
- [How do I cancel Cleo Plus?](https://web.meetcleo.com/faqs/en/articles/3325860-how-do-i-cancel-cleo-plus)
- [How do referrals work?](https://web.meetcleo.com/faqs/en/articles/9293651-how-do-referrals-work)
- [What can't Cleo do?](https://web.meetcleo.com/faqs/en/articles/8124868-what-can-t-cleo-do)
- [How do I contact Cleo customer support?](https://web.meetcleo.com/faqs/en/articles/7913852-how-do-i-contact-cleo-customer-support)
- [How do I get fewer messages from Cleo?](https://web.meetcleo.com/faqs/en/articles/10365129-how-do-i-get-fewer-messages-from-cleo)
- [How do I request a cash advance?](https://web.meetcleo.com/faqs/en/articles/6044440-how-do-i-request-a-cash-advance)
- [What's a cash advance boost?](https://web.meetcleo.com/faqs/en/articles/9687624-what-s-a-cash-advance-boost-and-how-do-i-request-one)
- [How do cash advance boosts work?](https://web.meetcleo.com/faqs/en/articles/9657613-how-do-cash-advance-boosts-work)
- [Why am I not eligible for a cash advance?](https://web.meetcleo.com/faqs/en/articles/6044453-why-am-i-not-eligible-for-a-cash-advance)
- [What's the cool-off period?](https://web.meetcleo.com/faqs/en/articles/6044541-what-s-the-cool-off-period)
- [How do I repay my cash advance?](https://web.meetcleo.com/faqs/en/articles/6044525-how-do-i-repay-my-cash-advance)
- [How do I extend my repayment date?](https://web.meetcleo.com/faqs/en/articles/6044534-how-do-i-extend-my-repayment-date)
- [Where in the US can I request a Cleo cash advance?](https://web.meetcleo.com/faqs/en/articles/8373678-where-in-the-us-can-i-request-a-cleo-cash-advance)
- [Pay Later FAQs](https://web.meetcleo.com/faqs/en/articles/14740006-pay-later-faqs)
- [Who can use Pay Later?](https://web.meetcleo.com/faqs/en/articles/14739966-who-can-use-pay-later)
- [How do I use my Cleo Card?](https://web.meetcleo.com/faqs/en/articles/5186819-how-do-i-use-my-cleo-card)
- [How do I manage my Cleo Card?](https://web.meetcleo.com/faqs/en/articles/5186832-how-do-i-manage-my-cleo-card)
- [How do I add cash to my Cleo Card?](https://web.meetcleo.com/faqs/en/articles/5186805-how-do-i-add-cash-to-my-cleo-card-s-available-credit-limit)
- [Can I use my Cleo Card at an ATM?](https://web.meetcleo.com/faqs/en/articles/8193488-can-i-use-my-cleo-card-at-an-atm)
- [Who is eligible for a Cleo Card?](https://web.meetcleo.com/faqs/en/articles/4925857-who-is-eligible-for-a-cleo-card)
- [How does the Cleo Card affect my credit score?](https://web.meetcleo.com/faqs/en/articles/11534336-how-does-the-cleo-card-affect-my-credit-score)
- [What does the Cleo Card report on?](https://web.meetcleo.com/faqs/en/articles/11534356-what-does-the-cleo-card-report-on)
- [What are automatic transfers?](https://web.meetcleo.com/faqs/en/articles/9235741-what-are-automatic-transfers)
- [Direct Deposit FAQ](https://web.meetcleo.com/faqs/en/articles/7828248-direct-deposit-faq)
- [What is Cleo Savings?](https://web.meetcleo.com/faqs/en/articles/14668299-what-is-cleo-savings)
- [How do I use Cleo Savings?](https://web.meetcleo.com/faqs/en/articles/14668323-how-do-i-use-cleo-savings)
- [How do Save Hacks work?](https://web.meetcleo.com/faqs/en/articles/9966197-how-do-save-hacks-work)
- [How does Smart Investing work?](https://web.meetcleo.com/faqs/en/articles/17121312-how-does-smart-investing-work)
- [What are the fees for Smart Investing?](https://web.meetcleo.com/faqs/en/articles/17121244-what-are-the-fees-for-smart-investing)
- [What types of investing accounts does Cleo offer?](https://web.meetcleo.com/faqs/en/articles/17121066-what-types-of-investing-accounts-does-cleo-offer)
- [How are my funds and investments protected?](https://web.meetcleo.com/faqs/en/articles/17121003-how-are-my-funds-and-investments-protected)
- [How do I open a Smart Investing account?](https://web.meetcleo.com/faqs/en/articles/17121007-how-do-i-open-a-smart-investing-account)
- [How do I add money to Smart Investing?](https://web.meetcleo.com/faqs/en/articles/17121297-how-do-i-add-money-to-smart-investing)
- [How do I withdraw money from Smart Investing?](https://web.meetcleo.com/faqs/en/articles/17121290-how-do-i-withdraw-money-from-smart-investing)
- [Money IQ help article](https://web.meetcleo.com/faqs/en/articles/11778095-money-iq)
- [Where has Budget gone?](https://web.meetcleo.com/faqs/en/articles/13742091-where-has-budget-gone)
- [How do I manage bills in Cleo?](https://web.meetcleo.com/faqs/en/articles/2164002-how-do-i-manage-bills-in-cleo)
- [How do I add or change transaction categories?](https://web.meetcleo.com/faqs/en/articles/385400-how-do-i-add-or-change-transaction-categories)
- [Joint bank account article](https://web.meetcleo.com/faqs/en/articles/1373454-i-have-a-joint-bank-account-can-i-split-transactions-in-cleo)
- [What's Debt Reset, and how does it work?](https://web.meetcleo.com/faqs/en/articles/11813673-what-s-debt-reset-and-how-does-it-work)
- [How does Debt Reset help with debt payments?](https://web.meetcleo.com/faqs/en/articles/11813796-how-does-debt-reset-help-with-debt-payments-interest-clearing-debt)
- [What banks does Cleo support?](https://web.meetcleo.com/faqs/en/articles/5488385-what-banks-does-cleo-support)
- [How do I manage my bank accounts in Cleo?](https://web.meetcleo.com/faqs/en/articles/9104662-how-do-i-manage-my-bank-accounts-in-cleo)
- [How secure is Cleo?](https://web.meetcleo.com/faqs/en/articles/73848-how-secure-is-cleo)
- [What's available for Cleo customers in the UK?](https://web.meetcleo.com/faqs/en/articles/12992410-what-s-available-for-cleo-customers-in-the-uk)
- [What is Early Income?](https://web.meetcleo.com/faqs/en/articles/15377219-what-is-early-income)
- [Cleo AI on Google Play](https://play.google.com/store/apps/details?id=com.meetcleo.cleo&hl=en_US&gl=US)
- [FTC: Cleo AI agrees to pay $17 million](https://www.ftc.gov/node/87670)
- [FTC returns more than $15.8 million to Cleo AI consumers](https://ftc.gov/news-events/news/press-releases/2026/10/ftc-returns-more-158-million-consumers-misled-cash-advance-app-company-cleo-ai)
- [Hunton: FTC reaches $17 million settlement with Cleo AI](https://www.hunton.com/privacy-and-cybersecurity-law-blog/ftc-reaches-17-million-settlement-with-cash-advance-company-cleo-ai)
- [PR Newswire: Cleo launches Autopilot](https://www.prnewswire.com/news-releases/cleo-launches-autopilot-automating-your-money-moves-302679691.html)
- [TNW: Cleo launches AI money coach](https://thenextweb.com/news/cleo-launches-ai-money-coach-fix-spending-habits)
- [IT Brief UK: Cleo relaunches UK AI money app](https://itbrief.co.uk/story/cleo-relaunches-uk-ai-money-app-to-ease-cash-anxiety)
- [Trustpilot: Cleo reviews](https://www.trustpilot.com/review/meetcleo.com)
- [Unstar: Is Cleo legit, app reviews 2026](https://unstar.app/blog/is-cleo-legit-does-it-give-cash-advance-app-reviews-2026)
- [FinCompareLab: Cleo review 2026](https://www.fincomparelab.com/reviews/cleo-review/)


## What all five share, and what only one has

All five track and budget, but only Rocket Money and Cleo act with real money, and none covers all of Upmore's planned actions.

### At a glance

| App | Features listed | Price | Moves money or acts for the user? | Has an AI agent or assistant? |
| --- | --- | --- | --- | --- |
| Rocket Money | 132 | Free tier; Premium $7 to $14 a month; Premium+ $15 a month | Yes. Cancels subscriptions, negotiates bills, requests refunds, moves savings. | Yes. Rowan, a text agent on Premium+ that asks before money actions. |
| Monarch | 330 | Core $14.99 a month or $99.99 a year; Plus $199 a year | No. Read-only access; it cannot move money. | Yes. AI Assistant chat, AI Insights and Weekly Recap; answers only. |
| Copilot Money | 311 | $13 a month or $95 a year; no free tier | No money movement appears in its file. | Yes, in beta on a waitlist. Edits app data after approval. |
| YNAB | 242 | $14.99 a month or $109 a year; 34-day trial | No. Move Money only shifts amounts between budget categories. | No in-app assistant found. Its ChatGPT app cannot see your plan. |
| Cleo | 156 | Free; Plus $5.99, Pro $8.99, Builder $14.99 a month | Yes. Savings transfers, cash advances, a credit card and managed investing. | Yes. Ask Cleo chat; Autopilot (waitlist) suggests actions you approve. |

### Table stakes: all five have these

- Bank account linking through Plaid, with more than one account allowed.
- A way to hide, unlink or remove a linked account.
- One feed of transactions across linked accounts.
- Transaction categories that the user can change by hand.
- A list of recurring or scheduled bills with upcoming amounts.
- A way to mark a transaction as a bill or recurring item by hand.
- A monthly budget or a left-to-spend number.
- Income counted next to spending.
- Savings goals or targets with progress tracking.
- Debt balances shown inside the app.
- Push alerts about transactions, balances or bills.
- An iPhone app for US users.
- A paid subscription as a main source of revenue.
- Email support.

### Only one app has it

| App | Feature | Why it matters for Upmore |
| --- | --- | --- |
| Rocket Money | Subscription Cancellation Assistant: an agent cancels for you in 2 to 10 business days | The only live cancellation service in the five. It is the direct rival to beat. |
| Rocket Money | Bill negotiation by human negotiators, live today | Cleo only plans this. Rocket Money sets the user's expectation on fees and results. |
| Rocket Money | Refund requests: Rowan contacts companies about late deliveries or bad service | The only refund claiming in the five. Upmore's refund feature starts level, not ahead. |
| Rocket Money | Trial tracking from connected Gmail, with a reminder before the charge | Shows email access finds subscriptions that bank data misses. |
| Rocket Money | Rowan runs as a text thread over RCS, with no separate app | Proves an agent can live where the user already reads messages. |
| Monarch | Forecasting with life events and saved what-if scenarios | The deepest planning tool in the five. It carries many flags, so copy it late. |
| Monarch | Receipt scanning and email forwarding, with line items matched to transactions | Item-level data could help Upmore spot refunds and split bills. |
| Monarch | Bill Sync: statement balance, minimum payment and due date for cards and loans | Paying bills needs due dates and amounts first. This feature is flagged. |
| Monarch | Access for financial professionals, with a separate adviser portal | A second sales channel that none of the other four use. |
| Monarch | Business Tracking with a profit and loss report and Schedule C export | Serves users with side income. The tax export is flagged. |
| Copilot Money | Venmo import by forwarding receipt emails | Venmo shows shared costs, which is useful for bill splitting. |
| Copilot Money | Native Mac app with keyboard shortcuts | The other four offer no native desktop app. |
| Copilot Money | Test drive with sample data before linking any account | Lets a new user see value before trusting the app with a bank login. |
| Copilot Money | Idle cash guidance from the assistant (beta) | The closest any tracker comes to investing advice. It is flagged. |
| YNAB | Zero-based method: every dollar gets a job through Ready to Assign | A loyal user base follows this method. Upmore need not copy it to compete. |
| YNAB | Public API with write access, plus OAuth apps and client libraries | An agent could work on top of a user's data through an API like this. |
| YNAB | Reconcile: confirm the bank's cleared balance and lock cleared transactions | A trust check. Users who approve actions will want proof that numbers match. |
| YNAB | Free year for college students with proof of enrollment | A low-cost way to win young users early. |
| YNAB | Siri and iOS Shortcuts actions for transactions and balances | Voice and shortcut entry points an approval agent could reuse. |
| Cleo | Smart Investing: a managed ETF portfolio run by Atomic Invest | The only app of the five that invests money. Every row is flagged. |
| Cleo | Cash advance of $20 to $250, or up to $500 on Builder | Drives Cleo's revenue and its FTC trouble. Upmore does not plan this. |
| Cleo | Cleo Card: a secured credit builder card that reports to three bureaus | Shows the bank partners needed once an app holds user money. |
| Cleo | Voice: a real-time spoken conversation with the AI | The only voice agent in the five. |
| Cleo | Roast Me and Hype chat modes | Personality is Cleo's hook. Upmore needs its own reason to open the app. |

### Gaps none of the five fill

- Joining or signing up for a subscription for the user. No file shows any app doing it.
- Paying the user's bills to outside companies. Monarch is read-only and Cleo says it does not make debt payments.
- Splitting a bill with other people and collecting their share. Splits in these apps only sort one's own transactions.
- Claiming class action money. The words do not appear as a feature in any of the five files.
- Cancelling subscriptions billed through Apple, Google Play, Amazon, Roku or PayPal. Rocket Money cannot, and the other four do not cancel at all.
- Investing with approval for each move. Cleo's portfolio is managed for you, and the other four only track balances.
- One app that both cancels subscriptions and invests. Rocket Money does not invest, and Cleo does not cancel.

### Build order suggestion

1. Account linking through Plaid. All five have it and the basic link carries no flag.
2. Transaction feed, categories and rules. All five have the feed and categories, with no flags.
3. Recurring bill and subscription detection with an upcoming view. All five have a version, and plain detection is not flagged.
4. Budget, left-to-spend number and tracking-only goals. All five have them, and tracking carries no flag.
5. Alerts and unprompted reports. All five send alerts, and three send weekly summaries, with no flags.
6. AI chat that answers from the user's data and edits after approval. Four of five have it; YNAB does not.
7. Cancellation and refund requests. Only Rocket Money has them, but its file marks neither with a flag.
8. Money movement last. Savings transfers at Rocket Money and Cleo are all flagged, and Cleo's investing is flagged on every row.

## Sources and limits

Each app's sources are listed at the end of its own section. A separate checker re-opened official pages for 30 of the highest-stakes claims and confirmed all 30.

- **Monarch may be missing rows.** About 20 help pages were blocked by a rate limit.
- **Rocket Money's Premium price varies.** Its site says $7 to $14 a month; the App Store lists $2.99 to $11.99.
- **Cleo's own pages disagree** on the savings rate, the Builder annual plan, and which tier includes savings goals.
- **Reddit was blocked for every app.**
- **Prices and rates are as of October 11, 2026** and change often.
