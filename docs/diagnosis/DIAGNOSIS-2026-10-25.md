# Trainee codebase diagnosis, 2026-10-25 (CODEBASE-DIAGNOSIS-1240, Phase 1, read-only)

Heads read: trunk 63a1233f; muse/2026-10-24-router-messagepath-fixes at 49364988 and f1af2af9; arch/submit-path at c10bf6c7 and d671223c; arch/alerts-watch-bridge adcf6473. Diagnosed primarily at 49364988 (the base named for Phase 2), reconciled against f1af2af9 and d671223c (section 5). Nothing was edited, committed or pushed; throwaway worktrees were used for measuring.

Claim labels used below:
- **[code]** read in the source at the named file and line.
- **[test]** a test that was run here, non-skipped, with its printed pass/fail counts.
- **[repo-only]** taken from a repo document, a commit message or the architect's 2026-10-23 live read; not re-verified by me (Deno is absent here, and the live project was not queried).

## 1. What the shipped product is

- Production is `agent-chat` v249 and nothing else of the career stack: `career-ingest`, `career-proactive` and `trainee-deliver` are not deployed, no career cron exists, `career_postings` has 0 rows, `career_apply_jobs` has 0 rows, and the served job board is the frozen `career_kb_postings` snapshot of 21,688 rows **[repo-only: docs/architect/BACKEND-GAP-MAP-2026-10-23.md, live read 2026-10-23]**.
- The entry is `supabase/functions/agent-chat/index-career.ts` → `handler-career.ts handleChat` **[code]**. One turn runs, in order **[code: handler-career.ts:342-508]**: host controls; nine code-first turns (apply card, text mock, open questions, confirm-which, apply-by-email, outreach batch answer, cloud on/off, cloud-card yes, application status readback); the agent brain only if `AGENT_BRAIN_RELEASED && CAREER_BRAIN=agent`; else `host.runTurn`, the regex router.
- `AGENT_BRAIN_RELEASED = false` is a constant **[code: agent-chat/career_brain.ts:23]**. The brain (`_shared/agent/loop.ts`, 41 tools in `career_tools.ts`) cannot be selected in production by any environment flag.
- The router is `packages/domain/142-career-router.js`, 14,946 lines, 119 distinct intents, bundled into `_shared/router_core.career.js` **[code]**. It makes no model call, reads no message history (zero references to prior turns in 142 or `career_host.js`) **[code]**, and keeps its entire state as one JSON snapshot per thread: `agent_flow_state.state.career` with 22 `STATE_KEYS` (profile, trackStore, outreach, offer, discovery, tasks, ...) **[code: career_host.js:35-44; migration 20261015020000 career_host_load selects state->'career' by thread]**. Account-wide state is only `career:account` controls and the watch profile in `career_watch_kv` **[code]**.
- No brain tool has effect `external`; there is no send or submit tool **[code: career_tools.ts, all 41 effects read or write_own]**. The approvals module WO-005 names (`_shared/agent/approvals.ts`) does not exist; its acceptance test has sat in `tests/architect/pending/` since 2026-10-19 **[code]**.
- Brain quality: on the 38-item held-out set the agent brain scored 76.3% to 97.4% across passes of one commit, the router 39.5% to 44.7%; the release bar is 95% in one full live pass with two judges (D-030) **[repo-only: evals/career/SCORE-LOG.md, DECISIONS.md]**.
- Bundles are fresh at 49364988, f1af2af9 and d671223c (`python3 scripts/build-router-core.py --check` and `--career-only --check` print "Router bundle verified") **[test]**.
- Full node career suite at 49364988 here: 3300 tests, 2838 pass, 336 fail, 126 skipped **[test]**. Of the 336: 113 `spawn deno ENOENT`, 61 Chromium launch, 34 missing esbuild, 37 self-labelled fixture errors, evidence pins to other commits. Behavioral reds are listed in section 5.

## 2. The fifteen capabilities

