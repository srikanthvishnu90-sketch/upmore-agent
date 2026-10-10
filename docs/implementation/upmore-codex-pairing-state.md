# Upmore pairing handoff — October 10, 2026

**Latest checkpoint:** recovery integration below supersedes the earlier unwired recovery status.

Continue in `/Users/vishnusrikanth/upmore-production-integration`, branch
`codex/upmore-production-integration-20261010`, HEAD
`b63731c4fa239fb195d015984bd2fa4e9b8f116d`, with substantial uncommitted work.
Preserve that work and the separate dirty `../upmore-agent` checkout. No commit,
push, merge, deployment, production migration, account opening, merchant contact,
or real money action occurred in this continuation. The model was not switched:
the current tools provide no model-switch control.

## Verified changes

- Both HIGH defects reported in the owner's Claude handoff are fixed locally.
  Applied payment history blocks a new proposal and database preflight for the
  same unresolved invoice, including refreshed facts and legacy unsubmitted
  approvals. See `applied-payment-guard.md` and migration16. Original receipts
  remain intact. A trusted creditor remaining-debt clearance protocol is still
  missing; a timestamp or evidence flag cannot clear the hold.
- Payment reservations and reconciliation have separate queue quotas. Durable
  last/next check timestamps, lease release and bounded backoff prevent repeated
  processing/settled lookups from starving new work. Migration17 also preserves
  settled state on an unknown lookup. Lost begin-submission responses return
  unknown unless the database confirms cancellation before submission.
- Versioned bill editing uses Auth ownership, exact revision, immutable request
  receipts and an explicit current-unpaid confirmation. Old retry receipts are
  labeled superseded. Migration15 and the Bills UI are local only.
- Chat responses, history and delayed reads are fenced by owner/thread/mode.
  Private financial local storage uses owner namespaces; unowned legacy data is
  quarantined, including onboarding/referral keys. Explicit legacy/guest import
  UI remains missing. Namespacing is not storage encryption.
- All 720 incoming Claude feature rows and 325 sources were merged, preserving
  the existing catalog. Totals: 1,008 rows (241 seeds, 699 atoms, 68 discoveries),
  365 sources, 309 full outcome rows. Imported observations are UNVERIFIED;
  source claims, dates and passages are retained separately. No readiness was
  promoted. Importer and ten regression tests are included.
- Recovery now treats same-merchant credits as unverified leads rather than
  recovered money. Nineteen tests pass. Recovery and subscription-case domain
  modules remain outside the app bundle/API/UI; authenticated evidence storage,
  verified refund linkage and cross-case deduplication remain integration work.

## Fresh evidence, not inherited counts

Both final runs bound unchanged code to source digest
`03d9003ac4b254b1858e46d754488ef94aae7391425a7a62bfec91835a5af1d5`.
Exact commands, timestamps, environment, test IDs and logs are in:

- `docs/testing/runs/payment-hotfix-final-20261010/results.json`: all 26 checks
  passed. Includes 148 Deno edge tests, 21 Bills tests, 19 chat tests, 11 privacy
  tests, 19 recovery tests, 15 subscription tests, ten research-merge tests,
  generated bundles, synthetic agent100 and seven endpoint typechecks.
- `docs/testing/runs/payment-hotfix-db-20261010/results.json`: 476 observed SQL
  assertions/race checks passed against disposable local PostgreSQL, including
  migrations15–17 and migration replay. No production database was touched.
- `docs/testing/evidence-ledger.json`: 108 indexed historical and current command
  executions. Do not add these together as fresh feature evidence.
- `docs/testing/mutations.json`: nine of twenty requested boundaries have direct
  killed-mutation proof; eleven remain NOT-RUN. Adjacent/equivalent proof does
  not certify those eleven. Actual isolated SQL mutation run is under
  `docs/testing/sql-mutation-runs/20261010T192228-549f30/`.

Browser-shaped Node tests are synthetic. CUA reported no available browser.
No actual browser/accessibility screenshots, partner sandbox or live verification
were acquired in this continuation. The inherited Chromium harness uses the
Spotify playbook against a local test merchant. It was inspected, not rerun here;
the owner's reported 25 checks remain inherited evidence. Its separate approval
checks do not establish approval enforcement inside browser execution.

## No real cancellation merchant selected

No named real subscription has been selected or authorized for cancellation.
Spotify is the local fixture's playbook, not an owner-approved live merchant.
All 29 production playbooks remain unverified against real merchants. Broad
retention detection may stop legitimate flows; browser execution also needs
server-bound owner/proposal/expiry/revocation enforcement before a live pilot.

## Next work and gates

1. Integrate recovery through an authenticated owner-scoped read/preparation
   service, evidence-backed refund linkage, bounded/indexed scans and the actual
   interface. Preserve unknown recovered amounts until proof exists.
2. Integrate subscription cases with durable server evidence/approval storage,
   shared deduplication and a tested supported cancellation adapter.
3. Complete eleven remaining requested mutations and actual browser/accessibility
   journeys. Do not count generic local tests as provider or live evidence.
4. Verify imported competitor passages against current official sources and
   resolve duplicate outcomes without dropping blocked denominator rows.
5. Add explicit creditor remaining-debt reconciliation and recurring invoice
   identities before paying again on an invoice with applied history.
6. Production biller/payment/Messages adapter registries are empty. Commercial,
   legal, security, provider sandbox and exact owner launch clearance are needed
   before enabling external effects. Reconcile production migration history,
   backups/restore and release ordering before deployment.

All six original requested areas remain open. Full software, provider, launch and
live outcome scores remain zero under the parity contract; partial modules and
passing safety tests are progress, not 100/100 parity.

Rollback: preserve the dirty checkout and isolate reviewed files, rather than
resetting it. Rebuild generated app/core files from their matching source.
Migrations15–17 have not shipped; do not drop records or rewrite applied
production migration history. No release action is authorized by this handoff.


## Latest continuation: recovery integration verified

Recovery is now bundled and connected to migration18 Auth-only atomic snapshot,
workflow recovery_scan, typed get_recovery_report and Transactions → Find possible
refunds. Scope is read/preparation only. Private account choices, findings and
open drafts clear on owner changes, same-owner Auth generations and bank
 disconnect. Candidate paging binds unchanged source proof. Unknown hold dates
are excluded explicitly; future observed dates reject; matching is indexed and
reference-equivalence tested. No amount is certified as recovered.

Latest current-code evidence: docs/testing/runs/recovery-final-v2-20261010/results.json,
27 checks PASS, including 162 edge tests, 27 recovery domain tests, 14 recovery
interface tests and 12 actual-template privacy tests. Unchanged source digest:
40af6fb3b985e68ac381a26b97869e7a7d8390e9185d36ca6d19eeb32e127549.
SQL-only proof: docs/testing/runs/recovery-db-20261010/results.json, 502 observed
assertions/races PASS; migration/test input hashes unchanged. That run predates
later UI/tool edits and is not claimed as whole-app proof for the final digest.
Source and HEAD remain uncommitted. No deployment or provider action occurred.

Catalog now 1,009 rows / 365 sources / 700 atoms / 309 full outcomes after adding
one duplicate-charge preparation contract, CO-003.01. Full outcomes remain
uncertified. S48.01–05 have partial implementation references; no requirement
was removed. See recovery-integration.md for exact boundaries and next work.

Next: durable recovery cases, protected charge-specific allocation and cross-case
deduplication; subscription-case server/UI integration; eleven remaining requested
mutations; actual browser/accessibility; verified provider/production release
work. All six original areas remain open. Subscription-case module remains
unwired. No real cancellation merchant selected or authorized.
