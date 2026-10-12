# REWARDS: rewards math depth packet (overnight F1-F3)

Rotating 5% categories, a stated welcome-bonus spend target, and the annual fee against credits used, all over the
person's own card rows (packages/domain/87-rewards-math.js). Check: `node --test tests/depth-REWARDS.test.cjs && node evals/depth/run.cjs REWARDS`.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Categories and cap from the offer book | the categories, cap and citation are the dated term's | `S01` in tests/depth-REWARDS.test.cjs | the categories are cut to the first one | proven |
| S02 | Activation date and days left | the days left are counted to the activation date | `S02` in tests/depth-REWARDS.test.cjs | the days left are counted from the quarter start | proven |
| S03 | Only this quarter counts | a September charge is left out | `S03` in tests/depth-REWARDS.test.cjs | the quarter start is ignored | proven |
| S04 | The cap stops the 5% | spend over the cap earns nothing more | `S04` in tests/depth-REWARDS.test.cjs | the cap is not applied | proven |
| S05 | A stale promo is said | a 19-day-old promo says it may have changed | `S05` in tests/depth-REWARDS.test.cjs | terms never go stale | proven |
| S06 | Only this card's rows | another card's grocery run is left out | `S06` in tests/depth-REWARDS.test.cjs | rows from every card count | proven |
| S07 | Pending and other currencies are left out | a pending charge and a euro charge don't count | `S07` in tests/depth-REWARDS.test.cjs | the posted check accepts pending rows in any currency | proven |
| S08 | Only category merchants count | a hardware store doesn't count | `S08` in tests/depth-REWARDS.test.cjs | every merchant counts as a category | proven |
| S09 | A target counts from the opening day | a charge the day before opening is left out | `S09` in tests/depth-REWARDS.test.cjs | the opening date is ignored | proven |
| S10 | Returns come off | a $100 return lowers the spend | `S10` in tests/depth-REWARDS.test.cjs | returns are never found | proven |
| S11 | Payments and credits are neither spend nor returns | a card payment and a statement credit change nothing | `S11` in tests/depth-REWARDS.test.cjs | statement credits are counted as returns | proven |
| S12 | The window end date | Jan 31 plus a month is Feb 28 | `S12` in tests/depth-REWARDS.test.cjs | the month-end clamp is gone, so Jan 31 rolls into March | proven |
| S13 | No push to spend, no promised watcher | the short path says spend only what you would anyway | `S13` in tests/depth-REWARDS.test.cjs | the caution is dropped | proven |
| S14 | Fee vs credits from the year before | a credit from 14 months ago doesn't count | `S14` in tests/depth-REWARDS.test.cjs | credits from any time count | proven |
| S15 | Which card | two matching cards ask which one | `S15` in tests/depth-REWARDS.test.cjs | the first of several matches is taken silently | proven |
<!-- results:end -->
