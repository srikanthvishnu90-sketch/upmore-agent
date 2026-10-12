# Upmore Feature Teardown 1: Investing and Copy Trading

October 11, 2026

## How to read this

This is every feature five investing apps offer, one row per feature, so Upmore can build each one as its own spec. The budgeting apps are in Teardown 2.

Every bullet below explains one column of the feature tables.

- **Feature** is the app's own name for it where it has one.
- **What it does** is what the user sees and gets, with limits and numbers.
- **Plan** is the tier the feature sits in: free, or the paid tier and its price.
- **Upmore** is the permission tag the feature would carry in Upmore's capability list: [Read] looks and reports, [Ask] acts after one approval, [Rule] repeats an action the user approved in advance, [Flag] is regulated and needs a licensed partner or a lawyer first.

A feature is listed only if the app's own site, help center, app listing or filings confirm it. Anything taken from a review instead is marked "reported".

Robinhood, Public and Coinbase are left out on purpose. They are platforms Upmore connects to, so their features are rails to use, not features to rebuild. Origin and Albert take their place.

## dub

dub is a US copy-trading app for copying whole stock and ETF portfolios from investors, vetted creators, and politician and hedge fund trackers. Membership costs $9.99 a month or $89.99 a year after a 7-day trial, and Premium portfolios add about 0% to 2.5% yearly. It uses an SEC-registered adviser, a FINRA broker-dealer and Apex Clearing, on iOS and Android only.

### Onboarding and account

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Account sign-up | Creates a login with an email and a password in the mobile app. | Free | [Ask] |
| 7-day free trial | Starts the membership free for 7 days, then bills monthly or yearly. | dub Premium, $9.99/mo or $89.99/yr | [Rule] |
| Brokerage application | Collects name, address, birth date, SSN and regulatory answers to open a brokerage account. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Individual cash account | Opens one individual cash brokerage account per person, with no margin, joint, trust, custodial or IRA option. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Eligibility rules | Accepts US citizens and permanent residents aged 18 or over with an SSN and a US address. | Free | [Read] |
| Setup questions | Asks net worth, income, goal, time horizon, experience, risk tolerance and comfort with losses. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Check Application Status | Shows whether the account is open or pending, usually within a few minutes. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Extra verification | Emails a list of documents within 24 hours when an application is pending. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |

### Funding and withdrawals

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Bank linking with Plaid | Links a bank account through Plaid for deposits and withdrawals. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Deposit | Pulls money by ACH, from $100 up to $50,000 per deposit and per day. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Instant Buying Power | Makes up to $1,000 of a new deposit investable at once, with the rest next business day. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Wire deposit | Offers a wire transfer as another route for planned deposits of $50,000 or more. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Buying Power breakdown | Shows available and pending funds when you tap Buying Power on the home screen. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Canceling Pending Deposits | Lets you cancel a deposit that is still pending; details were not confirmed. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Withdraw | Sends settled cash to your bank, up to $50,000 a day, arriving in 3 to 5 business days. | Free | [Ask] [Flag] |
| Withdrawable Cash | Shows cash that has cleared the 5-business-day deposit hold and T+1 sale settlement. | Free | [Read] |
| ACH Return Fee | Charges $30 each time a deposit fails or is reversed. | $30 per event | [Rule] [Flag] |

### Cash and dividends

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| FDIC-Insured Sweep Program | Moves idle cash into FDIC-insured partner banks through Apex; no interest rate is stated. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Sweep opt-out | Lets you leave the sweep program by emailing support. | Free | [Ask] [Flag] |
| Cash dividends | Pays every dividend as cash into buying power and never reinvests it. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |

### Portfolio discovery

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Discover tab | Lists portfolios to copy, with a switch between Core and Premium. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Core portfolios | Shows portfolios made by other users, which carry no fee beyond the membership. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Premium portfolios | Shows strategies managed by dub Advisors, each with a risk score and full disclosures. | dub Premium, $9.99/mo or $89.99/yr | [Read] [Flag] |
| Top Market Beaters | Shows a Discover row of portfolios that have beaten the VTI fund. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Popular Creators | Shows a curated Discover row of creators; the selection rule is not stated. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Portfolios with Motion | Shows a curated Discover row; the selection rule is not stated. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Creator Spotlight | Shows a curated Discover row of featured creators; the selection rule is not stated. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Skin in the Game | Shows a curated Discover row; the selection rule is not stated. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Search | Finds portfolios by name, ticker, creator handle or a stock they hold. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Portfolio detail page | Shows holdings, weights, performance history and creator details for one portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Creator profile | Shows a creator's image, bio and portfolios; Premium creators add work history, credentials and an FAQ. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Watchlist | Saves portfolios to a list shown on the Home tab. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Politician trackers | Offers portfolios that follow public trade disclosures of named politicians, with up to 45 days of lag. | dub Premium plus 0% to 2.5% yearly fee | [Read] [Flag] |
| Hedge fund trackers | Offers portfolios built from 13F filings of well-known investors, with up to 45 days of lag. | dub Premium plus 0% to 2.5% yearly fee | [Read] [Flag] |
| Thematic and sector portfolios | Offers dub Advisors portfolios for themes and 11 market sectors. | dub Premium plus 0% to 2.5% yearly fee | [Read] [Flag] |
| Flagship portfolios | Offers dub Advisors mixes such as Savings Flagship, Classic 60/40 and Growth Flagship. | dub Premium plus 0% to 2.5% yearly fee | [Read] [Flag] |
| Discoverability rules | Hides portfolios from Discover unless they meet six tests, such as beating VTI and staying under 60% per stock. | dub Premium, $9.99/mo or $89.99/yr | [Read] |

### Leaderboard

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Leaderboard Returns tab | Ranks public portfolios by time-weighted return before fees. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Leaderboard Copies tab | Ranks public portfolios by how many users copy them now. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Leaderboard Capital tab | Ranks public portfolios by total dollars copying them, including the creator's money. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Core and Premium selector | Switches the Leaderboard between Core and Premium portfolios. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Time period filter | Changes the ranking window to Today, 1M, 3M, 6M, YTD or All-Time. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| New indicator | Marks portfolios that have just joined the Leaderboard. | dub Premium, $9.99/mo or $89.99/yr | [Read] |

### Copy trading

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Invest | Copies a portfolio with a dollar amount, split across its holdings by weight. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Portfolio minimum | Shows the smallest amount you can invest, which depends on holdings and weights. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Fractional shares | Buys part shares so small amounts can match every weight in a portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Auto-Copy | Mirrors every later trade the creator makes into your account until you turn it off. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Basket trade rebalancing | Trades the creator and all copiers together so everyone gets the same price. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Rebalance lock | Blocks changes to your copy while a rebalance runs, usually for a few minutes. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Copy more | Adds more money to a portfolio you already copy at any time. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Sell or Liquidate | Sells all or a chosen dollar part of a copied portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Stop copy | Stops new mirrored trades and leaves your current holdings in place. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Creator liquidation | Sells your copy automatically when the creator liquidates the portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Three-month check-in | Asks you every three months to confirm you still want to copy. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Recurring Investments | Pulls money by ACH weekly, every two weeks or monthly and invests it in one portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Recurring minimum | Sets each recurring amount at $100 or the portfolio minimum plus 20%, whichever is higher. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Cancel recurring schedule | Removes a recurring investment with the X button on the portfolio page. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Single Stock Restrictions | Keeps named stocks out of all your copies and holds their share as cash. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| After-hours order queue | Holds orders placed outside 9:30 AM to 4:00 PM ET as Pending until the next open. | dub Premium, $9.99/mo or $89.99/yr | [Rule] [Flag] |
| Cancel Order | Cancels a pending order from the Activity list before it runs. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Capacity limit | Closes a user-made portfolio to new money once copiers hold $15 million in total. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Managed by dub Advisors | Has dub Advisors review each creator change and adjust or block trades before they run. | dub Premium plus 0% to 2.5% yearly fee | [Rule] [Flag] |
| High-risk acknowledgement | Checks a Premium strategy against your profile and may ask you to accept the risk first. | dub Premium plus 0% to 2.5% yearly fee | [Ask] [Flag] |
| Supported securities | Trades US-listed stocks, ETFs and many ADRs, with no options, crypto, bonds or OTC stocks. | dub Premium, $9.99/mo or $89.99/yr | [Read] |

### Creating portfolios

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Create portfolio | Builds your own portfolio from stocks and ETFs with weights that total 100%. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Portfolio name and description | Sets a name and a short description of the strategy. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Portfolio ticker | Sets a unique ticker of 7 to 11 characters for the portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Rebalance | Changes the weights of your own portfolio during market hours; holdings cannot be added or removed. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Rebalance notes | Lets creators attach a written reason to a portfolio change for copiers to read. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Visibility switch | Sets a portfolio to Public so others can copy it, or back to Private. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Public requirements | Needs $1,000 of your own deposits, 30 days of history, a photo, and a full bio and description. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Share portfolio | Lets you share your portfolio with other people. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |

### Creator program

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Premium Creator application | Lets you apply in the app or on the web to license your strategy to dub Advisors. | dub Premium, $9.99/mo or $89.99/yr | [Ask] [Flag] |
| Premium Creator requirements | Needs $10,000 invested, 3 months of history, a 2% lead on the S&P 500 and no 10% drawdown. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Creator revenue share | Pays approved creators from management fees on their portfolios; the split is not stated. | Free for approved creators | [Rule] [Flag] |
| Gold verification checkmark | Shows a gold badge on approved Premium Creators. | Free for approved creators | [Read] |
| Featured placements | Promotes Premium Creator content across the app. | Free for approved creators | [Read] |
| Enhanced creator profile | Adds work history, credentials and a creator-written FAQ to the public profile. | Free for approved creators | [Ask] |
| Creator priority support | Gives Premium Creators a dedicated service contact at dub Advisors. | Free for approved creators | [Read] |

### Performance and risk metrics

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Capital | Shows the total money all copiers have invested in a portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Copier count | Shows how many users copy a portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Activity | Rates rebalance frequency over 3 months as Low, Medium or High. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Alpha Score | Scores returns from 1 to 5 after removing market and sector effects. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Risk Score | Rates Premium portfolios from 1 Conservative to 5 Speculative, set by dub's investment team. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Volatility | Labels daily swings over the past year as Low, Medium or High against the market. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Market Sensitivity | Shows one-year beta in five bands from Very Low to Very High. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Biggest Loss | Shows the largest drop from peak to trough and how long recovery took. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Cash Income | Shows the projected dividend yield for the next year. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Portfolio Index Value | Charts each portfolio from a starting value of 100 for easy comparison. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Portfolio return | Shows time-weighted return for each portfolio. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Account return | Shows money-weighted return for your whole account, excluding dividends. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Home dashboard | Shows each active copy with daily and total performance. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Fee Impact Calculator | Compares returns before and after a Premium portfolio's fee for an amount and period you pick. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Management Fees history | Lists the management fees you have paid under Account Settings. | dub Premium, $9.99/mo or $89.99/yr | [Read] |

### Notifications and reports

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Notification Center Transactions | Lists deposits, rebalances, trades and other account activity. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Notification Center Feed | Lists likes and comments on your posts and activity. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Push notification settings | Turns each type of push notification on or off. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Rebalance notifications | Alerts you when a portfolio you copy is changed or liquidated. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Home recent activity | Shows recent activity on portfolios you copy, created or watch; added October 2026. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Monthly statements | Posts a statement within 5 business days of each month end. | Free | [Read] |
| Trade confirmations | Posts a confirmation the business day after each trade. | Free | [Read] |
| Reports section | Holds statements, tax forms and confirmations under Settings for at least 7 years. | Free | [Read] |
| Web document portal | Lets open and closed accounts download documents at web.dubapp.com. | Free | [Read] |
| Paper delivery | Mails paper documents for $5 per statement and $2 per confirmation. | $2 to $5 per document | [Rule] |

### Tax documents

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| 1099 tax forms | Provides Forms 1099-B, 1099-DIV, 1099-INT and 1099-MISC, usually by mid-February. | Free | [Read] [Flag] |
| Historical tax documents | Keeps past years' tax forms in Reports for amended returns. | Free | [Read] [Flag] |

### Social features

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Activity tab | Shows trades, rebalances and posts from creators and portfolios you follow. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Creator posts | Lets creators publish updates with a link preview, or up to 2 images for Premium Creators. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Like | Lets members like a post with the heart icon. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Comment | Lets members write comments that other viewers of the post can see. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Share | Lets members share a post with the arrow icon. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| News posts | Shows company news from Polygon with portfolios that hold the stock. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| dub team videos | Shows video posts made only by the dub team. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Community Guidelines | Sets posting rules that all user content must follow. | Free | [Read] |
| Product Council | Invites selected users to test unreleased features and give feedback, without pay. | Invitation only | [Ask] |

### AI features

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Portfolio Summary chip | Writes a short AI summary of a portfolio's holdings and past performance. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Personalized Insights chip | Compares a portfolio's facts with your setup answers, without giving a fit score. | dub Premium, $9.99/mo or $89.99/yr | [Read] [Flag] |
| Arlo | Explains portfolios and market events and finds portfolios from plain requests; it does not trade. | dub Premium, $9.99/mo or $89.99/yr | [Read] [Flag] |
| AI-driven portfolios | Lists ChatGPT AI, Claude AI and Gemini AI portfolios; current status was not confirmed. | dub Premium plus 0% to 2.5% yearly fee | [Read] [Flag] |

### Education

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Educational content | Includes learning content in the membership; the format is not stated. | dub Premium, $9.99/mo or $89.99/yr | [Read] |
| Blog | Publishes guides on copy trading, politician trades and hedge fund tracking on the website. | Free | [Read] |
| Help Center | Offers searchable articles on accounts, transfers, investing, fees and tax documents. | Free | [Read] |

### Membership and fees

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| dub Premium membership | Unlocks every in-app feature; nothing works without it after you apply. | $9.99/mo or $89.99/yr | [Rule] |
| Premium portfolio management fee | Charges a yearly percentage on money in a Premium portfolio, taken quarterly from the account. | About 0% to 2.5% a year | [Rule] [Flag] |
| Premium Creator Subscriptions | Charges a quarterly or yearly fee to copy one Premium Creator, generally $25 to $500 per Premium portfolio (June 2026 Form CRS; period not stated). | Generally $25 to $500 per Premium portfolio | [Rule] [Flag] |
| Founder's Access | Gives early members all Premium and Core creators with no per-creator fees; closed to new users. | $9.99/mo or $89.99/yr, legacy | [Rule] |
| Change Plan | Switches a subscription between billing periods from the next cycle. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Cancel Subscription | Ends renewal while keeping access until the period ends; copies then stop syncing. | Free | [Ask] |
| Resubscribe | Restarts a lapsed membership from Settings. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Refund request | Refunds a first purchase within 14 days if you have copied no portfolio. | Free | [Ask] |
| Commission-free trading | Charges no commission, withdrawal fee or inactivity fee on stock and ETF trades. | Free | [Read] |
| Regulatory fees on sells | Passes on small SEC and FINRA fees when you sell shares. | Per fee schedule | [Rule] [Flag] |

### Security

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Two-factor sign-in | Sends a one-time code to your phone at sign-up and at every sign-in. | Free | [Rule] |
| Encryption | Encrypts stored data and data in transit, with a second layer for passwords and SSNs. | Free | [Read] |
| SIPC protection | Covers securities up to $500,000, including $250,000 of cash, through the broker-dealer. | Free | [Read] |
| Trusted Contact | Stores a person dub may contact if it cannot reach you or suspects fraud. | Free | [Ask] |

### Account settings and support

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Profile information | Lets you edit your profile image and bio, which creators need to go public. | dub Premium, $9.99/mo or $89.99/yr | [Ask] |
| Contact details update | Lets you update email, phone and address on the account. | Free | [Ask] |
| Legal name change | Lets you change the legal name on the account through a set process. | Free | [Ask] |
| Suitability update | Lets you change your setup answers in Account settings when your situation changes. | Free | [Ask] [Flag] |
| Close Account | Closes the account in 1 to 2 business days once holdings are sold and cash is withdrawn. | Free | [Ask] [Flag] |
| Reopen closed account | Lets a closed account be reopened later. | Not stated | [Ask] [Flag] |
| Submit a request | Sends a support ticket through a web form. | Free | [Ask] |
| Email support | Answers questions at the support and advisory email addresses. | Free | [Ask] |

### Business model and licensing

