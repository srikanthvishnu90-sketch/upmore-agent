# Router depth audit: why the 427 RETEST-BRAIN rows fail

**Summary**
1. **Routing is the main cause.** The live router decides intent with an ordered chain of about 130 regex gates (`142-career-router.js:8361-9491`). I ran 246 threads on trunk 53db2d55. A rephrased ask fell back to "I didn't catch that" 51% of the time (78/154). The list's own wording fell back 14% of the time (13/92). The regexes and tests were fitted to the gauntlet's wording, so the fitting hid the problem.
2. **Shallow answers are the second cause.** About 104 rows are canned answers. The router has 348 fixed `compose({headline…})` templates. Many handlers return the same text whatever the ask says, pad thin answers with default content, or claim state that does not exist.
3. **State and data are the third cause.** About 54 rows. Router state is kept per thread (tracker, outreach, offer, prep). A substring company matcher (`142:2833`) turns "tracker" into the company "RA" and "nicely" into "NICE". The posting pool never meets module 154's freshness contract, so "current openings" are always reported as unverified.
4. **The brain fixes routing (a) and much of the shallowness (b) in 12 of 20 clusters.** It does not add depth that does not exist. Missing under both brains: calendar, people connector, referral submit and track, outreach follow-up waves and list re-cuts, debrief and story stores, a tailor that rewrites bullets instead of re-sorting them, and company files for any firm outside 38 CIRs. The brain also lacks two things the router has: KB role evidence and full company files.
5. **Run 1 of the brain battery passed 39–43 of 87 scenarios** (`agent-ad9a0369…/docs/architect/brutal-list/RUN-1.md`). The brain switch is necessary but not sufficient. The fix list below names the brain-side gaps to close before D-027: queue checks, the claim guard, and output hygiene.

---

## How this was measured
- **Harness:** a throwaway runner at `scratchpad/audit-repro/run.cjs`. It runs real `CareerHost.runTurn` on the audit worktree (trunk 53db2d55), with snapshot carry-over between turns as on the live path.
- **Posting pool:** the 200 real postings in `evals/career/alert-labels/candidates.json`. Each goes through the live mapper `career_pool.js mapKbPosting`, so the pool has the same shape as the live KB pool.
- **Two worlds:**
  - **cold:** no profile, as for most chat users.
  - **warm:** the TEST persona profile from `packages/career-data/fixtures/test-persona.json`.
- **Probes:** 246 threads with 289 turns.
  - 92 use the list's own ask text (`orig`). The text comes from `scratchpad/brutal/*.json` and `scratchpad/bl/rows.txt`.
  - 154 are paraphrases (`p1`/`p2`/`p3`), written the way a person types in chat.
  - Probes cover 20 of the 28 RETEST-BRAIN clusters, with 3–13 source rows per large cluster.
- **Grading:** I read and labeled every thread by hand (`labels.py`).
  - **F:** fell back to "I didn't catch that", either `career_fallback` or the contained null.
  - **M:** misrouted to the wrong family.
  - **S:** shallow. The intent was right, but the answer was canned, generic, ignored a stated constraint, or targeted the wrong posting.
  - **O:** ok. This includes a correct honest stop.
  - A multi-turn thread counts F or M if any turn in it failed.
- **Owner's row split:** each of the 427 rows has a failure category in its `WRONG:` field in `bl/rows.txt`. I grouped them:
  - **a-routing** (fallback-routing, lf02, followup-collapse, typo misses): 166
  - **b-shallow** (judge "Wording FAIL"): 104
  - **c-state** (tracking-write, memory-absent, state-attribution): 54
  - **guard-not-enforced:** 46
  - **c/d missing capability:** 26
  - **other:** 31
- **Files:** probes are in `probes.json`, raw replies in `out.json`, and a readable dump in `view.txt`. All are under `scratchpad/audit-repro/`.
- **Not done:** I did not run the agent brain. That needs OpenAI calls. Statements about what the brain would do come from reading `career_tools.ts` and `prompt.ts`, plus Run 1's measured results.