### 2.1 Submitting applications
- **Expect.** "Apply to these ten" ends in tailored, filled, submitted, employer-confirmed applications, reported truthfully.
- **Exists [code].** Queue stack: `_shared/career_apply.ts` (planBatch, admitApplication, classifyField); SQL `career_apply_jobs` with `career_apply_claim_own` / `finish_own` and one ledger (migration 20261025100000); engine `scripts/apply.ts` + `scripts/career/portal-browser-helper.cjs`; `workers/career-browser/approve-first.ts runApproved`; `workers/career-browser/prepare-ahead.ts prepareAhead`; the extension (`extension/background.js`, `agentSubmits: false` in `extension/config.js`); cards `_shared/career_apply_cards.ts`; readback `_shared/career_apply_status.ts statusReply`; evidence `_shared/career_router_evidence.ts`. The old 155 batch stack (`155-career-batch-apply.js`) is still bundled and is the stack Muse's answer capture lives in.
- **Proven [test].** `tests/career-http-host.test.cjs` 6/6 (dispatch only). `tests/career-submit-chatpath-20261025.test.cjs` 6/15 at 49364988 and d671223c, 15/15 at f1af2af9 (router+155 layer, no handler). `tests/career-extension-agent-submits.test.cjs` 1 pass, 5 skipped here (needs Playwright and Deno; asserts in CI). Real-Postgres flows (`tests/architect/flow-connected.test.ts`, `flow-real-person.test.ts`, `handler-submit-path.test.ts` at d671223c) are Deno and could not run here **[repo-only]**. Live: zero submissions ever **[repo-only]**.
- **Root cause.** (1) No path from chat to the queue: `queue_applications` is a brain tool and the brain is off; the router's `named_role_apply` only explains and says the worker is NOT_WIRED **[code: 142:10925-10961]**; nothing on the live path writes `career_apply_wanted` **[code: grep across handler-career.ts, 142, career_task_bridge.js]**. (2) `prepareAhead` has no server caller; its only entry is its own CLI main **[code: prepare-ahead.ts:262-275; grep]**. (3) The chat answer → executor join: at 49364988 unbuilt (9 red); at f1af2af9 answers are stamped on the 155 batch record in `ctx.batchApplyState`, a per-thread snapshot key with no `.ts` reader, while the queue executor (`career_apply_questions.ts`, `prepare-ahead.ts`) is untouched **[code: git diff 49364988 f1af2af9]**. (4) Prepared-card push lives in the undeployed proactive function **[code: runCards callers = career-proactive only]**. (5) Kill switches `CAREER_AGENT_SUBMIT` and `agentSubmits` are off by owner rule, correctly.
- **Smallest fix.** Record chat answers where the queue executor reads (`career_apply_answers_for`) or make the executor read the batch record; add a code-first "apply to these / N" turn that writes `career_apply_wanted`; keep the handler-level flow test (d671223c) as the proof.
- **Unverified.** All Deno flows; whether `career_apply_extension_begin_agent_own` live matches the repo migration.

### 2.2 Reformulating and tailoring resumes
- **Expect.** The resume rewritten for the posting, truthfully, as a PDF.
- **Exists [code].** `123-career-tailor.js` (parseJD, selectFacts, assemble, auditResume, diffResume; template bullets in `bulletFor`/`bulletsForPosting`); `148-career-render.js` PDF + ATS harness; `_shared/career_tailor.ts` (personas, resume store, changelog, edgeRenderer); router `career_tailor` returns an artifact that `handler-career.ts:567` materializes (`materializeArtifacts`); brain tool `tailor_resume`; prepare-ahead tailors per posting.
- **Proven [test].** 123/148 unit tests pass inside the node suite. `wo-028-tailor.test.ts` is Deno **[repo-only]**.
- **Root cause.** Tailoring selects, reorders and hides confirmed facts; nothing rewrites a bullet to the posting **[code: 123:578-637]**. `154-career-writing.js` (voice profile) is not used for resumes **[code]**. Contact facts written by `set_resume_contact` carry no provenance so the executor drops them (G2) **[repo-only + code: prepare-ahead.ts header]**. The profile is per thread, so a resume pasted in one thread is unknown in another **[code: STATE_KEYS]**. On the live path, drafts become usable only through the resume-confirm evidence step (`career_router_evidence.ts`), which stamps entries only when the router showed them (it does since e0aad64b, 142:1991) **[code]**.
- **Smallest fix.** A model rewrite of bullets gated by `auditResume` (every noun and number traced to a fact) on the router's tailor path; provenance on contact facts; profile at account scope (2.7).
- **Unverified.** PDF rendering on iMessage delivery (channel_artifacts) was not exercised here.

