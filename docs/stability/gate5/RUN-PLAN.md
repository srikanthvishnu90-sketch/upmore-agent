# Gate 5 — Live Evidence (E3) Run Plan — PREPARED, NOT FIRED

Status: **PREPARED ONLY.** Nothing in this package has been run against any live
service, and nothing in it can run without the owner's per-run go-ahead token
(see §2). This lane prepared; it did not connect, send, deploy, or execute.

Governing spec: `docs/quality-spec/05-RELEASE-GATES-AND-OPERATING-RULES.md`
Part 1, Gate 5, and Part 4 (the never-list). Where this plan and the spec pack
disagree, the spec pack wins.

> **Gate 5 (verbatim substance):** This requires the owner's explicit go-ahead
> for each run. Use a sandbox mailbox and calendar owned by the founder, with
> recipients restricted to an allowlist of the founder's own addresses. Prove
> end to end: connect → self-test email and event → a 5-person campaign to
> allowlisted addresses → a reply → suppression → kill switch. This gate may
> never send to real third parties.

---

## 1. Accounts, allowlist, and hard boundaries

### 1.1 Sandbox accounts (named by role, never guessed into configs)

| Role | What it is | Who acts |
|---|---|---|
| Sending mailbox | **The founder's own Gmail** — the mailbox the career OAuth grant (`google_career`, scopes in `packages/domain/120-career-access.js`: `gmail.readonly` + `gmail.send` + `calendar.freebusy` + `calendar.events`) is connected under | Founder connects it himself via the secure connect link (his consent tap) |
| Sandbox calendar | **The founder's own Google Calendar**, under the same grant | Same consent tap |
| Test user account | A staging test account on the staging surface only (never a production account) | Owner creates/approves it |
| Recipient inboxes | The founder's own addresses only (see allowlist) | — |

No address is written into any config file by this package. The runner takes
the staging surface URL and the test-user credential from the environment at
run time (same pattern as `evals/gauntlet/run-live.cjs`: `UPMORE_CHAT_URL`,
`UPMORE_TEST_JWT`), and neither value is stored in the repo (R-F1).

### 1.2 The allowlist — exact, closed, and enforced in code

The ONLY permitted recipients for every send in a Gate 5 run are the founder's
own two addresses, both already on the program record:

- `srikanthvishnu90@gmail.com`
- `vishnusrikanth8@gmail.com`

The "5-person campaign" is a **self-test campaign**: five sends, each addressed
to one of these two inboxes, each wearing one of the five test-persona hats
defined in the campaign drafts (`~/workspace/your_files/review/gate5-drafts-staging.md`,
appended to the master email doc by the coordinator at integration). There are
no other recipients. There is no "just this once" fifth-party address.

Enforcement is not a promise in this document — it is code:
`run-gate5.cjs` hard-codes this allowlist, checks **every** recipient before
**every** send step, and aborts the whole run (exit code 4, no send attempted)
if any recipient is outside it. Editing the allowlist requires editing the
script, which requires a new commit and a new owner go-ahead.

### 1.3 Never-list for this run (spec `05` Part 4, applied)

- No sends to anyone outside §1.2. Ever. A request to widen the list mid-run
  ends the run; a widened list is a new plan, a new review, a new go-ahead.
- No deploy is part of this run. The staging deploy (§5, D-1) happens before
  the run, by the owner/Codex lane, and is not authorized by a Gate 5 go-ahead.
- No touching `main`, no touching the live finance database or the live
  finance product (the live `agent-chat` handler is the finance product —
  Gate 5 runs against the **staging surface only**).
- No spending, no account/org setting changes, no reading/printing/moving
  secrets. Credentials arrive via environment at run time and are never
  written to the evidence log (the log records presence, never values).
- No loosening any cap, confirmation, or `01` rule to make a step pass. If a
  step conflicts with `01`, the step is wrong and the run reports it.

---

## 2. The go-ahead token — how a run is armed

The runner is **technically incapable of a live run** without the owner:

1. Every live step is gated behind `--owner-go <token>`.
2. The token's value is **not in this repo, not in this plan, and not chosen
   by this lane.** The owner invents a fresh token per run and supplies it
   twice, out of band: once as the `--owner-go` argument and once as the
   `GATE5_OWNER_GO_TOKEN` environment variable. The script requires both to
   be present and to match. A token from a previous run is not reused (the
   evidence log records only a hash prefix of the token, never the token).
3. Without a matching pair, the script exits (code 3) **before any network
   call** — before the preflight read, not just before sends.
4. `--explain` is the only mode that runs without the token: it prints this
   plan's sequence and exits 0, performing no network I/O of any kind.
5. The go-ahead covers **one run, this sequence, this allowlist.** It does
   not authorize a re-run, a partial re-run of failed steps against a
   different surface, or any send outside the sequence.

---

## 3. The sequence — steps, evidence, pass criteria, abort conditions

Global abort conditions (any one ends the run immediately, state left as-is,
evidence log preserved and reported):

- **A-1** Any recipient about to be used is outside the §1.2 allowlist.
- **A-2** The surface answers on a non-staging URL, or the test account
  resolves to a non-test / production identity.
- **A-3** Any step's reply claims success the state/artifact check cannot
  confirm (R-C4). The run stops; it does not "note and continue."
- **A-4** A secret-shaped value appears in any reply, log line, or artifact
  (R-F1). Stop, do not copy it anywhere, report its location only.
- **A-5** The bounce breaker trips during the campaign step (C-2 default:
  5% bounce rate per wave, or 3 hard bounces in a row, whichever first).
- **A-6** The owner says stop, in any wording, at any point. Also the
  in-product kill switch (§3.7) is itself a step — if it does not work,
  that is a FAIL verdict for the gate, not a reason to improvise a manual halt.

### Step 0 — Preflight (read-only)

- **Does:** confirm the staging surface URL is set, the test credential is
  present (value never logged), the owner-go pair matches, the allowlist in
  the script equals §1.2, and the evidence directory is writable.
- **Evidence artifact:** `evidence/step-0-preflight.json` (surface host only,
  no credential values, allowlist as checked, token hash prefix, timestamp).
- **Pass:** all checks true. **Fail/abort:** any check false → exit before
  any network call.

### Step 1 — Connect (F9 / `access.connect`, SC-286 shape)

- **Does:** drive the staging chat path: ask to connect Gmail + Calendar in
  one consent; the product must return the **secure connect link** (its
  absence is the known SC-286 regression — S1). The founder completes the
  consent on his own account (his tap; the runner waits and never holds his
  Google credential).
- **Evidence artifact:** `evidence/step-1-connect.json` — the verbatim ask,
  the verbatim reply, the connect link as rendered, the post-consent
  connection record (provider, scopes = the four career scopes, connected_at).
  Screenshot of the rendered card if the surface provides one.
- **Pass:** link present in the reply; after consent, the connection record
  shows scope set `career` (send + events present, per `120-career-access.js`
  `scopeSet`); connected accounts list shows ONE Gmail entry and Calendar via
  the same grant (no duplicate-account regression).
- **Abort:** no link in reply (record as the SC-286 defect, stop — do not
  hand-construct an OAuth URL); scopes partial; consent lands on any account
  that is not the founder's own sandbox mailbox.

### Step 2 — Self-test email (F9 doorstep: connection record + self-test result)

- **Does:** immediately after connect, the product sends its self-test email
  to the founder's own connected address and verifies it landed.
- **Evidence artifact:** `evidence/step-2-selftest-email.json` — message ID,
  from/to (to must be allowlisted), subject, send timestamp, inbox-arrival
  verification (the message observed in the inbox via the read scope, not
  merely "send returned 200").
- **Pass:** arrival verified in the inbox; the product's reply states the
  proof it actually has (message ID + arrival), nothing stronger (R-C4).
- **Abort:** send accepted but no arrival within the wait window → the step
  is FAIL (UNCONFIRMED), run stops; never re-send in a loop.