### Headline numbers (cold world; warm in brackets where it differs)

| | Probes | Fell back | Misrouted | Shallow | OK |
|---|---|---|---|---|---|
| All | 246 | 91 (37%) [86] | 35 (14%) [40] | 43 (17%) [44] | 77 (31%) [76] |
| List's own wording | 92 | 13 (14%) | 8 | 23 | 48 (52%) |
| Paraphrase of the same ask | 154 | **78 (51%)** | 27 | 20 | **29 (19%)** |

A profile changes little. It lets batch-apply and the mock start. It also lets the tailor chain run, and that chain then tailors for the wrong company (see root cause 6).

---

## Why it is built this way
- **One intent pipeline.** `dispatchChat` (`142:8361-9491`) is about 1,130 lines of `if (/regex/.test(t)) return handleX()`. 133 regex tests sit in the dispatch body alone, and the file has 432 `.test(t)` calls and 139 `handle*` functions. First match wins. There is no classifier and no model.
  - The tail is `if (/\b(job|career|resume|interview|application|internship|intern)\b/) return career_fallback` (`142:9486-9488`). Anything without one of those seven words returns `null`, and the host turns that into the same contained "I didn't catch that" (`career_host.js:385-386`).
- **Fixed one phrasing at a time.** The file carries 467 bug or scenario tags (BUG-, LF-, SC-, CB-, MI-) in comments. Each fix added an alternation for the phrasing that failed.
  - Gates name the list items themselves. The prep-extras gate at `142:9156` lists "technicals drill", "pm prep", "day-of checklist", "post-rejection retro", "debriefs say", "mock scored", "superday" and others.
  - `142:9374-9379` gates on "weak-profile honesty", "salary-band filter", "bucket" and "starred".
  - The tests pin the scenario text verbatim: `scripts/career/gauntlet/routing-expectations.json`, `tests/career-prep-completion.test.cjs` and `tests/career-guidance-entry.test.cjs` contain "Bank technicals drill", "Weak-profile honesty" and so on.
  - The suite passes on the exact words and fails on a neighbouring phrasing. That is the 52% vs 19% gap above.
- **Replies are hand-written strings.** There are 348 `compose({ headline: … })` templates in 142 alone. A handler that has no data still has a template, so it says something that sounds complete.

---

## Per-cluster findings

Probe columns are cold-world counts. **Rows** is the RETEST-BRAIN count. **Owner split** groups each row's own WRONG category: a = routing, b = judge-shallow, c = state, g = guard not enforced, d = missing capability, o = other. **Brain?** means: does `_shared/agent/*` and `career_tools.ts` have the tool or data to do better?

