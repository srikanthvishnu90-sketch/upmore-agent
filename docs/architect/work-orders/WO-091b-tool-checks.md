# WO-091b: code checks what a tool call means, not only its shape

## Why: audit of the chat brain, findings F2 and F4 (battery run 39500971945)
**F2. "Apply me to X" queued whatever the model picked.**
- BR-023: the person asked for "the operations role at Quickhire Remote Jobs". The model queued Meridian Fulfillment's
  Operations Analyst.
- BR-018: the model queued Northwind Ledger. The tracker already held an application there, made by hand.
- BR-021: the model queued a role at Copperline Infra, the person's current employer.
- BR-019: the 30-day rule was never checked.

Each queued posting becomes a prepared card, one tap from submission. Why-chain:
1. `search_jobs` drops query words until something matches. "operations Quickhire Remote Jobs" became "operations".
2. `queue_applications` is `write_own`, so it ran freely. It passed the model's `postings` straight to `queueWants`, and
   `company`/`title` were copied from the model's input. R8 stored "Quickhire Remote Jobs" on a Meridian link.
3. `queueWants` de-duplicated on posting key only. It never read the tracker, the applications in other threads, the
   one-per-company-per-30-days rule (D-011), or a confirmed current-employer fact.
4. Root cause: everything before the extension card was trusted model output.

**F4. "Autopilot, don't ask me" was kept as a standing instruction (BR-084).**
1. `remember_instruction` checked only that the quote was in the message, plus length and dedupe.
2. `personBlock` injects every standing instruction as "follow every one". From then on, every turn told the model to
   skip the one human check before the card: which postings.
3. Root cause: D-007 was enforced on effects but not on memory, and memory is control input to the model.

