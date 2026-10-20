# The brutal list, triaged against trunk

Source: the owner's list of 2026-10-20, 953 rows (`trainee-brutal-list-2026-10-20.csv`). One verdict per row is in
`triage.csv` (id, verdict, cluster, trunk_ref, note). Triaged on `origin/trunk` @ dc8e5802.

## How it was checked
- Each verdict was checked against trunk code with grep and read. The file:line refs are in `triage.csv`.
- FIXED-IN-TRUNK rows cite a test. Those tests were run on this commit:
  - `deno test -A --no-check --ignore=tests/architect/pending tests/architect/`: 629 passed, 0 failed.
  - `node --test` on `career-pool-loader`, `career-prep-bank`, `career-v242-live-gaps` and `career-document-delivery`: 23 passed, 0 failed.
  - `deno test` on `tests/edge/telegram-documents` and `channel-artifacts`: 8 passed, 0 failed.
- "Fixed in trunk" means the code is merged and its test passes. It is not live until the owner deploys trunk.
- Most rows were measured on the router (agent-chat v221–v242). The router still answers live: `career_brain.ts:21`
  picks the router unless `CAREER_BRAIN=agent`. So every router chat failure still exists on trunk today.
- The evidence files (`~/workspace/...`) are on the owner's other machine. I could not open them. Rows were read from
  the list's own text.

## Counts

| Verdict | Rows | With its DUPs folded in |
|---|---|---|
| RETEST-BRAIN | 427 | 571 |
| BY-POLICY | 71 | 97 |
| BUILD | 96 | 110 |
| FIXED-IN-TRUNK | 60 | 62 |
| OWNER-GATE | 42 | 56 |
| NOT-TRUNK | 57 | 57 |
| DUP | 200 | — |
| **Total** | **953** | **953** |

DUP means the same ask word for word (200 rows). Most are the live battery's repeats: one ask run against several fictional
companies, or the capstone judge re-grading an ask the live battery already had.

### By cluster (rows, DUPs not counted)

- **RETEST-BRAIN:** mock-prep 62, apply-chat 60, tracking 47, routing-wording 36, intel 30, tailor 29,
  connector-honest-stop 25, memory 19, outreach-draft 17, referral 14, negotiation 14, pasted-posting 9,
  unsupported-claims 9, router-internal 8, gap-analysis 7, career-os 6, channel-chat 6, guidance 6, copy-hygiene 5,
  persona 4, discovery-ranking 4, resume-qa 3, apply-guards 2, and five clusters of 1.
- **BY-POLICY:** people-discovery 39, never-invent 14, approval-required 5, ai-use-truth 5, accounts-passwords 4,
  linkedin 2, captcha 1, never-name-people 1.
- **FIXED-IN-TRUNK:** apply-loop 12, approval-mechanics 9, mail-tracking 4, fault-voice 3, tailor-confirm 3, ingest 3,
  and 18 clusters of 1–2.
- **OWNER-GATE:** owner-proof 18, board-family-proof 5, vendor-spend 5, send-enablement 4, voice 2, google-connect 2,
  and six clusters of 1.
- **NOT-TRUNK:** module-149 10, old-corpus 6, old-grader 6, ops-other-machine 5, worker-v2 4, watch-151 4, and the rest.
  These are old-line modules (149/150/151/152, 133, 121), old graders, crew records or the owner's machine. Each row
  names what it maps to on trunk.

## BUILD clusters: real gaps on trunk

Rows marked `*` are DUPs of a row in the same cluster.

### 1. alerts-company-scope: 21 rows
Rows: 088–107 (097*, 102*, 104*, 106*), 495.
- **What fails:** "watch Junior Software Engineer @ Quietline Apps" can only become a title watch.
- **Root cause:** `_shared/career_alerts.ts:15-19`. `AlertPrefs` has no company list. At `:49-51` the match reads title
  words only. One alert row per person (`career_alert_store.ts`).
- **Fix:** add `companies: string[]` to AlertPrefs and to the `set_job_alerts` schema, and match on company too. Allow
  several named watches per person. Test: a watch for one company never alerts on another company's same title.

