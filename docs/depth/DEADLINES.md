# DEADLINES: a deadline is near, said on its own and on ask

The owner's Full Agent Capability List, section 2 "The agent speaks first", item 39: "A deadline is near: tax date, FSA
use-it-or-lose-it, open enrollment, class action claim date". Before this packet it was MODULE_ONLY (TAX-010, INS-009,
EARN-008, SAVE-020): `62-agent-documents.js` had a tax calendar and enrollment windows by their usual month-days, with no
weekend or holiday roll, no source or checked date per date, and nothing in the hourly run or in chat called them.
Read-only, dates only: nothing here says what to file, pay, pick or enroll in.

Module `packages/domain/99-deadlines.js` (in the router bundle), dated data `packages/offers/deadlines.json`, the hourly
run `supabase/functions/_shared/proactive.ts` (`plan()`), the chat answer `supabase/functions/agent-chat/_shared/deadlines_answer.ts`
(wired in `agent-chat/handler.ts`'s direct chain), what the person says in `_shared/proactive.ts` `parseCommand`.

## What can be said from real, dated, sourced data (research, 2026-10-12)

Researched by web search restricted to irs.gov, cms.gov, medicare.gov and healthcare.gov on 2026-10-12. The pages
themselves could not be opened from the build environment (DNS), so each row in the data file says what the official
page's search result states (`how_checked`). Tax rows stay current for 365 days (a date set by law), enrollment rows 90;
past that the answer says the dates may have changed and where to check.

| Deadline | Date on file | Said on its own to | Source |
| --- | --- | --- | --- |
| Extended 2025 Form 1040 | Thu Oct 15, 2026 (printed) | people who said "I filed an extension" | IRS fourth-quarter tax calendar (Publication 509, 2026) |
| 4th 2026 estimated payment | Fri Jan 15, 2027 (printed) | people who said they pay estimated tax | IRS 2026 Form 1040-ES |
| 2026 Form 1040 and Form 4868 | Thu Apr 15, 2027 (by the rule; the 2027 calendar is a draft) | everyone with alerts on | IRS Publication 509 for 2027, draft |
| 2027 estimated payments | Apr 15, Jun 15, Sep 15, 2027; **Tue Jan 18, 2028** (Jan 15 is a Saturday, Jan 17 Martin Luther King Jr. Day) | people who pay estimated tax | the 2026 Form 1040-ES schedule a year on |
| Extended 2026 Form 1040 | Fri Oct 15, 2027 | people who filed an extension for 2026 | Publication 509 for 2026, Form 4868 |
| Medicare Open Enrollment (2027 coverage) | Oct 15 to Mon Dec 7, 2026 | people who said they're on Medicare | Medicare.gov Open Enrollment page; CMS press release |
| HealthCare.gov, coverage from Jan 1, 2027 | Nov 1 to Tue Dec 15, 2026 | people who said they buy coverage there | HealthCare.gov dates and deadlines |

Not confirmed, and said so: when 2027 open enrollment itself closes on HealthCare.gov (its pages say January 15; the 2025
CMS rule CMS-9884-F set December 15 for the federal platform from 2027). State tax dates and state marketplaces differ;
the IRS can postpone dates for disaster areas (the tax answer says both).

From the person only: an FSA's plan-year end and grace period ("my FSA plan year ends December 31 with a grace period
until March 15"), a work open-enrollment window ("my open enrollment at work is November 2 to November 13"). Nothing is
assumed: no FSA, no employer, no Medicare and no estimated tax unless the person said so. Stored as watches of kind
`deadline_fact` in `agent_proactive_settings.watches` (no migration; no run of 9 or more digits).

**Not built:** class-action claim dates. `44-agent-earn.js` matches settlements from an input catalog, and no verified,
non-placeholder settlement list is on file here, so the answer says "Class-action claim dates aren't here: I don't have a
verified settlement list yet." HSA and FSA contribution maximums (SAVE-020's "max reminder") are not built either; SAVE-020
is used only as the capability id of the FSA date note.

## How it behaves

- The hourly run (`plan()`): each date that applies to the person, 14 days and 2 days before (a date first seen 5 days
  out gets the 14-day note), under the key `deadline:<id>:<lead>` (once per person by the log), in the person's own day.
  A public date for everyone is a finding: alerts on, the daily budget unless within 2 days of the date
  (`AgentLoop.budgetAllows`, its deadline exemption). A date the person gave, or a public date they said applies to them,
  is theirs (a watch): it comes with alerts off and never uses the budget. Quiet hours hold every deadline note.
- Chat: "what deadlines are coming up", "when are taxes due", "when are quarterly taxes due", "when is open enrollment",
  "when is my fsa deadline", "any class action deadlines?". Each line: the date with its weekday, the days left, why it
  moved if it did, who it is for; then the caveats, then the sources with their checked date.

## Sub-capabilities

<!-- results:start -->
| # | Sub-capability | What it does | Its test | The break I proved | Status |
| --- | --- | --- | --- | --- | --- |
| S01 | A tax date with its source | extended 2025 returns due Thursday, October 15, 2026, 3 days, IRS calendar checked Oct 12, 2026 | `S01` in tests/depth-DEADLINES.test.cjs | the note drops where the date came from | proven |
| S02 | Weekends move a tax date | Saturday Oct 24 is due Monday Oct 26, and the note says why | `S02` in tests/depth-DEADLINES.test.cjs | a weekend never moves the date | proven (also fails S03, S18) |
| S03 | Legal holidays move it again | Jan 15, 2028 is due Tuesday Jan 18 (MLK Day); Apr 15, 2028 is due Apr 18 (Emancipation Day) | `S03` in tests/depth-DEADLINES.test.cjs | holidays are ignored after the weekend | proven (also fails S18) |
| S04 | Only official sources on file | a blog link is refused; every published date matches the rule | `S04` in tests/depth-DEADLINES.test.cjs | an http link from anywhere is accepted as a source | proven |
| S05 | The person's day | 11:30 p.m. Oct 12 in New York: 3 days left, the 14-day note | `S05` in tests/depth-DEADLINES.test.cjs | today is read in UTC | proven |
| S06 | Old dates are said as possibly changed | checked Sep 1, 2025: may have changed, check irs.gov; enrollment after 90 days | `S06` in tests/depth-DEADLINES.test.cjs | dates on file never go stale | proven |
| S07 | Estimated tax only for people who pay it | no estimated-tax note on Jan 1 without the fact | `S07` in tests/depth-DEADLINES.test.cjs | every audience's dates are said to everyone | proven (also fails S08, S09, S10, S11, S12, S15) |
| S08 | 14 days and 2 days before | Dec 5 is the 2-day note for Dec 7 | `S08` in tests/depth-DEADLINES.test.cjs | only the 14-day note is ever said | proven (also fails S05, S09, S10, S12) |
| S09 | Said once | a logged key is not said again | `S09` in tests/depth-DEADLINES.test.cjs | the log is not checked | proven |
| S10 | Quiet hours hold it | 10 p.m. Dec 5: held as quiet_hours | `S10` in tests/depth-DEADLINES.test.cjs | deadline notes go out in quiet hours | proven |
| S11 | Alerts off silences public dates only | Apr 1 with alerts off: the return date held; the FSA date still said | `S11` in tests/depth-DEADLINES.test.cjs | public dates go out with alerts off | proven |
| S12 | The daily budget | a public 14-day note uses the budget; within 2 days it is exempt | `S12` in tests/depth-DEADLINES.test.cjs | a public note never counts against the budget | proven |
| S13 | The FSA grace period wins | plan year Dec 31, grace to Mar 15: the date is Mar 15 | `S13` in tests/depth-DEADLINES.test.cjs | the plan-year end is used even with a grace period | proven (also fails S11) |
| S14 | Work open enrollment from the person's dates | Nov 2 to Nov 13: closes Friday, Nov 13, 2 days | `S14` in tests/depth-DEADLINES.test.cjs | the person's work dates are never read | proven |
| S15 | What could not be confirmed is said | the 2027 HealthCare.gov close date note | `S15` in tests/depth-DEADLINES.test.cjs | the unconfirmed-date note is dropped | proven |
| S16 | Other taxes and advice go on | "when are property taxes due" is not a federal date | `S16` in tests/depth-DEADLINES.test.cjs | the advice and other-tax filter is dropped | proven |
| S17 | Sources with their checked date | Sources, checked Oct 12, 2026: ... | `S17` in tests/depth-DEADLINES.test.cjs | the sources line is dropped | proven |
| S18 | Past the file, it says so | Feb 1, 2028: the tax dates run through Jan 18, 2028 | `S18` in tests/depth-DEADLINES.test.cjs | past dates are listed as if ahead | proven |
| S19 | A fact can be taken back | forget my medicare deadline removes it | `S19` in tests/depth-DEADLINES.test.cjs | the fact is kept after forget | proven |
| S20 | The extension's tax year | Oct 12, 2026: the 2025 return | `S20` in tests/depth-DEADLINES.test.cjs | this year's return is assumed | proven |
| S20 | An extension covers its own year only | a 2025 extension says nothing about Oct 15, 2027 | `S20` in tests/depth-DEADLINES.test.cjs | any extension fact applies to every extended date | proven |
| S21 | Only real dates | February 30 asks again | `S21` in tests/depth-DEADLINES.test.cjs | an impossible date is stored | proven |
<!-- results:end -->

## Check

`node --test tests/depth-DEADLINES.test.cjs && node evals/depth/run.cjs DEADLINES`; through the hourly run and the chat
answer: `deno test tests/edge/deadlines.test.ts`.
