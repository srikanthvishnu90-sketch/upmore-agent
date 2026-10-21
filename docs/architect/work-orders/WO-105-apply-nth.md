# WO-105: find → "apply to the second one" → that posting in the person's apply queue

## Why
The 2-day loop (owner, 2026-10-21) counts one thing: real people finishing real tasks on the live bot. Claude's single
focus for it is the core task, "find me roles, then apply to one". Muse's fake user (Maya, 3 years as a data analyst in
Chicago, wants a senior analyst role) cannot get through that chain on trunk 9deee4e2. Run in the text simulator with
Maya's own words, it dead-ends in five places:

| # | Maya says | Trunk does | Root cause |
|---|---|---|---|
| 1 | "show me senior data analyst jobs in chicago" | "I didn't catch that." | The router searched only on "find …"; "show me / list / search / look / pull up / get / give … jobs" fell through |
| 2 | (same search) | Excludes the senior role: "your profile is 0 yrs experience" | `experienceYearsOf` read experience the profile never dated as 0 years |
| 3 | (same search) | Says a remote role "means relocating" | `adaptPosting` sent a pool posting with an empty description down the corpus path, which drops the remote flag |
| 4 | (same search) | Draws from `career_kb_postings`, the static October snapshot | The handler's pool loader read the snapshot; the live ingest writes `career_postings` (with `closed_at`) |
| 5 | "apply to the second one" | "I didn't catch that." Nothing remembered which roles were shown | No list of shown roles was kept, and no code path existed from a pick to the apply queue |

## What this order builds
1. **The live pool** (`_shared/career_pool.js`: `createLivePoolLoader`, `mapLivePosting`, `LIVE_POSTINGS_*`). It reads
   only open rows of `career_postings` (`closed_at is null`), newest first. A failed read is `LIVE_POOL_READ_FAILED` and
   never falls back to the snapshot. `handler-career.ts` uses it, and its `readRows` gains the `is` filter.
2. **The search** (`packages/domain/142-career-router.js`):
   - The search routing is widened as in row 1.
   - Undated experience is unknown, not 0.
   - A pool posting stays a pool posting even when its description is empty.
   - Ties at equal fit go to a senior title when the ask says senior, then to the named city, then remote, then elsewhere.
   - The router remembers the list it showed, in order with each posting's own link (`ctx.discovery.lastShown`; the
     discovery state was already persisted).
   - The reply ends: Say "apply to the second one" (or any number) and I will put it in your apply queue.
