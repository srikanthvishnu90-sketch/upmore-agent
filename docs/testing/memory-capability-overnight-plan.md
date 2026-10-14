# Overnight memory and capability improvement plan

## Starting point and what has already changed

The selected production baseline is `192132dfd83f6f9834a7e8c962be91f570f6bbc7`, verified on origin/main and pushed unchanged to `audit/memory-capability-20261013` before repairs. This audit branch owns the bounded changes below; the other chat remains the integration owner. Main is unchanged.

| Measure | Baseline | Current repaired candidate | Meaning |
| --- | --- | --- | --- |
| Frozen workflow-memory scenarios, three restored-state trials each | 45/50, 90% | 50/50, 100% | Production deterministic flow layer with local JSON persistence; synthetic data |
| Separate robustness corpus, three trials each | 10/60, 16.7% | 60/60, 100% | Same phrases replayed against the original source snapshot and repaired candidate; once inspected, these become regression cases |
| Strict capability completion in the offline-evaluable corpus | 39/50, 78% | 39/50, 78% | Nine honest limitations and two documented divergences remain unmet expectations |
| Corpus evaluation coverage | 50/79, 63.3% | 50/79, 63.3% | Twenty-nine model-dependent cases are unrun, not failed or passed |
| Strict corpus variants | 75/103, 72.8% | 75/103, 72.8% | Twenty-three LIMITED, five FAIL; non-FAIL is insufficient to count a pass |
| General semantic/career memory | Unmeasured | Unmeasured | No career-memory implementation, exact owner's 50, deployed test-user credentials or model key were available here |
| Recorded live capability completion | 0/206 qualifying artifacts | No new live evidence | Evidence inventory, not 206 live failures; 205 rails NOT_WIRED, one local SANDBOX |

These are separate scores. A 50/50 local workflow score does not establish perfect memory, live capability completion or conversational fluency. Three deterministic repeats test restoration stability; they do not estimate stochastic model reliability. New blind variants remain necessary.

Completed repairs: amount-only replies retain pending context; send and split dispatch share one bounded amount-edit grammar; split corrections recompute shares; identified cancellation merchants survive blocked reads; recent payment-status replies distinguish staged from posted; repeated approval acknowledgments keep the original settlement reference without renewing its time window. Fifteen depth checks and fifteen planted defects verify the repair packet. The depth runner now explicitly requests TAP and checks process exit status on Node 24.

## The overnight objective

Use an eight-hour engineering window, relative to its actual start. Aim to make one coherent student/career journey work end to end: introductions, facts and preferences, confirmed recall, corrections, task progress, references, interruption, durable resume and forgetting. Keep money flow regressions green. Do not attempt to connect 205 absent rails overnight.

The release target is **at least 90% on a fresh 50-scenario semantic suite at pass-three**, **at least 85% on 100 blind variants**, and **zero critical ownership, privacy, approval or duplicate-action failures**. These are targets, not promised outcomes. Publish measured before/after counts, coverage and remaining blockers. Do not report this target as reached until the actual handler and configured model have run.

### 1. T+0:00–0:20 — Freeze the build and establish ownership

1. The coding owner chooses the exact commit to integrate. Use the audit branch's bounded fixes; inspect diffs before adopting them. Do not switch, reset or push main from this audit chat.
2. Record commit, model provider/model, feature flags, migrations and runner versions. Store only variable names and presence, never values.
3. Identify whether the career patch already exists on the coding owner's branch. It was not present in the scored main build. Reuse existing implementation when available; do not create a parallel career engine from assumptions about the pasted patch.
4. Freeze the 50 workflow cases and 60 exposed variants as regressions. Keep baseline JSON immutable. Assign only one owner to application files; Dots audits the same commit and returns findings.
5. Set a hard model-call and token budget using the existing reservation/usage gateway. A budget denial is BLOCKED, not a semantic failure. Keep OpenAI as the configured provider; never spend Anthropic credits as fallback.

