# WO-007: Instant job alerts and the daily report

Status: ready · Depends on: WO-004, WO-006 · Assignee: Claude (was Muse; D-012) · Size cap: ~600 lines excluding the architect tests

## Why
Speed on new postings is the one edge general chatbots and job boards don't give a person: a strong match texted within
minutes of going live, with the link. Everything else rolls into one daily report, so the person is never spammed and
never misses a match.

## Files
- `supabase/functions/_shared/career_alerts.ts` (new): `matchPosting`, `planProactive`
- `supabase/functions/career-proactive/index.ts` (new): the scheduled runner (secret-header auth, service role)
- `supabase/functions/_shared/agent/career_tools.ts`: 3 tools (below)
- `scripts/text.ts`: `/clock` runs `planProactive` over the simulator's postings and people, enqueues through the
  conversation store, and prints what is delivered
- `scripts/launch/schedule-career-proactive.sql` (new; every 5 minutes; the owner applies it)
- `tests/architect/pending/wo-007-alerts.test.ts` → `tests/architect/` (do not edit)

## Interfaces (exact)
```ts
export interface AlertPrefs { on: boolean; keywords: string[]; locations: string[]; remote_ok: boolean;
  report_hour: number; quiet_start: number; quiet_end: number; max_instant_per_day: number }
export interface PlanUser { id: string; tz: string; prefs: AlertPrefs; last_checked_at: string; instant_sent_today: number;
  last_report_on: string | null /* YYYY-MM-DD in tz */; held?: string[] /* job_ids held back by the cap */ }
export function matchPosting(posting: any, prefs: AlertPrefs): boolean;
export function planProactive(o: { users: PlanUser[]; postings: any[]; now: number }): (
  | { userId: string; kind: "alert"; key: string /* alert:<job_id> */; at: number; job_id: string; text: string }
  | { userId: string; kind: "held"; job_id: string }
  | { userId: string; kind: "report"; key: string /* report:<YYYY-MM-DD> */; at: number; text: string })[];
```
Rules pinned by the tests: keywords match the title (case-insensitive); an empty location list matches anywhere; remote
counts when `remote_ok`; closed postings never match; only postings first seen since `last_checked_at` alert; freshest
first up to the daily cap, the rest are `held`; quiet hours move `at` to `quiet_end` in the person's zone; one report per
local day at or after `report_hour`, listing matches first seen in the last 24 hours plus held ones (up to 10, with links),
or saying plainly there were none. Defaults: report_hour 8, quiet 22–7, cap 3.

Alert and report text is written by code from the posting data (company, title, location, minutes since first seen, link),
never by the model.

## The runner
`career-proactive`: for each person with `prefs.on`, read `stores.alert_prefs` and counters, run `planProactive` over
`career_postings` open rows first seen in the last 26 hours, enqueue alerts and reports through the conversation store
(`enqueueProactive`, one per key ever), save `held`, `instant_sent_today` (reset at local midnight), `last_checked_at = now`,
and `last_report_on`. Writes a run summary row so a silent stop is visible.

## Tools (brain)
- `set_job_alerts({ keywords, locations?, remote_ok?, report_hour?, max_instant_per_day? })` (write_own): saves `stores.alert_prefs`
  with `on: true`; the reply restates exactly what will be watched and when the report comes.
- `get_job_alerts({})` (read). `stop_job_alerts({})` (write_own): `on: false`, one message stops everything.

## Acceptance
- The 7 WO-007 tests and all earlier architect tests pass; gate green.
- Simulator demo pasted in the PR: "text me data analyst jobs in New York or remote" → restated; `/clock +10m` with a new
  matching posting in the local db → one alert with the link; four more → three alerts total that day, the rest in the next
  report; `/clock` to 08:00 → the report; "stop the job alerts" → nothing on the next `/clock`.

## Out of scope
Reading the person's inbox, application-status nudges (a later order), LoopMessage delivery (WO-013).
