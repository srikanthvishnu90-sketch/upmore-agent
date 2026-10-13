# Finisher bugs — lane A2 (SC-191…SC-200 canonical)

Replay tests first: `tests/career-prep-fin-a2.test.cjs` — all 10 failed on pivot/career (`typeof P.<fn> === "undefined"`) before any fix.

| ID | Scenario | Missing capability in 127-career-prep.js | Fix |
|---|---|---|---|
| BUG-A2-01 | SC-191 | No video-interview practice: recorded-answer content scoring with explicit never-submit | `videoInterviewPractice` — scores via scoreAnswer, `submitted:false`, stored as drill |
| BUG-A2-02 | SC-192 | No take-home plan (scope+schedule, plan-only) | `takeHomePlan` — allocates deliverables to supplied blocks, flags overrun, `agent_does_work:false` |
| BUG-A2-03 | SC-193 | No final-round delta vs earlier CIR stages | `finalRoundDelta` — final stage vs earlier stages from CIR, NO_CIR honest |
| BUG-A2-04 | SC-194 | salaryPrep gives one script; no deflection set / anchor rule | `salaryDeflectionScripts` — 3 scripts over salaryPrep; no figure unless CIR-sourced |
| BUG-A2-05 | SC-195 | No questions-to-ask tailored to interviewer's team | `questionsToAsk` — team-tagged questions; `team_unknown` flag when no team facts |
| BUG-A2-06 | SC-196 | No guarded failure-story builder | `failureStoryFromFacts` — only setback-keyword facts; persona has none → NO_SETBACK_FACT + ask, story null |
| BUG-A2-07 | SC-197 | No structure drill for low-structure mock answers | `structureDrill` — STAR scaffold + before scores from scoreAnswer |
| BUG-A2-08 | SC-198 | No day-of checklist | `dayOfChecklist` — logistics/links/tech/materials groups, missing inputs flagged |
| BUG-A2-09 | SC-199 | Debriefs captured but never mined for recurring misses | `debriefRetro` — theme counts across stored debriefs, top miss |
| BUG-A2-10 | SC-200 | No superday survival plan | `superdayPlan` — Goldman CIR final stage + finance drill topics + timed schedule, NO_CIR honest |

Note SC-196: TEST persona facts contain no setback/failure fact, so the canonical run records the honest ask/flag behavior; no story is invented.
