# Upmore Methods 3: Saving Money

October 11, 2026

## How to read each method card

Each method is one card Upmore can build as a feature. Within a section, methods run from the most money saved for the time spent to the least. Methods 1 and 2 cover making money.

- **What it is:** the method in one sentence.
- **Real example:** a named, current offer or price with real numbers and the month it was checked.
- **Saving, effort, odds, how often:** what it saves, how long it takes, what can go wrong, and how often it repeats.
- **How Upmore runs it:** how the agent spots it, what it asks the user to approve, and how it confirms the saving.
- **What Upmore needs:** the data, partner or licence required.
- **Tag:** [Read] looks and reports, [Ask] acts after one approval, [Rule] repeats an approved action, [Flag] is regulated.

Prices and programs change often. Every number was checked in October 2026, and Upmore must re-check the live terms before showing one to a user.

## Subscriptions

Most people pay twice for streaming they already get free, or pay full price when a cheaper tier, discount or pause would do.

### Cancel subscriptions you no longer use

**What it is:** Find recurring charges the user has stopped using and cancel them.

**Real example:** Netflix Standard costs $19.99 a month in the US, which is $239.88 a year (Netflix Help, checked October 2026).

- **Saving:** $60 to $300 per unused service per year
- **Effort:** 5 to 10 minutes per service, one-time
- **Odds and risk:** Very likely to save. Some sites hide the cancel button, and the federal click-to-cancel rule was struck down in July 2025.
- **How often:** Once per service, then a check every quarter

**How Upmore runs it:**

1. Scans card and bank charges for repeating merchants like NETFLIX.COM, and checks email for login or usage signs.
2. Shows each charge, its yearly cost and last-used signal, and asks "Cancel this?"
3. Walks the user through cancel or sends the cancel request, then confirms no new charge appears next cycle.

**What Upmore needs:** Card and bank transaction feed, read-only email access, a merchant cancel-steps library

**Tag:** [Ask]

