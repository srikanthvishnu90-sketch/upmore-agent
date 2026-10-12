# DOCUMENTS: the vault, receipts, phishing, sessions and tax dates (packet added for G4)

`packages/domain/62-agent-documents.js` (`AgentDocuments`) covers documents and security (spec doc 02: INS-001/003/008/009/010,
TAX-002/003/005/010/012, TXN-010/015/016, SEC-008/011): the vault index (typed metadata only, never the bytes, never an
identity or account number), policies with renewals and the beneficiary audit, enrollment windows, receipt emails parsed
and matched to a charge, photo receipts attached by what the person states, the unrecognized-charge ladder, phishing
signals with the reason stated (never a "safe" verdict), the agent's own session audit, the tax calendars, the donation
log and refund tracking. Nothing here reads a mailbox or a camera.

Reachability: **not yet imported by any edge or app path.** No build script bundles it and nothing under
`supabase/functions` or `src/upmore-app-template.html` calls it; only its file path appears, as data, in the registry
carried by the router bundle. These tests load it with the merchant label (32), monitors (33), money math (48) and the
ledger (57) that the charge ladder reads.
Check: `node --test tests/depth-DOCUMENTS.test.cjs && node evals/depth/run.cjs DOCUMENTS`.

Bugs this packet pins, each written as a failing test first (logged in `docs/playbook-drift-2026-10-12.md`):
- S01 (found here): the vault's identity check read only `text`, which is never stored: a title "W-2 2025 SSN 123 45
  6789", an issuer carrying an account number or a tag with a card number was stored and later shown by `find`. Every
  kept metadata field is now checked, and a spaced SSN ("123 45 6789") counts. An order number such as
  112-1234567-1234567 is still accepted. D01, D02.
- S02 (found here): "total" matched inside "Subtotal", so a receipt reading "Subtotal: $40.00 ... Total: $43.20" was
  parsed as $40.00 and matched the wrong charge or none. D03.