**Exit:** One identified build, no source collisions, reproducible baseline commands, and an explicit audit manifest.

### 2. T+0:20–0:55 — Build a truthful semantic benchmark

6. Create 50 distinct scenarios, five per area: goals/completion; facts/files/preferences; useful clarification; pending/completed/blocked/cancelled state; tool selection/proof; references; corrections/interruptions; cross-session persistence; crash/retry recovery; natural grounded replies/forgetting.
7. Make each scenario three to eight turns with explicit desired state changes and forbidden claims. Include fresh-thread and restored-process transitions. Separate synthetic tool fixtures from actual provider results.
8. Reserve 100 new variants with new names, numbers, orderings, phrasing and interruptions. Hide their expected answers from the implementation process. Do not label the already exposed 60 as still blind.
9. Run the real `agent-chat` handler locally with a Supabase test backend that persists rows to JSON between turns, following existing edge-test patterns. Deterministic mock model tests prove I/O only. Semantic scoring must also use the actual configured model.
10. For transport behavior, separately exercise `agent-message-turn` and the worker with a synthetic adapter that records exact bubbles and receipts. Do not substitute direct handler replies for actual bubble-path evidence.
11. Establish before scores at three trials. Report PASS, FAIL, BLOCKED, LIMITED and NOT RUN separately. A pass requires both the reply and resulting state to satisfy the contract.

**Exit:** Versioned suite, untouched blind set, baseline transcript per case, no invented 1/50 claim.

### 3. T+0:55–2:10 — Add a small durable memory contract

12. Store structured memory per authenticated user, with strict owner scoping and RLS. Separate identity/facts, preferences, permissions, task state and recent references. Do not treat the conversation transcript as the only durable memory.
13. For each fact, store field, value, original message ID, exact supporting span, source `user_said`, confirmation state, observed time and revision. Unknown remains unknown; model inference never becomes a user fact.
14. Add the smallest supported fields needed for the career journey: preferred name, school, year, major, graduation date when supplied, targets, location constraints, experience, skills and requested notes. Do not promise to remember everything indiscriminately.
15. Capture corrections as replacement events that supersede the old fact. Keep provenance for debugging without feeding superseded values back as current truth. Say clearly what changed.
16. Implement confirmation only where needed. Avoid re-asking confirmed facts; ask one blocking question, not a questionnaire. A required approval remains explicit.
17. Add recall that reads current supported facts and their confirmation state. If information was never said or storage is unavailable, say so rather than reconstructing a plausible biography.
18. Implement scoped forgetting and forgetting everything. Prevent deleted facts from being re-extracted from old prompt history; define transcript redaction/deletion and tombstone behavior. Erasure must affect later sessions, caches and retrieval indexes.
19. Refuse secrets and identity digits before storage. A request to remember a password, OTP or SSN cannot create a memory event, log a value or echo it into evidence.
20. Test all paths with a brand-new synthetic user who has no fixture profile. This specifically prevents the harness from supplying facts that the product never captured.

**Exit:** Capture, confirmation, correction, recall and forget work through the actual handler after serialization, with no cross-user reads. No schema push to the live project in this audit chat.

### 4. T+2:10–3:05 — Give the conversation an explicit task model

21. Persist a task record containing goal, user's definition of done, constraints, collected inputs, missing inputs, next step and status. Use a finite set such as proposed, awaiting input, awaiting approval, running, blocked, completed, cancelled.
22. Completion requires the task's proof: a saved artifact, verified tool record or acknowledged human handoff. A tool request or an HTTP 200 alone is not completion.
23. Bind references such as “that one,” “continue” and “change it” to task IDs, entities and revisions. If two candidates are equally plausible, ask which. Never guess a recipient or silently choose an expensive action.
24. On an interruption, distinguish a paused task from a cancelled task and a replaced proposal. Tell the user what remains pending. Preserve the existing rule that moving away from a financial card drops its actionable approval.
25. Apply corrected constraints to future work and invalidate earlier proposals when their terms changed. A prior yes cannot authorize a changed amount, recipient or scope.
26. Resume across sessions from the durable task record, not from a prose summary that says an unexecuted task is done. Use a short recap and one actionable next step.
27. Maintain a fresh, small context envelope for the model: current user facts, active tasks, unresolved references, relevant source excerpts and actual tool outcomes. Keep irrelevant historic chatter outside it.

