# Proposed complete toolchain pin — NOT APPLIED

The compressed patch contains the actual working pin, CI changes, lock, failure-name diagnostics, tests and unchanged vendored deno-dom dependency (license/provenance included). It is a reviewable handoff, not an active CI change. Its source base is environment branch ef009e1e; merge current trunk before applying and retain trunk's existing jsdom install once, not twice.

VERIFIED locally: the real toolchain guard accepts Deno 2.1.4 / Node 22.23.3 / Python 3.12.14; the seven proposed guard tests pass 7/7. The working frozen Edge graph runs 895/895 with no local import-map override. Playwright 1.64.1 and esbuild 0.25.12 are already locked in inherited tools/package-lock.json.

NOT_READY / three unresolved requirements:
1. Architect applies/reviews architect-text-imports.PROPOSED.patch (20 files; assertions unchanged). AGENTS.md forbids me editing architect tests. Full architect execution on 2.1.4 has not passed.
2. A network that can fetch deno.land and esm.sh resolves the remaining production SDK graph; this environment returns CONNECT 403. deno.lock contains real checksums for the resolved test graph only. It is not represented as complete. After applying the patches, run `deno cache --frozen=false` on the tracked function entrypoints and scripts/apply.ts, then commit the actual resulting lock. Cache only fetches/parses dependencies; it does not invoke the functions or models. No fabricated checksums or omitted gate checks.
3. Relay the hosted runtime_version metadata. The published Supabase Edge Runtime v1.76.2 manifest explicitly pins Deno 2.1.4 (source and SHA in tools/edge-runtime.json in the patch); the current hosted value remains NOT_VERIFIABLE here.

The proposed patch must not be activated/merged until those requirements are resolved and the full gate passes. Live actions, migration, flags and paid calls are NOT_RUN. $0 new; $8.573843 historical recorded spend UNRECONCILED.
