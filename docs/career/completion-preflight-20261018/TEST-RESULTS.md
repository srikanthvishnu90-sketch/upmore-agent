# Tested checkpoint — full PostgreSQL selection still running

- Published implementation: `c00745a8b5f1ecab62b21a53631b25ceb57670e2`; zero runtime/app/Edge changes from mass834e.
- Clean-head source: 4,805 passed, 40 explicitly skipped, zero failed, 387 selected files. `evidence/source-final.summary.json` records clean c00745a8 and exact test hashes; `source-final.log` retains output.
- Final compiler: 5/5 pure contracts. Final guarded upgrade: 3/3 PostgreSQL contracts across thirteen marked baseline fixture databases, covering preservation, exact rerun, rollback, body/signature/config/grant/policy/schema/default-privilege drift, partial targets and active liabilities. Exact test source hashes match retained summaries.
- Employer gate validators: 2/2 passed; no browser or employer submission attempted.
- Original archive gate: exit 1, seven genuine assets missing, historical validation NOT_RUN. Never waived or fabricated.
- Final reviewed-reference SQL SHA-256: `94ffbdd4d82163fad7c442b94323e59203c6f338b44ddadd103bd55fce2fd863`; plan SHA-256: `065cc33333d3f1369a562d28fe61c769d0d75636b00b6851a22d3400d09cb6d3`. Byte-for-byte rebuild checked.
- Full PostgreSQL run: **still running**, not a full-suite pass. See `evidence/full-postgres-pending.json` for checkpoint counts, owned fixture log directory and source hash boundary. Its self-owned network-none fixture is removed by the harness on completion; no live/shared database is targeted.
- New-head GitHub workflow queries have returned no runs; no new-head CI pass claimed. Deno and host PostgreSQL CLI are unavailable locally and were not installed. Earlier immutable mass834e CI39057905348 passed Node/Deno/database and failed the required archive gate; that is separate ancestor evidence.

Failure evidence before the search-path fix and the collector-comment freshness fix is retained. Immutable eighteen-unit SQL hashes and final compiler/reference/test/package hashes are in `evidence/source-hashes.json`; no missing historical archives were regenerated.

Live compatibility remains **unreviewed**, with explicit refusal for unknown/newer definitions. The owner must provide v227 source provenance and metadata-only collector output; no actual live hash mismatch has been measured yet. Muse owns final integration and deployment.