| Cluster | Rows | Probes | F | M | S | OK | Owner split | Dominant why | Brain has the depth? | Missing under the brain (tool / data) |
|---|---|---|---|---|---|---|---|---|---|---|
| mock-prep | 62 | 37 | 14 | 3 | 10 | 10 | a26 b25 g7 d2 o2 | **(a)**, then **(b)** | **Mostly yes.** The model runs the mock in its 40-message history, with `get_interview_questions` (9 banks), `interview_brief` (38 CIRs), `score_interview_answer` and `brief_from_invite`. Run 1: 4/5. | No debrief or interview store from chat (only pasted invites are kept). No story-bank store. Company detail only for 38 firms. |
| apply-chat | 60 | 31 | 16 | 4 | 6 | 5 (warm 8) | a44 b9 g5 | **(a)** | **Partly.** `search_jobs` returns fit and knockouts, plus `queue_applications` and `where_do_i_stand`. Run 1: **2/10**. | `queue_applications` (`career_tools.ts:180-190`) checks nothing: not duplicates, not the current employer, not the named company, not the level. No "starred companies" data. Submission happens only in the extension. |
| tracking | 47 | 24 | 9 | 6 | 2 | 7 | **c29** b14 a1 d2 | **(c)** per-thread state, plus **(a)** on the read routes | **Yes** for log and read across threads: `track_application`, `list_applications`, and `where_do_i_stand` over the mail store and every thread. Run 1: 3/5. | No calendar ("propose slots from my real calendar"). No field for an assessment score. No weekly-plan store. |
| routing-wording | 36 | 27 | 7 | 2 | 8 | 10 | a20 presentation7 g3 d2 | **(a)** | **Yes** for understanding the words. Run 1 still went 1/7: the misses were tool use (it did not search) and leaked tool names. | `search_jobs` handles location by keyword only. |
| intel | 30 | 25 | 8 | 4 | 3 | 10 | **b28** | **(b)**, and (a) on paraphrases | **Partly.** `career_path_answer` (firm guide, H-1B, PDL) and `interview_brief` cover 38 firms. Run 1: 1/3. | No tool that reads a whole company file. No market or sponsor-list tool: `dol-lca-wages` reaches only `offer_benchmark`. The KB role evidence (`kb-aggregates.json`, read by router module 153) is **not exposed to the brain**. |
| tailor | 29 | 17 | 5 | 2 | 2 | 8 (warm **5**: 3 wrong-company) | a13 b6 d3 o6 | **(a)**, plus **(c)** | **Routing yes, depth no.** `tailor_resume`, then `tailorForPosting`, then module 123's bullet re-sort (`career_tailor.ts:14`; BUILD "tailoring-depth"). Run 1: 1/6, because it needs a name and email first. | A tailor that rewrites bullets. Postings only by `job_id` or pasted text, so a named firm with no posting means an honest ask. |
| connector-honest-stop | 25 | 10 | 2 | 1 | 0 | 7 | a23 d2 | **(a)** where a stop exists; **(d)** by design | **Yes** for honesty (`prompt.ts:26`), but Run 1's BR-038 still said "I can do that". | The connector itself (WO-026, gated). Missing for both brains. |
| memory | 19 | 12 | 7 | 0 | 2 | 3 | **c14** g2 d2 o1 | **(a)** capture and recall frames, then **(c)** | **Yes.** History, `get_memory`, `recall` over the events timeline, `add_profile_fact`. Run 1: 4/5. | — |
| outreach-draft | 17 | 11 | 2 | 3 | 3 | 3 | a8 b5 d2 o2 | **(a)** and **(b)** | **Partly.** `draft_outreach` builds drafts from a contacts CSV, the signature and confirmed facts. | No follow-up wave. No tone or redraft parameter. List re-cut by firm and title only, not school or level. Do-not-contact list fed only by replies (BUILD "outreach-suppression"). Sends are owner-gated. |
| referral | 14 | 13 | 3 | 4 | 1 | 5 | b8 d6 | **(b)** and **(c/d)** | **Partly.** `referral_map` reads the person's exports and confirmed facts. Run 1: 2/2. | No referral submit or tracking. Keep-warm sees only outreach Trainee sent. No referral-bonus data. |
| negotiation | 14 | 12 | 4 | 1 | 2 | 5 | b4 g4 c2 a2 | mixed (a), (b), (c) | **Yes.** `offer_benchmark` (LCA, OEWS, BLS), and the model writes drafts and plays the roleplay. Run 1: 3/3. | — |
| pasted-posting | 9 | 4 | 1 | 2 | 1 | 0 | a9 | **(a)** | **Yes.** The model reads the pasted text, then `tailor_resume(posting_text)` or `set_job_alerts`. | Nothing durable stores a pasted posting. |
| gap-analysis | 7 | 3 | 2 | 0 | 1 | 0 | a7 | **(a)** | **Yes.** `search_jobs` returns gaps per posting; `get_profile`. | The router's KB role evidence is not exposed. |
| career-os | 6 | 5 | 1 | 1 | 1 | 2 | b5 a1 | **(b)** | **No tool.** Model only. | No wins log or promotion-packet store on the brain (router module 129 has one). |
| resume-qa | 3 | 3 | 3 | 0 | 0 | 0 | a3 | **(a)**: no route at all | **Yes** (`get_profile`). Run 1 invented "Excel". | — |
| persona | 4 | 2 | 2 | 0 | 0 | 0 | a4 | **(a)**: no route at all | **Yes** (`save_resume_persona`, `use_resume_persona`). | — |
| channel-chat | 6 | 4 | 3 | 1 | 0 | 0 | mixed | **(a)** | **Yes** (`search_jobs` returns links; the model plans). | — |
| alerts-chat | 1 | 3 | 2 | 0 | 1 | 0 | d1 | **(a)**, plus a watch that drops "Chicago" and "new grad" | **Yes.** `set_job_alerts` takes keywords, locations and levels. | Company scope (BUILD "alerts-company-scope"). |
| multi-intent / never-invent / state-fabrication | 3 | 3 | 0 | 1 | 0 | 2 | — | multi-intent: (a) first gate wins, 2 of 3 asks dropped | Yes. Run 1 hit MAX_STEPS on 3 intents. | — |
| guidance / copy-hygiene / router-internal / unsupported-claims | 28 | not probed | | | | | g22 c5 | Reply text has no output check | **Not fixed by the switch.** Run 1 saw `job_id`, `remote_ok`, `get_posting` and `referral_map` leak from the brain too. | A code-level output filter on both paths. |