### 2.3 Finding the right people and sending networking emails
- **Expect.** Trainee finds the right person at the firm, writes the email, sends it with approval, tracks replies.
- **Exists [code].** Contacts only from the person's own CSV export (`_shared/career_contacts.ts importContactsCsv`, Hunter verify NOT_WIRED without `HUNTER_API_KEY`, no vendor under D-018a); drafts `_shared/career_outreach.ts draftFor` with `outreachLock` (every claim traced to a confirmed fact); the batch answer (`outreachTurn`: send all, send 1-7, redo, skip, edit) is code-first on the live path (handler-career.ts:395-405); sends `runOutreachSends` through `gmailSender` run by `career-proactive` only with `CAREER_OUTREACH_SEND=on`; replies classified (`runOutreachReplies`); router `graph_intro`/`graph_referral` build an intro card from the person's own export and confirmed facts.
- **Proven [test].** Node outreach tests pass in the suite. `wo-033-outreach.test.ts` Deno **[repo-only]**. Nothing live: function undeployed, flag off **[repo-only]**.
- **Root cause.** There is no people source, by decision: the router says so (142:1337 "No people database or email-finder is connected"), D-018a bars redistributing Apollo data **[code + repo-only]**. Drafting a new email exists only as the brain tool `draft_outreach` (off); the live path can only answer a batch that already exists **[code]**. Sending is a cron function that is not deployed; approvals are a text reply on a batch, not a per-message card.
- **Smallest fix.** Keep sends off (hold). Add a code-first "email / intro to <name> at <firm>" turn that calls `draftFor` over the thread's contacts and shows the draft on the approval card. The people source is an owner decision.
- **Unverified.** Gmail send path end to end (no grants here).

### 2.4 Professional follow-up emails and timing
- **Expect.** The right follow-up at the right time (after applying, after an interview), ready to send.
- **Exists [code].** `_shared/career_mail.ts planUpdates`: follow-up at 14 quiet days (`FOLLOW_UP_DAYS`), thank-you at 7 (`THANK_YOU_DAYS`), 30-day window; `draftOffer` text; `runInterviewDrafts` in `career_proactive_run.ts`; drafts stored in `career_mail_drafts`, offered by text.
- **Proven.** Mail tests (WO-024/040/043/045/046) are Deno on sealed sets **[repo-only]**. Nothing live.
- **Root cause.** Timing runs only inside the undeployed proactive run and depends on mail tracking (`CAREER_MAIL_TRACKING`, off). An offered draft has no send path; `CAREER_EMAIL_SEND` covers only apply-by-email **[code: handler-career.ts:393]**. The router's follow-up intents know only what this thread was told **[code]**.
- **Smallest fix.** A code-first "what follow-ups are due" read of `career_mail_drafts`; route an offered draft into the outreach card path (one yes per message; sends stay off).
- **Unverified.** Classifier accuracy numbers.

### 2.5 Inbox awareness: who emailed you and why it matters
- **Expect.** "Any news from Stripe?" answered from the inbox: rejection, interview, assessment, offer, recruiter reply.
- **Exists [code].** `_shared/career_mail_gmail.ts` (metadata and snippet, gmail.readonly); `classifyMail` into 7 kinds; `candidates()` matches mail to tracked applications; `career_apply_confirm.ts` upgrades queue rows on an employer's email; events; brain tool `where_do_i_stand` reads the mail store.
- **Proven.** Classifier measured on sealed sets (88.6/75.6 first, later sets up to 99.4/89.1) **[repo-only]**. `CAREER_MAIL_TRACKING` off and the function undeployed **[repo-only]**.
- **Root cause.** The live router never reads mail: `supabaseMailStore` is passed only to `agentTurn` **[code: handler-career.ts:483]**. The brain that has it is off; the cron that fills it is not deployed. So there is no chat surface for "who emailed me" at all today.
- **Smallest fix.** A code-first turn ("who emailed me", "any news from X") over `career_mail_store` applications, events and confirm rows, before the router. Deploy is the owner's.

### 2.6 Understanding the person's own work, projects and needs
- **Expect.** Trainee knows their projects, strengths, constraints and uses them everywhere.
- **Exists [code].** `122-career-profile.js` fact KINDS include project, experience, skill, education, goal, preference; `146-career-intake.js`; brain tools add/confirm/correct_profile_fact; router resume ingest shows each entry (142:1991); proof-of-work card; standing instructions `_shared/agent/memory.ts` (brain only).
- **Proven.** Unit tests in the node suite; `wo-023-memory`, `submit-real-person` 15 tests are Deno **[repo-only]**.
- **Root cause.** Two profiles with different truth rules: the brain's account facts with events versus the router's per-thread snapshot **[code]**. Only the brain holds standing needs. Projects are stored but used only by tailoring selection. Facts stated in chat (name, email, phone, eligibility) carry no event unless the resume-confirm step stamped them; the submit-path head offers them back through "use N" instead **[code: d671223c handler-submit-path tests b1/c1, repo-only]**.
- **Smallest fix.** One profile store with provenance for both brains; extend `career_router_evidence` from resume confirm to stated facts.

