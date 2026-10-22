# Step 1 — VERIFIED local suites; CI pending

Merged exact 74c0d765 into current trunk 72031f0d on item branch wo/trunk-integration-20261022. Exact tested merge: beb0a0789f2621c28d9f1cb6d1b36bbcff6bc4fe. PR #161 targets trunk; the architect merges after green CI. The merge changes only documentation/evidence relative to its first parent.

- Node **2753/2855 pass, 0 fail, 102/2855 NOT_RUN skips**; baseline 2743/2854 pass, 1 fail, 110 NOT_RUN. No new failing names, changed failure diagnostics or new skipped names. The dry-run migration-list failure is resolved by inherited Step 0c.
- Edge **895/895** and architect **1270/1270** pass.
- Both canonical routers and extension-sync bundle checks pass.
- Disposable PG16 **85/85 SQL sections completed**, exit 0; 2115 explicit ok diagnostics (not represented as an assertion denominator). PostgreSQL server 16.14, psql client 17.11. Cleanup verified: no local test DB directory remains. No live migration or credentials.

The Node Workday cases whose service worker could not load remain NOT_RUN. Diagnostic inspector startup and conditional leaked-browser cleanup are preserved in the evidence; no debugger attached and no assertion was altered. This does not establish Workday functional coverage. A separately tested setup-cleanup repair is being prepared on the environment branch.

Raw logs are gzip-compressed without editing; metadata contains the uncompressed hashes and exact commands. The Node gate used 2 file workers, Node 22.23.3 and Deno 2.9.6. Elapsed verification time is recorded per suite; this is not customer reply or application latency.

NOT_RUN: live action, deploy, enrollment, flags, customer latency and paid eval. CI is separately pending. Ledger: $0 new; $8.573843 recorded, UNRECONCILED.
