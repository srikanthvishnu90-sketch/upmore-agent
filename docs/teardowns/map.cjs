// The owner's two feature teardowns (docs/teardowns) against the owner's Full Agent Capability List
// (docs/capability-list/full-agent-capability-list-2026-10-11.md, items 1..149 in document order). Read by
// scripts/build-teardowns.cjs, which gives every feature row its `capability_items` and a derived `upmore_today` (the best
// status among those items, from scripts/capability-list.cjs), and fails --check when this map drifts from the docs.
//
// SECTIONS, one entry per (app, section) that has feature rows, keyed "App/Section":
//   [items, coverage, note]
//   items     the capability-list item numbers the section's features are ([] when the list has no such item)
//   coverage  "full": every feature in the section is one of those items; "part": some are (the note says which part and
//             what is left); "none": the list has no item for it (the note says what the section is)
//   Strict: an item is named only when the features genuinely are that capability. A section about the app's own
//   membership billing, marketing, creator program, bank, card, brokerage or lending is "none" even when Upmore touches
//   the same words. A "part" row still reads the status of the items named: the note is where the rest is said.
//
// ROWS, the few rows that clearly differ from their section, keyed by row id: { feature, items, coverage, note }.
// `feature` must still match the row (a renumbered row fails the build). Mapping never lifts a gate: a hard-gated row
// stays gated whatever Upmore has.
const SECTIONS = {
  // ---------------------------------------------------------------- Teardown 1: dub
  "dub/Onboarding and account": [[], "none", "opening an account at dub's own broker-dealer; Upmore opens no brokerage account, it trades in the person's own"],
  "dub/Funding and withdrawals": [[], "none", "deposits and withdrawals in dub's own brokerage account"],
  "dub/Cash and dividends": [[], "none", "dub's own cash sweep and cash-dividend policy"],
  "dub/Portfolio discovery": [[46, 49, 50], "part", "finding a filer, another member or a theme to copy (46, 49, 50); dub's curated rows, Premium strategies and discoverability rules are its own catalog"],
  "dub/Leaderboard": [[], "none", "ranking other members' public portfolios; the list copies a named source and ranks no creators"],
  "dub/Copy trading": [[45, 46, 47, 49], "part", "copying a portfolio at the person's dollars, auto-copy and stopping it (45, 46, 47, 49); basket trades, rebalance locks, capacity limits and dub Advisors oversight are dub's brokerage machinery"],
  "dub/Creating portfolios": [[49, 56], "part", "a target split the person sets and rebalances to (56) and sharing it so a friend can copy it (49); public tickers and listing rules are dub's"],
  "dub/Creator program": [[], "none", "dub's creator licensing and revenue share"],
  "dub/Performance and risk metrics": [[51, 64], "part", "returns and fees paid on the person's copies (51, 64); creator-side metrics (capital, copier count, alpha and risk scores) belong to dub's catalog"],
  "dub/Notifications and reports": [[42], "part", "trade confirmations and account activity as a receipt for each action (42); statements, paper delivery and the social feed are the broker's records"],
  "dub/Tax documents": [[], "none", "the broker's own 1099 forms"],
  "dub/Social features": [[], "none", "posts, likes and comments inside dub's community"],
  "dub/AI features": [[63], "part", "plain-words explanations of a portfolio and the market (63); finding portfolios from a request is discovery, and fit-to-profile insights are advice"],
  "dub/Education": [[], "none", "dub's learning content and help center"],
  "dub/Membership and fees": [[], "none", "dub's own membership, creator fees and refunds"],
  "dub/Security": [[], "none", "dub's own sign-in, encryption and SIPC cover"],
  "dub/Account settings and support": [[], "none", "dub's own profile, account and support settings"],

  // ---------------------------------------------------------------- Alinea
  "Alinea/Onboarding and accounts": [[], "none", "opening Alinea's own managed or self-directed brokerage account"],
  "Alinea/Funding and withdrawals": [[], "none", "moving money into and out of Alinea's own brokerage account"],
  "Alinea/AI assistant": [[63], "part", "explaining the person's portfolio and what it holds (63); general market Q&A, single-stock questions and self-adjusting portfolios lean into advice"],
  "Alinea/Portfolios and playlists": [[49, 50, 56], "part", "investing in a themed list (50), copying a member's list (49) and rebalancing (56); expert-built and managed portfolios choose positions for the person"],
  "Alinea/Trading": [[52], "part", "buying and selling stocks, ETFs and fractions by amount (52); ticker search and market screens are research views with no item"],
  "Alinea/Performance and insights": [[22, 64, 66], "part", "the daily holdings briefing (22, 66) and portfolio returns (64); growth projections, the time machine and broker statements have no item"],
  "Alinea/Education": [[], "none", "Alinea's lessons, quizzes and blog"],
  "Alinea/Social and rewards": [[], "none", "Alinea's community features and referral rewards"],
  "Alinea/Notifications": [[], "none", "Alinea's marketing and account texts and emails"],
  "Alinea/Security and support": [[], "none", "Alinea's own sign-in, encryption, SIPC cover and support"],
  "Alinea/Membership and billing": [[], "none", "Alinea's own membership billing"],
  "Alinea/Platforms": [[], "none", "Alinea's apps and web sign-up"],

  // ---------------------------------------------------------------- Autopilot
  "Autopilot/Onboarding and account": [[], "none", "Autopilot's advisory agreement, suitability questions and account deletion"],
  "Autopilot/Brokerage connection": [[1, 52], "part", "linking the person's own brokerage (1) and placing trades there (52); the referral to open a Public account has no item"],
  "Autopilot/Marketplace and discovery": [[46, 50], "part", "finding a filer or a theme to copy (46, 50); Autopilot's featured lists, rankings and pilot directory are its own catalog"],
  "Autopilot/Portfolios you can copy": [[45, 46, 50], "part", "copying Congress and 13F filers (45, 46) and themes (50); Autopilot's own strategies (Inverse Cramer, AI, expert and risk-based portfolios) are managed portfolios with no item"],
  "Autopilot/Copy trading": [[45, 47, 56], "part", "sizing and buying a copy at the person's dollars (45), auto-copying new trades (47) and rebalancing (56); the quarterly suitability review is the adviser's duty"],
  "Autopilot/Tracking and alerts": [[42, 51], "part", "how the copy performed (51) and a notice for each trade placed (42); market-news alerts, SMS terms and education have no item"],
  "Autopilot/Plans and billing": [[], "none", "Autopilot's own tiers, per-portfolio fees and trial"],
  "Autopilot/Creators, support and security": [[], "none", "Autopilot's pilot program, support and encryption"],

  // ---------------------------------------------------------------- Origin
  "Origin/Onboarding and account linking": [[1, 4, 5], "part", "linking accounts (1), one list including manual ones (4) and reconnecting (5); home and vehicle values, CSV and Monarch imports and Amazon order matching have no item"],
  "Origin/Spending and transactions": [[6, 8, 11, 12], "part", "spending by category and month (6, 12), category fixes and rules (8) and splits (11); tags, bulk edits, the review queue, filters and CSV export are bookkeeping tools with no item"],
  "Origin/Budgeting": [[], "none", "category budgets, rollovers and AI budget building; the list has no budget (safe to spend, 14, is the nearest)"],
  "Origin/Recurring bills and subscriptions": [[10, 18, 31, 106], "full", ""],
  "Origin/Forecasting, goals and retirement": [[20], "part", "what-if scenarios such as a home purchase or a new income (20); a lifetime plan with Monte Carlo odds, retirement, Social Security, equity and tax modeling has no item (16 forecasts 90 days)"],
  "Origin/Net worth": [[15], "full", ""],
  "Origin/Investment tracking": [[64, 65, 66, 68], "part", "returns against a benchmark (64), allocation (65), earnings dates (66) and a watchlist (68); analyst ratings, market watch and themed screens are research tools with no item"],
  "Origin/Origin Invest and cash account": [[], "none", "Origin's own managed index account, brokerage and cash sweep account"],
  "Origin/AI adviser and other AI features": [[7, 20, 22, 24], "part", "plain questions over the person's data (7), what-if questions (20), the daily market brief (22) and the weekly recap (24); the health score, ranked recommendations, risk profile and memory controls have no item"],
  "Origin/Human financial planners": [[], "none", "sessions with Origin's human CFP planners"],
  "Origin/Equity compensation": [[], "none", "tracking stock grants, vesting and exercise costs"],
  "Origin/Tax filing": [[], "none", "filing a tax return inside the app"],
  "Origin/Estate planning": [[], "none", "wills, trusts and estate documents"],
  "Origin/Credit score and identity protection": [[37, 101], "part", "score, factors and credit report alerts (37, 101); dark web and SSN monitoring, data broker removal, identity restoration and insurance have no item"],
  "Origin/Partner and household sharing": [[137], "part", "mine, ours and yours views for a couple (137); partner credit scores have no item"],
  "Origin/Employer version": [[], "none", "Origin sold as an employee benefit"],
  "Origin/Notifications and reports": [[], "none", "budget, goal, planner and review notices; the weekly recap rows map to 24 one by one"],
  "Origin/Platforms": [[], "none", "Origin's apps, widgets and display settings"],
  "Origin/Security and privacy": [[], "none", "Origin's own access model, encryption, audits and sign-in"],
  "Origin/Support and membership": [[], "none", "Origin's own support, plans, trial and referrals"],

  // ---------------------------------------------------------------- Albert
  "Albert/Onboarding and bank linking": [[1, 4], "part", "linking accounts (1) and adding one by hand (4); the debit card link is for Albert's own advances, and demo accounts and the goals questionnaire have no item"],
  "Albert/Budgeting and spending": [[6, 8, 14, 15], "part", "spending by category, account and merchant (6), category fixes (8), safe to spend (14) and net worth (15); category budgets, custom charts and the dashboard have no item"],
  "Albert/Forecast": [[16, 20], "part", "cash flow ahead (16) and milestone what-ifs (20); a five-year net worth forecast reaches further than the list's 90 days"],
  "Albert/Bills and subscriptions": [[10, 31, 75, 106, 122], "full", ""],
  "Albert/Genius AI assistant": [[7], "part", "answers over the person's own data (7); rows that are other items are mapped one by one; moving money, Smart money and trading on Genius's plan run in Albert's own accounts"],
  "Albert/Instant cash advances and loans": [[], "none", "Albert's advances, credit line and personal loans; lending is not in Upmore's list"],
  "Albert/Automatic savings": [[], "none", "automatic transfers into Albert's own savings vaults and accounts; the list has no savings automation or personal goals (136 is a goal shared with others)"],
  "Albert/Albert Cash": [[], "none", "Albert's own checking account, debit card and transfers"],
  "Albert/Investing": [[52, 53, 56, 64], "part", "buying and selling (52), recurring buys (53), rebalancing (56) and performance across outside accounts (64); Albert's managed portfolios, its own brokerage account and its transfers have no item"],
  "Albert/Credit and identity protection": [[37, 101], "part", "score and credit report alerts (37, 101); identity monitoring, data broker removal, insurance and restoration have no item"],
  "Albert/Insurance": [[40], "part", "insurance quotes as a better-rate check (40); an expiring-policy alert has no item"],
  "Albert/Alerts and reports": [[9, 29, 34], "part", "large transactions (34), low balance (29) and spending trends (9); notification settings and texting the app are channels, not items"],
  "Albert/Security and support": [[], "none", "Albert's own sign-in, support and subscription cancellation"],
  "Albert/Plans": [[], "none", "Albert's own plans and trial"],

  // ---------------------------------------------------------------- Teardown 2: Rocket Money
  "Rocket Money/Onboarding and account linking": [[1, 5], "part", "linking banks, cards, brokerages and loans (1) and connection health with reconnect (5); card APR and utilization details, unlinking and demo mode have no item"],
  "Rocket Money/Subscriptions and recurring bills": [[10, 14, 18, 106], "full", ""],
  "Rocket Money/Cancellation concierge": [[106, 112, 114], "full", ""],
  "Rocket Money/Bill negotiation": [[122], "full", ""],
  "Rocket Money/Spending and transactions": [[6, 7, 8, 11, 25], "part", "spending views (6), search (7), category fixes and rules (8), splits (11) and the monthly report (25); tags, notes, CSV export and the tax-deductible list have no item"],
  "Rocket Money/Budgets and habits": [[], "none", "category budgets, challenges, badges and lessons; the two rows that are list items are mapped one by one"],
  "Rocket Money/Alerts and notifications": [[28, 29, 34], "part", "upcoming charges (28), low balance (29) and unusual charges (34); the fee and credit rows are mapped one by one, and challenge reminders have no item"],
  "Rocket Money/Net worth": [[15], "full", ""],
  "Rocket Money/Credit": [[37, 101], "full", ""],
  "Rocket Money/Financial Goals and savings": [[], "none", "automatic saving into Rocket Money's own goal accounts at its partner bank; the list has no savings automation or personal goals"],
  "Rocket Money/Rowan AI agent": [[7], "part", "an agent over text answering from the person's data (7); its other rows are list items mapped one by one, and support handoff and app navigation have no item of their own"],
  "Rocket Money/Sharing": [[137], "part", "a partner with their own login sees the household's accounts (137); couple mode also keeps personal spending private, which this sharing does not"],
  "Rocket Money/Platforms, security and support": [[], "none", "Rocket Money's apps, widgets, sign-in, support and product offers"],

  // ---------------------------------------------------------------- Monarch
  "Monarch/Onboarding and account linking": [[1, 4, 5], "part", "linking accounts through several aggregators (1), manual accounts in one list (4) and connection health with provider switching (5); CSV and Mint imports, balance-history edits and the data transfer tool have no item"],
  "Monarch/Transactions": [[8, 11], "part", "categorisation, merchant cleanup and rules (8) and splits (11); search, filters, tags, notes, attachments, review flags and bulk edits are bookkeeping tools with no item"],
  "Monarch/Receipts and retail sync": [[2, 3, 11], "full", ""],
  "Monarch/Budgeting": [[], "none", "flex and category budgets with rollovers; the list has no budget (the flex number row maps to safe to spend, 14)"],
  "Monarch/Cash flow and reports": [[6, 25], "part", "income and spending by category, merchant and owner over any period (6) and the monthly review (25); chart types, saved reports and chart sharing are presentation"],
  "Monarch/Recurring bills and subscriptions": [[10, 18, 28], "full", ""],
  "Monarch/Goals": [[], "none", "personal save-up goals; the list has no personal goal (136 is a goal shared with others); the pay-down rows map to 91 one by one"],
  "Monarch/Net worth and accounts": [[4, 15], "part", "net worth over time (15) and one list of accounts (4); utilisation bars, notes, logos and hide, close or invert controls have no item"],
  "Monarch/Investments": [[64, 65, 67], "part", "returns against a benchmark (64), allocation (65) and fund breakdowns (67); equity compensation tracking and manual holdings have no item"],
  "Monarch/Forecasting": [[20], "part", "what-if events and scenarios such as a new job or a home (20); a lifetime forecast with retirement, Social Security, withdrawal order and tax assumptions has no item (16 forecasts 90 days)"],
  "Monarch/Business Tracking": [[], "none", "business books, P&L and Schedule C exports"],
  "Monarch/Estate planning": [[], "none", "a partner's will and trust offer"],
  "Monarch/AI features": [[7, 24], "part", "questions over the person's data (7) and the weekly recap (24); product help, transaction explanations, feedback buttons and the MCP connector have no item"],
  "Monarch/Collaboration": [[137], "part", "mine, theirs and shared views for a household (137); adviser, professional and support access have no item"],
  "Monarch/Notifications and digests": [[5, 28, 37], "part", "bill and recurring reminders (28), credit score changes (37) and broken connections (5); budget thresholds, review assignments, receipt notices and the price-change notice have no item"],
  "Monarch/Dashboard and navigation": [[], "none", "dashboard cards and navigation; the numbers they show are mapped in their own sections"],
  "Monarch/Mobile home screen widgets": [[], "none", "home screen widgets"],
  "Monarch/Credit score": [[101], "full", ""],
  "Monarch/Data export": [[], "none", "CSV downloads of transactions and balances"],
  "Monarch/Platforms and countries": [[], "none", "Monarch's apps and country support"],
  "Monarch/Security and privacy": [[], "none", "Monarch's own access model, sign-in and data handling"],
  "Monarch/Billing and support": [[], "none", "Monarch's own plans, promotions, referrals and support"],

  // ---------------------------------------------------------------- Copilot Money
  "Copilot Money/Onboarding and account linking": [[1], "part", "linking banks, cards, brokerages and Apple accounts through several aggregators (1); the Venmo and Amazon rows map one by one, and the test drive, first budget and onboarding restart have no item"],
  "Copilot Money/Accounts and net worth": [[4, 5, 15], "part", "one list of accounts (4), connections needing attention (5) and net worth over time (15); utilization dots, renames, hiding and support merges have no item"],
  "Copilot Money/Real estate and other assets": [[15], "part", "property and other assets counting in net worth (15); automatic home value feeds and mortgage linking are not named on the list"],
  "Copilot Money/Transactions": [[8, 11], "part", "the categorisation model and name rules (8) and splits (11); search, filters, review inbox, tags, notes, bulk edits and keyboard shortcuts are bookkeeping tools with no item"],
  "Copilot Money/Categories and budgets": [[], "none", "category budgets, groups and rollovers; the list has no budget"],
  "Copilot Money/Recurrings and subscriptions": [[10, 18], "full", ""],
  "Copilot Money/Dashboard": [[12, 14, 18], "part", "free to spend (14), upcoming recurrings (18) and this month against last (12); the review card, referral card, tab order and search are app chrome"],
  "Copilot Money/Cash flow": [[6, 12], "full", ""],
  "Copilot Money/Investments": [[64, 65], "part", "returns against a benchmark (64) and allocation (65); live balance estimates and manual holdings logs have no item"],
  "Copilot Money/Goals and savings": [[], "none", "personal savings goals; the list has no personal goal (136 is a goal shared with others)"],
  "Copilot Money/AI assistant and natural language": [[7, 8, 9], "part", "answers from the person's data (7), category and rule fixes by chat (8) and unusual-charge briefings (9); charts in chat, tag suggestions, nudges and the MCP connector have no item"],
  "Copilot Money/Reports, charts and data export": [[25, 26], "part", "the month (25) and year (26) in review; slide sharing and CSV export have no item"],
  "Copilot Money/Notifications": [[24, 29, 30, 34], "part", "low balance (29), big expenses (34), income (30) and the weekly spending update (24); budget, recurring-paid, transfer and Venmo notices have no item"],
  "Copilot Money/Widgets and Apple integrations": [[], "none", "home screen widgets, icons and Apple platform features"],
  "Copilot Money/Platforms and accessibility": [[], "none", "Copilot's apps and display settings"],
  "Copilot Money/Sharing with a partner": [[137], "part", "a partner seeing the couple's money (137); a shared login keeps nothing private, which couple mode does"],
  "Copilot Money/Security and privacy": [[], "none", "Copilot's own sign-in, encryption and account controls"],
  "Copilot Money/Subscription, referrals and support": [[], "none", "Copilot's own plans, gifts, referrals and support"],

  // ---------------------------------------------------------------- YNAB
  "YNAB/The method and plan behaviour": [[], "none", "YNAB's envelope method: assigning every dollar, moving money between categories, Age of Money; the list has no budget"],
  "YNAB/Onboarding and plan setup": [[], "none", "YNAB's plan setup and formats"],
  "YNAB/Accounts and account linking": [[1, 4, 5], "part", "linking banks (1), unlinked and tracking accounts in one list (4) and repairing a broken connection (5); file imports and reconciliation-style balances have no item"],
  "YNAB/Transactions": [[8, 11], "part", "payee cleanup and auto-categorisation (8) and splits (11); scheduled entries, approval, matching, flags, reconciling and bulk actions are ledger tools with no item"],
  "YNAB/Categories and category groups": [[], "none", "budget categories, groups and focused views"],
  "YNAB/Targets": [[], "none", "per-category savings and payment targets"],
  "YNAB/Loan planner and debt payoff": [[91, 92], "part", "the payoff path (91) and extra-payment simulator (92); loan interest, escrow and paired-category bookkeeping and the celebration image have no item"],
  "YNAB/Reports and export": [[6, 12, 15], "part", "spending by category (6), trends and income against expense over time (12) and net worth (15); Age of Money, progress images and exports have no item"],
  "YNAB/YNAB Together and sharing": [[137], "part", "household members sharing plans (137); referral and gift rows are YNAB's own billing"],
  "YNAB/AI and automation": [[], "none", "a help-article app inside ChatGPT and a support chatbot; the payoff calculator row maps to 91"],
  "YNAB/API and integrations": [[], "none", "YNAB's developer API and integrations"],
  "YNAB/Platforms": [[], "none", "YNAB's apps, widgets and shortcuts"],
  "YNAB/Notifications": [[], "none", "approval, overspending and YNAB's own billing notices"],
  "YNAB/Security and privacy": [[], "none", "YNAB's own sign-in and data policies"],
  "YNAB/Support and learning": [[], "none", "YNAB's support and learning content"],
  "YNAB/Pricing and trial": [[], "none", "YNAB's own plans and trial"],

  // ---------------------------------------------------------------- Cleo
  "Cleo/Onboarding and bank linking": [[1], "part", "linking banks (1); hide, delete and the unsupported-account list have no item"],
  "Cleo/AI chat": [[7, 19], "part", "questions over the person's data (7) and can-I-afford-this (19); roast, hype, voice and memory are tone and channel, and deposits, withdrawals and advance repayments move money in Cleo's own products"],
  "Cleo/Autopilot": [[], "none", "Cleo's waitlisted plan that moves money into its own savings or offers advances; the two safe-to-spend rows map to 14"],
  "Cleo/Budgeting and spending insights": [[8, 10, 14, 18, 91], "part", "left to spend (14), bills due (18), recurring and subscription detection (10), category fixes (8) and the debt paydown plan (91); the monthly plan view and essential-spending grouping are budget features with no item"],
  "Cleo/Cash advance": [[], "none", "Cleo's cash advances; lending is not in Upmore's list"],
  "Cleo/Pay Later": [[], "none", "Cleo's own pay-later loans; the list's BNPL items (84 to 88) pay and track other lenders' plans, they do not lend"],
  "Cleo/Credit builder card and credit score": [[], "none", "Cleo's own secured credit card; the credit score rows map to 101 one by one"],
  "Cleo/Direct deposit and early pay": [[], "none", "routing a paycheck into Cleo's own bank account"],
  "Cleo/Savings": [[], "none", "Cleo's own savings account and automatic saving rules"],
  "Cleo/Investing": [[], "none", "a managed ETF portfolio run by Cleo's partner; the list trades only on the person's own instruction"],
  "Cleo/Games and rewards": [[], "none", "quizzes and prize draws"],
  "Cleo/Notifications": [[], "none", "Cleo's offer, prize, advance and own-product notices"],
  "Cleo/Security and support": [[], "none", "Cleo's own data handling and support"],
  "Cleo/Plans and billing": [[], "none", "Cleo's own plans and refunds"],
};