- S03 (found here): the order number was any word after "order": "Order Confirmation" gave order "Confirmation",
  "Order Total" gave "Total", and "Your trip confirmation ... Confirmation: XKJQPL" gave "Confirmation". A code now needs
  a digit, or is an all-capital code after an explicit marker (#, number, no., id, a colon), so airline codes are kept.
  Compared old and new on ten realistic receipts: every difference is a correction. D04.
- S04 (found here): a receipt from no-reply@doordash.com was from merchant "no reply" (receipts@, orders@, auto-confirm@
  likewise), so it never matched the DoorDash charge by name. A shared mailbox now names the domain. D05.
- S05 (found here): the link check flagged any link whose text named a site, the bank's own included: "view it at
  www.mockbank.com" linking to www.mockbank.com was "Suspicious". It now compares the two sites. D06.
- S06 (found here): reply-to and sender domains were split on "@", so "Mock Bank <alerts@mockbank.com>" had the domain
  "mockbank.com>" (a mismatch with its own reply-to); "Bank of America" never matched bankofamerica.com; a From with no
  address threw a TypeError. D07, D08.
- S07 (found here): signal texts did not read after "it": "Phishing: it the link text names one site ...", "it a
  look-alike domain". D09.
- S08 (found here): in early January the marketplace window still open from November was "opens in 295 days". The window
  that has not closed is used; after Medicare's Dec 7 close the next year's opening is given instead of "closed". D10.
  These are the usual month-days in code (`PUBLIC_WINDOWS`), not dated data: the marketplace's January 15 close is not
  confirmed for 2027 coverage (HealthCare.gov's pages say January 15; CMS rule CMS-9884-F set December 15 for the
  federal platform from 2027), and the tax dates here do not roll past weekends or holidays. What the chat and the hourly
  run say comes from `99-deadlines.js` over `packages/offers/deadlines.json` instead (docs/depth/DEADLINES.md;
  docs/playbook-drift-2026-10-12.md).
- S09 (found here): "(1 days)", "(0 days)", "opens in 1 days". D11, D12.
- S10 (found here): a paper return "received" was told "most e-filed refunds arrive within 21 days, so by about" a
  42-day date; a received return past its window was told "by about" a date already gone. D13, D14.
- S11 (found here): the donation log counted a pending hold and its posted gift twice ($640.00 for one $300.00 gift and a
  $40.00 one) and carried no source or as-of. D15, D16.
- S12 (found here): a device the person had revoked counted as "known", so it signing in again was not called out. D17.
- S13 (found here): a lapsed policy was listed like live cover ("$1,420.00 a year") and its premium added to the annual
  total. D18.
- S20 (found here): no sessions said "0 active sessions: .". D25.
- S03, S11 (fixed after merge, from this packet's notes): a "Receipt #" followed by a card number took the card number as the order
  number, which goes into the stored attachment title; a 13-19 digit code passing the card checksum is never an order
  number now (D03b; a long order number that is not a card is kept). A gift in another currency was added into the
  dollar total; it is now said and left out (D11b).

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | No identity digits in the vault's metadata | an SSN in a title, an account number as the issuer, a card in a tag are refused | `S01` in tests/depth-DOCUMENTS.test.cjs | only the free text is checked, so a title or tag carrying an SSN or card number is stored and shown (the bug found building this packet) | proven |
| S01 | A spaced SSN is an SSN | "123 45 6789" as text is refused | `S01` in tests/depth-DOCUMENTS.test.cjs | only the dashed SSN shape is recognized (the bug found building this packet) | proven |
| S02 | The total, not the subtotal | $43.20 after a $40.00 subtotal | `S02` in tests/depth-DOCUMENTS.test.cjs | "total" matches inside "Subtotal" (the bug found building this packet) | proven |
| S03 | An order number is a code | "Order Confirmation" is not order "Confirmation"; XKJQPL is kept | `S03` in tests/depth-DOCUMENTS.test.cjs | any word after "order" is taken as the order number (the bug found building this packet) | proven |
| S03 | A card number is not an order number | a receipt code that is a card number gives no order number and its digits appear nowhere | `S03` in tests/depth-DOCUMENTS.test.cjs | any long digit code after Receipt # is the order number | proven |
| S04 | No-reply mail is from the company | no-reply@doordash.com is doordash | `S04` in tests/depth-DOCUMENTS.test.cjs | the shared-mailbox check reads the domain instead of the mailbox, so the merchant is "no reply" (the bug found building this packet) | proven |
| S05 | Same site is not a mismatch | www.mockbank.com linking to www.mockbank.com is clean | `S05` in tests/depth-DOCUMENTS.test.cjs | any link whose text names a site is called a mismatch (the bug found building this packet) | proven |
| S06 | Domains from the address | "Mock Bank <alerts@mockbank.com>" replying from mockbank.com is clean | `S06` in tests/depth-DOCUMENTS.test.cjs | the domain is everything after the @, so a display name's closing ">" makes a mismatch (the bug found building this packet) | proven |
| S06 | "Bank of America" is bankofamerica.com | a spaced company name matches its domain | `S06` in tests/depth-DOCUMENTS.test.cjs | the claimed name is compared with its spaces (the bug found building this packet) | proven (also fails S07) |
| S07 | Signals read after "it" | "it links to one site while its text names another" | `S07` in tests/depth-DOCUMENTS.test.cjs | the old signal wording comes back: "it the link text names one site" (the bug found building this packet) | proven |
| S08 | January's open window | on Jan 10 the marketplace is open, 5 days left | `S08` in tests/depth-DOCUMENTS.test.cjs | only this year's window is considered, so early January says "opens in 295 days" (the bug found building this packet) | proven |
| S09 | One day is "1 day" | "(1 day)", "opens in 1 day" | `S09` in tests/depth-DOCUMENTS.test.cjs | every count says "days" (the bug found building this packet) | proven |
| S09 | The day itself is "today" | a renewal today says "(today)" | `S09` in tests/depth-DOCUMENTS.test.cjs | a renewal today says "(0 days)" | proven |
| S10 | Paper returns say 42 days | "most paper-filed refunds arrive within 42 days" | `S10` in tests/depth-DOCUMENTS.test.cjs | every received return is told the e-file window (the bug found building this packet) | proven |
| S10 | Received but late is overdue | received 50 days ago is overdue | `S10` in tests/depth-DOCUMENTS.test.cjs | the received stage wins over the window, so the text says "by about" a date already gone (the bug found building this packet) | proven |
| S11 | Posted gifts only | $340.00, not $640.00 | `S11` in tests/depth-DOCUMENTS.test.cjs | a pending hold is counted as a second gift (the bug found building this packet) | proven |
| S11 | The log cites its rows | source and as-of on the donation log | `S11` in tests/depth-DOCUMENTS.test.cjs | the log is returned without its source and as-of (the bug found building this packet) | proven |
| S11 | Other currencies are not dollars | a EUR gift is said, not added to the dollar total | `S11` in tests/depth-DOCUMENTS.test.cjs | every gift's amount is added as dollars | proven |
| S12 | A revoked device is not known | Chrome in Lisbon after a revoke is new | `S12` in tests/depth-DOCUMENTS.test.cjs | revoked sessions count as known devices (the bug found building this packet) | proven |
| S13 | A lapsed policy is not a cost | $180.00 a year, not $1,600.00 | `S13` in tests/depth-DOCUMENTS.test.cjs | a lapsed policy's premium is still added (the bug found building this packet) | proven |
| S14 | Day 45 is in the window | a renewal in 45 days is raised | `S14` in tests/depth-DOCUMENTS.test.cjs | the window ends a day early | proven |
| S15 | Events since the review | a marriage after the review is due; a move before it is not | `S15` in tests/depth-DOCUMENTS.test.cjs | the event comparison is inverted | proven |
| S16 | Estimated dates for estimated payers | no q dates without the flag | `S16` in tests/depth-DOCUMENTS.test.cjs | the payer condition is inverted | proven |
| S17 | The quarter rounds up to the dollar | $12,345.67 a year is $3,087.00 a quarter | `S17` in tests/depth-DOCUMENTS.test.cjs | the quarter is rounded to nearest, a dollar short | proven |
| S18 | $250.00 needs an acknowledgment | a $250.00 gift is flagged | `S18` in tests/depth-DOCUMENTS.test.cjs | the threshold is exclusive | proven |
| S19 | Ambiguity is asked, not guessed | two $43.20 charges match nothing | `S19` in tests/depth-DOCUMENTS.test.cjs | the first of several candidates is taken | proven |
| S20 | No sessions says so | "No active sessions." | `S20` in tests/depth-DOCUMENTS.test.cjs | the empty case is not handled, so it says "0 active sessions: ." (the bug found building this packet) | proven |
| S20 | The session in use stays | revoking this session is refused | `S20` in tests/depth-DOCUMENTS.test.cjs | the current-session guard is dropped | proven |
| S21 | A converted trial explains a charge | Mockflix with a trial is likely yours | `S21` in tests/depth-DOCUMENTS.test.cjs | a trial is left out of what makes a charge likely yours | proven |
| S22 | Photos match within 7 days | a photo dated 6 days before the charge matches | `S22` in tests/depth-DOCUMENTS.test.cjs | the photo uses the email window of 4 days | proven |
<!-- results:end -->