**Source:** [Plans and Pricing, Netflix Help Center](https://help.netflix.com/en/node/24926)

### Use the streaming your phone plan already includes (creative)

**What it is:** Some phone plans include streaming services, so the user can stop paying for them separately.

**Real example:** T-Mobile Experience Beyond ($100 a month, one line) includes Netflix Standard with Ads and a 12-month Hulu with Ads promo, as reported by WhistleOut (checked October 2026).

- **Saving:** About $108 to $204 per year (Netflix with ads $8.99 a month plus Hulu $7.99 a month)
- **Effort:** 15 to 30 minutes, one-time
- **Odds and risk:** Likely if the user is on an eligible plan. The Hulu promo ends after 12 months and then bills $7.99 a month.
- **How often:** Once, then a check when the promo ends

**How Upmore runs it:**

1. Matches the carrier bill plan name against a perks list and spots a separate Netflix or Hulu charge.
2. Shows "Your plan already includes Netflix with ads" and asks to activate the perk and cancel the paid one.
3. Guides activation in the carrier app, cancels the paid charge, and sets a reminder before the promo ends.

**What Upmore needs:** Carrier bill emails or PDFs, card feed, a maintained carrier perks database

**Tag:** [Ask]

**Source:** [T-Mobile Experience Beyond Plan, WhistleOut](https://www.whistleout.com/CellPhones/Carriers/T-Mobile/Personal/T-Mobile-Experience-Beyond-Plan)

### Turn on the streaming credit your card already gives (creative)

**What it is:** Some credit cards refund part of a streaming bill if that bill is charged to the card.

**Real example:** Amex Blue Cash Preferred gives up to $10 a month back on Disney+, Hulu or ESPN subscriptions, $120 a year. The fee is $0 the first year, then $95 (Amex, checked October 2026).

- **Saving:** Up to $120 per year
- **Effort:** 10 minutes, one-time
- **Odds and risk:** Very likely if the user already holds the card. Opening a card just for this rarely pays after the $95 fee.
- **How often:** Once

**How Upmore runs it:**

1. Sees a Disney+, Hulu or ESPN charge on a different card while the user holds Blue Cash Preferred.
2. Shows "Move this bill to your Amex to get $10 back each month" and asks approval.
3. Guides the payment-method change, then checks each statement for the $10 credit.

**What Upmore needs:** Card account feed with card product names, statement credit detection

**Tag:** [Ask]

**Source:** [Blue Cash Preferred Card, American Express](https://www.americanexpress.com/us/credit-cards/card/blue-cash-preferred/)

### Use the streaming that comes with Walmart+ (creative)

**What it is:** Walmart+ members can pick Peacock Premium or Paramount+ Essential at no extra cost.

**Real example:** Walmart+ costs $98 a year and includes Peacock Premium or Paramount+ Essential with ads. Peacock Premium alone is $12.99 a month, as reported by CableTV.com (checked October 2026).

- **Saving:** About $100 to $156 per year
- **Effort:** 10 minutes, one-time
- **Odds and risk:** Very likely for Walmart+ members. The included plan has ads, and you can switch only every 90 days.
- **How often:** Once, with a switch option every 90 days

**How Upmore runs it:**

1. Finds both a Walmart+ charge and a separate Peacock or Paramount+ charge.
2. Shows the overlap and asks to link the free plan and cancel the paid one.
3. Guides linking in the Walmart app, cancels the paid charge, and confirms it stops next month.

**What Upmore needs:** Card feed, read-only email for Walmart+ receipts

**Tag:** [Ask]

**Source:** [Walmart+ membership](https://www.walmart.com/plus)

### Switch to the ad-supported tier

**What it is:** Move a streaming plan to its cheaper tier with ads.

**Real example:** Netflix Standard is $19.99 a month and Standard with ads is $8.99 (Netflix Help, checked October 2026).

- **Saving:** About $132 per year on Netflix alone
- **Effort:** 5 minutes, one-time
- **Odds and risk:** Certain saving. The user sees ads and may lose some features.
- **How often:** Once

**How Upmore runs it:**

1. Reads the charge amount and matches it to the provider's price list to find the current tier.
2. Shows the cheaper tier, the yearly saving, and the trade-off, then asks approval.
3. Guides the plan change and confirms the lower charge on the next bill.

**What Upmore needs:** Card feed, a current price table per service

**Tag:** [Ask]

**Source:** [Plans and Pricing, Netflix Help Center](https://help.netflix.com/en/node/24926)

### Get student pricing on music and video

**What it is:** Verified college students can pay about half price, often with a second service included.

**Real example:** Spotify Student is $6.99 a month versus $12.99 and includes a Hulu plan. Apple Music Student is $6.99 and includes Apple TV (both checked October 2026).

- **Saving:** About $72 per year on Spotify, plus the value of Hulu
- **Effort:** 15 minutes, one-time, then yearly verification
- **Odds and risk:** Likely for enrolled students. Price returns to full when you stop qualifying.
- **How often:** Once, then yearly re-verify

**How Upmore runs it:**

1. Spots full-price Spotify or Apple Music and a .edu email or tuition payment in the user's data.
2. Shows "You may qualify for student pricing" and asks to start verification.
3. Guides the verification and plan switch, then confirms the $6.99 charge.

**What Upmore needs:** Card feed, read-only email, student status signal

**Tag:** [Ask]

**Source:** [Spotify Premium plans](https://www.spotify.com/us/premium/)

### Use low-income pricing on Prime and Walmart+

**What it is:** People on SNAP, Medicaid or similar programs can get big discounts on shopping memberships.

**Real example:** Prime Access is $6.99 a month versus $14.99, as reported by dealnews. Walmart+ Assist is $49 a year versus $98 (both checked October 2026).

- **Saving:** About $49 to $96 per year
- **Effort:** 15 minutes, one-time, with periodic re-verification
- **Odds and risk:** Likely for eligible users. Proof of benefits is required.
- **How often:** Once, then re-verify when asked

**How Upmore runs it:**

1. Spots EBT card use or benefit deposits plus a full-price Prime or Walmart+ charge.
2. Explains the discount privately and asks if the user wants to apply.
3. Guides the application and confirms the lower charge.

**What Upmore needs:** Transaction feed with benefit deposit detection, careful privacy handling

**Tag:** [Ask]

**Source:** [How to Use Amazon Prime, dealnews](https://dealnews.com/features/How-To-Use-Amazon-Prime/1944803.html)

### Rotate one streaming service at a time (creative)

**What it is:** Keep only one or two services active, watch what you want, then swap.

**Real example:** Experts quoted by MoneyLion say rotating and catching promo rates can save $100 to $300 a year (reported, checked October 2026).

- **Saving:** $100 to $300 per year (reported)
- **Effort:** 5 minutes per month, recurring
- **Odds and risk:** Likely. You may lose old pricing or watch history after a long break.
- **How often:** Monthly

**How Upmore runs it:**

1. Counts active streaming charges and spots three or more running at once.
2. Proposes a monthly schedule and asks the user to approve the rotation rule.
3. Reminds the user before each renewal date, cancels or restarts on approval, and tracks the yearly total.

**What Upmore needs:** Card feed, renewal date tracking, cancel-steps library

**Tag:** [Rule]

**Source:** [Cancel and wait trick, MoneyLion](https://www.moneylion.com/trending/money/cancel-and-wait-trick-that-can-lower-streaming-costs)

### Wait for the win-back offer after you cancel (creative)

**What it is:** Many services email discount offers to people who recently cancelled.

**Real example:** Sources quoted by MoneyLion say first retention emails come in two to three weeks. The biggest discounts tend to come 30 to 45 days after cancelling (reported, checked October 2026).

- **Saving:** Varies by offer; no reliable dollar average found
- **Effort:** 5 minutes, one-time per service
- **Odds and risk:** Fairly likely for Hulu, Disney+, Peacock, Paramount+ and HBO Max. Offers are not guaranteed.
- **How often:** Each time you cancel

**How Upmore runs it:**

1. After a cancel, watches the user's inbox for offer emails from that service.
2. Shows the offer price and asks "Restart at this price?"
3. Restarts on approval, confirms the discounted charge, and sets a reminder when the promo ends.

**What Upmore needs:** Read-only email with offer parsing, card feed

**Tag:** [Ask]

**Source:** [Cancel and wait trick, MoneyLion](https://www.moneylion.com/trending/money/cancel-and-wait-trick-that-can-lower-streaming-costs)

### Pay yearly instead of monthly

**What it is:** Switch a service you keep all year to its annual plan.

**Real example:** Peacock Premium is $12.99 a month or $129.99 a year, as reported by CableTV.com. Amazon Prime is $14.99 a month or $139 a year, as reported by dealnews (checked October 2026).

- **Saving:** About $26 to $41 per year per service
- **Effort:** 5 minutes, one-time
- **Odds and risk:** Certain saving if you keep it all year. Money is locked in if you quit early.
- **How often:** Yearly

**How Upmore runs it:**

1. Finds services charged monthly for 10 or more months in a row.
2. Shows the yearly saving and the upfront cost, and asks approval.
3. Guides the switch and checks that monthly charges stop after the annual charge.

**What Upmore needs:** Card feed, price table with annual options

**Tag:** [Ask]

**Source:** [Peacock price increase 2026, CableTV.com](https://www.cabletv.com/news/peacock-price-increase-2026)

### Stream free with a library card (creative)

**What it is:** Many public libraries offer free film and TV streaming through apps like Kanopy.

**Real example:** Seattle Public Library card holders get Kanopy free with 15 tickets a month (checked October 2026).

- **Saving:** Up to the cost of one paid service, roughly $100 to $150 per year
- **Effort:** 15 minutes, one-time
- **Odds and risk:** Likely if the local library offers it. Catalogs and monthly limits vary.
- **How often:** Once

**How Upmore runs it:**

1. Uses the user's city to check which free library streaming apps are offered.
2. Suggests the free option as a swap for a paid service and asks if they want it.
3. Links the sign-up steps and tracks whether a paid service is then cancelled.

**What Upmore needs:** User location, library app directory

**Tag:** [Read]

**Source:** [Kanopy, Seattle Public Library](https://calendar.spl.org/books-and-media/movies-and-tv/kanopy)

## Shopping and groceries

Most shopping savings come from claiming money stores already promise, like price drop refunds, then from small swaps repeated every week.

### Target 14-day price drop claim (creative)

**What it is:** Target matches its own lower price if it drops within 14 days of your purchase.

**Real example:** Target's policy page covers buys from today or the past 14 days, matched against Target.com, the app and Circle deals (checked October 2026).

- **Saving:** $5 to $50 per claim, depending on the item price drop
- **Effort:** 5 to 10 minutes per claim, recurring
- **Odds and risk:** Good odds if the lower price is still live. Screenshots are not accepted, and ended sales are not matched.
- **How often:** Each time a recent Target buy drops in price

**How Upmore runs it:**

1. Reads Target receipt emails and order history, then checks Target.com daily for each item for 14 days.
2. Shows the old price, the new price and the refund, and asks to start a claim.
3. Opens Target chat or a call script with the order number, then watches the card for the credit.

**What Upmore needs:** Email access, Target order data, a price checker for Target.com, card transaction feed

**Tag:** [Rule]

**Source:** [Target Price Match Guarantee](https://www.target.com/help/articles/policies-guidelines/price-match-guarantee)

### Best Buy return-window price match (creative)

**What it is:** If Best Buy lowers its own price during your return period, it will match on request.

**Real example:** Best Buy's policy, effective September 2, 2026, matches its lower in-store, online or app price during the return and exchange period (checked October 2026).

- **Saving:** $10 to $200 per claim on electronics and appliances
- **Effort:** 10 minutes per claim, recurring
- **Odds and risk:** Good odds on normal sales. Open-box, membership prices and the Thanksgiving week sales are excluded.
- **How often:** Each time a recent Best Buy buy drops in price

**How Upmore runs it:**

1. Reads Best Buy order emails and tracks each item price until the return window ends.
2. Shows the drop and asks to request a match.
3. Starts chat or gives a store script, then confirms the refund on the card statement.

**What Upmore needs:** Email access, Best Buy price data, card transaction feed

**Tag:** [Rule]

**Source:** [Best Buy Price Match Guarantee](https://www.bestbuy.com/site/help-topics/price-match-guarantee/pcmcat290300050002.c)

### Costco 30-day price adjustment (creative)

**What it is:** Costco refunds the difference if an item you bought goes on sale within 30 days.

**Real example:** Hip2Save reported a 30-day window, an online Price Adjustment Form, and phone 1-800-774-2678 for Costco.com buys (reported, 2022, checked October 2026).

- **Saving:** $5 to $100 per claim, often on monthly coupon book items
- **Effort:** 5 minutes online, 15 minutes at the warehouse counter
- **Odds and risk:** Fair to good odds. Approval is at each warehouse's discretion, and online buys only match online prices.
- **How often:** Monthly, when new coupon books start

**How Upmore runs it:**

1. Reads Costco app receipts and order emails, then compares items to current Costco sale prices for 30 days.
2. Shows matching items and the total refund, and asks to file.
3. Pre-fills the online form or gives a counter checklist, then watches for the refund.

**What Upmore needs:** Costco receipt access through email or app, Costco price data, card feed

**Tag:** [Ask]

**Source:** [Costco Price Adjustment Policy (Hip2Save)](https://hip2save.com/tips/costco-price-adjustment-policy/)

### Auto-clip grocery digital coupons

**What it is:** Load every relevant digital coupon to your store card before each trip so it applies at checkout.

**Real example:** ConsumerAffairs reported Kroger shoppers save $10 to $30 per trip by clipping first, and unclipped coupons do not apply (reported, June 2026, checked October 2026).

- **Saving:** $10 to $30 per trip, so roughly $500 to $1,500 a year for weekly shoppers
- **Effort:** 3 to 5 minutes per trip by hand, near zero once automated
- **Odds and risk:** High odds. Digital and paper manufacturer coupons can't stack on one item.
- **How often:** Weekly

**How Upmore runs it:**

1. Spots weekly grocery card charges at Kroger or similar chains and reads past receipts to learn what the user buys.
2. Asks once to clip coupons that match the user's usual items before each trip.
3. Clips them in the store account, then reads the receipt to total "coupon savings."

**What Upmore needs:** Grocery loyalty account login or partner API, receipt emails, card feed

**Tag:** [Rule]

**Source:** [How to coupon at Kroger (ConsumerAffairs)](https://www.consumeraffairs.com/news/how-to-coupon-at-kroger-and-save-serious-money-without-wasting-hours-040226.html)

### Buy gift cards at a discount for stores you already use (creative)

**What it is:** Buy discounted gift cards for places you spend anyway, then pay with them.

**Real example:** Costco sold four $25 Buca di Beppo cards for $74.99 and a $500 Southwest card for $429.99 (reported, late 2023 offers, checked October 2026).

- **Saving:** 14% to 25% of what you spend at that merchant
- **Effort:** 10 minutes per purchase
- **Odds and risk:** Low risk if you would spend there anyway. Unused balances and lost cards are the main loss.
- **How often:** A few times a year, when deals appear

**How Upmore runs it:**

1. Finds merchants with steady monthly spend in card data, such as one restaurant chain or airline.
2. Shows a discounted card deal and the yearly saving, and asks to buy.
3. Logs the card balance, reminds the user to use it, and tracks the balance to zero.

**What Upmore needs:** Card feed, gift card deal feed, purchase approval flow

**Tag:** [Ask] [Flag]

**Source:** [Should You Get a Costco Membership Just to Buy Gift Cards (Motley Fool)](https://fool.com/the-ascent/personal-finance/articles/should-you-get-a-costco-membership-just-to-buy-gift-cards/)

### Switch to store brands

**What it is:** Replace name brands with store brands on items where quality is similar.

**Real example:** Consumer Reports found store brands averaged 30% cheaper, and up to 52% on some items (2010 study, checked October 2026).

- **Saving:** About 30% on swapped items, so $300 to $900 a year on $1,000 to $3,000 of swaps
- **Effort:** 15 minutes once to pick swaps
- **Odds and risk:** High odds. Taste or fit may disappoint on a few items. The study is old, so gaps may differ now.
- **How often:** Once, then each trip

**How Upmore runs it:**

1. Reads itemized grocery receipts to find repeat name-brand buys.
2. Shows a list of store-brand swaps with price gaps and asks which to adopt.
3. Adds chosen swaps to the shopping list and tracks the price gap on later receipts.

**What Upmore needs:** Itemized receipts from email or loyalty accounts, store price data

**Tag:** [Read]

**Source:** [Consumer Reports store brand taste tests](https://www.consumerreports.org/media-room/press-releases/2010/09/latest-taste-tests-find-some-store-brands-at-least-as-good-as-national-brands/)

### Warehouse club math for your household

**What it is:** Check whether a club membership, and which tier, pays for itself given your real spend.

**Real example:** Costco Gold Star costs $65 and Executive $130 with a 2% reward up to $1,250, so Executive pays off above $3,250 spend (reported, 2026, checked October 2026).

- **Saving:** $35 net at $5,000 spend on Executive, up to $1,185 at the cap, or $65 saved by cancelling unused memberships
- **Effort:** 5 minutes once a year
- **Odds and risk:** Low risk. Savings depend on the user actually shopping there.
- **How often:** Yearly, before renewal

**How Upmore runs it:**

1. Sums 12 months of club spend from card data and spots the renewal charge date.
2. Shows the break-even math and asks to upgrade, downgrade or cancel.
3. Gives the steps or makes the change, then checks the next renewal charge.

**What Upmore needs:** Card feed, membership account access

**Tag:** [Ask]

**Source:** [Costco Membership Cost (MoneyLion)](https://www.moneylion.com/learn/costco-membership-cost)

### Too Good To Go surplus food bags (creative)

**What it is:** Buy end-of-day surplus food bags from local stores at about one third of value.

**Real example:** Whole Foods sells Too Good To Go produce bags at $6.99 for a $21 value in all 530 plus stores (reported, November 2025, checked October 2026).

- **Saving:** About $14 to $20 per bag, so $200 to $700 a year at one or two bags a month
- **Effort:** 10 minutes per pickup
- **Odds and risk:** Contents are a surprise, and bags sell out. Waste is the main risk.
- **How often:** Weekly or monthly

**How Upmore runs it:**

1. Uses location and grocery spend to spot a nearby Whole Foods or partner store.
2. Suggests a bag type the user likes and asks to reserve it.
3. Sends the pickup reminder and logs the value against the price paid.

**What Upmore needs:** Location, Too Good To Go account link, card feed

**Tag:** [Ask]

**Source:** [Whole Foods expands Too Good To Go surprise bags (Axios)](https://www.axios.com/2025/11/12/whole-foods-too-good-to-go-surprise-bags)

### Amazon Subscribe and Save 5-item stack (creative)

**What it is:** Group five or more subscriptions on one monthly delivery date to lift the discount from 5% to 15%.

**Real example:** Slickdeals reported 5% off for up to four items and 15% for five or more on the same date (reported, 2022, checked October 2026).

- **Saving:** An extra 10% on household staples, so $60 to $240 a year on $50 to $200 a month
- **Effort:** 20 minutes once, then 2 minutes a month
- **Odds and risk:** Prices can rise after the first order. Dropping to four items cuts the discount back to 5%.
- **How often:** Monthly

**How Upmore runs it:**

1. Reads Amazon order emails to find repeat staples and current subscriptions.
2. Proposes moving five or more to one date and shows the extra saving.
3. After approval, checks each upcoming delivery price and flags spikes before it ships.

**What Upmore needs:** Email access, Amazon order history, price history data

**Tag:** [Rule]

**Source:** [The ins and outs of Amazon Subscribe and Save (Slickdeals)](https://daily.slickdeals.net/shopping/the-ins-and-outs-of-amazon-subscribe-save/)

### Amazon price history alerts

**What it is:** Watch an Amazon item's price history and buy when it hits a low target.

**Real example:** CamelCamelCamel offers free price history charts and target price alerts, and once showed a camera drop from $349 to $199 (reported, 2012 article, checked October 2026).

- **Saving:** 10% to 40% on planned buys, often $20 to $150 per item
- **Effort:** 2 minutes to set an alert
- **Odds and risk:** The low may not return before you need the item.
- **How often:** Each planned purchase

**How Upmore runs it:**

1. Spots wish list items, cart emails or a user note about a planned buy.
2. Shows the price history and a fair target price, and asks to set an alert.
3. Alerts the user at the target and logs the gap between list and paid price.

**What Upmore needs:** Price history data source or licence, email access

**Tag:** [Read]

**Source:** [CamelCamelCamel and Tracktor (My Money Blog)](https://mymoneyblog.com/camelcamelcamel-tracktor-amazon-price-tracking-and-alerts.html)

### Cash back portal before online checkout

**What it is:** Start online purchases through a cash back portal that pays a share of its commission.

**Real example:** Rakuten offers usually pay 1% to 10%, paid quarterly with a $5 minimum, plus a $20 sign-up bonus (reported, January 2026, checked October 2026).

- **Saving:** $20 to $150 a year for typical online spend
- **Effort:** 1 minute per purchase, recurring
- **Odds and risk:** Leaving the store site can void tracking. Payouts come months later.
- **How often:** Each online purchase

**How Upmore runs it:**

1. Sees online merchant charges and spots portal rates for those stores.
2. Asks to remind the user before checkout at matching stores.
3. Tracks pending cash back and checks the quarterly payout arrives.

**What Upmore needs:** Card feed, portal rate data or affiliate partnership, email access

**Tag:** [Rule]

**Source:** [Rakuten Review (MoneyCrashers)](https://www.moneycrashers.com/rakuten-review/)

## Health costs

The biggest health savings come from bills people never question, like hospital charity care and billing errors, then from cheaper drug prices.

### Apply for hospital charity care (creative)

**What it is:** Nonprofit hospitals must offer financial assistance and cap bills for eligible patients at amounts generally billed.

**Real example:** IRS rules give 240 days from the first bill to apply, and require refunds over $5 if you qualify (IRS page updated July 2026, checked October 2026).

- **Saving:** Hundreds to many thousands of dollars per hospital bill
- **Effort:** 1 to 3 hours per application
- **Odds and risk:** Good odds for low and middle incomes, but each hospital sets its own income limits.
- **How often:** Each hospital bill

**How Upmore runs it:**

1. Spots hospital bills in email or large hospital charges on cards, and checks if the hospital is a nonprofit.
2. Shows the hospital's posted assistance policy and likely fit, and asks to prepare an application.
3. Pre-fills the form for the user to sign, tracks the 240-day window, and confirms the reduced bill or refund.

**What Upmore needs:** Email and card data, hospital policy lookup, document upload, user signature

**Tag:** [Ask] [Flag]

**Source:** [Billing and collections, Section 501(r)(6) (IRS)](https://www.irs.gov/charities-non-profits/billing-and-collections-section-501r6)

### Check medical bills for errors

**What it is:** Get an itemized bill and compare it to your insurer's explanation of benefits before paying.

**Real example:** AARP reported that 74% of people who contacted billing about a problem got the mistake corrected (reported, May 2025, checked October 2026).

- **Saving:** $50 to several thousand dollars per wrong bill
- **Effort:** 30 minutes to several hours per bill
- **Odds and risk:** Errors are common, but fixes can take many calls. Paying first weakens your position.
- **How often:** Each medical bill

**How Upmore runs it:**

1. Matches provider bills in email to insurer explanation of benefits emails and flags gaps or duplicates.
2. Shows the suspect lines and asks to request an itemized bill and pause payment.
3. Sends the request, tracks replies, and confirms the corrected balance.

**What Upmore needs:** Email access, insurer portal link, a billing code reference, user permission to contact providers

**Tag:** [Ask] [Flag]

**Source:** [How to dispute medical bills (AARP)](https://www.aarp.org/money/personal-finance/dispute-medical-bills/)

### Use No Surprises Act protections (creative)

**What it is:** Federal law blocks surprise out-of-network bills and lets self-pay patients dispute bills well above their estimate.

**Real example:** CMS says uninsured patients may dispute a bill $400 or more above their good faith estimate; helpline 1-800-985-3059 (page November 2024, checked October 2026).

- **Saving:** $400 to thousands of dollars per disputed bill
- **Effort:** 1 to 2 hours per case
- **Odds and risk:** Strong rights in covered cases, but not every bill qualifies.
- **How often:** Each emergency or surprise bill

**How Upmore runs it:**

1. Flags out-of-network charges after an emergency or in-network hospital visit, and saves good faith estimates from email.
2. Shows which protection may apply and asks to file a dispute or complaint.
3. Drafts the dispute for the user to send and tracks the outcome.

**What Upmore needs:** Email and insurer claims data, CMS dispute process links

**Tag:** [Ask] [Flag]

**Source:** [Medical bill rights (CMS)](https://www.cms.gov/medical-bill-rights)

### Price check prescriptions at Cost Plus Drugs (creative)

**What it is:** Compare your pharmacy price to Mark Cuban Cost Plus Drugs, which charges cost plus a fixed markup.

**Real example:** Cost Plus charges cost plus 15%, a $5 pharmacy fee and $5 shipping; generic imatinib was $19.40 versus $2,502.50 retail (reported, 2022 and 2023, checked October 2026).

- **Saving:** $50 to $2,000 a year per generic drug, most on pricey generics
- **Effort:** 15 minutes to set up, then automatic refills
- **Odds and risk:** Not every drug is stocked. Cash buys may not count toward your deductible.
- **How often:** Once per drug, then monthly refills

**How Upmore runs it:**

1. Reads pharmacy charges and refill emails to list the user's generic drugs.
2. Shows the Cost Plus price next to the current cost and asks to switch.
3. Helps the user ask the doctor to send the prescription, then tracks monthly cost.

**What Upmore needs:** Card and email data, Cost Plus price data or partnership, user consent for health data

**Tag:** [Ask] [Flag]

**Source:** [Examples of Cost Plus Drugs savings (MyDrugCosts)](https://www.mydrugcosts.com/mdc-news/examples-of-cost-plus-drugs-savings)

### Discount card versus insurance copay

**What it is:** Check if a free discount card price beats your insurance copay at the counter.

**Real example:** GoodRx says it saved users $150 on average against cash prices in 2022, and prices can vary $100 plus between pharmacies (checked October 2026).

- **Saving:** $5 to $150 per fill, and more by switching pharmacies
- **Effort:** 2 minutes per fill
- **Odds and risk:** Discount card buys usually skip insurance, so they may not count toward your deductible.
- **How often:** Each fill

**How Upmore runs it:**

1. Reads pharmacy charges and insurance claims to see the user's copay per drug.
2. Shows the lowest nearby discount price and asks to use it next time.
3. Puts the coupon in the wallet before pickup and logs the saving.

**What Upmore needs:** Pharmacy charges, location, discount card API or partner

**Tag:** [Ask] [Flag]

**Source:** [How GoodRx works](https://www.goodrx.com/how-goodrx-works)

### Open an HSA with a bronze or catastrophic plan (creative)

**What it is:** From 2026, Exchange bronze and catastrophic plans count as HSA-eligible, so tax-free savings opens to more people.

**Real example:** IRS Notice 2026-5 confirms the change; 2026 HSA limits are $4,400 self-only and $8,750 family (checked October 2026).

- **Saving:** Tax on up to $4,400 or $8,750 a year, often $500 to $2,500
- **Effort:** 30 minutes once
- **Odds and risk:** Non-medical withdrawals face income tax plus 20% before age 65.
- **How often:** Once, then yearly contributions

**How Upmore runs it:**

1. Spots an Exchange bronze or catastrophic premium in card data and no HSA deposits.
2. Explains the tax saving and asks to open an HSA and set a monthly deposit.
3. Moves money after approval, and keeps receipts for medical spending.

**What Upmore needs:** Card and bank data, HSA custodian partner, money movement approval

**Tag:** [Ask] [Flag]

**Source:** [Notice 2026-5 (IRS)](https://www.irs.gov/pub/irs-drop/n-26-05.pdf)

### Spend down your FSA before the deadline

**What it is:** Use health FSA money on eligible items before it expires.

**Real example:** The 2026 health FSA limit is $3,400, with up to $680 carryover if your plan allows (Proskauer, October 2025, checked October 2026).

- **Saving:** The unspent balance, often $50 to $680 a year kept instead of lost
- **Effort:** 15 minutes a year
- **Odds and risk:** Low risk. Gym dues and general vitamins usually do not qualify.
- **How often:** Yearly, before plan year end

**How Upmore runs it:**

1. Reads the FSA balance and plan deadline from benefits emails.
2. Shows the balance at risk and lists eligible items, such as menstrual care products, and asks what to buy.
3. Places the order or reminds the user, then checks the balance reaches zero.

**What Upmore needs:** Benefits portal access, email, eligible item list

**Tag:** [Ask] [Flag]

**Source:** [IRS 2026 health FSA and transportation limits (Proskauer)](https://www.proskauer.com/blog/irs-releases-annual-increases-to-health-fsa-and-transportation-fringe-benefit-limits-for-2026)

### Pay direct primary care from an HSA (creative)

**What it is:** A flat-fee primary care membership no longer blocks HSA contributions, and fees can be paid from the HSA.

**Real example:** IRS Notice 2026-5 allows fees up to $150 a month for one person or $300 for more people (checked October 2026).

- **Saving:** Tax on $1,800 to $3,600 a year of membership fees
- **Effort:** 1 hour once
- **Odds and risk:** Fees above the cap block HSA contributions. Specialists and drugs are not covered.
- **How often:** Once, then monthly

**How Upmore runs it:**

1. Spots recurring primary care membership charges on cards.
2. Checks the fee against the cap and asks to reimburse from the HSA.
3. Files the reimbursement and stores receipts.

**What Upmore needs:** Card data, HSA custodian access, receipt storage

**Tag:** [Ask] [Flag]

**Source:** [Notice 2026-5 (IRS)](https://www.irs.gov/pub/irs-drop/n-26-05.pdf)

### Dental school and health center clinics (creative)

**What it is:** Dental schools and federally funded health centers give supervised care at reduced or income-based cost.

**Real example:** NIH's dental institute lists dental school clinics and income-based health centers, and warns of fake implant trial ads (page December 2024, checked October 2026).

- **Saving:** Not published; varies by school and income
- **Effort:** 1 hour to find a clinic, then longer visits
- **Odds and risk:** Visits take longer and waitlists are common.
- **How often:** As needed

**How Upmore runs it:**

1. Spots large dentist charges or estimates in email, and uses location to find nearby schools.
2. Shows clinic options and asks to book a screening.
3. Books or gives the phone script, then compares costs to the earlier estimate.

**What Upmore needs:** Location, email, clinic directory data

**Tag:** [Read] [Flag]

**Source:** [Finding Dental Care (NIDCR)](https://www.nidcr.nih.gov/health-info/finding-dental-care)

### Smooth Medicare drug costs under the 2026 cap

**What it is:** Medicare Part D caps yearly covered drug costs, and a payment plan spreads them monthly.

**Real example:** DailyCaring reported the 2026 Part D cap is $2,100, with a $615 maximum deductible (reported, July 2026, checked October 2026).

- **Saving:** Any spend above $2,100 a year, plus no big early-year pharmacy bills
- **Effort:** 20 minutes once
- **Odds and risk:** Only formulary drugs count toward the cap.
- **How often:** Yearly

**How Upmore runs it:**

1. Sums Medicare pharmacy spend for users or parents they help.
2. Flags spend near or above the cap and asks to review the plan or enroll in the payment plan.
3. Gives enrollment steps and tracks monthly pharmacy bills.

**What Upmore needs:** Card data, user age or caregiver link, plan information

**Tag:** [Read] [Flag]

**Source:** [Medicare Part D changes 2026 (DailyCaring)](https://dailycaring.com/medicare-part-d-changes-2026/)
