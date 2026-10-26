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