## What changed
- **`supabase/functions/_shared/career_apply_want.ts`**
  - `resolvePicks(picks, get)`: resolves each pick by its `job_id`, or by its link's posting key (the same id).
    - The posting reader is the one the tools already use: `deps.posting`, else `deps.tailor.posting`.
    - Company, title and link come from the record. A pick not on file, or closed, is refused with a reason.
  - `screenPicks(picks, {message, before, apps, facts, now})` refuses a pick in four cases, each with a reason:
    - **Wrong employer.** The message names a different employer ("… at Quickhire Remote Jobs", read after "at").
    - **Not shown.** The message names no employer and refers to something shown ("the first one", "#2", "1 and 3",
      "these", "the operations role", "yes"), but the posting is not in the previous turn's reply.
    - **Recent application.** They applied to that company in the last 30 days. This reads the tracker in this thread
      plus `mail.applications`, which covers every thread's tracker and Trainee's own sends, the same source
      `where_do_i_stand` reads. "Saved" is not applied. The reason gives the applied date and the first day they can
      apply again.
    - **Current employer.** The company matches a confirmed current-employer fact. Drafts, past jobs and goals don't
      count. Their own knowing go-ahead in this turn lets it through ("I know I work there, apply anyway").
  - A broad ask ("apply me to 25 data analyst jobs") leaves the employers to the search.
  - Names are compared without case, punctuation or "Inc"/"LLC" (`normCompany`, the queue SQL's own rule), and with
    `sameCompany` (career_mail).
  - Every refusal is `{posting: {job_id, company, title, url}, reason}`. The same refusal is kept as `url`/`why` for
    WO-066's callers.
- **`supabase/functions/_shared/agent/career_tools.ts`**
  - `queue_applications` now runs resolve, then screen, then `queueWants`.
  - It returns `{queued, already, items, refused: [...all refusals], limit, note}`.
  - If the applications cannot be read, it fails closed: nothing is queued.
  - The description says what code checks (394 characters, under WO-002's 400). The schema is unchanged.
- **`supabase/functions/_shared/agent/loop.ts`**
  - `ToolCtx.turn.before` holds the previous assistant reply from the turn's history ("" on a first turn), so a pick by
    position can be checked against what was shown.
  - This is the one file outside the brief's list. Tools had no other way to see the previous turn.
- **`supabase/functions/_shared/agent/memory.ts`**
  - `standingRefusal()` runs inside `addStanding`, so every path that keeps an instruction is covered. It refuses:
    - waivers: "don't ask me", "stop asking me", "without asking", "without my approval", "skip the approval card",
      "just send it";
    - autopilot and auto-apply/submit/send;
    - sharing their resume with someone;
    - passwords and one-time codes;
    - acting on LinkedIn or Indeed.
  - The error is "Not kept: every application and message still needs your yes on its card." The tool throws it, and
    the model relays it.
  - The check is narrow on purpose. A close "never" keeps the instruction ("never apply without asking me", "never
    auto-apply", "don't share my resume with staffing agencies"). A clause that goes on keeps it too ("don't ask me
    about relocation again", "stop asking me about salary"). "ask me before weekends" is kept.

## Tests (written first)
`tests/architect/wo-091b-tool-checks.test.ts` has 12 tests. Before the fix, 11 failed on trunk. The 12th is the
false-positive guard and passes on trunk by design.

| # | Case |
|---|---|
| 1 | BR-023: Quickhire is named, Meridian is picked: queued 0, the reason names both, the queue is untouched |
| 2 | Employer and title come from the record, not from the model's label. A link without a job_id resolves by its key |
| 3 | A pick not on file, and a closed posting, are refused with reasons |
| 4 | BR-018: an application in this thread's tracker, another thread's tracker, or Trainee's own sends is refused |
| 5 | BR-019: applied 10 days ago is refused with "2026-10-10" and "2026-11-09". Guards: 31 days ago, and stage Saved |
| 6 | BR-021: a confirmed current employer ("Copperline Infra LLC" against "Copperline Infra, Inc.") is refused. Guards: a past internship, a draft fact, the person's knowing go-ahead |
| 7 | R8: three bad picks in one call give three distinct refusals (wrong employer, 30 days, current employer) |
| 8 | A broad ask queues across employers. "jobs at Stripe" holds to Stripe. "initech, inc" matches "Initech LLC" |
| 9 | Through `runAgentTurn` with a scripted model and history: "the first one" / "yes, the second" queue what the last reply showed. A posting it never showed is refused, and the model reads the refusal |
| 10 | BR-084: the tool throws the exact refusal, memory stays empty, and the same holds through `runAgentTurn` |
| 11 | 16 waivers and forbidden acts are refused |
| 12 | 13 false-positive guards are kept: relocation, weekends, GPA, "always ask", "never apply without asking", visa, agencies, 9am, "no LinkedIn postings", "auto-generated cover letters", "never auto-apply", "don't share my resume with agencies", "stop asking me about salary" |

## Evidence
| Suite | Trunk | This branch |
|---|---|---|
| Architect | 632 passed, 0 failed | 644 passed, 0 failed (+12) |
| Edge (`tests/edge/`) | 869 passed, 0 failed | 869 passed, 0 failed |

- WO-066 (7), WO-078 (4), WO-023 and WO-077 pass unedited. The WO-002 tool-list test is untouched, because no schema
  changed.
- `deno check` passes on every changed file and on `agent-chat/career_brain.ts`.
- `bash scripts/gate.sh` stops locally at `browser-runtime`: Chromium will not launch as root with its sandbox on in
  this container. Every step before it passed. CI runs the full gate on the PR.
- To measure: BR-018, BR-019, BR-021, BR-023 and BR-084 on the next battery run. They count as VERIFIED-LIVE only from
  that run.

## Limits, stated
- **No posting reader.** With none, picks stay as given. Only callers without one hit this, because the agent-chat
  handler passes `postingsDb.get`. The employer, 30-day and current-employer checks still run on the given labels.
- **No history.** When `turn.before` is undefined (a tool run outside the loop), a pick by position cannot be checked
  and is let through. `runAgentTurn` always sets it.
- **"Named" is a heuristic.** It means the employer's name is in the message, or a capitalized name follows "at". A
  lowercase employer after "at" is not read as one. In that case the pick must have been shown last turn. "jobs at NYC
  startups" reads "NYC" as an employer, and the reason says so.
- **Waiting wants don't count toward the 30 days.** Several postings at one employer may still wait in
  `career_apply_wanted`, as WO-066's contract has it. Only the same posting is refused ("already"). The card's
  `career_apply_enqueue` holds one per company per 30 days against `career_apply_jobs` when the person approves.
- **Extension receipts are not read here.** Applications Trainee sent are read through `mail.applications`, which
  reads `career_apply_jobs` that reached the employer.

## Out of scope
- F3: facts and the tracker per person instead of per thread.
- F10: carrying search results between turns as data, so "the first one" resolves by index.
- `search_jobs` relaxing the query (F2 step 1). The refusal now catches its result instead.
- The prompt, the router path, and SQL.