### Step 3 — Self-test calendar event

- **Does:** the product creates one clearly-labeled self-test event on the
  founder's own sandbox calendar (title prefixed as a Gate 5 self-test, 30
  minutes, no attendees other than the founder's own addresses — inviting
  anyone else would breach §1.2).
- **Evidence artifact:** `evidence/step-3-selftest-event.json` — event ID,
  calendar, start/end, the read-back of the event via the calendar scope.
- **Pass:** event read back with matching fields; the reply's claim matches
  the read-back exactly.
- **Abort:** event created but not readable, or read-back fields differ →
  FAIL, stop.

### Step 4 — The 5-recipient self-test campaign (F1)

- **Does:** build the campaign from the five staged drafts
  (`gate5-drafts-staging.md`): five persona-hat sends, recipients drawn only
  from §1.2. The full F1 doorstep must exist **before** any send: list record
  (selected 5 / reserve 0 / excluded 0, honestly reconciled), the drafts, and
  the **safety-plan card** rendered and approved by the owner for this exact
  batch (R-A1/R-A2 — editing any draft after approval voids that item's
  approval and it does not send). Caps per the standing defaults:
  - Daily cap: **12/day ramp start** (conflict C-1 default — the lower value;
    this campaign's 5 sends sit under it, and the card must show the math).
  - Per-firm cap: **15 per firm per rolling 30 days** (R-B2). All five
    persona hats are the founder himself at five fictional-for-the-test
    firms, so no firm count exceeds 1 — the card states this plainly rather
    than pretending these are five real firms.
  - Bounce breaker: **5% per wave or 3 hard bounces in a row** (C-2 default)
    pauses the campaign; no auto-resume (R-B5).
  - Risky-address cap: 10% (R-B6) — both allowlisted addresses are the
    founder's own verified inboxes, so inferred addresses = 0; the card
    says so.
  - Deliverability: R-B7's seed-inbox placement test is satisfied by
    construction here (the seed inboxes ARE the recipient inboxes) — the
    card states this as the Gate 5 sandbox substitution, not as a general
    waiver; a spam placement on any of the five sends is still abort A-5
    territory for later waves (there are no later waves in this run).
  - Stop rules on the card: one-tap halt ("stop everything" and close
    paraphrases, R-A4), the bounce breaker above, and owner abort A-6.
  Then, and only after the card approval is recorded, the five sends fire —
  each preceded by the runner's own allowlist re-check.
- **Evidence artifact:** `evidence/step-4-campaign.json` — the list record,
  the safety-plan card verbatim, the approval event (who/when/what batch
  hash), per-send records (draft ID, recipient, message ID, timestamp), and
  the sink-side count reconciled against the card (5 = 5).
- **Pass:** exactly 5 sends, all to allowlisted addresses, all matching the
  approved batch byte-for-byte; counts reconcile; no send precedes approval.
- **Abort:** any mismatch between approved and sent bytes (that item does
  not send; if it already did, that is an S0 — stop everything and open the
  incident path, §6); cap math on the card wrong; approval missing.

### Step 5 — A reply (F3 / `reply.handle`)

- **Does:** the founder, from one of his own inboxes, replies to one campaign
  email with an ordinary interested reply (e.g. agreeing to the proposed
  time). The product must classify it as a reply (not OOO — R-B10), count it,
  and surface it with the stage change stated before → after with its source
  (F3 contract).
- **Evidence artifact:** `evidence/step-5-reply.json` — the reply message ID,
  its classification, reply count before/after, the product's verbatim
  reply-handling bubble, the log/timeline write it produced.
- **Pass:** reply counted exactly once; stage change stated with source =
  inbox; no follow-up is sent in response without a new approval.
- **Abort:** reply counted as OOO or ignored; a follow-up leaves without
  approval (S0 path, §6).

### Step 6 — Suppression proof (R-B3)

- **Does:** the founder, from the *other* allowlisted inbox, replies to its
  campaign email with an opt-out ("stop — please don't email me"). The
  product must: suppress that address permanently and globally, remove every
  queued item to it, and report the count already sent to it. The runner then
  attempts one further enqueue to that same address through the product path
  and requires a rejection (`suppressed`).
- **Evidence artifact:** `evidence/step-6-suppression.json` — the opt-out
  message ID, the suppression record, queued-items-removed count, the
  product's verbatim report, and the transcript of the blocked re-enqueue
  attempt (the rejection is the evidence — the attempt must not send).
- **Pass:** suppression recorded; 0 queued items remain for that address;
  re-enqueue rejected as suppressed; already-sent count reported truthfully
  (1 for that address in this run).
- **Abort:** re-enqueue accepted or sent (S0 — §6); suppression applied to
  the wrong address; the *other* (non-opted-out) address also suppressed
  without cause (over-suppression is a FAIL for this step, recorded, run
  stops).

### Step 7 — Kill-switch proof (R-A4, SC-300 shape)

- **Does:** with the campaign's remaining queue state known and recorded
  (sent / in-flight / queued counts captured first), the founder says
  "stop everything" in the product chat. The product must halt every queue
  within one tick, set the global user pause flag, and report
  sent / in-flight-unconfirmed / halted counts that **reconcile to the queue
  total**. The known SC-300 failure ("halted nothing") is the exact defect
  this step exists to catch — a reply claiming a halt with no queue-state
  artifact is a FAIL, never a PASS (R-C4).
- **Evidence artifact:** `evidence/step-7-killswitch.json` — queue state
  before, the verbatim ask, the verbatim reply, queue state after, the pause
  flag state, and the reconciliation arithmetic shown explicitly
  (sent + in-flight + halted = total).
- **Pass:** all non-sent items halted; pause flag set; counts reconcile;
  a subsequent send attempt in the same run is refused while paused.
- **Abort:** counts do not reconcile; any queued item still sendable after
  the halt; reply claims a halt the state read cannot confirm (S0-adjacent
  false-completion — record verbatim, stop, §6).

### Run close-out

- The runner writes `evidence/RUN-SUMMARY.json`: per-step PASS/FAIL with its
  artifact path, the build SHA of the staging surface as reported by the
  surface (or "not reported" — never guessed), timestamps, and the abort
  reason if any.
- The human run report follows the spec's Part 3 format and lands at
  `docs/stability/runs/<date>-<shortsha>.md`, generated from the evidence
  records, never hand-typed numbers.
- A Gate 5 PASS requires **all seven steps PASS in one run.** A partial run
  is reported as what it is; steps are not cherry-picked across runs.

---

## 4. The runner (`run-gate5.cjs`, beside this plan)

Prepared, syntax-checked (`node --check`), and verified only in `--explain`
mode by this lane. It was **not** executed against any surface.

- Default and `--explain` behavior: print the sequence, the allowlist, and
  the dependency list (§5); exit 0; no network, no filesystem writes beyond
  nothing at all.
- Live behavior: unreachable without the §2 token pair; every step re-checks
  the allowlist before any send-shaped call; every step appends its evidence
  record before the next step begins, so an abort never loses the trail.
- It speaks to the staging surface through the same env contract as the
  existing live gauntlet (`UPMORE_CHAT_URL`, `UPMORE_TEST_JWT`) — values from
  the environment at run time, never from the repo.
- All seven steps are implemented as chat-path turns with operator pauses at
  the three founder-only acts (consent, the Step 5 reply, the Step 6
  opt-out). Assertions are deliberately strict about evidence shape: a step
  passes only when the surface returns the **structured state** the step
  requires (`connection.scope_set`, `selftest.email.message_id` + `arrived`,
  `selftest.event.event_id` + `read_back_ok`, `campaign.sent_count` +
  `recipients`, `campaign.reply_count`, `suppression.address`,
  `enqueue.blocked_reason`, `queue.*` counts + `global_pause`). Prose claims
  without that state FAIL the step (R-C4). Whether the staging surface
  returns this state over HTTP is exactly dependency D-2/D-5 below — the
  runner does not guess a friendlier contract into existence.
- It contains **no token value, no credential, no production URL, and no
  recipient outside §1.2** — by construction, and verifiable by reading it.

## 5. What remains unbuilt — dependencies this lane does NOT paper over

Gate 5 cannot fire until all of the following land. Each names its owner.

| ID | Dependency | Owner | Why Gate 5 needs it |
|---|---|---|---|
| D-1 | **Staging deploy of the career build.** There is no deployed career surface today: the live `agent-chat` handler is the finance product, and no staging package serving the career route exists yet. A Gate 5 run needs a staging URL serving the career build at a recorded SHA. | Owner (deploys are the owner's) | Steps 0–7 all speak HTTP to this surface. Without it there is nothing to run against — the runner's preflight fails honestly. |
| D-2 | **Item-7 HTTP wiring (ledger queue item 7, Codex lane):** `build-router-core` bundles 130/141/143 with 140/142 and career dispatch is reachable from the `agent-chat` handler behind a flag on test accounts, proven by a real HTTP request/response pair (curl transcript + reply text). This lane is GRADE-ONLY there and builds nothing in 120/130/140/142/143 or the handler. | Codex lane; owner fires the staging package | Connect, campaign, reply, suppression, and kill-switch are chat-path behaviors. If career dispatch is not reachable over HTTP, the runner can only record BLOCKED — the harness/modules are not a substitute (doorstep rule: product path only). |
| D-3 | **`gmail-oauth` career grant live on the staging project** (`supabase/functions/gmail-oauth/career.ts` scopes in lockstep with `120-career-access.js`), so the Step 1 consent produces a real connection record + a working send/read rail for the self-tests. | Owner / Codex lane | SC-286's own record states live proof waits on this deploy + the founder's consent tap. Fixture "connected" records are not E3 evidence. |
| D-4 | **The founder's consent tap + sandbox accounts ready:** the founder's own Gmail/Calendar (§1.1) available for the Step 1 consent, and a staging test account provisioned. | Owner only | No agent can consent on the founder's behalf, and this lane does not create accounts. |
| D-5 | **Suppression + kill-switch state readable over the staging surface** (queue state, pause flag, suppression list) so Steps 6–7 can verify state, not just replies (R-C4). If the surface exposes these only in-process, that read path is part of D-2's wiring. The same applies to the runner's full state contract (§4): connection scope set, self-test message/event IDs + arrival/read-back flags, campaign sent count + recipients, reply count, suppression address, enqueue block reason. | Codex lane | A reply saying "halted" without a state read is the SC-300 failure mode; Gate 5 grades state. |
| D-6 | **Campaign drafts integrated:** the five staged drafts (this package) appended by the coordinator into the master email doc and approved as the exact batch text, so Step 4's approval hash has a stable referent. | Coordinator + owner approval | R-A2: approval covers only the exact items shown. Unstable draft text = no valid approval. |
| D-7 | **The per-run go-ahead itself**, with its fresh token (§2), given for a named date/run. | Owner only | Spec Gate 5: explicit go-ahead **for each run**. This plan is not a standing authorization. |

Until D-1…D-7 are all true, the correct Gate 5 verdict is **NOT RUN**, and
this package's job is to make that verdict cheap to state and the eventual
run cheap to execute exactly once, exactly as planned.

## 6. If something goes wrong mid-run (incident path)

Per spec Gate 6's runbook shape, applied early: **detect** (the runner's
per-step state checks), **halt** (abort the run; if the product kill switch
is the thing that failed, the founder also pauses at the provider level —
that manual step is the founder's, named here so it is not improvised),
**notify** (owner sees the evidence log the same hour — it is written per
step, so it already exists), **postmortem** into
`docs/stability/runs/<date>-<shortsha>.md`, and **a replay test** for the
failure before any re-run is proposed. Any S0 (unapproved send, suppression
breach, secret in a log) blocks release and opens an incident regardless of
the other steps' results.