- dub earns mainly from the required membership, at $9.99 a month or $89.99 a year.
- dub Advisors also charges a yearly fee on Premium portfolios, generally 0% to 2.5%. Its fee table lists 0.25% to 4%.
- This fee model applies to users who joined on or after June 11, 2026. Creators receive a share that dub does not publish.
- DASTA Inc. owns the app. dub Advisors, LLC is an SEC-registered investment adviser, listed under firm number 315589.
- DASTA Financial, LLC, also called dub Financial, is an SEC-registered broker-dealer and a FINRA and SIPC member.
- Apex Clearing Corporation provides clearing and custody. Plaid links banks, and Polygon supplies news.

### What users say is missing or broken

- Withdrawals failed or stayed blocked for weeks, and support did not reply (Trustpilot reviews, March to July 2026; only six reviews).
- One user was charged $89.99 after the trial and found the cancel option hard to find (Trustpilot, June 2026).
- Tracker portfolios rely on filings that are up to 45 days old, which one reviewer called misleading (App Store review, 2024).
- The app lacks tools to choose traders and manage risk, and return figures confused users after deposits (App Store reviews, 2024 and 2025).
- dub's own help center confirms no IRAs, joint accounts, ACATS transfers, web app, options, crypto, beneficiaries or dividend reinvestment.

### Sources