3. **The pick** (`_shared/career_apply_pick.ts`, new). This is code, run before either brain.
   - It understands "the second one", "#2", "2nd", "number 2", "1 and 3", "the last one", "both", "all of them",
     "apply to Bluefin", "apply to it" when one role was shown, and polite asks ("can you apply to the second one?").
   - It rejects:
     - a question ("how do I apply to the first one?", "can I apply to both?"), which gets the how-to and queues nothing;
     - "don't …";
     - "apply that filter";
     - any message with a link, since a link is its own posting.
   - Each pick goes through `resolvePicks` (open on file now, with the record's own employer, title and link), then
     `screenPicks` (their current employer, the 30-day rule), then `queueWants` (the day's limit, never twice), then into
     `career_apply_wanted` (WO-066). Past applications and the day's limit are read only when a pick is queued.
   - What it says:
     - a number past the list gets the list back;
     - a closed posting or a site the extension can't open gets the reason and the link;
     - "apply to it" after several roles gets "Which one?".
   - Nothing reaches an employer. The extension prepares the form and sends only when the person approves its card.
4. **The simulator** (`scripts/text.ts`):
   - It uses the same live loader and the same pick.
   - `/post` takes an optional form link and gives test postings a `sim:` id. A `lever:` id with an all-hex tail
     (about 1 run in 25) read as a real Lever posting and replaced the given link.
   - `/queue` prints the apply queue.

## Interfaces
- `CareerPool.createLivePoolLoader({ readRows, jobs, limit? }) → { loadPool, loadTargeted }`
- `picksFrom(text, lastShown) → { picks, beyond?, which? } | null`, `askedAbout(text, lastShown) → Shown[] | null`,
  `positionsIn(text, count) → number[] | null`
- `applyPickTurn({ message, userId, now, shown, deps: { wants, posting, events?, limits?, apps?, facts?, tz? } }) →
  { reply, status: queued | already | refused | explained, queued, intent: "career_apply_pick" } | null`

## Acceptance (tests/architect/wo-105-apply-nth.test.ts, 13 tests)
Fail-first: 9 of 13 fail on trunk 9deee4e2, run with only the new module copied in so the file imports. These are 1–5,
9–11 and 13: the search, the remembered list, the live pool, the handler wiring, the simulator chain, the reply line and
the lazy reads. The other 4 (6, 7, 8, 12) test the new module on its own. All 13 pass on this branch, and test 10 passes
40 of 40 runs in a row.

Also on this branch:
- **Architect suite:** 727/0.
- **Edge suite:** 886/0.
- **Full node suite:** the same 124 failures as trunk in this container, none new. They come from Chromium refusing to
  run as root here; CI has a browser. Two new live-loader tests pass, and the three staged handler fakes now serve
  `career_postings`.
- **Bundles:** `--check` verified.
- **Type check:** the career functions type-check with a local import map. deno.land and esm.sh are blocked from this
  session; CI runs the real check.

## Demo (simulator, router brain, no model, no network)
```
deno run -A scripts/text.ts --fresh --brain router --as +15550010505
```
Then:
1. Paste Maya's line ("I'm a data analyst with 3 years of SQL and Tableau, based in Chicago").
2. Add three test postings, each with a form link: `/post Senior Data Analyst | Northwind Ledger | Chicago, IL | https://boards.greenhouse.io/northwindledger/jobs/4011`.
3. Send the asks below, then `/queue`.

Recorded on this branch:
```
⟶ show me senior data analyst jobs in chicago
  ⟵ Here are the 3 roles most worth applying to, ranked by fit with your profile.
     Senior Data Analyst at Copperline Infra — remote: … Senior Data Analyst at Northwind Ledger — Chicago, IL: … Data Analyst at Bluefin Health — Chicago, IL: …
     Say "apply to the second one" (or any number) and I will put it in your apply queue, or tell me one to tailor your resume for.
⟶ apply to the second one
  ⟵ Queued: Senior Data Analyst at Northwind Ledger.
     Next: open the Trainee extension and press Start. It opens each application, fills it from the facts you confirmed and shows you every answer. Nothing is sent until you approve that card.
⟶ apply to the second one
  ⟵ That one is already in your apply queue.
⟶ apply to the fifth one
  ⟵ I showed you 3 roles, so there is no number 5. Nothing was queued.
     1. Senior Data Analyst at Copperline Infra
     2. Senior Data Analyst at Northwind Ledger
     3. Data Analyst at Bluefin Health
⟶ how do I apply to the first one?
  ⟵ Senior Data Analyst at Copperline Infra is number 1 of the 3 I showed you. Say "apply to the first one" and I will put it in your apply queue.
     Then the Trainee extension opens the application, … Nothing is sent until you approve that card.
     Nothing was queued yet.
  (apply queue 1: Senior Data Analyst at Northwind Ledger, https://boards.greenhouse.io/northwindledger/jobs/4011, waiting)
```

## Live verification (the other agent, per the loop's merge gate)
Not done. Claude has no live Telegram access, and production runs v246 (commit 9143889e), not trunk. Order:
1. **The P0 first.** The owner deploys trunk 9deee4e2 and confirms `grep -c CORRECTION_STORE` = 0 in the downloaded
   bundle.
2. **Count open postings.** The owner or Muse counts the live pool for Maya's ask, read-only:
   `select count(*) from career_postings where closed_at is null and title ilike '%data analyst%';`.
   If it is near zero, this order's search returns little live, and the next order is the ingest, not the chat.
3. **Deploy this branch.** Only on the owner's written yes on its exact commit.
4. **Muse's live run.** Muse runs scenario 5 on Telegram as a test account: the search, then "apply to the second
   one", then "apply to the second one" again, then "how do I apply to the first one?". The transcript is attached to
   the PR.
5. **The finished task.** A queued role becomes a real application only when the person runs the extension and
   approves its card. That step is the real completion, and it is outside this order.

## Known gaps (not fixed here, stated so nobody counts them as done)
- The role sentence is canned and repeats ("closest fit on your profile, with the gaps named in the caveat; caveat: no
  tradeoff stated in the posting"). This is pre-existing router prose and the next order in this slice.
- Fit score outranks the city, so a remote role can be listed above a Chicago one for "in chicago".
- "don't apply to the second one" and "cancel the second one" still reach the router's fallback. Removing a queued
  application from chat is not built.
- The agent brain (`queue_applications`) has its own path. This order makes the router path and the code path work; the
  agent path is unchanged.

## Out of scope
The extension, the apply worker, the agent brain's tools, any migration, any deploy.

## Size cap
About 400 hand-written lines plus tests; the two generated bundles are rebuilt, not hand-edited.
