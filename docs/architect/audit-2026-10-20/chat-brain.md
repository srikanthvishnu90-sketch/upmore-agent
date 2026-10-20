# Audit: the chat brain path (trunk @ 53db2d55)

**Summary (5 lines)**
1. BACKEND is the bigger killer. Each commit bumps one account version for the person, so two messages at once from one person fail, even in two different threads. The second gets a 409 or 503 (verified on the real RPCs). By then its tools have already written, and an email may have gone. The reply still says "Nothing new was started". Over Telegram, WhatsApp and iMessage it says "I couldn't answer". The same bump also cancels any queued batch or task intent (F1).
2. Facts and the tracker live in the per-thread snapshot. A new conversation starts empty, and the brain never reads the account-wide stated facts (F3, verified). History carries only reply text, so job_ids and tool results vanish between turns. That pushes the model to print ids and tool words in replies, and to search again (wrong posting) (F10).
3. DEPTH: code checks the shape of a tool call but not what it means. `queue_applications` takes any posting the model picks. It does not check the company asked for, the tracker or the current employer (F2). `remember_instruction` keeps "don't ask me" as a rule to follow every turn (F4). Chat replies and drafts are never fact-checked (Excel, F6). Photos never reach the model, yet the model is told to describe them (F11).
4. The guards meant to stop false claims make new ones. The regex claim check replaces whole correct answers with a canned "Tell me again and I'll do it" (F5). The step limit throws away finished work (F9). No model error is retried, and one bad tool-call argument ends the turn and hands it to the router without a word (F8). A slow turn passes the bridge's 120 s timeout, so the person sees "couldn't answer" while the turn commits anyway (F7).
5. 13 findings. 10 verified by throwaway repros (verbatim SQL RPCs on a scratch Postgres, Deno scripts against the trunk modules) and 3 from reading. Repros: (a throwaway repro outside the repo) (`race.sql/.out`, `r_brain.ts/.out`, `r_steps.ts/.out`, `r_empty.ts/.out`).

Context: the live answer is still the router unless `CAREER_BRAIN=agent` (`agent-chat/career_brain.ts:28-30`). F1, F7, F12 and F13 hit the router path too, because they live in the handler, the commit and the bridge. The rest are agent-path problems, and they decide whether the agent can meet D-027.

Paths: `H` = `supabase/functions/agent-chat/handler-career.ts`, `L` = `supabase/functions/_shared/agent/loop.ts`, `T` = `supabase/functions/_shared/agent/career_tools.ts`, `CH` = `supabase/functions/_shared/career_host.js`, `MG` = `supabase/functions/_shared/model_gateway.ts`, `CI` = `supabase/functions/_shared/channel_inbound.ts`, `SQLc` = `supabase/migrations/20261021050000_career_brief_digest.sql` (latest `career_host_commit`, function starts at line 77; line numbers below are relative to the file), `SQLl` = `supabase/migrations/20261015020000_career_watch_kv.sql` (`career_host_load`).

---

## F1. Two messages from one person at the same time: the second turn's work happens, then it is thrown away and denied
**Symptom.** The person texts "yes send it" and, two seconds later, "thanks". Or they have the web app and Telegram open at once. The second turn runs its tools and fails at commit.
- Web: 409 with "The saved career context changed… Reload your owned conversation before retrying. Nothing new was started."
- Telegram, WhatsApp, iMessage: "I couldn't answer that just now. Try again in a minute."

Meanwhile the turn's alerts, queued applications, outreach batch, standing instruction and timeline events were already written. If the turn was an email "yes", the email was already sent from their Gmail. Their message and the real reply never reach `agent_messages`, so the next turn's model has no record of them. If a batch apply was queued, an ordinary later message ("thanks") cancels it.

**Why-chain**
1. Why did the second turn fail? `career_host_commit` refuses when the account version moved: `if coalesce((a->>'version')…)<>p_account_version then … 'revision_conflict'` (SQLc:93). It also refuses when the thread revision moved (SQLc:95).
2. Why did the account version move when nothing account-level changed? Every commit writes `version = p_account_version+1`, whether or not the patch is empty (SQLc:133, `a:=a||…||jsonb_build_object('version',p_account_version+1,…)`). So the version counts every chat turn of the person, in any thread.
3. Why are the writes not rolled back? Most tools write straight to their own tables during the turn, before the commit:
   - `remember_instruction` → `saveStanding` (T:102)
   - `set_job_alerts` → `store.save` (T:254)
   - `queue_applications` → RPC (T:186)
   - `draft_outreach` → `saveBatch` (T:552)
   - `recordEvent` everywhere
   - code-first `emailTurn` sends mail at H:363-368

   The commit is at H:516. Only the snapshot, the account patch and the messages are inside the transaction (SQLc:142-147).
