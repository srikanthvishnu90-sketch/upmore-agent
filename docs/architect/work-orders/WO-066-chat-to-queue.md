# WO-066: from chat to applying

## Why
Prompting Trainee to do the job it is hired for showed a hole: **chat could not start a single application.** The agent
brain had no apply tool. The only way a posting reached the extension's apply queue was the person pasting links into it
by hand, or pressing "Add Trainee's matches" (links scraped from alert texts). "Apply me to 25 data analyst jobs" could not
work, whatever the brain scored.

## What changed
- `_shared/posting_key.ts`: which application form a link is, and its one posting key. It was moved from
  `extension/src/apply_core.ts`, which re-exports it, so chat and the extension key a posting identically. The bundle is
  rebuilt and `--check` passes.
- `_shared/career_apply_want.ts`, the person's own apply queue:
  - `wantsFrom` keeps Greenhouse, Lever, Ashby and Workday posting links. It refuses LinkedIn and Indeed (never automated)
    and anything else, with the reason.
  - `queueWants` stops at the person's daily limit (D-011, 25 by default) and names the limit in each refusal.
  - Memory and Supabase stores.
- `career_tools.ts`: `queue_applications` (write_own). Nothing is sent: the extension prepares each posting in the person's
  browser and shows a card, and an application goes only when that card is approved (D-007 unchanged). Without a queue, it
  says applying from chat is not connected.
- `prompt.ts`: asked to apply, the brain runs search_jobs, then queue_applications. It says how many were queued, that
  nothing was sent, and where to approve. It never says an application was submitted.
- Migration `20261022100000_career_apply_wanted.sql`:
  - one row per posting per person;
  - RLS: the person reads only their own rows;
  - writes only through `career_apply_want_put_for` (service role);
  - the extension marks its own rows taken (`career_apply_want_take_own`);
  - erased with the person.
  - It is registered for data export (`export-tables.json`, the app's `EXPORT_TABLES`).
- Extension: "Add Trainee's picks" (`queue-from-trainee`) reads the person's waiting rows with their own session, puts
  them in the same queue as pasted links, and marks them taken.
- `agent-chat`: the handler passes `supabaseWantStore(admin)` and the person's own daily limit to the brain.

## Tests
| Test | Result |
|---|---|
| `tests/architect/wo-066-chat-to-queue.test.ts`, written first in `pending/` | 7/7 |
| `tests/db/career_apply_wanted.test.sql`, run as a non-root user against Postgres 16 | 14 ok |
| The whole DB suite (export coverage included) | passes |
| Browser: "Trainee's picks from chat join the queue once, and are marked taken" | passes |
| Browser: the existing queue test | passes |
| Architect suite | 600/600 |

`WO-002/T1` (the pinned tool list) gains `queue_applications`.

## Not done
- Live proof needs the deploy packet (WO-062) and the owner's word. Until then the queue exists only in code and tests.
- The router (deployed brain) has no path to this queue. Only the agent brain does.
