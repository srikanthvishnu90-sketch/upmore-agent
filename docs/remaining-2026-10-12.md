# What is left, 2026-10-12 (after the overnight run)

Written after the overnight report (`docs/overnight/2026-10-12-overnight-plan.md`). Three lists: what only the owner can
do, what can be built now without crossing a gate (in build order), and what stays gated by a standing rule. The megadoc
counts are from `docs/scenarios/README.md`: PROVEN 0, BUILT 128, LIMITED 43, DIVERGES 3, MODEL 3, NOT_BUILT 63 (updated as items below land).

## 1. Only the owner can do these

1. **Go-live** (`bash scripts/launch/owner-go-live.sh`). It applies the pending migrations, including
   `20261012060000_oauth_vault_cascade`, and deploys the functions. Then it runs `verify-security-live.cjs` and the live
   gauntlet.
   - Set `OPENAI_API_KEY` as the function secret when it asks. Since be64f64 the app runs on OpenAI only. With no key, chat
     says the AI service isn't configured; it never falls back to Anthropic.
   - The Oct 11 live run on v207 stopped on a missing Anthropic key for exactly that reason.
2. **The one $5 live order (L-01).** Needs an explicit yes with the exact order and amount.
3. **Decisions on behavior the code now states:**
   - "buy 1 VOO" is read as $1 at market.
   - "ok" counts as a yes on a card (P13).
   - "should i cancel netflix" puts up a card (it still needs a yes).
   - The short card for stop, trailing and closed-market orders.
4. **Sources:** a dated savings-rate source (M05); current SEC and FINRA fee figures.
5. **Before texting goes live:**
   - a carrier STOP opt-out;
   - LoopMessage and Browserbase added to the privacy policy.
6. **Older items:** bank refresh, refunds netting, termMatch, movers data source, live gauntlet triage.

## 2. Buildable now, no gate crossed (build order)

| # | What | Megadoc | Data | Notes |
|---|---|---|---|---|
| 1 | ~~Splits by percentage ("60/40", "70%")~~ **done** | C11 | the person's words | LIMITED: asks who the roommate is, then who pays which; RAIL-1 S21 |
| 2 | Itemized splits ("sam only had a salad (12) of 96") | C06 | the person's words | named items to their owners, the rest split evenly |
| 3 | Dividends received | G15 | Alpaca account activities (DIV), read-only | amounts from the broker with source and as-of |
| 4 | Performance over a period, and against the S&P 500 | G02, G14 | Alpaca portfolio history; SPY bars | numbers only, no advice, period stated |
| 5 | Movers this week or month among the person's holdings | G10, G07 | Alpaca bars | "why" is never guessed |
| 6 | Late-fee alert | D15 | the person's rows; recovery fee names | a watch, said once per fee |
| 7 | One stop per holding, one card at a time | E13 | positions | every order its own yes, $5 cap |
| 8 | Scheduled send: the card goes up at the time asked | A08 | reminders + send flow | the send still needs a yes at that time |
| 9 | Teardown sections with no capability-list item (H1) | — | teardown build order | next after what's new and budgets |
| 10 | Testing-agent labeled gaps | — | corpus 1.02, 2.04 | both deliberate divergences; owner call |

## 3. Gated by a standing rule (not built past the gate)

- **Copy trading** (H01-H15), **IPO allocations and private shares** (I01-I08): securities advice and no rail. Said
  plainly from code.
- **Card lock and unlock, lost or stolen card, block a merchant** (K08-K11), **bill pay** (D06, D07), **transfers between
  the person's own accounts** (F03, M02), **savings automation** (M01, M03, M07, M09-M11), **open an account** (M12): no
  rail. Each is said not built, with the right place to do it.
- **Prediction markets and crypto**: decisions 2 and 3, off.
- **Recurring investing** (E25): an automation toggle with a yes per order is allowed, but there is no scheduler for
  orders yet. Said not built.