4. Why the false sentence? The catch at H:522-525 maps every conflict to one string that says "Nothing new was started". The channel bridge throws on any non-2xx (`channel_runtime.ts:20`) and replies `CHAT_DOWN_REPLY` (CI:188-191). The message id was already claimed (CI:105), so nothing retries.
5. Root: optimistic concurrency with no serialization of turns and no retry, around a turn that is not transactional. A per-user lock exists (`pg_advisory_xact_lock`, SQLl:72, SQLc:83), but it is held only inside each RPC, not across the turn.
6. Collateral: the account-row triggers cancel every queued or claimed intent whose `authority_account_version` is not the new version:
   - `20261016010000_career_batch_intents_v1.sql:64-65`
   - `20261015234000_career_task_intents_v1.sql:41-42`

   Intents are minted with `accountVersion+1` (`career_task_bridge.js:50,184,219`). So the very next chat commit of any kind cancels them.

**Class:** BACKEND. **Severity:** high likelihood × lost data, a false statement, and an external effect denied → **#1**.

**Evidence: VERIFIED** (`race.sql`/`race.out`: verbatim `career_host_load` + `career_host_commit` + the batch trigger on a scratch Postgres 16):
- Same thread, both loaded at revision 0 → commit k1 ok, commit k2 `{"error":"revision_conflict"}`. `agent_messages` holds only k1's pair.
- Two different threads → the second commit fails with `revision_conflict`.
- A queued batch intent at version 2, then a "thanks" turn → intent `cancelled`.

**Fix (smallest root cause).**
- Serialize turns per person. Take a lease at `career_host_load`: a `career:turn-lease` row with an expiry, plus the turn key. The handler queues or waits on it, or returns "still working on your last message". The commit releases it.
- Bump `version` only when `p_patch` is non-empty, so the counter means what the intents think it means.
- Until then, the 409/503 text must not say "Nothing new was started" when `turn.tool_calls` holds an ok `write_own`, or when an email was reserved.

**Fail-first tests.**
- (a) SQL: two loads, then two commits with an empty patch, in different threads. Both succeed, and the account version is unchanged.
- (b) SQL: a queued batch intent survives a plain chat commit.
- (c) Handler: a commit rejected after `set_job_alerts` succeeded never returns "Nothing new was started".

**Brutal-list rows:** none named directly (no row describes a burst). Channel rows BL-668..677 (channel-chat) run on this path.

---

## F2. "Apply me to X" queues whatever the model picked: wrong company, duplicates, current employer
**Symptom** (battery run 39500971945):
- BR-023: asked for "operations role at Quickhire Remote Jobs" → queued "Meridian Fulfillment, Operations Analyst".
- BR-018: queued Northwind Ledger although the tracker already holds a hand-made application there.
- BR-021: queued a role at Copperline Infra, the person's current employer.

Each becomes a prepared card in the extension, one tap from submission.

**Why-chain**
1. Why the wrong company? `search_jobs` drops query words from the end until something matches (T:213-216). "operations Quickhire Remote Jobs" becomes "operations", and the result says `relaxed_to` only in a note the model may ignore.
2. Why was it queued anyway? `queue_applications` is `write_own`, so it runs freely (L:118-128). It passes the model's `postings` array straight to `queueWants` (T:183-189). Nothing compares the posting's employer with the employer named in `c.turn.message`. `company` and `title` are copied from the model's own input (`career_apply_want.ts:30`), so even the label can be wrong (R8 stored "Quickhire Remote Jobs" on a Meridian URL). The RPC checks length only (`supabase/migrations/20261022100000_career_apply_wanted.sql:34-36`).
3. Why the duplicate and current-employer cases? `queueWants` de-duplicates only against `career_apply_wanted` posting keys (`career_apply_want.ts:53-54`). It never reads the tracker (`trackStore`, per thread; see F3), the extension's receipts, the 30-day reapply rule (BR-019), or confirmed facts naming a current employer.
4. Root: the approval boundary for "start applying" is the extension card. Everything before the card is trusted model output. The prompt asks the model to queue "the ones they chose" (`prompt.ts:173-176`), but code never checks the choice.

