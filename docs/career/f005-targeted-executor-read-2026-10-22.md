# F-005 — production executor targeted discovery read

Outcome: a software-engineering intern batch can select the matching postings beyond the latest 600 shelf rows.
Code/test branch only; not deployed or live-verified. New spend $0. No live reads, drives, providers or migrations.

Base: `348c2d4a3564c54135d0c485bb0d09d763ee0901`. Reviewed upstream source:
`ea986344a5b5c9aa056734aabecb58b90a990a8e`, independently resolved through GitHub's commit API and fetched from origin.
The targeted candidate module and its six existing tests are copied byte-identically from that source; no merge.
Its historical header describes the pre-integration transport and fallback. In this integration the worker transport
binds both filter shapes, and a failed supplement blocks with `BATCH_DISCOVERY_READ_FAILED` rather than claiming zero.

The production source ignored the ask and returned only the recency window. The GET transport also silently ignored
the targeted reader's array-shaped `ilike` filters. A third integration gap matters: the executor's module 155 does
not filter role families/bands. Appending older candidates alone still selects recent senior roles first.

The source now derives named keys through module 121's existing `askRoleFamilies` and `seniorityBand`, reads bounded
fixed-pattern candidates, merges with the existing window, and selects the matching classifier stamps before the
executor applies its unchanged requested count. A `mid` fallback does not invent a named band. Unkeyed asks retain
the original 600-row window. User text never becomes an SQL wildcard. Profile reads remain owner-filtered. Array
filters bind explicit `eq`/`ilike` only; malformed/unsupported/reserved filter shapes stop before fetch.

Verification uses the actual production source, GET transport and `createBatchExecutor` assembly over a mock
PostgREST shelf: 600 newer senior jobs plus older intended and misleading candidates. No board is wired. On the base,
the selected posting identities are recent-0..2; on the fix they are target-0..2, with four intended eligible jobs
and requested count three unchanged. Wrong-family interns, substring hits and senior JD-text hits stay excluded.
Foreign run skeletons stop before any read, profiles stay owner-scoped, keyed read failure stops named, a family-only
ask does not invent a mid-only restriction, and unsupported GET filters do not silently become unfiltered reads.

Commands and results:

- `node --test tests/career-f005-targeted-executor-read.test.cjs`: exact-base production files **3 pass / 5 fail**;
  candidate **8 pass / 0 fail**. The identical final test file is used on both sides.
- Above plus `tests/career-shelf-targeted.test.cjs`: candidate **14/14 pass**.
- `node --test tests/career-loop-acceptance.test.cjs tests/career-loop-input.test.cjs tests/career-worker-wiring.test.cjs`:
  candidate **42/42 pass**. An initial sparse checkout lacked `career_host.js`; after restoring that unchanged
  dependency the full neighboring suites ran. Their simulated submission controls do not contact employers.
- Syntax checks and `git diff --check`: pass.

Raw before/after and neighboring logs, hashes and exact counts are in
`tests/fixtures/f005-targeted-executor-read-20261022/verdict.json` and its compressed logs.

Only discovery sources/GET filter translation changed. No executor execution, submit, approval, cap, switch,
module 121, module 149, shared bundle or migration was edited.

Residuals: the reused per-key cap is 1,000 rows, and title-keyed families do not claim full coverage of JD-only family
classification. This fix consumes the exact base's classifier behavior. F-006's plural/phrase classifier correction
is a separate owner dependency for asks that the base classifier misreads; root integration must rerun both suites.
No production installation, live catalog completeness, or real-user application outcome is claimed here.
