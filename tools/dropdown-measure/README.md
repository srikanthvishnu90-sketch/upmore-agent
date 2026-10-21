# DROPDOWN-MEASURE harness (LANE D, 2026-10-21)

Measurement-only bench harness. No product code; no module number.

- `pick.cjs [tokensCsv] [perToken]` — lists driveable Greenhouse postings from the live shelf (family = URL host; the shelf's `board` column is the company token).
- `census.cjs <url> <outJson>` — read-only DOM census of one public form: per-field widget type (native-select / react-select / radio / checkbox / file / text), label, native-select options. Ground truth the drive records join against, because the board-service protocol's `form()` defs carry field_id + label but not widget type.
- `measure-drive.cjs <postingUrl> <censusJson> <resultsDir>` — ONE doorstep drive through the production assembly (executor-config → board service :8471 → module 149 runApply, gauntlet test profile, pattern: throughput-infra's profile-drive.cjs). Never arms or fires submit. Phase A records every production fill (dropdown fills record the intended value; other fills record length only). Phase B probe-fills dropdown fields runApply left unmeasured, using only profile facts, census option labels, confirmed answers, or 149's EEO decline default. Writes `records.jsonl` (one line per dropdown interaction), `calls.json`, `run-log.json`, `summary.json`.
- `analyze.cjs <resultsRoot> <reportOut.md>` — verdicts (mirroring 149's observation comparison + the FR-395 rendered case), the per-widget-type table, the full non-correct list, root-cause classes. Poll-ladder depth is DERIVED from fill wall time (the helper returns none across the protocol); the derivation constants are documented in the report.

`REPORT.md` = analyzer output for `results/` + a hand-written root-cause readout appended at the end. Re-running analyze.cjs over REPORT.md wipes the readout — regenerate to a scratch file and re-append, or keep the committed pair together.

Results dirs (`results/run-*/`) hold the raw records for every figure in the report.
