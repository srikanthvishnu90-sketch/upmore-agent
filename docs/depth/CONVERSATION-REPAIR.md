# Conversation repair: scoped mechanisms, source-only

Base: `f67db048599db308f2691a7be7feada841143da5`. This packet fixes observed conversation/state and artifact-delivery defects; it does not implement a general model, change the capability registry or repair module 130. Sixteen synthetic held-out conversations (82 turns) and their invariants were frozen before product changes. The original recovery oracle (83 turns) is byte-identical to review `0519b0ffd33a67c06e00fda047321231cdd8667c`; all original failed evidence remains in that review.

| ID | User-observable mechanism | Targeted planted defect |
| --- | --- | --- |
| D01 | A corrected location changes the active plan and requires review, including an injected clock | Leave the old review state |
| D02 | A snapshot's mirror cannot revive the old target city | Skip mirror reconciliation |
| D03 | Withdrawing a city removes it from active facts and plan while preserving other fields | Leave the active geography fact |
| D04 | Unsupported record/backup erasure is refused without reporting success | Claim deletion |
| D05 | A hypothetical remains separate from actual personal background | Lose hypothetical handling |
| D06 | Another person's story remains separate from personal background | Lose third-party handling |
| D07 | A delivered coursework bullet does not invent leadership | Add invented leadership |
| D08 | Rewritten interview answers retain the learner's actual outcome evidence | Drop the later outcome |
| D09 | Mock interviews ask one question at a time | Ask a second question |
| D10 | Feedback references the learner's actual answer | Substitute a generic project |
| D11 | Delivered drafts include the complete body and sign-off | Truncate after one sentence |
| D12 | A status question cannot claim an external send | Claim a sent email |
| D13 | A hard remote constraint excludes unknown remote status | Admit unknown remote status |
| D14 | A chosen extension date survives through the actual draft | Drop the chosen date |
| D15 | Active conversation evidence survives a fresh host snapshot | Remove state from the whitelist |

Check: `node --test tests/career-conversation-mechanisms.test.cjs` and `node evals/conversation-fixes/mutations.cjs`. All 15 contracts pass unmodified; all 15 planted source defects are caught. Mutants run only in isolated VM modules; they never overwrite product files or frozen tests. The held-out host suite uses fresh JSON snapshots per turn and covers additional locations, fields, schedules, roles, project narratives, dates and numbers without reading personal writing fixtures.

The active-city withdrawal operation explicitly does **not** claim selective deletion from account records, history, caches or backups. Unknown erasure targets return unsupported. Existing profile erasure and account controls retain their authority. Module-130 privacy/cross-account issues remain release-blocking; no passing result here waives that blocker.

Actual-entry/local-PostgreSQL before/after runs, full transcripts and the final source SHA are recorded in the accompanying testing report. No provider, real-account, model-quality or browser verification is implied by these mechanism tests.
