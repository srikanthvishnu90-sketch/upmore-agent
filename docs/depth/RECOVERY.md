# RECOVERY: money a bank may owe back, found in the person's own rows (packet added for G4)

`packages/domain/41-agent-recovery.js` (`AgentRecovery`) reads the person's retained bank rows and finds leads: bank
fees named by kind (overdraft, NSF, monthly maintenance, ATM, foreign transaction, late payment, paper statement), two
identical charges from the same merchant within 3 days, and holds still pending after 7 days. A reversal credit up to 60
days after a fee, on the same account and no bigger than it, is attached as an unverified lead, each credit once. Each
lead carries a request the person sends (`sent_by: "user"`, `requires_user_approval: true`, `executes: false`); a lead
is never money recovered (`recovered_cents: null`, `verified_recovered_cents: 0`). Rows in another currency, no longer
observed, or dated more than a day after today are left out and counted (the day after is the same evening: bank
dates are UTC); conflicting copies of one transaction stop the scan. The save
engine (`49-agent-save.js`) builds its fee findings on `scan()` for "find me money" in chat
(`supabase/functions/agent-chat/_shared/direct_answers.ts`) and the proactive feed, and drops a recurring charge from
the subscription list when `feeKind()` calls it a fee; `supabase/functions/_shared/recovery_service.ts` serves the full
report. The module is in the router bundle and the financial core.
Check: `node --test tests/depth-RECOVERY.test.cjs && node evals/depth/run.cjs RECOVERY`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S03 (found here): any descriptor with the word "maintenance" (or "monthly service") was a monthly maintenance bank
  fee. Three $89.99 charges from "VALLEY AUTO MAINTENANCE" made "find me money" say "$89.99 monthly maintenance fee
  every month: this saves an estimated $89.99 a month" with a draft asking "your bank" for a courtesy refund of an auto
  shop's bill, and took the charge off the subscription list. A fee or charge word is now required ("MAINTENANCE FEE",
  "MONTHLY SERVICE CHARGE", "SERVICE CHARGE" still are fees). D03 plants the old pattern.