### 2. pause-control: 13 rows
Rows: 189, 191, 192*, 590, 597, 604, 628*, 630, 631, 636, 681, 837, 863*.
- **What fails:** "Stop everything. Pause all my outreach right now", "stop evrything pls", "lift the pause".
- **Root cause, part 1:** `_shared/career_host.js:189-190`. Only the exact phrases "stop everything", "pause all career
  work", "resume career work" (and STOP) work. The brain has no pause tool.
- **Root cause, part 2:** at `:194-198` and `:365`, every turn while paused goes to the router's fixed reply. The brain
  never sees "ok lift the pause".
- **Root cause, part 3:** the pause stops nothing outside chat. `career_outreach.ts:466` (`runOutreachSends`) and
  `career_alerts.ts:78` (`planProactive`) never read `account.paused`. So the reply "No new action will be started"
  (`:205`) is not true for Gmail outreach sends or alerts.
- **Fix:**
  - Add `pause_career_work` and `resume_career_work` tools (write_own). They set `account.paused`, so the person can say
    it in any words.
  - Keep a paused turn on the brain, with the pause in the person block.
  - Make the outreach send run, the alert planner and the card push skip a paused account.
  - Test: a paused account gets no outreach send, no alert and no card. Pause and resume work in five phrasings each.

### 3. tailoring-depth: 12 rows
Rows: 701, 702, 704, 780, 852, 853, 872–876, 879.
- **What fails:** "tailored" resumes are a re-sort of the same bullets. Coverage of the posting is shallow. One bad fact
  sinks the whole audit.
- **Root cause:** `_shared/career_tailor.ts:14` still runs module 123's `CareerTailor.tailorResume`
  (`router_core.career.js:2213`). It selects bullets inside a fixed fact set.
- **Not verified on trunk:** the 1,000-scenario offline audit lives on the other machine and was not re-run here.
- **Fix:** first re-run that audit on trunk's tailor as an eval (`evals/career/tailor/`). Then rewrite the bullets from
  each fact's own fields under the truth audit, and quarantine one bad fact instead of refusing the whole resume.

### 4. agent-doc-delivery: 11 rows
Rows: 349–351, 355–362 (360*).
- **What fails:** "send me the tailored resume as a PDF file here."
- **Root cause:** `agent-chat/handler-career.ts:460`. The agent's result carries no `result`, so
  `documentsOf(out.result)` at `:502` (`channel_artifacts.ts:78`) finds no file. On the brain path, `tailor_resume`
  gives only a 7-day link. The file path (CHANNEL-DOC-1) works only for the router's result.
- **Fix:** `tailor_resume` puts its PDF in `ctx.turn.documents`. The handler passes them to `documentsOf`. Test: on the
  agent path, Telegram gets `sendDocument` with the PDF's bytes.

### 5. outreach-campaign-ops: 10 rows
Rows: 392, 393, 442, 443, 447, 449, 848–851.
- **What fails:** follow-up waves to non-responders, a bounce-rate pause, seed-inbox placement, a reserve pool, a
  campaign close-out, and variety across a batch.
- **Root cause:** `_shared/career_outreach.ts:1-17` covers batches of 10, approval, send, replies and bounces. None of
  the above exists. Batch variety on the model's drafts has never been measured.
- **Fix:** sends are owner-gated (`CAREER_OUTREACH_SEND`), so build these only when the owner turns sends on. Order:
  pause the run when bounces pass 5%, then follow-up drafts to non-responders (each approved), then a variety measure.

### 6. form-families: 10 rows
Rows: 721–725, 727, 882, 906, 928, 946*.
- **What fails:** applications on SmartRecruiters, iCIMS, Taleo, Tally, Google Forms, FormAssembly and bespoke
  fellowship sites.
- **Root cause:** `extension/lib/trainee-core.js:3735-3737` recognizes Greenhouse, Lever, Ashby and Workday only
  (WO-031/2). Workday is partial and proven on test tenants only (WO-048).
- **Fix:** add SmartRecruiters first, since it is a public ATS. Then iCIMS. Bespoke forms get an honest "fill it
  yourself" with the answers shown.

### 7. outreach-suppression: 8 rows
Rows: 188, 190*, 193*, 448, 606, 632, 782, 838.
- **What fails:** "never email anyone at my current employer", "take Maya off my list", "nobody I already emailed from
  Gmail".
