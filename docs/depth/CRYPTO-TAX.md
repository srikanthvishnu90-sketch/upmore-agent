# CRYPTO-TAX: crypto tax export (real-world C163, registry TAX-007)

`packages/domain/118-crypto-tax.js` (`CryptoTax`), answered in chat by `supabase/functions/agent-chat/_shared/crypto_tax_answer.ts`. Read-only: no crypto venue is connected and none is claimed; the person pastes each venue's export CSV (generic headers, or Coinbase-style with an inclusive-of-fees total), the rows are normalized and matched lot by lot — FIFO by default, LIFO and HIFO on the person's word, specific-lot refused plainly — and the reply carries the gain/loss summary for the tax year (short/long by each lot's one-year anniversary), reward/staking income at the value the file states, the honest missing-basis list (a sale bigger than the file's buys, a receive with no basis: proceeds split out, basis blank in the export, never guessed), the wash-sale note for crypto's current rules (IRC 1091 covers stocks and securities; crypto is property, so the loss stands, with the proposed-bills and substance cautions), the Form 1099-DA gross-proceeds comparison when the person quotes the form, and two exports: Form 8949 rows (one per lot portion) and a generic tax-tool CSV. Transfers between the person's own venues are not sales. A trade disposes of the spent asset and opens a lot for what was received at the trade's value. Rows that cannot be read are listed as skipped with the reason. Nothing is filed or sent; the person or their CPA files.

Standing-rule note: the crypto guard keeps every trade ask refused. Its one carve-out (owner-approved C163) lets tax words with no trade verb, and a pasted CSV itself, reach this answer; "sell my bitcoin and do my taxes" stays refused because it carries a trade verb.

Check: `node --test tests/depth-CRYPTO-TAX.test.cjs && node evals/depth/run.cjs CRYPTO-TAX`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Generic CSV import, date order | shuffled rows import sorted | `S01` in tests/depth-CRYPTO-TAX.test.cjs | the parsed rows are not sorted into date order | proven |
| S02 | Coinbase inclusive total | basis 728 from the inclusive total | `S02` in tests/depth-CRYPTO-TAX.test.cjs | Subtotal wins over the Total (inclusive of fees) column | proven |
| S03 | FIFO lot order | oldest lots first, to the cent | `S03` in tests/depth-CRYPTO-TAX.test.cjs | FIFO consumes newest lots first | proven (also fails S05, S06) |
| S04 | Short/long split under LIFO | split moves, total does not | `S04` in tests/depth-CRYPTO-TAX.test.cjs | short-term and long-term gains are swapped | proven (also fails S03) |
| S05 | HIFO lot order | highest unit basis first | `S05` in tests/depth-CRYPTO-TAX.test.cjs | HIFO consumes the lowest unit basis first | proven |
| S06 | Term by anniversary | portion by portion | `S06` in tests/depth-CRYPTO-TAX.test.cjs | the anniversary is the acquisition date itself, so nothing is long-term | proven (also fails S03, S04) |
| S07 | Missing basis listed | $10,500.00 shortfall | `S07` in tests/depth-CRYPTO-TAX.test.cjs | the shortfall's proceeds are recorded as zero instead of listed | proven (also fails S12) |
| S08 | Reward income | $160.00 at the file's value | `S08` in tests/depth-CRYPTO-TAX.test.cjs | reward income is recorded as zero | proven |
| S09 | Transfers are not sales | a send opens no disposal | `S09` in tests/depth-CRYPTO-TAX.test.cjs | a send is parsed as a sell | proven |
| S10 | Wash-sale pair found | buy-back inside 30 days | `S10` in tests/depth-CRYPTO-TAX.test.cjs | the buy-back window is zero days, so no pair is ever found | proven |
| S11 | Skipped rows listed | three skipped with reasons | `S11` in tests/depth-CRYPTO-TAX.test.cjs | an unreadable date is dropped without a skipped entry | proven |
| S12 | 8949 ties to the summary | proceeds column sums to the net | `S12` in tests/depth-CRYPTO-TAX.test.cjs | every 8949 proceeds cell is written as zero | proven |
| S13 | 1099-DA gross comparison | match at $60,200.00 gross | `S13` in tests/depth-CRYPTO-TAX.test.cjs | the form is compared against net proceeds instead of gross | proven |
| S14 | The honest no-file prompt | nothing connected, nothing invented | `S14` in tests/depth-CRYPTO-TAX.test.cjs | the prompt claims the venues are connected | proven |
| S15 | A trade opens the received lot | SOL lot at the trade's value | `S15` in tests/depth-CRYPTO-TAX.test.cjs | no lot is opened for what a trade received | proven |
<!-- results:end -->