- S08 (found here): a reversal credit whose label has two reversal words ("OD FEE REVERSAL CREDIT", "COURTESY REFUND
  OVERDRAFT FEE") was never linked to its fee, because only the first word was removed before naming the fee; the lead
  said `not_found` and the draft asked for a refund the bank had already given. Every reversal word is now removed.
  D08 plants the single removal.
- S18 (found here): one row dated after today threw "Transaction has a future date relative to the current scan." and
  the whole scan failed. Bank dates are UTC (`supabase/functions/simplefin-proxy/index.ts`) while chat's today is the
  person's own day, so an evening charge is routinely "tomorrow": "find me money" then answered "I can't read your
  linked accounts right now, so I won't guess at a number." Merge review: dropping such rows instead made an evening
  reversal invisible, so the fee read `not_found` and the draft asked for money the bank had already given back. A row
  dated the day after is now the same evening and counts; later rows are left out and counted (`excluded.future_dated`)
  and never influence a candidate (`tests/recovery.test.cjs` says both). D18 plants the throw, D18b the drop.

Noted, not changed (for the owner): a bare "MONTHLY MAINTENANCE" with no fee word is no longer a fee (no fixture or
known bank uses it; a miss costs one lead, a false one drafts a bank refund for a merchant's bill).

- S22 (fixed after merge, from this packet's notes): credit unions' "COURTESY PAY FEE" (their overdraft program) is an
  overdraft fee ("courtesy" is a reversal word only when not "courtesy pay"); "INTL TRANSACTION FEE" and "INTERNATIONAL
  PURCHASE TRANSACTION FEE" are foreign transaction fees; "MONTHLY MAINT FEE" is maintenance. A "service fee" is the
  bank's only at the start of the label or after an account word ("MONTHLY SERVICE FEE", "CHECKING MONTHLY SERVICE
  FEE"), so "DOORDASH SERVICE FEE" is the merchant's; a bare "RETURNED ITEM" debit (a deposited check bouncing back)
  is no NSF fee, "RETURNED ITEM FEE" is. Old vs new over the 74,774 quoted strings in the repo: 25 changed, every one
  of them one of these. D22, D22b, D22c plant each back.

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Fees named by kind | OVERDRAFT ITEM FEE is an overdraft fee | `S01` in tests/depth-RECOVERY.test.cjs | the overdraft pattern forgets "item", so OVERDRAFT ITEM FEE is no fee at all | proven |
| S02 | ATM cash is not a fee | a $200 ATM withdrawal is no candidate | `S02` in tests/depth-RECOVERY.test.cjs | any ATM line counts, fee word or not | proven |
| S03 | A business named maintenance is not the bank | VALLEY AUTO MAINTENANCE is no fee | `S03` in tests/depth-RECOVERY.test.cjs | bare "maintenance" or "monthly service" is a fee (the bug found building this packet) | proven (also fails S22) |
| S04 | A fee's reversal is not a fee | OVERDRAFT FEE REVERSAL is no fee | `S04` in tests/depth-RECOVERY.test.cjs | reversal wording is not excluded first | proven (also fails S22) |
| S05 | The fee request, word for word | $35.05 is written $35.05 | `S05` in tests/depth-RECOVERY.test.cjs | cents are not zero-padded, so $35.05 is written $35.5 | proven (also fails S16) |
| S06 | The person sends it | the draft needs the person's approval | `S06` in tests/depth-RECOVERY.test.cjs | the draft no longer needs the person's approval | proven |
| S07 | Day 60 is in the window | a reversal on day 60 is a lead | `S07` in tests/depth-RECOVERY.test.cjs | the window's last day is left out | proven |
| S08 | A reversal named twice is still a lead | OD FEE REVERSAL CREDIT links to the fee | `S08` in tests/depth-RECOVERY.test.cjs | only the first reversal word is removed before naming the fee (the bug found building this packet) | proven |
| S09 | One reversal, one fee | the second fee has no lead | `S09` in tests/depth-RECOVERY.test.cjs | a used credit is not taken out of the index | proven |
| S10 | A bigger credit is not the refund | a $9.99 credit is not a $3.00 fee's refund | `S10` in tests/depth-RECOVERY.test.cjs | the amount cap is dropped | proven (also fails S09) |
| S11 | Three days apart is still a possible duplicate | Oct 2 and Oct 5 are a pair | `S11` in tests/depth-RECOVERY.test.cjs | the window is read as under 3 days | proven |
| S12 | One charge's amount back | a $49.99 double charge asks for $49.99 | `S12` in tests/depth-RECOVERY.test.cjs | both charges are added up | proven (also fails S13) |
| S13 | Three charges, one pair | three $5.00 charges are one candidate | `S13` in tests/depth-RECOVERY.test.cjs | the paired charge is not skipped, so the middle one pairs twice | proven |
| S14 | Transfers are not duplicates | two $500 transfers are no candidate | `S14` in tests/depth-RECOVERY.test.cjs | transfers are grouped for duplicates | proven |
| S15 | A fee is a fee once | two ATM fees are two fees, no duplicate | `S15` in tests/depth-RECOVERY.test.cjs | fees already claimed are grouped for duplicates too | proven |
| S16 | Seven days pending is stale | a hold from Oct 5 is a lead on Oct 12 | `S16` in tests/depth-RECOVERY.test.cjs | a hold must be over 7 days | proven |
| S17 | Other currencies are left out | a EUR overdraft fee is counted, not drafted in dollars | `S17` in tests/depth-RECOVERY.test.cjs | the currency check is dropped | proven |
| S18 | Tomorrow's row is left out, not fatal | a charge dated Oct 13 does not stop the Oct 12 scan | `S18` in tests/depth-RECOVERY.test.cjs | a row dated after today throws (the bug found building this packet) | proven |
| S18 | This evening's rows are today's | an Oct 13 reversal links to its fee in the Oct 12 scan | `S18` in tests/depth-RECOVERY.test.cjs | rows dated the day after (bank dates are UTC) are dropped, so the draft asks for money already given back | proven |
| S19 | Conflicting copies stop the scan | the same id with $3.50 and $35.00 throws | `S19` in tests/depth-RECOVERY.test.cjs | a repeated id is skipped without comparing its facts | proven |
| S20 | Biggest first | the $200 hold before the $35 fee | `S20` in tests/depth-RECOVERY.test.cjs | the order is reversed | proven |
| S21 | $500.00 is still a fee | a $500.00 overdraft fee is a candidate | `S21` in tests/depth-RECOVERY.test.cjs | the cap excludes exactly $500.00 | proven |
| S22 | Courtesy Pay is the overdraft fee | a credit union's COURTESY PAY FEE is an overdraft fee | `S22` in tests/depth-RECOVERY.test.cjs | "courtesy" is read as a reversal word everywhere | proven |
| S22 | A merchant's service fee is not the bank's | DOORDASH SERVICE FEE is not a monthly maintenance fee | `S22` in tests/depth-RECOVERY.test.cjs | any "service fee" is a bank fee | proven |
| S22 | A bounced deposit is not a fee | a bare RETURNED ITEM debit is not an NSF fee | `S22` in tests/depth-RECOVERY.test.cjs | any returned item is an NSF fee | proven |
<!-- results:end -->
