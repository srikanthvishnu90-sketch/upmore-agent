# Upmore: Full Agent Capability List

Oct 11, 2026

<!-- Owner's document, pasted into the build session on 2026-10-11. Kept verbatim. The paste ends inside section 7
     ("Refunds and disputes"); the sections after it and the "[Flag]" section the tags refer to were not included. -->

## How to read this

Every bullet is one thing a user can ask for, or one thing the agent does unprompted. Each ends with a tag for how much freedom the agent gets.

- **[Read]** The agent only looks and reports. Nothing changes in the outside world.
- **[Ask]** The agent prepares everything, shows a preview, and acts only after the user approves that exact action.
- **[Rule]** The user approves one exact recurring action in advance (payee, amount cap, schedule). The agent repeats only that. Anything outside the rule goes back to [Ask].
- **[Built in]** Behaviour of the agent itself that moves no money and contacts no one: records, safety checks, memory.
- **[Flag]** Regulated or risky. See the last section before building it.

**Approval rule:** Upmore works like Instinct. It never moves money, cancels, signs up, files or sends anything in the user's name without an approval. There is no mode where it acts on its own judgment.

## 1. See everything

The agent cannot act on money it cannot see, so this layer comes first.

### Accounts

- Connect checking, savings, credit cards, brokerage, retirement, loans, BNPL, payroll and crypto accounts. [Read]
- Connect email to read receipts, bills, renewal notices and shipping updates. [Read]
- Read a photo or PDF of any bill, statement, lease, pay stub or letter. [Read]
- Keep one list of every account the user has, including forgotten ones found in email. [Read]
- Warn when a connection breaks, and reconnect it. [Ask]

### Spending

- Show where money went: by merchant, category, person, place and time. [Read]
- Answer plain questions: "How much did I spend on food this month?" [Read]
- Fix wrong categories and remember the fix. [Built in]
- Spot spending that is unusual for this user. [Read]
- Find every recurring charge, including annual ones and free trials about to bill. [Read]
- Split a single purchase into categories (one Target run = groceries + clothes). [Built in]
- Compare this month to last month and to the user's own average. [Read]
- Show spending by card, so the user knows which card carries what. [Read]

### The numbers

- Safe to spend: money free until payday, as a total and per day. [Read]
- Net worth: everything owned minus everything owed, tracked over time. [Read]
- Cash flow forecast: balance projected 90 days ahead, with assumptions shown. [Read]
- Runway: how many days the user lasts on current cash. [Read]
- Upcoming: every bill, payday and renewal on one calendar. [Read]
- Affordability: "Can I afford this, and if not, when?" [Read]
- What-if: "What changes if I cancel this, move, or take this job?" [Read]
- Show the math behind any number on request. [Read]

## 2. Reports and alerts without being asked

The agent speaks first. The user sets how often, and which channel.

### Scheduled reports

- Daily market close: how the user's portfolio did today, in dollars and percent, with the top movers and why. [Read]
- Morning brief: balance, safe to spend, bills due today, anything the agent did overnight. [Read]
- Weekly recap: money in, money out, what changed, what is coming. [Read]
- Monthly close: the full month in 90 seconds. [Read]
- Year in money: annual review, including confirmed dollars Upmore saved or recovered. [Read]
- Custom report on any schedule: "Every Friday, tell me my food spend." [Rule]

### Alerts

- Bill due soon, and whether the balance covers it. [Read]
- Balance about to go below zero or below a floor the user set. [Read]
- Paycheck landed, late, or a different amount than usual. [Read]
- Price went up on a subscription or bill. [Read]
- Free trial ends in 3 days. [Read]
- Charged twice, or charged by a merchant the user has never used. [Read]
- Large or unusual transaction. [Read]
- A stock the user holds moved more than a set percent, or reports earnings tomorrow. [Read]
- Dividend or interest paid. [Read]
- Credit score changed, or a new account appeared on the credit report. [Read]
- Refund promised but not received after the stated window. [Read]
- A deadline is near: tax date, FSA use-it-or-lose-it, open enrollment, class action claim date. [Read]
- A better rate exists for the user's savings, card, loan or insurance. [Read]
- A new claim or payout matches the user (see section 7). [Read]