**Class:** DEPTH (+ BACKEND for per-thread tracker blindness). **Severity:** high × wrong external action (one tap from a submission) → **#2**.

**Evidence: VERIFIED.** R8 in `r_brain.out`: three picks (wrong label, tracked company, current employer) → `queued: 3, refused: []`. Battery BR-018, BR-021 and BR-023 replies agree.

**Fix.** In `queue_applications`:
- Resolve each pick by `job_id` through `deps.posting` and take company and title from the posting, never from the model.
- Refuse a pick whose company is not named in this turn's message, unless the person picked by number from a list shown last turn.
- Refuse, with a reason, a posting already in `list_applications`, `mail.applications` or the extension receipts for that company in the last 30 days, and a company matching a confirmed "current employer" fact.

Files: T:180-190, `career_apply_want.ts:20-58`.

**Fail-first test:** BR-023 as a unit test. Message "Apply me to the operations role at Quickhire Remote Jobs"; the model picks a Meridian posting; expect `queued: 0` and a refusal "not the employer you named".

**Rows:** BL-019, 473 (BR-018); BL-024 (BR-021); BL-055, 056, 058, 059, 061, 062, 063, 065, 066 (BR-023); BL-020, 474 (BR-019); BL-188 (no current-employer rule).

---

## F3. Facts and the tracker belong to a thread, not a person: a new conversation knows nothing
**Symptom.** On the web app or extension, a person tells Trainee their internship and confirms it, tracks three applications, then starts a new chat. Now:
- "What do you know about me?" → nothing.
- `tailor_resume` → "no confirmed facts".
- `list_applications` → empty.

They re-type everything and re-confirm it. The router's own stated facts (school, year, target firm) cross threads, but the agent never reads them.

