# v240 LIVE-FIX LANE — record

Branch `fix/v240-live-gaps`, base `integration/v2-candidate` @ 71e01ef6
(= deployed v240 = 566d622d + its deploy record, docs/gauntlet/566d622d.md).
Scope: gauntlet probes (h) watch FAIL, (i) memory FAIL, (j) doc-contract
PARTIAL, (f2) pool-window observation. No deploy (the owner words the fix
commit), no env changes, no live writes beyond the test user.

Guard for everything below: `tests/career-v240-live-gaps.test.cjs`
(Part 1: node harness world; Part 2: the real staged handler composed
exactly as deployed, remote services faked). Fail-first on the base
tree: 8 red (h×3, i×3, j(b), f2), controls green. Fixed tree: 11/11.

## The divergence question — answered

The brief's prime suspect was per-turn state carriage in
handler-career.ts: that the deployed handler loads/persists different
router state than Lane A's harness bridge (which had needed a patch
to carry `alertWatchState`). **Disproven for all three stateful
items.** Both gauntlet failures reproduce byte-for-byte on the node
harness path (Lane A's own guard world, unmodified career_host.js)
with the gauntlet's exact phrasings; and the deployed carriage checks
out in the SQL: `career_host_commit` upserts the watch profile from
the snapshot into `career_watch_kv`, `career_host_load` returns it as
`watchState`, and `stated_facts` rides the account patch (whitelist
incl. `stated_facts`, migration 20261016120000) — the gauntlet itself
proves both round-trips (probe (h)'s read-back counted the standing
watches; probe (d)'s MI-123 re-probe read the account-seeded offer
record in a fresh thread). **The real divergence is phrasing
coverage: Lane A's guards exercised the shapes the battery mined —
which are the shapes the dispatch gates and capture frames were
written for — and the gauntlet's natural phrasings sat outside them.**
Each item below names its exact gap.

## Item 1 — watch (probe h): FIXED

Mechanism: both watch-create dispatch gates in module 142 (the LF-02
early claim and the W4 block) enumerate ask shapes — "watch for",
"set up a watch", "create a watch", "start watching", "alert me
when/for", "notify me when", "let me know … opens", "tell me when …
opens". The gauntlet's "Watch data analyst roles for me." matches
none (verb-first imperative; "watch" is followed by the role, not
"for"), so no handler claimed the turn and containment answered.
Downstream was always sound: handleWatchCreate resolves "data
analyst" through module 152's curated splits (SOC 15-2051) — the
live profile's Data Analyst interest carries exactly that SOC.

Fix (142, both gate sites): the gate also admits the bare imperative
— sentence-initial "watch" + role words within the clause — with a
negative lookahead for "watch out" (advice-seeking, pinned by a
control). The manage claim still runs before create at both sites,
so "stop watching X" is never read as a new watch (pinned).

## Item 2 — memory (probe i): FIXED (two composing misses)

(a) Capture: `captureStatedFacts`' keyed frames (recruiter contact /
hiring manager — the only users of the PERSON pattern) required a
2–3-token name (`[A-Z][a-z]+(\s+[A-Z][a-z]+){1,2}`). "Dana." is one
token, so the statement captured nothing, `_factsAddedThisTurn`
stayed empty, the bare-fact reply handler had nothing to speak, and
the turn fell to containment. Fix: the PERSON continuation is now
{0,2} — the frames are explicit ("recruiter contact at <Co> is ___")
and each is gated by `asserted()` (BUG-169), so the one-token value
slot is safe; a question still records nothing (pinned).