### After the agent acts

- Receipt for every action: what it did, proof, and how to undo it. [Built in]
- Report failures as plainly as successes. [Built in]
- Count money as saved or earned only after it is confirmed in the account. [Built in]

## 3. Investing

Every trade runs on a licensed broker partner. Almost everything here carries the adviser flag in the last section.

### Copy and mirror

- "Copy Leopold Aschenbrenner's portfolio and split my money the same way." The agent reads the fund's latest public filing, sizes each position to the user's dollars, and buys it. [Ask] [Flag]
- Copy any fund manager, member of Congress, or public portfolio that files disclosures. [Ask] [Flag]
- Re-copy automatically each time a new filing comes out. [Rule] [Flag]
- Show how old the copied data is and what the filing leaves out, before the user buys. [Read]
- Copy a friend's portfolio if the friend shares it. [Ask] [Flag]
- Copy an index, sector or theme: "Put $500 into AI chip companies." [Ask] [Flag]
- Track how the copy performed against the original and against the S&P 500. [Read]

### Buy, sell, manage

- Buy or sell a stock, ETF or fraction of a share by plain sentence. [Ask]
- Recurring buys: "$25 into VOO every payday." [Rule]
- Round-ups: invest spare change from card purchases. [Rule]
- Invest a set percent of every paycheck or windfall. [Rule]
- Rebalance back to a target split when it drifts. [Ask]
- Reinvest dividends. [Rule]
- Set price orders: "Buy if it drops to $150," "Sell if it falls 10%." [Ask]
- Sweep idle cash into a money market fund or Treasury bills. [Ask]
- Sell losing positions to cut the tax bill, avoiding wash-sale mistakes. [Ask] [Flag]
- Move a brokerage account from one broker to another. [Ask]
- Buy crypto through a licensed partner. [Ask] [Flag]

### Understand

- Explain today's move in the portfolio in one paragraph. [Read]
- Show total return, fees paid, and performance against a benchmark. [Read]
- Show how concentrated the portfolio is in one stock or sector. [Read]
- Summarize earnings and news for holdings only. [Read]
- Compare two funds on fees and holdings. [Read]
- Watchlist with alerts. [Read]
- Show the tax hit of a sale before the user sells. [Read]

### Retirement

- Open a Roth or traditional IRA and fund it on a schedule. [Ask]
- Check the user is getting the full employer 401(k) match. [Read]
- Find old 401(k)s from past jobs and roll them over. [Ask]
- Track contribution limits and warn before going over. [Read]

## 4. Paying what is owed

The agent pays on licensed payment rails, never from an account Upmore itself holds.

### Bills and rent

- Pay rent on the due date, through the landlord's portal, ACH or mailed check. [Rule]
- Pay utilities, phone, internet, insurance and tuition. [Rule]
- Pay only if the amount is within a tolerance of the usual bill; otherwise ask. [Rule]
- Check the balance covers the bill first, and move money to cover it if allowed. [Rule]
- Pay any one-off bill from a photo or forwarded email. [Ask]
- Time payments around payday to avoid overdrafts. [Rule]
- Ask a biller to move the due date. [Ask]
- Catch a late fee and ask for it to be waived. [Ask]
- Report rent payments to the credit bureaus where a partner supports it. [Ask]
- Set up or cancel autopay at the biller. [Ask]

### Buy now, pay later

- Pay Klarna, Affirm, Afterpay, Zip and PayPal Pay Later instalments on time. [Rule]
- Show every BNPL plan in one list with the total still owed. [Read]
- Pay a plan off early when cash allows. [Ask]
- Warn before a new BNPL plan would push next month negative. [Read]
- Ask to reschedule an instalment the user cannot cover. [Ask]

### Credit cards and debt

