# Saved-answers sync lane — record (2026-10-20)

**Lane:** owner-ordered 2026-10-20. Branch `work/extension-on-trunk`
(base 9240da1a). **Terminology:** the owner dislikes "answer bank" —
this feature is the user's **saved answers** everywhere in records and
copy. There is no financial aspect.

**Goal:** the extension stops filling from the built-in Alex Testcase
fixture and instead uses the signed-in user's real saved answers; after
the user submits, it sends employer-confirmation proof back to the
product.

**Bounds honored:** new small edge function (NO agent-chat changes);
NO deploys; NO live accounts; NO real submissions; test personas only;
§6.3 — no submit code path exists in the shipped extension (mechanical
grep in the guard suite + below); the owner's real fact bank never
entered the repo (proofs run on the repo's own test personas).

## What was built

### Product side — `extension-sync` edge function (new, NOT deployed)

- Core: `supabase/functions/_shared/extension_sync.js` — ESM, zero
  imports, all I/O injected; wrapper `supabase/functions/extension-sync/index.ts`
  (Deno, model-health/delete-account pattern). Generated domain bundle
  `supabase/functions/_shared/extension_domain.js` (modules 122 + 126 +
  149 concatenated by `scripts/build-extension-sync.py`, `--check`
  enforced by the guard suite).
- `GET /functions/v1/extension-sync/saved-answers` — serves the
  signed-in user THEIR saved-answers map. Auth: the wrapper verifies
  the bearer token via GoTrue `GET /auth/v1/user`; the user id comes
  ONLY from the verified token (no request field can name another
  user). The master is the freshest `agent_flow_state` snapshot whose
  `state.career.stores.profile` carries basics||facts (mirrors
  `workers/career-browser/production-sources.cjs` readStoredMaster).
  No master → honest `404 PROFILE_NOT_FOUND` (chat onboarding creates
  it). Response: `{ savedAnswers, derivedAt, savedAnswersVersion, user }`.
- Composition (`composeSavedAnswers`, later layers win):
  1. identity from the master's basics verbatim (name, email, phone,
     location, links incl. portfolio→website, current company);
  2. module 149 `deriveAnswers` over the confirmed facts — its
     profileFields merge into the profile and its answers override the
     master's stored `master.answers` (confirmed===true only,
     verbatim);
  3. the module 132 saved-answer seam for gaps only (module 132's own
     rule, `packages/domain/132-career-fact-registry.js`
     savedAnswerFor): sponsorship from `constraints.needsSponsorship`
     (boolean → Yes/No token), work authorization from
     `constraints.workAuthorization` via the token rule (Yes for
     citizen/permanent-resident/authorized wording without negation;
     No for "not authorized"; anything else VERBATIM, so the engine's
     option-match fails closed to needs-user instead of a wrong fill),
     pronouns from `defaults.pronouns`, and located_in_us from the
     residence the record carries when its tail is a US state (the
     same basics.location source deriveAnswers itself reads for
     state_of_residence — derived in the seam because in the 122
     dialect the country fact deriveAnswers looks for is not where
     residence lives). EEO policy "decline" iff
     `defaults.demographicPreference` matches /decline/i. The resume
     rides as `{filename, sha256}` metadata only. Every seam answer
     carries its factId trace.
- `POST /functions/v1/extension-sync/application-proofs` — the report
  write. The server **re-parses the confirmation from the excerpt the
  report carries** (the core's own port of module 150's
  extractConfirmation): employer/role/https posting URL required and
  bounded (http allowed for localhost/127.0.0.1 demo only);
  `formStillOpen === true` → `400 FORM_STILL_OPEN`;
  confirmationText (≤800 chars) required; a claimed confirmationId
  must EQUAL the parsed id (absent claim → parsed id wins); no id and
  no success wording → `400 CONFIRMATION_NOT_SHOWN`. A report claiming
  a confirmation the page didn't show is impossible by construction.
  Accepted reports build the tracker record server-side via module
  126 `CareerTrack.addApplication` (stage "Confirmed", confirmation
  event with `source: "employer_record"`, `confirmation_id` on the
  row, `origin: "extension"`) and store it on the report row in
  `public.extension_submission_reports` (migration
  `20261020010000_extension_submission_reports.sql` — written,
  UNAPPLIED; RLS on, zero policies; the function writes with the
  service role keyed by the verified user id). Duplicate (same user,
  same confirmation id) → `200 { receipt: original, duplicate: true }`,
  still one row. Response: `{ ok, receipt: { id, reportedAt }, duplicate }`.
  Storage is a dedicated table, NOT a second writer into
  `agent_flow_state` — folding these tracker records into the in-chat
  track store is a named agent-chat follow-up (agent-chat's versioned
  commit owns that store).

### Extension side — manifest 0.2.0, "Trainee — Assisted Apply"

- `src/config.js` — the product's Supabase origin + the public anon
  key (the same public client key the web app ships; the service-role
  key is never in the extension).
- `src/sync-client.js` — GoTrue password-grant sign-in in the popup
  (DESIGN's launchWebAuthFlow hand-off page does not exist; the
  password is never stored, the refresh token lives in
  chrome.storage.local); token refresh; saved-answers sync storing
  `traineeBank` + `traineeBankMeta`; sign-out wipes session + answers;
  a fresh sign-in wipes any previous answers before syncing (per-user
  isolation on a shared browser profile); proof reporting with honest
  `{ ok:false, status:"queued_local_only", reason }` failure states.