- [dub homepage](https://www.dubapp.com/)
- [dub creators page](https://www.dubapp.com/creators)
- [dub press room](https://www.dubapp.com/pressroom)
- [dub blog index](https://www.dubapp.com/blog)
- [How to get started with dub: a complete tutorial](https://www.dubapp.com/blog/how-to-get-started-with-dub)
- [Why is dub the best investing platform for retail investors in 2026](https://www.dubapp.com/blog/best-investing-app)
- [7 best AI investing apps for 2026](https://www.dubapp.com/blog/best-ai-investing-apps)
- [How is AI being used in investing apps right now?](https://www.dubapp.com/blog/guide-to-ai-inveating-apps)
- [What Is Real-Time Copy Trading?](https://www.dubapp.com/blog/real-time-copy-trading)
- [How to Track and Copy Congress's Trades](https://www.dubapp.com/blog/how-to-copy-congress-stock-trades)
- [dub Alternatives](https://www.dubapp.com/blog/dub-alternatives)
- [dub Help Center](https://support.dubapp.com/hc/en-us)
- [dub FAQs](https://support.dubapp.com/hc/en-us/articles/36689892864283-dub-FAQs)
- [dub's Membership Subscription: Complete Guide](https://support.dubapp.com/hc/en-us/articles/50102557380507-dub-s-Membership-Subscription-Complete-Guide)
- [dub Memberships: Cancelation Policy](https://support.dubapp.com/hc/en-us/articles/51827968774555-dub-Memberships-Cancelation-Policy)
- [Premium Creator Subscriptions: Complete Guide](https://support.dubapp.com/hc/en-us/articles/41850898309275-Premium-Creator-Subscriptions-Complete-Guide)
- [Founder's Access Subscriptions: Complete Guide](https://support.dubapp.com/hc/en-us/articles/33253253795099-Founder-s-Access-Subscriptions-Complete-Guide)
- [dub Advisors: Management Fees](https://support.dubapp.com/hc/en-us/articles/45456546526491-dub-Advisors-Management-Fees)
- [Platform and Regulated Services Fee Schedule](https://support.dubapp.com/hc/en-us/articles/23940902033819-Platform-and-Regulated-Services-Fee-Schedule)
- [How to Copy Portfolios on dub: Complete Guide](https://support.dubapp.com/hc/en-us/articles/35785614503067-How-to-Copy-Portfolios-on-dub-Complete-Guide)
- [Authorization for Auto-Copying Portfolios](https://support.dubapp.com/hc/en-us/articles/34725783429147-Authorization-for-Auto-Copying-Portfolios)
- [Creating and Managing Your Own Portfolio on dub](https://support.dubapp.com/hc/en-us/articles/35784594156443-Creating-and-Managing-Your-Own-Portfolio-on-dub)
- [Understanding Portfolio Types on dub](https://support.dubapp.com/hc/en-us/articles/35784105160731-Understanding-Portfolio-Types-on-dub)
- [User Portfolios: Responsibilities and Limitations](https://support.dubapp.com/hc/en-us/articles/35128508181659-User-Portfolios-Responsibilities-and-Limitations)
- [Understanding "Managed by dub Advisors" Portfolios](https://support.dubapp.com/hc/en-us/articles/41828356374427-Understanding-Managed-by-dub-Advisors-Portfolios)
- [Premium Portfolios on dub: Overview](https://support.dubapp.com/hc/en-us/articles/36497564050459-Premium-Portfolios-on-dub-Overview)
- [Recurring Investments](https://support.dubapp.com/hc/en-us/articles/30374068435995-Recurring-Investments)
- [Stock Restrictions on Copy Orders](https://support.dubapp.com/hc/en-us/articles/41447953878299-Stock-Restrictions-on-Copy-Orders)
- [Canceling Orders and Understanding Order Execution](https://support.dubapp.com/hc/en-us/articles/35786783773979-Canceling-Orders-and-Understanding-Order-Execution)
- [Understanding Capacity Limits on User-Created Portfolios](https://support.dubapp.com/hc/en-us/articles/40202443971099-Understanding-Capacity-Limits-on-User-Created-Portfolios)
- [Understanding Portfolio Metrics on dub](https://support.dubapp.com/hc/en-us/articles/47584265161499-Understanding-Portfolio-Metrics-on-dub)
- [Alpha Score Extended Methodology and Limitations](https://support.dubapp.com/hc/en-us/articles/45241507003675-Alpha-Score-Extended-Methodology-Limitations)
- [Performance Calculations on dub](https://support.dubapp.com/hc/en-us/articles/29995073697307-Performance-Calculations-on-dub)
- [Portfolio Index Value on dub](https://support.dubapp.com/hc/en-us/articles/28677711937819-Portfolio-Index-Value-on-dub)
- [Understanding the dub Leaderboard](https://support.dubapp.com/hc/en-us/articles/48361633496603-Understanding-the-dub-Leaderboard)
- [Activity Feed: Commenting and Engagement](https://support.dubapp.com/hc/en-us/articles/46899640935707-Activity-Feed-Commenting-Engagement)
- [About dub's AI Portfolio Chips](https://support.dubapp.com/hc/en-us/articles/49436955270683-About-dub-s-AI-Portfolio-Chips)
- [dub Advisors' Premium Creator Program](https://support.dubapp.com/hc/en-us/articles/36023144673691-dub-Advisors-Premium-Creator-Program)
- [DUB PRODUCT COUNCIL TERMS OF USE](https://support.dubapp.com/hc/en-us/articles/53160500807579-DUB-PRODUCT-COUNCIL-TERMS-OF-USE)
- [Deposits: Timelines and Limits on dub](https://support.dubapp.com/hc/en-us/articles/4416586260251-Deposits-Timelines-and-Limits-on-dub)
- [How to Initiate Deposits on dub](https://support.dubapp.com/hc/en-us/articles/35631873085851-How-to-Initiate-Deposits-on-dub)
- [Instant Buying Power on dub](https://support.dubapp.com/hc/en-us/articles/35659372542235-Instant-Buying-Power-on-dub)
- [Withdrawals: Timelines and Limits on dub](https://support.dubapp.com/hc/en-us/articles/35664797488155-Withdrawals-Timelines-and-Limits-on-dub)
- [Transferring Investments: Between Portfolios and Accounts](https://support.dubapp.com/hc/en-us/articles/35827910509723-Transferring-Investments-Between-Portfolios-and-Accounts)
- [Dividends on dub: Processing, Timeline, and Key Dates](https://support.dubapp.com/hc/en-us/articles/35828378729499-Dividends-on-dub-Processing-Timeline-and-Key-Dates)
- [APEX FDIC-Insured Sweep Program Consent Addendum](https://support.dubapp.com/hc/en-us/articles/17922240486171-dub-Financial-LLC-APEX-FDIC-Insured-Sweep-Program-Consent-Addendum)
- [Tax Documents](https://support.dubapp.com/hc/en-us/articles/35740403401115-Tax-Documents)
- [Accessing Account Statements and Trade Confirmations](https://support.dubapp.com/hc/en-us/articles/35740857724955-Accessing-Account-Statements-and-Trade-Confirmations)
- [Account Types Supported by dub](https://support.dubapp.com/hc/en-us/articles/35618804138395-Account-Types-Supported-by-dub)
- [Eligibility Requirements and Account Opening Timeline](https://support.dubapp.com/hc/en-us/articles/35548026115483-Eligibility-Requirements-and-Account-Opening-Timeline)
- [How dub Protects Your Personal Information and Data](https://support.dubapp.com/hc/en-us/articles/35627666117531-How-dub-Protects-Your-Personal-Information-and-Data)
- [Trusted Contacts and Beneficiaries](https://support.dubapp.com/hc/en-us/articles/35675203641755-Trusted-Contacts-Beneficiaries)
- [How to Close Your dub Account](https://support.dubapp.com/hc/en-us/articles/28643335152027-How-to-Close-Your-dub-Account)
- [dub Advisors, LLC Form ADV Part 2A page](https://support.dubapp.com/hc/en-us/articles/17916097165723-dub-Advisors-LLC-Form-ADV-Part-2A)
- [dub Disclosures category](https://support.dubapp.com/hc/en-us/categories/35587285267099-Disclosures)
- [dub on the Apple App Store](https://apps.apple.com/app/id1598920501)
- [dub on the Apple App Store, older listing text](https://apps.apple.com/us/app/dub-copy-trade-anyone/id1598920501)
- [Trustpilot reviews of dubapp.com](https://ca.trustpilot.com/review/www.dubapp.com)
- [TechCrunch: Dub, the copy trading app that has teens talking](https://techcrunch.com/2025/02/02/dub-the-copy-trading-app-that-has-teens-talking/)
- [Forbes: What Is Dub](https://www.forbes.com/sites/investor-hub/article/what-is-dub-trading-app/)


## Alinea

Alinea is an iPhone investing app for Gen Z beginners that pairs expert-built portfolios and themed "Playlists" with an AI chat called Allie. It costs $120 per year, with a $5 to $12 monthly option in some cases, and is United States only. Advice comes from Alinea Advisory Services LLC, an SEC-registered investment adviser, with DriveWealth LLC as broker and custodian.

Notes on reading the tables: "Membership" means the single $120 per year plan. No page I opened describes a free tier inside the app. "Reported" means the detail comes only from a third-party review. "Dated" means the source is older than 2026.

### Onboarding and accounts

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Onboarding questionnaire | Asks about income, goals, timeline and how you would react to a drop, then shapes the portfolios shown. | Membership, $120 per year | [Read] [Flag] |
| Identity verification | Checks your identity with personal details and a government ID before the brokerage account opens. | Membership, $120 per year | [Ask] [Flag] |
| Individual taxable brokerage account | Opens one cash brokerage account in your name at DriveWealth, with no account minimum. | Membership, $120 per year | [Ask] [Flag] |
| Managed account | Lets Alinea pick and trade your holdings without asking you before each trade. | Membership, $120 per year | [Rule] [Flag] |
| Self-directed account | Lets you choose and place your own trades instead of using a managed portfolio. | Membership, $120 per year | [Ask] [Flag] |
| Free trial | Reported: gives 7 days before the first $120 charge, after a payment screen. | Free for 7 days (reported) | [Ask] [Flag] |
| Eligibility rules | Limits sign-up to people aged 18 or over who live in the United States and hold a tax ID. | Not stated | [Read] |

### Funding and withdrawals

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Bank linking | Connects a personal or joint bank account in your name through Plaid; business accounts are refused. | Membership, $120 per year | [Ask] [Flag] |
| One-time deposit | Moves money from your bank once, from $1, and can take up to 4 business days to settle. | Membership, $120 per year | [Ask] [Flag] |
| Automated Investing | Invests an amount you pick on a weekly or monthly schedule until you change it. | Membership, $120 per year | [Rule] [Flag] |
| Suggested deposit amount | Proposes a recurring amount based on your income, which you can edit. Reported example: $250 every two weeks. | Membership, $120 per year | [Read] [Flag] |
| Withdrawal | Sends cash back to your bank, usually in 2 to 3 business days after processing starts. | Membership, $120 per year | [Ask] [Flag] |
| Cash reserve | Keeps 1.5% of a managed account in cash and sells holdings to top it up. | Membership, $120 per year | [Rule] [Flag] |
| Additional review | Holds a deposit or withdrawal for a security check and may ask for bank documents. | Membership, $120 per year | [Rule] [Flag] |

### AI assistant

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| AI Allie chat | Answers questions on markets, the Fed and investing in plain English, at any hour. It runs on OpenAI. | Membership, $120 per year | [Read] [Flag] |
| AI-powered insights | Explains your portfolio's performance and what it holds. The listing says this is education, not personal advice. | Membership, $120 per year | [Read] [Flag] |
| Stock questions | Lets you ask Allie about a single stock before you invest in it. | Membership, $120 per year | [Read] [Flag] |
| AI Allie Recaps | Named on the website only. The behaviour is not described on any page I opened. | Not stated | [Read] |
| Suggested questions | Reported: shows ready-made questions for Allie in each section of the app. | Membership, $120 per year (reported) | [Read] |
| Allie terms prompt | Asks you to tap "I Understand" to accept Allie's terms before use. | Membership, $120 per year | [Read] |
| No trading by Allie | Allie does not place trades, move money or control accounts, per its terms dated March 2026. | Membership, $120 per year | [Read] [Flag] |
| Dynamic portfolio adjustments | A May 2026 Alinea blog says Allie adjusts portfolios by itself. Allie's own terms contradict this, so treat it as unconfirmed. | Not stated | [Rule] [Flag] |

### Portfolios and playlists

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Expert-Built Portfolios | Gives you a portfolio built by Alinea's investment team from your goals and risk answers. | Membership, $120 per year | [Rule] [Flag] |
| Portfolio plans | Sorts you into one of four plans: conservative, moderate, aggressive growth or opportunistic. | Membership, $120 per year | [Read] [Flag] |
| Investing Playlists | Shows curated sets of stocks and ETFs grouped by theme, interest or values. | Membership, $120 per year | [Read] [Flag] |
| Invest in a playlist | Puts your money into every holding in a chosen playlist in one step. | Membership, $120 per year | [Ask] [Flag] |
| Build your own playlist | Lets you make a playlist from stocks and ETFs you choose. | Membership, $120 per year | [Read] |
| Edit a playlist | Reported: lets you change the holdings in a playlist you own. | Membership, $120 per year (reported) | [Read] |
| Share a playlist | Publishes your playlist so other members can see it. | Membership, $120 per year | [Ask] |
| Copy a playlist | Reported: lets you invest in another member's playlist or copy and change it. | Membership, $120 per year (reported) | [Ask] [Flag] |
| Favorite a playlist | Reported: saves a playlist to a favorites list. | Membership, $120 per year (reported) | [Read] |
| Discover tab | Reported: lists playlists from Alinea and other members to browse. | Membership, $120 per year (reported) | [Read] |
| Playlists Pro | Offers managed portfolios modeled on the moves of politicians, hedge funds, world events and AI. | Not stated | [Rule] [Flag] |
| Automatic rebalancing | Rebalances Playlists Pro portfolios without you doing anything. | Not stated | [Rule] [Flag] |
| Accept or reject recommendations | Lets you approve or decline each suggested trade when the account is not on full management. | Membership, $120 per year | [Ask] [Flag] |
| Investment restrictions | Lets you ask Alinea to avoid certain investment types in a managed account. | Membership, $120 per year | [Ask] [Flag] |

### Trading

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Stock and ETF trading | Lets you buy and sell US-listed stocks and ETFs with $0 commission. Regulatory fees may still apply. | Membership, $120 per year | [Ask] [Flag] |
| Fractional shares | Lets you buy part of a share by entering a dollar amount from $1. | Membership, $120 per year | [Ask] [Flag] |
| Ticker search | Finds a stock or ETF by its ticker or name. | Membership, $120 per year | [Read] |
| Stock Profiles | Shows a stock's price, recent change and a price chart. Reported: also stats and news. | Membership, $120 per year | [Read] |
| Market section | Reported: shows a market screen with stocks and ETFs to browse. | Membership, $120 per year (reported) | [Read] |
| Crypto | Gives access to more than 20 cryptocurrencies. The partner, coins and fees are not stated. | Not stated | [Ask] [Flag] |
| Event contracts | Lets you trade event contracts through Alinea Futures LLC. The markets and exchange are not stated. | $0.03 per contract, per side | [Ask] [Flag] |

### Performance and insights

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Daily Briefing | Sends a short daily summary of financial news tied to what you hold. | Membership, $120 per year | [Read] |
| Portfolio view | Reported: shows how your portfolio has performed and how much you have made. | Membership, $120 per year (reported) | [Read] |
| Potential Tracker | Projects how your investments could grow over time using assumptions you pick. Also called Investing Potential. | Membership, $120 per year | [Read] |
| Yearly Goals | Named on the website only. The behaviour is not described on any page I opened. | Not stated | [Read] |
| Growth Calculator | Website tool that compares bank savings with a 12% example return for your amounts and years. | Free | [Read] |
| Account statements | DriveWealth sends account statements at least once a quarter. | Membership, $120 per year | [Read] |
| Time Machine | Reported and dated 2024: shows how an investment would have grown from an earlier date. | Not stated | [Read] |

### Education

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Lessons | Offers short built-in lessons. Reported: one a day, read aloud by Allie. | Membership, $120 per year | [Read] |
| Lesson quizzes | Reported: ends each lesson with up to five questions you must pass to continue. | Membership, $120 per year (reported) | [Read] |
| Investing 101 blog | Publishes free beginner guides on the website. | Free | [Read] |

### Social and rewards

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Likes, comments and follows | Reported and dated 2024: lets you heart stocks, comment and follow other members. | Not stated | [Read] |
| Show your holdings | Reported and dated 2024: lets you display your holdings to other members. | Not stated | [Read] |
| Give $20, Get $20 | Credits $20 to you and a friend once they verify and deposit $20. The cap is 25 referrals. | Membership or trial required | [Ask] [Flag] |
| Fund and Win up to $1,000 | Gives referred new users one prize from $5 to $1,000 after a first $20 deposit held 30 days. | Membership or trial required | [Ask] [Flag] |
| Ambassadors | Listed in the website menu. The page would not open, so details are unknown. | Not stated | [Read] |

### Notifications

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Text messages | Sends recurring marketing, account and service texts. Reply STOP to opt out. | Free | [Rule] |
| Email updates | Sends marketing and account emails, with an opt-out. | Free | [Rule] |
| Progress notifications | Reported: sends alerts about how your investing is going. | Membership, $120 per year (reported) | [Rule] |

### Security and support

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Biometric login | Lets you unlock the app with Face ID. | Membership, $120 per year | [Read] |
| Passkey sign-in | Lets you sign in with a passkey instead of a password. | Membership, $120 per year | [Read] |
| Two-factor authentication | Asks for a second check when you sign in. | Membership, $120 per year | [Read] |
| Encryption | Protects data with SSL and 256-bit encryption. | Membership, $120 per year | [Read] |
| SIPC protection | Covers up to $500,000 per account, including $250,000 cash, if the broker fails. | Membership, $120 per year | [Read] [Flag] |
| Age Assurance | Uses in-app controls to keep the app to people aged 18 or over. | Free | [Read] |
| In-app support chat | Lets you message support inside the app. The Form ADV says there is no live chat. | Membership, $120 per year | [Read] |
| Email support | Handles help, cancellations and refunds by email. There is no phone support. | Free | [Read] |
| Human advisors | Marketed as available for bigger questions. The Form ADV says clients do not deal with advisory staff directly. | Not stated | [Read] [Flag] |

### Membership and billing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Annual membership | Charges $120 up front each year and renews by itself until you cancel. | $120 per year | [Rule] [Flag] |
| Monthly fee option | Offers some users a monthly charge instead of the annual one. | $5 to $12 per month | [Rule] [Flag] |
| Lifetime Plan | Takes one upfront payment with no later Alinea fees. It ends if you close the account. | Price not stated | [Ask] [Flag] |
| Fee collection | Takes the fee from your Alinea cash or bank, and may sell holdings to cover it. | All paid plans | [Rule] [Flag] |
| Cancel membership | Stops renewal when you contact support or email Alinea. Unused time is not refunded. | All paid plans | [Ask] |
| Close account | Lets you end the account and withdraw everything. The custodian may charge a fee. | All paid plans | [Ask] [Flag] |

### Platforms

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| iPhone app | Runs on iOS 18 or later in English. It is the only full app. | Free download | [Read] |
| Android waitlist | Collects your email for an Android invite. No Android app is public yet. | Free | [Ask] |
| Web sign-up | The website links to a web onboarding page. I could not open it to confirm what it does. | Not stated | [Ask] |

### Checked and not found

These rows are not features and are left out of the feature count.

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| IRA or other retirement account | Not offered. The Form ADV says Alinea does not advise IRA or tax-exempt investors. | Not offered | [Ask] [Flag] |
| High-yield cash account | No page I opened mentions one. Acorns reported in July 2026 that there is none. | Not offered | [Rule] [Flag] |
| Tax-loss harvesting | Not mentioned anywhere. The Form ADV says personal tax situations are not considered. | Not offered | [Rule] [Flag] |
| Account transfers in or out | Not mentioned on any page I opened, so this could not be confirmed. | Not stated | [Ask] [Flag] |
| Tax documents screen | Could not confirm. Only a 1099 for promotion prizes is mentioned. | Not stated | [Read] [Flag] |
| Copy investing of real people | Only the Playlists Pro models and member playlists exist. No live mirror of a named person was found. | Not offered | [Rule] [Flag] |

### Business model and licensing

- Alinea earns mainly from the flat membership fee of $120 per year, charged as a wrap fee that covers advice, trading and custody.
- It also takes $0.01 of the $0.03 per-contract fee on event contracts.
- Alinea Advisory Services LLC is an SEC-registered investment adviser, CRD 311782, owned by Alinea Invest, Inc.
- DriveWealth LLC, a FINRA and SIPC member, is the broker and custodian. Plaid links banks. OpenAI powers Allie.
- The adviser reported about $66.6 million in assets at the end of 2025 and says it takes no third-party payments.
- Growth is funded by a $22.5 million marketing credit line from PvX Partners and by paid social media creators.

### What users say is missing or broken

- Withdrawals get stuck under a "temporary lock" for a week or more (several Trustpilot reviews, September and October 2026).
- The $120 fee was not clear at sign-up and refunds are slow or refused (App Store review, November 2025, and Trustpilot).
- Returns trail the S&P 500, so the fee feels poor value on small balances (Trustpilot, October 2026, and The College Investor).
- You cannot move money between portfolios; switching strategy means withdrawing and reinvesting over about a week (Trustpilot, October 2026).
- There is no IRA, no Android or web app and no phone support (The College Investor, Acorns and Motley Fool).

### Sources

- [Alinea home page](https://www.alinea-invest.com/)
- [Alinea legal index](https://www.alinea-invest.com/legal/home)
- [What is Alinea Invest? (July 2026)](https://www.alinea-invest.com/press/what-is-alinea-invest)
- [How to Use an Investment App for Beginners (July 2026)](https://www.alinea-invest.com/press/how-to-use-an-investment-app-for-beginners-a-step-by-step-guide)
- [Can AI Actually Invest for You? (May 2026)](https://www.alinea-invest.com/press/can-ai-actually-invest-for-you-how-alineas-allie-acts-on-your-behalf)
- [How to Buy SpaceX Stock (June 2026)](https://www.alinea-invest.com/press/how-to-buy-spacex-stock-spcx-a-simple-guide-to-investing-in-big-ipos)
- [Alinea press and blog index](https://www.alinea-invest.com/press)
- [AI Allie Disclosures and Terms of Use](https://www.alinea-invest.com/legal/ai-allie-disclosures-terms-of-use)
- [Payment Terms and Conditions](https://www.alinea-invest.com/legal/payment-terms-and-conditions)
- [Deposits and Withdrawals Policy](https://www.alinea-invest.com/legal/alinea---deposits-withdrawals-policy)
- [Bank Account Eligibility Policy](https://www.alinea-invest.com/legal/alinea---bank-account-eligibility-policy)
- [Event Contracts Fee Disclosure](https://www.alinea-invest.com/legal/alinea-event-contracts-fee-disclosure)
- [Referral Program terms](https://www.alinea-invest.com/legal/alinea-referral-program-terms-conditions)
- [Fund and Win promotion terms](https://www.alinea-invest.com/legal/alinea-fund-win-up-to-1-000-promotion-terms-conditions)
- [Mobile Messaging Terms](https://www.alinea-invest.com/legal/alinea-invest-inc-mobile-messaging-terms-and-conditions)
- [Privacy Policy](https://www.alinea-invest.com/legal/alinea-invest-privacy-policy)
- [Terms of Use](https://www.alinea-invest.com/legal/terms-of-use)
- [Social Media Disclosure](https://www.alinea-invest.com/legal/social-media-disclosure)
- [Form ADV Part 2A, March 2026](https://cdn.prod.website-files.com/68f15664929ec33507ab7fea/69d6c510c8a79ec2b9392830_Alinea_Advisory%20Services_Form_Adv_Part_IIA_Mar%202026.pdf)
- [Form ADV Part 2A Wrap brochure, March 2026](https://cdn.prod.website-files.com/68f15664929ec33507ab7fea/69d6c5ce16b369bbbc6d99ca_Alinea_Advisory%20Services_Form_Adv_Part_IIA_Wrap%20Mar%202026.pdf)
- [Form CRS, March 2026](https://cdn.prod.website-files.com/68f15664929ec33507ab7fea/69d6c54947637f0b5f63ea19_Alinea%20Advisory%20Services%20Form%20CRS%20Mar%202026.pdf)
- [Apple App Store listing](https://apps.apple.com/us/app/alinea-personalized-investing/id1554623825)
- [Trustpilot reviews](https://www.trustpilot.com/review/alinea-invest.com)
- [The College Investor review](https://thecollegeinvestor.com/56733/alinea-invest-review/)
- [The Everygirl review](https://theeverygirl.com/alinea-invest-app-review/)
- [Acorns vs Alinea](https://www.acorns.com/learn/investing/acorns-vs-alinea/)
- [Motley Fool review (2024)](https://fool.com/the-ascent/buying-stocks/alinea-invest-review)
- [FinTech Futures on PvX financing](https://www.fintechfutures.com/wealthtech/alinea-invest-scores-22-5m-in-user-acquisition-financing)
- [App Pricing Lab listing](https://www.apppricinglab.com/app/apple/1554623825)


## Autopilot

Autopilot is a phone app that copies the trades of politicians, hedge funds, AI portfolios and creators inside your own brokerage account. The Basic tier is free and Premium costs $29.99 to $199.99 per quarter or $99.99 to $699.99 per year, with a $500 minimum per portfolio. Advice comes from Autopilot Advisers, LLC, an SEC-registered investment adviser, and the app runs on iOS and Android only.

Rows marked "Reported" come from third-party reviews or user reviews, not from Autopilot's own pages.

### Onboarding and account

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Account sign-up | Lets anyone aged 18 or older create an account in the mobile app. | Free | [Read] |
| Suitability questionnaire | Asks about your goals and risk level during onboarding to check portfolios fit you. | Free | [Read] [Flag] |
| Investment advisory agreement | Gives Autopilot limited authority to send trade instructions for your chosen portfolio. | Free | [Ask] [Flag] |
| Three-step setup | Guides you to pick a portfolio, connect a brokerage, then start automatic trades. | Free | [Read] |
| Account deletion | Lets you ask for your data to be deleted by emailing the legal team. | Free | [Ask] |
| Client Relationship Summary | Links to the firm's Form CRS and Form ADV from the site footer. | Free | [Read] [Flag] |

### Brokerage connection

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Connect your Brokerage | Links your existing brokerage account so your money never moves to Autopilot. | Free | [Ask] [Flag] |
| Robinhood connection | Places copied trades in a linked Robinhood account. Reported: each trade needs your approval. | Free | [Ask] [Flag] |
| Charles Schwab connection | Places copied trades in a linked Schwab account. | Free | [Ask] [Flag] |
| Public connection | Places copied trades in a linked Public account, the default and preferred partner. | Free | [Ask] [Flag] |
| Fidelity connection | Places copied trades in a linked Fidelity account. Reported: still in beta and needs trade approvals. | Free | [Ask] [Flag] |
| Webull connection | Reported: places copied trades in a linked Webull account. | Free | [Ask] [Flag] |
| E*TRADE connection | Reported: places copied trades in a linked E*TRADE account. | Free | [Ask] [Flag] |
| Token-based broker login | Reported: uses the broker's own login and tokens through Plaid, so Autopilot never sees your password. | Free | [Read] |
| Open a Public account | Refers you to open and fund a new Public brokerage account. | Free | [Ask] [Flag] |

### Marketplace and discovery

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Marketplace | Shows a catalog of vetted stock pickers and portfolios ranked by performance. | Free | [Read] [Flag] |
| Featured | Highlights a short list of hand-picked portfolios, such as Tristan's Flagship and Pelosi Tracker+. | Free | [Read] |
| Top Performers | Ranks portfolios by return over 1W, 1M, 3M, 6M, 1Y or 2Y. | Free | [Read] |
| Popular | Ranks portfolios by dollars currently invested by users. | Free | [Read] |
| Pilots directory | Lists each pilot with the number of portfolios they run. | Free | [Read] |
| Portfolio categories | Reported: lets you browse by Trending, New, Crypto, Politician, Bearish, Hedgefund, Retirement and AI. | Free | [Read] |
| Portfolio page | Shows one portfolio's pilot, return and amount invested. Reported: also holdings and average trade delay. | Free | [Read] [Flag] |
| Performance history | Shows a transparent track record for each pilot. | Free | [Read] |
| Portfolio web link | Opens a shareable web page for a portfolio with a Get the App prompt. | Free | [Read] |

### Portfolios you can copy

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Pelosi Tracker+ | Copies Nancy Pelosi's trades from STOCK Act filings, which can arrive up to 45 days late. | Not stated | [Rule] [Flag] |
| Politician Trackers | Copies disclosed trades of other members of Congress, such as the Mullin Tracker. | Not stated | [Rule] [Flag] |
| Hedge Fund Trackers | Mirrors 13F filings of funds, such as Jim Simons Tracker, Point 72 and Dalio Tracker. | Not stated | [Rule] [Flag] |
| Inverse Cramer | Runs an Autopilot portfolio built to bet against Jim Cramer. Reported: it rebalances every three months. | Not stated | [Rule] [Flag] |
| Calacanis Tracker | Runs an Autopilot portfolio tracking investor Jason Calacanis. Data source not stated. | Not stated | [Rule] [Flag] |
| AI Portfolios | Copies portfolios built with AI models, such as Claude Portfolio and AI World War III Portfolio. | Not stated | [Rule] [Flag] |
| Expert Pilots | Copies portfolios run by named investors and firms, such as Peter Wolff and Unusual Whales. | Not stated | [Rule] [Flag] |
| Tristan's Flagship | Copies a strategy based on the trades of NBA player Tristan Thompson. | Not stated | [Rule] [Flag] |
| Thematic Portfolios | Copies portfolios built around a trend, such as AI, clean energy or biotech. | Not stated | [Rule] [Flag] |
| Insider Portfolio | Reported: tracks company executives and directors buying their own stock. | Not stated | [Rule] [Flag] |
| Risk-based portfolios | Reported: offers conservative, moderate and aggressive portfolios. | Not stated | [Rule] [Flag] |

### Copy trading

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Investment amount | Lets you set how much money to put in a portfolio, with a $500 minimum each. | Free | [Ask] [Flag] |
| Add money | Lets you add more money to a portfolio you already copy. | Not stated | [Ask] [Flag] |
| Automatic Trades | Sends each new portfolio trade to your broker without you acting. Reported: usually within minutes of a filing. | Premium, $29.99 to $199.99 per quarter | [Rule] [Flag] |
| Self-directed copying | Shows a portfolio's trading activity so you can place the trades yourself at your broker. | Basic, free | [Read] [Flag] |
| One-time initial investment | Reported: the free tier buys one portfolio once and then makes no further trades. | Basic, free | [Ask] [Flag] |
| Trade approval | Reported: asks you to approve each trade at some brokers, with an auto-approval setting. | Not stated | [Ask] [Flag] |
| Proportional sizing | Reported: sizes each trade by the pilot's portfolio weight applied to your amount. | Not stated | [Rule] [Flag] |
| Rebalance | Lets you rebalance at any time. Reported: it also sells automatically to restore target weights. | Not stated | [Rule] [Flag] |
| Multiple portfolios | Lets you mix several strategies in one account at the same time. | Reported: Premium, one fee per portfolio | [Rule] [Flag] |
| Pause | Lets you pause copying a portfolio at any time. | Not stated | [Ask] [Flag] |
| Switch | Lets you move from one portfolio to another at any time. | Not stated | [Ask] [Flag] |
| Stock blacklist | Reported: lets you exclude chosen stocks from being bought. | Not stated | [Rule] [Flag] |
| Skip small positions | Reported: lets you copy every trade or leave out small holdings. | Not stated | [Rule] [Flag] |
| Cash buffer | Reported in one user review: a setting to keep some cash unspent. Not confirmed. | Not stated | [Rule] [Flag] |
| Quarterly account review | Checks every quarter by algorithm that your holdings still match your questionnaire. | Free | [Rule] [Flag] |

### Tracking and alerts

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Autopilot account value | Shows the value of your copied positions, which may differ from your broker's total. | Free | [Read] |
| Performance tracking | Reported: shows returns from 1 week to all time based on Autopilot's own delayed trades. | Free | [Read] |
| Trade notifications | Reported: sends a push alert when a trade is placed, sometimes with a reason. | Not stated | [Read] |
| Portfolio alerts | Reported: sends alerts for rebalancing, performance updates and market news. | Not stated | [Read] |
| Notification frequency | Reported: lets you choose alerts from real time to a weekly summary. | Not stated | [Read] |
| SMS messages | Sends text messages to your phone, as covered in the terms. | Not stated | [Read] |
| Educational content | Reported: offers market analysis and short explanations of trades. | Not stated | [Read] |

### Plans and billing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Basic Tier | Gives access with no fee. | Free | [Read] [Flag] |
| Premium Tier | Charges a fixed fee in advance by card, quarterly or yearly. | $29.99 to $199.99 per quarter or $99.99 to $699.99 per year | [Rule] [Flag] |
| Per-portfolio fee | Reported: charges about $29 per quarter or $100 per year for each portfolio copied. | Premium | [Rule] [Flag] |
| Pilot fee | Reported: adds $99 to $299 per year on some creator portfolios. | Premium add-on | [Rule] [Flag] |
| Free trial | Offers a trial on some products, limited to one per person per year. | Not stated | [Ask] |
| Cancel subscription | Lets you cancel in the account dashboard and keep access until the period ends. | Free | [Ask] |
| Autopilot Club | Gives members perks and access to future trades. | Not stated | [Read] |

### Creators, support and security

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Become a Pilot | Lets investors apply through a web form to launch their own portfolio. | Not stated | [Ask] [Flag] |
| Email support | Lets you email support from inside the app. Reported: there is no phone or chat. | Free | [Read] |
| Data encryption | Encrypts your data in transit and at rest with role-based staff access. | Free | [Read] |

### Business model and licensing

- It earns a fixed subscription fee from Premium users; the asset-based fee is 0.00% today but is planned for later.
- It keeps a share of fees charged by third-party pilots and advisers on the marketplace.
- Public Holdings pays it $50 to $5,000 for each newly funded account it refers.
- Autopilot Advisers, LLC is an SEC-registered investment adviser, listed as firm 331749, owned by Autopilot Holdings Corporation.
- It is not a broker-dealer and holds no client money; the user's own broker executes every trade.
- Stripe handles card payments. Plaid is reported as the brokerage connection provider but Autopilot's pages do not confirm it.

### What users say is missing or broken

- Brokerage links to Fidelity and Schwab keep logging out, so trades are missed (App Store reviews, March to May 2026; Google Play, September 2026).
- Fees stack per portfolio and are not shown before sign-up (Google Play review, August 2026; WallStreetZen, October 2026).
- Trades need manual approval at Robinhood and Fidelity, so it is not truly automatic (App Store reviews, December 2025 and April 2026).
- The $500 minimum plus about $100 a year is costly for small accounts (The College Investor, June 2026).
- Support is email only and slow, and there is no web app (The College Investor, June 2026; WallStreetZen, October 2026).

### Sources

- [Autopilot home page](https://www.joinautopilot.com/)
- [Autopilot FAQ (question titles only loaded)](https://www.joinautopilot.com/faq)
- [Autopilot Pelosi Tracker page](https://www.joinautopilot.com/pelosi-tracker)
- [Pelosi Tracker+ portfolio landing page](https://www.joinautopilot.com/landing/1/8735)
- [Tristan's Flagship portfolio landing page](https://www.joinautopilot.com/landing/5872/1387064)
- [Autopilot Terms and Conditions](https://www.joinautopilot.com/terms-and-conditions)
- [Autopilot Privacy Policy](https://www.joinautopilot.com/privacy-policy)
- [Autopilot Disclaimer](https://www.joinautopilot.com/disclaimer)
- [Autopilot Advisers Form CRS, 4 February 2026](https://reports.adviserinfo.sec.gov/crs/crs_331749.pdf)
- [Autopilot: Automated Investing on the Apple App Store](https://apps.apple.com/us/app/autopilot-automated-investing/id1613625799)
- [Autopilot on Google Play](https://play.google.com/store/apps/details?id=finance.iris.autopilot&hl=en_US&gl=US)
- [MWM mirror of App Store listing and reviews](https://mwm.ai/apps/autopilot-investment-app/1613625799)
- [Forbes: What Is Autopilot, updated September 2026](https://www.forbes.com/sites/investor-hub/article/what-is-autopilot-investment-app/)
- [The College Investor: Autopilot Review, updated June 2026](https://thecollegeinvestor.com/59796/autopilot-review/)
- [WallStreetZen: Autopilot Investment App Review, updated October 2026](https://www.wallstreetzen.com/blog/autopilot-investment-app-review/)
- [Flip: Autopilot Fees in 2026](https://fliptexts.com/compare/autopilot)
- [CoolCuration: Autopilot app review UK, June 2026](https://coolcuration.com/autopilot-app-review-uk)
- [ABC News 4: Pelosi's stock trades spark legislation and investing app frenzy, May 2025](https://abcnews4.com/news/nation-world/nancy-pelosi-stock-trades-spark-legislation-and-investing-app-frenzy-lawmakers-congress-trading)


## Origin

Origin is a United States all-in-one money app for individuals and couples, with a separate version sold to employers. Membership costs $99 a year or $12.99 a month, with a $1 first year for new members and no free tier. Advice comes from Origin Investment Advisory LLC, an SEC-registered investment adviser, and it runs on iOS, Android, web, Mac and Windows (as a web app).

### Onboarding and account linking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Account connection | Links banks, cards, loans and investment accounts from over 13,000 institutions through Plaid, MX or Finicity. | Membership | [Read] |
| Connector choice | Origin picks the best data provider, and you can switch to another connector if one fails. | Membership | [Read] |
| Daily sync | Each linked account syncs balances, holdings and transactions once every 24 hours. | Membership | [Read] |
| Manual refresh | You can force a refresh from the account menu or the net worth graph menu. | Membership | [Read] |
| Reconnect | A disconnected account shows a Reconnect button that asks for fresh bank credentials. | Membership | [Read] |
| Transaction history pull | Spending accounts import up to two years of history, and investment accounts start from the connection day. | Membership | [Read] |
| Manual accounts | You add an asset or debt with a name, balance and notes, and update the balance yourself. | Membership | [Read] |
| Include in Net Worth toggle | Each account has a switch that removes it from the net worth total. | Membership | [Read] |
| Home value | A home added to the profile gets a Zillow value that updates monthly. | Membership | [Read] |
| Vehicle asset | A vehicle is added by hand under the Vehicle type, and its value never updates on its own. | Membership | [Read] |
| Loan start date | You can edit a loan's start date so the net worth graph shows it correctly. | Membership | [Read] |
| Import from .CSV | You upload a bank CSV in the Origin template to add transactions. | Membership | [Read] |
| Import from Monarch | You upload a Monarch transaction CSV for each account. | Membership | [Read] |
| Amazon integration | The mobile app imports about three months of Amazon.com orders and matches them to card transactions. | Membership | [Read] |
| Closed account | You can mark an account as closed and keep its history, per a help article title. | Membership | [Read] |

### Spending and transactions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Automatic categorization | Every imported transaction gets a category without user input. | Membership | [Read] |
| Custom categories | You can add, edit and archive spending categories in Spending Settings. | Membership | [Read] |
| Category groups | You build your own groups of categories and view Breakdown and Reports by group. | Membership | [Read] |
| Tags | You attach free-form labels such as a trip name to transactions across categories. | Membership | [Read] |
| Transaction rules | A rule matches on merchant, category, amount, account, tags, date or type, then edits matching transactions. | Membership | [Rule] |
| Rule actions | Rules can change category, merchant name, visibility, description, tags, splits, review status and income or expense type. | Membership | [Rule] |
| Rule preview | You see the effect of a rule before saving, and it applies to past and future transactions. | Membership | [Read] |
| Split transaction | You split one transaction equally or by custom amounts, each with its own category. | Membership | [Read] |
| Manual transactions | You can add a transaction by hand. | Membership | [Read] |
| Edit transaction | You can change a transaction's category, merchant, type and other details. | Membership | [Read] |
| Bulk edit | You tick several transactions and edit them together, except pending ones. | Membership | [Read] |
| Bulk delete and restore | You can delete many transactions at once and restore them, per a help article title. | Membership | [Read] |
| Review Transactions | New expenses sit in an unreviewed queue until you confirm merchant, amount and category. | Membership | [Read] |
| Automatic transfer matching | Origin pairs both sides of a move between your accounts and labels them Transfer, with a revert option. | Membership | [Rule] |
| Large transaction alert | You set a dollar threshold and get a notification when a transaction exceeds it. | Membership | [Read] |
| Transaction filters | You filter the list by one or any combination of attributes. | Membership | [Read] |
| Filter by member | In a shared household you can filter transactions by partner. | Membership | [Read] |
| Export as CSV | The web Transactions page exports transaction data to a CSV file. | Membership | [Read] |
| Spending Overview comparison | The Expenses This Month graph sets the current month beside any past month. | Membership | [Read] |
| Breakdown | A view shows spending by category or by group for a chosen month. | Membership | [Read] |
| Reports | Reports chart cash flow, income, expenses and transfers as bar charts (reported by The College Investor). | Membership | [Read] |
| Sankey diagram | Reports include a flow diagram from income to spending categories. | Membership | [Read] |
| Spending analysis | The app reviews the past six months of income, spending and buffer trends. | Membership | [Read] |

### Budgeting

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| AI Budget Builder | It proposes a monthly budget from your past six months of spending and cash flow. | Membership | [Read] |
| Create with AI | You ask AI Advisor for a budget, review income, savings and limits, then tap to save. | Membership | [Read] |
| Create my own | A manual builder lets you enter income, savings target and each category limit. | Membership | [Read] |
| Recalculate budget | AI Advisor proposes changes to an existing budget, and you confirm before it updates. | Membership | [Read] |
| Savings target | The budget holds a monthly savings amount set with a slider. | Membership | [Read] |
| Category limits | Each spending category gets a monthly limit that you can adjust later. | Membership | [Read] |
| Fixed, Flexible, Discretionary | You class each category by type to see where spending can move. | Membership | [Read] |
| Rollover budget | Per category, unspent money adds to next month and overspending is taken off. | Membership | [Rule] |
| Clear rollover funds | You can wipe the rolled balance for one category or all categories in the current month. | Membership | [Read] |
| Budget periods | Budgets are monthly, and the rollover article also refers to weekly and biweekly budgets. | Membership | [Read] |
| Past budgets | You can open the budget for any of the previous six months. | Membership | [Read] |
| Reset budget | You can reset the budget and start again, per a help article title. | Membership | [Read] |
| Shared budget | A household has one budget that both partners see and edit. | Membership | [Read] |

### Recurring bills and subscriptions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Recurring detection | Origin finds repeating payments and deposits by merchant, timing, amount and direction. | Membership | [Read] |
| Recurring list view | The Recurring tab lists upcoming payments and deposits. | Membership | [Read] |
| Recurring calendar view | The same items show on a calendar, with a blue dot on new ones. | Membership | [Read] |
| New label | A newly found recurring expense is marked New. | Membership | [Read] |
| Higher or lower than usual | From the third payment, a changed charge is flagged with the dollar and percent difference. | Membership | [Read] |
| Mark as recurring | You can add a recurring item by hand or switch it on for any transaction. | Membership | [Read] |
| End date and inactive | You can set an end date or mark a series inactive to remove future entries. | Membership | [Read] |
| Cancel Subscription button | For supported services it opens the provider's cancellation page, and Origin cannot cancel for you. | Membership | [Read] |

### Forecasting, goals and retirement

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Net worth projection | A chart projects wealth over your lifetime from income, spending, investments, debt and home growth. | Membership | [Read] |
| Cash flow timeline | A year by year chart shows income, expenses, surpluses and shortfalls. | Membership | [Read] |
| Chance of Success | A Monte Carlo run of thousands of market paths gives the odds your money lasts. | Membership | [Read] |
| Legacy success rate | A second probability shows the odds of leaving a target inheritance. | Membership | [Read] |
| Retirement event | You set a retirement age and spending, with a default of 80% of current expenses. | Membership | [Read] |
| Social Security claiming age | You pick a claiming age from 62 to 70, with 70 as the default. | Membership | [Read] |
| Home purchase event | You enter price, down payment, term and rate, and it builds a full loan schedule. | Membership | [Read] |
| Home sale event | It models sale costs at 6% fees, capital gains tax and the home sale exclusion. | Membership | [Read] |
| College event | It uses national or school costs with 5% yearly growth and 529 plan funding. | Membership | [Read] |
| Children event | It adds a default cost of $22,000 per child per year, which you can change. | Membership | [Read] |
| Windfall event | You add a one-time inflow such as an inheritance or bonus. | Membership | [Read] |
| Secondary income event | You add side income with a start date, length and amount. | Membership | [Read] |
| Custom event | You add any one-time or repeating income or expense. | Membership | [Read] |
| Equity compensation event | You model ISOs, NSOs, RSUs and public stock with vesting, exercise and sale timing. | Membership | [Read] |
| Planning assumptions | You pick a conservative, moderate or aggressive profile and adjust the average return. | Membership | [Read] |
| Tax modeling | The forecast includes federal and state income tax, payroll taxes, capital gains and required withdrawals. | Membership | [Read] |
| Scenarios | You can build an unlimited number of scenarios and compare them. | Membership | [Read] |
| Partner in forecast | You add a partner's income, savings and goals by invite or by typing them in. | Membership | [Read] |
| Forecast recommendations | The tool suggests changes that you can apply to the plan. | Membership | [Read] [Flag] |
| Savings goal category | There is no dedicated goals tool, so a goal is tracked as a custom budget category. | Membership | [Read] |

### Net worth

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Net worth | The dashboard totals all linked and manual assets and debts. | Membership | [Read] |
| Net worth graph | The graph is built from one balance snapshot per account per day since linking. | Membership | [Read] |
| Equity in net worth | Tracked employee equity can count toward net worth. | Membership | [Read] |

### Investment tracking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Portfolio tracking | Holdings from linked brokerage, retirement and crypto accounts show in one view. | Membership | [Read] |
| Holdings CSV import | You upload stocks, funds, bonds and other assets from a CSV file. | Membership | [Read] |
| Performance tracking | Portfolio performance shows for today and over time. | Membership | [Read] |
| Benchmark comparison | Your return is compared with major indexes such as the S&P 500. | Membership | [Read] |
| Allocation view | Your asset mix is shown against your personal risk profile. | Membership | [Read] [Flag] |
| Edit asset class | You can change the asset class assigned to a holding. | Membership | [Read] |
| Live balance estimate | Between syncs, value is estimated from last share counts and prices refreshed every 15 minutes. | Membership | [Read] |
| Position detail | Each holding shows performance, analyst ratings, earnings estimates against results, and financial statements. | Membership | [Read] |
| Market Watch | A tab in Invest shows market trends, sectors and securities apart from your portfolio. | Membership | [Read] |
| Watchlist | You save stocks, funds and crypto to a list for tracking. | Membership | [Read] |
| Earnings calendar | A calendar lists upcoming company earnings dates. | Membership | [Read] |
| Themed screens | Ready-made lists group stocks by a theme, such as firms that gain from inflation. | Membership | [Read] |

### Origin Invest and cash account

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Automated Index Account | Origin builds and manages a global stock and bond fund portfolio from your risk answers. | Membership, no management fee | [Rule] [Flag] |
| Automatic rebalancing | Origin rebalances the automated portfolio for you. | Membership, no management fee | [Rule] [Flag] |
| Change portfolio | You can adjust your risk profile and change the automated portfolio. | Membership | [Ask] [Flag] |
| Stock Bundles | You buy a themed group of 8 to 20 equally weighted stocks from $1. | Membership, no management fee | [Ask] [Flag] |
| Customize bundle | You can change stock weights or remove stocks before buying. | Membership | [Ask] [Flag] |
| Sell bundle or single stock | You can sell the whole bundle or any one stock inside it. | Membership, regulatory fees at cost | [Ask] [Flag] |
| Cash Account | A brokerage sweep account pays 3.77% APY as of 5 October 2026 with no minimum. | Membership | [Ask] [Flag] |
| Move Money deposit | You transfer money in from a linked bank, up to $50,000 a day to cash. | Membership | [Ask] [Flag] |
| Recurring deposits | You schedule weekly, biweekly or monthly deposits to the cash or automated account. | Membership | [Rule] [Flag] |
| Withdrawal | You move money back to your linked bank from the app. | Membership | [Ask] [Flag] |
| Transfer between Origin accounts | You can move money from the cash account to an investing account, per a help article title. | Membership | [Ask] [Flag] |
| Tax forms | 1099 forms for the Origin Invest account are available to download, per a help article title. | Membership | [Read] [Flag] |
| Account protection | Securities are covered by SIPC up to $500,000 and cash by FDIC up to $250,000. | Membership | [Read] [Flag] |

### AI adviser and other AI features

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| AI Advisor chat | You ask questions in plain words and get answers based on your linked data. | Membership | [Read] [Flag] |
| Proactive monitoring | It runs hundreds of expert-built checks on your finances every day in the background. | Membership | [Read] [Flag] |
| Financial Health Score | One score rolls up all the checks and changes as your data changes. | Membership | [Read] |
| Actions | A ranked list of personal recommendations shows what was found, why it matters and next steps. | Membership | [Read] [Flag] |
| Action status | You mark an Action done, in progress or dismissed, and done triggers a fresh check. | Membership | [Read] |
| Personalize Details | You tell Origin an Action does not apply, or add context to get new advice. | Membership | [Read] |
| Scenario questions | You ask what-if questions, such as a home purchase or pay cut, and see the forecast change. | Membership | [Read] |
| Chat history | Past AI Advisor conversations are saved and can be reopened. | Membership | [Read] |
| AI Memory | When you ask, it saves up to 50 personal facts and 50 account corrections. | Membership | [Read] |
| Memory controls | You can view, edit, delete or switch off memories, and each partner's are private. | Membership | [Read] |
| Risk profile | A short questionnaire sets your risk level, which shapes investing answers. | Membership | [Read] [Flag] |
| Instant Insights | The app shows short AI notes on account changes, per the App Store release notes. | Membership | [Read] |
| Daily Market Brief | A swipeable brief at the top of the home screen refreshes several times a day. | Membership | [Read] |
| Weekly Recap | A stories-style recap covers net worth, spending, cash flow, upcoming bills, investments and markets. | Membership | [Read] |
| Dive deeper | The last recap page opens a chat to ask follow-up questions. | Membership | [Read] |
| Recap feedback | Each recap page has More like this and Less like this buttons. | Membership | [Read] |
| AI investment insights | It explains your allocation, risk and performance in plain words. | Membership | [Read] [Flag] |
| Credit questions | On the Credit Score page it answers questions using your report, factors and alerts. | Membership | [Read] [Flag] |

### Human financial planners

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| General Planning Session | You book a one-to-one call with a CFP professional for 30 or 60 minutes. | $99 for 30 minutes, $149 for 60 minutes | [Ask] [Flag] |
| Budgeting and Debt session | A focus session covers daily money management, savings and debt. | Session fee | [Ask] [Flag] |
| Investment Portfolio Review session | A focus session reviews your investments and retirement plan. | Session fee | [Ask] [Flag] |
| Tax Planning session | A focus session maps a tax strategy for withholding and life events. | Session fee | [Ask] [Flag] |
| Annual plan discount | Annual members get 30% off planning sessions. | Annual membership | [Read] |
| Choose a planner | You pick a planner in the Financial Planner tab before booking. | Session fee | [Ask] |
| Message planner | You can message your planner inside the app. | Session fee | [Read] |
| Share documents | You can upload documents for your planner to read. | Session fee | [Read] |
| Session summary | The planner posts a summary of key points and recommendations to your profile. | Session fee | [Read] [Flag] |
| Joint session | Partners can attend a planning session together. | Session fee | [Ask] [Flag] |

### Equity compensation

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Equity tracker | You enter your company, its 409A value and each grant to see current value. | Membership | [Read] |
| Vesting schedule | Each grant shows what has vested and when the rest vests. | Membership | [Read] |
| Exercise Simulator | You test share counts and dates to see exercise cost, possible AMT and projected value. | Membership | [Read] |
| Exercised grants | You can record grants you have already exercised. | Membership | [Read] |

### Tax filing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Origin Tax Filing | A guided federal and state return powered by April Tax, filed from inside Origin. | Employer plans only for the 2027 season | [Ask] [Flag] |
| Expert Assistance | A tax professional answers two chosen topics by phone or email before you file. | $189 add-on | [Ask] [Flag] |
| Past years taxes | Returns filed through Origin in earlier years stay available to open. | Membership | [Read] [Flag] |
| Joint filing | Partners can file a joint return through Origin. | Employer plans only for the 2027 season | [Ask] [Flag] |

### Estate planning

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Basic Will | A simple will names who gets your assets and who carries out the plan. | Free with membership | [Ask] [Flag] |
| Full Will | Adds guardians, specific gifts, a living will, health directive, HIPAA form and powers of attorney. | $149, or $119 with membership | [Ask] [Flag] |
| Trust | Adds a revocable living trust, certificate of trust and a trust funding guide. | $449, or $359 with membership | [Ask] [Flag] |
| Document builder | A step by step questionnaire saves progress and produces ready-to-sign PDF files. | Included with each plan | [Read] [Flag] |
| Unlimited revisions | You can edit and regenerate your estate documents at no extra cost. | Included with each plan | [Ask] [Flag] |
| Schedule of Assets | A list organizes which assets go to whom. | Full Will and Trust | [Read] [Flag] |
| Upload notarized documents | You can store signed and notarized copies in your Origin profile. | Included with each plan | [Read] |
| Create with a partner | Partners can build their estate plans together. | Included with each plan | [Ask] [Flag] |

### Credit score and identity protection

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Credit Score | Shows an Equifax VantageScore that updates monthly, after a soft check. | Membership | [Read] [Flag] |
| Score factors | Six factors each show a status, impact level and personal tips. | Membership | [Read] [Flag] |
| Credit alerts | A daily log lists new accounts, hard inquiries, balance changes and negative marks. | Membership | [Read] [Flag] |
| Score history | A graph shows up to six months of past scores. | Membership | [Read] [Flag] |
| Full credit report | You can download your full Equifax report from the Credit Score page. | Membership | [Read] [Flag] |
| Free exposure check | A one-time scan shows where your details are exposed before you enroll. | Free with membership | [Read] |
| Dark web monitoring | Watches your email and other identifiers for breaches. | ID Protection add-on, yearly fee not stated | [Read] |
| SSN monitoring | Watches for use of your Social Security number if you provide it. | ID Protection add-on, yearly fee not stated | [Read] |
| Data broker removal | Scans people-search sites and sends removal requests for you. | ID Protection add-on, yearly fee not stated | [Rule] |
| Identity restoration | A specialist helps you recover after identity theft. | ID Protection add-on, yearly fee not stated | [Ask] |
| Identity theft insurance | Covers up to $3,000,000 a year, including $1,000,000 for stolen funds. | ID Protection add-on, yearly fee not stated | [Read] [Flag] |

### Partner and household sharing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Partner Access | You invite one partner by email to share the account at no extra cost. | Membership | [Ask] |
| Separate logins | Each partner has their own username, password and security settings. | Membership | [Read] |
| Partner views | You switch between My Accounts, Our Shared Accounts and Your Accounts, or combine them. | Membership | [Read] |
| Account ownership | Each account is assigned to you, your partner or both. | Membership | [Read] |
| Partner credit scores | Both partners can show their own credit score, per a help article title. | Membership | [Read] [Flag] |

### Employer version

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Origin for Employers | Companies buy Origin as a staff benefit across 70 or more countries. | Employer paid, price not stated | [Read] |
| Included planner sessions | Employer plans can include sessions with a regional financial expert. | Employer paid, or $119 for 45 minutes | [Ask] [Flag] |
| SSO login | Employees can sign in through their company's single sign-on. | Employer paid | [Read] |
| Convert to personal plan | When the benefit ends, a paywall lets you subscribe yourself with no data migration. | Membership | [Ask] |

### Notifications and reports

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Budget alerts and insights | Notifications tell you about budget progress. | Membership | [Read] |
| AI insights notifications | Notifications deliver new AI findings. | Membership | [Read] |
| Planner message alerts | You are notified when your planner sends a message. | Membership | [Read] |
| Weekly market recap notification | You are notified when the weekly recap is ready. | Membership | [Read] |
| Goal updates | The notification settings list goal updates as a type. | Membership | [Read] |
| AI Recaps toggle | A setting switches recap notifications on or off. | Membership | [Read] |
| Review reminder | After seven days away with unreviewed transactions, Origin may send a reminder. | Membership | [Read] |

### Platforms

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| iOS app | Runs on iPhone and iPad with iOS 16.4 or later, and on Apple Vision. | Membership | [Read] |
| Android app | Available on Google Play in the United States. | Membership | [Read] |
| Web app | The full product runs in a browser and works outside the United States. | Membership | [Read] |
| Mac desktop app | A downloadable Mac app is recommended for macOS 10.15 or later. | Membership | [Read] |
| Windows install | There is no native Windows app, but the web app installs from Chrome. | Membership | [Read] |
| Spending widget | A home screen widget on iOS and Android shows month spending and budget pace. | Membership | [Read] |
| Net Worth widget | A home screen widget on iOS and Android shows net worth and its trend. | Membership | [Read] |
| Budget by Category widget | An iOS widget tracks one budget category that you choose. | Membership | [Read] |
| Combined Budget and Categories widget | An iOS widget shows the total budget with your top five categories. | Membership | [Read] |
| Latest Transactions widget | An iOS widget lists your most recent purchases. | Membership | [Read] |
| Portfolio Performance widget | An iOS widget shows live portfolio performance. | Membership | [Read] |
| Top Movers widget | An iOS widget shows your biggest gaining and losing holdings. | Membership | [Read] |
| Dark mode | The app and widgets offer light and dark themes. | Membership | [Read] |
| Font size | You can adjust text size in the app, per a help article title. | Membership | [Read] |

### Security and privacy

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Read-only access | Linked accounts are view only, so Origin cannot move money or change them. | Membership | [Read] |
| Encryption | Data is protected with AES 256-bit encryption in transit and at rest. | Membership | [Read] |
| SOC 2 Type II | Independent auditors review Origin's security controls. | Membership | [Read] |
| Multi-Factor Authentication | You can switch on login codes sent by email or text. | Membership | [Read] |
| Google sign-in | You can log in with Google, and support enables two-factor for those accounts. | Membership | [Read] |
| Delete profile | You can delete your Origin profile, and a data request form is published. | Membership | [Ask] |

### Support and membership

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| In-app support chat | A chat starts with an AI bot, and typing agent reaches a person. | Membership | [Read] |
| Email support | You can email hereforyou@useorigin.com on weekdays, 9am to 5pm Pacific. | Membership | [Read] |
| Scheduled support call | You can book a phone call with the support team by calendar link. | Membership | [Read] |
| Help Center | A public site holds how-to articles and tutorial videos. | Free | [Read] |
| Community | Origin runs Reddit and Slack communities for members. | Free | [Read] |
| Annual plan | One payment covers a year of full access and renews automatically. | $99 a year | [Rule] |
| Monthly plan | Full access billed each month, renewing automatically. | $12.99 a month | [Rule] |
| $1 first year | New members pay $1 for the first year, then the standard annual rate. | $1, then $99 a year | [Rule] |
| Free trial | A 7-day free trial exists but is paused while the $1 offer runs. | Free for 7 days when offered | [Read] |
| Cancel subscription | You cancel in settings or by email, and access lasts to the period end. | Membership | [Ask] |
| Referral program | Members can refer others under published referral terms. | Membership | [Read] |

### Business model and licensing

- Origin earns money from subscriptions, employer per-employee fees, and per-use fees for planners, wills, trusts, tax help and identity protection.
- Blend Financial Inc. trades as Origin Financial and wholly owns Origin Investment Advisory LLC, an SEC-registered investment adviser.
- DriveWealth LLC is custodian and trade execution partner, and Customers Bank holds cash account balances under a sweep program.
- Origin charges no management fee on investing, and passes on only regulatory selling fees and DriveWealth incidental fees.
- Data partners are Plaid, MX and Finicity for accounts, Zillow for homes, and Equifax for credit.
- April Tax powers tax filing, and Array, Constella Intelligence and Optery power identity protection. Origin says it is not a bank or a law firm.

### What users say is missing or broken

- Origin cannot cancel subscriptions or negotiate bills, and has no sinking funds or envelope budgets (Origin's own FAQ blog, May 2026, and Rob Berger's review, September 2026).
- Budgeting is weaker than dedicated budgeting apps, and there is no free tier (The College Investor and Rob Berger reviews, both updated September 2026).
- Investment and planning tools are basic, with weak forecast assumptions and asset classification (App Store review, October 2025).
- Some connections are unreliable, especially Charles Schwab and Webull, and Capital One gives only 90 days of history (Origin FAQ blog and help center).
- Direct subscribers lose tax filing for the 2027 season, and there are no IRAs, joint accounts, single stock trades or tax-loss harvesting (Origin help center, 2025 and 2026).

### Sources

- [Your Most-Asked Questions About Origin, Answered](https://useorigin.com/resources/blog/your-most-asked-questions-about-origin-answered)
- [Why Origin is The Best All-in-one AI Finance App](https://useorigin.com/resources/blog/why-origin-is-the-best-all-in-one-ai-finance-app)
- [The Best Automatic Finance App in 2026](https://useorigin.com/resources/blog/the-best-automatic-finance-app-in-2026)
- [Product Walkthrough: How to Use Origin's Proactive AI Advisor](https://useorigin.com/resources/blog/product-walkthrough-how-to-use-origins-proactive-ai-advisor)
- [Financial Advice Without Having to Ask](https://useorigin.com/resources/blog/financial-advice-without-having-to-ask)
- [Origin vs. Copilot Money](https://useorigin.com/resources/blog/origin-vs-copilot-money-which-is-the-better-personal-finance-app-in-2026)
- [Origin's Widgets: A Complete Guide](https://useorigin.com/resources/blog/origins-widgets-a-complete-guide-to-your-financial-picture-on-your-home-screen)
- [Origin blog index](https://useorigin.com/resources/blog)
- [Spending product page](https://useorigin.com/products/spending)
- [Investing product page](https://useorigin.com/products/investing)
- [Forecasting product page](https://useorigin.com/products/forecasting)
- [Estate Planning product page](https://useorigin.com/products/estate-planning)
- [Couples page](https://useorigin.com/couples)
- [Employers page](https://useorigin.com/employers)
- [Legal index](https://useorigin.com/legal)
- [Form ADV 2A landing page](https://useorigin.com/legal/form-adv-2a)
- [Form CRS landing page](https://useorigin.com/legal/form-crs)
- [Subscription Terms and Conditions](https://useorigin.com/legal/origin-subscription-terms-and-conditions)
- [Cash Account disclosure](https://useorigin.com/legal/cash-account)
- [ID Protection Terms and Conditions](https://useorigin.com/legal/id-protection-terms-and-conditions)
- [Origin Protect Terms and Conditions](https://useorigin.com/legal/origin-protect-terms-and-conditions)
- [Affiliate Partners](https://useorigin.com/legal/affiliate-partners)
- [AI Disclaimer](https://useorigin.com/legal/ai-disclaimer)
- [Stock Bundles disclosure](https://useorigin.com/legal/stock-bundles)
- [Origin Help Center home](https://support.useorigin.com/hc/en-us)
- [Help: Account Connections category](https://support.useorigin.com/hc/en-us/categories/25392641567501-Account-Connection-Integrations)
- [Help: How do I connect my accounts?](https://support.useorigin.com/hc/en-us/articles/31307429148045-How-do-I-connect-my-accounts)
- [Help: How often does Origin sync my account data?](https://support.useorigin.com/hc/en-us/articles/20270481182221-How-often-does-Origin-sync-my-account-data)
- [Help: How far back does Origin go](https://support.useorigin.com/hc/en-us/articles/34931856046221-How-far-back-does-Origin-go-when-pulling-transaction-history)
- [Help: Add an account manually](https://support.useorigin.com/hc/en-us/articles/19429567938061-How-do-I-add-an-account-manually-to-Origin)
- [Help: Home value source](https://support.useorigin.com/hc/en-us/articles/26730280038285-How-often-is-my-home-s-value-updated-on-Origin-and-where-does-the-data-come-from)
- [Help: Car loan and car asset](https://support.useorigin.com/hc/en-us/articles/36973476043277-How-can-I-link-my-car-loan-and-car-asset)
- [Help: Upload bank transactions](https://support.useorigin.com/hc/en-us/articles/36953048380045-Can-I-upload-bank-account-transactions-to-Origin)
- [Help: Import Monarch data](https://support.useorigin.com/hc/en-us/articles/31984364897293-How-do-I-import-my-Monarch-data)
- [Help: Amazon Integration FAQ](https://support.useorigin.com/hc/en-us/articles/46435079484941-Amazon-Integration-FAQ)
- [Help: International account connection](https://support.useorigin.com/hc/en-us/articles/33490171963149-Does-Origin-support-international-account-connection)
- [Help: Spending category](https://support.useorigin.com/hc/en-us/categories/25527038895885-Spending)
- [Help: Transactions section](https://support.useorigin.com/hc/en-us/sections/38940246931981-Transactions)
- [Help: Transaction Rules](https://support.useorigin.com/hc/en-us/articles/32395789402253-Transaction-Rules-Automate-your-transaction-management)
- [Help: Split transactions](https://support.useorigin.com/hc/en-us/articles/27686187289741-How-do-I-split-transactions)
- [Help: Transaction tags](https://support.useorigin.com/hc/en-us/articles/32392465516429-Understanding-transaction-tags)
- [Help: Spending groups](https://support.useorigin.com/hc/en-us/articles/35316350988301-How-to-create-spending-groups)
- [Help: Review Your Transactions](https://support.useorigin.com/hc/en-us/articles/42056672279949-Review-Your-Transactions)
- [Help: Bulk edit transactions](https://support.useorigin.com/hc/en-us/articles/36976408088717-Can-I-bulk-edit-transactions)
- [Help: Export spending data](https://support.useorigin.com/hc/en-us/articles/28537190145933-How-can-I-export-my-spending-data)
- [Help: Filter transactions](https://support.useorigin.com/hc/en-us/articles/19396399787533-How-can-I-filter-my-transactions)
- [Help: Compare spending with past months](https://support.useorigin.com/hc/en-us/articles/19396233710349-How-do-I-compare-my-spending-with-past-months)
- [Help: Sankey diagram](https://support.useorigin.com/hc/en-us/articles/36065059584269-Where-can-I-find-the-Sankey-diagram)
- [Help: New transaction notifications](https://support.useorigin.com/hc/en-us/articles/36972584007565-Does-Origin-app-notify-of-new-transactions)
- [Help: Budgeting section](https://support.useorigin.com/hc/en-us/sections/38940169370637-Budgeting)
- [Help: How do I set up my budget?](https://support.useorigin.com/hc/en-us/articles/19396244995213-How-do-I-set-up-my-budget)
- [Help: Budget with AI Advisor](https://support.useorigin.com/hc/en-us/articles/48429075865869-How-do-I-create-or-update-my-budget-with-AI-Advisor)
- [Help: Rollover Budget](https://support.useorigin.com/hc/en-us/articles/46927940979213-Rollover-Budget)
- [Help: View a previous month's budget](https://support.useorigin.com/hc/en-us/articles/20263957373325-How-do-I-view-a-previous-month-s-budget)
- [Help: Savings goals](https://support.useorigin.com/hc/en-us/articles/37108744089229-How-to-set-and-track-savings-goals)
- [Help: Recurring Transactions and Subscriptions](https://support.useorigin.com/hc/en-us/articles/47461691935885-Recurring-Transactions-and-Subscriptions-in-Origin)
- [Help: Cancel a subscription from Origin](https://support.useorigin.com/hc/en-us/articles/37416467891213-How-to-cancel-a-subscription-from-Origin)
- [Help: A Guide to Our Forecasting Tool](https://support.useorigin.com/hc/en-us/articles/40506069128845-A-Guide-to-Our-Forecasting-Tool)
- [Help: Forecast scenario limit](https://support.useorigin.com/hc/en-us/articles/36002682909965-Is-there-a-limit-to-how-many-forecast-scenarios-someone-can-build)
- [Help: Net Worth Graph](https://support.useorigin.com/hc/en-us/articles/43232379736717-How-the-Net-Worth-Graph-Works-in-Origin)
- [Help: Market Watch explained](https://support.useorigin.com/hc/en-us/articles/39418409368845-Market-Watch-explained)
- [Help: Live balance estimate](https://support.useorigin.com/hc/en-us/articles/39418368972045-How-does-the-live-balance-estimate-feature-work)
- [Help: Portfolio Tracking section](https://support.useorigin.com/hc/en-us/sections/13148670926093-Portfolio-Tracking)
- [Help: Brokerage category](https://support.useorigin.com/hc/en-us/categories/25423430121613-Brokerage)
- [Help: Investing options](https://support.useorigin.com/hc/en-us/articles/31433897594125-What-options-do-I-have-for-investing-with-Origin)
- [Help: Investing costs](https://support.useorigin.com/hc/en-us/articles/19424918536333-You-don-t-charge-fees-for-investing-so-what-s-the-cost)
- [Help: Automated investing](https://support.useorigin.com/hc/en-us/articles/36974154731789-How-does-Origin-s-automated-investing-feature-work)
- [Help: Portfolio methodology](https://support.useorigin.com/hc/en-us/articles/32557962679053-Methodology-behind-our-automated-investing-account-portfolios)
- [Help: Specific stocks or funds](https://support.useorigin.com/hc/en-us/articles/20788940572941-Can-I-invest-in-specific-stocks-or-funds-through-an-Origin-investment-account)
- [Help: Stock Bundles](https://support.useorigin.com/hc/en-us/articles/29340187499021-What-are-Stock-Bundles-and-how-do-they-work)
- [Help: Recurring deposits](https://support.useorigin.com/hc/en-us/articles/29441291320973-How-do-I-set-up-automated-recurring-deposits)
- [Help: Deposit limits](https://support.useorigin.com/hc/en-us/articles/29733011777037-Are-there-any-limits-for-deposits)
- [Help: Cash Account interest rate](https://support.useorigin.com/hc/en-us/articles/29698838235149-What-is-the-interest-rate-for-the-Cash-Account)
- [Help: Direct deposit](https://support.useorigin.com/hc/en-us/articles/30200584900237-Can-I-use-direct-deposit-with-my-Origin-Cash-Account)
- [Help: Who can open an investment account](https://support.useorigin.com/hc/en-us/articles/20888476106637-Who-can-open-an-Origin-Investment-Account)
- [Help: IRA options](https://support.useorigin.com/hc/en-us/articles/37167187067405-Do-you-offer-IRA-options-for-retirement)
- [Help: Tax-loss harvesting](https://support.useorigin.com/hc/en-us/articles/38829498658189-Does-Origin-help-with-tax-loss-harvesting)
- [Help: Expense ratios](https://support.useorigin.com/hc/en-us/articles/37195403097997-Does-Origin-identify-expense-ratios)
- [Help: Introducing AI Advisor](https://support.useorigin.com/hc/en-us/articles/39417344659341-Introducing-AI-Advisor-Your-Personal-Financial-Guide)
- [Help: Proactive AI Advisor](https://support.useorigin.com/hc/en-us/articles/48757450425357-How-does-Origin-s-proactive-AI-Advisor-work)
- [Help: Actions in AI Advisor](https://support.useorigin.com/hc/en-us/articles/48757446344589-What-are-Actions-in-AI-Advisor)
- [Help: Financial Health Score](https://support.useorigin.com/hc/en-us/articles/48757398542349-What-is-my-Financial-Health-Score)
- [Help: Questions you can ask AI Advisor](https://support.useorigin.com/hc/en-us/articles/39416959958797-Questions-you-can-ask-AI-Advisor)
- [Help: AI Advisor Memory](https://support.useorigin.com/hc/en-us/articles/42089045600909-AI-Advisor-Memory-Personalized-financial-guidance-that-remembers)
- [Help: What LLMs does AI Advisor use?](https://support.useorigin.com/hc/en-us/articles/39417044720397-What-LLM-s-does-AI-Advisor-use)
- [Help: Weekly Recap](https://support.useorigin.com/hc/en-us/articles/46755330559629-Weekly-Recap)
- [Help: Daily Market Briefs](https://support.useorigin.com/hc/en-us/articles/39417950422285-About-Daily-Market-Briefs)
- [Help: Planning session cost](https://support.useorigin.com/hc/en-us/articles/27926236233613-How-much-does-it-cost-to-meet-with-an-Origin-Financial-Professional)
- [Help: General Planning Sessions](https://support.useorigin.com/hc/en-us/articles/31372738461069-General-Planning-Sessions-30-min-60-min)
- [Help: Planning session types](https://support.useorigin.com/hc/en-us/articles/32212583311373-How-do-I-choose-between-the-planning-session-types)
- [Help: Financial Planning feature](https://support.useorigin.com/hc/en-us/articles/9313399292429-How-does-Origin-s-Financial-Planning-feature-work)
- [Help: Materials after the session](https://support.useorigin.com/hc/en-us/articles/31373003267981-Will-I-receive-any-materials-after-the-session)
- [Help: Equity tool](https://support.useorigin.com/hc/en-us/articles/19428486895373-How-do-I-get-started-with-the-equity-tool)
- [Help: Equity exercise scenarios](https://support.useorigin.com/hc/en-us/articles/20271874681357-Can-I-simulate-different-scenarios-for-exercising-my-equity-grants)
- [Help: Tax filing is changing for the 2027 season](https://support.useorigin.com/hc/en-us/articles/49144029397773-Tax-filing-through-Origin-is-changing-for-the-2027-tax-filing-season)
- [Help: Who can file taxes through Origin in 2027?](https://support.useorigin.com/hc/en-us/articles/22357332266125-Who-can-file-taxes-through-Origin-in-2027)
- [Help: What is tax filing on Origin?](https://support.useorigin.com/hc/en-us/articles/22288388908557-What-is-tax-filing-on-Origin)
- [Help: Expert Assistance](https://support.useorigin.com/hc/en-us/articles/42710353746957-How-can-I-get-Expert-Assistance-and-what-s-included)
- [Help: Eligible tax situations](https://support.useorigin.com/hc/en-us/articles/22288298802189-Which-tax-situations-are-eligible-and-what-s-not)
- [Help: Three estate plan options](https://support.useorigin.com/hc/en-us/articles/38384852129421-What-are-the-differences-between-the-three-estate-plan-options)
- [Help: Estate Planning in North Carolina](https://support.useorigin.com/hc/en-us/articles/40198857606157-Is-Estate-Planning-available-for-North-Carolina)
- [Help: New and Improved Credit Score Feature](https://support.useorigin.com/hc/en-us/articles/43745440816141-New-and-Improved-Credit-Score-Feature)
- [Help: Credit score model](https://support.useorigin.com/hc/en-us/articles/20903925822221-What-model-is-used-to-calculate-my-credit-score-FICO-VantageScore-etc)
- [Help: Partner views](https://support.useorigin.com/hc/en-us/articles/36426417151757-Understanding-views-in-partner-mode)
- [Help: Partner separate logins](https://support.useorigin.com/hc/en-us/articles/23554343906829-Can-my-partner-and-I-have-separate-logins)
- [Help: Partner collaboration](https://support.useorigin.com/hc/en-us/articles/23554272725773-How-can-my-partner-and-I-collaborate-within-Origin)
- [Help: Employer stops offering Origin](https://support.useorigin.com/hc/en-us/articles/42553623238797-What-happens-if-your-employer-stops-offering-Origin)
- [Help: Notifications](https://support.useorigin.com/hc/en-us/articles/36426090601485-Where-can-I-check-my-notifications)
- [Help: Origin iOS Widgets](https://support.useorigin.com/hc/en-us/articles/35224242785293-Origin-iOS-Widgets)
- [Help: Install Origin on Windows](https://support.useorigin.com/hc/en-us/articles/48748368238989-How-to-Install-Origin-as-an-App-on-Windows)
- [Help: Mobile app international availability](https://support.useorigin.com/hc/en-us/articles/41297663347597-Is-the-mobile-app-available-internationally)
- [Help: Security](https://support.useorigin.com/hc/en-us/articles/36501427033741-Your-Security-is-Our-Priority-How-Origin-Protects-Your-Financial-Data)
- [Help: Two-factor authentication](https://support.useorigin.com/hc/en-us/articles/28844470246285-How-to-enable-two-factor-authentication-2FA-for-your-login)
- [Help: Contact support](https://support.useorigin.com/hc/en-us/articles/36769838997901-How-can-I-contact-the-support-team)
- [Help: Support hours](https://support.useorigin.com/hc/en-us/articles/20904914813581-What-are-Origin-s-Support-hours)
- [Help: How much does Origin cost?](https://support.useorigin.com/hc/en-us/articles/21022711456141-How-much-does-Origin-cost)
- [Help: Is Origin really $1 for the first year?](https://support.useorigin.com/hc/en-us/articles/40602297657357-Is-Origin-really-1-for-the-first-year)
- [Help: Can I try Origin for free?](https://support.useorigin.com/hc/en-us/articles/20957866276109-Can-I-try-Origin-for-free)
- [Help: Annual plan benefits](https://support.useorigin.com/hc/en-us/articles/27538371432461-What-additional-benefits-do-I-get-with-the-annual-plan)
- [Help: Refund Policy](https://support.useorigin.com/hc/en-us/articles/45861175784461-Refund-Policy)
- [Origin on the Apple App Store](https://apps.apple.com/us/app/origin-financial/id1637693312)
- [Origin on Google Play](https://play.google.com/store/apps/details?id=com.useorigin.employee.android&hl=en_US)
- [Rob Berger: Origin Review](https://robberger.com/origin-review/)
- [The College Investor: Origin App Review](https://thecollegeinvestor.com/53263/origin-app-review/)
- [Benzinga: Origin Financial Review](https://www.benzinga.com/money/origin-financial-review)
- [r/OriginFinancial mirror, new posts](https://reddit.birdcat.cafe/r/OriginFinancial/new)


## Albert

Albert is a United States all-in-one money app for people who want budgeting, banking, saving, investing and small cash advances in one place. It costs $19.99 a month (Standard) or $39.99 a month (Genius or Family) after a 30-day trial, and Instant borrowing needs no subscription. Albert is not a bank: it uses Stride Bank, Wells Fargo, FinWise Bank, its own SEC-registered adviser and FINRA broker, and runs on iOS, Android and web.

### Onboarding and bank linking

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Install the app and register | You create an account with an email and password; setup is said to take under 5 minutes. | Free to start, 30-day trial | [Ask] |
| Account requirements | You must be 18 or older, a US resident or citizen, with a US bank account and US mobile number. | Free | [Read] |
| Tell us about you | You answer questions about goals and needs so the app can tailor a financial plan. | Subscription, tier not stated | [Ask] |
| Connect your financial accounts | You search for your bank and sign in through Plaid to sync balances and transactions. | Subscription, tier not stated | [Ask] |
| Supported account types | You can link checking, credit cards, loans, mortgages, brokerage, retirement and 529 accounts. | Subscription, tier not stated | [Read] |
| Add a financial account manually | You can add an account by hand when your institution is not supported. | Subscription, tier not stated | [Ask] |
| Link a debit card | You link a debit card for Instant; Albert verifies it with a charge under $0.40 that it cancels. | No subscription needed | [Ask] [Flag] |
| Demo accounts | You can explore the app with sample data where no real money moves. | Free | [Read] |

### Budgeting and spending

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Automatic budget | Albert builds a monthly budget from your last 2 months of income, spending and bills. | Subscription, tier not stated | [Rule] |
| Category budgets | You set your own amount for each category and see what is left this month. | Subscription, tier not stated | [Ask] |
| Custom categories | You can add your own budget categories and edit the budget. | Subscription, tier not stated | [Ask] |
| Auto categorization | Transactions from linked accounts are sorted into categories automatically. | Subscription, tier not stated | [Rule] |
| Income tracking | Recurring deposits are labelled as income and used to predict future income; you can add cash income by hand. | Subscription, tier not stated | [Read] |
| Savings tracking | Money moved to Albert Savings or other savings accounts is totalled in a savings section. | Subscription, tier not stated | [Read] |
| Safe to spend | Albert shows how much you can safely spend at any point in the month. | Subscription, tier not stated | [Read] |
| Monitor spending | You see monthly spending and cash flow by category, account, date or merchant. | Subscription, tier not stated | [Read] |
| Custom charts | You can chart spending by transactions, categories, accounts or chosen merchants. | Subscription, tier not stated | [Read] |
| Dashboard | A customizable home view sums up accounts, spending, budget, bills and transactions. | Subscription, tier not stated | [Read] |
| Net worth tracking | Albert tracks balances and net worth across linked accounts and assets. | Subscription, tier not stated | [Read] |
| Transaction management | You can search, sort, filter and edit transaction names, categories and amounts. | Subscription, tier not stated | [Ask] |
| Family Budgeting | The Terms name a shared family budgeting feature; details were not confirmed. | Not stated | [Read] |

### Forecast

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Net worth forecast | Predicts net worth up to 5 years ahead, split into cash, investments, retirement, real estate and debt. | Genius $39.99/mo | [Read] |
| 365-day outlook | Estimates your balances, assets and debts one year from today. | Genius $39.99/mo | [Read] |
| Future cash flow | Shows expected month-to-month cash flow from income, spending and plans. | Genius $39.99/mo | [Read] |
| Milestones timeline | You add events like a vacation or new car and change their timing or cost. | Genius $39.99/mo | [Read] |
| Growth adjustments | You can add expected extra income or investment returns to change the forecast. | Genius $39.99/mo | [Read] |
| Account filters | You choose which accounts are counted in the forecast. | Genius $39.99/mo | [Read] |
| Ask Genius in Forecast | You ask Genius about your financial future or pick a suggested topic. | Genius $39.99/mo | [Read] |

### Bills and subscriptions

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Track bills and subscriptions | Albert finds recurring charges and lists paid and upcoming bills for the month. | Subscription, tier not stated | [Read] |
| Bill increase alerts | You get an alert when a recurring bill goes up. | Subscription, tier not stated | [Read] |
| Cancel subscriptions | Albert says it helps you cancel unwanted subscriptions; how it works is not stated. | Not stated | [Ask] |
| Bills to lower | The Overview tab lists the bills Albert can try to negotiate. | Not stated | [Read] |
| Bill lowering | You upload a bill photo and human negotiators from Billshark call the provider for a lower rate. | Needs Albert Cash and a Genius fee per help center; share of savings not stated | [Ask] |
| Bill lowering progress updates | You get email updates and can check negotiation progress in the Overview tab. | Same as Bill lowering | [Read] |
| Bill pay | The Terms name a bill pay service, and Genius can pay bills after you approve. | Not stated | [Ask] [Flag] |

### Genius AI assistant

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Assistant | A generative AI chat answers money and everyday questions using your linked data. | Genius $39.99/mo | [Read] |
| Approve a plan | Genius builds a step-by-step plan that you review and approve before it acts. | Genius $39.99/mo | [Ask] [Flag] |
| Move money instantly | Genius transfers money between your accounts once you approve. | Genius $39.99/mo | [Ask] [Flag] |
| Manage Smart money deposits | Genius adjusts your automatic deposit and transfer settings after approval. | Genius $39.99/mo | [Rule] [Flag] |
| Buy or sell investments | The marketing page says Genius can do this; the Terms say Genius does not execute trades. | Genius $39.99/mo | [Ask] [Flag] |
| Personal recommendations | Genius reviews spending, income and bills and suggests changes to saving, investing and spending. | Genius $39.99/mo | [Read] |
| Suggested actions | Genius learns about you over time and proposes next steps. | Genius $39.99/mo | [Read] |
| Budgeting with Genius | Genius sets up and tracks a budget for you. | Genius $39.99/mo | [Rule] |
| Spending summary | Genius sends a spending and budget report at the end of each month. | Genius $39.99/mo | [Rule] |
| Financial plan | Genius writes a long-term financial plan based on your profile. | Genius $39.99/mo | [Read] |
| Shopping | Genius finds products, compares prices and recommends buys that fit your budget. | Genius $39.99/mo | [Read] |
| Travel itineraries | Genius plans trips with places to stay, things to do and transport. | Genius $39.99/mo | [Read] |
| Find restaurants | Genius finds restaurants near you or in an area you name. | Genius $39.99/mo | [Read] |
| Custom alerts | You ask Genius for alerts on expiring insurance, card bills, goals and spending limits. | Genius $39.99/mo | [Rule] |
| Vault | You upload documents for safe storage and AI analysis, such as insurance policy breakdowns. | Genius $39.99/mo | [Read] |
| Investment research | Genius finds public disclosures and third-party research on investments you pick; it gives no recommendations. | Genius $39.99/mo | [Read] [Flag] |
| Portfolio summaries | Genius watches your portfolio and sends daily performance summaries and market insights. | Genius $39.99/mo | [Rule] [Flag] |
| Human financial experts | Reported: human advisers under the old Genius are no longer advertised. | Discontinued (reported) | [Read] |

### Instant cash advances and loans

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Instant Advance | You get a $25 to $1,000 advance with no credit check, interest or late fee. | No subscription needed | [Ask] [Flag] |
| Instant Advance repayment | The advance is due six days later and you can extend by up to seven days. | No fee stated | [Rule] [Flag] |
| Instant Advance Transfer Fee | A fee applies to the advance transfer; the amount is shown only in the app. | Fee, amount not published | [Ask] [Flag] |
| Instant Line of Credit | You draw from a $25 to $1,000 unsecured credit line from FinWise Bank, straight into Albert Cash. | No subscription needed; draw fee per draw, amount not published | [Ask] [Flag] |
| Draw limit | You can advance up to 6 times in any 30 days, and not in every state. | No subscription needed | [Read] [Flag] |
| Instant eligibility | Limits depend on linked account activity and transaction history; few qualify for $1,000. | No subscription needed | [Read] [Flag] |
| Auto pay | Repayments are taken automatically on the due date, and you can pause auto pay. | No fee stated | [Rule] [Flag] |
| Manual payment | You can repay an outstanding Instant balance by hand in Instant settings. | No fee stated | [Ask] [Flag] |
| Balance outstanding | You see each upcoming Instant payment with its amount and due date. | Free | [Read] [Flag] |
| Late repayment suspension | Paying over 15 days late blocks new advances for 30 days or more; over 30 days late, 90 days or more. | Late fees may apply on the credit line | [Rule] [Flag] |
| Boost | An offer that may raise your Instant Advance limit; amounts appear only in the app. | Not stated | [Read] [Flag] |
| Albert Loans | A personal loan of $1,000 to $10,000 from FinWise Bank or Albert, paid out upfront. | No subscription needed; up to 36% fixed APR; late fee up to $10 | [Ask] [Flag] |
| Check loan rates | You compare loan terms and APRs with a soft credit pull before a hard pull. | Free | [Read] [Flag] |
| Loan credit reporting | Loan payments may be reported to consumer reporting agencies. | Free | [Rule] [Flag] |
| Referral advance | Reported: an invited friend receives a $50 Instant advance. | Not stated | [Ask] [Flag] |

### Automatic savings

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Smart money | Albert finds small amounts you can afford and moves them to savings and investing automatically. | Subscription, tier not stated | [Rule] [Flag] |
| Smart money transfer size | Transfers are usually $5 to $100 and can reach $1,100. | Subscription, tier not stated | [Read] [Flag] |
| Edit allocation | You set what percent of each Smart money deposit is saved or invested. | Subscription, tier not stated | [Rule] [Flag] |
| Schedule | You change how often and how much Smart money sets aside. | Subscription, tier not stated | [Rule] [Flag] |
| Auto deposits toggle | You pause or resume Smart money, unless you owe an Instant balance. | Subscription, tier not stated | [Ask] [Flag] |
| Instant repayment priority | Smart money pays off an Instant balance before it saves or invests. | No subscription needed | [Rule] [Flag] |
| Emergency fund priority | When your balance is low, Smart money may skip investing and build savings first. | Subscription, tier not stated | [Rule] [Flag] |
| Albert Savings (Basic) | A savings account held at Wells Fargo that earns no interest. | Any active subscription | [Ask] [Flag] |
| High Yield Savings | Savings earn 3.50% APY as of 29 Sep 2026, with no minimum balance. | Standard $19.99/mo and up | [Rule] [Flag] |
| Savings vaults | You save toward several goals at once, each with its own target. | Subscription, tier not stated | [Rule] [Flag] |
| Prioritize Savings vaults | You rank vaults so automatic savings fill the most important goal first. | Subscription, tier not stated | [Rule] [Flag] |
| Pause goals | You can pause and restart saving toward a single goal. | Subscription, tier not stated | [Ask] [Flag] |
| Emergency fund goal | A preset goal helps you build an emergency fund. | Subscription, tier not stated | [Rule] [Flag] |
| Savings transfers | Bank deposits take 3 to 7 business days; withdrawals take up to 3, or are instant to Albert Cash. | No fee stated | [Ask] [Flag] |
| FDIC pass-through insurance | Cash and Savings funds are insured up to $250,000 through partner banks. | Included | [Read] [Flag] |

### Albert Cash

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Albert Cash account | A checking account from Stride Bank with a $0 monthly account fee and no overdrafts. | Subscription, tier not stated | [Ask] [Flag] |
| Albert Mastercard debit card | A physical debit card for purchases and ATM withdrawals. | $0 purchase fee | [Ask] [Flag] |
| Virtual cards | You can keep up to 10 virtual card numbers active for online use. | Not stated | [Ask] [Flag] |
| Freeze card | You freeze the card in the app to block new transactions. | Free | [Ask] [Flag] |
| Apple Pay and Google Pay | You can add the card to a phone wallet. | Free | [Ask] [Flag] |
| Early pay | Direct deposits can arrive up to 2 days early. | No fee stated | [Rule] [Flag] |
| Cash back rewards | You activate one merchant offer at a time and earn roughly 10% to 20% back on debit purchases. | Standard $19.99/mo and up | [Ask] [Flag] |
| Cash back payout | Earned cash back lands in Albert Cash, usually within 3 business days of settlement. | Standard $19.99/mo and up | [Rule] [Flag] |
| In-network ATMs | Withdrawals are free at 55,000+ Allpoint ATMs, with a locator in the app. | Standard $19.99/mo and up | [Ask] [Flag] |
| Out-of-network ATMs | Withdrawals elsewhere cost $3.50 plus any operator fee. | $3.50 per withdrawal | [Ask] [Flag] |
| Cash deposits | You deposit cash at Allpoint+ ATMs, up to $1,000 per deposit and $3,000 per day. | Not stated | [Ask] [Flag] |
| Mobile check deposit | You deposit a check with the app camera; funds clear in about 5 to 6 business days. | $0 | [Ask] [Flag] |
| Send a check | You mail a paper check up to $5,000 after $500 in qualifying direct deposits. | $0 | [Ask] [Flag] |
| Instant transfers between Albert accounts | Money moves at once between Cash, Savings and Investing. | $0 | [Ask] [Flag] |
| Standard bank transfer | ACH deposits take 5 to 6 business days and withdrawals take 2 to 3. | $0 | [Ask] [Flag] |
| Fast Transfer | You push money to a linked debit card in minutes, $10 minimum, up to 20 a day. | Greater of $5.99 or 1.75%, max $25 | [Ask] [Flag] |
| Domestic wires | You can send and receive US dollar wires to US banks. | Fee not stated | [Ask] [Flag] |
| Third-party transfers | You send money to other people's accounts by wire, RTP or ACH. | Genius $39.99/mo | [Ask] [Flag] |
| Overdraft fee reimbursement | Albert may refund up to two overdraft fees in total if you ask within 90 days. | Not stated | [Ask] [Flag] |
| Mastercard card benefits | The card adds extended warranty, purchase cover up to $1,000 and a $250 satisfaction guarantee. | Included with card | [Read] [Flag] |

### Investing

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Stocks and ETFs | You buy and sell thousands of US stocks and ETFs yourself with $0 commission. | Standard $19.99/mo and up | [Ask] [Flag] |
| Fractional shares | You can trade by dollar amount or by shares, starting from $1. | Standard $19.99/mo and up | [Ask] [Flag] |
| Managed by Albert | Albert's adviser runs a portfolio for you with discretion, matched by a short questionnaire. | Standard $19.99/mo and up; advisory fee is inside the subscription | [Rule] [Flag] |
| Risk-based strategies | You pick Conservative, Balanced or Growth and can hold several at different risk levels. | Standard $19.99/mo and up | [Ask] [Flag] |
| Dynamic rebalancing | Managed strategies rebalance on their own to stay on target. | Standard $19.99/mo and up | [Rule] [Flag] |
| Explore collections | You browse securities by theme, daily movers and other lists with prices and key stats. | Standard $19.99/mo and up | [Read] [Flag] |
| Research and news | Each investment shows detailed research and news. | Standard $19.99/mo and up | [Read] [Flag] |
| Auto-invest schedule | You set your own recurring investment schedule into securities or strategies. | Standard $19.99/mo and up | [Rule] [Flag] |
| Smart money investing | Smart money invests set-aside cash across the securities and strategies you weight. | Standard $19.99/mo and up | [Rule] [Flag] |
| Investing allocation | You adjust how much of each automatic deposit goes to each investment. | Standard $19.99/mo and up | [Rule] [Flag] |
| Portfolio tracking | One dashboard shows Albert and outside accounts, including 401(k), with performance over time. | Not stated | [Read] |
| Investing transfers | Deposits take 5 to 8 business days and sale proceeds settle in 2 business days. | $0 ACH; $75 outgoing ACATS; $30 returned item | [Ask] [Flag] |
| Investing documents | The app holds your account documents such as statements. | $0 for statements and confirms | [Read] [Flag] |
| SIPC protection | Investing accounts are covered up to $500,000, including $250,000 for cash. | Included | [Read] [Flag] |
| Retirement accounts | Reported: Albert does not offer IRAs or other retirement accounts. | Not offered (reported) | [Read] [Flag] |

### Credit and identity protection

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Credit score | Shows your VantageScore 3.0 from Experian and tracks changes. | Standard $19.99/mo and up | [Read] [Flag] |
| Credit report | You can view your credit report in the Protect tab. | Standard $19.99/mo and up | [Read] [Flag] |
| Credit report alerts | Alerts flag new accounts, new loan or card applications and unknown inquiries. | Standard $19.99/mo and up | [Rule] [Flag] |
| Identity verification alerts | Alerts flag high-risk identity checks made in your name. | Standard $19.99/mo and up | [Rule] |
| Dark web monitoring | Albert scans the dark web for your Social Security number and other details. | Standard $19.99/mo and up | [Rule] |
| Data breach alerts | Alerts tell you when passwords, accounts or your SSN appear in a breach. | Standard $19.99/mo and up | [Rule] |
| Fraud alerts | Linked bank and card accounts are watched 24/7 for suspicious transactions. | Standard $19.99/mo and up | [Rule] |
| Account records | Protect has an account records view; its contents were not confirmed. | Not stated | [Read] |
| Digital Privacy | Albert asks data brokers and people-finder sites to remove your details, on repeat. | Genius $39.99/mo | [Rule] |
| ID theft insurance | Up to $1 million of cover for eligible identity theft losses, underwritten by an Assurant company. | Standard $19.99/mo and up | [Read] [Flag] |
| Identity restoration support | Specialists help with identity recovery, fraud cases and lost wallets. | Standard $19.99/mo and up | [Ask] |
| Credit builder | No credit builder product was found on any Albert page opened. | Not offered (not found) | [Read] [Flag] |

### Insurance

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Albert Insurance quotes | A licensed Albert subsidiary shows non-binding renters, life and car insurance quotes from partner carriers. | Not stated | [Read] [Flag] |
| Expiring policy alerts | Genius can alert you before an insurance policy expires. | Genius $39.99/mo | [Rule] |

### Alerts and reports

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Large transaction alerts | You are told when a large transaction posts. | Subscription, tier not stated | [Rule] |
| Low balance alerts | You are told when an account balance runs low. | Subscription, tier not stated | [Rule] |
| Spending trend alerts | You are told about changes in your spending trends. | Subscription, tier not stated | [Rule] |
| Notification settings | You switch each push or email notification on or off in Profile. | Free | [Ask] |
| Text messages | You can text Albert at 639-37, including to cancel your subscription. | Free | [Ask] |

### Security and support

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| Encryption and credentials | Data is sent with SSL and Albert says it does not store bank passwords. | Free | [Read] |
| Virtual assistant chat | A virtual support agent answers questions and guides common actions in app and on web. | Free | [Read] |
| Live support | The virtual agent can hand you to a human by text or email; no hours are listed. | Free | [Ask] |
| Phone line | Calling (844) 891-9309 plays support options or takes a voicemail. | Free | [Ask] |
| Help Center | A public library of self-help articles and legal disclosures. | Free | [Read] |
| Deactivate subscription | You cancel in app, on web, by text or email once Savings and Investing are at $0. | Free | [Ask] |
| Close account | You close everything once all balances are $0 and all advances or loans are repaid. | Free | [Ask] [Flag] |

### Plans

| Feature | What it does | Plan | Upmore |
| --- | --- | --- | --- |
| 30-day trial | You can try a plan for 30 days before the first charge; it then renews monthly. | Free for 30 days | [Rule] |
| Standard | Includes investing, identity protection, credit score, cash back, fee-free ATMs and High Yield Savings. | $19.99/mo | [Rule] |
| Genius | Adds the Genius AI assistant, Forecast, Digital Privacy and third-party transfers to Standard. | $39.99/mo | [Rule] |
| Family Plan | Covers the owner and up to 4 invited members with Standard and Genius benefits. | $39.99/mo | [Rule] |

### Business model and licensing

- Albert earns mostly from monthly subscriptions of $19.99 to $39.99, which also bundle the managed portfolio advisory fee.
- It also earns Instant transfer and draw fees, Fast Transfer fees, loan interest up to 36% APR, card interchange, and insurance partner commissions.
- Albert Corporation is not a bank. Stride Bank, N.A. provides checking and the card, Wells Fargo, N.A. holds savings, and FinWise Bank issues credit lines and loans.
- Albert Investments, LLC is the SEC-registered adviser, Albert Securities, LLC is the FINRA and SIPC broker, and Apex Clearing holds custody.
- Plaid links bank accounts. Billshark negotiates bills, CSID runs identity monitoring, and its privacy policy names Anthropic, Google and OpenAI as AI providers.
- No FTC action against Albert was found. A reported $5.2M class action settlement (Feeman v. Albert, 2025) covered advance transfer fees charged to servicemembers.

### What users say is missing or broken

- Cancelling is hard and charges continue after cancelling a trial or closing the app (Trustpilot, October 2026; Google Play, February 2026).
- Support is text and email only, with no easy way to reach a person by phone (Trustpilot, October 2026; App Store reviews).
- Transfers and withdrawals are slow, and balances must be zero before closing (App Store reviews, dated 2021 to 2023; Google Play).
- Bank and debit card linking fails for some users (Trustpilot, October 2026).
- Instant transfer fees are not published, there are no retirement accounts, and human advisers are gone (WalletGrower review, July 2026, reported).

### Sources

- [Albert home page](https://albert.com/)
- [Albert Genius](https://albert.com/about/genius)
- [Albert Budgeting](https://albert.com/about/budgeting)
- [Albert Forecast](https://albert.com/about/forecasting)
- [Smart money](https://albert.com/about/smart-money)
- [Albert Savings](https://albert.com/about/saving)
- [Albert Investing](https://albert.com/about/investing)
- [Albert Cash](https://albert.com/about/cash)
- [Get better rates and save on bills](https://albert.com/about/lower-bills)
- [Credit monitoring and financial protection](https://albert.com/about/financial-protection)
- [Instant landing page](https://albert.com/apply/instant-need-cash-today)
- [Newsroom announcements](https://albert.com/newsroom/announcements)
- [Introducing Forecasting on Albert](https://albert.com/newsroom/article/introducing-forecasting-on-albert)
- [Albert introduces Genius](https://albert.com/newsroom/article/albert-introduces-genius)
- [How much does Albert cost?](https://help.albert.com/hc/en-us/articles/21583583733271)
- [Albert's Terms of Use](https://help.albert.com/hc/en-us/articles/16768060313111-Albert-s-Terms-of-Use)
- [Albert's Privacy Policy](https://help.albert.com/hc/en-us/articles/16770180178583-Albert-s-Privacy-Policy)
- [Getting set up](https://help.albert.com/hc/en-us/articles/115002423774-Getting-set-up)
- [Albert account requirements](https://help.albert.com/hc/en-us/articles/360010938174-Albert-account-requirements)
- [Connect your financial accounts](https://help.albert.com/hc/en-us/articles/360011034613-Connect-your-financial-accounts)
- [How you're protected](https://help.albert.com/hc/en-us/articles/115002423654-How-you-re-protected)
- [How does my budget work?](https://help.albert.com/hc/en-us/articles/223114967-How-does-my-budget-work-)
- [How do I set my budget?](https://help.albert.com/hc/en-us/articles/26013808734743-How-do-I-set-my-budget)
- [How does bill lowering work?](https://help.albert.com/hc/en-us/articles/360011400493-How-does-bill-lowering-work)
- [What is Albert Genius?](https://help.albert.com/hc/en-us/articles/36895802722199-What-is-Albert-Genius)
- [What can Albert Genius do?](https://help.albert.com/hc/en-us/articles/36895922286999-What-can-Albert-Genius-do)
- [What is Albert Instant?](https://help.albert.com/hc/en-us/articles/40059940835863-What-is-Albert-Instant)
- [How do I qualify for advances with Instant?](https://help.albert.com/hc/en-us/articles/40060372036631-How-do-I-qualify-for-advances-with-Instant)
- [How do I advance with Instant?](https://help.albert.com/hc/en-us/articles/40060242574743-How-do-I-advance-with-Instant)
- [How does Instant advance repayment work?](https://help.albert.com/hc/en-us/articles/40060432888471-How-does-Instant-advance-repayment-work)
- [What are Albert Loans?](https://help.albert.com/hc/en-us/articles/40060104266391-What-are-Albert-Loans)
- [How does Smart money work?](https://help.albert.com/hc/en-us/articles/16987886331287-How-does-Smart-money-work)
- [How do I upgrade to high yield savings?](https://help.albert.com/hc/en-us/articles/223174048-How-do-I-upgrade-to-high-yield-savings)
- [How does Investing work?](https://help.albert.com/hc/en-us/articles/16988195034135-How-does-Investing-work)
- [How do I invest in stocks and ETFs?](https://help.albert.com/hc/en-us/articles/16988253553815-How-do-I-invest-in-stocks-and-ETFs)
- [What are strategies managed by Albert?](https://help.albert.com/hc/en-us/articles/360034148113-What-are-strategies-managed-by-Albert)
- [Commissions and Fees](https://help.albert.com/hc/en-us/articles/16795407078423-Commissions-and-Fees)
- [Albert Investments Portfolio Management Agreement](https://help.albert.com/hc/en-us/articles/16795659697815-Albert-Investments-Portfolio-Management-Agreement)
- [Albert Securities Form CRS (dated April 2021)](https://cdn.albert.com/static/pdf/albert-securities-form-crs.pdf)
- [Deposit Account Agreement (Stride Bank)](https://help.albert.com/hc/en-us/articles/32005754647063-Deposit-Account-Agreement)
- [Albert Cash Account Agreement (Sutton Bank, dated April 2025)](https://help.albert.com/hc/en-us/articles/16789410778391-Albert-Cash-Account-Agreement)
- [Albert Cash Short Form Fee disclosure](https://help.albert.com/hc/en-us/articles/16792860753943-Albert-Cash-Short-Form-Fee-disclosure)
- [How does early pay work?](https://help.albert.com/hc/en-us/articles/1500009168682-How-does-early-pay-work)
- [How do I activate cash back rewards?](https://help.albert.com/hc/en-us/articles/4402686675735-How-do-I-activate-cash-back-rewards)
- [What benefits come with my Albert Cash debit card?](https://help.albert.com/hc/en-us/articles/4406765438871-What-benefits-come-with-my-Albert-Cash-debit-card)
- [When will my funds be available?](https://help.albert.com/hc/en-us/articles/4411794968727-When-will-my-funds-be-available)
- [How does Albert Protect work?](https://help.albert.com/hc/en-us/articles/14482884226455-How-does-Albert-Protect-work)
- [Managing your notifications](https://help.albert.com/hc/en-us/articles/360049470473-Managing-your-notifications)
- [How to contact Albert](https://help.albert.com/hc/en-us/articles/360036374534-How-to-contact-Albert)
- [Deactivating or closing your Albert account](https://help.albert.com/hc/en-us/articles/360005411894-Deactivating-or-closing-your-Albert-account)
- [Albert on the App Store](https://apps.apple.com/us/app/albert-budgeting-and-banking/id1057771088)
- [Albert on Google Play](https://play.google.com/store/apps/details?id=com.meetalbert&hl=en_US&gl=US)
- [Albert reviews on Trustpilot](https://www.trustpilot.com/review/albert.com)
- [FTC press release listing](https://www.ftc.gov/news-events/news/press-releases?search_api_fulltext=albert)
- [Orrick: FTC acts against finance app (a different company)](https://infobytes.orrick.com/2025-04-11/ftc-acts-against-finance-app-for-alleged-deceptive-cash-advance-practices/)
- [WalletGrower Albert review, July 2026](https://walletgrower.com/earned-wage-access/reviews/albert)
- [FinCompareLab Albert pricing guide, August 2026](https://www.fincomparelab.com/guides/albert-pricing/)


## What all five share, and what only one has

The five split into three copy-investing apps and two all-in-one money apps, and no single app covers both sides.

### At a glance

| App | Features listed | Price | Holds the user's money itself? | How copying or investing works | Has an AI agent or assistant? |
| --- | --- | --- | --- | --- | --- |
| dub | 144 | $9.99 a month or $89.99 a year, plus 0% to 2.5% on Premium portfolios | Yes, in a dub brokerage account with Apex Clearing custody | Auto-Copy mirrors every creator trade inside the dub account | Arlo explains and finds portfolios but does not trade |
| Alinea | 85, including 6 checked-and-not-found rows | $120 a year, or $5 to $12 a month for some users | Yes, in an Alinea account held at DriveWealth | Managed portfolios and themed Playlists, with no live mirror of a named person | Allie answers questions but does not trade or move money |
| Autopilot | 67 | Basic is free, Premium is $29.99 to $199.99 per quarter | No, trades run in the user's own linked brokerage | Copies politician, hedge fund, AI and creator portfolios, $500 minimum each | No assistant listed, only AI-built portfolios to copy |
| Origin | 209 | $99 a year or $12.99 a month, $1 first year | Partly: linked accounts are read-only, Origin Invest sits at DriveWealth | Automated index account and Stock Bundles, with no copying | AI Advisor chats, runs daily checks and lists ranked Actions |
| Albert | 148 | $19.99 or $39.99 a month after a 30-day trial | Yes, through Stride Bank, Wells Fargo and Apex Clearing | Self-directed stocks and ETFs plus managed strategies, with no copying | Genius builds a plan and moves money after approval |

### Shared by most of the five

- A paid subscription is the main income for all five.
- All five sit behind an SEC-registered investment adviser.
- All five offer a free trial, a cancel option and email support.
- All five ask risk or goal questions at setup.
- All five group stocks by theme for browsing or buying.
- Plaid bank linking: dub, Alinea, Origin, Albert; reported only for Autopilot.
- Recurring deposits or investments: dub, Alinea, Origin, Albert.
- Portfolios managed and rebalanced for the user: dub, Alinea, Origin, Albert.
- Politician and hedge fund tracker portfolios: dub, Alinea, Autopilot.
- Portfolios built with AI models: dub (status unconfirmed), Alinea, Autopilot.
- AI chat that answers money questions: dub, Alinea, Origin, Albert.
- Rules to keep chosen stocks or investment types out: dub, Alinea, Autopilot (reported).
- Budgets, net worth, bill tracking and forecasts: Origin and Albert only.
- Credit score, dark web monitoring and identity theft insurance: Origin and Albert only.

### Only one app has it

| App | Feature | Why it matters for Upmore |
| --- | --- | --- |
| dub | Basket trade rebalancing, where creator and copiers trade together at one price | Copies made through partner brokerages may fill at different prices, so Upmore should show that gap. |
| dub | Fee Impact Calculator comparing returns before and after a portfolio fee | A clear cost view fits an agent that asks before it acts. |
| dub | Alpha Score, rating returns 1 to 5 after removing market and sector effects | Gives users a simple way to judge a public portfolio before approving a copy. |
| dub | Public requirements: $1,000 of own deposits, 30 days of history, photo and bio | A ready-made quality bar for which public portfolios Upmore lets users copy. |
| dub | Capacity limit that closes a user portfolio at $15 million of copier money | Shows a safety limit Upmore may need once many users copy one portfolio. |
| Alinea | Event contracts at $0.03 per contract, per side | A product Upmore does not plan, and its row carries a [Flag] tag. |
| Alinea | Access to more than 20 cryptocurrencies | The only app of the five that lists crypto trading, which matters for a Coinbase link. |
| Alinea | Lessons with quizzes, reported as one a day read aloud by Allie | Teaching is low regulation, and its rows carry no [Flag] tag. |
| Alinea | Lifetime Plan with one upfront payment and no later fees | A pricing idea none of the other four files show. |
| Autopilot | Connect your Brokerage, so money never moves to Autopilot | This is the same partner model Upmore plans with Robinhood and Public. |
| Autopilot | Free Basic tier with self-directed copying and one first investment | The only free tier among the five, which sets a price floor for copying. |
| Autopilot | Notification frequency, from real time to a weekly summary (reported) | Upmore reports without being asked, so users need control over how often. |
| Autopilot | Skip small positions when copying (reported) | Cuts the number of approvals a user must give for each copied portfolio. |
| Autopilot | Public Holdings pays $50 to $5,000 for each newly funded referred account | Shows that a brokerage partner can also be a source of income. |
| Origin | Proactive monitoring with hundreds of daily checks and a Financial Health Score | The closest match to Upmore reporting without being asked. |
| Origin | AI Memory saving up to 50 personal facts and 50 account corrections | An agent that acts for a user needs to remember corrections. |
| Origin | Estate planning: Basic Will, Full Will and Trust | A paid add-on area far outside Upmore's plan, and all carry [Flag] tags. |
| Origin | Equity tracker and Exercise Simulator for employee stock grants | Shows how deep the all-accounts view can go for users with stock pay. |
| Origin | Tax filing powered by April Tax, employer plans only for the 2027 season | Origin pulled this from direct subscribers, a warning about costly side features. |
| Albert | Approve a plan: Genius builds steps, then acts after the user approves | The only approve-then-act agent in the five files, so it is Upmore's nearest rival. |
| Albert | Bill lowering, where Billshark negotiators call the provider | Upmore pays and cancels bills, so users may expect negotiation too. |
| Albert | Instant Advance of $25 to $1,000 with no credit check | Lending carries [Flag] tags on every row and is not in Upmore's plan. |
| Albert | Smart money, which moves small affordable amounts to savings and investing | Automatic moves without a prompt are the opposite of Upmore's ask-first rule. |
| Albert | Albert Cash checking account with debit card and cash back | Holding deposits needs partner banks, which Upmore avoids by connecting to accounts. |

### Gaps none of the five fill

- No file shows an app that both copies portfolios and tracks budgets, bills and net worth.
- No file shows an app finishing a subscription cancellation itself. Origin only opens the provider's page, and Albert does not say how it helps.
- No file shows an app joining a subscription for the user.
- No file shows an app splitting a bill between people. Origin's split only divides one transaction across categories.
- No file shows an app claiming refunds from merchants or class action money for the user.
- No file shows trading inside a linked Coinbase account. Origin only reads linked crypto accounts.
- No file confirms an AI assistant placing investment trades. Albert's and Alinea's claims are contradicted by their own terms.

### Build order suggestion

1. Start with read-only account linking, spending and net worth. Origin and Albert both have them, and the rows carry no [Flag] tag.
2. Add recurring bill and subscription detection with price-rise alerts. Origin and Albert both have it, with no [Flag] tag.
3. Add reports without being asked: daily brief, weekly recap, monthly summary and custom alerts. Alinea, Origin and Albert each have some.
4. Add the approve-then-act flow for cancelling subscriptions and paying bills. Only Albert comes close, and its bill pay row carries a [Flag] tag.
5. Add portfolio discovery: rankings, search, portfolio pages and risk metrics. dub and Autopilot both have it, and most dub rows are [Read] only.
6. Add brokerage connection and approval-based copying on Autopilot's model. Every row is [Flag] tagged, but no money is held.
7. Add tracker portfolios, recurring investing and stock exclusion lists. Three or four apps have each, and all rows carry [Flag] tags.
8. Leave holding money, cash accounts, advances and loans until last or skip them. Every such row carries a [Flag] tag.

## Sources and limits

Each app's sources are listed at the end of its own section. A separate checker re-opened official pages for 31 of the highest-stakes claims: 29 confirmed, 1 corrected in the dub section, and 1 could not be checked.

- **Alinea's 7-day trial** comes from a third-party review only.
- **dub's price may vary by user.** The App Store also lists $12.99 a month and up to $119.99 a year.
- **Autopilot:** about a third of its rows are "reported" only.
- **Albert:** the Instant Advance transfer fee is shown only inside the app. Its marketing says Genius can trade; its terms say it does not.
- **Reddit was blocked for every app.**
- **Prices and rates are as of October 11, 2026** and change often.
