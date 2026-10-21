# WO-100: task awareness — the situation, built by code every turn

## Why
The owner (2026-10-20): "in the ability to accomplish a task it doesnt even know what to do, like it needs to have the
task awareness ability".

The task-awareness audit seeded one synthetic person with work in flight in every place the product keeps it, then asked
15 task conversations ("what's happening with my applications?", "what do you need from me?", "why didn't the Ramp one go
through?", "keep going", "the second one you showed me", ...). Each graded turn names the facts a person needs in the
reply; there are 43 in all.

| Brain | Conversations where it knew what to do | Facts it could see |
|---|---|---|
| Router (production) | 0 of 15 (1 partial); "I didn't catch that" on 10 of 22 turns; 3 false statements | 2 of 43 |
| Agent brain, perfect oracle model (audit, trunk 724406ea) | 4 of 15 (9 partial, 2 failed) | 24 of 43 |
| Agent brain, perfect oracle model (this order's harness, trunk cfad11e6) | 6 of 15 | 26 of 43 |
| Agent brain, the audit's throwaway read model | — | 42 of 43 |
| **Agent brain, this order** | **15 of 15** | **43 of 43** |

The router also scored 0 of 25 on held-out paraphrases of the same asks (18 fallbacks, 7 misroutes); the audit's own
regex bridge caught 3 of 25, so a regex is not the fix for the router (see Out of scope: WO-B).

Root causes (the audit's why-chains):
- **R1. No per-person task ledger.** Each order (021, 020/023, 033, 066, 032) added its own table and its own code
  handler; nothing reads across them. The agent's pipeline read never read `career_apply_wanted`, the queue its own
  `queue_applications` writes; the router read none of the apply tables.
- **R2. No shared state, blocker or actor vocabulary.** Failure reasons were dropped; `where_do_i_stand` dropped failed,
  stopped and queued rows ("No application to Ramp on file" while Ramp had failed); confirmed applications printed under
  "Stopped until they help:" (`memory.ts`, the pipeline block).
- **R3. Memory per thread.** The tracker and facts live in `agent_flow_state` per thread; `list_applications` returned
  `[]` in a new thread.
- **R4. Capabilities were static prose or a stale manifest.** Whether Gmail is connected, the extension has run, the cloud
  is on or alerts are on was in no prompt.
- **R5. No code ranks the next step.** "next?" got a networking plan the router made up.
- **R6. Regex intent on every production entry point.** "Nothing is waiting on you" whenever no form question was open,
  even with a code, a card and a draft waiting.
- **R7. History is reply text only.** A search stored an unordered company set; "the second one" could not resolve in
  another thread.
- **R8. The eval had no seeded world and skipped the code handlers**, so it could not fail on any of this.

Bugs found and fixed here: `queue_applications` logged `apply_queued`, which the timeline and the database both refused,
so a queued posting never reached `recall`; the "Stopped" heading; `where_do_i_stand` and `list_applications` disagreeing
with the block; "Nothing is waiting on you" while things wait.

## Files and interfaces
- **`supabase/functions/_shared/career_situation.ts`** (new).
  - `Task {id, kind, company, title, state, since, blocker: {what, who: person|trainee|extension|employer, how} | null,
    evidence {confirmation_id?, reason?, url?, job_id?, stage?}, source}`.
  - `Situation {as_of, goal {roles, places, constraints}, tasks, today {used, limit}, last_shown, next [{who, what, say?,
    task_id?}], capabilities, unreadable}`.
  - `situationFrom(rows, now)`: pure. Finished work stays in view 14 days, work in flight always.
  - `readSituation(admin, userId, now)`: one `Promise.all` over `career_apply_jobs`, `career_apply_wanted`,
    `career_apply_prepared`, `career_apply_cards` (the open card), `career_apply_questions`, `career_outreach_drafts`,
    `career_mail_drafts`, `career_interviews`, `career_alert_prefs`, `career_watch_kv` (standing instructions, daily limit),
    `agent_flow_state` (the tracker from ALL of the person's threads), `user_oauth_connections`,
    `career_apply_cloud_optin`, `channel_contacts` and `career_events` (the latest search). Columns were checked against
    `supabase/migrations/`. A failed read is named in `unreadable` and its rows are empty: never guessed.
    `career_batch_runs_v` does not exist on trunk and is not read (comment in the code).
  - The next-step order is fixed by code: 1 questions holding applications; 2 emailed codes and verifications (on the
    employer's page, never in chat); 3 prepared applications waiting for a yes; 4 outreach and mail drafts waiting, with
    the connector they need; 5 chat-queued postings the extension has not taken in over 24 hours; 6 failures, with the
    reason and the decision; 7 work queued for the extension or the cloud; 8 alerts.
  - `situationBlock(s, budget = 5000)`: next steps, tasks waiting on the person and the capability lines are never cut;
    past the budget the other task lines go first, then the last list shown, and the cut is said.
  - `needsText(s, {questionsShown?})`, `statusText(s, company?)`, `codePending(s)`.
- **`supabase/functions/_shared/career_capabilities.ts`** (new).
  - `Capability {id, name, status: on|off|not_connected|expired|never|unknown, line, unlock}`.
  - `capabilitiesFrom(rows)`: Gmail read and Gmail send (the `google_career` grant and its scopes), the extension
    (`max(taken_at)` on `career_apply_wanted`, as last seen), cloud applying, alerts, texting (`channel_contacts`). A source
    that could not be read is `unknown`. `expired` is in the type for WO-101; nothing here can tell an expired grant yet.
  - `NEVER`: LinkedIn and Indeed automation, captcha solving, passwords or one-time codes in chat.
  - `readConnections(admin, userId): Promise<Connection[]>` — **stable for WO-101** (connect and disconnect actions):
    `{provider, scopes: string[], connected_at}` per grant, no address and no vault reference; throws on a read error so
    "nothing connected" and "could not be read" differ.
  - `statusRecordsFrom(capabilities)`: module 120's `ctx.statusRecords` shape (`[{provider, scopes, connected_at}]`),
    only what is on, no address. No `packages/domain` module changed; both bundles verify unchanged.
- **`supabase/functions/_shared/agent/memory.ts`**: `personBlock` takes `situation`; its block replaces the pipeline
  counts. The pipeline block (kept for callers without a situation) prints finished ones under "Finished or failed:".
  `readPipeline` is removed.
- **`supabase/functions/_shared/agent/career_tools.ts`**: new read tool `get_situation({company?})`; `list_applications`
  covers the whole person (the queue, chat-queued postings, every thread's tracker); `where_do_i_stand` adds the
  situation's record of that employer (failed, stopped, queued, with reason and confirmation id); `search_jobs` records the
  ordered list shown (`detail.shown`, up to 10 `{job_id, company, title}`).
- **`supabase/functions/_shared/agent/timeline.ts`** + **`supabase/migrations/20261023100000_career_events_apply_queued.sql`**:
  `apply_queued` in `EVENT_KINDS`, the table's check and `career_recall_own`. The version was checked free on trunk and
  on every remote branch (taken: 20261023090700, 20261023091400). Listed in `scripts/launch/trainee-go-live.sh`
  (MIGRATIONS and MIGRATION_MARK, in order) and in `tests/db/run.sh` (applied last, twice, with its SQL test).
- **`supabase/functions/_shared/agent/prompt.ts`**: four rules — SITUATION is the truth about their tasks; answer status,
  needs, "what now" and "keep going" from its next steps; never claim sent, submitted, connected or done unless it or a
  tool result shows it; never offer what is off or never, and a code goes on the employer's page, never repeated.
- **`supabase/functions/agent-chat/handler-career.ts`**: reads the situation once per turn, before the chat input (so a
  pending code is redacted) and before the card handler; passes it to `questionsTurn` and `agentTurn`; fills
  `ctx.statusRecords` for the router's "what's connected".
- **`supabase/functions/_shared/career_apply_questions.ts`**: "what do you need from me" keeps the numbered questions,
  then "Also waiting on you:" with every other step only the person can do; "Nothing is waiting on you" only when the
  situation shows nothing (and an unreadable situation is said, not called empty).
- **`supabase/functions/_shared/identity_redact.ts`** + **`agent-chat/_shared/chat_input.ts`**: `redactIdentity(text,
  {codePending})` removes a bare 6-8 digit number while an emailed code waits; never otherwise.
- **Eval**: `evals/career/worlds/in-flight.json` (SYNTHETIC person), `evals/career/world.ts` (the seeded world and the
  handler's dispatch over in-memory stores, readSituation through a fake client), `evals/career/in-flight.json` (C27-C41
  and 30 held-out paraphrases, the conversation eval's format), `run-conversations.ts --set in-flight|in-flight-heldout`,
  `scripts/text.ts --world <file> [--model scripted]`. `conversations.json` is untouched (builders never edit it).

## Tests
Written first; the fail-first run used trunk cfad11e6 with only the test files and the eval world added.

| Test | Trunk (fail-first) | This branch |
|---|---|---|
| `tests/architect/wo-100-situation.test.ts` (15: the 10 of the report's §4.6, plus redaction, the router's "what's connected", the handler wiring, the migration, the eval set) | 0 of 15 | 15 of 15 |
| `tests/architect/wo-100-situation-conversations.test.ts` (15 conversations, scripted oracle) | 26 of 43 facts, 6 of 15 conversations | 43 of 43, 15 of 15 |
| `tests/db/career_events_apply_queued.test.sql` | — | NOT RUN here (see below) |

On trunk, 10 of the 15 unit tests fail on the missing modules; tests 6, 8, 11, 13, 14 and 15 fail on behavior
(`list_applications` saw nothing in thread B; `apply_queued` was not a kind; a bare code reached the model; the handler
had no situation read; no migration; no eval world).

Older tests changed on purpose, both because this order supersedes what they pinned:
- `WO-002/T1` (the pinned tool list) gains `get_situation`, as it gained `queue_applications` in WO-066.
- `WO-023/B` (the handler's shape) pinned `readPipeline(...)` and `pipeline` in the agent's `known`; it now pins the
  situation read and `pipeline: null, situation`.

## Demo
```
deno run -A scripts/text.ts --brain agent --model scripted --world evals/career/worlds/in-flight.json --script evals/career/worlds/in-flight-demo.txt
deno run -A scripts/text.ts --brain router --world evals/career/worlds/in-flight.json --script evals/career/worlds/in-flight-demo.txt
```
No key is needed: `--model scripted` calls `get_situation` and prints its text, labeled. With `OPENAI_API_KEY`, drop
`--model scripted` for gpt-5-mini. The live eval (about $0.10): `deno run -A evals/career/run-conversations.ts --set
in-flight --brain agent --label wo100` and `--set in-flight-heldout`; NOT RUN here (no key). Bar: ≥ 13/15 items and
≥ 90% held-out.

## Out of scope
- **WO-B, the router bridge (next order).** The router still answers "what's happening with my applications" and "why
  didn't Ramp go through" from its own regex routes (the demo shows it). Option (a): one gpt-5-mini classifier call on the
  router path, about $0.0002 a turn, returning the ask and the employer; code writes the reply from the situation. That
  path makes no model calls today, so it needs the owner's yes on spend. Option (b): wait for the agent switch (D-027).
  Not regex (3 of 25 held-out).
- WO-101: connect and disconnect actions (imports `readConnections`).
- A `career_situation_rows(p_user)` SQL function (one call instead of 16 reads), an extension heartbeat (an extension
  release), calendar.
- Any deploy, live migration, live eval run or spend. Approvals, sends and submits are untouched; email sends stay off.

## Size
About 490 product lines added (`career_situation.ts` 249, `career_capabilities.ts` 84, the migration 32, the rest small
edits), plus about 200 lines of eval harness and 360 of tests.

## Goes live when
- Agent parts (block, tools, prompt): only with `CAREER_BRAIN=agent`.
- The questions handler, the redaction and the router's "what's connected": at the next agent-chat deploy from trunk
  (the owner's).
- The migration: when the owner applies it (go-live lists it).