### 2.7 Contextual awareness: memory, goals, projects, people, references across turns and days
- **Expect.** "The first one", "that recruiter", "my offer from last week" resolve; nothing is forgotten between threads or days.
- **Exists [code].** Brain: 40-message window (`HISTORY_WINDOW`), code summary from `career_events` (`_shared/agent/timeline.ts threadSummary`), personBlock (standing instructions, pipeline, situation budget 5000 chars), recall tool. Router: the per-thread snapshot, thread mirrors (`_careerThread`), Muse's standing frames.
- **Proven [test].** Router frame tests pass in the node suite. `wo-019` part A (20-conversation eval), `wo-023`, `wo-027` are Deno **[repo-only]**.
- **Root cause.** The deployed brain cannot read earlier messages at all **[code]**; its state is keyed by thread, so a new thread forgets everything except watches and account controls **[code: career_host_load]**; the memory stack (window, summary, events, standing) is attached to a brain pinned off. The channel bridge keeps one thread per contact, which hides this on iMessage and exposes it in the web app **[code: channel_inbound.ts:42]**.
- **Smallest fix.** Give the router path the same personBlock inputs read-only; move profile and tracker keys to account scope in `career_host_load`/`commit`.

### 2.8 Chat capability: multi-turn dialogue, clarification, handing a request to an action, reporting back truthfully
- **Expect.** Understands any phrasing, asks one good question, does the task, says exactly what happened.
- **Exists [code].** `runAgentTurn` (tool policy at the boundary, unbacked-claim guard, AskPerson, fixed failure sentences); router `compose()` with 119 intents and a catch-all; code-first turns; `conversation.ts` bubbles.
- **Proven.** Held-out: agent 76 to 97 percent across passes, router 40 to 45 **[repo-only]**; the 95 percent one-pass bar is unmet. Node router tests pass **[test]**.
- **Root cause.** Production is the 42 percent brain. A hard-coded pin plus the 95 percent bar keep the only brain with language off; the router is a regex state machine where every new phrasing is a new rule, and new rules collide with old ones (section 5: one alert-claim regex now steals tailor and tracker turns) **[test + code]**.
- **Smallest fix.** Owner decision: a staged release (brain for question and advice turns, code for every action turn, which is already how actions work), measured live. No code change closes this alone.

### 2.9 Job search and fit ranking
- **Exists [code].** `_shared/career_ingest.ts ingestBoards` (ATS feeds; `board-directory.json` holds 2 boards here); `_shared/career_search.ts searchPostings` with `fitOf`, `goalScore`, `titleTier` (brain tool `search_jobs`); router `career_discovery` over `_shared/career_pool.js` (600 newest KB rows plus 50 targeted); `131-career-discover.js` ghost guard.
- **Proven.** `wo-006`, `wo-037`, `wo-073` Deno **[repo-only]**; live ingestion never ran **[repo-only]**.
- **Root cause.** Live search is keyword matching over a frozen snapshot inside a 600-row recency window; `fitOf` is reachable only by the brain **[code]**; ingest is undeployed and unscheduled.
- **Smallest fix.** Route router discovery through `searchPostings` over `supabasePostingsDb` when rows exist, KB as fallback. Deploy and schedule are the owner's.

### 2.10 Job alerts
- **Exists [code].** `_shared/career_alerts.ts planProactive` (keyword, location, recency, caps, quiet hours); `career_alert_prefs` written only by the brain tool `set_job_alerts`; router watches land in `career_watch_kv`; the bridge `syncWatchAlerts` exists only on adcf6473 (paused; its Postgres test is pending because `career_host_load` is refused as service_role).
- **Proven.** `wo-007`, `wo-037` Deno; `watch-alerts-bridge.test.ts` on the branch only **[repo-only]**. Nothing live.
- **Root cause.** A watch set by text never reaches the alert run on this head; ranking is keyword, not fit; delivery is undeployed. The alert path added on the Muse line regressed four other families (section 5).
- **Smallest fix.** Merge the bridge after its Postgres test passes, with the grant fix it found; narrow the alert claim.

