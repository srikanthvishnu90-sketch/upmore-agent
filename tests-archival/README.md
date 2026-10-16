# Required historical archival validation

The original archived-run assertions remain here, with their pins, tallies,
security checks and transcript/receipt requirements preserved. Their original
assets were never committed and are unavailable in a clean checkout. No assets
have been manufactured or regenerated from newer code under old build pins.

Engineering CI inventories this prerequisite and exercises portable current-code
and synthetic grader controls. Inventory success is not archival validation.
Missing archives remain **NOT_RUN** and fail the separately visible required
`archival_release_gate` CI job as well as the actual release preflight:

```sh
UPMORE_CAREER_ARCHIVE_ROOT=/absolute/path/to/authorized/original/your_files \
  node scripts/career/critical-repairs/archive-gate.cjs --require-complete
```

The directory must contain the named original gauntlet roots, rerun report and
review copy. The command runs every archival test and cannot pass when assets
are missing or invalid. `scripts/launch/go-live.sh` requires this command before
any migration, secret configuration or deployment. Muse owns that execution.
Even an archival pass proves only those old records, not current provider
quality, live browser outcomes or overall release readiness.