### What the probes showed, cluster by cluster

- **mock-prep.**
  - Cold: "start a mock interview" returns `prep_needs_profile` (`142:8563`). Then "next question" and "how did I do?" fall back.
  - Warm: the mock starts, and "next question" works. "how did I do?", "grade me" and "ok ask me the next one" fall back.
  - "quiz me…" serves a bank question, but no session is opened that can score it. The answer "I'd start by…" is dropped, because the answer gate counts only a fixed list of first words (`142:8521-8531`) and "i'd" is not on it.
  - "how was that" misses the session gate, which has `how'?s (that|this|it)` (`142:9134`).
  - The take-home template returns the same text for three different asks and ignores "due in 3 days" (`142:3677`, `:3710`).
  - "STAR stories" lists five fact titles with no S/T/A/R content.
- **apply-chat.**
  - Batch apply needs `apply (to|for) <N> <family> (roles|jobs…)` (`155-career-batch-apply.js:82`). It also returns `null` with no profile (`142:8335`).
  - Result: "apply me to three data analyst jobs" falls back even warm, and "Apply to 3 data analyst roles" falls back cold.
  - "did I ever hear back from Stripe?" returns the Stripe company file, not the tracker.
  - "Role at my current employer" returns `career_recommendations` with "Current openings are unverified".
- **tracking.**
  - The write lands when the ask matches the "I applied" shape (checked with `dbg2.cjs`).
  - The reads misroute:
    - "what's in my tracker?" becomes `company_intel` "RA has no company file", because "RA" is a substring of "t**ra**cker".
    - "where am I with Quietline Apps?" becomes `career_guidance` "not on your record".
    - "what's my status at Quietline Apps?" becomes `company_intel`.
  - "it's been 3 weeks since I applied to Plaid…write a follow up" logs Plaid as applied **today**, and no draft is written.
  - The reschedule card says each slot is "free on the calendar in context" when no calendar is connected: slots come from `proposeSlots` at `142:6907` and the verdict string from `141-career-doorstep.js:1315`.
