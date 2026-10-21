# Brain score log (WO-061)

One line per eval run, appended by CI; never edited. The bar: 95% on the held-out set, two judges, on the live build.

| run at (UTC) | brain commit | set | brain | set size | passed | score | judges | stopped | CI run |
|---|---|---|---|---|---|---|---|---|---|
| 2026-10-21 04:04:24 | 62aec9e | heldout | agent | 38 | 0 | 0.0% | gpt-5-mini + gpt-4.1-mini | no | 39541224991 |
| 2026-10-21 04:05:16 | 62aec9e | heldout | router | 38 | 0 | 0.0% | gpt-5-mini + gpt-4.1-mini | no | 39541224991 |
| 2026-10-21 03:33:02 | 111d054 | heldout | agent | 38 | 22 | 57.9% | gpt-5-mini (26) + Instinct (24) both-pass, as the owner reported it; Instinct's per-item verdicts not in the repo | no | 39538248995 |
| 2026-10-21 04:04:24 | 62aec9e | heldout | agent | 38 | 33 | 86.8% | gpt-5-mini alone; the 0/38 row above is void: gpt-4.1-mini rejected every call (reasoning_effort), so it scored nothing; Instinct has not scored this run | no | 39541224991 |
| 2026-10-21 04:05:16 | 62aec9e | heldout | router | 38 | 17 | 44.7% | gpt-5-mini alone; the 0/38 row above is void for the same reason | no | 39541224991 |
| 2026-10-21 04:51:01 | 663fc3c | heldout | agent | 38 | 28 | 73.7% | gpt-5-mini (alone; the score is both-pass with Instinct) | no | 39545926640 |
| 2026-10-21 04:51:14 | 663fc3c | heldout | agent | 38 | 32 | 84.2% | gpt-5-mini (alone; the score is both-pass with Instinct) | no | 39545926640 |
| 2026-10-21 04:51:13 | 663fc3c | heldout | agent | 38 | 29 | 76.3% | gpt-5-mini (alone; the score is both-pass with Instinct) | no | 39545926640 |
| 2026-10-21 04:52:10 | 663fc3c | heldout | router | 38 | 14 | 36.8% | gpt-5-mini (alone; the score is both-pass with Instinct) | no | 39545926640 |
| 2026-10-21 04:17:21 | 2eb1896 | heldout | agent | 38 | 30 | 78.9% | gpt-5-mini 30 alone (Instinct scores beside them) | no | 39542849277 (row rebuilt from the result file: a later measurement commit had overwritten it) |
| 2026-10-21 04:18:09 | 2eb1896 | heldout | router | 38 | 15 | 39.5% | gpt-5-mini 15 alone (Instinct scores beside them) | no | 39542849277 (row rebuilt from the result file: a later measurement commit had overwritten it) |
| 2026-10-21 04:23:27 | 7647997 | heldout | agent | 38 | 33 | 86.8% | gpt-5-mini 33 alone (Instinct scores beside them) | no | 39543405447 (row rebuilt from the result file: a later measurement commit had overwritten it) |
| 2026-10-21 04:23:57 | 7647997 | heldout | agent | 38 | 32 | 84.2% | gpt-5-mini 32 alone (Instinct scores beside them) | no | 39543405447 (row rebuilt from the result file: a later measurement commit had overwritten it) |
| 2026-10-21 04:23:19 | 7647997 | heldout | agent | 38 | 31 | 81.6% | gpt-5-mini 31 alone (Instinct scores beside them) | no | 39543405447 (row rebuilt from the result file: a later measurement commit had overwritten it) |
| 2026-10-21 04:24:50 | 7647997 | heldout | router | 38 | 18 | 47.4% | gpt-5-mini 18 alone (Instinct scores beside them) | no | 39543405447 (row rebuilt from the result file: a later measurement commit had overwritten it) |
| 2026-10-21 04:45:29 | cd7200d | heldout | agent | 38 | 32 | 84.2% | gpt-5-mini 32 alone (Instinct scores beside them) | no | 39545335380 (row rebuilt from the result file: a later measurement commit had overwritten it); harness: situation parity since f265092a (production parity, not brain improvement) |
| 2026-10-21 04:45:13 | cd7200d | heldout | agent | 38 | 32 | 84.2% | gpt-5-mini 32 alone (Instinct scores beside them) | no | 39545335380 (row rebuilt from the result file: a later measurement commit had overwritten it); harness: situation parity since f265092a (production parity, not brain improvement) |
| 2026-10-21 04:45:00 | cd7200d | heldout | agent | 38 | 33 | 86.8% | gpt-5-mini 33 alone (Instinct scores beside them) | no | 39545335380 (row rebuilt from the result file: a later measurement commit had overwritten it); harness: situation parity since f265092a (production parity, not brain improvement) |
| 2026-10-21 04:46:25 | cd7200d | heldout | router | 38 | 18 | 47.4% | gpt-5-mini 18 alone (Instinct scores beside them) | no | 39545335380 (row rebuilt from the result file: a later measurement commit had overwritten it); harness: situation parity since f265092a (production parity, not brain improvement) |
| 2026-10-21 04:54:23 | 2eb1896 | heldout | agent | 38 | 25 | 65.8% | COMBINED, every judge passes: gpt-5-mini 30, Instinct 27 | no | 39542849277 heldout-agent-39542849277 |
| 2026-10-21 04:54:23 | 7647997 | heldout | agent | 38 | 28 | 73.7% | COMBINED, every judge passes: gpt-5-mini 33, Instinct 29 | no | 39543405447 heldout-agent-39543405447-p1 |
| 2026-10-21 04:54:23 | 7647997 | heldout | agent | 38 | 25 | 65.8% | COMBINED, every judge passes: gpt-5-mini 32, Instinct 28 | no | 39543405447 heldout-agent-39543405447-p2 |
| 2026-10-21 04:54:23 | 7647997 | heldout | agent | 38 | 25 | 65.8% | COMBINED, every judge passes: gpt-5-mini 31, Instinct 28 | no | 39543405447 heldout-agent-39543405447-p3 |
| 2026-10-21 04:55:00 | 62aec9e | heldout | agent | 38 | 28 | 73.7% | COMBINED as the owner's second judge reported it (gpt-5-mini 33 x Instinct 28); the gpt-4.1-mini slot is unscored until its re-score lands | no | 39541224991 heldout-agent-39541224991 |
