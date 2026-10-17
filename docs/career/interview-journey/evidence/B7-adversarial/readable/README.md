# Readable B7 evidence

Evidence-only materialization of the archive published at `325580e0f1ae226958718bef0b53979b86c85a26`. Tested runtime remains `b414b042254ad9764ff546906a32d4aec8bbfe4e`. Original archive, results, freeze, hashes and provenance are unchanged.

Start with [index.json](index.json), the [failed baseline ledger](original/baseline/ledger.json) and the [final ledger](original/final/ledger.json). The baseline records 6 structural completions, 5 failures and 1 blocked task; final records 11 structural completions, 0 failures and 1 blocked task. These are provider-disabled structural executions, not semantic-quality or actual-entry proof.

The eleven executed cases each have a byte-identical original JSON file and small UTF-8 text parts. Every part is at most 32 KiB. Each case index gives the expected outcome, original SHA-256, links to small pages listing ordered part hashes and event byte ranges with corresponding parts. Use these parts when a connector cannot return a large JSON file. Concatenate part bytes without separators or added newlines to reconstruct the exact archived original.

| Case | Failed-baseline run | Final run |
| --- | --- | --- |
| artifact-after-context-change | [event/part index](parts/baseline/artifact-after-context-change/index.json) | [event/part index](parts/final/artifact-after-context-change/index.json) |
| changed-target-guided-retry | [event/part index](parts/baseline/changed-target-guided-retry/index.json) | [event/part index](parts/final/changed-target-guided-retry/index.json) |
| foreign-and-delayed-settlement | [event/part index](parts/baseline/foreign-and-delayed-settlement/index.json) | [event/part index](parts/final/foreign-and-delayed-settlement/index.json) |
| long-interrupted-journey | [event/part index](parts/baseline/long-interrupted-journey/index.json) | [event/part index](parts/final/long-interrupted-journey/index.json) |
| pending-project-correction | [event/part index](parts/baseline/pending-project-correction/index.json) | [event/part index](parts/final/pending-project-correction/index.json) |
| repeated-pause-resume | [event/part index](parts/baseline/repeated-pause-resume/index.json) | [event/part index](parts/final/repeated-pause-resume/index.json) |
| resume-and-target-swap | [event/part index](parts/baseline/resume-and-target-swap/index.json) | [event/part index](parts/final/resume-and-target-swap/index.json) |
| resume-change-during-retry | [event/part index](parts/baseline/resume-change-during-retry/index.json) | [event/part index](parts/final/resume-change-during-retry/index.json) |
| resume-does-not-rewind-selection | [event/part index](parts/baseline/resume-does-not-rewind-selection/index.json) | [event/part index](parts/final/resume-does-not-rewind-selection/index.json) |
| settlement-before-invalidation | [event/part index](parts/baseline/settlement-before-invalidation/index.json) | [event/part index](parts/final/settlement-before-invalidation/index.json) |
| stop-before-invalidation | [event/part index](parts/baseline/stop-before-invalidation/index.json) | [event/part index](parts/final/stop-before-invalidation/index.json) |

The twelfth case, `actual-entry-journey`, was blocked in both runs and has zero executed events. Its exact inspected A handler/ref/hash and blocker are in the two ledgers. There is no fabricated twelfth event trace.

Full final suite logs and mutation evidence:

- [Node 22: 145/145](original/node22-contracts.log) and [command/exit metadata](original/node22-contracts.meta.json).
- [Node 24: 145/145](original/node24-contracts.log) and [command/exit metadata](original/node24-contracts.meta.json).
- [Mutation summary: 20/20 caught](original/final-mutations/results.json); all twenty individual mutant logs are ordinary files in the same directory.
- [Bounded runner output](original/bounded-pass.log) and [exit metadata](original/bounded-pass.meta.json): exit 2 preserves the actual-entry blocker.

All 53 materialized original members match their SHA-256 entries in the existing [results.json](../results.json). The [verification record](VERIFICATION.json) covers hashes, byte reconstruction and unchanged runtime. The existing archive still contains initial fixture/mutation iterations and prior collector logs; this handoff materializes the requested fail-first/final runs and final Node/mutation evidence.

To verify a case locally without opening the archive:

```python
import hashlib, json
from pathlib import Path
case = Path("parts/final/long-interrupted-journey")
index = json.loads((case / "index.json").read_text())
parts = [part for page in index["part_index_pages"]
         for part in json.loads((case / page["file"]).read_text())["parts"]]
data = b"".join((case / part["file"]).read_bytes() for part in parts)
assert hashlib.sha256(data).hexdigest() == index["original_sha256"]
assert len(data) == index["original_bytes"]
```

No runtime tests were rerun for this evidence-only extraction. No runtime, A-owned file, deployment or provider configuration changed.
