# Brain score log (WO-061)

One line per eval run, appended by CI; never edited. The bar: 95% on the held-out set, two judges, on the live build.

| run at (UTC) | brain commit | set | brain | set size | passed | score | judges | stopped | CI run |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-21 04:04:24 | 62aec9e | heldout | agent | 38 | 0 | 0.0% | gpt-5-mini + gpt-4.1-mini | no | 39541224991 |
| 2026-10-21 04:05:16 | 62aec9e | heldout | router | 38 | 0 | 0.0% | gpt-5-mini + gpt-4.1-mini | no | 39541224991 |
| 2026-10-21 03:33:02 | 111d054 | heldout | agent | 38 | 22 | 57.9% | gpt-5-mini (26) + Instinct (24) both-pass, as the owner reported it; Instinct's per-item verdicts not in the repo | no | 39538248995 |
| 2026-10-21 04:04:24 | 62aec9e | heldout | agent | 38 | 33 | 86.8% | gpt-5-mini alone; the 0/38 row above is void: gpt-4.1-mini rejected every call (reasoning_effort), so it scored nothing; Instinct has not scored this run | no | 39541224991 |
| 2026-10-21 04:05:16 | 62aec9e | heldout | router | 38 | 17 | 44.7% | gpt-5-mini alone; the 0/38 row above is void for the same reason | no | 39541224991 |
