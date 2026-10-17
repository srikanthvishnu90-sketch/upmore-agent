# Canonical zero-version compatibility

Branch: `codex/spec-b-interview-depth-20261016`. Baseline:
`01cfb24d97dde5301cee842818d945d827d35f0a`. Producer:
`315158f5314360417266270ec6e6e9e71aad0af8` from A's critical-repairs branch.

A's actual schema permits `item_version` from zero through
`Number.MAX_SAFE_INTEGER`. Its versioned context projection preserves that
integer as B's `version`. B previously required a positive version on facts and
sources, rejecting valid projected contexts. The runtime change accepts
nonnegative safe integers on those evidence rows. It does not coerce types,
increment versions or change owner, thread, epoch, validity, provenance or exact
reference checks. B's own journey revision and question/rubric revisions keep
their existing requirements.

## Reproduction and verification

The unchanged final tests and probe were run before the runtime edit. The local
version suite passed 22/27 checks; actual projected-A consumption passed 16/23.
Zero facts/sources and the all-zero reducer flow were rejected at the positive
version guard. Two zero-version lifecycle controls also stopped at that guard
before reaching their expected epoch/validity rejection. The first experimental
probes contained test setup errors (empty source fixture and VM realm transfer);
those separate logs are retained and are not counted as release defects.

After repair:

- Local version suite: **27/27**.
- Full B suite, including all prior recovery tests: **131/131**, Node 22 and 24.
- Actual projected-A consumption: **23/23**, Node 22 and 24.
- Intentional defects: **16/16** caught, including reinstating the positive-only
  guard and accepting negative/fractional versions.

The A probe reads genuine Git blobs at the exact producer SHA: schema, validator,
context projection, canonical frozen snapshot and both freeze manifests. It
verifies schema/fixture hashes, agreement between A's runtime and schema, and
both native and Ajv validation. It runs A's unchanged projection and transfers
its output by exact JSON serialization into B. No A file or assertion is copied
over or modified. No B fixture replaces A's positive canonical input.

The unmodified fixture, maximum safe version and six zero-version variants are
consumed by B's context validator and reducer. Variants are explicitly authored
probe edits to A's synthetic fixture, validated by A; they are not claimed as
A-authored frozen cases. The source-zero variant adopts the same source revision
on the resume selection. Every projected evidence version is compared directly
to its canonical input. The all-zero flow also submits an exact answer, builds
the pure reasoning request and serializes a partial pack with `@0` references.
The context-only bridge remains unable to execute a coach action.

Negative and fractional numbers, strings, null, booleans and unsafe integers fail
both actual A validation and B validation. Additional local checks reject NaN
and infinity. Zero-version foreign owner/thread and old-epoch evidence remain
ineligible; an exact zero reference cannot be resolved as version one. The local
flow preserves zero references through pause and JSON restart.

Commands:

```sh
node scripts/career/interview-journey/check-contracts.cjs
node --experimental-vm-modules scripts/career/interview-journey/projected-context-compatibility.cjs --producer-ref 315158f5314360417266270ec6e6e9e71aad0af8
node scripts/career/interview-journey/negative-controls.cjs --output <new-directory>
```

The producer commit must already be fetched; the probe performs no network
requests. Its Ajv dependencies are pinned in the existing scoped tooling
lockfile. `evidence/B6-zero-versions/freeze.json` retains pre-repair test/probe
hashes and failures. `results.json` records exact tested source, final commands,
counts and hashes; `logs.tar.gz` retains final output and mutation logs. Raw
failed logs preserve assertion whitespace; source whitespace is checked
separately. Historical B4/B5 evidence and frozen fixtures remain unchanged.

## Exact integration handoff

A/Muse should vendor the tested B source identified in this packet's
`results.json`, preserving the three B5 recovery repairs and the lossless
zero-version guard. Compose it with A's pinned versioned context projection and
rerun the probe above before registration. The historical direct-canonical probe
at `3a41cd45` remains a failure; this repair establishes consumption through the
explicit versioned projection, not direct schema equivalence.

Exact tested B source: `8730040dbe3426ea45f430e8f95c27046c2bbf3c`.
Use that coherent runtime and its tests with A producer
`315158f5314360417266270ec6e6e9e71aad0af8`; do not apply only the zero-version
diff onto A's embedded `53ae74b3` and omit the intervening B4/B5 repairs. The
following publication commit adds evidence and this source pointer only.

Proof profiles, shared paired accounting, atomic journey persistence, CI
discovery and actual entry registration remain A-owned. In particular, preserve
`checkpoint.outstanding_reasoning` across pause/stop and require trusted terminal
settlement before another pair. Keep the context-only capability restrictions
until execution/result adapters exist. No A-owned file was changed here.

All counts are offline structural/protocol checks. Semantic quality and actual
entry integration remain **NOT_RUN**. No paid call, credential, production
migration, deployment, browser task or external send occurred. Muse retains
merge/deploy ownership.
