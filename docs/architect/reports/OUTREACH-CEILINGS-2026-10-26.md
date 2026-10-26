# Outreach lane ceilings: keep or reconcile (SERIAL-1410 (3), 2026-10-26)

Scope: the networking-email lane only (drafts the person approves, sent from their own Gmail by the scheduled run).
The owner's no-cap rule (CAPS-1390, 2026-10-22) was about applications, which are not sends from the person's own
mailbox; it is applied there (no product ceiling; only the pace the person sets). This lane's numbers protect the
person's Gmail reputation and the people written to. The exact send approval (one yes binding each message's hash;
nothing sent on a changed draft) stays as it is and is outside this table. Nothing here is live: no send path is on.

Where each number lives: **code** = `supabase/functions/_shared/career_outreach.ts` (the chat and the run), **SQL** =
`career_outreach_claim` in `20261021010000_career_outreach.sql` (the gate every send passes, locked per person and per
recipient), **router** = module 124's `CAPS` and the texts 142 renders from it (what the person is told when they ask).

| # | Ceiling | Code | SQL | Router text (124 CAPS / 142) | Agree? | Classification |
|---|---|---|---|---|---|---|
| 1 | Drafts per approval batch | `BATCH_MAX` 10 | none (not a send rule) | not stated | n/a | **Keep.** The size of one approval message, not a volume cap: the next batch is one more "show my drafts". |
| 2 | Daily sends, the person's own number | `DEFAULT_DAILY` 20 when unset; `prefs.daily_cap` 1..30 | default 20; `check (daily_cap between 1 and 30)`; `least(greatest(cap,1),30)` | "sending starts at 12 a day" (`startPerDay` 12, `startRange` [10,15]) | **No**: the enforced start is the person's number (20 by default), the text says 12 | **Reconcile the text to the rule** (124/142, Muse's): "up to your limit, 20 unless you set one, never more than 30; 10 a day in your first week". |
| 3 | Daily ceiling | `MAX_DAILY` 30 | 30, twice (the check and the `least`) | "never passes 30", `userCanRaise: false` | Yes | **Keep.** The one product number in this lane; a mailbox-reputation guard, not an application cap. Owner to confirm it stays a ceiling the person cannot raise (the router already says so). |
| 4 | First-week warm-up | `WARMUP_DAILY` 10 for `WARMUP_DAYS` 7 from the first send | `least(cap, 10)` until `min(sent_at) + 7 days` | a ramp: 12 a day, +5 every 3 days to 30 (`rampStep` 5, `rampEveryDays` 3): 12, 17, 22, 27, 30 | **No**: the text promises a ramp that nothing enforces; the enforced rule is flat 10 for a week, then the person's number | **Reconcile the text to the rule** (the enforced rule is simpler and stricter early). If the owner wants the ramp, it is a SQL change to the claim, not words. |
| 5 | Spacing between sends | `GAP_MS` 90 s | `'spacing'` under 90 s | `gapMinutes` [2, 8] | **No**: 90 s enforced, 2 to 8 minutes promised | **Reconcile the text to the rule**, or raise the rule to the promise (owner's call: 2 to 8 minutes halves the day's throughput at 30). |
| 6 | Emails to one recipient | `RECIPIENT_CAP` 3 in `RECIPIENT_WINDOW_DAYS` 30, across every Trainee user | `'recipient_cap'`: 3 in 30 days, all users, locked per address | `perPersonInitial` 1 + `perPersonMaxFollowUps` 2 in `perPersonWindowDays` 183 | Partly: 3 either way; 30-day window enforced, 183 promised | **Keep the rule; reconcile the window in the text** (30 days). |
| 7 | First emails to one firm | none | none | "at most 15 first emails to one firm in any 30 days" (`perFirmPer30Days` 15) | **No**: promised, enforced nowhere | **Reconcile: enforce or stop promising.** Recommend enforcing in the claim (count the person's sends in 30 days to recipients at the draft's firm); small SQL, no new product number. Owner's call, since it limits volume. |
| 8 | Sends per mail domain per day | none | none | `perDomainPerDay` 4 (range [3, 5]) | **No**: promised, enforced nowhere | **Reconcile: enforce or stop promising.** Same shape as 7. |
| 9 | Breakers | none | none | `bounceBreakerRate` 0.03, `hostileBreakerCount` 2, `riskyMaxFraction` 0.10 | **No**: planning text only | **Reconcile: say "planned" or build.** A bounce breaker is the one worth building (Gmail reputation); the others are text today. |
| 10 | Do-not-contact | code reads the list | `career_outreach_dnc` across all users; a "stop" to anyone stops everyone's drafts to that address | the texts say stop words are honored | Yes | **Keep.** |
| 11 | First wave size | none | none | `wave1Size` 40 | n/a | **Reconcile: drop or say "planned"**; the batch of 10 is what exists. |

Summary: keep 1, 3, 6 (rule), 10; reconcile the words for 2, 4, 5, 6 (window), 11; decide enforce-or-drop for 7, 8, 9.
Every reconciliation of words is in 124/142 (Muse's modules; coordination needed as for the cap texts in SERIAL-1480).
Every "enforce" is a change to `career_outreach_claim` plus its code twin, with a SQL test, and needs the owner's yes
since each limits volume. No application cap is touched by any of this.

## SERIAL-1500 / SERIAL-1501 follow-up (2026-10-26)

### (1) Words reconciled to what is enforced today
Modules 124 and 142 (text only; no number changed, no limit added, nothing newly enforced): every text that stated a
cap now states the enforced rule once ("sends go from your own Gmail at 10 a day in your first week of sending, then 20
a day unless you set your own number (up to 30, never more), at least 90 seconds apart; at most 3 emails reach one
address in 30 days, and anyone who says stop is never written to again") and names the planner's ramp, per-firm cap,
per-domain cap, breakers and risky share as "planned, not enforced today". The safety-plan card and the day arithmetic
(`sendDays`) count at the enforced pace. Both bundles rebuilt; the two node pins on the old wording repointed
(`career-complexity-battery` c40; `career-wording-backlog-guard` SC-043, a test that reads a machine path the gate skips
by design, so that repin is unproven on every machine but one).

### (2) Each ceiling, by what it is
Provider rules are cited by URL and were NOT fetched from this container (support.google.com does not resolve here);
the owner should read them at the source. They are ceilings, not safe volumes and not permission: account type
(personal, Workspace, trial) and the account's current use decide what is safe.

| Ceiling | Bucket | Evidence |
|---|---|---|
| Gmail: about 500 messages a day on a personal account; about 2,000 on Google Workspace; bulk-sender rules (authentication, one-click unsubscribe, spam rate under 0.3%) for senders of about 5,000 a day to Gmail addresses | **Hard provider rule** (not ours) | support.google.com/mail/answer/22839; support.google.com/a/answer/166852; support.google.com/a/answer/81126. Unverified here. Our 30 a day is about 6% of the personal ceiling; the ceiling says nothing about what a personal account can send cold without harm. |
| 30 a day (`MAX_DAILY`, SQL check 1..30) | **Deliverability judgment (ours)** | No provider rule names 30; chosen for a personal mailbox sending cold mail. Owner to confirm it stays unraisable. |
| 10 a day in the first 7 days (`WARMUP_DAILY`, `WARMUP_DAYS`, SQL `least(cap, 10)`) | Deliverability judgment (ours) | A new sending pattern on an old account; no provider rule. |
| 90 seconds between sends (`GAP_MS`, SQL `'spacing'`) | Deliverability judgment (ours) | Burst avoidance; the planner's 2 to 8 minutes was the same judgment with a different number (planned, not enforced). |
| 20 a day when the person set none (`DEFAULT_DAILY`) | Deliverability judgment (ours) | A default inside the 30; the person's own number replaces it. |
| 3 emails to one address in 30 days, across every Trainee user (`RECIPIENT_CAP`, SQL `'recipient_cap'`) | **Recipient restriction** (protects the person written to; also deliverability) | Not a volume setting: it bounds how often one human is written to by anyone using the product. |
| Do-not-contact and opt-outs (a "stop" to anyone stops everyone's drafts to that address; `career_outreach_dnc`) | **Recipient / user-intent restriction** | Not a volume setting at all; it is the recipient's stated wish. Commercial-mail law (CAN-SPAM in the US; PECR and GDPR for UK and EU recipients, which module 124 flags by country) requires an honored opt-out; the product honors it at once. Law, not ours; citations unverified here. |
| Exact per-message approval (`approved_hash` = the message shown; a changed draft is refused; 3-day batch window) | **Approval contract** (D-007, D-024) | Not a volume setting; proven in `tests/architect/outreach-pages.test.ts` and `wo-033-outreach.test.ts`. |
| 10 drafts per page (`BATCH_MAX`) | **Arbitrary product choice: a display page** | `tests/architect/outreach-pages.test.ts`: five pages approved as shown give fifty approvals; the run reads approvals, not the page; nothing about paging cuts the approved list. It settles no wider policy. |
| Approval valid 7 days (`APPROVAL_TTL_MS`, SQL anchor) | **Arbitrary product choice** (freshness of consent) | Same test: a hundred approved at once on a first-week account send 60 in six days and a few on the seventh, then the remaining approvals are dropped as expired and must be approved again. This, not the page, is what bounds a long approved list. |
| Drafts approvable for 72 hours (`BATCH_TTL_MS`) | Arbitrary product choice | Drafts older than 3 days are not approvable; ask for them again. |
| Ramp 12 → 30, per-firm 15 in 30 days, per-domain 4 a day, breakers, 10% risky share, first wave of 40 (module 124 `CAPS`) | Deliverability judgment, **planned, not enforced** | Planner model only; the texts now say so. Nothing enforced without the owner's yes. |

### (3) The page is not a cap
`tests/architect/outreach-pages.test.ts`, in memory with a fake sender: 50 drafts over 5 pages, each page approved
with one "send all"; 50 approvals stand, each bound to its exact message; the page shows the newest 10 and the send
run reads all 50; the first-week warm-up paces them at 10 a day, 90 seconds apart, and all 50 go, none lost to paging.
It proves display paging does not cut the approved list, and nothing wider.

### (4) Tradeoffs for a long list (the owner's 12 Oct example: 500 bankers), no change made
Days to send 500 first emails, under the rules that run today (10 a day for the first 7 days of sending, then the
person's number, never over 30):

| Pace after the first week | Account past its first week | New sending account (warm-up first) |
|---|---|---|
| 30 a day (the ceiling, set by the person) | about 17 days (500 / 30) | about 22 days (70 in week one, then 430 / 30) |
| 20 a day (the default) | 25 days | about 29 days |
| 10 a day | 50 days | 50 days |

The approval window binds before the pace does: one approval covers at most 7 days of sending, so at 30 a day one
round of "send all" over the pages can send at most 210 (70 on a first-week account); a 500 list needs three or four
approval rounds, each within 72 hours of its drafts being written, and the rest of a round's approvals expire.

| Option | Effect on the 500 list | Cost | Whose call |
|---|---|---|---|
| A. Keep everything as it is | 22 to 29 days; 3 to 4 approval rounds of up to 10 pages each; expired approvals re-approved | Effort for the person; the most conservative for a personal mailbox | nobody's; this is today |
| B. Longer approval window (e.g. 30 days) | One approval round covers the list at 30 a day | A message approved four weeks ago still goes; the change-refusal and stop rules still hold, but consent ages | owner |
| C. Higher daily ceiling (50, 100) | 10 days at 50; 5 days at 100 | Cold mail at that rate from a personal account risks Gmail's reputation controls; the 500 ceiling is not a safe volume | owner, against the deliverability judgment |
| D. No first-week warm-up | Saves about 5 days on a new sending account | A new pattern at full rate on day one | owner |
| E. Enforce the planner's ramp (12, then +5 every 3 days) instead of flat 10 for 7 days | Week one sends 12, 12, 12, 17, 17, 17, 22 = 109 instead of 70; about 2 days saved | Replaces one judgment with another; SQL change | owner |
| F. Per-firm cap of 15 in 30 days (planned) | Spreads 500 across firms; with 7 firms, 105 per 30-day window, so the list takes about 5 months | Protects each firm from a wave; much slower | owner |

Nothing here is a recommendation to send; no send path is on. The only change in this follow-up is words (124/142),
a test (3), and this table.
