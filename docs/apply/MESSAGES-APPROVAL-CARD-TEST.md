# Messages approval card — TEST-only landing

The owner assigned this code path to Codex on 2026-10-21. This branch supplies the Messages view, an immutable server card, and the authenticated tap. It does not deploy, send an application, enable agent submission, or authorize the remaining paid evaluation cases.

## Source and prerequisites

The integration branch is `wo/lane-b-approval-card-20261021`. Its base is `41939ceb59ef87f3e870ccd6a761913c5e3f0de4`, which contains the modern approval contract from `1ec88f3c`. Claude should take only this branch's commits after that base, or apply them to an equivalent reviewed tree. In particular, these existing functions must be present:

- `career_apply_canonical(jsonb)` — the queue's canonical serialization.
- `career_apply_batch_approve_own(jsonb)` — the authenticated mint of exact batch entries.
- `career_apply_extension_begin_agent_own(jsonb,text,text)` — the existing submission boundary, which consumes each approval once and rejects permissions aged 24 hours or more.

This card uses that modern contract. It does not call the old text-card `career_apply_card_answer_as` or translate a texted “yes” into approval.

## Exact producer and tap contract

The preparing service supplies `p_items: [{entry, hash}]`. Each `entry` is the exact modern `{version:1, kind:"agent-batch", ...BatchPosting}` from preparation, including every answer, blank field, file SHA-256 and provenance ledger. `hash` is its existing `batchHash`; do not rebuild the entry from a prose summary or change names to labels. The service calls:

```js
const {data: card, error} = await admin.rpc('career_apply_message_card_show_as', {
  p_user: TEST_USER_ID,
  p_thread: OWNED_THREAD_ID,
  p_items: preparedItems
});
if (error) throw error;
```

The producer writes one assistant message and one immutable nonce in the same transaction. The saved message contains:

```json
{"intent":"career_message_approval","career_approval_card_id":"<server card UUID>"}
```

For a live chat response, forward the same reference as `action: {type:"career_message_approval", card_id:card.id}` or as that message metadata. History reads now retain `meta`. Re-rendering reads the existing card; it must not call the producer again or mint another nonce. The `message_id` returned by the producer identifies the saved message.

The client calls `career_apply_message_card_read_own({p_card})` as the signed-in person. It renders every exact answer, underlying wire value when different, blank field, destination, file name and full fingerprint. Unknown entry fields and missing file fingerprints fail closed. This first TEST path requires one distinct prepared-resume fingerprint, identified by the existing producer's exact `approved-local-resume:<sha256>` fact ID. An attachment called `resume.pdf` cannot stand in for that identity. Extra attachments retain their separate file labels; duplicate fields for the same resume are allowed, conflicting prepared resumes are refused. Fileless applications are not enabled. This marker identifies the artifact; the existing provenance and confirmation-event checks still apply independently.

Only the card button calls `career_apply_message_card_approve_own({p_card,p_hash})`. It verifies the authenticated actor, current account/thread, unchanged stored hash and unchanged visible disclosure before dispatch. The server locks the nonce, checks TEST membership/owner/thread/hash/expiry, calls the existing batch mint, and marks the nonce answered in the same transaction. A repeated tap cannot renew the authorization. Each resulting batch approval remains single-use at the existing consumer and expires 24 hours after its recorded approval time.

The receipt is `{card_id,card_hash,approved_count,approved_at,approval_expires_at}`. Both timestamps are ISO strings and match the actual minted approval rows. The card's own `payload.issued_at` and `payload.expires_at` are epoch milliseconds. A lost response is shown as unknown and does not automatically retry.

## Exact queue boundary

The new migration also guards the existing queue when its agent consumer attaches a Messages approval. A wrong answer, raw option value, resume fingerprint, destination or company raises inside the same transaction: no job remains and the permission stays unused. Unknown payload or field parameters are refused. This is scoped to approvals minted by the new Messages path; it does not replace the canonical consumer or claim to repair every older manual/legacy entry point.

