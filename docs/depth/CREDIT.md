# CREDIT: scores, the report walkthrough, plans, alerts and letters (packet added for G4)

`packages/domain/61-agent-credit.js` (`AgentCredit`) works over the rows a bureau or servicer connector supplies (spec doc
02, CRDT-001/002/003/004/005/006/007/011/012/014/015/016): score monitoring with FICO bands and real moves, the report
walkthrough with what looks off, factor explanations with the person's own numbers, the utilization plan, new-account
impact in honest ranges, hard-inquiry alerts against the person's applications, the refinance breakeven, student-loan
program checks against a dated rules table, freeze guidance, the authorized-user explainer, and dispute and collector
letters with no identity number in them. Nothing here pulls a report or files anything; drafts go to the person. Every
number is a mechanism or the person's own row, never a recommendation to borrow, buy or invest.

Reachability: **not yet imported by any edge or app path.** No build script bundles it and nothing under
`supabase/functions` or `src/upmore-app-template.html` calls it; only its file path appears, as data, in the registry
carried by the router bundle. These tests load the module alone.
Check: `node --test tests/depth-CREDIT.test.cjs && node evals/depth/run.cjs CREDIT`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S01 (found here): the score change compared the latest row with whichever row came before it, any bureau or model:
  Experian FICO 8 705 after an Equifax VantageScore 720 was "down 15 ... Worth a look: that is a real move", a false
  alert for anyone with two score feeds. Moves are now measured within the same bureau and model ("down 7 since
  2026-09-01", no alert). D01.
- S02 (found here): the derogatory factor said "0 public records or collections on file" with two collections on the
  report (only public records were counted). Now "0 public records and 1 collection". D02.
- S03 (found here): "It leaves the report by" was 730 days on, a day early whenever Feb 29 falls between (2026-04-05 said
  2028-04-04). Two calendar years now; Feb 29 goes to Feb 28. The old `tests/credit.test.cjs` pinned 2028-04-04 and is
  corrected. D03.
- S04 (found here): a collector letter printed `account_last4` as given: a pasted card number went into the letter in full,
  with `contains_identity_numbers: false` hard-coded. Only the last four digits are used now and the flag is computed. D04.
- S05 (found here): a dispute letter copied the reason, item name and evidence as typed: "my SSN 123 45 6789 was used"
  and "4111 2222 3333 7710" reached the letter, and the identity check (`/\d{5,}/`) missed spaced numbers. SSNs and 9-19
  digit numbers in any typed field are now "[number removed]". Trade-off for the owner: a phone number typed into the
  reason is removed too; dates, amounts, ZIP codes and "ending 7710" are kept. D05.
- S06 (found here): freeze progress matched bureau names exactly, so "equifax" frozen still sent the Equifax link. D06.
- S07 (found here): the walkthrough treated "I applied for nothing" (an empty application list) as no list, so three
  unexplained hard inquiries were "Nothing looks off"; the inquiry alerts already flagged them. D07.
- S08 (found here): factor explanations ("You are using 42 percent ... ($2,120.00 of $5,000.00)") carried no source or
  as-of. Each now carries the bureau and the report date. D08.
- S20 (found here): an empty report said "Oldest ?, average age ?.". Now "0 open, 0 closed; no opening dates reported." D20.

- S01, S10 (fixed after merge): "up 0 since" is "unchanged since" (D01b); 29.5 percent is said 29.5, never "30"
  next to "under 30 percent helps" (whole percents otherwise, D10b); two cards over half their limit are counted (D10c).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | Same bureau, same model | Experian 705 is down 7 from Experian 712, not 15 from Equifax | `S01` in tests/depth-CREDIT.test.cjs | the previous row is whichever came last, any bureau or model (the bug found building this packet) | proven |
| S01 | Unchanged is unchanged | the same score twice says unchanged since | `S01` in tests/depth-CREDIT.test.cjs | a zero change reads "up 0" | proven |
| S02 | Collections are counted | "1 public record and 2 collections" | `S02` in tests/depth-CREDIT.test.cjs | the public-record count is used for the collections too (the bug found building this packet said only "or collections") | proven |
| S03 | Two calendar years | 2024-01-15 falls off 2026-01-15 | `S03` in tests/depth-CREDIT.test.cjs | 730 days are added, a day early across Feb 29 (the bug found building this packet) | proven |
| S04 | Last four digits only | a pasted card number reads "account ending 7710" | `S04` in tests/depth-CREDIT.test.cjs | the account field is printed as given, whole card number included (the bug found building this packet) | proven |
| S05 | No identity digits in a dispute | "my SSN [number removed]" | `S05` in tests/depth-CREDIT.test.cjs | the reason is copied into the letter as typed, SSN included (the bug found building this packet) | proven |
| S06 | Bureau names in any case | "equifax" frozen counts as Equifax | `S06` in tests/depth-CREDIT.test.cjs | bureau names are compared exactly as typed (the bug found building this packet) | proven |
| S07 | "I applied for nothing" is checked | an empty application list flags all 3 hard inquiries | `S07` in tests/depth-CREDIT.test.cjs | an empty list is read as no list (the bug found building this packet) | proven |
| S08 | Factors cite the report | source Experian, as of 2026-10-10 | `S08` in tests/depth-CREDIT.test.cjs | the explanation is returned without its source and as-of (the bug found building this packet) | proven |
| S09 | Band edges | 670 is good, 800 exceptional | `S09` in tests/depth-CREDIT.test.cjs | the band floor is exclusive | proven |
| S10 | Open cards only | $2,120.00 of $5,000.00 | `S10` in tests/depth-CREDIT.test.cjs | closed cards are counted in utilization | proven (also fails S08, S15, S19) |
| S10 | No rounding across the line | 29.5 percent is said 29.5, not 30 | `S10` in tests/depth-CREDIT.test.cjs | the share is always rounded to a whole percent | proven |
| S10 | Two cards are two | two cards over half their limit are counted | `S10` in tests/depth-CREDIT.test.cjs | any number of such cards reads "One card" | proven |
| S11 | Only cards over the target | a card at exactly 30 percent gets no move | `S11` in tests/depth-CREDIT.test.cjs | a card at the target gets a $0.00 pay-down | proven |
| S12 | Breakeven rounded up | $6,000.00 / $185.41 is 33 months | `S12` in tests/depth-CREDIT.test.cjs | the breakeven is rounded to nearest (32 months, before it has paid back) | proven |
| S13 | Total cost decides | a 30-year quote at 6.00 percent is not worth it | `S13` in tests/depth-CREDIT.test.cjs | the total-cost check is dropped, so a longer term looks like a saving | proven |
| S14 | 120 payments is likely | the 120th payment turns on track into likely | `S14` in tests/depth-CREDIT.test.cjs | the payment count must exceed 120 | proven |
| S15 | The new account is counted | average age 114 to 95 months | `S15` in tests/depth-CREDIT.test.cjs | the average is divided by the old count, so the age never drops | proven |
| S16 | The 14-day match window | 15 days apart is flagged | `S16` in tests/depth-CREDIT.test.cjs | the window is 15 days | proven |
| S17 | Soft pulls never count | 3 hard in 12 months with a soft pull on file | `S17` in tests/depth-CREDIT.test.cjs | soft inquiries are counted as hard | proven (also fails S07, S19) |
| S18 | Closed at $0.00 is fine | only Mock Old card ($50.00) is flagged | `S18` in tests/depth-CREDIT.test.cjs | a closed card at $0.00 is flagged too | proven (also fails S07, S19) |
| S19 | The walkthrough's own numbers | average age 9.5 years | `S19` in tests/depth-CREDIT.test.cjs | the average age is rounded to whole years (10) | proven |
| S20 | An empty report says what is missing | "no opening dates reported" | `S20` in tests/depth-CREDIT.test.cjs | the empty case is not checked, so the text says "Oldest NaN years" (it said "?" before this packet) | proven |
<!-- results:end -->
