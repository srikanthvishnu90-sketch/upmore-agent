# REFUND-CHECK: "did my refund arrive?" (megadoc K07; capability list item 38, the asking half)

`packages/domain/98-refund-check.js` (`RefundCheck`) answers "did my refund arrive", "did my amazon refund come in", "has
the $45.99 refund from best buy posted yet", "did amazon refund me", "any refunds" from the person's own rows, read-only:
credits from the merchant named (its whole words in the bank's text, or run together at the start: "BESTBUY 00123"), or,
with no merchant, credits whose text says refund/return/credit or that come from a place the person paid in the 120
days before. The last 90 days (or from where the rows start), a row dated tomorrow in UTC counted as this evening's.
Pay, a person paying you back (Zelle, Venmo, Cash App), interest and transfers are never refunds; pending credits are
said as pending; other currencies are left out; an amount named is matched to the cent and another credit is said as
not that refund. With no merchant named it lists what looks like refunds instead of saying "yes" to a refund it can't
identify. None found is said with the days checked and the refund watch offered (`59-agent-alerts.js` refundWatch),
with no date made up. Tax refunds, how-to and advice asks go on to the model.

Where it runs: `supabase/functions/agent-chat/_shared/money_answers.ts` kind "refund" (after "how am I doing", before
"did it go through"), through `moneyReply` in the handler's direct answers; `tests/edge/refund-check.test.ts`.
Check: `node --test tests/depth-REFUND-CHECK.test.cjs && node evals/depth/run.cjs REFUND-CHECK`.

Noted, not changed: the shared `MoneyAnswers.termMatch` (the spending answer's merchant match) also accepts a merchant's
letters run together anywhere in the text, so "how much did I spend at amazon" counts an "AMAZONIA CAFE" row; this
module uses its own whole-word match. Logged for the owner.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | A named merchant's credit is a yes | yes, one credit from Amazon, to the cent | `S01` in tests/depth-REFUND-CHECK.test.cjs | the merchant filter is dropped, so every refund-looking credit is said as Amazon's | proven (also fails S02, S06, S07, S10) |
| S02 | To the cent | a $12.00 credit is not the $90.00 refund | `S02` in tests/depth-REFUND-CHECK.test.cjs | any credit from the merchant is taken as the refund asked about | proven |
| S03 | No bare yes | no merchant gives a list, not 'Yes' | `S03` in tests/depth-REFUND-CHECK.test.cjs | the merchant-named head is used for every ask | proven (also fails S04, S05, S16) |
| S04 | Pay is not a refund | payroll, Zelle, interest, Venmo are left out | `S04` in tests/depth-REFUND-CHECK.test.cjs | the not-a-refund words are not checked | proven |
| S05 | Paid there before | a credit from a new place without refund words is left out | `S05` in tests/depth-REFUND-CHECK.test.cjs | any credit counts as a refund | proven |
| S06 | Pending is not arrived | a pending $30.00 is said as pending | `S06` in tests/depth-REFUND-CHECK.test.cjs | pending credits are said as posted | proven |
| S07 | No made-up date | the watch offer names no date | `S07` in tests/depth-REFUND-CHECK.test.cjs | the offer gives an example date | proven |
| S08 | 90 days | a credit 91 days back is not listed | `S08` in tests/depth-REFUND-CHECK.test.cjs | the window reaches back 120 days | proven (also fails S01, S02, S03, S07) |
| S09 | Tonight's UTC row | a row dated tomorrow counts this evening | `S09` in tests/depth-REFUND-CHECK.test.cjs | the window ends today | proven |
| S10 | Whole words | Amazonia Cafe is not Amazon | `S10` in tests/depth-REFUND-CHECK.test.cjs | the squashed match runs anywhere in the text | proven |
| S11 | Tax refunds go on | 'did my tax refund arrive' is not this answer | `S11` in tests/depth-REFUND-CHECK.test.cjs | the tax/how-to guard is dropped | proven |
| S12 | The article is not the merchant | 'did amazon refund me' is amazon, not mazon | `S12` in tests/depth-REFUND-CHECK.test.cjs | the article needs no space after it | proven |
| S13 | A generic payer is no merchant | 'the airline' is not a merchant | `S13` in tests/depth-REFUND-CHECK.test.cjs | the generic-payer check is dropped | proven |
| S14 | Dollars only | a EUR credit is not listed as dollars | `S14` in tests/depth-REFUND-CHECK.test.cjs | the currency check is dropped | proven |
| S15 | Nothing posted is said | only a pending row: no posted transactions | `S15` in tests/depth-REFUND-CHECK.test.cjs | the empty case is not handled | proven |
| S16 | Source and as-of | every answer ends with the source line | `S16` in tests/depth-REFUND-CHECK.test.cjs | the source line is dropped | proven (also fails S01, S02, S03, S06, S07) |
<!-- results:end -->