const ROWS = {
  // dub: a recurring schedule into one portfolio is a recurring buy, not a copy.
  "T1-DUB-055": { feature: "Recurring Investments", items: [53], coverage: "full", note: "a recurring buy on a schedule (53)" },
  // Alinea: the automated-investing schedule is a recurring buy; crypto and event contracts are their own lines.
  "T1-ALINEA-010": { feature: "Automated Investing", items: [53], coverage: "full", note: "a recurring buy on a schedule (53)" },
  "T1-ALINEA-042": { feature: "Crypto", items: [62], coverage: "full", note: "buying crypto through a partner (62); decision 3 keeps it off" },
  "T1-ALINEA-043": { feature: "Event contracts", items: [], coverage: "none", note: "event contracts are not on the list; decision 2 keeps them off" },
  // Origin: stock bundles are a theme bought in one step; selling one is an ordinary sell.
  "T1-ORIGIN-098": { feature: "Stock Bundles", items: [50], coverage: "full", note: "buying a theme in one step (50)" },
  "T1-ORIGIN-100": { feature: "Sell bundle or single stock", items: [52], coverage: "full", note: "an ordinary sell (52)" },
  "T1-ORIGIN-030": { feature: "Large transaction alert", items: [34], coverage: "full", note: "the large-transaction alert (34)" },
  "T1-ORIGIN-175": { feature: "Weekly market recap notification", items: [24], coverage: "full", note: "the weekly recap (24)" },
  "T1-ORIGIN-177": { feature: "AI Recaps toggle", items: [24], coverage: "full", note: "turning the recap on or off (24)" },
  // Albert Genius: the rows that are other list items, and the concierge rows that are not money at all.
  "T1-ALBERT-044": { feature: "Spending summary", items: [25], coverage: "full", note: "the month-end report (25)" },
  "T1-ALBERT-049": { feature: "Custom alerts", items: [27], coverage: "full", note: "a custom report or alert the person sets (27)" },
  "T1-ALBERT-050": { feature: "Vault", items: [3], coverage: "part", note: "reading an uploaded document (3); storage of documents has no item" },
  "T1-ALBERT-052": { feature: "Portfolio summaries", items: [22], coverage: "full", note: "the daily portfolio summary (22)" },
  "T1-ALBERT-046": { feature: "Shopping", items: [], coverage: "none", note: "product shopping is outside the list" },
  "T1-ALBERT-047": { feature: "Travel itineraries", items: [], coverage: "none", note: "trip planning is outside the list" },
  "T1-ALBERT-048": { feature: "Find restaurants", items: [], coverage: "none", note: "restaurant search is outside the list" },
  "T1-ALBERT-125": { feature: "Fraud alerts", items: [33, 34], coverage: "full", note: "suspicious charges on linked accounts (33, 34)" },
  // Rocket Money: the rows inside negotiation, budgets and alerts that are another item.
  "T2-ROCKET-038": { feature: "Car insurance rate comparison", items: [40], coverage: "full", note: "a better insurance rate (40)" },
  "T2-ROCKET-039": { feature: "Overdraft and late fee refund script", items: [81], coverage: "full", note: "asking for a fee to be waived (81)" },
  "T2-ROCKET-066": { feature: "Amount Left After Bills", items: [14], coverage: "part", note: "income minus bills, the core of safe to spend (14)" },
  "T2-ROCKET-067": { feature: "Debt paydown", items: [91], coverage: "full", note: "a payoff plan (91)" },
  "T2-ROCKET-075": { feature: "Bank fee notification", items: [81], coverage: "full", note: "catching a fee and asking for it back (81)" },
  "T2-ROCKET-076": { feature: "Credit change alerts", items: [37], coverage: "full", note: "a credit report change (37)" },
  // Rowan is a texting agent; most of its rows are another list item.
  "T2-ROCKET-099": { feature: "Weekly spend reports", items: [24], coverage: "full", note: "the weekly recap (24)" },
  "T2-ROCKET-100": { feature: "Proactive alerts", items: [10, 31], coverage: "full", note: "forgotten subscriptions (10) and price increases (31)" },
  "T2-ROCKET-101": { feature: "Transaction edits by text", items: [8], coverage: "full", note: "category fixes by chat (8)" },
  "T2-ROCKET-102": { feature: "Budget building by text", items: [], coverage: "none", note: "budgets have no item" },
  "T2-ROCKET-103": { feature: "Custom alerts", items: [27], coverage: "full", note: "a custom alert the person sets (27)" },
  "T2-ROCKET-104": { feature: "Cancel subscriptions by text", items: [106, 108, 109], coverage: "full", note: "duplicate and unused subscriptions (108, 109), cancelled on a yes (106)" },
  "T2-ROCKET-105": { feature: "Negotiate bills by text", items: [122], coverage: "full", note: "bill negotiation (122)" },
  "T2-ROCKET-106": { feature: "Trial tracking", items: [2, 32], coverage: "full", note: "trials found in email (2) and warned before they bill (32)" },
  "T2-ROCKET-107": { feature: "Refund requests", items: [148], coverage: "full", note: "a refund for a late delivery or bad service (148)" },
  "T2-ROCKET-108": { feature: "Savings rule", items: [], coverage: "none", note: "round-ups into savings; the list's round-ups (54) invest" },
  "T2-ROCKET-109": { feature: "Debt guidance", items: [91], coverage: "full", note: "a repayment plan (91)" },
  // Monarch: the flex number is safe to spend; pay-down goals are a payoff plan.
  "T2-MONARCH-101": { feature: "Flex number", items: [14], coverage: "part", note: "income minus fixed and non-monthly costs, the core of safe to spend (14)" },
  "T2-MONARCH-146": { feature: "Pay Down Goals", items: [91], coverage: "full", note: "a payoff timeline per debt (91)" },
  "T2-MONARCH-157": { feature: "Debt payoff calculator", items: [91, 92], coverage: "full", note: "avalanche or snowball (91) and extra payments (92)" },
  // Copilot Money: Venmo receipts arrive by email; Amazon orders itemise a charge; a few alerts are other items.
  "T2-COPILOT-020": { feature: "Venmo (Copilot Labs)", items: [2], coverage: "full", note: "reading receipts from email (2)" },
  "T2-COPILOT-024": { feature: "Amazon (Copilot Labs)", items: [11], coverage: "full", note: "itemising one charge into categories (11)" },
  "T2-COPILOT-226": { feature: "Refund matching", items: [38], coverage: "part", note: "matching a refund to its purchase (38); the promised-window watch is the rest" },
  "T2-COPILOT-229": { feature: "Idle cash guidance", items: [59], coverage: "part", note: "idle cash (59); suggesting where it goes is advice" },
  "T2-COPILOT-248": { feature: "Credit Utilization alert", items: [90], coverage: "part", note: "the utilization signal behind paying early (90)" },
  "T2-COPILOT-254": { feature: "Bank Fee Alert", items: [81], coverage: "part", note: "catching a fee (81); asking for it back is the rest" },
  // YNAB: the one payoff calculator.
  "T2-YNAB-181": { feature: "ChatGPT debt payoff calculator", items: [91], coverage: "full", note: "a payoff estimate (91)" },
  // Cleo: the safe-to-spend rows in Autopilot and the credit score rows beside the card.
  "T2-CLEO-024": { feature: "Daily Plan", items: [14], coverage: "part", note: "a safe-to-spend amount (14); the get-back-on-track steps are the rest" },
  "T2-CLEO-025": { feature: "Daily spending figure", items: [14], coverage: "full", note: "safe to spend per day (14)" },
  "T2-CLEO-088": { feature: "Personalized Credit Score", items: [101], coverage: "full", note: "the score and the reasons behind it (101)" },
  "T2-CLEO-090": { feature: "Credit score coaching", items: [101], coverage: "part", note: "explaining the score (101); coaching steps are the rest" },
  "T2-CLEO-091": { feature: "Credit history", items: [101], coverage: "full", note: "the score tracked over time (101)" },
};

module.exports = { SECTIONS, ROWS };
