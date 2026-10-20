# Deploy packet: trunk to production (WO-062, drafted 2026-10-20)

**Status: WORD GIVEN on `ea365d5a`; the run is the owner's, from the owner's own shell.**

## The word (owner, 2026-10-20, verbatim)
> "Deploy the packet as updated to trunk commit ea365d5a, including WO-069's pay migration. Run the gauntlet after, and
> record it. This word covers exactly this commit and this packet. If the commit changes by even one character, the word
> does not carry — name the new commit in the reports log and I will word it fresh."

- **Commit:** `ea365d5a` (WO-079 #98). Trunk has since moved to `dc8e5802` (a privacy scrub of test fixtures; it ships
  no function or migration). **The word does not carry to it.** The deploy runs from a detached checkout of `ea365d5a`
  exactly. Any later trunk commit is named in `docs/architect/reports/` for a fresh word.
- **Dry run at `ea365d5a`** (architect, 2026-10-20):
  `SUPABASE_PROJECT_REF=mrwngntwmnaqrqhupvlt bash scripts/launch/trainee-go-live.sh --dry-run` passed all 6 steps:
  - the migrations through `20261022110000_career_postings_pay` (WO-069), in file order, each checked by its table or
    function mark;
  - functions agent-chat (staged career-only, JWT on), career-ingest, career-proactive, trainee-deliver,
    trainee-inbound, career-voice, trainee-telegram and trainee-whatsapp;
  - the 3 schedules;
  - the smoke step.
- **Not in this deploy, by the script at this commit:** `career-essay-draft` (the extension card's "Draft from my
  facts"). Until a later commit adds it and is worded, that button answers "Drafting on the card isn't on yet" and
  nothing else breaks. Also not in this deploy: the cross-user extension fix (PR #99), corrections (PR #102), the T09
  stop (PR #103) and emailed codes (WO-084). Each needs its own word on its own commit.
- **Who runs it:** the owner, from their own shell, with their own Supabase access token. No agent runs a deploy
  (script header; the agent's Supabase access to this project is denied).

```
git fetch origin && git checkout --detach ea365d5a
git rev-parse HEAD   # must print ea365d5a…, or stop
SUPABASE_PROJECT_REF=mrwngntwmnaqrqhupvlt bash scripts/launch/trainee-go-live.sh
```

- **After it:** the architect runs the gauntlet below and records it in `docs/architect/reports/`, VERIFIED-LIVE only
  for what was actually seen on the live project.

## The packet as drafted

- **Project:** Upmore, `mrwngntwmnaqrqhupvlt`, addressed by ref. Never the sporv or ring projects.
- **Commit:** `<trunk commit after #90, #91 and #92 merge>`, filled in when the chain is merged and its gate is green.
- **Live today:** agent-chat v242 = 4b4e7981 (the old deployed line, now ported onto trunk by WO-060).

## Why now
1. **A privacy defect is live** (WO-067). Within a warm edge isolate, a person with no email or name on file can take
   another person's graduation year and "active resume". Both feed application answers.
2. **Applying from chat** (WO-066), with the extension's "Add Trainee's picks". It is inert until the extension is
   installed and the agent brain is on; it waits on both.
3. **The extension's backend:** the six database functions the real extension (`extension/`) calls exist only in
   trunk's migrations. Without this deploy, the installed extension can't sign in to saved answers or record a proof.
4. The live resume-confirm defect (WO-070) and the router's "Klaviyo yesterday" company (WO-071).

## What it changes
**Migrations**, in file order by `scripts/launch/trainee-go-live.sh` step 2:
- Each one is applied once, in its own transaction.
- Each is skipped when the live schema already has it. The check is a table or function mark, not the version number.
- 30 trunk-only migrations since ad534539. WO-060 re-versioned 3 of them:
  `20261019000001_career_postings`, `20261019010001_career_alerts`, `20261020000001_career_apply_jobs`.
- `20261022100000_career_apply_wanted` (WO-066).
- `20261022110000_career_postings_pay` (WO-069, if its PR has merged by then).

**Edge functions** (step 4): agent-chat from the staged career-only tree with JWT on, then career-ingest,
career-proactive, trainee-deliver, trainee-inbound, trainee-telegram and trainee-whatsapp without JWT (each checks its
own secret).
- **Not in the script yet, decide before the word:**
  - `career-essay-draft` (the extension's essay drafts);
  - `career-voice`;
  - the deployed line's `telegram-inbound` / `whatsapp-inbound` (see risks).

**Secrets** (step 3): none new.
- `OPENAI_API_KEY` is kept (owner, 2026-10-20).
- `CAREER_BRAIN` is not touched: the agent stays off until D-027 passes (it is at 72%).

**Schedules** (step 5): the three pg_cron jobs.

## Risks to settle before the word
1. **Migration version collision with `main`: settled by WO-081 (the second half of WO-071).**
   - `main`'s `20261019020000_site_capture.sql` is treated as live. It is on trunk now with its version and bytes
     unchanged (sha256 pinned in `tests/architect/wo-081-site-port.test.ts`).
   - Trunk's channel migration, never deployed, moved to `20261019020001_channel_delivery.sql` (renamed only, content
     unchanged), so no two migrations share a version (WO-060/2) and a version-based push skips neither.
   - The go-live script lists both; the site capture's live-schema mark (both tables and the `careers-resumes` bucket)
     skips it on production. Still use the script, never `db push`: the live version ledger cannot be read from here.
   - `site-signup` and `site-careers` are live from `main`; trunk's copies are byte-identical, and go-live does not
     redeploy them.
2. **Two channel stacks.**
   - Trunk's `trainee-telegram` / `trainee-whatsapp` (`channel_contacts`), and the deployed line's `telegram-inbound` /
     `whatsapp-inbound` (`channel_threads`).
   - Only one webhook per bot can be live. **Owner's pick**, before the word.
3. **The KB pool.** The deployed router reads `career_kb_postings` (21,688 rows, an Oct 14–15 snapshot); the agent brain
   reads `career_postings` (live ingestion). Both stay. Freshness is MI-034.

## Rollback
- **agent-chat:** redeploy 4b4e7981's staged tree (`scripts/launch/rollback/`, the same mechanism as v203).
- **Migrations:** they add tables, functions and one column, and none drops data. They are left in place on a rollback;
  the old code does not read them.

## After the deploy
1. **Smoke** (step 6): `scripts/launch/trainee-smoke.cjs` against the live project.
2. **Live gauntlet:**
   - the battery probes (i) and (j);
   - the privacy case: two test accounts, one correcting and one without a name, never sharing a fact;
   - "I applied to the Account Executive role at Klaviyo yesterday" records "Klaviyo".
3. **The extension:**
   - the owner signs in on the real extension (`extension/`, loaded unpacked);
   - the demo Greenhouse form fills from the owner's own saved answers;
   - a proof is recorded in the tracker.
4. **First real assisted run** (WO-4 of the brief): 10 applications, timed, each with the employer's confirmation.
