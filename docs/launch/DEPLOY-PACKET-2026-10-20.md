# Deploy packet: trunk to production (WO-062, drafted 2026-10-20)

**Status: waiting on the owner's word.** Nothing here has been run against production. Per the brief, a deploy word
covers exactly the commit named with it, and nothing more.

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
1. **Migration version collision with `main`.**
   - `main` carries `20261019020000_site_capture.sql`, said to be live. Trunk's `20261019020000_channel_delivery.sql`
     has the same version.
   - The go-live script checks by table, so it applies `channel_delivery` correctly.
   - **A version-based `supabase db push` would skip it.** Use the script, never `db push`, until WO-071 re-versions.
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