### 2.11 Application tracking and truthful status
- **Exists [code].** `career_apply_jobs` states; `statusReply` says submitted only when confirmed; `_shared/career_situation.ts`; `126-career-track.js` in the router (per thread).
- **Proven [test].** `submit-chatpath` PIN 11-15 green at every head; `career-http-host` 6/6.
- **Root cause.** Three records that do not see each other: the router's per-thread tracker (what the person typed), `career_apply_jobs` (what was sent), mail events. The code-first readback covers some phrasings; the router's `tracking_status` still answers from the snapshot for others **[code]**.
- **Smallest fix.** One read model (jobs + mail events + tracker rows, as SITUATION already merges for the brain) behind both phrasings.

### 2.12 Interview prep
- **Exists [code].** `127-career-prep.js` (38 CIRs, 9 bank files, story mining, brief); `_shared/career_mock.ts` text mock, live and code-first (6 questions, heuristic scores for structure, evidence, specificity); voice mock; `interview_brief` tool; `career_invite.ts` (interviewer lookup never).
- **Proven [test].** Node 127 tests pass; the live mock is reachable. `wo-025`, `wo-035` Deno **[repo-only]**.
- **Root cause.** Questions come from static banks, not the posting on file; scoring counts rubric features; "weak spots drilled" (ARCHITECTURE 3.4) is not built.
- **Smallest fix.** Bind mock questions to the posting's JD keywords (127 `jdKeywords`) and keep a per-person weak-spot list in `career_events`.

### 2.13 Offers and negotiation
- **Exists [code].** `128-career-negotiation.js` with LCA, OEWS and BLS datasets; `_shared/career_offer.ts offer_benchmark` (brain tool, MIN_N 5); router `negotiation_plan`/`negotiation_draft` writes a counter email from the thread's offer record.
- **Proven [test].** Node 128 tests pass. `wo-036-offer-guidance` Deno **[repo-only]**.
- **Root cause.** The live counter cites no benchmark: 142 has zero references to `payData` **[code]**; the benchmark exists only as a brain tool.
- **Smallest fix.** Call the benchmark from a code-first offer turn so the counter states the median and the sample size.

### 2.14 Company and role research
- **Exists [code].** `125-career-intel.js` CIR validation; `153-career-kb.js` role aggregates (684 KB); firm guide; `career_hired.ts` (PDL, NOT_WIRED); router `company_intel`/`company_thesis`.
- **Proven [test].** Node tests pass. `wo-036-hired` Deno **[repo-only]**.
- **Root cause.** Hand-curated and static (38 companies), no outside data by design, PDL unfunded. Honest as built.
- **Smallest fix.** Let `company_intel` read the posting record (pay, location, first seen) for any company in postings and say what it lacks.

### 2.15 Scheduling, reminders and proactive nudges
- **Exists [code].** Router `calendar_proposal` (doorstep NOT_WIRED); `152-career-assign.js` reminder queue in `career_watch_kv`, read only by `scripts/career/alerts-host.mjs` (one account); digest behind `CAREER_BRIEF_DIGEST`; thank-you and nudge drafts.
- **Proven [test].** Node 152 tests pass. `wo-034` Deno **[repo-only]**.
- **Root cause.** Every proactive path ends in an outbox (`career_outbox`, `career_reminder_outbox`) that nothing deployed drains; no calendar is connected.
- **Smallest fix.** One outbox-to-delivery test on real Postgres (the pending alerts Postgres test generalised); deploy and schedule are the owner's.

## 3. The single largest root cause

Every capability the owner named exists in the repo at least once, almost always as a tool of the brain that is pinned off, or inside a scheduled function that is not deployed. What people reach is a regex router with per-thread memory over a frozen postings snapshot, with nothing scheduled behind it and no path from a chat message to the apply queue. The second structural cause is proof: the connected tests are Deno and real-Postgres only, the one chat-to-submit test bypassed the handler until d671223c, and the gate is red by construction (section 5), so green and red no longer carry information.

## 4. Fix order (code only, under the holds; proposed, not approved)