**Exit:** Correction and interruption cases preserve coherent goals, and every completion claim cites the corresponding proof.

### 5. T+3:05–4:00 — Close state-loss and retry gaps

28. Use an optimistic version check or row lock for memory/task read-modify-write. Current flow state saves use an upsert; do not assume that proves concurrency safety. Add a reproducible two-request barrier test before selecting a correction.
29. Deduplicate by authenticated inbound message ID, not by similar text. The same delivery replay returns its prior result; two intentionally repeated messages with different IDs remain two distinct events.
30. Commit state and its associated reply/outbox entry atomically where possible. A crash after committing must recover the same reply without re-running an approval, correction or tool action.
31. Handle the uncertain provider window with durable submission markers and receipt lookup. Preserve the existing behavior that an unknown timeout is not permission to resend.
32. Inject crashes before state commit, after commit, before enqueue, after enqueue and after provider acceptance. Verify exactly which operation is replayed, recovered or held for review.
33. Test conflicting corrections and forgetting while another turn is in flight. A late old revision cannot restore deleted or superseded facts.

**Exit:** Concurrent events retain both valid updates or explicitly reject/retry a conflict; duplicate message IDs cannot create duplicate effects.

### 6. T+4:00–5:00 — Improve language understanding without moving authority to the model

34. Add a structured extractor through the existing model gateway: a forced tool/schema output with bounded fact updates, intent, reference candidates and supporting spans. Reserve budget first and record usage afterward.
35. Validate every extracted fact against the user's actual message. Resolve names and IDs through owned rows. Reject out-of-range fields and invented spans. Do not let the extractor manufacture approvals, recipients, tool success or permissions.
36. Keep shared deterministic parsing as fallback on model failure. The repaired amount grammar demonstrates why dispatch and handler grammars must not drift apart.
37. Use typed source context for recall and task status; let the model phrase that context naturally. Code remains responsible for numbers, permissions, completion state and secret refusal.
38. Include negations, quotes, forwarded instructions, “yes, but…”, mixed money/career requests, jokes and mid-sentence corrections. A word like “find” alone cannot own the career route.
39. Run at least 40 money→career collision cases and 40 career→money collision cases. Routing can safely ask a question, but cannot silently approve a task or return an unrelated default menu.
40. When no verified jobs/postings/tools exist, say what can be prepared and what input or connection is missing. Never deliver fictional roles, `(TEST)`, `example.test` or made-up application outcomes in a live reply.

**Exit:** More paraphrases understood with the same gates, grounded extraction and bounded spend. The existing 110 exposed memory regressions remain green.

### 7. T+5:00–6:10 — Raise reachable capability completion

41. Prioritize the 29 unrun model-dependent conversation cases by enabling their safe test prerequisites. Improving evaluation coverage is the first gain; do not reclassify them as passing merely because a key is present.
42. Review the nine LIMITED cases for a complete safe handoff: exact destination, prepared artifact, specific remaining user action and honest blocker. Implement missing preparation when no external rail is required.
43. Keep both documented divergences explicit: first-send handle read-back and rent's human handoff are deliberate safeguards. Do not remove them to improve the strict historical corpus score. If the product contract changes, version the benchmark and publish both old and new scores.
44. Choose three to five high-value career capabilities that share the same memory/task model: profile recap, internship search criteria, resume revision plan, interview practice state and a prepared outreach draft. Each needs its own definition of done and supported tool proof.
45. Do not claim job discovery without sourced postings, delivery without a receipt, or connection without OAuth completion. A draft is a draft; an export-only connector remains export-only.
46. Rebuild the router bundle and run relevant Node/edge/depth checks after each repair batch. Stop adding breadth when an ownership, secret or approval regression appears.