- **Root cause:** `_shared/career_outreach.ts:629` writes the do-not-contact list only from a recipient's reply.
  `career_tools.ts:512-535` (`draft_outreach`) never reads the person's own exclusions or standing instructions. No tool
  adds a person or a firm to the list. "Already contacted" counts only Trainee's own sends (`:524`).
- **Fix:**
  - Add a `do_not_contact` tool (write_own) that takes a name, an address or a firm, in the person's words. It writes
    `career_outreach_dnc` plus a firm list.
  - Make `draft_outreach` honor both.
  - Test: a named person or firm is never drafted again, in a later conversation.

### 8. board-coverage: 5 rows
Rows: 708, 869*, 902*, 929*, 942.
- **What fails:** coverage of boards. Banks' own portals are missing.
- **Root cause:** `packages/career-data/board-directory.json` holds 2,435 boards against a 50,000 target. WO-044 is
  still building. Banks' Workday tenants are not discovered.
- **Fix:** finish WO-044. Add Workday tenant discovery for the bank list.

### Smaller BUILD clusters
- **alert-content (4 rows: 506, 711, 865, 866).** An alert carries no deadline and no fit reason. There is no
  offer-expiry reminder and no same-company batching (`career_alerts.ts:5`, WO-007/2). Quiet hours and the daily and
  weekly caps are already built.
- **per-thread-state (3 rows: 737, 860, 923).** Facts saved by the agent (`add_profile_fact`) and its tracker
  (`track_application`) live in the thread snapshot (`career_host.js:35-37`). The commit is keyed by thread
  (`20261015020000_career_watch_kv.sql:115,140`). A new web conversation starts without them.
  `list_applications` (`career_tools.ts:162-166`) never reads the apply queue or receipts. Verified by reading code; no
  test was run against the database.
- **document-ingest (3 rows: 757, 794, 916).** A PDF or photo reaches the model as "this file type can't be read yet"
  (`career_brain.ts:94`). WO-008 is still drafting.
- **company-records (2 rows: 742, 895).** There are 38 firm records in `packages/career-data/cirs`.
- **One row each:**
  - storage-degrade (642): the 503 body is honest, but no client is shown to render it.
  - channel-presentation (672): WO-038/T2 pins Telegram to plain text, with no typing indicator.
  - injection-guard (685): `get_posting` hands posting text to the model unmarked. Only mail has an injection test.
  - apply-dedupe (729): `queueWants` (`career_apply_want.ts:48`) never checks the person's own manual applications.
  - web-app (740): WO-012 is drafting.
  - prep-training-method (891).
  - role-library (898): no agent tool reads the role library.
  - mcp-surface (908).

## Headline

- **The brain switch alone could resolve up to 668 of the 953 rows.** That is 571 RETEST-BRAIN and 97 BY-POLICY,
  with their DUPs. This is a hypothesis. A BY-POLICY row passes only when the brain says an honest stop, so it also
  depends on the brain. Run 1 of the battery (`RUN-1.md`) measures a deduplicated sample of these rows on gpt-5-mini.
- **110 rows need building** (20 clusters). The largest are alerts-company-scope, pause-control, tailoring-depth,
  agent-doc-delivery and outreach-suppression.
- **62 rows are fixed in trunk code with a passing test.** None is live until the owner deploys trunk.
- **56 rows wait on the owner:** deploys, keys, vendor spend, Google connect, real submissions under the D-022 gate,
  and his own facts and files.
- **57 rows are moot on trunk:** old-line modules, old graders, the other machine.
- **The brain is not live.** D-027 sets the bar at 95% and +40 over the router, both on one run (DECISIONS.md). The
  brief I was given said 80%. DECISIONS.md governs. The last measured run was agent 72% (WO-061), so the bar is not met.

## What I could not verify
- Every row's original evidence (`~/workspace/...`, `upmore-v2-candidate`). It is not in this repo.
- The tailoring-depth numbers on trunk. The offline audit was not re-run.
- The per-thread-state finding against a real database. It rests on reading the code.
- Real portal behavior. There have been zero employer-confirmed submissions on trunk.