(b) Recall: `handleConversationRecall` covered first-thing,
interview-day, and "what do you remember/know…" shapes only. "Who is
my recruiter contact at Northwind Ledger?" matched none and fell to
company_intel, which owns bare company mentions. Fix: a new branch
(d) for the direct keyed question ("who is my recruiter contact /
hiring manager (at <Co>)?") that claims ONLY when a fact of the
asked kind resolves — keyed to the named company, or the single
keyless fact when the named company is the record's own target firm
— and otherwise returns null, preserving intel ownership and the
CB-0443 early-claim discipline (pinned: with nothing recorded, the
who-ask invents no name). The read-back names the company as the
user wrote it in the ask (fact keys are stored lowercased for
matching).

## Item 3 — doc contract (probe j): (a) CORRECT, pinned; (b) DEFECT, FIXED

(a) Correct behavior, now pinned by guard on the staged handler:
with no confirmed facts, the tailor ask answers `career_tailor`
naming the one missing input ("Paste your resume…"), and "Send me
the PDF as a file in this chat." answers `career_document_delivery`
with the honest no-document reply; `channel_artifacts` stays empty.
The producing chain (confirmed facts → tailor → PDF bytes →
artifacts row, sha = the bytes' own hash → byte-identical
re-delivery) is proven end-to-end on the staged handler in the same
guard (it was previously proven at tier 2 by the composition probe
S4 on this tree's lineage).

(b) The defect: the paste step of the product's own instructed
journey was unrouted. No dispatch claimed a pasted resume (122's
ingest was reachable only through module 154's API in tests), so the
gauntlet's paste fell to company_intel (harness: the "Kubernetes"
skill word read as a company) / tracking_status (live account
state) and the profile was never built. Fix (142): a resume-paste
claim in the early dispatch zone — a long, sectioned paste that
122's `classifyResumeIngest` accepts and `parseResumeText` reads
as ≥3 facts across ≥2 kinds incl. experience/education is ingested
via `ingestResume` (facts land as DRAFTS, 122's law untouched;
posting-shaped pastes stay with capturePastedPosting, which runs
first and marks the turn; email-shaped pastes stand down). The
reply is the ingest receipt + the confirmation ask.
`handleTailorNeedsFacts` now records the target it names
("The target is set" becomes true state in the thread mirror), and
a confirmation claim ("yes, that's my resume" — short affirmation
turns only) confirms the ingest drafts and runs the standing
tailor target in the same turn: the document rides the reply,
materializes into `channel_artifacts`, and a later delivery ask
serves the same bytes.

### Test-account seeding steps for the next live gauntlet (probe j completion)

Preferred — seed through the product path itself (no DB writes):
1. Fresh thread on the test account. Send CB-0495 verbatim
   ("Tailor my resume for the Product Manager role at Natera and
   send me the PDF as a file in this chat.") → expect
   `career_tailor`, the needs-facts reply.
2. Paste the test-persona resume verbatim
   (`packages/career-data/fixtures/test-resume.txt`) → expect
   `career_resume_ingest`, a receipt naming the draft counts.
3. Send "Yes, that's my resume." → expect `career_tailor` with a
   document produced: the reply carries `artifacts[0]`
   {kind:"document"} and a `channel_artifacts` row exists for
   (test user, thread) whose sha256 equals sha256 of the decoded
   bytes_b64 and whose bytes start with %PDF.
4. Send "Send me the PDF as a file in this chat." → expect
   `career_document_delivery`; a second `channel_artifacts` row
   with the SAME sha256 (byte-identical re-delivery).

Fixture shortcut (only if a pre-confirmed profile is wanted
without the paste journey): write a 122-shaped profile into the
thread's `agent_flow_state.state.career.stores.profile` for the
test user/thread with every fact carrying
`needs_confirmation: false` (shape: the pool-loader guard's
SNAPSHOT_PROFILE in tests/career-pool-loader.test.cjs), then
CB-0495 tailors in-turn. This seeds state directly — it proves
the tailor→artifact half only, never the paste journey.

Why the v240 gauntlet could not produce the PDF: the test
account's profile carried no confirmed resume facts the tailor
can run on, and the completion attempt's paste was misrouted
(the (b) defect above) — not a renderer or store failure.

## Item 4 — pool window (probe f2): FIXED

Mechanism: Lane E's loader makes ONE bounded read (600 rows,
posted_at desc) — that window is the whole in-turn pool, and named
resolution searches only it. The Gusto posting sits in
`career_kb_postings` with 1,736 rows newer, so the named ask got
the honest served-list stop for a KB-held role.

Fix, inside the loader's contract: `career_pool.js` gains
`loadTargeted({company, role})` — a second read of the same table
through the same `readRows` spec, now carrying an optional
`filters` entry (company ilike), bounded at 50, mapped identically
(fetched_on carried; TN-1a intact; never throws — a failed read
yields an empty supplement). handler-career.ts binds the filter
to its PostgREST query and, when the router's OWN
`namedRoleTargetOf` (newly exported from 142 — no second parser)
says the turn names a company, merges the targeted rows into the
turn's postings by job_id. Guard: the owner's Gusto sentence
verbatim against a KB whose window excludes Gusto → targeted read
fires, intent `career_batch_apply`, stop BOARD_NOT_WIRED, company
committed exactly "Gusto"; with the targeted read failing, the
same turn degrades to the honest named stop (pinned).

## Measurements

- Guard: tests/career-v240-live-gaps.test.cjs — fail-first on
  71e01ef6: 8 red (h create, h read-back, h manage-chain, i
  capture, i recall, i witness, j(b), f2), controls green; fixed
  tree: 11/11 (10 harness tests + the staged-handler respawn unit;
  its 5 inner tests green under --experimental-vm-modules).
- Neighbor suites: Lane A depth guard, named-role-capture,
  pool-loader, document-delivery, depth-memory — 61/61.
- Node sweep (node --test tests/*.cjs): fix tree 4,519 tests /
  4,465 pass / 13 fail / 41 skipped vs the pristine candidate
  baseline run same-machine in the v2-candidate worktree
  (71e01ef6): 4,508 / 4,454 / 13 / 41. Delta exactly +11 tests /
  +11 pass = the new guard; the failing test-NAME set is identical
  (the documented pre-existing 13).
- Edge suite (deno test -A --no-check tests/edge/): 765 passed /
  0 failed — identical to the 566d622d baseline.
- agent100 dry run: 103/103. Router bundles rebuilt both modes;
  --check clean.
- Registry: BUG/FR-PENDING-ALLOCATION (v240-watch-gate),
  (v240-contact-capture), (v240-contact-recall),
  (v240-resume-paste), (v240-pool-window) rows appended to
  docs/bug-ledger.md + docs/career/forbidden-rules.md — numbers
  requested from Crew A per MI-093, none self-allocated.

## Exact live re-gauntlet script (run after the owner words this commit's deploy)

Preconditions: fix commit deployed as agent-chat (record the new
version); test user `gauntlet-test@upmore.test`; rate-limit window
reset for the test user if needed; worker env still unset (every
apply stop below is BOARD_NOT_WIRED by design).

(h) Watch — fresh thread:
1. "Watch data analyst roles for me." → expect intent
   `career_watch_create`, NOT contained; reply names the Data
   Analyst watch.
2. "What am I watching now?" → expect `career_watch_manage`;
   reply names the Data Analyst watch (and any pre-existing ones).
3. DB: `career_watch_kv` row `career:watch-profile:<test user>`
   contains an interest whose role is Data Analyst, SOC 15-2051,
   created by these turns.

(i) Memory — fresh thread, then a second fresh thread:
1. "My recruiter contact at Northwind Ledger is Dana." → expect
   NOT contained; a recorded acknowledgment.
2. DB: the account record (`career_watch_kv` key `career:account`
   → stated_facts) holds recruiter_contact keyed to Northwind
   Ledger with value Dana.
3. Fresh thread: "Who is my recruiter contact at Northwind
   Ledger?" → expect `conversation_recall`; reply names Dana at
   Northwind Ledger; NOT `company_intel`.

(j) Doc — per the seeding steps above (turns 1–4 verbatim),
asserting the two `channel_artifacts` rows and the sha equality.

(f2) Named role beyond the window — fresh thread:
0. Precondition check: the Gusto Finance Intern (Summer 2027)
   posting (boards.greenhouse.io/gusto/jobs/8257115) is present
   in `career_kb_postings` and >600 rows are newer than it.
1. "I want to apply to the Finance Intern (Summer 2027) role at
   Gusto. The posting is on Greenhouse. Please handle the
   application for me." → expect `career_batch_apply`; reply
   contains "Stopped — Gusto: BOARD_NOT_WIRED"; reply does NOT
   contain "not in the list I can work from".
2. DB: the thread record's namedApply company is exactly "Gusto".

Fallback expectation across all four probes: zero contained
turns.


## Deploy + live re-gauntlet — 49b7ae36 as agent-chat v241 (2026-10-20, deploy lane 2)

Owner's deploy word on this exact commit: 2026-10-20 09:11 CDT ("Deploy
49b7ae36 now"), covering merge + deploy + gauntlet + record per his
2026-10-16 ruling. Project: upmore only (`mrwngntwmnaqrqhupvlt`).

### Merge + deploy

- `integration/v2-candidate` fast-forwarded 71e01ef6 → **49b7ae36** and
  pushed (ls-remote verified at 49b7ae367bdd…).
- **agent-chat v241 ACTIVE**, verify_jwt=true. Staged from the 49b7ae36
  tree via the prune-lane recipe (`stage-graph.cjs`, entry
  `agent-chat/index-career.ts` → `agent-chat/index.ts`, mode all-js):
  12 files, 3,465,810 B (v240's stage: 3,457,882 B; delta = the fix).
  All staged .js pass `node --check`; file shape identical to the v240
  stage. Fix markers verified in the staged bundle before deploy:
  `loadTargeted` in `_shared/career_pool.js` and bound in
  `handler-career.ts`, `namedRoleTargetOf` in handler + career bundle,
  `career_resume_ingest` in `router_core.career.js`. Stage kept at
  `~/workspace/prune-lane/stage-49b7ae36`. Deployed with the /tmp sb.py
  copy (entrypoint `agent-chat/index.ts`).
- **No migration, no channel-function deploys, no env changes** —
  telegram-inbound v3 / whatsapp-inbound v3 untouched; worker env
  still unset by design (BOARD_NOT_WIRED stops below are correct).

### Live re-gauntlet (test user, magic-link JWT; rate window reset first)

Measurement note: the egress proxy severed several responses and the
client retried; Probe D's second turn executed 3× server-side (the
thread holds 4 user + 4 assistant rows; all three draft executions are
`outreach_draft`). One runner's /tmp progress file was lost to a VM
/tmp reset mid-lane; every turn below was recovered from the product's
own `agent_messages` + DB state, the same recovery as the v240 record.
Contained-turn expectation (zero) was **not** met — see (j).

#### Regression subset (from the v240 gauntlet)

- **(a) Probe D: PASS.** Fresh thread `bd3d9cd0`: campaign ask →
  `outreach_clarification`; "Draft the first email for me." →
  `outreach_draft`, the campaign's first email ("Subject: Sophomore
  interested in healthcare consulting firms — 15 minutes? … held as a
  sample, sending nothing"). SQL check across all assistant rows in
  the thread: zero counter / "$52" / signing-bonus content.
- **(d) MI-123 re-probe: PASS.** Fresh thread `382f9b15`, "I got an
  offer! Help me negotiate a higher salary." → `tracking_status`:
  "Noted — a offer landed. … I will not guess a company onto it. Name
  the company and the row moves in the same turn, from your words."
  No figure narrated as stated; no company invented. Context verified
  by SQL: unlike the v240 run, the account record (`career:account`)
  holds **no $85,000 offer text at probe time**, so no earlier-record
  reference was owed — the safety property (never adopt an inherited
  figure, never guess a company) holds on the surface either way.
- **(b) TN-1a: PASS.** Thread `9794bacd`, intent
  `intent_prior_application`, the same honest reply as v240; no
  company invented.
- **(e) Discovery: PASS.** Thread `f54e1ecf`, `career_discovery`:
  real KB roles served (Accounting Manager, Tokenized Equities at
  coinbase; Senior Technical Account Manager at affirm; Group Product
  Manager at reddit…).

#### (h) Watch: **PASS** — the v240 failure is closed live

Fresh thread `06eda668`. "Watch data analyst roles for me." → intent
`career_watch_create`, reply "Watch set: Data Analyst. Watching: Data
Analyst — any location + remote. …" — NOT contained. "What am I
watching now?" → `career_watch_manage`, naming the Data Analyst watch
first among the 2 standing watches. DB proof: the
`career:watch-profile:<user>` Data Analyst interest's `created_at` is
**2026-10-20T14:16:58.521Z** — this turn's own second (its pre-run
value was 2026-10-20T12:26:18Z from an earlier unattributed write) —
SOC 15-2051, and the profile's `updated_at` advanced to 14:17:27Z.

#### (i) Memory: **FAIL** — the statement turn now dies at the save, reproducibly

"My recruiter contact at Northwind Ledger is Dana." was attempted
**three times** and never landed once:

1. Scripted run (fresh thread): **HTTP 503**,
   `{"error": "storage_unavailable", "reply": "I could not confirm
   that your career reply or changes were saved. Retry with the same
   request key; do not repeat an uncertain external action."}`,
   thread_id null.
2. Fresh retry (new runner, same message): **HTTP 503**, identical
   body, `turn_key` `d78a676c-eb69-4c92-beca-2d1cef9965ad`.
3. The product's own prescribed recovery — retry **with that same
   turn_key** in the request body: **HTTP 503** again, thread null.

SQL after all three attempts: no user message for this sentence
exists in `agent_messages` from today (the only row is the v240
gauntlet's, 13:27:36Z), and `career:account` → `stated_facts` holds
**no Dana / Northwind Ledger / recruiter fact** (baseline before the
run was likewise empty). The recall turn therefore routed
`company_intel` in both fresh threads (`65d926df`, `448b6c09`) —
"Northwind Ledger has no company file yet…" — since there was
nothing to recall.

This is sharper than the v240 failure, and different in kind: on v240
the turn executed and fell to containment; on v241 it **never
commits**. Other write classes committed fine in the same minutes
(tracker assertion, watch create, resume ingest, batch state), so
storage itself is up; the failure is specific to this turn's write
path. Hypothesis for the fix lane (evidence-backed, not established):
on v240 the statement captured nothing (the 1-token PERSON miss), so
the turn had no account write to confirm; the fix makes the capture
succeed in-router, and the account-patch commit carrying the new
keyed fact is what now fails storage confirmation. Replay = the
three attempts above; the turn_key is spent — a fresh statement is
the clean replay.

#### (j) Doc contract: **FAIL at step 3** — ingest is live; the confirmation claim never fires

Thread `5a589101`, verbatim script:

1. CB-0495 → `career_tailor`, the needs-facts reply. **PASS** (as
   v240).
2. Verbatim paste of `packages/career-data/fixtures/test-resume.txt`
   → `career_resume_ingest`: "Your resume is on record — as drafts,
   awaiting your word. I read it as **15 facts (1 education, 2
   experience, 2 project, 1 leadership, 9 skill)** — every one is
   held as a DRAFT on your profile, not yet confirmed… Say "yes,
   that's my resume" and I confirm them and tailor for the Natera
   role in the same turn." **PASS — new live proof**: the resume-paste
   claim the fix added works on the deployed product.
3. "Yes, that's my resume." → stored intent `career_fallback`, reply
   "I didn't catch that. Try naming the job, company, or person — or
   say 'find jobs' and I'll start there." (single stored execution).
   **FAIL.**
4. "Send me the PDF as a file in this chat." →
   `career_document_delivery`, the honest no-document reply —
   consistent with no document existing. `channel_artifacts` for the
   test user: **0 rows before → 0 rows after** the whole sequence.

Post-script diagnostic (extra turn, same thread, does not change the
grade): the product's own j2 reply prescribes the affirmation in
lowercase with no period, so the diagnostic sent exactly
`yes, that's my resume` — it **also** landed on `career_fallback`
with the same contained reply. Case/punctuation sensitivity is
therefore NOT the mechanism: the confirmation claim does not fire on
the deployed path in either phrasing, while the fix lane's guard
proves it on the staged handler. The live-vs-staged divergence for
this claim is the open question for the next fix lane (the state the
claim reads — the thread's ingest-draft/target mirror — is the first
place to look). The artifacts[0] / sha-equality / byte-identical
re-delivery half of the contract remains proven at tier 2 only.

#### (f2) Gusto beyond the window: **PASS** — the targeted lookup is live

Precondition re-verified by SQL: the Gusto posting
(`job-boards.greenhouse.io/gusto/jobs/8257115`) is in
`career_kb_postings` with **1,736 newer rows** — outside the 600-row
window. Fresh thread `cc8bb562`, the owner's sentence verbatim →
intent `career_batch_apply`, reply "Found 1 Finance Intern (Summer
2027) roles. 1 were eligible; I took the 1 you named. **Stopped —
gusto: BOARD_NOT_WIRED** — no board adapter is wired for this
posting's family in this run." The reply does NOT contain "not in
the list I can work from" (the stop line carries the company's
lowercase slug — the product's consistent shape, cf. v240's
"Stopped — natera:"; the script above quoted the display casing).
DB proof, two surfaces: the thread state's `namedApply` is exactly
`{"role": "Finance Intern (Summer 2027)", "company": "Gusto"}` (and
"Gusto. The" appears nowhere in the state), and the batch record
shows the posting selected **by its real URL**
(`https://job-boards.greenhouse.io/gusto/jobs/8257115`) —
discovered → screened (1 eligible) → stopped BOARD_NOT_WIRED,
submitted 0.

### Score

Regression subset: **4/4 PASS** (Probe D, MI-123, TN-1a, discovery).
Re-gauntlet: **(h) PASS · (f2) PASS · (i) FAIL · (j) FAIL at the
confirmation step** (steps 1–2 pass; the resume-paste ingest is newly
proven live). Fallback tally across the scripted turns: exactly one
contained turn (j3) plus (i)'s three 503s, which never reached a
reply surface. Two of the four v240 defects are closed live on the
exact deployed commit; (i) regressed in kind (executes-but-contained
→ never-commits 503) and (j)'s confirmation claim is a live-vs-staged
divergence — both recorded verbatim above for the next fix lane
under Crew A allocation. No fix attempted in this lane; no rollback
(v241 is strictly better than v240: (h) and (f2) closed, (j) ingest
gained; (i)'s 503 replaces a contained reply for the same turn class,
and every other surface is unchanged or better).

### Not done by this lane (by design)

- Worker flip — env untouched; BOARD_NOT_WIRED remains the honest
  stop until the owner's host decision lands.
- (i)/(j) fixes — recorded, not attempted (fix lane's, per bug law).
- Rollback, if ever ordered: `~/workspace/prune-lane/stage-566d622d`
  restores the v240 tree; `stage-75ccf5f5` restores v238.
