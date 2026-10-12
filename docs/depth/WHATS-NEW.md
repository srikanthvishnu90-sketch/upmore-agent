# WHATS-NEW: the review inbox in chat (overnight H1)

Teardown rows T1-ORIGIN-028 (Review Transactions), T2-COPILOT-068/160 (Mark as reviewed, To Review), T2-MONARCH-065/066
(Needs Review), T2-YNAB-218 (New transactions banner), none of which maps to a capability-list item. "what's new?" lists
what posted since the person last asked, from their own rows, with fees, unusually large charges, first-time merchants
and same-day double charges flagged; the "reviewed through" date is read back from Upmore's own last reply in the thread
(packages/domain/92-whats-new.js). Read-only. Check: `node --test tests/depth-WHATS-NEW.test.cjs && node evals/depth/run.cjs WHATS-NEW`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Only a what's-new ask | 'what's new with tesla stock' is not this answer's | `S01` in tests/depth-WHATS-NEW.test.cjs | the ask is no longer anchored to the whole message | proven |
| S02 | The first time is 7 days | a row 8 days old is not new the first time | `S02` in tests/depth-WHATS-NEW.test.cjs | the first window is 8 days | proven |
| S03 | After the marker only | a row on the marker day is not new | `S03` in tests/depth-WHATS-NEW.test.cjs | the marker day itself counts as new | proven (also fails S13) |
| S04 | Upmore's own marker | a marker typed by the person is ignored | `S04` in tests/depth-WHATS-NEW.test.cjs | any message's marker counts | proven |
| S05 | The newest marker | Oct 10 wins over Sep 1 | `S05` in tests/depth-WHATS-NEW.test.cjs | the oldest marker is used | proven |
| S06 | Transfers are not spending | a $500 transfer to savings is not new spending | `S06` in tests/depth-WHATS-NEW.test.cjs | transfers are counted | proven |
| S07 | In and out apart | $7.00 out, $2,500.00 in | `S07` in tests/depth-WHATS-NEW.test.cjs | money in is netted against money out | proven |
| S08 | No foreign money in dollars | a EUR row is counted apart | `S08` in tests/depth-WHATS-NEW.test.cjs | the currency check is gone | proven |
| S09 | Fees flagged | OVERDRAFT FEE is a fee | `S09` in tests/depth-WHATS-NEW.test.cjs | overdraft is not in the fee words | proven |
| S10 | Twice the usual, $20 over | a $26 fill-up against $12.50 is not flagged | `S10` in tests/depth-WHATS-NEW.test.cjs | the $20 floor is gone | proven |
| S11 | A new merchant | NEWSTREAM.TV is new | `S11` in tests/depth-WHATS-NEW.test.cjs | new merchants are never flagged | proven |
| S12 | A same-day double charge, once | the double Kroger charge is flagged once | `S12` in tests/depth-WHATS-NEW.test.cjs | the pair is flagged twice | proven |
| S13 | Nothing new keeps the marker | the marker stays Oct 1 | `S13` in tests/depth-WHATS-NEW.test.cjs | with nothing new the marker jumps to today | proven |
| S14 | Source and the late-posting caveat | the caveat appears once a marker exists | `S14` in tests/depth-WHATS-NEW.test.cjs | the caveat is dropped | proven |
| S15 | Nothing linked | no rows says no connected bank | `S15` in tests/depth-WHATS-NEW.test.cjs | no rows says nothing new | proven |
<!-- results:end -->