Private metadata binds each job to the particular approval ID it consumed. It contains IDs, hashes and deadlines, with no duplicate answer-body store. Deleting the displayed message or thread cannot remove that binding, and approving a later identical card cannot extend an earlier job's deadline. TEST disablement, withdrawal and expiry block new execution; a truthful terminal receipt for already-started work can still be recorded. Existing account, provenance, manifest, stop and submission-switch checks continue to apply.

Supported first-TEST mappings are exact text; selects with `value=<raw>` readback; ordered radio/checkbox groups with unambiguous `checked=<raw>` values; native default-value checkboxes or explicit yes/no buttons; and single-file `SHA:size:MIME` readback. A deliberate No requires explicit negative-button evidence; an unchecked box alone is ambiguous. Listed widgets, conflicting text/display mappings, ambiguous choice values and unsupported checkbox mappings are refused. The preparing service must surface that refusal and request the missing mapping; it must not call a weaker approval route. This branch does not claim every ATS widget is covered.

## Claude's landing sequence

1. Review the branch delta against the base above, including the new SQL migration, ACLs, native-tap guard, generated app and tests. Verify its current head and green test artifacts before landing. Neither this handoff nor a green local suite authorizes deployment.
2. Run `node --test tests/career-approval-card-render.test.cjs tests/career-approval-messages-integration.test.cjs tests/chat-request-controller.test.cjs tests/chat-request-integration.test.cjs tests/export-coverage.test.cjs` and the sandboxed browser test `tests/career-approval-card-browser.test.cjs`. Use the repository's normal browser configuration; do not disable Chromium's sandbox.
3. Run `bash tests/db/run.sh` on the throwaway database. The new test runs after the modern batch migrations. Apply `20261021220430_career_apply_message_cards.sql` only to the separately authorized target via the normal reviewed migration process. It does not enroll any account or enable a submission switch.
4. Obtain the owner's confirmed TEST profile UUID. Using the authorized operator connection, enroll only that TEST UUID in `career_message_approval_private.test_users`. This private table starts empty; clients cannot enroll themselves. Do not enroll the owner's ordinary profile. No real profile UUID is embedded in this branch.
5. Build with that same UUID: `UPMORE_APPROVAL_CARD_TEST_USER_ID="$TEST_USER_ID" python3 src/build-app.py`. An unset value disables this UI for every account; a malformed UUID fails the build. Commit and verify the generated app/CSP/cache artifacts on the final landing tree. The checked-in branch build is disabled by default.
6. Connect the preparing service to the producer call above, using an existing owned TEST thread and actual prepared `BatchPosting` entries. Forward only the server card reference to Messages. Do not fabricate fact confirmations, resume digests or entries to get the TEST card to render. A pending question or unavailable resume stays pending; it cannot be replaced with a synthetic placeholder on the landing account.
7. On the TEST account, verify the complete saved-message → full disclosure → authenticated native tap → exact stored approval → one-use consumer sequence. Change an answer and resume fingerprint separately; both must require a new review. Verify another account, a replay, an expired card and plain-text “yes” mint no permission. Keep employer submission and submission switches off during this verification.
8. Capture the final source SHA, card/item hashes, TEST actor, actual receipt/approval-row deadline, replay/expiry outcomes and test counts for both judges. Do not include tokens, service keys or private answer bodies in public logs. Any later real application still requires the existing live submission gate and owner approval.

## Disable the TEST path

The authorized operator can set that TEST account's `enabled` value to `false` in `career_message_approval_private.test_users`, then remove `UPMORE_APPROVAL_CARD_TEST_USER_ID` and rebuild the app. Keep the boundary guard and its durable approval/job markers installed while any associated permission or queue job remains. Removing the marker or guard would erase the evidence that an approval came from this stricter path. Preserve truthful terminal receipts for work that already started; use the existing stop/cancel controls for pending work. Disabling this surface cannot undo an employer action.

## Verification boundaries

Local synthetic module/VM and isolated PostgreSQL proofs are distinct from actual browser proof and a deployed TEST-account proof. The branch is not a production deployment. This environment cannot inspect Muse or production; Claude must perform and return the final TEST-profile evidence after landing. The preparing-service call is an explicit integration step above, not a claim that an unseen Muse producer has already been wired.
