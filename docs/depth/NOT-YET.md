# NOT-YET: money actions Upmore can't do yet, said plainly (megadoc D06, D07, E25, F03, J09, J14, K08-K11, M02, M12)

`packages/domain/111-not-yet.js` (`NotYet`) answers the money actions that aren't built, ahead of the flows, so none is
misread or claimed: a transfer between the person's own accounts (the send parser read "transfer 1000 from savings to
brokerage" as a payment to someone called "brokerage"), locking or unlocking a card, a lost or stolen card, blocking a
merchant, paying a utility, phone, card or insurance bill, pausing or downgrading a subscription, opening an account,
recurring investing, everything to a new account (the scam warning first), a payment to the wrong person, a refund
from a store, savings automation, a savings goal's status, daily stock messages, IPOs, reminding someone else, a
group-chat request, and portfolio analytics (a benchmark comparison, sector weights, period returns, movers, tax on
a sale, dividends: "compare my portfolio to the S&P" used to get the plain portfolio as if that answered it). Each reply: what isn't built, the real path (the bank's, issuer's or service's own app, or what
Upmore can do instead: cancel by name, rent, buy now behind a yes), and that nothing was done. A send to a person, rent,
a split and money questions keep their own answers; a stolen card is answered even mid-sentence.

Where it runs: `notYetReply` in `supabase/functions/agent-chat/_shared/direct_answers.ts`, in the handler's first
direct line, before the flows.
Check: `node --test tests/depth-NOT-YET.test.cjs && node evals/depth/run.cjs NOT-YET`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Own-account transfers | not built, nothing moved | `S01` in tests/depth-NOT-YET.test.cjs | own transfers are not caught | proven (also fails S02, S15, S17) |
| S02 | A send to a person | never an own transfer | `S02` in tests/depth-NOT-YET.test.cjs | any recipient counts as an own account | proven |
| S03 | Lock and unlock | the card's own app | `S03` in tests/depth-NOT-YET.test.cjs | card locks are not caught | proven |
| S04 | Lost or stolen | report it to the issuer now | `S04` in tests/depth-NOT-YET.test.cjs | lost cards are not caught | proven (also fails S05, S15) |
| S05 | Stolen is urgent mid-sentence | a money question with a stolen card | `S05` in tests/depth-NOT-YET.test.cjs | the stolen card yields to the question filter | proven |
| S06 | Block a merchant | cancel by name, or the card's app | `S06` in tests/depth-NOT-YET.test.cjs | merchant blocks are not caught | proven |
| S07 | Bill pay | not built, nothing paid | `S07` in tests/depth-NOT-YET.test.cjs | bill pay is not caught | proven (also fails S15) |
| S08 | Rent, splits and paying a person | keep their own flows | `S08` in tests/depth-NOT-YET.test.cjs | the bill rule takes any 'pay ...' | proven |
| S09 | Pause or downgrade | the service's page, or cancel | `S09` in tests/depth-NOT-YET.test.cjs | pause and downgrade are not caught | proven |
| S10 | A savings plan is not a subscription | pause my savings plan | `S10` in tests/depth-NOT-YET.test.cjs | savings plans are taken as subscriptions | proven |
| S11 | Open an account | Upmore opens none | `S11` in tests/depth-NOT-YET.test.cjs | account opening is not caught | proven |
| S12 | Recurring investing | buy now, a yes, $5 cap | `S12` in tests/depth-NOT-YET.test.cjs | recurring investing is not caught | proven |
| S13 | Questions are not actions | balance, due date, declined | `S13` in tests/depth-NOT-YET.test.cjs | the question filter is gone | proven |
| S14 | Nothing was done | every reply | `S14` in tests/depth-NOT-YET.test.cjs | the transfer reply drops 'nothing was moved' | proven (also fails S01) |
| S15 | The way people type it | lead words, curly apostrophes, capitals | `S15` in tests/depth-NOT-YET.test.cjs | curly apostrophes and capitals are not normalised | proven (also fails S19, S23) |
| S16 | Portfolio analytics | benchmarks, sectors, returns said not built | `S16` in tests/depth-NOT-YET.test.cjs | analytics asks are not caught (the rule is renamed, so it never answers as analytics) | proven (also fails S14) |
| S17 | Everything to a new account | the scam warning, nothing moved | `S17` in tests/depth-NOT-YET.test.cjs | everything-to-a-new-account is not caught | proven |
| S18 | A payment to the wrong person | can't pull it back; the app can | `S18` in tests/depth-NOT-YET.test.cjs | wrong-person payments are not caught | proven |
| S19 | A refund from a store | said not built from code | `S19` in tests/depth-NOT-YET.test.cjs | refund request asks are not caught | proven |
| S20 | Savings automation | said not built from code | `S20` in tests/depth-NOT-YET.test.cjs | savings automation asks are not caught | proven |
| S21 | A savings goal's status | no goal set: how to set one | `S21` in tests/depth-NOT-YET.test.cjs | goal status asks are not caught | proven (also fails S14) |
| S22 | Daily stock messages | said not built from code | `S22` in tests/depth-NOT-YET.test.cjs | stock digest asks are not caught | proven |
| S23 | IPOs | said not built from code | `S23` in tests/depth-NOT-YET.test.cjs | ipo asks are not caught | proven |
| S24 | Reminding someone else | said not built from code | `S24` in tests/depth-NOT-YET.test.cjs | remind other asks are not caught | proven |
| S25 | A group chat request | said not built from code | `S25` in tests/depth-NOT-YET.test.cjs | group request asks are not caught | proven |
<!-- results:end -->