- Pay the statement balance in full, or the minimum, by rule. [Rule]
- Pay cards early to lower reported utilization before the statement closes. [Rule]
- Build a payoff plan across all debts, highest rate first or smallest first. [Read]
- Send extra money to the right debt each month. [Rule]
- Find and apply for a balance transfer or consolidation loan. [Ask] [Flag]
- Call or message a lender to ask for a lower rate or a hardship plan. [Ask] [Flag]
- Ask a collector to prove a debt is real before the user pays a cent. [Ask] [Flag]
- Pay friends and family back through Venmo, Zelle or Cash App. [Ask]

### Student loans

- Pay loans, and compare repayment plans for this user's income. [Read]
- Fill in income-driven repayment and forgiveness forms. [Ask]
- Track progress toward forgiveness. [Read]
- Check refinancing offers. [Ask] [Flag]

### Credit health

- Track score and explain each change. [Read]
- Dispute errors on a credit report. [Ask] [Flag]
- Freeze and unfreeze credit at all three bureaus. [Ask]
- Ask for credit limit increases. [Ask]
- Recommend which card to use for each purchase to earn the most rewards. [Read]

## 5. Subscriptions

### Cancel and cut

- Cancel any subscription by one sentence, and return proof of cancellation. [Ask]
- Cancel a free trial the day before it bills. [Rule]
- Find subscriptions the user has not used in 60 days and offer to cancel. [Read]
- Find duplicates: two music services, two cloud storage plans. [Read]
- Pause instead of cancel where the service allows. [Ask]
- Downgrade to a cheaper tier. [Ask]
- Chase a refund for a renewal the user did not want. [Ask]
- Cancel a gym membership, including the letter some gyms demand. [Ask]
- Keep going when the first cancel attempt fails: chat, phone, email, letter. [Built in]

### Join and switch

- Sign the user up for a subscription: "Get me Spotify." [Ask]
- Pick the cheapest way in: student price, annual plan, bundle, carrier perk. [Read]
- Start a free trial and set its cancel date at the same moment. [Ask]
- Switch to an annual plan when it saves money and the user clearly uses it. [Ask]
- Rotate streaming services: subscribe for one show, cancel after. [Rule]
- Switch phone, internet or insurance provider and handle the changeover. [Ask]
- Re-subscribe to something cancelled, with one sentence. [Ask]

### Negotiate and share

- Negotiate internet, phone and cable bills down. [Ask]
- Ask for a retention discount before cancelling. [Ask]
- Set up a family or group plan and collect each person's share monthly. [Rule]
- Move a subscription to a different card. [Ask]
- Update the card on every merchant after a card is replaced. [Ask]

## 6. Splitting and shared money

- Split a bill from a receipt photo, item by item, with tax and tip. [Ask]
- Split evenly, by percent, by income, or by who ordered what. [Ask]
- Send payment requests to each person and track who has paid. [Ask]
- Nudge people who have not paid, in the user's tone. [Rule]
- Split rent and utilities with roommates every month. [Rule]
- Run a trip or event tab and settle it in the fewest payments at the end. [Ask]
- Split a card transaction straight from the feed: "Split last night's dinner with Sam." [Ask]
- Keep a running balance with each person: who owes whom. [Read]
- Pay the user's own share when someone else requests it. [Ask]
- Shared goal with a partner or friends, with each person's progress. [Read]
- Couple mode: shared bills visible, personal spending private. [Read]
- Group gift or fundraiser pool. [Ask]
- Agent-to-agent: one user's Upmore settles directly with another user's Upmore. [Ask]
- Send money to family abroad at the cheapest rate. [Ask] [Flag]
- Allowance and chore payments for kids. [Rule] [Flag]

## 7. Claiming money the user is owed

### Lawsuits and settlements

- Find class action settlements the user fits, by matching purchases, accounts and email receipts to open claims. [Read]
- Fill in and file the claim form, attaching proof of purchase. [Ask] [Flag]
- Track each claim to payout and confirm the money arrived. [Read]
- Alert on new settlements that match, and on claim deadlines. [Read]
- Find data breach settlements for breaches the user was part of. [Read]
- Find FTC and state attorney general refund programs the user qualifies for. [Read]

### Refunds and disputes

- Request a refund for a late, damaged, missing or wrong order. [Ask]
- Return an item: start the return, get the label, track the refund. [Ask]