**Why-chain**
1. `add_profile_fact`, `confirm_profile_fact` and `set_resume_contact` mutate `c.state.profile` (T:60, 142, 156, 409). `track_application` and `list_applications` use `c.state.trackStore` (T:62, 165, 173).
2. `c.state` is the host turn ctx. `profile` and `trackStore` are `STATE_KEYS` (CH:35-37), saved by `extractSnapshot` into the thread's snapshot (CH:416-452), stored in `agent_flow_state` by `thread_id` (SQLc:142-143), and loaded by thread (SQLl:83).
3. Only `statedFacts` (the router's) and `preferred_locations` go to the account patch (CH:431-449). The agent's `profile.facts` never does.
4. `personBlock` reads `profile.facts` only (`memory.ts:142`). No tool reads `ctx.statedFacts` except `referral_map` (T:595-596). So the account record is invisible to the agent.
5. Root: the agent tools were bolted onto the router's per-thread store instead of a per-person store. `ownerThread` creates a fresh thread for every request without `thread_id` (`chat_session.ts:15`). Over channels, one shared thread hides the problem until a second channel or the web app is used. Also, two first texts from a new contact both run with `threadId: null` (CI:184), so each creates its own thread, and the facts said in the losing one are gone.

**Class:** BACKEND (+ DEPTH: two fact models). **Severity:** high on web × lost data → **#3**.

**Evidence: VERIFIED.** R2 in `r_brain.out`: after a fact and an application in thread A, the snapshot holds `["profile","trackStore"]`, the account patch is `null`, and thread B's `get_profile` and `list_applications` return empty. This confirms TRIAGE.md's "rests on reading" per-thread-state finding.

**Fix.** Keep agent profile facts in `career_watch_kv` key `career:profile` (per user, wiped by erase like `career:standing`), and fold the account `stated_facts` into the facts the agent sees. Make `list_applications` read `mail.applications` (all threads plus the apply queue), as `where_do_i_stand` already does (T:454-456).

**Fail-first test:** add and confirm a fact in thread A, open thread B with `snapshot: null` → `get_profile` returns the confirmed fact, and `list_applications` shows thread A's application.

**Rows:** BL-737, BL-860, BL-923; memory cluster BL-310..339, 673, 689, 691, 784, 797, 861, 862 wherever the recall crosses a conversation.

---

## F4. "Autopilot, don't ask me" is stored as a standing instruction the model must obey every turn
**Symptom.** BR-084: "Saved: Autopilot: apply to anything fit >=80 … without asking me. I kept that as a standing instruction (S-001)." The person now believes autopilot is on, but no code implements autopilot. From then on, every turn's system prompt tells the model to follow "apply without asking me".

**Why-chain**
1. `remember_instruction` checks only that the quote appears in this message (T:98) and the length and dedupe rules (`memory.ts:49-59`).
2. Nothing checks what the instruction says. There is no list of instructions that cannot be kept: waiving approval, auto-submitting, sharing a resume without asking, passwords, LinkedIn automation.
3. `personBlock` injects every standing instruction as "they said these must always hold; follow every one" (`memory.ts:148-149`), and the prompt repeats it (`prompt.ts:179-182`). So the instruction overrides the "prepared for their approval" rule (`prompt.ts:190-191`) in the model's eyes on every later turn.
4. Code still holds the card gate for submissions. But `queue_applications`, `set_job_alerts` and `draft_outreach` are `write_own` and run without asking, so the model is now told to skip the one human check that exists before the card: which postings.
5. Root: D-007 is enforced on effects and not on memory. Memory is treated as data the person owns, but here it is control input to the model.

**Class:** DEPTH. **Severity:** med × policy breach and a false capability claim → **#4**.

**Evidence: VERIFIED.** R7 in `r_brain.out` kept `{"text":"Autopilot: apply without asking me","said":"and don't ask me"}`. Battery BR-084.

**Fix.** In `addStanding`, or the tool's `run`, refuse an instruction that waives approval or asks for a forbidden act. Use a code pattern list (`don'?t ask|without (asking|approval|checking)|auto(-| )?(submit|apply|pilot)|share my resume with|password|linkedin|indeed`). Throw "not kept: every application and message still needs your yes on its card". The model then says that and offers alerts plus a daily card, as the scenario expects.

**Fail-first test:** the BR-084 message → `remember_instruction` throws, and `memory.standing` stays empty.

**Rows:** BL-018, 446, 472, 509.

---

## F5. The claim check deletes correct answers and replaces them with a canned promise
**Symptom.**
- BR-062: "Is the SWE market bad right now?" → "I haven't actually done that yet: nothing was saved, set up or queued this time. Tell me again and I'll do it."
- BR-036: the shorter draft is replaced the same way.
- BR-042: "share my resume with your whole network" gets the same canned reply, which promises "I'll do it" for an act no tool can do and policy forbids.

**Why-chain**
1. `unbackedClaim` (L:53-66) runs regexes over every sentence. `alerts? (?:is |are )?(?:now )?(?:set|on|live|active)\b` matches advice like "Keep job alerts on…". `i(?:'ve| have)? (?:…|noted|…)` matches "As I noted earlier…".
2. `NEGATED` looks only before the match (L:58), so "Your alerts are live only once you say yes" counts as a claim.
3. On a hit, the model gets one rewrite (L:101-106). If any regex still hits, the whole reply is replaced with `CLAIM_UNBACKED_REPLY` (L:107), not just the offending sentence.
4. The replacement text itself asserts a future action ("Tell me again and I'll do it"). Code wrote that without knowing whether any tool can do it.
5. Root: a lexical guard stands in for a structural fact. The loop knows exactly which tools ran (`tool_calls`), but it checks the model's wording instead of making the reply's action statements come from code.

**Class:** DEPTH. **Severity:** high frequency in advice-heavy chats × wrong answer, plus a false promise → **#5**.

**Evidence: VERIFIED.** R4 in `r_brain.out`: four plain advice sentences flagged (`an alert set`, `something saved`). A two-reply market answer about alerts ends as `CLAIM_UNBACKED_REPLY`. The battery shows it three times.

**Fix.**
- Drop only the sentences that make the claim. Keep the rest of the reply.
- When nothing would remain, use a neutral line with no promise ("I didn't change anything this time.").
- Limit claims to first-person past or present-perfect verbs ("I've set…", "I saved…"), and exclude imperatives such as "keep/turn/set … on".

**Fail-first test:** the BR-062 reply, scripted as "Keep job alerts on for new grad roles" → the reply is returned unchanged. A sentence-level test: "Saved: X." with no write → only that sentence is removed.

**Rows:** BL-561, 574 (BR-062); BL-444, 445, 595, 622 (BR-036); BL-212 (BR-042); unsupported-claims BL-655, 658, 660, 663, 665, 811, 812, 818, 952 (the guard these rows motivated now misfires).

---

## F6. Chat replies and chat drafts invent facts about the person ("Excel", "React dashboards")
**Symptom.**
- BR-032: "Excel/finance club treasurer experience (confirmed …)". Excel was never said.
- BR-024: a cover letter claims "built React-based dashboards in coursework" and "used SQL daily".

The person copies the draft and sends it under their name.

**Why-chain**
1. D-007 is enforced in code at three doors: saving a fact (`factRefusal`, T:51-59), confirming it (T:40-46), and two output paths. Outreach drafts go through `outreachLock` (`career_outreach.ts:138-205`) and resumes through the tailor's truth check.
2. The free-text chat reply, which is where cover letters, recruiter emails and "which skills match" answers are written (`prompt.ts:177-178`), passes through no check. L:97-107 returns the model's text as-is, after the claim regexes only.
3. The prompt allows drafting "from what you know" with brackets (`prompt.ts:177-178`). The person block lists confirmed facts next to free advice (`memory.ts:164-167`), so the model blends inference ("treasurer" → Excel) into "confirmed".
4. Root: the fact lock was built per artifact (outreach, essay, resume), not at the one boundary every reply passes through.

**Class:** DEPTH. **Severity:** high × invented facts sent by the person → **#6**.

**Evidence:** READ (no reply-level check exists in L or H; verified by reading every return path, L:91, 99, 107, 133-134). The battery shows it (BR-032, BR-024).

**Fix.** At the end of `runAgentTurn`, run the existing `factLock` (essay_draft.ts, used inside `outreachLock`) on the reply. Sources: confirmed facts, this turn's message, the history's user turns and this turn's tool results. Run it on any sentence about the person (first person in a draft, or "you/your" plus a skill, title or employer). Give one rewrite instruction to bracket the untraced words.

**Fail-first test:** scripted reply "Your Excel skills from treasurer…" with confirmed facts lacking Excel → the final reply contains no unbracketed "Excel".

**Rows:** BL-144..154 (BR-032); BL-067, 068, 069 (BR-024); never-invent BL-210..221.

---

## F7. A slow turn: the person is told "couldn't answer" while the turn finishes and commits
**Symptom.** Over Telegram, WhatsApp or iMessage, a multi-tool turn (an outreach batch of 10 drafts, or a retried search) takes more than 120 s. The person gets "I couldn't answer that just now. Try again in a minute." The turn keeps running and commits. Its reply sits in history unseen, and its writes are done. The person resends, which runs everything again under a new turn key. If the first turn is still running, F1 also fires.

**Why-chain**
1. The bridge aborts at `AbortSignal.timeout(120000)` (`channel_runtime.ts:14`). Any throw becomes `CHAT_DOWN_REPLY` (CI:188-191).
2. agent-chat has no turn deadline:
   - The loop runs up to 6 model calls (L:77), each with a default 30 s timeout (MG:149). The handler passes no `timeoutMs` (H:440).
   - `draft_outreach` makes up to 10 more model calls, 5 at a time, each 30 s (T:542).
   - Before the brain, up to seven code-first stages hit the DB in sequence (H:319-391).
3. The aborted fetch does not cancel the edge function, so `persistence.commit` at H:516 still runs.
4. Root: no shared time budget between the bridge and the turn, and the reply is delivered only on the synchronous response. There is no "reply ready" delivery from the commit.

**Class:** BACKEND. **Severity:** med × lost reply and duplicate writes → **#7**.

**Evidence:** READ (timeouts and paths above; not reproduced against the network by rule).

**Fix.** Pass a deadline into `runAgentTurn`: `maxMs` about 90 s, with each `callModel` timeout set to `min(30s, remaining)`. When it expires, return the best final answer (see F9). Better: have `career_host_commit` enqueue the reply into `career_outbox` under the inbound key, so a late commit is still delivered, and have the bridge on timeout say "still working on it" instead of "couldn't answer".

**Fail-first test:** a model fake that sleeps, with `maxMs` → the turn returns before the deadline with a final reply, not `CHAT_DOWN_REPLY`.

**Rows:** none directly.

---

## F8. No model error is retried; one malformed tool argument ends the turn; the person silently gets the other brain
**Symptom.** One OpenAI 429 or 5xx, a timeout, or a tool call cut off by `finish_reason:"length"` (e.g. `set_job_alerts` with a long `floor`), and then:
- On the first step, or after reads only: the router answers instead, a different brain with different state (it never saw `profile.facts`). The reply has a different voice and often answers a different intent.
- After any write: "I saved what you told me, but the AI service stopped responding…". That is said even when the write was 3 queued applications or newly enabled alerts.

**Why-chain**
1. `callModel` throws on any non-2xx, timeout or network error, with no retry or backoff (MG:145-160).
2. `fromOpenAI` throws `bad_tool_call` for the whole response when any one tool call's JSON does not parse (MG:94). It does not drop that call or return it to the model as an `is_error` tool result.
3. The loop maps every throw to `model_error` (L:88-93). The handler swaps to `host.runTurn` when no write succeeded (H:455-457).
4. The `*_AFTER_SAVE` texts (L:36-37) name "what you told me" for any `write_own`, so they hide queued applications and alerts.
5. Root: errors are classified by origin (the model), not by whether they can be retried. The fallback switches brains rather than retrying the same step.

**Class:** BACKEND. **Severity:** med × wrong answer → **#8**.

**Evidence: VERIFIED.** R5 in `r_brain.out`: a truncated `arguments` string → `fromOpenAI threw bad_tool_call`, and the turn is `model_error`. A side finding: the error text reads "Financial model unavailable" (a finance leftover in `ModelUnavailableError`).

**Fix.**
- In `callModel` with role "chat": retry once or twice on 429, 5xx and timeout, honoring `retry-after`, capped by the F7 deadline.
- In `fromOpenAI`: turn an unparseable tool call into an `is_error` tool result ("your arguments for X were not valid JSON; call it again") instead of a provider failure.
- After-save replies should name what changed, using the tool names that ran (`queued N applications`, `turned alerts on`).

**Fail-first test:** model fake: 429 once, then text → the reply is the text and `stopped` is final. A bad JSON tool call followed by a good call → the turn completes.

**Rows:** router-fallback rows such as BL-001 ("router fell back").

---

## F9. The step limit throws away finished work, and there is no way to read a posting by its link
**Symptom.**
- BR-003, three pasted Greenhouse links: six `search_jobs` calls, then "I couldn't finish that in one go… Tell me which part to do first."
- BR-068, three asks: alerts set and a standing instruction saved, then "I saved what you told me, but couldn't finish the rest…". The person is not told that alerts are now on.

**Why-chain**
1. No tool reads a posting by URL. `get_posting` takes a `job_id` only (T:192-203), and `search_jobs` is keyword search (T:206-227). So a pasted link sends the model into a search loop.
2. At `max` steps the loop returns a canned string (L:132-134) and discards every tool result already in `messages`. It never asks the model for one final answer with tools off. `toOpenAI` already supports `tool_choice: none` (MG:74).
3. Root: a loop limit with no "finish" phase, plus a missing lookup by URL.

**Class:** DEPTH. **Severity:** med × useless reply and a hidden state change → **#9**.

**Evidence: VERIFIED.** `r_steps.out`: the first step found the posting, and the reply after 6 steps is the canned text. Battery BR-003 and BR-068.

**Fix.**
- On the last step, call the model with `tool_choice: {type:"none"}` and the turn so far, so it answers with what it has, says what is left, and names every change made.
- Add `get_posting_by_url`, resolving through `posting_key.ts` `postingKey(url)` against `career_postings`.

**Fail-first test:** a model that calls tools 6 times → the final reply is model text that names the found posting, not `MAX_STEPS_REPLY`.

**Rows:** BL-004, 492 (BR-003); BL-591 (BR-068).

---

## F10. History is reply text only: tool results vanish between turns, so ids and tool words leak, and "the first one" is searched again
**Symptom.** Replies contain tool vocabulary:
- `job_id` (BR-001)
- `greenhouse:copperlineinfra:4100016` (BR-021)
- "read with get_posting" (BR-008)
- `referral_map` (BR-041)
- `remote_ok: true` (BR-064, BR-090)
- `full_name` (BR-077)

On the next turn, "apply to the first one" makes the model search again, and the results may differ (relaxed query, new postings). So it queues a different posting.

**Why-chain**
1. The commit stores only `p_response->>'reply'` as the assistant message (SQLc:145). `agentMeta` keeps tool names, not results (H:461). `historyWindow` keeps string content only (`career_brain.ts:43-50`).
2. So job_ids, URLs and alert settings exist next turn only if the model printed them. The prompt simultaneously says "A posting you listed earlier… use its details" (`prompt.ts:157`) and requires `queue_applications` links "exactly as search_jobs returned them" (T:182). The model learns to print ids.
3. Tool results and errors speak to the model in schema words, and the model repeats them:
   - "give the posting's job_id from search_jobs" (T:380)
   - "search again for its job_id" (T:377)
   - "use only what search_jobs returned" (T:197)
   - raw JSON keys (`remote_ok`, `quiet_hours`, T:260)
4. No check on the reply stops tool names or snake_case keys (L:97-107). The prompt never forbids them (`prompt.ts` has no such line).
5. Root: no turn-to-turn working memory for structured results. The prose reply is doing two jobs: speaking to the person and carrying state for the model.

**Class:** BOTH. **Severity:** high × ugly, plus wrong postings → **#10**.

**Evidence:** READ for the history path. The battery shows 6 leaking scenarios (the `no_internal_vocab` check).

**Fix.**
- Persist the turn's last `search_jobs` list (job_id, company, title, url, rank) in `agentMeta.listed`, and put it back into the next turn's system block as "Postings you showed last turn: 1. …".
- Make `queue_applications` accept `{ n: 1 }` against that list.
- In the loop, strip or flag any tool name or input-schema key found in the final reply (the names are in `toolDefs`), and give one rewrite.

**Fail-first test:** turn 1 lists postings; turn 2 "apply to the first one" with no new search → queues turn 1's #1. A reply containing `job_id` is rewritten.

**Rows:** BL-001, 002 (BR-001); BL-009, 467 (BR-008); BL-210, 211 (BR-041); BL-623, 800..805 (BR-064); BL-871 (BR-090); BL-171, 363..459 (BR-077); copy-hygiene BL-768, 770..773.

---

## F11. Photos and files never reach the brain, yet the model is told to describe the photo
**Symptom.** In the web app, someone sends a screenshot of a posting with no text. The model is told "(The person sent only the photo above… Describe what it is…)" but receives no image, so it invents a description or asks oddly.

A related case: `contact_list`, `verify_contacts` and `draft_outreach` ask "Send me a CSV of the people you want to reach…" (T:61). Neither chat nor any channel can deliver a CSV to the brain, so the ask can never be answered.

**Why-chain**
1. `chatInput` parses images into `imageBlocks` and sets `message = PHOTO_ONLY` when there is no text (`chat_input.ts:5, 23`).
2. The handler calls `agentTurn({ message, … })` without `imageBlocks` or `attachments` (H:439-450).
3. `runAgentTurn` builds a text-only user turn (L:80). `toOpenAI` could send images (MG:62-64), but nothing hands them over.
4. `agentTurn` supports `attachments` and CSV import (`career_brain.ts:101-105`), but no caller passes them. The channels drop non-text messages (`telegram.ts:50`, CI:115).
5. Root: input plumbing stops at the handler. The capability exists in two layers but is wired in neither.

TRIAGE.md's document-ingest note ("reaches the model as 'this file type can't be read yet'") is wrong for this handler: nothing reaches the model at all.

**Class:** DEPTH. **Severity:** med × invented answer → **#11**.

**Evidence: VERIFIED.** R6 in `r_brain.out`: `imageBlocks parsed 1`, `model saw image block? false`.

**Fix.** Pass `imageBlocks` into `agentTurn` and add them to the user turn's content (L:80). Until then, when `imageBlocks` exist, send the router or agent a message that says the photo cannot be read yet, never `PHOTO_ONLY`. The prompts that ask for a CSV should say where to send one, or not ask.

**Fail-first test:** handler or `agentTurn` with one image → the model payload's last user message contains an `image` block.

**Rows:** BL-757, 794, 916 (document-ingest); BL-171, 363..368 (the CSV ask).

---

## F12. Cut-off and empty replies are delivered as answers; the "fixed" empty-reply guard is not on the live path
**Symptom.** A long draft ends mid-sentence ("In my internship I built"). An empty completion becomes an empty web bubble, or over a channel "I couldn't answer that just now". Either way the turn's writes are committed.

**Why-chain**
1. The loop never reads `stop_reason` (L:94-107). `fromOpenAI` maps `finish_reason:"length"` to `max_tokens` (MG:98), and the loop delivers the text anyway, including an empty string.
2. `MAX_TOKENS = 1200` (L:67), plus a 512 reasoning headroom (MG:41, 68), shared with reasoning tokens.
3. The commit accepts any string reply, `""` included (SQLc:82, `jsonb_typeof(p_response->'reply')='string'`).
4. Triage marks BL-352..354 FIXED-IN-TRUNK on `_shared/conversation.ts:188` (empty reply = failure). That `handleInbound` is not called by the live channel path: `channel_inbound.ts` imports only `fitOutbox` from it (CI:14), and turns go through agent-chat, which has no such guard.
5. Root: the guard was built in a parallel pipeline that is not the deployed one.

**Class:** BACKEND. **Severity:** low-med × ugly (and a misleading triage) → **#12**.

**Evidence: VERIFIED.** R3 in `r_brain.out` (truncated text delivered, `stopped: final`); `r_empty.out` (`{"stop_reason":"max_tokens","reply":"","stopped":"final"}`). The commit accepting `""` is READ.

**Fix.** In the loop:
- On `stop_reason === "max_tokens"`, continue once with "continue from where you stopped", or raise `max_tokens` for draft turns.
- On an empty reply, treat it as `model_error`.

Move the BL-352..354 verdict back to open.

**Fail-first test:** a scripted `max_tokens` reply → the final reply is complete or flagged. An empty reply → `stopped` is `model_error`.

**Rows:** BL-352, 353, 354 (verdict wrong for the live path).

---

## F13. A retried request with the same turn key runs the whole turn twice while the first is in flight
**Symptom.** The web client times out and retries with the same `turn_key`, as the 503 text tells it to (H:525), while the first attempt is still running. Both run every tool: two outreach batches saved, duplicate timeline events, and two model bills. The person sees one reply, because the second commit replays the first.

**Why-chain**
1. `career_host_load` returns a replay only once a receipt exists (SQLl:77-82). It writes nothing to reserve the key, so a second load during the first turn returns `replay: false`.
2. Writes made directly by tools are not keyed by the turn: `saveBatch` (T:552) and `recordEvent` (T:89-90). Queue and email are protected by their own keys, so they are safe.
3. Root: idempotency is enforced at commit, not at admission.

**Class:** BACKEND. **Severity:** low × duplicate writes → **#13**.

**Evidence: VERIFIED.** `race.out` step 4: two loads of key k6, both `is_replay: f`.

**Fix.** The same per-person lease as F1, keyed by `turn_key`. A second load with a live lease for the same key returns "in progress" (HTTP 409 `turn_in_progress`). The client polls for the reply instead of re-running.

**Fail-first test:** a load-load-commit-commit sequence on one key → the second load answers `turn_in_progress`.

---

## Mapping of the coordinator's five battery findings
1. Wrong-company, duplicate and current-employer queues → **F2** (root: T:180-190 trusts the model's picks; `career_apply_want.ts:30, 53` de-duplicates on posting key only; the tracker is per thread, F3).
2. The claim check replaced correct replies → **F5** (L:42-66 regexes, L:107 whole-reply replacement; it also promises "I'll do it").
3. Autopilot stored as an instruction → **F4** (T:94-106 and `memory.ts:49-59` have no content policy; `memory.ts:148` turns it into a command every turn).
4. Tool names leaked → **F10** (tool errors in schema words at T:197, 377, 380; raw keys in results; no reply filter; history drops structured results, so ids get printed).
5. "Excel" invented → **F6** (no fact lock on the chat reply; the lock exists only for outreach, essays and resumes).

## Where the brain or code claims something happened that did not
| Text | Where | Truth |
|---|---|---|
| "Nothing new was started." | H:525 | Tools may have written, or an email gone (F1) |
| "I couldn't answer that just now." | CI:190 | The turn may finish and commit later (F7), or have run its tools (F1) |
| "Tell me again and I'll do it." | L:41 | Promises acts no tool does, e.g. sharing a resume (F5) |
| "I saved what you told me…" | L:36-37 | Hides queued applications and newly enabled alerts (F8, F9) |
| "Saved: Autopilot…" | the model | No autopilot exists (F4) |
| Description of a photo | the model | It never saw the photo (F11) |
| "(confirmed)" Excel | the model | Not a confirmed fact (F6) |