1. F0 proof: the handler-level flow (d671223c) as the measuring tool; a node-runnable host test for answer capture; remove hardcoded machine paths from tests so the gate can be trusted.
2. F1 connect answer capture to the queue executor (2.1). Needs Muse coordination: the capture is in 155/142.
3. F2 code-first chat-to-queue write (2.1, 2.9).
4. F3 one read model on the live path: inbox, status, due follow-ups (2.5, 2.11, 2.4).
5. F4 alerts: narrow the alert claim (section 5 regressions), then merge the bridge after its Postgres test (2.10, 2.15).
6. F5 account-scope profile and stated-fact provenance (2.6, 2.7, 2.2).
7. F6 benchmark on the offer turn (2.13); F7 posting-bound mock (2.12).
Owner decisions outside code: deploy ingest, proactive and deliver with the schedule; staged brain release; a people source; the 30-day per-company guard (`career_apply.ts:46`, enforced in code and SQL) versus "no volume caps".

## 5. Heads, carried gaps and regressions (DELTA-1257)

Heads: f1af2af9 = 49364988 + one commit (142, 155, both bundles). d671223c = 49364988 + four commits (handler-career.ts, career_router_evidence.ts, tests/flow/handler.ts and postgrest.ts, flow-real-person through handleChat, handler-submit-path.test.ts 9 tests, 3 pending). Neither contains the other; merge-base 49364988 **[code]**.

Carried gaps: (a) chatpath 6/15 at 49364988 and d671223c, 15/15 at f1af2af9 **[test]**; (b) flow-real-person bypassed the handler at 49364988 (test lines 107-115), re-pointed through handleChat at d671223c **[code]**; (c) bundles fresh at all three heads **[test]**; (d) the 30-day company guard is live in code and SQL, unresolved policy **[code]**; (e) v249 only, zero submissions **[repo-only]**.

Regressions against trunk, bisected to the first bad commit, reproducing at f1af2af9 and d671223c **[test]**:

| Test | Trunk → heads | First bad | Class |
|---|---|---|---|
| career-document-delivery CHANNEL-DOC-1 | 6/6 → 5/6 | 90194114 (142 alert path), in the career bundle from e0aad64b | REAL: "Tailor my resume for the Product Manager role at Natera and send me the PDF" routes to career_watch_create (trunk: career_tailor). `alertIntentOf`'s jobObject regex (142:10344) claims any turn with jobs/roles/openings/positions/postings/internships; b382bbc6 narrowed it but not this shape. |
| career-v240-live-gaps probe j | 11/11 → 10/11 | e0aad64b | REAL, same misroute. |
| career-v242-live-gaps | 2/2 → 1/2 | 492f75bc | REAL for the same misroute; two tailor-leg probes also moved with the resume-presentation rework. |
| career-depth-memory MI-013 | 13/13 → 12/13 | 90194114 | REAL: "find me data internships and also tell me what my tracker looks like" → career_watch_create (trunk: tracking_status). |
| career-resume-phrase-scope "both" | 4/4 → 3/4 | b3e9146e | REAL: with a global pause and an alert stop standing, "ok turn them back on" lifts the pause instead of asking which. |
| career-bundle-reachability | 1/1 → 0/1 | e0aad64b | SUPERSEDED PIN with an owner question: the "not wired" delivery line left the frozen router. |
| career-alert-intents 16 | 8/8 → 7/8 | 90194114 | Probably SUPERSEDED PIN: stated roles outside the taxonomy now save, per the owner's 10-25 rule (a2e29e8f, 79883247). Owner to confirm. |

CI gate (core) at 49364988 (run 40216633943): core tests 3001 pass / 33 fail / 24 skipped; architect-tests red on the stale "router reply shows a count" pins that d671223c re-points **[repo-only: job log]**. The 33 are the nine chatpath rows (green at f1af2af9), the seven above, four tailor probe rows, and fifteen rows of `tests/career-textpath-heldout-blind1-20261024.test.cjs`, which opens the hardcoded path `/root/workspace/heldout-blind1-records.jsonl` and fails on every machine but one **[test]**. Two more tests open machine paths: `tests/career-quality-routing.test.cjs:57` and `tests/career-spec-gates.test.cjs:273` **[test]**.

## 6. Unverified
- Deno is absent here: none of the 149 `tests/architect` files, the edge tests, the flow tests, the alerts bridge test or the eval harness ran.
- Live project state (deployed versions, row counts, flag values) is from the 2026-10-23 gap map; not re-queried.
- v249's commit lineage (D-026, WO-093 provenance unrun).
- The full node suite at f1af2af9 and d671223c was not rerun in full; only the named suites were.
