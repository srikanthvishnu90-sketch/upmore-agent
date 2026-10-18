# Completion preflight — source-only handoff, 2026-10-18

This checkpoint addresses the upgrade seam found by the live catalog review. It does not enable a browser, provider, application submission, allowance or deployment. The application runtime remains the mass branch at `834e0bc86b7f540952cf1fc280eb8bf0ce6d4980`, runtime `d9419241a82d21087871214df01ab63d4fa1e462`. The new branch `codex/forward-upgrade-preflight-20261018` contains only the compiler, metadata collector, local contracts and this inventory.

## Source work and its limits

`scripts/career/forward-upgrade/build.cjs` verifies all eighteen immutable SQL hashes from `docs/career/mass-applications-20261017/release-source-manifest.json`. It skips the existing watch/outbox, task/effect and monthly model authority migrations entirely. It executes the remaining fifteen units, in manifest order, only after exact catalog comparison and a worker-quiescence check. The SQL transaction preserves existing rows and creates no model campaign or active pair policy. A private journal makes an exact successful rerun a no-op and refuses installed catalog drift. Any failed statement rolls the transaction back; do not resume a failed package from its middle.

The supported reference catalog is generated from the positively identified, disposable PostgreSQL 16 fixture and the three original baseline authority migrations. It is a **local compatibility contract**, not a representation of the live database. A bare build emits a refusing draft. Supplying an arbitrary snapshot cannot waive the guard: the compiler accepts only the committed reference. Unknown or newer live definitions require a separately reviewed source adaptation with upgrade tests. Existing function replacement in PostgreSQL can preserve ownership/grants while changing other properties; body/signature/config/default and ACL comparison is required before executing any replacement. See the [PostgreSQL CREATE FUNCTION documentation](https://www.postgresql.org/docs/16/sql-createfunction.html).

The original proposals remain unchanged. They are fresh-install source units, not an instruction to replay `CREATE TABLE`, policies, trigger creation or the equipment-function rename on a populated database.

## Owner handoff: exact steps, no production command executed

1. Obtain the exact deployed `agent-chat` v227 source, its source hash, dependency/bundle hashes and deployment mapping. Obtain the exact branch/commit for Muse's final integration; `finish/apply-readiness` returned 404 and `ae56c30` returned no commit on the bounded read. Do not infer live function source from a preview or an older branch.
2. Have the database owner run the metadata-only collector through their already approved connection. Do not paste credentials into a command or return customer rows. The collector returns role flags, schema/default-grant hashes, relation/column metadata including column ACLs, constraints/index/policy/trigger hashes, function overload signatures and body/config/default hashes, and grants. Unknown hashes need exact verified source provenance before any replacement is reviewed.

   ```sh
   psql -X -qAt -v ON_ERROR_STOP=1 -f scripts/career/forward-upgrade/collect-catalog.sql > live-career-catalog.json
   node scripts/career/forward-upgrade/build.cjs --catalog live-career-catalog.json --out /tmp/career-forward-reviewed.sql
   ```

   The second command is offline. A mismatch is an explicit refusal, not permission to substitute the live JSON for the committed reference. Required missing metadata is listed in `LIVE-METADATA.md`. No live catalog has been accepted by this checkpoint.
3. Review the generated SQL and adjacent manifest; reconcile existing active workers, started/reserved effects and unexpired claims with the responsible owner. Preserve uncertain liabilities. Lock out concurrent schema edits and fence workers for the owner's migration window. No reset, delete, fabricated admission backfill or new allowance is part of this package.
4. The owner may apply a separately approved compatible package, using the same approved connection:

   ```sh
   psql -X -v ON_ERROR_STOP=1 -f /tmp/career-forward-reviewed.sql
   ```

   This is a future owner instruction, not an executed action or deployment approval. A matching journal permits an exact rerun without replaying the non-idempotent units. A different package, partial schema, changed grant/policy/function or unknown baseline refuses.
5. Independently verify installed metadata, RLS/grants and normal bare `POST {thread_id,turn_key,message}` behavior on the final integrated source. Model policy and allowance remain absent until the separately authorized owner reconciliation; this checkpoint has zero paid-call allocation.

Reproduce local verification with:

```sh
node --test tests/career-forward-upgrade.test.cjs
node scripts/career/critical-repairs/ci-node.cjs --postgres-only --sql-file=career-critical-repairs/forward-upgrade-postgres.test.cjs
node scripts/career/critical-repairs/ci-node.cjs --source-only
```

The SQL harness requires its existing pinned local PostgreSQL image and Node dependencies. It creates a uniquely labeled network-none container, checks ownership markers before writes, and removes its owned container. The upgrade tests create fresh marked child databases and seed completed/uncertain task/effect and recorded monthly model rows; no live database is a target. Do not set test target environment variables to a remote/shared database.

## Integration inventory

`evidence/feasibility.json` and both merge-tree logs were produced in an isolated bare object store using read-only alternates. No release branch, shared working tree or merge commit was changed.

| Target | Exact head | Result |
| --- | --- | --- |
| Muse v224 | `b7762d388f1534d6fd5d16325da2c4735d08dc17` | 226 mass-only / 19 target-only commits; thirteen overlapping paths, ten content conflicts |
| Existing build-v1 / main | `192132dfd83f6f9834a7e8c962be91f570f6bbc7` | Textually clean scratch merge; 798 mass-only / 2 target-only commits; semantic/live compatibility unproven |

The ten conflicts are `142-career-router.js`, `150-career-portal-browser.js`, `portal-browser-helper.cjs`, `career_host.js`, `career_persistence.js`, `handler-career.ts`, `build-router-core.py`, both generated router bundles and `docs/depth/MUTATION-COVERAGE.md` (full paths in evidence). Muse's v224 also introduces `packages/domain/155-career-batch-apply.js`, a different module 155 batch implementation and J8/J9 board/bridge work; the mass branch's `packages/domain/155-career-conversation.js` module is not interchangeable. An automatically merged file does not prove behavior is compatible. In particular, preserve Muse's privacy corrections and widget/readback work, and do not inherit a sandbox-off setting to get a browser outcome.

Integration order: identify exact v227 source/catalog; explicitly reconcile the handwritten router, portal, helper, host, persistence, bridge and handler semantics; select one coherent batch/conversation composition; integrate SQL/applicant/worker source; regenerate router bundles and mutation report from the selected handwritten source; run the full source/Edge/local database contracts; then conduct a separately authorized normal-sandbox browser trial with real observations. Never resolve generated bundle conflicts by copying one side and claiming verification. Muse owns final integration and deployment.

## Remaining gates and who can close them

| Gate | Observed fact | Concrete next action |
| --- | --- | --- |
| Live schema/source compatibility | Catalog reviewer reports five authority tables present, all eleven applicant/application tables and native/owned/model-campaign/pair RPCs absent; exact definitions/grants/policies not supplied | Database/source owner supplies metadata collector output and v227 source provenance; review compatible forward package before owner-only apply |
| Current deployments | Parent reviewers report mass preview READY at `dpl_GiYZq3Yk5s9Lix6aqWMLm5Luv6qG`; production alias READY at `dpl_FUq6JibfH7b1q45LmDj4Vk9Ss991` from build-v1; backend ACTIVE v227 with JWT verification | Muse maps final source, schema and worker versions explicitly; preview availability alone does not close backend/runtime gates |
| Browser execution | Normal local Chromium sandbox probe failed; exact-project Vercel sandbox listing returned 403 and supplied no running identifier | Platform owner supplies an approved already-running sandbox identifier and supported sandboxed execution path; no retry of the denied listing, provisioning, auto-resume, install or sandbox bypass |
| Real employer adapter | `greenhouse-native.cjs` accepts modeled loopback only, requires `modeled:` keys and produces `authoritative:false` receipts | Owner supplies a reviewed employer binding and real observed form/upload/readback trace before narrowly enabling an adapter. Renaming a modeled manifest must continue to fail |
| Historical archive gate | Exact mass-head CI `39057905348`: Node/Deno/database passed; required original archives failed | Owner restores original archive assets at the gate's approved absolute root; run `node scripts/career/critical-repairs/archive-gate.cjs --require-complete`. Do not fabricate or waive them |
| Model allowance and live quality | Zero allocated paid calls here; fixtures prove plumbing only | Owner reconciles original allowance and separately authorizes any bounded model trial; no extra budget inferred from a preview |
| Existing submit liabilities | Existing completed/uncertain submit rows may lack admission mapping | Owner reconciles truthful history before any new submit. The new admission guard deliberately refuses incomplete historical accounting |

No real employer submission, authoritative employer receipt, live model quality result, deployment, live SQL write or security-setting change is claimed. Existing caps remain fifteen/day, five/vendor/day and one/company/thirty days; localhost counts as one vendor.

The retained `forward-reviewed-reference.sql` and adjacent manifest are the concrete package for the tested local baseline. The filename does not assert live approval. Its runtime source is immutable d941; the compiler, reference and final test hashes are recorded separately in the evidence manifest.