- `src/bank-source.js` — the pure source rule that binds every stored
  set to its context: synced answers usable ONLY while signed in; the
  demo fixture ONLY on the local demo host while signed out; signed
  in → NEVER the fixture. (This closes a real hole the spike left:
  storage persists across hosts and sessions, so an unlabeled
  "whatever is stored" rule could have filled a real form with the
  test persona's answers.)
- `src/content-greenhouse.js` — loads answers through the rule;
  coverage records carry `bankSource`.
- `src/fill-engine.js` — proof records now also carry `successText`
  and `formStillOpen` so the server can re-parse (additive; the
  fixture check is untouched and green).
- `src/background.js` — the NOT_WIRED stub is gone: proofs are
  reported to `extension-sync/application-proofs` under the user's
  session; receipts land in `traineeProofReports`; unreported proofs
  flush on sign-in/sync (`trainee:flush-reports`).
- `src/popup.*` — account block (sign in/out), source-labeled answers
  line ("Saved answers: <name> — yours, synced" / "DEMO saved answers
  (test persona)" / honest none), "Fill from my saved answers", proof
  block with report state (receipt or queued reason).

## Proof

- **Guard suite** `tests/career-extension-sync.test.cjs`: **20/20**
  (`node --experimental-vm-modules --test tests/career-extension-sync.test.cjs`;
  under the plain sweep it self-respawns, the pool-loader pattern).
  Fail-first: against the base tree 9240da1a the suite is red (the
  feature is absent — the file cannot load). Covers: composition
  (Alex + Maya, per-field), cross-user isolation (persona B's token +
  a claimed `user_id` returns persona B's map with zero Alex-distinct
  values), unauthenticated 401s, honest 404, the report refusal
  battery (bare claim / mismatched id / unlabeled id / still-open
  form / unauthenticated), valid report → tracker record stage
  "Confirmed" + employer-record event + receipt, per-user idempotent
  duplicates, success-wording-only reports, the bank-source rule
  table, the shipped content script's real behavior under jsdom
  (signed-in + nothing stored ⇒ fixture NEVER seeded), bundle
  freshness, wrapper parse, §6.3 grep.
- **Extension fixture check: zero flips.** `run-fixture-check.cjs`
  exit 0 — coverage 21/28, accuracy 20/20, never-guess held, proof
  GH-DEMO-2026-0001.
- **Real Chromium (tier 2): PASS.** `~/workspace/your_files/extension/proof/SYNC-PROOF.md`
  + `sync-proof-result.json` + 3 screenshots: sign in as Maya through
  the real popup → her saved answers sync (version sa-6a85923b) →
  coverage 17/28 labeled synced/Maya → fill 14 filled / 2 recorded
  failures / 23 ms with Maya's values read back → user pass + Submit
  (driver plays the user, as the fixture check does) → navigation to
  the standin confirmation page (recorded simulation of the board
  redirect) → exactly ONE report row lands: Maya's id, confirmation
  GH-DEMO-2026-0001, stage "Confirmed", popup shows the tracker
  receipt.
- **Full node sweep: zero flips.** 4,526 tests / 4,472 pass / 13 fail /
  41 skipped vs baseline 4,525 / 4,471 / 13 / 41 on the ab94e44e
  lineage — delta exactly +1 (this suite's respawn entry); the failing
  name set is identical (9 Chromium env-class D11–D14 + 2 SC-300 pins
  + 2 fact-bank coverage).

## Findings for the module 149 owner (Crew B) — PENDING-ALLOCATION

Two derivation gaps the sync exposed. The sync layer serves the
derivation faithfully and does NOT fork it; both are pinned as
KNOWN-GAP controls in the guard suite (a fix flips those controls red
and this record must be updated). Bug-ledger / forbidden-rule numbers
are Crew A's to allocate (single-writer law); this lane requests two.

1. **Abbreviated degree text derives nothing.** Module 149's
   DEGREE_LEVELS and its education-block extraction match only
   spelled-out degree words (`bachelor`, `master`, …). A fact titled
   "B.S. Computer Science" (or "B.S. Nursing (BSN)") yields NO
   education_level answer and NO education.degree/discipline — those
   form fields stay needs-user for every user whose education fact
   uses abbreviations. Measured on the demo form: the served map
   reaches 19/28 where Lane C's hand-frozen fixture bank reached
   21/28; the 2-field delta is exactly Degree + Discipline.
2. **Verbatim end dates vs year-only options.** deriveAnswers carries
   the education end date verbatim ("2028-05") into
   end_date/graduation_year; boards offering year-only options then
   record an honest `no_matching_option` fill failure (surfaced to the
   user, never guessed). The product's own portal path normalizes
   dates at fill time (module 150); the derivation itself does not.

A third, smaller datum (no action requested): a recorded answer
carrying a suffix the form doesn't offer (persona value "she/her
(TEST)" vs the form's bare "she/her") fails closed by design — the
engine never rewrites a recorded answer to force a match.

## §6.3 mechanical check

`grep -nE 'requestSubmit|\.submit\(|\.click\(' packages/extension/src/*.js`
→ no matches (also asserted by the guard suite, which additionally
pins manifest permissions to exactly `storage` + `activeTab`). The
only Submit click anywhere in the lane is the user's own — played by
the proof DRIVER and the fixture check, never by shipped code.

## Remaining steps to live use (owner's taps)

1. **Deploy word** for the new function + migration on an exact
   commit: apply `20261020010000_extension_submission_reports.sql`,
   deploy `extension-sync` (bundle: core + generated domain bundle +
   wrapper). Nothing else changes; agent-chat untouched.
2. **Merge word**: `work/extension-on-trunk` into the candidate line.
3. **The owner signs in** inside the extension popup with his Trainee
   account — his saved answers then sync and fills use them; the 10
   real sends remain his own Submit clicks.
4. Follow-ups (not this lane): fold stored tracker records into the
   in-chat track store (agent-chat lane); the two module-149 gaps
   above; Lever/Ashby/Workday adapters.