- **intel.** List-worded asks hit dedicated templates: the 3.4 GPA, 3.0 with no internship, AI, and H-1B answers. Paraphrases fall back ("is a 3.4 gpa too low for investment banking", "am I screwed") or mint a false company ("Is the SWE market bad…" and "Should I go to grad school?" both become "RA has no company file").
- **tailor (warm).** All three cases come from `142:8923-8988`.
  - "Tailor for Ramp full-stack" produced a resume for **Senior Product Data Analyst at Rain**. The chain: `companyFromText` matched "RA" inside "ramp", then the company filter `lc(r.company).includes("ra")` picked Rain.
  - "tailor my resume for a full stack role at Ramp" produced a resume for **Marketing Analytics Manager at RA**.
  - "customize my resume for Northwind Ledger" produced a resume for **vercel** through the discovery chain.
- **routing-wording.**
  - "find me jobs in Chicago only" returns remote and San Francisco roles.
  - "hlp me find intrnships in nyc" returns Abu Dhabi.
  - "need summer internships in new york, software or data" says the pool has no SWE roles, but it holds "Software Engineer - Next.js at vercel".
  - "how do I get into IB" returns "Operations coordinator / Communications assistant" paths. 154 pads to these defaults when it finds fewer than two matches (`154-career-recommendations.js:56-59`).
- **outreach and referral.** The campaign list-builder fires on any (verb AND people-noun) pair (`142:8801-8805`).
  - "draft an email to the recruiter saying I'm free tuesday" returns "Building the list now: investment bankers … the bulge bracket set — Goldman Sachs, Morgan Stanley…".
  - A pasted "Data Analyst … build weekly dashboards" posting gets the same list-builder answer.
  - "I had a great coffee chat with Sam at Plaid, write the email asking for a referral" returns a coffee-chat *prep* brief.
- **memory.** These work only in the list's frames ("my recruiter contact at X is Y", "what's the first thing…").
  - "fyi the recruiter I'm talking to at Northwind Ledger is Omar" is not captured.
  - "what city did I say I'm in?" and "where do I live?" fall back after "I'm based in Chicago".
  - "I'm a junior studying stats…" is parsed into a career-OS ladder: "junior studying status → null".
- **negotiation.**
  - "I got an offer! Help me negotiate" returns `tracking_status` with "Noted — a offer landed", and the next turn falls back.
  - "they offered me 85k … is that good?" falls back.
  - "is 110k a good offer for a SWE in Austin" falls back, although the brain's `offer_benchmark` has the LCA and OEWS data for it.

---

## The 10 most common root causes, ranked by rows affected

Row counts come from the owner's WRONG categories (exact), or are estimates from probe share × cluster rows (marked est.). The causes overlap, so the counts are not additive.

### 1. Intent is an ordered regex list; any other wording falls through. ~166 rows
- **Probe:** 91 of 246 threads fell back, 78 of them on paraphrases.
- **Evidence:**
  - `packages/domain/142-career-router.js:8361-9491`: the dispatch chain, about 133 gates.
  - `:9486-9488`: the fallback fires only if the text has job, career, resume, interview, application, internship or intern. Otherwise `return null`, and `career_host.js:385-386` gives the contained "I didn't catch that".
  - The fallback text is in `140-career-reply.js:128`.
- **Fix:** do not add more regex. Gate D-027 on a paraphrase-held-out eval (the 154 paraphrases in `scratchpad/audit-repro/probes.json` are a starting set), then set `CAREER_BRAIN=agent`. Until then, send `career_fallback` and the contained null to the brain, not to the canned string.

### 2. Canned templates with no data behind them. ~104 rows
- These are the judge's "Wording FAIL" rows: intel 28, mock-prep 25, tracking 14, apply 9, referral 8.
- **Evidence:**
  - 348 `compose({headline…})` templates in 142.
  - The take-home plan returns one text for every ask (`142:3677`, `:3710`).
  - Default path padding in `154-career-recommendations.js:56-59`.
  - "Style change noted … The 5 re-rendered samples sit at the top of your review doc", when no samples exist.
  - The opt-out answer "1 person added to the never-contact list" when no sender is known.
  - The STAR bank is a list of titles.
- **Fix:** on the brain path the model writes from tool data. Keep templates only for honest stops and approvals. Do not port these handlers' prose into tools ("no canned reply prose").