**Exit:** Verified preparation and task progress improve on a small coherent journey; external partner gaps remain labeled rather than hidden.

### 8. T+6:10–7:15 — Dots independently audits the candidate

47. Give Dots the exact candidate commit, test commands, input contracts and artifact schemas. Dots uses separate synthetic user/thread IDs on the same build. Do not give it the implementation's expected canned answers.
48. Run the fresh 50 semantic scenarios three times and the 100 blind variants. Grade externally visible reply, durable state and tool evidence together. Human/independent review resolves semantic cases; simple regex matching is insufficient for general conversational correctness.
49. Export each failure as `case_id, commit, model, trial, synthetic transcript, expected, actual, state before/after, proof, severity, reproduction command`. Never include credentials or private user history.
50. The coding owner integrates root-cause fixes. Keep every failing case; do not weaken assertions, change wording to the implementation's favorite phrase or increase score by shrinking the denominator.
51. Rerun regressions after fixes. Previously unseen failing variants are now regressions, so reserve another small blind set for the final gate.

**Exit:** Independent, reproducible failures have one implementation owner; no second disconnected codebase, no silent drops and no “50/50 means perfect memory” claim.

### 9. T+7:15–8:00 — Final gate and reviewable handoff

52. Record final commit and source digest. Re-run the selected regression suites on that exact code, including money safeguards and router collisions. Persist logs and scoreboard to GitHub on the review branch.
53. Require zero critical defects: cross-user memory, secret retention, revived forgotten facts, unapproved effects, duplicates and false completion are release blockers regardless of average score.
54. Report semantic seeds, exposed regressions, fresh blind variants, capability completion, coverage, limitations and unrun live paths separately. Include every unresolved failure and a next action.
55. Produce a concrete migration/feature-flag/deployment checklist for the owner, with rollback and smoke messages. This audit chat does not push database migrations to the live project, deploy or send real messages.
56. Owner review comes after the concrete candidate exists. If prerequisites prevented model or transport checks, finish the independent work and state the exact remaining prerequisite; do not publish an assumed score.

**Exit:** A reviewable, reproducible candidate with measured gains and an honest release decision.

## Dots handoff contract

Dots audits; the coding owner changes application files. Give both the same exact commit. All test conversations are synthetic. Request/response transcripts, JSON state and proof receipts are the source of truth. A reported PID, green syntax check, passing fixture test or stored prose claim is not sufficient evidence of completed work. No external message to Dots or the other chat has been sent from this session.

Suggested priority: P0 ownership/approval/secret/duplicate defects; P1 lost facts, wrong references, revived tasks, false completion; P2 repeated questions, phrasing brittleness and unnatural but correct replies. Fix in that order and repeat the exact failing transcript first.

## If the model-backed audit cannot start

The actual machine had no `UPMORE_CHAT_URL`, `UPMORE_TEST_JWT` or `OPENAI_API_KEY` binding available for this audit. Local pure edge tests and network module downloads now work. An unset key is not evidence of failed GitHub authentication; Git access and pushes succeeded independently.

Supply test configuration securely, never in chat. A deployed URL/JWT is useful only for an isolated synthetic test account with safe effects; otherwise use the full local handler and a test database. Confirm the configured model operation, budget and resulting test records before counting model-dependent cases. The onboarding proxy's reserved `OPENAI_` names may require the app's supported runtime binding path rather than a new proxy-secret declaration; do not rename the variable in production code merely to invent access.

Until that is resolved, continue pure memory transitions, SQL ownership/concurrency tests, handler wiring tests and offline capabilities. Report semantic memory and deployed performance as NOT RUN. Do not spend the whole night tuning the exposed 50 answers.