### 3. Router state is per thread, and the read routes miss it. ~54 rows
- c-state: tracking-write 28, memory-absent 16, state-attribution 7, other 3.
- **Evidence:**
  - `career_host.js:35-44` (STATE_KEYS) and `career_persistence.js:18-19`: the snapshot is loaded by `p_thread`. The account keeps only paused, preferred_locations, erase and stated_facts.
  - Replies say so themselves: "no applications on record **in this session**".
  - Tracker reads route away, as shown under tracking above.
  - BL-270 is the reverse case: an offer figure was attributed to a different conversation.
- **Fix:** the brain already reads account-wide data (`career_tools.ts:448` `where_do_i_stand` over the mail store, `:282` `recall` over events). If the router stays, move `trackStore`, `offer` and `outreach` to account scope.

### 4. No output guard on reply text. 46 rows
- router-internal 8, guidance 6, copy-hygiene 5, unsupported-claims 3, and others.
- **Evidence:**
  - Rows say "No permanent guard exists": internal ids, finance-domain leaks, unsupported completion claims.
  - Router templates interpolate raw state, for example "The path from junior studying status to null".
  - Run 1 found the same leaks on the brain (`job_id`, `remote_ok`, `get_posting`).
- **Fix:** a code-level output filter shared by both paths: no tool or field names, no `null` or `undefined`, and no "done" claim without a write. Then rework `loop.ts:100-107`, where `CLAIM_UNBACKED_REPLY` replaces whole good answers (Run 1).

### 5. Mock and prep keep their session in a regex state machine. Up to ~51 rows
- mock-prep a26 + b25.
- **Evidence:**
  - Answer capture counts a turn as an answer only if its first word is on a fixed list (`142:8521-8531`), so "I'd…" is dropped.
  - The continuation gate (`142:9117-9134`) has "how's that" but not "how was that" or "grade me".
  - A bank question serve (`prep_brief`) opens no scorable session.
  - The mock requires a profile (`142:8563`).
- **Fix:** the brain keeps the session in conversation history and scores with `score_interview_answer`. The WO-025 text mock (`career_mock.ts:505` START regex) also runs before *both* brains, so give it the same paraphrase eval.

### 6. Routing pulls toward known company names, and company names are found by substring. Est. 30–40 rows
- **Probe:** 15 of 35 misroutes.
- **Evidence:**
  - `142:2833` `for (const name of known) if (t.includes(lc(name))) return name;` has no word boundary, against pool companies like RA, NICE, Zip, Box, Grid and Hive. Results: "t**ra**cker" becomes RA, "**nice**ly" becomes NICE, and "**Ra**mp" becomes RA, then Rain.
  - Separately, any ask naming a CIR firm goes to `company_intel`: Stripe status, a Ramp offer, a Datadog referral, Figma ghosting, Meridian referral.
  - The rank filter `142:387` uses `includes` too.
- **Fix:** match whole words, with a minimum length or exact name, as the brain's `career_mock.ts:94` `findRecord` already does. Check the asked action before the entity. Never tailor or queue for a company that is not the one named. Run 1's BR-023 shows the brain needs the same check inside `queue_applications`.

### 7. Bag-of-words co-occurrence gates claim the wrong family. Est. ~20 rows
- outreach-draft, negotiation (BL-640), memory garble, multi-intent.
- **Evidence:**
  - Campaign builder (`142:8801-8805`): (find, get, email, draft…) AND (recruiter, analyst, associate…).
  - The stated-fact capture records "you study plan for my banking interview".
  - "I've been rejected from like 30 places" becomes a tracker event "Noted — a rejected landed".
  - Multi-intent keeps only the first gate (`tracking_status`) and drops the other two asks.
- **Fix:** this is the same fix as root cause 1. These gates cannot be repaired by adding more words.

### 8. Profile-gated handlers return `null` instead of asking. Est. 15–25 rows
- **Probe:** apply-chat has 16 fallbacks cold and 12 warm. The mock start and watch also need a profile.
- **Evidence:**
  - `142:8335` `if (!c.profile) return null; // the onboarding routes own the turn`. Onboarding does not own it, so the turn ends in the contained fallback.
  - `142:8563` (mock) and the watch "need your profile first" path.
- **Fix:** every gate returns its honest ask, never `null`. On the brain, missing facts are handled by the prompt's "do the most useful version, ask one question".

### 9. The pool's data does not meet what downstream modules expect. Est. ~15 rows
- routing-wording presentation, discovery-ranking, and the current-openings intel asks.
- **Evidence:**
  - `154-career-recommendations.js:73-85` (`freshness`) needs `source_kind === "live_public"`, `observed_at` within 24 hours and `status: "open"`. `career_pool.js` `mapKbPosting` sets none of these.
  - Result: every `current_openings` answer is "Current openings are unverified…", even with 600 real postings loaded.
  - Discovery ignores stated places ("Chicago only" returns SF and remote; NYC returns Abu Dhabi), and the internship band says the pool has no SWE roles when it does.
- **Fix:** either 154 accepts the KB snapshot with its `fetched_on` stated, or the mapper stamps the fields honestly. Add a location filter test.

### 10. The capability is missing under both brains. 26 rows in c/d, plus part of the b rows in referral, outreach and intel
- **Evidence:**
  - No calendar: the router's reschedule card says slots are "free on the calendar in context" with no calendar connected (`142:6907`, `141:1315`). That is state fabrication.
  - Connector (WO-026) gated.
  - No referral submit or track.
  - No outreach follow-up wave, tone redraft or school re-cut (`career_outreach.ts:1-17`).
  - No debrief or story store.
  - The tailor re-sorts bullets (`career_tailor.ts:14` uses module 123).
  - Company files exist for only 38 firms (`packages/career-data/cirs/`).
  - The brain has no access to KB role evidence (`kb-aggregates.json`) or to a full company-file read.
- **Fix:**
  - Stop the calendar claim now: say "no calendar connected".
  - Then build, in Run 1 order: queue checks (duplicate, current employer, named company, level), then a full company-file read tool and a KB role-evidence tool for the brain, then the tailoring-depth rewrite, then outreach follow-ups once the owner turns sends on.

---

## Would switching brains fix it?

| Fixed by switching (routing and phrasing) | Needs the brain plus new checks | Depth missing under both |
|---|---|---|
| routing-wording, memory, resume-qa, persona, pasted-posting, gap-analysis, channel-chat, alerts-chat (except company scope), mock-prep (except stores), negotiation | apply-chat (queue checks, Run 1 2/10), tailor (name and email, wrong-company check), guidance, copy-hygiene and internal leaks (output filter), the unbacked-claim guard | calendar, connector and intros, referral submit and track, outreach waves and list surgery, debrief and story store, tailoring depth, company files beyond 38 CIRs, KB and market data on the brain path |

In rows: about 166 routing rows plus about 54 state rows (the brain reads account-wide data) are the brain switch's to win. About 104 shallow rows are won only where a tool returns real data; that is roughly half, the intel and referral rows aside. About 72 rows (46 guard plus 26 missing capability) need work in code whichever brain answers.

## Limits
- I did not run the brain here (no OpenAI calls). Brain conclusions come from code reading plus Run 1 (one run, gpt-5-mini, n = 87).
- The labels are one reviewer's calls, and S vs O is a judgment. F and M are mechanical: intent plus the fallback string.
- The pool is 200 real postings, not the live 600-row KB window. Pool-dependent answers may differ live, though the substring entity bug gets worse as the pool grows.
- These clusters were not probed: guidance, copy-hygiene, router-internal, unsupported-claims, discovery-ranking, apply-guards. Their rows are judged from the owner's WRONG text only.
